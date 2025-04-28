export interface NacosConfig {
  serverAddr: string | undefined;
  namespace?: string;
  group?: string;
  dataId?: string;
  username: string;
  password: string;
}

export interface McpServerConfig {
  host: string;
  port: number;
  authToken?: string;
}

export interface RouterConfig {
  nacos: NacosConfig;
  mcp: McpServerConfig;
}

export interface ServiceInstance {
  instanceId: string;
  ip: string;
  port: number;
  weight: number;
  healthy: boolean;
  enabled: boolean;
  ephemeral: boolean;
  clusterName: string;
  serviceName: string;
  metadata: Record<string, string>;
}

export interface ServiceInfo {
  name: string;
  groupName: string;
  clusters: string;
  cacheMillis: number;
  hosts: ServiceInstance[];
  lastRefTime: number;
  checksum: string;
  allIPs: boolean;
  reachProtectionThreshold: boolean;
  valid: boolean;
}

export interface McpServerInfo {
  name: string;
  version: string;
  description?: string;
  capabilities: {
    [key: string]: any;
  };
}

export interface McpTool {
  name: string;
  description: string;
  parameters: {
    [key: string]: {
      type: string;
      description: string;
      required?: boolean;
    };
  };
}

export interface McpPrompt {
  name: string;
  description: string;
  messages: Array<{
    role: string;
    content: {
      type: string;
      text: string;
    };
  }>;
}

export interface Logger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
} 