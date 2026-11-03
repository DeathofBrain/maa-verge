# Maa Verge 自动化能力

`@maaverge/automation` 是与 backend 同级的内部 TypeScript workspace 模块，提供通用原语、JSON Pipeline、明日方舟事件与业务流程。代码随现有 Bun 应用服务进程运行；backend 通过包根公共接口注入执行与资源端口，继续管理设备、会话和原生进程。

## 目录与职责

```text
services/automation/
  src/                         通用 TypeScript，不依赖游戏
    core/                      执行端口、上下文、结果与错误
    primitives/                L1 最小设备／识别原语、坐标几何
    composites/                L2 视觉组合、等待与已审阅事件辅助
    pipeline/                  JSON 登记、参数绑定、Custom 适配
    resources/                 资源端口、通用规则、已审阅 MaaCore 字段解析
    registry/                  组件登记、目录、契约校验与向下分派
    registry.ts                全局唯一组件组装入口
    index.ts                   workspace 公共出口
  pipeline/                    通用 JSON，与游戏流程分开
    primitives/operations.json L1 的 JSON 入口
    composites/vision.json     L2 的 JSON 入口
  arknights/                   与 src 同级，根下只有两个目录
    pipeline/
      infrast/                 base、operators、room 等 JSON 平放
      startup/                 primitives.json、workflows.json
      fight/
      recruit/
      mall/
      award/
      inventory/
    custom/
      infrast/                 观察、页面驱动、名单算法、房间原语和业务策略
      startup/                 capabilities、definitions、resources、index
      fight/
      recruit/
      mall/
      award/
      inventory/
  tests/                       注入端口与资源的合成行为测试
```

游戏功能由 `<feature>` 文件夹表达，不在通用文件前添加 `infrast-` 等游戏前缀。功能内按职责拆文件，不为每个节点或原语再建子目录。复杂功能可增加 `observations.ts`、`driver.ts`、`roster.ts`、`workflows.ts` 等文件；简单功能只保留实际需要的模块。

依赖方向为 `backend → automation → contracts`。通用 `src` 不导入游戏；只有 `src/registry.ts` 和公共出口组合功能。游戏功能可复用通用模块，不导入其他功能的内部实现、backend、UI 或 native。架构门禁检查这些依赖方向及循环。`src/resources/maacore-adapter.ts` 只提供已审阅字段解析、模板定位与来源记录，各功能的 `resources.ts` 明确登记自己的节点和规则；它不解释任意 MaaCore 任务图。

`AtomicExecutionPort` 是宿主提供的有限执行端口，不接收 Runtime、Store 或可变 worker map。automation 不持有控制令牌，不取得设备控制权，不启动进程。Debug 会话、请求去重、控制权交接、SDK 定位、资源视图及更新门禁继续由 backend 管理。

## 三层原语与业务流程

| 实现层      | 职责                                   | 例子                                                                                   | 可调用的层 |
| ----------- | -------------------------------------- | -------------------------------------------------------------------------------------- | ---------- |
| L1 最小原语 | 帧、识别与单次设备输入，不理解游戏     | `operation.frame/click/swipe/press_key/long_press/drag/recognize`、`observation.frame` | 执行端口   |
| L2 通用组合 | 规则匹配、参考坐标点击、断言与有界等待 | `composite.match/click_rule/click_first/assert_hit/wait_until`                         | L1         |
| L3 游戏事件 | 明确页面和业务边界的单个事件           | `game.infrast.select_operator/prepare_roster/confirm/verify_room`、`game.fight.start`  | L1、L2     |
| 业务流程    | 组合事件、批次策略、冲突检查与最终复核 | 换班、登录、当前关卡战斗、收取奖励                                                     | L3         |

`primitiveLevel: 1 | 2 | 3` 表达实现依赖；完整业务流程没有 `primitiveLevel`。目录原有 `layer: operation | observation | game | workflow` 是检索分类，保留旧能力 ID 和分类，不代表另一套依赖层级。例如 `game.infrast.set_room` 保留旧 ID，但实际是组合 L3 的换班流程。

每项登记自己的输入／结果 Schema、`effect`、`pipelineEntry`、调用依赖及所需资源。`effect` 区分 `observe`、会改变页面的 `input` 和提交业务动作的 `commit`：`read_room`、`verify_room` 会导航，因此属于 `input`，不能因名字含「读取」就当成纯观察。只有明确的后置证据才能令 `verified: true`；`nativeSuccess` 仅说明原生输入获得确认。

目录在构造时检查重复 ID、缺失依赖和逆向调用；执行时校验输入、输出及已声明依赖，并限制调用深度。通用 `Vision` 的唯一实现位于 `src/composites/vision.ts`，L2 provider 与 JSON handler 共用它；`src/primitives/vision.ts` 只保留兼容导出。参考尺寸与规则 profile 由调用方显式提供，通用实现没有游戏默认值。游戏观察可以扩展它解析卡片等领域事实。

### 帧引用与输入代际

`composite.match`、`composite.texts`、`composite.click_box`、`composite.swipe` 的 `frame` 接受 `"current"` 或宿主签发帧的轻量引用 `{ frameId, width, height }`，并兼容完整帧。`"current"` 在当前 JSON 根调用的 Custom 内截图；已有引用只指向原帧，失效时拒绝，不自动换图、续期或重放。`match`、`texts` 省略 `frame` 时也取当前帧；输入类显式选择 `"current"` 可避免沿用上一次 Debug 请求的帧：

```ts
await registry.execute('composite.match', {
  profile: 'startup',
  rule: 'home',
  frame: 'current',
});
```

需要同帧识别再输入时，在同一个已登记根图内调用 `operation.frame`，将返回的 `frameId`、`width`、`height` 传给后续 L2。可在 JSON 的 `input.frame` 中分别使用 `#/steps/capture/data/frameId` 等本地引用；各调用仍须声明下层依赖。参考区域按 profile 的画布定义，宿主继续校验真实帧、比例、租约、动作最长 2 秒／只读最长 120 秒的年龄上限和取消状态。新截图会清理已签发超过 2 秒的旧缓存，每台设备最多保留 32 张最近帧，因此实际可用时间可能更短。

根图开始、结束与实际输入尝试会使旧帧失效；纯 Custom、Context 子调用和连续只读可传递同帧证据。因此分开的两次 Debug 执行不能用上一根图的帧继续输入。Debug 会把嵌套结果与步骤中的 PNG 摘要为轻量帧数据，仅在顶层保留一张最新完整预览，正常与异常出口相同；预览不授予下一根调用的动作权限。

宿主可通过 `AtomicExecutionPort.getInputRevision()` 提供只读、非负安全整数的输入修订号。实际设备输入尝试必须单调推进它，包括 L1、其他游戏功能和原生标准节点；截图、识别、纯 Context 调用与根边界清帧不推进。该修订号用于失效待提交凭据，与短期帧令牌分别管理；不能让公共参数自行指定修订号。

## 组件登记与导入

功能自己的 `definitions.ts` 静态导入 JSON，并调用 `registerPipeline(sources)`；`index.ts` 导出 Pipeline、provider 和必要公共类型。唯一的 `src/registry.ts` 用 `registerAutomationComponents<AutomationOptions>()` 登记完整功能：

```ts
export const automation = registerAutomationComponents<AutomationOptions>()({
  primitives: { capabilities: createPrimitiveCapabilities },
  composites: {
    capabilities: (port, options) =>
      createCompositeCapabilities(port, options.compositeProfiles ?? {}),
  },
  infrast: {
    pipeline: infrastPipeline,
    capabilities: (port, { profile }) => createInfrastCapabilities(port, profile),
  },
});
```

上例省略应用组合时的默认 profile 和其他功能。`src/registry/components.ts` 不认识游戏；创建目录时自动遍历已登记 provider，使用 `createCapabilityRegistry(registrations, { port })` 连接 JSON 执行端口。`automation.components.infrast.pipeline` 保留精确节点类型，`automation.createRegistry(port, options)` 构造目录；宿主的 `createAtomicCapabilityRegistry` 委托此入口。创建和查看目录均不操作设备。

`@maaverge/automation` 是 workspace 包名；包内短路径统一定义在 `package.json` 的 `imports`，无需再复制 tsconfig 路径映射：

| 包内别名             | 静态目标                      | 例子                                     |
| -------------------- | ----------------------------- | ---------------------------------------- |
| `#automation/*`      | `src/*.ts`                    | `#automation/pipeline/definitions`       |
| `#common-pipeline/*` | `pipeline/*.json`             | `#common-pipeline/primitives/operations` |
| `#components/*`      | `arknights/custom/*/index.ts` | `#components/infrast`                    |
| `#custom/*`          | `arknights/custom/*.ts`       | `#custom/infrast/observations`           |
| `#pipeline/*`        | `arknights/pipeline/*.json`   | `#pipeline/infrast/room`                 |

通配符只解析实际存在的静态文件；登记组件不会生成模块。功能内部使用相对路径，避免导入自己的出口形成循环。包虽然提供公共子路径 exports，backend 门禁仍只允许从 `@maaverge/automation` 包根调用。

## JSON 流程与 TS 复杂逻辑

JSON 按功能平放，节点 key 使用「大类@操作」标注逻辑层级，例如 `Infrast@Base`、`Infrast@ApplyRoom@Prepare`。不同文件可共享已登记节点；文件名不生成命名空间。`registerPipeline` 拒绝重名、无效边和断链，保留节点名类型；登记基准、`definitions` 与每次 `subgraph(entry)` 的返回值相互隔离，调用方不能污染下一次执行。

JSON 随 Bun 编译嵌入，不在运行时扫描目录。L1、L2、L3 都有已登记 JSON 入口；L1 直接调用保留兼容路径，维护工具可用 `executeJson` 显式验证其 JSON 入口。业务流程通过 JSON 组合 L3；动态算法、训练角色保护、消费预算、批次冲突及最终核验保留 TS。基建重置筛选、翻页、当前页精确选人和清空待选名单均有独立 L3 及 JSON 入口；选人状态已满足时不重复点击，输入后复读不确定时保持未知。

`src/pipeline/invocation.ts` 绑定有限的节点协议，`bindings.ts` 解析本次调用的数据：

| handler／字段        | 用途                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| `execute`            | 执行当前登记项的 TS handler；不能借此调用其他能力                                    |
| `call` + `primitive` | 调用已声明的下层能力，重新校验其契约                                                 |
| `input`              | 显式参数或 `{"$ref":"#/input/..."}`、`{"$ref":"#/steps/name/..."}` 本地 JSON Pointer |
| `saveAs`             | 保存完整能力结果，供后续节点引用；同一图不允许重复别名                               |
| `return` + `value`   | 显式返回完整 `AtomicCapabilityResult`，不会把 Tasker 完成当成业务返回                |

每次调用拥有独立 `input`、`steps` 与返回值作用域；引用只读取自身属性，数据大小和调用深度有界。子调用失败会停止后续节点，并在 `data.pipelineSteps` 保留已经取得的步骤结果。失败、取消或未知动作不会自动重放。

`runtime.ts` 适配页面链与具名 Custom，`handlers.ts` 复用同一套 Vision 动作和断言。C++ worker 用官方 Tasker 执行根图；当前 Custom 内的已登记子图经 `runContextPipeline`／`MaaContextRunTask` 同步执行，子回调使用当前 Context。禁止再次向正在等待回调的根 Tasker 排队或并行提交根图。基础动作使用官方 Context direct API；停止、EOF 和回调返回会使对应上下文失效。根图有独立期限，子图继承父期限；TS 批次中的每个房间或每场战斗独立建立根图期限。

节点流转始终由 MaaFramework 解释，产品没有 TS Pipeline 解释器或自动 fallback。`next` 是按优先级寻找首个识别命中的候选，不是逐项函数调用；需要顺序时将节点逐个连接。`JumpBack` 也不等同于函数返回，业务返回使用上述显式 `return` 绑定。

当前只执行应用维护的静态登记图；没有用户 JSON 导入、任意 Custom、脚本或模型提供节点的公共接口。宿主核对每次回调节点和参数与提交图一致。采用宿主注册的 `MaaVerge.Custom` 与既有 NDJSON 桥接，没有额外官方 AgentServer 进程，也不涉及模型调用。

## 当前游戏功能边界

| 功能目录    | 业务入口                                                                          | 已实现范围与限制                                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infrast`   | `workflow.infrast.daily/custom_shift/overview_shift/room_shift/queue_rotate/trim` | 有限自动换班、官方自定义文档的明确名单和补位、独立整顿；心情阈值、完整房间与名单证据在提交前复核。无人机、线索、信赖等主动扩展按兼容预检阻断，详见[基建原语](../../docs/atomic-infrast.md)                                              |
| `startup`   | `workflow.startup.start/close/login`                                              | 官服/B服受控 App 启停、最多十步已审阅登录与稳定主页；关闭采用独立 controller stop_app 成功回执。账号切换和未知弹窗停止                                                                                                                  |
| `fight`     | `workflow.fight.navigate/legacy_batch/single_battle/current_stage`                | 普通/S 主线 0–17 章、常用资源与芯片关卡导航；明确 ×1–6 倍率、游戏实际场次与目标材料累计，药/石限额先持久预留。开战后分段只读等待最多30分钟；活动、剿灭、自动倍率、临期药、数据上传仍阻断。旧 Debug 当前关卡入口继续保持最多20次的原契约 |
| `recruit`   | `workflow.recruit.daily/collect_one`                                              | 逐槽收取已完成招募、本地五标签组合、至多三次有证据刷新、逐次计时器复核、许可保留线和持久限额；保护标签跳过，不加急、不上传。每个新槽只准备和确认一次，结果未知不重放                                                                    |
| `mall`      | `workflow.mall.collect_credit/visit_friends/shopping`                             | 免费信用、好友逐位访问和按游戏日持久去重；正整数总信用额度下按优先购买、黑名单、折扣及300信用保留/溢出策略逐件购买。商品/价格/余额须复核，购买先持久预留，默认信用预算零；借助战刷信用未迁移                                            |
| `award`     | `workflow.award.daily_weekly/mail`                                                | 日常/周常分别领取并检查获得物资；普通邮件有独立进入、领取与关闭。活动领奖等仍阻断，没有领取按钮不宣称奖励全满                                                                                                                           |
| `inventory` | `workflow.inventory.read_depot/read_operators`                                    | 只导航并返回当前屏原始 OCR；`scope: current_screen`、`complete: false`，不承诺全量扫描或完整档案，因此不能替代旧 Depot/OperBox 完整任务                                                                                                 |

这些功能复用 MaaCore 已审阅资源字段与实际模板 ID，保留适配基线、实际资源版本及来源摘要；缺失或歧义规则明确不可用。各入口、页面分支及平台的实际验收范围由 [STATUS](../../docs/STATUS.md) 和对应报告记录，目录可用或合成通过不能代替完整业务验收。

登录的单步事件最多输入一次。月签到、限时签到、许愿墙和公告类弹窗要求同帧已知标题与官方关闭图标，今日配给使用独立已审阅关闭区域；只关闭，不点击活动领奖或选项。同帧确认主页后，官方 `SignInEventEnter.roi` 内的活动卡片文字不当作弹窗标题；区域外标题或未知关闭图标仍阻止主页就绪。

初始等待及其他输入后的只读窗口最多 20 秒。实机证据显示 `start` 输入后仍可能持续标题／神经反馈载入，因此仅同帧复核并获确认的 `start` 输入，在官方 3 秒 postDelay 后给最多 60 秒只读过渡；始终受父剩余期限截断，不延展 120 秒根期限。若出现未知关闭图标或无有效关闭目标的活动标题，则收回到本窗口起算的 20 秒预算，不在消失后续期。主页须经过三次 1 秒稳定窗口及新帧确认，识别结束跨过截止也不能报告成功；旧标题／按钮未消失不会再次输入。状态变化与超时诊断有条数上限，仅含固定状态、命中布尔和计数、等待时间，不记录截图或 OCR 原文。

登录 JSON 仍执行最多十步；同一根调用已经确认稳定主页后，后续步骤逐步取新帧并核对遮挡，只省去重复的三次稳定等待。缓存绑定登记器签发的根身份与宿主输入修订号；任何非主页、读取失败或输入代际变化都会清除，回到主页后重新稳定。独立根调用、缺失或无效输入修订号均不复用稳定等待，不能用调用方传入的根身份延续证据。

增加弹窗时应在功能 `resources.ts` 登记来源，在 `capabilities.ts` 明确标题、关闭目标与后置状态，不能只凭任意「×」点击。任务领奖同样先排除覆盖层，导航输入未切页时保留未知，不改坐标补点。

基建的 `observation.operators` 只读当前页完整卡片，不等于完整已选名单。实际容量由同次目标房间的 `room_panel` 面板提供；`occupied` 只可在未修改的 `room_entry` 初读中作为收齐目标，不能当作选人后的 `selectedCount`。缺少独立修改后计数时，准备名单在清空前停止。公开 `prepare_roster` 返回的一次性凭据绑定 provider、完整准备对象、资源代及宿主输入修订号；进入新准备或其他基建输入 handler、取消、基建 handler 执行失败均清除旧凭据，进入确认 handler 即消费，其他功能实际输入尝试通过修订号使其过期。外部 Schema／帧门禁拒绝且没有实际输入时，凭据不一定失效。缺少可靠修订号时独立确认不可用，不能从公开 JSON 自造可信凭据。扩展计数或房间适配前先阅读[基建证据边界](../../docs/atomic-infrast.md#明确房间身份与实际容量)。

## 旧任务与数据兼容

包根 `compileLegacyTask` 在唯一组装入口连接各功能的纯编译规则，产生静态登记能力步骤。原任务类型、参数、启用状态、排序、文件、作业库与历史继续保存；关闭的行不授予设备动作。未知或尚未适配的主动参数使整项执行不可用，不删除参数、不默认为另一种动作，也没有 MaaCore 回退。

宿主在建立 controller 前先编译整张任务表，再运行 `validateCompiledLegacyTaskResources` 与 `validateCompiledLegacyTaskInputs`。后者检查目标章节、倍率和材料图标等动态资源；完整表预检避免前面的可用任务已操作设备后才发现后续不兼容。正式执行再次检查同一不可变资源和输入，`executeCompiledLegacyTask` 逐根协调，遇到未知、取消或未验证结果立即停止；最近证据有条数上限。

自定义基建文件由宿主安全读取为原始文档与 SHA-256 快照，连同原 `plan_index`、设施子集和阈值传入，不重写原文件。自动模式仅开放已经实现的设施与无主动扩展配置；旧无人机禁用值 `_NotUse` 兼容保留。

上下文只授予有限的 `reserveConsumable` 与 `claimDailyAction`，数据库仍归 TypeScript 宿主。药、石、信用和招募许可先持久占用再提交；回执未知时保留占用。好友每日一次按设备、客户端与04:00游戏日先占用，失败或未知时也保守占用，不把它表述为已验证领取信用。完整参数边界见[原 MAA 兼容矩阵](../../docs/maa-compatibility.md)。

## 扩展与验证

新增功能按以下顺序维护，避免在全局目录复制节点或处理器清单：

1. 确定 L1、L2、L3 或业务流程的职责、输入、输出、失败语义和副作用。公共输入修改 `packages/contracts/schemas/atomic-inputs.schema.json`，运行 `pnpm contracts:generate`，不手改生成文件。
2. 通用机制放 `src/primitives` 或 `src/composites`，JSON 放通用 `pipeline/`；游戏事件放 `arknights/custom/<feature>/`，JSON 放 `arknights/pipeline/<feature>/`。页面顺序改 JSON，动态算法和领域策略改 TS，资源映射由功能 `resources.ts` 显式登记。
3. 在功能 `definitions.ts` 导入 JSON 并加入 `registerPipeline`。provider 声明元数据、下层依赖、权威校验器与 JSON 入口；完整业务流程只组合 L3，不把整条业务链藏进一个 Custom。
4. 在功能 `index.ts` 导出，再由 `src/registry.ts` 通过 `#components/<feature>` 登记 provider 和 Pipeline；如需新资源 profile，扩展组合参数及资源加载入口。只创建文件不会自动加载。
5. 用合成端口检查行为、契约、失败后证据及取消边界，运行相关架构、类型和运行时检查；显式选择的真实设备验收单独记录。

模块和大块功能应标明职责，函数内部独立阶段的注释解释意图、成立前提、状态变化、副作用或关键取舍。JSON 保持标准格式，不添加伪注释；通过节点名和相邻 TS 注释表达流程意图。

从仓库根执行：

```sh
pnpm --filter @maaverge/automation check
pnpm check:app
pnpm test:runtime
```

`registry.test.ts`、`pipeline-invocation.test.ts` 验证层级、依赖、作用域与契约；`infrast-roster.test.ts` 验证独立名单事件的当前页门禁、单次输入与复读，基建、日常事件和资源测试验证领域策略及适配。仅限测试的 Tasker／Context 图夹具调用产品绑定实现，不成为产品执行路径。backend 合成测试覆盖 Debug、资源文件系统限制和宿主生命周期，native 合成 ABI 覆盖官方任务、嵌套 Context、停止与未知结果。需要临时数据时使用 `tools/test-support/temporary-directory.mjs` 的规范化路径。测试不连接设备、不下载组件、不调用模型，也不添加外观断言。

固定工具链入口见[开发指南](../../docs/development.md)。验证记录、平台及真实设备限制由 [STATUS](../../docs/STATUS.md) 统一维护。
