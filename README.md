# Maa Verge

基于 MaaCore 的本地明日方舟桌面助手，使用 Tauri 2、React/TypeScript 与 Python 3.12，目标平台为 Windows、macOS 和 Linux。界面与业务服务通过类型化 JSON-RPC 通信，原生核心与桌面进程隔离。

这是开发中的工程，请以 [开发状态](docs/STATUS.md) 判断当前实际能力；[完整计划](PLAN.md) 描述后续交付。默认开发和 CI 使用 mock，不连接真实游戏、不调用付费模型。

![Maa Verge 的 Mock 开发界面](docs/images/mock-workspace.png)

## 开始开发

安装 Node（版本见 `.node-version`）和 `package.json` 指定的 pnpm，或使用仓库内引导脚本：

```powershell
# Windows PowerShell，仅准备界面 mock 环境
powershell -ExecutionPolicy Bypass -File tools/bootstrap.ps1 -MockOnly
powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 dev:mock
```

```bash
# macOS / Linux
bash tools/bootstrap.sh --mock-only
bash tools/pnpm.sh dev:mock
```

不加 `-MockOnly` / `--mock-only` 时还会准备 uv、Python 3.12 和锁定的 Python 依赖。脚本将缺少的 Node、pnpm、uv 放入忽略的 `.tools` 目录，不改系统 PATH 或用户配置。上面的包装脚本可在没有全局 Node/pnpm 的终端使用；已有固定版本工具链时直接运行 `pnpm dev:mock`。表中其他 pnpm 命令也可通过同一包装脚本执行。

原生开发还需 Rust 与对应系统 SDK，详见 [环境搭建](docs/development.md)。

| 命令 | 用途 |
| --- | --- |
| `pnpm dev:mock` | 浏览器 mock，无需模拟器、MaaCore、Rust 或模型密钥 |
| `pnpm dev` | React + Tauri + 本地 Python 服务，默认仍使用 mock 适配器 |
| `pnpm run doctor` | 工具链、依赖和本地环境诊断 |
| `pnpm check` | TypeScript、Python 与可用时的 Rust 检查 |
| `pnpm test:e2e:mock` | 浏览器 mock 端到端测试 |
| `pnpm build` | 当前系统与架构的桌面包和 Python 侧进程 |

MaaCore 首次安装、核心更新与资源更新使用独立通道。更新在候选目录准备，验证后于任务空闲边界切换，不覆盖正在使用的文件。核心版本没有变化也必须独立检测资源更新。当前原生能力与验证限制请查看状态文档。

## 协作与许可

跨电脑使用 Git 同步源码、文档和锁文件，在各机重新安装依赖。设备、数据库、缓存、密钥和虚拟环境不进入 Git。自动化贡献者先读 [AGENTS.md](AGENTS.md)，提交方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。

Maa Verge 采用 **AGPL-3.0-only**。MAA/MaaCore 为 [MaaAssistantArknights](https://github.com/MaaAssistantArknights/MaaAssistantArknights) 上游项目；Maa Verge 使用独立名称，不代表游戏官方或上游官方客户端。

默认日常工作台提供任务表管理、逐项参数、排序与启停，支持表级设备绑定、消耗限额和跨页运行条；原生模式支持正在运行的本地模拟器自动连接。完整原 MAA 兼容是交付目标，当前仍为开发预览，详细范围与缺口见 [功能覆盖与验收](docs/maa-compatibility.md) 和 [自动连接说明](docs/emulator-connection.md)。
