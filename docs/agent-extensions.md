# Agent 扩展：Skill 与 MCP

本版扩展由 TypeScript 应用服务管理，沿用持有数据根租约的 SQLite Store，不引入额外服务或 Python 运行时。React 只通过 `packages/contracts` 的类型化 RPC 编辑配置。自动战斗和通用视觉控制不属于本版 Agent 能力。

## 文本 Skill

Skill 是带 YAML frontmatter 的 `SKILL.md` 和可选文本引用。它提供工作说明，不执行 `scripts/`，也不能取得宿主原本未开放的工具、设备权限或药石额度。

```markdown
---
name: daily-review
description: 检查现有日常计划并说明未满足的条件。
allowed-tools: maa_list_plans maa_list_devices ask_user
---

先读取现有配置，指出不确定的信息；需要用户选择时使用 ask_user。
```

- `name` 使用小写字母、数字和单连字符，最长 64 字符。导入目录名必须与其一致。
- `description` 为 1–1024 字符。`compatibility` 可选，最长 500 字符。
- `allowed-tools` 为可选的空格分隔字符串，仅接受工具精确名称。省略时沿用宿主已有权限，`allowed-tools: ""` 明确禁止工具；多个选中 Skill 取交集。工具范围审批仍然独立生效。
- 主文档不超过 64 KiB；最多 100 个引用，每个不超过 64 KiB，总计不超过 512 KiB。最多保存 100 个 Skill。
- 引用只接受 `references/` 下的 `.md`、`.txt`、`.json`、`.yaml`、`.yml`，最多嵌套 4 层；禁止路径穿越、符号链接、非普通文件和大小写冲突。

导入路径只能来自可信设置页面中用户选择的目录，不能作为模型工具参数。服务复制文本内容到本地存储，忽略 `scripts/`、`assets/` 等其他目录。新 Skill 默认禁用，需要启用并选入会话后才能进入模型上下文。主文档按需带入，引用由 `read_skill_reference` 按选中 Skill ID 和引用名读取。

内容和排序后的引用计算 SHA-256 版本。更新保留旧版本，审批恢复会核对版本；禁用或删除活动记录后，模型不能再加载其旧版本。保留的历史版本用于已有调用的追溯。

RPC：`agent.skill.list/save/import/enable/delete`。保存接口接收完整 `content` 和可选 `references: [{ name, text }]`。

## Maa Verge 调用外部 MCP

客户端直接使用官方 TypeScript SDK 2.4.0，支持 stdio 与 Streamable HTTP。SDK 协商现代协议，也兼容 2025 年协议；不使用旧 HTTP+SSE 地址猜测或自动回退。

配置保存不会启动进程或建立连接。用户点击连接检查、查看工具，或执行已绑定且已启用 MCP 的目标会话时，服务才连接。stdio 使用用户明确配置的可执行文件绝对路径和独立参数数组，不使用 shell、不自动安装包；不接受 shell 和 `npx` 等包启动器作为入口。进程只继承 SDK 提供的有限基础环境与明确配置的非秘密环境变量，stderr 不进入协议输出。SDK 的自动协议探测可能先启动一个随后退出的探测进程，因此服务器应避免在启动时执行业务操作。

外部进程以当前操作系统用户的权限运行；这不是进程沙箱。只配置可信、功能明确的服务器。明显的 shell、terminal、exec、通用脚本执行工具及带通用命令执行参数的工具不会开放给模型。外部工具名称和注解不能证明服务的真实行为。

远程 HTTP 只允许 HTTPS；明文 HTTP 只允许字面量回环地址 `127.0.0.1`、`[::1]`。地址不能包含用户信息或片段，不跟随重定向，不自动重试工具调用。配置支持 `credentialRef`，秘密由宿主运行时解析，不能在配置中直接保存 bearer token。非空 `credentialRef` 无法解析或凭据已失效时，在建立连接前明确拒绝，并阻止退回匿名请求；已建立连接的后续请求也重新核对凭据。当前产品设置未提供独立 MCP 凭据写入入口，不能将模型 API key 当作 MCP 密钥使用；需要认证的服务应等独立秘密管理接入后再配置。

每个服务器和每个工具均需手动启用，且必须选入会话。模型只见到稳定的带 `mcp_` 前缀的名称；服务器内部原名保留在宿主绑定中。每次调用都验证参数 JSON Schema、当前配置和工具定义。外部工具的 `readOnlyHint` 等注解仅是外部声明，所有调用均进入用户审批。计划模式不调用外部工具。

stdio 单帧及 HTTP 单次响应读取不超过 1 MiB。工具参数不超过 128 KiB，结构定义不超过 64 KiB；最多发现 100 个工具、最多读取 4 页。拒绝外部 JSON Schema 引用与过深结构。工具结果先验证，再剥离非文本内容块并保留有界的文本及结构化投影；超过 64 KiB 时截断。投影在宿主账本保存前完成，结果始终作为不可信工具资料处理。

宿主使用现有调用账本，以会话、轮次和 `callId` 去重。已提交但结果不明的外部操作不能自动重放；服务器配置、参数或定义改变后必须重新审阅。此保证不能撤销外部服务已经发生的操作。

RPC：`agent.mcp.list/save/delete/check/tools`。连接失败只返回不含凭据的通用错误。

## MCP 询问用户与断点续传

现代协议的 `input_required` 由客户端手动处理，不启用 SDK 自动满足与重放。仅支持 `elicitation/create`，不提供 sampling、roots 或模型代填权限。每次最多 20 个输入请求，总体不超过 64 KiB。

宿主持久化待回答问题、原调用身份和服务器的 opaque `requestState`，结束当前模型/网络请求并等待用户。表单回答必须与请求 ID 逐项对应，`action` 只接受 `accept`、`decline`、`cancel`；接受表单时按 `requestedSchema` 验证内容。URL 型询问不自动打开页面、不代填凭据，确认后只返回动作状态。

恢复使用新的协议请求 ID、原宿主调用身份、逐字节原样的 `requestState` 与验证后的 `inputResponses`。没有可靠服务器 continuation 状态时，调用不能从头重放，需要人工核对。旧协议无法持久暂停服务器请求，本版对旧式实时 `elicitation/create` 返回取消；用户仍可使用 Maa Verge 自身的持久 `ask_user`。

普通问题回答只补充信息，不等于执行审批。Skill 文本、记忆和交接资料也不能携带审批权限。

## 对外提供 Maa Verge MCP

对外 MCP 默认关闭。开启后只监听 `127.0.0.1` 的随机端口，地址为 `/mcp`，仅支持 POST，并限制请求体为 128 KiB。请求必须匹配本机 Host、受限 Origin 和独立随机 bearer token。令牌仅驻留本次进程内存，关闭后失效；普通状态不返回令牌，可信设置页面通过显式 `showToken` 获取连接信息。令牌不得写入 Agent 上下文、事件或日志。

服务只提供以下固定端口，不暴露通用 RPC、任意文件或 worker 直接调用：

| MCP 工具                | 行为                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `maa_status`            | 读取宿主明确提供的运行状态摘要。                                                       |
| `maa_list_plans`        | 读取现有计划摘要。                                                                     |
| `maa_get_operation`     | 按 `operationId` 查询审批或执行状态。                                                  |
| `maa_request_operation` | 按 `deviceId` 申请执行现有计划、单项工具、配置好的作业或停止运行，返回 `operationId`。 |

操作申请必须带可持久去重的 `requestId`，使用 `kind: plan/tool/copilot/stop` 及对应的 `planId/toolKind/copilotKind/runId`，单项工具可带有界 `config`。请求被送入本地持久交互及审批流程，外部调用本身不会直接操作设备。实际执行仍由应用服务核对设备范围、操作快照、消耗上限和业务去重账本。

RPC：`agent.mcp.server { enabled, showToken? }`。重启不自动开启对外端口。

## 验证范围

`services/backend/tests/agent-extensions.test.ts` 使用隔离临时数据根、官方 SDK 和本机合成服务器验证 Skill 版本/权限/导入边界、两种客户端传输、审批前置与配置竞态、手动 elicitation 续传、结果限额及对外端口认证。测试不连接真实 MCP 服务、游戏设备或付费模型。
