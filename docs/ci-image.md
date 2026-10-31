# Linux CI 构建镜像

`tools/ci/Dockerfile` 提供 Ubuntu 22.04 / Linux x64 构建环境，与最低 Linux 发行基线保持一致。它用于 GitHub Actions 合并后的 application 基线与 Linux 平台专项，以及发行工作流的 Linux 签名构建。Windows、macOS arm64/x64 继续在对应宿主构建，Docker 不替代这些平台的 SDK、签名和安装验收。

## 环境与版本

| 内容                  | 来源                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Node、pnpm、Bun       | `.node-version`、`package.json#packageManager`、`.bun-version`；Bun 由现有 `setup-bun.mjs` 校验官方归档摘要                 |
| Rust、rustfmt、clippy | `rust-toolchain.toml`；安装器固定 rustup 1.28.2                                                                             |
| CMake                 | 固定 3.31.10 的官方二进制归档，校验 SHA-256；Ubuntu 22.04 默认 CMake 3.22 不满足项目 3.25+ 要求                             |
| 原生依赖              | C++20、pkg-config、WebKitGTK 4.1、GTK、OpenSSL、托盘、SVG、AppImage 打包与归档工具                                          |
| 浏览器                | 从 `pnpm-lock.yaml` 读取精确 Playwright 版本，预装匹配的 Chromium 与系统依赖                                                |
| 字符编码              | `LANG` 与 `LC_ALL` 固定为 Ubuntu 自带的 `C.UTF-8`，保证 Chromium 保留中文下载文件名；默认 `C/POSIX` 会将其退化为 `download` |

工程不再安装 Python/uv；合成 CTest 由 Node 与原生锁探针驱动。生产服务和 worker 继续由现有项目脚本构建，组件下载使用服务内置 HTTP。镜像不预置 MaaCore、游戏资源、ADB、业务配置或模型密钥。

## CI 使用方式

`.github/actions/linux-ci-image` 使用 Buildx 从当前 checkout 构建并加载 `maa-verge-ci:local`，复用 GitHub Actions 的 `linux-ci-image` 镜像层缓存。首次运行直接从 Dockerfile 构建，无需提前发布 GHCR 包；后续版本配置或安装脚本变化会使相关层失效。这里只缓存构建环境，应用安装包仍通过 GitHub Releases 分发。

`tools/ci/Dockerfile.dockerignore` 使用允许列表，只发送版本文件、pnpm 锁文件和必要安装脚本，禁止把本地 `.tools`、依赖、`.env`、`config`、数据库或构建产物带入镜像上下文。镜像内的 Bun 副本在运行时复制到 checkout `.tools/bun` 并再次检查版本，不依赖全局 Bun。

各 job 在宿主执行 `docker run`，把 checkout 挂载到 `/workspace`，按宿主 UID/GID 写出文件，缓存放在 checkout 的 `.cache/ci`，不产生 root 所有的构建工件。镜像的默认用户是 `ci`（UID 1001）。项目依赖始终执行 `pnpm install --frozen-lockfile`，Cargo 使用现有 `--locked` 命令。依赖下载缓存与 Cargo target 分开，后者按工具链及锁文件恢复、按提交 SHA 保存，让后续运行能够复用更新后的编译结果。

宿主把 `changes` 生成的版本 2 `MAAVERGE_CI_PLAN` 传入容器，计划只包含 `full`、`code`、`native` 三个布尔字段。`tools/ci/run.sh` 保留三种入口：

- `app`：调用 `node tools/check.mjs --app --ci`。始终执行工程脚本、知识与契约同步、四工作区类型及契约回归；`code` 为真时构建 C++ worker、执行四组合成 CTest 和完整 Linux 运行时，再直接 Vite 生产构建并执行 15 条 `@smoke` 行为回归，full 切换为全量 UI。`native` 为真时，在同一任务追加 Bun 独立运行探针、单次 rustfmt、Rust Clippy / 测试及 Linux 打包夹具。application 与原 Linux native 共用本次依赖和 worker 构建，不再各自准备镜像和重复跑服务全量。
- `native`：保留宿主专项入口，调用 `node tools/check.mjs --native --ci`，执行 Bun 探针、C++ worker / CTest、运行时平台专项、Rust Clippy / 测试和本平台打包夹具。Linux 的 `--platform` 仍运行完整服务测试，Windows/macOS 使用正向清单；实际 Checks 的 Linux 专项已并入 `app`。CI 跳过 doctor 的额外 C++ 编译探针，不生成安装包。
- `release`：构建 Linux 签名包，不重复执行已由标签提交 full Checks 覆盖的检查。

推送 `main` 或手动运行 Checks 使用 full；`dev` 推送和 PR 使用 quick。公共 CI 输入、依赖、未知路径、空差异或比较基线缺失时回到 full。文档改动只执行静态同步；普通代码在 Linux 跑一份固定基线，原生边界改动才增加 Windows x64 与 macOS arm64 专项，full 再增加 macOS Intel。对应两个、四个或六个实际任务。路径计划以 `tools/ci/plan.mjs` 为准，运行时宿主正向清单以 `tools/ci/runtime-suite.mjs` 为准；不再维护 UI 领域/AST 映射或运行时纯领域排除表。

非 Linux 平台清单为共同 19 个文件，加两个 Windows 或五个 macOS 文件，集中检查数据、文件系统、子进程、更新和原生传输等宿主边界。已有 Windows/macOS 路径失败证据的 Mirror酱关键更新回归保留在共同清单。Linux 全量只执行一份，full 也不在四宿主重复全部领域测试。CI 的运行时入口使用 `--require-native`，worker 或合成核心缺失直接失败，不能静默跳过原生集成。

full 的 `full-validation` 只在 Linux application 和三个附加宿主专项全部成功后通过。发行门禁继续校验标签提交的完整 SHA、最新 attempt 和唯一成功标记，不接受 quick；缺少完整检查时先运行 `gh workflow run ci.yml --ref <tag>`。

浏览器测试固定两个 worker，避免在较多 CPU 的 Docker 宿主上同时启动过多浏览器进程。本地验证结果及环境限制记录在 [开发状态](STATUS.md)。

发行签名密钥仅通过 `docker run --env` 在任务运行时传入，不作为 Docker build 参数或镜像内容。构建 AppImage 使用 `APPIMAGE_EXTRACT_AND_RUN=1`，不要求容器挂载 FUSE 或开启特权模式。

Linux 打包后的 `tools/smoke-clean-linux.mjs` 仍在宿主 Node 上执行，并使用原始 `ubuntu:22.04` 运行发行后端，保持断网、只读运行时、独立数据根和空 PATH。它只在发行流程完成 Linux 签名构建后运行；构建镜像里的开发工具不能代替这项检查，也无需将 Docker socket 挂载到构建容器。

## 本地复现

在干净 checkout 中执行，避免复用 Windows/macOS 的 `node_modules`、`.tools/bun` 或 native/Cargo 构建输出。Docker Desktop 需选择 Linux 容器。以下命令从仓库根目录运行：

```bash
docker build --platform linux/amd64 -f tools/ci/Dockerfile -t maa-verge-ci:local .
docker run --rm --init --ipc=host --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$PWD,target=/workspace" \
  --env CI=true maa-verge-ci:local bash tools/ci/run.sh app
```

PowerShell / Docker Desktop 可使用镜像默认用户：

```powershell
docker build --platform linux/amd64 -f tools/ci/Dockerfile -t maa-verge-ci:local .
docker run --rm --init --ipc=host --mount "type=bind,source=${PWD},target=/workspace" --env CI=true maa-verge-ci:local bash tools/ci/run.sh app
```

以上命令未传 `MAAVERGE_CI_PLAN`，`run.sh` 会生成完整版本 2 计划并走 CI 入口，app 运行合并后的完整基线、Linux 平台专项和全量 Playwright。将最后的 `app` 改成 `native` 可单独复现 Linux 宿主专项，仍不运行 doctor 的重复编译探针；宿主机的 `pnpm check` / `pnpm check:native` 默认完整本地行为保持兼容。`release` 供已传入签名密钥的发行任务使用，只构建 Linux 签名安装包。复现 quick 时，显式传入 `tools/ci/plan.mjs` 生成的 `MAAVERGE_CI_PLAN`，不要手写跳过开关。产物仍位于 checkout 的 `apps/desktop/src-tauri/target/release/bundle/` 和 `dist/runtime/maaverge-runtime/`。Windows 上的 Linux 构建产物不能代替 Windows 安装包。

更改镜像时至少实际构建镜像、执行 app 检查，并验证 release 签名打包及原始 Ubuntu 的后端 smoke。记录本地 Docker 验证与 GitHub runner 执行的各自结果；不能将其当作 Linux 桌面、真实设备或交互安装验收。
