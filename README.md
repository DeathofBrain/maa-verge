<p align="center">
  <img src="apps/desktop/src-tauri/icons/128x128.png" width="96" height="96" alt="Maa Verge Logo" />
</p>

<h1 align="center">Maa Verge</h1>

<p align="center">真正的跨平台 · （未来）真正的PRTS（大嘘） · 正在努力开发中</p>

<p align="center">
  <a href="https://github.com/DeathofBrain/maa-verge/releases"><strong>下载软件</strong></a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#常见问题">常见问题</a> ·
  <a href="https://github.com/DeathofBrain/maa-verge/issues">反馈问题</a>
</p>

Maa Verge 是一款免费开源的明日方舟桌面助手，基于 [MAA](https://github.com/MaaAssistantArknights/MaaAssistantArknights) 的自动化核心。你可以把基建、公招、自动作战等日常安排成任务表，连接模拟器后手动开始，并在软件中查看进度和执行记录。

> 当前提供 **[v0.1.0 开发预览](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.0)**，功能与兼容性仍在完善。本页的安装与使用说明以该发行版为准，已知限制见 [版本说明](https://github.com/DeathofBrain/maa-verge/blob/v0.1.0/docs/releases/v0.1.0.md)。

## 下载与安装

从 **[GitHub Releases](https://github.com/DeathofBrain/maa-verge/releases)** 下载软件，也可以点击下表直接下载 v0.1.0 安装包。

| 系统 | 安装包 | 安装方式 |
| --- | --- | --- |
| Windows x64 | [EXE（推荐）](https://github.com/DeathofBrain/maa-verge/releases/download/v0.1.0/Maa-Verge_0.1.0_x64-setup.exe) / [MSI](https://github.com/DeathofBrain/maa-verge/releases/download/v0.1.0/Maa-Verge_0.1.0_x64_zh-CN.msi) | 下载后运行安装程序 |
| macOS 13.5+ · Apple Silicon（M 系列） | [DMG · aarch64](https://github.com/DeathofBrain/maa-verge/releases/download/v0.1.0/Maa-Verge_0.1.0_aarch64.dmg) | 打开后将应用拖入「应用程序」 |
| macOS 13.5+ · Intel | [DMG · x64](https://github.com/DeathofBrain/maa-verge/releases/download/v0.1.0/Maa-Verge_0.1.0_x64.dmg) | 打开后将应用拖入「应用程序」 |
| Linux x64 | [AppImage](https://github.com/DeathofBrain/maa-verge/releases/download/v0.1.0/Maa-Verge_0.1.0_amd64.AppImage) / [DEB](https://github.com/DeathofBrain/maa-verge/releases/download/v0.1.0/Maa-Verge_0.1.0_amd64.deb) / [RPM](https://github.com/DeathofBrain/maa-verge/releases/download/v0.1.0/Maa-Verge-0.1.0-1.x86_64.rpm) | AppImage 赋予执行权限后运行；DEB / RPM 使用系统软件包管理器安装 |

在 Release 页面下载时，安装包位于 **Assets** 中。**Source code** 是源码压缩包，普通使用无需下载；[SHA256SUMS.txt](https://github.com/DeathofBrain/maa-verge/releases/download/v0.1.0/SHA256SUMS.txt) 可用于核对下载文件。

安装前请准备好：

- **模拟器与游戏**：自行安装安卓模拟器和明日方舟，在模拟器设置中开启 ADB 调试。
- **网络连接**：首次运行需要下载 MaaCore 和游戏资源，软件会自动准备，无需手动安装核心，也无需安装 Python、Node.js 或 Bun。
- **系统组件**：Windows 使用 WebView2，缺少时安装程序会引导安装；Linux 需要系统 WebView 与桌面库，目前以 Ubuntu 22.04 / 24.04 x64 为目标，其他发行版需自行确认依赖。

当前 Windows 安装包未正式签名，macOS 安装包尚未完成开发者签名与公证，系统可能提示无法验证发布者。三平台安装包已提供，完整安装与真实游戏任务的验证范围请查看版本说明。

## 能做什么

- **安排日常任务**：在同一张表中添加、复制和排序任务，分别设置参数，按需启用或关闭。
- **查看执行结果**：跟踪任务进度、材料掉落、基建反馈与失败原因，按需打开模拟器画面，随时停止当前执行。
- **管理模拟器多开**：为各实例保存连接配置，分别开始任务、查看进度和停止执行。
- **更新核心与资源**：自动下载安装 MaaCore，独立检查游戏资源，准备好的更新等待任务空闲后生效。
- **保留本地记录**：任务表、设置与执行记录保存在本机；主页提供近期执行、活动日历和组件版本，支持浅色与深色主题。

> **Agent 助手是后续主要开发目标之一，目前暂不可用，敬请谅解。**

### 界面预览

以下截图使用测试数据展示 v0.1.0 界面，不含真实账号信息。

![Maa Verge 主页：执行记录、活动日历与设备状态](docs/images/mock-workspace.png)

<details>
<summary>任务表：安排任务与设置作战参数</summary>

![任务表与自动作战设置](docs/images/mock-task-preparation.png)

</details>

<details>
<summary>执行过程：任务进度、掉落与基建反馈</summary>

![任务执行与结果汇总](docs/images/mock-execution.png)

</details>

<details>
<summary>组件更新：MaaCore 与游戏资源分别管理</summary>

![核心与资源更新设置](docs/images/mock-component-updates.png)

</details>

## 快速开始

1. **启动模拟器**。确认已安装游戏、开启 ADB 调试，并完成需要手动处理的登录。
2. **打开 Maa Verge**。首次运行等待 MaaCore 与基础资源下载安装完成，可在「设置 → 更新」查看状态。
3. **连接设备**。进入「设备」，点击「自动连接模拟器」，或先「发现设备」再连接对应条目。多开时核对当前选择的实例。
4. **配置任务表**。进入「任务表」，点击「新建任务表」，按需启停各项任务，检查游戏客户端、关卡、次数及理智药和源石数量，然后保存。
5. **开始日常**。点击「开始日常」，在「任务表执行」查看进度和结果。底部「画面」可打开预览，「停止执行」会结束当前队列，历史结果保存在「执行记录」中。

新建任务默认不使用理智药或源石，需要时在自动作战任务中明确设置数量。任务只会在手动开始后执行。

使用多开时，先在模拟器管理器中启动各实例，连接后从底部「多开执行」为设备选择任务表并开始。同一设备请只交给一个助手控制。

更多用法：[任务设置](https://github.com/DeathofBrain/maa-verge/blob/v0.1.0/docs/maa-task-settings.md) · [模拟器连接](https://github.com/DeathofBrain/maa-verge/blob/v0.1.0/docs/emulator-connection.md) · [多开说明](https://github.com/DeathofBrain/maa-verge/blob/v0.1.0/docs/multi-instance.md)

## 常见问题

### 找不到或连不上模拟器怎么办？

确认模拟器已启动、ADB 调试已开启，再到「设备」重新发现并连接。自动识别失败时，可在设备页手动填写连接地址，并选择模拟器自带的 ADB。修改连接配置后，先停止任务、断开，再重新连接。具体设置见 [连接说明](https://github.com/DeathofBrain/maa-verge/blob/v0.1.0/docs/connection-settings.md)。

### MaaCore 或资源下载失败怎么办？

在「设置 → 更新」查看失败原因，检查网络和目录写入权限。核心与资源默认放在程序同级的 `MaaCore`、`MaaResource` 文件夹；目录不可写时，在该页面分别改为可写目录后重试。

### 软件、核心和游戏资源怎么更新？

**v0.1.0 需要从 [Releases](https://github.com/DeathofBrain/maa-verge/releases) 下载新安装包来更新软件。** MaaCore 与游戏资源在「设置 → 更新」中分别管理，准备完成后等待任务空闲生效。核心已经是最新版时，游戏资源仍可能有更新。

### 支持定时执行和 AI 托管吗？

当前版本尚不支持定时执行或 AI 托管，请手动开始已保存的任务表。相关能力仍在开发中。

### 配置和执行记录如何备份？

先**完全退出应用**，再备份整个数据文件夹，保留数据库、截图及其他文件。v0.1.0 的默认位置如下：

| 系统 | 数据文件夹 |
| --- | --- |
| Windows | `%LOCALAPPDATA%\MAAVerge\native`，可粘贴到资源管理器地址栏 |
| macOS | `~/Library/Application Support/MAAVerge/native`，可在 Finder「前往文件夹」中打开 |
| Linux | `~/.local/share/MAAVerge/native`；设置了 `XDG_DATA_HOME` 时位于该目录下的 `MAAVerge/native` |

手动指定过数据目录时，以实际设置为准。开发版的数据位置已有调整，详见 [数据目录说明](docs/runtime-migration.md#数据交接与回退)。

### 会向外部服务发送数据吗？

设置与执行记录保存在本机。活动日历、组件下载和更新需要访问对应网络服务；新建自动作战任务的掉落汇报选项与原版 MAA 默认一致，可在任务设置中关闭向企鹅物流和一图流汇报。

## 遇到问题

欢迎在 **[GitHub Issues](https://github.com/DeathofBrain/maa-verge/issues)** 反馈，请尽量附上：

- 系统版本、Maa Verge 版本，以及设置中显示的 MaaCore 和资源版本。
- 模拟器名称与版本、复现步骤、预期结果和实际提示。
- 必要的错误截图或事件记录。v0.1.0 可在「设置 → 数据与诊断」中点击「导出当前事件」。

分享前请检查截图与记录中的账号、凭据和本地路径等个人信息。

## 参与与致谢

想参与开发或从源码构建，请阅读 [贡献指南](CONTRIBUTING.md) 和 [开发文档](docs/development.md)。开发进展见 [开发状态](docs/STATUS.md)，后续路线见 [项目计划](PLAN.md)。

感谢 [MaaAssistantArknights](https://github.com/MaaAssistantArknights/MaaAssistantArknights) 提供的自动化核心，以及 [MaaResource](https://github.com/MaaAssistantArknights/MaaResource) 的游戏资源。

Maa Verge 采用 [AGPL-3.0-only](LICENSE) 开源协议，是独立社区项目，不代表明日方舟官方或 MaaAssistantArknights 官方客户端。

本项目 Logo 参考《明日方舟》角色「帕拉斯」，由 `gpt-image-2.5-flare` 生成并经后期处理。角色形象的相关权利归原权利人所有；本项目的开源许可不代表获得相关第三方权利的授权，Logo 的使用也不代表游戏官方的授权或认可。
