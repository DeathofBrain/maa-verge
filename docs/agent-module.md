# Agent 独立模块与 LangChain 接入

`packages/agent` 是可单独检查、测试和编译的 TypeScript workspace 包。已提取本地规则提案，提供 LangChain `createAgent` 结构化提案适配器，并在 `packages/agent/tools` 实现可单独核验的 [MaaCore 工具集](agent-tools.md)。产品的 `agent.message` 仍使用本地规则；真实模型配置、知识工具、会话持久化与自主执行尚未接入。

## 分支整合复核

2026-10-25 复核 `dev-agent@33096b9`：`d0038bd` 已合入 Agent 知识分支的 `0b6a4b4`、`52b6fd1`、`785be76`、`a0f1f4b`。原产品知识 `68ad6d9`、资源知识 `502b103` 分别与已合入的 `785be76`、`52b6fd1` 补丁等价，无需重复合并。未发现遗漏的 Agent worktree 成果。

现存作业中心 worktree 属于其他任务且有未提交修改，本轮保留；主目录中其他任务的修改也不属于本模块交付。

## 代码与依赖边界

| 位置 | 职责 |
| --- | --- |
| `packages/agent/src/index.ts` | 默认入口：框架无关类型、输入校验、本地规则提案；不加载 LangChain |
| `packages/agent/src/langchain.ts` | `@maaverge/agent/langchain` 独立入口：注入模型、调用次数与时间上限、结构化输出、取消和宿主校验 |
| `packages/agent/src/proposal-schema.ts` | 从 `packages/contracts/schemas/runtime.schema.json` 复用名称、任务及参数结构；模型只提供说明、名称和任务列表 |
| `packages/agent/tools` | 16 个框架无关业务工具、宿主授权、会话范围与零消耗策略；`./tools/langchain` 单独桥接 SDK |
| `services/backend/src/agent-tools.ts` | MaaCore 工具宿主端口，复用已有执行、识别、画面与作业服务 |
| `services/backend/src/agent.ts` | 宿主适配：规范化计划、执行现有策略检查、映射 RPC 错误 |
| backend 的 `knowledge.ts`、`account-knowledge.ts` | 继续持有本机数据库、资源快照与账号隔离；后续通过明确的只读端口提供给 Agent |

依赖方向为 backend → Agent → contracts。Agent 不导入 backend、Tauri transport、SQLite、MaaCore 或 ADB，不持有 Runtime。保存、开始执行、设备租约及更新仍由应用服务负责。

LangChain 固定为 `1.5.19`，`@langchain/core` 固定为 `1.3.0`，`langsmith` 固定为 `0.11.1`，依赖锁随仓库提交。适配器只接收 `BaseChatModel` 实例，不选择供应商、不读取模型密钥、不自动创建云模型。默认不注入业务工具；宿主可通过 `maaTools` 显式提供工具集，设备动作逐操作授权。结构化输出仍只产生草稿，没有文件或 Shell 工具。

## 接入与校验约定

`proposeDeterministic(message, preparePlan)` 与 `createLangChainProposer({ model, preparePlan, maxModelCalls, timeoutMs, maaTools? })` 均要求宿主提供 `preparePlan`。它必须先按权威 Schema 规范化，再使用与表单相同的策略验证；只有校验成功的计划可以返回。backend 当前实现见 `services/backend/src/agent.ts`，不能以直接类型断言代替这一步。

LangChain 模型不能设置已有计划 ID、设备、定时或预算。宿主填入新草稿 ID 与默认值；模块另对任务参数强制零源石、零理智药和零加急，连未启用任务中的非零配置也拒绝，避免仅靠提示词或旧版 `Plan.budgets` 字段约束模型。非法任务、结构化输出或策略拒绝会直接失败。结果始终带 `requiresConfirmation: true`，提案本身不保存、不执行。模型错误也不会转成规则提案。

`maxModelCalls` 默认 `0`，请求在调用模型前拒绝；显式范围为 `0..8`，按每次提案计数。默认时限为 30 秒，可传入 `AbortSignal`。调用次数上限不等于 token 或费用上限：真实供应商适配还需设置 token、重试、费用预算及凭据边界，完成后才能连接产品入口。非零游戏消耗的显式授权接口仍待设计，当前模型提案统一拒绝。

本阶段未开放远程追踪。适配器在调用 graph 前拒绝环境变量、父追踪上下文及 SDK 内置远程 tracer，并返回 `AgentConfigurationError`；工具桥接在 SDK 回调接收输入前检查。不会修改全局环境，宿主仍须审核自己注入的模型与本机回调。独立与完整测试启动器从子进程环境移除 LangChain/LangSmith 设置，追踪边界测试在隔离子进程中核验零上传。

## 独立核验

在已按开发说明恢复固定 Node/pnpm/Bun 与依赖的 checkout 执行：

```powershell
pnpm --filter @maaverge/agent check
pnpm test:agent
pnpm test:agent --compile
```

若系统命中了其他版本的 Node/pnpm，Windows 可用仓库包装器，例如 `powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 test:agent --compile`。所有命令使用项目固定 Bun，不依赖全局 Bun。

独立测试使用内存模型运行真实 `createAgent` / `toolStrategy`，覆盖提案与工具循环、宿主校验、默认零调用、权限、越权字段、零消耗、调用去重、取消与超时。`--compile` 额外生成并运行含工具调用的当前宿主 Bun 单文件夹具，产物保存在忽略的 `.tools/agent-verification`。这些测试不需要 MaaCore、模拟器、模型密钥或付费请求。

`pnpm test:runtime` 同时运行模块与 backend 测试，因此本地完整检查和 CI 都覆盖新模块。原 22 类规则语义与 Python 参考对照仍保留在 backend 测试中。新增间接依赖缺失的许可证原文按精确版本和 SHA-256 补齐，来源见 `tools/licenses/javascript-overrides.md`。

## 后续接入顺序

1. 接入用户选择的模型供应商与系统凭据存储，确定 token、重试、费用和错误返回约定；所有失败保持明确反馈。
2. 向模块注入有界的只读知识查询端口，复用现有知识和账号隔离，返回来源、时间与未知状态；不让模型直接读取业务库或资源路径。
3. 明确会话与 checkpoint 的持久化协议、预算及取消生命周期，再扩展 `agent.message` 的异步调用和界面状态；Schema 变更从 contracts 重新生成。
4. 完成显式真实模型验收后再启用产品入口。自主托管、视觉动作和持久审批分别验收，不能由本轮提案夹具的通过推断已交付。

官方 API 依据：[LangChain TypeScript](https://docs.langchain.com/oss/javascript/langchain/overview)、[结构化输出](https://docs.langchain.com/oss/javascript/langchain/structured-output)、[模型调用上限](https://reference.langchain.com/javascript/langchain/browser/modelCallLimitMiddleware)。
