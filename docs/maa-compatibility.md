# 原 MAA 功能覆盖与验收

核对日期：2026-10-20。基线为官方 **v6.20.0**。完整覆盖原 MAA 功能是 MAAVerge 的产品交付要求；下表用于跟踪差距，不能把接口可提交或 mock 测试通过表述为原版功能已全部实现。

## 核对依据

- [集成文档：任务与参数](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/protocol/integration.md)
- [Assistant.cpp：实际注册的任务](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Assistant.cpp)
- [SingleStepTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Task/Interface/SingleStepTask.cpp) 与 [CopilotConfig.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Config/Miscellaneous/CopilotConfig.cpp)：单步参数的实际解析方式。
- [FightTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Task/Interface/FightTask.cpp)、[RecruitTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Task/Interface/RecruitTask.cpp) 与 [AutoRecruitTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Task/Miscellaneous/AutoRecruitTask.cpp)：消耗设置与实际次数控制。
- [OperProgressTask.cpp](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Task/Interface/OperProgressTask.cpp)：集成文档任务列表之外的干员养成入口。

## 已接入的任务边界

已登记全部 **19 个非 Debug 核心任务类型**：集成文档中的 18 类，以及源码中注册的 `OperProgress`。统一经过计划保存、参数校验、启用开关、持久化和每设备隔离的工作进程提交路径。原版的所有扩展参数保存在 `params` JSON 对象中，编辑常用选项不应丢失未显示的参数。支持同类型多条任务及顺序编排。

| 类型 | 对应原版能力 | 当前参数边界与缺口 |
| --- | --- | --- |
| StartUp | 唤醒、启动游戏 | 客户端与启动选项；接受上游六种客户端代码，外服资源及真实启动尚未验收 |
| CloseDown | 关闭游戏 | 客户端参数；不等于退出 MAAVerge 或关闭模拟器 |
| Fight | 理智作战、剿灭、掉落目标、代理倍率 | 关卡、次数、药/石额度、倍率、掉落目标可配置；临期药的独立无限消耗入口暂拒绝 |
| Recruit | 公招自动招募、标签计算 | 星级、确认、次数、保留标签、时限等；允许 `times=0`/`confirm=[]` 的计算用途；加急暂拒绝 |
| Infrast | 默认换班、自定义排班、一键轮换 | 模式、设施、无人机、心情、自定义文件与方案序号；文件须由用户准备 |
| Mall | 信用领取、好友访问、购物 | 优先/黑名单、折扣与信用限制等参数保留 |
| Award | 任务、邮件、活动等领奖 | 每种领奖开关保留；活动有效性取决于活动与资源 |
| SwitchTheme | 更换游戏主界面主题 | 候选主题列表，空列表按上游语义跳过 |
| Roguelike | 集成战略 | 上游六个主题及仍开放的模式代码；主题、模式及扩展参数保留 |
| Copilot | 作业执行、作业列表、自动编队 | 单文件或 `copilot_list`；作业循环、编队等参数；无数量上限的用药开关暂拒绝 |
| SSSCopilot | 保全派驻作业 | 本地作业文件与循环次数；文件格式由固定版本核心最终校验 |
| ParadoxCopilot | 悖论模拟作业 | 单文件或 `list`；列表全部为文件路径，或全部为带整数 ID 的对象，不混用 |
| Depot | 仓库识别 | 可提交核心；专用识别结果/库存导出面板尚未接入 |
| OperBox | 干员识别 | 可提交核心；专用结果/导出面板尚未接入 |
| Reclamation | 生息演算 | Tales 的 0/1 模式，RelaunchAnchor 的 16/32/48 模式；已关闭 Fire 不作为可执行选项 |
| Custom | 上游资源内自定义流程与小游戏 | 当前仅开放像素画与秘密前线入口；任意资源任务链尚未经过消耗策略审核，明确拒绝 |
| SingleStep | 单步关卡/开始/战斗动作 | 按源码要求，动作使用 `details.actions` 数组；不是视觉 Agent，也不把回调视为动作成功证据 |
| VideoRecognition | 作业视频识别 | 本地视频路径可提交；独立离线识别流程、结果查看与导出尚未接入，当前沿用设备执行入口 |
| OperProgress | 干员精英化、技能升级/专精 | `plans` 条目保留；校验名称与等级范围，干员/资源可用性仍由核心判断 |

上表的“可提交”仅说明应用服务到工作进程的协议路径已接通。相关测试使用合成 Worker，不包含核心下载、账号登录、游戏点击或数据上传。所有任务仍需固定核心/资源组合的真实验证。

## 参数与消耗规则

- `Task.enabled` 默认 `true`，兼容已有任务表。关闭后保留其参数，执行快照过滤该行，预算也忽略该行。上游 `params.enable=false` 同样跳过。保存允许暂时关闭所有任务，执行时要求至少一条启用任务。
- `params` 保留未知的 JSON 参数以兼容后续上游字段；拒绝任意 `shell`、`command`、`script`、`adb` 字段（含嵌套），非 JSON 数值、过深或过大的对象。常用字段另做类型、范围和枚举校验，核心仍负责版本/资源相关校验。
- 全计划累计已启用任务的 `stone`/`medicine`，不得超过用户已授权额度；默认均为零。提交时补齐显式零消耗默认值，避免依赖上游隐式行为。
- **临期药不是数量上限**：v6.20.0 的 `medicine_expire_days` 会独立启用临期药，旧的 `expiring_medicine` 也会转为该行为。不能把它们当成普通药的数量预算，当前正值请求明确拒绝。
- **加急次数字段失效**：v6.20.0 忽略 `expedite_times`。`AutoRecruitTask` 还可能在新招募计数未增加时加急已有槽位，`times` 也不能直接作为严格加急消耗上限。当前 `expedite=true` 明确拒绝，后续须增加实际消耗计数和停止机制。
- Copilot 的 `use_sanity_potion=true` 没有数量上限，当前明确拒绝。任意 `Custom` 资源链可能绕过标准任务的额度控制，须审核资源任务图后再开放。
- 数据汇报默认关闭；用户显式填写的 `report_to_penguin`/`report_to_yituliu` 参数不会被适配器静默改写。常规开发测试不启用真实上传。
- 文件路径作为 MaaCore 参数传递，不执行系统命令。不存在、内容无效或核心拒绝的文件必须反馈提交失败，不能显示成功。尚无作业文件导入、下载、解析预览和离线工具专用流程。
- 作业列表按固定版本源码校验：显式 `filename` 优先于列表，空字符串不能用列表兜底；悖论作业对象必须包含整数 ID。所有任务共用带 `taskid` 的任务链回调，迟到的上一条任务停止/队列结束消息不会结束当前任务；仍需对应任务成功回调和单独的核心空闲状态。

## 完整替代原版的发布门槛

以下项目都是待交付工作，不能从“登记了 19 类任务”推导为已完成：

| 范围 | 还需完成的验收 |
| --- | --- |
| 所有任务与选项 | 各任务主路径及原版常用选项的 UI、失败反馈、结果解析与真实游戏验证；补齐上述受限消耗选项及自定义流程 |
| 识别与工具 | 仓库、公招、干员、视频的专用结果面板、导出、作业导入与工具工作流；离线视频不应强制连接设备 |
| 编排与调度 | 定时执行、多配置、任务执行结束后的系统动作、休眠恢复及任务中修改参数等原版体验；现有非空 schedule 仍明确拒绝 |
| 连接与平台 | 原版模拟器与多开配置的逐项支持、启动模拟器、连接诊断、触控/截图模式与性能设置；Windows 原生窗口/PlayCover 等原版平台能力也必须单列方案，不能因为首版只走 ADB 而宣布覆盖 |
| 展示与数据 | 实时预览、掉落统计、库存同步、公招与活动数据刷新，以及完整执行结果展示 |
| 设置与外部服务 | 原版通知/推送、作业站/公共数据接口、MirrorChyan、自定义基建文件管理、其他原版设置的覆盖或等价路径 |
| 发行与兼容 | 三平台签名发行、应用/核心/资源独立更新；六种客户端资源组合验证；不能以 CI 配置或 mock 通过替代平台实测 |

其中，原版 UI 自有能力需要独立实现，不能由核心任务透传代替：

- **库存保持**：仓库缓存、目标库存、材料缺口、关卡开放时间、掉落更新、预更新与补货优先级。依据：[库存保持说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/introduction/depot-maintain.md)。
- **数据更新与工具箱**：干员/仓库定期更新、结果缓存与时间、公招计算、JSON/Markdown/CSV 导出、截图监控、小游戏及需明确消耗授权的工具。依据：[数据更新](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/introduction/user-data-update.md)、[工具箱](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/introduction/tools.md)。
- **定时、多配置与系统动作**：原版定时器及强制启动语义、配置切换、启动/结束动作、通知、远控、配置导入导出与运行诊断。用户手工配置的前后脚本必须保持在模型工具表之外。依据：[其他设置](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/introduction/others.md)、[原版设置实现](https://github.com/MaaAssistantArknights/MaaAssistantArknights/tree/v6.20.0/src/MaaWpfGui/ViewModels/UserControl/Settings)。
- **作业管理**：本地/社区作业导入、列表顺序、练习/突袭、自动编队、助战选择和结果查看。依据：[自动作业](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/introduction/copilot.md)。

真实验收记录至少包含：上游标签、核心实际版本、资源 commit、宿主系统、连接方式、客户端、使用的参数（脱敏）、成功证据、停止/失败结果，以及明确的已知限制。未全部关闭差距前，产品状态保持开发预览。
