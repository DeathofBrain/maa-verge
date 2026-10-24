# 作业启动界面与原生参数

普通作业队列执行一次时统一使用 `copilot_list`，即使只有一项也由核心从关卡所在地图导航；自动编队可开可关。关卡必须在同一区域内，可通过左右滑动地图到达。关闭自动编队时，用户须提前准备当前队伍与技能。队列条目的导航关卡覆盖及普通／突袭设置在单项列表中同样生效。

普通单份作业循环大于一次时使用 `filename` 与 `loop_times`，不导航；开始前先选好关卡与模式，停在有「开始行动」按钮的编队选择界面。手动编队须先配好干员和技能；开启自动编队时，核心会清空并重配所选队伍。多作业列表不支持整体循环。

保全派驻继续使用单份作业文件及循环：先手动完成初始准备，停在关卡详情中有「开始部署」按钮的界面。悖论模拟继续使用专用任务：手动选好技能，停在有「开始模拟」按钮的界面。

以上行为依据 MAA v6.20.0 与 v6.20.1 固定版本的文档与源码，只读核查于 2026-10-24，未以合成测试宣称真实游戏验收：

- [v6.20.0 官方操作说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/introduction/copilot.md#抄作业)：单文件编队界面、多作业地图界面及特殊任务入口。
- [v6.20.1 原生参数选择](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/src/MaaCore/Task/Interface/CopilotTask.cpp#L95-L187)：`filename` 禁用导航；任何长度的 `copilot_list` 均启用导航，单项不例外。
- [导航、关闭代理及突袭选择](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/src/MaaCore/Task/Miscellaneous/MultiCopilotTaskPlugin.cpp#L55-L73)。
- [编队设置](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/src/MaaCore/Task/Interface/CopilotTask.cpp#L200-L207)：编队开关独立于导航参数。
- [循环规则](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/protocol/integration.md#L1191-L1195)：`loop_times` 只在 `filename` 模式生效。
