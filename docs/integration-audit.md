# 工作树与分支整合记录

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
