import { ClientSession } from 'mcp';
import { sseClient } from 'mcp/client/sse';
import { getDefaultEnvironment, StdioServerParameters, stdioClient } from 'mcp/client/stdio';
import { AsyncExitStack } from 'contextlib';
import { NacosMcpRouteLogger } from './logger';
import { ChromaClient, Collection, Settings } from 'chromadb';
import { OneOrMany, ID, Document, GetResult, QueryResult } from 'chromadb/api/types';
import * as path from 'path';
import * as os from 'os';
import { NacosMcpServerConfig } from './nacos_mcp_server_config';

type TransportContext = {
  read: any;
  write: any;
};

function _stdioTransportContext(config: Record<string, any>): TransportContext {
  const serverParams = new StdioServerParameters({
    command: config.command,
    args: config.args,
    env: config.env
  });
  return stdioClient(serverParams);
}

function _sseTransportContext(config: Record<string, any>): TransportContext {
  return sseClient({
    url: config.url,
    headers: config.headers,
    timeout: 10
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
  private _transportContextFactory: (config: Record<string, any>) => TransportContext;
  private _serverTask: Promise<void>;
  private _initialized: boolean = false;
  private sessionInitializedResponse: any;

  constructor(name: string, config: Record<string, any>) {
    this.name = name;
    this.config = config;
    this._cleanupLock = new Promise<void>(resolve => resolve());
    this._initializedEvent = new Promise<void>(resolve => resolve());
    this._shutdownEvent = new Promise<void>(resolve => resolve());
    
    NacosMcpRouteLogger.getLogger().info(`mcp server config: ${JSON.stringify(config)}`);
    
    this._transportContextFactory = 'url' in config.mcpServers[name] 
      ? _sseTransportContext 
      : _stdioTransportContext;

    this._serverTask = this._serverLifespanCycle();
  }

  private async _serverLifespanCycle(): Promise<void> {
    try {
      let serverConfig = this.config;
      if ('mcpServers' in this.config) {
        const mcpServers = this.config.mcpServers;
        for (const [key, value] of Object.entries(mcpServers)) {
          serverConfig = value;
        }
      }

      const transportContext = this._transportContextFactory(serverConfig);
      const { read, write } = transportContext;
      
      const session = new ClientSession(read, write);
      this.sessionInitializedResponse = await session.initialize();
      this.session = session;
      this._initialized = true;
      this._initializedEvent = Promise.resolve();
      
      await this.waitForShutdownRequest();
    } catch (e) {
      NacosMcpRouteLogger.getLogger().warning(
        `failed to init mcp server ${this.name}, config: ${JSON.stringify(this.config)}`,
        e
      );
      this._initializedEvent = Promise.resolve();
      this._shutdownEvent = Promise.resolve();
    }
  }

  healthy(): boolean {
    return this.session !== null && this._initialized;
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
    arguments: Record<string, any>,
    retries: number = 2,
    delay: number = 1.0
  ): Promise<any> {
    if (!this.session) {
      throw new Error(`Server ${this.name} not initialized`);
    }

    let attempt = 0;
    while (attempt < retries) {
      try {
        const result = await this.session.callTool(toolName, arguments);
        return result;
      } catch (e) {
        attempt++;
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
          await this.session.initialize();
          try {
            const result = await this.session.callTool(toolName, arguments);
            return result;
          } catch (e) {
            throw e;
          }
        } else {
          throw e;
        }
      }
    }
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
