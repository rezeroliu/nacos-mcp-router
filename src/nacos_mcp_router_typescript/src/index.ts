import { Router, RouterConfig } from './router';
import { logger } from './logger';
import 'dotenv/config';

export const config = {
  nacos: {
    serverAddr: process.env.NACOS_SERVER_ADDR || '47.109.140.197:8848',
    // namespace: process.env.NACOS_NAMESPACE || 'public',
    // group: process.env.NACOS_GROUP || 'DEFAULT_GROUP',
    // dataId: process.env.NACOS_DATA_ID || 'nacos-mcp-router',
    username: process.env.NACOS_USERNAME || "nacos",
    password: process.env.NACOS_PASSWORD || "Ip7x9546iT",
  },
};

async function main() {
  try {
    const router = new Router(config as RouterConfig);
    // router.start();
    await router.start();
    logger.info('Nacos MCP Router started successfully');
  } catch (error) {
    logger.error('Failed to start Nacos MCP Router:', error);
    process.exit(1);
  }
}

// main();