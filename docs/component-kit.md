# Maa Verge 组件套装

界面原语集中在 `apps/desktop/src/kit/`，页面通过它调用统一的按钮、输入、开关、列表行与弹层，而不是各自复制一份类名与样式。本文是套装约定的事实源；结构约定由 `tools/check-kit-css.mjs` 强制，验证流程见 [.skill/maa-verge-ui-verification](../.skill/maa-verge-ui-verification/SKILL.md)。

设计目标与三栏编排仍由 [UI 重设计计划](ui-redesign-plan.md) 定义，组件套装是其中「样式统一」目标的实现载体。

## 为什么需要套装

套装建立前，`apps/desktop/src/` 的 49 个 tsx 与 39 个 css 全部平铺，没有组件库、CSS 框架、路径别名或 barrel 文件，同一个视觉概念被反复重写且互不一致：搜索框 8 套、`role="switch"` 开关 5 套、空状态 ≥14 个类族、抽屉 4 套（z-index 分别为 85 / 160 / 1000 / 1100）、弹层 4 种机制（其中 3 处手写 Tab 陷阱与焦点还原，绕过已有的 `modal-effects.ts`）、保存状态提示 5+ 套、徽章 5 套、`role="tablist"` 5 套；`PageHeading` / `Section` / `Empty` / `ConfirmDialog` 各被定义 2–3 次，状态文案映射 ≥8 份、日期与时长格式化 ≥6 份。

真正的结构性隐患是**祖先前缀覆盖**：共享的 `.sp-*` 组件被宿主页面用 2–3 类选择器重新样式化。已经造成过真实 bug 的链条是 `.sp-setting-row { padding: 17px 0 }`（`support-pages.css:121`）被 `settings-page.css` 的 `:113`、`:118`、`:250` 逐层覆盖，其中 `:250` 的三选择器还跨文件静默压过 `support-pages.css:727`，`log-settings.css:22` 再做第 4 次重置。套装用机制而不是约定阻止这类 bug 复发。

## 目录结构

```
kit/index.ts        barrel；同时 re-export 现有 Select（不重写）
kit/cx.ts           类名合并（不引入 clsx 依赖）
kit/format.ts       formatDate / formatDateTime / formatDuration / formatElapsed
kit/labels.ts       状态、工具、运行、更新渠道等中文映射，键类型取自 @maaverge/contracts
kit/kit.css         单一样式表，只含 .mv-* 规则
kit/*.tsx           各组件
```

不引入 `@/` 路径别名：相对路径最多两级，加别名要同时改 `tsconfig.json`、`vite.config.ts` 并重新验证 `tools/serve-test-ui.mjs` 能否解析，收益不足。

**单一 `kit.css` 而非每组件一个样式表**：Vite 本来就把所有样式表合并成一张全局表，分包没有收益；分散会让套装内部的层叠顺序取决于「哪个页面先 import」，正是上述 bug 的成因。

### 导入顺序不变量

`main.tsx` 把 `./kit/kit.css` 放在**第一个导入位置**，早于 `import App from './App'`：

```ts
import ReactDOM from 'react-dom/client';
import './kit/kit.css';
import App from './App';
```

Vite 按模块图深度优先遍历顺序合并 CSS，而 `App` 会传递导入全部页面样式表。实测非压缩构建产物：`kit.css` 的头注释落在第 1 行，`.app-select`（select.css）第 38 行，`.sp-setting-row` 第 386 行，`.settings-workspace .sp-setting-row` 第 3546 行，`.tc-plan-row` 第 9176 行，`styles.css` 的 `:root` 第 10919 行。也就是说 **`styles.css` 与全部页面样式都排在 `kit.css` 之后**。

这条顺序是规则 4(a) 成立的前提：宿主页面用单类选择器覆盖套装根类时，特异度相同、源顺序在后，因此宿主取胜。若把 `kit.css` 挪到 `./styles.css` 之后，套装规则会反过来压住宿主覆盖，逃生口失效。改动 `main.tsx` 的导入顺序前必须重新构建并核对上述标记位置。

设计令牌定义在 `styles.css` 的 `:root`。自定义属性在计算值阶段解析，与源顺序无关，因此 `kit.css` 排在前面也能正常引用令牌。

## 类名与状态修饰符

```ts
// kit/cx.ts
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}
```

```tsx
<button
  {...rest}
  className={cx(
    'mv-button',
    `mv-button--${variant}`,
    size !== 'md' && `mv-button--${size}`,
    busy && 'is-busy',
    className,
  )}
/>
```

- `className?: string` 永远追加在最后，是宿主页面唯一的逃生口，承载测试耦合的旧类名与页面布局类。
- CSS 需要的状态用 `data-*`（`data-tone="failed"`、`data-selected`、`data-dirty`），AT 需要的状态用 ARIA（`aria-checked` / `aria-pressed` / `aria-selected` / `aria-current`）。这终结 `.is-x` / `.selected` / `.active` / `.on` / `[aria-*]` / `[data-*]` 六种写法并存的局面，也给测试留了从类定位符迁走的路径——属性定位属于行为定位，不违反外观断言禁令。
- 第一波组件不提供 `classNames={{...}}` 子槽映射；子元素用固定 `mv-*` 类，宿主只能给根类加样式或自己包一层。

## 特异性规则

以下五条写入本文并由 `tools/check-kit-css.mjs` 强制。

1. `kit.css` 的选择器只允许单类或套装自有结构子元素。`.mv-button`、`.mv-button--sm`、`.mv-switch[aria-checked='true']`、`.mv-field > .mv-field-error` 合法；`.mv-overlay-layer--modal .mv-overlay-backdrop` 这类跨层后代禁止。最多一层子组合器 `>`，且两端都是 `mv-*`。
2. `kit.css` 内禁止 `!important`、禁止 `@import`、禁止祖先或页面选择器、禁止裸元素与 ID 选择器。伪类与伪元素必须在脚本登记的白名单内。
3. 变体与尺寸差异一律是 prop（`size` / `variant` / `tone` / `padding`），不是宿主覆盖。宿主若需要不同 padding，说明套装少了一个 `padding` 取值——去套装里加，而不是写 `.settings-workspace .mv-setting-row`。
4. 宿主页面不得重样式化套装内部。宿主只能：(a) 给根传 `className` 并用单类选择器为**那个根类**加样式，靠上文导入顺序不变量取胜；或 (b) 自己包一层容器并为容器加样式。
5. 插槽内容（`children` / `control` / `actions` / `footer`）由投放方页面负责样式，`kit.css` 一律不碰。

另有一条迁移卫生规则：同一个样式表不得被多个样式表 `@import`，共享关键帧只保留一份。历史上 `drawer-motion.css` 被 4 个抽屉样式表各自 `@import`，关键帧在产物里内联 4 次；现已并入 `styles.css` 一处并删除该文件。

### 门禁

`tools/check-kit-css.mjs` 用正则解析规则前导（不引入 PostCSS 依赖），执行三项检查：

- 解析 `kit.css`：命中 `!important`、`@import`、ID 选择器、裸类型选择器、后代组合器、多于一层子组合器、含非 `mv-` 类的片段或未登记伪类即失败，并报告行号；`@keyframes` 的步骤跳过，`@media` 内的选择器照常检查。
- 反向扫描 `apps/desktop/src/**/*.css`（`kit/` 之外）中出现的 `.mv-`：页面样式表引用套装内部类即硬失败，这是规则 4 的执行者。
- 统计每个被 `@import` 的样式表，导入方超过一个即失败。

单元测试在 `tools/tests/check-kit-css.test.mjs`，随 `pnpm check:app` 与其他工具测试一起运行；门禁本体在 `tools/check.mjs` 的 `applicationChecks()` 中调用。这是**结构性检查（选择器语法）**，不是渲染外观断言，不违反 `AGENTS.md` 的禁令。

```bash
node --test tools/tests/check-kit-css.test.mjs
node tools/check-kit-css.mjs
```

## 测试耦合与类名策略

`tests/ui` 有 45 个 spec、约 2093 处 `expect()`，其中约 364 处使用类定位符、涉及 66 个不同类名（`.sidebar` 单独出现 95 次），另有 2075 处 `getByRole` / `getByLabel` 依赖中文字符串。仓库没有 `data-testid`。

迁移规则：

- 套装输出新的 `mv-*` 类名。
- **纯样式**的旧类在替换时直接删除。
- **测试耦合**的旧类名通过 `className` 透传保留，等对应 spec 在同一提交内改完再移除。
- **中文文案一律不得改动**。合并标签映射前必须先 grep `tests/ui` 确认规范值；若多份副本取值有分歧，以被测试耦合的那份为准，其余标记出来交产品复核，不得静默改文案。
- **绝对禁止新增外观断言测试**（`toHaveClass` / `toHaveCSS` / `getComputedStyle`）。当前 `tests/ui` 中这类断言为 0 处，必须保持为 0。视觉验收只能人工截图。

## 设计令牌

令牌定义在 `styles.css` 的 `:root` 与 `:root[data-theme='dark']`，取值由现有分布归并而来。新标度只约束 `kit.css`；页面 CSS 在因迁移被打开时顺路收敛，不做全量回填——仓库禁止外观断言测试，大面积像素漂移无法验证。

| 类别       | 令牌                                                                                              | 归并来源                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| spacing    | `--space-1..6` = 4 / 8 / 12 / 16 / 24 / 32px                                                      | 4px 基准                                                                                                |
| radius     | `--radius-xs/sm/md/lg/full` = 4 / 6 / 8 / 12 / 999px                                              | 现有 18 种取值：2/3/4→xs，5/6/7→sm，8/9/10→md，12/14→lg，20/999→full                                    |
| typography | `--text-xs/sm/md/base/lg/xl/2xl` = 10 / 11 / 12 / 13 / 14 / 16 / 20px                             | 现有约 20 种字号；字重收敛到 400/500/600/700，450/550/650/750 在迁移时就近归档                          |
| shadow     | 保留 `--shadow`，补 `--shadow-sm`、`--shadow-lg`                                                  | —                                                                                                       |
| focus      | `--focus-ring: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)`                      | 替代现有 5 种焦点环写法；取 `select.css` / `device-picker.css` 的 `:focus-visible` 配方，迁移时视觉不变 |
| z-index    | `--z-sticky/dock/drawer/modal/popover/context/toast` = 40 / 60 / 1000 / 1100 / 1200 / 1300 / 1400 | 现有 20 种取值；顺序为抽屉 < 模态 < Select 浮层 < 右键菜单 < toast                                      |
| duration   | `--duration-1/2/3` = 0.12 / 0.18 / 0.28s                                                          | 现有 0.15–0.4s 硬编码；`--ease-out` 已存在                                                              |
| overlay    | `--backdrop: #10182780`、`--backdrop-blur: 1px`（深色 `#0b0e1499`）                               | 统一为 4 个抽屉都在用的配方；`.modal-backdrop` 的 `#11182759` 是少数派                                  |
| 语义色     | `--warning` / `--warning-soft`、`--info` / `--info-soft`                                          | 为当前在深色模式下失效的硬编码色提供令牌                                                                |

z-index 标度顺带修掉一个潜在缺陷：`ContextMenu` portal 到 body 且 z=1000，低于 side-drawer 的 1100，抽屉内开右键菜单目前只靠 DOM 顺序侥幸生效；新标度把右键菜单提到 1300。旧值（85 / 160 / 1000 / 1100）在各自组件迁移前保持不动，标度只需内部自洽。

随令牌一并修掉的真实缺陷（各为 1–3 行 diff，在使用点修，不定义别名）：

- `toolbox.css:133`、`schedule-panel.css:19` 的 `var(--text-muted)` → `var(--muted)`；`schedule-panel.css:59` 的 `var(--text-primary)` → `var(--text)`。这三个变量从未定义，一直在静默回退。
- `support-pages.css:648-651`（`.sp-update-state.is-error` 硬编码 `#c44747` / `#fff0ef`）→ `var(--danger)` / `var(--danger-soft)`，顺带获得深色模式。
- `support-pages.css:250-252`（`.sp-state.idle { color: #238159 }`）→ `var(--success)`。
- `home-dashboard.css:19-20`（紫 `#8565cb` / `#9878d7`、琥珀 `#bc8a35` / `#b78a3c`，无深色变体）→ `var(--info)` / `var(--warning)` 加深色值。
- 约 10 处 `var(--token, #与令牌不符的回退值)`：只在已经因迁移打开的文件里剥掉回退值，不单独扫一遍。

## 弹层

内部 `kit/Overlay.tsx` 独占 portal + 背景遮罩 + `acquireModalEffects`；`Modal` / `Drawer` / `ConfirmDialog` 是它的薄组合。

```
createPortal(
  <div class="mv-overlay-layer mv-overlay-layer--modal" ref={layerRef}>
    <button class="mv-overlay-backdrop" tabIndex={-1} aria-label={`${closeLabel}遮罩`} onClick={…} />
    <section class="mv-modal" ref={panelRef} role="dialog" aria-modal="true" aria-label={title}>
      <header class="mv-overlay-title"><h2>{title}</h2><IconButton label={closeLabel}><X size={18}/></IconButton></header>
      <div class="mv-overlay-body">{children}</div>
      {footer && <footer class="mv-overlay-actions">{footer}</footer>}
```

共享 props：`{ title; onClose; closeLabel?; initialFocus?; background?; returnFocus?; fallbackFocus?; 'aria-busy'?; className? }`。`title` 同时是 `role="dialog"` 的 `aria-label`；`closeLabel` 默认 `关闭${title}`，调用点必须原样传现有中文标签，它们被 `getByRole` 耦合。

- `useLayoutEffect` 里调 `acquireModalEffects({ panel, layer, background, initialFocus: initialFocus ?? panel.querySelector('[data-autofocus]'), returnFocus, fallbackFocus, onEscape: () => close.current() })`。保留 `close` ref 间接层，`SideDrawer.tsx` 与 `TaskDetailDrawer.tsx` 已验证这一写法。
- `background` 默认 `[.sidebar, .main-shell, .run-dock]`（现有两个抽屉的取值），但必须是 prop：`CopilotDeleteDialog` 用的是 `[#root]` 且额外传 `returnFocus` / `fallbackFocus` / `initialFocus`。测试对 `.main-shell[inert]` 的断言必须继续通过。
- **嵌套与堆叠不需要新机制**：`modal-effects.ts` 已维护 overlay 栈、对非顶层加 inert、父层先卸载时重指 `returnTarget`、并在 `.app-context-menu, [data-select-menu]` 打开时让出 Escape。套装规则是每个弹层都必须走套装，或走 `native: true` 的原生 dialog，**禁止手写 Tab 陷阱**。
- **原生 `<dialog>` 保持不迁移**：`DesktopLifecycle.tsx` 与 `LogSettings.tsx` 用 `showModal()`，`modal-effects.ts` 显式为 `dialog:modal` 让路并提供 `native` 选项——关窗提示必须在 React 卸载后仍存活，这是刻意设计。套装只导出 `useNativeDialog(ref, handlers)` 辅助，把这种写法变成有文档的唯一写法。

`Drawer` 的 `width` 取 `'md' | 'lg'`（760 对应任务表 / 作业 / 日志抽屉，820 对应设备连接抽屉）；`Modal` 加 `{ footer?; width?: 'sm' | 'md' }`；`ConfirmDialog` 加 `{ confirmLabel; cancelLabel?; danger?; busy?; onConfirm; children? }`。

## 组件清单

状态含义：**已实现** = 组件文件存在且至少一个页面在用；**已建** = 文件存在但尚无采用方；**计划** = 本轮尚未创建。「替代的旧实现」列出被消灭的类族或重复定义。

| 组件                                             | 替代的旧实现                                                                                                                                                                    | 状态 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `cx`                                             | 各处手写 `filter(Boolean).join(' ')`                                                                                                                                            | 已建 |
| `Select`（re-export，不重写）                    | —                                                                                                                                                                               | 已建 |
| `Button`                                         | `.button` + `.primary/.secondary/.danger`（141 处 / 29 文件）、`.text-button`（35 处）、`button.cp-link`、约 20 处 `{busy ? <LoaderCircle className="spin"/> : <Icon/>}` 惯用法 | 计划 |
| `IconButton`                                     | `.icon-button`（60 处 / 27 文件）                                                                                                                                               | 计划 |
| `Spinner`                                        | 约 25 处裸 `<LoaderCircle className="spin"/>`                                                                                                                                   | 计划 |
| `TextField` / `TextArea` / `NumberField`         | `<input>` / `<textarea>` / `<Select>` 上的 `.text-input`（82 处 / 21 文件）                                                                                                     | 计划 |
| `SearchField`                                    | 全部 8 套搜索框克隆                                                                                                                                                             | 计划 |
| `Switch`                                         | 全部 5 套 `role="switch"` 开关，以 `SupportPages.tsx` 的 `Toggle` 为准实现                                                                                                      | 计划 |
| `Checkbox` / `CheckField`                        | 40 处 `type="checkbox"`、约 10 种 wrapper 类族                                                                                                                                  | 计划 |
| `Field`                                          | `label.sp-field`、`div.sp-field` + `htmlFor`、`label.param-field`、`.tool-field`、`.cp-field`、`.check-field` 六种写法                                                          | 计划 |
| `SettingRow`                                     | `.sp-setting-row` 及其 4 层祖先前缀 padding 覆盖                                                                                                                                | 计划 |
| `Section`                                        | 被定义两次的 `Section`、`section.sp-section`（8 文件）、`section.settings-card`（6 文件）                                                                                       | 计划 |
| `Notice`                                         | `CaptureSettingsForm.tsx` 的本地 `Notice`、`DevicesPage.tsx` 的内联版、`.wb-running-note` ×2                                                                                    | 计划 |
| `PageHeading`                                    | `App.tsx` 与 `SupportPages.tsx` 两份定义，以及 `DevicesPage.tsx`、`ToolsPage.tsx` 的无组件内联标记                                                                              | 计划 |
| `EmptyState`                                     | ≥14 个空状态类族                                                                                                                                                                | 计划 |
| `StatusPill`                                     | `.pill` + 修饰符（12 处）、`.sp-state.*`、`.monitor-device-state`、`.device-selection-state.is-*`、`.cp-state-*`、`.notification-channel-badge`、`.subtle-tag`、`.status-dot`   | 计划 |
| `Tabs`                                           | 5 套 `role="tablist"` 与 2 处纵向 `.sp-category-nav`                                                                                                                            | 计划 |
| `FilterChips`                                    | `.tc-filters`、`.monitor-filters`、`.cp-category-chip` 三套工具条                                                                                                               | 计划 |
| `ProgressBar`                                    | 5 处自研 `div[role=progressbar] > i[style]` 与 4 处原生 `<progress>`                                                                                                            | 计划 |
| `ErrorBanner`                                    | `p.error-banner[role=alert]`（5 文件）与 ≥8 个页面局部错误类                                                                                                                    | 计划 |
| `Toast`                                          | `App.tsx` 全局版（6 秒自动消失）、`DesktopLifecycle.tsx`、`.monitor-log-notice` 三套                                                                                            | 计划 |
| `SaveStateIndicator`                             | 5+ 套保存状态实现                                                                                                                                                               | 计划 |
| `DirectoryPicker`                                | `SupportPages.tsx`、`CopilotStorageSettings.tsx`、`ConfigurationSettings.tsx` 三套目录选择                                                                                      | 计划 |
| `Overlay` / `Modal` / `Drawer` / `ConfirmDialog` | 4 套抽屉、4 种弹层机制、3 处手写 Tab 陷阱                                                                                                                                       | 计划 |
| `ListRow` / `SelectableRow`                      | 约 6 处重复的「复选框 + `button[aria-pressed].*-main` + 操作区」行骨架                                                                                                          | 计划 |

**本轮不抽**：`TaskParameterField`（620 行、单一使用者、13 种参数）、`DevicePreview`（视频台刻意不随主题）、`OperatorBadge` / `MaterialIcon`（已有组件且测试耦合；`.operator-badge.rarity-*` 语义独立，不并入 `StatusPill`）。`Select.tsx` 不重写：它的可访问性面被 `tests/ui/fixtures/device-picker.ts` 锁死（combobox `选择设备`、listbox `设备列表`、`[role=option][data-value]`），且它把菜单 portal 到 `closest('dialog,[role=dialog]') ?? document.body`——这是「弹层内 Select 能正常工作」的机制，套装必须保留。

### 可访问性契约

| 组件                                 | 契约                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IconButton`                         | `label` 必填并渲染为 `aria-label`；现有 `.icon-button` 全部带 `aria-label`，测试依赖 `getByRole('button', { name: '关闭…' })`                                       |
| `Switch`                             | `<button type="button" role="switch" aria-checked>` 内含 `<i/>`；样式只挂 `[aria-checked='true']`，彻底删掉 `.on` 类；同时支持 `aria-label` 与 `aria-labelledby`    |
| `TextField` 系列                     | **自身不带 label**，标注是 `Field` 的职责，以保住 `getByLabel('作战次数')` 等 335 处断言                                                                            |
| `SearchField`                        | `type="text"` 而非 `search`（WebKit 原生清除按钮装饰不一致）；迁移时逐点核对现有 `aria-label`，`getByLabel('社区搜索关键词')` 不能断                                |
| `Checkbox`                           | 保留原生 `input` 以维持 `role="checkbox"` 与 `getByLabel` 行为                                                                                                      |
| `Field`                              | `layout='side'` 用 `useId` + render-prop 接线，保证两种布局下 `getByLabel(中文)` 都能解析；`error` 渲染为 `<p role="alert">`                                        |
| `Tabs`                               | roving tabindex + 方向键 + Home/End（ARIA APG）；`aria-label` 必填；面板仍由页面持有；`getByRole('tablist', { name: '设置分类' })`、`tab '社区搜索'` 等必须原样通过 |
| `FilterChips`                        | `role="group"` 下的 `<button aria-pressed data-selected>`                                                                                                           |
| `ProgressBar`                        | `label` prop 渲染为 `aria-label`                                                                                                                                    |
| `Toast`                              | `role={error ? 'alert' : 'status'}`；`.toast` / `.error` 保持规范类名（22 处测试耦合）                                                                              |
| `SaveStateIndicator`                 | `<span role="status" data-state>`；必须基于 `settings-autosave.ts` 的 `autoSaveLabel('saved') === ''` 设计，**不得复活「已自动保存」文案**                          |
| `Modal` / `Drawer` / `ConfirmDialog` | `role="dialog"` + `aria-modal="true"` + `aria-label={title}`，inert 背景、滚动锁、焦点陷阱与还原全部来自 `acquireModalEffects`                                      |

## 非视觉工具

- **`kit/labels.ts`**：`import type { … } from '@maaverge/contracts'`，用 contracts 的枚举做键类型，schema 变更即编译失败。合并 `statusNames`（`App` / `TasksPage` / `ExecutionMonitor` / `CopilotPage` 四份）、`runLabels`、`runNames`、`taskNames`、`toolNames`、`stateLabels`、`updateLabels`。UI 文案映射**不进** contracts——该包由 schema 生成，且已确认内部没有这些映射。
- **`kit/format.ts`**：`formatDate`（≥6 份 `zh-CN` 月日时分变体）、`formatDateTime`、`formatDuration`、`formatElapsed`。`elapsed`（执行监控，回答「已经跑了多久」）与 `duration`（执行页，回答「总共要多久」）是两个问题，**两个都保留**并各自命名。

## 验证

结构与类型：

```bash
./node_modules/.bin/tsc -p apps/desktop --noEmit
node --test tools/tests/check-kit-css.test.mjs
node tools/check-kit-css.mjs
bash tools/pnpm.sh run check:app
```

界面行为与截图矩阵（1440×900 浅色、1280×800 深色、390×844 窄窗；`emulateMedia({ reducedMotion: 'reduce' })`；检查 `scrollWidth <= clientWidth`）按 [.skill/maa-verge-ui-verification](../.skill/maa-verge-ui-verification/SKILL.md) 执行。**切勿**用 `pnpm test:e2e -- <spec>`——pnpm 会把 `--` 传给 Playwright，命令实际展开为全量运行：

```bash
MAAVERGE_TEST_PORT=15541 ./node_modules/.bin/playwright test tests/ui/<spec>.ts --reporter=line
```

删除祖先前缀覆盖链之后，必须**人工核对渲染后的 padding 与对齐**，不能只看控件存在或测试通过：设置页历史上就出现过 padding 被高特异性规则静默覆盖、标签明显偏左而测试全绿的情况。截图产物放被忽略的 `test-results/`，不提交。

Chromium 夹具通过不等于原生 WebView 或安装包通过；三平台原生验收按上述技能单独记录。

## 后续范围

本轮不动 `CopilotPage.tsx`（130KB）、`PlanEditor.tsx`（68KB）与 `App.tsx` 主体（63KB）。之后：

1. 迁移上述三个文件，`.cp-record`（27 处）、`.cp-queue-list`（14）、`.cp-save-state`（22）、`.wb-save-state`（25）等通过 `className` 保留；`.cp-search` / `.wb-*-search` 收敛到 `SearchField`；`.wb-tabs` / `.cp-source-tabs` / `.cp-type-bar` 收敛到 `Tabs`。
2. 移除已迁完的保留类、删除死 CSS、把 `Select.tsx` / `ContextMenu.tsx` / `MaterialIcon.tsx` / `OperatorBadge.tsx` 物理移入 `kit/`、退役 `styles.css` 中的 `.toggle` / `.segmented` / `.pill` 全局类、对存活页面 CSS 做令牌回填，并在最后一个抽屉迁到 `.mv-drawer-panel` 后把抽屉关键帧从 `styles.css` 移进 `kit.css`。
