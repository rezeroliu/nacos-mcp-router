## 概述

[Nacos](https://nacos.io) 一个更易于构建云原生应用的动态服务发现、配置管理和服务管理平台。Nacos提供了一组简单易用的特性集，帮助您快速实现动态服务发现、服务配置、服务元数据及流量管理

Nacos-MCP-Router是一个基于MCP官方标准SDK实现的的MCP Server。它提供了一组工具，提供MCP Server推荐、分发、安装及代理其他MCP Server的功能，帮助用户更方便的使用MCP Server服务。


## 工具
1. `search_mcp_server`
    - 根据任务描述及关键字从MCP注册中心（Nacos）中搜索相关的MCP Server列表
    - 输入:
      - `task_description`(string): 任务描述，示例：今天杭州天气如何
      - `key_words`(string): 任务关键字，示例：天气、杭州
    - 输出: list of MCP servers and instructions to complete the task.
2. `add_mcp_server`
    - 添加并初始化一个MCP Server，根据Nacos中的配置与该MCP Server建立连接，等待调用。
    - 输入:
      - `mcp_server_name`(string): 需要添加的MCP Server名字
    - 输出: MCP Server工具列表及使用方法
3. `use_tool`
   - 代理其他MCP Server的工具
   - 输入:
     - `mcp_server_name`(string): 被调的目标MCP Server名称.
     - `mcp_tool_name`(string): 被调的目标MCP Server的工具名称     - `params`(string): 被调的目标MCP Server的工具的参数
   - 输出: 被调的目标MCP Server的工具的输出结果
## 开始
使用Nacos-MCP-Router主要通有两种形式，分别是Python和Typescript，下面分别介绍。
### Python接入

#### 使用 uv (推荐)

如果使用 [`uv`](https://docs.astral.sh/uv/) 无须安装额外的依赖， 使用[`uvx`](https://docs.astral.sh/uv/guides/tools/) 直接运行 *nacos-mcp-router*。

#### 使用 PIP

此外，你也可以通过pip安装 `nacos-mcp-router` : 

```
pip install nacos-mcp-router
```

安装完成后，使用如下命令运行（以Nacos本地standalone模式部署为例）:

```
export NACOS_ADDR=127.0.0.1:8848
export NACOS_USERNAME=nacos
export NACOS_PASSWORD=$PASSWORD
python -m nacos-mcp-router
```
#### 配置
在任意MCP客户端（如Cursor、Cline等）中添加如下配置，部分客户端下可能需要做一些格式化调整。
##### 使用 uvx

```json
{
    "mcpServers":
    {
        "nacos-mcp-router":
        {
            "command": "uvx",
            "args":
            [
                "nacos-mcp-router@latest"
            ],
            "env":
            {
                "NACOS_ADDR": "<NACOS-ADDR>, 选填，默认为127.0.0.1:8848",
                "NACOS_USERNAME": "<NACOS-USERNAME>, 选填，默认为nacos",
                "NACOS_PASSWORD": "<NACOS-PASSWORD>, 必填"
            }
        }
    }
}

```
> 如果启动失败，你需要把`command`字段里的`uvx`替换为命令的全路径。`uvx`命令全路径查找方法为：MacOS或Linux系统下使用`which uvx`，Windows系统使用`where uvx`。

##### 使用pip
```json
{
    "mcpServers":
    {
        "nacos-mcp-router":
        {
            "command": "python",
            "args":
            [
                "-m",
                "nacos_mcp_router"
            ],
            "env":
            {
                "NACOS_ADDR": "<NACOS-ADDR>, 选填，默认为127.0.0.1:8848",
                "NACOS_USERNAME": "<NACOS-USERNAME>, 选填，默认为nacos",
                "NACOS_PASSWORD": "<NACOS-PASSWORD>, 必填"
            }
        }
    }
}
```

> You may need to put the full path to the `uvx` executable in the `command` field. You can get this by running `which uvx` on MacOS/Linux or `where uvx` on Windows.


## Development

If you are doing local development, simply follow the steps:

1. Clone this repo into your local environment.
2. Modify codes in `src/mcp_server_nacos` to implement your wanted features.
3. Test using the Claude desktop app. Add the following to your claude_desktop_config.json:

```json
{
  "mcpServers": {
    "nacos-mcp-router": {
      "command": "uv",
      "args": [
        "--directory","PATH-TO-PROJECT","run","nacos-mcp-router"
      ],
      "env": {
        "NACOS_ADDR": "<NACOS-ADDR>, optional, default is 127.0.0.1:8848",
        "NACOS_USERNAME": "<NACOS-USERNAME>, optional, default is nacos",
        "NACOS_PASSWORD": "<NACOS-PASSWORD>, required"
      }
    }
  }
}
```

## License

nacos-mcp-router is licensed under the Apache 2.0 License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the Apache 2.0 License. For more details, please see the `LICENSE` file in the project repository.
