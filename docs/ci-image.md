# Linux CI 构建镜像

`tools/ci/Dockerfile` 提供 Ubuntu 22.04 / Linux x64 构建环境，与最低 Linux 发行基线保持一致。它用于 GitHub Actions 的 application 检查、Checks 的 Linux 原生检查和发行工作流的 Linux 签名构建。Windows、macOS arm64/x64 继续在对应宿主构建，Docker 不替代这些平台的 SDK、签名和安装验收。

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

各 job 在宿主执行 `docker run`，把 checkout 挂载到 `/workspace`，按宿主 UID/GID 写出文件，缓存放在 checkout 的 `.cache/ci`，不产生 root 所有的构建工件。镜像的默认用户是 `ci`（UID 1001）。项目依赖始终执行 `pnpm install --frozen-lockfile`，Cargo 使用现有 `--locked` 命令。宿主把 `changes` 生成的 `MAAVERGE_CI_PLAN` 传入容器，由 `tools/ci/run.sh` 选择检查：

- `app`：工程脚本、知识与契约同步、四工作区类型及契约回归，接着直接运行 Vite 生产构建；Playwright 按计划不运行、运行 15 条行为冒烟加受影响 spec，或运行全量。需要 Rust 的计划在这里运行一次 rustfmt，不在四宿主重复格式检查。
- `native`：保留 Bun 编译/执行探针、实际 C++ worker 构建和合成 CTest、完整 Linux 运行时测试；Rust Clippy/测试、worker 构建脚本回归和 Linux 打包夹具由计划分别选择。CI 跳过 doctor 的额外 C++ 编译探针，不生成安装包。
- `release`：构建 Linux 签名包，不重复执行已由标签提交完整 Checks 覆盖的检查。

推送 `main` 或手动运行 Checks 使用完整计划；`dev` 推送和 PR 按路径增量选择，公共 CI 输入、依赖、未知路径或比较基线缺失时回到完整计划。纯文档改动仍执行 application，但跳过浏览器和 native。只涉及后端业务时可跳过 Rust 检查；Windows/macOS 的宿主 action 也跳过 Rust 安装，镜像内预装工具不影响选择。非 Linux 的增量运行时通过 `--platform` 排除明确审核的纯领域测试，新测试默认仍跨平台；完整计划在四宿主都跑全量。路径计划、UI 选择和运行时分组分别以 `tools/ci/plan.mjs`、`tools/ci/ui-suite.mjs`、`tools/ci/runtime-suite.mjs` 为准。

完整计划的 `full-validation` 只在 application 和四宿主 native 全部成功后通过。发行门禁同时校验标签提交的完整 SHA、Checks 结果和该标记，不接受增量 Checks；缺少完整检查时先运行 `gh workflow run ci.yml --ref <tag>`。

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

以上命令未传 `MAAVERGE_CI_PLAN`，按完整本地检查执行，app 运行全量 Playwright。将最后的 `app` 改成 `native` 会运行 Bun 探针、doctor、worker 脚本回归、C++/完整运行时/Rust 和 Linux 打包夹具；`release` 供已传入签名密钥的发行任务使用，只构建 Linux 签名安装包。复现增量计划时，显式传入 `tools/ci/plan.mjs` 生成的 `MAAVERGE_CI_PLAN`，不要手写跳过开关。产物仍位于 checkout 的 `apps/desktop/src-tauri/target/release/bundle/` 和 `dist/runtime/maaverge-runtime/`。Windows 上的 Linux 构建产物不能代替 Windows 安装包。

更改镜像时至少实际构建镜像、执行 app 检查，并验证 release 签名打包及原始 Ubuntu 的后端 smoke。记录本地 Docker 验证与 GitHub runner 执行的各自结果；不能将其当作 Linux 桌面、真实设备或交互安装验收。
