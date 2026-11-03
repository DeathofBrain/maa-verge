# 基建语义原语与上游资源适配

基建采用 MaaFramework 的 JSON Pipeline + Custom 扩展方式：页面导航、筛选和确认链维护在 `services/automation/arknights/pipeline/infrast/*.json`，TypeScript 逻辑位于 `services/automation/arknights/custom/infrast/`。backend 在同一 Bun 服务进程中调用能力模块，通过注入端口交给独立 MaaFramework worker 执行。正式计划与 Debug 共用该执行路径，本分支不加载 MaaCore。适配器只读取官方 MAA 资源中已审阅字段，不调用 `ProcessTask`、编译任意上游任务图或执行训练状态分析中隐含的领奖动作。

本期提供可审阅的适配与调试入口，**尚未完成真实设备上的基建闭环验证**。合成测试验证的是业务边界、失败语义和识别协议；不能据此声明某个设施已在真实游戏中可用。缺少规则、页面身份或名单证据时返回 `unavailable`、`failed` 或 `unknown`。

## 能力分层

原语实现采用三层依赖，业务流程位于 L3 之上。`primitiveLevel` 表达调用方向；目录保留的 `operation / observation / game / workflow` 是检索分类，不是实现层级，也不改变旧能力 ID。

| 实现层      | 基建使用方式                                                      | 边界                                                             |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| L1 最小原语 | `operation.frame/click/swipe/press_key/long_press/drag/recognize` | 单次设备输入与画面识别，不理解设施或干员；原生接受不等于业务成功 |
| L2 通用组合 | `composite.match/click_rule/action/assert_hit/wait_until`         | 使用明确 profile 组合 L1，通用实现不依赖基建                     |
| L3 游戏事件 | 基建观察、入房、名单准备、确认、复读、队列和整顿事件              | 解释页面与领域证据，可调用 L1、L2，不编排完整换班                |
| 业务流程    | 明确名单、官方自定义排班、常规自动换班、队列轮换与整顿            | 仅组合 L3，维护名单意图、冲突、训练保护和批次最终核验            |

每项能力声明 `effect`、JSON 入口、下层依赖与所需资源。纯观察为 `observe`，导航和名单准备为 `input`，确认、轮换与整顿提交为 `commit`。`read_room`、`verify_room` 会重新导航，因此属于 `input`。目录拒绝缺失依赖及逆向调用，并验证输入与结果契约；权威输入 Schema 位于 `packages/contracts/schemas/atomic-inputs.schema.json`，生成校验器不能由领域模块临时替代。

`arknights/custom/infrast/` 内按职责拆分：`types.ts` 定义领域数据，`observations.ts` 解析卡片／设施／训练证据，`driver.ts` 负责页面驱动，`roster.ts` 维护完整名单扫描与精确选人，`room.ts` 提供独立房间事件，`workflows.ts` 负责业务与批次策略。`plan.ts` 解析官方排班数据，`strategy.ts` 选择保守的自动候选，`pixels.ts` 实现已审阅的心情和技能像素算法。`validation.ts` 检查意图和约束，`resources.ts` 登记上游字段，`capabilities.ts` 提供描述与适配。`definitions.ts` 是 JSON 登记点，`pipeline.ts` 绑定领域资源，`index.ts` 统一导出。通用 PNG 解码位于 `src/primitives/image.ts`，其他通用机制也位于 `src`，不导入游戏模块；全局组件只在 `src/registry.ts` 组装。

### 页面流程与业务策略

JSON 平放在 `arknights/pipeline/infrast/`：`base.json`、`overview.json`、`trim.json`、`operators.json`、`training.json` 维护页面节点，`capabilities.json` 提供能力执行／返回包装，`room.json` 组合普通房间与训练角色流程。逻辑层级写在节点 key 中，以 `Infrast@` 为前缀、`@` 分隔，不再为节点层级建立子目录。

功能 `definitions.ts` 通过 `#pipeline/infrast/...` 静态导入并调用 `registerPipeline`，生成保留节点名类型的 `infrastPipeline`，拒绝重名和断链；定义随 Bun 编译嵌入。`subgraph(entry)` 每次返回独立可达副本。功能 `pipeline.ts` 绑定领域规则与小型 Custom，通用运行器只提交、绑定参数和核对回调；节点流转由官方 Tasker／Context 解释，产品不提供 TS Pipeline 解释器。

| JSON 入口                                                   | 用途                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `Infrast@Base`                                              | 五次识别候选、最多四次返回，确认基建主页                             |
| `Infrast@OpenOverview` / `OpenTrim`                         | 打开总览／整顿并读取或核对新页面                                     |
| `Infrast@Room@Roster` / `Processing@Roster`                 | 普通设施与加工站分别进入名单                                         |
| `Infrast@Filter` / `Clear`                                  | 选择全部筛选并核对菜单关闭，或清空名单                               |
| `Infrast@Confirm` / `Confirm@Trainee` / `Confirm@Assistant` | 普通设施与训练双角色的独立确认链                                     |
| `Infrast@ApplyRoom`                                         | `read_room → prepare_roster → confirm → verify_room → return`        |
| `Infrast@ApplyAutoRoom`                                     | `read_room → prepare_auto_roster → confirm → verify_room → return`   |
| `Infrast@ApplyRole`                                         | 对单个训练角色执行 `prepare_roster → confirm → verify_room → return` |

表中省略重复前缀的入口均以 `Infrast@` 开头。主页候选使用标准 `TemplateMatch` 和 `ClickKey`；页面链继续复用 `clickRule`、`action`、`assertHit`、`assertMissing` 等具名 handler，桥接名及已有 rule／action ID 保持语义。房间流程使用通用 `call` 调用已登记 L3，以 `saveAs` 保存完整结果，通过本地 JSON Pointer 传递 `before`、准备证据与后置证据，最后显式 `return` 能力结果。失败停止后续节点，并保留已完成的 `pipelineSteps`。

`game.infrast.reset_filter`、`page_roster`、`select_operator`、`clear_roster` 也可独立从各自 `Infrast@Primitive@ResetFilter/PageRoster/SelectOperator/ClearRoster` JSON 入口调用。筛选重置后观察名单；翻页先确认当前名单页，再单次滑动并复核容量及人数。单个干员选择只接受当前可见页唯一完整姓名，`selected` 默认 `true`，已满足状态时不点击；否则只切换一次，复读同名选中状态和预期人数。清空先检查当前容量与人数，只尝试一次并核对零人数。输入后缺少明确复核即返回未知，保留前后证据，不翻页猜人、不重复输入，也不确认进驻或开启训练。

`prepare_roster` 可独立导航、检查容量并准备精确的待确认名单；成功只证明当前选中集合，不代表已经进驻。当请求正好填满本次实际容量时，该容量是独立上界：观察到等量、不同且官方姓名精确匹配的选中干员即可证明完整集合。非满员或清空意图仍要求独立的修改后总人数来源，否则在清空前返回 `unavailable`。`confirm` 使用本会话签发的完整准备证据，在提交前再次核对普通／协助者的完整选中名单，只提交一次；提交后的异常保持未知。`verify_room` 重新打开目标并核对实际名单，要求姓名与请求一致，且人数与本次入房面板的实际进驻数一致；它本身不宣称确认输入的 `nativeSuccess`，完整换班流程才综合各阶段报告结果。

公开 `prepare_roster` 成功后，provider 在 `selected.preparationId` 写入随机的**一次性准备标识**，内部另存完整准备对象、资源身份、取消信号和宿主 `inputRevision`。调用方必须原样保留整个 `data`；只复制名单、拼装 `room_panel` 或自造随机标识不能授权提交。`confirm` 通过公共输入校验并进入 handler 后即消费凭据，精确核对完整对象、同一 provider、资源代及输入修订号；篡改、确认失败和未知结果都不能复用。

宿主通过 `AtomicExecutionPort.getInputRevision()` 返回非负安全整数，实际输入尝试单调推进它，覆盖公共 L1/L2、其他游戏功能和原生标准节点。进入新准备或其他基建输入 handler、取消、基建 handler 执行失败会清除旧准备；其他功能的实际输入尝试则通过修订号变化使它过期。截图、识别、纯 Custom／Context 与根边界清帧不推进修订号；外部调用在 Schema／帧门禁处拒绝且没有实际输入时，旧准备不一定失效。帧令牌与准备凭据用途不同，跨根帧已经失效不代表凭据必然过期；判断仍由输入修订号及资源、会话检查完成。端口缺失或返回无效修订号时可以返回准备证据，但独立确认会消费它并返回 `unavailable`。

下面是维护代码调用公开阶段的示例；实际房间必须与位置一致，面板容量为 1，且完整姓名能在同代官方字典中核对。每个结果都须检查后再推进；实际产品业务优先使用已登记的完整换班流程：

```ts
const request = {
  target: { facility: 'Power', room: 1, position: 'B101' },
  route: 'room',
  role: 'normal',
  operators: ['澄闪'],
};
const prepared = await registry.execute('game.infrast.prepare_roster', request);
if (prepared.status !== 'completed' || !prepared.verified) return prepared;

// 中间不插入其他输入；确认原样消费 provider 返回的完整准备对象。
const confirmed = await registry.execute('game.infrast.confirm', { prepared: prepared.data });
if (confirmed.status !== 'completed') return confirmed;

// 原生接受只证明提交阶段结束，重新入房取得的名单才验证实际结果。
return registry.execute('game.infrast.verify_room', { request, prepared: prepared.data });
```

完整 JSON 房间流程同样用 `saveAs` 和 `#/steps/.../data` 传递 provider 返回的准备对象，不在节点里重建可信字段。新增可提交能力时，也应明确凭据的签发、输入失效和一次性消费边界；不能依赖调用方自觉不切页。

`InfrastWorkflows` 在动作前检查输入和跨房间冲突，普通房间执行 `Infrast@ApplyRoom`。训练室在 TS 中保留初始锁定与省略角色检查，对每个明确变化角色分别执行 `Infrast@ApplyRole`，然后复核保留角色及最终锁定状态。若首个角色已提交而后续失败，整体返回未知并保留证据，不把一部分成功改写为全体失败后重试。

领域 `AtomicVision` 扩展 `src/composites/vision.ts` 的通用 `Vision`，保留基建 16:9、1280×720、卡片与设施语义；通用 Vision 通过登记器调用 L1。动态定位、有限翻页、选人算法及业务保护仍由 TS 维护，但页面链和房间阶段顺序由 JSON 表达。

宿主注册 `MaaVerge.Custom` 并经既有 NDJSON 调回当前 Bun 服务，没有额外官方 AgentServer 进程。根图使用 `MaaTaskerPostTask`；Custom 内的已登记子图通过 `runContextPipeline`／`MaaContextRunTask` 同步执行，沿用当前 Context，不再次向根 Tasker 排队。子图共享父期限和取消边界；停止或回调结束使对应上下文失效。详见 [MaaFramework Pipeline 开发](maaframework-integration.md#pipeline-与-custom-的分工)。

修改页面顺序或阶段链先改 JSON；名单算法改 `roster.ts`，房间事件改 `room.ts`，训练／批次策略改 `workflows.ts`，上游映射改 `resources.ts`。新增 JSON 必须在 `definitions.ts` 显式登记，组件可经 `automation.components.infrast.pipeline` 访问，backend 仍只调用包根。官方自定义排班以数据输入处理，产品不提供用户任意 Pipeline JSON 或处理器执行接口；生态编辑器和通用 UI 的实际兼容性仍需单独验证。

### 三条换班路径

1. `overview_shift` 使用**游戏左侧「总览」**定位房间，逐房应用明确名单。它不操作应用自己的任务队列。
2. `queue_rotate` 打开游戏总览，只点击一次游戏内队列轮换。它不会跟随上游任务链执行「整顿」。输入 `expectedRooms` 后，逐房重新读取实际名单，全部吻合才返回 `verified: true`；未提供期望或证据不足时返回 `unknown`，保留前后画面事实与原生接受状态。
3. `room_shift` 从基建主页进入明确设施，读取当前进驻名单、当前页面显示的实际容量，再清空、按姓名选人、核验完整选中集合、确认、退出并重新进入房间读取实际名单。

`trim` 是单独能力，只处理游戏的「整顿」。它不会触发队列轮换；本期没有足以独立证明整顿业务结果的名单校验，点击接受并取得新画面后仍返回 `unknown / verified: false`，不会自动重放。

批量换班在任何动作前拒绝同一房间重复安排，重复的完整房间位置，以及同一干员跨房间或训练双角色重复分配。每房确认后保留 `before`、`selectionAttempt`、`selected`、`after` 和阶段信息。发生失败即停止后续房间，保留已完成房间及未执行列表；不会重新执行可能已提交的确认操作。全部房间操作完成后，再次读取所有目标的最终名单与训练保留角色，防止后续迁人使前面已确认的房间失效；最终复核失败会保留 `finalChecks` 并返回部分完成。

### 明确房间身份与实际容量

`room` 是从 1 开始的设施序号。制造站、贸易站、发电站、宿舍存在多个房间，必须额外提供可在游戏中识别的完整 `position`，例如 `B101`。当前可见的第一个同类设施不证明它是全局第一间；因此省略 `position`、只给楼层 `B1`，或者滚动后身份不能唯一核对时，生产适配器会在操作前拒绝。单例设施仅支持 `room: 1`。

总览先按物理行锚点分组，再将设施与完整位置文字绑定到同一行；同一行的重复 OCR 不增加房间数，行身份、位置冲突或不明确时拒绝。入房后还要核对设施标题和房间位置。代码不会用测试中的房间状态或预设屏幕坐标补齐缺失身份。

普通房间实际容量来自房间右侧进驻信息面板，使用同一帧的目标设施标题、重复房间完整位置、面板标题和底部「进驻人数 n/m」建立 `room_panel` 证据。`occupied: n` 是当前实际进驻人数，`capacity: m` 是当前实际开放位置；不要求选人页顶部存在未适配的「已选/容量」文字。进入名单前保留该证据，导航其他房间时清除；面板已展开时不再点击切换，未展开只尝试一次入口输入，随后有界只读等待，不因尚未出现而补点。

| 字段／结果                    | 能证明的事实                     | 不能代替的证据                     |
| ----------------------------- | -------------------------------- | ---------------------------------- |
| `observation.operators.cards` | 本帧完整可见卡片的姓名与选中状态 | 完整名单、真实容量、全局已选总数   |
| `room.capacity`               | 此目标房间在面板帧的实际开放位置 | 设施理论上限或列表当前待选总数     |
| `room.occupied`               | 此目标房间在面板帧的实际进驻人数 | 清空／选人后新的 `selectedCount`   |
| `selectedCount`               | 经明确可信来源适配的当前待选总数 | 可见选中条数量、心情值、动作次数   |
| 完整 `RosterEvidence`         | 按明确总人数逐名收齐的选中集合   | 本次提交已经生效，仍须重新入房复读 |

刚入房且尚未修改选择时，driver 以本地 `selectionOrigin: 'room_entry'` 标记未修改状态，可将同次 `room.occupied` 作为初读的收齐目标；缺少的姓名必须继续有限扫描，收不齐则停止。它不是公开调用方可自行补写的信任来源。筛选重置与翻页不改变选择，因此保留此来源；清空或卡片选择会取消它。相邻翻页画面不变只表示没有观察到变化，不证明绝对边界，也不能把局部名单升级为完整。

修改后可采用本次实际容量的满员上界证明：精确收齐 `capacity` 个唯一选中姓名，每次点击后检查同名选中条，最终重新扫描并比较完整集合。若无法证明清空后的零人数，算法保留已有的目标成员，补选所缺成员；未清除的旧成员会占用容量，不能以点击次数冒充成功。部分名单与空名单仍要求额外可靠的 `selectedCount`，不能继续借旧面板人数、心情 `20/24` 或无变化滑动推算总人数。

容量另受设施硬上限约束：制造/贸易 3，发电/办公室/加工 1，中枢/宿舍 5，会客/回收 2，训练每个角色 1。这些数字只用于拒绝异常结果，不能补齐缺失的实际容量。训练角色尚无独立真实人数／容量面板适配，不能以理论单角色容量 1 宣称验证通过；协助者列表仍需可靠实际来源。加工站与回收站是不同设施；加工站选人不会发起材料合成。

扩展计数适配时，在 `observations.ts` 定义同帧页面身份与独立总人数来源，在 `driver.ts` 管理证据随导航和选择变化失效，在 `roster.ts` 核对完整集合及人数；不得把资源 `card.selectedCount` 的 HSV 选中条阈值误当作全局人数。使用轻量帧或 `frame: "current"` 的通用调用仍遵守[同根帧边界](debug-atomic.md#当前帧轻量引用与预览)，Debug 中的一张 PNG 预览不扩大证据作用域。

低层明确名单接口中，普通设施 `operators: []` 表示清空，仍需独立计数证据；省略名单属于无效意图。官方排班数据的空名单语义另见下节，不能混用。训练室使用独立的 `trainee` 与 `assistant`，不接受普通 `operators`。省略某个训练角色表示保持不变，前后都要读取并核对该角色。受训者锁定时拒绝更换为另一人，但允许单独更换协助者。受训者使用独立的快速编队选人页；协助者使用基建干员列表。换人不会开始或继续专精，也不会领取完成奖励。

### 官方自定义排班与常规自动换班

`workflow.infrast.custom_shift` 只读宿主快照的官方 `plans[].rooms`，保留原始文档、计划索引和 SHA-256。支持 `trading/manufacture/power/dormitory/control/meeting/hire/processing`，数组原位置决定设施序号；跳过房间不会重新编号。先纯解析整份计划、检查跨房间重名并核对所有固定姓名，再浏览总览收齐每个目标的实际完整位置；全部目标解析成功前不修改名单。`facilities` 限制执行类型，其他房间保持不变。

按官方 v6.21.2 的 `InfrastTask` 与 `InfrastAbstractTask` 语义，`skip: true`、设施数组为空、短数组以外的房间，以及 `operators` 为空／省略且未启用 `autofill`，均表示保持原状。整份计划没有变更意图时直接返回 `keptUnchanged`，不打开名单、清空或自动补员。`autofill: true` 才启用自动填充，固定 `operators` 保留并为其他房间预留。已支持 `sort: false`；产物切换、排序、候选组、复杂分组及实际启用的菲亚梅塔／无人机等未适配行为在任何房间提交前拒绝，不静默丢失配置。

`workflow.infrast.daily` 对明确的非空设施列表执行常规自动换班；旧任务的空设施列表编译为无步骤，保持不变。`game.infrast.enumerate_rooms` 先以同帧完整图标布局证明请求范围的全集，再从总览为每个设施序号绑定完整位置。生产区必须观察到不冲突的 3×3 九格图标，制造／贸易／发电各至少一间；宿舍必须观察到四个，所请求单例必须唯一。连续两次读取要求身份与计数稳定。该完整布局依据官方 v6.21.2 `InfrastInfoTask::is_complete_layout`，不能以局部可见页、Mini 视图或未解锁房间补出全集。逐房完成后重新枚举同一集合并复读所有最终名单，后续迁人导致前房变化时保留部分完成。

自动选择只针对有界扫描实际看到的候选，最多 100 页。候选必须有同代官方完整姓名、可读心情，并明确标记「未进驻」或属于当前房间；缺少设施文字不等于空闲，不自动抢占其他房间干员。生产候选满足心情阈值，并按已审阅的简单增速技能排序；中枢按高心情、宿舍按低心情选择。跨房已分配姓名、后续固定名单均被排除。人数不足以填满实际容量时在清空前停止，不以较小名单代替成功。

心情沿用官方笑脸与进度条算法：明确休息／涣散模板可提供端点值，工作状态按进度条估算；条形值保留两参考像素的阈值余量，不能推导精确工时。技能使用同一资源代的 `infrast.json`、实际技能图标和亮度过滤，只接受明确登记的静态增速 ID 与数字效率，不求值公式、不推断跨房协同，也不声称全局最优。纯 JavaScript PNG 解码只处理受限大小、有效 CRC 的 8 位图像，不增加 Python 或原生游戏逻辑；解码失败时额外心情／技能证据不可用，明确姓名路径仍保留。

## 来源与更新边界

适配器基础页面规则的审阅基线是 MaaAssistantArknights `v6.20.0`，官方自定义计划与完整布局判定另核对 `v6.21.2`。`adapterBaseline` 记录基础规则来源；`resourceVersion` 和加载文件的 SHA-256 记录**本次实际不可变资源**，实际资源不会被误标为基线 tag。会话绑定自己的不可变资源代，不覆盖活跃 worker 使用的文件。

语义适配器位于 `services/automation/arknights/custom/infrast/resources.ts`，通过 backend 注入的资源读取窄接口读取下列固定文件，保留 `ResourceReader` 的普通文件、目录和符号链接限制；automation 不导入 backend 的资源模块：

| 固定文件或源码                                                | 适配内容                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `resource/tasks/tasks.json` 或兼容的 `resource/tasks.json`    | 基建入口、总览、轮换、独立整顿、设施和卡片参数、确认与训练页面规则 |
| `resource/tasks/Copilot/formation.json`                       | 受训者快速编队确认入口                                             |
| `resource/tasks/hotfix/ocr_replace.json`                      | 随资源发布的干员名和数字 OCR 纠错；保持原顺序，不截断映射          |
| `resource/battle_data.json`                                   | 同代官方干员完整姓名，禁止用截断或近似文字选人                     |
| `resource/infrast.json`                                       | 已审阅的简单技能 ID、静态效率与技能图标，保留实际文件摘要          |
| `src/MaaCore/Vision/Infrast/InfrastOperImageAnalyzer.cpp`     | 笑脸锚点、相对姓名/设施区域、HSV 选中条、忽略边缘半卡              |
| `src/MaaCore/Vision/Infrast/InfrastFacilityImageAnalyzer.cpp` | 设施身份的语义参考                                                 |
| `src/MaaCore/Task/Infrast/InfrastAbstractTask.cpp`            | 选人、确认、重读等业务参考                                         |
| `src/MaaCore/Task/Infrast/InfrastTrainingTask.cpp`            | 双角色、训练锁定及训练状态分析中的副作用边界                       |
| v6.21.2 `InfrastTask.cpp`、`InfrastAbstractTask.cpp`          | 官方自定义排班索引、skip/autofill 默认与空意图保持语义             |
| v6.21.2 `InfrastInfoTask.cpp`                                 | 九格生产区、四宿舍及单例的完整布局边界                             |

资源适配只解释经过审阅节点所需的简单 `baseTask` 继承，限制循环与深度。不展开 `@/#` 表达式，不跟随 `next/onErrorNext`，不执行节点自带动作。训练 `OperProgress@MasterySelectTrainer` 是登记过的完整节点名，不代表通用表达式支持。

笑脸模板保留 `[100,255]` 灰度掩码；其他已审阅模板可使用 `[1,255]`。选中条使用原资源 HSV 参数和原数色阈值。MaaFramework 在内存里缩放识别图像至 1280×720，并明确返回参考坐标空间；实际输入再映射回原帧像素。修改模板掩码使用内存覆盖，不写回资源。

模板规则保留活动资源视图中的真实相对 ID。通用适配器先匹配精确 ID，再接受唯一的路径后缀匹配，例如将已审阅的 `Recruit.png` 定位到实际 `UiTheme/Default/Recruit.png`；缺失或多个候选均拒绝，不猜测主题。基建也复用此规则，不能把已解析的实际目录路径重新覆盖成文件名。多模板阈值仍按上游原始模板序号对应。

总览入口上游使用 `RGBCount`。本期为它登记了独立的简体中文「总览」OCR 规则，**没有把 RGBCount 静默当成模板匹配**。制造/贸易/发电的 Full 与 Mini 纯色图标使用受限的 `RGBCount + pureColor`：保留 RGB 范围并集、3×3 闭运算、F1 得分、模板阈值和 `nmsDistance` 去重。仅 Full 命中可证明正常视图；Mini 模板也能装进正常视图的竖条，因此 Mini 命中只记录未知视图，不误认缩放状态。其他设施 Full/Mini 模板按实际得分选择。MaaCore 新增算法、字段或页面变体应独立审阅并登记，不能以通用转换器猜测语义。

正常资源更新可继续使用实际新代中已适配的模板、纠错与参数；任务图和 MaaCore C++ 逻辑更新不会自动变成新的语义能力。维护者应比较上述固定来源、运行隔离契约与编排测试，补齐有变化的显式规则，再用主动选择的真实设备测试记录闭环结果。未完成该步骤的版本不能标为真实游戏已验证。

### 兼容记录与更新处理

| 对象                   | 本轮记录                                                            | 验证范围                                                       |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| MaaCore 语义与算法基线 | `v6.20.0`，源码提交 `71bce1cc85bce55d3b20e19066b2dd33252072fc`      | 核对固定源码／资源节点与合成行为；未验证真实换班               |
| 官方排班与完整布局语义 | `v6.21.2` 的 `InfrastTask/InfrastAbstractTask/InfrastInfoTask`      | 核对空意图、autofill 与完整布局；未验证真实换班                |
| MaaFramework ABI／SDK  | `v5.14.3`，SDK 摘要与许可由 `3rdparty/maaframework` 锁定            | macOS arm64 合成 CTest、无 Controller 离线 OCR／模板／颜色探针 |
| 实际游戏资源           | 运行时 `resourceVersion`、不可变视图 generation、逐来源文件 SHA-256 | 不把资源新代标成已完成真实游戏验收                             |

上游 tag 是 annotated tag；上述源码提交取其 peel 后的 commit，与 tag object 区分。可从[固定源码](https://github.com/MaaAssistantArknights/MaaAssistantArknights/tree/71bce1cc85bce55d3b20e19066b2dd33252072fc)复查。`adapterBaseline` 只表示已审阅实现来源，`sources` 的实际资源版本与摘要独立记录。

监控和调度由独立 bot 负责，本运行时不增加轮询器。收到变更后，维护者记录旧／新提交、受影响来源节点、原语 ID、适配版本和验证结果：普通兼容变化以 24 小时内形成验证候选为目标；特殊活动入口、任务语义或算法变化以 24 小时内形成影响报告为目标，随后显式适配并验证。候选使用独立不可变资源代，只能在设备及识别空闲后激活，验证失败保留旧代；不自动移植完整源码或因动作结果未知回到 MaaCore 重做。

## 当前限制

- 仅登记官服与 Bilibili 的简体中文资源。其他客户端明确不可用；未完成真实游戏验证。
- 仅支持整数像素下严格 16:9 的帧；不猜测黑边、异形屏或其他坐标布局。
- 房间页必须能识别设施标题；重复设施必须能识别完整位置。总览缺少可读行身份、位置混淆或页面不包含已登记入口时停止。
- 已适配制造/贸易/发电的纯色 Full/Mini 图标，但尚未实现地图自动缩放；全集枚举要求完整正常布局，局部、Mini 或未完全解锁布局不可用。显式目标可有限浏览总览解析身份，所有入口仍须真实命中，入房后还要确认完整位置。
- 基建列表必须匹配已适配卡片、筛选菜单与可靠人数来源。当前页卡片可读不等于完整名单；无法按明确人数或满员实际容量逐名收齐、OCR 重名或筛选状态不明时停止，扫描上限为 100 页。部分／空名单缺少独立修改后计数时在清空前停止。
- 自动策略只使用实际观察到的可用候选与登记的简单技能，不支持完整技能公式、跨房组合优化、菲亚梅塔轮换、无人机与产物切换。缺少心情／技能资源会禁用自动能力，明确固定名单仍按自身证据判断。
- 受训者列表使用独立的明确姓名 OCR；未实现上游动态生成的快速编队旗标模板。未精二、专精满级、未拥有或未被当前页面识别的干员不会以假结果补齐。确认后必须再次读取受训者姓名才能完成。
- 训练完成但未领取、无法识别有效剩余时间/空闲状态、无法区分未进驻与姓名缺失时不执行隐含领奖或猜测。角色证据不足时不能报告完整训练室已验证。
- 只读识别可使用会话中仍有效的不可变帧，即使返回 `fresh: false`。输入动作仍必须绑定当前有效的新帧；干员点击前重新读取精确姓名。worker、会话变化或任何动作都会使旧动作令牌失效，未知结果不会重放。

## 隔离验证

`services/automation/tests/atomic-infrast.test.ts` 使用注入的合成状态验证编排，不需要 MaaCore、MaaFramework SDK、模拟器、模型或真实账号。同目录资源与 Pipeline 行为测试核对固定来源、继承、客户端边界、房间身份、有限页面分支和 Custom 分派；`infrast-plan/auto/enumeration` 测试核对官方空意图、全集证明、候选不足不清空、固定名单补位与最终复核，`frame-pixels` 核对 PNG 完整性与数值解码。`atomic-registry.test.ts` 验证能力目录和分派。backend 中的 `atomic-resource-source.test.ts` 验证普通文件、链接拒绝、大小限制、资源根与模板枚举，运行时与 Debug 测试验证会话和结果边界；原生合成 ABI 验证官方任务提交、回调上下文、停止、EOF 与未知结果。测试专用流程适配器不能成为产品 fallback。测试不添加外观断言，不连接设备，不下载资源。

实现与验证记录见 [STATUS](STATUS.md)。历史合成验证不代表迁移后的回归结果，也不代表未经测试的平台或真实设备已通过。
