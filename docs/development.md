# 开发环境与多机协作

## 统一版本与恢复

版本来源为 `.node-version`（Node 24）、`package.json#packageManager`（pnpm 10）、`.bun-version`（Bun 1.4.3）和 `rust-toolchain.toml`。C++ worker 使用 CMake 3.25+ 与 C++20。`.python-version` 的 Python 3.12 仅供保留的参考实现和合成测试。依赖由 `pnpm-lock.yaml`、`uv.lock`、`apps/desktop/src-tauri/Cargo.lock` 及 CMake 中的源码哈希锁定。

每台机器从相同 Git 提交重新执行引导脚本。不要复制其他电脑的 `node_modules`、`.venv`、`.tools`、Rust target 或产品数据库。

```powershell
# Windows：前端及 Python 参考/合成测试；-Native 额外验证原生依赖
powershell -ExecutionPolicy Bypass -File tools/bootstrap.ps1
powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 setup:bun
```

```bash
# macOS / Linux
bash tools/bootstrap.sh
bash tools/pnpm.sh setup:bun
```

引导脚本在仓库 `.tools` 安装缺少的 Node/pnpm/uv，并使用 uv 管理参考测试所需的 Python；`-MockOnly` / `--mock-only` 跳过 Python。`pnpm setup:bun` 下载官方固定版本归档，按仓库保存的 SHA-256 校验后安装 `.tools/bun`，不会采用 PATH 中的全局 Bun。Node 下载通过官方 SHA256 清单验证。Rust、CMake、C++ 编译器和系统 SDK 需要单独安装。脚本不修改用户 PATH；没有全局 Node/pnpm 时，使用 `powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 <command>` 或 `bash tools/pnpm.sh <command>`，包装脚本会选择本地工具。

已有工具链的机器可直接运行：

```bash
pnpm install --frozen-lockfile
uv sync --frozen
pnpm setup:bun
pnpm run doctor
pnpm dev:mock
```

浏览器 mock 不需要 Python、Bun、Rust、C++ 编译器、ADB、MaaCore 或模型 Key。它验证 UI/协议与确定性场景，不证明真实核心加载或游戏自动化成功。桌面开发使用 TypeScript 服务与 C++ worker，默认仍为 mock；安装版默认 native。

## 三平台原生依赖

| 平台 | 系统依赖 |
| --- | --- |
| Windows x64 | Visual Studio 2022 Build Tools，选择“使用 C++ 的桌面开发”、MSVC x64/x86、Windows 10/11 SDK 和 CMake 工具；Microsoft Edge WebView2 Runtime；Rust MSVC 工具链 |
| macOS 13.5+ | `xcode-select --install`；CMake 3.25+；Rust；在目标 CPU 架构运行 Node/Bun 与构建；签名/公证另外配置 |
| Ubuntu 22.04/24.04 x64 | 下方 apt 包、Rust；图形桌面用于运行，CI 可只编译；AppImage 运行需要 FUSE |

```bash
sudo apt-get update
sudo apt-get install -y build-essential cmake curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev patchelf libfuse2
```

Rust 使用 [rustup](https://rustup.rs/) 安装；在仓库运行 cargo 会按 `rust-toolchain.toml` 选择版本。Windows 从 Developer PowerShell for VS 2022 启动可帮助诊断链接器。若选择本地 `.tools/cargo` 与 `.tools/rustup`，工具脚本会自动识别；不要提交这些目录。

确认 `cmake --version` 至少为 3.25；系统仓库版本过旧时从 [CMake 官方下载](https://cmake.org/download/) 安装相应版本。C++20 worker 的独立构建、协议和合成测试见 [services/native/README.md](../services/native/README.md)。

```bash
node tools/doctor.mjs --native
pnpm dev
node tools/check-native.mjs --required
pnpm build
```

`pnpm dev` 验证项目固定 Bun、以生产配置构建 C++ worker，再运行 Vite 和 Tauri；Tauri 使用 `.tools/bun` 执行 `services/backend/src/entry.ts`。前端不能传入可执行文件路径或 Shell。release 只运行资源目录内的固定 `runtime/maaverge-runtime`，缺失时直接报错，不查找系统 Python/Node/Bun，也不切换后端。安装版默认 native；显式 `MAAVERGE_MODE=mock` 可覆盖，开发脚本始终默认 mock。两种模式的数据存于各自的 `<data-root>/<mode>`。退出时先关闭 stdin，让服务释放设备和数据库，超时再终止。

比较旧实现时，可在终端显式设置 `MAAVERGE_BACKEND=python` 后运行 `pnpm dev`；启动器此时执行 `uv sync --frozen`，debug Tauri 选择项目 `.venv` 内的 `python -m maaverge_runtime`。该 selector 在 release 不生效。不要同时让新旧服务打开同一模式的数据目录；两者使用相同 SQLite 租约，首次 TypeScript 接管会备份旧数据库。交接和手动恢复步骤见 [runtime-migration.md](runtime-migration.md)。

需要验证原生核心时，显式启用 native 模式。它会自动下载核心与资源，并按自动连接偏好发现、连接本机模拟器；可在设置关闭自动连接或手动触发。连接后不会自动执行计划。常规开发和 CI 保持 mock。

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

`pnpm run doctor` 只检查环境，不连接设备、不发模型请求、不输出密钥；显式写 `run` 可避免调用 pnpm 自带的同名命令。`pnpm run doctor --native` 将原生依赖设为必需。可选 ADB 的缺失不阻断 mock 开发。真实设备测试由用户明确选择，且必须记录核心、资源、平台及设备标识的脱敏值。

## 模拟器连接与任务覆盖

原生模式默认自动发现并连接已启动的本机模拟器，设置中可以关闭或手动触发。SDK/模拟器内置 ADB、默认多开端口和非标准路径配置见 [emulator-connection.md](emulator-connection.md)。此流程不会自动运行任务。

侧边栏的「日常」与「专项任务」管理任务表，页内通过「任务编排」「任务表设置」「定时计划」组织配置。各步骤可以重复添加、排序、复制、启停并单独配置；常用字段之外的参数可通过高级 JSON 保留和编辑。上游任务边界、受限消耗选项以及完整替代原版的验收门槛见 [maa-compatibility.md](maa-compatibility.md)。

## 构建与持续集成

`pnpm build` 先检查工作区并构建 React，再由 Bun 1.4.3 `--compile` 生成自包含 TypeScript 服务，构建并复制 C++20 worker、收集许可，执行包内及 Rust transport 集成 smoke，最后调用 Tauri 打包。生产 C++ 配置使用 `BUILD_TESTING=OFF`，不查找 Python；发行目录不包含 `.venv`、`node_modules` 或独立解释器安装。MaaCore 和游戏资源由运行期安装器下载。

MaaCore 首装和更新从官方归档中选择性提取原生依赖与完整资源，跳过原 GUI 和 .NET/WPF；提取规则、上游参考和验证边界见 [maacore-runtime.md](maacore-runtime.md)。

```bash
node tools/package-runtime.mjs
node tools/smoke-runtime.mjs
pnpm test:desktop-runtime
```

服务目录为 `dist/runtime/maaverge-runtime`，包含 `maaverge-runtime[.exe]`、`maaverge-core-worker[.exe]`、`build-info.json` 和 `licenses/`；Tauri 安装包位于 `apps/desktop/src-tauri/target/release/bundle`。自包含服务内嵌 Bun/JavaScriptCore，仍需系统库与 WebView。Bun SQLite 在 Windows/Linux 随运行时链接，macOS 使用系统 SQLite。C++ worker 在 Windows 使用 `/MT`，Linux 静态链接 libstdc++/libgcc，macOS 使用系统 libc++；MaaCore 仍动态加载。

smoke 在空 PATH、独立临时工作目录、无效 `.env`/`bunfig.toml` 下执行包内服务，覆盖 RPC、C++ mock 设备租约、持久化、请求去重、更新等待空闲及 EOF 退出；若已构建 CTest 合成库，还会测试包内 `--update-job` 选择性提取及 C++ 验证链路。这些检查不下载真实核心、不连接设备或调用模型。完整测试先运行 `uv sync --frozen`、`pnpm build:native-worker` 和 `pnpm check`；参考 Python 与 CTest 解释器都仅用于开发。

`pnpm test:desktop-runtime` 直接使用桌面 `Runtime` 的同一 Rust transport，连接包内 TypeScript 服务和实际 C++ mock 租约进程，检查事件转发、设置与去重的重启持久化、空 PATH、环境清理和设备锁排他/释放。它执行 Rust 集成测试，不启动真实窗口或 WebView；浏览器 E2E 和原生窗口交互仍需分别验收。

许可收集由 `tools/runtime-notices.mjs` 完成，保留应用、Bun/JSC、C++ JSON 依赖、Unicode 和归档依赖声明。对应源码与使用修改后 JavaScriptCore 重新构建服务的命令见 [runtime-migration.md](runtime-migration.md)。开发 cargo 检查创建的占位资源目录不能替代实际打包。图标主资源为 `apps/desktop/public/logo.png`，修改后运行 `node tools/generate-icons.mjs`；设计与提示词见 [branding.md](branding.md)。

CI 先在 Windows x64、Ubuntu x64、macOS arm64/x64 分别编译并执行 Bun 探针，检查 SQLite/WAL、保留 rowid 的备份、跨进程锁、子进程 NDJSON 和 ZIP/TAR。四宿主 gate 成功后才运行原生矩阵的 C++ CTest、TypeScript 测试、Rust fmt/clippy/test 和未签名构建。应用 job 另保留 Python 参考、契约及浏览器 mock 端到端检查。各平台实际结果见 `docs/STATUS.md`；CI 配置和跨编译成功不能替代宿主执行、最低系统及安装验收。开发检查在没有 cargo 时明确跳过 Rust 部分，CI 禁止跳过；CMake/C++ 检查不会因此跳过。

Linux 打包后可运行 `pnpm test:clean-linux`，需要 Docker 和 `dist/runtime/maaverge-runtime` 中的 Linux x64 两个可执行文件。测试驱动在宿主 Node 中运行，容器使用原始 Ubuntu 22.04 镜像并确认没有 Python、Node、Bun；后端会话断网，覆盖包内 C++ 设备锁、持久化、去重、停止和 EOF 重启。CI 在 Linux 构建后自动执行。这是后端容器测试，桌面和安装器仍需单独验收。

Windows 完整构建后可运行 `pnpm test:desktop-webview`，需要本机已有 WebView2。工具通过独立环回 CDP 端口操作真实 release 窗口，使用专属 mock 数据和 WebView profile，检查初始化异常、运行/停止、C++ 进程释放、正常关窗与重启记录；测试前须先退出其他 Maa Verge 实例。日志与截图保留在忽略目录 `build/webview-smoke`，临时数据和 profile 退出后清理。该项由宿主 Node/Playwright 驱动，不代表卸载开发工具后的干净系统安装验收。

macOS 打包分别为 Bun 服务设置 JIT entitlement，为 C++ worker 设置加载后续下载库所需的 entitlement；脚本使用 `APPLE_SIGNING_IDENTITY`，未设置时为 ad-hoc 签名。正式发行仍须验证全部嵌套 Mach-O 的签名、公证和下载 MaaCore 后的加载。Windows 签名和 Tauri 应用自动更新发布源也需要发行凭据；当前 CI 不自动发布。
