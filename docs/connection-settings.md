# 连接与开始唤醒的共享设置

设备页和开始唤醒任务共用全局连接设置，参考 [原版 MAA 连接文档](https://docs.maa.plus/zh-cn/manual/connection.html)。开始唤醒的 `client_type`、是否启动游戏和账号切换仍属于任务参数；连接设备不会执行这些任务。

- `Settings.connection` 可选，旧设置保持默认链路。显式保存后包含 ADB 路径、常用连接地址、内置连接配置、触控模式、ADB Lite 和连接阶段的客户端。ADB 路径支持绝对路径、用户目录或 `adb`（系统 PATH/SDK），留空沿用环境变量、增强截图模拟器内置 ADB 与自动发现。
- `Settings.capture` 沿用 ADB/MuMu/雷电截图模式，增加可选 `mumuTouch` 与 `mumuBridge`。Windows 增强截图验证本机 SDK、实例编号和核心实际回调；缺失证据或回退到 ADB 将拒绝连接/执行。
- C++ worker 在 `AsstAsyncConnect` 前通过 `AsstSetInstanceOption` 设置 TouchMode=2、AdbLiteEnabled=4、KillAdbOnExit=5（固定关闭）和 ClientType=6。应用宝和 WSA 在连接阶段需要客户端包名，需与开始唤醒客户端保持一致。选择不受当前核心支持的选项会明确失败。
- MuMu 触控增强通过连接 extras 的 `touch: true` 和触控模式 `MumuExtras` 传递，需要 Windows x64 官方 MuMu 6.3.2+。这是上游实验接口，核心可能回退 Minitouch；触控成功无法由截图证据证明，界面不宣称触控增强已验收。
- MuMu 桥接模式明确指定本机 SDK 实例号，允许手动 ADB 网络地址；设备租约映射到同一 MuMu 实例的标准地址，防止桥接地址与本地串号绕过本应用的共享锁。自动发现仍只扫描本机候选；桥接地址由用户手动连接并核对截图。
- 截图测试通过 `device.frame` 读取已连接设备的实际 PNG，展示尺寸、传输延迟和核心确认的截图协议；测试画面只保存在当前组件内存，不写入业务数据库。耗时包含截图、传输和后端校验，区别于原版仅比较截图方式的最优耗时。

本功能不自动启动模拟器，不下载替换 ADB，不注册表查找安装目录，不提供任意启动命令或平台窗口连接。MaaFwAdb/AVD 依赖当前核心携带的控制单元；Windows MuMu/雷电增强能力尚需用户显式选择对应版本的真实设备验收。其他平台不能启用 Windows 增强接口。
