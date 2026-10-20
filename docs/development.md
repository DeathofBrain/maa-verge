# 开发环境与多机协作

## 统一版本与恢复

版本来源为 `.node-version`（Node 24）、`package.json#packageManager`（pnpm 10）、`.python-version`（Python 3.12）和 `rust-toolchain.toml`。依赖由 `pnpm-lock.yaml`、`uv.lock`、`apps/desktop/src-tauri/Cargo.lock` 锁定。

每台机器从相同 Git 提交重新执行引导脚本。不要复制其他电脑的 `node_modules`、`.venv`、`.tools`、Rust target 或产品数据库。

```powershell
# Windows：完整 Python + 前端；-Native 额外验证原生依赖
powershell -ExecutionPolicy Bypass -File tools/bootstrap.ps1
```

```bash
# macOS / Linux
bash tools/bootstrap.sh
```

引导脚本只在仓库 `.tools` 安装缺少的 Node/pnpm/uv，并使用 uv 管理的 Python。Node 下载通过官方 SHA256 清单验证。Rust 和系统 SDK 需要单独安装，不由引导脚本更改管理员配置。脚本不修改用户 PATH；没有全局 Node/pnpm 时，使用 `powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 <command>` 或 `bash tools/pnpm.sh <command>`，包装脚本会选择本地工具。

已有工具链的机器可直接运行：

```bash
pnpm install --frozen-lockfile
uv sync --frozen
pnpm doctor
pnpm dev:mock
```

浏览器 mock 完全不需要 Python、Rust、ADB、MaaCore 或模型 Key。它验证 UI/协议与确定性场景，不证明真实核心加载或游戏自动化成功。原生桌面开发默认也使用 mock 适配器，安装版默认 native。

## 三平台原生依赖

| 平台 | 系统依赖 |
| --- | --- |
| Windows x64 | Visual Studio 2022 Build Tools，选择“使用 C++ 的桌面开发”、MSVC x64/x86 和 Windows 10/11 SDK；Microsoft Edge WebView2 Runtime；Rust MSVC 工具链 |
| macOS 13.3+ | `xcode-select --install`；Rust；在目标 CPU 架构运行 Node、Python 与构建；签名/公证另外配置 |
| Ubuntu 22.04/24.04 x64 | 下方 apt 包、Rust；图形桌面用于运行，CI 可只编译；AppImage 运行需要 FUSE |

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev patchelf libfuse2
```

Rust 使用 [rustup](https://rustup.rs/) 安装；在仓库运行 cargo 会按 `rust-toolchain.toml` 选择版本。Windows 从 Developer PowerShell for VS 2022 启动可帮助诊断链接器。若选择本地 `.tools/cargo` 与 `.tools/rustup`，工具脚本会自动识别；不要提交这些目录。

```bash
node tools/doctor.mjs --native
pnpm dev
node tools/check-native.mjs --required
pnpm build
```

`pnpm dev` 同步冻结 Python 依赖，运行 Vite，再启动 Tauri；Tauri 只运行项目 `.venv` 内的 `python -m maaverge_runtime`。前端不能传入可执行文件路径或 Shell。打包版本运行资源目录内的固定 `runtime/maaverge-runtime`，默认使用 native 模式；显式设置 `MAAVERGE_MODE=mock` 可覆盖，开发脚本始终默认 mock。两种模式的数据存于各自的 `<data-root>/<mode>`，避免演示数据进入真实运行。退出时先关闭 stdin，让 Python 收尾，5 秒后仍不退出则终止服务进程。

需要验证原生核心时，显式启用 native 模式。它会自动下载核心与资源；设备连接仍在设置中手动发起，连接后也不会自动执行计划。

```powershell
$env:MAAVERGE_MODE = 'native'
# 如 ADB 未在 PATH：$env:MAAVERGE_ADB_PATH = '你的 adb.exe 绝对路径'
powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 dev
```

```bash
MAAVERGE_MODE=native bash tools/pnpm.sh dev
```

窗口关闭默认进入托盘；关闭设置中的“关闭窗口时最小化到托盘”后，关闭窗口会完全退出。托盘的“退出”始终完全退出。无系统托盘的 Linux 桌面不属于已验证交互环境，需后续实机确认。

## 多 checkout 与配置

开发脚本对 checkout 绝对路径计算哈希，隔离开发端口、用户数据目录和单实例 ID。默认数据目录：

| 系统 | 开发数据目录 |
| --- | --- |
| Windows | `%LOCALAPPDATA%/MAAVerge-dev/<checkout-hash>` |
| macOS | `~/Library/Application Support/MAAVerge-dev/<checkout-hash>` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/MAAVerge-dev/<checkout-hash>` |

`MAAVERGE_DATA_DIR` 和 `MAAVERGE_DEV_PORT` 可覆盖；`MAAVERGE_DEVICE_LOCK_DIR` 只能指向同机所有实例共用的设备锁根目录，不能放在各自的 worktree。`MAAVERGE_ADB_PATH` 可指定 ADB，无固定模拟器或开发者路径假设。`.env.example` 是配置说明，脚本不会自动执行或加载 `.env`；在终端显式设置环境变量。

`pnpm doctor` 只检查环境，不连接设备、不发模型请求、不输出密钥。`--native` 将原生依赖设为必需。可选 ADB 的缺失不阻断 mock 开发。真实设备测试由用户明确选择，且必须记录核心、资源、平台及设备标识的脱敏值。

## 构建与持续集成

`pnpm build` 依次构建 TypeScript/React、通过锁定的 PyInstaller 生成 Python `onedir` 侧进程，再调用 Tauri 打包。Python 的包及数据一并收集；MaaCore 和游戏资源由运行期安装器下载，不嵌入应用包。不能在 Windows 构建 Linux/macOS 的 Python 原生依赖。

```bash
node tools/package-runtime.mjs
```

PyInstaller 产物位于 `dist/runtime/maaverge-runtime`；Tauri 安装包位于 `apps/desktop/src-tauri/target/release/bundle`。构建中会运行 `node tools/smoke-runtime.mjs`，使用临时 mock 数据目录验证打包服务的 JSON-RPC 快照和 EOF 正常退出，并通过本地无害 ZIP 验证 frozen 辅助进程实际调用官方 Updater。该检查不会下载核心、连接设备或调用模型。开发 cargo 检查创建的占位资源目录不包含可执行文件，不能替代实际打包。图标从 `tools/generate-icons.mjs` 确定性生成，修改源后运行该脚本。

CI 的应用检查覆盖类型、Python、构建和浏览器 mock 端到端；原生矩阵覆盖 Windows x64、Ubuntu x64、macOS arm64/x64 的 fmt/clippy/test 和未签名构建。CI 配置存在不等于平台已验证，以实际工作流结果和 `docs/STATUS.md` 为准。开发检查在没有 cargo 时明确跳过原生部分；CI 禁止跳过。

macOS 主应用与 Python 侧进程包含允许加载后续下载库的 entitlement，但正式发行仍须为全部嵌套 Mach-O/动态库签名、公证，并验证下载 MaaCore 后的加载。Windows 签名和 Tauri 应用自动更新发布源也需要发行凭据；当前 CI 只生成未签名工件，不自动发布。
