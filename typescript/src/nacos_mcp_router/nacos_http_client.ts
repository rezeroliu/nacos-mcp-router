import axios, { AxiosInstance } from 'axios';
import { NacosConfig, ServiceInfo, ServiceInstance } from './types';
import { logger } from './logger';
import { md5 } from './md5';

export class NacosHttpClient {
  private client: AxiosInstance;
  private config: NacosConfig;
  private accessToken: string | null = null;

  constructor(config: NacosConfig) {
    this.config = config;
      this.client = axios.create({
        baseURL: config.serverAddr,
        timeout: 5000,
      });

    // this.client.interceptors.request.use(async (config) => {
    //   if (this.accessToken) {
    //     config.headers['accessToken'] = this.accessToken;
    //   }
    //   return config;
    // });
  }

  private async login(): Promise<void> {
    try {
      const response = await this.client.post('/nacos/v1/auth/login', {
        username: this.config.username,
        password: this.config.password,
      });
      this.accessToken = response.data.accessToken;
    } catch (error) {
      logger.error('Failed to login to Nacos:', error);
      throw error;
    }
  }

  public async getServiceInfo(serviceName: string): Promise<ServiceInfo> {
    try {
      if (!this.accessToken && this.config.username && this.config.password) {
        await this.login();
      }

      const response = await this.client.get<ServiceInfo>('/nacos/v1/ns/instance/list', {
        params: {
          serviceName,
          namespaceId: this.config.namespace,
          groupName: this.config.group,
        },
      });

      return response.data;
    } catch (error) {
      logger.error(`Failed to get service info for ${serviceName}:`, error);
      throw error;
    }
  }

  public async registerInstance(serviceName: string, instance: ServiceInstance): Promise<void> {
    try {
      if (!this.accessToken && this.config.username && this.config.password) {
        await this.login();
      }

      await this.client.post('/nacos/v1/ns/instance', null, {
        params: {
          serviceName,
          ip: instance.ip,
          port: instance.port,
          weight: instance.weight,
          enabled: instance.enabled,
          healthy: instance.healthy,
          ephemeral: instance.ephemeral,
          clusterName: instance.clusterName,
          metadata: JSON.stringify(instance.metadata),
          namespaceId: this.config.namespace,
          groupName: this.config.group,
        },
      });
    } catch (error) {
      logger.error(`Failed to register instance for ${serviceName}:`, error);
      throw error;
    }
  }

  public async deregisterInstance(serviceName: string, instance: ServiceInstance): Promise<void> {
    try {
      if (!this.accessToken && this.config.username && this.config.password) {
        await this.login();
      }

      await this.client.delete('/nacos/v1/ns/instance', {
        params: {
          serviceName,
          ip: instance.ip,
          port: instance.port,
          clusterName: instance.clusterName,
          namespaceId: this.config.namespace,
          groupName: this.config.group,
        },
      });
    } catch (error) {
      logger.error(`Failed to deregister instance for ${serviceName}:`, error);
      throw error;
    }
  }

  public async getConfig(): Promise<string> {
    try {
      if (!this.accessToken && this.config.username && this.config.password) {
        await this.login();
      }

      const response = await this.client.get('/nacos/v1/cs/configs', {
        params: {
          dataId: this.config.dataId,
          group: this.config.group,
          namespaceId: this.config.namespace,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get config:', error);
      throw error;
    }
  }

  public async publishConfig(content: string): Promise<void> {
    try {
      if (!this.accessToken && this.config.username && this.config.password) {
        await this.login();
      }

      await this.client.post('/nacos/v1/cs/configs', null, {
        params: {
          dataId: this.config.dataId,
          group: this.config.group,
          content,
          namespaceId: this.config.namespace,
        },
      });
    } catch (error) {
      logger.error('Failed to publish config:', error);
      throw error;
    }
  }
} 