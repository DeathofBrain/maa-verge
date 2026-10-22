# 模拟器自动连接

`pnpm dev` 和发行桌面均使用真实原生服务；旧 `MAAVERGE_MODE=mock` / `--mode mock` 已移除并明确报错。无需设置模式，兼容保留的值仅为 `native`。没有设备时不生成演示设备，没有核心时显示「未安装」并通过真实更新源安装；Agent 本地提案仍可生成，保存后需连接真实设备才能手动执行。`pnpm dev:ui` 只启动前端，普通浏览器没有桌面服务时提示不可用。

服务在启动并具备已启用 MaaCore 后自动发现模拟器，每 30 秒在空闲时重试。设置 `autoConnect` 默认开启；关闭后仅保留用户主动触发的连接。手动断开设备后，该设备不会立即被后台重连；重新开启自动连接、主动点击自动连接或重启应用可以解除抑制。后台发现期间关闭自动连接或手动断开设备，会阻止该轮随后建立新的核心连接。真实数据继续位于 `<data-root>/native`；旧 `mock` 目录保留，产品不读取、迁移或删除它。

没有实例清单或只有自动生成的实例配置时，自动连接持续发现新启动的本机实例。清单包含手动新增或编辑过的配置后，只逐项尝试清单中的地址和配置，单项失败不阻止其他实例。手动“发现设备”始终可以连接已监听的本机候选 ADB 地址，再刷新设备列表；此步骤只建立 ADB 传输连接，不取得 MaaCore 控制权。共享/逐实例设置见 [连接设置](connection-settings.md)，同表并行、分别停止与客户端资源隔离见 [多开说明](multi-instance.md)。

`device.auto_connect` 返回：

```ts
{
  devices: Device[]; // 已发起核心连接的设备；最终状态由异步连接结果确认
  discovered: { address: string; name: string; adbState: string }[];
  diagnostics: string[];
}
```

发现先读取 ADB 现有设备，再优先检查 MuMu、雷电实例信息给出的地址，并以原版 MAA 的有限默认端口和 BlueStacks 实例配置端口作为补充。只尝试回环地址上已监听的候选端口，不扫描端口范围。自动模式只接入回环地址与 `emulator-*`，USB 手机仍需手动选择。发现和自动连接都不会创建或启停模拟器、启动游戏或运行任务。ADB 授权未完成的设备会出现在诊断中。

ADB 优先使用连接设置中明确选择的路径或 `MAAVERGE_ADB_PATH`，再查找 PATH、Android SDK、已配置的模拟器目录与常见安装位置。Windows 未命中时，参照原版 MAA 的进程白名单及相对路径查找正在运行的模拟器内置 ADB，支持自定义安装盘和 MuMu `nx_main/adb.exe` 布局；不会遍历任意程序或注册表。显式配置的 ADB 不存在时会报错，不静默换用其他文件。仍未找到时，可在连接设置选择内置 ADB，或使用以下环境变量；变量值不提交至仓库：

- `MAAVERGE_EMULATOR_DIRS`：以系统路径分隔符分隔的模拟器安装目录，定位内置 ADB。
- `MAAVERGE_EMULATOR_ADDRESSES`：最多 16 个以逗号分隔的 `127.0.0.1:端口`、`localhost:端口` 或 `[::1]:端口`。
- `MAAVERGE_BLUESTACKS_CONFIG`：动态实例端口配置 `bluestacks.conf` 的路径。
- `ANDROID_HOME` / `ANDROID_SDK_ROOT`：Android SDK 根目录。

Windows MuMu 从已识别的安装目录调用固定只读命令 `MuMuManager.exe info -v all`，枚举全部已启动实例的名称、编号、PID 与实际回环 ADB 端口。发现使用管理器报告的实际端口，支持高索引、非默认端口与多个安装目录，不按 `16384 + 32 × index` 猜测实例地址。管理器查询最多处理 4 个安装目录、并发 2 个，每次超时 4 秒；查询失败保留诊断并继续现有设备、有限默认端口与手动配置路径。

Windows 雷电从运行中的 `dnplayer.exe` 定位安装目录，以固定只读命令 `ldconsole.exe list2` 取得已启动实例名称、编号、窗口进程和虚拟机 PID。只有默认 ADB 地址 `127.0.0.1:(5555 + 2 × index)` 正在监听，且归属该实例的窗口进程或虚拟机进程时，才将其列为已核实的雷电实例；同一归属进程的监听别名共享租约。查询同样最多处理 4 个安装目录、并发 2 个，每次超时 4 秒。端口占用、未就绪或查询失败会保留诊断；普通 ADB 发现和手动配置仍可使用，但不会据此自动套用雷电 SDK。

设备锁同时规范化 ADB server 的回环主机别名与默认端口，并遵循 `ADB_SERVER_SOCKET`（优先）、`ANDROID_ADB_SERVER_ADDRESS` / `ANDROID_ADB_SERVER_PORT` 的选择；ADB 子进程与核心工作进程继承相同环境。

相同 ADB server 上的 `emulator-5554` 与 `127.0.0.1:5555` 等 Android 标准别名使用同一个共享设备锁。MuMu 结合管理器元数据和同一 MuMuNxDevice 进程的监听端口确认别名：同一实例的多个端口在列表中去重并共享租约，不同 PID 的多开实例独立保留。普通 `16384`、`5555`、`7555` 端口不再仅凭数字被全局合并。连接异步完成前不能运行任务；组件切换时不新增连接。

参考固定上游版本 **v6.20.0**，实现未复制上游带关闭模拟器、杀进程等副作用的助手：

- [连接说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/connection.md)：默认模拟器端口、ADB 路径和调试要求。
- [连接设置](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaWpfGui/ViewModels/UserControl/Settings/ConnectSettingsUserControlModel.cs)：`DefaultAddress` 与实例发现思路。
- [Windows 模拟器发现](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaWpfGui/Helper/WinAdapter.cs)：运行进程名称和内置 ADB 相对路径。
- [MuMu 管理器定位](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaWpfGui/Helper/EmulatorHelper.cs)：MuMuNx 安装布局与管理器入口。
- [macOS 设备说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/device/macos.md)：NoxAppPlayer 内置 ADB 路径，其他未命中路径可配置。
- [Python 模拟器辅助](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/Python/asst/emulator.py)：BlueStacks `bst.instance.<实例>.status.adb_port`。

自动发现回归使用测试中注入的替代 ADB、监听探测和合成核心工作进程；安装包及桌面 smoke 在全新隔离的 native 数据库中预先关闭自动连接与更新，不使用产品 mock 开关。本机 Windows MuMu 的历史实际验证见下节；本次发现修复只在已启动的一个 Windows MuMu 实例上实测，真实多开仍需单独验收。Windows/macOS/Linux 的路径分支与默认端口是实现范围，不能据此声称三个平台的真实模拟器均已验收。MuMu 增强触控已有实验设置入口但尚未真实验收；自动启动模拟器、PlayCover、Windows 原生窗口仍需单独接入。

## 模拟器增强截图

设备页的「截图协议」默认 **自动识别（推荐）**。连接时对已核实的 Windows MuMu、雷电实例检查安装目录中的 SDK，自动选择对应增强截图协议、目录和实例编号，并为每个实例保存独立配置；自动显示的目录和编号只读。未识别的设备或首次检测不到受支持 SDK 时使用 ADB。当前仅 Windows 支持这两种增强模式。

也可明确选择 **ADB 默认截图、MuMu 增强截图、雷电增强截图**；手动增强模式需填写模拟器安装根目录与多开实例索引。旧配置未包含 `autoDetect` 时，原 ADB 配置启用自动识别，原 MuMu/雷电增强配置保持手动。手动选择 ADB 会关闭自动识别；已自动保存或手动选择增强接口后，重新连接无法确认实例或 SDK 时会报错，不静默改为 ADB。选择与覆盖规则见 [共享连接设置](connection-settings.md)。配置只用于下次连接，已连接设备需先停止执行、断开再重连。

- MuMu 支持上游 MaaCore v6.20.1 的 MuMu 12 / MuMuNx Android 15 SDK 布局。传入安装根目录，worker 使用 `MuMuEmulator12` 和 `{path,index,touch}`；默认 `touch:false`，可显式启用实验性增强触控，接口限制见 [共享设置](connection-settings.md)。自动定位此根目录中的内置 ADB。
- 雷电使用 `LDPlayer` 和 `{path,index,pid}`。自动模式使用 `list2` 及 ADB 监听归属核实的实例，要求安装根目录存在 `ldopengl64.dll`；连接时使用本轮确认的截图 PID，不持久保存 PID。手动模式仍可在连接时用固定 `ldconsole.exe list2` 核对所选已启动实例。本轮尚未进行雷电实机验收。
- MuMu 优先以管理器返回的安装目录、实例编号和实际 ADB 端口核对截图 SDK 与设备。管理器不可用时，仅对默认布局使用 `16384 + (index % 32) × 32 + floor(index / 32) × 4` 与 `emulator-(5554 + 2 × index)` 规则校验；这不是自定义端口的通用公式。雷电仍按 `5555 + 2 × index` 检查。MuMu 自定义网络地址须显式启用桥接模式并指定 SDK 实例号。
- MuMu 已确认的本地端口别名与桥接地址共享同一实例租约，防止第二个控制者绕过互斥；不同安装目录的同编号实例独立识别。桥接模式必须能通过管理器确认本机实例，无法确认时拒绝连接。更新此锁规则前须退出旧版本实例。

增强模式在连接前通过 `AsstSetConnectionExtras` 配置，随后核验 MaaCore 的 `FastestWayToScreencap` 回调，实际方法必须为 `MumuExtras` / `LDExtras`。初始化失败、缺少方法证据或选中 ADB 时，连接失败并禁止提交任务；已连接后收到增强截图失败或方法变化时，停止队列、将设备标记离线并报告原因。设备页的「实际截图方式」来自核心回调，离线或尚未确认方法时不显示已确认驱动。

上游公开 API 会比较增强与 ADB 候选，并不提供强制指定方法的开关。这里以回调确认和拒绝降级保证任务准入；不能据此声称 MaaCore 内部从未进行 ADB 截图探测。worker 的 `screencap` 命令按异步结果确认新帧，只返回确认结果；画面预览使用下述 `frame` 路径在本地返回 PNG。模拟器 SDK 的路径使用普通 Windows 绝对路径，文件检查及其他原生路径仍支持扩展路径。

接口依据：[AsstSetConnectionExtras](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/include/AsstCaller.h)、[MuMu SDK](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/src/MaaCore/Controller/MumuExtras.cpp)、[雷电实例发现](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/src/MaaWpfGui/Models/EmulatorConnectionExtra/LDPlayerExtra.cs)。

2026-10-22 Windows x64 / MuMu 6.8.1.0、Android 15 实测：官方 MaaCore v6.20.1 与资源 `7ce3228b4744bae8571c641f85020de7a757c0c6` 自动安装并原生加载；确认 `MumuExtras` 首次选择耗时 11 ms，ADB 候选 145 / 227 / 616 ms。连续十次异步截图成功、断开重连、别名去重与第二控制者争锁拒绝通过；新构建的 release WebView 显示真实连接及增强截图。该次截图耗时不是持续帧率；未执行游戏任务、付费模型或账号上传，也未验收其他模拟器或平台。

## 画面预览与人工点击

底部「画面」跟随顶部所选设备，展示加载、离线、失败与重试状态。刷新频率可选 **5 / 10 / 15 / 30 / 60 / 90 / 120 Hz**，首次默认 **60 Hz**；偏好保存在本机 WebView 的 `localStorage` 键 `maaverge:ui:preview-fps`，非法或无法读取的值回到默认值。目标间隔为 `1000 / Hz` 毫秒，扣除请求与解码耗时后再调度下一次；同一设备只保留一个未完成的取帧请求，慢请求不会积压。图像解码完成后才替换，支持暂停刷新，页面隐藏、收起面板或切换设备时停止后续轮询并丢弃旧回复。

界面分别显示目标刷新频率、实际「显示帧率 FPS」及包含请求、传输和解码的「往返延迟」。目标频率不是实际帧率承诺；截图驱动、PNG 编码、IPC、解码及 WebView 的显示能力决定最终表现。已有 MuMu 的 11 ms 首次截图方式选择记录也不能当作持续 60 FPS 的证明。预览与点击接入时使用 mock 和合成核心验证；本次移除产品 mock 没有新增真实模拟器持续帧率或点击效果的验收，仍需显式选择设备后记录。

页面只经 `packages/contracts` 的类型化 transport 请求，接口由 JSON Schema 生成：

```ts
rpc('device.frame', { deviceId }) // -> ScreenFrame
type ScreenFrame = {
  deviceId: string;
  frameId: string;
  capturedAt: string; // 本次取帧请求开始时间；运行中不代表核心缓存的原始采集时间
  width: number;
  height: number;
  mimeType: 'image/png';
  data: string; // PNG base64，仅在本地 IPC 与内存中流转
  canControl: boolean;
  latencyMs: number; // 应用服务取帧耗时，区别于页面测得的往返延迟
};
rpc('device.click', { deviceId, frameId, x, y, requestId }) // -> { accepted: true }
```

空闲时，worker 确认 `AsstAsyncScreencap` 成功后通过 `AsstGetImage` 读取新画面；任务执行中只读取 MaaCore 最近缓存，不额外启动截图，`canControl` 为 `false`，页面提示「任务执行中，显示核心最近画面，仅查看」。缓存可能停留在上次核心采集的画面，刷新页面频率不会让任务中的核心额外采集。

预览与点击始终要求当前设备对应的已连接 worker；离线、接口缺失或取帧失败时报告错误，不替换为演示图片或模拟成功。合成 PNG、设备和点击回复仅存在于测试夹具。

「允许点击操作」默认关闭。开启后，页面按正在显示的 PNG 尺寸消除缩放及留白，将位置映射为整数 `(x, y)`；留白、超出范围、过期画面、任务运行中与上一点击尚未结束时均禁止点击。坐标属于 MaaCore 预览 PNG，`AsstAsyncClick` 使用同一缩放代理，不再乘设备物理分辨率比例。

应用服务在内存中保留每设备最近 **32 帧、最长 2 秒**的控制记录；超过任一限制都会拒绝旧帧。它还核验 `frameId` 对应设备、worker 身份、`canControl`、当前任务与原生空闲状态，断开、切换或点击结束后使旧记录失效。点击优先停止后续截图；若已有一次取帧尚未完成，等待它结束后发送原生点击，期间不再排入新的截图。核心确认点击异步结果后返回 `accepted`；这不代表游戏内业务目标已经完成。

每次用户点击只生成一个 `requestId` 并发送一次，前端不自动重试。服务在当前会话内复用同 ID、同参数的成功或失败结果，同 ID 的不同操作会被拒绝；去重缓存按 5 分钟清理、最多 2048 项，不跨服务重启持久化。超时或确认丢失时应查看新画面后再决定是否重新操作。预览实现不把 PNG 写入截图文件、业务数据库或事件，也不上传图像；点击事件可包含设备、帧号、坐标与请求标识。
