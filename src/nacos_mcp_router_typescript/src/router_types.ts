import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { logger } from './logger';
import { MemoryVectorDB } from './memory_vector';
import { NacosMcpServerConfigImpl } from './nacos_mcp_server_config';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolResultSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { spawn, execSync } from "child_process";
import path from "path";
import os from "os";

function _stdioTransportContext(config: Record<string, any>): StdioClientTransport {
  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env
  });
}

function _sseTransportContext(config: Record<string, any>): SSEClientTransport {
  return new SSEClientTransport(config.url, {
    // headers: config.headers,
    // timeout: 10
  });
}

export class CustomServer {
  private name: string;
  private config: Record<string, any>;
  private _transportContextFactory: (config: Record<string, any>) => Transport;
  private client: Client;

  constructor(name: string, config: Record<string, any>) {
    this.name = name;
    this.config = config;

    logger.info(`mcp server config: ${JSON.stringify(config)}`);

    this._transportContextFactory = 'url' in config.mcpServers[name]
      ? _sseTransportContext
      : _stdioTransportContext;

    // 全局保持一个client 切换连接？
    this.client = new Client({
      name: this.name,
      version: '1.0.0'
    })

    // this.start()
  }

  public async start(mcpServerName: string) {
    const transport = this._transportContextFactory(this.config.mcpServers[mcpServerName]);
    this.client.connect(transport)
  }

  healthy(): boolean {
    try {
      // 检查客户端是否已初始化  
      if (!this.client) {
        return false;
      }

      // 检查 transport 是否存在  
      const transport = this.client.transport;
      if (!transport) {
        return false;
      }

      // 检查 transport 类型并进行相应的健康检查  
      if (transport instanceof StdioClientTransport) {
        // 对于 Stdio transport，检查进程是否仍在运行  
        return transport['_process']?.killed === false;
      } else {
        // 对于其他类型的 transport，使用通用检查  
        return transport.sessionId !== undefined;
      }
    } catch (e) {
      logger.error(`Error checking health for server ${this.name}:`, e);
      return false;
    }
  }

  async requestForShutdown(): Promise<void> {
    // this._shutdownEvent = Promise.resolve();
    await this.client.close();
  }

  async listTools(): Promise<any[]> {  
    if (!this.client || !this.healthy()) {  
      throw new Error(`Server ${this.name} is not initialized`);  
    }  
    
    try {  
      // Use the client.listTools() method which is a convenience wrapper  
      // around client.request() for the tools/list endpoint  
      const toolsResult = await this.client.listTools();  
      return toolsResult.tools;  
    } catch (e) {  
      logger.error(`Failed to list tools for server ${this.name}:`, e);  
      throw e;  
    }  
  }

  async executeTool(
    toolName: string,
    params: Record<string, any>,
    retries: number = 2,
    delay: number = 1.0
  ): Promise<any> {
    if (!this.client || !this.healthy()) {
      throw new Error(`Server ${this.name} not initialized`);
    }

    const executeWithRetry = async (attempt: number): Promise<any> => {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          +   setTimeout(() => reject(new Error('Request timeout')), 10000));

        const result = await Promise.race([timeoutPromise, this.client.request({
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: params
          }
        }, CallToolResultSchema)]);
        return result;
      } catch (e) {
        if (attempt >= retries) {
          throw e;
        }

        logger.warn(
          `Tool execution failed for ${toolName} on server ${this.name}, attempt ${attempt}/${retries}`,
          e
        );

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay * 1000));

        // Try to reconnect if needed
        if (!this.healthy()) {
          logger.info(`Reconnecting to server ${this.name} before retry`);
          const transport = this._transportContextFactory(this.config.mcpServers[this.name]);
          await this.client.connect(transport);
        }

        // Recursive retry
        return executeWithRetry(attempt + 1);
      }
    };

    return executeWithRetry(1);
  }

  // async cleanup(): Promise<void> {
  //   await this._cleanupLock;
  //   try {
  //     await this.exitStack.aclose();
  //     this.session = null;
  //     this.stdioContext = null;
  //   } catch (e) {
  //     console.error(`Error during cleanup of server ${this.name}:`, e);
  //   }
  // }
}

export class NacosMcpServer {
  name: string;
  description: string;
  mcpConfigDetail: NacosMcpServerConfigImpl | null;
  agentConfig: Record<string, any>;

  constructor(name: string, description: string, agentConfig: Record<string, any>) {
    this.name = name;
    this.description = description;
    this.agentConfig = agentConfig;
    this.mcpConfigDetail = null;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string {
    return this.description;
  }

  getAgentConfig(): Record<string, any> {
    return this.agentConfig;
  }

  toDict(): Record<string, any> {
    return {
      name: this.name,
      description: this.description,
      agentConfig: this.getAgentConfig()
    };
  }
}

// MemoryVectorDb 兼容接口实现
export class VectorDB {
  private db: MemoryVectorDB;
  public _collectionId: string;

  constructor() {
    this._collectionId = `nacos_mcp_router-collection-${process.pid}`;
    this.db = new MemoryVectorDB({ numDimensions: 384, indexFile: './my_hnsw_index.bin', metadataFile: './my_hnsw_metadata.json', clearOnStart: true });
  }

  public async start() {
    // MemoryVectorDB 初始化已在构造函数完成
    // 可根据需要预加载或其他操作
    return;
  }

  public async isReady(): Promise<boolean> {
    // MemoryVectorDB 无需等待服务启动，直接返回 true
    return true;
  }

  async getCollectionCount(): Promise<number> {
    return this.db.getCount();
  }

  updateData(
    ids: string[],
    documents?: string[],
    metadatas?: Record<string, any>[]
  ): void {
    if (!documents) return;
    documents.forEach((doc, i) => {
      this.db.add(doc, { id: ids[i], ...(metadatas ? metadatas[i] : {}) });
    });
    this.db.save();
  }

  async query(query: string, count: number): Promise<any> {
    const results = await this.db.search(query, count);
    return {
      ids: [results.map(r => r.metadata.id)],
      documents: [results.map(r => r.metadata.text)],
      metadatas: [results.map(r => r.metadata)],
      distances: [results.map(r => r.distance)],
      included: []
    };
  }

  async get(ids: string[]): Promise<any> {
    // 简单实现：根据 id 查找元数据
    const all = this.db['metadatas'] || [];
    const found = all.filter((m: any) => ids.includes(m.id));
    return {
      ids,
      documents: found.map((m: any) => m.text),
      metadatas: found,
      included: []
    };
  }
}
