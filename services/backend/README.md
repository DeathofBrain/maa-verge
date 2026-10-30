# Maa Verge 本地应用服务

本目录是固定 Bun 上的 TypeScript 应用服务，负责计划、持久化、业务策略、执行监督、Agent 提案和三条更新通道。它通过 stdio JSON-RPC 连接 Tauri，通过独立 C++ worker 使用 MaaCore。本文面向开发者；开源项目参考、重构依据和后续范围见[后端架构](../../docs/backend-architecture.md)，进程及迁移规则见[运行时迁移](../../docs/runtime-migration.md)。

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
      plans/                    任务策略、消耗限制、原生任务参数转换
      execution/                执行证据、掉落与基建反馈、截图产物
      copilot/                  本地库、不可变版本、社区查询、工作区
      tools/                    独立工具配置与执行入口
      schedules/                定时规则、临时覆盖、触发协调
      home/                     主页信息、产线估算、活动日历
      resources/                材料、干员和关卡资源查询
      recognition/              识别结果、账号数据同步步骤
      knowledge/                产品/资源知识、账号快照、索引构建
      agent/                    本地提案规范化及策略适配
      updates/                  应用/核心/资源更新、来源、更新子任务
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

同一业务的实现和辅助函数共置。小模块无需再分 controller/service/repository 三层，也不通过导出全部内部实现的 `index.ts` 访问。当前保留显式相对导入；公共协议使用 contracts 的权威类型与生成校验器。

## 依赖边界

`entry` 组合应用与协议，`app` 组合业务和基础设施。`modules` 可以显式复用其他业务模块以及基础设施，不能反向导入 app、transport 或 entry。`infrastructure` 只依赖同层、shared 和 contracts；`shared` 只依赖自身和 contracts。基础层可读取仓库根 `package.json` 的构建元数据。

协议适配层只使用小结构接口，不导入 Runtime。`Runtime.handle` 保留退出、随附组件准备和应用更新的统一准入门禁，再调用 `rpc-dispatch`。分派器通过按能力分组的接口调用业务；保存设置、删除设备、准备应用更新等涉及私有状态的操作由 Runtime 的具体用例封装，不把 Store、worker map 或整个 Runtime 下传。

`models.ts` 包含兼容规范化与业务校验，因此属于 settings 业务模块；contracts schema 仍是权威协议。`agent-tools.ts` 需要复用应用级能力，因此属于 app 适配器。不要为了消除路径上的跨层引用，将业务实现转存到 shared。

`tools/check-backend-architecture.mjs` 检查目录归属和导入方向，并接入 `check:app`。类型导入、动态导入和再导出也受约束；测试可以直接导入实际模块，不为旧测试路径建立兼容 re-export。

## 运行时与数据

开发入口固定为 `src/entry.ts`，发行时由 Bun 编译为自包含应用服务。用户不需要安装 Node、Bun 或 Python。开发和产品都使用 TypeScript 服务与 C++ worker，不提供替代后端或自动 fallback。

每个服务实例在打开业务数据前，先获得同一数据根下专用 SQLite 的独占租约。`Store` 保留锁文件、隐式 rowid 和 `run.start` 的持久 requestId 去重；备份采用 serialize、fsync、完整性校验和 rename。不要为每个 module 创建自己的业务数据库，也不要删除租约文件来解除占用。

默认配置和业务数据位于程序目录的 `config`；开发时为 checkout 的 `config`。设备租约位于标准用户数据目录，跨 checkout 和数据根共享。目录可配置，不能硬编码开发者路径。`config.ts`、`native-path.ts`、知识构建器包含源码位置相关的开发默认路径，移动文件时必须同时检查默认值和编译后行为。

TypeScript 负责计划、策略、持久化与执行监督；C++ 负责 MaaCore 加载、设备租约及原生调用，不写业务数据库。设备只允许一个控制者；AsstStop 清空核心队列，并非暂停。任务完成回调也不能单独证明游戏行为成功。

## 通信、更新与关闭

Tauri 与服务使用 JSON-RPC 2.0 的逐行 NDJSON。`entry.ts` 管理字节 framing、并发槽、后台定时任务和关闭；`transport/json-rpc.ts` 管理 envelope 校验、通知、响应及错误诊断。stdout 只写协议，诊断写 stderr。原始数字 token 元数据由 shared 保留，供协议、策略和持久化共用。

`entry.ts --update-job` 在创建 Runtime 之前进入更新任务。更新子进程只处理不可变候选文件及原生校验，不打开业务数据库。开发任务入口与 `updates.ts` 共置；编译后服务重新执行自身。不要让更新子任务依赖业务 Store。

应用、MaaCore 和资源保持独立通道。更新先准备和校验 generation，再于空闲边界激活，并保留回滚；不能替换活动 worker 正在使用的文件。关闭时停止接收工作并取消待处理操作，先启动 worker 有界关闭，再等待在途请求，最后关闭 Store。目录重构不改变这些顺序。

## 扩展方法

1. 先确定所属 module，将业务实现、类型和辅助函数放在同一领域。系统或文件适配放 infrastructure，跨领域生命周期协调放 app。
2. 新 IPC 先修改 `packages/contracts/schemas`，从仓库根执行 `pnpm contracts:generate`，再补分派和业务实现；不手改生成类型或校验器。
3. 给分派器注入具体能力或最小接口，保持用例内部的原子检查、请求去重、取消和事务顺序，不暴露任意 shell 或整个运行时上下文。
4. 用合成设备、来源、时钟和 worker 测试真实业务行为；测试数据与端口隔离，默认消耗预算为零。

## 开发与验证

从仓库根执行。固定工具链和环境恢复见[开发指南](../../docs/development.md)。Windows 无全局 pnpm 时，用 `powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1` 替代下方 `pnpm`；不要依赖全局 Bun。

```powershell
pnpm setup:bun
pnpm --filter @maaverge/backend check
pnpm run check:app
pnpm test:runtime
pnpm test:packaging
```

`check:app` 检查契约同步、工作区类型、前后端结构以及工具测试。`test:runtime` 使用固定 Bun 运行 Agent 和后端行为测试，存在已构建的合成 C++ worker/核心时同时启用原生夹具及编译更新任务。需要补建夹具时先执行 `node tools/build-core-worker.mjs`。`test:packaging` 验证当前宿主的 Bun 编译、SQLite、归档与子进程能力。

单独检查结构可执行 `node tools/check-backend-architecture.mjs`。定向运行测试时，通过 `tools/setup-bun.mjs` 的固定运行时入口或 checkout `.tools/bun` 执行 `bun test services/backend/tests/<file>.test.ts`，使用与完整测试一致的隔离环境。

产品知识生成入口为 `pnpm knowledge:generate`，输出 `src/modules/knowledge/product-knowledge.generated.json`；资源知识构建使用 `pnpm knowledge:build`。Unicode 表由本目录 `tools/generate-casefold.mjs` 生成至 `src/shared/casefold-data.json`。生成文件由源重新生成，不手改或重新格式化。

`pnpm dev` 会启动真实原生服务。例行检查不连接真实游戏、不调用付费模型、不下载真实核心或发布更新；Windows 的合成验证不代表 macOS/Linux、原生 WebView 或真实设备验收。具体结果和限制见 [STATUS](../../docs/STATUS.md)。

## 后续范围

Runtime 的连接状态机与执行监督仍较大，UpdateService 的准备、校验和激活也需继续按职责拆分。跨功能 settings 写入协调、历史规范化和更多严格内部类型可以独立推进；这轮没有更改协议、数据格式或游戏执行语义。继续重构时应先写清资源所有权和生命周期，再移动状态，避免只增加委托层。
