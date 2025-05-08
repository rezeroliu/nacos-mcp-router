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