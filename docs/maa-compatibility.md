# 原 MAA 功能覆盖与验收

核对日期：2026-10-24。基线为官方 **v6.20.0**。完整覆盖原 MAA 功能是 Maa Verge 的产品交付要求；下表用于跟踪差距，不能把接口可提交或 mock 测试通过表述为原版功能已全部实现。

## 核对依据

- [集成文档：任务与参数](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/protocol/integration.md)
- [Assistant.cpp：实际注册的任务](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Assistant.cpp)
- [SingleStepTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Task/Interface/SingleStepTask.cpp) 与 [CopilotConfig.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Config/Miscellaneous/CopilotConfig.cpp)：单步参数的实际解析方式。
- [FightTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Task/Interface/FightTask.cpp)、[RecruitTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Task/Interface/RecruitTask.cpp) 与 [AutoRecruitTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Task/Miscellaneous/AutoRecruitTask.cpp)：消耗设置与实际次数控制。
- [OperProgressTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Task/Interface/OperProgressTask.cpp)：集成文档任务列表之外的干员养成入口。

## 已接入的任务边界

已登记全部 **19 个非 Debug 核心任务类型**：集成文档中的 18 类，以及源码中注册的 `OperProgress`。任务表及独立作业分别保存，执行共用参数校验、启用开关、持久化和每设备隔离的工作进程提交路径。原版的所有扩展参数保存在 `params` JSON 对象中，编辑常用选项不应丢失未显示的参数。支持同类型多条任务及顺序编排，另有应用组合任务 `UserDataUpdate`，依次调用干员/仓库识别；常规表单和默认值的逐项对照见 [任务设置对照](maa-task-settings.md)。新建日常表按原版九项初始队列生成，使用“日常表1”等未占用名称。

| 类型             | 对应原版能力                       | 当前参数边界与缺口                                                                                                                                 |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| StartUp          | 唤醒、启动游戏                     | 客户端、自动启动、账号显示名切换；共享/实例连接配置独立应用到 worker，按客户端加载基础及外服覆盖，空闲边界隔离切换；真实启动与外服游戏行为尚未验收 |
| CloseDown        | 关闭游戏                           | 客户端参数；不等于退出 Maa Verge 或关闭模拟器                                                                                                      |
| Fight            | 理智作战、剿灭、掉落目标、代理倍率 | 常驻/官方日历活动关卡下拉及手动输入、次数、药/石额度、倍率和掉落目标；日历共享官源条件请求与缓存，按游戏日显示材料开放状态；临期药暂拒绝           |
| Recruit          | 公招自动招募、标签计算             | 星级、确认、次数、保留标签、时限等；允许 `times=0`/`confirm=[]` 的计算用途；加急暂拒绝                                                             |
| Infrast          | 默认换班、自定义排班、一键轮换     | 模式、设施、无人机、心情、自定义文件与方案序号；文件须由用户准备                                                                                   |
| Mall             | 信用领取、好友访问、购物           | 好友访问每日一次、借助战、优先/黑名单和折扣等常规表单；每日一次须专用访问完成证据                                                                  |
| Award            | 任务、邮件、活动等领奖             | 每种领奖开关保留；活动有效性取决于活动与资源                                                                                                       |
| SwitchTheme      | 更换游戏主界面主题                 | 候选主题列表，空列表按上游语义跳过                                                                                                                 |
| Roguelike        | 集成战略                           | 上游六个主题及仍开放的模式代码；主题、模式及扩展参数保留                                                                                           |
| Copilot          | 独立作业中心、原生列表、自动编队   | 不可变 JSON 单文件或 `copilot_list`；单份循环，多份限同区域及单次；编队/追加干员/低信赖/练度与助战选项；无上限用药禁止，实机待验收                 |
| SSSCopilot       | 独立保全派驻工作区                 | 单份不可变作业及循环；本地/社区同一预检链路；不串联多份，不把队列结束当作整场通关证据                                                              |
| ParadoxCopilot   | 独立悖论模拟工作区                 | 单文件或带整数 ID 的原生 `list`，重复项有独立条目标识；不提供循环与普通编队                                                                        |
| Depot            | 仓库识别                           | 独立工具识别、持久缓存、搜索、多格式导出；任务表入口保留，真实游戏待验收                                                                           |
| OperBox          | 干员识别                           | 独立识别、按 ID 资源头像、持有筛选、练度展示与导出；真实游戏待验收                                                                                 |
| Reclamation      | 生息演算                           | Tales 的 0/1 模式，RelaunchAnchor 的 16/32/48 模式；已关闭 Fire 不作为可执行选项                                                                   |
| Custom           | 上游资源内自定义流程与小游戏       | 当前仅开放像素画与隐秘战线入口；任意资源任务链尚未经过消耗策略审核，明确拒绝                                                                       |
| SingleStep       | 单步关卡/开始/战斗动作             | 按源码要求，动作使用 `details.actions` 数组；不是视觉 Agent，也不把回调视为动作成功证据                                                            |
| VideoRecognition | 作业视频识别                       | 本地视频路径可提交；独立离线识别流程、结果查看与导出尚未接入，当前沿用设备执行入口                                                                 |
| UserDataUpdate   | 干员/仓库周期同步                  | 应用任务；每次/每日/每周与成功时间，仅匹配专用识别结果且确认空闲后计成功；结果在仓库/干员工具页面查看                                              |
| OperProgress     | 干员精英化、技能升级/专精          | `plans` 条目保留；校验名称与等级范围，干员/资源可用性仍由核心判断                                                                                  |

上表的“可提交”仅说明应用服务到工作进程的协议路径已接通。相关测试使用合成 Worker，不包含核心下载、账号登录、游戏点击或数据上传。所有任务仍需固定核心/资源组合的真实验证。

## 参数与消耗规则

- `Task.enabled` 默认 `true`，兼容已有任务表。关闭后保留其参数，执行快照过滤该行，消耗汇总也忽略该行。上游 `params.enable=false` 同样跳过。保存允许暂时关闭所有任务，执行时要求至少一条启用任务。
- `params` 保留未知的 JSON 参数以兼容后续上游字段；拒绝任意 `shell`、`command`、`script`、`adb` 字段（含嵌套），非 JSON 数值、过深或过大的对象。常用字段另做类型、范围和枚举校验，核心仍负责版本/资源相关校验。
- 任务表保存说明、`deviceId` 绑定和日常/专项分组；旧数据默认无绑定、日常组。执行时校验绑定设备，ADB 地址别名重连保持既有设备 ID。
- 每次执行的理智药与源石上限由本表已启用的 `Fight` 任务 `medicine`/`stone` 参数累计决定；任务编排设置单项上限，任务表设置显示汇总。新任务默认均为零，提交时补齐显式零消耗默认值。非 `Fight` 任务不能通过这些字段请求消耗。旧 `Settings.budgets` / `Plan.budgets` 继续兼容读取，不再限制或增加自动作战的配置额度。
- **临期药不是数量上限**：v6.20.0 的 `medicine_expire_days` 会独立启用临期药，旧的 `expiring_medicine` 也会转为该行为。不能把它们当成普通药的数量预算，当前正值请求明确拒绝。
- **加急次数字段失效**：v6.20.0 忽略 `expedite_times`。`AutoRecruitTask` 还可能在新招募计数未增加时加急已有槽位，`times` 也不能直接作为严格加急消耗上限。当前 `expedite=true` 明确拒绝，后续须增加实际消耗计数和停止机制。
- Copilot 的 `use_sanity_potion=true` 没有数量上限，当前明确拒绝。任意 `Custom` 资源链可能绕过标准任务的额度控制，须审核资源任务图后再开放。
- 新建作战任务的企鹅物流/一图流汇报开关与原版默认一致为开启，可在“掉落与数据汇报”中关闭；已有未设置这些字段的任务保持旧版适配默认关闭，不迁移用户参数。常规开发测试仅使用合成任务，不进行真实上传。
- 文件路径作为 MaaCore 参数传递，不执行系统命令。不存在、内容无效或核心拒绝的文件必须反馈提交失败，不能显示成功。作业中心支持本地与固定 PRTS Plus 接口导入及解析预览，三类独立队列不生成任务表；视频离线专用流程仍待实现。
- 作业列表按固定版本源码校验：显式 `filename` 优先于列表，空字符串不能用列表兜底；悖论作业对象必须包含整数 ID。所有任务共用带 `taskid` 的任务链回调，迟到的上一条任务停止/队列结束消息不会结束当前任务；仍需对应任务成功回调和单独的核心空闲状态。

## 完整替代原版的发布门槛

以下项目包含尚未交付或尚未完成真实验收的工作，不能从“登记了 19 类任务”推导为已完成：

| 范围           | 还需完成的验收                                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 所有任务与选项 | 各任务主路径及原版常用选项的 UI、失败反馈、结果解析与真实游戏验证；补齐上述受限消耗选项及自定义流程                                                                                                                                                                                        |
| 识别与工具     | 仓库/公招/干员/补货/小游戏已有独立工具与合成验证；仍需六种客户端实测、视频工具与作业真实验收，离线视频不应强制连接设备                                                                                                                                                                     |
| 编排与调度     | 独立 Schedule 支持每日定时、普通跳过、可取消强制接管、通知、准备和去重；仍需真实强制关闭游戏/休眠恢复、完整跨配置与完成后系统动作验收。旧 Plan.schedule 不解释为新规则                                                                                                                     |
| 连接与平台     | 已实现独立实例配置、同时执行/单独停止和错误隔离；仍需各模拟器真实多开验收、启动模拟器和全部触控/截图模式验证；Windows 原生窗口/PlayCover 等原版平台能力也必须单列方案，不能因为首版只走 ADB 而宣布覆盖                                                                                     |
| 展示与数据     | 实时预览、周期同步和官方活动日历已有入口，主页支持剿灭日历提醒及手工基建估算；仍需跨执行掉落统计及游戏公告等数据展示                                                                                                                                                                       |
| 设置与外部服务 | 已接入三平台系统通知及分类偏好，实际系统投递待各宿主验收；第三方推送、远控、社区账号/收藏/发布及其他公共数据接口、自定义基建文件管理和其他原版设置仍待覆盖；MirrorChyan 已提供三通道共用 CDK 设置，用户端高速下载为付费服务，保留官方免费来源及包型不适配时回退，见 [说明](mirrorchyan.md) |
| 发行与兼容     | 三平台签名发行、应用/核心/资源独立更新；六种客户端资源组合验证；不能以 CI 配置或 mock 通过替代平台实测                                                                                                                                                                                     |

其中，原版 UI 自有能力需要独立实现，不能由核心任务透传代替：

- **库存保持**：已接入仓库刷新、目标缺口、关卡开放跳过、累计掉落去重、顺序/达成率和有限消耗；待真实客户端验收。依据：[库存保持说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/introduction/depot-maintain.md)。
- **数据更新与工具箱**：干员/仓库独立结果、资源头像、JSON/Markdown/CSV 及仓库 ArkPlanner/Lolicon 导出已接入；公招计算、补货和已审核小游戏使用独立 ToolJob。使用与未验收范围见 [工具箱与定时计划](toolbox-schedules.md)。依据：[数据更新](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/introduction/user-data-update.md)、[工具箱](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/introduction/tools.md)。
- **定时、多配置与系统动作**：原版定时器及强制启动语义、配置切换、启动/结束动作、通知、远控、配置导入导出与运行诊断。用户手工配置的前后脚本必须保持在模型工具表之外。依据：[其他设置](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/introduction/others.md)、[原版设置实现](https://github.com/MaaAssistantArknights/MaaAssistantArknights/tree/v6.20.0/src/MaaWpfGui/ViewModels/UserControl/Settings)。
- **作业管理**：本地/社区作业及有序作业集的搜索、预览、逐项导入、不可变版本、独立队列与执行结果已接入。普通列表支持突袭和导航覆盖，单份普通/突袭/演习由用户在游戏内选择；自动编队会清空当前编队。删除库条目保留队列/运行/历史引用，重试不重放原生动作；仍需固定核心/资源与六客户端的真实执行、失败/停止及更新验收。依据：[自动作业](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/introduction/copilot.md)。

真实验收记录至少包含：上游标签、核心实际版本、资源 commit、宿主系统、连接方式、客户端、使用的参数（脱敏）、成功证据、停止/失败结果，以及明确的已知限制。未全部关闭差距前，产品状态保持开发预览。
