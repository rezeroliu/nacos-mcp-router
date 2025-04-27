import json

import httpx
from mcp import Tool

from .router_types import McpServer
from .nacos_mcp_server_config import NacosMcpServerConfig, ToolSpec
from .logger import NacosMcpRouteLogger


class NacosHttpClient:
    def __init__(self, nacosAddr: str, userName: str, passwd: str) -> None:
        if nacosAddr == "":
            raise ValueError("nacosAddr cannot be an empty string")
        if userName == "":
            raise ValueError("userName cannot be an empty string")
        if passwd == "":
            raise ValueError("passwd cannot be an empty string")

        self.nacosAddr = nacosAddr
        self.userName = userName
        self.passwd = passwd

    def get_mcp_server_by_name(self, name: str) -> McpServer:
        url = "http://{0}/nacos/v3/admin/ai/mcp?mcpName={1}".format(self.nacosAddr, name)
        headers = {"Content-Type": "application/json", "charset": "utf-8", "userName": self.userName,
                   "password": self.passwd}
        response = httpx.get(url, headers=headers)
        mcp_server = McpServer(name=name, description="", agentConfig={})
        if response.status_code == 200:
            jsonObj = json.loads(response.content.decode("utf-8"))
            data = jsonObj['data']
            config = NacosMcpServerConfig.from_dict(data)
            mcpServer = McpServer(name=config.name, description=config.description if config.description is not None else "",
                                  agentConfig=config.local_server_config)
            mcpServer.mcp_config_detail = config

            if config.protocol != "stdio":
                if len(config.backend_endpoints) > 0:
                    endpoint = config.backend_endpoints[0]
                    http_schema = "http"
                    if endpoint.port == 443:
                        http_schema = "https"

                    url = "{0}://{1}:{2}{3}".format(http_schema, endpoint.address, str(
                        endpoint.port), config.remote_server_config.export_path)
                    if not config.remote_server_config.export_path.startswith("/"):
                        url = "{0}://{1}:{2}/{3}".format(http_schema, endpoint.address, str(
                            endpoint.port), config.remote_server_config.export_path)

                    if 'mcpServers' not in mcpServer.agentConfig or mcpServer.agentConfig['mcpServers'] == None:
                        mcpServer.agentConfig['mcpServers'] = {}
                    mcpServers = mcpServer.agentConfig['mcpServers']
                    dct = {"name": mcp_server.name, "description": mcp_server.description, "url": url}
                    mcpServers[mcp_server.name] = dct
            return mcpServer
        else:
            NacosMcpRouteLogger.get_logger().warning("failed to get mcp server {}, response  {}" .format(mcp_server.name, response.content))
        return mcp_server

    def get_mcp_servers_by_page(self, page_no: int, page_size: int) -> list[McpServer]:
        mcpServers = list[McpServer]()
        try:
            url = "http://{0}/nacos/v3/admin/ai/mcp/list?pageNo={1}&pageSize={2}".format(self.nacosAddr, str(page_no), str(
                page_size))
            headers = {"Content-Type": "application/json", "charset": "utf-8", "userName": self.userName,
                       "password": self.passwd}
            response = httpx.get(url, headers=headers)
            if response.status_code != 200:
                NacosMcpRouteLogger.get_logger().warning(
                    "failed to get mcp server list response  {}".format( response.content))
                return []

            jsonObj = json.loads(response.content.decode("utf-8"))
            data = jsonObj['data']
            for mcp_server_dict in data['pageItems']:
                if mcp_server_dict["enabled"]:
                    mcp_name = mcp_server_dict["name"]
                    mcpServer = self.get_mcp_server_by_name(mcp_name)

                    if mcpServer.description == "":
                        continue
                    mcpServers.append(mcpServer)
            return mcpServers
        except Exception as e:
            return mcpServers

    def get_mcp_servers(self) -> list[McpServer]:
        mcpServers = []
        try:
            page_size = 100
            page_no = 1
            url = "http://{0}/nacos/v3/admin/ai/mcp/list?pageNo={1}&pageSize={2}".format(self.nacosAddr, str(page_no), str(
                page_size))

            headers = {"Content-Type": "application/json", "charset": "utf-8", "userName": self.userName,
                       "password": self.passwd}
            response = httpx.get(url, headers=headers)
            if response.status_code != 200:
                NacosMcpRouteLogger.get_logger().warning(
                    "failed to get mcp server list, url {},  response  {}".format(url, response.content))
                return []

            jsonObj = json.loads(response.content.decode("utf-8"))
            total_count = jsonObj['data']['totalCount']
            total_pages = int(total_count / page_size) + 1

            for i in range(1, total_pages + 1):
                mcps = self.get_mcp_servers_by_page(i, page_size)
                for mcp_server in mcps:
                    mcpServers.append(mcp_server)
            return mcpServers
        except Exception as e:
            return mcpServers

    def update_mcp_tools(self,mcp_name:str, tools: list[Tool]) -> bool:
        url = "http://{0}/nacos/v3/admin/ai/mcp?mcpName={1}".format(self.nacosAddr, mcp_name)
        headers = {"Content-Type": "application/json", "charset": "utf-8", "userName": self.userName,
                   "password": self.passwd}
        response = httpx.get(url, headers=headers)

        if response.status_code == 200:
            jsonObj = json.loads(response.content.decode("utf-8"))
            data = jsonObj['data']
            tool_list = []
            for tool in tools:
                dct = {}
                dct["name"] = tool.name
                dct["description"] = tool.description
                dct["inputSchema"] = tool.inputSchema
                tool_list.append(dct)
            endpointSpecification = {}
            if data['protocol'] != "stdio":
               endpointSpecification['data'] = data['remoteServerConfig']['serviceRef']
               endpointSpecification['type'] = 'REF'
            if 'toolSpec' not in data or data['toolSpec'] is None:
                data['toolSpec'] = {}

            data['toolSpec']['tools'] = tool_list
            params = {}
            params['mcpName'] = mcp_name
            toolSpecification = data['toolSpec']


            del data['toolSpec']
            del data['backendEndpoints']


            params["serverSpecification"] = json.dumps(data, ensure_ascii=False)
            params["endpointSpecification"] = json.dumps(endpointSpecification, ensure_ascii=False)
            params["toolSpecification"] = json.dumps(toolSpecification, ensure_ascii=False)

            NacosMcpRouteLogger.get_logger().info("update mcp tools, params {}".format(json.dumps(params, ensure_ascii=False)))
            url = "http://" + self.nacosAddr + "/nacos/v3/admin/ai/mcp?"
            headers = {"Content-Type": "application/x-www-form-urlencoded", "charset": "utf-8", "userName": self.userName,
                       "password": self.passwd}
            response_update = httpx.put(url, headers=headers, data=params)
            if response_update.status_code == 200:
                return True
            else:
                NacosMcpRouteLogger.get_logger().warning(
                    "failed to update mcp tools list, caused: {}".format(response_update.content))
                return False
        else:
            NacosMcpRouteLogger.get_logger().warning("failed to update mcp tools list, caused: {}".format(response.content))
            return False
