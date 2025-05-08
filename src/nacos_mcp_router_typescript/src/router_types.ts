import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { logger } from './logger';
import { ChromaClient, Collection, Document, Documents, Embeddings, ID, IDs, IncludeEnum, Metadata, Metadatas } from 'chromadb';
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
  //     logger.warn(
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

  // async waitForInitialization(): Promise<void> {
  //   await this._initializedEvent;
  // }

  async requestForShutdown(): Promise<void> {
    // this._shutdownEvent = Promise.resolve();
    await this.client.close();
  }

  // async waitForShutdownRequest(): Promise<void> {
  //   await this._shutdownEvent;
  // }

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
        const result = await this.client.request({
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: params
          }
        }, CallToolResultSchema);
        return result;
        // "Error: Cannot destructure property 'address' of 'request.params.arguments' as it is undefined."
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

type SingleQueryResponse = {
  ids: IDs;
  embeddings: Embeddings | null;
  documents: (Document | null)[];
  metadatas: (Metadata | null)[];
  distances: number[] | null;
  included: IncludeEnum[];
};
type MultiQueryResponse = {
  ids: IDs[];
  embeddings: Embeddings[] | null;
  documents: (Document | null)[][];
  metadatas: (Metadata | null)[][];
  distances: number[][] | null;
  included: IncludeEnum[];
};

type MultiGetResponse = {
  ids: IDs;
  embeddings: Embeddings | null;
  documents: (Document | null)[];
  metadatas: (Metadata | null)[];
  included: IncludeEnum[];
};
type GetResponse = MultiGetResponse;

export class ChromaDb {
  private dbClient: ChromaClient | undefined;
  public _collectionId: string | undefined;
  private _collection: Collection | undefined;
  private chromaProcess: any;
  private port: number;
  private dbPath: string;

  constructor() {
    this.port = 15321;
    this.dbPath = path.join(os.homedir(), '.nacos_mcp_router', 'chroma_db');
    // this.start();
  }

  public async start() {
    this.ensureChromaInstalled();
    this.startChromaServer(this.port, this.dbPath);
    await this.waitForServerReadySync();
    this.dbClient = new ChromaClient({ path: `http://127.0.0.1:${this.port}` });
    this._collectionId = `nacos_mcp_router-collection-${process.pid}`;
    this._collection = await  this.dbClient.getOrCreateCollection({
      name: this._collectionId
    });
    logger.info(`ChromaDB collection created: ${this._collectionId}`);
  }

  private ensureChromaInstalled() {
    function hasCmd(cmd: string) {
      try {
        execSync(`command -v ${cmd}`, { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    }

    try {
      execSync("chroma --version", { stdio: "ignore" });
      logger.info("chromadb 已安装");
      return;
    } catch {
      logger.info("chromadb 未安装，准备安装...");
    }

    if (hasCmd("uv")) {
      logger.info("使用 uv 安装 chromadb ...");
      try {
        execSync("uv pip install chromadb --system", { stdio: "pipe" });
      } catch (error: any) {
        logger.error(`uv pip install chromadb 失败: ${error.message}`);
        if (error.stdout) logger.info(`stdout: ${error.stdout.toString()}`);
        if (error.stderr) logger.error(`stderr: ${error.stderr.toString()}`);
        throw error;
      }
    } else if (hasCmd("pip")) {
      logger.info("使用 pip 安装 chromadb ...");
      try {
        execSync("pip install chromadb", { stdio: "pipe" });
      } catch (error: any) {
        logger.error(`pip install chromadb 失败: ${error.message}`);
        if (error.stdout) logger.info(`stdout: ${error.stdout.toString()}`);
        if (error.stderr) logger.error(`stderr: ${error.stderr.toString()}`);
        throw error;
      }
    } else {
      throw new Error("未检测到 pip 或 uv，请先安装其中之一再运行本程序。");
    }
  }

  private startChromaServer(port: number, dbPath: string) {
    logger.info(`启动 ChromaDB 服务，端口: ${port}，路径: ${dbPath}`);
    if (this.chromaProcess) return;

    this.chromaProcess = spawn(
      "chroma",
      [
        "run",
        "--host", "127.0.0.1",
        "--port", port.toString(),
        "--path", dbPath
      ],
      { stdio: "pipe" }
    );
    this.chromaProcess.stdout.on('data', (data: any) => {
      logger.info(`ChromaDB stdout: ${data}`);
    });
    this.chromaProcess.stderr.on('data', (data: any) => {
      logger.error(`ChromaDB stderr: ${data}`);
    });
    this.chromaProcess.on("error", (err: any) => {
      logger.error("ChromaDB 启动失败:", err);
    });
    process.on("exit", () => {
      this.chromaProcess.kill();
    });

    this.chromaProcess.on('close', (code: any) => {
      logger.info(`子进程退出，退出码 ${code}，准备重启...`);
      // 延迟1秒重启，防止死循环
      setTimeout(() => {
        this.startChromaServer(this.port, this.dbPath);
      }, 1000);
    });
    // return chromaProcess;
  }

  public async isReady(): Promise<boolean> {
    try {
      execSync(`curl -s http://127.0.0.1:${this.port}/api/v2/heartbeat`, { stdio: "ignore" });
      return true;
    } catch(e) {
      logger.error(`ChromaDB server 未启动成功: ${e}`);
      return false;
    }
  }

  private waitForServerReadySync() {
    return new Promise((resolve, reject) => {
      const retryCount = 3;
      const retryFn = async (count: number) => {
        const isReady = await this.isReady();
        if (!isReady) {
          if (count > retryCount) {
            reject(new Error(`ChromaDB server 未启动成功`));
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
          await retryFn(count + 1);
        } else {
          resolve(true);
        }
      }

      retryFn(0);
    })
  }

  async getCollectionCount(): Promise<number> {
    return await this._collection!.count();
  }

  updateData(
    ids: IDs,
    documents?: Documents,
    metadatas?: Metadatas,
  ): void {
    this._collection!.upsert({
      ids,
      documents: documents || [],
      metadatas: metadatas
    });
  }

  query(query: string, count: number): Promise<MultiQueryResponse> {
    return this._collection!.query({
      queryTexts: [query],
      nResults: count
    });
  }

  get(id: string[]): Promise<GetResponse> {
    return this._collection!.get({ ids: id });
  }
}
