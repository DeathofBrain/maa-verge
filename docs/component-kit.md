# Maa Verge 组件套装

界面原语集中在 `apps/desktop/src/kit/`，页面通过它调用统一的按钮、输入、开关、列表行与弹层，而不是各自复制一份类名与样式。本文是套装约定的事实源；结构约定由 `tools/check-kit-css.mjs` 强制，验证流程见 [.skill/maa-verge-ui-verification](../.skill/maa-verge-ui-verification/SKILL.md)。

设计目标与三栏编排仍由 [UI 重设计计划](ui-redesign-plan.md) 定义，组件套装是其中「样式统一」目标的实现载体。应用、业务域与共享层的职责和依赖方向见 [前端架构](frontend-architecture.md)。

## 为什么需要套装

套装建立前的历史审计基线：`apps/desktop/src/` 的 49 个 tsx 与 39 个 css 全部平铺，没有组件库、CSS 框架、路径别名或 barrel 文件，同一个视觉概念被反复重写且互不一致：搜索框 8 套、`role="switch"` 开关 5 套、空状态 ≥14 个类族、抽屉 4 套（z-index 分别为 85 / 160 / 1000 / 1100）、弹层 4 种机制（其中 3 处手写 Tab 陷阱与焦点还原，绕过当时的 `modal-effects.ts`）、保存状态提示 5+ 套、徽章 5 套、`role="tablist"` 5 套；`PageHeading` / `Section` / `Empty` / `ConfirmDialog` 各被定义 2–3 次，状态文案映射 ≥8 份、日期与时长格式化 ≥6 份。这些数字用于保留迁移依据，不代表当前文件数或剩余重复数。

真正的结构性隐患是**祖先前缀覆盖**：共享的 `.sp-*` 组件被宿主页面用 2–3 类选择器重新样式化。已经造成过真实 bug 的链条是 `.sp-setting-row { padding: 17px 0 }`（`support-pages.css:121`）被 `settings-page.css` 的 `:113`、`:118`、`:250` 逐层覆盖，其中 `:250` 的三选择器还跨文件静默压过 `support-pages.css:727`，`log-settings.css:22` 再做第 4 次重置。套装用机制而不是约定阻止这类 bug 复发。

## 目录结构

```text
apps/desktop/src/
  main.tsx                    唯一根文件，组合挂载点与样式顺序
  app/App.tsx                 应用组合、导航与全局流程
  app/shell/                  外壳、窗口控制与 DesktopLifecycle
  app/styles/styles.css       设计令牌、reset、外壳与待退役旧样式
  features/<领域>/            页面、局部状态、组件与页面 CSS 共置
  shared/ui/                  SideDrawer、SelectAll 等跨功能组合
  shared/game/                干员、材料、关卡展示
  shared/lib/settings-autosave.ts 草稿缓存与自动保存 hook
  shared/lib/save-status.ts   无副作用的 SaveStatus / autoSaveLabel
  shared/styles/              尚被多个功能使用的旧页面样式
  kit/
    index.ts                  barrel，同时 re-export Select
    Select.tsx                既有下拉选择，保留可访问性与 portal 机制
    ContextMenu.tsx           既有右键菜单
    legacy/                   select.css / context-menu.css，保留非 mv-* 类
    modal-effects.ts          模态租约、焦点与堆叠机制
    useNativeDialog.ts        原生 dialog 的开关与取消辅助
    cx.ts                     类名合并，不引入 clsx
    format.ts / labels.ts     无 CSS 副作用的格式化与中文映射
    kit.css                   mv-* 原语样式
    *.tsx                     各组件
```

按用户最新要求使用 `@/* → src/*` 简写跨模块导入，例如 `@/kit/Button`、`@/features/devices/DevicePicker`；同目录模块与共置 CSS 可以保留 `./`。别名须同时维护 `apps/desktop/tsconfig.json` 的 `paths` 与 `apps/desktop/vite.config.ts` 的 `resolve.alias`，并验证 TypeScript、Vite 构建和 `tools/serve-test-ui.mjs` 的解析一致。别名不改变 app / feature / kit / shared 的依赖边界，也不要求新增聚合全部内部实现的 barrel。

**单一 `kit.css` 而非每组件一个样式表**：Vite 本来就把所有样式表合并成一张全局表，分包没有收益；分散会让套装内部的层叠顺序取决于「哪个页面先 import」，正是上述 bug 的成因。

### 导入顺序不变量

`main.tsx` 把 `@/kit/kit.css` 放在**第一个样式导入位置**，早于 `import App from '@/app/App'`：

```ts
import ReactDOM from 'react-dom/client';
import '@/kit/kit.css';
import App from '@/app/App';
```

Vite 按模块图深度优先遍历顺序合并 CSS，而 `App` 会传递导入全部页面样式表。迁移早期的非压缩构建曾测得：`kit.css` 的头注释在第 1 行，`.app-select` 第 38 行，`.sp-setting-row` 第 386 行，`.settings-workspace .sp-setting-row` 第 3546 行，`.tc-plan-row` 第 9176 行，`styles.css` 的 `:root` 第 10919 行。这是历史定位记录，当前产物行号会随整理改变；要保持的是 **`kit/legacy`、业务页面和 `app/styles/styles.css` 都排在 `kit.css` 之后**。

这条顺序是规则 4(a) 成立的前提：宿主页面用单类选择器覆盖套装根类时，特异度相同、源顺序在后，因此宿主取胜。若把 `kit.css` 挪到 `@/app/styles/styles.css` 之后，套装规则会反过来压住宿主覆盖，逃生口失效。改动 `main.tsx` 的导入顺序前必须重新构建并核对上述标记位置。

设计令牌定义在 `app/styles/styles.css` 的 `:root`。自定义属性在计算值阶段解析，与源顺序无关，因此 `kit.css` 排在前面也能正常引用令牌。

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
  data-busy={busy || undefined}
  className={cx(
    'mv-button',
    `mv-button--${variant}`,
    size !== 'md' && `mv-button--${size}`,
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

另有一条迁移卫生规则：同一个样式表不得被多个样式表 `@import`，共享关键帧只保留一份。历史上 `drawer-motion.css` 被 4 个抽屉样式表各自 `@import`，关键帧在产物里内联 4 次；现已并入 `app/styles/styles.css` 一处并删除该文件。

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

迁移初期的历史耦合审计记录：`tests/ui` 有 45 个 spec、约 2093 处 `expect()`，其中约 364 处使用类定位符、涉及 66 个不同类名（`.sidebar` 单独出现 95 次），另有 2075 处 `getByRole` / `getByLabel` 依赖中文字符串。记录时仓库没有 `data-testid`。这些数字不是当前测试统计；每次迁移仍须重新检索受影响类名与文案。

迁移规则：

- 套装输出新的 `mv-*` 类名。
- **纯样式**的旧类在替换时直接删除。
- **测试耦合**的旧类名通过 `className` 透传保留，等对应 spec 在同一提交内改完再移除。
- **中文文案一律不得改动**。合并标签映射前必须先 grep `tests/ui` 确认规范值；若多份副本取值有分歧，以被测试耦合的那份为准，其余标记出来交产品复核，不得静默改文案。
- **绝对禁止新增外观断言测试**（`toHaveClass` / `toHaveCSS` / `getComputedStyle`）。当前 `tests/ui` 中这类断言为 0 处，必须保持为 0。视觉验收只能人工截图。

## 设计令牌

令牌定义在 `app/styles/styles.css` 的 `:root` 与 `:root[data-theme='dark']`，取值由既有分布归并而来。新标度只约束 `kit.css`；页面 CSS 在因迁移被打开时顺路收敛，不做全量回填——仓库禁止外观断言测试，大面积像素漂移无法验证。

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
| 前景色     | `--on-accent: #fff`（深色 `#17213d`）                                                             | 强调色底上的文字；替代 `.button.primary` 的 `:root[data-theme='dark']` 祖先覆盖                         |

z-index 标度解决了早期的层级问题：`ContextMenu` 曾 portal 到 body 且 z=1000，低于 side-drawer 的 1100，抽屉内右键菜单受堆叠顺序影响；现在右键菜单使用 1300。`Toast` 已在 `kit.css` 使用 `--z-toast`，不再依赖全局旧规则的 z=95。

随令牌一并修掉的真实缺陷（以下文件行号属于迁移前的历史记录，在使用点修，不定义令牌别名）：

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

共享 props：`{ title; onClose; closeLabel?; closeDisabled?; busy?; initialFocus?; initialFocusSelector?; background?; returnFocus?; fallbackFocus?; className? }`。`title` 同时是 `role="dialog"` 的 `aria-label`，`busy` 渲染为 `aria-busy`；`closeLabel` 默认 `关闭${title}`，调用点必须原样传现有中文标签，它们被 `getByRole` 耦合。

- `useLayoutEffect` 里调 `acquireModalEffects({ panel, layer, background, initialFocus: initialFocus ?? panel.querySelector('[data-autofocus]'), returnFocus, fallbackFocus, onEscape: () => close.current() })`。`Overlay` / `Drawer` 内部保留 `close` ref 间接层，避免卸载动画期间读取过期回调。
- `background` 默认 `[.sidebar, .main-shell, .run-dock]`（现有两个抽屉的取值），但必须是 prop：`CopilotDeleteDialog` 用的是 `[#root]` 且额外传 `returnFocus` / `fallbackFocus` / `initialFocus`。测试对 `.main-shell[inert]` 的断言必须继续通过。
- **嵌套与堆叠不需要新机制**：`kit/modal-effects.ts` 已维护 overlay 栈、对非顶层加 inert、父层先卸载时重指 `returnTarget`、并在 `.app-context-menu, [data-select-menu]` 打开时让出 Escape。套装规则是每个弹层都必须走套装，或走 `native: true` 的原生 dialog，**禁止手写 Tab 陷阱**。
- **原生 `<dialog>` 保留**：`app/shell/DesktopLifecycle.tsx` 与 `features/settings/LogSettings.tsx` 已使用 `useNativeDialog(ref, options)`。hook 调用 `showModal()`，通过 `native: true` 取得效果租约，并让浏览器管理原生键盘行为。`DesktopLifecycle` 与 App 是兄弟挂载点，App 退场时退出提示仍存活；不能把它改为页面内普通 Modal。

`useNativeDialog` 的 `open` 默认 `true`；原生 `cancel` 事件由 `onClose` 交还状态持有方，`closeDisabled` 阻止忙碌或退出阶段取消。回调和门禁读取最新值，同一次打开期间保持效果租约；关闭或组件卸载时关闭原生 dialog 并释放租约。`returnFocus`、`fallbackFocus` 与背景、滚动锁等效果参数沿用 `kit/modal-effects.ts`，LogSettings 使用按钮 ref 还原焦点。

`Drawer` 的 `width` 取 `'md' | 'lg'`（760 对应任务表 / 作业 / 日志抽屉，820 对应设备连接抽屉）；`Modal` 加 `{ footer?; width?: 'sm' | 'md' }`；`ConfirmDialog` 加 `{ confirmLabel; cancelLabel?; danger?; busy?; onConfirm; children? }`。

## 组件清单

状态含义：**已实现** = 组件文件存在且至少一个页面在用；**已建** = 文件存在但尚无采用方；**计划** = 尚未创建。「替代的旧实现」中的次数与文件数保留历史审计基线，描述迁移对象，不表示所有旧写法均已消失；状态按当前消费者填写。

| 组件                                  | 替代的旧实现                                                                                                                                                                    | 状态   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `cx`                                  | 各处手写 `filter(Boolean).join(' ')`                                                                                                                                            | 已实现 |
| `Select`（re-export，不重写）         | —                                                                                                                                                                               | 已实现 |
| `format`（`kit/format.ts`）           | ≥6 份 `zh-CN` 月日时分变体、2 份带秒变体、2 份时长格式化                                                                                                                        | 已实现 |
| `labels`（`kit/labels.ts`）           | 5 份执行状态映射、任务/工具/设备/更新渠道状态映射                                                                                                                               | 已实现 |
| `Button`                              | `.button` + `.primary/.secondary/.danger`（141 处 / 29 文件）、`.text-button`（35 处）、`button.cp-link`、约 20 处 `{busy ? <LoaderCircle className="spin"/> : <Icon/>}` 惯用法 | 已实现 |
| `IconButton`                          | `.icon-button`（60 处 / 27 文件）                                                                                                                                               | 已实现 |
| `Spinner`                             | 约 25 处裸 `<LoaderCircle className="spin"/>`                                                                                                                                   | 已实现 |
| `TextField` / `TextArea`              | 历史 `.text-input` 共 82 处 / 21 文件；当前用于产线、任务表设置及高级参数等表单                                                                                                 | 已实现 |
| `NumberField`                         | 任务参数、工具、作业队列与执行配置中的数值输入                                                                                                                                  | 已实现 |
| `RangeField`                          | 任务参数中的基建心情阈值滑块                                                                                                                                                    | 已实现 |
| `ExternalLink`                        | 社区底部、原站、视频、外部服务官网及连接说明的外链样式与系统浏览器打开逻辑                                                                                                      | 已实现 |
| `SearchField`                         | 全部 8 套搜索框克隆                                                                                                                                                             | 已实现 |
| `Switch`                              | 全部 5 套 `role="switch"` 开关，以 `SupportPages.tsx` 的 `Toggle` 为准实现                                                                                                      | 已实现 |
| `Checkbox`                            | 历史 40 处 `type="checkbox"`、约 10 种 wrapper 类族；当前窗口关闭提示已采用                                                                                                     | 已实现 |
| `CheckField`                          | 带说明的复选框组合，尚无页面采用                                                                                                                                                | 已建   |
| `Field`                               | `label.sp-field`、`div.sp-field` + `htmlFor`、`label.param-field`、`.tool-field`、`.cp-field`、`.check-field` 六种写法                                                          | 已实现 |
| `SettingRow`                          | `.sp-setting-row` 及其 4 层祖先前缀 padding 覆盖                                                                                                                                | 已实现 |
| `Section`                             | 被定义两次的 `Section`、`section.sp-section`（8 文件）、`section.settings-card`（6 文件）                                                                                       | 已实现 |
| `Notice`                              | `CaptureSettingsForm.tsx` 的本地 `Notice`、`DevicesPage.tsx` 的内联版、`.wb-running-note` ×2                                                                                    | 已实现 |
| `PageHeading`                         | `App.tsx` 与 `SupportPages.tsx` 两份定义、无组件内联标记及六个主导航页面的图文标题；统一可选图标与文字间距                                                                      | 已实现 |
| `EmptyState`                          | ≥14 个空状态类族                                                                                                                                                                | 已实现 |
| `StatusPill`                          | `.pill` + 修饰符（12 处）、`.sp-state.*`、`.monitor-device-state`、`.device-selection-state.is-*`、`.cp-state-*`、`.notification-channel-badge`、`.subtle-tag`、`.status-dot`   | 已实现 |
| `Tabs`                                | 5 套 `role="tablist"` 与 2 处纵向 `.sp-category-nav`                                                                                                                            | 已实现 |
| `FilterChips`                         | `.tc-filters`、`.monitor-filters`、`.cp-category-chip` 三套工具条                                                                                                               | 已实现 |
| `ProgressBar`                         | 5 处自研 `div[role=progressbar] > i[style]` 与 4 处原生 `<progress>`                                                                                                            | 已实现 |
| `ErrorBanner`                         | `p.error-banner[role=alert]`（5 文件）与 ≥8 个页面局部错误类                                                                                                                    | 已实现 |
| `Toast`                               | `App.tsx` 全局版（6 秒自动消失）、`DesktopLifecycle.tsx`、`.monitor-log-notice` 三套                                                                                            | 已实现 |
| `SaveStateIndicator`                  | 5+ 套保存状态实现                                                                                                                                                               | 已实现 |
| `DirectoryPicker`                     | `SupportPages.tsx`、`CopilotStorageSettings.tsx`、`ConfigurationSettings.tsx` 三套目录选择                                                                                      | 已实现 |
| `Overlay` / `Modal` / `ConfirmDialog` | 4 套抽屉、4 种弹层机制、3 处手写 Tab 陷阱                                                                                                                                       | 已实现 |
| `Drawer`                              | 4 套抽屉（`SideDrawer`、`TaskDetailDrawer`、`MonitorLogDrawer`、`CopilotDetailDrawer`）                                                                                         | 已实现 |
| `useNativeDialog`                     | `DesktopLifecycle` 与 `LogSettings` 的原生 dialog 开关、取消与效果租约                                                                                                          | 已实现 |
| `ListRow` / `SelectableRow`           | 约 6 处重复的「复选框 + `button[aria-pressed].*-main` + 操作区」行骨架                                                                                                          | 已建   |

**保留领域组件**：`features/plans/TaskParameterField`（历史审计为 620 行、单一使用者、13 种参数）、`features/devices/DevicePreview`（视频台刻意不随主题）、`shared/game/OperatorBadge` / `MaterialIcon`（已有组件且测试耦合；`.operator-badge.rarity-*` 语义独立，不并入 `StatusPill`）。`Select.tsx` 不重写：它的可访问性面被 `tests/ui/fixtures/device-picker.ts` 锁死（combobox `选择设备`、listbox `设备列表`、`[role=option][data-value]`），且它把菜单 portal 到 `closest('dialog,[role=dialog]') ?? document.body`——这是「弹层内 Select 能正常工作」的机制，套装必须保留。

## 共享非视觉工具

`kit/format.ts` 与 `kit/labels.ts` 是套装的非视觉层：状态映射的键类型取自 `@maaverge/contracts`，schema 变更即编译失败。页面从 `@/kit/format`、`@/kit/labels` 深导入（两个模块不 import 任何 CSS，不会扰动 Vite 的样式表合并顺序）；避免为了纯映射加载 `kit/index.ts`，其 barrel 会连带 `Select` 的样式表。

`shared/lib/save-status.ts` 独立提供 `SaveStatus` 与 `autoSaveLabel`；它不加载 React、草稿缓存或 CSS。`kit/SaveStateIndicator` 使用该纯模块，自动保存状态与缓存 hook 则在 `shared/lib/settings-autosave.ts`。

- `formatDate`：月日时分。刻意**不**写 `hour12: false`，与迁移前渲染逐字节一致。
- `formatDateTime` / `formatDateTimeFull`：带秒 / 带年份，均 `hour12: false`（日志与导出文本的既有写法）。Chromium 中 zh-CN 的 `hour12` 默认即 24 小时制，已用夹具核对两种写法输出相同，因此 `ExecutionPage` 原先不带 `hour12` 的副本并入 `formatDateTime` 不改变渲染。
- `formatDuration` 回答「这一次一共跑了多久」（小时段写作「小时」）；`formatElapsed` 回答「现在进行到哪了」（小时段写作「时」以适配执行监控的窄列）。两者**都保留**，不要互相替代。

`labels.ts` 的合并规则：取值一致的副本直接合一（`runStatusLabels` 消灭了 5 份相同映射）；取值分歧且都未被测试耦合的副本**并列保留并具名区分**，等待产品复核，禁止静默合并——当前唯一一例是 `updateStatusLabels`（设置页「更新」分类的完整表述）与 `updateStatusShortLabels`（主页更新卡片的短语）。

### 弹层现状

`Overlay` 是唯一同时做 portal、遮罩、`acquireModalEffects` 租约与焦点落点的组件；`Modal`、`ConfirmDialog` 与 `Drawer` 是它的同族实现。`Drawer` 提供 `md` / `lg` 两档宽度、`dockOffset` 底栏避让、`header` 自定义或隐藏标题、独立遮罩标签，并透传 `ariaHidden` / `scroll` / 焦点目标；四个抽屉已全部收编。三个手写 Tab 陷阱已删除：`App.tsx` 的删除确认、`SupportPages.tsx` 的安装确认、`RunTasksDialog.tsx` 的运行确认；它们现在由 `acquireModalEffects` 提供 Tab 循环、Escape、焦点还原、背景 inert 与滚动锁。

四个抽屉与 `CopilotDeleteDialog` 已收编到 `Drawer` / `Overlay`：`shared/ui/SideDrawer` 保留默认背景与关闭标签，`features/plans/TaskDetailDrawer` 使用 `dockOffset` 与自定义标题栏，`features/execution/MonitorLogDrawer` 的 `embedded` 模式仍不创建 portal 或模态租约，`features/copilot/CopilotDetailDrawer` 显式传入 `#root` 背景、`ariaHidden`、页面滚动锁与标题焦点，同域的 `CopilotDeleteDialog` 用 `Overlay` 保留取消键初始焦点与 `#root` 背景。`DesktopLifecycle` 与 `LogSettings` 已接入 `kit/useNativeDialog.ts`；其按钮与提示也使用 kit，原生 dialog 结构继续保留。

## 迁移带来的可见归一

组件套装的目标之一是收敛尺寸，所以迁移并非逐像素不变。以下保留早期迁移中已确认的归一与渲染核对记录，不代替当前版本的截图验收：

| 位置                          | 迁移前                                         | 迁移后                                                 | 原因                                                                               |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 日志抽屉工具栏 / 删除确认按钮 | 32px 高、`6px 10px`、11px                      | `size="sm"`：28px、`5px 8px`、11px                     | 删除 `.monitor-log-toolbar .button` 与 `.monitor-log-confirm .button` 两次尺寸覆盖 |
| 游戏提醒编辑区按钮            | 30px 高、`6px 9px`、10px                       | `size="sm"`：28px、`5px 8px`、11px                     | 删除 `.game-editor-actions .button` 覆盖                                           |
| 游戏提醒「我刚已收取」        | 10px                                           | 10px（`className="game-line-add"` + 单类规则）         | 10px 不属于任何文字令牌，宿主用根类保留原值                                        |
| 工具箱识别操作按钮（窄屏）    | `padding-inline: 10px; font-size: 12px`        | 同值，改为 `.recognition-action` 单类                  | 响应式无法用 props 表达                                                            |
| 多开执行实例按钮              | `flex: 1` 由 `.multi-run-actions .button` 提供 | 同值，改为 `.multi-run-action` 单类                    | 布局属宿主职责                                                                     |
| 设备选择搜索框                | `type="search"`（role `searchbox`）            | `type="text"`（role `textbox`），同步改 3 处 spec 断言 | WebKit 原生清除按钮装饰不一致；套装自带清除按钮时再启用                            |
| 设备选择动作按钮              | 28px、`5px 8px`、11px（页面覆盖）              | `size="sm"` 同值                                       | 覆盖改 prop                                                                        |

设置页的 `.sp-setting-row` 覆盖链已在早期迁移中删除：`support-pages.css` 的基础行、`settings-page.css` 的 `.settings-workspace` 两级 padding、`.sp-update-preference` 的三条复合规则、`log-settings.css` 的重置，共 6 组选择器，全部由 `SettingRow` 的 `padding` prop 与 kit 内部结构取代。当时实测：普通行 16px 0、更新偏好行 14px 0、Mirror酱主行 16px 18px（保留 `.settings-master` 单类卡片样式）、日志保留行 0；窄屏 560px 下行间距 12px。此后再出现「标签被祖先规则静默推偏」只能来自新写的宿主复合选择器，而门禁会拒绝页面样式表引用 `.mv-`。

`SearchField` 的 `clearLabel` 同时是「是否渲染清除按钮」的开关：历史 8 套克隆中只有一部分带清除按钮，省略该 prop 可保证迁移不新增控件。`type` 默认 `text`，需要保留既有 `searchbox` 语义时显式传 `type="search"`，如作业本地搜索。`PageHeading` 的 `actionsClassName` 保留测试耦合的插槽类入口（历史 `.sp-heading-actions` 有 4 处断言），对应 spec 更新后再移除。

`PageHeading` 的 `padding` 默认为 `none`，由宿主布局提供留白；独立页头使用 `padding="page"`（Agent 助手、执行记录），提供 `26px 28px 23px` 留白并避免被纵向 flex 压缩。760px 以下收窄为 `22px 20px 20px`，480px 以下为 `20px 17px 18px`，操作区移至标题说明下方；操作区保持自身宽度，避免按钮文案被挤压。

图文标题通过 `icon` 提供装饰图标，例如 `<PageHeading title="作业中心" icon={<BookOpen />} />`。kit 提供 24px 图标槽、垂直居中、`--space-3`（12px）图文间距及 `--muted` 图标颜色；图标本身沿用 Lucide 默认 24px 尺寸。标题字号、字重和原有页面留白保持原配方。图标容器使用 `aria-hidden`，h1 的可访问名称仍只有标题文案；不传图标时保留纯文字标题结构。主页、任务、作业中心、工具箱、Agent 助手与执行记录使用各自对应的侧栏图标，根类和操作区测试耦合类保留。

`Button` 与 `IconButton` 透传 React 19 的原生 `ref`，日志结果弹层据此返回触发按钮。Toast 的尺寸、边框、语义色、内部图标与文字换行由 `kit.css` 的 `mv-toast-*` 控制，关闭按钮使用 `size="sm"`，堆叠使用 `--z-toast`；定位和入场动画仍归 `app/styles/styles.css`。Tabs 的标签保持单行且不被 flex 压缩，窄窗下由使用方容器提供横向滚动。

### 页面采用与布局模式（2026-10-31）

主页、任务、作业中心、工具箱、Agent 助手、执行记录、设备、设置，以及执行详情、日志、多开、定时和连接设置中的通用控件统一由 kit 提供。页面保留容器尺寸、网格、滚动、间距及插槽内容；不再依赖 `.button`、`.icon-button`、`.text-button`、`.text-input` 通用旧类。原生文件输入、窗口控制、导航、整卡选择、干员分组和任务队列行仍是领域组合，不能为了替换标签而套用普通按钮样式。带状态、描述和操作区的任务表编辑页头也保留业务结构。

| 组件                                                                            | 布局与采用约定                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                                        | `size="md"` 默认最小高 36px，`compact` 为 32px、12px 字号，`sm` 为 28px；`variant="text" size="sm"` 仅缩小文字，保留文字按钮的留白。默认 `type="button"`，表单提交与重置必须显式指定 `submit` / `reset`。                                                                                    |
| `TextField` / `NumberField` / `TextArea` / `Checkbox` / `CheckField` / `Switch` | 透传原生 React 19 ref；复选框混合态仍设置原生 `indeterminate`。`TextArea variant="embedded"` 用于已有外框的聊天输入区，保留 55px 高、无边框和不可拖拽的输入。`Switch` 先执行原生 `onClick`，未被取消时才调用布尔值 `onChange`。                                                              |
| `RangeField`                                                                    | 固定原生 `type="range"`，保留 min/max/step、标签和 ref，不套文本框的边框与内边距。                                                                                                                                                                                                           |
| `SearchField`                                                                   | 默认保留搜索框配方；`size="sm"` 用于 32px 紧凑搜索，`variant="inline"` 用于 31px 顶栏搜索。原生输入 ref、focus、blur、键盘事件可透传；搜索结果仍由页面持有。                                                                                                                                 |
| `PageHeading`                                                                   | `title` 支持 ReactNode，`icon` 为标题左侧的装饰图标（统一图标槽与间距、`aria-hidden`），`eyebrow` 仍是标题上方的说明插槽；页面布局由根类负责，独立页头使用 `padding="page"`。                                                                                                                |
| `Tabs`                                                                          | `variant="page"` 保留设备页的 17px 纵向留白，`workbench` 保留任务编辑页的 13px/12px 留白。`items[].ariaLabel` 可将计数与中文可访问名称分开；根容器的左右缩进、间距和滚动仍归页面。                                                                                                           |
| `FilterChips`                                                                   | 默认胶囊；`variant="subtle"` 保留任务和执行监控的矩形筛选，选中项使用表面背景与边框。                                                                                                                                                                                                        |
| `DirectoryPicker`                                                               | `surface="subtle"` 表达只读目录底色；默认 `layout="inline"`，`responsive` 在 560px 以下将输入移至整行、选择按钮右对齐。目录值不会因布局变化改写。                                                                                                                                            |
| `ProgressBar`                                                                   | 原生 progress，`size="sm/md/lg"` 分别为 3/4/6px，默认 md；页面只保留宽度和外边距。                                                                                                                                                                                                           |
| `Notice`                                                                        | 默认通知配方；`variant="banner"` 用于任务编辑页横幅，580px 以下收窄留白；`tone="neutral" size="sm"` 用于 Agent 本地规则提示。                                                                                                                                                                |
| `EmptyState`                                                                    | 默认原有通用空态，`list` 保留作业列表的 300px 区域，`panel` 保留任务空态的 340px 区域；业务图标背景由 icon 插槽提供。                                                                                                                                                                        |
| `ErrorBanner`                                                                   | 默认 p；`as="div"` 用于多个段落或带操作的错误内容，避免嵌套 p。                                                                                                                                                                                                                              |
| `ExternalLink`                                                                  | `href` 与中文内容必填，自带统一外链图标与样式；点击、Enter、中键均经 `contracts.openExternalUrl` 打开系统默认浏览器，应用不导航。打开失败默认显示 `role="alert"`，已有页面错误区可传 `onOpenError`。HTTP(S)、长度与账号信息校验仍由类型化传输执行，页面不得直接调用 Tauri 或 `window.open`。 |

本轮重新审计通用旧类与 `tests/ui` 的定位耦合后移除无作用的兼容类；中文可访问名称、href、任务面板 id 和业务卡片定位保留。外观通过合成截图人工检查，新增外链用例只断言行为。

## 可访问性契约

| 组件                                 | 契约                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IconButton`                         | `label` 必填并渲染为 `aria-label`；现有 `.icon-button` 全部带 `aria-label`，测试依赖 `getByRole('button', { name: '关闭…' })`                                       |
| `Switch`                             | `<button type="button" role="switch" aria-checked>` 内含 `<i/>`；样式只挂 `[aria-checked='true']`，彻底删掉 `.on` 类；同时支持 `aria-label` 与 `aria-labelledby`    |
| `TextField` 系列                     | **自身不带 label**，标注是 `Field` 的职责，以保住 `getByLabel('作战次数')` 等行为定位（历史审计 335 处）                                                            |
| `SearchField`                        | 默认 `type="text"`；可显式传 `type="search"` 保留 `searchbox`。迁移时逐点核对现有 `aria-label`，`getByLabel('社区搜索关键词')` 不能断                               |
| `Checkbox`                           | 保留原生 `input` 以维持 `role="checkbox"` 与 `getByLabel` 行为                                                                                                      |
| `Field`                              | `layout='side'` 用 `useId` + render-prop 接线，保证两种布局下 `getByLabel(中文)` 都能解析；`error` 渲染为 `<p role="alert">`                                        |
| `Tabs`                               | roving tabindex + 方向键 + Home/End（ARIA APG）；`aria-label` 必填；面板仍由页面持有；`getByRole('tablist', { name: '设置分类' })`、`tab '社区搜索'` 等必须原样通过 |
| `FilterChips`                        | `role="group"` 下的 `<button aria-pressed data-selected>`                                                                                                           |
| `ProgressBar`                        | `label` prop 渲染为 `aria-label`                                                                                                                                    |
| `ExternalLink`                       | 保留原生 link/href/键盘语义，图标 aria-hidden；尊重调用方取消点击，失败反馈使用 role=alert 或页面提供的 onOpenError                                                 |
| `Toast`                              | `role={error ? 'alert' : 'status'}`，内部图标 `aria-hidden`，`data-tone` 控制语义色；`.toast` / `.error` 保持规范类名（历史 22 处测试耦合）                         |
| `SaveStateIndicator`                 | `<span role="status" data-state>`；必须基于 `shared/lib/save-status.ts` 的 `autoSaveLabel('saved') === ''` 设计，**不得复活「已自动保存」文案**                     |
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
node tools/check-frontend-architecture.mjs
bash tools/pnpm.sh run check:app
```

界面行为与截图矩阵（1440×900 浅色、1280×800 深色、390×844 窄窗；`emulateMedia({ reducedMotion: 'reduce' })`；检查 `scrollWidth <= clientWidth`）按 [.skill/maa-verge-ui-verification](../.skill/maa-verge-ui-verification/SKILL.md) 执行。**切勿**用 `pnpm test:e2e -- <spec>`——pnpm 会把 `--` 传给 Playwright，命令实际展开为全量运行：

```bash
MAAVERGE_TEST_PORT=15541 ./node_modules/.bin/playwright test tests/ui/<spec>.ts --reporter=line
```

删除祖先前缀覆盖链之后，必须**人工核对渲染后的 padding 与对齐**，不能只看控件存在或测试通过：设置页历史上就出现过 padding 被高特异性规则静默覆盖、标签明显偏左而测试全绿的情况。截图产物放被忽略的 `test-results/`，不提交。

Chromium 夹具通过不等于原生 WebView 或安装包通过；三平台原生验收按上述技能单独记录。

## 后续范围

根目录现在只保留 `main.tsx`；应用组合迁入 `app/App.tsx`，外壳与应用级状态归 `app/shell`、`app/model`。页面及 CSS 已按领域归入 `features`，跨功能 UI、游戏展示和纯辅助归入 `shared`，不保留旧根路径的兼容 re-export。页面各自声明最小 props，原有 `SupportPageProps` 已删除；目录迁移不代表所有业务状态已经解耦。

`features/plans/PlanEditor` 已拆出任务队列、参数区与表设置视图；设置分类共置在 `features/settings`。`features/copilot/CopilotPage` 已拆出社区搜索 `CopilotCommunityBrowser`、详情抽屉 `CopilotDetailDrawer` 以及工作区 hook、评分、兼容提示、执行选项、导入预览、队列、监控和本地库列表，搜索及类型切换已使用 SearchField / Tabs。`features/home/GameInfoPanel` 的数据刷新与产线编辑分别由 `useHomeInfo`、`InfrastructureEditor` 持有。

后续：

1. 按业务场景继续拆分 App 的计划命令、Copilot 查询与执行状态；保持写入顺序、模块级缓存和挂载生命周期。数据解耦边界见 [前端架构](frontend-architecture.md)。
2. 评估领域列表是否适合复用 `CheckField`、`ListRow`、`SelectableRow`；三者仍只有原语定义，不能把存在文件视为页面采用。通用可见输入、复选与进度已完成本轮迁移，领域文件输入与组合行保留原生语义。
3. 移除已迁完的保留类与死 CSS，对存活页面 CSS 做令牌回填。历史 `.cp-record`（27 处）、`.cp-queue-list`（14）、`.cp-save-state`（22）定位记录仅供审计起点，删类前重新检索。抽屉已统一使用 kit，但动画仍挂在全局旧类上；解除这些类耦合后再把关键帧从 `app/styles/styles.css` 迁入 `kit.css`。

已退役全局 `.toggle` / `.segmented` / `.pill` / `.button` / `.icon-button` / `.text-button` / `.text-input`：通用控件改用 kit，执行记录筛选改用 `FilterChips`，执行/更新/多开状态改用 `StatusPill`。`Select.tsx` 与 `ContextMenu.tsx` 位于 `kit/`，其非 `mv-*` 遗留样式已共置在 `kit/legacy/`；`shared/styles/support-pages.css` 和 `app/styles/styles.css` 仍含待迁移的旧页面样式，目录归档不等于 CSS 隔离完成。
