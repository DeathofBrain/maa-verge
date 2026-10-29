# 参与开发

修改前阅读 [AGENTS.md](AGENTS.md)、[PLAN.md](PLAN.md) 和 [docs/STATUS.md](docs/STATUS.md)。先检查 `git status`，为一项任务建立功能分支；平行任务使用独立 worktree 并明确负责的子系统。

```bash
git switch -c codex/your-change
pnpm install --frozen-lockfile
pnpm setup:bun
pnpm test:e2e
```

同机多个 worktree 的开发端口、数据目录和应用实例 ID 由路径哈希隔离。真实设备锁保持全机共享，不能通过切换工作树绕过独占控制。环境和平台依赖见 [开发文档](docs/development.md)。

## 改动与验证

- React 只使用 `packages/contracts` 的 transport；新增接口时修改 `packages/contracts/schemas` 中的权威 JSON Schema，再运行 `pnpm contracts:generate` 同步类型和独立校验器，同时更新服务实现、隔离测试夹具与文档。
- stdout 专用于换行 JSON-RPC；服务诊断写 stderr，日志不记录 API Key 或真实账号数据。
- 不覆盖运行中核心或资源；更新候选、验证和激活必须是不同状态。
- `pnpm dev` 启动真实原生服务，`pnpm dev:ui` 仅启动前端；旧 `dev:mock` 与产品 mock 模式已移除。自动测试与 CI 使用测试目录中的合成设备、网络和 IPC 夹具，关闭自动连接与下载。真实设备、付费模型和发布操作由明确授权另行测试并记录。
- 消耗预算默认 0，模型参数由确定性规则校验；不能向模型暴露任意命令执行。

先运行与修改相关的检查，再执行 `pnpm check` 和相关端到端场景。只改工程、契约或前端时运行 `pnpm check:app`；只改原生、C++ 或打包时运行 `pnpm check:native`；`pnpm check` 等价于两者之和。原生修改也可直接运行 `node tools/check-native.mjs --required`。`pnpm check` 仅在 cargo 缺失时明确跳过原生检查；存在工具链但检查失败时必须修复，CI 始终要求原生检查通过。

提交依赖锁文件；不提交 `.tools`、`.venv`、原生下载、构建结果、数据库、密钥或真实账号截图。生成文件通过对应生成命令更新。修改不涉及依赖时，不顺带更新锁文件。

## 交接

更新 `docs/STATUS.md`，记录实际实现、运行过的命令、平台、结果、限制和下一步。PR 说明问题及修改后行为、验证方式与尚未覆盖的平台，不把 mock 验证描述为真实游戏验证。任务交接提供分支/提交与剩余事项，保证下一位开发者无需读取聊天记录。

整理发行说明时，使用项目根目录下的 [maa-verge-release-notes skill](.skill/maa-verge-release-notes/SKILL.md)，按其模板维护 `docs/releases/<tag>.md`。
