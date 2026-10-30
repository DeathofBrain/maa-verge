---
name: maa-verge-component-kit
description: 为 Maa Verge 桌面界面新增或迁移组件套装原语：核对 tests/ui 类名与中文文案耦合、遵守 mv-* 选择器规则并通过 check-kit-css 门禁、用 props 而非祖先前缀表达变体、保持 kit.css 为模块图中第一个样式表、把弹层建在 acquireModalEffects 上。用于修改 apps/desktop/src/kit、页面组件或页面样式表之后；不用于真实设备、原生 WebView、契约生成或发布文案。
---

# Maa Verge 组件套装

本 skill 目录的 `../..` 是仓库根目录。[docs/component-kit.md](../../docs/component-kit.md) 是组件 API、设计令牌与选择器规则的事实源，本文件只写「怎么改不出事」。源码目录与依赖方向见 [docs/frontend-architecture.md](../../docs/frontend-architecture.md)：`src` 根仅保留 `main.tsx`，页面与 CSS 按领域共置于 `features`，应用外壳归 `app`，跨功能模块归 `shared`。验收流程（命令、夹具时序、截图矩阵、三平台差异）见 [maa-verge-ui-verification](../maa-verge-ui-verification/SKILL.md)，不要在这里重复。

## 适用边界

- 适用于新增 `apps/desktop/src/kit/` 原语、把页面迁移到原语、改动 `kit.css` 或页面样式表、调整设计令牌。
- 不适用于真实设备、原生 WebView、MaaCore、契约生成与发布文案。README 与 Release 文案分别用 [maa-verge-readme](../maa-verge-readme/SKILL.md) 和 [maa-verge-release-notes](../maa-verge-release-notes/SKILL.md)。
- Chromium 夹具通过不等于原生 WebView 或安装包通过。

## 开始前

- 读 [AGENTS.md](../../AGENTS.md)、[PLAN.md](../../PLAN.md)、[docs/STATUS.md](../../docs/STATUS.md) 与 [docs/component-kit.md](../../docs/component-kit.md)，检查 `git status` / `git diff`，保留未提交改动。
- 在 `docs/component-kit.md` 的组件清单表里确认目标组件状态（已实现 / 已建 / 计划）与它替代的旧实现，不要凭记忆重写一份。
- 迁移页面前先做**耦合审计**，这是本 skill 最重要的一步：

```bash
# 目标页面用到的类名在 tests/ui 里被定位了几处
grep -rn "tc-plan-row" tests/ui apps/desktop/src
# 目标页面依赖的中文 accessible name
grep -rn "getByRole\|getByLabel" tests/ui | grep "任务表详情"
```

审计结论决定类名去留：纯样式类直接删；测试耦合类通过 `className` 透传保留，等配对 spec 在**同一提交**内改完再移除。

## 硬约束

- **绝对禁止新增外观断言测试**（`toHaveClass` / `toHaveCSS` / `getComputedStyle`）。`tests/ui` 当前这类断言为 0 处，必须保持 0。视觉验收只能人工截图。
- **中文文案不得改动**。`tests/ui` 有约 2075 处 `getByRole` / `getByLabel` 依赖中文字符串。合并 `kit/labels.ts` 的映射前，先 grep `tests/ui` 确认规范值；多份副本取值分歧时以被测试耦合的那份为准，其余标记出来交产品复核，**不得静默改文案**。
- **不得复活「已自动保存」文案**。`shared/lib/save-status.ts` 的 `autoSaveLabel('saved')` 刻意返回 `''`，`SaveStateIndicator` 以此为准；草稿 hook 位于 `shared/lib/settings-autosave.ts`。
- React 只经 `packages/contracts` 的类型化传输。UI 文案映射**不进** contracts——该包由 schema 生成。
- 提交用 Conventional Commits，冒号后中文。Prettier 只格式化改动的文件。

## 选择器规则与门禁

`tools/check-kit-css.mjs` 会在 `pnpm check:app` 中失败，命中即改，不要放宽脚本：

```bash
node --test tools/tests/check-kit-css.test.mjs
node tools/check-kit-css.mjs
```

- `kit.css` 只允许 `.mv-*` 单类选择器，或**一层**子组合器 `>` 且两端都是 `mv-*`。后代组合器、`+`、`~`、ID、裸元素、页面选择器、`!important`、`@import` 一律禁止；伪类与伪元素必须在脚本登记的白名单内。
- **变体与尺寸差异一律是 prop**（`size` / `variant` / `tone` / `padding`），不是宿主覆盖。宿主需要不同 padding，说明套装少了一个取值——去套装里加，而不是写 `.settings-workspace .mv-setting-row`。
- **页面样式表不得出现 `.mv-`**（`kit/` 之外）。这条是「宿主不得重样式化套装内部」的执行者。
- 同一个样式表不得被多个样式表 `@import`。`drawer-motion.css` 曾被 4 个抽屉样式表各自导入、关键帧在产物里内联 4 次，现已并入 `app/styles/styles.css` 并删除。
- 插槽内容（`children` / `control` / `actions` / `footer`）由投放方页面负责样式，`kit.css` 一律不碰。

## 导入顺序不变量

`main.tsx` 把 `./kit/kit.css` 放在**第一个样式导入位置**，早于 `import App from './app/App'`。入口保留直接相对路径。Vite 按模块图深度优先遍历顺序合并 CSS，而 `App` 会传递导入全部页面样式表；只有排在最前，宿主页面对 `.mv-*` 根类的单类覆盖才能靠源顺序取胜（特异度相同、后者胜）。

把 `kit.css` 挪到 `@/app/styles/styles.css` 之后会让套装规则反过来压住宿主覆盖，逃生口失效。改动 `main.tsx` 导入顺序后必须重新构建核对：

```bash
cd apps/desktop && ./node_modules/.bin/vite build --minify false --logLevel warn
grep -n "组件套装样式\|^\.app-select {\|^\.sp-setting-row {\|--font-sans:" dist/assets/*.css
```

期望 `kit.css` 的头注释在第 1–2 行，`kit/legacy/select.css` / `shared/styles/support-pages.css` 等后续样式在前段，`app/styles/styles.css` 的 `--font-sans:` 在末尾附近。`dist/` 已被忽略；核对完按需重跑一次正常构建。

设计令牌在 `app/styles/styles.css` 的 `:root`。自定义属性在计算值阶段解析，与源顺序无关，`kit.css` 排在前面也能引用。

## 编写组件

- 沿用仓库现有约定：`export default function Name({ ... }: Props)` + 文件内局部 `type Props`，透传原生属性以便 `aria-*` / `data-*` / `id` / `title` 原样传递。TS strict + `noUnusedLocals` 会强制清掉迁移后遗留的 import。
- 按用户最新要求，跨模块导入使用 `@/* → src/*` 简写，同目录模块和共置 CSS 可保留 `./`。同时维护 `apps/desktop/tsconfig.json` 的 `paths` 与 `apps/desktop/vite.config.ts` 的 `resolve.alias`，核对 TypeScript、Vite 构建和 `tools/serve-test-ui.mjs` 解析一致；别名不改变目录依赖边界。
- `className?: string` 永远追加在最后（`cx(...)` 的最后一个参数），是宿主唯一的逃生口。
- CSS 需要的状态用 `data-*`，AT 需要的状态用 ARIA。不要新增 `.is-x` / `.selected` / `.active` / `.on` 之类第七种写法。
- 可访问性契约（必填 `aria-label`、`role="switch"` 只挂 `[aria-checked='true']`、`TextField` 自身不带 label、`Tabs` 的 roving tabindex 等）逐条列在 `docs/component-kit.md`，实现前先对照。
- **不要重写 `Select.tsx`**：它的可访问性面被 `tests/ui/fixtures/device-picker.ts` 锁死，且把菜单 portal 到 `closest('dialog,[role=dialog]') ?? document.body`，这是「弹层内 Select 能正常工作」的机制。`kit/index.ts` 只 re-export。
- 页面使用 `kit/format.ts` / `kit/labels.ts` 时从 `@/kit/format`、`@/kit/labels` **深导入**：这两个模块不 import 任何 CSS，深导入不会扰动 Vite 的样式表合并顺序；barrel 会连带 `Select` 的 `kit/legacy/select.css`。

## 弹层

- 每个弹层都必须走套装的 `Overlay` / `Modal` / `Drawer` / `ConfirmDialog`，或走 `native: true` 的原生 `<dialog>`。**禁止手写 Tab 陷阱、Escape 处理与焦点还原**——`kit/modal-effects.ts` 的 `acquireModalEffects` 已提供这三项，外加 inert 背景、滚动锁、overlay 栈、乱序释放，以及「`.app-context-menu, [data-select-menu]` 打开时让出 Escape」。
- 保留 `close` ref 间接层（`close.current = onClose`），`shared/ui/SideDrawer.tsx` 与 `features/plans/TaskDetailDrawer.tsx` 已验证这一写法。
- `background` 必须是 prop：默认 `[.sidebar, .main-shell, .run-dock]`，但 `CopilotDeleteDialog` 用 `[#root]` 且额外传 `returnFocus` / `fallbackFocus` / `initialFocus`。
- `app/shell/DesktopLifecycle.tsx` 与 `features/settings/LogSettings.tsx` 的原生 `<dialog>` 用 `showModal()`，**不迁移**：关窗提示必须在 React 卸载后仍存活，`kit/modal-effects.ts` 显式为 `dialog:modal` 让路。套装只提供 `useNativeDialog(ref, handlers)` 把这种写法变成有文档的唯一写法。
- 迁移弹层后除 spec 外还要**人工键盘走查**：Tab 循环、Shift+Tab、弹层内 Select 菜单打开时按 Escape、关闭后焦点还原、抽屉内开右键菜单。

## 验证顺序

1. `./node_modules/.bin/tsc -p apps/desktop --noEmit`
2. `node --test tools/tests/check-kit-css.test.mjs` 与 `node tools/check-kit-css.mjs`
3. `./node_modules/.bin/prettier --check <改动文件>`
4. 定向 spec：新增或修改的用例先稳定复现，失败时加 `--workers=1 --reporter=line` 串行复现，不要先改断言或加大超时。
5. 受影响 spec：按改动页面选择，任务入口与布局改动通常波及 `task-center`、`workspace`、`execution-monitor`、`execution`、`device-management`、`multi-run`、`plan-deletion`、`autosave-context-menu`、`default-plan`、`stages`、`recognition`、`component-readiness`、`toolbox-scheduler`、`copilot-center`；弹层改动必跑 `modal-effects` 与 `drawer-navigation`。用 `git diff --name-only` 和页面引用确认，不要只跑新 spec。
6. `bash tools/pnpm.sh run check:app`（改了契约再跑 `contracts:generate`；改了 `tools/generate-agent-knowledge.mjs` 的 `documentFiles` 所列文档再跑 `knowledge:generate`——`docs/component-kit.md` 与 `docs/STATUS.md` 都不在该列表内）。
7. 全量 E2E 与截图矩阵，按 [maa-verge-ui-verification](../maa-verge-ui-verification/SKILL.md)。
8. 更新 [docs/STATUS.md](../../docs/STATUS.md)：实际命令、通过数、宿主平台、截图范围、未验证项、下一步。

**删除祖先前缀覆盖链之后，必须人工核对渲染后的 padding 与对齐**，不能只看控件存在或测试通过。设置页历史上出现过 `.sp-setting-row` 的 padding 被 `settings-page.css` 的三选择器跨文件静默压过、标签明显偏左而测试全绿的情况。

## 排错

- **门禁报「页面样式表不得重样式化组件套装内部类」**：不要给页面 CSS 里的 `.mv-` 加白名单。要么把差异做成套装 prop，要么宿主自己包一层容器并为容器加样式。
- **门禁报选择器违规**：多半是把宿主结构写进了 `kit.css`。套装只能命中自己的 `mv-*` 子元素，跨层后代（如 `.mv-overlay-layer--modal .mv-overlay-backdrop`）要拆成单类。
- **宿主覆盖不生效**：先确认 `kit.css` 仍是 `main.tsx` 的第一个导入（见「导入顺序不变量」），再确认宿主用的是**单类**选择器——特异度更高的选择器属于规则 3 禁止的变体覆盖。
- **spec 定位失败**：先对照当前组件源码和 `git diff` 确认 accessible name 与类名是否已变。UI 已改为新流程时更新 spec 的定位与步骤，**不要把旧文案或旧类名改回产品来迁就测试**。
- **Vite 报 `Failed to resolve import`**：先检查 `git status` 和文件时间，可能是另一个未完成改动缺少资源。不要替其他贡献者补占位文件、关闭 HMR overlay 或放宽断言。
- **抽屉/弹层焦点或 inert 异常**：确认没有绕过 `acquireModalEffects` 手写陷阱；打开抽屉后不要直接点 `.sidebar` 或顶栏，它们在 inert 区域，Playwright 会等到超时。

## 交付

- 明确区分：tsc 通过、门禁通过、定向 spec 通过、受影响 spec 通过、`check:app` 通过、全量 E2E 通过、截图已检查、真实设备/原生 WebView 未验证。
- `docs/component-kit.md` 随阶段更新组件清单表（组件 → 替代的旧实现 → 状态）、可访问性契约、令牌映射与类名耦合审计结论。
- 不提交 `test-results/`、`dist/`、本地数据库、真实账号截图或构建产物。

## 资源

本 skill 不附带脚本或资源；门禁、夹具和截图工具均使用仓库现有文件。
