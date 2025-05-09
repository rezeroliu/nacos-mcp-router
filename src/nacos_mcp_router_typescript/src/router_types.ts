import { ClientSession } from 'mcp';
import { sseClient } from 'mcp/client/sse';
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioServerParameters, stdioClient } from 'mcp/client/stdio';
import { AsyncExitStack } from 'contextlib';
import { logger } from './logger';
import { ChromaClient, Collection, Settings } from 'chromadb';
import { OneOrMany, ID, Document, GetResult, QueryResult } from 'chromadb/api/types';
import * as path from 'path';
import * as os from 'os';
import { NacosMcpServerConfig } from './nacos_mcp_server_config';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport';

type TransportContext = {
  read: any;
  write: any;
};

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
  private stdioContext: any | null = null;
  private session: ClientSession | null = null;
  private _cleanupLock: Promise<void> = Promise.resolve();
  private exitStack: AsyncExitStack = new AsyncExitStack();
  private _initializedEvent: Promise<void> = Promise.resolve();
  private _shutdownEvent: Promise<void> = Promise.resolve();
  private _transportContextFactory: (config: Record<string, any>) => Transport;
  private _serverTask: Promise<void>;
  private _initialized: boolean = false;
  private sessionInitializedResponse: any;
  private client: Client;

  constructor(name: string, config: Record<string, any>) {
    this.name = name;
    this.config = config;
    this._cleanupLock = new Promise<void>(resolve => resolve());
    this._initializedEvent = new Promise<void>(resolve => resolve());
    this._shutdownEvent = new Promise<void>(resolve => resolve());

    logger.info(`mcp server config: ${JSON.stringify(config)}`);

    this._transportContextFactory = 'url' in config.mcpServers[name]
      ? _sseTransportContext
      : _stdioTransportContext;

    // 全局保持一个client 切换连接？
    this.client = new Client({
      name: config.name,
      version: '1.0.0'
    })

    this.start()
  }

  public start() {
    this.client.connect(this._transportContextFactory(this.config))
  }

  // private async _serverLifespanCycle(): Promise<void> {
  //   try {
  //     let serverConfig = this.config;
  //     if ('mcpServers' in this.config) {
  //       const mcpServers = this.config.mcpServers;
  //       for (const [key, value] of Object.entries(mcpServers)) {
  //         serverConfig = value;
  //       }
  //     }

  //     const transportContext = this._transportContextFactory(serverConfig);
  //     const { read, write } = transportContext;

  //     const session = new ClientSession(read, write);
  //     this.sessionInitializedResponse = await session.initialize();
  //     this.session = session;
  //     this._initialized = true;
  //     this._initializedEvent = Promise.resolve();

  //     await this.waitForShutdownRequest();
  //   } catch (e) {
  //     logger.warning(
  //       `failed to init mcp server ${this.name}, config: ${JSON.stringify(this.config)}`,
  //       e
  //     );
  //     this._initializedEvent = Promise.resolve();
  //     this._shutdownEvent = Promise.resolve();
  //   }
  // }

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

  async waitForInitialization(): Promise<void> {
    await this._initializedEvent;
  }

  async requestForShutdown(): Promise<void> {
    this._shutdownEvent = Promise.resolve();
  }

  async waitForShutdownRequest(): Promise<void> {
    await this._shutdownEvent;
  }

  async listTools(): Promise<any[]> {
    if (!this.session) {
      throw new Error(`Server ${this.name} is not initialized`);
    }

    const toolsResponse = await this.session.listTools();
    return toolsResponse.tools;
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
        const result = await this.client.request({
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: params
          }
        });
        return result;
      } catch (e) {
        if (attempt >= retries) {
          throw e;
        }

        logger.warning(
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
          this._initialized = true;
        }

        // Recursive retry
        return executeWithRetry(attempt + 1);
      }
    };

    return executeWithRetry(1);
  }

  async cleanup(): Promise<void> {
    await this._cleanupLock;
    try {
      await this.exitStack.aclose();
      this.session = null;
      this.stdioContext = null;
    } catch (e) {
      console.error(`Error during cleanup of server ${this.name}:`, e);
    }
  }
}

export class NacosMcpServer {
  name: string;
  description: string;
  client: ClientSession;
  session: ClientSession;
  mcpConfigDetail: NacosMcpServerConfig;
  agentConfig: Record<string, any>;

  constructor(name: string, description: string, agentConfig: Record<string, any>) {
    this.name = name;
    this.description = description;
    this.agentConfig = agentConfig;
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

export class ChromaDb {
  private dbClient: ChromaClient;
  private _collectionId: string;
  private _collection: Collection;
  private preIds: string[] = [];

  constructor() {
    const dbPath = path.join(os.homedir(), '.nacos_mcp_router', 'chroma_db');
    this.dbClient = new ChromaClient({
      path: dbPath,
      settings: new Settings({
        anonymizedTelemetry: false
      })
    });
    this._collectionId = `nacos_mcp_router-collection-${process.pid}`;
    this._collection = this.dbClient.getOrCreateCollection(this._collectionId);
  }

  getCollectionCount(): number {
    return this._collection.count();
  }

  updateData(
    ids: OneOrMany<ID>,
    metadatas?: OneOrMany<Record<string, any>> | null,
    documents?: OneOrMany<Document> | null
  ): void {
    this._collection.upsert({
      documents,
      metadatas,
      ids
    });
  }

  query(query: string, count: number): QueryResult {
    return this._collection.query({
      queryTexts: [query],
      nResults: count
    });
  }

  get(id: string[]): GetResult {
    return this._collection.get({ ids: id });
  }
}
