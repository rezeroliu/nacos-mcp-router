import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { NacosHttpClient } from "./nacos_http_client";
import { McpManager } from "./mcp_manager";
import { logger } from "./logger";
import { z } from "zod";

const MCP_SERVER_NAME = "nacos-mcp-router";

export class Router {
  private nacosClient: NacosHttpClient;
  private mcpManager: McpManager;
  private config: RouterConfig;
  private serviceCache: Map<string, ServiceInfo> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private mcpServer: McpServer;

  constructor(config: RouterConfig) {
    this.config = config;
    this.nacosClient = new NacosHttpClient(config.nacos);
    this.mcpManager = new McpManager(config.mcp);
    this.mcpServer = new McpServer({
      name: MCP_SERVER_NAME,
      version: "1.0.0",
    });
    this.registerMcpTools();
  }

  public async registerMcpTools() {
    try {
      this.mcpServer.tool(
        "SearchMcpServer",
        `根据任务描述及关键字搜索mcp server，制定完成任务的步骤;Args:task_description: 用户任务描述，使用中文;key_words: 字符串数组，用户任务关键字，使用中文,可以为多个，最多为2个`,
        { taskDescription: z.string(), keyWords: z.string().array().nonempty({
          message: "Can't be empty!",
        }).max(2) },
        async () => {
          // do something
        }
      );
      this.mcpServer.tool(
        "UseTool",
        '',
        { mcpServerName: z.string(), toolName: z.string(), params: z.record(z.string(), z.any()) },
        async () => {
          // do something
        }
      );
      this.mcpServer.tool(
        "AddMcpServer",
        `安装指定的mcp server, return mcp server安装结果`,
        { mcpServerName: z.string() },
        async () => {
          // do something
        }
      );
    } catch (error) {
      logger.error("Failed to register MCP tools:", error);
      // throw error;
    }
  }

  public async start() {
    try {
      const transport = new StdioServerTransport();
      await this.mcpServer!.connect(transport);
    } catch (error) {
      logger.error("Failed to start Nacos MCP Router:", error);
      // throw error;
    }
  }
}
