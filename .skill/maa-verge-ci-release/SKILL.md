---
name: maa-verge-ci-release
description: 维护 Maa Verge 的 GitHub Actions Checks 与签名发行流程：修改工作流、检查清单、CI 脚本或发行校验时，分离提交检查与签名构建、复用标签提交的 Checks、核对标签/版本/草稿资产，并记录真实验证结果。用于 CI、发布流程及相关文档改动；不用于 Release 文案或界面验证。
---

# Maa Verge CI 与发行流程

本 skill 目录的 `../..` 是仓库根目录。用两套独立流程维护 CI：日常提交只跑 Checks，发行才构建签名产物。Release 文案使用 [maa-verge-release-notes](../maa-verge-release-notes/SKILL.md)，界面验证使用 [maa-verge-ui-verification](../maa-verge-ui-verification/SKILL.md)。

## 适用边界与开始前

- 读 [AGENTS.md](../../AGENTS.md)、[PLAN.md](../../PLAN.md)、[docs/STATUS.md](../../docs/STATUS.md)，并检查 `git status` / `git diff`。工作树可能包含未提交的 CI 改动，不要假设文件已合并或可覆盖。
- 共享 checkout 中只改本次任务涉及的文件，保留其他贡献者的并发改动；不要用整体格式化制造冲突。
- 未经用户明确授权，不 commit、不 push、不打标签、不创建或发布 Release，也不触发远端工作流。常规测试使用隔离数据和合成设备，不连接真实游戏、不调用付费模型、不下载真实组件。
- 先读当前工作流与脚本再编辑；本 skill 不复制行号。工作流、`tools/ci/run.sh` 和 `tools/check.mjs` 属于同一变更集，必须一起修改和验证。
- 不把未实际执行的平台、安装器或远端结果写成已验证；真实结果只写入 `docs/STATUS.md`。

## 两套流程

### Checks：只检查，不构建

- 触发：推送到 `main` / `dev`、Pull Request、手动 `workflow_dispatch`。
- 权限 `contents: read`；按 ref 并发并在新提交到达时取消旧运行。
- 五个彼此独立的任务：`application` 在 Linux CI 镜像中执行应用检查、前端构建和 Chromium 夹具；四个 `native` 分别覆盖 Windows x64、Linux x64、macOS arm64 和 macOS x64。
- `native` 使用 `fail-fast: false`，一个宿主失败不取消其他宿主。平台打包夹具只在本宿主运行，Windows 显式准备 NSIS。
- Checks 不生成安装包、不上传发行资产；失败时只上传 Playwright 或原生诊断。不要把签名、打包或 Release 逻辑加回 Checks。

见 [.github/workflows/ci.yml](../../.github/workflows/ci.yml) 和 [.github/actions/host-setup/action.yml](../../.github/actions/host-setup/action.yml)。

### Release：标签校验 → 四宿主签名构建 → 草稿

- 触发：推送 `v*` 标签，或在 Actions 中选择 **Prepare signed application release** 并填写一个已存在的标签（用于补跑）。
- `verify`：解析标签指向的提交，拒绝不存在的标签和任何已有 Release（含草稿），核对提交版本与 `docs/releases/<tag>.md`，再要求该提交的 Checks 成功。
- `build`：四个宿主只构建签名产物；Linux 在 CI 镜像中构建后，再在原始 Ubuntu 容器中执行干净后端 smoke；macOS 额外验证安装包与更新归档。
- `draft`：重新确认标签未移动、没有并发 Release，生成清单后只创建 GitHub 草稿。公开 Release 由人工核对全部附件和说明后执行，工作流绝不自动发布。
- 保留 `verify` 中的仓库守卫 `github.repository == 'DeathofBrain/maa-verge'`，避免 fork 误跑发行。
- 修改任务名会改变分支保护的必需检查名称；合并前同步更新 branch protection。

见 [.github/workflows/release.yml](../../.github/workflows/release.yml) 和用户流程 [docs/app-updates.md](../../docs/app-updates.md)。

## 单一检查清单

- [tools/check.mjs](../../tools/check.mjs) 是检查清单的唯一来源：`--app`、`--native`，不传参数时两者都跑。`pnpm check:app` / `pnpm check:native` 只是入口别名。
- `--app`：产品知识同步检查、工程脚本测试、`contracts:check`、四个工作区类型检查、契约测试、Ruff、三平台 mypy、Python 参考测试。
- `--native`：固定 Bun 探针、`doctor --native`、C++ worker 测试与构建、TypeScript 运行时测试、`check-native`，以及当前宿主的打包夹具。
- 平台夹具按 `process.platform` 选择：Linux 发行包、macOS bundle、Windows 安装器/组件。不要在一个宿主执行另一个平台的夹具。
- [tools/ci/run.sh](../../tools/ci/run.sh) 只有 `app|native|release` 三种模式，且只用于 CI 镜像：它依赖 `/workspace`、`/opt/maaverge-ci` 和镜像内 Bun。宿主机直接运行 `node tools/check.mjs`，不要在本地简陋环境调用 `run.sh`。
- `run.sh release` 只构建 Linux 签名包，不重复运行检查；检查已由标签提交的 Checks 覆盖。
- 新增或删除测试只改 `check.mjs` 的列表，不在工作流或 `run.sh` 维护第二份清单。运行时单测默认限时 30 秒；不要为掩盖偶发失败而降低超时或跳过断言。

## 关键不变量与易错点

1. **native 需要 Python 3.12。** CTest 夹具使用 Python 3.12。`run.sh native` 必须保留 `uv sync --frozen`；非 Linux 的 `native` 任务需要 `astral-sh/setup-uv`（版本与 `tools/ci/Dockerfile` 一致，当前 0.13.5）并执行 `uv sync --frozen`。`host-setup` 刻意不安装 uv。删除 native 的 Python 准备会同时破坏 Linux 容器和 Windows/macOS 原生检查。
2. **Windows 必须显式准备 NSIS。** Checks 不再运行 `pnpm build`，Tauri 不会顺带安装 NSIS。Windows 任务需查找 `%ProgramFiles(x86)%\NSIS\makensis.exe`，缺失时用 choco 安装，导出 `MAAVERGE_NSIS_COMPILER`，找不到就失败。设置 `MAAVERGE_INSTALLER_TOOLS_REQUIRED=1`，让缺少安装器工具成为失败而不是跳过。
3. **手动补跑时的 `github.sha` 不是标签提交。** 用 `github.rest.git.getRef({ ref: 'tags/<tag>' })` 解析标签，404 直接失败；用 `github.rest.git.getTag` 有界剥离批注标签，要求最终对象是 commit；checkout 解析出的 commit。`verify` 需要 `contents: write` 才能看到草稿并拒绝重复 Release；只读 token 会把已有草稿误判为不存在。
4. **Actions 运行查询必须用完整 SHA。** `tools/ci/require-checks.mjs` 用 40 位 `head_sha` 查询 `ci.yml` 运行；短 SHA 查不到。接受 push、PR、workflow_dispatch；任一运行成功即通过，即使更早的运行失败；有未完成运行则等待；成功运行最多等 30 分钟，完全没有运行时只等 5 分钟，并提示 `gh workflow run ci.yml --ref <tag>`。不要改为复用 Release 自身或旧提交的运行。
5. **草稿必须用 `--verify-tag --draft` 创建。** 使用 `gh release create <tag> --verify-tag --draft --notes-file docs/releases/<tag>.md`，不要传 `--target`：标签不存在时 `--target` 会创建 `untagged-*` 占位草稿。含 `-` 的标签自动加 `--prerelease`。创建前再次确认标签未移动且无并发 Release；失败清理用 trap 只删除本次创建的草稿，保留标签。
6. **资产 ID 必须来自 REST。** `gh release view --json` 的 asset `id` 是 GraphQL 字符串，不能用于要求数字 ID 的校验。用 `gh api repos/$GITHUB_REPOSITORY/releases/tags/<tag>` 获取 REST 响应，断言 `draft === true`、`tag_name` 精确匹配，再调用 [tools/release-assets.mjs](../../tools/release-assets.mjs) 的 `validateAssetSet`。草稿不能用 `validateRelease`，后者要求 `draft === false` 且已有 `published_at`。
7. **Linux 干净容器 smoke 必须在签名构建之后。** [tools/smoke-clean-linux.mjs](../../tools/smoke-clean-linux.mjs) 需要 `dist/runtime/maaverge-runtime`；先执行 `run.sh release`，再在宿主运行该脚本。容器内构建使用 `APPIMAGE_EXTRACT_AND_RUN=1` 以避免依赖 FUSE。不要把它前移或并入 `run.sh`。
8. **版本与发行说明必须对齐。** 同步根 `package.json`、桌面/服务 `package.json`、`tauri.conf.json`、`Cargo.toml` 与标签；运行 `node tools/app-updater-release.mjs check --tag <tag>`，并确认 `docs/releases/<tag>.md` 非空。当前 EXE/完整 ZIP 资产集合为 17 项；`validateAssetSet` 仍接受旧的 8/18 项集合，不要硬编码单一数量。
9. **发行权限与并发。** `verify` 需要 `actions: read` + `contents: write`，`draft` 需要 `contents: write`，`build` 只读；Release 并发按标签分组且 `cancel-in-progress: false`；`build` 矩阵 `fail-fast: false`。签名密钥只从 Actions secrets 读取，不打印、不提交私钥。
10. **文档改动会触发知识生成。** `docs/app-updates.md` 是产品知识输入；修改后运行 `corepack pnpm knowledge:generate` 并提交生成结果。`docs/STATUS.md` 不是知识输入，但必须记录实际命令、平台、结果和未验证项。

## 本地验证

按改动范围选择，记录实际输出，不用历史计数当验收：

```bash
# 应用检查；native 需要先准备 Python 3.12 与原生工具链
corepack pnpm check:app
uv sync --frozen
corepack pnpm check:native

# 门禁与资产校验的定向单测
node --test tools/tests/require-checks.test.mjs tools/tests/release-assets.test.mjs

# 脚本语法
node --check tools/ci/require-checks.mjs
node --check tools/release-assets.mjs
bash -n tools/ci/run.sh
shellcheck tools/ci/run.sh
```

- 工作流与 YAML：用 `corepack pnpm exec prettier --check .github/workflows/*.yml .github/actions/*/action.yml` 检查解析和格式。Prettier 不支持 `.sh`，shell 脚本只用 `bash -n` + `shellcheck`；`actionlint` 本机不保证可用，有则运行，不把它写成必需前提。
- UI 或应用入口受影响时先跑定向 spec，再跑全量 `corepack pnpm test:e2e`。不要用 `pnpm test:e2e -- <spec>`，pnpm 会把 `--` 传给 Playwright 并展开为全量。
- 修改 `docs/app-updates.md` 或其他知识输入后运行 `corepack pnpm knowledge:generate`，再用 `node tools/generate-agent-knowledge.mjs --check` 复核。
- 用合成 8/17 项资产 JSON 调用 `validateAssetSet` 验证草稿分支；不要为本地测试创建真实 Release 或上传资产。
- 收尾运行 `git diff --check`，确认没有空白错误、生成文件已同步、未意外纳入其他贡献者的改动。
- 不运行真实设备、付费模型、真实下载或任何远端写操作。

## 远端验证

仅在用户明确授权后执行：

- 推送分支或创建 PR，确认 Checks 的五个任务按名称出现、全部通过，且没有安装包产物。
- 用安全负向 dispatch 验证 Release 的拒绝路径：不存在的标签必须在 `getRef` 失败；已存在的 `v0.1.2` 必须因重复 Release 失败。不要在负向验证中构建或上传资产。
- 不推送发行标签、不创建/发布 Release、不恢复 v0.1.3-alpha1，除非用户另行明确授权。
- 确认签名 secrets 已配置，但不要读取、回显或记录密钥内容。
- 未实际运行的 Windows/Linux 任务、NSIS 安装、四宿主签名矩阵、标签解析和草稿创建，继续在 `docs/STATUS.md` 标为未验证。

## 排错

- **Checks application 失败**：先看 Playwright 失败附件，用目标 spec + `--workers=1` 串行复现；不要先改断言、放宽超时或跳过测试。
- **native 失败**：确认 `uv sync --frozen` 已执行、`python3 --version` 为 3.12、CTest 可用；Windows 再检查 NSIS 路径与 `MAAVERGE_INSTALLER_TOOLS_REQUIRED`。
- **Release verify 失败**：区分标签不存在、已有草稿、版本不一致、说明缺失、Checks 缺失/失败/被取消。Checks 未运行时先 `gh workflow run ci.yml --ref <tag>` 并通过，再补跑 Release。
- **Release build 失败**：检查签名 secret、Linux 构建是否先于 clean smoke、macOS 是否使用 `--require-updater`。不要把未签名本地包当作发行候选。
- **draft 失败**：检查标签是否在构建期间移动、是否出现并发 Release、资产集合是否完整、是否误用了 GraphQL 字符串 ID。trap 会删除本次草稿并保留标签，修正后可重跑。

## 文档同步

- [docs/development.md](../../docs/development.md)：五个 Checks 任务、不生成安装包、Windows NSIS、平台夹具、Release 复用 Checks。
- [docs/ci-image.md](../../docs/ci-image.md)：`app|native|release` 语义、application/native 的 `uv sync`、release 不跑检查、clean smoke 在签名构建后。
- [docs/app-updates.md](../../docs/app-updates.md)：标签推送/手动补跑、版本与说明、拒绝重复、30 分钟门禁、只创建草稿。
- [docs/STATUS.md](../../docs/STATUS.md)：实际命令、平台、结果与未验证项；不得把未测试平台写成通过。
- `CONTRIBUTING.md`、`PLAN.md`、`README.md` 只在检查入口、CI 架构或发布声明实际变化时同步；不要保留已失效的发布链接或“已发布”结论。

## 资源

本 skill 不附带脚本或资源；命令、工作流与校验逻辑均使用仓库现有文件。若检查清单、发行步骤或资产集合变化，先更新对应脚本和文档，再同步本 skill。
