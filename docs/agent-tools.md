# MaaCore Agent tools

`packages/agent/tools` 把现有应用服务能力封装为 16 个工具。中立工具集负责参数校验、会话范围、零消耗策略和宿主授权；独立的 LangChain 适配器负责 SDK 工具格式。工具不持有 Runtime、数据库、MaaCore worker、ADB 或通用 RPC 客户端。

本轮交付的是可注入的模块与后端端口。产品 `agent.message` 仍使用本地规则提案，尚未启用模型或自动执行。

## 入口与文件

| 位置 | 职责 |
| --- | --- |
| `@maaverge/agent/tools` / `tools/index.ts` | `createMaaTools`、任务目录、端口和结果类型；不加载 LangChain |
| `tools/factory.ts` | 工具实现、不可变授权、会话范围、请求标识、去重、取消及结果投影 |
| `tools/schemas.ts` | 从 contracts 权威 Schema 展开选中的参数结构；移除宿主字段 |
| `tools/policy.ts` | 有限次数、零药石加急、禁止任意文件和命令、客户端约束 |
| `tools/catalog.ts` | 全部 20 类任务的名称、入口与未开放原因 |
| `@maaverge/agent/tools/langchain` | 标准 LangChain 工具、调用 ID、取消和本机 artifact 桥接 |
| `services/backend/src/agent-tools.ts` | `createMaaToolHost(runtime)`，通过具名端口复用业务校验、设备独占和执行去重 |

依赖方向为 backend → agent → contracts。框架无关入口不导入 LangChain；默认产品服务不会因增加 tools 而加载模型 SDK。新增 Schema 不另建副本，也没有新增面向 UI 的 RPC。

## 可用工具

| 工具 | 行为 | 授权 |
| --- | --- | --- |
| `maa_task_catalog` | 任务目录、可用入口与限制 | 读 |
| `maa_list_devices` | 已登记设备摘要；不发现或连接新设备 | 读 |
| `maa_list_plans` | 当前设备可用的已保存任务表摘要 | 读 |
| `maa_propose_tasks` | 规范化任务草稿；不保存、不执行 | 草稿 |
| `maa_device_status` | 设备连接、占用与控制者 | 读 |
| `maa_get_frame` | 取当前帧，图像保留本机 artifact | 宿主逐操作授权 |
| `maa_click` | 使用本会话画面帧号及预览坐标点击一次 | 宿主逐操作授权 |
| `maa_start_plan` | 执行已保存且通过策略的当前任务表 | 宿主审阅完整快照 |
| `maa_get_run` | 本会话执行状态与逐任务证据 | 读 |
| `maa_stop_run` | 停止执行并清空原生队列 | 宿主逐操作授权 |
| `maa_start_tool` | 六类独立工具：仓库、干员、公招、库存保持、数据刷新、小游戏 | 宿主逐操作授权 |
| `maa_get_tool` | 本会话工具操作状态与结果 | 读 |
| `maa_stop_tool` | 停止本会话工具操作 | 宿主逐操作授权 |
| `maa_get_recognition` | 分页读取当前设备与客户端识别结果 | 读 |
| `maa_get_copilot_workspace` | 查看已导入的普通、保全、悖论作业工作区 | 读 |
| `maa_start_copilot` | 执行当前工作区的不可变作业版本 | 宿主审阅完整快照 |

日常任务通过任务草稿、已保存任务表入口组合，避免为每个原生任务重复实现生命周期。`UserDataUpdate` 仍由应用服务拆分，不直接发送给 MaaCore。三类作业只使用已导入的工作区与版本 ID，不接受模型指定文件。

本阶段不开放 `VideoRecognition`、`SingleStep`、`OperProgress`，原因分别为本地视频路径、尚未验收的动作协议、缺少材料消耗授权。滑动、返回、作业导入/编辑、任意资源任务链、文件系统和 Shell 均没有工具入口。

## 宿主接入

```ts
import { createMaaTools } from '@maaverge/agent/tools';
import { createLangChainMaaTools } from '@maaverge/agent/tools/langchain';
import { createMaaToolHost } from './agent-tools'; // 应用服务内

const maaTools = createMaaTools(createMaaToolHost(runtime), {
  sessionId,                  // 宿主创建并保存的会话标识
  deviceId,                   // 宿主选择设备
  clientType: 'Official',     // 宿主选择客户端
  maxCalls: 32,
  authorize: reviewMaaAction, // 宿主实现；只接受明确的 true
});

const tools = createLangChainMaaTools(maaTools);
// 或传入 createLangChainProposer({ model, preparePlan, maaTools, maxModelCalls: 3 })。
// 此时模型可调用已注入工具，最终结构化输出仍为待审阅的计划草稿。
```

`reviewMaaAction` 接收冻结的 `{ toolName, effect, deviceId, clientType, requestId, action }` 与可选取消信号。执行任务表和作业时，`action` 含当前完整快照。授权必须绑定这些具体内容，不能只显示工具名称。未提供回调时，截图、点击、执行和停止全部拒绝；读与草稿工具可用。产品审批界面与审批持久化仍待接入。

设备、客户端、请求 ID 不属于模型参数；模型不能传入 `approved` 绕过授权。宿主也是信任边界：只应注入审核过的端口、模型和本地回调，不能把 `authorize: () => true` 当作通用产品权限方案。

执行前后端再次同步比较任务表/工作区与获批快照，并检查当前客户端；变更即拒绝，要求重新审阅。任务表的执行副本补齐绑定客户端，后续任务不随默认设置漂移，不改写已保存表。校验与执行接纳之间不让出事件循环；最终设备独占、更新门禁及工作进程空闲检查继续由 Runtime 处理。

## 执行与结果约定

- 任务参数统一拒绝源石、理智药、临期理智药、作业药与加急消耗。作战默认一次、最多 100 次；肉鸽草稿默认一次、最多 10 次，已有任务表必须明确启动次数。统计上报关闭，不接受账号切换。
- 独立工具始终显式传入本次 `config`，缺省为 `{}`，防止复用历史库存补货配置。补货数量最多 1000，目标药石额度为零；作业循环最多 10 次，不自动发送社区评价。
- 运行/操作 ID 仅可来自本会话启动结果，或宿主通过 `runIds` / `toolJobIds` 明确附加；后续查询和停止仍核对设备，工具操作另核对客户端。宿主负责确认附加历史执行的身份与用途。
- 点击必须使用本会话发放的可控制帧，坐标不能越界；后端继续校验帧有效期与控制权。每会话最多保留最近 32 帧引用，旧帧需重新获取。返回接受不代表点击成功，结果不明不自动重试。
- `maa_get_frame` 的模型内容只有帧元数据，原始图像作为本机 artifact。当前没有自动向视觉模型发送图片的适配器。
- 识别结果保留采集时间、估算时间及未知值，`offset` / `limit` 每页最多 50 项，并返回总数与 `hasMore`。缺项不能推断未拥有，估算数量不能当成实时库存。
- 运行/操作结果过滤文件、凭据和原始数据字段，限制嵌套与内容长度；截断时返回 `contentTruncated: true`，应通过专用识别查询或宿主界面核对完整证据。提交、处理完成和作业通关始终分别表述。
- 停止调用原有停止语义并清空原生队列，不提供暂停/恢复。中止 Agent 的 `AbortSignal` 可阻止尚未提交的操作；已提交原生工作需要通过停止工具并经宿主授权结束。

## 调用身份、预算与追踪

中立入口为 `maaTools.invoke(name, input, { callId, signal })`。宿主必须为同一次投递重用稳定 `callId`。相同 ID 和参数共享一次 Promise，失败结果也不重新执行；换参数报冲突。输入最多 64 KiB、嵌套最多 32 层，每会话默认 32 次、可设 1..64 次，非法已登记调用也消耗次数。

请求 ID 由 `sessionId` 与 `callId` 的 SHA-256 派生。会话内缓存不持久化，也不等于持久会话恢复：宿主恢复时须保存调用账本和结果，禁止给结果不明的动作换 ID 重放。任务表、独立工具和作业沿用后端持久去重；点击沿用现有预览调用去重，跨进程恢复不能据此宣称 exactly-once。

LangChain 优先使用 SDK `tool_call.id`，直接调用可通过 `configurable.maaToolCallId` 提供宿主投递 ID，未提供时生成新 ID。模型调用额度与工具调用额度独立；模型额度默认仍为零，真实供应商 token、重试及费用预算尚未接入。

本阶段拒绝 LangSmith 环境/父上下文追踪及 SDK 内置远程 tracer，检查在 SDK 接收工具输入之前执行。本机回调可用；宿主注入的任意模型或回调代码仍由宿主审核，本模块不是 JavaScript 沙箱。

## 独立核验

```powershell
pnpm --filter @maaverge/agent check
pnpm test:agent --compile
# 后端端口与合成 MaaCore 生命周期：
.tools/bun/bun.exe test services/backend/tests/agent-tools.test.ts
```

若系统 Node/pnpm 版本不匹配，可使用 `powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 test:agent --compile`。测试使用内存模型、合成宿主与合成 worker，不需要 MaaCore、模拟器、模型密钥或付费请求。完整回归由 `pnpm test:runtime` 覆盖 Agent 与 backend；实际核验记录见 [开发状态](STATUS.md)。
