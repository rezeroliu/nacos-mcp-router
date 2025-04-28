import { logger } from "./logger";
import { NacosHttpClient } from "./nacos_http_client";
import { Collection } from "chromadb";
import { McpServer } from "./router_types";
import { md5 } from "./md5";

export class McpManager {
  private nacosClient: NacosHttpClient;
  private chromaDbService: Collection;
  private update_interval: number;
  private _cache: Map<string, McpServer> = new Map();
  private mcp_server_config_version: Map<string, string> = new Map();

  constructor(
    nacosClient: NacosHttpClient,
    chromaDbService: Collection,
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
      const cache = new Map<string, McpServer>();

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
        await this.chromaDbService.update({
          documents: docs,
          ids: ids,
        });
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

  async getMcpServers(queryTexts: string, count: number): Promise<McpServer[]> {
    try {
      const result = await this.chromaDbService.query({
        queryTexts: queryTexts,
        nResults: count,
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
      logger.error("Failed to get MCP servers:", error);
      throw error;
    }
  }
}
