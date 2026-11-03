# 后端架构与开源项目参考

调研日期：2026-10-31。服务入口与扩展说明见 [backend README](../services/backend/README.md)，进程和数据约束见[运行时迁移](runtime-migration.md)。本文记录架构依据及本轮重构的实际边界。

## 参考的源码

以下使用固定提交，核对了实际组装、业务与基础设施实现。三个项目都包含本地应用服务的经验，无需将其 HTTP、状态框架或全局注册器一并引入 Maa Verge。

| 项目                                                | 读取的实现                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 采用的经验与限制                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| OpenCode `bf5d12c588911a35ec56ad991c3b83cf937f424a` | [服务组装](https://github.com/anomalyco/opencode/blob/bf5d12c588911a35ec56ad991c3b83cf937f424a/packages/server/src/routes.ts#L56-L86)、[进程生命周期](https://github.com/anomalyco/opencode/blob/bf5d12c588911a35ec56ad991c3b83cf937f424a/packages/server/src/process.ts#L89-L138)、[Bun SQLite 适配](https://github.com/anomalyco/opencode/blob/bf5d12c588911a35ec56ad991c3b83cf937f424a/packages/core/src/database/sqlite.bun.ts#L83-L102)                                                                                                                       | 明确依赖组装、启动和销毁；不照搬 Effect 或 HTTP。其进程内锁不能代替本项目的跨进程数据根租约。                 |
| Actual `e82ea4dc3594e7e0c32ba7b1039913c19e6ce9f9`   | [业务聚合](https://github.com/actualbudget/actual/blob/e82ea4dc3594e7e0c32ba7b1039913c19e6ce9f9/packages/loot-core/src/server/main.ts#L128-L155)、[应用分派和服务启停](https://github.com/actualbudget/actual/blob/e82ea4dc3594e7e0c32ba7b1039913c19e6ce9f9/packages/loot-core/src/server/app.ts#L34-L85)、[Electron 连接适配](https://github.com/actualbudget/actual/blob/e82ea4dc3594e7e0c32ba7b1039913c19e6ce9f9/packages/loot-core/src/platform/server/connection/index.electron.ts#L10-L66)                                                                   | 按业务能力聚合 handlers，隔离进程连接与存储驱动。它仍有大型业务文件和全局数据库，目录划分本身不能证明已解耦。 |
| Joplin `2e1310190489c5325dd69305bb762e887865c6c3`   | [驱动注入](https://github.com/laurent22/joplin/blob/2e1310190489c5325dd69305bb762e887865c6c3/packages/lib/BaseApplication.ts#L860-L879)、[资源销毁](https://github.com/laurent22/joplin/blob/2e1310190489c5325dd69305bb762e887865c6c3/packages/lib/BaseApplication.ts#L129-L146)、[数据库接口](https://github.com/laurent22/joplin/blob/2e1310190489c5325dd69305bb762e887865c6c3/packages/lib/database.ts#L32-L75)、[定时平台接口](https://github.com/laurent22/joplin/blob/2e1310190489c5325dd69305bb762e887865c6c3/packages/lib/services/AlarmService.ts#L8-L31) | 共享服务依赖明确的驱动接口，桌面负责平台适配和销毁；不采用其全局 reg、BaseModel 或单例注册方式。              |

## 原有问题与本轮取舍

原先后端 `src` 根目录混放 55 个文件；本轮保留 entry，迁移其余 54 个。`Runtime` 同时负责依赖组装、RPC 路由、设备连接与重连、执行监督、更新准入和关闭；协议响应处理与进程启动写在同一入口。按文件长度拆分会继续保留隐式状态与反向依赖。

本轮保留稳定的产品 `entry.ts`，将代码按 `app / transport / modules / infrastructure / shared` 归档，更新调用方与工具路径，不增加旧路径兼容层。JSON-RPC envelope、响应和诊断从入口独立为结构类型端口；RPC 参数校验与路由从 Runtime 独立为能力分派，私有状态和原子操作仍由运行时封装。

已有的良好边界继续保留：`Store` 负责单个数据根的租约与业务持久化，`UpdateService` 使用存储端口，更新任务不打开业务数据库，C++ worker 持有设备和 MaaFramework Controller。没有为了目录整齐创建第二个数据库、通用服务定位器或新的运行框架。

## 分层

```text
src/
  entry.ts                  Bun 产品入口、启动、NDJSON framing、后台任务与退出
  app/                      Runtime 组装、跨域协调、RPC 能力分派、Agent 宿主适配
  transport/                JSON-RPC 请求/响应与诊断，小结构接口
  modules/                  业务能力：计划、设备、执行、作业、工具、定时等
  infrastructure/           SQLite、日志、网络、归档、配置路径、ADB 与 C++ 通道
  shared/                   错误、版本、casefold 与数字 token 等公共语义
```

`entry` 组合应用和协议；`app` 组合业务能力与基础设施；`modules` 可以显式复用其他业务模块，但不得反向导入 app 或 transport。基础设施依赖其他基础设施与共享语义；shared 保持叶子层。任何下层都不得导入有启动副作用的 entry。contracts 仍是跨进程协议事实源。

`modules/settings/models.ts` 包含兼容输入的规范化与业务校验，依赖设备配置、产线及路径校验，因此没有被误放进纯 shared。`app/agent-tools.ts` 是复用整个应用能力的宿主适配器，也没有放进会反向依赖 Runtime 的业务底层。

跨目录导入采用 `@backend/*`，协议源码采用 `@contracts/*`，同目录采用 `./`；定义集中在后端 `tsconfig.json`，源码与后端测试共用。别名直接指向具体模块，架构门禁按解析后的目标检查依赖方向。固定 Bun 负责开发、测试和编译解析；复用后端纯函数的浏览器测试在测试专用 Vite 入口配置同名别名，避免与前端 `@/` 混淆。具体示例见 backend README 的导入约定。

## 独立的自动化能力模块

`services/automation` 与 backend 同级，随现有 Bun 进程运行，依赖方向为 `backend → automation → contracts`。backend 只通过 `@maaverge/automation` 包根调用，注入有限执行与资源端口；automation 不持有 Runtime、Store、控制令牌或可变 worker map，不自行取得设备控制权或启动原生进程。

通用 TS 按职责分为 `src/core` 执行契约和错误、`src/primitives` L1 最小原语与几何、`src/composites` L2 视觉组合和等待、`src/pipeline` 登记及 Custom 绑定、`src/resources` 来源／规则和已审阅 MaaCore 字段辅助、`src/registry` 组件与调用目录。通用 JSON 独立放在 `pipeline/{primitives,composites}/`。`src/composites/vision.ts` 是 Vision 唯一实现，JSON handler 和 L2 provider 共用，显式接收参考尺寸和 profile；旧 `src/primitives/vision.ts` 只保留兼容导出。

`arknights` 与 `src` 同级，根下只有 `pipeline` 和 `custom`，二者分别按 `infrast`、`startup`、`fight`、`recruit`、`mall`、`award`、`inventory` 建一层功能目录。JSON 平放在功能目录内；TS 按资源、观察、事件与复杂业务策略拆文件，基建另有 `roster.ts` 名单算法和 `room.ts` 房间事件。通用实现不加游戏前缀、不导入游戏；各功能不导入另一功能内部实现。只有 `src/registry.ts` 及公共出口组装组件，架构门禁检查边界和循环。

`primitiveLevel` 表达 L1 最小原语、L2 通用组合、L3 游戏事件的依赖，原语仅向下调用。完整业务流程没有原语级别，只组合 L3；旧 `operation / observation / game / workflow` 目录分类和能力 ID 保留。能力同时登记副作用、JSON 入口、调用依赖与资源前提；目录拒绝缺失及逆向依赖，执行时核对已声明调用，并用 contracts 生成校验器验证输入和结果。页面导航属于输入，确认提交属于 `commit`，业务 `verified` 必须来自后置证据。

`createCapabilityRegistry(registrations, { port })` 不接收游戏 profile；provider 明确接收自己的 profile。根入口用 `registerAutomationComponents<AutomationOptions>()` 声明 `automation`，自动遍历所有已登记 provider，兼容 `createAtomicCapabilityRegistry(port, options)`。功能 `index.ts` 导出 Pipeline 和 provider，`definitions.ts` 是本功能 JSON 登记点；`automation.components.infrast.pipeline` 等保留节点精确类型。资源加载入口共享同一批不可变资源读取，各功能 `resources.ts` 显式登记允许的节点，通用 MaaCore adapter 不执行任意任务图。

包内短路径统一来自 `package.json` 的 `imports`：`#automation/*` 指向通用 TS，`#common-pipeline/*` 指向通用 JSON，`#components/*` 指向功能出口，`#custom/*` 和 `#pipeline/*` 指向游戏实现及 JSON。通配符覆盖实际新增文件，不生成模块，也不复制 tsconfig 映射。backend 虽能看到公共子路径 exports，架构门禁仍只允许包根导入。

JSON 节点用「大类@操作」命名逻辑层级。`registerPipeline(sources)` 静态合并功能内文件，拒绝重名和断链，保留类型化定义，每次提交独立可达副本；JSON 随 Bun 编译嵌入，不在运行时扫描目录。`src/pipeline/runtime.ts` 适配页面链与具名 Custom；`invocation.ts` 绑定当前项的 `execute`、显式下层 `call` 及能力结果 `return`，`bindings.ts` 提供独立输入／步骤作用域和本地 JSON Pointer，不解释节点流转。失败停止后续节点并保留已取得的 `pipelineSteps`。

基建普通房间 JSON 连接读取、准备名单、确认、复读四个 L3 事件；训练角色逐个执行准备、确认与复读链，TS 保留锁定、保留角色、跨房间冲突与最终核验。六类日常功能同样按目录维护独立 L3 与流程；其有限行为、资源前提与尚未真机验收的限制见 [automation README](../services/automation/README.md#当前游戏功能边界)。

native 注册 `MaaVerge.Custom`，通过现有 NDJSON 回调当前 Bun 服务，不新增官方 AgentClient／AgentServer。根图由 `MaaTaskerPostTask` 执行；当前 Custom 内的已登记子图通过 `runContextPipeline`／`MaaContextRunTask` 同步执行并恢复父 Context。禁止回调内再次向根 Tasker 排队或并行提交根图。基础操作使用 Context direct API，宿主核对节点／参数、帧、坐标与授权。子图继承根期限，停止和退出结束上下文；未知输入不重放。产品没有 TS Pipeline 解释器、自动 fallback 或界面／模型的任意图入口。

Debug 的 RPC、请求去重和结果转换位于 `backend/src/modules/debug/debug-service.ts`。`modules/framework/sessions.ts` 负责引擎交接与控制会话，`infrastructure/native/framework-worker.ts` 适配原生进程；帧有效期、设备独占、取消、退出和更新门禁由 backend 协调。SDK 定位和不可变资源视图仍由 backend 管理，资源读取保留普通文件、链接拒绝、大小与版本校验。

扩展时，通用原语放 `src/primitives`，通用组合放 `src/composites`，游戏事件和流程放自己的功能目录；维护权威契约、功能 JSON 登记及 provider，再由 `src/registry.ts` 登记完整组件。只有应用生命周期或跨业务协调进入 backend。详细职责、绑定和维护步骤见 [automation README](../services/automation/README.md)。

## 必须保持的生命周期

- 单个 Runtime 创建单个 Store；打开业务数据前先获得专用 SQLite 数据根租约。保留锁文件、rowid、持久请求去重，以及 serialize/fsync/完整性校验/rename 的备份流程。
- `--update-job` 分支先于 Runtime 构造执行；开发使用同目录任务入口，编译服务使用自身重入，不因目录迁移打开业务数据库。
- 开发与产品都使用真实 TypeScript 服务及 C++ worker；合成适配器只在测试中注入，不增加产品 fallback。
- 后台更新、连接、执行与清理的挂载和取消顺序不随 RPC 提取改变；更新只在空闲边界激活不可变 generation。
- stdio stdout 仅写 JSON-RPC NDJSON，诊断走 stderr。数字 token 元数据是协议、策略与存储共同依赖的语义，因此归 shared，而非让存储反向依赖传输。

## 扩展与测试

新业务先放在对应 module，以具体参数与结果暴露能力。跨领域的执行、关闭和更新协调放 app，涉及系统或文件的适配放 infrastructure；不要把整个 Runtime、Store 或可变状态 map 作为通用上下文下传。

新增 IPC 时修改权威 schema 并重新生成，再添加 RPC 分派和能力实现。自动化能力、资源适配及基建流程的独立行为测试位于 `services/automation/tests`；Debug、控制会话及应用运行时集成测试位于 `services/backend/tests`。测试导入实际模块，不保留仅为旧测试路径服务的 re-export。合成测试保持数据根、端口和原生夹具隔离。

检查、运行时测试和打包探针的命令见 backend README。目录门禁负责依赖约束，类型检查、完整行为回归与编译服务探针负责验证路径迁移和生命周期；不能以移动文件或通过类型检查替代实际运行。

## 后续范围

Runtime 仍持有较大的设备连接状态机与执行监督。后续应按连接租约、执行会话、更新准入等业务边界继续提取，并保留取消、重连和幂等行为。UpdateService 的准备、校验、激活流程仍较集中；先保持其存储端口和无业务数据库的子进程边界，再分拆内部职责。

模型解析仍保留历史兼容规范化；全量 settings 写入协调、更多严格内部类型以及模块间存储端口可以独立推进。最初的目录整理不改变业务协议；后续 Pipeline／Custom 原生协议扩展以 `worker.schema.json` 和生成类型为准，继续使用 `protocolVersion: 1`。数据库格式、应用版本和更新来源不因流程迁移改变。验证结果与平台限制记录在 [STATUS](STATUS.md)。
