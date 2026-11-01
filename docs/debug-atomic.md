# 原语 Debug 接口与手动测试

原语开发在 `feat/atomic` 分支推进；工作区为主仓库的 `.worktree/atomic`。官方 MaaCore 源码保持原样，既有业务继续由 MaaCore 执行；原语调试使用独立 MaaFramework 控制会话。

## 隐藏入口

在「设置 → 关于」点击「应用版本」标题五次。鼠标、Enter、Space 均可；没有计时窗口，离开关于页会清除未完成计数。解锁后在主导航「执行记录」后显示 Debug，紧凑与窄窗导航相同。偏好仅保存在本机界面的 `maaverge:ui:debug-enabled`，重启保留；Debug 页的「隐藏 Debug」会先释放自己的会话。开发版与发行版默认均隐藏，未解锁时不渲染页面，也不向搜索提供入口。

页面打开、选择设备、搜索能力和修改参数都不操作设备。必须明确点击「建立调试会话」，再执行选定能力。截图选点、选区只填写参数；旧帧不能用于设备输入，需要重新截图。

## 能力与协议

四个层次为操作原语、观察能力、游戏操作、业务流程。目录由注册表产生，业务与 Debug 复用同一实现。能力的输入 Schema 位于 `packages/contracts/schemas/atomic-inputs.schema.json`，公共 RPC 位于 `rpc.schema.json`，原生命令位于 `worker.schema.json`；运行 `pnpm contracts:generate` 同步目录 Schema、类型及独立校验器。产品不动态编译任意 Schema，不接受任意 Shell、ADB、原生方法或触点命令。

| 方法                     | 参数                                            | 返回                                                         |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------ |
| `primitive.catalog.get`  | 可选 `deviceId`                                 | `items`：ID、层次、中文说明、输入／结果 Schema、可用性与原因 |
| `debug.session.start`    | `deviceId, requestId`                           | `debugSessionId, deviceId`                                   |
| `debug.primitive.invoke` | `debugSessionId, primitiveId, input, requestId` | 状态、结构化结果、步骤、可选 `ScreenFrame`                   |
| `debug.session.end`      | `debugSessionId, requestId`                     | `ended: true`                                                |

调用结果区分 `nativeSuccess` 与 `verified`。设备输入已获确认不代表游戏业务目标达成；多房间失败保留逐房证据。原语内部的 `completed` 映射为 Debug 的 `succeeded`，`partial`／`unavailable` 映射为 `failed` 并保留数据，`unknown`、`cancelled` 保持原意。返回结构 Schema 同样由契约源生成。

`device.long_press` 使用 `x, y, durationMs`，`device.drag` 使用 `x1, y1, x2, y2, durationMs`；两者还需要设备、帧、请求 ID 和宿主持有的控制令牌。时长均为 1–10000 ms，由 C++ worker 完成一次闭合手势。导航滑动使用独立的 `device.swipe` 参数和 100–2000 ms 范围，不把补偿动作附加到拖拽。固定按键只开放 `back` 与 `escape`。

## 所有权、取消与资源

- Debug 的真实 `controlToken` 仅保存在服务端；界面获得随机的调试会话 ID。不能附着到或结束 Agent、其他工作流的控制会话。
- 进入调试控制前等待 MaaCore 安全空闲，关闭原控制者后由 MaaFramework 获取共享设备租约。空闲中的调试会话仍占用设备；任务、定时、其他应用实例和更新不能抢占。
- 点击、长按、拖拽、滑动及按键都复用正式帧校验、坐标检查、原生确认和去重。动作帧上限 2 秒，动作后使已有帧失效。没有未知副作用自动重试，也不切回 MaaCore 重做。
- 同一不可变帧可在 120 秒内用于分步只读识别；它始终绑定原 worker 和资源版本，动作或交接会使其失效。识别结果如实报告 `fresh`，只读时限不延长动作时限。
- 结束会话会取消后续步骤、关闭自有控制者并清理触点。取消只读识别立即结束本调用方的等待，共享识别进程完成前仍受资源保护；退出应用同时关闭读者。释放失败保留设备占用并允许以新请求 ID 明确重试。
- 离开 Debug 页时立即请求停止并释放；建立中会话在返回后同样释放。释放失败会在本次界面生命周期内保留会话句柄，返回 Debug 后只允许重试释放，不能恢复执行或建立新会话。主动「隐藏 Debug」须先释放成功，失败时保留入口与重试操作；正在建立会话时暂不可隐藏。
- 请求账本保留到服务退出；重试同一 ID 返回原结果，不重放失败或未知输入。达到账本上限会阻止新操作，但不阻止停止。
- MaaFramework 和适配资源使用固定版本、独立不可变目录。更新只能空闲激活，活跃控制会话和识别进程保护其引用。资源适配显式登记支持字段；特殊入口或语义变化需要新增规则与验证记录。

## 验证边界

自动测试使用隔离临时数据、合成 IPC／原生 ABI 和图像夹具；不连接游戏、不调用付费模型、不下载组件。页面布局通过浅色、深色与窄窗合成截图人工检查，不添加外观断言。真实设备、各换班路径、Windows／Linux／Intel macOS 和原生 WebView 的验收必须另行记录；编译成功与识别探针不能替代这些结果。
