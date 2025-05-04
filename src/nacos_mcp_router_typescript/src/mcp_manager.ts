import { logger } from "./logger";
import { NacosHttpClient } from "./nacos_http_client";
import { ChromaDb, CustomServer, NacosMcpServer } from "./router_types";
import { md5 } from "./md5";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types";

export class McpManager {
  private nacosClient: NacosHttpClient;
  private chromaDbService: ChromaDb;
  private update_interval: number;
  private _cache: Map<string, NacosMcpServer> = new Map();
  private mcp_server_config_version: Map<string, string> = new Map();
  private healthyMcpServers: Map<string, CustomServer> = new Map(); // 存活的nacos mcp servers

  constructor(
    nacosClient: NacosHttpClient,
    chromaDbService: ChromaDb,
    update_interval: number
  ) {
    this.nacosClient = nacosClient;
    this.chromaDbService = chromaDbService;
    this.update_interval = update_interval;
  }

  private async updateNow(): Promise<void> {
    try {
      const mcpServers = await this.nacosClient.getMcpServers();
      logger.info(`get mcp server list from nacos, size: ${mcpServers.length}`);

      if (mcpServers.length === 0) {
        return;
      }

      const docs: string[] = [];
      const ids: string[] = [];
      const cache = new Map<string, NacosMcpServer>();

      for (const mcpServer of mcpServers) {
        let description = mcpServer.getDescription();
        if (mcpServer.mcpConfigDetail) {
          description = mcpServer.mcpConfigDetail.getToolDescription();
        }

        const serverName = mcpServer.getName();
        cache.set(serverName, mcpServer);

        const md5Str = md5(description);
        if (
          !this.mcp_server_config_version.has(serverName) ||
          this.mcp_server_config_version.get(serverName) !== md5Str
        ) {
          this.mcp_server_config_version.set(serverName, md5Str);
          ids.push(serverName);
          docs.push(description);
        }
      }

      logger.info(`updated mcp server cache, size: ${cache.size}`);
      const mcpServerNames = Array.from(cache.keys());
      logger.info(`updated mcp server names: ${mcpServerNames.join(", ")}`);

      this._cache = cache;

      if (ids.length > 0) {
        await this.chromaDbService.updateData(
          ids,
          docs as any,
        );
      }
    } catch (error) {
      logger.error("Failed to update MCP servers:", error);
      throw error;
    }
  }

  public async asyncUpdater(): Promise<void> {
    while (true) {
      try {
        await new Promise((resolve) =>
          setTimeout(resolve, this.update_interval * 1000)
        );
        await this.updateNow();
      } catch (error) {
        logger.warn("Exception while updating mcp servers:", error);
      }
    }
  }

  async getMcpServer(queryTexts: string, count: number): Promise<NacosMcpServer[]> {
    try {
      const result = await this.chromaDbService.query(
        queryTexts,
        count,
      );
      const ids = result.ids;
      const mcpServers: NacosMcpServer[] = [];

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
      logger.error("Failed to get MCP servers:", error);
      throw error;
    }
  }

  async searchMcpByKeyword(keyword: string): Promise<NacosMcpServer[]> {
    const servers: NacosMcpServer[] = [];
    logger.info(`cache size: ${this._cache.size}`);

    for (const mcpServer of this._cache.values()) {
      let description = mcpServer.getDescription();
      if (mcpServer.mcpConfigDetail) {
        description = mcpServer.mcpConfigDetail.getToolDescription();
      }

      if (!description) {
        continue;
      }
      if (description.includes(keyword)) {
        servers.push(mcpServer);
      }
    }

    logger.info(`result mcp servers search by keywords: ${servers.length}`);
    return servers;
  }

  async getMcpServerByName(mcpName: string): Promise<NacosMcpServer | undefined> {
    return this._cache.get(mcpName);
  }

  async useTool(mcpServerName: string, toolName: string, params: Record<string, any>): Promise<any> {
    const mcpServer = this.healthyMcpServers.get(mcpServerName)
    if (!mcpServer) {
      throw new McpError(ErrorCode.InternalError, `MCP server ${mcpServerName} not found`);
    }

    if (mcpServer.healthy()) {
      const response = await mcpServer.executeTool(toolName, params);
      return response.content;
    } else {
      this.healthyMcpServers.delete(mcpServerName);
      return "mcp server is not healthy, use search_mcp_server to get mcp servers";
    }
  }

  async addMcpServer(mcpServerName: string) {
    let mcpServer: NacosMcpServer | undefined = await this.nacosClient.getMcpServerByName(mcpServerName);
    if (!mcpServer) {
      mcpServer = this._cache.get(mcpServerName);
    }
    if (!mcpServer || mcpServer.description === '' || !mcpServer.description) {
      throw new McpError(ErrorCode.InternalError, `MCP server ${mcpServerName} not found`);
    }

    const disableTools: Record<string, boolean> = {};
    const toolMeta = mcpServer.mcpConfigDetail?.toolSpec?.toolsMeta;
    if (toolMeta) {
      for (const [toolName, meta] of Object.entries(toolMeta)) {
        if (!meta.enabled) {
          disableTools[toolName] = true;
        }
      }
    }

    if (!this.healthyMcpServers.has(mcpServerName)) {
      const env = process.env || {};
      if (!mcpServer.agentConfig) {
        mcpServer.agentConfig = {};
      }
      if (!mcpServer.agentConfig.mcpServers || mcpServer.agentConfig.mcpServers === null) {
        mcpServer.agentConfig.mcpServers = {};
      }

      const mcpServers = mcpServer.agentConfig.mcpServers;
      for (const [key, value] of Object.entries(mcpServers)) {
        const serverConfig = value as Record<string, any>;
        if (serverConfig.env) {
          for (const [k, v] of Object.entries(serverConfig.env)) {
            env[k] = v;
          }
        }
        serverConfig.env = env;
        if (!serverConfig.headers) {
          serverConfig.headers = {};
        }
      }

      const server = new CustomServer(mcpServerName, mcpServer.agentConfig);
      // await server.waitForInitialization();
      await server.start();
      if (server.healthy()) {
        this.healthyMcpServers.set(mcpServerName, server);
      }
    }

    const server = this.healthyMcpServers.get(mcpServerName);
    if (!server) {
      throw new McpError(ErrorCode.InternalError, `Failed to initialize MCP server ${mcpServerName}`);
    }

    const tools = await server.listTools();
    const toolList: any[] = [];
    for (const tool of tools) {
      if (disableTools[tool.name]) {
        continue;
      }
      const dct: Record<string, any> = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      };
      toolList.push(dct);
    }

    await this.nacosClient.updateMcpTools(mcpServerName, tools);

    return `1. ${mcpServerName}安装完成, tool 列表为: ${JSON.stringify(toolList, null, 2)}2. ${mcpServerName}的工具需要通过nacos-mcp-router的UseTool工具代理使用`;
  }
}
