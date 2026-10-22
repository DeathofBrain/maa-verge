# 参与开发

修改前阅读 [AGENTS.md](AGENTS.md)、[PLAN.md](PLAN.md) 和 [docs/STATUS.md](docs/STATUS.md)。先检查 `git status`，为一项任务建立功能分支；平行任务使用独立 worktree 并明确负责的子系统。

```bash
git switch -c feat/your-change
pnpm install --frozen-lockfile
uv sync --frozen
pnpm dev:mock
```

同机多个 worktree 的开发端口、数据目录和应用实例 ID 由路径哈希隔离。真实设备锁保持全机共享，不能通过切换工作树绕过独占控制。环境和平台依赖见 [开发文档](docs/development.md)。

## 改动与验证

- React 只使用 `packages/contracts` 的 transport；新增接口时同步 Pydantic 源、生成类型、mock 适配器、测试和文档。
- stdout 专用于换行 JSON-RPC；服务诊断写 stderr，日志不记录 API Key 或真实账号数据。
- 不覆盖运行中核心或资源；更新候选、验证和激活必须是不同状态。
- `pnpm dev` 默认真实设备模式；浏览器开发使用 `pnpm dev:mock`，自动测试与 CI 显式使用 mock。真实设备、付费模型和发布操作由明确授权另行测试并记录。
- 消耗预算默认 0，模型参数由确定性规则校验；不能向模型暴露任意命令执行。

先运行与修改相关的检查，再执行 `pnpm check` 和相关端到端场景。原生修改运行 `node tools/check-native.mjs --required`。`pnpm check` 仅在 cargo 缺失时明确跳过原生检查；存在工具链但检查失败时必须修复，CI 始终要求原生检查通过。

提交依赖锁文件；不提交 `.tools`、`.venv`、原生下载、构建结果、数据库、密钥或真实账号截图。生成文件通过对应生成命令更新。修改不涉及依赖时，不顺带更新锁文件。

## 交接

更新 `docs/STATUS.md`，记录实际实现、运行过的命令、平台、结果、限制和下一步。PR 说明问题及修改后行为、验证方式与尚未覆盖的平台，不把 mock 验证描述为真实游戏验证。任务交接提供分支/提交与剩余事项，保证下一位开发者无需读取聊天记录。
