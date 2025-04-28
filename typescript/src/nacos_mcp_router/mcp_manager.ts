import { McpServerConfig, McpServerInfo, McpTool, McpPrompt } from './types';
import { logger } from './logger';
import { NacosHttpClient } from './nacos_http_client';
import { Collection } from "chromadb";

export class McpManager {
  private client: NacosHttpClient;
  private chromaDbService: Collection;
  private update_interval: number;
  constructor(nacosClient: NacosHttpClient, chromaDbService: Collection, update_interval: number) {
    this.client = nacosClient;
    this.chromaDbService = chromaDbService;
    this.update_interval = update_interval;
  }

  async getMcpServers(queryTexts: string, count: number): Promise<McpServer[]> {
  try {
    const result = await this.chromaDbService.query({
      queryTexts: queryTexts,
      nResults: count
    });
    const ids = result.ids;
    const mcpServers: McpServer[] = [];
    
    for (const id of ids) {
      for (const id1 of id) {
        const mcpServer = this._cache.get(id1);
        if (mcpServer !== undefined) {
          mcpServers.push(mcpServer);
        }
      }
    }
    return mcpServers;
  } catch (error) {
    logger.error('Failed to get MCP servers:', error);
    throw error;
  }
  }

  public async getServerInfo(): Promise<McpServerInfo> {
    try {
      const response = await this.client.get<McpServerInfo>('/info');
      return response.data;
    } catch (error) {
      logger.error('Failed to get MCP server info:', error);
      throw error;
    }
  }

  public async listTools(): Promise<McpTool[]> {
    try {
      const response = await this.client.get<McpTool[]>('/tools');
      return response.data;
    } catch (error) {
      logger.error('Failed to list MCP tools:', error);
      throw error;
    }
  }

  public async listPrompts(): Promise<McpPrompt[]> {
    try {
      const response = await this.client.get<McpPrompt[]>('/prompts');
      return response.data;
    } catch (error) {
      logger.error('Failed to list MCP prompts:', error);
      throw error;
    }
  }

  public async callTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    try {
      const response = await this.client.post(`/tools/${toolName}`, parameters);
      return response.data;
    } catch (error) {
      logger.error(`Failed to call MCP tool ${toolName}:`, error);
      throw error;
    }
  }

  public async getPrompt(promptName: string): Promise<McpPrompt> {
    try {
      const response = await this.client.get<McpPrompt>(`/prompts/${promptName}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get MCP prompt ${promptName}:`, error);
      throw error;
    }
  }
} 