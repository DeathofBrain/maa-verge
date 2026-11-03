# 原版 MAA 全功能与设置清单：MaaFW 兼容基线

核对日期：2026-11-03。用途：按原版用户功能拆分 MaaFramework（MaaFW）迁移工作、发现遗漏并安排验收。本清单记录**原版有什么**；Maa Verge 当前实现状态仍以 [STATUS](STATUS.md)、[既有 MaaCore 覆盖矩阵](maa-compatibility.md)和[常规任务设置对照](maa-task-settings.md)为准。

## 范围、版本与阅读方法

| 范围                                          | 固定依据                                                                                                                                                   | 核对方式                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Windows WPF 桌面、MaaCore、中文手册及集成协议 | 官方正式版 [v6.21.2](https://github.com/MaaAssistantArknights/MaaAssistantArknights/releases/tag/v6.21.2)，提交 `0da217cdef4d78bc5422decc95451533f77261e6` | 先盘点 v6.20.1，再逐项检查到 v6.21.2 的配置、表单、任务解析、工具及文档差异；以下链接固定到最终提交 |
| 官方 macOS GUI                                | 同一标签记录的 MaaMacGui 子模块 `27c6ef8afc83df7b946174152beb1cc912851c7f`                                                                                 | 单独核对 SwiftUI 设置、任务、工具和系统行为；该指针在 v6.20.1 与 v6.21.2 之间未改变                 |
| Linux、Android、CLI                           | 同一标签中的设备说明和 CLI 手册                                                                                                                            | 记录连接途径和命令类别；CLI 独立实现的每个命令行 flag 不作为桌面设置逐项展开                        |
| 活动、关卡、角色与小游戏目录                  | 上述源码的资源读取和活动日历入口                                                                                                                           | 记录动态目录能力及常驻入口；某次活动已结束或节点名仍存在不等于当前可执行                            |

v6.21.2 的官方发布时间为 **2026-11-03 20:27:22（UTC+8）**，本次已核对该正式标签。现有项目 v6.20.0 覆盖矩阵没有在本次被改写成新版已兼容；项目实机记录使用的 MaaCore v6.21.1 配套资源，也不等于本清单的 v6.21.2 已完成验收。

清单共 **263 个稳定编号条目**，按可辨认的功能及设置语义归并；一行内列出的子开关仍须逐一保存、执行和验收。`TASK-*`、`COPILOT-*`、`TOOL-*`、`SET-*`、`HOST-*`、`API-*`、`MAC-*`、`PLAT-*` 是后续兼容台账的稳定 ID。属性名用于回到原版实现核对，不要求 Maa Verge 复制上游存储布局。一个功能可以同时涉及宿主、识别、游戏事件和结果展示。

本次不修改运行逻辑、上游源码或版本号；不运行原版客户端、连接设备、执行购买／抽卡、发送通知或上传账号数据。可见但灰显的开关、仅历史兼容字段、实验性能力、Debug 功能及平台差异均保留说明。没有把独立 MAAUnified GUI、第三方 GUI、网站本身或未来资源中的所有功能视为本次已逐项核对的对象。

## MaaFW 兼容工作应如何归属

| 类型                           | Maa Verge 目标责任                            | 计入兼容前必须证明的行为                                        |
| ------------------------------ | --------------------------------------------- | --------------------------------------------------------------- |
| 单次设备输入／识别             | automation L1；C++ Controller／识别执行       | 截图、点击、长按、拖拽、按键、OCR／模板的坐标、能力、返回及取消 |
| 通用视觉组合                   | automation L2                                 | 同帧识别后操作、有界等待、页面条件、旧帧拒绝                    |
| 单个游戏事件                   | `arknights/{pipeline,custom}/<feature>` 的 L3 | 明确起始页、资源前提、提交动作、后置证据、失败／未知分支        |
| 完整游戏功能                   | JSON 组合 L3，TS 保存领域策略                 | 全路径、参数组合、消耗、部分完成、停止和恢复边界                |
| 任务编排／配置／数据／调度     | TypeScript 应用服务                           | 配置作用域、快照、持久化、时间与去重、同设备冲突、结果与导出    |
| 启动／窗口／托盘／快捷键／电源 | Tauri 与宿主服务                              | 系统行为与平台限制；不会因为有 MaaFW 节点就自动获得             |
| 更新／网络／通知／远控／第三方 | 各宿主业务模块                                | 来源、独立版本、凭据、网络副作用、投递结果和失败反馈            |

完整流程不能整体藏进一个 Custom 或透传原高层 MaaCore 任务来计作 MaaFW 迁移。根图使用官方 Tasker，登记子图使用 `MaaContextRunTask`；不重新向等待中的根 Tasker 排队，不引入生产 TS 流程解释器或自动后端回退。原生任务完成只证明流程结束，游戏成功还需要对应业务证据。具体约束见 [automation 维护指南](../services/automation/README.md)和 [MaaFW 接入](maaframework-integration.md)。

## 主界面、任务编排与执行反馈

来源：[TaskQueueView.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UI/TaskQueueView.xaml)、[TaskQueueViewModel.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs)、[TaskItemViewModel.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/ViewModels/TaskItemViewModel.cs)、[托盘菜单](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UI/NotifyIcon.xaml)。

| ID             | 原版功能／子项                                                         | 兼容要点                                                                       |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| HOST-QUEUE-01  | 新增任务、同类多项、重命名、复制、删除、拖动排序、任务参数自动保存     | 实际执行顺序、重复条目及配置隔离；Windows 开始唤醒至多一条，其余类型按各自约束 |
| HOST-QUEUE-02  | 逐项启用／关闭、右键半选仅本次执行或跳过、全选／清空／反选             | 持久状态与本次覆盖分别处理，重启还原；全选行为由设置决定                       |
| HOST-QUEUE-03  | 一键开始、停止、运行状态及逐项完成／出错／跳过                         | 停止清队列；没有原生暂停／恢复保证，停止中的状态不能提前释放设备               |
| HOST-QUEUE-04  | 当前配置、连接／客户端提示、任务进度、运行时长、启动确认倒计时与取消   | 手动／启动／定时触发的交互与策略不同                                           |
| HOST-QUEUE-05  | 仅运行此任务、从这里开始运行后续启用任务                               | 不修改持久启用状态；不是重放上次中断的原生队列                                 |
| HOST-RESULT-01 | 文本／卡片日志、分段、时间、截图缩略图、截图查看、自动滚动             | 日志、截图和业务结果关联同一次任务，限定缓存与本地隐私范围                     |
| HOST-RESULT-02 | 作战掉落与次数／理智、招募标签和星级、基建设施／进驻、长模式统计及错误 | 结果解析须覆盖各任务，不由统一“成功”文字替代                                   |
| HOST-RESULT-03 | Windows 目标窗口日志浮层、选择窗口、启用／隐藏、记忆目标               | 系统窗口功能，独立于游戏 Controller；各平台须单列                              |
| HOST-DATA-01   | 当期活动与复刻、资源本开放日／全开期、关卡目录及导航热更提示           | 官方网络数据与缓存、客户端时区／游戏日、最低版本和已安装资源共同决定           |
| HOST-WINDOW-01 | 窗口置顶、大小位置恢复、显示／隐藏、托盘驻留                           | 桌面外壳，Mac 的关闭窗口行为另列                                               |
| HOST-TRAY-01   | 托盘开始、停止、切换语言、强制显示、隐藏托盘、切换日志浮层、重启、退出 | 系统入口与主界面共享运行门禁                                                   |
| HOST-HELP-01   | 首次引导、演示任务、公告分节／已读／不再提醒、帮助／问题反馈／外链     | 本地演示和真实执行须隔离；更新公告与游戏领奖是不同功能                         |

## 游戏任务及各任务设置

本节以 v6.21.2 的任务配置、Windows GUI、集成协议和实际 `set_params` 实现交叉核对。`enable` 是所有原生任务的通用开关，GUI 的任务名称、启用、顺序、复制、删除及日志属于宿主编排。下列“原生参数”用于定位上游语义，迁移到 MaaFW 后需重新实现对应事件、策略及结果契约。

来源：[任务表单](https://github.com/MaaAssistantArknights/MaaAssistantArknights/tree/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/TaskQueue)、[任务配置](https://github.com/MaaAssistantArknights/MaaAssistantArknights/tree/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Single/MaaTask)、[集成协议](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/protocol/integration.md)。

| ID               | 功能／设置       | 原版行为与兼容要点                                                                                                                                                                                                                                                                         |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TASK-START-01    | 开始唤醒         | 自动连接、按设置启动模拟器与游戏、进入首页；处理断线确认及已适配登录／公告／签到弹窗。模拟器启动是宿主设置，游戏启动／登录是游戏流程。                                                                                                                                                     |
| TASK-START-02    | 客户端与账号切换 | 六种客户端 `Official/Bilibili/txwy/YoStarEN/YoStarJP/YoStarKR`；`start_game_enabled`、`account_name`。只切换已登录账号，以登录名唯一片段匹配；开关及账号随配置保存，不是账号密码登录管理。                                                                                                 |
| TASK-FIGHT-01    | 关卡导航         | 当前／上次、全部受支持主线、主线 `-NORMAL/-HARD` 难度、资源与芯片本、OF-1/OF-F3、当期／复刻 SS、指定剿灭。CE-6/LS-6 可回退第五关；复刻 `SSReopen-<前缀>` 有专用连续流程。导航依赖当代资源，不是任意关卡文字都可执行。                                                                      |
| TASK-FIGHT-02    | 关卡选择与日程   | 关卡下拉、手动输入、隐藏当日未开放、备选关卡、指定剿灭；备选是按开放日选择首个可用项，不是执行失败后换关。周日～周六周计划按服务器时区、04:00 游戏日决定跳过。                                                                                                                             |
| TASK-FIGHT-03    | 消耗与停止       | 药剂数量 `medicine`、源石数量 `stone`、指定次数 `times`、指定材料 `drops`；次数／材料等条件短路停止，多个掉落目标任一达到即止。GUI 勾选源石会把药量设为 999；Maa Verge 不应把此上游默认转化为未授权预算。                                                                                  |
| TASK-FIGHT-04    | 临期药与节省模式 | 启用临期药、过期天数 `medicine_expire_days`、活动时临期药策略、允许保存源石开关、节省理智碎石 `DrGrandet`。临期药独立于普通药数量上限，旧 `expiring_medicine` 仅作兼容。                                                                                                                   |
| TASK-FIGHT-05    | 代理倍率与次数   | `series=-1` 不切换、`0` AUTO、`1–10` 固定；旧外服资源仅到 6，受资源 flag 限制。固定倍率按整轮对齐次数，AUTO 能按剩余次数调小；是否隐藏倍率、关卡重置模式是 GUI 偏好。                                                                                                                      |
| TASK-FIGHT-06    | 材料目标两种模式 | 本次刷取数量由 `drops` 完成；目标库存由 GUI 基于仓库缓存算缺口、动态更新并跳过已足够任务。材料目标不会自行选择关卡。                                                                                                                                                                       |
| TASK-FIGHT-07    | 结算与异常       | 代理勾选、掉落识别／累计、理智识别、升级继续、代理失败放弃后重战、游戏崩溃重启（需 `client_type`）；这些都是需独立迁移与验收的行为。                                                                                                                                                       |
| TASK-FIGHT-08    | 剿灭             | 当期／切城／龙门外环／龙门市区；全权委托入口、扫荡卡、周合成玉进度与满额停止；入口不存在可代表本周已完成。掉落不上传，不能用普通作战成功代替剿灭验收。                                                                                                                                     |
| TASK-FIGHT-09    | 数据汇报         | `report_to_penguin/penguin_id`、`report_to_yituliu/yituliu_id`、`server=CN/US/JP/KR`；GUI 三方服务设置与每次上传结果也属兼容范围。                                                                                                                                                         |
| TASK-INFRA-01    | 三种换班模式     | 常规自动计算 `mode=0`、自定义排班 `10000`、游戏预设队列一键轮换 `20000`。三种模式的设施顺序、无人机和心情阈值语义不同，不能只迁移一种。                                                                                                                                                    |
| TASK-INFRA-02    | 11 类设施        | 制造站 `Mfg`、贸易站 `Trade`、发电站 `Power`、控制中枢 `Control`、会客室 `Reception`、办公室 `Office`、回收站 `Recycle`、宿舍 `Dorm`、加工站 `Processing`、训练室 `Training`、副手 `AssistantChange`；逐类启用与排序。常规模式的列表是启用集合，算法决定实际顺序；自定义／轮换按列表执行。 |
| TASK-INFRA-03    | 常规排班算法     | 识别设施产物、心情及基建技能，选择单设施和跨设施组合；低心情换出、宿舍恢复及跨房冲突处理；红松骑士团、感知信息、人间烟火、深海猎人各有开关及冲突／优先级。                                                                                                                                 |
| TASK-INFRA-04    | 菲亚梅塔恢复     | 独立启用、最多三名目标、从清流、可露希尔、但书、巫恋、龙舌兰、歌蕾蒂娅、琴柳、承曦格雷伊、温蒂、槐琥、至简、旅骨等可选目标中选当前心情最低者恢复；`fiammetta_recovery_enabled/fiammetta_targets`，仅常规模式。                                                                             |
| TASK-INFRA-05    | 无人机           | 不使用、龙门币／合成玉／作战记录／赤金／源石碎片／芯片；`drones`。贸易站巫恋组优先等算法细节不能由一次点击代替；自定义模式另从排班文件控制。                                                                                                                                               |
| TASK-INFRA-06    | 宿舍与补货       | 工作心情阈值 `threshold`、不安排已进驻干员 `dorm_notstationed_enabled`、低信赖填充 `dorm_trust_enabled`、搓玉自动补货 `replenish`。                                                                                                                                                        |
| TASK-INFRA-07    | 会客室           | 信息板信用、线索交流、线索赠送三个独立开关；一键重复线索赠送／不同客户端布局、线索板放置或取下及容量处理。好友访问与商店购物属于另一任务。                                                                                                                                                 |
| TASK-INFRA-08    | 训练与副手       | 训练室继续未完成专精 `continue_training`、训练人员／被训练者保护、副手换人；训练会消耗材料，必须单列结果和消耗审核。                                                                                                                                                                       |
| TASK-INFRA-09    | 自定义排班管理   | 内置／用户文件、文件路径、方案选择 `filename/plan_index`、方案时段及按时间切换、显示前后说明、房间名单／候补／自动补位／排序／跳过／产物、无人机和菲亚梅塔配置；周计划按游戏日控制执行。                                                                                                   |
| TASK-RECRUIT-01  | 自动公招         | 领取已完成招募、识别标签／组合／星级、选择标签、设置时间、确认新招募；最大次数 `times`、刷新 `refresh`、3/4/5/6 星选择与确认 `select/confirm`、强制刷新等 GUI 控制。                                                                                                                       |
| TASK-RECRUIT-02  | 标签策略         | 三星首选 `first_tags`、额外标签策略 `extra_tags_mode=0/1/2`、保留并跳过 `preserve_tags`；兼容旧 `skip_robot`，旧语义只映射支援机械。                                                                                                                                                       |
| TASK-RECRUIT-03  | 时长与许可保留   | 3/4 星时长及 `recruitment_time`、仅计算时是否自动设时 `set_time`、三星招募许可证保留数量 `level3_recruitment_permit_reserve`；许可证识别失败时跳过三星，4 星以上不受保留数影响。                                                                                                           |
| TASK-RECRUIT-04  | 加急与汇报       | 加急开关 `expedite`、公招统计上传与服务器／用户 ID；当前 `expedite_times` 已失效，不能作为严格加急上限。                                                                                                                                                                                   |
| TASK-MALL-01     | 免费信用与好友   | 领取信用、访问好友 `visit_friends`、GUI 每日一次及最近完成时间；每日一次不是 Core 参数。                                                                                                                                                                                                   |
| TASK-MALL-02     | 借助战赚信用     | OF-1、`credit_fight`、编队栏位 `formation_index`、GUI 每日一次与上次成功时间；当前／上次关卡模式存在跳过条件。                                                                                                                                                                             |
| TASK-MALL-03     | 信用购物         | `shopping`、优先 `buy_first`、黑名单 `blacklist`、溢出时忽略黑名单 `force_shopping_if_credit_full`、只买折扣 `only_buy_discount`、保留信用 `reserve_max_credit`；列表是商品名关键字匹配，优先商品有例外购买语义。                                                                          |
| TASK-AWARD-01    | 七类奖励开关     | 日常／周常 `award`、邮件 `mail`、限定池免费单抽 `recruit`、幸运墙 `orundum`、限时开采 `mining`、周年月卡 `specialaccess`、限时签到 `signinevent`；活动条件和免费确认须逐类核对。                                                                                                           |
| TASK-THEME-01    | 游戏主界面主题   | 候选主题列表 `themes`、单个固定／多个随机、空列表跳过；回首页、滚动查找及 OCR 修正。切换后可能触发其他任务的不支持主题回退，不能混为应用明暗主题。                                                                                                                                         |
| TASK-DATA-01     | 更新数据         | GUI 组合任务 `UserDataUpdate`，独立干员／仓库开关、每次／每天／每周、各自最后成功时间、共享缓存；原生只有 `OperBox`／`Depot`，没有同名原生任务。                                                                                                                                           |
| TASK-DATA-02     | 一图流练度来源   | 启用第三方数据源和只读 Token 后，干员更新改由 GUI 拉取一图流，不通过模拟器；含技能／专精／模组列。截图 OCR 与第三方来源必须保留来源和完整性差别。                                                                                                                                          |
| TASK-DEPOT-01    | 库存保持计划     | GUI 任务 `DepotMaintain`；多条关卡／材料／目标库存／药剂／源石计划、增删／拖动、低高级芯片／龙门币／红票／技能书及当期活动预设。无同名原生任务。                                                                                                                                           |
| TASK-DEPOT-02    | 库存保持高级策略 | 任务前更新库存、AUTO 倍率、药／石字段开关、48 小时临期药、活动期间跳过、资源本全天开放时跳过、仅第一条不足、按库存达成率排序、手动关卡；双芯片折算芯片组库存 `CountDualChipAsChipPack`（每个折算两个，只影响达标／缺口，不自动合成）。                                                     |
| TASK-DEPOT-03    | 库存与理智状态   | 先用缓存预检，识别后逐计划重算；预检已充足项不在本轮追加；实时掉落累计影响后续缺口；理智估计和无补充手段时跳过、临期药用尽证据、不可开放关卡跳过；库存不是实时账号数据库。                                                                                                                 |
| TASK-PROGRESS-01 | 干员养成         | 有序 `plans`：干员、职业消歧、精英化 `elite=1/2`、通用技能等级 `skill_level=2–7`、三技能专精数组 `skill_mastery=0–3`；配置增删／排序和字段开关。实际训练／精英化会消耗材料，与干员识别不同。                                                                                               |
| TASK-CUSTOM-01   | 自定义任务       | GUI 调试模式入口填资源任务名（`CustomTask` 仅 `isDebugOnly:true`），原生 `Custom.task_names` 为“首个识别命中的入口及后续图”，不是数组逐项执行；额外 `params` 由具体插件解释。任意资源任务可能包含消耗与危险操作，需逐入口审核。                                                            |
| TASK-CLOSE-01    | 关闭游戏         | 原生 `CloseDown.client_type`；GUI 可由完成后动作触发。关闭游戏、关闭模拟器、退出 MAA 互相独立。                                                                                                                                                                                            |

### 集成战略：主题、模式及条件设置

来源：[肉鸽手册](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/introduction/integrated-strategy.md)、[RoguelikeTask.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Single/MaaTask/RoguelikeTask.cs)、[AsstRoguelikeTask.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Models/AsstTasks/AsstRoguelikeTask.cs)、[RoguelikeTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaCore/Task/Interface/RoguelikeTask.cpp)。游戏过程还包括导航、招募／升级、编队、地图路线、遭遇、商店、投资、藏品／奖励选择、战斗及结算，不能只迁移下列表单。

| ID            | 范围             | 功能／设置                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-ROGUE-01 | 六主题           | 傀影 `Phantom`、水月 `Mizuki`、萨米 `Sami`、萨卡兹 `Sarkaz`、界园 `JieGarden`、黑流树海 `BlackFlow`；主题／模式／难度／分队／职业组合列表随主题联动。                                                                                                                                                                                                                                                                         |
| TASK-ROGUE-02 | 普通模式         | 刷分／等级 `mode=0`、投资 `1`、凹开局 `4`、月度小队 `6`、深入调查 `7`；实际支持组合随主题限制；`2` 已移除、`3` 未开放，Core 拒绝。                                                                                                                                                                                                                                                                                            |
| TASK-ROGUE-03 | 次数与停止       | `starts_count`、`difficulty`、`stop_at_final_boss`、`stop_at_max_level`；最终 Boss 停止只适用上游指定主题，不能无条件展示为所有主题有效。                                                                                                                                                                                                                                                                                     |
| TASK-ROGUE-04 | 开局干员         | 1–3 顺位 `core_char_list[{name,use_support}]`、第 2/3 顺位启用、顺位职业互斥、每位独立助战、非好友助战 `use_nonfriend_support`；兼容旧 `core_char/use_support`。查找有页数和希望限制。                                                                                                                                                                                                                                        |
| TASK-ROGUE-05 | 凹精二           | `start_with_elite_two/only_start_with_elite_two`，仅专业分队和相应模式有效；首位借助战与凹直升互斥。                                                                                                                                                                                                                                                                                                                          |
| TASK-ROGUE-06 | 投资             | `investment_enabled/investments_count/stop_when_investment_full/investment_with_more_score`，包括投资数量、满额停止、投资时招募购物刷分；骰子刷新商店 `refresh_trader_with_dice`。                                                                                                                                                                                                                                            |
| TASK-ROGUE-07 | 凹开局奖励       | 烧水分队 `collectible_mode_squad`、开局奖励 `collectible_mode_start_list`（热水壶、护盾、源石锭、希望、随机、钥匙、骰子、构想及 GUI／序列化支持的券）、购物 `collectible_mode_shopping`。                                                                                                                                                                                                                                     |
| TASK-ROGUE-08 | 月度／深入调查   | 月度小队自动切换 `monthly_squad_auto_iterate`、检查通讯 `monthly_squad_check_comms`、深入调查自动切换 `deep_exploration_auto_iterate`。                                                                                                                                                                                                                                                                                       |
| TASK-ROGUE-09 | 萨米板子         | 使用密文板 `use_foldartal`；第一层远见板 `first_floor_foldartal`、生活至上分队开局板列表 `start_foldartal_list`，按分队和模式生效。                                                                                                                                                                                                                                                                                           |
| TASK-ROGUE-10 | 萨米坍缩范式     | `mode=5`；`check_collapsal_paradigms/double_check_collapsal_paradigms/expected_collapsal_paradigms`；检测、二次核验、期望范式列表，首个范式不符则重开。                                                                                                                                                                                                                                                                       |
| TASK-ROGUE-11 | 萨卡兹           | 快速一层 `10001`；种子投资 `start_with_seed`（投资模式且点刺成锭／后勤分队）；种子开关与文本。                                                                                                                                                                                                                                                                                                                                |
| TASK-ROGUE-12 | 界园             | 找常乐 `20001`、`find_playTime_target=1/2/3` 对应令／黍／年；铜钱与地图节点处理。                                                                                                                                                                                                                                                                                                                                             |
| TASK-ROGUE-13 | 黑流策略         | `blackflow_strategy`：`baby_animal/investment/burn_with_investment/burn/ending1/ending2/ending3`；刷等级目标结局、机械师快速飞三层；具体适用模式和解锁条件以源码为准。                                                                                                                                                                                                                                                        |
| TASK-ROGUE-14 | 黑流襁褓动物     | Core `30001` 与 `blackflow_cultivation_target` 支持猫／羽蛇／狗／刻耳柏洛斯；GUI 读旧配置时已合并迁移成刷开局 `30003`，不是仍有独立可选 GUI 模式。                                                                                                                                                                                                                                                                            |
| TASK-ROGUE-15 | 黑流刷开局       | `30003`，准备分队／目标分队、准备局独立职业组 `collectible_mode_roles` 与干员顺位 `collectible_mode_core_char_list`（缺省分别继承 `roles/core_char_list`）、两只动物数量条件 `blackflow_start_animals`、奖励多选位掩码 `blackflow_start_rewards=0–4095`、准备局机械师快飞。奖励含未编号物／调查预付款／空间租赁／退行补偿／林间代步／巢寄生及羽蛇的六种蓝奖励；准备局与目标局状态分离，奖励识别失败停止留图，不应误选或重放。 |
| TASK-ROGUE-17 | 黑流第一层实托邦 | `blackflow_start_utopia` 与目标局十二奖励完整排序 `blackflow_start_reward_priority`；难度 6 及以上才可能出现。目标局按排序选支援，三头犬可再选一次；进入第一层识别实托邦，命中保留该局、未命中重开准备局。与不启用实托邦时“支援页不选奖励直接保留”不同。                                                                                                                                                                      |
| TASK-ROGUE-16 | 状态与结果       | 等级／投资／范式／路线／黑流里程碑／库存清理／废料交易／开局进度等回调，暂停部署与游戏 FPS 前提；错误、重开、达到目标和通关应区分。                                                                                                                                                                                                                                                                                           |

### 生息演算（工具箱常驻活动）

来源：[小工具手册](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/introduction/tools.md)、[Reclamation.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Single/Settings/Reclamation.cs)、[ReclamationUserControlModel.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/ViewModels/UserControl/Toolbox/ReclamationUserControlModel.cs)。v6.21.2 已从主任务队列移到「工具箱 → 牛杂 → 常驻活动」，配置保存于 `Toolbox.MiniGame.Reclamation`；Core 仍注册 `Reclamation`。旧队列入口属于历史迁移兼容。

| ID         | 功能／设置                | 兼容要点                                                                                                                             |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| TASK-RA-01 | 沙洲遗闻 Tales 无存档 `0` | 进出关卡刷生息点数、结束清商店 `clear_store`；需对应起始页、无存档和空编队，不承诺自动导航。                                         |
| TASK-RA-02 | Tales 有存档 `1`          | 制造道具 `tools_to_craft`、连点／长按 `increment_mode`、单轮制造上限 `num_craft_batches`；驻扎地起始、结算第一天且短期无敌袭等前提。 |
| TASK-RA-03 | 重启锚点 RA-1 `16`        | 精耕细作、建设、交付和结算循环。                                                                                                     |
| TASK-RA-04 | 重启锚点 RA-15 `32`       | 圣聆初雪完成 60 杀，编队／助战与已通关前提。                                                                                         |
| TASK-RA-05 | 重启锚点 RA-4 `48`        | 筹划经营、赤金解锁区域、维什戴尔击杀 Boss，编队与设施前提。                                                                          |
| TASK-RA-06 | 关闭主题                  | `Fire` 沙中之火已关闭，仅历史兼容，不列为可执行功能。                                                                                |

## 自动战斗与作业工具

来源：[CopilotView.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UI/CopilotView.xaml)、[CopilotViewModel.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/ViewModels/UI/CopilotViewModel.cs)、[作业手册](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/introduction/copilot.md)、[战斗协议](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/protocol/copilot-schema.md)。

| ID         | 功能／设置     | 兼容要点                                                                                                                                                                         |
| ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| COPILOT-01 | 三工作区       | 普通战斗 `Copilot`、保全 `SSSCopilot`、悖论 `ParadoxCopilot`，各自文件格式、起始画面、列表约束不同；悖论列表兼容旧路径字符串和带 ID 的对象。                                     |
| COPILOT-02 | 作业输入       | 本地 JSON 选择／拖放、剪贴板粘贴／作业站代码、批量导入、作业集、内置／本地文件列表、解析校验和缓存；显示关卡、作者、描述／视频和地图链接。                                       |
| COPILOT-03 | 多作业队列     | 添加普通／突袭、导航关卡名覆盖、勾选执行、拖拽排序、删除单条、清除全部／未勾选、配置持久化；普通列表要求同一区域，失败／理智不足／非三星停止。                                   |
| COPILOT-04 | 自动编队       | `formation/formation_index`，当前或 1–4 编队；会清空当前编队。按干员／替代组、技能和练度需求编队；保全无效、悖论须手选技能。                                                     |
| COPILOT-05 | 追加与低信赖   | 启用追加干员列表、编辑名称／技能及 GUI 支持的模组偏好、`user_additional`；自动低信赖补位 `add_trust`、忽略属性要求 `ignore_requirements`。                                       |
| COPILOT-06 | 助战           | `support_unit_usage=0/1/2/3`（不使用、仅补缺、指定、随机）、`support_unit_name`；GUI 助战策略及其编队前提。                                                                      |
| COPILOT-07 | 一图流练度辅助 | 手动同步练度、最近同步时间、启用练度辅助编队；第三方配置前提、缺失／过期数据及忽略要求标记。                                                                                     |
| COPILOT-08 | 循环与用药     | 循环启用／次数 `loop_times`；普通单文件与保全支持方式不同；`use_sanity_potion` 是无数量上限许可，必须另做消耗审核。                                                              |
| COPILOT-09 | 评分与站点链接 | 线上作业点赞／点踩、通关后评分条件、作业网页／攻略视频／地图／编辑器外链。源码未提供完整社区账号／收藏／发布管理；不能因站点可用就当成本地 GUI 功能。                            |
| COPILOT-10 | 战斗协议执行   | 关卡与坐标、干员／替代组／练度／模组、击杀数／费用／等待触发、部署／撤退／技能／速度／暂停／镜头等受支持动作、演习、结果与日志；须按协议版本迁移，不是播放一串点击。             |
| COPILOT-11 | 保全协议       | 初始准备、各层编队／工具人／装备策略、替换和晋升、分关作业与循环；手动完成开始部署前的准备。                                                                                     |
| COPILOT-12 | 悖论协议       | 干员悖论关卡、单文件或列表及条目标识、手选技能和开始模拟画面；不要复制普通自动编队／循环设置。                                                                                   |
| COPILOT-13 | 作业制作辅助   | 浏览器作业编辑器／PRTS.Map 外链、带坐标 debug 地图截图、演习测试入口。编辑器位于外部站点，不是 MAA 内嵌编辑器。                                                                  |
| COPILOT-14 | 视频识别       | `VideoRecognition.filename` 是 Core 离线作业视频识别入口；v6.21.2 Windows GUI 明确只支持 JSON 作业，已不支持视频识别；Core 注册仍在，按集成入口单列，不能宣称 GUI 有视频工作区。 |

## 工具箱及常驻／限时小工具

来源：[ToolboxView.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UI/ToolboxView.xaml)、[ToolboxViewModel.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs)、[Toolbox.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Single/Settings/Toolbox.cs)、[StageManager.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Services/StageManager.cs)、[小工具手册](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/introduction/tools.md)。

| ID              | 功能／设置         | 兼容要点                                                                                                                                                                                                            |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TOOL-RECRUIT-01 | 公招识别／计算     | 在标签页识别组合；3/4/5/6 星自动选标签开关、3/4 星时长、自动设时、显示持有干员潜能；计算不等于确认新招募。                                                                                                          |
| TOOL-OPER-01    | 干员识别           | 持有／未持有、星级／精英化／等级／潜能、头像或表格展示、缓存和最近同步时间；可从截图 Core 或一图流获取，后一来源额外有技能／专精／模组。                                                                            |
| TOOL-OPER-02    | 干员导出           | 剪贴板、JSON、Markdown、CSV；结果供公招潜能与作业练度辅助使用。                                                                                                                                                     |
| TOOL-DEPOT-01   | 仓库识别           | 首页导航或手工仓库养成材料最左侧开始，遍历材料、数量和图标展示、缓存和上次同步时间；与更新数据／库存保持共享，不是当前屏 OCR 文本。                                                                                 |
| TOOL-DEPOT-02   | 仓库导出           | ArkPlanner（企鹅物流规划器）、Lolicon（明日方舟工具箱）、Markdown、CSV。                                                                                                                                            |
| TOOL-GACHA-01   | 牛牛抽卡           | **真实账号单抽／十连**、风险确认、过程截图展示及停止；“不再提示”有控件和存储字段，但当前启动代码仍默认显示免责声明，不能据控件认定重启免提示有效。会消耗抽卡资源，不能混同免费限定池单抽或模拟抽卡。                |
| TOOL-PEEP-01    | 牛牛监控           | 实时截图预览、开始／停止、目标 FPS 和当前 FPS；截图太慢时主动降目标；不是自动战斗或视觉 Agent。                                                                                                                     |
| TOOL-MINI-01    | 牛杂入口与范围     | 名称／分类选择、常驻活动（含生息演算）／常驻功能／当期限时活动可见性、活动表动态入口、开始／停止与运行日志；历史活动不代表当前有效。                                                                                |
| TOOL-MINI-02    | 隐秘战线           | 结局 A–E、事件分支默认／支援作战平台／游侠／诡影迷踪，按 `MiniGame@SecretFront@Begin@EndingX@事件` 组装入口。                                                                                                       |
| TOOL-MINI-03    | 活动商店兑换       | `SS@Store@Begin`；数据增补仪、数据增补条、龙门币、家具零件及其他自定义关键字黑名单，`params.event_shop.blacklist`。实际花费活动代币，需预算与结果复核。                                                             |
| TOOL-MINI-04    | 票证／生息商店     | 绿票商店、黄票商店、生息演算商店兑换；分别审核货币、目标商品、当前资源节点与结束条件，不能统称“免费领奖”。                                                                                                          |
| TOOL-MINI-05    | 自动提升潜能       | `MiniGame@AutoRaisePotential@Begin`；是否允许在中坚信物不足时使用普通信物 `auto_raise_potential.use_normal_token`，默认关闭。                                                                                       |
| TOOL-MINI-06    | 缺口材料合成       | `MiniGame@MaterialSynthesis@Begin`；从游戏材料缺口入口自动合成、选干员、返回与结果／不足反馈，附 GUI 演示视频；会消耗材料及龙门币。                                                                                 |
| TOOL-MINI-07    | 刷傀影维多利亚皇冠 | `MiniGame@CursedRelic@Begin`，从傀影肉鸽主菜单可见探索按钮的状态开始；StageManager 已内置，手册的常驻功能列表未枚举此项。                                                                                           |
| TOOL-PIXEL-01   | 像素画素材输入     | 图片文件／拖放、剪贴板图片／文件／文本（取前四个字素，中文自适应 1–4 字网格、英文数字单行，白底黑字，字体与字号由算法固定，未提供独立字体／字号／文字颜色／背景编辑控件）、空边裁剪；预览拖动、滚轮缩放、重置视图。 |
| TOOL-PIXEL-02   | 像素转换           | 裁切／完整容纳／拉伸，插画／无抖动／Floyd–Steinberg／Atkinson，亮度／对比度／饱和度、是否绘制白色、重置参数；转换为 24×24、40 色色板的分色坐标。                                                                    |
| TOOL-PIXEL-03   | 像素执行           | `MiniGame@PixelPaint@Begin`；按色分组 `pixel_paint.groups`、同行拖动 `swipe`、每格等待 `grid_delay`（兼容 `grid_click_delay`）、完成／失败反馈；活动有效性取决于当前游戏与资源。                                    |

## Core 集成入口及易误判边界

固定 [Assistant.cpp 注册表](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaCore/Assistant.cpp) 有 19 类非 Debug 任务：`StartUp/CloseDown/Fight/Recruit/Infrast/Mall/Award/SwitchTheme/Roguelike/Copilot/SSSCopilot/ParadoxCopilot/Depot/OperBox/Reclamation/Custom/SingleStep/VideoRecognition/OperProgress`。`UserDataUpdate`、`DepotMaintain`、工具结果缓存／导出、周期和每日一次均是 GUI／宿主能力。真实抽卡和小游戏通过既有 Core 流程封装，不能以原生类型数量衡量功能完整度。

- `SingleStep` 仅 `type=copilot`，`subtype=stage/start/action`；`stage` 用 `details.stage_name`，`action` 实际调用作业动作解析器，需 `details.actions` 数组。集成文档中的单个 action 示例不应直接当实现依据。来源：[SingleStepTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaCore/Task/Interface/SingleStepTask.cpp)。
- 悖论 `ParadoxCopilotTask.cpp` 实际同时支持单 `filename`、`list:[{id,filename}]` 和旧 `list:["路径"]`；旧字符串条目回调 ID 为 `-1`。显式 `filename` 优先，不能拿普通作业列表结构替代。
- `OperProgress.plans` 实际接受 `role/name/elite/skill_level/skill_mastery`，拒绝无效名称、职业／召唤物、非法等级及未知字段；运行时不允许修改。来源：[OperProgressTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaCore/Task/Interface/OperProgressTask.cpp)。
- 原版任务参数“支持运行中修改”与不可修改字段是独立兼容点；MaaFW 应使用明确运行快照及允许的动态字段，不能在原生任务运行中替换资源文件。
- 上述功能清单是固定基线的源码盘点，不是 Maa Verge 的完成声明；活动目录、关卡、干员技能、战斗流程和各客户端资源还需逐版本维护与真机验收。

## 桌面设置完整清单（Windows WPF 基线）

本节以 v6.20.1 逐组盘点，并对 v6.21.2 的设置视图绑定、动作入口及配置增量复核；以下来源链接已固定到 v6.21.2。核对 `Views/UserControl/Settings`、对应 ViewModel、`Configuration/Global` 和 `Configuration/Single/Settings`。表内代码名为上游存储或绑定名；多个子开关共享一行时仍须分别实现、保存和验收。原版 WPF 的设置大多属于 Maa Verge 宿主服务或桌面外壳，不能作为 MaaFW Pipeline 的任务参数直接透传。全局设置与当前配置设置须分别建模。

### 配置管理与通用设置行为

来源：[SettingsViewModel.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/ViewModels/UI/SettingsViewModel.cs)、[Root.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Root.cs)、[其他说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/introduction/others.md)。

| 编号       | 原版能力及子项                                                         | MaaFW 兼容责任／条件                                                           |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| SET-CFG-01 | 当前配置选择；以当前配置为模板新增命名配置；重名检查；删除配置与确认   | 宿主保存独立任务、连接、运行、通知、第三方、作业及工具偏好；全局设置不跟随切换 |
| SET-CFG-02 | `--config <配置名>` 启动指定配置；定时指定配置                         | 宿主启动参数及调度器；迁移时建立稳定配置标识                                   |
| SET-CFG-03 | 自动保存；右键半选／带星号／“仅一次”设置重启恢复；主任务右键行为可反转 | 区分持久配置与本次覆盖，不能把 `null` 半选当成未配置或永久值                   |
| SET-CFG-04 | 复制整个 `config` 目录迁移配置；旧配置自动迁移、容错读取与默认补齐     | 导入原版数据时做显式转换和版本校验；不能直接覆盖 Maa Verge 业务数据库          |
| SET-CFG-05 | 设置搜索；设置组拖动排序；折叠展开状态保存                             | 桌面 UI；`SettingOrders`、`CollapesStates`                                     |

v6.21.2 的工具箱偏好按 `Recruitment`、`OperBox`、`Gacha`、`Peep`、`MiniGame` 分节保存；原生息演算任务配置移入 `Toolbox.MiniGame.Reclamation`，旧任务入口及字段由迁移器转换。导入兼容需要识别两种存储结构，保留用户原值；内部教程版本号仅用于恢复／重播引导，不作为新增用户设置。来源：[ToolboxSectionMigrationConverter.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Converter/Specific/ToolboxSectionMigrationConverter.cs)。

### 连接设置与连接诊断

来源：[ConnectSettingsUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/ConnectSettingsUserControl.xaml)、[ConnectSettings.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Single/Settings/ConnectSettings.cs)、[连接附加配置](https://github.com/MaaAssistantArknights/MaaAssistantArknights/tree/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Models/EmulatorConnectionExtra)。

| 编号       | 原版能力及子项                                                                                                                            | MaaFW 兼容责任／条件                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| SET-CON-01 | 自动检测连接 `AutoDetect`；每次重新检测 `AlwaysAutoDetect`                                                                                | 宿主设备发现；重新检测不等于启动模拟器或运行任务                                               |
| SET-CON-02 | 连接预设：通用、蓝叠、MuMu 12、MuMu ARM、雷电、Androws、AVD、夜神、逍遥、PC、WSA、兼容模式、备用分辨率、通用无截图纠错                    | 按当前 MaaFW Controller 和平台逐项映射；预设名称不能冒充已支持的驱动                           |
| SET-CON-03 | 连接地址、地址历史、手动 ADB 路径、文件选择                                                                                               | 宿主解析和校验；地址历史是每配置偏好                                                           |
| SET-CON-04 | MuMu 12 截图增强开关、安装路径、实例编号、桥接连接；增强触控开关                                                                          | MaaFW 模拟器 extras；原版增强触控依赖截图增强开启，该条件不能照抄为 Maa Verge 的截图／输入耦合 |
| SET-CON-05 | 雷电截图增强开关、安装路径、手动指定实例编号开关、实例编号                                                                                | MaaFW extras；校验实例归属与实际 SDK 能力                                                      |
| SET-CON-06 | MuMu ARM 连接预设及检测测试                                                                                                               | Windows 上游预设；可用性取决于设备与宿主，不能据名称认定 macOS 已验收                          |
| SET-CON-07 | PC 窗口截图：FramePool、PrintWindow、ScreenDC、DesktopDupWindow                                                                           | 原生 Windows 窗口 Controller；WindowPos 鼠标模式只允许 PrintWindow                             |
| SET-CON-08 | PC 鼠标：抢占、PostMessage＋CursorPos、PostMessage＋WindowPos、AnchoredTouch；纯 SendMessage／PostMessage 及 SendMessage 变体仅展示且禁用 | 记录可用与灰显项；不要把灰显方式作为用户可运行能力                                             |
| SET-CON-09 | PC 键盘：抢占、SendMessage、PostMessage；运行时静音                                                                                       | Windows 原生控制及系统音频；截图／鼠标／键盘分别持久化                                         |
| SET-CON-10 | 连接／截图测试、耗时与诊断信息；PC 窗口还原、最小化                                                                                       | 宿主诊断及系统集成；测试是用户明确发起的真实设备动作                                           |
| SET-CON-11 | 连接失败重启模拟器；允许重启 ADB；允许强制杀死并重启 ADB                                                                                  | 宿主恢复策略；必须保护其他实例及共享 ADB，不应直接照搬全局杀进程                               |
| SET-CON-12 | 触控模式：MiniTouch、MaaTouch、ADB、MaaFwAdb、MuMu 增强触控                                                                               | 以 MaaFW 固定 SDK 可用方式映射；各模式长按、拖拽、按键能力单独验证                             |
| SET-CON-13 | 强制替换 ADB；退出时关闭 ADB；ADB Lite 开关                                                                                               | 宿主安装／进程管理；不是游戏 L3 事件，保留用户选择及影响提示                                   |
| SET-CON-14 | 蓝叠附加配置文件路径与关键字 `BluestacksExtra.ConfigPath/ConfigKeyword`                                                                   | 配置级兼容字段，未出现在常规页面；只读检测适配，避免丢失迁移信息                               |

### 启动设置

来源：[StartSettingsUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/StartSettingsUserControl.xaml)、[StartUpSettings.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Single/Settings/StartUpSettings.cs)。

| 编号       | 原版能力及子项                                                                               | MaaFW 兼容责任／条件                                               |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| SET-STA-01 | 开机启动 MAA `StartSelf`                                                                     | 桌面外壳／操作系统；原版不作为配置级业务任务                       |
| SET-STA-02 | 启动后最小化 `MinimizeOnStartup`；启动后直接运行任务 `RunDirectly`                           | 前者全局 GUI，后者当前配置；不得在普通开发或测试启动时自动操作账号 |
| SET-STA-03 | 启动 MAA 后自动打开模拟器 `StartEmulator`；连接失败重启模拟器 `RestartEmulatorWhenAdbFailed` | 宿主受限进程启动与恢复                                             |
| SET-STA-04 | 模拟器程序／快捷方式路径、附加启动参数、等待秒数、选择与测试                                 | 宿主显式配置；参数不能暴露成模型任意命令工具                       |
| SET-STA-05 | 启动 MAA 后自动打开 PC 客户端 `StartPcClient`；连接失败重启 PC 客户端                        | Windows 客户端宿主生命周期，独立于模拟器配置                       |
| SET-STA-06 | PC 客户端路径、附加参数、等待秒数、选择与测试                                                | 原生 Windows；不能用 Android `StartUp` 参数代替                    |
| SET-STA-07 | 更新后首次启动跳过启动自动运行 `SkipStartupAutoRunAfterUpdate`                               | 更新器与启动协调；避免更新重启意外再次开局                         |

### 运行／游戏设置与完成后动作

来源：[GameSettingsUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/GameSettingsUserControl.xaml)、[RuntimeSettings.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Single/Settings/RuntimeSettings.cs)、[PostActionSetting.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Models/PostActionSetting.cs)。

| 编号        | 原版能力及子项                                                           | MaaFW 兼容责任／条件                                                 |
| ----------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| SET-RUN-01  | 客户端：官服、Bilibili、国际服、日服、韩服、繁中；客户端切换资源联动     | 宿主资源视图、包名、语言、游戏日时区与 L3 识别资源；不能只切显示名称 |
| SET-RUN-02  | 使用暂停部署 `DeployWithPause`                                           | MaaFW 战斗事件与作业执行策略；单独验证游戏操作时序                   |
| SET-RUN-03  | 开始前脚本、结束后脚本；作业执行时也运行；手动停止时也运行               | 用户显式本地脚本，宿主权限与执行顺序；不向模型开放任意 Shell         |
| SET-RUN-04  | 防止系统休眠 `BlockSleep`；防止熄屏 `BlockSleepWithScreenOn`             | 桌面系统电源接口；按整次运行释放                                     |
| SET-RUN-05  | 运行时长上限开关／仅一次半选、分钟数（默认 240）、到期是否执行完成后动作 | 宿主期限与停止收敛；分钟上限 11451；不能仅停止 UI 计时               |
| SET-RUN-06  | 集成战略战斗完成后再停止 `RoguelikeDelayAbortUntilCombatComplete`        | 配置级隐藏／上下文偏好；区别立即停止与安全业务边界，不能称为暂停恢复 |
| SET-POST-01 | 无动作、退出游戏、返回 Android 首页                                      | 游戏／Controller 动作；原版退出游戏与返回首页互斥                    |
| SET-POST-02 | 退出模拟器、退出 MAA                                                     | 宿主进程与生命周期，确认所有设备任务结束后执行                       |
| SET-POST-03 | 锁屏、休眠、睡眠、关机                                                   | 操作系统能力，平台分别实现和验收                                     |
| SET-POST-04 | 无其他 MAA 时才执行、任务出错跳过全部完成后动作、仅一次                  | 宿主跨实例检查与失败策略；组合及互斥规则须保留                       |

### 定时执行

来源：[TimerSettingsUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/TimerSettingsUserControl.xaml)、[TimerSettings.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Global/TimerSettings.cs)、[Timer.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Global/Timer.cs)。

| 编号       | 原版能力及子项                                                   | MaaFW 兼容责任／条件                                                 |
| ---------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| SET-TIM-01 | 最多八组每日时间：启用／右键仅一次、小时、分钟、对应配置         | 全局调度规则，触发时固定任务快照及设备；处理重启、重复时刻与错过时刻 |
| SET-TIM-02 | 定时唤醒电脑 `ScheduledWakeUp`                                   | 原版 Windows 系统计划任务；其他系统独立方案，不计 MaaFW 游戏能力     |
| SET-TIM-03 | 强制定时启动：停止当前任务、重启游戏、开始新任务                 | 宿主停止及控制权转交；不能用 `AsstStop` 当暂停                       |
| SET-TIM-04 | 强制启动前显示窗口 `ShowWindowBeforeForceScheduledStart`         | 桌面窗口行为                                                         |
| SET-TIM-05 | 定时启动前系统通知及提前分钟数（1–1439）；外部通知复用此提前时间 | 宿主通知与调度共用字段，避免两个入口各存一份                         |
| SET-TIM-06 | 自定义配置选择 `CustomConfig`；原版提前两分钟重启切换配置        | 保留目标配置语义；Maa Verge 可在服务内切配置，但须明确功能等价与差异 |

### 通知设置与外部通知投递规则

来源：[NotificationSettingsUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/NotificationSettingsUserControl.xaml)、[ExternalNotificationSettingsUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/ExternalNotificationSettingsUserControl.xaml)、[ExternalNotification.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Single/Settings/ExternalNotification.cs)。

| 编号       | 原版能力及子项                                                                           | MaaFW 兼容责任／条件                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SET-NOT-01 | 系统通知总开关 `UseNotify`                                                               | 全局 GUI 偏好；各桌面通知权限和投递验收                                                               |
| SET-NOT-02 | 卡住检测开关、无进展分钟数（默认 30）、重复提醒间隔（默认 30 分钟）                      | 配置级 `Notification`；只读等待与真正卡住需区分                                                       |
| SET-NOT-03 | 定时前通知开关及提前分钟数                                                               | 与 SET-TIM-05 同一配置，不重复建模                                                                    |
| SET-NOT-04 | 外部通知总开关；添加多个配置、删除、测试发送                                             | 宿主网络服务；测试按钮会向第三方发送真实消息，例行验证使用隔离夹具                                    |
| SET-NOT-05 | 完成时发送、出错时发送、卡住时发送、定时前发送                                           | `SendWhenComplete/Error/Stalled`、`SendBeforeScheduledStart` 分别保存                                 |
| SET-NOT-06 | 每新增若干日志发送、数量阈值（1–10000）                                                  | `SendAfterLogCount/NewLogCount`                                                                       |
| SET-NOT-07 | 内容匹配发送、白名单表达式（多行正则）                                                   | `SendWhenContentMatches/Whitelist`；校验及匹配超时，不让无效表达式阻塞任务                            |
| SET-NOT-08 | 附带历史日志、最多条数（0–10000）、时间范围分钟数（0–10080）、过滤历史日志、黑名单表达式 | `IncludePreviousLogs/MaxEntries/TimeMinutes/FilterPreviousLogs/Blacklist`；不把筛选器误当游戏日志等级 |

| 编号        | 提供方         | 所有用户配置字段／注意事项                                                                                                                                |
| ----------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SET-PUSH-01 | Server酱       | SendKey                                                                                                                                                   |
| SET-PUSH-02 | Telegram       | BotToken、ChatId、TopicId（话题）                                                                                                                         |
| SET-PUSH-03 | Discord Bot    | BotToken、UserId；该快照 XAML 还残留 `WebhookUrl` 绑定，但模型与持久配置均无该字段，不能宣称此独立入口可用；Webhook 通过同表 SET-PUSH-10 的自定义模板实现 |
| SET-PUSH-04 | 钉钉           | AccessToken、Secret                                                                                                                                       |
| SET-PUSH-05 | SMTP 邮件      | Server、Port、Username／User、Password、From、To、UseSsl、RequiresAuthentication                                                                          |
| SET-PUSH-06 | Bark           | Server（可自建）、SendKey                                                                                                                                 |
| SET-PUSH-07 | Qmsg           | Server、Key、User、Bot                                                                                                                                    |
| SET-PUSH-08 | Gotify         | Server、Token                                                                                                                                             |
| SET-PUSH-09 | 自定义 Webhook | Url、逐行 Headers、Body；正文 `{title}`、`{content}`、`{time}` 占位符与 JSON 转义                                                                         |
| SET-PUSH-10 | Webhook 预设   | 自定义、Discord Webhook、KOOK 频道、KOOK 私信、MeoW、ntfy、企业微信；预设填充 Url／Headers／Body，用户替换令牌／目标标识                                  |

提供方字段来源补充：[Models/ExternalNotification](https://github.com/MaaAssistantArknights/MaaAssistantArknights/tree/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Models/ExternalNotification)、[WebhookPresetTemplate.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Services/ExternalNotification/WebhookPresetTemplate.cs)。所有凭据均属宿主秘密配置，不进入 Pipeline、运行事件或模型工具返回。

### 远程控制

来源：[RemoteControlUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/RemoteControlUserControl.xaml)、[RemoteControl.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Single/Settings/RemoteControl.cs)。

| 编号       | 原版能力及子项                                      | MaaFW 兼容责任／条件                                           |
| ---------- | --------------------------------------------------- | -------------------------------------------------------------- |
| SET-REM-01 | 拉取任务地址、上报状态地址、轮询毫秒数（默认 1000） | 宿主远控协议及请求校验；不同于本机 JSON-RPC                    |
| SET-REM-02 | 用户标识、设备标识、重新生成设备标识                | 身份与权限、实例隔离                                           |
| SET-REM-03 | 连接测试、开发者文档入口                            | 联网诊断；支持哪些远控命令须另按协议核对，不能只凭设置表算完成 |

### 第三方服务

来源：[ThirdPartyServiceSettingsUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/ThirdPartyServiceSettingsUserControl.xaml)、[ThirdParty.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Single/Settings/ThirdParty.cs)。

| 编号       | 原版能力及子项                                 | MaaFW 兼容责任／条件                                               |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| SET-3RD-01 | 企鹅物流掉落汇报开关、企鹅 ID                  | 宿主或经审阅的统计上传服务；不能把账号数据默认加入测试请求         |
| SET-3RD-02 | 一图流掉落汇报开关                             | 与游戏事件掉落证据绑定，失败不补造                                 |
| SET-3RD-03 | 一图流 OpenAPI Token、验证 Token、账户页面链接 | 宿主凭据与网络；Token 校验状态不能作为识别完成证据                 |
| SET-3RD-04 | 干员识别使用一图流 API；作业使用干员数据辅助   | 数据同步和作业编队条件；`OperBoxUseYituliuApi/EnableOperBoxAssist` |

### 更新设置与本地更新入口

来源：[VersionUpdateSettingsUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/VersionUpdateSettingsUserControl.xaml)、[Update.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Global/Update.cs)、[手动更新说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/introduction/others.md)。

| 编号       | 原版能力及子项                                                            | MaaFW 兼容责任／条件                                                                      |
| ---------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| SET-UPD-01 | 启动时检查更新（配置字段存在，但常规页面复选框灰显）、定时检查更新        | 全局宿主更新器；原版定时对应客户端当地 04:00／22:00                                       |
| SET-UPD-02 | 自动下载更新包、自动安装更新包、显示更新器控制台、显示更新器进度          | 发行与安装生命周期；不得让任务覆盖正在使用的文件                                          |
| SET-UPD-03 | 正式版／公测版／内测版通道                                                | 内测通道受 `AllowNightlyUpdates` 和已确认警告条件约束，默认列表不直接显示                 |
| SET-UPD-04 | GitHub 海外源／Mirror酱、强制 GitHub 全球源                               | 宿主来源策略；Maa Verge 应用、MaaCore、资源、MaaFW 独立选源／验证                         |
| SET-UPD-05 | Mirror酱 CDK、复制、有效期／剩余天数、查询失败提示、官网入口              | 只复用正式分发标识，不为兼容清单创造资源 ID                                               |
| SET-UPD-06 | HTTP 或 SOCKS5 代理类型、代理地址                                         | 原版支持范围；Maa Verge 当前 HTTP／HTTPS 代理与原版 SOCKS5 的差异须保留缺口               |
| SET-UPD-07 | 显示并复制 MAA／UI／Core／资源版本、构建时间、资源时间；查看更新日志      | 宿主可诊断来源，不能用应用版本代替资源提交                                                |
| SET-UPD-08 | 立即检查软件更新、手动资源更新、资源仓库链接、下载进度／错误              | 两类更新均需独立验收                                                                      |
| SET-UPD-09 | 拖入官方软件完整 ZIP 或 OTA ZIP；完整包确认；安装不完整时只允许完整包修复 | 原版 Windows 桌面入口；Maa Verge 的包型／签名不同，应独立设计导入，不直接接受原版可执行包 |
| SET-UPD-10 | 拖入官方 GitHub 资源仓库 ZIP、判断版本、导入后重载；拒绝不支持包          | 原版合并覆盖的实现不能移植为覆盖活动 generation；Maa Verge 应 staging 后闲时激活          |
| SET-UPD-11 | 更新对话框“不再显示更新” `DoNotShowUpdate`                                | 条件／对话框偏好；保留用户抑制提示语义                                                    |

### 界面、背景与热键

来源：[GuiSettingsUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/GuiSettingsUserControl.xaml)、[BackgroundSettings.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/BackgroundSettings.xaml)、[Global/Gui.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Global/Gui.cs)、[HotKeySettingsUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/HotKeySettingsUserControl.xaml)。本组属于桌面偏好，兼容可提供功能等价入口，不要求复制 WPF 外观。

| 编号      | 原版能力及子项                                                                                                 | MaaFW 兼容责任／条件                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| SET-UI-01 | 明亮／深色／跟随系统；过渡动画正常／快速／关闭                                                                 | 全局桌面偏好                                                                        |
| SET-UI-02 | 界面语言；干员名称跟随 MAA 语言／游戏客户端；强制名称语言的条件兼容值                                          | Maa Verge 产品简体中文不变时记录其他语言为有意差异，不能无说明删除兼容目标          |
| SET-UI-03 | 标题栏显示配置名、连接预设、连接地址、客户端；标题滚动；隐藏关闭按钮                                           | 全局标题内容偏好；另有配置级 `WindowTitlePrefix`                                    |
| SET-UI-04 | 使用托盘、最小化到托盘                                                                                         | 桌面外壳，需平台实际行为验证                                                        |
| SET-UI-05 | 卡片日志、最大日志缩略图数、日志时间格式                                                                       | 日志展示与缓存策略                                                                  |
| SET-UI-06 | 反转主任务右键仅一次行为；隐藏悬停操作按钮；全选按钮行为选择清空／反选／可切换                                 | 桌面任务编排语义，需与 SET-CFG-03 配合                                              |
| SET-UI-07 | 重启新手引导、引导步骤与完成状态、教程版本升级后一次性重置；演示任务的添加／复制／重命名／删除、选择／开始演示 | 纯桌面引导，不应由演示误操作真实设备                                                |
| SET-UI-08 | 背景图路径／内置树形列表／文件选择、图片缩放模式、透明度（0–100）、模糊半径（0–50）                            | 全局桌面资源与偏好                                                                  |
| SET-UI-09 | 莫奈取色开关、自动／自定义颜色、颜色选择、保持遮罩中性                                                         | `BackgroundMonetEnabled/Mode/CustomColor/KeepMaskNeutral`；颜色缓存不是独立用户功能 |
| SET-UI-10 | 全局快捷键：显示窗口、开始任务；按键编辑、清除、注册冲突提示                                                   | 操作系统快捷键注册及释放，不能只保存字符串                                          |
| SET-UI-11 | 窗口位置／大小恢复与退出保存开关、自定义区域格式 `CustomCulture`                                               | 全局隐藏偏好；没有常规页面入口的项仍需迁移取舍                                      |
| SET-UI-12 | 日志浮层目标选择、窗口目标持久化 `OverlayTarget`                                                               | Windows 窗口浮层；主界面入口，非 MaaFW 游戏 Pipeline                                |

### 性能、成就、问题反馈与关于

来源：[PerformanceUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/PerformanceUserControl.xaml)、[AchievementSettingsUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/AchievementSettingsUserControl.xaml)、[IssueReportUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/IssueReportUserControl.xaml)、[AboutUserControl.xaml](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Views/UserControl/Settings/AboutUserControl.xaml)。

| 编号         | 原版能力及子项                                                         | MaaFW 兼容责任／条件                                                      |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| SET-PERF-01  | GPU 推理加速、GPU 选择（描述与实例路径）、允许不推荐显卡               | 原版 DirectML 与设备黑名单属于 Windows 原生能力；MaaFW 推理后端需独立验证 |
| SET-PERF-02  | 忽略不兼容注入模块并使用软件渲染                                       | WPF 专属恢复开关；Tauri 使用自身渲染诊断方案，并记录有意差异              |
| SET-ACH-01   | 解锁成就数量、查看成就、成就备份和恢复                                 | 桌面本地成就数据；不是游戏内成就                                          |
| SET-ACH-02   | 禁用成就弹窗、成就弹窗自动关闭                                         | 当前配置 GUI 偏好                                                         |
| SET-ACH-03   | 调试条件下全部解锁／全部锁定；勋章点击与版本点击彩蛋、Pallas／宿醉语言 | 条件与彩蛋功能单列，可明确列为不迁移，不可误称常规游戏能力                |
| SET-DIAG-01  | 查看软件／资源更新状态、帮助文档、Issue 链接                           | 宿主诊断入口                                                              |
| SET-DIAG-02  | 生成日志支持包（完整 ZIP／分卷）、打开调试目录、清理图片缓存           | 宿主本地文件服务；支持包涉及账号与凭据内容，默认不自动上传                |
| SET-ABOUT-01 | 官网、GitHub、Bilibili、QQ群／频道、Telegram、Discord 链接             | 桌面外链；Maa Verge 应保留归属说明并使用自身支持入口                      |
| SET-ABOUT-02 | 手动检查并下载公告                                                     | 宿主网络与公告缓存；不是游戏内邮件／活动领奖                              |

### 设置覆盖边界与易误判项

- 本节覆盖该固定快照所有设置组及序列化设置中的用户语义；`AddressHistory`、窗口位置、图像主色缓存、已读公告／引导／更新状态、下载包记录属于恢复状态，不另算独立任务。
- 原版 `Configuration/Single/Settings/Toolbox.cs` 下 `Recruitment/OperBox/Gacha/Peep/MiniGame`（含 Reclamation）与 `Copilot.cs` 中的公招计算星级／时长、潜能显示、干员识别导出格式／头像模式、实时画面帧率、活动商店黑名单、作业编队／助战／循环等应并入对应“工具箱／作业”章节，避免设置页之外的偏好漏项。
- `Discord.WebhookUrl` 在该快照只有 XAML 绑定，不能据 UI 文本宣称其完整实现；可用自定义 Webhook 模板须单列。Win32 鼠标灰显方式、内测通道条件、隐藏配置值和彩蛋同样需要区分“源码存在”和“常规可执行”。
- 本次是静态源码功能盘点，没有运行原版 GUI、验证第三方通知投递或测试任何模拟器／游戏。Mac 原版客户端独有设置见下节，不从 WPF 设置推断跨平台一致。

## macOS 原版客户端差异与设置补充

核对日期：2026-11-03。来源为 MAA v6.21.2 固定的 MaaMacGui 子模块提交 **27c6ef8afc83df7b946174152beb1cc912851c7f**（上游仓库 `MaaAssistantArknights/MaaMacGui`）。这里只记录固定源码功能，不代表 Maa Verge 支持或任何平台实测通过；v6.20.1 至 v6.21.2 的子模块指针一致，Windows 新功能不能据此推断为 Mac 已有。

### 四个设置页的完整可见设置

| ID         | 入口                        | 原版设置/枚举                                                    | 原版默认/条件                               | MaaFW 兼容归属与注意事项                                                                  |
| ---------- | --------------------------- | ---------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| MAC-SET-01 | 连接设置                    | 触控模式 `adb / minitouch / maatouch / MacPlayTools`             | `maatouch`                                  | 连接层；MacPlayTools 是 PlayCover 路径，不能把 ADB 触控实现当它已兼容                     |
| MAC-SET-02 | 连接设置                    | 连接地址                                                         | 主 ViewModel 默认 `127.0.0.1:5555`          | 设备连接配置；分辨率工具自己的 AppStorage 回退为 `localhost:1717`，不要混成一个固定默认值 |
| MAC-SET-03 | 连接设置（非 MacPlayTools） | 允许使用 Gzip                                                    | `false`                                     | 截图/传输；上游 UI 提示内存泄漏时可关闭                                                   |
| MAC-SET-04 | 连接设置（非 MacPlayTools） | 使用 adb-lite 连接                                               | `true`，标注实验性                          | MaaCore 实例 `AdbLiteEnabled`，迁移需要重新决定 MaaFW 对等实现，不能照抄为有效开关        |
| MAC-SET-05 | 连接设置（MacPlayTools）    | 截图模式：默认兼容 `RGBA`、优化加速 `BGR`、系统屏幕捕捉 `MacSCK` | `BGR`                                       | 独立 macOS 截图适配；原版分别解析 `CompatMac / MacBGR / MacSCK` 等连接 profile            |
| MAC-SET-06 | 连接设置（MacSCK）          | 屏幕录制权限状态、打开录屏权限设置                               | 条件显示                                    | Tauri/系统权限；原版提示不要全屏、最小化或把游戏窗口移至其他显示器                        |
| MAC-SET-07 | 游戏设置                    | 客户端：官服、Bilibili、国际、日、韩、繁中                       | `Official`                                  | 客户端与资源，游戏启动任务/关闭任务使用全局客户端                                         |
| MAC-SET-08 | 更新设置                    | 接收开发版更新                                                   | `false`，Sparkle `beta` 通道                | 应用更新服务，不属于游戏 Pipeline                                                         |
| MAC-SET-09 | 更新设置                    | 自动检查更新                                                     | 由 Sparkle updater 读取                     | 应用更新服务                                                                              |
| MAC-SET-10 | 更新设置                    | 自动下载更新                                                     | 由 Sparkle updater 读取；关闭自动检查时禁用 | 应用更新服务                                                                              |
| MAC-SET-11 | 更新设置                    | 资源更新来源：GitHub、MirrorChyan                                | `github`                                    | 资源更新服务；GitHub 路径提示可能需要系统代理                                             |
| MAC-SET-12 | 更新设置（MirrorChyan）     | CDK 安全输入                                                     | 条件显示                                    | 凭据与分发；不应写进任务/资源 JSON                                                        |
| MAC-SET-13 | 更新设置                    | 自动资源更新                                                     | `false`；页面提示重新打开应用生效           | 资源更新服务                                                                              |
| MAC-SET-14 | 系统设置                    | 阻止系统睡眠                                                     | `false`                                     | macOS 电源管理；使用 `kIOPMAssertionTypeNoIdleSleep`，不等于从休眠中唤醒                  |

固定来源：[ConnectionSettingsView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Settings/ConnectionSettingsView.swift)、[GameSettingsView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Settings/GameSettingsView.swift)、[UpdaterSettingsView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Settings/UpdaterSettingsView.swift)、[SystemSettingsView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Settings/SystemSettingsView.swift)、[MAAViewModel.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Model/MAAViewModel.swift)。

### macOS 专有连接和宿主行为

- **MAC-HOST-01** PlayCover/MacPlayTools：连接游戏标题栏给出的本地地址；不是 ADB。原版 macOS 手册要求使用带 MaaTools 的 PlayCover 配置，并将该路径标为实验性。Mac GUI 在自动启动任务中使用 `NSWorkspace.openApplication` 打开选中客户端的 PlayCover 游戏包，再等待 MaaToolClient 可用；停止游戏有 MaaToolClient terminate 路径。应分别建立 App 启动、连接、输入、截图、关闭游戏的验收，不能只增加一个触控下拉值。
- **MAC-HOST-02** MacSCK：系统录屏权限检查、系统设置跳转、游戏窗口状态与多屏行为属于独立验收项。上游手册说明最小化、台前调度切换窗口、换桌面/屏幕可能导致截图问题；这是一条适用限制，不应复制为本项目已通过的能力。
- **MAC-HOST-03** 非 PlayCover：Mac 手册列出 Apple Silicon 的 MuMu Pro、AVD、BlueStacks Air，以及 Intel 的 BlueStacks、夜神、AVD。AVD 截图增强与 Android 10+ SELinux 下 Minitouch 限制分别核对；名单不代表 Maa Verge 已逐个实测。
- **MAC-HOST-04** 原版关闭最后一个窗口后退出应用；并非 Windows 式托盘驻留。退出前等待日志写入完成。菜单有应用更新检查、日志定位；侧栏有帮助与公告、资源更新、查找日志和设置。
- **MAC-HOST-05** macOS 定时为本机小时/分钟的每日定时，可新增、删除和独立启停；应用忙时跳过；系统唤醒通知会尝试重建计时器，应用提示系统休眠后定时失效，并在启用定时时提示开启阻止睡眠。它没有 Windows 任务计划程序唤醒注册。
- **MAC-HOST-06** 菜单快捷键：开始任务 `⌘R`、停止 `⌘.`、全部启用 `⇧⌘E`、全部取消 `⇧⌘D`。“全部启用”明确跳过集成战略和生息演算。

固定来源：[MAAViewModel.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Model/MAAViewModel.swift)、[MeoAsstMacApp.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/MeoAsstMacApp.swift)、[TaskTimerManager.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Utils/TaskTimerManager.swift)、[TaskTimerView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Views/TaskTimerView.swift)、[TaskButtons.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Views/TaskButtons.swift)、[原版 macOS 手册](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/device/macos.md)。

### macOS 任务入口与跨客户端差异

- **MAC-TASK-01** 一键长草可添加、删除、启停和拖动排序十类任务：开始唤醒、自动公招、基建换班、刷理智、信用收取及购物、领取奖励、更换主题、集成战略、生息演算、关闭游戏。集成战略/生息演算新条目默认关闭；保留至少一个开始唤醒任务。Windows 的初始队列、全选和默认启用语义不能直接当作 Mac GUI 行为；最新 Windows 已将生息演算移入工具箱。
- **MAC-TASK-02** 启动任务带自动启动和账号切换，账号名有添加/删除管理。Mac 全局游戏设置决定客户端。
- **MAC-TASK-03** 任务表单大体共享核心参数，但 Mac 不等同于 Windows 所有 UI 选项：例如固定 Mac 奖励表单只列六项（任务、邮件、免费单抽、幸运墙、限时开采、周年月卡），没有该版本 Windows 的限时签到开关；Mac Task enum 也没有 `UserDataUpdate`。不能因核心接受这些字段就称 Mac GUI 已有同名入口。
- **MAC-TASK-04** Mac 集成战略表单包括主题/难度/策略、次数、投资与上限、开局分队/职业/干员/助战、烧水奖励、购物/精二直升、月度小队/深入调查、萨米密文板和坍缩范式、常乐与襁褓动物目标等。主任务参数清单可以共享，但应给 GUI 可见性单独的平台列。
- **MAC-TASK-05** 自动战斗为独立页，支持普通/保全/悖论作业与作业集、自动编队、理智药、编队栏位、忽略练度、低信赖填充、助战和循环。视频识别入口是将视频拖入外部作业列表；工具侧栏刻意隐藏 `video` 枚举项，不能把工具说明页当独立可启动工具。

固定来源：[MAATask.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Model/MAATask.swift)、[TasksContent.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Navigation/TasksContent.swift)、[Configuration Views](https://github.com/MaaAssistantArknights/MaaMacGui/tree/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Configuration%20Views)、[CopilotView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Views/CopilotView.swift)、[UtilityContent.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Navigation/UtilityContent.swift)。

### 容易遗漏的 macOS 工具

| ID          | 工具/入口          | 固定源码能力                                                                                                                  | 实施拆分与副作用                                                                                                          |
| ----------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| MAC-TOOL-01 | 公招词条           | 识别标签与候选；自动设置时间；三星 7:40；按 3/4/5/6 星自动选标签                                                              | 识别、组合计算与游戏内选择/时间输入分别登记                                                                               |
| MAC-TOOL-02 | 仓库材料           | 材料名称与数量；复制企鹅物流 ArkPlanner JSON 并打开网站；复制明日方舟工具箱 JSON 并打开网站                                   | 全量识别与本地导出分开；不是自动上传                                                                                      |
| MAC-TOOL-03 | 干员列表           | 已有/未有列表，复制已有干员 JSON；排除指定临时角色                                                                            | 结构化全量识别与宿主展示/剪贴板                                                                                           |
| MAC-TOOL-04 | 干员寻访           | 警示确认后执行真实“寻访一次 / 寻访十次”，结束后截图                                                                           | **实际抽卡消费**；清单保留功能，默认零预算下不能自动开放或测试                                                            |
| MAC-TOOL-05 | 小游戏：常驻入口   | 绿票商店 `GreenTicket@Store@Begin`、黄票商店 `YellowTicket@Store@Begin`、活动商店 `SS@Store@Begin`、生息商店 `RA@Store@Begin` | 原版通过 Custom，可能消费票券/活动代币；不是免费领奖。绿票描述为一层全买、二层买寻访凭证与招聘许可；黄票提示至少 258 黄票 |
| MAC-TOOL-06 | 小游戏：当期活动   | 读取活动日历的动态入口、名称、操作说明和有效期；过期切换                                                                      | 清单需维护“动态资源入口”类别，固定源码无法永久穷举将来活动                                                                |
| MAC-TOOL-07 | 像素画（活动入口） | 拖入图片；24×24 预览；启用滑动、也填白色、额外绘制间隔 0–500ms                                                                | 图片预处理是宿主功能，实际绘制是游戏事件/流程；需先在游戏手动进入编辑页                                                   |
| MAC-TOOL-08 | 像素画图片调整     | Lanczos/双三次；双三次平滑度；饱和度、亮度、对比度、抖动、色彩匹配、恢复默认                                                  | 本地确定性图片处理，不属于 MaaFW 识别节点兼容                                                                             |
| MAC-TOOL-09 | 分辨率指南         | 根据当前屏幕缩放计算 PlayCover 720p/1080p 建议；MaaTools 测试获取版本、原始分辨率、窗口/内容边界、BGR 截图与预览              | 仅 MacPlayTools 可测试，要求 MaaTools >=3；诊断原图/截图尺寸不符、非 16:9、低于720p，多显示器有同屏提示                   |

固定来源：[RecruitView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Views/RecruitView.swift)、[DepotView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Views/DepotView.swift)、[OperBoxView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Views/OperBoxView.swift)、[GachaView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Views/GachaView.swift)、[MiniGameView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Views/MiniGameView.swift)、[PixelPaintView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Views/PixelPaintView.swift)、[MaaToolsView.swift](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac/Views/MaaToolsView.swift)。

## 原生集成接口、远控命令与 CLI

这些是开发与宿主兼容面。将 C API 或上游字段直接暴露给 React、模型或任意插件，不是本项目的兼容方案。

来源：[AsstCaller.h](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/include/AsstCaller.h)、[AsstCallerExtra.h](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/include/AsstCallerExtra.h)、[集成协议](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/protocol/integration.md)、[回调协议](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/protocol/callback-schema.md)。

| ID              | 原版接口／功能                                                     | MaaFW 兼容关注点                                                                           |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| API-LIFE-01     | 用户目录、资源加载、实例创建／销毁、版本及日志                     | worker 隔离、资源不可变 generation、许可及实际版本；C++ 不写业务数据库                     |
| API-TASK-01     | 加任务、修改任务参数、开始、停止、运行状态、任务列表               | 19 类任务各自解析及动态修改限制；MaaFW 采用自己的输入／结果契约，不声称 C API ABI 等价     |
| API-CON-01      | 同步／异步 ADB 连接、连接 extras、设备 UUID／连接状态              | 地址和设备身份、设备独占、各模式能力；同步旧 API 的存在不等于推荐新实现                    |
| API-CON-02      | 同步／异步绑定 Windows 窗口                                        | 独立原生窗口 Controller，截图／鼠标／键盘分别兼容                                          |
| API-OBS-01      | 异步点击、截图、PNG／BGR 图像读取、返回设备首页                    | 缓存图像与新截图不同；返回 Android 首页不是游戏内主页                                      |
| API-OPT-01      | 进程级 CPU OCR／GPU OCR（设备号或 Windows LUID）                   | 原版资源加载后不能任意切换；MaaFW 推理后端单独核对                                         |
| API-OPT-02      | 实例触控模式、暂停部署、ADB Lite、退出关闭 ADB、连接用 ClientType  | `ClientType` 连接选项不替代启动／关闭游戏的 `client_type`；旧 MinitouchEnabled 已弃用      |
| API-RESOURCE-01 | 关卡键／物品名称查询、基础与外服资源、地图／作业资源               | 应用本地目录与字段适配需保留来源和版本，不能解释任意旧资源流程作为 fallback                |
| API-EVENT-01    | 连接／异步调用／任务链／子任务状态与专用结果回调                   | 关联 taskid、调用及设备；区分失败、停止、未知及业务成功；拒绝迟到事件误结束新任务          |
| API-REMOTE-01   | 整表或单类远程开始：基建、唤醒、战斗、公招、商店、奖励、肉鸽、生息 | 原版远控协议与本机 RPC 不同，映射固定操作、校验参数及设备控制权                            |
| API-REMOTE-02   | 远程单抽／十连、排队截图／立即截图、停止、心跳、修改地址／第一关卡 | 原版存在真实消费与账号图像外发能力；兼容清单保留，实施须独立权限和用户授权，例行验证用夹具 |

远控命令依据：[RemoteControlService.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs)及[远控协议](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/protocol/remote-control-schema.md)。保留兼容需求不表示 Maa Verge 已开放远控。

| ID         | 官方 CLI 手册中的功能类别                                                     | 迁移归属                                                           |
| ---------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| API-CLI-01 | 安装／更新 MaaCore 及资源、CLI 自更新、资源热更、缓存清理                     | 宿主组件与发行工具；Maa Verge 沿用自己的独立更新生命周期           |
| API-CLI-02 | 预定义启动／关闭／战斗／普通、保全、悖论作业／肉鸽／生息任务                  | 功能复用自动化业务能力，不引入 CLI 子进程作为自动回退              |
| API-CLI-03 | 自定义有序任务与条件：时间、日期、星期、DayMod、客户端、组合条件与参数变体    | 宿主规则、时区和任务快照；不是任意命令执行                         |
| API-CLI-04 | JSON／YAML／TOML 配置、交互输入与条件输入、配置初始化／导入／转换             | 明确转换范围与数据版本；上游文件不是 Maa Verge 数据库备份          |
| API-CLI-05 | 任务总结与统计、日志等级／文件、活动、版本、目录、任务枚举、余数和 Shell 补全 | 宿主开发入口；桌面兼容可提供等价信息，并记录不提供命令行形式的差异 |

CLI 分类依据：[使用](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/cli/usage.md)、[配置](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/cli/config.md)。该标签的 maa-cli 子模块指针为 `a38452354858d2b34cd462a2cdd38a1f5dc49bb8`；本次没有把 CLI 每个 flag、安装发行渠道或独立 GUI 的配置都标为已审查。

### 开发诊断及条件入口

| ID           | 原版能力                                                   | 范围及迁移取舍                                                                                                        |
| ------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| API-DEBUG-01 | Core `Debug` 离线图片评估：`report/pipeline/ocr/templ`     | `images/tasks/templates/task/roi/threshold/resize`，评估识别结果；不计入 19 类非 Debug 游戏任务，也不代表设备操作成功 |
| API-DEBUG-02 | WPF Debug／`DEBUG/DEBUG.txt` 条件开放 Custom、资源自动重载 | `ShowDebugTask/CanShowAutoReload/EnableAutoReload`；重载确实改变资源状态，不能当纯展示或照搬为覆盖活动资源            |
| API-DEBUG-03 | Debug 条件下日志虚拟化压力入口、截图／日志演示             | 开发诊断；不计正常游戏功能或真实账号验收                                                                              |

来源：[DebugTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaCore/Task/Interface/DebugTask.cpp)、[TaskQueueViewModel.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs)、[AsstProxy.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Main/AsstProxy.cs)。Maa Verge 已有自己的隐藏 Debug，但其能力登记与上述上游开发接口分别维护。

## 平台与连接验收目录

| ID              | 原版路径                                                          | 兼容与验收范围                                                                                     |
| --------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| PLAT-WIN-01     | Windows ADB：蓝叠／雷电／MuMu／夜神／逍遥／应用宝 Androws／AVD 等 | 自动检测、地址变化、多开、启动与退出、普通截图／增强截图和每种输入分别验证                         |
| PLAT-WIN-02     | Windows PC 游戏窗口                                               | 绑定窗口、捕获方式、鼠标／键盘、窗口状态、音频及客户端生命周期；不能用 ADB 通过替代                |
| PLAT-MAC-01     | Apple Silicon／Intel 的安卓模拟器与 AVD                           | ADB 工具及控制能力分别验证；MuMu Pro、BlueStacks Air 等不等同 Windows extras                       |
| PLAT-MAC-02     | PlayCover／MacPlayTools／MacSCK                                   | 见 Mac 专章，独立于 ADB，包括 App 启动、输入、截图、录屏权限及多屏限制                             |
| PLAT-LINUX-01   | Linux 原生 MaaCore／CLI、Wine WPF／WineBridge／桌面整合           | 原版发行和 UI 宿主路径；Maa Verge 提供原生 Tauri／Bun／C++，不需复制 Wine 架构，但应覆盖其用户功能 |
| PLAT-LINUX-02   | AVD、Genymotion、Waydroid、redroid                                | 分辨率、设备地址、输入限制和宿主要求；Waydroid 缺少 minitouch 所需 evdev 不能视为普通模拟器        |
| PLAT-ANDROID-01 | Android 真机、USB／无线 ADB、远程 Android 环境                    | 配对／授权／地址与系统触控限制；开发默认不扫描或操作真实账号                                       |
| PLAT-CLIENT-01  | 官服／Bilibili／繁中／国际／日／韩服                              | 客户端包名、资源覆盖、语言／字体／布局、活动日期、统计服务器、04:00 游戏日及周重置分别核对         |

平台来源：[Windows](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/device/windows.md)、[macOS](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/device/macos.md)、[Linux](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/device/linux.md)、[Android](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/docs/zh-cn/manual/device/android.md)。以上名单是上游兼容目标目录，不是 Maa Verge 的支持或实测名单。

## 旧矩阵到本次基线的变化与补充核对

| 变化                                             | 迁移时的处理                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows 生息演算从主任务迁入工具箱／牛杂常驻活动 | Core `Reclamation` 仍存在；新配置为 `Toolbox.MiniGame.Reclamation`，原队列参数需迁移，不能把 UI 移位当功能删除。Mac 子模块仍保留自己的主任务入口 |
| 工具偏好从扁平 Toolbox 重组                      | `Recruitment/OperBox/Gacha/Peep/MiniGame` 分节保存，迁移旧平铺字段并保留新字段优先级                                                             |
| 库存保持增加双芯片折算                           | `CountDualChipAsChipPack` 每个双芯片计作两个对应芯片组，只改统计及缺口，不执行合成；全空库存缓存跳过，空识别结果不覆盖有效缓存                   |
| 黑流树海开局策略增加实托邦与奖励排序             | `blackflow_start_utopia`、十二奖励优先级、准备局／目标局的职业和干员设置分离；不能继续复用一组开局参数                                           |
| 补充核对：悖论作业原生列表兼容旧字符串数组       | 最新源码同时接受对象列表及旧文件名数组；Maa Verge 既有对象／整数 ID 限制是本项目当前边界，不应倒写成上游不支持字符串                             |
| 菲亚梅塔目标列表扩展；基建增加回收产物奖励处理   | 属于策略及资源行为，除表单外需更新事件、后置证据与各客户端验证                                                                                   |
| GPU 设备移除新增专用失败处理                     | 不只弹错误；须停止剩余任务并保留诊断，避免旧资源／坏推理继续执行                                                                                 |

差异来源：[ToolboxSectionMigrationConverter.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Converter/Specific/ToolboxSectionMigrationConverter.cs)、[DepotMaintainTask.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Configuration/Single/MaaTask/DepotMaintainTask.cs)、[AsstRoguelikeTask.cs](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaWpfGui/Models/AsstTasks/AsstRoguelikeTask.cs)、[Assistant.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/0da217cdef4d78bc5422decc95451533f77261e6/src/MaaCore/Assistant.cpp)。

## MaaFW 迁移现状和逐项验收办法

截至本次盘点，项目登记 **82 项 MaaFW 能力（L1 8、L2 12、L3 50、完整流程 12）**，这是实现目录数量，不是原版功能完成率。后续修改此节必须同步核对 [STATUS](STATUS.md) 的最新实机记录。

| 功能组                         | 当前 MaaFW 边界                                              | 仍需按本清单补齐                                                    |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| 启动／登录                     | 已打开游戏后的有限步骤、已在主页分支；冷登录未通过           | App 启动、账号切换、完整弹窗与冷登录                                |
| 战斗                           | 当前关卡、默认一次／最多二十次、零药石；实机仅前置拒绝等分支 | 任意关卡导航、真正开战及结算、倍率、药石、剿灭和库存策略            |
| 公招                           | 已完成槽位领取事件；实机尚无完整领取成功记录                 | 全槽位、标签与设时、新建／刷新／加急及统计                          |
| 信用／商店                     | 免费信用收取已有限实测；明确预算的当前商品购买有实现         | 自动选购与商品策略、好友访问、借助战；购买成功尚未实测              |
| 奖励                           | 日常／周常页面流程；已实测免费日常领取及周常空结果           | 邮件、免费抽卡及其他各活动奖励分支                                  |
| 仓库／干员                     | 当前屏 OCR，`scope: current_screen`、`complete: false`       | 全量结构化扫描、分页、缓存与工具导出的一致结果                      |
| 基建                           | 部分房间读取有实测，准备／确认等事件有实现及合成检查         | 完整换班、训练、整顿及跨房批次实测；常规算法、自定义、轮换全部策略  |
| 长模式／作业／养成／其他小游戏 | 已有 MaaCore 入口不等于 MaaFW 已重写                         | 逐任务、逐选项拆 L3 和流程，并核对消耗与业务结果                    |
| 设置与宿主功能                 | 多数应复用或补齐 backend／Tauri／UI；不是迁移 Pipeline 数量  | 按 `SET/HOST/API/PLAT/MAC` 条目登记等价、差异、未实现或不适用及原因 |

每个 ID 的后续台账至少包含：原版入口及选项、类型／枚举／单位／默认值、作用域（全局／配置／设备／任务／仅本次）、条件显示、前提及资源、副作用／消耗、结果与停止语义、源码链接、目标模块、MaaCore 路径现状、MaaFW 状态和验证记录。表内归并项在实施时拆成独立子项；不能只给整行统一勾选。

MaaFW 状态分别登记 `待拆解 → 原语就绪 → 事件就绪 → 流程就绪 → 合成验证 → 指定环境实测 → 全目标验收`；宿主设置可登记 `待实现／已有等价／部分差异／已验证／不适用（原因）`。不适用或有意差异需写清取舍，不能从清单删除，以免后续遗漏。

每次实测记录清单 ID、原版标签／提交、MaaFW 版本、资源 commit、宿主和架构、Controller／截图／触控方式、游戏客户端、脱敏参数、起始状态、结果证据、停止／失败／未知分支及未覆盖范围。默认消耗预算为零，单个 AVD 或单种客户端成功不能推导跨平台通过；文档盘点也不计游戏验收。

维护新版清单时，重新核对 Release tag 及子模块指针，再检查设置视图绑定、配置类、任务序列化／Core 实际解析、工具注册、资源／日历入口和平台手册。不要仅据在线手册目录或任务注册数量判断全覆盖。
