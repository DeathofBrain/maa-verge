# AVD 三层原语与常用流程实机测试报告

日期：2026-11-03，Asia/Shanghai。实际操作约 **04:30–07:01**，07:10 完成进程清理。本轮经用户明确选择，使用此前保留的 `official_game` AVD 和真实游戏账号，通过 Maa Verge TypeScript 后端、C++ worker 与官方 MaaFramework 操作；没有使用合成设备代替实机结果。

**结论：AVD 增强截图通过，L1 和多数 L2 的已测路径可用；部分日常流程通过，但完整日常与基建换班验收未通过。** 基建名单容量读取失败，总览存在错误房间识别；冷登录的活动弹窗、从主页进入任务页、完整战斗与完成公招领取仍有缺口。不能将能力登记、原生输入成功或 `verified: true` 单独视为业务通过。

## 1. 环境与测试方法

| 项目          | 实际配置                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------- |
| 宿主          | macOS 26.6.2（25G83），arm64                                                                      |
| 模拟器        | Android Emulator 37.2.13.0，保留的 `official_game`；本轮启动前未运行，未清除其数据                |
| Android／画面 | Android 14，arm64-v8a，1280 × 720 横屏                                                            |
| 游戏          | 明日方舟 Bilibili 服 2.7.91，保留登录状态                                                         |
| MaaFramework  | 官方 v5.14.3，macOS arm64                                                                         |
| 游戏资源      | GitHub MaaCore v6.21.1 整包配套资源；`resource/version.json` 更新时间为 `2026-11-01 13:43:20.000` |
| 触控          | 先验证 ADB Shell 的能力边界，随后显式选用 MaaTouch；未静默切换触控方案                            |
| 截图          | 普通 `adb` 与显式 `avd` 分开建会话测试                                                            |
| 后端          | 固定 Bun 1.4.3 运行当前 TypeScript 源码，隔离数据根，关闭自动连接、自动下载与自动更新             |
| 源码基准      | `f6998d996f538aec7d01357fcce9ad041ef161e7` 加现有未提交工作；本轮三项修复也在工作区内             |
| 控制入口      | stdio JSON-RPC 的 Debug 自有会话；所有设备操作仅由主测试线程执行                                  |
| 消耗边界      | 药、源石、信用购买、公招加急与新建招募均未执行；未开始战斗，未提交基建名单                        |

本次 SDK manifest SHA-256 为 `634de51c69fd675ad9ca5aa9093eb08bc5dd8880d25b87334dafa2b0c55612d0`。资源源代为 `core-0337bf34179e43fdbe785eddec3d718c`；Bilibili 派生视图为 `framework-f8b94181563a7f0dad848f02fe07faa4`，其 manifest SHA-256 为 `8d083b7f238438857c4d4dc1559bb9fb06693a327538f35fb521538ace128cd7`。未借用另一份旧版独立资源作为成功依据。

测试沿真实 `Debug → automation → C++ → MaaFramework → AVD` 链路执行。L1 直接调试使用后端原语入口；JSON 流程中的子调用经官方 Context 执行。仓库流程记录 76 个步骤、干员当前屏流程 41 个步骤、主页登录完成路径 52 个步骤、最终信用流程 94 个步骤，提供真实嵌套执行证据。步骤数量只说明执行经过，不等于各业务均成功。

外部 ADB 仅用于环境探测、启动已有游戏和进程收尾。登录弹窗、基建教学及页面恢复中的人工决策，均单独记录为依据新截图发起的 L1 点击，不计入自动流程成功。输入结果未知后未自动重放；后续主动尝试先重新观察当前页面。

## 2. AVD 增强截图

**通过。** 显式 `capture.method: avd` 的原生日志显示唯一候选为 `AVDExtras`，并最终选中该方法；没有降级到普通 ADB 截图。

```text
screencap_methods=64
method_set=["AVDExtras"]
VideoInfo: width=1280, height=720, fps=60
The fastest method is AVDExtras [cost=0ms]
```

| 方式      | 有效样本 | 尺寸       | RPC 最小／中位／最大耗时    |
| --------- | -------- | ---------- | --------------------------- |
| 普通 ADB  | 10/10    | 1280 × 720 | 130.13 / 134.65 / 148.79 ms |
| AVDExtras | 10/10    | 1280 × 720 | 34.88 / 36.91 / 46.76 ms    |

本次小样本中，增强方式的 RPC 中位耗时约降低 73%。这是取帧、PNG 编码和后端传输的实测比较，不能外推为长期吞吐或其他模拟器性能。增强帧返回的后端 `latencyMs` 为 24–32 ms；日志中的原生 `cost=0ms` 只是 SDK 选型测速值。

另用只读共享内存探针观察约一秒：帧序号 `12797 → 12812 → 12827 → 12842 → 12858`，时间戳同步增长；共享区大小为 3,702,784 字节、标称 60 fps。结合页面变化，确认取得的是持续更新的真实帧。

证据：`adb-samples.json`、`avd-samples.json`、`capture-statistics.json`、`shm-observe.ndjson`、`maafw-final.log`。

## 3. L1、L2 与执行边界

### L1 最小原语

| 能力                                   | 实际结果与限制                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `operation.frame`、`observation.frame` | 返回有效真实帧；兼容别名可用                                                                                                                |
| `operation.recognize`                  | 同帧模板、OCR 与 HSV 颜色识别成功；模板使用完整 ID，HSV 使用官方 method 40                                                                  |
| `operation.click`                      | 同帧取帧 → 模板／OCR → 点击登录入口成功；输入回执为 `nativeSuccess: true`、`verified: false`，后续另观察页面                                |
| `operation.press_key`                  | 返回键实际输入成功，结合页面复核恢复导航                                                                                                    |
| `operation.swipe`、`operation.drag`    | MaaTouch 接受输入，仓库页面滑动前后截图可见变化，之后恢复首页                                                                               |
| `operation.long_press`                 | ADB Shell 模式不支持所需逐点触控，明确失败并关闭 worker；显式改用 MaaTouch 后成功。测试位置为空白区，仅验证输入链路，未验证特定游戏长按功能 |

错误模板简称、错误颜色 method 的最初测试参数在执行前被拒绝；修正测试参数后的成功结果单独保留，不将参数错误列为产品缺陷。

### L2 通用组合

直接覆盖了 12 项中的 10 项：`match`、`texts`、`press_key`、`click_rule`、`click_first`、`action`、`delay`、`assert_hit`、`assert_missing`、`wait_until`（均为 `composite.*`）。

- 规则匹配和 `assert_hit` 覆盖命中与未命中；当前主页命中规则为 `home.1`，字面规则 `home` 未命中。`assert_missing` 只验证了 `start` 缺失时成功；`wait_until` 只验证 `expected: true` 的成功与超时，`texts` 取得一次 5 条非空 OCR。其他分支不计通过。
- `click_rule` 实际执行；`click_first` 只验证了 `rules: ["store"]` 的单候选输入，没有验证多个候选的跳过、选择顺序或 `fallbackAction`。点击后独立观察，没有把点击接受当作目标页面已到达。
- `composite.action` 成功关闭实际信用奖励弹窗，复读确认回到余额页。
- `composite.click_box` 和带帧的 `composite.swipe` **未完成实机验证**。根流程会清除外部动作帧，独立 Debug 跨根传帧不能代替同根组合；完整 PNG 也可能超过 stdio 单条请求限制。后续需用同一根 JSON 内的帧引用验证，不能用 L1 等价操作替它们计通过。

### 帧、并发、取消与释放

| 场景                              | 判定                                                      |
| --------------------------------- | --------------------------------------------------------- |
| 同一帧连续模板／OCR，只读后再点击 | 通过；观察没有提前使帧失效                                |
| 实际输入后复用旧帧                | 拒绝；没有再次点击                                        |
| 等待约 2.2 秒后使用过期帧         | 拒绝                                                      |
| 坐标 `x = frame.width`            | 越界拒绝                                                  |
| 延迟能力执行时外部请求截图        | RPC `-32011`，保持设备独占                                |
| 5 秒延迟执行期间结束 Debug        | 在途能力返回 `cancelled`，随后 `owner: none, busy: false` |
| 结束后重新建立会话                | 成功，未遗留占用                                          |
| 最终结束测试会话                  | 再次确认 `owner: none, busy: false`                       |

上述输入拒绝不代表游戏业务成功。证据：`l1-same-frame.json`、`l1-gestures.json`、`longpress-maatouch.json`、`color-success.json`、`l2-cases.json`、`l2-matched-cases.json`、`l2-click-navigation.json`、`guard-cases.json`、`cancel-release.json`、`final-release.json`。

## 4. 游戏事件与完整流程

| 功能           | 已验证行为                                                                                                     | 本轮判定                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 登录           | 已在主页时 `workflow.startup.login` 正确完成，`home: true`                                                     | **部分通过**：冷登录包含载入与多类签到／活动／公告弹窗，自动流程未走通；手工关闭后只验证了已到主页分支                 |
| 仓库           | `workflow.inventory.read_depot` 实际进入仓库与材料页，返回 19 条当前屏 OCR                                     | **限定范围通过**：`scope: current_screen, complete: false`，含 OCR 噪声，未验收完整材料识别或全仓扫描                  |
| 干员资料       | `workflow.inventory.read_operators` 实际进入列表，返回 41 条当前屏 OCR                                         | **限定范围通过**：同样 `complete: false`；未验证全名单、姓名与属性完整准确性                                           |
| 免费信用       | 在信用页执行收取，余额增加 220；修复后从主页完整执行流程成功，返回 `changed: false, claimVisible: false`       | **已测分支通过**：真实收取与已领取空操作均验证；从主页的新领取分支没有第二份未领信用可再测                             |
| 任务领奖       | 已在任务页时完成日常／周常切页与无奖励路径，两项均为 `changed: false, claimVisible: false`                     | **部分通过**：没有可领任务奖励；首次从主页进入时输入被接受但仍留在主页，流程停止为未知，未证明导航稳定                 |
| 公招           | 从稳定主页进入公招成功；四个槽位均在招募中，读取页面正常                                                       | **前置保护通过**：`workflow.recruit.collect_one` 在缺少完成证据时拒绝；未验证完成领取、跳过招募演出或新干员结果        |
| 关卡／代理     | 从终端手工打开上次关卡 16-4，`stage: true` 与准备页一致；代理处于锁定态                                        | **只读与拒绝通过**：prepare 因代理未开启拒绝；start 因无准备凭据拒绝；read_result 因无结算证据拒绝。未执行完整代理流程 |
| 基建主页／房间 | 实际主页进入基建后，基建观察命中；从基建页打开 `Control / room: 1 / route: room` 成功                          | **导航路径通过**：从游戏主页直接调用 open_room 被前置条件拒绝，不隐式执行其他业务                                      |
| 基建名单       | 实际进入控制中枢名单页，`read_room`、`open_roster`、`observation.operators` 均因无法读取已选人数和实际容量失败 | **失败，阻断换班验收**                                                                                                 |
| 基建总览       | 首次教学遮挡导致失败；人工关闭教学后返回成功，但把同一房间重复解析成多个设施编号                               | **语义失败**：`succeeded / verified: true` 与实际领域结果不符，不能用于定位或批次计划                                  |

信用领取流程观察到余额先增长，随后奖励动画出现；测试通过单独的 `composite.action` 关闭奖励弹窗并复读余额。当前实机证据不证明完整流程会自行清理所有奖励动画。

信用页若既无收取按钮又未命中信用货币图标，当前实现会保守拒绝，不凭余额 OCR 兜底；该特殊状态尚未实机验证。

基建测试只打开、读取与退出，没有操作干员选择、确认、清空或整顿。名单页退出后观察到房间信息页的“进驻人数 5/5”，然后离开基建返回主页；这不等于完成全账号或全房间名单核对。

## 5. 本轮发现并修复的问题

| 编号  | 原失败与原因                                                                                  | 修改与真实复测                                                                                                                                                                          |
| ----- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-001 | 首次 Debug 建会话时资源加载失败；上层传入不可变 generation 根，适配器却直接在该根查模板和 OCR | `framework/resources.ts` 正确选择其 `resource/`，同时保留原 generation、实际资源根、overlay 与许可来源，拒绝空来源。官方 SDK 资源加载、OCR 和后续 Pipeline 实机成功；相关资源测试 21/21 |
| F-002 | 信用页判断使用无文本约束 OCR 的命中状态，推荐页的非空文字或噪声也可能被当作切页证据           | 使用推荐页选中标记消失及信用专属图标／收取按钮确认同帧页面，再读取余额。实机推荐页拒绝、信用页成功，真实收取 220 信用                                                                   |
| F-003 | 从主页进入商店后立即点击信用标签，过渡中输入虽被接受但目标页未切换                            | `Mall@CollectCredit` 首节点保留官方默认入口的 `post_delay: 500`；仍只输入一次。重启后从主页执行完整信用流程成功；行为回归确认等待字段传给原生图且每页点击只执行一次                     |

涉及维护位置：

- `services/backend/src/modules/framework/resources.ts` 与 `services/backend/tests/framework-resources.test.ts`。
- `services/automation/arknights/custom/mall/{resources,capabilities,definitions}.ts`。
- `services/automation/arknights/pipeline/mall/workflows.json` 与 `services/automation/tests/daily-events.test.ts`。

原始失败记录与修复后结果分别保留，没有用成功结果覆盖失败证据。

## 6. 未解决问题与下一轮重点

1. **基建名单证据模型**：当前实现要求顶部出现“已选/容量”，真实名单页没有该字段。蓝色选中卡片及其编号只能证明可见选中状态，不能证明完整名单与开放容量。应区分“进入名单”“可见卡片”“完整名单／容量”；尝试在进入前的房间页读取进驻人数、空位与锁定位，并绑定目标房间。不要扩大到全屏 OCR，以免将心情 `20/24` 误认成容量，也不要用设施理论上限冒充实际容量。
2. **总览行与房间身份**：去重并验证标题、行区域和实际位置。当前结果出现 `Control:1` 与 `Control:2`、`Reception:1` 与 `Reception:2`，实际是同类标题重复识别。完成修复前不能据其结果换班或规划跨房操作。
3. **登录与任务入口**：补充载入等待、已审阅签到／公告／活动遮挡处理；独立复现任务入口未响应问题。已确认点击坐标与上游 ClickSelf 语义没有简单的 rectMove 丢失，原因仍未确定，不能直接套用信用页修复结论。
4. **尚无条件的业务分支**：完成公招领取、实际可领任务奖励、可代理关卡全流程、训练角色保护、跨房冲突、确认后未知和批次最终复核没有本轮真实游戏证据。基建可靠只读证据修复前继续停止提交测试。
5. **L2 带帧组合与独立调试**：补同根 JSON 传帧的实机用例，并核对独立 Debug 对根边界和请求大小的说明与入口体验。

## 7. 能力调用覆盖

以真实 RPC 请求及实际返回的嵌套 `steps` 对照 82 项能力目录，得到下表。**这是触达统计，不是通过率**；包含执行前拒绝、失败和未知，也包含只走到无奖励分支的能力。

| 分组     | 目录项 | 直接请求 | 仅嵌套触达 | 未触达 |
| -------- | -----: | -------: | ---------: | -----: |
| L1       |      8 |        8 |          0 |      0 |
| L2       |     12 |       10 |          0 |      2 |
| 基建     |     25 |        7 |          0 |     18 |
| 登录     |      3 |        2 |          1 |      0 |
| 战斗     |      8 |        4 |          0 |      4 |
| 公招     |      6 |        3 |          1 |      2 |
| 信用     |      6 |        3 |          2 |      1 |
| 任务奖励 |      7 |        2 |          5 |      0 |
| 资料读取 |      7 |        2 |          5 |      0 |
| **合计** | **82** |   **41** |     **14** | **27** |

27 项完全未触达的能力为：

- L2：`composite.click_box`、`composite.swipe`。
- 基建事件：`game.infrast.clear_roster`、`confirm`、`enter_trim`、`page_roster`、`prepare_roster`、`read_roster`、`reset_filter`、`rotate_queue`、`select_operator`、`set_room`、`trim`、`verify_room`（省略项沿用 `game.infrast.` 前缀）；`observation.training`、`observation.trim`。
- 基建完整流程：`workflow.infrast.overview_shift`、`queue_rotate`、`room_shift`、`trim`（沿用 `workflow.infrast.` 前缀）。
- 战斗：`game.fight.dismiss_result`、`game.fight.enable_agent`、`game.fight.wait_result`、`workflow.fight.current_stage`。
- 公招：`game.recruit.read_result`、`game.recruit.skip_reveal`。
- 信用：`game.mall.buy_current`。

逐项 ID、状态计数与原始 RPC 行号见本地 `coverage-analysis.json`。例如 `game.recruit.collect_finished` 虽有嵌套触达，实际被前置证据阻断，不能写成完成领取。

## 8. 修复后的合成回归

这些检查用于保护修复行为，与前文实机结果分开计数：

| 检查                           | 最终结果                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 定向 automation／backend 回归  | **206 通过，0 失败**；17 文件、1928 断言，含资源 21/21、日常事件 29/29                                 |
| `bash tools/pnpm.sh check:app` | 退出 0；工具 191 通过、1 条 Windows 条件跳过，契约 61/61，五个工作区类型、生成同步及架构／组件门禁通过 |
| 触及修复文件格式与差异检查     | 通过；没有新增外观断言测试                                                                             |

日志：`final-targeted-regression.log`、`final-check-app.log`。本轮实机修复没有修改 C++，未重新执行完整运行时、CTest、Bun standalone 或桌面 UI 全量测试；同日较早的实现阶段验证另见 [STATUS](../STATUS.md)，不算作本次真实游戏通过项。Windows、Linux、Intel macOS 及其他模拟器也不在本报告验收范围。

## 9. 账号影响与收尾

- 登录期间游戏自动发放了 2 张招聘许可；测试关闭了奖励与签到／活动／公告页面，未执行可选活动领奖或抽取。
- 实际收取免费信用 220。未购买商品、使用药或源石、开始战斗、新建或加急公招，未领取完成公招，未确认任何基建名单。
- 没有可领任务奖励，因此未实际领取日常或周常奖励。游戏自身时间推进、理智恢复及生产计时不属于自动化输入。
- 最终截图与 `observation.startup` 确认回到游戏首页；Debug 结束后 `owner: none, busy: false`。
- 后端正常 EOF 退出，退出码 0，未残留本次 worker。对 AVD 执行 `sync` 后正常关闭；只停止本次专用 ADB，原有其他 ADB 服务保留。AVD 数据保留，未清除账号或存档。
- 临时 `caffeinate` 已停止。测试期间阻止的是系统睡眠；单纯显示器熄屏不改变后端链路，宿主睡眠或 Android 锁屏会中断测试。
- 原始截图、RPC、隔离数据与本机路径仅在本地保留，没有上传。业务数据租约锁文件未删除。

## 10. 本地证据索引

证据目录为 Git 忽略的 `test-results/real-avd-20261103/`。报告不嵌入账号截图、串号、端口、控制令牌或本机绝对路径。

| 内容                   | 主要相对文件名                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 环境、全目录与完整 RPC | `environment.json`、`versions.json`、`catalog.json`、`rpc-summary.ndjson`、`backend.ndjson`                                                                                          |
| 截图与共享内存         | `adb-samples.json`、`avd-samples.json`、`capture-statistics.json`、`shm-observe.ndjson`、`maafw-final.log`                                                                           |
| L1／L2／门禁           | `l1-same-frame.json`、`l1-gestures.json`、`longpress-maatouch.json`、`l2-cases.json`、`l2-matched-cases.json`、`l2-click-navigation.json`、`guard-cases.json`、`cancel-release.json` |
| 登录与资料             | `startup-workflow.json`、`startup-home-workflow.json`、`inventory-depot.json`、`inventory-operators.json`                                                                            |
| 基建失败与导航         | `infrast-open-room-from-base.json`、`infrast-read-room.json`、`infrast-open-roster.json`、`infrast-operators.json`、`infrast-overview-after-tutorial.json`                           |
| 信用修复前后           | `mall-workflow.json`、`mall-workflow-fixed.json`、`mall-credit-claim.json`、`mall-after-close.json`、`mall-full-workflow-final.json`                                                 |
| 任务与公招             | `award-workflow.json`、`award-workflow-on-page.json`、`recruit-observe-stable.json`、`recruit-no-finished.json`                                                                      |
| 战斗只读与前置保护     | `fight-stage-observe.json`、`fight-guards.json`，对应截图 `fight-stage-after-1169.png`                                                                                               |
| 最终页面与清理         | `final-home-1179.png`、`final-release.json`、`cleanup.json`                                                                                                                          |
| 覆盖及合成回归         | `coverage-analysis.json`、`final-targeted-regression.log`、`final-check-app.log`                                                                                                     |

部分 JSON 内含真实画面 Base64；不能因扩展名是 JSON 就直接提交或公开。全部原始证据继续只在本地保存。
