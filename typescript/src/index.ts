import { Router } from './nacos_mcp_router/router';
import { logger } from './nacos_mcp_router/logger';
import { RouterConfig } from './nacos_mcp_router/types';

const config = {
  nacos: {
    serverAddr: process.env.NACOS_SERVER_ADDR || 'http://localhost:8848',
    // namespace: process.env.NACOS_NAMESPACE || 'public',
    // group: process.env.NACOS_GROUP || 'DEFAULT_GROUP',
    // dataId: process.env.NACOS_DATA_ID || 'nacos-mcp-router',
    username: process.env.NACOS_USERNAME || "nacos",
    password: process.env.NACOS_PASSWORD || "Ip7x9546iT",
  },
  mcp: {
    host: process.env.MCP_HOST || 'localhost',
    port: parseInt(process.env.MCP_PORT || '8080', 10),
    authToken: process.env.MCP_AUTH_TOKEN,
  },
};

async function main() {
  try {
    const router = new Router(config as RouterConfig);
    await router.start();
    logger.info('Nacos MCP Router started successfully');
  } catch (error) {
    logger.error('Failed to start Nacos MCP Router:', error);
    process.exit(1);
  }
}

main(); 