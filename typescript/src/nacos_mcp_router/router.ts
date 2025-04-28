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