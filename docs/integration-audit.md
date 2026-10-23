# 工作树与分支整合记录

## 全部工作树与用户 README 合入 dev（2026-10-23）

基线为 `dev@8e7a71d`，检查主区及八个附加 worktree。主区 20 个改动路径先保存为 `86ac38d`，其完整文件树与原始 Git 快照 `710e2aa` 一致；保留用户对 README、skill 和设计说明删除的调整。三个脏来源的已跟踪及未跟踪文件均保存为独立快照提交，未改变原工作树索引或文件。快照清单位于本机 `.git/integration-snapshots/20261023-221300/manifest.json`，四份快照分支使用 `codex/pre-integration-20261023-221300-` 前缀，分别对应 `dev`、`app-release-source`、`app-update-ui` 和 `remove-github-packages`。

| 来源工作区 | 整合结果与证据 |
| --- | --- |
| `execution-monitor` | `5791a2c` 经 `631ea9b` 合入；主区较新的监控与文档调整保留 |
| `execution-monitor-tests` | `37562d1` 的两个独有提交均为补丁等价；共享文件一致，最终监控测试覆盖其用例，经 `53b16dc` 记录关系 |
| `app-native-updater` | `8de31e6` 的两项提交已由 `codex/signed-release-updates@ce87f3a` 等价整合；经 `95b99c5` 合入最终实现、`a25e62b` 记录原来源关系 |
| `app-release-source` | `3f48e4d` 的两项提交同上；额外未跟踪的 `app-release.ts` 及 13 项测试由安全快照经 `4613787` 合入，保持独立，未接入服务 |
| `app-update-ui` | `9519776` 的两项提交同上；三份未提交生成文件与签名更新分支完全一致，合并后的协议源重新生成全部契约，再经 `89996e4` 记录快照关系 |
| `bundled-aria2` | `3f3c4c4` 经 `a545292` 合入，保留内置下载器、固定来源/摘要、许可/源码、默认值与测试 |
| `release-notes` | `b13524c` 经 `1c602be` 合入，保留用户版本说明与 `.skill/maa-verge-release-notes` 规范、模板和文档入口 |
| `remove-github-packages` | 原 HEAD `cafdc82` 已为基线祖先；11 个未提交变更经安全快照及 `e1d48c8` 合入，移除旧 Packages 专用通道，保留 Releases 与签名更新 |

对原生更新、发行来源、更新 UI 三组原提交执行 `git cherry`，六个独有提交全部显示 `-`；主要实现文件与签名更新整合分支逐组一致。主区更近的关闭偏好与生命周期继续保留；Rust 两文件在隔离功能分支解决冲突，`c7087fc` 经 `ade01eb` 合入，新增更新重启与并发清理回归。移除 Packages 时发现签名更新工具仍依赖其中的纯 Release 解析函数，将六个导出原样迁至 `tools/release-assets.mjs`；隔离修复 `3123b7f` 经 `faae930` 合入，20 项相关测试通过，新增资产测试接入本地及 CI 清单。未保留旧通道的网络 API、容器或发布命令。

README 按 `.skill/maa-verge-readme/SKILL.md` 重写，保留完整副标题和 Logo 声明，以公开 `v0.1.0` 的实际安装包、界面、备份路径与事件导出为准。原版本说明使用 release-notes 分支的最终用户文案；状态文档合并各方记录，清除被用户删除的设计文档链接及仍声称 Packages 可用的当前说明。

最终核对全部登记工作树 HEAD 与四份安全快照均为 `dev` 的祖先；原来源脏文件逐项 SHA-256 与合并前清单相同。原工作区、分支和快照保留，未推送远端。

完整 `pnpm check`、前端生产构建及 128 项 Edge 全量界面回归通过。包括 52 项工程测试、11 项契约、4/4 CTest、965 项 Bun、276 项 Python 和 17 项 Rust；既定平台跳过与首轮单项超时后的专项/全量复验见 [STATUS.md](STATUS.md)。固定 Bun 编译探针、重新打包的 Windows 运行时、实际内置 aria2 回环下载/摘要/取消、合成核心更新作业、Rust transport 与 C++ 合成租约 smoke 通过。README 发行事实与链接、两个项目 skill、工作流语法和差异检查通过。未连接真实游戏、调用模型、重建桌面安装器或新增 macOS/Linux 验收。

## 设备页与执行总览合入 dev（2026-10-23）

基线为 `dev@f3de037`，检查主目录与两个附加 worktree。两份来源成果已同步为主目录的未提交内容；先保护主目录快照，再提交干员资源工作树、合并来源分支，并恢复和提交额外执行界面。原有 38 个改动文件逐一比对 Git 规范化后的 blob，内容全部保留。两个附加工作区均干净，全部登记 worktree 的 HEAD 均为最终 `dev` 的祖先；未删除工作区或分支，未推送远端。

| 来源 | 集成结果 |
| --- | --- |
| `codex/device-instance-cards` | `8b525d2` 经 `5fd16a7` 合入；其前序 `556423a` 与 dev 已有 `2999bde` 的完整文件树相同 |
| `codex/execution-operator-resources` | 将原有 15 个暂存文件提交为 `d0527ec`，经 `88f9b1a` 合入 |
| 主工作区额外执行界面 | `5798a4b` 提交执行总览、干员头像组件与对应界面回归 |

设备分支的实例关联逻辑与 `docs/STATUS.md` 产生冲突，均以合并前已逐文件核实的主工作区最终内容解决：保留新的在线设备优先关联、设备页重构、执行总览及 CI 验证记录。所有来源实现与测试已在最终组合中核实，无需重放等价补丁。

合并后完整 `pnpm check`、前端生产构建与 99 项 Edge 全量界面回归通过。包括 924 项 Bun、274 项 Python、11 项契约、4/4 CTest、32 项工程测试以及工作区类型和 Rust 检查；Windows 不适用项与包内 transport 的既定忽略范围见 [STATUS.md](STATUS.md)。界面回归使用隔离端口 15471 和两个 worker；本轮未连接真实游戏、调用模型、构建发行安装包或新增其他宿主验收。

## dev 工作树整合（2026-10-23）

基线为 `dev@4fcd939`，核对主工作区与 15 个附加 worktree。五组最终实现已合入 `dev`，并核实所有登记 worktree 分支均为合并结果的祖先。另合入未绑定 worktree 的 `codex/preview-performance`，避免只合预览后端而遗漏已完成的前端优化。保留全部原工作区和分支；合并前基线保存在 `codex/dev-before-worktree-merge-20261023`。

| 功能 | 最终来源 | 合并提交 |
| --- | --- | --- |
| 完整性、同版本修复、卸载、实例诊断 | `codex/fix-legacy-component-repair` | `079816e` |
| 下载器与跨页通知 | `codex/component-downloads` | `61ce0c0` |
| 仓库、干员与材料图片 | `codex/warehouse-tools` | `6651d96` |
| 日志导出与清理 | `codex/export-logs` | `5a0ef03` |
| 实时预览与任务结果截图 | `codex/preview-performance` | `be3755d` |

等价分支标记提交 `8bc6288` 与其第一父 `be3755d` 的文件树完全相同。标记前对以下 11 个辅助分支执行 `git cherry -v be3755d <分支>`，共 12 个独有提交全部显示 `-`，没有遗漏的 `+`。`codex/fix-component-recovery` 则已直接位于 legacy 修复分支的祖先链。

| 辅助分支（均为 `codex/` 前缀） | 原提交 → 实质来源提交 |
| --- | --- |
| `component-download-ui` | `0aa4c0c` → `3df950d` |
| `resumable-downloader` | `3ecd867` → `9212f9c` |
| `component-integrity` | `2cd3815` → `ec1d82b` |
| `fix-component-retention` | `134b234` → `4fcd939` |
| `fix-component-uninstall` | `9ec9386` → `e5c1eb9` |
| `export-logs-ui` | `4d4a681` → `686d530`；`0823441` → `d8fe4e0` |
| `warehouse-item-resources` | `e32eac9` → `fa75390` |
| `warehouse-recognition` | `d02ac22` → `6135ba5` |
| `warehouse-ui-tests` | `83391f6` → `f1d0968` |
| `preview-backend-performance` | `9554559` → `3875332` |
| `fix-instance-probe-diagnostics` | `cc32e12` → `7defb04` |

下载与修复分支的路径冲突统一为组件根目录的 `.download-<稳定身份哈希>-<包名>`：完整归档用完即删，中断分片保留并校验后续传，不再创建 `downloads/`。完整性校验、资源基础目录复核、有效回滚、活动 worker 保护和三版保留均保留。合并协议源后重新生成全部类型与独立校验器；执行页只显示结果截图，同时保留材料资源图片。

主工作区原有字体与组件未就绪防闪烁改动已暂存保护并恢复，继续保持未提交状态。`component-download-ui` 工作区原有生成类型的未提交补丁未修改，其 `componentDownload` 内容已由最终下载分支覆盖。新增恢复测试断言确认跨服务重启保留分片且不生成旧下载子目录，下载偏好夹具补齐满足完整性校验的合成文件。最终组合验证及平台边界见 [STATUS.md](STATUS.md)。

## 模拟器发现与增强截图整合（2026-10-23）

本次基线为 `main` / `origin/main` 的 `7a50395`，主工作区位于 `codex/mumu-adb-discovery`。再次核对全部 6 个登记 worktree（含主目录），附加工作区提交后均干净；未发现其他未提交成果。下表来源提交通过 stable patch-id、`git cherry` 及提交差异核对后集成，随后记录全部来源分支的合并关系，保留已验证的最终文件内容。没有删除本机 worktree 或分支。

| 来源分支 | 有效提交与集成证据 |
| --- | --- |
| `codex/mumu-adb-discovery` | `a47afb2` 自动定位 ADB、枚举 MuMu 全部实例和别名租约；`e618ead` 按实例自动配置增强截图、雷电 PID 边界及并发设置保护 |
| `codex/rpc-error-message` | `b2c54c2` → `894285b`，RPC 错误转换为可读提示，原始 cause 保留 |
| `codex/device-identities` | `115c2be` → `e3ebcdd`，`bfba528` → `3421dab`，明确实例别名、高编号及跨安装目录身份 |
| `codex/discovery-docs` | `06f3fbb` → `7e3ef4c`，动态发现与控制权说明 |
| `codex/auto-capture-ui` | `82c53c6` → `5458eb7`，自动识别契约、生成类型、界面与回归 |
| `codex/ld-discovery` | `81ed665` → `f850c14`，`1024396` → `6416024`，雷电多开查询及 ADB 监听归属核实 |
| `codex/auto-capture-docs` | `f67d9b1` 直接合并，README 及三份连接/多开说明同步自动增强截图规则 |

前轮审计所列 36 个提交均存在且为本轮基线 main 的祖先，没有需要重放的旧功能。远端误上传分支 `codex/typescript-cpp-runtime` 已在前轮按用户要求删除，其 tip `6820a8c` 仍在 main 历史中。

最终完整检查通过：764 项 Bun（另 1 项 Windows SIGTERM 跳过）、274 项 Python、10 项契约、4/4 CTest、10 项工程测试（另 2 项 Unix 测试跳过）、工作区类型及可用 Rust 检查；64 项 Edge 界面测试与前端生产构建通过。常规检查使用隔离数据和合成适配器。用户选择的真实验证限本机已运行的单个 MuMu：自动发现、别名去重、桌面空闲连接及自动 SDK 配置检查；未执行游戏任务、真实多开/雷电、付费模型或安装包发布。详细边界见 [STATUS.md](STATUS.md)。

## 前轮任务表与主分支整合

核对日期：2026-10-23。整合基线为 `main` / `origin/main` 的 `2f0ffce`，本轮任务分支为 `codex/maa-task-settings`。核对了全部 22 个本地 `codex/*` 分支，以及主工作区之外的 5 个已登记 worktree；额外 worktree 均无已跟踪或未跟踪改动。

## 核对方法与结论

先检查工作区状态、提交可达性和 `git cherry` / `--cherry-pick` 结果，再比较未被识别为补丁等价的提交及其涉及文件。不能仅凭“未合并”标记决定重复应用：之前的 cherry-pick、squash 和整合提交会改变提交 ID，后续实现也可能已经修复旧分支的问题。

本轮任务分支包含全部已核对分支的有效成果，未发现需要额外补入的功能。对已等价集成的来源分支记录合并关系，保留当前经过验证的文件内容；避免重新应用旧实现。没有删除本机 worktree 或本地分支。

| 来源分支 | 核对结果与集成证据 |
| --- | --- |
| `codex/maa-task-settings` | 原版默认任务与常规设置、多开、官方活动日历、主页提醒；本次合入 main 的主来源 |
| `codex/maa-data-update`、`codex/maa-data-update-fix` | 原提交 `3206da8` / `9c2d599` / `1a4527c` / `a6d95e3` 分别与 `066b9a0` / `0c81b1e` / `895e773` / `da569c6` 补丁等价 |
| `codex/maa-stage-selector` | 关卡选择、官方日历、共享预设及相关后端测试与当前实现逐文件一致；集成见 `96c1d97`、`07acb1a`、`bb194ec`、`acfea40` |
| `codex/home-game-info` | `a579caf` 与 `97d23da` 补丁等价；主页已在 `b24a53c` / `acfea40` / `38c7d7f` 中集成并增强共享日历、实例客户端与跨 04:00 一致性 |
| `codex/maa-task-connection` | 原连接、实例配置及失败等待分别集成到 `7f6974a` / `d0f956f` / `5f27fc4`；表单、原生配置与专项测试完整保留 |
| `codex/fight-client-report` | `a775dca` 的客户端回退及 `client_type/server` 填充已进入 `acfea40`，两个外服汇报测试保留 |
| `codex/client-resource-runtime`、`codex/client-resources-native` | `67fbf41` / `c5ddc69` 已包含 worker 安全重建、取消及外服覆盖资源；原生实现和测试一致，运行时保留本轮日历/主页增强 |
| `codex/isolate-adb-test-environment` | `09bf5fa` 与 `b344787` 补丁等价；当前另有 MuMu 地址别名覆盖 |
| `codex/capture-settings-ui`、`codex/core-extraction-archive`、`codex/core-selective-extraction`、`codex/tauri-runtime-event`、`codex/ts-native-updates`、`codex/vscode-cpp` | `--cherry-pick` 无独有补丁；截图设置、精简提取、桌面事件、更新与编辑器配置均已在基线集成 |
| `codex/cpp-core-worker` | 原 `52561f9` 的原生目录与已集成 `b9b90c7` 相同 |
| `codex/capture-native` | `dd5c2df` 的增强截图验证和原生测试均在 `fa6b0ed` 中保留；当前另含预览、点击与 SDK 路径修复 |
| `codex/clean-linux-smoke` | `17504ee` 已集成至 `485b993`，集成版额外包含容器 `HOME=/data` 修复 |
| `codex/policy-parity` | `a337ec6` 的数值处理已进入 `4333db7`，当前 worker 环境采用后续改进 |
| `codex/runtime-contracts-bun`、`codex/mock-agent-parity` | 未等价历史来自依赖顺序/合并；迁移、契约、CI 与交接各原提交涉及文件已逐项核对，当前还包含后续 Agent 语义、数值 token 和环境修复，无有用遗漏 |

远端 `codex/typescript-cpp-runtime` 的 tip 为 `6820a8c`，已通过 `merge-base --is-ancestor` 确认包含在整合前的 main 中，没有未合入成果；按用户要求在本次 main 同步时删除远端分支。本机额外工作树不受该远端删除影响。

## 本地未提交改动

`tools/clean-codex-worktrees.py`、对应 5 项临时仓库测试及开发说明经审查后纳入 `eb82ec4`。工具保护主/当前工作区、被占用和锁定的分支，默认保留未合 main 的分支；本次只运行隔离测试，没有对项目执行清理。Ruff 检查、格式检查和 5 项测试通过。

README、贡献指南、开发和连接文档同步当前行为，移除已失效的 `dev:mock` 启动指引及 Pydantic 协议源说明。任务、连接、多开、活动与验收边界继续以相关说明和 [STATUS.md](STATUS.md) 为准。

## 验证范围

本轮任务代码在 `675b0a6` 基线上通过完整 `pnpm check`：725 项 Bun、274 项 Python、9 项契约、4/4 CTest，以及工作区类型与可用的 Rust 检查。61 项 Edge 界面测试和前端生产构建已通过；分支核对没有引入额外产品代码。整合后再次检查契约同步、文档链接和工作区状态。

合成设备和浏览器夹具不代替真实游戏多开、不同客户端或 macOS/Linux 的新增行为验收。没有连接游戏、执行消耗、调用付费模型或发布安装包。
