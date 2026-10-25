# 开发环境与多机协作

## 统一版本与恢复

版本来源为 `.node-version`（Node 24）、`package.json#packageManager`（pnpm 10）、`.bun-version`（Bun 1.4.3）和 `rust-toolchain.toml`。C++ worker 使用 CMake 3.25+ 与 C++20。`.python-version` 的 Python 3.12 仅供保留的参考实现和合成测试。依赖由 `pnpm-lock.yaml`、`uv.lock`、`apps/desktop/src-tauri/Cargo.lock` 及 CMake 中的源码哈希锁定。

CI 在常规检查与签名发行工作流中统一固定 uv 0.13.5，避免安装前通过 GitHub API 查询最新版；升级时同时更新相关作业并检查冻结同步和原生合成测试。固定版本仍需访问对应发行资产及依赖下载源，不能消除全部网络故障。

每台机器从相同 Git 提交重新执行引导脚本。不要复制其他电脑的 `node_modules`、`.venv`、`.tools`、Rust target 或产品数据库。

```powershell
# Windows：工作区依赖、固定 Bun 及 Python 参考/合成测试
powershell -ExecutionPolicy Bypass -File tools/bootstrap.ps1
# 已安装下文的系统依赖时，添加 -Native 验证桌面编译环境
powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 run doctor --native
```

```bash
# macOS / Linux
bash tools/bootstrap.sh
bash tools/pnpm.sh run doctor --native
```

引导脚本在仓库 `.tools` 安装或修复与项目固定版本不符的 Node/pnpm，冻结同步所有工作区依赖，安装并验证固定 Bun，并使用 uv 管理参考测试所需的 Python。`-SkipReference` / `--skip-reference` 跳过 Python 参考环境；`-Native` / `--native` 额外验证原生依赖并准备包内 aria2。更新代码后应重新运行引导，或执行 `pnpm install --frozen-lockfile` 同步新增工作区。

`pnpm setup:bun` 也可单独运行：下载官方固定版本归档，按仓库保存的 SHA-256 校验后安装 `.tools/bun`，不会采用 PATH 中的全局 Bun。Node 下载通过官方 SHA256 清单验证，下载或校验失败保留旧工具。Rust、CMake、C++ 编译器和系统 SDK 需要单独安装。脚本只调整当前进程的 PATH；没有全局 Node/pnpm 时，使用 `powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 <command>` 或 `bash tools/pnpm.sh <command>`，包装脚本会选择本地工具，版本不符时提示重新引导。

`pnpm setup:aria2` 准备固定 aria2 1.37.0 到 `.tools/aria2/aria2c[.exe]`，不使用全局安装。Windows x64 下载官方 ZIP，Linux x64/macOS arm64/x64 编译官方源码；归档按仓库固定 SHA-256 校验。Linux 另外编译并静态链接固定 OpenSSL，需要 `build-essential`、`pkg-config`、`perl`；macOS 使用 Xcode Command Line Tools 与系统 AppleTLS。包内许可目录包含对应源码及构建说明；缓存和二进制留在忽略目录，不能提交。`pnpm dev` 和打包流程会自动准备，无需重复手动运行。

已有工具链的机器可直接运行：

```bash
pnpm install --frozen-lockfile
uv sync --frozen
pnpm setup:bun
pnpm run doctor
pnpm dev
```

桌面开发和安装版均使用真实 TypeScript 服务、ADB 与 C++ worker，不生成虚拟设备、任务进度、截图或更新。仅 Agent 保留本地规则提案，保存并手动执行后才会提交给真实设备。`pnpm dev:ui` 仅启动前端服务器，普通浏览器没有 Tauri 桥时会显示服务不可用；界面自动测试通过测试目录注入 IPC 夹具。

## 三平台原生依赖

| 平台 | 系统依赖 |
| --- | --- |
| Windows x64 | Visual Studio 2022 Build Tools，选择“使用 C++ 的桌面开发”、MSVC x64/x86、Windows 10/11 SDK 和 CMake 工具；Microsoft Edge WebView2 Runtime；Rust MSVC 工具链 |
| macOS 13.5+ | `xcode-select --install`；CMake 3.25+；Rust；在目标 CPU 架构运行 Node/Bun 与构建；签名/公证另外配置 |
| Ubuntu 22.04/24.04 x64 | 下方 apt 包、Rust；图形桌面用于运行，CI 可只编译；AppImage 运行需要 FUSE |

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config perl curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev patchelf
# Ubuntu 22.04 使用 libfuse2；24.04 使用 libfuse2t64（AppImage 运行依赖）
sudo apt-get install -y libfuse2       # 22.04
# sudo apt-get install -y libfuse2t64  # 24.04
```

Windows 安装 Visual Studio 时务必勾选 CMake 工具；脚本可通过 `vswhere` 找到它，无需把 Visual Studio 的安装目录手动写入 PATH。Windows 构建目标为 x64/MSVC，不能用 MinGW 替代 Rust MSVC 链接器。

macOS 先运行 `xcode-select --install`，安装后确认 `xcode-select -p` 可用；使用 Homebrew 时可通过 `brew install cmake` 安装 CMake。Apple Silicon 使用 arm64 的 Node/Bun/Rust，Intel Mac 使用 x64，避免混用 Rosetta 工具和其他架构的缓存。

Rust 使用 [rustup](https://rustup.rs/) 安装；在仓库运行 `rustup show` 会按 `rust-toolchain.toml` 安装并选择版本，包含 rustfmt/clippy。Windows 从 Developer PowerShell for VS 2022 启动可帮助诊断链接器。若选择本地 `.tools/cargo` 与 `.tools/rustup`，工具脚本会自动识别；不要提交这些目录。

Ubuntu 22.04 默认 apt CMake 为 3.22，低于项目要求；请从 [CMake 官方下载](https://cmake.org/download/) 取得 Linux x86_64 的 3.25+ 归档，校验官方 SHA-256 后，将归档内顶层目录放到 `.tools/cmake`，使 `.tools/cmake/bin/cmake` 存在。脚本会优先使用这份本地工具；Ubuntu 24.04 也可安装系统 `cmake`。macOS/Windows 同样支持 `.tools/cmake/bin`。不要复制其他 OS 或 CPU 架构的工具目录。

`doctor --native` 与 C++ 构建使用相同的 CMake 查找规则，要求 3.25+；诊断会在临时目录实际编译、链接一个 C++20 程序，检查编译器和 SDK，并在结束后清理。系统依赖缺失时按当前平台给出安装方向，脚本不自动调用 sudo 或修改系统 SDK。C++20 worker 的独立构建、协议和合成测试见 [services/native/README.md](../services/native/README.md)。

```bash
node tools/doctor.mjs --native
pnpm dev
node tools/check-native.mjs --required
pnpm build
```

`pnpm dev` 验证项目固定 Bun、以生产配置构建 C++ worker、准备固定 aria2，再运行 Vite 和 Tauri；Tauri 使用 `.tools/bun` 执行 `services/backend/src/entry.ts`。前端不能执行 Shell 或启动下载子进程；可通过类型化设置接口保存经过后端校验的自定义 aria2 绝对路径。release 只运行资源目录内的固定 `runtime/maaverge-runtime`，缺失时直接报错，不查找系统 Python/Node/Bun，也不切换后端。产品只接受 native；旧 `MAAVERGE_MODE=mock` 会明确报错，请移除该环境变量。数据继续存于 `<data-root>/native`，旧 mock 数据不读取、不迁移、不删除。退出时先关闭 stdin，让服务释放设备和数据库，超时再终止。

比较旧实现时，可在终端显式设置 `MAAVERGE_BACKEND=python` 后运行 `pnpm dev`；启动器此时执行 `uv sync --frozen`，debug Tauri 选择项目 `.venv` 内的 `python -m maaverge_runtime`。该 selector 在 release 不生效。不要同时让新旧服务打开同一模式的数据目录；两者使用相同 SQLite 租约，首次 TypeScript 接管会备份旧数据库。交接和手动恢复步骤见 [runtime-migration.md](runtime-migration.md)。

启动后会自动下载核心与资源，并按自动连接偏好发现、连接本机模拟器；可在设置关闭自动连接或手动触发。连接后不会自动执行计划。常规自动测试使用独立数据，预先关闭自动连接与自动下载，不触碰真实设备。

```powershell
# 如 ADB 未在 PATH：$env:MAAVERGE_ADB_PATH = '你的 adb.exe 绝对路径'
powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 dev
```

```bash
bash tools/pnpm.sh dev
```

Playwright 在受管理的同一进程中运行前端服务器，并由测试目录注入 IPC 夹具，避免测试退出后遗留开发进程；`MAAVERGE_TEST_PORT` 可设置独立测试端口。

窗口关闭默认进入托盘；关闭设置中的“关闭窗口时最小化到托盘”后，关闭窗口会完全退出。托盘的“退出”始终完全退出。无系统托盘的 Linux 桌面不属于已验证交互环境，需后续实机确认。

## 开发目录、分支与配置

后续开发统一在现有主工作目录中使用普通分支，不创建、签出或切换到额外 Git worktree；工具、自动化和子 Agent 同样遵守。并行任务按文件边界分工，不各自切换共享分支；修改和切换分支前先检查并保留已有改动。

开发数据默认保存在当前 checkout 的 `config/`（已加入 Git 忽略），实际数据库为 `config/native/maaverge.sqlite3`。切换普通分支不会隔离该目录；测试继续使用独立临时数据根和端口。开发端口和单实例 ID 仍对 checkout 绝对路径计算哈希。

安装版默认使用程序目录下的 `config/`；macOS 指 `.app` 所在目录，Linux AppImage 指 AppImage 所在目录。默认 TypeScript 后端首次启动且新库不存在时，从原标准用户目录 `MAAVerge/native` 导入；开发版导入原 `MAAVerge-dev/<checkout-hash>/native`。迁移保留旧文件，需先退出旧服务；已有新库或显式覆盖数据根时不导入。Python debug 参考遇到待迁移旧库会提示先启动默认后端，避免创建空库阻断迁移。具体范围见 [运行时说明](runtime-migration.md#数据交接与回退)。

`MAAVERGE_DATA_DIR` 和 `MAAVERGE_DEV_PORT` 可覆盖；`MAAVERGE_DEVICE_LOCK_DIR` 只能指向同机所有实例共用的设备锁根目录，不能放在各次测试的独立数据目录。`MAAVERGE_ADB_PATH` 可指定 ADB，无固定模拟器或开发者路径假设。`.env.example` 是配置说明，脚本不会自动执行或加载 `.env`；在终端显式设置环境变量。

同一 checkout 同时启动界面测试与桌面时，应分别设置不同的 `MAAVERGE_DEV_PORT`。Vite 的预构建缓存按实际端口存放在 `apps/desktop/node_modules/.vite/port-<port>`，避免多个实例覆盖彼此的 Tauri 模块。若旧窗口出现 `Importing a module script failed` 等组件加载错误，点击「重新加载界面」；更新脚本后应先完全退出旧开发窗口与命令，再重新运行 `pnpm dev`。普通服务连接失败仍使用「重新连接」。

开发启动器在 macOS/Linux 为 Vite 和 Tauri 创建独立进程组，终端按 Ctrl+C 时一并结束其后代进程；Windows 继续使用定向 `taskkill /t` 清理。不会按应用名终止其他 checkout 的进程。桌面窗口完全退出时仍由 Rust 负责关闭本地服务与释放租约。

`pnpm run doctor` 检查固定工具版本、所有工作区的直接依赖和本地环境，不连接设备、不发模型请求、不输出密钥；显式写 `run` 可避免调用 pnpm 自带的同名命令。`pnpm run doctor --native` 将原生依赖设为必需。`pnpm build` 与默认 TypeScript 桌面 `pnpm dev` 在编译前执行原生诊断；构建、检查和运行入口若发现工作区依赖缺失，会直接提示冻结同步命令，避免到 Bun 打包时才出现 `Could not resolve tar/yauzl` 或缺少 Bun 类型。设备发现也会查找模拟器内置 ADB，非标准安装需配置路径。可选 ADB 的缺失不阻断界面测试。真实设备测试由用户明确选择，且必须记录核心、资源、平台及设备标识的脱敏值。

## 清理 Codex worktree 与分支

本节仅用于清理遗留 worktree；当前开发规则禁止新增 worktree。只清理工作树而保留分支时使用 `--worktrees-only`。

VS Code 中显示的 `codex/...` 条目可能是本地分支，删除 worktree 后这些分支仍会保留。`python tools/clean-codex-worktrees.py` 会先清理关联 `codex/*` 分支的额外 worktree，再单独查找和清理本地 `codex/*` 分支。默认只删除已合入 `main` 的分支，按提交可达性核验，不依赖 upstream 设置；经过 squash/cherry-pick 的分支可能仍被判定为未合并。

脚本保留主工作区、当前工作区，以及仍被任意 worktree 占用的分支；默认保留含未提交改动、未跟踪文件或锁定的 worktree，删除失败时返回非零退出码。所有删除均通过 Git 执行，范围限定于本地 `codex/*`，不扫描其他目录或操作远程分支。

```powershell
python tools/clean-codex-worktrees.py --dry-run         # 预览 worktree 和本地分支
python tools/clean-codex-worktrees.py                   # 清理干净的 worktree 和已合并分支
python tools/clean-codex-worktrees.py --dry-run --force # 预览包括未合并分支的全部目标
python tools/clean-codex-worktrees.py --force           # 允许删除脏 worktree 和未合并分支
```

`--worktrees-only` 仅清理 worktree、保留全部分支；`--repo <仓库路径>` 可指定其他仓库。脚本不删除 detached worktree 或已经脱离 Git 登记的目录。非强制模式要求仓库存在 `main`，缺失时保留所有分支。

## 模拟器连接与任务覆盖

原生模式默认自动连接已启动的本机模拟器，设置中可以关闭或手动触发；已保存实例清单时只逐项连接清单，没有清单时进行自动发现。SDK/模拟器内置 ADB、默认端口和非标准路径见 [emulator-connection.md](emulator-connection.md)，共享/逐实例连接设置见 [connection-settings.md](connection-settings.md)，并行执行与隔离边界见 [multi-instance.md](multi-instance.md)。此流程不会自动启动游戏或运行任务。

侧边栏的「任务表」与「专项任务」管理任务表，页内通过「任务编排」「任务表设置」「定时计划」组织配置。新建日常表采用原版九项默认队列与参数，名称自动选择未占用的“日常表1”等；各步骤可重复添加、排序、复制、启停并单独配置，高级 JSON 保留常用字段之外的参数。逐项默认及执行映射见 [maa-task-settings.md](maa-task-settings.md)。官方活动日历、关卡目录和主页游戏提醒共用缓存，基建估算按设备手工校准，见 [game-reminders.md](game-reminders.md)。上游边界、受限消耗选项以及完整替代原版的验收门槛见 [maa-compatibility.md](maa-compatibility.md)。

## 构建与持续集成

Linux CI 使用基于 Ubuntu 22.04 的[构建镜像](ci-image.md)，从 checkout 构建并缓存工具链与 Chromium，统一 application 检查、Linux 未签名及签名打包环境；Windows/macOS 继续使用宿主工具链。镜像定义、版本来源、本地复现和干净容器检查的边界见该文档。

`pnpm build` 先检查工作区并构建 React，再由 Bun 1.4.3 `--compile` 生成自包含 TypeScript 服务，构建并复制 C++20 worker、收集许可，执行包内及 Rust transport 集成 smoke，最后调用 Tauri 打包。生产 C++ 配置使用 `BUILD_TESTING=OFF`，不查找 Python；发行目录不包含 `.venv`、`node_modules` 或独立解释器安装。MaaCore 和游戏资源由运行期安装器下载。

MaaCore 首装和更新从官方归档中选择性提取原生依赖与完整资源，跳过原 GUI 和 .NET/WPF；提取规则、上游参考和验证边界见 [maacore-runtime.md](maacore-runtime.md)。

Windows NSIS 和 MSI 卸载会一并清理程序同级默认的 `MaaCore`、`MaaResource` 目录，包含旧版 `downloads`、`generations` 及其内容；Tauri `/UPDATE` 更新和 MSI 版本升级保留这些组件。程序同级 `config`、用户另选的组件目录和业务数据根保留，卸载器不读取数据库或追踪自定义路径。其他平台的移除方式仍需用户自行清理程序外下载的组件。

```bash
node tools/package-runtime.mjs
node tools/smoke-runtime.mjs
pnpm test:desktop-runtime
```

服务目录为 `dist/runtime/maaverge-runtime`，包含 `maaverge-runtime[.exe]`、`maaverge-core-worker[.exe]`、`aria2c[.exe]`、`build-info.json` 和 `licenses/`；Tauri 安装包位于 `apps/desktop/src-tauri/target/release/bundle`。自包含服务内嵌 Bun/JavaScriptCore，仍需系统库与 WebView。Bun SQLite 在 Windows/Linux 随运行时链接，macOS 使用系统 SQLite。C++ worker 在 Windows 使用 `/MT`，Linux 静态链接 libstdc++/libgcc，macOS 使用系统 libc++；MaaCore 仍动态加载。aria2 在 Windows/macOS 使用系统 TLS 和证书存储，Linux 静态链接 OpenSSL、libstdc++/libgcc，仍需系统 CA 证书。

smoke 在空 PATH、独立临时工作目录、无效 `.env`/`bunfig.toml` 下执行包内 native 服务，覆盖空设备、Agent 提案、计划与设置持久化、缺失设备拒绝及 EOF 退出。下载专项将完整运行时复制到带空格的临时目录，另编译直接使用生产下载模块的探针，只调用同目录真实 aria2，验证本机 HTTP 下载、摘要失败与传输取消；探针不进入发行目录。若已构建 CTest 合成库，还会测试包内 `--update-job` 选择性提取及 C++ 验证链路。预置测试数据禁用自动连接和更新，不下载真实核心、不连接设备或调用模型。完整测试先运行 `uv sync --frozen`、`pnpm build:native-worker` 和 `pnpm check`；参考 Python 与 CTest 解释器都仅用于开发。

`pnpm test:desktop-runtime` 直接使用桌面 `Runtime` 的同一 Rust transport，连接包内 native 服务，检查事件转发、设置与计划的重启持久化、空 PATH、环境清理及缺失设备拒绝，另用合成设备键检查包内 C++ worker 的锁排他/释放。真实控制链的运行去重、停止、更新边界由服务合成核心测试覆盖。它执行 Rust 集成测试，不启动真实窗口或 WebView。

许可收集由 `tools/runtime-notices.mjs` 完成，保留应用、Bun/JSC、C++ JSON 依赖、Unicode 和归档依赖声明。aria2 及所需依赖的固定源码归档与许可正文保存在仓库 `3rdparty/aria2/`，准备时校验后直接读取；Windows 官方预编译包另按固定摘要下载，源码与许可无需再次联网获取，许可正文直接复制；Linux / macOS 编译时仍正常解包源码。随包的声明、完整对应源码归档与重建说明放在 `licenses/aria2/`，构建来源、配置与哈希记录在 `licenses/aria2-build-info.json`；Linux 静态 OpenSSL 固定为 3.5.9，Windows 使用官方包的依赖版本。其他对应源码与使用修改后 JavaScriptCore 重新构建服务的命令见 [runtime-migration.md](runtime-migration.md)。开发 cargo 检查创建的占位资源目录不能替代实际打包。图标主资源为 `apps/desktop/public/logo.png`，修改后运行 `node tools/generate-icons.mjs`。

CI 先在 Windows x64、Ubuntu x64、macOS arm64/x64 分别编译并执行 Bun 探针，检查 SQLite/WAL、保留 rowid 的备份、跨进程锁、子进程 NDJSON 和 ZIP/TAR。四宿主 gate 成功后才运行原生矩阵的 C++ CTest、TypeScript 测试、Rust fmt/clippy/test 和未签名构建。应用 job 另保留 Python 参考、契约及浏览器 IPC 夹具端到端检查。各平台实际结果见 `docs/STATUS.md`；CI 配置和跨编译成功不能替代宿主执行、最低系统及安装验收。开发检查在没有 cargo 时明确跳过 Rust 部分，CI 禁止跳过；CMake/C++ 检查不会因此跳过。

Linux 打包后可运行 `pnpm test:clean-linux`，需要 Docker 和 `dist/runtime/maaverge-runtime` 中的 Linux x64 三个可执行文件。测试驱动在宿主 Node 中准备隔离数据，容器使用原始 Ubuntu 22.04 镜像并确认没有 Python、Node、Bun 或全局 aria2；后端会话断网，覆盖包内 aria2 启动、真实 native 服务、持久化、缺失设备拒绝和 EOF 重启。CI 在 Linux 构建后自动执行。这是后端容器测试，桌面和安装器仍需单独验收。

Windows 完整构建后可运行 `pnpm test:desktop-webview`，需要本机已有 WebView2。工具通过独立环回 CDP 端口操作真实 release 窗口，使用专属 native 空设备数据和 WebView profile，预先禁用自动连接和下载，检查初始化异常、Agent 提案、设置持久化及正常关窗；测试前须先退出其他 Maa Verge 实例。日志与截图保留在忽略目录 `build/webview-smoke`，临时数据和 profile 退出后清理。该项由宿主 Node/Playwright 驱动，不代表卸载开发工具后的干净系统安装验收。

macOS 打包分别为 Bun 服务设置 JIT entitlement，为 C++ worker 设置加载后续下载库所需的 entitlement；脚本使用 `APPLE_SIGNING_IDENTITY`，未设置时为 ad-hoc 签名。正式发行仍须验证全部嵌套 Mach-O 的开发者签名、公证和下载 MaaCore 后的加载，Windows Authenticode 也尚待配置。Tauri 应用更新已配置独立公钥与 Actions 签名 secrets；手动 `release.yml` 四宿主工作流只创建草稿，不自动公开发布，普通无密钥构建继续产生未签名测试包。版本同步、18 项附件及迁移边界见 [应用更新与签名发行](app-updates.md)。

## VS Code 的 C++ 配置

用 VS Code 打开仓库根目录，安装工作区推荐的 C/C++ 与 CMake Tools 扩展。首次打开会配置 `services/native`，在 `CMake: Select a Kit` 中选择本机 C++20 工具链；Windows 选择已安装的 Visual Studio C++ 工具链。若未自动配置，运行 `CMake: Configure`。nlohmann/json 3.12.0 的头文件与许可证已保存在 `3rdparty/nlohmann-json`，配置时校验本地副本，无需下载；构建文件放在忽略目录 `build/native`。

C/C++ 扩展通过 CMake Tools 从实际 target 获取编译器、系统 SDK、宏和头文件路径；工作区另提供 `services/native/src` 与 `3rdparty/nlohmann-json/include` 作为兜底，语言标准为 C++20。不需要填写个人安装路径。`CMAKE_EXPORT_COMPILE_COMMANDS` 仅对 Ninja/Makefile 等生成器生效，Visual Studio/MSBuild 不生成 `compile_commands.json`，仍通过配置提供器解析。

按 `Ctrl+Shift+B` 执行“构建 C++ worker（生产配置）”，调用 `node tools/build-core-worker.mjs --production`，不查找 Python 或运行合成测试。需要 CTest 时仍按原生 worker 文档运行开发构建命令。
