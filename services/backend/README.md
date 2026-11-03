# Maa Verge 本地应用服务

本目录是固定 Bun 上的 TypeScript 应用服务，负责计划、持久化、业务策略、执行监督、Agent 提案和三条更新通道。它通过 stdio JSON-RPC 连接 Tauri，通过独立 C++ worker 使用 MaaFramework。本文面向开发者；开源项目参考、重构依据和后续范围见[后端架构](../../docs/backend-architecture.md)，进程及迁移规则见[运行时迁移](../../docs/runtime-migration.md)。

原语、明日方舟观察／流程和资源语义适配由同级 [automation 模块](../automation/README.md)提供，通过 `@maaverge/automation` 公共入口在当前 Bun 进程内使用。backend 注入执行与资源读取端口，统一管理设备控制权、帧令牌、原生进程、取消及更新准入。

## 目录与用途

```text
services/backend/
  src/
    entry.ts                    稳定的产品入口、进程启动和关闭
    app/
      runtime.ts                依赖组装、跨域协调、设备及执行生命周期
      rpc-dispatch.ts           RPC 参数校验与固定方法分派
      agent-tools.ts            将应用能力适配为 Agent 的具名宿主端口
    transport/
      json-rpc.ts               请求 envelope、响应/错误、请求诊断
    modules/
      settings/models.ts        输入规范化、默认值、业务配置校验
      devices/                  设备配置、截图设置、预览令牌与点击准入
      plans/                    任务策略、消耗限制、自定义排班文件只读快照
      execution/                执行证据、掉落与基建反馈、截图产物
      debug/                    原语调试会话、请求去重与 RPC 结果适配
      framework/                MaaFramework 控制会话、SDK 定位与资源视图准备
      copilot/                  本地库、不可变版本、社区查询、工作区
      tools/                    独立工具配置与执行入口
      schedules/                定时规则、临时覆盖、触发协调
      home/                     主页信息、产线估算、活动日历
      resources/                材料、干员和关卡资源查询
      recognition/              识别结果、账号数据同步步骤
      knowledge/                产品/资源知识、账号快照、索引构建
      agent/                    本地提案规范化及策略适配
      updates/                  应用/Framework/资源更新、来源、更新子任务
    infrastructure/
      config.ts                 数据根、组件路径、共享租约路径、子进程环境
      storage/                  SQLite 租约、备份、业务对象和事件持久化
      logging/                  诊断、保留、导出与清理
      network/                  HTTP 下载、代理、续传和流量进度
      filesystem/               归档校验、快照完整性、generation 保留
      native/                   C++ worker 通道、ADB、模拟器进程与连接观察
    shared/                     公共错误、版本比较、Unicode casefold、数字 token
  tests/                        隔离数据与合成适配器的行为测试
  tools/generate-casefold.mjs    Unicode 表生成入口
  tsconfig.json                 服务与测试的 TypeScript 检查
```

同一业务的实现和辅助函数共置。小模块无需再分 controller/service/repository 三层，也不通过导出全部内部实现的 `index.ts` 访问。公共协议使用 contracts 的权威类型与生成校验器。

## 导入约定

源码和后端测试共用本目录 `tsconfig.json` 中的路径别名：

| 写法                                       | 指向                       | 用途                               |
| ------------------------------------------ | -------------------------- | ---------------------------------- |
| `@backend/*`                               | `services/backend/src/*`   | 跨目录引用后端模块                 |
| `@contracts/*`                             | `packages/contracts/src/*` | 协议类型、生成校验器及共享协议规则 |
| `./文件名`                                 | 当前目录                   | 共置实现、辅助函数及 JSON          |
| `@maaverge/agent`、`@maaverge/agent/tools` | 工作区包公开入口           | Agent 能力与宿主类型               |
| `@maaverge/automation`                     | 工作区包公开入口           | 原语注册表、游戏流程及资源适配     |

例如：

```ts
import type { Store } from '@backend/infrastructure/storage/storage';
import type { RpcContract } from '@contracts/rpc-types';
import { validateRecognitionResult } from '@contracts/validators.js';
```

固定 Bun 在开发运行、测试和编译时读取这些别名，无需运行时重写器。别名只缩短路径，仍直接指向具体模块；不改变依赖方向。根 `package.json` 等构建元数据、仓库公共测试夹具和文件系统路径保留显式相对路径，不配置指向整个仓库的万能别名。

前端的 `@/` 继续属于桌面源码。UI 测试会复用少量后端纯函数，因此 `tools/serve-test-ui.mjs` 单独配置 `@backend` 和 `@contracts`；正式桌面 Vite 配置不依赖后端。

## 依赖边界

`entry` 组合应用与协议，`app` 组合业务和基础设施。`modules` 可以显式复用其他业务模块以及基础设施，不能反向导入 app、transport 或 entry。`infrastructure` 只依赖同层、shared 和 contracts；`shared` 只依赖自身和 contracts。基础层可读取仓库根 `package.json` 的构建元数据。

协议适配层只使用小结构接口，不导入 Runtime。`Runtime.handle` 保留退出、随附组件准备和应用更新的统一准入门禁，再调用 `rpc-dispatch`。分派器通过按能力分组的接口调用业务；保存设置、删除设备、准备应用更新等涉及私有状态的操作由 Runtime 的具体用例封装，不把 Store、worker map 或整个 Runtime 下传。

`models.ts` 包含兼容规范化与业务校验，因此属于 settings 业务模块；contracts schema 仍是权威协议。`agent-tools.ts` 需要复用应用级能力，因此属于 app 适配器。不要为了消除路径上的跨层引用，将业务实现转存到 shared。

automation 不导入 backend。`app/runtime.ts` 通过 `AtomicExecutionPort` 注入正式帧与输入路径，资源适配通过窄接口读取已选定资源。`modules/debug` 持有自己的调试会话；`modules/framework/sessions.ts` 协调每设备常驻 Framework Controller 与互斥业务会话，`infrastructure/native/framework-worker.ts` 负责进程适配。不要把这些宿主生命周期搬入原语库，或让原语库绕过后端直接调用原生进程。

`tools/check-backend-architecture.mjs` 检查目录归属和导入方向，并接入 `check:app`。类型导入、动态导入和再导出也受约束；测试可以直接导入实际模块，不为旧测试路径建立兼容 re-export。

## 运行时与数据

开发入口固定为 `src/entry.ts`，发行时由 Bun 编译为自包含应用服务。用户不需要安装 Node、Bun 或 Python。开发和产品都使用 TypeScript 服务与 C++ worker，不提供替代后端或自动 fallback。

每个服务实例在打开业务数据前，先获得同一数据根下专用 SQLite 的独占租约。`Store` 保留锁文件、隐式 rowid 和 `run.start` 的持久 requestId 去重；备份采用 serialize、fsync、完整性校验和 rename。不要为每个 module 创建自己的业务数据库，也不要删除租约文件来解除占用。

默认配置和业务数据位于程序目录的 `config`；开发时为 checkout 的 `config`。设备租约位于标准用户数据目录，跨 checkout 和数据根共享。目录可配置，不能硬编码开发者路径。`config.ts`、`native-path.ts`、知识构建器包含源码位置相关的开发默认路径，移动文件时必须同时检查默认值和编译后行为。

TypeScript 负责计划、策略、持久化与执行监督；C++ 负责 MaaFramework 加载、设备租约及 Tasker／Context 调用，不写业务数据库。设备只允许一个常驻 Controller；任务表、工具、手动和 Debug 会话互斥。停止会取消当前 Tasker，并非暂停；只有业务复核通过才可成功，提交后未知保留证据与额度，不自动重放。

旧任务通过 automation 包根的兼容编译层生成已登记流程，`execution.preflight` 对整表返回任务位置、参数路径和原因；未迁移选项允许保存，执行前拒绝。正式启动重新检查当前完整快照。定时强制执行在倒计时、停止现有任务和准备设备之前检查。持久 requestId 查重先于新兼容性检查，升级后的旧请求重试仍返回原结果。

自定义基建文件在准入时只读、限额、防链接地读取并保存文档及原字节 SHA-256；执行使用该快照。药石与信用购物先事务预留明确额度再提交，未知结果不退回额度。新执行标记引擎、Framework 与资源版本；历史 `coreVersion`、作业 `minimumCoreVersion` 保留原义，不能与 Framework 比较。详见[兼容矩阵](../../docs/maa-compatibility.md)。

## 通信、更新与关闭

Tauri 与服务使用 JSON-RPC 2.0 的逐行 NDJSON。`entry.ts` 管理字节 framing、并发槽、后台定时任务和关闭；`transport/json-rpc.ts` 管理 envelope 校验、通知、响应及错误诊断。stdout 只写协议，诊断写 stderr。原始数字 token 元数据由 shared 保留，供协议、策略和持久化共用。

`entry.ts --update-job` 在创建 Runtime 之前进入更新任务。更新子进程只处理不可变候选文件及原生校验，不打开业务数据库。开发任务入口与 `updates.ts` 共置；编译后服务重新执行自身。不要让更新子任务依赖业务 Store。

应用、MaaFramework 和资源保持独立通道。更新先准备和校验 generation，再于空闲边界激活，并保留回滚；不能替换活动 worker 正在使用的文件。关闭时停止接收工作并取消待处理操作，先启动 worker 有界关闭，再等待在途请求，最后关闭 Store。目录重构不改变这些顺序。

## 扩展方法

1. 先确定所属 module，将业务实现、类型和辅助函数放在同一领域。可复用原语、游戏观察／流程及资源语义规则放在 `services/automation`；系统适配放 infrastructure，跨领域生命周期协调放 app。
2. 新 IPC 先修改 `packages/contracts/schemas`，从仓库根执行 `pnpm contracts:generate`，再补分派和业务实现；不手改生成类型或校验器。
3. 给分派器注入具体能力或最小接口，保持用例内部的原子检查、请求去重、取消和事务顺序，不暴露任意 shell 或整个运行时上下文。
4. 用合成设备、来源、时钟和 worker 测试真实业务行为；测试数据与端口隔离，默认消耗预算为零。

## 开发与验证

从仓库根执行。固定工具链和环境恢复见[开发指南](../../docs/development.md)。Windows 无全局 pnpm 时，用 `powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1` 替代下方 `pnpm`；不要依赖全局 Bun。

```powershell
pnpm setup:bun
pnpm --filter @maaverge/backend check
pnpm --filter @maaverge/automation check
pnpm run check:app
pnpm test:runtime
pnpm test:packaging
```

`check:app` 检查契约同步、工作区类型、前后端及 automation 结构以及工具测试。`test:runtime` 使用固定 Bun 运行 Agent、automation 和后端行为测试，存在已构建的合成 C++ worker/Framework时同时启用原生夹具及编译更新任务。需要补建夹具时先执行 `node tools/build-core-worker.mjs`。`test:packaging` 验证当前宿主的 Bun 编译、SQLite、归档与子进程能力。

单独检查结构可执行 `node tools/check-backend-architecture.mjs`。定向运行测试时，通过 `tools/setup-bun.mjs` 的固定运行时入口或 checkout `.tools/bun` 执行 `bun test services/backend/tests/<file>.test.ts`，使用与完整测试一致的隔离环境。

产品知识生成入口为 `pnpm knowledge:generate`，输出 `src/modules/knowledge/product-knowledge.generated.json`；资源知识构建使用 `pnpm knowledge:build`。Unicode 表由本目录 `tools/generate-casefold.mjs` 生成至 `src/shared/casefold-data.json`。生成文件由源重新生成，不手改或重新格式化。

`pnpm dev` 会启动真实原生服务。例行检查不连接真实游戏、不调用付费模型、不下载真实 SDK 或模型或发布更新；Windows 的合成验证不代表 macOS/Linux、原生 WebView 或真实设备验收。具体结果和限制见 [STATUS](../../docs/STATUS.md)。

## 后续范围

Runtime 的连接状态机与执行监督仍较大，UpdateService 的准备、校验和激活也需继续按职责拆分。跨功能 settings 写入协调、历史规范化和更多严格内部类型可以独立推进；这轮没有更改协议、数据格式或游戏执行语义。继续重构时应先写清资源所有权和生命周期，再移动状态，避免只增加委托层。
