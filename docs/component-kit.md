# Maa Verge 组件套装

界面原语集中在 `apps/desktop/src/kit/`，页面通过它调用统一的按钮、输入、开关、列表行与弹层，而不是各自复制一份类名与样式。本文是 kit API、可访问性契约、设计令牌与选择器规则的事实源；结构约定由 `tools/check-kit-css.mjs` 强制。统一命令见[开发指南](development.md#检查与测试)，组件修改步骤见[组件套装 skill](../.skill/maa-verge-component-kit/SKILL.md)。

设计目标与三栏编排仍由 [UI 重设计计划](ui-redesign-plan.md) 定义，组件套装是其中「样式统一」目标的实现载体。应用、业务域与共享层的职责和依赖方向见 [前端架构](frontend-architecture.md)。

快速用法、浅色/深色样式图和独立交互预览见 [Kit README](../apps/desktop/src/kit/README.md)。

## 维护边界

**如无必要，不得修改 kit 的组件代码与样式**：先使用现有 props、插槽和页面布局容器。只有修复真实缺陷、可访问性问题，或补充现有 API 无法表达的通用能力时，才修改 kit，并记录原因、影响范围及验证结果；单页视觉偏好、临时对齐和顺手重构不构成修改理由。

## 设计依据

套装统一重复的按钮、表单、状态提示与弹层机制，并通过选择器门禁限制祖先前缀覆盖。已有设置行曾被多个宿主样式逐层修改 padding，最终跨文件静默偏移；因此变体由 props 表达，插槽和页面布局归消费方。早期审计数量、迁移过程及已修复问题保留在[固定提交中的历史记录](https://github.com/maa-verge/maa-verge/blob/3a8ad44ba3e31e7f2d4354ff9c89b5d9a9927a43/docs/component-kit.md)，不作为当前统计维护。

## 套装目录

完整前端目录、依赖方向及 `@/` 别名以[前端架构](frontend-architecture.md#目录与依赖)为准。套装内部职责如下：

```text
apps/desktop/src/kit/
  index.ts                  组件导出入口
  Select.tsx                下拉选择与菜单 portal
  ContextMenu.tsx           右键菜单
  README.md / preview/      快速示例与浅色、深色预览
  modal-effects.ts          模态租约、焦点与堆叠机制
  useNativeDialog.ts        原生 dialog 的开关与取消辅助
  cx.ts                     类名合并
  format.ts / labels.ts     无 CSS 副作用的格式化与中文映射
  kit.css                   mv-* 原语样式
  *.tsx                     各组件
```

**单一 `kit.css` 而非每组件一个样式表**：Vite 本来就把所有样式表合并成一张全局表，分包没有收益；分散会让套装内部的层叠顺序取决于「哪个页面先 import」，正是上述 bug 的成因。

### 导入顺序不变量

`main.tsx` 保留直接相对导入，把 `./kit/kit.css` 放在**第一个样式导入位置**，早于 `import App from './app/App'`：

```ts
import ReactDOM from 'react-dom/client';
import './kit/kit.css';
import App from './app/App';
```

Vite 按模块图深度优先遍历顺序合并 CSS，而 `App` 会传递导入全部页面样式表。保持 **业务页面和 `app/styles/styles.css` 都排在 `kit.css` 之后**；Select 与 ContextMenu 的原语样式也统一位于 `kit.css`，不再单独导入旧样式表。产物行号会随整理改变，构建时应核对样式顺序。

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
- CSS 需要的状态用 `data-*`（`data-tone="failed"`、`data-selected`、`data-dirty`），AT 需要的状态用 ARIA（`aria-checked` / `aria-pressed` / `aria-selected` / `aria-current`）。状态属性也可用于行为定位；不要为状态另建 `.is-x` / `.selected` / `.active` / `.on` 等类约定。
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

迁移前重新检索受影响类名及中文可访问名称在源码和 `tests/ui` 中的使用；历史审计不能代替当前覆盖检查。

迁移规则：

- 套装输出新的 `mv-*` 类名。
- **纯样式**的旧类在替换时直接删除。
- **测试耦合**的旧类名通过 `className` 透传保留，等对应 spec 在同一提交内改完再移除。
- **中文文案一律不得改动**。合并标签映射前必须先用 `rg` 检索 `tests/ui` 确认规范值；若多份副本取值有分歧，以被测试耦合的那份为准，其余标记出来交产品复核，不得静默改文案。
- **绝对禁止新增外观断言测试**（`toHaveClass` / `toHaveCSS` / `getComputedStyle`）。视觉验收通过人工检查桌面截图完成；焦点、键盘、拖动与坐标等功能断言继续保留。

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
- **嵌套与堆叠不需要新机制**：`kit/modal-effects.ts` 已维护 overlay 栈、对非顶层加 inert、父层先卸载时重指 `returnTarget`、并在 `[data-context-menu], [data-select-menu]` 打开时让出 Escape。套装规则是每个弹层都必须走套装，或走 `native: true` 的原生 dialog，**禁止手写 Tab 陷阱**。
- **原生 `<dialog>` 保留**：`app/shell/DesktopLifecycle.tsx` 与 `features/settings/LogSettings.tsx` 已使用 `useNativeDialog(ref, options)`。hook 调用 `showModal()`，通过 `native: true` 取得效果租约，并让浏览器管理原生键盘行为。`DesktopLifecycle` 与 App 是兄弟挂载点，App 退场时退出提示仍存活；不能把它改为页面内普通 Modal。

`useNativeDialog` 的 `open` 默认 `true`；原生 `cancel` 事件由 `onClose` 交还状态持有方，`closeDisabled` 阻止忙碌或退出阶段取消。回调和门禁读取最新值，同一次打开期间保持效果租约；关闭或组件卸载时关闭原生 dialog 并释放租约。`returnFocus`、`fallbackFocus` 与背景、滚动锁等效果参数沿用 `kit/modal-effects.ts`，LogSettings 使用按钮 ref 还原焦点。

`Drawer` 的 `width` 取 `'md' | 'lg'`（760 对应任务表 / 作业 / 日志抽屉，820 对应设备连接抽屉）；`Modal` 加 `{ footer?; bodyClassName?; width?: 'sm' | 'md' }`（`bodyClassName` 用于内容容器布局）；`ConfirmDialog` 加 `{ confirmLabel; cancelLabel?; danger?; busy?; onConfirm; children? }`。

`Drawer` 还提供 `dockOffset` 底栏避让、`header` 自定义或隐藏标题、独立遮罩标签，并透传 `ariaHidden` / `scroll` / 焦点目标。`shared/ui/SideDrawer` 使用默认背景与关闭标签；`features/plans/TaskDetailDrawer` 使用底栏避让和自定义标题；`features/execution/MonitorLogDrawer` 的 `embedded` 模式不创建 portal 或模态租约；`features/copilot/CopilotDetailDrawer` 使用 `#root` 背景和标题焦点，同域删除确认用 `Overlay` 保留取消键初始焦点。

## 组件清单

状态含义：**已实现** = 组件文件存在且至少一个页面在用；**已建** = 文件存在但尚无采用方；**计划** = 尚未创建。「替代的旧实现」用于定位迁移对象，不表示所有旧写法均已消失；状态按当前消费者填写。

| 组件                                     | 替代的旧实现                                                                                                                                                         | 状态   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `cx`                                     | 各处手写 `filter(Boolean).join(' ')`                                                                                                                                 | 已实现 |
| `Select`（re-export，不重写）            | —                                                                                                                                                                    | 已实现 |
| `ContextMenuProvider` / `useContextMenu` | 既有右键菜单，保留键盘行为，样式统一迁入 `kit.css`                                                                                                                   | 已实现 |
| `format`（`kit/format.ts`）              | 日期、带秒时间与时长格式化副本                                                                                                                                       | 已实现 |
| `labels`（`kit/labels.ts`）              | 执行、任务、工具、设备与更新渠道状态映射                                                                                                                             | 已实现 |
| `Button`                                 | `.button` + 变体类、`.text-button`、`button.cp-link` 与加载图标组合                                                                                                  | 已实现 |
| `IconButton`                             | `.icon-button`                                                                                                                                                       | 已实现 |
| `Spinner`                                | 裸 `<LoaderCircle className="spin"/>`                                                                                                                                | 已实现 |
| `TextField` / `TextArea`                 | `.text-input`；用于产线、任务表设置及高级参数等表单                                                                                                                  | 已实现 |
| `NumberField`                            | 任务参数、工具、作业队列与执行配置中的数值输入                                                                                                                       | 已实现 |
| `RangeField`                             | 任务参数中的基建心情阈值滑块                                                                                                                                         | 已实现 |
| `ExternalLink`                           | 社区底部、原站、视频、外部服务官网及连接说明的外链样式与系统浏览器打开逻辑                                                                                           | 已实现 |
| `SearchField`                            | 页面搜索框副本                                                                                                                                                       | 已实现 |
| `Switch`                                 | 各页面 `role="switch"` 开关                                                                                                                                          | 已实现 |
| `Checkbox`                               | 原生复选框 wrapper；窗口关闭提示已采用                                                                                                                               | 已实现 |
| `CheckField`                             | 带说明的复选框组合，尚无页面采用                                                                                                                                     | 已建   |
| `Field`                                  | 标签、`htmlFor` 与页面字段 wrapper                                                                                                                                   | 已实现 |
| `SettingRow`                             | `.sp-setting-row` 及祖先前缀 padding 覆盖                                                                                                                            | 已实现 |
| `Section`                                | 局部 `Section`、`section.sp-section`、`section.settings-card`                                                                                                        | 已实现 |
| `Notice`                                 | 局部 `Notice`、页面内联通知与 `.wb-running-note`                                                                                                                     | 已实现 |
| `PageHeading`                            | 页面图文标题；统一可选图标与文字间距                                                                                                                                 | 已实现 |
| `EmptyState`                             | 页面空状态类族                                                                                                                                                       | 已实现 |
| `StatusPill`                             | `.pill` + 修饰符、`.sp-state.*`、`.monitor-device-state`、`.device-selection-state.is-*`、`.cp-state-*`、`.notification-channel-badge`、`.subtle-tag`、`.status-dot` | 已实现 |
| `Tabs`                                   | 页面 `role="tablist"` 与纵向 `.sp-category-nav`                                                                                                                      | 已实现 |
| `FilterChips`                            | `.tc-filters`、`.monitor-filters`、`.cp-category-chip` 工具条                                                                                                        | 已实现 |
| `ProgressBar`                            | 自研 `div[role=progressbar] > i[style]` 与原生 `<progress>`                                                                                                          | 已实现 |
| `ErrorBanner`                            | `p.error-banner[role=alert]` 与页面局部错误类                                                                                                                        | 已实现 |
| `Toast`                                  | 应用全局提示、退出提示与执行监控通知                                                                                                                                 | 已实现 |
| `SaveStateIndicator`                     | 页面保存状态提示                                                                                                                                                     | 已实现 |
| `DirectoryPicker`                        | 各设置页面的目录选择                                                                                                                                                 | 已实现 |
| `Overlay` / `Modal` / `ConfirmDialog`    | 页面弹层与手写焦点陷阱                                                                                                                                               | 已实现 |
| `Drawer`                                 | `SideDrawer`、`TaskDetailDrawer`、`MonitorLogDrawer`、`CopilotDetailDrawer`                                                                                          | 已实现 |
| `useNativeDialog`                        | `DesktopLifecycle` 与 `LogSettings` 的原生 dialog 开关、取消与效果租约                                                                                               | 已实现 |
| `ListRow` / `SelectableRow`              | 「复选框 + `button[aria-pressed].*-main` + 操作区」行骨架                                                                                                            | 已建   |

**保留领域组件**：`features/plans/TaskParameterField`、`features/devices/DevicePreview`（视频台刻意不随主题）、`shared/game/OperatorBadge` / `MaterialIcon`（已有组件且测试耦合；`.operator-badge.rarity-*` 语义独立，不并入 `StatusPill`）。`Select.tsx` 不重写：它的可访问性面被 `tests/ui/fixtures/device-picker.ts` 锁死（combobox `选择设备`、listbox `设备列表`、`[role=option][data-value]`），且它把菜单 portal 到 `closest('dialog,[role=dialog]') ?? document.body`——这是「弹层内 Select 能正常工作」的机制，套装必须保留。

`Select` 的显示文字与箭头共用 flex 布局：文字允许收缩并显示省略号，15px 箭头不收缩，两者固定间隔 7px。根容器的默认水平内边距为 10px；`size="md/compact/sm"`、`variant="default/subtle"` 与 `textSize="sm/md/base"` 表达现有尺寸、配色和字号差异，页面只保留自己的宽度、间距与布局类，不定位内部节点。箭头占据正常布局空间，避免文字重叠；菜单、原生表单语义、键盘交互及 portal 机制不变。此处斜杠分隔可选值，实际只传入其中一个。

`Select` 与 `ContextMenu` 已使用 `mv-*` 类，原 `kit/legacy` 两份样式表并入 `kit.css` 后移除。下拉分组的分隔状态和右键菜单危险项使用 `data-*`，菜单检测使用 `[data-select-menu]` / `[data-context-menu]`，不依赖样式类；浮层使用 `--z-popover` / `--z-context` 层级令牌。

## 共享非视觉工具

`kit/format.ts` 与 `kit/labels.ts` 是套装的非视觉层：状态映射的键类型取自 `@maaverge/contracts`，schema 变更即编译失败。UI 文案映射保留在 kit，不放入由 schema 生成的 contracts。页面从 `@/kit/format`、`@/kit/labels` 深导入，只加载所需的纯工具；原语 CSS 由入口统一加载。

`shared/lib/save-status.ts` 独立提供 `SaveStatus` 与 `autoSaveLabel`；它不加载 React、草稿缓存或 CSS。`kit/SaveStateIndicator` 使用该纯模块，自动保存状态与缓存 hook 则在 `shared/lib/settings-autosave.ts`。

- `formatDate`：月日时分。刻意**不**写 `hour12: false`，与迁移前渲染逐字节一致。
- `formatDateTime` / `formatDateTimeFull`：带秒 / 带年份，均 `hour12: false`（日志与导出文本的既有写法）。Chromium 中 zh-CN 的 `hour12` 默认即 24 小时制，已用夹具核对两种写法输出相同，因此 `ExecutionPage` 原先不带 `hour12` 的副本并入 `formatDateTime` 不改变渲染。
- `formatDuration` 回答「这一次一共跑了多久」（小时段写作「小时」）；`formatElapsed` 回答「现在进行到哪了」（小时段写作「时」以适配执行监控的窄列）。两者**都保留**，不要互相替代。

`labels.ts` 的合并规则：取值一致的副本直接合一；取值分歧且都未被测试耦合的副本**并列保留并具名区分**，等待产品复核，禁止静默合并——当前唯一一例是 `updateStatusLabels`（设置页「更新」分类的完整表述）与 `updateStatusShortLabels`（主页更新卡片的短语）。

## 组件 API 与布局模式

- `Button` 使用 `variant="primary/secondary/danger/text"` 与 `size="md/compact/sm"` 表达变体及尺寸；斜杠分隔可选值，实际只传一个。默认 `type="button"`，提交与重置显式指定 `type`。`busy` 显示加载图标，不自动禁用，防重复提交时同时传 `disabled`。
- `Select` 接收原生 `<option>` / `<optgroup>` 子项，不接受 `options` 数组或 `multiple`。`size`、`variant` 与 `textSize` 见上文；`textSize="sm/md/base"` 对应 11/12/13px。
- `Field` 的函数式 children 接收生成的 id，用它关联输入标签；错误状态按需同时设置 `invalid` 和 `aria-invalid`。
- `SettingRow` 的标题不自动成为控件的可访问名称，使用方显式为 `Switch` 等控件提供 `aria-label`。`StatusPill` 使用 `label`，不使用 children。
- `Tabs` 必填 `aria-label` 和唯一 `idPrefix`；使用方提供对应 id 与 `aria-labelledby` 的内容面板，方向键、Home、End 与焦点切换由组件处理。
- `Modal` / `Drawer` 没有 `open` 属性，通过条件挂载控制显示；确认动作使用 `ConfirmDialog`，独立背景和焦点目标通过 props 指定。
- `ContextMenuProvider` 由桌面入口统一挂载；独立预览自行挂载。从 `@/kit/ContextMenu` 导入 `useContextMenu`，支持右键及 Shift+F10，菜单项用 `disabled/danger` 表达状态。

`SearchField` 使用受控的 `value` / `onValueChange`，不接收原生 `onChange`；可选 `onClear` 用于同步业务筛选状态。`clearLabel` 同时是「是否渲染清除按钮」的开关：省略该 prop 时不渲染清除按钮。`type` 默认 `text`，需要保留既有 `searchbox` 语义时显式传 `type="search"`，如作业本地搜索。`PageHeading` 的 `actionsClassName` 保留测试耦合的插槽类入口，对应 spec 更新后再移除。

`PageHeading` 的 `padding` 默认为 `none`，由宿主布局提供留白；独立页头使用 `padding="page"`（Agent 助手、执行记录），提供 `26px 28px 23px` 留白并避免被纵向 flex 压缩。760px 以下收窄为 `22px 20px 20px`，480px 以下为 `20px 17px 18px`，操作区移至标题说明下方；操作区保持自身宽度，避免按钮文案被挤压。

图文标题通过 `icon` 提供装饰图标，例如 `<PageHeading title="作业中心" icon={<BookOpen />} />`。kit 提供 24px 图标槽、垂直居中、`--space-3`（12px）图文间距及 `--muted` 图标颜色；图标本身沿用 Lucide 默认 24px 尺寸。标题字号、字重和原有页面留白保持原配方。图标容器使用 `aria-hidden`，h1 的可访问名称仍只有标题文案；不传图标时保留纯文字标题结构。主页、任务、作业中心、工具箱、Agent 助手、执行记录、设备与设置使用各自对应的侧栏图标，根类和操作区测试耦合类保留。

`Button` 与 `IconButton` 透传 React 19 的原生 `ref`，日志结果弹层据此返回触发按钮。Toast 的尺寸、边框、语义色、内部图标与文字换行由 `kit.css` 的 `mv-toast-*` 控制，关闭按钮使用 `size="sm"`，堆叠使用 `--z-toast`；定位和入场动画仍归 `app/styles/styles.css`。Tabs 的标签保持单行且不被 flex 压缩，窄窗下由使用方容器提供横向滚动。

### 页面采用与布局

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

## 可访问性契约

所有文本输入（`TextField`、`SearchField`、`TextArea`）共用 `kit/text-input-behavior.ts`，固定关闭系统自动大写和自动纠正（`autoCapitalize="none"`、`autoCorrect="off"`），输入和粘贴均保留用户原有大小写；页面无需重复设置，也不得在输入回调中另行转换。搜索可以使用大小写不敏感的比较，但不能据此改写输入；用户明确选择候选项时，使用该选项的原文。设备地址的 ADB 协议归一化仍在保存或连接时执行，不影响输入过程。

| 组件                                 | 契约                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IconButton`                         | `label` 必填并渲染为 `aria-label`；现有 `.icon-button` 全部带 `aria-label`，测试依赖 `getByRole('button', { name: '关闭…' })`                                       |
| `Switch`                             | `<button type="button" role="switch" aria-checked>` 内含 `<i/>`；样式只挂 `[aria-checked='true']`，彻底删掉 `.on` 类；同时支持 `aria-label` 与 `aria-labelledby`    |
| `TextField` 系列                     | **自身不带 label**，标注是 `Field` 的职责，以保住 `getByLabel('作战次数')` 等行为定位                                                                               |
| `SearchField`                        | 默认 `type="text"`；可显式传 `type="search"` 保留 `searchbox`。迁移时逐点核对现有 `aria-label`，`getByLabel('社区搜索关键词')` 不能断                               |
| `Checkbox`                           | 保留原生 `input` 以维持 `role="checkbox"` 与 `getByLabel` 行为                                                                                                      |
| `Field`                              | `layout='side'` 用 `useId` + render-prop 接线，保证两种布局下 `getByLabel(中文)` 都能解析；`error` 渲染为 `<p role="alert">`                                        |
| `Tabs`                               | roving tabindex + 方向键 + Home/End（ARIA APG）；`aria-label` 必填；面板仍由页面持有；`getByRole('tablist', { name: '设置分类' })`、`tab '社区搜索'` 等必须原样通过 |
| `FilterChips`                        | `role="group"` 下的 `<button aria-pressed data-selected>`                                                                                                           |
| `ProgressBar`                        | `label` prop 渲染为 `aria-label`                                                                                                                                    |
| `ExternalLink`                       | 保留原生 link/href/键盘语义，图标 aria-hidden；尊重调用方取消点击，失败反馈使用 role=alert 或页面提供的 onOpenError                                                 |
| `Toast`                              | `role={error ? 'alert' : 'status'}`，内部图标 `aria-hidden`，`data-tone` 控制语义色；`.toast` / `.error` 保持规范类名                                               |
| `SaveStateIndicator`                 | `<span role="status" data-state>`；必须基于 `shared/lib/save-status.ts` 的 `autoSaveLabel('saved') === ''` 设计，**不得复活「已自动保存」文案**                     |
| `Modal` / `Drawer` / `ConfirmDialog` | `role="dialog"` + `aria-modal="true"` + `aria-label={title}`，inert 背景、滚动锁、焦点陷阱与还原全部来自 `acquireModalEffects`                                      |

## 验证

定向类型、结构门禁、行为 spec 与项目全量命令统一见[开发指南](development.md#检查与测试)，界面或样式变化的桌面截图与人工键盘走查按[界面验证 skill](../.skill/maa-verge-ui-verification/SKILL.md)执行。遵守 AGENTS：不新增或运行窄窗、手机尺寸检查，不添加外观断言测试。

删除祖先前缀覆盖链后，人工核对渲染后的 padding 与对齐；控件存在和行为测试通过不足以证明样式正确。截图产物放被忽略的 `test-results/`，不提交。Chromium 夹具通过不代表原生 WebView 或安装包通过，实际命令、宿主与未验证项记在任务或 PR。

## 后续范围

数据与生命周期解耦见[前端架构](frontend-architecture.md#尚待完成的数据解耦)。kit 后续维护集中在：

- 评估领域列表能否复用 `CheckField`、`ListRow`、`SelectableRow`；原语文件存在不代表页面已采用。保留领域文件输入与组合行的原生语义。
- 移除已无消费者的兼容类与死 CSS，删类前重新检索 JSX、动态类名和行为定位；在实际触及的页面中逐步回填令牌。
- 抽屉动画仍挂在全局旧类上，解除这些类的耦合后再把关键帧从 `app/styles/styles.css` 迁入 `kit.css`；目录迁移不等于 CSS 隔离完成。
