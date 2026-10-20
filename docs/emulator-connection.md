# 模拟器自动连接

本地原生模式在启动并具备已启用 MaaCore 后自动发现模拟器，每 30 秒在空闲时重试。设置 `autoConnect` 默认开启；关闭后仅保留用户主动触发的连接。手动断开设备后，该设备不会立即被后台重连；重新开启自动连接、主动点击自动连接或重启应用可以解除抑制。

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

相同 ADB server 上的 `emulator-5554` 与 `127.0.0.1:5555` 等别名使用同一个共享设备锁，避免不同本地实例通过别名同时取得控制权。连接异步完成前不能运行任务；组件切换时不新增连接。

参考固定上游版本 **v6.20.0**，实现未复制上游带关闭模拟器、杀进程等副作用的助手：

- [连接说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/connection.md)：默认模拟器端口、ADB 路径和调试要求。
- [连接设置](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaWpfGui/ViewModels/UserControl/Settings/ConnectSettingsUserControlModel.cs)：`DefaultAddress` 与实例发现思路。
- [macOS 设备说明](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/manual/device/macos.md)：NoxAppPlayer 内置 ADB 路径，其他未命中路径可配置。
- [Python 模拟器辅助](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/Python/asst/emulator.py)：BlueStacks `bst.instance.<实例>.status.adb_port`。

验证使用替代 ADB、监听探测和核心工作进程，不连接真实模拟器或账号。Windows/macOS/Linux 的路径分支与默认端口是实现范围，不能据此声称三个平台的真实模拟器均已验收。模拟器增强截图/触控、自动启动模拟器、PlayCover、Windows 原生窗口及非标准安装进程探测仍需单独接入或配置。
