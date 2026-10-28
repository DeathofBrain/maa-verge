---
name: maa-verge-ui-verification
description: 为 Maa Verge 的桌面界面改动执行 Playwright 验证与状态记录：选择受影响 spec、规避 pnpm test:e2e 的参数陷阱、处理任务详情抽屉的模态/inert 与确定性夹具时序、同步知识产物，并核对定向/全量回归及浅色、深色和窄窗截图。用于修改 apps/desktop、tests/ui 或 UI 相关文档之后；不用于真实设备、原生 WebView 或发布文案。
---

# Maa Verge 界面验证

本 skill 目录的 `../..` 是仓库根目录。用 Chromium 与 `tests/ui/fixtures` 的确定性 IPC 夹具验证桌面界面；真实设备、原生 WebView、MaaCore 与发布流程不在范围内。

## 适用边界

- 适用于修改 `apps/desktop`、`tests/ui`、桌面界面相关文档或交互后的验证。
- 不把浏览器夹具结果当成真实设备、原生 WebView 或各平台安装验收。不要连接真实游戏、调用付费模型、下载组件或发布版本。
- README 与 Release 文案分别使用 [maa-verge-readme](../maa-verge-readme/SKILL.md) 和 [maa-verge-release-notes](../maa-verge-release-notes/SKILL.md)，不要在本 skill 里改用户文案。
- 三平台提交前按“三平台差异”一节记录实际宿主；没有实际执行就写“未验证”。

## 开始前

- 读 [AGENTS.md](../../AGENTS.md)、[PLAN.md](../../PLAN.md) 和 [docs/STATUS.md](../../docs/STATUS.md)，检查 `git status` / `git diff`，保留未提交改动。
- 识别受影响范围。任务入口/布局改动通常波及 `task-center`、`workspace`、`execution-monitor`、`execution`、`device-management`、`multi-run`、`plan-deletion`、`autosave-context-menu`、`default-plan`、`stages`、`recognition`、`component-readiness`、`toolbox-scheduler`、`copilot-center` 等 spec；用 `git diff --name-only` 和页面引用确认，不要只跑新 spec。
- 使用隔离端口，避免和本地开发实例冲突：`MAAVERGE_TEST_PORT=15541`（示例，换成本机未占用端口）。
- 目标 spec 先跑；失败时加 `--workers=1 --reporter=line` 串行复现，不要先改断言或加大超时。

## 命令

以下用 `task-center.spec.ts` 作为示例；实际运行当前受影响 spec。

```bash
# 定向 spec（正确）
corepack pnpm exec playwright test tests/ui/task-center.spec.ts --reporter=line

# 单个用例
corepack pnpm exec playwright test tests/ui/task-center.spec.ts \
  -g "multi-device launch blocks binding" --reporter=line

# 隔离端口 + 串行
MAAVERGE_TEST_PORT=15541 corepack pnpm exec playwright test \
  tests/ui/execution-monitor.spec.ts --workers=1 --reporter=line

# 全量
corepack pnpm test:e2e
```

- **不要**用 `pnpm test:e2e -- <spec>`。pnpm 会把 `--` 传给 Playwright，命令实际展开为 `playwright test -- <spec>`；实测会启动全量（当前 244 项），不是定向运行。
- `corepack pnpm test:e2e` 不带 `--` 时才是全量入口。全量使用隔离端口，避免与其他实例或构建并行造成 `EADDRINUSE` / 等待超时。
- 需要指定本机浏览器时设置 `MAAVERGE_TEST_BROWSER`；Windows 若自带 Chromium 出现 side-by-side 启动失败，可用 `MAAVERGE_TEST_BROWSER=msedge`（见 [apps/desktop/README.md](../../apps/desktop/README.md)）。

## 任务详情抽屉

[TaskDetailDrawer.tsx](../../apps/desktop/src/TaskDetailDrawer.tsx) 通过 portal 挂到 `body`，`role="dialog"`、`aria-modal="true"`。打开时会：

- 把 `.sidebar` 和 `.main-shell` 设为 `inert`；
- 锁定 `body` 滚动与抽屉内焦点；
- `Escape` 关闭抽屉，但上下文菜单打开时只关闭菜单；
- 关闭后恢复之前的焦点。

因此打开抽屉后不要直接点 `.sidebar`、顶栏或页面导航，否则 Playwright 会在 inert 区域等待并超时。复用 [task-center.spec.ts](../../tests/ui/task-center.spec.ts) 的 `nav()` 模式：先检查「关闭任务表详情」是否可见并关闭，再点侧栏。常用定位：

- `getByRole('region', { name: '任务中心', exact: true })`
- `getByRole('tablist', { name: '任务视图', exact: true })`
- `getByRole('dialog', { name: '任务表详情', exact: true })`
- `getByRole('region', { name: '任务表工作台', exact: true })`

## 确定性夹具时序

[runtime.ts](../../tests/ui/fixtures/runtime.ts) 把状态写入 localStorage；页面重载时 `restore()` 会把 `running` 的 run 改为 `failed`、把 `running` 的设备改为 `idle`。需要忙碌设备或运行中状态时，必须在 `page.reload()` **之后**通过 `window.runtimeHarness.call(...)` 注入，见 [task-center.spec.ts](../../tests/ui/task-center.spec.ts) 的多设备用例。

夹具的全局计时器每 700ms 让 run/tool 进度 +6%，约 12 秒到 100% 并自动完成、设备回到 `idle`。因此：

- 不要依赖长时间运行；需要 `running` 断言时，在启动后立即用 `expect` / `expect.poll` 检查，不要先执行很多无关步骤。
- 不要在 12 秒后还断言 `running`，也不要用 `waitForTimeout` 等它变化。
- 用 `app.snapshot` / `runtimeHarness.call` 核对持久状态；状态注入和断言都走夹具，不访问真实 ADB。
- 需要多个设备忙碌时，先完成 reload，再逐个 `run.start`；reload 会清掉之前的 running 状态。

## 验证顺序

1. 定向 spec：新增或修改的用例，先确认能稳定复现。
2. 受影响 spec：按上一节的页面/导航影响面选择，至少覆盖 `workspace`、`execution-monitor`、`device-management`、`multi-run` 与相关布局 spec。
3. 生成产物（仅在对应源变化时）：
   - 改了契约/JSON Schema：`corepack pnpm contracts:generate`
   - 改了 [generate-agent-knowledge.mjs](../../tools/generate-agent-knowledge.mjs) 的 `documentFiles` 列出的文档：`corepack pnpm knowledge:generate`
4. `corepack pnpm check`。它会执行 `generate-agent-knowledge.mjs --check`、契约检查、TypeScript、CTest、Bun、Python 和 Rust；耗时较长，但这是提交前的完整检查。
5. 全量 E2E：`corepack pnpm test:e2e`（隔离端口）。当前基线约 244 项，以实际输出为准；不要用上一次的数字代替本次结果。
6. 截图核对（见下节）。
7. 更新 [docs/STATUS.md](../../docs/STATUS.md)，记录实际命令、通过数、宿主平台、截图范围和未验证项。

> `docs/STATUS.md` 本身不在知识生成器的 `documentFiles` 列表中，更新状态不需要 `knowledge:generate`；只有列出的产品文档变更才需要。

## 截图矩阵

用 `page.setViewportSize`、`page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })` 和 `page.screenshot({ path: testInfo.outputPath(...), fullPage: true })`；截图放在测试输出目录，不提交 `test-results/`。至少检查：

| 场景                     | 视口     | 主题  | 重点                                        |
| ------------------------ | -------- | ----- | ------------------------------------------- |
| 桌面列表 + 抽屉 + 运行条 | 1440×900 | 浅色  | 抽屉不遮挡底部运行栏；列表/运行条无横向溢出 |
| 深色抽屉                 | 1280×800 | 深色  | 文字、边框、焦点可见；无横向溢出            |
| 窄窗列表 + 抽屉          | 390×844  | 浅/深 | 侧栏收起；抽屉内容可滚动；无页面横向溢出    |

- 截图前等目标区域可见并让动画稳定（`reducedMotion: 'reduce'`）；不要在抽屉/页面过渡中途截图。
- 用 `document.documentElement.scrollWidth <= document.documentElement.clientWidth` 或现有断言检查页面横向溢出；对抽屉内部单独检查滚动容器。
- 截图来自确定性夹具，不含真实账号；不要把它描述成真实设备或原生窗口截图。

## 三平台差异

Chromium 夹具在三平台共用，但“浏览器通过”不等于“原生 WebView / 安装包通过”。按宿主记录实际结果：

| 平台    | Chromium UI 验证                                                       | 原生/打包补充检查                                                               | 不能替代                     |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------- |
| Windows | 默认 bundled Chromium；启动失败时 `MAAVERGE_TEST_BROWSER=msedge`       | 完整构建后 `corepack pnpm test:desktop-webview`，要求 WebView2 且先退出其他实例 | 干净系统安装、卸载、真实设备 |
| macOS   | 默认 Chromium；平台专属用例用 `test.use({ runtimePlatform: 'macos' })` | 构建 DMG 后 `node tools/smoke-macos-install.mjs`，检查真实窗口与包内服务        | Gatekeeper/公证、真实设备    |
| Linux   | 默认 Chromium；可在 Linux 宿主跑同一批 spec                            | 构建 Linux runtime 后 `corepack pnpm test:clean-linux`（Docker）                | 桌面/安装器、托盘与真实设备  |

- **Windows**：桌面使用 WebView2；窗口控制、最大化/还原和 DWM 过渡是 Windows 特有行为。`MAAVERGE_TEST_BROWSER=msedge` 用已安装 Edge，避免 bundled Chromium 的 side-by-side 启动问题。`test:desktop-webview` 由宿主 Node/Playwright 驱动真实 release 窗口，日志与截图在忽略目录 `build/webview-smoke`，不等于卸载开发工具后的干净安装验收。
- **macOS**：桌面使用 WKWebView。默认夹具平台是 Windows，不要只跑默认值；[window-controls.spec.ts](../../tests/ui/window-controls.spec.ts) 和 [desktop-lifecycle.spec.ts](../../tests/ui/desktop-lifecycle.spec.ts) 已用 `runtimePlatform: 'macos'` 覆盖红绿灯/关闭路径。原生标题栏、菜单和安装包需在 macOS 宿主另行检查。
- **Linux**：桌面使用 WebKitGTK；无系统托盘的桌面不属于已验证交互环境。`test:clean-linux` 只检查原始 Ubuntu 22.04 容器内的打包后端，不检查桌面或安装器；图形桌面仍需对应宿主验证。
- **CI 边界**：application job 在 Linux 镜像跑 Chromium 夹具，native job 才在 Windows、Linux、macOS arm64/x64 宿主执行各自检查；跨编译成功、CI 通过或 Chromium 截图都不能替代宿主实际运行、最低系统版本和安装验收。
- 平台相关快捷键用 `Meta`（macOS）或 `Control`（Windows/Linux）；测试中按夹具的 `runtimePlatform` 选择，不要假设所有平台都是 Windows。

## 排错

- **导航/点击超时**：先检查任务详情抽屉是否打开、目标是否在 `.sidebar` / `.main-shell` 的 inert 区域；先关闭抽屉。
- **按钮/文案定位失败**：先对照当前组件源码和 `git diff` 确认 accessible name 是否已变。如果 UI 已改为新流程（例如从「多选设备启动」改为勾选任务表后点击「运行」），更新 spec 的定位与步骤，不要把旧文案改回产品来迁就测试。
- **Vite 报 `Failed to resolve import`**：先检查 `git status` 和文件时间，可能是另一个未完成改动缺少资源（例如新组件引用了尚未创建的 CSS）。不要替其他贡献者补占位文件、关闭 HMR overlay 或放宽断言；等该改动稳定后再验证。
- **reload 后 running 变 failed、设备变 idle**：这是夹具预期行为；在 reload 后重新注入。
- **运行状态很快消失**：夹具约 12 秒自动完成；缩短场景或提前断言，不要加长超时掩盖。
- **`pnpm check` 报产品知识未同步**：运行 `corepack pnpm knowledge:generate`；契约错误先运行 `corepack pnpm contracts:generate`。
- **端口冲突 / 并行不稳定**：换 `MAAVERGE_TEST_PORT`，用 `--workers=1` 串行复现；不要通过放宽断言、跳过测试或任意 sleep 解决。
- **原生/真实设备失败**：本 skill 不覆盖；按对应平台文档单独验证并记录，不要用浏览器夹具结果替代。

## 交付

- 明确区分：Chromium 定向通过、受影响 spec 通过、`pnpm check` 通过、全量 E2E 通过、截图已检查、真实设备/原生 WebView 未验证。
- 文档和 `docs/STATUS.md` 写实际执行的命令与结果；没有执行的项目写“未验证”，不补造平台、安装包或真实游戏结论。
- 不提交 `test-results/`、本地数据库、真实账号截图或构建产物。

## 资源

本 skill 不附带脚本或资源；命令、夹具和截图工具均使用仓库现有文件。
