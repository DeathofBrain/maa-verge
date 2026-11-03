# 模拟器自动连接

本文描述 `feat/atomic` 当前源码。`pnpm dev` 和发行桌面均使用真实 MaaFramework 原生服务，不加载 MaaCore；旧 `MAAVERGE_MODE=mock` / `--mode mock` 已移除并明确报错。无需设置模式，兼容保留的值仅为 `native`。没有设备时不生成演示设备；先在「设置 → 更新」安装并启用独立的 MaaFramework 与游戏资源，再连接设备。Agent 本地提案仍可生成，保存后需连接真实设备并通过执行预检才能手动运行。`pnpm dev:ui` 只启动前端，普通浏览器没有桌面服务时提示不可用。

服务在启动、自动连接开启且组件可用时发现模拟器。Windows、macOS、Linux 共用 ADB 状态订阅及历史目标端口检查：即使没有在线设备也保持 `host:track-devices` 订阅；历史模拟器或允许接入的本机设备上线后自动排队连接。尚未注册到 ADB 的离线历史目标及已保存本机实例，每 2 秒检查一次 TCP 端口，单次最多等待 200ms、最多并行检查 4 个地址；端口就绪后才执行固定 ADB 连接及设备状态确认，再建立 MaaFramework Controller。周期检查本身不创建子进程、不枚举模拟器进程，也不反复解析 ADB 路径。

后台连接最多并行 2 个目标，最终以 MaaFramework 异步连接成功及空闲确认作为就绪依据，请求被接收不算连接成功。失败按 2、4、8、16、30 秒退避，之后保持 30 秒；设备租约占用时快速失败并等待 30 秒，不抢占其他实例。端口持续开放或重复 ADB 快照不会重置退避；新的就绪变化、配置修改及手动重试可以提前触发。其他设备执行任务不阻止历史目标重连，组件准备、Framework／资源切换、应用更新与退出仍会阻止新连接。原有每 30 秒空闲发现保留，用于尚未见过的新实例，不承担历史目标的快速重连。

设置 `autoConnect` 默认开启；关闭后不再自动接入设备，但仍监听已连接设备掉线。手动断开或删除历史设备后，当前会话跳过该目标，别名或模拟器进程 PID 改变不会解除抑制；重新开启自动连接、主动点击自动连接或重启应用可以解除抑制。配置变更、关闭自动连接及退出会使旧检查和连接结果失效；连接恢复不会重放失败任务。自定义远程 ADB server 使用订阅及已有连接流程，不用本机端口探测推断远端设备是否就绪。真实数据继续位于 `<data-root>/native`；旧 `mock` 目录保留，产品不读取、迁移或删除它。

没有实例清单或只有自动生成的实例配置时，自动连接持续发现新启动的本机实例。清单包含手动新增或编辑过的配置后，只逐项尝试清单中的地址和配置，单项失败不阻止其他实例。手动“发现设备”始终可以连接已监听的本机候选 ADB 地址，再刷新设备列表；此步骤只建立 ADB 传输连接，不创建 Controller 或启动任务。共享／逐实例设置见[连接设置](connection-settings.md)，同表并行、分别停止与资源隔离见[多开说明](multi-instance.md)。

`device.auto_connect` 返回：

```ts
{
  devices: Device[]; // 本轮连接的设备；最终状态以 Controller 连接及设备事件为准
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

设备锁同时规范化 ADB server 的回环主机别名与默认端口，并遵循 `ADB_SERVER_SOCKET`（优先）、`ANDROID_ADB_SERVER_ADDRESS` / `ANDROID_ADB_SERVER_PORT` 的选择；ADB 子进程与 Framework 工作进程继承相同环境。

相同 ADB server 上的 `emulator-5554` 与 `127.0.0.1:5555` 等 Android 标准别名使用同一个共享设备锁。MuMu 结合管理器元数据和同一 MuMuNxDevice 进程的监听端口确认别名：同一实例的多个端口在列表中去重并共享租约，不同 PID 的多开实例独立保留。普通 `16384`、`5555`、`7555` 端口不再仅凭数字被全局合并。共享用户数据目录下的设备租约跨进程、工作树和业务数据根有效，连接期间持续保留，稳定锁文件不会删除。每设备只有一个常驻 Controller，预览、手动、任务、工具和 Debug 共用连接并互斥写入；结束控制会话不另建或重连第二个引擎。连接异步完成前不能运行任务；组件切换时不新增连接。

参考固定上游版本 **v6.20.0**，实现未复制上游带关闭模拟器、杀进程等副作用的助手：

- [连接说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/connection.md)：默认模拟器端口、ADB 路径和调试要求。
- [连接设置](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaWpfGui/ViewModels/UserControl/Settings/ConnectSettingsUserControlModel.cs)：`DefaultAddress` 与实例发现思路。
- [Windows 模拟器发现](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaWpfGui/Helper/WinAdapter.cs)：运行进程名称和内置 ADB 相对路径。
- [MuMu 管理器定位](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaWpfGui/Helper/EmulatorHelper.cs)：MuMuNx 安装布局与管理器入口。
- [macOS 设备说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/device/macos.md)：NoxAppPlayer 内置 ADB 路径，其他未命中路径可配置。
- [Python 模拟器辅助](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/Python/asst/emulator.py)：BlueStacks `bst.instance.<实例>.status.adb_port`。

自动发现回归使用测试中注入的替代 ADB、监听探测和合成 Framework 工作进程；安装包及桌面 smoke 在全新隔离的 native 数据库中预先关闭自动连接与更新，不使用产品 mock 开关。下文 Windows MuMu 的实测使用旧 MaaCore 路径，仅为历史；当前 Framework 路径、真实多开与各宿主仍按 [STATUS](STATUS.md) 分别记录，不能把路径实现或合成通过视为真实验收。自动启动模拟器、PlayCover、Windows 原生窗口仍需单独接入。

## 截图增强与触控配置

默认连接与每个多开实例各自保存 `connection.framework`，统一控制当前 Framework Controller 的截图与触控。截图默认**自动识别（推荐）**，触控默认 **MaaTouch**；两项独立，改变截图方式不会改写触控模式。配置用于下次连接，已连接设备需先停止执行、结束控制会话、断开再重连。完整选项与旧配置迁移规则见[连接设置](connection-settings.md)。

自动截图先核对 Windows MuMu／雷电的运行实例、安装目录、SDK 和编号；雷电还要核对本次 PID 与 ADB 端口归属。其余设备保留普通 ADB 截图候选，并探测 AVD 增强接口。手动可选择 **ADB 默认截图、MuMu 增强截图、雷电增强截图、AVD 增强截图**；MuMu／雷电需要对应安装目录与实例编号，AVD 不需要安装目录。手动增强的身份、平台或接口无法核实时明确失败，不静默换为另一种方式。

MuMu／雷电增强接口限对应的 Windows 安装。MuMu 优先用管理器的实际端口与实例信息核对，不能把常用端口公式当成任意自定义实例的身份证明；雷电要求 `list2`、运行进程与 `ldopengl64.dll`。MuMu 已确认的本地别名及桥接地址仍共享同一实例租约，不同安装目录的同编号实例独立识别。无法证明本机 SDK 与桥接目标属于同一实例时拒绝增强连接。

AVD 的本机 TCP 地址先通过固定只读 ADB 查询核对 QEMU 标记、AVD 名称及 console 名称，确认后才为增强流固定命令使用 `emulator-*` 串号。Controller 和设备锁保留原地址身份，不能仅凭相邻端口认定 AVD；远程地址不做本机探测。自动核对失败保留普通候选，手动 AVD 无法确认时提示修正配置。

触控可选 **MaaTouch、Minitouch + ADB 按键、ADB Shell、模拟器增强触控（MuMu）**。MuMu 增强触控有独立的安装目录与编号，可搭配普通 ADB 截图；若同时用 MuMu 增强截图，两项必须属于同一实例。固定 Framework 版本共用模拟器 extras，因此雷电／AVD 截图不能和 MuMu 触控组合，未识别出 MuMu 的自动截图也不能据此启用 MuMu 增强触控。具体逐点、按键及导航能力以当前接口结果为准。

当前配置通过 MaaFramework C API 创建 Controller，不使用 `AsstSetConnectionExtras`、旧 `MaaFwAdb` 库或 MaaCore 截图方式回调。`device.frame` 从同一 Controller 取得 PNG；服务端总耗时包含画面获取和 worker 通信，前端往返延迟还包含传输与解码。未提供具体截图方式时保留未提供状态，不以配置名称或历史速度证明增强驱动已生效。新实现的真实宿主与模拟器验收记录见 [STATUS](STATUS.md)。

## 历史验证：旧 MaaCore 路径

以下记录发生在 MaaFramework 统一运行架构之前，不代表当前连接、截图、触控或持续帧率已经验收。

2026-10-22 Windows x64 / MuMu 6.8.1.0、Android 15 实测：官方 MaaCore v6.20.1 与资源 `7ce3228b4744bae8571c641f85020de7a757c0c6` 自动安装并原生加载；确认 `MumuExtras` 首次选择耗时 11 ms，ADB 候选 145 / 227 / 616 ms。连续十次异步截图成功、断开重连、别名去重与第二控制者争锁拒绝通过；新构建的 release WebView 显示真实连接及增强截图。该次截图耗时不是持续帧率；未执行游戏任务、付费模型或账号上传，也未验收其他模拟器或平台。

当时的接口依据为 [AsstSetConnectionExtras](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/include/AsstCaller.h)、[MuMu SDK](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/src/MaaCore/Controller/MumuExtras.cpp)及[雷电实例发现](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/src/MaaWpfGui/Models/EmulatorConnectionExtra/LDPlayerExtra.cs)。这些来源继续保留归因，旧 API、参数和截图方式回调不作为本分支当前执行路径。

## 画面预览与人工点击

底部「画面」跟随顶部所选设备，展示加载、离线、失败与重试状态。任务表执行页仅展示结果截图，不自动启动实时预览。刷新频率可选 **5 / 10 / 15 / 30 / 60 / 90 / 120 Hz**，首次默认 **60 Hz**；偏好保存在本机 WebView 的 `localStorage` 键 `maaverge:ui:preview-fps`，非法或无法读取的值回到默认值。目标间隔为 `1000 / Hz` 毫秒，扣除请求与解码耗时后按 WebView 绘制节奏调度下一次；同一设备的请求和解码串行，慢请求不会积压。图像解码完成后才替换，Blob URL 在换帧、取消、离线和卸载时释放，性能统计每 250 毫秒更新；支持暂停刷新，页面隐藏、收起面板或切换设备时停止后续轮询并丢弃旧回复，取消解码不会阻塞重新打开的画面。

界面分别显示目标刷新频率、实际「显示帧率 FPS」及包含请求、传输和解码的「往返延迟」。目标频率不是实际帧率承诺；截图驱动、PNG 编码、IPC、解码及 WebView 的显示能力决定最终表现。历史 MuMu 的 11 ms 首次截图方式选择记录也不能当作当前 Framework 持续 60 FPS 的证明。预览、点击与互斥采用隔离合成端口回归，真实持续帧率和输入效果仍须显式选择设备后分别记录。

页面只经 `packages/contracts` 的类型化 transport 请求，接口由 JSON Schema 生成：

```ts
rpc('device.frame', { deviceId }); // -> ScreenFrame
type ScreenFrame = {
  deviceId: string;
  frameId: string;
  capturedAt: string; // 本次取帧请求开始时间，不是设备驱动提供的原始采集时间
  width: number;
  height: number;
  mimeType: 'image/png';
  data: string; // PNG base64，仅在本地 IPC 与内存中流转
  canControl: boolean;
  engine: 'maafw';
  fresh: boolean; // 当前是否可作为新帧使用；仍须结合会话、权限和输入代际
  latencyMs: number; // 应用服务取帧耗时，区别于页面测得的往返延迟
};
rpc('device.click', { deviceId, frameId, x, y, requestId }); // -> { accepted: true }
```

空闲取帧复用已连接的 Framework Controller，确认 `MaaControllerPostScreencap` 成功后读取该次图像并返回 PNG，不为预览创建第二个控制器。正式 Pipeline 期间，外部预览不能向当前 worker 插入额外截图请求；已有画面只供查看，不保证继续更新。工作流内部只有当前授权 Custom 上下文能按流程取帧，不能用外部刷新频率改变任务顺序。

预览与点击始终要求当前设备对应的已连接 worker；离线、接口缺失或取帧失败时报告错误，不替换为演示图片或模拟成功。合成 PNG、设备和点击回复仅存在于测试夹具。

「允许点击操作」默认关闭。开启后，页面按正在显示的 PNG 尺寸消除缩放及留白，将位置映射为整数 `(x, y)`；留白、超出范围、过期画面、任务运行中与上一点击尚未结束时均禁止点击。坐标属于当前 Framework PNG 的 `frame` 空间，由同一 Controller 执行，不套用旧 MaaCore 缩放代理。业务或 Debug 会话占用设备时，外部人工点击还必须满足宿主授权，不能绕过会话互斥。

应用服务在内存中保留每设备最近 **32 帧、最长 2 秒**的控制记录；超过任一限制都会拒绝旧帧。它还核验 `frameId` 对应设备、worker、会话、资源代、`canControl`、当前任务与原生空闲状态；断开、切换、会话边界或实际输入尝试使旧记录失效。点击优先停止后续截图；若已有一次取帧尚未完成，等待它结束后发送原生点击，期间不再排入新的截图。Framework 确认点击结果后返回 `accepted` 与 `nativeSuccess`；这不代表游戏内业务目标已经完成。

每次用户点击只生成一个 `requestId` 并发送一次，前端不自动重试。服务在当前会话内复用同 ID、同参数的成功或失败结果，同 ID 的不同操作会被拒绝；去重缓存按 5 分钟清理、最多 2048 项，不跨服务重启持久化。超时或确认丢失时应查看新画面后再决定是否重新操作。预览实现不把 PNG 写入截图文件、业务数据库或事件，也不上传图像；点击事件可包含设备、帧号、坐标与请求标识。
