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
- 先读当前工作流与脚本再编辑；本 skill 不复制行号。工作流、`tools/ci/run.sh`、`tools/check.mjs` 与 `tools/ci/` 选择器属于同一变更集，必须一起核对和验证。
- 不把未实际执行的平台、安装器或远端结果写成已验证；真实结果只写入 `docs/STATUS.md`。

## 两套流程

### Checks：只检查，不构建

- 触发：推送到 `main` / `dev`、Pull Request、手动 `workflow_dispatch`。
- 权限 `contents: read`；按 ref 并发并在新提交到达时取消旧运行。
- `changes` 通过 `tools/ci/plan.mjs` 生成路径计划；推送 `main` 或手动 `workflow_dispatch` 始终完整检查，`dev` 推送和 PR 按改动增量检查。公共 CI 输入、依赖、未知路径、空改动或无法确定比较基线时回到完整计划，改名同时考虑两端路径。
- `application` 始终在 Linux CI 镜像执行应用检查，完成四工作区类型检查后直接 Vite 构建。纯文档不运行 Playwright，已识别功能域运行 15 条行为冒烟与受影响 spec，公共 UI 或未分类 UI 运行全量；规则由 `tools/ci/ui-suite.mjs` 统一维护，所选完整 spec 不重复执行内部冒烟用例。
- `native` 按计划启用 Windows x64、Linux x64、macOS arm64 和 macOS x64，使用 `fail-fast: false`。每个宿主保留 Bun 探针、实际 C++ worker 构建与合成 CTest；运行时、Rust、worker 工具回归和平台打包夹具按下述清单选择。Windows 仅在启用打包夹具时准备 NSIS。
- 完整计划另执行 `full-validation`，要求 `application` 和四宿主 `native` 全部成功；增量计划不产生成功的完整验证标记。发行门禁只接受同 SHA、同次运行中该标记成功的完整 Checks。
- Checks 不生成安装包、不上传发行资产；失败时只上传 Playwright 或原生诊断。不要把签名、打包或 Release 逻辑加回 Checks。

见 [.github/workflows/ci.yml](../../.github/workflows/ci.yml) 和 [.github/actions/host-setup/action.yml](../../.github/actions/host-setup/action.yml)。

### Release：标签校验 → 四宿主签名构建 → 草稿

- 触发：推送 `v*` 标签，或在 Actions 中选择 **Prepare signed application release** 并填写一个已存在的标签（用于补跑）。
- `verify`：解析标签指向的提交，拒绝不存在的标签和任何已有 Release（含草稿），核对提交版本与 `docs/releases/<tag>.md`，再要求该提交存在 `full-validation` 成功的完整 Checks。增量 Checks 不用于发行，缺少完整检查时先运行 `gh workflow run ci.yml --ref <tag>`。
- `build`：四个宿主只构建 Windows EXE / 完整 ZIP、macOS 双架构 DMG、Linux AppImage；Linux 在 CI 镜像中构建后，再在原始 Ubuntu 容器中执行干净后端 smoke；macOS 额外验证完整 DMG 的更新签名及安装后启动。普通 `pnpm build` 使用同一安装包范围，不再构建 DEB、RPM 或 `.app.tar.gz` 专用更新归档。
- `draft`：重新确认标签未移动、没有并发 Release，生成清单后只创建 GitHub 草稿。公开 Release 由人工核对全部附件和说明后执行，工作流绝不自动发布。
- 保留 `verify` 中的仓库守卫 `github.repository == 'DeathofBrain/maa-verge'`，避免 fork 误跑发行。
- 修改任务名会改变分支保护的必需检查名称；合并前同步更新 branch protection。

见 [.github/workflows/release.yml](../../.github/workflows/release.yml) 和用户流程 [docs/app-updates.md](../../docs/app-updates.md)。

## 检查清单与分层选择

- [tools/check.mjs](../../tools/check.mjs) 维护检查执行清单：`--app`、`--native`，不传参数时两者都跑。`pnpm check:app` / `pnpm check:native` 只是入口别名。默认本地入口保持完整，只有显式 `--ci` 才读取并校验 `MAAVERGE_CI_PLAN`；非法计划必须失败，不能静默跳过。
- `--app`：产品知识同步检查、工程脚本测试、`contracts:check`、四个工作区类型检查、契约测试；需要 Rust 的 CI 计划在这里单次运行 `cargo fmt --check`，不安装或执行 Python/uv。
- `--native`：固定 Bun 探针、C++ worker 构建与 CTest、TypeScript 运行时测试；Rust Clippy/测试、worker 构建脚本回归、当前宿主打包夹具按计划选择。完整 CI 计划启用全部；CI 不再执行 doctor 的额外 C++ 编译探针。默认本地入口仍执行 doctor、worker 工具回归、完整运行时与 Rust（含 fmt）及平台夹具。
- Linux 和完整计划的四宿主运行全部运行时测试。增量计划其他宿主显式调用 `tools/test-runtime.mjs --platform`，由 [tools/ci/runtime-suite.mjs](../../tools/ci/runtime-suite.mjs) 递归发现测试，只排除已审核的 16 个纯领域测试文件；新测试默认保留跨平台。SQLite 租约与恢复、持久去重、文件替换与链接、子进程环境、代理、通知、唤醒、更新及原生集成必须保留平台覆盖。
- 仅后端业务改动可不运行 Rust；宿主 setup 随计划跳过 Rust 安装和缓存。需要 Rust 的计划仍在原生宿主执行 locked Clippy/测试，fmt 只由 application 执行一次；worker 脚本回归和打包夹具依相关路径启用。
- 平台夹具按 `process.platform` 选择：Linux 发行包、macOS bundle、Windows 安装器/组件。不要在一个宿主执行另一个平台的夹具。
- [tools/ci/run.sh](../../tools/ci/run.sh) 只有 `app|native|release` 三种模式，且只用于 CI 镜像：它依赖 `/workspace`、`/opt/maaverge-ci` 和镜像内 Bun。宿主机直接运行 `node tools/check.mjs`，不要在本地简陋环境调用 `run.sh`。
- `run.sh app` 完成应用类型检查后只调用 Vite 构建与 `tools/ci/test-ui.mjs`，不重复 `pnpm -r build`；`run.sh release` 只构建 Linux AppImage 及其更新签名，不重复运行检查，检查已由标签提交的完整 Checks 覆盖。
- 执行阶段由 `check.mjs` 管理，路径计划由 [tools/ci/plan.mjs](../../tools/ci/plan.mjs) 管理，UI 领域/冒烟由 [tools/ci/ui-suite.mjs](../../tools/ci/ui-suite.mjs) 管理，运行时分组由 `runtime-suite.mjs` 管理；不要在工作流和 `run.sh` 再维护测试名单。新增工具/契约单测加入 `check.mjs`，新增 UI 功能核对领域映射；新增运行时测试自动发现，只有审核纯领域行为后才加入排除名单。运行时单测默认限时 30 秒；不要为掩盖偶发失败而降低超时或跳过断言。

## 关键不变量与易错点

1. **开发、构建与测试不依赖 Python/uv。** CTest 由 Node 驱动，设备租约互斥使用独立原生锁探针；不要恢复旧参考后端、setup-uv 或 uv sync。Linux 镜像使用固定 CMake 官方归档与 SHA-256 校验，不通过 Python 包管理器安装构建工具。
2. **启用 Windows 打包夹具时必须显式准备 NSIS。** Checks 不运行 `pnpm build`，Tauri 不会顺带安装 NSIS。完整计划或相关打包路径改动时，Windows 任务需查找 `%ProgramFiles(x86)%\NSIS\makensis.exe`，缺失时用 choco 安装，导出 `MAAVERGE_NSIS_COMPILER`，找不到就失败。设置 `MAAVERGE_INSTALLER_TOOLS_REQUIRED=1`，让已选择的安装器夹具缺少工具时失败而不是跳过。
3. **手动补跑时的 `github.sha` 不是标签提交。** 用 `github.rest.git.getRef({ ref: 'tags/<tag>' })` 解析标签，404 直接失败；用 `github.rest.git.getTag` 有界剥离批注标签，要求最终对象是 commit；checkout 解析出的 commit。两处重复发行门禁均使用 `github.paginate(github.rest.repos.listReleases, { ...repo, per_page: 100 })`，按精确 `tag_name` 匹配公开 Release 和草稿；`verify` 保留 `contents: write` 以查看草稿。`getReleaseByTag` 返回 404 不能证明草稿不存在。
4. **发行必须复用同 SHA 的完整 Checks。** `tools/ci/require-checks.mjs` 用 40 位 `head_sha` 查询 `ci.yml` 运行，并分页读取对应最新 attempt 的 jobs。只接受 push、PR、workflow_dispatch 中整体成功且同次运行唯一 `full-validation` 标记完成并成功的记录；增量运行、缺失/跳过/失败/重复标记和旧 attempt 标记都不能放行。较新完整运行成功可覆盖旧失败；有未完成运行则等待最多 30 分钟，缺少完整运行只等 5 分钟，并提示 `gh workflow run ci.yml --ref <tag>`。不要改为复用 Release 自身、旧提交或任意成功的精简运行。
5. **草稿必须用 `--verify-tag --draft` 创建。** 使用 `gh release create <tag> --verify-tag --draft --notes-file docs/releases/<tag>.md`，不传 `--target`，避免隐式创建缺失标签。含 `-` 的标签自动加 `--prerelease`。草稿的 HTML URL 使用 `releases/tag/untagged-*` 是正常行为，不能据此判断标签缺失；标签以 Git ref 和精确 `tag_name` 为准。创建前再次确认标签未移动且无并发 Release；失败清理用 trap 只删除本次创建的草稿，保留标签。
6. **Release 与资产 ID 必须来自 REST。** `gh release view --json` 的 asset `id` 是 GraphQL 字符串，不能用于要求数字 ID 的校验。草稿不通过按标签的 REST 端点查询：先用 `gh api --paginate --slurp "repos/$GITHUB_REPOSITORY/releases?per_page=100"` 分页列出 Release，按精确 `tag_name` 找到唯一草稿和数值 `release.id`，再 GET `repos/$GITHUB_REPOSITORY/releases/<id>` 获取完整资产。断言 ID、`draft === true` 与 `tag_name` 均匹配，再调用 [tools/release-assets.mjs](../../tools/release-assets.mjs) 的 `validateAssetSet`。草稿不能用 `validateRelease`，后者要求 `draft === false` 且已有 `published_at`。
7. **Linux 干净容器 smoke 必须在签名构建之后。** [tools/smoke-clean-linux.mjs](../../tools/smoke-clean-linux.mjs) 需要 `dist/runtime/maaverge-runtime`；先执行 `run.sh release`，再在宿主运行该脚本。容器内构建使用 `APPIMAGE_EXTRACT_AND_RUN=1` 以避免依赖 FUSE。不要把它前移或并入 `run.sh`。
8. **版本与发行说明必须对齐。** 同步根 `package.json`、桌面/服务 `package.json`、`tauri.conf.json`、`Cargo.toml` 与标签；运行 `node tools/app-updater-release.mjs check --tag <tag>`，并确认 `docs/releases/<tag>.md` 非空。当前发行集合为 11 项：五个完整安装包（EXE / 完整 ZIP、两个 DMG、AppImage）、EXE / 两个 DMG / AppImage 的四份 `.sig`、`latest.json` 与 `SHA256SUMS.txt`。`validateAssetSet` 仍接受旧的 8/17/18/19 项集合，不要用历史集合生成新发行版。新清单只包含 `windows-x86_64-nsis`、`darwin-aarch64-dmg`、`darwin-x86_64-dmg`、`linux-x86_64`；仅支持归档的旧 macOS 客户端须手动安装新版 DMG 一次。
9. **发行权限与并发。** `verify` 需要 `actions: read` + `contents: write`，`draft` 需要 `contents: write`，`build` 只读；Release 并发按标签分组且 `cancel-in-progress: false`；`build` 矩阵 `fail-fast: false`。签名密钥只从 Actions secrets 读取，不打印、不提交私钥。
10. **文档改动会触发知识生成。** `docs/app-updates.md` 是产品知识输入；修改后运行 `corepack pnpm knowledge:generate` 并提交生成结果。`docs/STATUS.md` 不是知识输入，但必须记录实际命令、平台、结果和未验证项。

## 本地验证

按改动范围选择，记录实际输出，不用历史计数当验收：

```bash
# 应用检查；native 需要 Node 与原生工具链
corepack pnpm check:app
corepack pnpm check:native

# 路径计划、UI/运行时选择与发行门禁
node --test tools/tests/ci-plan.test.mjs tools/tests/ui-suite.test.mjs tools/tests/runtime-suite.test.mjs tools/tests/require-checks.test.mjs
# 资产校验
node --test tools/tests/release-assets.test.mjs

# 脚本语法
node --check tools/ci/require-checks.mjs
node --check tools/release-assets.mjs
bash -n tools/ci/run.sh
shellcheck tools/ci/run.sh
```

- 工作流与 YAML：用 `corepack pnpm exec prettier --check .github/workflows/*.yml .github/actions/*/action.yml` 检查解析和格式。Prettier 不支持 `.sh`，shell 脚本只用 `bash -n` + `shellcheck`；`actionlint` 本机不保证可用，有则运行，不把它写成必需前提。
- UI 或应用入口受影响时先跑定向 spec，再跑全量 `corepack pnpm test:e2e`。不要用 `pnpm test:e2e -- <spec>`，pnpm 会把 `--` 传给 Playwright 并展开为全量。
- 修改 `docs/app-updates.md` 或其他知识输入后运行 `corepack pnpm knowledge:generate`，再用 `node tools/generate-agent-knowledge.mjs --check` 复核。
- 用合成 11 项资产 JSON 调用 `validateAssetSet` 验证当前草稿分支，并验证历史 8/17/18/19 项集合兼容及混入 DEB / RPM / 更新归档时的拒绝路径；不要为本地测试创建真实 Release 或上传资产。
- 收尾运行 `git diff --check`，确认没有空白错误、生成文件已同步、未意外纳入其他贡献者的改动。
- 不运行真实设备、付费模型、真实下载或任何远端写操作。

## 远端验证

仅在用户明确授权后执行：

- 推送分支或创建 PR，确认 `changes` 计划与实际改动一致，application 和所选 native 按计划执行，没有安装包产物；完整计划另确认 `full-validation` 成功，增量计划不能产生该成功标记。
- 用安全负向 dispatch 验证 Release 的拒绝路径：不存在的标签必须在 `getRef` 失败；已存在的 `v0.1.2` 必须因重复 Release 失败。不要在负向验证中构建或上传资产。
- 不推送发行标签、不创建/发布 Release、不恢复 v0.1.3-alpha1，除非用户另行明确授权。
- 确认签名 secrets 已配置，但不要读取、回显或记录密钥内容。
- 未实际运行的 Windows/Linux 任务、NSIS 安装、四宿主签名矩阵、标签解析和草稿创建，继续在 `docs/STATUS.md` 标为未验证。

## 排错

- **Checks application 失败**：先看 Playwright 失败附件，用目标 spec + `--workers=1` 串行复现；不要先改断言、放宽超时或跳过测试。
- **native 失败**：确认固定 Bun、Node、CMake/CTest 与 C++ 工具链可用；Windows 再检查 NSIS 路径与 `MAAVERGE_INSTALLER_TOOLS_REQUIRED`。
- **Release verify 失败**：区分标签不存在、已有草稿、版本不一致、说明缺失、完整 Checks 缺失/失败/被取消。只有增量 Checks 或 `full-validation` 未成功时，先 `gh workflow run ci.yml --ref <tag>` 并通过，再补跑 Release。
- **Release build 失败**：检查签名 secret、Linux 构建是否先于 clean smoke、macOS 是否使用 `--require-updater` 验证完整 DMG 的更新签名；不再要求 `.app.tar.gz`。不要把未签名本地包当作发行候选。
- **draft 失败**：检查标签是否在构建期间移动、是否出现并发 Release、资产集合是否完整、是否误用了 GraphQL 字符串 ID。按标签的 REST 查询返回 404 时，先从分页 Release 列表按 `tag_name` 查找并使用数值 ID 获取草稿，不把正常的 `untagged-*` HTML URL 当成标签缺失。trap 会删除本次草稿并保留标签，修正后可重跑。

## 文档同步

- [docs/development.md](../../docs/development.md)：完整/增量计划、application 与按需四宿主、UI/运行时选择、Windows NSIS、平台夹具、本地完整入口及 Release 完整检查门禁。
- [docs/ci-image.md](../../docs/ci-image.md)：`app|native|release` 语义、`MAAVERGE_CI_PLAN` 传递、Vite 单次类型检查、固定 CMake 归档与摘要校验、release 不跑检查、clean smoke 在签名构建后。
- [docs/app-updates.md](../../docs/app-updates.md)：标签推送/手动补跑、版本与说明、拒绝重复、30 分钟门禁、只创建草稿。
- [docs/STATUS.md](../../docs/STATUS.md)：实际命令、平台、结果与未验证项；不得把未测试平台写成通过。
- `CONTRIBUTING.md`、`PLAN.md`、`README.md` 只在检查入口、CI 架构或发布声明实际变化时同步；不要保留已失效的发布链接或“已发布”结论。

## 资源

本 skill 不附带脚本或资源；命令、工作流与校验逻辑均使用仓库现有文件。若检查清单、发行步骤或资产集合变化，先更新对应脚本和文档，再同步本 skill。
