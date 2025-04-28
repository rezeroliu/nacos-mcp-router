import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { RouterConfig, ServiceInfo, ServiceInstance } from './types';
import { NacosHttpClient } from './nacos_http_client';
import { McpManager } from './mcp_manager';
import { logger } from './logger';
// import { name } from '../../package.json'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { ToolManager } from "./tool_manager";

const MCP_SERVER_NAME = 'nacos-mcp-router';

export class Router {
  private nacosClient: NacosHttpClient;
  private mcpManager: McpManager;
  private config: RouterConfig;
  private serviceCache: Map<string, ServiceInfo> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private mcpServer: Server | null = null;

  constructor(config: RouterConfig) {
    this.config = config;
    this.nacosClient = new NacosHttpClient(config.nacos);
    this.mcpManager = new McpManager(config.mcp);
    this.mcpServer = new Server({
      name: MCP_SERVER_NAME,
      version: '1.0.0'
    });
    this.registerMcpTools();
  }

  public async start(): Promise<void> {
    logger.info('Starting Nacos MCP Router...');
    
    // Initial service discovery
    await this.discoverServices();
    
    // Start periodic service discovery
    this.updateInterval = setInterval(() => {
      this.discoverServices().catch(error => {
        logger.error('Error during periodic service discovery:', error);
      });
    }, 30000); // Update every 30 seconds
  }

  public async stop(): Promise<void> {
    logger.info('Stopping Nacos MCP Router...');
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private async discoverServices(): Promise<void> {
    try {
      const serverInfo = await this.mcpManager.getServerInfo();
      const tools = await this.mcpManager.listTools();
      const prompts = await this.mcpManager.listPrompts();

      // Register MCP server as a service in Nacos
      const serviceInstance: ServiceInstance = {
        instanceId: `${serverInfo.name}-${this.config.mcp.host}:${this.config.mcp.port}`,
        ip: this.config.mcp.host,
        port: this.config.mcp.port,
        weight: 1,
        healthy: true,
        enabled: true,
        ephemeral: true,
        clusterName: 'DEFAULT',
        serviceName: serverInfo.name,
        metadata: {
          version: serverInfo.version,
          tools: JSON.stringify(tools.map(tool => tool.name)),
          prompts: JSON.stringify(prompts.map(prompt => prompt.name)),
        },
      };

      await this.nacosClient.registerInstance(serverInfo.name, serviceInstance);
      logger.info(`Registered MCP server ${serverInfo.name} in Nacos`);
    } catch (error) {
      logger.error('Failed to discover services:', error);
      throw error;
    }
  }

  public async getServiceInfo(serviceName: string): Promise<ServiceInfo> {
    try {
      const cachedInfo = this.serviceCache.get(serviceName);
      if (cachedInfo) {
        return cachedInfo;
      }

      const serviceInfo = await this.nacosClient.getServiceInfo(serviceName);
      this.serviceCache.set(serviceName, serviceInfo);
      return serviceInfo;
    } catch (error) {
      logger.error(`Failed to get service info for ${serviceName}:`, error);
      throw error;
    }
  }

  public async callTool(serviceName: string, toolName: string, parameters: Record<string, any>): Promise<any> {
    try {
      const serviceInfo = await this.getServiceInfo(serviceName);
      if (!serviceInfo.hosts || serviceInfo.hosts.length === 0) {
        throw new Error(`No available instances for service ${serviceName}`);
      }

      // Simple round-robin load balancing
      const instance = serviceInfo.hosts[Math.floor(Math.random() * serviceInfo.hosts.length)];
      const mcpManager = new McpManager({
        host: instance.ip,
        port: instance.port,
        authToken: this.config.mcp.authToken,
      });

      return await mcpManager.callTool(toolName, parameters);
    } catch (error) {
      logger.error(`Failed to call tool ${toolName} on service ${serviceName}:`, error);
      throw error;
    }
  }

  public async registerMcpTools() {
    const toolManager = new ToolManager();
    try {
      this.mcpServer!.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
          tools: toolManager.getTools()
        };
      });
    
      this.mcpServer!.setRequestHandler(CallToolRequestSchema, async (request) => {
        try {
          const toolName = request.params.name;
          const args = request.params.arguments || {};
          return await toolManager.executeTool(toolName, args);
        } catch (error) {
          if (error instanceof McpError) {
            throw error;
          }
          throw new McpError(
            ErrorCode.InternalError,
            error instanceof Error ? error.message : String(error)
          );
        }
      });
    } catch (error) {
      logger.error('Failed to register MCP tools:', error);
      // throw error;
    }
  }
} 