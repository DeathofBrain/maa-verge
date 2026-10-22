# 模拟器自动连接

`pnpm dev` 和发行桌面均使用真实原生服务；旧 `MAAVERGE_MODE=mock` / `--mode mock` 已移除并明确报错。无需设置模式，兼容保留的值仅为 `native`。没有设备时不生成演示设备，没有核心时显示「未安装」并通过真实更新源安装；Agent 本地提案仍可生成，保存后需连接真实设备才能手动执行。`pnpm dev:ui` 只启动前端，普通浏览器没有桌面服务时提示不可用。

服务在启动并具备已启用 MaaCore 后自动发现模拟器，每 30 秒在空闲时重试。设置 `autoConnect` 默认开启；关闭后仅保留用户主动触发的连接。手动断开设备后，该设备不会立即被后台重连；重新开启自动连接、主动点击自动连接或重启应用可以解除抑制。后台发现期间关闭自动连接或手动断开设备，会阻止该轮随后建立新的核心连接。真实数据继续位于 `<data-root>/native`；旧 `mock` 目录保留，产品不读取、迁移或删除它。

保存独立实例清单后，自动连接只逐项尝试清单中的地址和配置，单项失败不阻止其他实例；没有清单时沿用下述自动发现。手动“发现设备”仍可扫描本机候选。共享/逐实例设置见 [连接设置](connection-settings.md)，同表并行、分别停止与客户端资源隔离见 [多开说明](multi-instance.md)。

`device.auto_connect` 返回：

```ts
{
  devices: Device[]; // 已发起核心连接的设备；最终状态由异步连接结果确认
  discovered: { address: string; name: string; adbState: string }[];
  diagnostics: string[];
}
```

发现顺序为 ADB 现有设备、上游有限的默认本机端口和 BlueStacks 实例配置中的端口。只尝试已有监听服务的端口，不扫描端口范围。自动模式只接入回环地址与 `emulator-*`，USB 手机仍需手动选择。自动连接不会启动模拟器、启动游戏或运行任务。ADB 授权未完成的设备会出现在诊断中。

ADB 优先使用 `MAAVERGE_ADB_PATH`，其次 PATH、Android SDK 与常见模拟器安装位置。非标准安装可通过以下环境变量配置，变量值不提交至仓库：

- `MAAVERGE_EMULATOR_DIRS`：以系统路径分隔符分隔的模拟器安装目录，定位内置 ADB。
- `MAAVERGE_EMULATOR_ADDRESSES`：最多 16 个以逗号分隔的 `127.0.0.1:端口`、`localhost:端口` 或 `[::1]:端口`。
- `MAAVERGE_BLUESTACKS_CONFIG`：动态实例端口配置 `bluestacks.conf` 的路径。
- `ANDROID_HOME` / `ANDROID_SDK_ROOT`：Android SDK 根目录。

设备锁同时规范化 ADB server 的回环主机别名与默认端口，并遵循 `ADB_SERVER_SOCKET`（优先）、`ANDROID_ADB_SERVER_ADDRESS` / `ANDROID_ADB_SERVER_PORT` 的选择；ADB 子进程与核心工作进程继承相同环境。

相同 ADB server 上的 `emulator-5554` 与 `127.0.0.1:5555` 等别名使用同一个共享设备锁，避免不同本地实例通过别名同时取得控制权。连接异步完成前不能运行任务；组件切换时不新增连接。

参考固定上游版本 **v6.20.0**，实现未复制上游带关闭模拟器、杀进程等副作用的助手：

- [连接说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/connection.md)：默认模拟器端口、ADB 路径和调试要求。
- [连接设置](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaWpfGui/ViewModels/UserControl/Settings/ConnectSettingsUserControlModel.cs)：`DefaultAddress` 与实例发现思路。
- [macOS 设备说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/device/macos.md)：NoxAppPlayer 内置 ADB 路径，其他未命中路径可配置。
- [Python 模拟器辅助](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/Python/asst/emulator.py)：BlueStacks `bst.instance.<实例>.status.adb_port`。

自动发现回归使用测试中注入的替代 ADB、监听探测和合成核心工作进程；安装包及桌面 smoke 在全新隔离的 native 数据库中预先关闭自动连接与更新，不使用产品 mock 开关。本机 Windows MuMu 的历史实际验证见下节。Windows/macOS/Linux 的路径分支与默认端口是实现范围，不能据此声称三个平台的真实模拟器均已验收。MuMu 增强触控已有实验设置入口但尚未真实验收；自动启动模拟器、PlayCover、Windows 原生窗口及非标准安装进程探测仍需单独接入或配置。

## 可选的模拟器增强截图

设备页的「截图方式」可以保存 **ADB 默认截图、MuMu 增强截图、雷电增强截图**。增强模式需填写模拟器安装根目录与多开实例索引；没有关联实例时保存全局默认，关联实例使用其独立配置，供下次连接使用，已连接设备继续使用原截图方式。切换后先断开，再重新连接。旧设置未包含 `capture` 时保持 ADB 行为。当前仅 Windows 支持这两种增强模式。

- MuMu 支持上游 MaaCore v6.20.1 的 MuMu 12 / MuMuNx Android 15 SDK 布局。传入安装根目录，worker 使用 `MuMuEmulator12` 和 `{path,index,touch}`；默认 `touch:false`，可显式启用实验性增强触控，接口限制见 [共享设置](connection-settings.md)。自动定位此根目录中的内置 ADB。
- 雷电使用 `LDPlayer` 和 `{path,index,pid}`；连接时执行固定的 `ldconsole.exe list2`，取得所选已启动实例的 PID，不持久保存 PID。需安装根目录中存在 `ldopengl64.dll`。本轮尚未进行雷电实机验收。
- 对标准 MuMu TCP 地址 `16384 + 32 × index`、`emulator-(5554 + 2 × index)` 和雷电 `5555 + 2 × index` 检查实例匹配，避免截图 SDK 与 ADB 控制不同实例；MuMu 自定义网络地址须显式启用桥接模式并指定 SDK 实例号，其他自定义端口尚未接入映射配置。
- MuMu TCP 默认地址与 `emulator-*` 别名在 TypeScript/Python 中使用相同设备锁身份，与截图选项无关。同一 ADB server 下的别名不会创建第二个控制者；更新此锁规则前须退出旧版本实例。

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
