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

已有的良好边界继续保留：`Store` 负责单个数据根的租约与业务持久化，`UpdateService` 使用存储端口，更新任务不打开业务数据库，C++ worker 持有设备和 MaaCore。没有为了目录整齐创建第二个数据库、通用服务定位器或新的运行框架。

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

## 必须保持的生命周期

- 单个 Runtime 创建单个 Store；打开业务数据前先获得专用 SQLite 数据根租约。保留锁文件、rowid、持久请求去重，以及 serialize/fsync/完整性校验/rename 的备份流程。
- `--update-job` 分支先于 Runtime 构造执行；开发使用同目录任务入口，编译服务使用自身重入，不因目录迁移打开业务数据库。
- 开发与产品都使用真实 TypeScript 服务及 C++ worker；合成适配器只在测试中注入，不增加产品 fallback。
- 后台更新、连接、执行与清理的挂载和取消顺序不随 RPC 提取改变；更新只在空闲边界激活不可变 generation。
- stdio stdout 仅写 JSON-RPC NDJSON，诊断走 stderr。数字 token 元数据是协议、策略与存储共同依赖的语义，因此归 shared，而非让存储反向依赖传输。

## 扩展与测试

新业务先放在对应 module，以具体参数与结果暴露能力。跨领域的执行、关闭和更新协调放 app，涉及系统或文件的适配放 infrastructure；不要把整个 Runtime、Store 或可变状态 map 作为通用上下文下传。

新增 IPC 时修改权威 schema 并重新生成，再添加 RPC 分派和能力实现。行为测试继续位于 `services/backend/tests`，测试导入实际模块；不保留仅为旧测试路径服务的 re-export。合成测试保持数据根、端口和原生夹具隔离。

检查、运行时测试和打包探针的命令见 backend README。目录门禁负责依赖约束，类型检查、完整行为回归与编译服务探针负责验证路径迁移和生命周期；不能以移动文件或通过类型检查替代实际运行。

## 后续范围

Runtime 仍持有较大的设备连接状态机与执行监督。后续应按连接租约、执行会话、更新准入等业务边界继续提取，并保留取消、重连和幂等行为。UpdateService 的准备、校验、激活流程仍较集中；先保持其存储端口和无业务数据库的子进程边界，再分拆内部职责。

模型解析仍保留历史兼容规范化；全量 settings 写入协调、更多严格内部类型以及模块间存储端口可以独立推进。本轮不修改 schema、数据库格式、版本号、更新来源或真实游戏行为。验证结果与平台限制记录在 [STATUS](STATUS.md)。
