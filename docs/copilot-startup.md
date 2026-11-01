# 自动战斗类型、单份与队列执行

核查日期：2026-11-01。原版行为按官方 **MAA v6.21.0-beta.3** 的 WPF 界面、MaaCore 源码和手册交叉核对；源码核查和合成测试不代表真实游戏验收。

## 作业类型与原生任务

剿灭仍使用普通作业 JSON 和 `Copilot`，没有独立的原生剿灭作业任务类型。它与主线、活动作业的区别在于入口和导航条件；支持战斗动作不代表支持普通地图导航。

| 场景               | 原版参数与流程                                                                        | 启动前的游戏页面                                                                   | Maa Verge 对齐后的映射                                                                         |
| ------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 普通单份，包括剿灭 | `Copilot.filename`；跳过多作业导航，准备战斗、可选自动编队、开始并执行动作            | 手动选好关卡、难度或演习，停在有「开始行动」按钮的编队选择界面                     | 仅一份启用时使用 `filename`，`loop_times` 可以为 1                                             |
| 普通多作业         | `Copilot.copilot_list`；逐项导航、关闭代理、选择普通／突袭、可选编队、战斗与结算检查  | 同一区域关卡地图；主线同章节，SideStory 同页面且普通／EX／S 不能互跳，故事集同页面 | 多于一份启用时使用列表；保留顺序、重复项、导航覆盖与突袭；拒绝剿灭等不支持类型进入地图导航队列 |
| 保全派驻           | `SSSCopilot.filename` 与 `loop_times`；专用流程管理各层战斗、奖励和补充干员           | 手动完成初始准备和编队，停在关卡详情有「开始部署」按钮的页面                       | 仅一份文件及循环；拒绝多份及普通作业编队参数                                                   |
| 悖论单份           | `ParadoxCopilot.filename`；直接开始所选关卡，不执行干员导航                           | 手动选好技能，停在有「开始模拟」按钮的页面；无技能干员停在对应关卡页               | 单份使用 `filename`，不发送普通编队或循环参数                                                  |
| 悖论队列           | `ParadoxCopilot.list`；按作业寻找干员、进入悖论、选择技能，再战斗                     | 干员列表的「等级／稀有度」排序界面                                                 | 多份使用 `{ id, filename }` 对象列表，启动提示与单份分开                                       |
| 视频识别           | 核心保留独立 `VideoRecognition` 接口，将本地视频识别成作业；此版 WPF 已不提供视频入口 | 本地视频，不是设备战斗队列                                                         | 新作业中心未接入，旧任务兼容入口保留                                                           |

原版的多作业模式是独立开关，默认关闭；即使列表只有一项也会启用导航，原版界面明确不推荐用它执行单个作业。Maa Verge 按**启用条目数量**选择模式：一份用单文件，多份用对应原生列表。未勾选的条目不影响模式和单份循环，不提供单项强制地图导航开关。

## 单份的执行逻辑

普通单份先读取作业文件并解析战场，再处理开始按钮、可选编队和正式战斗。剿灭也沿用此路径，不先识别普通地图的关卡编号。开启自动编队会清空并重配所选队伍；关闭时须提前配好干员与技能。普通／突袭／演习由用户在游戏内选择，列表中的导航覆盖和突袭标记不作用于单文件。核心会先尝试 `BattleStartPre`，但官方手册要求从编队选择界面启动，不将其识别兜底承诺为任意页面自动恢复。

`loop_times` 只控制单文件重复次数，不决定是否导航。大于 1 时核心追加重复流程，并在每次结束后点击结算直到再次出现开始按钮；没有普通列表的强制三星门禁。原版手册要求循环不要借助战。Maa Verge 保留普通与保全单份循环，明确拒绝循环搭配助战，默认消耗额度为零。

普通单份设置 `wait_until_end=false`，动作执行结束不一定等到战斗结算；这在上游文件路径中写死，并无公开 JSON 参数可改。作业可用 `SkillDaemon` 等待战斗结束，但它本身不检查三星。单份、循环和剿灭不能套用普通列表的三星保证；没有结算证据时保持未确认。单份也不会发列表文件加载回调：Maa Verge 在提交时标记唯一条目执行中，按原生任务 ID 过滤回调，等待任务链结束及核心和异步操作空闲后才释放设备。

作业允许不声明任何干员：`opers`／`groups` 可为空数组或缺省，动作名称不必先在其中登记。部署动作省略方向时沿用 MaaCore 的向右默认值，保留源文件原文；显式无效方向、缺少单位名称或非整数位置仍会拒绝。公开作业 108905（TL-TR-1）包含预设装置且首个部署未写方向，原先阻塞点是本机的方向必填校验，而非空干员列表。

## 队列的执行逻辑

普通列表由同一个原生 `Copilot` 任务处理，不拆成多个单文件任务。每项从地图查找目标，必要时左右滑动，进入详情并核对关卡，再关闭代理、按需切换突袭，随后编队、战斗并等待结算。它不会从游戏首页自动进入章节，也不提供跨区域导航。

理智不足、战斗失败或未通过三星结算检查会中止普通队列；`loop_times` 不提供列表整体循环。原版多作业支持范围来自 GUI 和手册，核心本身并不按剿灭类型拒绝列表。因此 Maa Verge 在提交前限制普通导航队列的关卡类型；剿灭只启用一份并手动选关，其他不支持导航的类型同样使用单文件。

悖论列表使用专用识别流程，不走普通地图左右滑动。技能读取作业中对应干员的 `opers`／`groups`，默认 1 并限制在 1–3；列表请求不另加技能参数。每项等待战斗结束后走悖论结算旁路，不要求普通列表的三星条件，也不读取普通编队、助战或循环参数。旁路识别到战败时仍可继续下一份；Maa Verge 保留该项失败，待整个原生流程结束、队列结束及核心空闲后汇总整次失败，后项不会被连带标为战败。保全文件自身包含多层作战，不能把层级等同于外部多文件队列。

Maa Verge 分开记录文件加载、任务处理完成与通关证据；保全、多次循环或缺少完整结算证据时保持「通关未确认」，不据结束回调自动点赞。

MaaCore 的 `AbstractTask::callback` 对外去掉任务名称最后一个 `@` 之前的前缀，原版 WPF 在 `SubTaskStart`（20001）处理无前缀的 `StageDrops-Stars-3`、`StageDrops-Stars-Adverse` 和战败节点。Maa Verge 现在按同一规则处理，并兼容带前缀及 20002 回调；同一结算只记录和截图一次。先核对当前原生任务、列表条目和战斗起点，避免迟到事件污染下一项。普通结算根流程失败会标红并停止后续；若仅知道三星门禁失败，显示「未三星或识别失败」，不将识别失败断言为战败。

确认单次通关成功后，只取消本次快照对应队列项的选择；以条目 ID、版本和难度／导航字段核对，重复使用同一文件的其他项不受影响，失败及未确认项保留勾选。后端持久化该变化，界面精确合并到当前草稿并在已有保存之后再次写入，避免在途保存重新勾上成功项；后续仍可主动重新选择。

新增普通队列项按文件 `difficulty` 生成：1 为普通一项，2 为突袭一项，3 按普通、突袭顺序生成两项；缺省或无效值显示未声明，不推断支持范围。库、导入、作业集和分类使用同一追加规则，容量按展开后条数检查。历史条目不自动展开；界面不再提供手动突袭与导航输入，列表导航名称默认使用资源 `code`。单份仍须在游戏内选难度。

## 本次剿灭问题与保留差距

原实现用 `loopTimes === 1` 决定启用 `copilot_list`，导致单份剿灭也进入地图导航。「灰石剧场」文件为 `camp_r_34`，地图元数据的 `code` 为「米诺斯」、`name` 为「灰石剧场」；核心默认取 `code` 导航。通用编号识别的区域和 ASCII 条件不适配该入口，核对失败后反复执行顶部横划。

本机既有日志确认识别到「开始行动」后，对「米诺斯」核对失败并执行 `Copilot@FullStageNavigation`。MaaTouch 连接中设备、截图与触控握手均为 1280×720、旋转为 0，仍出现相同流程。本次修复调用模式选择，不改原始作业或资源，不能用改导航名称替代单文件执行。

原版 WPF 助战提供必要补齐和随机模式，Maa Verge 当前提供关闭或指定干员，尚未覆盖所有编队及外部练度辅助选项。类型检查和导航覆盖校验也不能证明多份作业位于同一区域，实际地图页面仍须用户确认。视频识别、跨区域导航与新的真实设备验收不在本次修改范围内。

## 官方依据

- [自动战斗手册](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.21.0-beta.3/docs/zh-cn/manual/introduction/copilot.md)：单份、队列、保全、悖论、循环与触控前提。
- [WPF 执行入口](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.21.0-beta.3/src/MaaWpfGui/ViewModels/UI/CopilotViewModel.cs)：列表默认关闭、单份和列表独立组参、关卡分类与视频入口现状。
- [WPF 作业参数](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.21.0-beta.3/src/MaaWpfGui/Models/AsstTasks/AsstCopilotTask.cs)：文件与列表互斥，循环和编队独立。
- [WPF 提示与列表范围](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.21.0-beta.3/src/MaaWpfGui/Res/Localizations/zh-cn.xaml#L1009)：单项列表警告、起始页面、同章节／同页面限制。
- [CopilotTask](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.21.0-beta.3/src/MaaCore/Task/Interface/CopilotTask.cpp)：文件禁用导航，列表等待结算并使用地图 `code`。
- [MultiCopilotTaskPlugin](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.21.0-beta.3/src/MaaCore/Task/Miscellaneous/MultiCopilotTaskPlugin.cpp)：详情核对、OCR／模板、滑动、代理与突袭。
- [SSSCopilotTask](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.21.0-beta.3/src/MaaCore/Task/Interface/SSSCopilotTask.cpp)：单文件、循环与禁用自动编队。
- [ParadoxCopilotTask](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.21.0-beta.3/src/MaaCore/Task/Interface/ParadoxCopilotTask.cpp) 和 [ParadoxRecognitionTask](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.21.0-beta.3/src/MaaCore/Task/Miscellaneous/ParadoxRecognitionTask.cpp)：单份与列表、干员导航及技能来源。
