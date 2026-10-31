# 开发环境与多机协作

代码目录、职责与扩展边界见[桌面前端 README](../apps/desktop/README.md)和[本地应用服务 README](../services/backend/README.md)。设计依据分别记录在[前端架构](frontend-architecture.md)与[后端架构](backend-architecture.md)。

## 统一版本与恢复

版本来源为 `.node-version`（Node 24）、`package.json#packageManager`（pnpm 10）、`.bun-version`（Bun 1.4.3）和 `rust-toolchain.toml`。C++ worker 使用 CMake 3.25+ 与 C++20。开发、构建与测试统一使用 Node/Bun 和原生工具链，不需要 Python 或 uv。依赖由 `pnpm-lock.yaml`、`apps/desktop/src-tauri/Cargo.lock` 及 CMake 中的源码哈希锁定。

CI 的 CMake 使用固定版本的官方二进制归档并核对 SHA-256；升级时同时更新镜像、安装脚本和合成测试，不通过 Python 包管理器安装。固定版本仍需访问对应发行资产及依赖下载源。

每台机器从相同 Git 提交重新执行引导脚本。不要复制其他电脑的 `node_modules`、`.tools`、Rust target 或产品数据库。

```powershell
# Windows：工作区依赖、固定 Bun / Rust
powershell -ExecutionPolicy Bypass -File tools/bootstrap.ps1
# 已安装下文的系统依赖时，添加 -Native 验证桌面编译环境
powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 run doctor --native
```

```bash
# macOS / Linux
bash tools/bootstrap.sh
bash tools/pnpm.sh run doctor --native
```

引导脚本在仓库 `.tools` 安装或修复与项目固定版本不符的 Node/pnpm，冻结同步所有工作区依赖，安装并验证固定 Bun / Rust。Rust 按 `rust-toolchain.toml` 安装编译器、Cargo、rustfmt 和 Clippy，已有完整且版本符合的工具链可直接复用；需要安装时下载并校验官方 rustup 安装器，将工具放在 `.tools/cargo` 与 `.tools/rustup`，不修改系统 PATH 或 Shell 配置。`-Native` / `--native` 额外验证原生依赖。更新代码后应重新运行引导，或执行 `pnpm install --frozen-lockfile` 同步新增工作区。

`pnpm setup:bun` 也可单独运行：下载官方固定版本归档，按仓库保存的 SHA-256 校验后安装 `.tools/bun`，不会采用 PATH 中的全局 Bun。Node 下载通过官方 SHA256 清单验证，下载或校验失败保留旧工具。CMake、C++ 编译器和系统 SDK 需要单独安装。脚本只调整当前进程的 PATH；没有全局 Node/pnpm 时，使用 `powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1 <command>` 或 `bash tools/pnpm.sh <command>`，包装脚本会选择本地工具，版本不符时提示重新引导。

组件下载由固定 Bun 中的内置 HTTP 实现，支持进度、断点续传和完整性校验，沿用运行时的代理环境设置。开发与打包均无需准备额外下载器；详细下载及缓存行为见 [组件运行时](maacore-runtime.md)。

已有工具链的机器可直接运行：

```bash
pnpm install --frozen-lockfile
pnpm setup:bun
pnpm run doctor
pnpm dev
```

桌面开发和安装版均使用真实 TypeScript 服务、ADB 与 C++ worker，不生成虚拟设备、任务进度、截图或更新。仅 Agent 保留本地规则提案，保存并手动执行后才会提交给真实设备。`pnpm dev:ui` 仅启动前端服务器，普通浏览器没有 Tauri 桥时会显示服务不可用；界面自动测试通过测试目录注入 IPC 夹具。

## 三平台原生依赖

| 平台                   | 系统依赖                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows x64            | Visual Studio 2022 Build Tools，选择“使用 C++ 的桌面开发”、MSVC x64/x86、Windows 10/11 SDK 和 CMake 工具；Microsoft Edge WebView2 Runtime；Rust MSVC 工具链 |
| macOS 15+              | `xcode-select --install`；CMake 3.25+；Rust；在目标 CPU 架构运行 Node/Bun 与构建；签名/公证另外配置                                                         |
| Ubuntu 22.04/24.04 x64 | 下方 apt 包、Rust；图形桌面用于运行，CI 可只编译；AppImage 运行需要 FUSE                                                                                    |

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config perl curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev patchelf
# Ubuntu 22.04 使用 libfuse2；24.04 使用 libfuse2t64（AppImage 运行依赖）
sudo apt-get install -y libfuse2       # 22.04
# sudo apt-get install -y libfuse2t64  # 24.04
```

Windows 安装 Visual Studio 时务必勾选 CMake 工具；脚本可通过 `vswhere` 找到它，无需把 Visual Studio 的安装目录手动写入 PATH。Windows 构建目标为 x64/MSVC，不能用 MinGW 替代 Rust MSVC 链接器。

macOS 先运行 `xcode-select --install`，安装后确认 `xcode-select -p` 可用；使用 Homebrew 时可通过 `brew install cmake` 安装 CMake。Apple Silicon 使用 arm64 的 Node/Bun/Rust，Intel Mac 使用 x64，避免混用 Rosetta 工具和其他架构的缓存。

Rust 默认由 bootstrap 安装，也可单独执行 `node tools/setup-rust.mjs` 修复。手动使用 [rustup](https://rustup.rs/) 时，在仓库运行 `rustup show` 会按 `rust-toolchain.toml` 安装并选择版本，包含 rustfmt/clippy。Windows 从 Developer PowerShell for VS 2022 启动可帮助诊断链接器。项目命令和 pnpm 包装脚本会自动识别本地 `.tools/cargo` 与 `.tools/rustup`；不要提交这些目录。

Ubuntu 22.04 默认 apt CMake 为 3.22，低于项目要求；请从 [CMake 官方下载](https://cmake.org/download/) 取得 Linux x86_64 的 3.25+ 归档，校验官方 SHA-256 后，将归档内顶层目录放到 `.tools/cmake`，使 `.tools/cmake/bin/cmake` 存在。脚本会优先使用这份本地工具；Ubuntu 24.04 也可安装系统 `cmake`。macOS/Windows 同样支持 `.tools/cmake/bin`。不要复制其他 OS 或 CPU 架构的工具目录。

`doctor --native` 与 C++ 构建使用相同的 CMake 查找规则，要求 3.25+；诊断会在临时目录实际编译、链接一个 C++20 程序，检查编译器和 SDK，并在结束后清理。系统依赖缺失时按当前平台给出安装方向，脚本不自动调用 sudo 或修改系统 SDK。C++20 worker 的独立构建、协议和合成测试见 [services/native/README.md](../services/native/README.md)。

CMake preset 使用平台默认生成器；如需 Ninja，可安装后通过 `CMAKE_GENERATOR=Ninja` 显式选择。命令行与 VS Code 共用 `build/native`，CMake 会沿用其中缓存的生成器。若旧缓存选中了未安装的 Ninja，出现 `CMAKE_MAKE_PROGRAM` 未设置并伴随 `CMAKE_CXX_COMPILER not set`，可运行 `node tools/build-core-worker.mjs --fresh --production` 刷新缓存并重新构建，再重试原命令。`--fresh` 由 CMake 重建 `CMakeCache.txt` 和 `CMakeFiles`，此前手动添加的 CMake 缓存选项需重新提供；设过 `CMAKE_GENERATOR` 时仍按该环境变量选择生成器。常规构建保留缓存；doctor 的临时目录检查通过不代表既有缓存可用。

```bash
node tools/doctor.mjs --native
pnpm dev
node tools/check-native.mjs --required
pnpm build
```

`pnpm dev` 验证项目固定 Bun、以生产配置构建 C++ worker，再运行 Vite 和 Tauri；Tauri 使用 `.tools/bun` 执行 `services/backend/src/entry.ts`。前端通过类型化接口请求组件下载，由服务内置 HTTP 执行。release 只运行资源目录内的固定 `runtime/maaverge-runtime`，缺失时直接报错，不查找系统 Python/Node/Bun，也不切换后端。产品只接受 native；旧 `MAAVERGE_MODE=mock` 会明确报错，请移除该环境变量。数据继续存于 `<data-root>/native`，旧 mock 数据不读取、不迁移、不删除。退出时先关闭 stdin，让服务释放设备和数据库，超时再终止。

开发与发行只提供 TypeScript/Bun 服务，旧参考后端与选择入口已移除。首次接管旧数据库仍保留 SQLite 租约、序列化备份与数据兼容保护；交接和手动恢复步骤见 [runtime-migration.md](runtime-migration.md)。

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

开发可在现有主工作目录中使用普通分支，也允许创建、签出和切换到额外 Git worktree。额外 worktree 只能放在主项目根目录的 `.worktree/<任务名>/` 下，不得使用仓库外目录或其他位置；工具、自动化和子 Agent 同样遵守。并行任务按文件边界分工，共用 checkout 时不各自切换分支；修改和切换分支前先检查并保留已有改动。

开发数据默认保存在当前 checkout 的 `config/`（已加入 Git 忽略），实际数据库为 `config/native/maaverge.sqlite3`。切换普通分支不会隔离该目录；测试继续使用独立临时数据根和端口。开发端口和单实例 ID 仍对 checkout 绝对路径计算哈希。

安装版默认使用程序目录下的 `config/`；macOS 指 `.app` 所在目录，Linux AppImage 指 AppImage 所在目录。默认 TypeScript 后端首次启动且新库不存在时，从原标准用户目录 `MAAVerge/native` 导入；开发版导入原 `MAAVerge-dev/<checkout-hash>/native`。迁移保留旧文件，需先退出旧服务；已有新库或显式覆盖数据根时不导入。具体范围见 [运行时说明](runtime-migration.md#数据交接与回退)。

桌面版可在“设置 → 数据与诊断 → 配置文件”查看并打开当前配置目录、保存其他绝对目录或恢复默认。选择保存在程序目录的本地 `config-location.json`，重启应用后生效；当前服务、调度及应用更新缓存继续使用本次启动时固定的数据根。切换不会复制或覆盖旧配置；选择空目录会创建新配置，选择已有目录会读取其中配置。迁移既有配置前须完全退出应用，再备份或复制整个数据根。显式 `--schedule-data-root` / `MAAVERGE_DATA_DIR` 优先于界面保存的选择；该选择文件不提交 Git。

Windows 切换后会精确清理旧配置目录对应的唤醒任务，清理失败保留记录供下次重试。等待清理期间，旧唤醒任务携带的旧目录参数会跟随已保存的新选择，避免重新打开切走的配置；其他显式启动根不受影响。

`MAAVERGE_DATA_DIR` 和 `MAAVERGE_DEV_PORT` 可覆盖；`MAAVERGE_DEVICE_LOCK_DIR` 只能指向同机所有实例共用的设备锁根目录，不能放在各次测试的独立数据目录。`MAAVERGE_ADB_PATH` 可指定 ADB，无固定模拟器或开发者路径假设。`.env.example` 是配置说明，脚本不会自动执行或加载 `.env`；在终端显式设置环境变量。

同一 checkout 同时启动界面测试与桌面时，应分别设置不同的 `MAAVERGE_DEV_PORT`。Vite 的预构建缓存按实际端口存放在 `apps/desktop/node_modules/.vite/port-<port>`，避免多个实例覆盖彼此的 Tauri 模块。若旧窗口出现 `Importing a module script failed` 等组件加载错误，点击「重新加载界面」；更新脚本后应先完全退出旧开发窗口与命令，再重新运行 `pnpm dev`。普通服务连接失败仍使用「重新连接」。

界面测试产物统一放在被 Git 忽略的 `test-results/` 下；默认目录为 `test-results/ui`，并行验证通过 `--output=test-results/<专项名称>` 分开保存截图、trace 和报告，不在仓库根目录创建新的 `test-*` 产物目录。

开发启动器在 macOS/Linux 为 Vite 和 Tauri 创建独立进程组，终端按 Ctrl+C 时一并结束其后代进程；Windows 继续使用定向 `taskkill /t` 清理。不会按应用名终止其他 checkout 的进程。桌面窗口完全退出时仍由 Rust 负责关闭本地服务与释放租约。

`pnpm run doctor` 检查固定工具版本、所有工作区的直接依赖和本地环境，不连接设备、不发模型请求、不输出密钥；显式写 `run` 可避免调用 pnpm 自带的同名命令。`pnpm run doctor --native` 将原生依赖设为必需。`pnpm build` 与默认 TypeScript 桌面 `pnpm dev` 在编译前执行原生诊断；构建、检查和运行入口若发现工作区依赖缺失，会直接提示冻结同步命令，避免到 Bun 打包时才出现 `Could not resolve tar/yauzl` 或缺少 Bun 类型。设备发现也会查找模拟器内置 ADB，非标准安装需配置路径。可选 ADB 的缺失不阻断界面测试。真实设备测试由用户明确选择，且必须记录核心、资源、平台及设备标识的脱敏值。

## 清理 Codex worktree 与分支

任务合并后必须清理对应 worktree：先将必要文件和未提交工作保存到安全位置，停止该任务的开发服务、测试及其他进程，再回到主工作目录，使用 `git worktree remove .worktree/<任务名>` 移除签出，并用 `git branch -d <任务分支>` 删除已合并的临时本地分支；必要时运行 `git worktree prune` 清理失效登记。删除前核对实际路径与合并状态，不得清理其他任务或未合并工作。

以下脚本可辅助批量清理已有 Codex worktree 与分支；先用 `--dry-run` 核对目标，并遵守上述清理边界。只清理工作树而保留分支时使用 `--worktrees-only`。

VS Code 中显示的 `codex/...` 条目可能是本地分支，删除 worktree 后这些分支仍会保留。独立可选工具 `python tools/clean-codex-worktrees.py` 会先清理关联 `codex/*` 分支的额外 worktree，再单独查找和清理本地 `codex/*` 分支；使用该工具需要另备 Python，常规开发与检查不调用它。默认只删除已合入 `main` 的分支，按提交可达性核验，不依赖 upstream 设置；经过 squash/cherry-pick 的分支可能仍被判定为未合并。

脚本保留主工作区、当前工作区，以及仍被任意 worktree 占用的分支；默认保留含未提交改动、未跟踪文件或锁定的 worktree，删除失败时返回非零退出码。所有删除均通过 Git 执行，范围限定于本地 `codex/*`，不扫描其他目录或操作远程分支。

```powershell
python tools/clean-codex-worktrees.py --dry-run        # 预览 worktree 和本地分支
python tools/clean-codex-worktrees.py                  # 清理干净的 worktree 和已合并分支
```

`--worktrees-only` 仅清理 worktree、保留全部分支；`--repo <仓库路径>` 可指定其他仓库。脚本不删除 detached worktree 或已经脱离 Git 登记的目录。非强制模式要求仓库存在 `main`，缺失时保留所有分支。

## 模拟器连接与任务覆盖

原生模式默认自动连接已启动的本机模拟器，设置中可以关闭或手动触发；已保存实例清单时只逐项连接清单，没有清单时进行自动发现。SDK/模拟器内置 ADB、默认端口和非标准路径见 [emulator-connection.md](emulator-connection.md)，共享/逐实例连接设置见 [connection-settings.md](connection-settings.md)，并行执行与隔离边界见 [multi-instance.md](multi-instance.md)。此流程不会自动启动游戏或运行任务。

侧边栏的「任务」统一管理任务表：列表展示绑定设备与最近执行，点击行在右侧详情抽屉内通过「任务编排」「任务表设置」「定时计划」组织配置，同一页的「执行监控」页签上方选择在线/历史设备，下方显示该设备当前的任务表、作业或工具；离线显示已离线，历史执行从显式入口查看。任务表「查看执行」与底部运行详情定位同一设备，支持设备多选停止；日志、连接设置和画面使用右侧抽屉，连接设置关闭后恢复任务编辑草稿；页头勾选任务表后「运行」，单表可多选空闲设备，多表各用绑定设备或逐行选择。新建表采用原版九项默认队列与参数，名称自动选择未占用的“日常表1”等；各步骤可重复添加、排序、复制、启停并单独配置，高级 JSON 保留常用字段之外的参数。逐项默认及执行映射见 [maa-task-settings.md](maa-task-settings.md)。官方活动日历、关卡目录和主页游戏提醒共用缓存，基建估算按设备手工校准，见 [game-reminders.md](game-reminders.md)。上游边界、受限消耗选项以及完整替代原版的验收门槛见 [maa-compatibility.md](maa-compatibility.md)。

## 构建与持续集成

Linux CI 使用基于 Ubuntu 22.04 的[构建镜像](ci-image.md)，从 checkout 构建并缓存工具链与 Chromium，统一 application 检查与 Linux 签名打包环境；Windows/macOS 继续使用宿主工具链。镜像定义、版本来源、本地复现和干净容器检查的边界见该文档。

`pnpm build` 先检查工作区并构建 React，再由 Bun 1.4.3 `--compile` 生成自包含 TypeScript 服务，构建并复制 C++20 worker、收集许可，执行包内及 Rust transport 集成 smoke，最后调用 Tauri 打包。生产 C++ 配置使用 `BUILD_TESTING=OFF`，不构建合成测试；发行目录不包含 `.venv`、`node_modules` 或独立解释器安装。macOS/Linux 的 MaaCore 和游戏资源由运行期安装器下载；Windows 构建还会准备随附的离线组件。

MaaCore 首装和更新从官方归档中选择性提取原生依赖与完整资源，跳过原 GUI 和 .NET/WPF；提取规则、上游参考和验证边界见 [maacore-runtime.md](maacore-runtime.md)。

Windows v0.1.3-alpha.1 起只生成 NSIS EXE 和 `Maa-Verge_<version>_x64-full.zip`，不再构建 MSI。`tools/prepare-windows-components.mjs` 通过固定 Bun 按 `tools/windows-components.lock.json` 校验官方归档大小与 SHA-256，复用生产选择性提取、完整资源合并和 C++ worker 校验，输出 `dist/windows-components/`。构建包装器生成带该载荷路径的 NSIS hook 配置，安装向导提供默认勾选的 MaaCore / MaaResource 组件；MaaResource 依赖 MaaCore。ZIP 只复制主程序、包内运行时、两套组件、许可和使用说明，不收集 checkout 配置或账号数据；`MaaVerge.portable` 标记禁用 EXE 自动安装。

Windows 离线组件构建还按锁文件获取 MaaCore v6.20.1 对应源码提交的 `LICENSE` / `LICENSE.spdx`、固定 MaaUtils 子模块的 LGPLv3 许可及配套 GNU GPLv3 全文，以及 MaaDeps v2.14.1 官方开发归档，分别校验固定大小和 SHA-256。开发归档仅提取依赖的 `copyright` 与 `vcpkg.spdx.json` 声明，不复制 SDK 库或可执行文件；核心和完整资源载荷均保留 `licenses/sources.json` 来源记录，资源载荷另附 MaaResource 原始许可。许可收集失败会阻止载荷生成，完整性摘要包含这些声明文件。

Windows 系统 tar 缺少内置 `liblzma` 时，构建侧使用已安装的 7-Zip 将 XZ 解码为当前 staging 内的临时 TAR，再选择提取许可文件；支持通过 `MAAVERGE_7ZIP_PATH` 指定 `7z.exe`，也会检查系统 Program Files 中的标准安装位置。缺少所需工具时明确终止构建。7-Zip 只用于构建，不进入发行包或应用运行流程。

Linux 预览版的 RPM 需要单独映射包管理版本：`0.1.3-alpha.1` 的内部 `Version` 为 `0.1.3`、`Release` 为 `0.alpha.1`，排在同版正式包的 `Release=1` 之前。构建先按原应用版本生成二进制、DEB 和 AppImage，再只打包 RPM；最终发行文件名和更新签名仍绑定完整应用版本 `0.1.3-alpha.1`，不会重编译为正式版。此映射用于 RPM 的包管理排序，不表示所有 SemVer 预览标识的内部排序都与 RPM 相同。

Windows NSIS 完整卸载会清理程序同级默认的 `MaaCore`、`MaaResource` 与 `runtime/bundled-components`，包含旧版 `downloads`、`generations` 及其内容；Tauri `/UPDATE` 更新保留已有组件并跳过随附组件安装。程序同级 `config`、用户另选的组件目录和业务数据根保留，卸载器不读取数据库或追踪自定义路径。旧 MSI 用户备份后卸载旧版并手动迁移 EXE / ZIP；ZIP 不注册卸载器，其他平台的移除方式仍需用户自行清理程序外下载的组件。组件导入与完整资源范围见 [组件运行时](maacore-runtime.md#windows-随附离线组件)。

```bash
node tools/package-runtime.mjs
node tools/smoke-runtime.mjs
pnpm test:desktop-runtime
```

服务目录为 `dist/runtime/maaverge-runtime`，包含 `maaverge-runtime[.exe]`、`maaverge-core-worker[.exe]`、`build-info.json` 和 `licenses/`；Tauri 安装包位于 `apps/desktop/src-tauri/target/release/bundle`。自包含服务内嵌 Bun/JavaScriptCore，仍需系统库、系统 CA 证书与 WebView。Bun SQLite 在 Windows/Linux 随运行时链接，macOS 使用系统 SQLite。C++ worker 在 Windows 使用 `/MT`，Linux 静态链接 libstdc++/libgcc，macOS 使用系统 libc++；MaaCore 仍动态加载。

smoke 在空 PATH、独立临时工作目录、无效 `.env`/`bunfig.toml` 下执行包内 native 服务，覆盖空设备、Agent 提案、计划与设置持久化、缺失设备拒绝及 EOF 退出。下载专项将完整运行时复制到带空格的临时目录，另编译直接使用生产 HTTP 下载模块的探针，验证本机下载、摘要失败与传输取消；探针不进入发行目录。若已构建 CTest 合成库，还会测试包内 `--update-job` 选择性提取及 C++ 验证链路。预置测试数据禁用自动连接和更新，不下载真实核心、不连接设备或调用模型。完整测试先运行 `pnpm build:native-worker` 和 `pnpm check`；CTest 使用 Node 驱动合成核心与设备租约测试。

`pnpm test:desktop-runtime` 直接使用桌面 `Runtime` 的同一 Rust transport，连接包内 native 服务，检查事件转发、设置与计划的重启持久化、空 PATH、环境清理及缺失设备拒绝，另用合成设备键检查包内 C++ worker 的锁排他/释放。真实控制链的运行去重、停止、更新边界由服务合成核心测试覆盖。它执行 Rust 集成测试，不启动真实窗口或 WebView。

许可收集由 `tools/runtime-notices.mjs` 完成，保留应用、Bun/JSC、C++ JSON 依赖、Unicode 和归档依赖声明。对应源码与使用修改后 JavaScriptCore 重新构建服务的命令见 [runtime-migration.md](runtime-migration.md)。开发 cargo 检查创建的占位资源目录不能替代实际打包。图标主资源为 `apps/desktop/public/logo.png`，修改后运行 `node tools/generate-icons.mjs`。

Checks 由 `changes` 任务按改动路径生成计划：推送 `main` 或手动 `workflow_dispatch` 执行完整检查；`dev` 推送和 PR 执行增量检查。依赖、公共 CI 输入、未分类路径或无法确定比较基线时回到完整检查。`application` 始终执行工程脚本、知识与契约同步、四工作区类型和契约回归；随后直接运行 Vite 生产构建，不再重复工作区类型检查。纯文档变更不运行 Playwright；已识别功能域运行 15 条行为冒烟和受影响 spec，共享界面或未分类 UI 改动运行全量。选择规则分别位于 `tools/ci/plan.mjs`、`tools/ci/ui-suite.mjs`，已有 spec 被整体选中时不会重复执行其中的冒烟用例。

涉及后端、原生、契约或构建工具时，计划启用 Windows x64、Linux x64、macOS arm64/x64 四个 `native`。每个宿主保留 Bun 编译/执行探针、实际 C++ worker 构建及四组合成 CTest。Linux 始终运行完整 TypeScript 运行时测试；增量计划的其他宿主使用 `tools/test-runtime.mjs --platform`，只排除 `tools/ci/runtime-suite.mjs` 明确审核的纯领域测试，新测试默认跨平台执行。完整计划在四宿主都运行全部运行时测试。SQLite 租约与恢复、请求去重、文件替换与链接、子进程环境、代理、通知、唤醒、更新和原生集成继续保留在平台组。

CI 不再执行 `doctor --native` 的额外 C++ 编译探针；worker 构建脚本回归和平台打包夹具按路径启用。Rust 格式检查在需要 Rust 的计划中只由 `application` 执行一次，Clippy 和 Rust 测试仍在所选原生宿主执行；仅后端业务改动可跳过 Rust 工具安装及检查。Windows 仅在需要打包夹具时准备 NSIS，缺少工具直接失败。macOS 最低支持 15，Checks 和发行使用 `macos-15` arm64 与 `macos-15-intel` x64；Tauri 与 C++ worker 部署目标均为 15.0。任一宿主失败不会取消其他平台，Checks 不生成安装包。

完整计划另运行 `full-validation`，要求 `application` 和四宿主 `native` 全部成功。发行只复用同一标签提交、同次运行中该标记成功的完整 Checks；增量检查成功不能用于发行。缺少完整检查时，先执行 `gh workflow run ci.yml --ref <tag>`，成功后补跑 Release。各平台实际结果见 `docs/STATUS.md`；CI 配置和跨编译成功不能替代宿主执行、最低系统及安装验收。

本地 `pnpm check`、`pnpm check:app`、`pnpm check:native` 和 `pnpm test:runtime` 默认保持完整检查；只有显式 `--ci` 才读取 `MAAVERGE_CI_PLAN`。本地原生检查仍执行 doctor、worker 脚本回归和本平台打包夹具；没有 Cargo 时明确跳过 Rust，CI 计划要求的 Rust 检查缺少工具则失败，CMake/C++ 检查不会因此跳过。CI 选择器与发行门禁可单独验证：

```bash
node --test tools/tests/ci-plan.test.mjs tools/tests/ui-suite.test.mjs tools/tests/runtime-suite.test.mjs tools/tests/require-checks.test.mjs
```

Linux 打包后可运行 `pnpm test:clean-linux`，需要 Docker 和 `dist/runtime/maaverge-runtime` 中的 Linux x64 两个可执行文件。测试驱动在宿主 Node 中准备隔离数据，容器使用原始 Ubuntu 22.04 镜像并确认没有 Python、Node 或 Bun；后端会话断网，覆盖真实 native 服务、持久化、缺失设备拒绝和 EOF 重启。发布流程在 Linux 签名构建后自动执行。这是后端容器测试，桌面和安装器仍需单独验收。

Windows 完整构建后可运行 `pnpm test:desktop-webview`，需要本机已有 WebView2。工具通过独立环回 CDP 端口操作真实 release 窗口，使用专属 native 空设备数据和 WebView profile，预先禁用自动连接和下载，检查初始化异常、Agent 提案、设置持久化及正常关窗；测试前须先退出其他 Maa Verge 实例。日志与截图保留在忽略目录 `build/webview-smoke`，临时数据和 profile 退出后清理。该项由宿主 Node/Playwright 驱动，不代表卸载开发工具后的干净系统安装验收。

macOS 打包分别为 Bun 服务设置 JIT entitlement，为 C++ worker 设置加载后续下载库所需的 entitlement；脚本使用 `APPLE_SIGNING_IDENTITY`，未设置时为 ad-hoc 签名。正式发行仍须验证全部嵌套 Mach-O 的开发者签名、公证和下载 MaaCore 后的加载，Windows Authenticode 也尚待配置。Tauri 应用更新已配置独立公钥与 Actions 签名 secrets；推送 `v*` 标签或手动补跑的 `release.yml` 会复用该提交 `full-validation` 成功的完整 Checks，在四宿主构建签名产物并只创建草稿，不自动公开发布，普通无密钥构建继续产生未签名测试包。版本同步、11 项附件及迁移边界见 [应用更新与签名发行](app-updates.md)。

## 格式化规范与 VS Code

用 VS Code 打开仓库根目录，在扩展面板搜索 `@recommended`，按开发语言安装工作区推荐扩展；先运行 `pnpm install --frozen-lockfile`，让 Prettier 扩展使用仓库锁定的 **3.9.10**。工作区已开启保存时格式化，也可右键选择“格式化文档”，或按 Windows/Linux 的 `Shift+Alt+F`、macOS 的 `Shift+Option+F`。

| 文件                                                                         | 格式化器 / VS Code 扩展             | 配置与规则                                                                                                     |
| ---------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| TypeScript、TSX、JavaScript、JSON/JSONC、CSS/SCSS/Less、HTML、YAML、Markdown | Prettier / `esbenp.prettier-vscode` | 根 `.prettierrc.json`：2 空格、100 列、单引号、分号、尾逗号、LF；JSX 属性保持双引号；Markdown 保留原有段落换行 |
| C/C++                                                                        | clang-format / `ms-vscode.cpptools` | 根 `.clang-format`：C++20、LLVM 基础、2 空格、100 列、同行大括号、指针/引用贴类型，保留 include 顺序           |
| Rust                                                                         | rustfmt / `rust-lang.rust-analyzer` | 根 `rustfmt.toml`：edition 2021、4 空格、100 列、LF；使用 `rust-toolchain.toml` 固定的工具链及 rustfmt 组件    |

`.editorconfig` 为其他编辑器提供 UTF-8、缩进、行尾与末尾换行约定；Markdown 保留有意义的行尾空格。C/C++ 扩展自带 clang-format，无需为 VS Code 填写个人工具路径；终端使用 clang-format 时需另外安装并加入 PATH，本次配置使用 **19.1.7** 验证。Rust 需先安装项目 Rust 工具链。

```bash
# Prettier：优先只格式化本次修改的文件
pnpm exec prettier --write apps/desktop/src/main.tsx
pnpm exec prettier --check apps/desktop/src/main.tsx
# Prettier：显式格式化或检查整个仓库支持的文件
pnpm format
pnpm format:check

# C++：单文件示例；VS Code 同样读取根配置
clang-format -i services/native/src/main.cpp
clang-format --dry-run --Werror services/native/src/main.cpp

# Rust：固定工具链的整个桌面 crate
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
```

`pnpm format` / `pnpm format:check` 仅调用 Prettier；C++、Rust 使用各自工具。没有全局 pnpm 时，沿用本文开头的 `tools/pnpm.ps1` 或 `tools/pnpm.sh` 包装命令。保存时格式化只调整当前文件，不自动修复 lint 或排序导入。

`.prettierignore` 排除第三方源码、许可原文、已发布版本说明、生成契约与 Unicode 数据、锁文件、本地数据和构建目录，也排除会被误识别为 JavaScript 的 WiX `.wxs` XML；`.clang-format-ignore` 跳过工具、工作树和构建输出，`3rdparty/.clang-format` 禁止格式化第三方 C++。生成文件继续修改来源，再运行 `pnpm contracts:generate` 等对应生成器。

提交时的自动格式化只处理本次暂存文件；未批量格式化存量源码，也未将全仓 Prettier 格式检查加入 `pnpm check` 或 CI，存量文件仍可能被全量格式检查报告。全仓格式迁移应单独提交纯格式变化。

### 提交时自动格式化

运行 `pnpm install --frozen-lockfile` 时，`prepare` 会自动安装 Husky 的 `pre-commit` hook；现有 checkout 更新后也需安装一次依赖。此后从终端或 IDE 执行 `git commit`，lint-staged 会将本次暂存的文件交给 Prettier、clang-format 或 rustfmt，格式化结果自动纳入当前提交。可先运行 `pnpm format:staged` 手动执行同一流程。

当前固定 lint-staged 16.2.7；17.6.0 在 Git 同时报告仅换行差异与实际未暂存修改时，会错误关联文件和补丁，导致提交结果丢失格式化修改。隔离提交回归覆盖此情形，升级前需确认通过。

只处理新增、修改或重命名的暂存文件；所有语言共用 `.gitignore` 和 `.prettierignore` 的排除规则，生成文件、第三方源码和锁文件继续保持原样。部分暂存文件先临时隐藏未暂存修改，格式化后再恢复；Rust 禁止递归格式化子模块，其他未暂存文件不会因此被格式化。lint-staged 保留默认备份与失败回滚，解析错误、缺少格式化器或恢复冲突会阻止提交，并在终端显示原因；解决后重新提交。

hook 优先使用 checkout 的 `.tools/node`，无需全局 pnpm；其余工具沿用本地 bootstrap 工具目录或 PATH。提交 C/C++ 前需安装命令行 clang-format 并加入 PATH，VS Code 扩展内置版本不等于命令行已可用；Rust 需要固定工具链的 rustfmt。hook 不会在提交时下载安装工具。

CI、`NODE_ENV=production`、`HUSKY=0` 或不含 `.git` 的源码归档不安装 hook。若此前跳过安装，可在正常开发环境执行 `pnpm run prepare` 重新启用。Git hooks 属于各 checkout 的本地配置，配置文件通过仓库同步，拉取源码本身不会自动安装。

## VS Code 的 C++ 配置

用 VS Code 打开仓库根目录，安装工作区推荐的 C/C++ 与 CMake Tools 扩展。首次打开会配置 `services/native`，在 `CMake: Select a Kit` 中选择本机 C++20 工具链；Windows 选择已安装的 Visual Studio C++ 工具链。若未自动配置，运行 `CMake: Configure`。nlohmann/json 3.12.0 的头文件与许可证已保存在 `3rdparty/nlohmann-json`，配置时校验本地副本，无需下载；构建文件放在忽略目录 `build/native`。

C/C++ 扩展通过 CMake Tools 从实际 target 获取编译器、系统 SDK、宏和头文件路径；工作区另提供 `services/native/src` 与 `3rdparty/nlohmann-json/include` 作为兜底，语言标准为 C++20。不需要填写个人安装路径。`CMAKE_EXPORT_COMPILE_COMMANDS` 仅对 Ninja/Makefile 等生成器生效，Visual Studio/MSBuild 不生成 `compile_commands.json`，仍通过配置提供器解析。

按 `Ctrl+Shift+B` 执行“构建 C++ worker（生产配置）”，调用 `node tools/build-core-worker.mjs --production`，不运行合成测试。需要 CTest 时仍按原生 worker 文档运行开发构建命令。
