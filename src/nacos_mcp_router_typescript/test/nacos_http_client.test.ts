import axios from 'axios';
import { NacosHttpClient } from '../src/nacos_http_client';
// import 'dotenv'
// import { NacosMcpServer } from '../src/router_types';
// import { Tool } from '../src/types';

// jest.mock('axios');
// const mockedAxios = axios as jest.Mocked<typeof axios>;

const nacosAddr = 'localhost:8848';
const userName = 'nacos';
const passwd = 'P4vUkh2pyS';


async function main() {
    const client = new NacosHttpClient(nacosAddr, userName, passwd);
// const res = await client.getMcpServerByName('amap');

// console.log(res);

const res2 = await client.getMcpServers();

console.log(res2);

// const res3 = await client.getMcpServersByPage(1, 10);

// console.log(res3);

// const res4 = await client.updateMcpTools('amap', [{ name: 't1', description: 'd1', inputSchema: {} }]);

// console.log(res4);

let config = {
    method: 'get',
    // maxBodyLength: Infinity,
    url: 'http://localhost:8848/nacos/v3/admin/ai/mcp/list?pageNo=1&pageSize=100',
    headers: { 
      'Content-Type': 'application/json', 
      'charset': 'utf-8', 
      'userName': 'nacos', 
      'password': 'P4vUkh2pyS'
    }
  };

  axios.request(config)
  .then((response) => {
    console.log(JSON.stringify(response.data));
  })
  .catch((error) => {
    console.log(error);
  });
}

main();


// describe('NacosHttpClient', () => {
//   beforeEach(() => {
//     jest.clearAllMocks();
//   });

//   it('构造函数参数校验', () => {
//     expect(() => new NacosHttpClient('', userName, passwd)).toThrow();
//     expect(() => new NacosHttpClient(nacosAddr, '', passwd)).toThrow();
//     expect(() => new NacosHttpClient(nacosAddr, userName, '')).toThrow();
//     expect(() => new NacosHttpClient(nacosAddr, userName, passwd)).not.toThrow();
//   });

//   it('getMcpServerByName 正常返回', async () => {
//     const client = new NacosHttpClient(nacosAddr, userName, passwd);

//     mockedAxios.create.mockReturnValue({ get: jest.fn().mockResolvedValue(mockData) } as any);
//     const res = await client.getMcpServerByName('amap');
//     expect(res.name).toBe('amap');
//     expect(res.description).toBe('高德地图mcp server');
//     // expect(res.agentConfig.mcpServers?.mcp1.url).toContain('1.2.3.4');
//   });

// //   it('getMcpServerByName 异常返回', async () => {
// //     const client = new NacosHttpClient(nacosAddr, userName, passwd);
// //     mockedAxios.create.mockReturnValue({ get: jest.fn().mockRejectedValue(new Error('fail')) } as any);
// //     const res = await client.getMcpServerByName('mcp1');
// //     expect(res).toBeInstanceOf(NacosMcpServer);
// //     expect(res.name).toBe('mcp1');
// //   });

//   it('getMcpServersByPage 正常返回', async () => {
//     const client = new NacosHttpClient(nacosAddr, userName, passwd);
//     const pageData = {
//       data: {
//         data: {
//           pageItems: [
//             { name: 'mcp1', enabled: true },
//             { name: 'mcp2', enabled: false },
//           ],
//         },
//       },
//       status: 200,
//     };
//     const mcpData = {
//       data: {
//         data: {
//           name: 'mcp1',
//           description: 'desc',
//           protocol: 'http',
//           backendEndpoints: [],
//           remoteServerConfig: { exportPath: '/api', serviceRef: 'ref' },
//           localServerConfig: {},
//         },
//       },
//       status: 200,
//     };
//     const getMock = jest.fn()
//       .mockResolvedValueOnce(pageData)
//       .mockResolvedValueOnce(mcpData);
//     mockedAxios.create.mockReturnValue({ get: getMock } as any);
//     const res = await client.getMcpServersByPage(1, 10);
//     expect(res.length).toBe(1);
//     expect(res[0].name).toBe('mcp1');
//   });

//   it('getMcpServersByPage 异常返回', async () => {
//     const client = new NacosHttpClient(nacosAddr, userName, passwd);
//     mockedAxios.create.mockReturnValue({ get: jest.fn().mockRejectedValue(new Error('fail')) } as any);
//     const res = await client.getMcpServersByPage(1, 10);
//     expect(res).toEqual([]);
//   });

//   it('getMcpServers 正常返回', async () => {
//     const client = new NacosHttpClient(nacosAddr, userName, passwd);
//     const listData = {
//       data: {
//         data: {
//           totalCount: 1,
//           pageItems: [
//             { name: 'mcp1', enabled: true },
//           ],
//         },
//       },
//       status: 200,
//     };
//     const mcpData = {
//       data: {
//         data: {
//           name: 'mcp1',
//           description: 'desc',
//           protocol: 'http',
//           backendEndpoints: [],
//           remoteServerConfig: { exportPath: '/api', serviceRef: 'ref' },
//           localServerConfig: {},
//         },
//       },
//       status: 200,
//     };
//     const getMock = jest.fn()
//       .mockResolvedValueOnce(listData)
//       .mockResolvedValueOnce(listData)
//       .mockResolvedValueOnce(mcpData);
//     mockedAxios.create.mockReturnValue({ get: getMock } as any);
//     const res = await client.getMcpServers();
//     expect(res.length).toBe(1);
//     expect(res[0].name).toBe('mcp1');
//   });

//   it('getMcpServers 异常返回', async () => {
//     const client = new NacosHttpClient(nacosAddr, userName, passwd);
//     mockedAxios.create.mockReturnValue({ get: jest.fn().mockRejectedValue(new Error('fail')) } as any);
//     const res = await client.getMcpServers();
//     expect(res).toEqual([]);
//   });

//   it('updateMcpTools 正常返回', async () => {
//     const client = new NacosHttpClient(nacosAddr, userName, passwd);
//     const getData = {
//       data: {
//         data: {
//           name: 'mcp1',
//           description: 'desc',
//           protocol: 'http',
//           backendEndpoints: [],
//           remoteServerConfig: { exportPath: '/api', serviceRef: 'ref' },
//           localServerConfig: {},
//           toolSpec: {},
//         },
//       },
//       status: 200,
//     };
//     const putData = { status: 200 };
//     mockedAxios.create.mockReturnValue({ get: jest.fn().mockResolvedValue(getData) } as any);
//     mockedAxios.put.mockResolvedValue(putData as any);
//     const tools: Tool[] = [{ name: 't1', description: 'd1', inputSchema: {} }];
//     const res = await client.updateMcpTools('mcp1', tools);
//     expect(res).toBe(true);
//   });

//   it('updateMcpTools 异常返回', async () => {
//     const client = new NacosHttpClient(nacosAddr, userName, passwd);
//     mockedAxios.create.mockReturnValue({ get: jest.fn().mockRejectedValue(new Error('fail')) } as any);
//     const tools: Tool[] = [{ name: 't1', description: 'd1', inputSchema: {} }];
//     const res = await client.updateMcpTools('mcp1', tools);
//     expect(res).toBe(false);
//   });
// }); 