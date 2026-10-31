# 开发状态

更新日期：2026-10-31。当前源码版本为 **0.1.3-alpha.1**，已公开发布 **[v0.1.3-alpha.1 预览版](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.3-alpha.1)**；最新正式版仍为 **0.1.2**。工程和首批功能已落地，[PLAN.md](../PLAN.md) 中的完整产品与研究路线尚未全部交付。

默认进入主页仪表盘，汇总今日执行/完成、运行进度、最近记录、设备与三条独立组件版本；主页不包含任务表卡片、数量或新建/启动入口，侧栏不展开任务表列表。任务表统一从“任务”入口管理：列表 + 右侧详情抽屉保留逐任务设置和常驻运行条，执行监控为同页页签，开始执行不跳转；勾选任务表后由页头「运行」启动，每张表均可选择多台设备，已绑定表限绑定范围，未绑定表临时选择。执行监控统一列出在线与曾连接的离线设备，列表标题旁显示设备总数与执行中数量，已连接设备用绿色「已连接」标记，执行状态单独显示；点击设备后在下方查看当前任务表、作业或独立工具，再次点击收起；离线显示“已离线”，空闲与历史记录明确分开。任务表「查看执行」定位同一设备，设备卡日志及连接设置从右侧打开；底栏运行详情、日志、画面与多开执行向上展开，并通过底栏左侧设备选择器切换。支持设备多选停止及日志复制、导出和确认删除。产品显示名为 Maa Verge，GitHub 仓库为 [DeathofBrain/maa-verge](https://github.com/DeathofBrain/maa-verge)。六类独立工具与每日定时已接入，使用方法见 [工具箱与定时计划](toolbox-schedules.md)；独立作业中心已接入本地与 PRTS Plus 导入，完整原 MAA 兼容继续按功能矩阵验收。

## 本次后端导入别名（Windows x64，2026-10-31）

- 后端 `tsconfig.json` 为源码与测试统一配置 `@backend/* → src/*`、`@contracts/* → packages/contracts/src/*`，迁移 377 处跨目录导入；同目录保留 `./`，Agent 宿主类型改用现有 `@maaverge/agent/tools` 公开入口。未移动模块或改变文件系统路径、协议、数据格式与运行行为。
- 浏览器测试会复用后端主页纯函数，测试专用 Vite 入口同步配置两个别名；前端 `@/` 与正式桌面构建配置保持独立。后端 README 与架构文档补充写法、用途和边界，目录门禁继续按实际解析目标检查依赖方向。
- 验证：114 个改动 TS 文件经导入目标归一与格式归一后 AST 完全一致（Agent 类型公开导出单独对应到原类型源）；后端类型检查通过；固定 Bun 1.4.3 完整运行时 **1621 通过、2 平台条件跳过、0 失败**，含合成 worker 与编译服务自重入更新任务。实际后端入口编译成功；源码和编译产物均加载全部依赖，并在创建 Runtime 前正确拒绝无效模式。Edge 基建估算与草稿隔离行为 **2/2** 通过，测试服务器已退出。
- `check:app` 的知识/契约同步、CSS/架构门禁及工具 **128 通过、2 Windows 条件跳过**；契约 **42/42** 另行通过。全仓 TypeScript 当次因共享工作区并行修改的 `HomeDashboard.tsx` 存在未使用导入和缺失 `detail` 属性而中断；该前端改动保留且不纳入本次提交，未宣称全仓检查通过。
- 未连接真实设备、调用付费模型或下载原生组件；未验证 macOS/Linux、原生 WebView 或完整安装包。探针、日志及临时脚本位于忽略的 `test-results/backend-import-aliases/`，不提交。

## 本次全页 kit 统一与系统浏览器外链（Windows x64，2026-10-31）

- 修正 Agent 助手、执行记录标题紧贴内容区的问题；`PageHeading padding="page"` 提供页面留白、禁止纵向压缩，窄窗操作区移至标题说明下方。主页、任务、作业中心、工具箱及执行详情页头也采用 kit，任务编辑器的复合状态页头保留业务结构。运行中任务卡的操作行在窄窗换行，停止按钮保持自然宽度，避免“查看执行”等操作被向左挤出可见区域。
- 审计八个主页面及执行、日志、多开、连接和定时面板，将普通按钮、文字/数字/多行输入、复选框、滑块、搜索、页签、提示和进度统一到 kit。清除 JSX 的四类通用旧类及其基础/重复 CSS；导航、窗口控制、业务整卡、干员组、队列行与隐藏文件输入保留专用语义。
- kit 补齐紧凑尺寸、页面/工作台页签、目录响应式、列表/面板空态、通知横幅、原生字段 ref 等已有场景所需 API，规则与采用边界同步到[组件文档](component-kit.md)。表单提交显式使用 `type="submit"`，保留混合勾选、搜索 ref、键盘页签及焦点行为；未新增外观断言测试。
- 新增 `ExternalLink`，社区底部 PRTS、作业原站、视频、设置中的 PRTS/Mirror酱官网和连接说明统一外链样式、图标及默认浏览器打开接口。点击、Enter、中键通过 `contracts.openExternalUrl`，沿用 HTTP(S)、长度与账号信息校验，打开失败在原页面或就地显示错误；测试不打开真实外部网站。
- 验证：最终 `pnpm check:app` 通过（工具 **128 通过、2 个 Windows 条件跳过**，契约 **42/42**，知识与契约同步、CSS/架构门禁、四工作区 TypeScript）；Windows Edge 全量合成 E2E **250/250**（4 workers，独立端口/输出目录，3.7 分钟），包含新增两项外链行为回归。外链定向 **2/2** 通过；运行卡窄窗换行修正后，任务中心、批量操作及 workspace 相关行为复跑 **29/29**，类型、CSS 门禁和生产构建再次通过。
- 本轮完整 `pnpm check` 亦已通过；后续改动仅涉及前端、UI 测试与文档，未变更后端/原生源码。对应后端 Bun **1621 通过、2 平台条件跳过**，C++ CTest **4/4**，Rust fmt/clippy 及 **61 项测试**通过（3 ignored），Windows 平台工具 **24/24**；最终前端变更重新执行上述 `check:app` 和全量 E2E。
- 前端生产构建通过，kit 样式仍先于宿主样式。人工核对八个主页面的 1440×900 浅色、1280×800 深色、390×844 深色截图；另检查任务抽屉/参数/设置/定时、执行监控、日志和设置外链。补拍桌面/窄窗下四类目录、合成识别结果、库存表格左右滚动及公招表单，并在 1440/820/600/390px 复核运行中任务卡操作，总计 **72 张最终范围截图**，未发现页面横向溢出或明显布局漂移。按钮、勾选和进度厚度存在少量 kit 尺寸归一；截图及手动检查脚本未提交。
- 未连接真实设备、调用付费模型、下载原生组件或发布版本；未验收原生 WebView、macOS/Linux、安装包或真实系统浏览器启动。领域卡片与剩余业务状态解耦继续按[前端架构](frontend-architecture.md)边界推进。

## 本次后端分层与 RPC 职责提取（Windows x64，2026-10-31）

- 核查 OpenCode、Actual、Joplin 的固定提交源码，借鉴本地应用的显式组装、业务聚合、平台适配与资源销毁；来源、取舍和后续范围见[后端架构](backend-architecture.md)。未引入 HTTP MVC、全局服务注册器或新运行框架。
- 将 54 个既有根文件（52 个 TS、2 个生成 JSON）归入 `app / transport / modules / infrastructure / shared`，产品入口仍是 `src/entry.ts`，不增加旧路径 re-export。同步后端测试、UI 夹具、构建/知识工具和忽略规则，修正三个源码位置相关的开发默认路径。
- JSON-RPC envelope、响应与诊断独立为 `transport/json-rpc.ts`，只依赖小结构接口。Runtime 保留统一准入门禁，65 个方法的校验与路由提取到 `app/rpc-dispatch.ts`，通过分组能力调用具体用例；不下传 Store、worker map 或 Runtime 私有状态。
- 迁移 AST 审计：47 个 TS 文件归一导入与格式后完全一致，其余 5 个为约定的 Runtime 提取、设备配置类型直引和三个默认根路径调整。Unicode 表字节未变；知识仍为 381 条，仅文档源码链接及派生哈希重新生成。单 Store/数据根租约、rowid、持久 requestId 去重、更新子任务不打开业务数据库的边界保留。
- 增加后端目录与依赖门禁，拒绝反向依赖、产品导入测试/工具夹具、桌面 UI，以及显式声明文件模块路径；正常 JS 解析到声明文件仍允许。门禁接入 `check:app`，**17/17** 结构回归通过；不宣称该后端门禁检查所有运行时循环。迁移中发现的生成校验器声明路径混淆已修复并覆盖。
- 验证：`pnpm run check:app`、知识同步与后端类型检查通过；固定 Bun 1.4.3 完整运行时 **1621 通过、2 平台跳过、0 失败**（83 文件，66.60 秒），包含合成 C++ worker 和编译服务自重入更新任务；Windows x64 Bun 编译/执行探针通过，覆盖 SQLite 行号、跨进程独占锁、归档与子进程。
- 最终 Edge 合成 E2E **248/248 通过**（4 workers，3.6 分钟，独立端口与输出目录）。验证中修正两处测试时序：等待异步配置目录命令实际发出；先验证作业焦点，再验证分类弹层缩窄后的焦点，去掉恢复视口后立即打开菜单的竞态。业务断言与用例数保留，无外观断言、强制点击或延时。
- 新增 [backend README](../services/backend/README.md)，说明目录用途、依赖、数据、协议、更新、扩展和测试；开发指南与相关源码链接同步。Runtime 的连接/执行状态机、UpdateService 内部职责和 settings 写入协调仍待后续拆分。
- 本轮没有修改 contracts schema、业务数据格式、版本号或真实游戏执行语义；未连接真实设备、调用付费模型、下载真实组件、构建发行安装包或发布版本。macOS/Linux 与真实设备行为未重新验收。

## 本次前端架构归档与套装完善（Windows x64，2026-10-31）

- 读取 Clash Verge Rev、GitButler、screenpipe 的 Tauri 2 源码，按应用组合、业务领域、共享能力和原语归档；固定提交链接与取舍见[前端架构](frontend-architecture.md)。迁移 103 个既有文件，`src` 根仅保留 `main.tsx`，不保留旧路径兼容层。
- `app` 拆出全局操作、设备运行选择和运行面板；页面声明最小 props，删除 `SupportPageProps`。计划串行写入仍由 App 生命周期挂载，未改变保存、删除防复活及请求去重。修复上下文菜单的 Escape 同时关闭底层运行面板的问题。
- Copilot 拆出社区浏览和详情抽屉，采用 kit 搜索、Tabs、筛选及进度；首页拆出数据刷新 hook 和产线编辑器。补全原生 dialog 的开关、取消与焦点租约，Toast 内部样式归 kit，按钮支持 React 19 ref；清理确认无引用的旧页面 CSS，保留动态设备状态等实际使用规则。
- 增加 `@/* → src/*` 导入简写，TypeScript、Vite 和测试服务共用解析约定。同目录用 `./`，跨目录用 `@/`。修正测试及文档中的迁移路径，四份行为 spec 复用既有导航辅助，保留全部场景和断言。
- 新增前端目录、依赖方向、Tauri 入口和运行时循环门禁并接入 `check:app`，覆盖类型导入、动态导入、别名与 CSS 依赖。组件文档和项目 skill 同步，最后重写 [desktop README](../apps/desktop/README.md)，说明职责、边界、扩展和测试。
- 验证：`pnpm run check:app`（工具、契约同步、四工作区类型和 42 项契约测试）、前端生产构建通过；全量 Edge 合成 E2E **248/248**（4 workers，4.4 分钟，独立端口/输出目录）。新增两项键盘行为回归，无外观断言。导航辅助简化定向 **28/28**，后端两处跨层纯函数引用回归 **7/7**。
- 人工抽查作业中心列表和详情的 1440 浅色、1280 深色、390 窄窗合成截图，修正窄窗 Tabs 标签挤压；构建 CSS 确认 kit 在最前、全局令牌在后。截图与构建产物未提交。未执行真实设备、模型、组件下载、原生 WebView、macOS/Linux 或安装包验收。
- 当前仍有 App 的计划流程、Copilot 会话容器、全量 settings 写入协调及全局旧 CSS 待进一步解耦；目录归档不代表这些工作已完成。

## 本次弹层统一与手写焦点陷阱清理（macOS arm64，2026-10-30）

- 新增 `Overlay`（portal + 遮罩 + `acquireModalEffects` 租约 + 标题/正文/页脚骨架）、`Modal`（`width: sm/md`）、`ConfirmDialog`（`confirmLabel`/`cancelLabel`/`danger`/`busy`/`confirmIcon`，`busy` 时禁用关闭并吞掉 Escape 与遮罩点击）与 `useNativeDialog`（原生 `<dialog showModal>` 的焦点/Escape 辅助）。
- 删除三处手写 Tab 陷阱与各自的焦点代码：`App.tsx` 的删除任务表确认、`SupportPages.tsx` 的安装应用更新确认、`RunTasksDialog.tsx` 的运行任务表确认。三者改用套装弹层后由 `acquireModalEffects` 统一提供 Tab 循环、Escape、焦点还原、背景 inert 与滚动锁；`App.tsx` 因此不再需要 `X` 图标与手写 `useEffect` 焦点逻辑。
- 迁移中修掉一个真实缺陷：安装确认的旧遮罩类 `.sp-app-install-modal` 带 `z-index: 100`，放进新的定位层后会盖住面板并吞掉所有点击；删掉该规则后恢复。
- 未改写为套装 `Drawer`：`SideDrawer`、`TaskDetailDrawer`、`MonitorLogDrawer` 本来就调用 `acquireModalEffects`，没有手写陷阱；收编需要子槽类 API，留到 Stage 8 与 `.tc-drawer-*`、`.monitor-log-*` 一起做。`CopilotDeleteDialog`（已正确使用 `acquireModalEffects`）与两个原生 `<dialog>` 同样保留。
- 验证：`tsc -p apps/desktop --noEmit`、门禁脚本与 9 个门禁单测、修改文件 Prettier 通过；定向 Chromium spec（modal-effects、drawer-navigation、task-center、task-batch-actions、plan-deletion、multi-run、app-updates、component-updates、copilot-library-actions、desktop-lifecycle）**61/61**（端口 15554），修复遮罩层级后 app-updates 单项复跑 **10/10**；Chromium 全量 E2E **249/249**（端口 15557）。
- 人工键盘走查（合成夹具）：打开删除确认后初始焦点在弹层内；Tab 8 次与 Shift+Tab 3 次后焦点仍在弹层内；`.main-shell[inert]` 生效；Escape 关闭后焦点回到「删除任务表」触发键；截图确认弹层居中、页脚按钮与焦点环正常。
- 未连接真实设备、调用模型或构建安装包；Windows/Linux 与原生 WebView 未验收。

## 本次展示型原语与提示收编（macOS arm64，2026-10-30）

- 新增 `StatusPill`（7 种 `data-tone` + 可选圆点）、`ProgressBar`（原生 `<progress>`，保留 `value` 属性与 `role=progressbar`）、`Tabs`（roving tabindex、方向键、Home/End、`aria-controls` 由 `idPrefix` 生成）、`FilterChips`（`role=group` + `aria-pressed`）、`ErrorBanner`、`Toast`、`ListRow`、`SelectableRow` 八个组件；门禁白名单补登记 `::-webkit-progress-bar`、`::-webkit-progress-value`、`::-moz-progress-bar` 三个厂商伪元素（仅 ProgressBar 使用）。
- 采用方：App 全局提示改用 `Toast`（`.toast` / `.error` 仍是规范类名，22 处测试耦合不变），App、执行页、执行监控与定时面板的错误条改用 `ErrorBanner`（保留 `.error-banner` 根类以维持页面布局）；主页最近执行与执行页的运行、任务、通关结论改用 `StatusPill`（`runStatusTones` / `runTaskStatusTones` 随 `labels.ts` 提供）。
- 未采用（已建）：`Tabs`、`FilterChips`、`ProgressBar`、`ListRow`、`SelectableRow`。`Tabs` 与现有 `.dp-tabs` / `.tc-view-tabs` / `.wb-tabs` 的间距与计数徽章配方不同，直接替换会造成可见漂移，留到对应页面阶段连同 CSS 一起归一；`ProgressBar` 的 5 处自研进度条依赖 `> i` 宽度样式，替换需同步改页面进度动画；两个行骨架需要与 `.cp-record` / `.tc-plan-row` 等 27+ 处容器类一起迁移。
- 验证：`tsc -p apps/desktop --noEmit`、门禁脚本与 9 个门禁单测、修改文件 Prettier 通过；定向 Chromium spec（workspace、execution、execution-monitor、task-center）**43/43**（端口 15550）。截图确认 App 提示（「任务表已开始执行」+ 关闭键）与执行抽屉内的「执行中」胶囊渲染正常。
- 未连接真实设备、调用模型或构建安装包。下一步为弹层统一，把 4 套抽屉与 3 处手写 Tab 陷阱收编到 `acquireModalEffects`。

## 本次设置页集群迁移与覆盖链删除（macOS arm64，2026-10-30）

- 新增 `SettingRow`（`padding: md/compact/card/flush`）、`SaveStateIndicator`（基于 `autoSaveLabel`，`saved` 为空串）与 `DirectoryPicker` 三个套装组件。
- 删除历史 bug 的根源——`.sp-setting-row` 的四层特异性覆盖链：`support-pages.css` 的基础 17px 行、`settings-page.css` 的 `.settings-workspace` 16px 与 `.settings-master` 16px 18px、`.sp-update-preference` 的三条复合规则、`log-settings.css` 的重置与响应式塌陷、以及 560px 下两处重复的间距规则；同时删除 `.settings-workspace .toggle` 的三条开关尺寸覆盖。全部改由 `SettingRow` 的 `padding` prop、`Switch` 的 `size="lg"` 与 kit 内部结构表达。
- `SupportPages.tsx` 删除本地 `PageHeading` 与 `Section` 两个重复定义，改用套装版本（页头仍传 `.sp-page-heading`、动作容器仍传 `.sp-heading-actions` 以保住 4 处测试断言）；`ComponentPathForm` 改用 `DirectoryPicker`。通用与外观、更新偏好的 5 处保存状态改用 `SaveStateIndicator`；`ModelSettings` 同样迁移。Mirror酱与通知设置的保存状态文案（`保存失败` / `正在保存…`）不在 `autoSaveLabel` 中，按「不得静默改文案」保留原样。
- 通知设置的两个开关改用 `Switch size="lg"`（`aria-labelledby` + `aria-describedby` 原样传递），删除 `.notification-switch` 的尺寸覆盖；`ConfigurationSettings` 与 `CopilotStorageSettings` 的目录选择改用 `DirectoryPicker`；`CaptureSettingsForm` 的本地 `Section`/`Notice` 改用套装（保留 `.sp-section`/`.sp-notice` 根类以维持外边距）。
- 渲染核对（合成夹具，1440×900）：普通设置行 `16px 0`、间距 20px、标题字重 600、末行无分隔线；更新偏好行 `14px 0` 且说明块为 block；Mirror酱主行 `16px 18px` + 1px 边框 + 10px 圆角；560px 以下行间距 12px、390×844 无横向溢出。逐张截图 7 个设置分类的浅色、通知与更新的深色、通用与外观的 390px，截图存于被忽略的 `test-results/`。
- 验证：`tsc -p apps/desktop --noEmit`、门禁脚本与 9 个门禁单测、修改文件 Prettier 通过；定向 Chromium spec（app-updates、component-updates、configuration-settings、connection-settings、download-proxy-settings、mirrorchyan-settings、notification-settings、log-settings、multi-instance、workspace、directory-picker、autosave-context-menu）**77/77**，第二批（notification-settings、directory-picker、configuration-settings、connection-settings、log-settings、workspace、app-updates、component-updates、mirrorchyan-settings、download-proxy-settings、multi-instance）**68/68**（端口 15547、15549）。
- 未连接真实设备、调用模型或构建安装包；Windows/Linux 与原生 WebView 未验收。Mirror酱/通知设置的保存状态副本、`styles.css` 的全局 `.toggle` 与其余 `.sp-*` 退役留到后续阶段。

## 本次第一波表单与页面骨架原语（macOS arm64，2026-10-30）

- 新增 15 个套装原语：`Button`（`primary/secondary/danger/text` + `md/sm` + `busy`）、`IconButton`（`label` 必填为 `aria-label`）、`Spinner`、`TextField` / `TextArea` / `NumberField`（`invalid` → `data-invalid`）、`SearchField`、`Switch`（`md/lg`，只挂 `[aria-checked='true']`）、`Checkbox` / `CheckField`、`Field`、`Section`、`Notice`（`data-tone`）、`PageHeading`、`EmptyState`，全部从 `kit/index.ts` 导出且只含 `.mv-*` 规则。
- 新增令牌 `--on-accent`（浅色 `#fff`、深色 `#17213d`），替代 `.button.primary` 依赖 `:root[data-theme='dark']` 祖先选择器的写法；套装样式表因此不含任何祖先前缀。
- 采用方：`DevicesPage.tsx`（页头 + 全部按钮，页头动作容器以 `actionsClassName` 保留 `.sp-heading-actions` 供 4 处测试断言）、`ToolsPage.tsx`、`GameInfoPanel.tsx`、`MultiRunPanel.tsx`、`RecognitionPanel.tsx`、`MonitorLogDrawer.tsx`、`DeviceSelectionList.tsx`（搜索框改为 `type="text"`，同步把 3 处 `searchbox` 断言改为 `textbox`）。删除 `.device-selection-actions .button`、`.monitor-log-toolbar .button`、`.monitor-log-confirm .button`、`.game-editor-actions .button`、`.dp-card-footer .text-button` 五处尺寸覆盖；`.game-line-add`、`.recognition-action`、`.multi-run-action` 三个宿主根类承接只能由布局/响应式表达的部分。
- 可见归一（已逐项核对渲染高度与内边距）：日志抽屉工具栏与游戏提醒编辑区按钮 30/32px → 28px；其余尺寸不变（设备页、工具箱按钮 36.2px / `8px 13px` / 13px，文字按钮 26px / `4px 0` / 12px，设备选择动作按钮 28px / `5px 8px` / 11px，设备搜索框 35px）。详见[组件套装](component-kit.md) 的「迁移带来的可见归一」。
- 验证：`tsc -p apps/desktop --noEmit`、`tools/check-kit-css.mjs` 与 9 个门禁单测、修改文件 Prettier 全部通过；定向 Chromium spec（device-management、devices、toolbox-scheduler、game-info、multi-run、recognition、execution-monitor、device-selection）**49/49**（端口 15545）。
- 人工核对：1440×900 浅色截图设备页、工具箱、任务表设置（设备选择）、日志抽屉、主页游戏提醒、多开执行，深色截图设备页，390×844 检查主页无横向溢出；`test-results/` 下的截图未提交。
- 未覆盖：`CaptureSettingsForm.tsx`、`TaskConnectionSettings.tsx` 的设置页用法留到设置页集群一起迁移；`EmptyState`、`Section` 在设备页/工具箱的内联替换留到展示型原语阶段。下一步为设置页集群迁移并删除 `.sp-setting-row` 覆盖链。

## 本次共享格式化与中文标签映射（macOS arm64，2026-10-30）

- 新增 `apps/desktop/src/kit/format.ts` 与 `kit/labels.ts` 并从 barrel 导出：`formatDate` / `formatDateTime` / `formatDateTimeFull` / `formatDuration` / `formatElapsed`，以及执行、任务、工具作业、设备选择、更新渠道的中文状态映射；键类型取自 `@maaverge/contracts`，schema 变更即编译失败。页面从 `./kit/format`、`./kit/labels` 深导入——两个模块不 import 任何 CSS，不会扰动 Vite 的样式表合并顺序。
- 采用方删除本地副本：`HomeDashboard.tsx`（`dateTime`、`runLabels`、`updateLabels`）、`ExecutionPage.tsx`（`dateTime`、`duration`、`runNames`、`taskNames`）、`MonitorLogDrawer.tsx`（`stamp`、`fullStamp`）、`DeviceSelectionList.tsx`（`stateLabels`）、`SupportPages.tsx`（`formatDate`、`updateLabels`、`channelLabels`）。`App.tsx` / `TasksPage` / `ExecutionMonitor` / `CopilotPage` 的采用留到各自阶段。
- 文案合并规则：取值完全一致的 5 份执行状态映射合一为 `runStatusLabels`；`updateLabels` 的两份副本取值分歧且都未被测试耦合（设置页「更新」分类的完整表述 vs 主页更新卡片的短语），并列保留为 `updateStatusLabels` / `updateStatusShortLabels`，在 [组件套装](component-kit.md) 中标记待产品复核，**未静默改文案**。
- `formatDateTime` 相对 `ExecutionPage` 原副本新增 `hour12: false`；已在 Chromium 夹具中核对 zh-CN 两种写法输出相同（`10/30 15:04:05`），渲染不变。`formatDate` 刻意不写 `hour12` 以保持与迁移前逐字节一致。`formatDuration`（「小时」）与 `formatElapsed`（「时」）回答不同问题，两者都保留。
- 验证：`tsc -p apps/desktop --noEmit` 通过；`tools/check-kit-css.mjs` 门禁与 9 个门禁单测通过；修改文件 Prettier 通过；定向 spec（workspace、execution、execution-monitor、device-selection、multi-run、drawer-navigation、app-updates、component-updates、directory-picker）**71/71**（端口 15541）；Chromium 全量 E2E **249/249**（端口 15543）。
- 人工核对渲染：用合成夹具在 1440×900 浅色与深色下截图主页、执行详情与设置更新页并读取渲染文本，确认时间戳（`10/30 20:47:21`）、时长（`0 分 0 秒`）、状态（`执行中`）、渠道名与状态（`Maa Verge 应用 | 等待检查`）与迁移前一致，`scrollWidth <= clientWidth` 无横向溢出；截图存于被忽略的 `test-results/`，未提交。
- 未连接真实设备、调用模型或构建发行安装包；Windows/Linux 宿主与原生 WebView 仍未验收，Chromium 夹具通过不等于原生验收。下一步为第一波视觉原语（Button、Switch、SearchField、Section 等）。

## 本次设计令牌与变量缺陷修复（macOS arm64，2026-10-30）

- `styles.css` 的 `:root` 与深色块补齐设计令牌：spacing（4px 基准 6 级）、radius（现有 18 种取值归并为 5 级）、typography（约 20 种字号归并为 7 级）、shadow 两级、统一焦点环 `--focus-ring`、遮罩 `--backdrop` / `--backdrop-blur`、z-index 有序标度（抽屉 1000 < 模态 1100 < Select 浮层 1200 < 右键菜单 1300 < toast 1400）、duration 3 级，以及 `--warning` / `--info` 语义色与深色值。新标度只约束 `kit.css`，页面样式在因迁移被打开时顺路收敛，不做全量回填。
- 修复三个从未定义的变量：`toolbox.css` 与 `schedule-panel.css` 的 `var(--text-muted)`、`schedule-panel.css` 的 `var(--text-primary)` 分别改为 `var(--muted)` / `var(--text)`，在使用点修而不定义别名。这会**改变实际渲染色**：相关说明文字此前因变量缺失而继承父级颜色，现在回落到 muted 灰。
- 修复深色模式下失效的硬编码色：`support-pages.css` 的 `.sp-state.idle`（`#238159`）与 `.sp-update-state.is-error`（`#c44747` / `#fff0ef`）、`home-dashboard.css` 主页指标的紫 / 琥珀（`#8565cb` / `#9878d7`、`#bc8a35` / `#b78a3c`）改用语义令牌，主页指标图标由此获得此前不存在的深色变体。
- macOS arm64：`tsc -p apps/desktop --noEmit`、`tools/check-kit-css.mjs` 门禁与修改范围 Prettier 通过；Chromium 全量 E2E **249/249**，工具箱 / 工作台 / 应用更新 / 组件更新定向 **44/44** 通过（独立端口 15541）。
- 人工核对渲染结果：用合成夹具在 1440×900 浅色与深色下读取 computed style 并截图主页、设备、任务表定时页签、工具箱与设置更新页，确认 `--muted` / `--success` / `--info` / `--warning` 在两种主题下解析正确、`scrollWidth <= clientWidth` 无横向溢出；截图存于被忽略的 `test-results/`，未提交。`.tool-operation p` 与 `.sp-update-state.is-error` 需要真实工具执行与更新失败状态才能渲染，未逐点截图，其声明与已验证的 `.schedule-panel p` 机制相同。
- 未连接真实设备、调用模型或构建发行安装包；Windows/Linux 宿主与原生 WebView 仍未验收，Chromium 夹具通过不等于原生验收。下一步为共享格式化与中文标签映射（`kit/format.ts`、`kit/labels.ts`）。

## 本次组件套装脚手架与抽屉动画去重（macOS arm64，2026-10-30）

- 设置页不再显示「已自动保存」成功提示：`autoSaveLabel('saved')` 返回空串，Mirror酱与通知设置同步置空，避免每次自动保存都闪一条无信息量的状态。更新分类下「下载设置」组（下载代理 + Mirror酱）前置到「更新」之前，先配置来源再看渠道。三个 spec 的保存状态断言由类选择器文本改为 `runtimeHarness.call('app.snapshot')` 行为轮询。该笔改动已提交并推送至 `origin/dev`。
- 建立 `apps/desktop/src/kit/` 作为界面原语的唯一来源，含 `cx`、barrel（re-export 现有 `Select`，不重写）与只含 `.mv-*` 规则的单一 `kit.css`。约定、组件清单、可访问性契约与令牌映射见[组件套装](component-kit.md)，[UI 重设计计划](ui-redesign-plan.md) 只加指针不重写。本轮为纯新增脚手架，**不含任何组件实现与页面迁移**。
- 新增 `tools/check-kit-css.mjs` 把「变体走 props、宿主不得重样式化套装内部」从约定变成机制：校验 `kit.css` 选择器形态（禁止后代组合器、多于一层子组合器、ID、裸元素、页面选择器、`!important`、`@import` 与未登记伪类）、反向扫描页面样式表中出现的 `.mv-`、并禁止同一样式表被多处 `@import`。脚本挂进 `tools/check.mjs` 的 `applicationChecks()`，单测随工具测试运行。这是结构性检查，不是外观断言。
- `kit.css` 必须是模块图中第一个样式表，早于 `import App from './App'`。Vite 按依赖遍历顺序合并 CSS，实测非压缩产物中 `kit.css` 头注释在第 1–2 行、`.app-select` 第 38 行、`.sp-setting-row` 第 386 行、`.tc-plan-row` 第 9176 行、`styles.css` 的 `:root` 第 10919 行，即页面样式与 `styles.css` 全部在后；只有如此，宿主的单类覆盖才能靠源顺序取胜。原先把 `kit.css` 放在 `./styles.css` 之后的写法会让套装规则反过来压住宿主，已纠正并写入文档与技能。
- `drawer-motion.css` 曾被四个抽屉样式表各自 `@import`，关键帧在产物中内联四份且层叠顺序随导入方漂移。内容并入 `styles.css` 一处后删除该文件，产物中 `drawer-enter` 由 8 处降为 2 处（一次引用 + 一次定义），规则内容与相对顺序不变。
- macOS arm64：`tsc -p apps/desktop --noEmit` 通过；门禁单测 **9/9**、门禁本体通过；工程脚本 **92/92**（本平台无条件跳过项）、契约 **42/42**，`pnpm check:app` 整体通过；Chromium 全量 E2E **249/249** 通过（独立端口 15541）；抽屉与任务表相关定向 spec **21/21** 通过；修改范围 Prettier 通过。验证使用隔离合成设备、数据与 IPC，未连接真实设备、调用模型或构建发行安装包。
- 本轮没有渲染层变化（`kit.css` 目前只有注释，抽屉动画规则逐条等价），因此未做截图核对；Windows/Linux 宿主、原生 WebView 与安装包仍未验收，Chromium 夹具通过不等于原生验收。下一步按计划推进设计令牌与变量缺陷修复（`--text-muted` / `--text-primary` 未定义、`.sp-update-state.is-error` 与主页仪表盘的硬编码色在深色模式下失效）。

## 本次按功能提交前整体验证（Windows x64，2026-10-30）

- 当前整合工作区的 `pnpm check:app` 通过，包含工程脚本 **81 通过、2 项平台跳过**、契约 **42/42**、四工作区类型及生成同步；固定 Bun 完整运行时 **1,621 通过、2 项平台跳过、0 失败**。前端生产构建、修改范围 Prettier 及差异空白检查通过，契约与产品知识均由源文件重新生成。
- Rust fmt、严格 locked Clippy 与完整单测通过，单测 **61 通过、3 项既有忽略**。Edge 全量 **249 项**首轮 **248 通过**；唯一失败是自动保存用例仍对已改为复选框的设备绑定调用下拉框接口，更新两处功能选择器后，该文件隔离复跑 **9/9** 通过。未将定向复跑记为完整一轮全量通过，先前并行改动造成的模块缺失及启动提示失败在本次整合回归中未再出现。
- 验证使用独立端口与隔离合成设备、数据和 IPC，没有新增外观断言；未连接真实设备、调用模型、发送系统通知或构建发行安装包。原生目录窗口、macOS/Linux 与原生 WebView 本次仍未实机验收。

## 本次设置页面重构与自动保存（Windows x64，2026-10-30）

- 设置统一为分类导航、搜索与分组卡片，通知、通用、更新和作业删除偏好使用开关；操作按钮集中排列，技术信息折叠，精简重复说明。应用、核心和资源继续分别检查、下载和生效，使用与边界见[应用设置](settings.md)。
- 所有设置偏好自动保存，移除保存按钮：开关、下拉与目录选择立即提交，文字输入防抖并在失焦、切换分类时提交；失败保留草稿并可重试。保存串行读取最新快照，避免不同分类互相覆盖；Mirror酱 CDK 未保存草稿仅保留在内存，模型设置不会发起模型请求。
- 配置、作业、核心及资源目录均只读展示，通过固定的类型化接口调用 Tauri 原生目录选择器，禁止手工输入；取消不写入，选择或恢复默认自动保存。配置目录仍在重启后生效，既有数据、活动组件和回滚版本保留原引用。
- Windows x64：`pnpm check:app` 通过，包含工程脚本 **81 通过、2 项平台条件跳过**、契约 **42/42**、四工作区类型及生成产物同步；前端生产构建通过。Rust check、严格 locked Clippy 及完整单测 **61 通过、3 项既有忽略**通过。相关 Edge 功能回归覆盖 **55 项**用例，均已通过；应用更新首轮 **8/10**，移除两项过时说明文案断言后定向补跑 **2/2**，未记为完整一轮通过。修改范围格式及差异空白检查通过。
- 已人工核对浅/深色桌面及窄窗合成截图，没有新增外观断言测试。验证使用隔离数据与合成 IPC，未连接真实设备、发送真实系统通知或调用模型；本次未实际打开原生目录窗口，macOS/Linux 与原生 WebView 仍待分别验收。

## 本次任务表设置与多设备选择整理（Windows x64，2026-10-30）

- 任务表通过创建、编辑、执行和删除管理，移除整表开关、相关状态和启动限制。旧 `Plan.enabled` 保留协议兼容，读取与保存统一为 `true`，历史值不影响执行；单项任务与定时规则继续独立控制启停，已关闭的定时保持原值。
- 绑定设置与单表、多表运行共用设备选择组件：名称、地址和标识搜索，全部/已选/在线/离线筛选，限高滚动与数量汇总。批量选择、取消只修改筛选内可操作设备，隐藏的选择保留；离线或缺失绑定可明确解除，运行目标继续检查绑定范围、占用与冲突。绑定遵循既有 100 台上限，任务表列表只汇总总数及前两台设备。方案与接口边界见[任务表与设备绑定](task-device-bindings.md)。
- Windows x64：固定 Bun 后端专项 **409/409**、新增 Edge 设备选择功能 **3/3** 通过，覆盖旧数据重启与执行、定时独立启停、筛选选择持久化、102 台设备中的上限处理及隐藏无效目标。`pnpm check:app`、前端生产构建、Prettier 和 `git diff --check` 通过；桌面与 390px 窄窗人工截图已核对，未新增外观断言。
- 相关 Edge 回归 **41 项**首轮 **28 通过**；13 项失败的 trace 指向共享工作区并行设置模块的中间状态（缺少 `pickDirectory` 导出及新建样式文件），隔离复跑工作台与定时 **22/23** 通过，剩余 1 项仍因未写入的 `settings-page.css` 加载失败而待稳定后复验。仅使用隔离合成设备与数据，未进行真实游戏及 macOS/Linux 本次验收。

## 本次配置路径前缀修复（Windows x64，2026-10-30）

- 配置目录接口统一返回可安全简化的 Windows 路径，当前目录、数据库、默认目录、已保存目录、下次启动目录及选择器路径不再暴露普通磁盘路径的 `\\?\` 前缀。复用已锁定的 `dunce`，仅增加直接依赖；长路径、UNC 与需要特殊路径语义的目录保留原值。
- 内部规范路径继续用于数据根身份和重启判断，配置选择器、数据库锁及目录打开行为保持原有边界。没有新增外观断言测试。
- Windows x64：配置目录专项 **7/7**、Rust fmt、严格 locked Clippy 及完整单测（**61 通过、3 项既有忽略**）通过。验证使用隔离临时目录，未启动产品或连接真实设备；原生界面与 macOS/Linux 本次未实机验收。

## 本次连接成功误报修复（Windows x64，2026-10-30）

- 连接确认与任务空闲分开：已确认连接且原生初始化完成后，即使任务已经开始，也不会等待整项任务结束再确认连接。自动连接等待超时或迟到失败时重新核对当前控制器，保留已连接设备及正在执行的任务，不再覆盖成连接失败。
- 设备详情与执行监控仅在设备离线时显示连接错误；在线或执行中的历史错误不再误导用户。定时准备在连接等待后重新检查控制器身份、服务状态及执行占用，避免把忙碌设备标为空闲。
- Windows x64：连接专项 **36/36**、相关连接/客户端/定时回归 **54 通过、1 项原生环境条件跳过**，Edge 执行监控 **16/16**；后端与桌面 TypeScript、格式检查通过。共享工作区完整运行时检查 **1,617 通过、2 项平台跳过、1 项知识生成失败**；失败源于并行文档修改造成生成来源失配，来源稳定后该文件 **5/5** 复验通过。重建自包含运行时后，空 PATH 下载/取消/摘要拒绝、选择性解压与合成 C++ 加载、RPC 持久化与 EOF 重启冒烟通过。
- 使用隔离数据与合成设备，未操作真实模拟器或游戏，macOS/Linux 尚未实机验收。未添加外观断言。

## 本次任务表与设备多对多绑定（Windows x64，2026-10-30）

- 任务表可绑定多台设备，设备也可绑定多张任务表；设置页逐项绑定/解绑并自动保存，旧单设备绑定兼容读取，旧客户端保存保留额外绑定。离线或缺失目标保持显式绑定，删除历史设备不自动解除限制。
- 单表和多表启动均可按表选择多台目标；绑定范围、设备占用和多表目标冲突统一校验。每个任务表与设备创建独立运行，部分失败重试复用请求标识且不重复成功目标；列表汇总全部运行并可整表停止，执行监控显示设备关联的全部任务表。正在执行的快照不受后续编辑影响。
- 定时仍固定任务表与单台设备，可在绑定范围内分别设定规则；解绑只停用范围不再有效的规则。Agent 任务表查询与执行使用相同范围校验，消耗上限按各设备执行独立计入。使用与接口边界见[任务表与设备绑定](task-device-bindings.md)。
- Windows x64 验证：`node tools/check.mjs --app` 通过（含四工作区类型、契约生成同步及契约 **42/42**）；固定 Bun 全量运行时 **1,618 通过、2 项平台跳过、0 失败**，前端生产构建通过。Edge 绑定与相关功能 **52 项**首轮 **50 通过**，旧固定说明断言和一次页面加载超时两项随后隔离复跑 **2/2** 通过；覆盖保存恢复、逐项解绑、共享表独立执行、按设备与整表停止、二级绑定搜索、定时范围及响应丢失后的稳定请求去重。仅使用隔离合成设备与数据，没有新增外观断言；未进行真实游戏、多开实机或 macOS/Linux 本次验收。

## 本次执行监控设备列表精简（2026-10-30）

- 在线与历史离线设备合并为同一列表，列表标题旁显示设备总数与执行中数量；已连接设备增加绿色「已连接」标记，执行中、空闲状态独立显示。移除独立「设备监控」页头、重复引导、离线分组及底部通用说明。
- 保留状态筛选、搜索、多选停止、日志、离线历史删除及当前/历史执行切换；同步移除既有测试中依赖旧分组和重复说明的断言，没有新增外观测试。
- Windows x64：`pnpm check:app` 通过（工程脚本 **81 通过、2 项平台跳过**，契约 **42/42**，四工作区类型及生成同步）。Edge 执行监控 **16/16**，任务中心 **3/4**；后者唯一失败来自共享工作区并行调整的启动结果提示文案，与本次列表修改无关，未覆盖其他贡献者的实现。已人工核对桌面与 390px 窄窗截图；记录保存在忽略目录 `test-results/monitor-unified-20261030/`。使用合成桌面桥及设备，未进行真实设备及 macOS/Linux 验收。

## 本次 Mirror酱接入（Windows x64，2026-10-30）

- 同步并保留 Mirror酱官方贡献的分发工作流，应用资源 ID 沿用 `maa-verge`；安装官方 `mirrorchyan-integration` skill 到项目 `.skill/`，记录固定上游提交，原文不参与格式化或应用打包。
- 「设置 → 更新 → Mirror酱」提供启用、掩码 CDK、显式保存与放弃修改；应用、MaaCore、MaaResource 共用配置，旧客户端保存其他设置时保留。未保存 CDK 仅驻留页面内存，已保存值可重启恢复、禁用和清空；请求及下载错误使用静态说明，日志与诊断导出脱敏，不持久化 CDK 请求 URL 或限时下载链接。
- 应用对应 `maa-verge`，Windows EXE / Linux AppImage 必须与官方所选资产版本、大小和摘要一致，Rust 继续验证发行签名；现有 macOS 镜像 DMG 不冒充签名更新归档。核心对应 `MAA`，目前只有 Windows 完整包用于核心提取；其他宿主保持官方运行时来源。资源对应独立 `MaaResource`，按 `last_updated` 验证时间戳，与 Git commit 跨源比较同版和先后，避免重复下载及自动降级。
- 仅接受完整包，校验 SHA-256、大小、归档路径、包内版本及原生加载，拒绝增量 `changes.json`。镜像准备失败时重新选择官方版本及来源；完成版本进入原有不可变 generation，可本地复用、回滚和保护，激活及等待空闲重试都重新执行资源时间门禁。
- 设置、README、NOTICE、运行时/应用更新文档与[专项说明](mirrorchyan.md)明确：**Mirror酱用户端高速分发为付费服务，需要适用项目的有效 CDK；Maa Verge 本身免费开源，官方免费来源保留。** 未填写 CDK、平台无适配包或服务失败时正常回退，CDK 错误可见，不自动打开购买页面。
- 最终 Windows x64 验证：完整 Bun 运行时 **1,606 通过、2 项平台跳过、0 失败**；四工作区类型、契约生成和知识生成同步通过；工程脚本 **81 通过、2 项平台跳过**、契约功能 **42/42**；前端生产构建通过。Mirror/API/归档/应用下载专项 **230 通过、2 项原生环境条件跳过**，CDK 持久化与诊断专项 **15/15**，界面结果见下节。通知变更的 Rust 严格 Clippy 及 **62 通过、3 项既有忽略**保持通过；重建自包含运行时后，空 PATH 下载/取消/摘要拒绝、选择性解压与 C++ 加载、持久化与 EOF 重启，以及真实 Rust → Bun → C++ 设备租约链路冒烟全部通过。
- 验证使用合成 HTTP/归档、隔离数据和合成设备，没有使用真实 CDK、付费请求、真实组件下载、真实游戏或系统通知投递。macOS/Linux 原生发送、真实付费下载及各平台人工安装/升级仍待单独验收。

## 本次功能测试精简（Windows x64，2026-10-30）

- 原有 **310** 项界面测试删除 **76** 项外观、重复参数穷举及非必要呈现测试，补充抽屉焦点恢复、已知离线目标启动两项功能回归，清理后 **236** 项。保留保存与持久化、错误重试、迟到响应隔离、键盘与焦点、退出去重、资源释放、请求串行和页面响应性测试；不再保留样式、几何、主题、截图及动画断言。画面点击的坐标换算仍用于验证实际控制功能。
- 非界面删除 **3** 个低价值测试块和固定文案/排版断言：生成校验器的源码正则、NSIS 配置的静态镜像、产品知识固定限制文案。协议校验、来源哈希和引用闭包、租约、持久化、更新与归档安全、失败恢复、真实 NSIS/ZIP 工程功能回归继续保留。
- Windows Edge 在当前工作区连同 Mirror酱新增 **3** 项设置功能共 **239** 项：全量 **238/239**；唯一旧日志按钮选择器冲突已限定表单作用域，随后日志文件 **5/5** 通过。初次定向回归遇到开发服务热更新导致的元素替换，稳定后相关工作台用例三轮通过。契约校验器 **15/15**、NSIS/ZIP **8/8**、隔离生成产品知识后的功能测试 **5/5** 通过。没有新增外观断言。

## 本次通知图标修复（Windows x64，2026-10-30）

- Windows 顶部发送者身份的 `IconUri` 单独注册为 32×32 Logo PNG，显示资产类型对齐 Windows App SDK，并使用八位背景值；正文通过原生 Toast 的 `appLogoOverride` 显式设置 256×256 Logo，绕过当前 `notify-rust` Windows 适配忽略普通图标参数的问题。复用已锁定的 `tauri-winrt-notification`，仅增加 Windows 直接依赖，没有引入新依赖版本。
- 原身份在更新有效 PNG 后仍显示空白顶部图标；同一注册代码和图标用于临时新身份时，用户确认顶部图标显示，定位为原身份资产缓存。正式通知改用从应用标识派生的固定 `<应用标识>.notifications`，保留 Maa Verge 显示名，不随版本变化；应用内偏好保留，Windows 系统开关按新身份管理。临时诊断通知历史、身份注册及探针文件已清理，没有删除原身份或用户通知历史。
- Windows/Linux 将内嵌 Logo 原子写入本地应用数据目录，以内容标识保留独立文件，避免开发、便携包、安装更新、切换配置及退出后丢失图标；Windows Toast 路径转义 `%` 和 `#`，Linux 显式传入 PNG，macOS 继续使用应用包图标。说明见[系统通知](notifications.md)。
- Windows 最终验证：`cargo check --offline`、通知契约回归 **2/2** 通过；固定通知身份调整后 `node tools/check-native.mjs --required` 复验通过，包含 Rust fmt、严格 locked Clippy 和单测 **61 通过、3 项既有忽略**。用户在重建后的正式程序中发送固定测试通知，确认顶部图标、正文图标和中文均正常；没有把注册表检查或临时诊断结果代替最终呈现验收。用户按 Escape 停止 Computer Use 后未继续操作界面，后续诊断使用独立本地原生探针，最终程序内测试由用户完成。未新增外观断言测试；macOS/Linux 本次原生构建及实际通知仍待对应宿主验收。

## 本次通知修复（Windows x64，2026-10-30）

- 系统发送者显式使用 Maa Verge 应用身份：Windows 注册当前用户 AppUserModelId，Linux 固定应用名，macOS 使用自身应用包标识。未打包的 macOS 开发程序不能取得自身身份时报告错误，不再借用 Terminal。
- 连接通知只接受任务表明确目标的启动失败：本地模拟器端口不可达、当前无其他占用时，由服务发送按请求和目标去重的专用事件。后台重连、自动发现、一般设备故障、远程设备、定时准备及参数验证失败保持静默。前端将已知离线目标交由同一业务门禁判断；不会启动其他实例替代目标。
- 退出开始后停止新通知，异步投递和固定测试通知在发送前再次检查退出状态，覆盖正常退出与更新退出。通知偏好文案和[系统通知说明](notifications.md)同步更新。
- 隔离后端回归 **5/5**，覆盖明确目标、重复请求、远程/可达/探测异常、背景错误、更新/定时占用及退出/重连迟到结果；Windows Rust 严格 Clippy 通过，单测 **62 通过、3 项既有忽略**；Edge 通知设置功能 **4/4**、桌面类型检查通过。未实际发送系统通知或写入测试身份注册表；macOS/Linux 实际发送待对应宿主验收。

## 本次组件目录、配置切换与系统通知（Windows x64，2026-10-29）

- Windows EXE 与完整 ZIP 的离线组件直接放在程序同级 `MaaCore/generations/`、`MaaResource/generations/`，首启验证后登记为已下载完成的普通版本；不再复制成第二份，也不改写原有 generation 清单。已有活动、待生效及自定义目录保持原引用；后续更新可复用同版本本地快照，损坏内容回退正常下载。安装版本纳入原有三代保留、回滚及 worker 引用保护，旧 `runtime/bundled-components` 布局继续兼容导入。
- “设置 → 数据与诊断 → 配置文件”提供真实配置目录、业务库及选择器位置，支持打开目录、保存下次启动目录、恢复默认和放弃草稿。独立 `config-location.json` 采用原子写入与统一读写大小限制；本次启动的数据根固定供服务、调度及应用更新缓存共用，重启才切换，不自动搬移或覆盖用户数据。保留显式环境/启动参数优先级与共享设备锁；Windows 切根后的旧唤醒任务按同程序和旧根精确清理，失败留待重试，陈旧唤醒不会重新打开已切走的配置。
- “设置 → 通知与远控”接入 Windows、macOS、Linux 系统通知，支持总开关、执行结果/设备异常/更新/定时四类偏好、通道状态和固定测试通知。偏好保存后立即生效并持久化；宿主只处理实时终态与异常，过滤普通进度、历史快照和重复提醒，通知发送前再核对开关。默认补齐旧配置，旧客户端保存其他偏好时保留通知设置。详见[系统通知](notifications.md)。
- Windows x64 验证：`node tools/check.mjs --app` 通过（工程脚本 **81 通过、2 项平台跳过**，契约 **43/43**，四工作区类型及生成同步）；固定 Bun 完整运行时 **1,556 通过、2 项平台跳过、0 失败**；Rust fmt、严格 locked clippy 及单测 **59 通过、3 项按规则忽略**。Windows 组件构建、NSIS 编译/执行和完整 ZIP 往返夹具 **25/25**，Edge 配置/更新/生命周期 **40/40**、通知 **4/4**，前端生产构建通过。重新构建自包含运行时后，真实 Rust → Bun → C++ 设备租约隔离冒烟通过。
- 新增测试仅验证功能、协议、文件与持久化行为，没有新增外观断言。验证使用隔离数据、合成核心/设备及桌面桥，没有连接真实游戏、下载真实组件、发出系统通知或发布安装包；macOS/Linux 的本次原生构建、实际系统通知投递和三平台人工安装/升级仍待对应宿主验收。

## 本次 CI 界面断言精简（Windows x64，2026-10-29）

- 按用户要求清理 12 个界面测试文件中的低价值检查，断言调用净减少 **39 处**，全部 **303 个测试用例**保留。删除缓存卡片和按钮的完整矩形相等、搜索跨视口的坐标与命中点采样、窗口控件固定 57/56/138px、弹窗固定 390×844、标签角落位置、头像高度与边框颜色、状态背景颜色、动画名称/数量等实现细节断言；对应的字体等待和几何轮询一并移除。
- 搜索在桌面和窄窗实际点击结果并检查导航与查询传递；缓存保留旧结果可见、请求去重、失败重试及队列可用性；更新提示改为明确可见性验证。菜单选择与键盘操作、抽屉焦点和滚动恢复、退出去重、保存恢复、版本签名、数据及运行时边界检查继续保留，界面视觉由截图核对。
- Windows Edge 分组定向累计 **107 次执行通过**（含重复）：缓存/下拉菜单两文件三轮 **51/51**，工作台四项三轮 **12/12**，通知/抽屉/退出/作业中心专项 **7/7**，更新/窗口/执行/作业/工具箱六文件 **37/37**。`node tools/check.mjs --app` 通过，包含工程脚本 **81 通过、2 条件跳过**、契约 **39/39**、四工作区类型及生成产物同步检查。修改范围 Prettier、差异空白与用例清单检查通过；没有修改产品代码或删去测试用例。远端 Checks 结果继续在发行记录中更新。
- 精简后提交 `f4d636842bb8b0a26bb7dc12e3d2e2e6ba33c842` 的 [Checks 五项任务](https://github.com/DeathofBrain/maa-verge/actions/runs/40846673948)全部通过，Linux Chromium **303/303**，工程脚本 **82 通过、1 条件跳过**、契约 **39/39**；四宿主 CTest 各 **4/4**，Windows 运行时 **1,549 通过、2 跳过**、Rust **45 通过、3 忽略**、打包 **25/25**，Linux 与两种 macOS 运行时各 **1,542 通过、9 跳过**、Rust 各 **42 通过、2 忽略**，Linux 打包 **5/5**、macOS 各 **1/1**。全部已执行检查零失败。

## 本次 v0.1.3-alpha.1 预览版发行（2026-10-29）

- 按用户指定版本将根包、桌面、服务、契约、Agent、Tauri 与 Cargo 应用版本统一为 `0.1.3-alpha.1`，独立运行时、组件、协议及数据版本保持原值。公开基线为 v0.1.2；此前的 v0.1.3-alpha1 没有标签或 Release，不作为已发布版本处理，历史验证记录保留原名称。
- 发行说明按项目模板整理为 `docs/releases/v0.1.3-alpha.1.md`，覆盖 v0.1.2 之后最终有效的用户功能、安装与迁移、已知限制、精确运行时来源及上游署名；更新使用文档中的本次发行名称。公开发布后 README 保留 v0.1.2 正式版安装与操作基线，补充预览版入口、Windows EXE/完整 ZIP、macOS 15、任务中心与下载更新差异，使用文档固定到本版标签，保留品牌、Logo 来源及 Agent 暂不可用说明。
- 发布前检查发现上一提交的 Windows Checks 在首启生命周期夹具中因 NTFS 短路径规范化失败，改用 `realpathSync.native` 创建与异步校验一致的临时根；application 的下拉菜单测试在首次自动保存替换编辑器时发生竞态，增加明确的「已保存」状态等待，保留所有菜单行为断言。
- Windows x64 上分别执行 `node tools/check.mjs --app` 与 `--native`，均通过：工程脚本 **81 通过、2 项平台条件跳过**、契约 **39/39**、四工作区类型及生成产物同步、C++ CTest **4/4**、固定 Bun 运行时 **1,549 通过、2 项平台条件跳过**、Rust fmt / 严格 locked clippy / 单测（**45 通过、3 忽略**）及 Windows 打包夹具 **25/25**。发行版本、签名资产、Checks 门禁和 RPM 映射专项 **34/34** 通过，Cargo locked metadata 与版本一致性核对通过。
- Windows Edge 下拉菜单专项三轮 **21/21**、全量界面 **303/303** 通过；核对菜单和任务详情浅色 1440×900、深色 1280×800、浅/深色 390×844 共八张截图，未发现溢出或底栏遮挡。产物保存在忽略目录 `test-results/release-select-fixed-20261029` 与 `test-results/release-select-full-20261029`。测试均使用隔离数据与合成设备，没有连接真实模拟器或游戏。
- 首轮候选提交 `352169476685c5f39144dbda37d474091ce9e50d` 的 [Checks 五项任务](https://github.com/DeathofBrain/maa-verge/actions/runs/40835623202)全部通过：Linux application 工程脚本 **82 通过、1 条件跳过**、契约 **39/39**、Chromium **303/303**；四宿主 CTest 各 **4/4**。Windows 运行时 **1,549 通过、2 条件跳过**，Linux 与两种 macOS 架构各 **1,542 通过、9 个 Windows 专用夹具跳过**；Rust Windows **45 通过、3 忽略**，其他宿主各 **42 通过、2 忽略**。Windows **25**、Linux **5**、macOS 各 **1** 项宿主打包夹具均通过。
- [首轮签名发行流程](https://github.com/DeathofBrain/maa-verge/actions/runs/40837289617)中 Linux 安装包构建成功，但干净容器冒烟在随附组件后台初始化期间直接断言缺失设备，收到正常的 `-32021` 门禁而失败。该夹具现保留结构化 RPC 错误，首次启动与重启均复用现有的有界启动等待，再严格校验缺失设备 `-32004` 和零运行记录；未修改产品门禁或降低断言。相关启动等待与清理回归 **8/8**、脚本语法和修改范围格式检查通过。
- 首轮失败时没有本版 Release、草稿或公开资产；修复提交仍需重新通过完整 Checks，再更新未发行候选标签并重建。公开状态、草稿附件和安装包冒烟验证完成前不记为已发布；自动检查不代替真实游戏、最低系统与人工升级验收。
- Linux 修复在本地 Docker 的原始 Ubuntu 22.04 镜像中补充验证通过：固定 Bun 1.4.3 跨编译 Linux x64 服务，Ubuntu GCC 11 编译真实 C++ worker，仅调整隔离输出路径；新的运行容器保持无 Python/Node/Bun、空 PATH、禁网，首启、设置/计划持久化、缺失设备拒绝及 EOF 重启全部通过。未构建本地 Linux GUI、连接真实设备或改变主 checkout 的 `dist` / `build`。
- Linux 夹具修复提交 `aa11386facb77a126c3cda8f790824eefbb93e87` 的 [Checks 首次运行](https://github.com/DeathofBrain/maa-verge/actions/runs/40839378308/attempts/1)四宿主原生均通过，application 界面为 **301/303**。失败 trace 证明作业卡片在 Noto Sans SC 的「娅」字形分片加载前后测量而相差 1px，搜索框则因两次独立测量跨过视口布局更新而差 29px；同帧截图与原子测量均对齐。分别补充字体就绪等待、视口生效等待和同帧尺寸读取，保留严格尺寸相等、1px 左沿容差、视口边界及无溢出断言，未修改产品 CSS。
- 两项界面夹具修正的 Windows Edge 验证：搜索原用例五轮 **4/5**、诊断副本十轮 **8/10**，修复后十轮 **10/10**；作业缓存原用例十轮 **10/10**，修复后十轮 **10/10**、完整文件两轮 **20/20**。保留首次失败与成功产物，不把定向复验描述为完整回归一次通过。
- 同一 `aa11386` 提交的 application 补跑为 **302/303**，仍复现搜索坐标竞态；`4a7db65` 在 Windows Edge 完整 **303/303**，但 [Linux Checks](https://github.com/DeathofBrain/maa-verge/actions/runs/40843222431) 为 **302/303**，在视口宽度更新后、响应式布局完成前读到 424px 右沿。用户随后要求删除无用断言，故不再叠加几何等待，按上节精简后重新通过全部检查。
- 发布前确认本版没有 Release、草稿或公开资产，首轮发行运行已结束，使用旧标签对象作为 lease 将未发行候选标签从首轮提交更新至 `f4d6368`；[最终四宿主发行流程](https://github.com/DeathofBrain/maa-verge/actions/runs/40848712734)的版本/Checks 门禁及四宿主签名构建全部成功。Windows 包内运行时、真实 Rust → TypeScript → C++ 传输及离线组件首启/重启冒烟通过；Linux 签名安装包及原始 Ubuntu 22.04 干净后端冒烟通过；两种 macOS 的 DMG 完整性、安装后 bundle 签名、更新归档签名与一致性、实际窗口/服务启动和原生退出清理均通过。
- 最终流程仅在上传后的草稿元数据查询失败：按标签的 REST 端点不返回草稿，触发清理删除了本次临时草稿与附件，标签保持 `f4d6368`。工作流现改为分页列出 Release、精确匹配标签，再按数值 REST release ID 查询；两处重复发行门禁也覆盖草稿，并修正 skill 对正常 `untagged-*` 草稿 URL 的说明。既有发布门禁/资产/签名工具专项 **29/29**、YAML / JavaScript / Bash 语法、Prettier 和差异空白检查通过。
- 四宿主已验证的原始签名 Actions 附件已下载到隔离的忽略目录，使用现有发行工具校验六份签名与版本绑定，重新生成更新清单和 SHA-256 清单，共 **17 项附件**；未重建安装包或再次移动标签。确认无同标签 Release 后，以 `--verify-tag --draft --prerelease` 创建草稿并上传，按数值 REST ID 验证附件齐备、16 条摘要与所有上传资产的 REST digest 一致、四平台更新 URL/签名和正文一致，再按用户已有授权公开发布。
- [v0.1.3-alpha.1 Release](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.3-alpha.1) 已公开，`draft=false`、`prerelease=true`，发布后重新下载清单与签名复核通过，匿名 REST 查询可见，`releases/latest` 仍为 v0.1.2。标签固定在完整提交 `f4d636842bb8b0a26bb7dc12e3d2e2e6ba33c842`，其 Checks 五项及四宿主签名构建均成功；最终 Actions 运行整体仍显示失败，原因是上文的旧草稿查询，不能将手工恢复发布写成整次工作流通过。复核证据与下载保存在忽略的 `.tools/release-v0.1.3-alpha.1/`。
- 验证边界：Windows 本轮未做全新机器的 GUI 安装/升级验收；Linux 干净环境验证覆盖后端，不等同完整桌面安装；macOS 采用 ad-hoc 签名，未通过 Developer ID、公证或真实首次下载的 Gatekeeper 验收。全部自动验证均未连接真实游戏或设备、未调用付费模型；最低系统、真实游戏与手工升级仍需分别验收。

## 本次分组提交前集成验证（Windows x64，2026-10-29）

- 按运行时清理、契约、下拉菜单、社区作业、下载速度、设备连接与历史管理、任务批量操作、底栏运行面板、抽屉动画、测试修复和开发规范分别整理提交，保留共享工作区现有改动。分段暂存后复核各提交的代码位置、接口依赖及相对导入，最终源码与拆分前快照一致，仅额外修正五处设备选择提示，使其与底栏位置一致。
- 完整 `pnpm check` 通过：工程测试 **72 通过、2 条件跳过**，契约 **39/39**、四工作区 TypeScript、固定 Bun 独立探针、原生构建脚本 **3 通过、1 条件跳过**、C++ CTest **4/4**、运行时 **1,549 通过、2 条件跳过**、Rust fmt / 严格 locked clippy / 单测（**45 通过、3 忽略**）及 Windows 打包夹具 **25/25**。新增构建冒烟回归后再运行 `pnpm check:app`，工程测试为 **80 通过、2 条件跳过**，契约、类型和生成产物同步检查均通过。
- Edge 新增界面专项 **43/43**、全量界面 **303/303**、底栏提示修正后的画面 / 识别 / 工作台回归 **45/45** 通过；桌面 TypeScript 与 Vite 生产构建通过。已核对 10 张合成界面截图，覆盖 1440×900 浅色、1280×800 深色及浅 / 深色 390×844 的抽屉、下拉菜单、关卡补全、社区排序和批量删除，没有发现布局溢出或菜单遮挡。
- 本轮日志及截图保存在忽略目录 `test-results/commit-*-20261029*`；产品知识由文档重新生成。验证使用隔离数据、端口及合成 IPC / worker / 网络，没有连接真实模拟器或游戏、调用付费模型或发布版本；macOS/Linux 与原生 WebView 本轮未验证。

## 本次构建冒烟启动与清理修复（Windows x64，2026-10-29）

- 复现 `pnpm build` 在 `maaverge-package-smoke-*` 临时目录清理时报 `EPERM`：失败路径终止子进程后立即删目录，Windows 尚未释放工作目录或数据库句柄；清理异常同时覆盖了原始断言失败。
- 原始失败来自合法的异步启动门禁：随附组件初始化尚未结束时，缺失设备请求先返回准备中的 `-32021`。冒烟在首启及重启后使用缺少必需参数的 `run.start({})` 等待初始化，仅对明确的准备消息限时重试，完成后严格要求参数校验 `-32602`，保留原有缺失设备 `-32004` 与零运行记录断言。
- 清理先等待所有自有子进程的 `close`，再有限重试删除本次直接创建的临时目录；关闭或协议失败立即清空请求计时器，删除失败与原始故障同时保留。新增 Node 行为回归 **8/8** 通过，覆盖启动等待、其他错误立即失败、超时、真实合成子进程工作目录清理及无关进程、文件与目录范围保护，并接入工程检查。
- Windows 完整 `pnpm build` 通过，生成 NSIS 安装器与完整 ZIP，包含固定 Node/Bun 包内冒烟、Rust 桌面传输冒烟、随附组件离线首次准备与重启，以及安装器夹具 **9/9**。离线组件检查确认核心与资源已启用、零设备及零 HTTP 请求；前置冒烟覆盖回环下载、摘要拒绝、取消、持久化重启、合成更新作业和 C++ 设备租约。
- `pnpm check:app` 通过：工程测试 **80 通过、2 项平台条件跳过**，契约 **39/39**、四工作区类型检查及契约/知识生成同步通过；修改范围 Prettier 与差异空白检查通过。使用隔离数据及已有缓存的官方组件本地验证，未连接真实模拟器或游戏；实际安装与 macOS/Linux 本轮未验证。

## 本次跨平台历史模拟器自动重连（Windows x64 合成验证，2026-10-29）

- Windows、macOS、Linux 共用 TypeScript 连接机制：自动连接开启且核心可用时，零在线设备也保持 `host:track-devices` 订阅；历史本机目标及已保存本机实例每 2 秒使用 TCP 检查端口，200ms 超时、并发上限 4。轻量检查不创建子进程、不枚举模拟器进程；端口就绪后才按实例配置注册 ADB 传输，确认 `device` 状态后建立核心连接。自定义远程 ADB server 不使用本机端口结果推断远端状态。
- 事件、端口检查及原有低频发现共用逐目标去重、最多 2 个后台连接和 2/4/8/16/30 秒退避；最终异步连接失败、超时、退出均纳入重试，租约占用快速失败并等待 30 秒。陈旧端口结果及重复订阅快照不能突破退避；旧 worker 退出后才允许替代。其他设备执行不阻止目标重连，组件准备、更新、切换和退出仍受门禁保护。
- 保留手动清单、新设备低频发现、历史设备 ID 与实例配置；手动断开和删除立即抑制连接，已核实地址别名或 PID 变化不能解除抑制。配置变更会取消该目标旧连接，编辑其他实例不取消当前连接；退出取消并等待探测和连接作业，迟到结果不写关闭的数据库。自动恢复不启动游戏或重放任务。RPC、Schema、数据库及界面设置未变更，使用说明见 [模拟器自动连接](emulator-connection.md)。
- 新增重连专项 **29/29**、ADB 传输专项 **25/25** 通过；`pnpm check:app` 通过，固定 Bun 完整运行时 **1,549 通过、2 项 Windows 平台条件跳过、0 失败**。修改范围 Prettier 与差异空白检查通过；测试使用隔离数据、合成 worker、替代 ADB 和回环协议服务，没有连接真实模拟器或游戏。新增测试由现有三平台运行时 CI 矩阵统一执行，本轮未运行远端 CI，macOS/Linux 宿主及真实启动/关闭/重启仍待分别验收。

## 本次任务抽屉闪烁修复（Windows x64，2026-10-29）

- 将作业站详情的入场过渡抽为共享 `drawer-motion.css`，供任务表详情、设备连接设置、设备日志及作业详情使用。任务详情不再从完全透明开始，避免先露出背景再覆盖；连接设置同步使用平滑入场，日志统一位移。减少动态效果时禁用动画，底栏嵌入日志不执行侧向入场。
- 新增 Windows Edge 专项 **6/6** 通过：暂停动画检查三类任务抽屉的首帧可见，核对背景 DOM、位置及列表滚动保持、嵌套抽屉关闭后的焦点恢复，以及减少动态效果和底栏嵌入模式。四工作区 TypeScript、前端生产构建、修改范围的 Prettier 和差异空白检查通过；使用隔离端口 `15593` 执行 `pnpm exec playwright test --workers=4 --reporter=line --output=test-results/task-drawer-full-20261029`，完整界面回归 **303/303** 通过。
- 已检查 1440×900 浅色、1280×800 深色及浅/深色 390×844 的任务详情、连接设置和日志共 12 张截图，未发现页面横向溢出；专项产物保存在忽略的 `test-results/task-drawer-targeted-final/`。
- 完整 `pnpm check` 首次在并行新增的 `services/backend/tests/automatic-reconnection.test.ts:347` 遇到 TS2698 而中止；该并行任务修正后，本次补跑 `pnpm -r check` 四工作区类型检查通过，未重新运行完整工程检查。本次未修改后端。测试仅使用隔离数据与合成 IPC，未连接真实设备；原生 WebView、macOS/Linux 未验证。

## 本次历史离线设备删除（Windows x64，2026-10-29）

- 任务页执行监控的设备卡右侧增加三点菜单，与右键共用「删除历史设备」入口；勾选离线设备后可直接「批量删除」，搜索隐藏的已选设备仍计入操作。混选在线设备时禁用批量删除并说明原因；请求期间阻止重复提交，失败保留卡片与选择，成功清理选择和已展开设备。
- 新增类型化 `device.delete({ deviceIds }) → { deletedDeviceIds }`，参数由权威 Schema 生成校验器。后端对整批设备同步检查连接、worker、运行、启动、定时预留、点击和组件切换占用，再事务删除离线设备记录；任一设备不符合条件时整批拒绝，重复删除不存在的记录保持幂等。连接失败或明确断线后先完整关闭 worker、释放映射，再允许删除历史设备，关闭期间继续阻止删除。
- 历史设备与实例配置独立：删除不清理实例配置、任务表/定时绑定、执行、日志或识别历史；执行记录仍可打开详情。当前会话跳过被删设备的后台自动重连，显式重新连接后恢复设备卡；保留的定时绑定需要先恢复设备连接才能再次执行。
- Windows Edge 新增专项 **8/8**、既有执行监控/设备管理/多开/工作台/执行页 **61/61**、后端删除专项 **21/21** 通过；相关后端六文件 **95 通过、1 条件跳过**。契约 **39/39**、契约/产品知识同步、桌面生产构建、C++ CTest **4/4**、Rust fmt/严格 locked clippy/测试（**45 通过、3 条件跳过**）及 Windows 打包夹具 **25/25** 通过。
- `pnpm check` 首次完整运行时为 **1,489 通过、2 跳过、2 失败**；失败的 Agent tracing 与代理断流两文件单独复跑 **23/23** 通过。本轮最后一次完整运行时为 **1,534 通过、2 跳过、2 失败**，失败位于并行新增的自动重连回退及动态 PID 重试夹具；该任务修正夹具后，两文件复跑 **25 通过、1 条件跳过**。中途后端类型检查被并行 `automatic-reconnection.test.ts` 的 TS2698 阻断，随后最终四工作区 TypeScript 检查通过，本任务未修改该文件。完整 Edge 界面回归 **296 通过、1 失败**，唯一失败为作业干员卡片等待显示，原用例串行复跑 **1/1** 通过；不把单项复跑描述为全量一次通过。
- 已检查 1440×900 浅色、1280×800 深色及浅/深色 390×844 的批量操作栏与三点菜单截图，无页面横向溢出；最终专项、全量及失败复跑产物分别保存在忽略目录 `test-results/history-device-deletion-complete/`、`test-results/history-device-full/`、`test-results/history-device-full-retry/`，运行时日志为 `test-results/history-device-runtime.log`。测试仅使用隔离数据及合成 IPC/worker，未连接真实设备或游戏；macOS/Linux 与原生 WebView 未验证。

## 本次社区作业排序（Windows x64，2026-10-29）

- 作业站的社区搜索增加「热度、最新、访问量」图标按钮，默认热度。切换排序回到第一页并保留关键词与关卡；排序条件随页面导航保留，各排序及分页独立缓存，迟到响应不覆盖当前选择。社区作业集沿用原查询。
- 权威 Schema 新增可选 `copilot.search.orderBy`，使用 PRTS Plus 的 `hot`、`id`、`views` 降序查询，省略时使用 `hot`；已重新生成类型、独立校验器及产品知识，并同步作业中心文档。无效排序在访问社区前拒绝。
- Windows Edge 新增排序专项 **5/5**、后端作业库/关卡/排序定向 **77/77**、契约 **39/39** 通过，桌面生产构建通过。已检查 1440×900 浅色、1280×800 深色、390×844 浅/深四张夹具截图，按钮完整可见、无页面横向溢出；专项产物保存在忽略的 `test-results/community-sort-targeted/`，最终排序复验在 `test-results/community-sort-final/`。
- 受影响界面定向首轮 **91/92**，全量界面首轮 **291/296**；失败涉及初始化、导航及自动保存时序。保留首次产物后，将六个不同的失败用例以单 worker 复跑，**6/6** 通过，未修改断言或延长超时。首次高并发期间记录到浏览器 `ERR_INSUFFICIENT_RESOURCES`，自动保存用例两次编辑间隔超过 600ms；相关产物分别在 `test-results/community-sort-related/`、`community-sort-full/`、`community-sort-rerun/`，不将首次全量报告为通过。
- 工程脚本 **72 通过 / 2 条件跳过**、契约及知识生成同步、Rust fmt/严格 locked clippy 与单测 **45 通过 / 3 忽略**、Windows 打包夹具 **25/25** 通过。首次 C++ 编译因 MSBuild 内存不足失败，降低并发后构建及 CTest **4/4** 通过。当前共享工作区的完整运行时最终为 **1,528 通过 / 2 条件跳过 / 8 失败**，集中于自动连接；最终四工作区类型检查的 contracts/desktop/agent 通过，backend 在 `tests/automatic-reconnection.test.ts:372` 报 TS2698。本次未改动该连接模块，完整 `pnpm check` 尚未通过，连接回归及类型错误待对应任务排查。
- 本轮仅使用隔离数据与合成 IPC/社区响应，未连接真实设备、操作游戏或调用模型；macOS/Linux 与原生 WebView 未验证。

## 本次任务表批量操作（Windows x64，2026-10-29）

- 勾选任务表后显示选择数量及「同时执行」「批量删除」「取消选择」；筛选隐藏的已选表仍计入本次操作。执行复用既有并行启动流程，绑定设备固定使用，未绑定表逐行选择；同设备重复目标、离线、忙碌、工具占用及无启用任务会阻止提交。已选设备中途不可用时可取消该设备，再启动其余设备。
- 批量删除先列出所选表并确认，任一所选表正在执行时阻止整批删除。删除沿用逐表保存顺序，只清理成功项的草稿和选择，保留执行历史；失败项保留具体错误与草稿，重试仅处理失败项。
- Windows Edge 新增专项 **11/11**、既有任务中心/删除/多开定向 **12/12** 通过；`pnpm check` 通过，包含四工作区类型检查、契约、C++ CTest **4/4**、固定 Bun **1,465 通过 / 2 条件跳过**、Rust 与 Windows 打包夹具。前端生产构建及修改范围的 Prettier/差异空白检查通过；最终使用隔离端口 `15583` 执行 `pnpm exec playwright test --workers=4 --reporter=line --output=test-results/task-batch-full`，全量界面回归 **284/284** 通过。
- 已检查浅色 1440×900、深色 1280×800 和浅/深色 390×844 的选择操作栏、运行弹窗及删除确认截图，无页面横向溢出。专项产物保存在忽略的 `test-results/task-batch-final/`，全量产物在 `test-results/task-batch-full/`；本次仅使用隔离的合成 IPC/原生夹具，未连接真实设备、操作游戏或调用模型。macOS/Linux 与原生 WebView 未验证。

## 本次版本号管理 skill（Windows x64，2026-10-29）

- 新增 [maa-verge-versioning](../.skill/maa-verge-versioning/SKILL.md)，依据 SemVer 2.0.0 中文规范管理兼容性分级、`0.y.z`、预发布排序、应用版本文件同步及发行检查边界；区分标准允许的构建信息与当前项目不接受 `+build` 的发行标签约定，保留应用、核心、资源、协议和数据版本的独立性。`AGENTS.md` 已添加任务入口。
- Windows x64 上通过 skill-creator 结构校验、20 处本地链接检查及修改范围的 Prettier 检查；本次仅维护开发指导，未修改应用版本或执行构建、真实设备和发行验收。

## 本次下拉框样式统一（Windows x64，2026-10-29）

- 42 处普通下拉框接入共享 `Select`，覆盖作业设备筛选、任务参数、连接设置、更新频道、工具箱、定时与画面刷新频率。触发框与展开菜单统一主题色、圆角、边框、阴影、柔和焦点环、悬停及选中勾；底栏设备选择和作业关卡候选菜单同步对齐视觉。
- 保留原生单选表单控件的标签、值、禁用及 change 行为；自绘菜单支持分组、禁用选项、长列表滚动、方向键、Home/End、连续输入定位、Enter/Space、F4、Escape、Tab 与外部点击。菜单按可用空间向上或向下展开并限制视口边界；抽屉内第一次 Escape 只关闭菜单。
- Windows Edge 新增专项 **7/7**、既有关卡/下载代理/游戏提醒定向 **9/9** 通过；四工作区 TypeScript 与前端生产构建通过。已检查浅色 1440×900、深色 1280×800、浅/深色 390×844 的最终菜单截图，未发现横向溢出或裁切。最终专项产物在 `test-results/select-final`；全量界面回归的 `.last-run.json` 为 `passed` 且无失败项，但 PowerShell 重定向将 stderr 的色彩环境警告视为 `NativeCommandError`，包装命令返回 1，未保留完整控制台日志。
- `pnpm check` 已执行：工程、契约、四工作区类型检查及 CTest **4/4** 完成；运行时 **1,420 通过、2 跳过、7 失败**，失败集中于后端 stdio 生命周期，因而未执行后续 Rust/安装器检查。同一生命周期文件单独重跑为 **9 通过、1 跳过**，全量失败原因尚未确认，本次不修改后端。测试仅使用隔离数据和合成 IPC/原生夹具，未连接真实设备；macOS/Linux 与原生 WebView 的下拉菜单仍待对应宿主验证。

## 本次模拟器关闭后的设备状态修复（Windows x64，2026-10-29）

- 修复空闲设备仅依赖 MaaCore 断线回调、关闭模拟器后仍显示“就绪”的问题。应用服务通过现有 ADB server 的 `host:track-devices` 接收设备状态变化；所有已连接设备共用一条被动订阅，不定时查询设备、不创建探测子进程，关闭自动连接后仍监听。没有在线设备时关闭订阅；订阅异常时延迟重建，不能据此推断全部设备已离线。
- 收到设备移除、离线或未授权状态后更新快照与设备事件，清除截图协议及预览、关闭旧 worker 并释放设备租约。正在执行的任务记录失败及结果未知，不自动重放；重连、客户端/组件切换和退出后的迟到通知不能改写新连接。
- 被动协议专项 **29/29**、设备状态与生命周期专项 **9/9**、四工作区 TypeScript 检查通过；固定 Bun 完整运行时回归 **1,465 通过、2 项 Windows 平台条件跳过、0 失败**。测试只使用隔离数据、合成 worker 和回环 ADB 协议服务；本次未连接真实模拟器或游戏，真实关闭/重启行为及 macOS/Linux 仍需对应环境验收。

## 本次执行监控与底栏整理（Windows x64，2026-10-29）

- 删除所选设备头部“查看此设备日志”及执行详情头部“返回任务设置／查看日志／停止执行”三个重复按钮；设备卡、批量操作和底栏保留日志与停止入口。再次点击当前设备取消选择并收起下方详情，快照刷新保持收起；重新展开回到当前执行，不残留历史选择。
- 底栏运行详情、日志、画面与多开执行改为向上展开的非模态面板，保留当前页面并可直接切换底栏设备。进度、日志、画面与停止操作严格跟随所选设备；空闲设备不借用其他设备的执行，离线设备不提供活动停止入口，上次执行有明确提示。
- 设备选择器移到底栏最左侧，使用统一圆角、边框、悬停与选中样式，菜单向上展开，仅显示名称和地址；支持方向键、首尾项、确认、退出与焦点恢复。搜索框移到顶栏左侧，结果弹层与搜索框左对齐、保持在页面和底部面板上方，并限制窄窗宽度。
- `tools/clean-codex-worktrees.py` 按用户要求单独保留；本次未执行实际工作树清理。
- Windows Edge 定向界面回归 **108/108** 通过，覆盖执行监控、执行详情、工作台、多开、画面、设备管理、设备连接、主页设备信息、窗口控件、作业中心和任务中心；桌面 TypeScript、前端 Vite 生产构建、修改范围的 Prettier 与差异空白检查通过。已检查设备菜单、监控详情、底部面板浅色／深色／390px 窄窗及搜索弹层桌面／窄窗截图。
- 使用隔离端口 `15573` 与 `test-results/ui-dock-refresh-20261029` 保存本轮产物，避免共享默认输出目录被其他并行验证清理；搜索专项禁用过渡动画后复跑 **1/1** 通过，稳定截图保存在 `test-results/ui-dock-search-stable-20261029`。测试仅使用合成 IPC，不连接真实设备；macOS/Linux、原生 WebView、安装包及完整工程检查本轮未验证。

## 本次下载速度显示（Windows x64，2026-10-29）

- 更新页与右上角通知显示 Maa Verge 应用、MaaCore 和游戏资源的实际下载速度，自动换算 B/s、KB/s、MB/s 与 GB/s。百分比不变及总大小未知时继续刷新，停滞显示 0 B/s；续传只计算本次连接新增字节，重连等待、解压、校验、完成及失败后清除速度。
- 权威 Schema 新增可选 `UpdateChannel.downloadSpeedBytesPerSecond`（非负字节/秒），已重新生成类型与独立校验器；应用宿主透传校验速率并允许同百分比更新。MaaCore 自带 resource 按用户确认保留，解压与资源基底流程未调整。
- Windows Edge 合成更新界面回归 **25/25**、Rust 传输专项 **7/7** 通过，包含两处速度、阶段清除与 390px 窄窗检查；桌面和后端 TypeScript、Rust fmt 与严格 locked clippy 通过。下载与组件更新回归 **83 通过、2 项原生夹具条件跳过**，应用下载回归 **64/64** 通过；新增续传、停滞、计时器清理与速率边界回归 **4/4**，契约 **36/36**、四工作区类型检查与前端生产构建通过。最终完整运行时结果见下节。
- 本轮使用隔离数据及合成下载流/浏览器 IPC，未下载真实 MaaCore、连接设备或重建安装器；macOS/Linux 和原生 WebView 的速度显示仍需对应宿主验证。

## 本次移除 Python 参考与工程依赖（Windows x64，2026-10-29）

- 删除旧 `services/runtime` 参考后端、`tests/python`、Python 原生协议测试、`pyproject.toml`、`uv.lock` 和 `.python-version`；开发、构建、测试与 CI 统一使用 Node/Bun、Rust 和 C++ 工具链。桌面移除旧后端启动入口，不受支持的 `MAAVERGE_BACKEND` 明确报错，不自动切换实现。已有数据库兼容、备份、隐式 rowid、请求去重及共享设备租约规则保留。
- 原来调用 Python 的策略、协议与模型对照改为固定期望夹具；stdio CRUD、重启持久化、WAL/备份与双向数据锁互斥改由 Bun 跨进程验证。最终审查补齐 19 类原生任务默认参数的完整输出断言，策略专项 **381/381** 通过。四组原生 CTest 由 Node 驱动，保留全部 **46 项**协议、超时、生命周期与租约测试，锁互斥使用独立 OS 锁探针；Windows 测试启动器隔离 CRT 描述符元数据并约束子进程寿命，测试辅助程序不随产品安装。
- `tools/clean-codex-worktrees.py` 按用户要求作为独立可选工具保留，常规开发与检查不调用它；移除不存在的 Node 清理测试入口。bootstrap、诊断、检查、格式化、编辑器与 CI 移除 Python/uv/Ruff 依赖；Linux CI 的 CMake 改用官方 **3.31.10** 二进制归档及 SHA-256 校验，贡献与开发文档同步更新。
- `node tools/check.mjs --app` 通过：工程测试 **79 通过、2 项平台条件跳过**，契约 **36/36**，契约与知识生成同步、四工作区 TypeScript 均通过。最终 `node tools/test-runtime.mjs` 为 **1,422 通过、2 项 Windows 平台条件跳过、0 失败**；原生构建及 **4/4 CTest** 通过，包含上述全部 46 项。`node tools/check-native.mjs --required` 的 Rust fmt、严格 locked clippy 及单测 **45 通过、3 项按规则忽略、0 失败**；原生构建脚本回归 **3 通过、1 项 Unix 平台跳过**。Node、PowerShell 与 Bash 脚本语法、修改文件格式及差异空白检查通过。
- 仅使用隔离数据、合成核心、回环网络及临时 Git 仓库；未执行真实 worktree 清理、连接设备、操作游戏或调用模型。现有 `.venv`、`.tools` 与缓存保留，未卸载系统 Python；macOS/Linux、Linux CI 镜像重建与完整安装器仍待对应环境验证。

## 本次 CI 失败定位与测试清理（Windows x64，2026-10-29）

- 复核 [Checks 40745831403](https://github.com/DeathofBrain/maa-verge/actions/runs/40745831403)：应用检查失败于干员别名核验与自动连接偏好两项浏览器测试；Windows 和 macOS 双架构均失败于同一首启组件生命周期夹具，Linux 原生检查通过。
- 生命周期夹具统一使用真实临时路径，避免 macOS `/var` 别名与 Windows 短路径触发快照完整性拒绝；产品完整性校验及链接拒绝断言保留。Windows junction 临时根复现修复前失败、修复后通过，生命周期与完整性专项 **37 通过、3 项条件跳过**。
- 干员测试先滚动要求行以触发资源懒读，保留跨客户端身份、歧义名称及请求去重断言；自动连接测试等待异步设置持久化后再重载。合并两项重复界面测试：启动与运行条场景归入执行测试，旧专项分组由任务中心已有的改名与字段保留测试覆盖；独有断言保留。
- 知识生成器按 Markdown 表格首格匹配工具名，兼容 Prettier 列宽空格；既有离线生成回归补充排版后工具身份、来源哈希、缺项报错及失败不改输出检查。
- 当前共享工作区的 `pnpm check:app` 通过，包含知识/契约生成同步、工程测试、四工作区类型检查与 **36 项契约测试**；固定 Bun 完整运行时回归 **1,422 通过、2 项 Windows 平台条件跳过、0 失败**，已采用 TypeScript/C++ 测试链路。
- Edge 全量界面 **260/260**，两个 CI 原失败场景再次串行 **2/2** 通过，浅色、深色及窄窗监控截图已检查。验证只使用隔离数据、合成 IPC 与组件夹具；未重跑远端 CI，macOS/Linux 与原生 WebView 仍待对应宿主验证。

## 本次导航与弹层整理（Windows x64，2026-10-29）

- 执行监控统一为上方选择在线/历史设备、下方查看当前执行；任务表「查看执行」和底部运行详情进入同一设备上下文，包含任务表、作业与工具。离线设备不复用残留 running 记录显示活动控制，空闲不把最近记录当作当前任务；历史查看保留准确记录与最终结果轮询。
- 任务编辑、连接设置、日志、画面与多开使用右侧抽屉；连接设置关闭后恢复任务草稿。删除废弃设备详情抽屉、整页执行切换条、重复底部进度与日志面板。连接设置从设备页完整子页收敛为共用抽屉。
- 弹层统一计数管理 inert、滚动锁与焦点，覆盖乱序卸载、嵌套弹层、StrictMode 和原生 dialog；仅顶层响应 Esc/Tab，关闭后恢复正常点击。迟到的启动/保存/详情响应不覆盖后续导航。
- 首次启动不再等待随附组件完成后才开放服务；快照、编辑立即响应，校验、复制与副本校验在后台进行并通过右上角通知报告进度。组件准备期间连接、任务、工具和定时保持门禁，应用安装等待准备队列排空；失败后解除准备门禁，可正常手动修复。
- `pnpm check:app` 通过：工程与契约检查、四工作区 TypeScript、Python Ruff/mypy 与 **276 项 pytest**；完整运行时 **1,410 通过、9 项条件跳过、0 失败**，另加强的首启真实小组件入口、失败恢复和安装等待回归 **3/3** 通过。Edge 全量界面回归共 **260 项**，首轮 250 项通过，其余 10 项适配新的页面入口后定向全部通过；作业队列与通关证据显示的补充回归通过。桌面 TypeScript 与 Vite 生产构建、Rust fmt、严格 locked clippy 通过，Rust 单元测试 **41 项通过、3 项按规则忽略**。
- 所有浏览器截图、trace 和临时验证结果统一收敛到忽略的 `test-results/` 子目录；本轮仅使用隔离浏览器、合成设备及本地编译，不操作正在运行的真实程序或游戏。原生 WebView、macOS/Linux 桌面仍须分别验收；此次尚未重建、安装或启动包含新界面的完整发行包。

## v0.1.3-alpha.1 预览版发行导航（2026-10-29）

- 预览版的安装包、更新内容、迁移方法与已知限制见 [v0.1.3-alpha.1 Release](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.3-alpha.1) 和[固定标签发行说明](https://github.com/DeathofBrain/maa-verge/blob/v0.1.3-alpha.1/docs/releases/v0.1.3-alpha.1.md)，源码见[对应标签](https://github.com/DeathofBrain/maa-verge/tree/v0.1.3-alpha.1)。最新正式版仍为 v0.1.2。
- 本次 main 仅同步 README、发行导航与状态说明，不包含预览版源码合入。下方实现表、开发文档与既有验证记录继续对应 main 的 0.1.2 源码，不能用来描述预览版的新任务中心、下载器或安装包。
- README 保留 v0.1.2 正式版安装表与操作步骤，另列预览版入口和差异；预览版使用文档固定到其标签，既有 Logo、品牌、Agent 暂不可用和旧截图说明保持不变。本次仅核对文档链接与差异空白，没有启动应用、操作游戏或执行平台安装验收。

## 已实现

| 范围                | 当前行为                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 工程与环境          | pnpm workspace、固定 Bun 1.4.3、CMake/C++20、Cargo/rustup；开发、构建与合成测试统一使用 Node/Bun 和原生工具链，已移除 Python 参考与 uv 依赖；依赖锁、bootstrap、doctor 和贡献说明；多语言格式化配置与 VS Code 保存格式化                                                                                                                                                                                                                                                                                  |
| 界面                | 默认主页状态仪表盘；单一「任务」入口：任务表列表 + 右侧详情抽屉（任务编排/任务表设置/定时计划三页签，详情默认打开任务编排）、勾选任务表后的「运行」（单表多设备、多表按绑定设备）与设备监控页签（在线与历史设备选择/下方执行详情/批量停止/日志抽屉），开始执行不跳转；旧专项表原样读取；作业中心、工具箱、设备、分类设置、Agent 与记录；浅色/深色/跟随系统、侧栏悬停加深与轻量页面/按钮/卡片/运行面板过渡、尊重减少动态效果、窄窗返回路径及常驻运行/日志/停止栏                                           |
| 任务表配置          | 新建日常表按原版九项初始队列及默认值生成，名称自动用“日常表1”等；19类核心任务与应用数据同步任务的常用字段/完整JSON、常驻与活动关卡下拉/手动输入、无人机下拉；保留重复、复制、排序、启停、未知参数和无效草稿；编辑停止 600ms 后自动保存，切页提交有效改动，保存中可继续编辑，失败保留草稿并重试；开始前等待保存当前配置，Agent 提案首次保存仍须确认；按已启用自动作战任务的用药/源石数量汇总上限，旧预算字段只保留兼容                                                                                     |
| 右键菜单            | 任务表支持设置、重命名、复制、导出与确认删除（启用/停用入口已移除）；任务队列支持编辑、启停、排序、复制与删除。设备/发现结果、多开实例、实例执行、设备监控行/执行切换、主页当前与最近执行、历史记录和作业列表复用已有操作，保留运行/连接状态限制；支持菜单键/Shift+F10、方向键、Esc 和视口边缘定位。普通导航/空白处不弹菜单，输入框保留系统文本菜单                                                                                                                                                       |
| 设备页面            | 当前设备、多开管理两个页签与连接设置抽屉；区分已连接、正在连接、本次发现和折叠历史；发现结果可保存实例，逐实例连接/断开/编辑；任务开始唤醒只编辑游戏动作并提供设备设置直达                                                                                                                                                                                                                                                                                                                                |
| 错误提示            | 页面操作、设备/多开、更新、工具和定时共用中文错误转换；明确区分 ADB 不可用、未授权、离线、拒绝连接、超时、核心/资源缺失及磁盘/权限问题，给出处理建议；保留 RPC 错误码和原始详情，原因不足时不推断 ADB 或模拟器未开启                                                                                                                                                                                                                                                                                      |
| 通信与数据          | Tauri → TypeScript/Bun 换行 JSON-RPC；独立 JSON Schema 生成 TypeScript 与预编译校验器；bun:sqlite 保持原库格式、rowid 顺序、事件与请求去重；Python/Bun 使用独立 SQLite 锁库互斥，首次接管 serialize 一致性备份；崩溃后不自动重放未知结果                                                                                                                                                                                                                                                                  |
| 配置保存位置        | 应用设置、设备连接、任务表和执行历史集中保存在程序目录下 `config/native/maaverge.sqlite3`；开发版使用各 checkout 的 `config`，环境变量可覆盖。默认后端首次切换时持源/目标租约导入旧库、历史截图与不可变作业文件，保留旧文件，不覆盖已有新库；设备锁继续跨目录共享，WebView 界面缓存另行管理                                                                                                                                                                                                               |
| 日志与诊断          | 设置中导出含版本、运行环境、实际连接配置、近期运行/事件与服务/核心日志的单个 `.log`，弹窗显示完整保存位置；支持默认 7 天的定期清理与手动清理，保护当前服务和本次会话设备日志，排除业务数据与截图；设备日志抽屉可在显式选择模式中经确认持久删除事件日志；[范围与目录](logging.md)                                                                                                                                                                                                                          |
| 真实运行            | 开发与安装版仅运行 native；设备发现/连接、任务进度、画面/点击及组件更新均来自实际 ADB/MaaCore/官方源，删除产品模拟分支和浏览器自动后备；仅 Agent 保留本地规则提案；确定性夹具只用于自动测试                                                                                                                                                                                                                                                                                                               |
| 原生设备适配        | 从运行进程定位内置 ADB，MuMu/雷电管理器与监听归属枚举多开、去重同实例别名；默认按实例自动配置可用增强截图，保留手动覆盖和独立连接清单；清单自动连接逐项隔离错误；每设备独立 C++20 worker、异步结果与空闲确认、跨数据根共享设备租约；支持同表多设备并行、单独停止与日志隔离；详见 [多开说明](multi-instance.md)及[连接设置](connection-settings.md)                                                                                                                                                        |
| 画面与人工点击      | 底部「画面」显示顶部所选设备；5 / 10 / 15 / 30 / 60 / 90 / 120 Hz 目标刷新频率，默认 60 Hz 并本地保存；请求/解码串行并按绘制节奏调度、Blob 图片及时释放、性能统计每 250ms 更新；暂停、实际显示 FPS 与往返延迟；默认关闭点击，开启后按已显示帧映射坐标、拒绝留白和过期帧；运行中显示核心最近画面并只读，图像不落盘                                                                                                                                                                                         |
| 任务表执行          | 位于「任务 → 执行监控」；上方统一列出在线与历史离线设备，标题旁汇总设备总数与执行中数量，在线设备用绿色已连接标记，下方展示所选设备当前的任务表、作业或独立工具，离线优先显示已离线；显式历史入口保留准确记录，设备筛选、搜索、多选停止与范围日志抽屉保留。任务表和底部「运行详情」统一定位设备，删除重复整页/设备详情抽屉和底部进度面板；日志、连接设置、画面、多开操作使用右侧抽屉。逐任务结果、累计材料、设施反馈、按需截图沿用启动快照；成功仍须任务证据及核心空闲                                    |
| 作业中心            | 宽主区＋独立三类执行队列，右侧详情抽屉保留列表、搜索、分页、位置与焦点；顶部按设备/记录查看结果；本地分类管理、作业集自动归类及整集/整类有序追加队列；普通/突袭声明角标、资源关卡编号和作者回退显示；刚需与备选组同排颜色标签，按需展开最多三位候选，详情完整编组及核验说明；本地 JSON/编号/链接及社区搜索预览导入；不可变版本、重复队列排序/启停、编队助战选项、兼容性检查和独立执行；手动赞踩和默认关闭的确认通关后点赞；普通单次地图导航、显式单份循环编队起点；主页/运行条/历史跳转，旧任务表保留兼容 |
| 工具箱              | 先选设备再检查占用，六类工具使用独立 ToolJob，不创建任务表；仓库/干员持久识别、头像、搜索/持有筛选及多格式导出、公招识别/手动计算、有限补货、数据管理与已审核小游戏；失败保留上次成功数据，确认换号隔离配置并清理结果；按需读取不可变资源图片                                                                                                                                                                                                                                                             |
| Agent 模块          | 独立 `packages/agent` 与可单独核验的 LangChain 提案入口；默认规则提案保持兼容，模型输出复用宿主校验并强制零药石加急；调用次数默认零，远程追踪隐式启用时拒绝；真实模型产品入口尚未接入，见 [模块说明](agent-module.md)                                                                                                                                                                                                                                                                                     |
| MaaCore Agent tools | `packages/agent/tools` 提供 16 个工具、具名后端端口与可选 LangChain 桥接；绑定设备/客户端、具体操作授权、零消耗、快照复核、调用去重及有界结果；产品模型/审批界面未启用，见 [工具说明](agent-tools.md)                                                                                                                                                                                                                                                                                                     |
| Agent 数据集        | 五类公共资源按源哈希增量整理，固定产品 Schema/任务/文档静态知识，ID/别名/关键词查询；成功且核心空闲后的本机识别历史与来源版本、未知字段、换号隔离；提供离线构建命令与四个类型化查询接口，见 [数据集说明](agent-knowledge.md)                                                                                                                                                                                                                                                                              |
| 每日定时            | 任务表内定时编辑与全部汇总；八组以上、本地时区、临时启停、普通忙时跳过、10 秒可取消强制接管、提前连接/通知、同设备冲突与持久去重、不补跑；Windows 默认关闭的提前五分钟唤醒及注册状态，其他平台仅驻留调度                                                                                                                                                                                                                                                                                                  |
| 任务策略            | 19 类非 Debug MaaCore 任务、应用组合 UserDataUpdate 与六种客户端；默认零消耗，新建作战汇报开关与原版一致，旧任务缺字段仍关闭；识别和好友每日访问需专用成功证据及核心空闲；换号隔离周期和设备估算；接口边界见 [功能矩阵](maa-compatibility.md)                                                                                                                                                                                                                                                             |
| 游戏提醒            | 主页和关卡目录共用原 MAA 官方活动日历、条件请求和本地缓存，按客户端/时间/核心版本及资源导航筛选；主页提供游戏日、周一/周日剿灭日历提醒，以及按设备手工校准的基建产出估算；[使用与边界](game-reminders.md)                                                                                                                                                                                                                                                                                                 |
| 首次安装            | 原生模式按所选核心频道自动检查并下载，默认官方稳定版；验证架构对应资产、版本、必需符号与资源加载后启用；核心和基础资源无需手动安装；核心/资源独立下载目录可设置，安装版默认程序同级，开发默认隔离数据根，改路径仅影响后续下载                                                                                                                                                                                                                                                                             |
| 后台下载            | 统一内置 HTTP 流式下载，移除 aria2 的运行、设置与打包依赖；跨页进度、大小与 SHA-256 校验、来源绑定的断点续传；下载代理支持自动、手动及直连，自动代理失败后尝试直连，手动错误明确提示；临时网络中断最多三次尝试，保留分片供重试；[配置与边界](maacore-runtime.md#后台下载与断点续传)                                                                                                                                                                                                                       |
| 核心更新            | 独立正式/预览频道、SemVer 选择与禁止自动降级；改频道取消旧候选并清除旧检查缓存，进行中的组件作业禁止改频道；首装和更新共用选择性安全解压，保留运行库、资源、许可证及合法版本别名，跳过 GUI/.NET/WPF；独立更新作业解压、C++ 隔离校验，不写业务数据库；[提取规则](maacore-runtime.md)                                                                                                                                                                                                                       |
| 应用更新            | Rust/Tauri 从项目 GitHub Releases 选择正式/预览版，默认预览；启动联网检查，手动下载校验并持久化；安装确认可立即停止当前执行、关闭服务并更新重启，或下次启动在服务之前离线恢复安装；失败尝试保留包供手动重试，避免启动循环；Windows NSIS、macOS 双架构、Linux AppImage 各自匹配，MSI/ZIP/DEB/RPM 提示手动更新；频道切换取消旧候选；[平台与发行说明](app-updates.md)                                                                                                                                        |
| 资源更新            | 与核心独立；固定 MaaResource commit，同一提交查询及下载；从当前核心的基础资源重新构建候选，再应用当前完整覆盖快照，记录来源文件、提交、时间与内容哈希；移除上次覆盖的残留并保留基础任务与模型；按客户端展示已安装资源的活动名与更新时间，缺失时不冒用其他客户端活动                                                                                                                                                                                                                                       |
| 更新切换            | 不可变版本目录；新进程校验；等待当前任务边界和异步调用结束后切换工作进程，保留后续任务；失败保留旧组合，可回滚上一组核心/资源；两类组件各保留最多三版，保护活动、回滚、候选和 worker 引用，使用中延后清理                                                                                                                                                                                                                                                                                                 |
| 自动检查            | 应用启动时仅检查；核心启动时及每 24 小时、资源每 6 小时，组件失败五分钟后重试；异步下载、独立更新作业进程与执行轮询互不阻塞；三个开关独立，关闭后支持手动操作                                                                                                                                                                                                                                                                                                                                             |
| 桌面生命周期        | 一体化可拖动顶栏及最小化/最大化/还原/关闭，加载期保留窗口操作；Windows 修正最大化旧画面拉伸、主题同步窗口/WebView 背景；关窗默认询问托盘或退出，可记住并从设置改回每次询问；完全退出显示转圈、异步清理服务，托盘退出共用此流程；单实例，开发与安装版统一 native，拒绝旧 mock 环境配置                                                                                                                                                                                                                     |
| 发行与 CI           | Tauri 携带 Bun 单文件后端、C++ 工作进程及前后端/Rust 运行时依赖许可，已移除 aria2 可执行文件、专用依赖许可和源码归档，无 Python 环境、node_modules 或原生 JS 插件；/MT、Linux 静态 libstdc++/libgcc、MaaCore 动态更新；四宿主 Checks 只做检查、不生成安装包；标签推送或手动补跑复用该提交的 Checks，四宿主签名构建后只创建草稿；Linux 干净容器测试在签名构建后执行；版本对齐与全量签名/清单校验；安装包通过 GitHub Releases 分发，实际结果见下文                                                          |

原生设备路径已实现，尚未通过真实账号的游戏操作验收。单独成功加载核心也不能证明所有关卡或任务语义兼容。

## 平台验证

### 本次社区关卡联想筛选（Windows x64，2026-10-29）

- 社区关卡筛选增加编号前缀候选，使用当前启用资源的完整地图目录，普通/突袭同关卡合并，排除缺地图或编号歧义的条目。新增只读 `copilot.stages` 契约，已重新生成类型、独立校验器及产品知识索引；搜索映射忽略编号和别名的大小写，输入文本保持原样。
- 支持鼠标、上下键和回车选择，Esc/失焦关闭；完整编号直接筛选，未完成前缀保留上次搜索结果，手动关卡可回车或失焦提交。选择或清空筛选回到第一页，仅聚焦后失焦不改变分页。目录失败可继续手填并在重新聚焦时重试，加载中不因失焦提交前缀；资源切换时旧目录响应不会覆盖新目录。
- 候选浮层跟随输入框和页面尺寸定位，窄窗空间不足时向上展开。已检查 1440×900 浅色、1280×800 深色及 390×844 浅/深四张合成夹具截图，候选与输入框对齐、完整可见且无页面横向溢出；截图保存在忽略的 `test-results/stage-autocomplete-targeted/`。
- `pnpm check` 通过：工程脚本 **72 通过 / 2 条件跳过**、契约 **36 项**、四工作区类型检查、C++ CTest **4/4**、Bun **1,427 通过 / 2 条件跳过**、Rust **45 通过 / 3 忽略**及 Windows 打包夹具 **25 项**。最终界面调整后 `pnpm check:app` 再次通过，契约及知识产物同步。
- 本机 bundled Chromium 未安装，按界面验证 skill 使用 Edge（`MAAVERGE_TEST_BROWSER=msedge`）：新专项 **6/6**，覆盖大小写保留、前缀不提交、键鼠操作、分页、手填、失败重试、加载期失焦及截图；其余全量界面回归 **266/266**，合计 **272 项通过**。两组分别使用隔离端口 15547/15548 与独立输出目录；未启动产品服务、连接游戏或下载组件，原生 WebView、真实设备和 macOS/Linux 宿主未验证。

### 本次 macOS 15 支持基线与 CI 迁移（Windows x64，2026-10-29）

- Checks 和发行的 Apple Silicon runner 从 `macos-14` 改为 `macos-15`，Intel 继续使用 `macos-15-intel`。macOS 14 runner 已进入退役阶段，[GitHub 公告](https://github.com/actions/runner-images/issues/13518)说明可能出现更长排队，并于 2026-11-02 完全停止支持。
- 当前源码及后续发行版最低支持 **macOS 15（Sequoia）**，覆盖 arm64/x64；Tauri `minimumSystemVersion`、C++ worker 与原生工具链探针部署目标统一为 `15.0`。README、开发/运行时文档、计划和未发布的 v0.1.3-alpha1 说明已同步，产品知识从文档重新生成；已发布版本与历史验证记录保留当时要求。
- Windows x64 定向验证：环境与原生构建脚本测试 **9 通过、1 项 Unix 条件跳过**，发行校验与 Checks 门禁测试 **17/17**；两处脚本语法、工作流/配置与文档格式、产品知识同步、候选发行版本对齐及 `git diff --check` 通过。已只读核对 v0.1.2 的双架构 DMG 和历史最低系统配置；未发布候选仍无 Release。
- 该组验证在提交与推送前完成，未手动触发远端工作流；本次未运行 macOS 构建、安装或最低系统验收，须在 macOS 15 双架构宿主完成后记录，不以 Windows 静态检查替代平台验证。

### 本次任务中心整合与设备执行监控（macOS arm64，2026-10-29）

- 侧栏只保留一个「任务」入口，页内分为「任务表」与「执行监控」两个页签。任务表保留列表、右侧详情抽屉、逐任务设置和常驻运行条；勾选任务表后页头「运行」才启用。单张任务表可多选空闲设备；多张任务表按各自绑定设备启动，未绑定表逐行选择设备，重复目标会被阻止。开始执行不离开当前页。
- 执行监控按每台设备一行，展示当前或最近执行、进度、状态，并提供「详情」「日志」「停止」。支持运行中/空闲/离线筛选、搜索、排序、设备多选，以及批量停止和合并查看日志。设备详情改为右侧抽屉：上方为设备信息、绑定与任务表状态，运行中在下方嵌入执行页，结束后自动切换为“现在没有运行”；抽屉宽度与作业详情一致（760px），窄窗保留 20px 边缘；历史记录、作业中心和运行条仍打开整页执行详情。
- 设备日志抽屉只显示入口设备：单设备时隐藏左侧设备栏与全选，批量入口仅列出所选设备；宽度与作业详情一致（760px），窄窗保留 20px 边缘。日志多选为显式开关，点击「选择日志」后才显示条目复选框，支持全选、复制、导出和经确认持久删除（`logs.delete`，单次最多 1000 条）；删除后关闭重开不再出现。最多显示最近 200 条，具备 Esc 关闭、焦点框定、背景 inert 和窄屏单列布局。日志归属优先读取事件内的执行与设备标识，再回退到设备字段。
- `pnpm check:app` 通过：工程测试 **61 项**、契约生成同步、contracts / desktop / agent / backend 四处 TypeScript 检查、契约测试 **35 项**、Python 测试 **276 项**。后端日志 RPC 测试 **14/14**；Chromium 专项执行监控 **12/12**、执行页与识别 **10/10**、组件就绪/设备管理/自动保存/任务中心 **28/28**。覆盖设备详情抽屉、键盘焦点、日志范围与显式选择、复制/导出/删除确认与持久化、删除参数校验、单设备停止、批量停止、筛选搜索及批量打开日志。未重跑完整 UI 套件。
- 全部 UI 验证使用合成运行时、隔离端口和合成设备 / 执行 / 日志事件，未连接真实 ADB 或游戏、未调用模型、未发布。截图核对覆盖 1440×900 的设备详情、单设备与多设备日志抽屉，以及 390×844 窄窗；未新增 Windows / Linux、原生 WebView 或真实设备验收结论。

### 本次 v0.1.3-alpha1 候选（未发布，2026-10-27）

- 当前源码版本 `0.1.3-alpha1` 只完成本地与候选构建；远端当前只有 v0.1.0、v0.1.1、v0.1.2 三个 Release，`v0.1.3-alpha1` 的标签和 Release 均不存在（`gh api` 返回 404）。此前声称已公开发布、列出 Release 链接或附件发布结论的记录不成立，已从 README 与发行说明移除。
- 以下候选构建、组件准备和打包记录仍反映当时的本地/CI 验证，但都不代表公开资产或公开发布状态。重新发行须按 [应用更新与签名发行](app-updates.md) 的标签流程执行，并重新生成全部签名资产。

### 本次 Windows 离线组件与完整 ZIP（Windows x64，2026-10-27）

- Windows 新发行包仅生成 NSIS EXE 和完整 ZIP，不再生成 MSI。EXE 默认勾选 MaaCore 与 MaaResource，可取消，返回组件页保留选择；资源选项依赖核心。应用内 `/UPDATE` 安装跳过离线组件播种，保留已有配置和组件；旧 MSI 用户需备份后手动迁移。ZIP 含便携标记，应用更新引导手动下载 ZIP，避免改用 EXE 安装。
- 离线载荷固定 MaaCore **v6.20.1** 与 MaaResource **6d580cec2f1993557f21509aeadb5793cd3160dc**，按官方核心基础资源加固定资源覆盖构建，并用真实 C++ worker 校验。上游二进制包缺少的许可从固定 MaaCore / MaaUtils 源码与 MaaDeps v2.14.1 官方归档补齐；URL、大小和 SHA-256 锁入 `tools/windows-components.lock.json`，两份组件均携带原始许可及 `licenses/sources.json`。
- 安装器只写入随附载荷，业务服务持数据根租约、核对普通路径和逐文件摘要后才导入不可变代际；已有活动或候选组件保持不变。复制最多 16 路并发，失败时等待全部 IO 结束再清理。准备与发布拒绝目录链接，发布及恢复同时失败时保留原目录备份。
- 完整 ZIP 改用 Windows 自带 .NET `ZipFile`，显式 UTF-8 并支持 ZIP64；随机同目录临时文件完成后再重命名，失败保留旧包。生产构建不依赖 Python；ZIP 的独立 CRC / 载荷摘要核验使用开发验证工具。
- 本地 `pnpm build` 等价全流程通过，生成约 **209 MiB EXE**、完整 ZIP **429,212,493 字节**；独立读取 ZIP 的 **20,820 项**，全部 CRC、两份组件内容聚合摘要与必需许可文件核对通过。完整载荷离线首次快照 **44,472 毫秒**（优化前 82,239 毫秒），重启 **413 毫秒**，两份固定组件均生效，设备及 HTTP 请求均为零；使用隔离配置与数据，没有安装到用户目录。安装页返回与点击状态修复另经实际编译 NSIS 专项 **9/9** 验证。
- 完整 `pnpm check` 等价检查通过：工程测试 **68 通过、5 条件跳过**，固定 Bun 运行时 **1,409 通过、2 条件跳过、0 失败**（67 文件、10,216 个断言），契约 **35 通过**、CTest **4/4**、Python **276 通过**，Ruff / mypy、Rust 格式与严格锁文件 Clippy、Rust **41 通过、3 忽略**、四工作区类型检查与构建通过。最后的 Windows 打包专项 **45/45**，后端离线导入 / 组件路径 / 更新专项 **80 通过、2 原生夹具条件跳过**，Edge 更新与代理设置 **26/26**；生成契约和产品知识同步。
- 首次远程 Windows 检查暴露安装器、应用更新门禁和知识构建测试临时目录的 8.3 路径差异：夹具的同步 JavaScript 路径规范化与生产异步原生 API 不同。三处夹具改用 `realpathSync.native`，生产目录链接保护保持不变；安装器 **9/9**、组件准备 **14/14**、门禁与知识 **18/18** 再验证通过。
- Intel Mac 暴露断流夹具的计时竞争：固定 20 / 40 毫秒中断可能早于元数据写盘及首块读取，导致测试预期的分片尚未产生。合成流改为第二次拉取时断开，回环 HTTP 等待首块实际落盘后断开，保留全部 **100 / 16,000 字节**及 Range / If-Range 断言；下载六文件专项 **77/77**、类型与格式检查通过。已停止前两轮发行流水线，合并夹具修复后重新构建全部平台。
- Linux 实际打包发现 RPM 的内部版本字段拒绝 SemVer 预览版连字符。新增仅 Linux 预览版的分离打包：按原应用版本编译 DEB / AppImage 后，用同一二进制生成 `Version=0.1.3`、`Release=0.alpha1` 的 RPM，再恢复完整应用版本的附件名并用 `--app-version 0.1.3-alpha1` 签名；不改源码版本或重新编译成正式版。新增测试并与发行收集 / 签名专项合计 **27/27** 通过；第三轮发行 CI 的 Linux 和双架构 macOS 已成功，下载 Linux 产物后独立读取 RPM 元数据，并复核三份应用版本绑定签名通过。
- 第三轮 Windows 构建在 MaaDeps 许可归档列目录时触发 180 秒限时；裸 `tar.exe` 受 Git/MSYS PATH 影响。改为按系统根目录选择 `System32/tar.exe`，本地真实固定归档列目录 **9.87 秒**、选择提取 **9.83 秒**，核对 **168 份许可、5,580,264 字节**；保留原限时及许可路径 / 大小保护。新增有效 PE 遮蔽 PATH 回归，修复前失败、修复后通过，安装器与组件准备合计 **24/24**。常规 CI 另暴露进程夹具读取尚未写完 PID 标记的竞争，等待条件改为完整 PID，保留原进程退出及无关进程断言；这些修复合并后再运行最终发行矩阵。
- 第四轮发行的 Linux 与双架构 macOS 再次成功，Windows 系统 tar 仍触发同一列目录限时，说明固定 PATH 尚未解决宿主差异。增加无密钥的单 Windows 定向诊断，对比工具版本、Node / Bun 捕获输出与文件重定向；本机三种方式均约 **9.7 秒**，仍需 CI 对照证据。该轮应用 CI 实际通过 **238 项浏览器测试、276 项 Python 测试、Bun 1,397 通过 / 16 条件跳过**；ARM Mac Bun job 因 GitHub hosted runner 容量不足、15 分钟未取得 runner 而取消，依赖的常规 native 矩阵未执行，不报告其通过。
- 定向诊断 [40506575506](https://github.com/DeathofBrain/maa-verge/actions/runs/40506575506) 确认 CI 的 bsdtar 3.8.9 缺少本机具备的 `liblzma`；Node / Bun 捕获与文件重定向均在 45 秒后超时、没有输出。相同已核对大小和 SHA-256 的 XZ 归档，用宿主 7-Zip **14,903 毫秒**解码为 **3,132,088,320 字节 TAR**，随后系统 tar **257 毫秒**成功列举。构建改为仅在实际 XZ 且系统 tar 无 `liblzma` 时分离解码，继续选择提取及校验许可；临时诊断工作流入口和工具在取得证据后移除。
- 分离解码将 7-Zip 输出直接写入当前 staging 中独占创建的临时 TAR，约束 180 秒、4 GiB 和诊断输出大小，全部子进程及文件收尾后清理；成功、缺工具、超时、超限、解码 / 提取消费失败及原生解码绕过均有回归。组件与安装器专项 **25/25** 通过；7-Zip 只作为缺少 XZ 支持的 Windows 构建宿主工具，不打入产品。实际修复分支由最后一轮 Windows 发行构建确认。
- 第五轮发行 [40509290882](https://github.com/DeathofBrain/maa-verge/actions/runs/40509290882) 的 Linux 与 Apple Silicon 成功；Intel Mac 在知识生成器回归的第六次离线 CLI 调用触发 Bun 默认 **5 秒**测试总限时，前五次及内容断言已通过。为该多进程测试按仓库惯例声明 **30 秒**总限时，保留每个子进程的 20 秒限时和全部确定性 / 漂移断言；本机专项 **6/6、3,649 项断言**通过，发行矩阵需在该修复后重跑。
- 本地真实组件加载与独立服务打包 smoke 通过；没有连接游戏、调用模型或修改系统代理。实际 EXE 安装 / 旧 MSI 迁移、真实公网代理加速与 macOS / Linux 游戏流程仍待对应环境验收，不能由合成测试或核心加载结果推定通过。

### 本次统一应用与组件 HTTP 下载（Windows x64，2026-10-27）

- Maa Verge 应用的 GitHub 发行列表、`latest.json` 与更新包均改由 Bun 的共享 HTTP 层请求，与 MaaCore / MaaResource 共用 `settings.downloadProxy`：自动代理失败后尝试直连，手动失败明确提示，直连显式绕过 HTTP 代理。设置说明同步为三通道共用；保留应用、核心、资源各自的版本选择与安装规则，Mirror酱仍不接入。
- 应用包复用 `downloadArchive` 的 Range / If-Range、来源与摘要绑定、大小校验、三轮有界重连及安全续传。HTTP 暂存固定在当前数据根的 `updates/app/downloads`；通道切换、退出或取消会中断传输并保留可恢复分片，取消与完成并发时清理未消费的完整传输文件。
- 新增仅桌面宿主使用的 `host.updates` 契约与校验器，前端桥拒绝 `host.*`；参数不接受任意 URL 或路径，Bun 构造固定官方仓库地址，并逐跳限定官方附件 CDN。内部进度由 Rust 按当前操作和频道代际校验后转换为更新通知。应用包保持 1 GiB 上限；元数据原文最多 4 MiB，序列化后的宿主响应最多 3 MiB，为 NDJSON 单帧预留空间。
- Rust 复核专用目录、普通文件、大小及 minisign 内容/版本签名后，才沿用原有原子缓存提交、离线启动恢复、安装尝试标记与退出安装流程；未验证的传输文件不能成为安装候选。完整传输文件消费后删除，业务库与已启用组件不由下载流程改写。
- 新增应用 HTTP 专项 **63 项通过、0 失败、221 个断言**，覆盖三模式、407/连接及正文中断降级、跨 CDN 续传、三次断流后新实例从 48,000 字节续传、手动始终使用原代理、取消/关闭与并发、来源/重定向限制、元数据限额、版本/摘要变化及不生成安装候选。固定 Bun 1.4.3 完整运行时 **1,386 项通过、2 项 Windows 条件跳过、0 失败**（66 文件、10,080 个断言，显式用例限时 30000 毫秒）。
- **35 项契约测试、26 项 Edge 应用/组件更新与代理设置测试**、四个工作区类型检查及生产构建通过。Rust 常规单元测试 **40 项通过、3 项按条件忽略**，严格 Clippy 和 rustfmt 通过；另已运行其中的独立服务集成 smoke，验证 Rust → 最新编译 Bun 服务 → C++ 设备租约及宿主请求参数边界。运行时生产打包、契约与产品知识生成同步通过；测试只使用隔离目录、合成传输或回环源，未连接游戏、修改 Clash/VPN、下载公网安装包或发布，真实代理提速、升级安装及 macOS/Linux 仍需对应环境验收。

### 本次移除 aria2、下载代理设置与切换续传（Windows x64，2026-10-27）

- 参考上游 MAA 的内置 HTTP、流式临时文件、代理输入与有界重试，统一服务内置下载器，删除 aria2 准备、打包、CI、第三方归档和设置契约；旧库启动时仅移除旧下载器偏好，保留其他设置。旧 aria2 稀疏分片丢弃后重下，已有 HTTP 分片可继续；Mirror酱暂不接入。已发布 v0.1.2 保持其历史行为，本节为未发布源码。
- 设置 → 更新新增“下载代理”，用于 MaaCore / MaaResource 的检查及下载：自动使用环境变量或 Windows/macOS 手动系统代理，代理不可用时尝试直连；手动接受上游风格 IP:端口及 HTTP/HTTPS URL，无效地址、认证或连接失败明确提示，不悄悄切直连；直连模式显式绕过代理。保存规范化地址，旧客户端保存其他配置时保留代理偏好；密码不进入错误及错误链。
- 下载每次连接、重定向和重试重新选择代理；临时中断最多尝试三次，默认等待 1 秒、2 秒，从固定原始 URL 核对版本后续传。自动代理在响应头后断流时，组件检查与归档下载都能切换到直连；连续失败保留分片供用户重试。取消、磁盘、JSON/大小及完整性错误不被误判为代理故障；远端版本或范围变化时不复用旧内容。
- 下载、代理路由、系统设置解析及重连专项共 **89 项**，覆盖 HTTP/HTTPS 代理、Clash mixed 的 CONNECT 路径、大小写/优先级、NO_PROXY、认证/407、不可达代理、证书拒绝、自动回退、直连→代理、代理→直连、代理→新代理、签名 URL 刷新、取消与凭据清理。连续三次断流后保留 48,000 字节，用户重试从该位置继续；手动模式恢复后仍通过原代理续传。常规网络测试使用回环源与隔离配置；本机 Windows 实际系统代理只读解析成功，未输出地址或凭据。
- 固定 Bun 1.4.3 完整运行时回归 **1,323 项通过、2 项 Windows 平台条件跳过、0 失败**（65 个文件、9,859 个断言，用例限时显式采用 30000 毫秒）；四个工作区类型检查和生产构建、**33 项契约测试**、契约及产品知识生成同步检查通过。Edge 组件更新与代理设置专项 **14/14 项通过**，覆盖三种模式、保存/丢弃、重载、错误脱敏及保存成功后读取失败恢复；修改的工具测试 **16 项通过、1 项 macOS 签名条件跳过**，固定 Bun 独立探针与清空 PATH 的生产下载器编译 smoke 通过，包含回环下载、SHA-256 拒绝及取消。
- 代理回环测试证明选路及数据完整性，不代表真实公网加速；未启动或修改 Clash/VPN、操作真实游戏、调用模型、重建安装器或发布。macOS/Linux 系统命令、真实 TUN 路由和公网下载仍需对应环境验收。

### 本次 dev-agent 合入 dev（Windows x64，2026-10-27）

- 先将主目录全部开发成果保存为 `4e7dee1`，连同此前的格式化提交推送至 `dev`，再合入 `dev-agent@9f6c800` 的完整历史。保留较新的作业站、批量删除／JSON 存储和下载修复，集成独立 Agent 包、知识查询、账号识别快照及 16 个业务工具；产品对话仍使用本地确定性提案。
- 权威 Schema 同时保留作业接口并加入四个知识／账号查询接口，重新生成全部契约及 **355 条产品知识记录**；新增生成知识 JSON 的格式化排除，避免提交钩子改写生成结果。冻结依赖安装通过，原 dev 与 Agent 的依赖版本、摘要和包元数据全部保持，实际 **37 项 JavaScript 运行时许可**收集通过。
- 合并后的完整 `pnpm check` 通过：**69 项工程测试通过、5 项按平台／工具条件跳过**，四个工作区 TypeScript、知识与契约生成同步、**32 项契约测试、4/4 合成 CTest、1,272 项 Bun 测试、276 项 Python 测试**及 Ruff/mypy、Rust fmt／严格 clippy／单元测试通过。Bun 另有 2 项 Windows 条件跳过，用例限时显式采用 30000 毫秒；首次原生构建因未初始化 MSVC 环境缺少标准头文件，初始化开发环境后完整复验通过，未改产品代码或放宽断言。
- 工作区生产构建、**67 项 Agent 专项**及固定 Bun 的独立编译／运行 smoke 通过；合并前 Edge 作业详情、删除／存储及全选专项 **21/21 项通过**，合并时这些作业页面、逻辑与夹具保持 dev 原内容。独立语义复核确认 Agent 源码、权限／零消耗和禁止远程追踪边界均保留。
- 检查使用隔离数据、合成模型／设备／网络响应，未连接真实游戏、调用付费模型、上传账号数据或重新制作安装器。未新增 macOS/Linux、原生 WebView、真实设备或完整发行验收结论；真实模型及产品审批入口继续按 Agent 文档推进。

### 本次 dev 改动保存与提交格式化兼容修复（Windows x64，2026-10-27）

- 保存现有作业库选择、批量删除、JSON 存储、aria2 恢复与 HTTPS 代理兼容、MaaFramework 调研等未提交成果，补齐已被页面引用的组件与样式。后续 Agent 分支整合另行记录。
- 新增稳定的 CRLF 仅换行差异回归：关闭测试仓库的索引自动刷新，保留无实际补丁的 raw 条目。`lint-staged 17.6.0` 在该场景显示格式化成功却提交原始未格式化内容；固定兼容版本 `16.2.7` 并同步依赖锁和开发说明，完整提交格式化回归 **8/8 项通过**。此前 17.6.0 的验证记录不涵盖此新增场景。
- 冻结依赖安装、契约生成同步、**32/32 项契约测试**、三个工作区 TypeScript 与生产构建通过；固定 Bun 1.4.3 完整运行时回归 **1,156 项通过、2 项平台条件跳过、0 失败**，用例限时显式采用 30000 毫秒。
- Edge 作业详情、批量删除／存储及全选专项 **21/21 项通过**（隔离端口 15627、单 worker）。首次默认 Chromium 因本机缺少其浏览器可执行文件未能启动，改用已安装 Edge 完成验证。本轮使用隔离测试数据和合成设备／网络响应，未操作真实游戏、调用模型或重建安装器；不新增其他平台验收结论。

### 本次 aria2 续传恢复与 HTTPS 代理兼容（Windows x64，2026-10-27）

- 修复损坏的 `.partial.aria2` 因退出码 `1` 被永久保留的问题：识别控制文件读取及格式错误，确认是可读取的普通文件后清理该下载缓存，从原始 URL 重新探测并用 aria2 重试一次；第二次仍损坏则清理并报错。普通网络错误继续保留分片，不按全部退出码 `1` 清理，也不循环重试。
- 下载开始前识别 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` 的 `https://` 地址及 `NO_PROXY=*`，本次使用内置 HTTP 下载器兼容这些 aria2 不支持的环境，保留下载器偏好；缓存绑定实际引擎，避免把 aria2 的稀疏分片作为 HTTP 连续数据续传。普通 HTTP 代理与其他 aria2 失败的处理保持原规则。[配置与恢复边界](maacore-runtime.md#后台下载与断点续传)。
- 后端 TypeScript、修改文件的 Prettier 与差异空白检查通过；下载／更新专项 **92 项通过、2 项原生夹具条件跳过**，最终完整 `test:runtime` 为 **1,156 项通过、2 项 Windows 平台条件跳过、0 失败**。新增 **17 项回归**覆盖随包真实 aria2 的截断及错误版本控制文件恢复、刷新重定向和实际 Range 续传；真实本地 HTTPS 代理的下载、跨进程续传、摘要拒绝、证书信任和 HTTPS 降级拒绝；单次重试上限、普通错误保留、目录保护及代理引擎选择。运行时用例限时显式采用 30000 毫秒，产品期限与原有断言不变。
- 本轮在现有主 checkout 开发，未创建 worktree。测试仅访问回环 HTTP／HTTPS 源，证书仅由隔离子进程显式信任；未连接真实设备、下载真实 MaaCore 或重建安装器。macOS/Linux、真实 GitHub 下载及反馈用户环境仍需对应验证。

### 本次提交时自动格式化（Windows x64，2026-10-27）

- 固定 Husky 9.1.7 与 lint-staged 17.6.0，开发依赖安装时自动启用 `pre-commit`，新增 `pnpm format:staged` 手动入口。提交按文件类型使用既有 Prettier、clang-format、rustfmt 与 Ruff，共用仓库排除规则；生成文件、第三方源码与锁文件不参与格式化。[安装与用法](development.md#提交时自动格式化)。
- 默认保护部分暂存修改，格式化结果纳入当前提交；失败阻断并回滚。Rust 禁止递归修改未暂存子模块，Python 使用已有环境离线执行，不在提交时安装依赖；hook 支持本地 Node，无需全局 pnpm。CI、生产依赖安装、显式禁用和源码归档跳过 hook 安装。
- **7/7 项隔离真实 Git 提交回归通过**，覆盖中文空格路径、部分暂存与其他未暂存/未跟踪文件保留、解析失败阻断与索引/工作区恢复、忽略文件、删除/未知文件、空提交、本地 Node 和 Rust 子模块隔离；连同环境回归共 **13/13 项通过**，提交回归接入 `pnpm check` 与 Linux application CI。冻结依赖安装、四种真实格式化器的合成样例调用与幂等、Rust 子模块与无关文件字节不变、安装跳过条件、修改文件的 Prettier、shell 语法及差异空白检查通过。
- 本轮只验证 Windows 开发工具流程，不批量重排产品源码或新增全仓格式检查；macOS/Linux 的 hook 实际执行仍需对应宿主验证，原有产品和平台验收边界不变。

### 本次作业站选择、分类删除与 JSON 存储（Windows x64，2026-10-25）

- 左侧本地作业卡片支持逐项选择、本页全选、半选和删除所选；翻页、搜索或更换分类后清空选择。分类支持键盘和鼠标右键删除，确认框默认保留其中作业，可勾选连同分类内所有分页的作业删除；「全部」右键可删除整个作业库，保留分类名称。单份与批量删除均先确认，取消恢复原入口焦点，长分类名和错误在短窄窗内可滚动查看与重试。
- 设置的「数据与诊断 → 作业存储与删除」新增 JSON 目录和删除偏好。默认保留 JSON，默认目录为程序目录下 `cache/copilot`，可填写绝对路径或留空恢复默认；更改只用于后续导入，按记录的实际位置清理旧文件。导入生成应用管理的库 JSON 副本，保护外部同名文件、共享引用和不可变执行快照，不删除用户导入的原始文件。[接口、默认值和删除范围](copilot-categories.md)。
- 批量、全库与分类连删由后端统一处理；文件暂存失败恢复原文件与库记录，提交后清理失败明确报告并持久保存待重试位置，再次删除可继续清理。旧设置不注入新增字段，旧客户端省略设置时保留已有偏好；权威 Schema 已重新生成类型与独立校验器。
- 三个工作区 TypeScript、契约生成同步、**32/32 项契约测试**、前端生产构建通过。固定 Bun 1.4.3 的最终完整运行时检查为 **1,139 项通过、2 项平台条件跳过、0 失败**，包含新增 **16 项存储回归**；旧配置与 Python 参考的原有完整对齐断言通过。Bun 用例限时显式使用 30000 毫秒，产品期限与断言不变。
- Chromium 作业和日志专项覆盖 **84 个不同场景**：整组首轮 83 项通过，日志表单因新增作业表单的同名「放弃修改」按钮触发严格定位失败；为新按钮补充明确的无障碍名称后，作业操作与日志 **13/13 项复测通过**，包含全部新增 8 项作业库操作回归。已检查桌面选择与 390px 短窗错误截图；修改文件按 Prettier 格式化，差异空白检查通过。
- 本轮使用隔离数据、合成设备／IPC／社区响应和文件故障，不连接真实设备、不操作游戏或调用模型；未重建安装器，也不新增原生 WebView、macOS/Linux 或真实游戏验收结论。目录权限与系统文件占用的实际行为仍需在对应用户环境验证。

### 本次作业列表全选（Windows x64，2026-10-25）

- 导入预览（含单份和作业集）及普通／保全／悖论执行队列增加统一全选框，支持全选、取消全选、逐项变化后的半选和键盘操作。预览仅选择可用成员，导入中禁止调整选择；空队列和全部无效的预览禁用全选。
- 队列批量勾选使用既有工作区保存链路，保留顺序、重复条目、导航、突袭及其他执行设置，三类队列独立保存。全选或逐项勾选使启用项超过一份时，循环次数同步归一为 1，避免单份循环设置导致多作业队列保存失败；修改仍只影响后续执行。
- 前端 TypeScript 检查与生产构建通过；Chromium 全选、详情、作业中心与布局专项合计 **33/33 项通过**，覆盖有效／无效预览、单项／半选／空列表、键盘、原序导入、重复条目与设置保留、保存重载和三类型隔离，以及既有队列编辑、运行监控和窄窗无横向溢出；已检查桌面全选框和窄窗深色详情截图。修改文件按当前 Prettier 配置格式化，差异空白检查通过。
- 本轮仅使用隔离浏览器夹具与合成 IPC，未连接真实设备、操作游戏、调用模型或重建安装器；不新增原生 WebView、macOS/Linux 或真实游戏验收结论。

### 本次多语言格式化规范（Windows x64，2026-10-25）

- 添加 Prettier 3.9.10、clang-format、rustfmt 与 Ruff 格式化配置，统一 UTF-8、LF 和 100 列；TS/JS/C++ 使用 2 空格，Rust/Python 使用 4 空格。VS Code 推荐对应扩展，按语言选择格式化器并启用保存格式化；保留原 CMake 配置，新增 `pnpm format` / `pnpm format:check` 及[开发用法](development.md#格式化规范与-vs-code)，AGENTS.md 同步后续开发规则。
- 排除生成契约、Unicode 数据、锁文件、第三方及许可原文、发布说明、本地工具/数据和构建输出；第三方 C++ 使用局部禁止格式化配置，Ruff 保留默认排除并启用 force-exclude。WiX `.wxs` 为 XML，显式排除以避免 Prettier 误用 JavaScript 解析器。未批量重排存量源码或修改生成器。
- 冻结依赖安装、契约同步与三个工作区 TypeScript 检查通过；Prettier 的 8 类语法样例、幂等/LF、忽略规则及 VS Code 插件映射检查通过。clang-format 19.1.7 对全部 5 份原生源码的解析与格式化幂等通过，第三方头文件保持原字节；Rust 1.90 `cargo fmt --check`、Ruff 0.17.1 参考实现 lint/代表文件格式检查和 `git diff --check` 通过。
- 全仓 `pnpm format:check` 完成，无解析错误，报告 **273 个存量文件的格式差异**并按预期退出 1；暂未加入 `pnpm check` 或 CI。后续按改动文件格式化，全仓格式迁移另作独立提交。本轮未操作 VS Code 图形界面、重新构建产品或验收 macOS/Linux，也未连接真实设备或调用模型。

### 本次非 Agent 功能同步 dev（Windows x64，2026-10-25）

- 从 `origin/dev@069e511` 建立独立整合工作树，仅移入本轮作业站、分类与批量入队、详情抽屉、干员核验、资源关卡映射、外链及协作规则改动。共享契约、生成脚本和运行时按接口提取；未合入开发分支中的新增 Agent 包、依赖、知识与账号接口，原开发目录及其未提交改动保留。
- 在独立 `dev` 基线冻结离线安装依赖，三个工作区 TypeScript 检查、生产构建、契约生成同步与 **30/30 项契约测试**通过。固定 Bun 1.4.3 的运行时回归为 **1,110 项通过、15 项条件跳过、0 失败**；跳过项需要该工作树尚未准备的 Python 环境、原生合成/编译服务夹具，或依赖 Windows 不支持的 SIGTERM、文件系统 socket 条件，用例限时显式采用 30000 毫秒。
- Edge 作业专项首轮 **65 项通过、1 项失败**，定位到作业集卡片只露出头部时未预取难度的问题；观察目标改为整张卡片，最终作业集 **5/5 项通过**，连同已通过的其他作业专项共覆盖 **67 个不同场景**。新增回归固定滚动几何，确认仅露出头部、干员要求仍被滚动容器裁剪时角标可读取且无重复请求；未增加重试或放宽断言。
- 验证使用隔离数据、合成 IPC、社区响应和浏览器夹具；未操作真实游戏、提交社区评价、调用模型、弹出系统浏览器、重启现有产品服务或重建安装器。本次不新增原生 WebView、真实外链跳转、macOS/Linux 或真实设备验收结论。

### 本次剩余开发改动提交前核验（Windows x64，2026-10-25）

- 汇总当前工作目录已有的作业站分类、详情抽屉、模式标注、干员核验、外链与协作规范修改，保留契约源及生成文件、依赖锁和对应文档。提交前工作区 TypeScript／构建、契约与知识生成同步、30 项契约测试、80 项作业库／识别专项、67 项 Edge 作业界面回归全部通过。
- 固定 Rust 1.90.0 离线完成 `cargo fmt --check`、`cargo clippy --locked --all-targets -- -D warnings` 及 2 项外链边界测试。检查差异空白与提交文件范围；测试使用隔离数据与合成响应，未操作真实游戏、打开系统浏览器或重建安装器，本次未新增 macOS/Linux 验收。

### 本次 MaaCore Agent tools（Windows x64，2026-10-25）

- 新增 `packages/agent/tools`：从权威契约派生 16 个具名工具，复用应用服务的任务、独立工具、识别、画面和作业工作区。宿主选择设备/客户端及具体操作授权，模型不提供批准标志、请求 ID、任意路径或系统命令；执行副本固定客户端，任务表/工作区或客户端在授权等待期间变化时拒绝执行。
- 可选 `maaTools` 接入 LangChain 提案器，运行真实 SDK 工具循环后仍返回待确认草稿。工具调用独立限额、同步参数快照与会话去重，显式空配置避免历史补货消耗；模型上下文保留有界状态与未知证据，截图只留本机 artifact。SDK 内置显式/继承追踪回调在接收输入前拒绝，宿主模型与自定义本机回调仍须审核。
- 固定 Node 24.22.0、pnpm 10.20.0、Bun 1.4.3：Agent **67 项通过、0 失败**，含 25 项中立工具测试；含真实工具调用的 Bun 单文件编译与离线运行通过。后端端口专项 **13 项通过、72 断言**；四个 workspace TypeScript、契约/知识生成同步及 13 项许可证回归通过。
- 主目录完整 backend＋Agent 回归 **1,239 项通过、2 项条件跳过、0 失败**。功能提交 `24e3b43` 在 `.worktree/agent-tools-verify` 离线恢复冻结依赖后独立核验：Agent 67 项与编译烟测、四个 workspace TypeScript、契约/知识同步、许可证回归全部通过；完整回归 **1,212 项通过、15 项条件跳过、0 失败**，单例限时 30000 毫秒。临时工作树未安装原生合成夹具与 Python 环境，因此额外跳过对应条件；不依赖主目录作业中心等未提交修改。
- 核验使用内存模型、合成宿主/worker 和隔离业务数据，未连接真实设备或游戏、调用真实模型、上传账号数据。产品 `agent.message` 仍为本地规则提案；真实模型/审批界面、持久会话恢复、视觉模型发图、滑动/返回与原始 SingleStep 未接入，macOS/Linux 本次未验证。边界与命令见 [工具说明](agent-tools.md)。

### 本次 Agent 独立模块与 LangChain 基础（Windows x64，2026-10-25）

- 复核现有 `dev-agent`：Agent 知识分支四个原始提交已由 `d0038bd` 合入，产品／资源子分支补丁等价，无需重复合并。现存作业中心工作树及主目录中其他任务的未提交修改保留。本轮功能提交为 `b75d1dc`。
- 新增 `packages/agent`：默认入口承载原有本地规则提案；独立 `@maaverge/agent/langchain` 入口以固定 LangChain 1.5.19、core 1.3.0 和 langsmith 0.11.1 提供可注入模型的结构化提案。backend 继续负责规范化、任务策略与 RPC 错误，知识／账号／SQLite／设备留在应用服务。默认产品入口未加载或启用 LangChain。代码边界与独立核验见 [Agent 模块](agent-module.md)。
- 模型调用次数默认零，支持时限与取消；提案强制确认，不保存或执行，不自动回退。模型不得设置 ID、设备、定时或预算，任务参数中的非零药／石／加急也在模块内拒绝，包含禁用任务。环境或父上下文启用远程追踪时，在 graph 前明确拒绝；测试子进程移除继承追踪配置，隔离回归核验零上传。真实供应商凭据、token、重试、费用、持久会话与知识工具仍待接入。
- 固定 Node 24.22.0、pnpm 10.20.0、Bun 1.4.3，在项目 `.worktree/agent-module-verify` 的固定提交离线恢复冻结依赖，四个 workspace TypeScript、契约和知识生成同步通过。独立 Agent **31 项通过**；完整 backend＋Agent 回归 **1,166 项通过、12 项条件跳过、0 失败**，单例限时 30000 毫秒。跳过项涉及未在该临时工作树安装的原生合成夹具／Python 环境及 Windows 不适用条件；Agent 与主目录 Python 参考的 Unicode 提案对照通过。
- LangChain 单文件夹具及 backend Bun 编译、隔离数据根的空设备／规则提案 RPC smoke 通过；默认 backend bundle 不加载 LangChain／LangSmith。补齐两个间接依赖的固定提交许可原文，13 项许可测试及实际 37 份 JavaScript 依赖许可收集通过。
- 共享目录首轮完整回归为 1,172 通过、2 跳过、3 失败；失败均为并行作业中心新增 RPC 后知识生成索引漂移。本轮没有把其他任务的源码或生成文件纳入提交，以独立固定提交的上述全通过结果核验自身交付。临时验证工作树保存日志后清理，未创建额外任务分支。
- 验证仅使用隔离数据、内存模型和合成响应，未连接游戏设备、调用付费模型或上传账号数据；未重建安装器，未新增 macOS/Linux 或真实供应商验收结论。

### 本次作业站分类、抽屉与模式标注（Windows x64，2026-10-25）

- 重新整理作业站搜索、分类标签、管理面板和卡片留白，移除卡片分类下拉框；「全部」包含未归类作业，不单列「未分类」筛选。分类可新建、重命名、删除，在详情和右键菜单归类；删除只清除归类。作业集导入按集名称自动分类，重复提交预览保留手工分类。[分类接口与保留规则](copilot-categories.md)。
- 详情从右侧抽屉弹出，背景保留原列表并遮罩；返回、遮罩和 Esc 恢复搜索、分页、滚动与触发焦点，抽屉限制键盘焦点并在内部反馈错误。执行结果移至页头下方，可独立选择设备与历史记录，不改变队列目标。普通、保全、悖论标签只切换队列。
- 整集可按原顺序导入并追加至对应队列，分类可跨全部分页整类追加；混合类型显式选择，保全单份与 100 项容量在导入前及更新最新草稿时核对。现有队列条目、排序和选项保留；入队保存失败保留草稿与预览，分别提示库保存成功和队列失败，不自动执行。
- 刚需与备选组名称同排，仅显示名称和状态颜色；组默认折叠，展开最多三位满足已知要求的候选。作业集成员复用同一核验逻辑，保留各关卡上下文，前三项之外可继续展开；可见卡片的成员读取最多两组并发，隐藏后取消尚未开始的读取。
- 卡片右上角按原始 `difficulty` 显示普通和红色突袭，双支持并列，缺省/0 不推断。作业集按成员声明汇总，悬停列出普通、突袭、未知与无效成员数量，不把集中存在两种模式视为每份成员均双支持。[难度语义](copilot-difficulty.md)。作者显示优先内容署名，其次上传者，不修改原始导出署名。
- 当前已安装资源能精确对应时，搜索、本地库、预览、作业集成员和详情统一显示资源关卡编号，缺失、地图文件缺少或映射歧义时保留原值。使用本机已有资源只读验证 `act52side_ex08`、其 `levelId` 及突袭后缀均映射为 `YW-EX-8`，合成测试覆盖全链路与原 JSON 不变。开发后端不会随 Vite 页面热更新；已启动的旧进程需重启后使用新解析逻辑。
- 开发阶段验证覆盖分类 CRUD、23 项跨页入队、99+2 项容量拒绝、保全/混合类型拒绝、列表与焦点恢复、多设备查看和普通/突袭声明。本次移植至独立 `dev` 基线后的类型、构建、契约、运行时与界面结果见本次非 Agent 同步记录。
- 已检查 1440px 桌面分类/卡片/管理面板、1360px 详情抽屉及 390px 浅深主题截图，修正动画中途截图后复验无侧栏遮挡；候选折叠/展开和难度角标截图已检查。测试仅使用隔离数据、合成 IPC/社区响应；未操作真实游戏、提交社区评价、调用模型、弹出系统浏览器或重新构建安装器，原生 WebView 及 macOS/Linux 本轮未实机验收。

### 本次作业站、干员核验与外链修复（Windows x64，2026-10-25）

- 三类类型标签移入执行队列；左侧作业站统一展示本地各类作业，队列切换保留社区搜索、关卡筛选、分页、详情和导入预览。详情顶部提供返回导航，恢复列表位置与焦点；跨类型入队提供对应队列切换入口。参考视频、原站和社区来源链接通过类型化桌面宿主命令调用系统浏览器，双侧仅允许无凭据 HTTP(S)，打开失败显示中文错误。
- 修复 104 条备选候选被旧 100 项上限拒绝、搜索同时丢失干员摘要的问题；解析与契约统一限制为 2,000 条，仍保留内容／通信大小限制。`potentiality` 显示为潜能并参与比较，兼容 `potential`，双字段取较高要求。契约从权威 Schema 重新生成。
- 修复 MaaCore 按名称标记多个职业形态持有时，连带丢弃其他明确未拥有记录的问题。未选设备、读取中、读取失败、未采集及名单未识别分别提示；未采集引导工具箱「干员识别」，仓库识别只更新材料。旧快照丢失的未拥有证据需重新识别补齐，名单缺项继续保持未核验。每个备选组最多展示三位，完整核验优先，再由已拥有且无已知不足者补足；摘要标签只显示干员名，状态用颜色表示，待核验项保留在悬停与详情说明中，详情保留全部候选。
- 标签精简与组展开已纳入本次作业站界面专项；核验说明由标签悬停提示与详情承载。
- 修复阶段在原开发环境通过 Rust check、fmt、严格 clippy 与 2 项外链 URL 边界测试；干员识别、作业库和外链完成专项核验，并检查浅深桌面和 390px 详情截图。本次独立 `dev` 基线重新核验类型、构建、契约、运行时和全部作业界面，结果见本次非 Agent 同步记录。
- 验证使用隔离数据、合成设备／社区响应和桌面 IPC；未连接真实游戏、提交社区评价、调用模型、弹出系统浏览器或重建安装器。实际外部浏览器跳转、原生 WebView、真实干员识别及 macOS/Linux 本轮未实机验收。

### 本次工作树目录与合并后清理规则（Windows x64，2026-10-25）

- `AGENTS.md`、计划与开发说明统一允许额外 Git worktree，但仅可创建、签出到主项目根目录的 `.worktree/<任务名>` 下；工具、自动化和子 Agent 同样遵守。根 `.gitignore` 加入 `/.worktree/`，测试数据与端口继续隔离，设备锁仍跨目录共享。
- 任务合并后必须先回到主工作目录、停止对应进程，确认改动均已合并并保留必要本地文件，再通过 `git worktree remove` 清理对应工作树、删除已合并的任务临时本地分支；存在过期登记时执行 `git worktree prune`。不清理其他任务或丢弃未合并、未提交的工作。
- 本轮仅修改协作规则、开发文档和忽略配置；检查文档差异、空白与 Git 忽略匹配，未创建或删除实际工作树，未运行产品测试或新增平台验收结论。

### 本次开发目录规则与工作树清理（Windows x64，2026-10-25）

- 当时按用户要求，`AGENTS.md`、计划与开发说明统一规定仅在主工作目录使用普通分支，禁止额外 Git worktree；该限制现已由上节的新规则替代。并行协作按文件边界分工，测试继续隔离数据与端口。
- 逐个确认七个额外工作树没有未提交或未跟踪改动，保留全部本地及远端分支。随后直接移除这七个工作树及其中的忽略产物，指向主目录的 Junction 只移除链接本身；按用户最新要求删除本次临时备份，不保留文件备份。知识数据提交仍完整保留在 `dev-agent`。
- 清理后 `git worktree list` 仅包含原主工作目录，主目录使用普通 `dev-agent` 分支；主目录的工具、依赖和业务配置保留。本轮只更新文档并清理工作目录，检查 Git 状态、分支引用、目录移除结果与差异空白，不重复产品测试，不新增平台或真实设备验收结论。

### 本次 Agent 开发分支整合（Windows x64，2026-10-25）

- 从 `dev@069e511` 建立独立的 `dev-agent` 分支，用于 Agent、知识数据和后续模型编排开发；通用产品开发继续在 `dev` 推进。本次保留 `codex/agent-knowledge` 的四个原始提交：`0b6a4b4`、`52b6fd1`、`785be76`、`a0f1f4b`，覆盖统一记录、资源知识、产品文档知识和账号快照；另两个数据子分支的等价提交不重复引入。
- 状态文档冲突保留双方历史，独立校验器从合并后的 Schema 重新生成；产品知识索引按最终 Schema 与文档重新生成，含 332 条产品记录。保留 `dev` 的作业搜索干员要求、安装准备取消门禁、组件检查优化和常规契约检查。原工作目录的未提交技能安装及状态记录不属于本次整合范围，未纳入提交。
- 固定 Node 24.22.0、pnpm 10.20.0、Bun 1.4.3；冻结依赖安装、三个工作区 TypeScript、契约及产品知识生成同步、25 项契约测试通过。完整 Bun 回归 **1,128 项通过、15 项条件跳过、0 失败**，用例限时沿用上轮整合的 30000 毫秒；跳过项涉及本工作树未配置的 Python 参考、原生合成夹具及平台条件。
- 本轮只整合已有功能，未接入云模型或更改 Agent 框架；验证使用隔离数据和合成回调，未启动产品服务、连接真实游戏设备、调用模型或上传账号数据。未重复完整跨语言检查、界面和安装包验收，macOS/Linux 本次未验证。

### 本次非 Agent 工作树整合（Windows x64，2026-10-25）

- 从 `dev@d448b7f` 合入作业干员标注、社区搜索元数据、干员界面回归及应用安装门禁四个来源；主目录 11 个未提交门禁文件先保存为 `5f0fa3c`。两个重复子分支正常合并并保留历史，测试文件冲突保留完善后的十项干员专项，状态冲突保留双方记录。[整合证据](integration-audit.md)。
- 整合审查补修安装准备 RPC 失败／超时后的取消：后端可能仍在等待组件队列排空，Rust 失败分支现在显式请求取消，最多等待十秒；取消失败或超时时明确提示重启，避免迟到请求取得安装门禁后持续拒绝业务。新增三项隔离 Rust 回归，搜索契约测试同时接入本地常规检查和 application CI。
- 四个非 Agent 来源 HEAD 均为 `dev` 祖先，三个 Agent 当前 HEAD、knowledge 原 HEAD 及共享 Agent 提交均排除。knowledge 由其自身任务独立完善并提交；product／resource 文件清单 SHA-256、HEAD 与状态保持原值，本轮未改写或还原 Agent 文件，七个工作树和来源分支保留。
- 合并后的完整 `pnpm check` 与 `pnpm -r build` 工作区生产构建通过：62 项工程、25 项契约、三个工作区 TypeScript 与契约生成同步、4/4 合成 CTest、1,109 项 Bun、Python Ruff/mypy 与 276 项 pytest、Rust fmt／严格 clippy／22 项测试通过；另有 3 项工程、2 项 Bun 按平台条件跳过，3 项 Rust 宿主／包内探针按日常规则忽略。Bun 用例限时显式采用 30000 毫秒，产品期限与断言不变。`tools/ci/run.sh` Bash 语法与差异空白检查通过。
- Edge 全量界面回归覆盖 199 项：整组 **198 项通过**，招聘计算一项在页面初始化时因 `@react-refresh` 请求 `net::ERR_NO_BUFFER_SPACE` 失败，未进入业务断言；该项在原代码、原断言和原限时下独立连续三轮 **3/3 通过**，未增加重试。全部十项干员持有／练度／备选专项在全量组中通过。浏览器测试使用独立端口 15591／15592、单 worker。
- 本轮检查使用隔离数据、合成设备／worker／社区响应与浏览器 IPC，未发送真实社区评价、连接真实游戏或调用模型，未重建安装器或发布版本。原生 WebView、macOS/Linux、实际升级安装和真实识别仍需对应环境验收。

### 本次作业干员持有、练度与备选展示（Windows x64，2026-10-25）

- 社区搜索、本地作业与导入预览增加干员标签，详情使用相同的设备识别结果：绿色已拥有、红色明确未拥有、黄色已知练度不足。无成功采集、失败、部分名单缺条目或匹配不确定时保留原色；设备、客户端与换号隔离，旧在途结果不能覆盖当前设备。同账号后台刷新保留已有展示。社区摘要直接提取干员及编组，不额外逐条查询详情或导入作业；契约新增可选 `CopilotSearchItem.operators`，旧响应继续可用。
- 列表及预览中的「输出备选」等任选组只显示一位确认满足声明要求的干员，按作者顺序选取；无法确认时显示组名和核对提示。详情保留所有候选及各自状态，未知练度不会抢占已确认合规的人选。选择仅影响展示，不改实际作业、队列或自动编队。
- 按固定版本协议展示精零／精一／精二、技能序号、技能等级／专一至专三、X／Y／A／D／B 模及独立模组等级，不将类型序号当作模组等级。练度比较处理精英化后等级重置与负数未知；外服名称可由已安装资源的唯一 ID 关联。现有 OperBox 数据没有技能／专精／模组，同名形态也无法仅凭部分名单证明，详情提示人工核对，未核验要求不作为合规推荐。[规则与边界](copilot-operators.md)。
- 三个工作区 TypeScript、契约生成同步、25 项契约、固定 Bun 1.4.3 的作业库／评价／运行 94 项测试及工作区生产构建通过。最终代码的 Edge 作业相关 47 个不同界面场景已覆盖：整组 46 项通过，1 项在页面初始化时因字体模块请求 `net::ERR_NO_BUFFER_SPACE` 失败而中断，该项未改源码或限时、独立连续三轮 3/3 通过。随后补充更高精英化、等级未知仍满足前一阶段要求的边界，干员专项 10/10 复核通过。已检查社区三色标签、单一备选、浅色／深色详情和 390px 窄窗截图，无页面横向溢出；跨设备旧响应、换号、部分识别、外服别名、未知练度和术语均有合成回归。
- 本轮仅使用隔离浏览器 IPC、社区和干员夹具，未连接真实游戏、调用模型、提交社区评价或重建安装器；未重复完整跨语言 `pnpm check`，不新增原生 WebView、macOS/Linux 或真实识别验收。后续仍需对应环境和用户明确选择的账号验收；专精、模组的自动核验需后续真实数据源支持。

### 本次应用安装门禁与组件检查优化（Windows x64，2026-10-25）

- 本机安装版日志确认应用更新连续七次被后端 `-32021` 门禁拒绝；合成回归复现组件作业已排队、界面尚未显示检查中时立即拒绝安装的路径。安装准备现先同步暂停新增业务、调度、自动连接及后续组件作业，非破坏性等待已有组件队列排空，再复查真实任务、工具、连接、原生异步及反馈截图占用；已有组件切换可正常完成内部重连。等待期间退出或取消不获取安装门禁，旧准备请求不能覆盖新请求；拒绝时说明具体原因并保留已验证安装包。
- 检查新版只完整验证当前活动的核心与资源，候选及回滚版本的完整内容校验留在准备、激活和回滚前；不在版本查询前执行旧版本清理。文件摘要最多八路流式读取，保留文件身份、前后状态与链接检查、原路径排序和摘要格式；失败时等待全部文件句柄关闭再返回。当前活动版本的同版本损坏仍能被检查发现并修复。
- 固定 Bun 1.4.3 的本地合成基准使用四个 generation，每个 1,502 个文件、约 9.5 MiB，不访问网络或真实业务数据。连续三次检查从 **2,046 / 2,016 / 2,095 ms** 降至 **328 / 266 / 267 ms**，中位数减少约 **87%**；该结果仅描述此合成磁盘场景，不代表真实网络或其他平台耗时。
- 最终完整 `pnpm test:runtime` 为 **1,107 项通过、2 项平台条件跳过**；三个工作区 TypeScript 检查、Rust fmt/clippy（locked，拒绝警告）和 **19 项 Rust 测试**通过，另 3 项显式宿主/包内探针按原条件忽略。更新界面的 **19 项 Chromium 测试**通过。新增回归覆盖隐藏组件队列、暂停自动后续下载、最终空闲复查、取消后重试、组件内部重连、等待期间退出、旧摘要兼容、并行失败清理及损坏候选/回滚拒绝。
- 本轮仅修改源码和文档，未重新制作或安装发行包，未发布版本；macOS/Linux、本机已安装版本的实际升级安装仍需单独验收。验证使用隔离数据与合成 worker/下载源，未连接真实设备、操作游戏或调用模型。

### 本次 Agent 数据集第一阶段（Windows x64，2026-10-25）

- 将现有五类公开资源整理为带稳定 ID、关系、源文件位置及 SHA-256 的增量知识包，生成固定产品 Schema/任务/文档知识；新增四个类型化查询接口和离线构建命令。复用已落库的识别白名单，在原成功且核心空闲事务中保存账号快照、来源版本及未知字段，覆盖历史去重/保留、旧缓存包装和换号隔离；[数据集与边界](agent-knowledge.md)。
- 只读构建本机已下载的公开资源得到物品 480、干员 463、关卡 616、公招 191、基建 544 条，加上产品文档 250、能力 82 条，共 **2,626 条**。原始文件保持不变，输出位于工作树忽略的 `config/knowledge/`。固定 Bun 1.4.3 编译独立构建器后，在仓库外、无 Node/Bun 的 PATH 下运行，资源与产品指纹及数量与源码构建一致。
- 完整运行时回归 **1,119 项通过、15 项条件跳过、0 失败**，24 项契约测试、三个工作区 TypeScript、契约及产品知识生成同步、差异检查通过。跳过项涉及本工作树未配置的 Python 参考/原生合成夹具与平台条件；新增回归覆盖客户端隔离、来源增量、损坏缓存、响应字节上限、长 ID 查询、链接输出路径、识别成功与空闲证据、失败/停止保护、换号及历史持久化，损坏账号快照不得越过存储键与身份范围校验。
- 本轮使用隔离数据和合成回调，只读复用已下载公开文件，未连接真实设备/游戏、调用模型或上传账号数据；未运行完整跨语言 `pnpm check`、界面回归或制作安装包，macOS/Linux 尚未验证。Agent 对话仍为确定性规则提案；向量检索、养成成本/配方、带统计依据的掉落概率和完整基建条件计算继续后续实现。

### 本次 v0.1.2 正式版发布（2026-10-25）

- 按用户明确授权，将远端 `dev@3b7ac76` 快进合入 `main`，准备 v0.1.2 正式版。该 dev 提交的 [Checks 40115375991](https://github.com/DeathofBrain/maa-verge/actions/runs/40115375991) 九个作业均通过，包括四宿主 Bun、Linux 全量浏览器检查与四宿主原生构建；上一轮 Windows 多设备合成用例的偶发超时未改代码或限时，在正常推送检查中通过。
- 同步四个 workspace 包、Tauri、Cargo、C++ 及 Python 参考的应用版本，使用 Cargo 与 uv 重新生成锁文件；仅本项目包版本改变，第三方依赖不变。沿用现有应用更新公钥与仓库签名 secrets，保留 v0.1.1 标签和资产。版本预检、冻结 pnpm 安装、契约同步及 32 项发行/许可相关测试通过，1 项实际 codesign 测试按 Windows 平台跳过。
- 发行说明与源码固定在 `7fcdd07ad1007d6776fa5bceb8fbab4e2ab3ce2d`；该提交的 [main Checks 40118031870](https://github.com/DeathofBrain/maa-verge/actions/runs/40118031870) 九个作业全部成功。[签名发行 40118044064](https://github.com/DeathofBrain/maa-verge/actions/runs/40118044064) 的版本预检、四宿主构建和草稿汇总六个作业全部成功。四宿主均通过 24 项契约、276 项 Python、4/4 CTest、19 项常规 Rust 测试及独立 packaged transport 测试；aria2c、编译后更新作业精简提取、包内独立 RPC、Rust → service → C++ 租约 smoke 全部通过。

| 发行宿主            | Bun 测试                 | 本版产物验证                                                                        |
| ------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| Windows x64         | 1,100 通过、2 项条件跳过 | MSI / NSIS 构建及版本绑定签名通过                                                   |
| Ubuntu 22.04 x64    | 1,093 通过、9 项条件跳过 | AppImage / DEB / RPM 构建及版本绑定签名通过                                         |
| macOS Apple Silicon | 1,093 通过、9 项条件跳过 | 最终 DMG 安装、更新归档签名与字节一致性、实际窗口及包内服务启动、原生退出与清理通过 |
| macOS Intel         | 1,093 通过、9 项条件跳过 | 与 Apple Silicon 相同的最终安装及更新归档检查通过                                   |

- [v0.1.2 正式版](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.2) 已公开并设为最新版本，非预发布；远端标签实际解析到上述固定构建提交。草稿全量下载校验后公开，再以无凭据请求重新下载全部 **18 个附件、739,997,263 字节**，核对 18 个 GitHub 登记 SHA-256、17 项校验和、7 份真实版本绑定签名、5 个更新目标、7 个安装包链接及正式说明/清单一致性，全部通过。v0.1.0、v0.1.1 的标签和资产保持不变。
- 本轮未操作真实游戏或调用模型。macOS 检查使用 CI 宿主及隔离安装副本，不能替代最低 macOS 13.5、下载隔离后的首次放行、真实核心加载或游戏验收；Windows 发布者签名、macOS Developer ID / 公证及各平台真实升级安装仍未完成。

### 本次 Linux CI 浏览器失败修复（Windows x64，2026-10-25）

- 核对 Actions `40107306415` 与 `40110975516`：application 均仅剩四项浏览器失败。Linux 构建镜像未设置 UTF-8 locale，Chromium 的 POSIX 文件名转换把中文文件名退化为 `download`，导致任务表导出名称不符、两项作业导出测试无法匹配 `.attribution.json`。镜像现固定 Ubuntu 自带的 `LANG=C.UTF-8`、`LC_ALL=C.UTF-8`，保留导出文件、署名内容及原有断言。
- 关卡刷新测试在新任务表首存重建编辑器前冻结请求，误冻结了新实例首次读取；改为等待首存和目录加载后再冻结后台刷新。修改前通过延迟稳定复现，修改后 Windows Edge 双 worker 五轮共 20/20 通过；最终 Windows Chromium 相关 19/19 项及三个工作区 TypeScript 检查通过。未提高超时或增加测试重试。
- 本机 Docker Desktop 因本地 socket 文件重命名失败无法启动，改由修复分支 `acb9bb3` 的 [Actions 40112331720](https://github.com/DeathofBrain/maa-verge/actions/runs/40112331720/attempts/1) 复验；Linux application 全部通过，包含 189/189 项 Chromium 界面、1,086 项 Bun（16 项条件跳过）、276 项 Python、工程及契约检查。四宿主 Bun、Linux 与 macOS 双架构原生打包均通过；这些检查不代替目标系统桌面或真实设备验收。
- 本轮 Windows 首次后端检查另有一项合成多设备回调隔离用例超过 5000 毫秒：同源码上次 CI 为 539 毫秒，本次 9075 毫秒，前一用例同时明显变慢。固定 Bun 的本机默认限时十轮分组 30/30 项通过、完整相关文件 39 项通过及 1 项条件跳过，未修改产品或测试限时。单独复跑约八分钟仍未提供任何步骤或日志，后续由本次验证记录提交触发正常推送工作流复验。既有 macOS 通知依赖许可问题已在后续远端构建通过；未连接真实游戏、调用模型或发布发行包。

### 本次两个工作树整合（Windows x64，2026-10-25）

- 从 `dev@7cb85d0` 整合当前两个 worktree：主目录 14 个未提交文件保存为 `535b0f5`，工具箱 3 个未提交文件保存为 `0aca055`，经 `96dc747` 合入。工具箱源码及验证段与主目录完全相同；状态文档冲突保留全部四组新记录，合并结果整树与主目录保存提交一致。新增整合文档前复核 17 份来源文件 SHA-256 全部不变，来源提交均为 `dev` 祖先；分支和工作树保留，[整合证据](integration-audit.md)。
- 合并后的完整 `pnpm check` 通过：62 项工程、24 项契约、三个工作区 TypeScript 与契约生成同步、4/4 合成 CTest、1,100 项 Bun、Python Ruff/mypy 与 276 项 pytest、Rust fmt/严格 clippy/19 项测试通过；另有 3 项工程、2 项 Bun 按平台条件跳过，3 项 Rust 原生夹具/显式系统测试按日常规则忽略。Bun 用例限时显式采用 30000 毫秒，产品期限和原断言不变。
- `pnpm -r build` 工作区生产构建通过；Edge 作业中心、详情、归属、缓存、工具箱、识别及定时专项 **47/47 项通过**（独立端口 15542、单 worker，1.9 分钟），包含本轮四项新增布局/切换回归，差异空白检查通过。本轮未重复其他页面的全量界面测试。
- 检查仅使用隔离数据、合成设备/worker/社区响应与浏览器 IPC，未发送真实社区评价、操作真实游戏或调用模型，未重建安装器或发布版本。原生 WebView、macOS/Linux、实际休眠唤醒及真实作业仍按对应宿主和显式设备验收。

### 本次作业中心布局与切换修复（Windows x64，2026-10-25）

- 桌面右侧队列加宽为 400px，较窄双栏为 360px；移除整栏的视口高度上限及编辑区嵌套滚动，仅队列列表按窗口高度滚动。执行选项与设备启动区域随页面自然展开，长标题最多显示两行，窄窗继续单栏排列。
- 运行选择与浏览类型分离：切换普通、保全、悖论时保留当前进度、逐项结果、已展开日志和停止入口；后续运行事件不再自动切回原类型。侧栏离开再返回保留浏览类型，明确从历史查看运行时仍定位对应类型，包括近期快照窗口外的记录。
- 按类型同步读取工作区缓存，按类型及页码保留本地作业库，按版本保留已读取的队列资料；后台重新校验期间保留可见内容。首次版本读取显示等待，确认读取失败后才提示不可用；固定页面滚动条占位及作业库最小高度，避免切换时出现旧类型、错误占位及布局跳动。
- 前端 TypeScript 检查与生产构建通过；**37 项作业相关 Chromium UI 测试**通过，含新增四项回归：跨类型持续监控与历史导航、延迟响应下逐帧检查三类缓存及两组选项卡位置、首次版本等待与失败区分、长队列单一滚动与宽度。已检查 1440×900 浅色、1280×800 深色和 390px 窄窗截图，960px/390px 无页面横向溢出。
- 验证仅使用隔离浏览器夹具与合成执行，未连接真实设备、发送社区评价或调用模型；未重新构建安装器、发布版本或验收 macOS/Linux。下一步仍需在目标桌面 WebView 和用户明确选择的真实作业中复验。

### 本次 Release 简短条目规范（Windows x64，2026-10-24）

- 更新 [.skill/maa-verge-release-notes/SKILL.md](../.skill/maa-verge-release-notes/SKILL.md) 与配套模板：保留下载表，亮点改为可选，新增、改进、修复等默认每项一句并合并相关变化；他人 PR 的变更在条目末尾标注经核实的 PR 编号与 GitHub 作者链接。
- skill-creator 的 `quick_validate.py` 与 `git diff --check` 通过；复核模板下载表、署名占位与折叠结构。本轮仅维护规范、模板和状态记录，已有版本说明及线上 Release 未修改；后续版本按新规范撰写。

### 本次工具箱排版优化（Windows x64，2026-10-24）

- 工具箱内容区统一桌面 32/24px、窄窗 18px 留白，修复“仓库”等分类标题紧贴导航分隔线；配置、执行状态及识别结果改为统一边框区块，设备栏与页面标题对齐。工作区填充剩余高度，空结果页不再因漏扣设备栏而额外滚动。
- 窄窗保留横向分类导航；识别客户端独占一行，刷新与开始按钮并列且不拆字；工具进度条独占一行。样式限定工具箱，未修改设备控制、识别及执行逻辑。
- 前端 TypeScript 检查与生产构建、10 项 Edge 工具箱/识别/定时界面回归通过；使用合成 IPC 检查六类工具和 320–1440px 七档宽度，无工具箱横向溢出，并检查桌面浅色/深色、390px 窄窗及空状态截图。
- 本轮仅验证 Windows 浏览器合成夹具，未连接真实设备、重新构建安装器或发布版本；原生 WebView 及 macOS/Linux 展示仍需对应环境验收。

### 本次作业导航空值提交修复（Windows x64，2026-10-24）

- 修复普通作业未填写导航覆盖时生成 `nav_name_override: null`，导致 MaaCore 报 `cannot convert to string, expected=string, type=null`、任务提交即失败的问题。新作业省略该可选字符串，由核心使用地图默认导航；显式填写的覆盖值继续保留。
- 旧任务表仍接受已保存的空值，仅在发送原生任务的副本中省略；原配置、运行快照和未知扩展不改写，Python 参考保持相同转换。没有自动重放已失败或结果未知的运行。
- 使用拒绝空值覆盖的合成 worker 验证默认单项、多项混合覆盖和旧任务表提交，补充参数生成、配置/快照保留及 TypeScript/Python 对照回归。完整 `pnpm test:runtime`（限时 30000 毫秒）为 **1,100 项通过、2 项平台条件跳过**；三个工作区 TypeScript 检查、契约生成同步、Python Ruff/mypy 与 **87 项任务策略测试**通过。
- 本轮只使用隔离数据和合成设备/worker，未操作真实游戏、提交社区评价或调用模型；未重新构建安装器或发布版本，真实作业及 macOS/Linux 尚未实机复验。

### 本次四个工作树合入 dev（Windows x64，2026-10-24）

- 以 `dev@8a195c5` 为基线，整合作业中心重构、详情与社区缓存、赞踩和单次地图导航，以及 macOS CI 通知依赖许可修复；许可工作树原有五个未提交文件先保存为 `4d881b9`。工具箱工作树已包含于基线。四个登记 worktree 的 HEAD 与原主目录功能分支均为合并结果 `2924ee1` 的祖先，来源工作树均干净，分支与目录保留；[来源与冲突处理](integration-audit.md)。
- 合并后的完整 `pnpm check` 通过：62 项工程、24 项契约、三个工作区 TypeScript 与契约生成同步、4/4 合成 CTest、1,094 项 Bun、Python Ruff/mypy 与 276 项 pytest、Rust fmt/严格 clippy/19 项测试通过；另有 3 项工程及 2 项 Bun 按平台条件跳过，3 项 Rust 原生夹具/显式系统测试按日常规则忽略。Bun 用例限时显式采用 30000 毫秒，产品期限及断言保持原设置。`pnpm -r build` 工作区生产构建通过。
- 完整 `pnpm test:e2e --workers=1` 的 **185/185 项 Edge 界面回归**通过（隔离端口 15541，6.8 分钟），包含作业中心、缓存/过期竞态、地图导航、任务表自动保存、设备互斥、工具箱、每日定时及窄窗交互；差异空白检查通过。
- 本轮检查使用隔离数据、合成设备/worker/社区响应及浏览器 IPC 夹具，未提交真实社区评价、操作真实游戏或调用模型；未重建安装器或新增 macOS/Linux、原生 WebView、实际休眠唤醒及真实作业验收。macOS 双架构完整 CI 构建仍需工作流复验。

### 本次社区缓存与作业中心闪烁修复（Windows x64，2026-10-24）

- 社区搜索增加当前界面会话缓存（5 分钟，40 组/4 MiB），按类型、来源、关键词、适用关卡、页码及资源版本隔离；合并相同在途请求，切来源、分页和离开页面再返回均复用结果，保留搜索条件、页码及列表位置。过期时保留旧结果并后台更新；提供手动刷新，失败可重试且不清空已有结果。
- 社区作业与作业集预览缓存 10 分钟，10 组/8 MiB；含部分失效成员的集仍可复用有效预览，全失败不缓存，详情与集提供显式刷新。服务端预览过期/淘汰时重新解析并核对所选位置的内容哈希与来源，相同才继续导入，变化则停在新预览供核对；保留未导入成员的选择。评价来源过期会使缓存失效，可重新打开或刷新恢复；评价读写不由此缓存复用，也不自动重放赞踩。
- 修复搜索时「列表→加载提示→列表」的高度塌缩；读取详情的提示改为浮层，主区和队列不再被推移；已有设备检查结果时，运行事件仅后台刷新占用，不反复禁用开始按钮、插入检查提示。切换设备或连接状态仍显式检查，启动继续由服务端校验互斥。本地同页刷新保留列表，分页/类型切换不先闪空库。
- 最终 Chromium 作业中心、详情、归属及新增缓存/竞态回归 **33/33 项通过**（新增 10 项；单 worker、隔离端口 15461，串行复核避开本机并行环回连接的 EADDRINUSE），三个工作区 TypeScript 与前端生产构建通过，差异空白检查通过；检查了社区列表与 1360px/1050px/390px 浅深主题详情截图。缓存只保存在当前界面内存，重新加载界面或重启后重新读取。
- 本轮使用隔离 IPC、社区、设备和运行夹具，未访问真实社区评价、连接游戏或调用模型；未运行完整跨语言 `pnpm check`，未重新制作安装器。真实 Windows WebView、macOS/Linux 仍需各自验收。

### 本次作业中心重构、作业集与社区评价（Windows x64，2026-10-24）

- 作业中心从常驻三列改为宽主区与执行队列，顶部类型标签与标题对齐；详情替换列表，返回保留搜索、分页、滚动与焦点。设备与开始按钮固定在队列底部，复杂选项按需展开，窄窗顺序排布。社区作业集提供独立入口、成员顺序、逐项查看/选择、全选可用项、批量入队及所属作业集返回入口。
- 社区作业无需先导入即可查看说明、干员头像、技能和练度；头像复用已安装资源，缺失时保留固定占位。干员编组保留组内任选语义，兼容修正旧版展平元数据；来源、内容署名与上传者分别保留，原 JSON 和署名导出不变。
- 接入真实匿名赞踩及取消评价，使用已校验条目和不可变版本定位社区来源。每类队列新增默认关闭的通关后自动点赞开关，只按启动快照与明确成功证据触发，永不自动点踩、不覆盖手动点踩；持久去重、未知结果不重放，评价失败不改变运行结果。退出立即取消请求、阻止排队提交；并发手动评价保护最新意图。[接口与边界](copilot-feedback.md)。
- 核查 MAA v6.20.0／v6.20.1：普通单次队列含单项均使用原生列表从同一区域地图导航，突袭与导航覆盖同样对单项生效；显式单份循环保留文件模式与编队起点。保全、悖论分别提示「开始部署」与手动选技能后的「开始模拟」，不要求所有队列停在干员选择页。[启动依据](copilot-startup.md)。
- 最终合并代码的 Chromium 作业中心/详情/归属 **23/23 项**、固定 Bun 1.4.3 的作业库/运行/评价/生命周期 **97 项通过、2 项条件跳过**，18 项契约验证、生成同步、三个工作区 TypeScript 与前端生产构建通过；已检查 1360px、1050px、390px 浅深主题及干员区域截图。跳过项为缺少已构建原生合成帧夹具及 Windows 不支持可移植 SIGTERM。
- 本轮使用隔离数据、合成社区/设备/Worker 及 IPC 夹具；仅只读核查公开接口与源码，未提交真实赞踩、连接真实游戏、调用模型或制作安装器。未运行完整跨语言 `pnpm check`；原生 WebView、真实地图导航/通关与匿名跨网络评价、macOS/Linux 仍需各自验收。

### 本次 macOS CI 通知依赖许可修复（Windows x64，2026-10-24）

- `mac-notification-sys@0.6.15` 的 crates.io 发布清单遗漏许可正文，导致两个 macOS 目标在收集运行时许可时失败。核实归档 SHA-256 与 Cargo.lock 一致后，按 `.cargo_vcs_info.json` 的固定提交补充完整 MIT 正文、原始版权、来源和哈希；保留未知缺失、版本变化及正文篡改时的拒绝机制。
- 扩展锁文件驱动的 macOS 双架构回归，修复前准确复现同一缺失错误。Windows 上 51 项发行、许可及安装器相关测试通过，1 项真实 codesign 用例按平台跳过；离线解析真实锁定依赖图并收集许可，macOS arm64/x64 各 249、Windows x64 226、Linux x64 285 个运行时 crate 及 Rust 标准库均通过，macOS 产物包含通知库完整正文及来源。
- 本次验证仅覆盖许可收集和相关合成测试，未重新构建桌面安装包或执行远端 CI；macOS 两个宿主的完整构建仍需工作流复验。不操作真实设备、游戏、模型或账号数据。

### 本次全部工作树合入 dev（macOS arm64，2026-10-24）

- 核对主目录及八个附加 worktree，将主目录和三个脏来源的未提交源码、测试及文档保存为四笔提交，再合入本地 `dev`。作业中心、社区归属、执行队列、中文错误与连接诊断、指定材料开关、macOS 签名及插件调研全部保留；[来源与去重证据](integration-audit.md)。全部九个 worktree 的来源 HEAD 和四笔保存提交均为 `dev` 祖先，来源八个目录的 3,306 个文件 SHA-256 与整合前完全一致。保留分支、工作树、本地配置与工具链接。
- 集成验证确认并修复动态模块失败被通用网络错误转换的问题，恢复原有“重新加载界面”入口；新增三浏览器错误文本经过 transport 包装后的回归，普通网络错误提示保留。窄窗右键菜单测试等待 resize 渲染完成再打开菜单；设置、模型、下载器、多开、侧栏任务和调度测试等待实际保存完成，更新检查、日志导出及连接测试等待请求进入后再核验或释放，保留原业务断言、超时及重试次数。
- 最终完整 `pnpm check` 通过：62 项工程通过、3 项跳过，23 项契约通过，三个工作区 TypeScript 与契约生成同步通过，4/4 合成 CTest、1,063 项 Bun 通过（另 9 项条件跳过）、Python Ruff/mypy 与 276 项 pytest、Rust fmt/严格 clippy/19 项测试通过（另 2 项忽略）。用例限时显式采用 30000 毫秒，产品期限及业务断言不变；此前记录失败的自定义 aria2 夹具在本轮两次完整检查中均通过。
- 最终 Chromium 全量 166/166 通过（两个 worker、隔离端口 15429），前端与 TypeScript 工作区生产构建 `pnpm -r build` 通过。此前全量暴露的模块恢复、resize 与异步保存/请求竞态均已修正，相关 16、14、21 项专项分别通过，最终冻结代码上的完整回归通过；新增 Node 脚本、CI shell 语法与差异检查通过。
- 本轮只使用隔离数据、合成 worker/设备/网络响应与 Chromium IPC 夹具；未连接真实游戏、调用模型、下载真实组件、重新构建安装器、推送或发布。本机结果不代替 Windows/Linux、Intel、最低系统、原生 WebView、实际安装升级与真实设备验收，后续仍按目标平台及用户明确选择的设备执行。

### 本次 macOS「应用已损坏」修复与安装门禁（macOS arm64，2026-10-24）

- 核验用户下载的公开 v0.1.1 Apple Silicon DMG：SHA-256 为 `3a9df8e51182c4b172bd03fbf7b37c4d1ee47349015611c8c201119ff7a52d65`，与官方登记一致，`hdiutil verify` 通过。三个包内子进程签名有效，但整个 `.app` 缺少 `Contents/_CodeSignature/CodeResources`，`codesign` 与 `spctl` 报资源封装缺失；主程序只有链接器临时签名。
- 显式启用 Tauri 免费 ad-hoc 应用签名，在 DMG、更新归档及更新签名前生成完整资源封装；保留 Bun、worker、aria2c 各自权限，并在构建完成后严格验证。普通和发行 CI 的 Apple Silicon / Intel job 均接入最终 DMG 的隔离安装、签名验证、真实窗口及包内服务启动、原生退出与进程清理门禁；发行还要求更新归档存在且其程序/签名封装与原应用一致。检查失败禁止上传，保留诊断。
- 本机使用公开 v0.1.1 的原始主程序与资源，通过锁定的 Tauri CLI 重新打包 `.app` / DMG，完整应用签名通过，三个子进程字节哈希保持一致。实际从最终 DMG 复制安装后，在隔离数据、设备锁、日志与 Foundation 用户目录中模拟放行，真实窗口、包内服务启动和正常退出清理通过。首次 smoke 因 `/var` 符号链接触发 Tauri `unknown path`，测试目录改为真实路径后通过，未放宽产品路径安全策略。
- 另用一次性测试更新密钥生成真实 Tauri `.app.tar.gz` 与签名，发行模式的归档解包、签名/字节一致性及安装启动/退出四阶段门禁全部通过；测试密钥已删除，不使用生产更新私钥，该测试签名不用于公开发行。21 项发行/签名相关测试通过，包含真实 codesign 的缺失封装拒绝、资源篡改拒绝、子进程签名损坏拒绝及权限保留；两个工作流 actionlint、CI shell 与新增 Node 脚本语法、差异检查通过。本次只验证重打包，不声称已从当前全部源码重新构建；未连接设备、下载 MaaCore、调用模型或发布/覆盖发行资产。
- 当前仍无 Developer ID 或 Apple 公证，`spctl` 对 ad-hoc 包仍拒绝；首次安装需要用户明确放行，[处理步骤](app-updates.md#macos-签名与首次放行)。本机 macOS 26.6.2 / arm64 的安装启动结果不代替 Intel、macOS 13.5 最低版本、真实系统放行界面或远端 Actions 成功记录；后续新版本须在两个 macOS job 实际通过后发布。

### 本次独立作业中心与社区归属（macOS arm64，2026-10-24）

- 按 [作业中心计划](copilot-center-plan.md) 实现独立库及普通/保全/悖论工作区，本地 JSON、编号/链接、PRTS Plus 作业及有序作业集搜索、预览和逐项导入，重复队列条目、分页、参数保存、独立启动/停止与逐项反馈。新作业不创建普通或隐藏任务表；旧作业任务继续编辑、执行并可显式复制，主页/运行条/历史按来源导航。
- 原始 JSON 以 SHA-256 不可变保存，运行固定文件、队列及客户端快照，持久去重发生在原生效果前；与任务表、工具、手动操作及更新共用设备控制权。普通多份使用原生 `copilot_list`，保全限单份，悖论走专用任务。文件加载、任务完成和通关分别处理；保全、循环或缺少完整战斗证据时显示未确认，停止/断线/重启不重放未知动作。
- 根据许可核查区分社区上传者与内容署名，兼容纠正旧记录；中心及设置披露服务提供方、联网和内容归属，保留原站/参考视频与原 JSON。导出额外附 `.attribution.json`，记录版本和来源，不推定 AGPL 或已获转载授权。[NOTICE](../NOTICE.md) 与[版权说明](copilot-attribution.md)纳入随包许可，代码许可、在线服务和作者内容授权分别说明。
- 冻结提交 `2c06540` 的隔离工作树与该提交整树一致：Chromium 完整 **161/161 项 UI**、其中作业中心/归属 **14/14 项专项**、最后前端生产构建通过；浅深主题及 390px 窄窗已检查。冻结树另有 **72 项后端**、**17 项契约**和 **12 项声明打包测试**通过；生成同步及三个工作区 TypeScript 检查通过。使用固定 Bun 编译最终服务，空 PATH 下验证原始 BOM/格式及署名文件导出、独立队列保存、重启恢复和 EOF 清理，未生成计划、设备或执行。
- 首轮完整 `corepack pnpm check` 通过：60 项工程测试（3 项跳过）、14 项契约、4/4 CTest、1031 项 Bun（9 项条件跳过）、Python Ruff/mypy 与 276 项 pytest、Rust fmt/严格 clippy/19 项测试（2 项忽略）。补正后的共享工作树综合复核为 1050 项 Bun 通过、9 项跳过、1 项既有 aria2 自定义可执行文件探针失败；其 `--version` 内部固定 5000 毫秒期限未因 `MAAVERGE_TEST_TIMEOUT_MS=30000` 而改变，未修改产品期限或断言。25 项下载专项曾单独通过；最后完整检查仍记录为失败，不以专项替代。
- 共享工作树同时有其他任务未提交的错误提示、参数表单等变更，本轮提交按文件/片段保留并排除它们。该共享树额外 UI 复核为 165 通过、1 失败：模块加载错误被其未提交错误转换显示为网络错误；与上述冻结代码的 161 项全通过分开记录。
- 验证仅使用隔离数据、合成设备/worker/社区响应，关闭自动连接和组件下载；未连接真实游戏、调用付费模型、上传账号数据、构建安装器或发布。真实作业、六客户端、原生 WebView 及本轮 Windows/Linux 行为仍待显式选择后验收；社区账号、发布、作业编辑器与离线视频继续后续实现。

### 本次指定材料独立开关（macOS arm64，2026-10-24）

- 自动作战「指定材料」增加独立开关；新任务默认关闭，旧任务已有材料目标时保持启用。关闭后禁用目标编辑并保留材料和数量，保存、刷新及重新启用均可恢复。
- 应用参数 `drops_enabled` 随任务保存；关闭时仅在核心执行副本中清空 `drops`，开关本身不透传 MaaCore。前后端严格检查布尔值，显式 Python 参考路径采用相同转换；无需数据库迁移。
- 三个工作区 TypeScript、契约同步、Python Ruff、377 项 Bun 策略/参考一致性测试及 4 项 Chromium 合成界面回归通过，覆盖默认关闭、旧配置、关闭后保存刷新及重启用。未运行完整跨语言 `pnpm check`，未操作真实设备或验收 Windows/Linux、原生 WebView；真实游戏停止条件仍需显式设备验收。

### 本次页面具体错误与连接诊断（macOS arm64，2026-10-24）

- 页面优先显示已确定的中文原因和操作建议，结构化及嵌套错误提取具体反馈，去掉重复错误前缀；设备页操作结果直接显示原因，多开历史错误、跨页更新通知、工具及定时错误沿用同一转换。错误码、原始 data/cause 继续保留，中文主提示已完整时不重复拼接原始错误。
- 连接前置异常不再隐藏在通用“设备连接失败”后；按 worker 暂存 MaaCore ConnectionInfo 诊断，最终连接回调使用具体原因并清除旧错误。原生进程从有界 stderr 尾部提取固定初始化/超时诊断，原始日志保持字节内容；普通连接失败或非 ADB 程序错误不会直接判断 ADB 未开启。
- 主工作区三个工作区 TypeScript、契约同步、5 项错误转换、31 项相关 Bun 回归及 30 项 Chromium 合成界面回归通过，前端生产构建通过；相关 Bun 回归另有 2 项 Windows/native 条件用例跳过。独立工作树的完整 Bun 回归以显式 15000 毫秒限时通过 978 项、跳过 22 项。
- 主工作区运行项目完整 runtime 检查（显式 30000 毫秒用例限时）为 1050 项通过、9 项条件跳过、1 项失败：既有自定义 aria2 夹具的 `--version` 调用在内部 5000 毫秒期限内未结束，单独复测仍超时；下载器、该用例及其依赖配置文件本次均未改动，未调整原期限或断言。未运行完整跨语言 `pnpm check`，未操作真实设备、下载真实组件或验收原生 WebView；Windows/Linux 行为仍需对应宿主验证。

### 本次默认触控方式调整（Windows x64，2026-10-24）

- 新建连接、缺省连接配置及前端设置的默认触控方式统一为 `maatouch`，下拉框标记 MaaTouch 为默认；保留已明确保存的触控方式。
- 固定 Bun 1.4.3 的连接、自动截图和多开相关合成测试 26 项通过、1 项原生共享租约测试跳过；前后端 TypeScript 检查通过。未操作真实设备或验收其他平台。

### 本次工具箱、定时与自动保存工作树整合（Windows x64，2026-10-24）

- 顶栏精简、任务表自动保存和右键菜单保存为 `bc88fe6`；独立工具箱、每日定时、桌面通知与 Windows 唤醒保存为 `7ba34df`，通过 `64d4544` 合入 `dev`。冲突同时保留自动保存期间继续编辑、右键入口、新定时页和各自的验证记录；两笔源提交均为 `dev` 的祖先，源分支和工作树保留，46 个源工作树文件的 SHA-256 未变。
- 合并后的完整 `pnpm check` 通过：61 项工程、11 项契约、三个工作区 TypeScript、4/4 合成 CTest、992 项 Bun、Python Ruff/mypy 与 276 项 pytest、Rust fmt/严格 clippy/19 项单元测试。2 项工程及 2 项 Bun 用例按 Windows 条件跳过，3 项 Rust 原生夹具/显式系统测试按日常规则忽略；本机 Bun 用例限时显式采用 30000 毫秒，默认设置和断言保留。
- 首轮 Edge 界面回归通过 145 项，另两项分别在菜单位置调整前读取坐标、在未滚动的行检查按需加载头像。补齐布局等待与滚动、推进受控时钟后，17 项相关回归及最终完整 **147 项**界面回归全部通过；菜单边界、头像实际解码及其余原断言保留。
- Windows x64 Bun 独立编译/运行探针、重新编译的包内服务 RPC/持久化/EOF、实际 aria2 回环下载/摘要拒绝/取消、合成更新和 Rust transport 冒烟，以及前端生产构建通过。本地 aria2 缓存因构建配方不匹配被拒绝后，保留旧缓存，并通过既有准备脚本重新验证固定来源与可执行文件摘要后生成新缓存。
- 本次只整合监控建立时的开发批次；后来新增的 MaaTouch 默认值修改及作业中心规划保留为本地未提交内容。检查使用隔离数据、合成设备和关闭自动连接/组件下载的夹具；未连接真实游戏、调用付费模型、重建桌面安装器或发布版本。真实休眠唤醒、通知呈现、升级安装及 macOS/Linux 实机行为未在本次复验。

### 本次任务表自动保存与右键菜单（Windows x64，2026-10-24）

- 任务参数、名称、说明、分组、设备绑定与启停自动保存；移除常规手动保存和开始时的旧配置选择菜单，保留 Ctrl/⌘ S 立即保存、失败重试及 Agent 提案的明确保存。按表串行保存/删除，删除等待已有写入完成，避免表被晚到请求恢复；删除其他表保留当前选择。
- 任务表、队列、设备/多开、执行/历史与作业行提供右键入口，继续沿用按钮和 RPC 的运行限制；任务表删除仍需确认，执行历史保留。
- 前端 TypeScript 检查与生产构建通过；Edge 完整界面回归 **139 项**、自动保存与菜单专项 **12 项**通过（其中 9 项包含在完整回归中）。覆盖保存期间继续编辑、快速切表、失败重试、无效 JSON、写入期间删除、新建自动保存/取消、Agent 明确确认、菜单操作/禁用、作业重复任务精确定位、键盘与视口边缘定位。已检查浅深主题窄窗菜单截图；原生 WebView smoke 脚本语法检查通过。
- 浏览器使用隔离合成 IPC 夹具，不操作真实设备、账号、组件下载或付费模型。未验收原生安装包及 macOS/Linux 实机行为。

### 本次顶栏文案精简（Windows x64，2026-10-24）

- 移除顶栏固定的“默认工作空间”“本地运行”文案、文件夹图标和分隔线，并清理对应样式及旧标签测试断言；原生 WebView smoke 改为确认设备选择可见。
- 两次精简后均通过前端 TypeScript 检查与生产构建；首轮 4 项 Edge 顶栏与窗口控制回归通过，第二轮 4 项 Edge 主页导航、窄窗、搜索与窗口缩放回归通过。原生 WebView smoke 脚本语法检查通过。
- 本轮仅验证浏览器合成夹具，未重新构建发行安装包；原生 WebView 与 macOS/Linux 实机展示未复验。

### 本次工具箱与每日定时（Windows x64，2026-10-24）

- 本节记录未发布的开发工作树。六类工具使用独立 ToolJob，先选设备、查询控制权，再开放配置和执行；整表执行、工具、人工调用及更新切换共用独占检查。公招结果也须成功及核心空闲后替换，失败保留上次成功结果。干员头像从已激活资源按 ID 按需加载，缺图/解码失败保持固定占位，资源切换后重新读取。
- 独立每日定时支持八组以上、目标任务表/设备编辑、临时启停、普通忙时跳过、强制倒计时取消及安全接管、跨午夜准备/通知、冲突处理、重启去重及错过不补跑。Windows 使用按程序路径和数据根隔离的任务计划程序唤醒；隔离注册/修改/清理测试通过。
- 全量 134 项浏览器界面测试通过；最后的工具箱/定时五项专项均通过，覆盖迟到设备响应、忙时只读、头像失败及资源更新、八组定时和取消失败的界面反馈，其中设备选择专项曾出现点击超时，单独重跑通过。前端生产构建、Bun 单文件服务编译及 Windows Rust 发布模式构建（`tauri build --no-bundle -- --locked`）通过。
- 最终检查定位并修复内置下载器的取消竞态：网络空闲计时避开本地文件准备/写入，流监听器绑定前已取消也能及时结束；25 项下载专项通过。测试运行器支持可选 `MAAVERGE_TEST_TIMEOUT_MS`，默认保持 5000 毫秒，本机最终串行验证使用 30000 毫秒，断言及产品超时不变。
- 最终完整 `pnpm check` 通过：61 项工程测试（另 2 项按 Windows 条件跳过）、生成契约检查、三个工作区 TypeScript、4/4 合成 CTest、992 项 Bun（另 2 项按 Windows 条件跳过）、11 项契约、Python Ruff/mypy 与 276 项 pytest、Rust fmt/严格 clippy/19 项单元测试通过（日常规则忽略 3 项原生夹具/显式系统测试）。编译服务的 RPC/持久化/EOF、包内 aria2 回环下载/校验/取消、合成核心更新及 Rust transport 冒烟通过。
- 最终代码重新编译独立服务，重复包内服务与 Rust transport 冒烟通过；Windows 完整 Tauri 打包生成 NSIS EXE（54.58 MiB）与 MSI（66.95 MiB）。产物沿用当前开发版本号 0.1.1，仅用于本地验证；未进行安装升级或发布，不含应用更新签名产物。
- 定时启动的原生 release WebView/单实例冒烟通过，覆盖隔离数据根启动、重复唤醒进程转交退出且仅保留一个服务、本地提案保存、重启恢复和窗口退出清理。测试入口在启动前检查并拒绝操作既有用户实例。实际休眠唤醒、桌面通知呈现、真实游戏及 macOS/Linux 桌面仍须单独验收；常规验证使用隔离数据和合成设备。

### 本次组件修复与 CI 工作树整合复核（Windows x64，2026-10-24）

- 组件更新修复提交为 `2abfc83`，Linux CI 容器改动提交为 `7e2068f`，两组改动已合入 `dev`；状态文档冲突同时保留两组验证与 v0.1.1 正式发布记录，原功能分支和工作树保留。
- 合并后的完整 `pnpm check` 通过：61 项工程测试、11 项契约、三个工作区 TypeScript、4/4 合成 CTest、971 项 Bun、Python Ruff/mypy 与 276 项 pytest、Rust fmt/严格 clippy/17 项单元测试通过。2 项工程及 2 项 Bun 用例按 Windows 条件跳过，Rust 包内 transport 与内部子进程夹具按日常规则忽略。
- 9 项 Edge 组件更新回归、全部工作流 actionlint、两个 CI shell 脚本语法、Docker Linux x64 镜像缓存构建与合并差异检查通过。测试使用隔离数据和合成设备；本次没有重复 Linux 完整打包、远端 Actions 或其他平台桌面验收，未连接真实游戏、调用模型或发布版本。

### 本次组件更新重复启用修复（Windows x64，2026-10-24）

- 修复后台已自动启用核心或独立资源后，点击界面尚未刷新的「应用更新」按钮报「没有已经校验的候选快照」：只有最新版本与当前版本一致、活动快照完整性通过、核心频道或资源依赖仍匹配时，重复启用才返回已生效状态，不重复切换 worker，也不改写回滚组合。
- 启用前候选文件缺失、内容变化或依赖的核心版本变化时仍拒绝切换，并提示重新下载或准备资源。操作失败后界面立即重读状态，移除失效的应用按钮，保留具体错误提示；频道取消、回滚后的旧版本和核心附带基础资源不会被当作目标更新已生效。
- 三个工作区 TypeScript 检查通过；完整 Bun 后端回归 **971 项通过、2 项 Windows 不适用用例跳过**，包含并发与重复启用、候选和活动文件损坏、同版本修复、频道变更及核心取消资源候选。**51 项 Edge 更新与工作台界面回归通过**；收紧时钟控制后新增两项再次通过，冻结轮询且不发送更新事件，确认失败分支主动刷新按钮。
- 验证使用隔离数据、合成核心和下载源，未连接真实游戏、下载真实组件或重新打包安装版；macOS/Linux 与原生 WebView 的本次交互尚未验收。

### v0.1.1 正式发布（2026-10-24）

- [Maa Verge v0.1.1](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.1) 已于北京时间 2026-10-24 00:54:22 公开，GitHub 最新版本接口确认 `draft=false`、`prerelease=false`。发行标签与全部安装包固定在 `6c2d93fc4654bfe55bd152b01bae83b597250fc5`；`main` / `dev` 在该提交同步后构建，发行后仅补记状态及文档入口，继续同步两个分支，不移动已发布标签。
- [第六轮签名发行工作流](https://github.com/DeathofBrain/maa-verge/actions/runs/39987235741) 全部成功：Windows Server 2022、Ubuntu 22.04、macOS Apple Silicon 和 Intel 均通过完整检查、生产构建、更新签名及收集。Windows 的真实下载器准备通过，EXE 54.39 MiB、MSI 66.64 MiB 均生成成功，源码许可提取超时不再发生。包内服务持久化 / EOF、aria2 回环下载 / 摘要拒绝 / 取消、合成更新和 Rust transport smoke 通过。工程检查按宿主跳过不适用用例，安装器清理测试在此签名工作流检查时仍因工具尚未准备而跳过；没有将跳过项记为通过。
- 从草稿下载完整十八附件，共 735,639,475 字节；逐项验证其余十七文件的 SHA-256、全部七份真实更新签名与版本绑定、五个更新目标、安装器 / 架构及清单规范格式。GitHub 登记的十八份 digest、大小与实际字节相符；应用内清单说明、线上 Release 正文与提交中的完整中文说明一致，未被截断。公开后使用正式元数据再次完整复验通过。
- README 和 Release 的七个安装包及校验清单直链均通过匿名 HEAD：八项全部返回 200，长度与资产登记一致；本地拉取 `v0.1.1` 标签后确认提交与构建 SHA 一致。README、升级说明和完整分类变更按项目 skill 发布，原 v0.1.0 预发布及资产保留。
- 远端四宿主构建 / 自动 smoke 不包含交互安装升级、最低系统、macOS / Linux 实际桌面或真实游戏操作验收。此前本地 Windows 原生 release WebView 的启动、保存、重启和退出 smoke 已通过，仍未进行真实升级安装；本轮未连接游戏、下载 MaaCore / 游戏资源或调用模型。更新签名不代表 Windows 发布者签名或 macOS 开发者签名 / 公证。

### Linux CI 构建镜像（Windows x64 / Docker Linux x64，2026-10-24）

- 新增 Ubuntu 22.04 x64 构建镜像，按仓库版本文件准备 Node、pnpm、Bun、Python 与 Rust，固定 uv、CMake 和 rustup，预装 Tauri 原生库及锁文件对应的 Chromium。Docker 上下文采用允许列表，实际初次传输约 61 KB；不包含本地业务数据、配置、依赖缓存或签名密钥。[镜像使用与本地复现](ci-image.md)。
- application、Linux 原生矩阵及手动发行的 Linux 构建共用 Buildx 镜像与 Actions 层缓存；项目依赖保持 frozen/locked，按宿主 UID/GID 写出产物，依赖与 Cargo 缓存留在 checkout。首次 CI 可直接从源码构建，无需预先发布镜像；Windows/macOS 宿主步骤保留。签名变量仅在发行容器运行时传入，原始 Ubuntu 后端 smoke 继续由宿主执行。
- 本机 Docker Desktop Linux/amd64 实际镜像构建、缓存命中重建、非 root 工具版本与 `doctor --native` 通过；固定 Bun 独立运行探针、4/4 合成 CTest 及原生夹具下 958 项 Bun 测试通过（9 项按平台或夹具条件跳过）。应用任务的 60 项工程测试（3 项跳过）、11 项契约、三个工作区类型、951 项 Bun（16 项缺少原生夹具或平台条件跳过）、Python Ruff/三目标 mypy/276 项 pytest、前端构建及 128 项 Chromium 回归通过。
- Rust fmt、严格 clippy、17 项单元测试通过（日常检查忽略的两项夹具中，包内 transport 随后单独通过）。完整 `pnpm build` 通过，生成 AppImage（180.11 MiB）、DEB（109.44 MiB）、RPM（109.45 MiB）；编译服务、真实包内 aria2 回环下载/摘要拒绝/取消、合成更新及 Rust transport smoke 通过。Windows 宿主 Node 驱动原始 Ubuntu 22.04 容器的后端 smoke 通过：无 Python/Node/Bun/全局 aria2、空 PATH、断网会话、持久化及 EOF 重启均已检查。
- 本机高并发首轮遇到 Docker daemon 重启，两个容器同时中断，恢复后发现一个临时 C++ 构建文件为空；清理该临时构建重新生成后原生检查和完整打包通过，浏览器固定两 worker 后全量通过。验证采用独立 Linux 卷、临时数据与合成设备，未连接游戏、下载 MaaCore/游戏资源、调用模型或发布工件。远端 Actions 缓存与签名发行尚未运行，不据本机容器结果声明 Windows/macOS、Linux 桌面或交互安装验收。

### Windows 下载器构建修复与第三方源码入库（2026-10-24）

- 第五轮 [v0.1.1 签名工作流](https://github.com/DeathofBrain/maa-verge/actions/runs/39982765196) 在 `6e6a8f7765c17d356520714cd48763bd3c118c92` 上通过四宿主完整检查，Linux 与 macOS 双架构的签名构建、收集及上传完成；Windows 在系统 tar 读取真实 `aria2-1.37.0.tar.xz` 的 `COPYING` 时等待 180 秒超时，未生成正式 Release。小型 XZ 夹具通过不能证明该真实输入可用；本机强制使用外部 XZ 过滤器也复现小夹具通过、大归档超时，未将本机复现当作 Windows Server 2022 内部实现的直接证据。
- 按用户要求将 aria2 及所需依赖的八份完整源码归档、三份 GCC / MinGW 来源文本和二十份许可声明纳入 `3rdparty/aria2/`。十一份原始来源共 64,794,916 字节，来源 URL、归档成员及摘要由清单记录；保持上游原始字节与版本，Windows 官方预编译 ZIP 仍独立按固定摘要下载。源码从仓库读取，许可校验后直接复制，Windows 准备过程不再解压源码归档；Linux / macOS 编译仍正常解包源码。
- 新增来源与许可缺失、损坏、来源清单变化和缓存不能绕过校验的回归；本机下载器准备专项 17 项及整合后的下载器 / 许可专项共 28 项通过。独立目录的完整 Windows 准备及缓存复核通过，真实调用仅系统 tar 提取官方 ZIP 的 EXE 和程序版本检查，无源码许可提取；十一份来源与二十份声明经独立原归档比对及 Git 对象原始字节复核通过，EXE 固定摘要不变。发行工作流将 Windows 下载器准备前置到完整检查之前；actionlint、脚本语法与 `git diff --check` 通过。修复后的 Windows Server 2022 完整打包与正式发行结果随后记录，不依据本机检查声明已发布。

### v0.1.1 正式发行准备（Windows x64，2026-10-23）

- 按用户要求准备 `v0.1.1` 正式版，同步应用、桌面、服务、契约包、Rust、C++ 和 Python 参考的版本元数据；Cargo 与 uv 锁文件由固定工具离线更新，没有升级第三方依赖。修正独立发行解析测试中的旧应用版本常量，继续保留旧版发行资产作为测试夹具。
- 按两个项目 skill 维护 README 与本版更新说明；对照 `v0.1.0` 标签逐域审计最终差异，区分首次提供的功能、原有能力的改进及旧版真实存在的问题。保留 Agent/调度和平台验收限制、手动升级与配置迁移说明，以及用户副标题和 Logo 来源/权利声明。
- 版本升级后的完整 `pnpm check` 通过：52 项工程、11 项契约、4/4 CTest、965 项 Bun、276 项 Python 与 17 项 Rust 测试及类型、Ruff/mypy、fmt/严格 clippy 通过；2 项工程及 2 项 Bun 用例在 Windows 按原规则跳过，Rust 包内 transport 与内部子进程夹具在日常检查中忽略。独立发行解析专项 13 项通过。远端四宿主发行结果与发布状态在实际执行后记录，不据本地检查推断其他平台安装验收。
- 本版完整 Windows `pnpm build` 通过，生成 0.1.1 NSIS EXE（54.40 MiB）与 MSI（66.63 MiB）；随包 aria2 的回环下载、错误摘要及取消、编译服务 RPC/持久化/EOF、合成核心更新和 Rust transport smoke 均通过。临时数据与独立 WebView profile 的原生 release 窗口 smoke 通过，覆盖启动、设置保存、重启和退出。此处本地产物未用于公开签名发行；未交互安装升级、连接真实游戏或下载 MaaCore / 游戏资源。
- README 与 0.1.1 完整发布说明经过独立源码/旧标签复核；七个安装器文件名匹配发行收集器，README 九个本地引用存在，两个文档各两对折叠块及 GitHub GFM 表格渲染通过，详细更新默认展开且版权段在全部折叠块之后。修复条目限定为 0.1.0 已有问题，保留 Agent、调度和平台限制；下载 URL 待远端签名资产生成后再次核对。
- `dev` 与 `main` 已在 `676771a` 首次同步远端，随后启动正式签名工作流。首轮两种 macOS 宿主在开发启动测试中发现 `/var` 与 `/private/var` 临时目录别名比较误报，未进入签名打包；取消该轮，修正测试以真实 checkout 根比较默认数据目录，产品逻辑未改。固定 Node 的四项开发启动测试及 Windows 目录 junction 别名场景通过，显式数据根优先级断言继续保留；后续完整远端结果另记。
- 第二轮签名工作流中 Windows、Linux 和 macOS Apple Silicon 的完整检查通过，Linux 签名构建与附件收集通过；常规 CI 的应用检查及界面回归通过。macOS 打包发现 `objc2-osa-kit@0.3.2` 缺少许可正文，补齐锁文件中同源家族的八个精确版本来源，保留固定提交、原文 SHA-256 和严格失败机制。11 项许可回归与本机四目标锁定元数据许可生成通过：Windows 218、Linux 278、macOS 双架构各 241 个运行依赖，未发现其他许可遗漏；这不是对应平台交互安装验收。
- Windows 第二轮打包与常规 CI 均定位到 GNU tar 将 `D:` 归档盘符解释为远端地址的超时；改为归档目录 cwd 加相对成员读取，ZIP 明确使用 Windows 自带 bsdtar，避免 GNU tar 不支持 ZIP 的后续失败。保留源归档与可执行文件摘要校验；12 项下载器准备回归通过，包含真实 Git GNU tar / Windows bsdtar 二进制归档读取。未更改组件运行时的下载或校验策略。
- 第三轮 macOS 双架构签名构建与附件收集均通过；Windows 的非 ZIP 源码归档仍经 PATH tar 超时，进一步将 Windows 全部归档成员读取固定为系统 bsdtar，并在错误中保留归档名、成员名与原因。13 项回归通过；Git GNU tar 位于 PATH 首位时，七个真实源码归档及官方 ZIP 的固定摘要、15 个原始许可成员、11 个输入源与 26 个输出许可逐字节核对通过；独立临时项目的完整 `ensureAria2` 准备与缓存校验通过，固定可执行文件摘要不变。
- 第四轮 Windows 在新增测试创建 XZ 夹具时发现系统 tar 不支持 XZ 编码选项，尚未进入产品打包；产品只需读取既有归档，改用固定只读 USTAR/XZ 夹具保留真实解码、字节、摘要和缺失成员断言，ZIP/gzip/bzip2 仍实际创建。13 项本机 Windows 专项回归通过；Windows Server 2022 的读取能力随下一轮检查确认，没有跳过该测试或放宽摘要门禁。

### 本次全部工作树合入 dev 与 README 重写（Windows x64，2026-10-23）

- 将八个附加工作树的执行监控、应用签名更新、内置 aria2、Release 说明和停用 GitHub Packages 成果合入 `dev`。主区及三个脏工作树先保存 Git 快照，再集成未提交文件；全部登记工作树 HEAD 与四份快照均为 `dev` 的祖先，来源工作区原有未提交文件的 SHA-256 未变。重复提交以补丁等价、完整文件内容和生成契约核对后记录合并关系，详见[整合记录](integration-audit.md)。
- Rust 同时保留关闭询问、记住选择、异步有时限退出与签名更新门禁；更新重启直接放行，避免再次启动普通退出流程。移除 Packages 工具后，将签名更新仍需的纯发行资产解析与校验迁入 `tools/release-assets.mjs`，保留完整签名集合回归并接入本地及 CI 检查。协议源组合后重新生成类型与校验器；独立发行来源解析器及其测试保留，尚未接入运行时更新服务。
- 按项目 README skill 重写普通 Release 用户入口，增加七个实际安装包直链，精简首次使用和 FAQ，保留用户最新副标题、Agent 暂不可用说明与文末 Logo 来源及权利声明。使用说明仍以公开的 `v0.1.0` 为准，未把 dev 的更新器、执行监控或配置迁移写成已发行功能；保留用户删除设计说明的选择，清除悬空链接。README/skill 的本地引用、锚点、发行标签文档、截图一致性、折叠标签及实际 Release 资产核对通过；两个项目 skill 校验通过。
- 合并后的完整 `pnpm check` 通过：52 项工程测试通过、2 项 Unix 进程组测试在 Windows 跳过；三个工作区类型、契约同步、11 项契约测试、4/4 CTest、965 项 Bun 回归（另 2 项 Windows 不适用跳过）、Python Ruff/mypy 与 276 项 pytest、Rust fmt/严格全目标 clippy/17 项单元测试均通过。Rust 的包内 transport 和内部子进程夹具按日常规则忽略，transport 随后的独立 smoke 已通过。首轮 Bun 有一项子进程测试超过 5 秒，下载器专项 24 项及未改代码的完整重跑均通过；未更改断言或超时设置。
- 前端生产构建、隔离端口 15531 / 两个 worker 的 128 项 Edge 全量界面回归、CI 与发行工作流 actionlint、发行版本预检、固定 Bun 独立编译探针通过。重新打包 Windows 运行时后，空 PATH / 带空格路径下的实际内置 aria2 回环下载、摘要拒绝和取消、服务 RPC/持久化/EOF、合成核心更新作业及 Rust → 编译服务 → C++ 合成租约 smoke 均通过。
- 本轮使用临时数据与合成设备，自动连接和应用/核心/资源下载关闭；未连接真实游戏、调用模型、重建桌面安装器或发布版本，也未推送远端。原工作区、分支和安全快照保留；macOS/Linux、真实升级安装与游戏任务仍需对应环境验收。

### 本次应用签名更新与双频道（Windows x64，2026-10-23）

- Maa Verge 与 MaaCore 分别持久化正式/预览频道；应用默认预览、核心默认正式，资源仍按独立 commit 检查。使用 SemVer 排序，忽略草稿，预览频道也接收更高正式版；改频道取消旧候选，缓存、候选启用与回滚后的再次准备均检查版本，避免自动降级。
- 应用由 Rust/Tauri 执行 GitHub 发行查询、平台/安装器匹配、签名和签名版本校验；启动仅检查，下载跨页持续，安装需再次确认。最终门禁等待在途 RPC，并在 Bun 中同步封锁新任务/手动及自动连接/组件作业，先关闭服务再安装。检查失败回到重新检查，下载失败保留固定候选供重试；过时通知和确认框随候选失效清除。
- 已配置更新签名公钥及项目 Actions secrets，新增四宿主手动工作流，只创建签名草稿；校验全部十八附件、五目标清单和实际 minisign 内容/版本；Packages 兼容实现现已随该通道停用移除。v0.1.0 实际标为预发布且没有更新器/签名更新资产，保留不重发；下一版本号及具体发布步骤见 [应用更新](app-updates.md)。
- 完整项目检查通过后，最终固定 Bun 回归为 **936 项通过、2 项 Windows 不适用用例跳过、0 失败**；最终 45 项工程测试通过、2 项 Unix 进程组测试跳过，契约同步、11 项契约测试、三个工作区 TypeScript、4/4 CTest、Python Ruff/mypy 与 274 项 pytest 均通过。整合后的 Rust fmt、严格全目标 clippy、8 项更新器测试通过；transport 按日常检查规则默认忽略，完整构建时已单独通过包内服务和 C++ 租约 smoke。
- Edge 合成界面全量 106 项通过，最后频道候选/降级提示修正后的应用及组件更新 16 项再次通过；前端生产构建通过。已检查窄窗、版本说明纯文本、独立频道持久化、跨页进度、安装确认和运行中禁用。三份工作流通过 actionlint，锁定 Tauri CLI 的真实签名与版本绑定互操作校验通过。
- Windows MSI/NSIS 及两份更新签名实际构建成功，真实产物经过收集器重命名与签名/版本复验；独立数据和 WebView profile 的实际 release 窗口 smoke 通过，包含初始化、设置持久化、重启与正常退出，自动连接和下载均关闭。下载候选仅保存于会话内存，不含断点续传；DEB/RPM 只检查并显示手动更新提示，debug 构建禁用安装。尚未实际安装升级、执行本次远端四宿主发行工作流或公开发布；本轮未在 macOS/Linux 宿主验收更新，未连接真实设备、下载真实 MaaCore/资源或调用模型。更新签名不代表完成 Windows 发布者签名与 macOS 公证。

### 本次用户 README 维护 skill 与 Logo 声明（文档，2026-10-23）

- 新增项目内 [maa-verge-readme skill](../.skill/maa-verge-readme/SKILL.md)，从用户最新修改的 README 提炼 Release 用户定位、现有结构与措辞、发行版事实核查和文档检查规则；不复制易过期的 README 快照，不改变全局 skill 配置。
- 根据 Logo 制作记录完善 README 文末声明，说明帕拉斯参考、指定模型生成与后期处理，区分项目开源许可与第三方角色权利，对应来源与授权表述规则已纳入 skill；后续按用户修改移除独立设计说明及其链接。
- skill-creator 的 `quick_validate.py` 校验通过；项目引用、README 链接及格式检查通过。本次仅修改文档与 skill，未运行应用或执行设备测试。

### 本次多任务表执行监控（Windows x64，2026-10-23）

- 执行入口默认显示监控总览，按每次执行展示任务表、设备、进度、反馈、耗时和独立停止；运行中与最近结束分区，支持状态筛选、搜索与页内实例启动。同一任务表在多个设备上分别显示，后台启动、顶部换设备、底部日志与任务结束均不抢走当前查看的详情；返回总览恢复位置与焦点，页签支持方向键。
- 只有选中详情才串行请求逐任务结果，截图与实时画面仍按需读取。TypeScript 快照保留全部运行中执行及按创建顺序最近 100 条终态记录，避免长任务被其他设备的新记录挤出；所选记录移出摘要窗口时仍读取并显示最终结果。Python debug 参考仍保留原最近 100 条窗口，未在本轮扩展历史分页或调度。
- 三个工作区类型、契约同步与前端生产构建通过；固定 Bun 1.4.3 完整后端回归 **937 项通过、2 项 Windows 不适用跳过、0 失败**，新增 3 项快照窗口回归。Edge 全量 119 项场景首次 118 项通过；另 1 项设备发现失败来自既有夹具缺少窗口生命周期接口，在未改界面的基线连续复现，补齐夹具后全部 8 项设备专项通过。新增 9 项监控场景全部通过，覆盖同表双设备、独立停止、筛选搜索、慢响应、后台启动/终态焦点隔离、摘要移出、滚动焦点与键盘操作。
- 已检查 1440px 浅色、深色及 390px 窄窗的总览与详情，无横向溢出；[浅色总览](images/mock-execution-monitor.png)、[深色总览](images/mock-execution-monitor-dark.png)均为合成数据。验证使用独立工作树、端口、临时数据与合成设备/原生 fixture，未连接真实游戏、调用模型、下载组件或重建桌面安装包；macOS/Linux、原生 WebView 与真实多设备运行仍待对应环境验收。

### 本次面向 Release 用户的 README（文档，2026-10-23）

- 重写 README，以下载与安装、功能预览、首次连接和执行、常见问题及反馈为主线；开发环境与架构说明收敛为文末文档入口，保留现有四张测试数据截图。
- 使用说明以已发布的 `v0.1.0` 为准，核对实际 Release 的七个安装包与校验文件、标签下的设备入口、数据备份位置和事件导出，避免将后续开发版的程序同级配置、完整日志导出等行为写为发行版功能。相关使用文档链接固定到发行标签，开发进展仍指向当前状态文档。
- README 的本地文件与图片、导航锚点、发行标签文档链接及折叠标签配对检查通过，`git diff --check` 通过。本次仅修改文档，未运行应用、连接设备或重新构建发行安装包。

### 本次 aria2 随包内置（Windows x64，2026-10-23）

- 安装包携带固定 aria2 1.37.0，新配置默认使用，保留已保存的 HTTP 下载器与自定义路径。空路径只定位发行服务同目录或开发 checkout 的 `.tools/aria2`，不查找 PATH，缺失或失败明确报错，不切换引擎；自定义路径收进高级选项。仍为单连接，续传、进度、取消、摘要与归档/核心验证边界保持。
- 开发、引导与发行脚本接入 `pnpm setup:aria2`；按固定来源和 SHA-256 准备，随包记录许可、对应源码及构建信息。Windows 使用官方 x64 可执行文件，Linux/macOS 从固定源码构建；macOS aria2 单独签名且不申请 JIT 或 MaaCore 动态库权限。
- 完整 `pnpm check` 通过：43 项工程测试（另 2 项 Windows 不适用跳过）、三个工作区类型、11 项契约测试、4/4 CTest、937 项 Bun 回归（另 2 项 Windows 不适用跳过）、Python Ruff/mypy 与 276 项 pytest、Rust fmt/clippy/test（7 项通过，包内 transport 与内部子进程夹具默认忽略）。前端生产构建、7 项 Edge 组件更新回归、引导脚本语法及 CI YAML 检查通过。
- 完整 `pnpm build` 通过，生成 Windows MSI（65.12 MiB）和 NSIS EXE（53.29 MiB）。实际 MSI 文件表及两种安装器资源清单均包含 aria2c、许可、构建信息和 7 份源码归档；包内 aria2c 与固定官方可执行文件 SHA-256 一致。未交互安装或发布。
- 空 PATH、带空格临时目录下实际运行编译后的生产下载模块，验证回环下载与 SHA-256、错误摘要清理分片、传输开始后取消及子进程连接关闭；包内服务 RPC/持久化/EOF、合成核心更新作业与 Rust transport smoke 均通过。
- 联网仅准备 aria2 与对应源码/许可依赖，功能回归使用隔离数据、回环 HTTP 与合成设备；未连接游戏、下载真实 MaaCore/游戏资源或调用模型。macOS/Linux 的本次实现尚未在对应宿主验收，本机 Docker daemon 不可用，Linux 干净容器检查未执行；正式签名、公证与交互安装仍待发行验收。

### 本次配置与窗口工作区合入 dev（Windows x64，2026-10-23）

- 将 `codex/window-close-feedback` 工作区的窗口关闭选择、异步退出反馈与程序同级 `config` 配置迁移一并提交并快进合入 `dev`；两条分支的原基点均为 `cafdc82`。原有改动及新增源码、测试、文档完整保留。
- 合入前完整 `pnpm check` 通过：33 项工程测试、11 项契约测试、三个工作区 TypeScript、4/4 CTest、934 项 Bun 回归、Python Ruff/mypy 与 276 项 pytest、Rust fmt/clippy/test（7 项通过）。2 项工程及 2 项后端测试按 Windows 边界跳过，包内 Rust transport 和内部子进程夹具按规则忽略；前端生产构建与 12 项 Edge 窗口回归全部通过。
- 本轮使用临时数据、合成原生 fixture 和独立端口的浏览器桌面桥，未连接真实设备、调用模型或构建发行安装包；macOS/Linux 与本次实际安装升级迁移未验收。

### 本次程序同级配置目录（Windows x64，2026-10-23）

- 安装版默认数据根改为程序目录下 `config`，继续由 Tauri 提供主程序目录，避免落在服务的 `runtime` 子目录；开发版使用各 checkout 的 `config`。保留 `MAAVERGE_DATA_DIR` / `--data-dir` 显式覆盖，测试显式根不会导入真实用户数据。程序目录不可写时报告具体目录并失败，设备租约仍使用原共享用户目录；已同步开发约定、README、迁移文档和 Git 忽略。
- 默认 TypeScript 后端在目标库不存在时，从旧 `MAAVerge/native` 或开发 `MAAVerge-dev/<checkout-hash>/native` 导入。源和目标同时持有 SQLite 租约，序列化包含已提交 WAL 的镜像，fsync、完整性检查后改名发布；保留隐式 rowid、事件与请求去重。历史截图一并复制，失败释放租约且不创建空业务库，重试覆盖半截截图。已有新库不覆盖，旧数据和组件绝对路径引用保留。Python debug 在待迁移时提示先启动默认后端。
- 三个工作区 TypeScript 检查、固定 Bun **934 项后端回归**（另 2 项 Windows 不适用跳过）、Python Ruff/mypy 与 **276 项 pytest** 通过。新增 6 项路径/迁移回归、2 项 Python 配置回归及默认开发启动检查；开发启动和 Windows 安装器的 6 项专项通过，包含 NSIS 实际合成卸载保留 `config` 数据库与锁文件、MSI 清理范围只读检查。Bun 1.4.3 独立运行探针通过。
- 验证只使用临时目录、合成数据与原生 fixture；未迁移或打开真实用户业务库，未连接游戏、调用模型或重新构建发行安装包。macOS/Linux、实际安装目录权限与升级后自动导入仍需目标环境验收。WebView 的最近任务表、预览帧率和未保存草稿仍由 WebView 管理，不包含在配置库备份中。

### 本次关闭选择与退出等待提示（Windows x64，2026-10-23）

- 右上关闭按钮和原生关窗请求默认弹出“关闭 Maa Verge”，提供最小化到托盘、退出应用、记住选择与取消；旧配置缺少可选 `rememberCloseAction` 时也会询问，原 `minimizeToTray` 保留记忆动作。选择经服务保存，重启后有效；设置中的“关闭窗口时”支持每次询问、托盘、退出。保存失败保留弹窗并允许重试，不执行关闭动作。
- 关闭确认和退出提示独立于主页面挂载，覆盖加载期与连接失败；原生主窗清理完成前保留，托盘退出先恢复主窗。前端绘制“正在退出…”转圈后通知宿主异步清理；界面不可用时 1.5 秒兜底，重复退出只启动一次清理。原有 EOF 优先与 5 秒超时终止服务保留，期限同时覆盖 stdin 写锁等待，退出不再阻塞主事件循环。
- 完整 `pnpm check` 通过：32 项工程测试、11 项契约测试、三个工作区 TypeScript、4/4 CTest、928 项 Bun 测试、274 项 Python 测试及 Rust fmt/clippy/test；2 项工程及 2 项后端测试按 Windows 边界跳过，Rust 7 项通过，包内 transport 与内部子进程夹具两项按规则忽略。前端生产构建与契约同步通过。
- 隔离端口 15483 的 12 项 Edge 窗口回归通过，覆盖取消/焦点、保存失败重试、记忆与重载、恢复询问、重复请求、加载期、断连不覆盖退出、macOS 原生事件夹具；浅色 1440px、深色 1280px 与 390px 弹窗截图已检查，无弹窗横向溢出或页面脚本异常。
- 使用独立应用标识、数据根和 WebView profile 的 Windows 原生 Debug 窗口验证：真实关窗提示与取消、记住托盘后隐藏并驻留、单实例恢复、退出前绘制转圈、退出码 0、再次启动保留记住退出并直接退出。自动连接及组件下载关闭，空设备；未连接真实游戏、调用模型、重建发行安装包或验收 macOS/Linux 原生行为。真实设备清理仍以明确选择的设备测试为准。

### 本次 Release 项目 skill（Windows x64，2026-10-23）

- 将已确认的发行说明规则集中到根目录 [.skill/maa-verge-release-notes/SKILL.md](../.skill/maa-verge-release-notes/SKILL.md)，原可复制骨架迁入其 `assets/release-notes.md`。保留原 MAA 风格、按目标版本写作、实际安装包链接与许可入口；正文省略构建来源和测试统计，全文最底部常显上游引用与版权。
- 根 `AGENTS.md` 添加项目 skill 的按需加载规则及发布文案触发入口；沿用仓库既有文件名，不另建 `agent.md`。贡献指南与 `docs/releases/README.md` 改为统一入口，规范和模板由该 skill 维护。Skill 的范围为本地文案与文档，不扩大线上发布操作授权。
- skill-creator 的 `quick_validate.py` 校验通过；模板迁移一致性、本地链接解析与 `git diff --check` 通过。本轮仅修改 skill 和文档，未启动产品服务、重建安装包或修改线上 Release。

### 本次 Release 说明整理（Windows x64，2026-10-23）

- 参考原 MAA v6.20.1 的 Highlights、分类日志与折叠块，重排 [v0.1.0 版本说明](releases/v0.1.0.md)：突出三项亮点、按平台 / 架构提供安装包直链，保留首次使用、已知问题及许可源码入口。按后续反馈删除“构建来源与验证范围”整块，规范及模板同步移除；工程验证记录保留在本文件。
- 原 [Release 说明入口](releases/README.md) 中的写作规范与骨架现已整合至上述项目 skill，贡献指南同步入口。规定只写对应版本已有行为、合并重复调整、按实际资产填写链接，并区分开发预览标记、构建与实机验收。
- 按追加要求在说明全文最底部常显“上游引用与版权”，列出 MAA / MaaCore、MaaResource 地址与引用范围、各自许可入口和代码版权归属；游戏素材及第三方内容保留各自声明。规范与模板同步该格式；静态检查及 GitHub GFM 渲染确认署名位于全部折叠块之后。
- 文档静态检查与 `git diff --check` 通过：本地链接存在，Release 正文使用完整 URL，删去工程记录后两个折叠块配对且无模板占位。此前 GitHub GFM 渲染接口确认下载表、八个资产链接、三项亮点及折叠块结构正确，当前版本日志默认展开；本次删除后静态复核结构与底部署名保留。通过 GitHub 只读 API 核对过七个安装包及校验清单的全部文件名、发布日期、Pre-release 标记与成功构建的源码提交；功能及此前保留的验证数量与 v0.1.0 标签一致。
- 本轮仅修改文档，在独立工作树完成；未重建安装包、运行产品服务或修改线上 Release。后续版本按该规范维护正文，实际发布时再随对应版本使用。

### 本次停用 GitHub Packages（Windows x64，2026-10-23）

- 停用 GitHub Packages 安装包集合分发，移除专用发布工作流、容器配置、发布脚本与对应测试及提取说明；本地检查和 CI 清单同步移除该测试入口。README 与版本说明统一使用 GitHub Releases 获取安装包。
- GitHub Releases 的安装包、校验文件和源码标签继续保留，运行时构建、许可收集及对应检查保持原有路径。
- 使用固定 Node 24.22.0 与 pnpm 10.20.0 离线恢复独立工作树依赖（零下载），六组工程脚本测试共 23 项，21 项通过、2 项 Unix 进程组测试在 Windows 按原规则跳过；检查脚本语法、CI 的 `actionlint` 与 `git diff --check` 通过。未重建发行安装包或进行其他平台、真实设备验收。
- 通过已登录的 GitHub 网页删除远端 `maa-verge` 包，仓库 Packages 已显示空态；GitHub CLI 缺少 `read:packages` 而返回 403，包删除结果由网页确认。历史发布工作流已禁用（`disabled_manually`），无排队或运行中的发布；v0.1.0 Release 描述已移除 Packages 段，原有 8 个资产保持不变。

### 本次执行动态与任务表删除修复（Windows x64，2026-10-23）

- 内部步骤完成不再生成“自动作战已完成”等整项完成动态；仅展示已翻译的具体步骤开始，如“自动作战 · 开始作战”“自动作战 · 作战结算”，过滤通用/未知步骤并去重。任务链结束后保持“正在确认核心空闲”，迟到步骤不会覆盖；任务成功仍要求匹配的任务链完成、队列结束及核心空闲，好友访问、掉落和基建证据处理保留。
- 日常与专项任务表顶部直接显示“删除任务表”。确认后删除已保存配置、清除对应会话草稿，并选择同组剩余表，最后一张回到空态；执行历史保留，取消或请求失败保留配置与草稿。运行中的任务表禁用删除，服务仍拒绝活动任务表删除；删除等待期间禁止重复确认和关闭，迟到结果不抢回用户的新导航。
- 合并后的三个工作区类型、契约同步与前端生产构建通过；固定 Bun 完整回归在最终独立工作区为 924 项通过、5 项跳过、0 失败（2 项 Windows 不适用，3 项需要此工作区的 Python 参考环境）。包含 C++ 合成结果回调与新增步骤/任务链边界回归。隔离端口 15475、两个 worker 的 102 项 Edge 全量回归通过，覆盖删除取消、重试、草稿/选择持久化、历史保留、专项空态、运行保护及窄窗。
- 本轮使用隔离数据、合成设备/资源与测试桥，未连接真实游戏、调用模型或重建发行安装包；macOS/Linux、原生 WebView 与真实游戏回调仍需对应环境验收。

### 本次设备与执行工作树合并（Windows x64，2026-10-23）

- 将两个附加 worktree 的设备页重构、干员资源与换班证据合入 `dev`；来源分支均为合并结果的祖先，工作区与分支保留。原主工作区 38 个改动文件与合并前快照逐一核对，Git 规范化后的内容全部一致；额外的执行总览界面一并提交。实例关联及状态文档冲突保留已核对的最终实现与各方记录，来源见[整合记录](integration-audit.md)。
- 合并后的完整 `pnpm check` 通过：32 项工程测试通过、2 项 Unix 进程组测试在 Windows 跳过；契约同步、11 项契约测试、三个工作区 TypeScript、4/4 CTest、924 项 Bun 测试通过，另 2 项 Windows 不适用测试跳过；Python Ruff/mypy 与 274 项 pytest、Rust fmt/clippy/test 通过。需要独立打包服务的 Rust transport 测试仍默认忽略。
- 前端生产构建与隔离端口 15471、两个 worker 的 99 项 Edge 全量界面回归通过。验证使用合成设备、资源、原生 fixture 与浏览器桌面桥，未连接真实游戏或调用模型；未重建发行安装包或新增 macOS/Linux、原生 WebView 验收，未推送远端。

### 本次设备页与开始唤醒职责整理（Windows x64，2026-10-23）

- 设备页拆为「当前设备 / 多开管理 / 连接设置」：已连接设备、本次 ADB 发现、正在连接分别呈现，历史连接默认折叠并明确不代表在线；页首直达多开管理，可从发现结果或设备卡片保存独立实例。卡片支持连接、断开、选择、编辑和删除，运行中禁止断开，在线或连接中禁止删除。
- 连接设置明确选择默认配置或独立实例，保存用于下次连接。所有用户保存实例连接/截图配置的路径统一置 `autoDetected:false`，自动连接范围与界面说明保持一致；未连接配置的截图测试不会借用其他设备。实例改地址后优先关联在线设备，保留旧历史记录；迟到的连接结果不覆盖用户在请求期间或离页后另选的设备。
- 开始唤醒移除可写全局/实例设置的连接表单，只保留游戏客户端、是否启动游戏及换号参数，显示本表绑定/顶部所选设备并直达其连接设置。任务草稿跨页保留，保存任务不会修改设备设置。连接不启动游戏，开始唤醒不启动模拟器。
- 独立 worktree、隔离端口 15431 的三个工作区 TypeScript、契约同步与前端生产构建通过；97 项 Edge 全量界面回归通过，最终补入初始 RPC 等待期间的设备选择保护与卡片快捷断开后，20 项设备/多开/连接专项再次全部通过。检查了 1440px 浅色、1280px 深色及 390px 窄窗截图，无横向溢出和页面脚本错误；测试夹具同步实例与设备关联，覆盖改地址后旧历史保留的场景。
- 本轮只使用浏览器桌面桥和合成数据，未启动真实设备服务、连接/操作游戏、调用模型、下载真实组件或重建安装包。macOS/Linux、原生 WebView 和真实多开仍待单独验收；当前管理已启动实例，仍需先在模拟器自己的管理器中启动实例。

### 本次执行总览与换班干员展示（Windows x64，2026-10-23）

- 取消逐任务选择，右侧始终展示本次执行的全部结果、独立作战任务掉落与整表累计材料；左侧成功/失败使用整条绿色/红色背景及边框，并保留图标和文字状态。截图移至默认折叠的「参考截图」，展开前不请求截图数据；长结果页面与任务列表均可滚动，浅深主题及 390px 窄窗已检查。
- 新增类型化 `resources.operator`，只读取已启用不可变 MaaResource 的 `battle_data.json` 和 `template/avatar`，按客户端精确姓名及无歧义别名匹配，星级使用上游 1–6 值。三星蓝、四星紫、五星金、六星橙红同时应用于头像背景与姓名；缺图或请求失败保留姓名。同名职业形态不猜头像，星级一致时仍保留配色。
- 基建反馈新增可选 `staffingStatus`，自定义名单为方案待确认，换班确认后记录确认状态，后续产物回调不会覆盖该状态；旧记录显示确认状态未记录。常规自动换班未提供最终干员名单时明确说明，不据方案或截图推断实际进驻；当前回调不提供设施本次实际加成与倍率，暂不展示。
- 三个工作区 TypeScript、契约生成同步、11 项契约测试、前端生产构建通过；完整固定 Bun 运行时回归 **924 项通过、2 项 Windows 不适用用例跳过、0 失败**，包含 C++ 合成回调贯通。执行页、识别和多实例执行的 **13 项 Edge 界面回归通过**，覆盖重复任务、失败原因、名单确认、头像/星级及降级、截图按需读取、持久化与真实滚轮操作。
- 本轮使用隔离端口、合成设备/资源/原生 fixture，未连接真实游戏、下载组件、调用模型或构建发行安装包；macOS/Linux 与原生 WebView、本次真实换班回调仍待对应环境验收。

### 本次 macOS Intel CI 排查与版本固定（2026-10-23）

- 核对全部 22 次 Checks 运行，最近连续 6 次完整运行成功；最新 [Intel native 作业](https://github.com/DeathofBrain/maa-verge/actions/runs/39945649247/job/120387930576) 已通过 CTest、后端、Rust 检查及完整安装包构建。历史失败并非同一编译错误：较早的 macOS `/var` 与 `/private/var` 路径断言已规范化；错误回调测试在连接阶段使用 80 毫秒时限，已由 `3049fe6` 改为 1000 毫秒，保留未知结果退出 124 与禁止重放断言。
- [另一次 Intel 失败](https://github.com/DeathofBrain/maa-verge/actions/runs/39803795302/job/119914552184) 发生在 setup-uv 查询最新版时，日志为 GitHub API `Connect Timeout Error`，此前缓存请求也出现 DNS `ENOTFOUND`。本次将 application/native 的 uv 固定为最新成功运行使用的 0.13.5；setup-uv 的精确版本分支跳过版本发现 API，具体发行资产和依赖下载仍需要网络。
- Windows 独立 worktree 的 actionlint 1.7.12 检查全部工作流通过；实际下载并校验 uv 0.13.5，`uv sync --frozen` 与 `node tools/build-core-worker.mjs` 通过，4/4 CTest 成功，依赖锁未改变。本次只修改 CI 工具版本及文档，未修改产品超时或跳过检查；尚未推送或触发本次配置的远端 macOS 重跑。

### 本次 dev 提交前验证（Windows x64，2026-10-23）

- 将工作树整合后保留的中文字体、防闪烁改动及相关测试一并提交；字体依赖与锁文件同步，未修改运行时接口。
- 前端类型检查与生产构建、契约生成同步检查通过；`pnpm test:ui --workers=2` 的 91 项 Edge 界面回归全部通过。首次默认 14 并发运行期间出现内存不足与浏览器批量失败，已中止，降低并发后完整通过。
- 验证使用隔离端口和合成界面夹具，未连接真实设备、下载真实组件、调用模型或构建发布安装包；macOS/Linux 与原生 WebView 未在本轮验收。

### 本次 dev 工作树整合（Windows x64，2026-10-23）

- 将组件下载、完整性与同版本修复、卸载与版本保留、仓库/干员工具、日志导出和实时预览的最终分支合入 dev；全部 15 个附加 worktree 分支均为合并结果的祖先。11 个辅助分支的 12 个独有提交先验证补丁等价，再记录合并关系；[来源与证据](integration-audit.md)。保留原工作区与分支，主工作区原有字体、防闪烁改动完整恢复并保持未提交。
- 下载归档统一为组件根目录的稳定来源文件名，保留可信中断分片且不再创建旧 downloads 子目录；保留流式完整性校验、同版本修复、有效回滚及 worker 使用中保护。补强跨服务重启保留分片的回归，下载偏好测试夹具补齐完整性校验需要的合成文件。协议源合并后重新生成类型与独立校验器。
- 完整项目检查通过：32 项工程测试通过、2 项 Unix 进程组在 Windows 跳过；11 项契约测试、三个工作区 TypeScript、4/4 CTest、916 项 Bun 测试通过，另 2 项 Windows 不适用的 SIGTERM/Unix socket 跳过；Python Ruff/mypy 与 274 项 pytest、Rust fmt/clippy/test 通过。包内 Rust transport 测试仍按规则默认忽略。前端生产构建与 91 项 Edge 界面回归全部通过，包含恢复后的字体与防闪烁改动。
- 检查使用隔离数据、回环下载源与合成设备/核心/界面夹具；未连接真实游戏、调用模型、下载真实组件或构建发布安装包。本轮未在 macOS/Linux 宿主验收，未推送远端；下一步按需要进行对应平台和明确选择的真实设备验收。

### 本次界面字体更新（Windows x64，2026-10-23）

- 标题、正文与表单统一使用随应用打包的 Noto Sans SC 可变无衬线字体，支持 100–900 字重；日志、路径与高级 JSON 保留西文等宽显示，中文明确回退到同一黑体。字体分片合计约 4.3 MiB，均从本地加载；依赖固定为 5.3.1，发行许可收集已确认包含完整 OFL-1.1 声明。
- 前端类型检查与生产构建、73 项 Edge 界面回归通过。通过浏览器实际字形检查确认标题与代码中文使用内置字体；已检查主页、设置和任务编辑器的浅深主题及 390px 窄窗，无横向溢出或页面脚本错误。
- 本轮使用隔离浏览器测试桥，未连接真实设备或重新构建桌面安装包；macOS/Linux 与原生 WebView 字体渲染仍待对应环境验收。

### 本次组件未就绪时的界面闪烁修复（Windows x64，2026-10-23）

- 游戏提醒与关卡目录只在活动日历变化、核心/资源已生效（含回滚）、手动刷新或定时刷新时重新读取；检查、下载进度、失败和待生效事件继续更新组件状态，不再反复触发游戏数据读取。
- 后台刷新保留当前游戏日、活动、基建估算和关卡选项，失败显示错误并允许重试，不因短暂失败把已选择的活动关卡切到手动输入。切换设备或客户端仍隔离旧内容，迟到回复不会覆盖当前页面。
- 前端类型检查与生产构建、73 项 Edge 界面回归通过。新增 4 项延迟/失败夹具回归覆盖组件缺失、下载未完成、重复进度、准备失败、后台刷新、启用/回滚与客户端切换；未使用真实组件或设备。
- 本轮为 Windows 浏览器测试桥验证，未启动真实游戏、下载组件或重建桌面安装包；macOS/Linux 及原生 WebView 的对应场景仍待目标环境复验。

### 本次 v0.1.0 日志遗漏场景修复（Windows x64，2026-10-23）

- 旧版核心缺少可信的展开文件完整性记录时，即使官方版本相同也提供重新准备；始终下载安装到新 generation，保留旧组合直到候选验证并在空闲边界启用，不把残缺目录重新枚举成可信安装。新快照记录文件清单及流式 SHA-256 汇总摘要，更新操作前异步复核，可发现模型、依赖库缺失、零字节和同尺寸内容改写；旧版独立资源复核已有 `contentHash`。
- 资源下载后和准备失败时重新核对基础资源；下载或解压期间目录丢失后同步显示需要修复核心，允许同版本恢复，不再无条件报告活动版本可用。损坏活动记录被清除后，修复启用继续保留有效的上一组回滚；候选内容被修改时拒绝启用，忙碌 worker 的固定目录与安全切换边界继续保留。
- 手工管理的多开清单保留实例管理器/SDK 探测的具体原因，成功连接与失败返回均保留诊断；不会追加修改探测器缓存的原始数组，增强截图失败仍拒绝连接，不静默切到 ADB。本次未修改日志导出接口、事件保留数量或 worker 退出日志格式。
- 三个工作区 TypeScript 检查、契约生成同步及 10 项契约测试通过。固定 Bun 1.4.3 的完整后端回归 **848 项通过、5 项跳过、0 失败**：Windows 的可移植 SIGTERM、Unix socket 两项不适用，独立工作树未创建 Python 参考虚拟环境而跳过三项互操作测试。复用已有合成 C++ fixture 的独立更新作业与 Bun 编译后自重启更新作业均通过；最后补强的旧版修复成功/失败回滚断言单独复测通过。
- 本轮使用独立工作树、临时数据、合成下载包和实例探测器；未下载真实组件、连接设备或执行游戏任务，未重建桌面安装包。macOS/Linux 的文件系统与原生加载行为、真实受损安装及多开连接仍需目标环境验收；后续整合下载分支时应同时保留本节的完整性检查和同版本修复路径。详见 [运行时安装说明](maacore-runtime.md)。

### 本次组件重装、卸载与三版保留（Windows x64，2026-10-23）

- 修复数据库残留版本导致空目录被误判为已安装：启动及更新入口核对核心库、有效资源元数据和新快照文件清单，清除失效的活动、候选及回滚引用，同版本可重新下载。独立资源丢失时恢复核心附带的基础资源，回滚和恢复统一显示 `bundled@核心版本`。旧快照无清单时检查库与资源版本文件，不声称完整内容校验。
- 不再创建 `downloads/`；压缩包暂放组件根并在成功、失败或正常关闭后删除，失败候选清理。归档包装目录会移除，版本内部的 `resource/` 保留上游加载接口要求。核心和独立资源各跨新旧根保留三版，保护活动/回滚/待生效和实际 worker 路径，忙碌时暂缓清理。链接、归属不明、锁定或清理失败的目录保守保留；强制终止进程仍可能遗留临时包。
- NSIS 卸载 hook 与 WiX fragment 删除程序同级默认 MaaCore/MaaResource 全树，包括旧 downloads/generations；应用更新跳过清理，自定义组件路径、用户业务库与数据锁保留。重新安装时按实际文件恢复状态。开发说明和 Windows CI 已纳入安装器专项检查。
- 三个工作区 TypeScript、契约同步通过；809 项 Bun 测试通过，另 1 项 Windows SIGTERM 跳过，包含原生合成核心验证及编译服务更新作业。34 项工程测试中 32 项通过、2 项 Unix 进程组在 Windows 跳过；NSIS 编译并执行隔离清理夹具，MSI 实际链接后只读检查清理条件及安装表顺序，均通过。
- MSI/NSIS 已在独立工作树用既有主程序、前端和运行时重新打包成功，验证安装器接入；这不等同于完整重建本轮运行时或在主机实际安装/卸载。未连接真实设备、下载真实组件、调用模型或发布；macOS/Linux 的本次更新逻辑与卸载行为未在对应宿主验收。

### 本次下载通知与断点续传（Windows x64，2026-10-23）

- 下载请求和通知由 App 与应用服务持有，切换设置分类或侧栏页面不取消；启动时已有的下载/失败候选也能在右上角显示。下载期间普通设置和页面操作继续可用；需等待同一更新队列的检查、目录变更、切换与回滚按钮暂时禁用，避免长请求占用全局操作状态。失败可重试原候选，不强制重新查询版本。
- 移除整个下载的两分钟总时限，改为连接/数据停滞 30 秒超时；进度去重并节流。缓存身份包含数据根、通道和不可变来源，内置下载器核对 Range、服务端版本标记、大小及摘要；不支持安全续传时重新下载，错误内容不会进入活动版本。aria2 使用固定参数数组，关闭用户配置与 RPC，按实际完成字节上报进度，保留控制文件，退出应用会终止它并等待下载队列结束。
- 新增可选契约 `Settings.componentDownload`（`engine`、`aria2Path`），生成类型与独立校验器已同步；旧客户端保存设置时保留下载器偏好。aria2 需自行安装，路径留空从服务 PATH 查找，保存后用于后续下载；找不到或失败不会自动切换下载器。
- 完整 `pnpm check` 通过：工程与契约检查、三个工作区类型、4/4 CTest、Bun 运行时测试、Python lint/类型与 pytest、Rust fmt/clippy/test；Windows 不支持的 Unix 进程组和 SIGTERM 用例按原规则跳过，包内 Rust transport 测试仍默认忽略。75 项 Edge 界面回归及前端生产构建通过，涵盖跨页下载、启动通知、失败重试、aria2 设置持久化、候选已被安装的竞态及原有更新切换；右上角通知截图已检查。22 项下载器专项覆盖本机 HTTP 中断与续传、200/416 恢复、版本/范围/大小/摘要错误、持续传输与停滞、aria2 稀疏文件进度与子进程退出。
- 本轮只用隔离数据、回环 HTTP 与合成 aria2 可执行文件验证；没有下载真实官方组件、安装或实测上游 aria2、连接游戏设备、调用付费模型或重建发行安装包。macOS/Linux 的本次改动未在对应宿主验收；未完成缓存自动清理和磁盘配额仍待实现。Python 调试参考不包含本次下载器设置。

### 本次仓库、干员与材料图片（Windows x64，2026-10-23）

- 新增类型化 `recognition.get` 与 `resources.item`，协议、生成类型和独立校验器同步。仓库/干员回调只保存白名单字段，结果不依赖最近 100 条事件；不完整、错误任务、失败、停止及迟到回调不会覆盖上次成功采集。数据同步组合任务也保存各自结果；星级和潜能沿用上游从 1 开始的值。
- 工具箱增加直接识别、按设备/客户端查看、刷新、搜索与 JSON 导出；快捷识别保存零消耗的单项任务并复用已有匹配配置，仍经现有计划策略与设备控制权校验。客户端筛选在切换工具和设备后分别保留；页面不把采集结果称为实时库存。目标库存和自动补货仍未接入。
- 材料名称与 PNG 来自当前启用资源的 `item_index.json`、`template/items` 和对应外服覆盖；只接受物品 ID，限制本地读取及图像大小，拒绝路径穿越、链接和损坏图片。未安装资源或缺图时显示通用图标，更新/回滚后重新读取。只读检查本机已安装 MaaResource 的全部 480 张材料图，均可解析；没有复制资源进入仓库。
- 三个工作区 TypeScript、契约同步、10 项契约测试、前端生产构建通过。Bun 服务测试 **797 项通过、14 项按既有环境条件跳过**，包含新增识别证据、失败保留、重启持久化、账号/客户端/设备隔离、图片读取与 RPC 集成测试；本轮没有配置原生合成库、独立编译服务或 Python 参考，因此对应互操作/打包测试跳过，Windows SIGTERM 测试仍跳过。
- **74 项 Edge 界面回归通过**；最终客户端筛选修复后的 5 项相关场景再次通过，覆盖实际图片解码、缺图回退、搜索/导出/重载、设备和客户端切换、失败重试及组合同步；已检查桌面和 390px 仓库布局。验证使用隔离数据和合成桥接，未连接/操作真实游戏、调用模型或重新构建安装包；macOS/Linux 与真实游戏识别尚未验收。

### 本次日志导出与清理（Windows x64，2026-10-23）

- 设置「数据与诊断」新增日志导出与完整保存位置弹窗、自动清理保留期（默认 7 天，可选 14/30 天或关闭）、手动清理确认与结果。Windows 安装版默认程序同级 `log`，macOS 使用用户 Library/Logs，Linux 使用 XDG state；开发与测试继续隔离。
- 导出应用/组件/系统版本、实际多实例连接配置、近期执行/事件摘要及服务/核心文本日志；服务错误保留请求关联、耗时和堆栈。常见凭据脱敏，限制尾部读取及总体积，缺失/截断有提示。清理保护当前服务文件和本次会话使用的 worker 目录，排除数据库、截图、组件及锁文件；详见[日志说明](logging.md)。
- 三个工作区类型检查、契约同步与 10 项契约测试、前端生产构建通过；803 项 Bun 测试通过（8 项依赖原生夹具/独立打包或 Windows 信号的测试跳过），含 13 项日志专项；Python Ruff/mypy 与 274 项 pytest 通过。73 项 Edge 界面回归及补入日志全局搜索后的 5 项日志专项通过，覆盖导出路径与窄窗弹窗、保留期保存、清理确认、操作互斥与错误反馈。独立 Bun 编译服务 smoke 验证实际写盘、Windows 程序同级目录、请求关联错误、导出、手动清理及 EOF 退出。
- 检查使用隔离数据和合成夹具，未连接真实设备、下载组件、调用模型或重新构建完整安装包；未修改 Rust/C++。macOS/Linux 默认路径为合成规则验证，未在对应宿主验收；Tauri/渲染层和服务初始化前错误尚未统一归档。

### 本次实时画面性能与任务页截图（Windows x64，2026-10-23）

- 实时预览改用可释放的 Blob URL，换帧、取消、离线与卸载均释放图片；React 状态仅保留帧元数据，画面原位更新，性能统计每 250 毫秒刷新。请求与解码共用每设备串行限制，并按 WebView 绘制节奏调度，保留全部目标频率与已保存偏好。
- 压力回归发现取消 `Image.decode()` 后，WebView 偶发一直不结束解码等待，阻塞后续刷新；现对当前解码显式取消，保留尚未返回的 RPC 限制，迟到结果不再更新画面。每次解码独立清理取消回调，避免长期积累 Promise 监听。
- 后端保留完整 Schema 校验、图片与点击安全限制，严格核验 base64 后仅解码 24 字节 PNG 头，省去整帧解码再编码的校验分配；最大帧每次减少约 6.98 MiB 临时载荷分配。合成 CPU 基准基本持平，不据此宣称真实 FPS 提升。
- 任务表执行页只显示本机结果截图，进入、选任务及跟随当前任务不发起连续预览；实时画面统一从底部「画面」手动打开。结果截图仍在任务反馈后按需采集、保存和读取。
- 三个工作区 TypeScript 检查、前端生产构建与 71 项 Edge 界面回归通过；`pnpm test:runtime` 的 787 项 Bun 后端回归通过，另 1 项 Windows SIGTERM 测试跳过，包含 20 项预览、原生合成 worker、执行截图和 Python/Bun 数据根互斥。新增逐帧变化 PNG 连续显示验证，图片资源同时最多两份、收起后归零，统计更新频率低于画面更新；补充旧解码永不结束时重新打开仍能刷新，以及任务页不取实时帧的回归。取消修复后另有四轮预览专项共 32 项通过；已检查执行页桌面与 390px 截图。
- 本轮使用隔离数据、浏览器测试桥与合成 worker，未连接真实设备、操作游戏、调用付费模型或重建安装包。真实设备长时间帧率、WebView 进程内存趋势，以及 macOS/Linux 对应宿主仍需单独验收。

### 本次发行许可与 GitHub Packages（Windows x64，2026-10-23；Packages 已停用）

- 补齐前后端 JavaScript 生产依赖、各平台 Cargo 运行依赖与 Rust 标准库许可。缺正文的上游 crate 按精确版本保留固定来源与哈希，未知缺失阻止打包；不再只收集后端归档库。版本说明记录应用标签、固定 Bun/WebKit 来源和重建入口。
- Windows 宿主实际许可收集通过：13 个 JavaScript 依赖与 176 个 Rust 运行 crate；同一宿主解析锁定的 Linux x64、macOS x64/arm64 依赖图并收集许可，分别为 243、191、191 个 Rust crate，另附标准库声明。这些依赖图检查不等同于对应系统构建或安装验收。
- 当时新增 GitHub Packages 工作流，从已发布 Release 严格核对 7 个安装包和 `SHA256SUMS.txt`，发布双架构安装包集合，拒绝覆盖已有版本；上传后按不可变摘要提取并再次核对全部文件。此分发通道现已停用，专用实现、README 入口与提取说明已移除。
- 合并后 32 项工程测试中 30 项通过、2 项 Unix 进程组测试在 Windows 跳过，包含 9 项许可收集和 11 项发布校验测试。发行提交 `eb6fafb00b322f44d962c406696e0605a27d2ada` 的 [Checks](https://github.com/DeathofBrain/maa-verge/actions/runs/39923647573) 全部 9 项通过，覆盖应用检查、四宿主探针、四平台安装包构建及 Linux 干净容器后端测试；Linux 下载源阻塞后仅重跑该作业，保留其他成功产物。实际安装包的许可文件已核对，Linux AppDir 与 DEB 目录的许可文件逐一哈希相同。
- [v0.1.0 开发预览](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.0) 已发布，标签精确指向上述发行提交，7 个安装包与 `SHA256SUMS.txt` 的远端大小、摘要均与本地一致。当时还公开发布过 Packages `0.1.0`，[历史发布工作流](https://github.com/DeathofBrain/maa-verge/actions/runs/39930002910) 曾按不可变摘要提取并核验全部文件，确认匿名读取和源码标签；历史镜像摘要为 `sha256:ece5eaaea8a415f9775d0d4ac9aec307bea20fcbea2dcc9532f9c5ce29d0091e`。该通道现已停用，本段仅保留当时的验证记录。以上不代表完成正式签名、公证、交互安装或新增真实游戏验收。

### 本次 v0.1.0 发行文档与截图（Windows x64，2026-10-23）

- 将任务表执行、消耗与组件目录改动快进合并到 main。README 更新任务准备/执行路径、旧记录边界、下载目录与国服共享资源说明，新增版本说明和安装包入口。
- 使用当前界面和隔离测试桥重拍主页、任务准备、执行结果、组件更新四张截图并逐张检查；无页面脚本错误和横向溢出。图中设备、活动、掉落和画面均为合成夹具，不包含真实账号数据，不作为实机验收。
- 上次 macOS Intel CI 的错误回调测试在连接准备阶段被 80 毫秒时限提前结束；仅将该项合成测试的时限改为 1000 毫秒，保留错误异步 ID、超时退出 124 和禁止重放断言。Windows 独立 worktree 的 `native.worker` 全部 30 项通过，不修改产品时限或添加重试。
- 版本统一为 0.1.0，按开发预览发行。四平台安装包由对应提交的 Checks 工作流构建，下载、哈希与安装限制见 [v0.1.0 版本说明](releases/v0.1.0.md)及 [GitHub Release](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.0)。正式签名/公证、干净系统交互安装和真实游戏验收仍待完成。

### 本次任务表执行、消耗与组件目录（Windows x64，2026-10-23）

- 删除「执行与消耗」设置及独立表级预算，按启用的自动作战任务累计理智药和源石上限；默认仍为零，保留旧字段以兼容已有数据。执行任务名和常见流程动作显示中文。
- 开始后进入独立任务表执行页，按启动快照展示逐任务状态、材料、基建反馈、反馈截图与只读实时画面；重复任务独立记录，修改任务表不重写历史。详情串行按需刷新，共享在途请求以避免 StrictMode 重复请求；异步保存期间切页不会被拉回执行页。合成截图已检查浅色、深色及 390px 窄窗布局。
- 核心与资源可分别设置下载/安装根目录，安装版默认程序同级，开发与测试默认隔离数据根；路径变化保留当前和回滚引用。资源版本读取已安装包的活动名和更新时间；官服与 B 服共用国服基础资源，资源页合并为「国服（官服 / B服）」，外服读取各自元数据，缺失不借用其他服活动。
- 完整 `pnpm check` 通过：10 项工程测试（另 2 项 Unix 进程组测试在 Windows 跳过）、契约同步与 10 项契约测试、三个工作区 TypeScript、4/4 CTest、785 项 Bun 测试（另 1 项 Windows SIGTERM 跳过）、Python ruff/mypy 与 274 项 pytest、Rust fmt/clippy/test。包内 transport 的 Rust 测试保持默认忽略。69 项 Edge 界面回归通过；合并国服显示后，组件目录/活动版本专项复测与前端生产构建通过。
- 本轮使用隔离数据和合成夹具，未连接或操作真实游戏、调用付费模型、下载真实组件或重建发行安装包；macOS/Linux 新行为未在对应宿主验收。反馈截图来自核心最近缓存，可能已进入后续画面，不能当作原始识别或结算图片；真实任务画面与结果对应效果仍待实机验收。协议、存储及限额见 [运行时说明](runtime-migration.md)。

### 本次模拟器发现与自动增强截图（Windows x64，2026-10-23）

- 修复自定义安装位置的 MuMu 无法自动找到 ADB：按原版 MAA 的进程相对路径规则定位内置 ADB，支持 `nx_main`。固定只读查询 MuMuManager 的全部已启动实例，使用实际端口、编号与安装目录；雷电通过固定 `ldconsole list2` 和默认 ADB 端口的进程归属核实实例。查询有超时、输出与并发上限，单项失败保留其他候选和手动配置。
- 同一模拟器进程的实际回环监听地址共享身份，避免把同一 MuMu 的多个地址显示成多台设备，也不再仅凭端口数字把不同实例合并。多开和多个安装目录分别配置，跨数据根、手工别名与 MuMu 桥接仍共享控制权租约。
- 截图默认「自动识别（推荐）」：Windows 下核实实例和本机 SDK 后自动配置 MuMu/雷电的目录、编号和连接类型，分别保存独立实例清单；雷电截图 PID 只传原生 worker，不持久化。纯自动清单继续发现新启动实例；含手动管理项时仅自动连接已保存清单。手动选择覆盖自动识别，旧显式增强截图配置保留手动语义，已选增强接口失效不静默降级。连接期间保存的手动偏好或删除的配置不会被自动写回覆盖。
- 完整 `pnpm check` 通过：10 项工程测试（另 2 项 Unix 进程组测试在 Windows 跳过）、契约同步与 10 项契约测试、三个工作区 TypeScript、4/4 CTest、764 项 Bun 测试（另 1 项 Windows SIGTERM 跳过）、Python ruff/mypy 与 274 项 pytest、Rust fmt/clippy/test。包内 transport 的 Rust 测试保持默认忽略；本轮未重新打包发行服务或安装包。64 项 Edge 界面测试（2 个 worker、独立端口）和前端生产构建通过。
- 用户选择的真实设备验证：本机已运行的单个 MuMu 自动发现只返回实例 0 的实际地址，多个监听别名正确合并；桌面显示已连接、空闲、无任务执行。自动增强配置的真实只读检查正确选中本机 SDK、安装目录及编号，无诊断。本轮未对新自动配置执行原生截图或游戏任务，不能替代此前手动增强截图验收，也未启动额外模拟器验证真实多开或雷电。合成测试覆盖多实例、跨目录、冲突端口、未就绪、SDK 缺失、独立租约、手动覆盖及保存竞态；macOS/Linux 新行为仍待对应宿主验收。
- 检查全部登记 worktree；有效提交与文档已集成并记录来源分支合并关系，旧审计的 36 个提交仍为 main 祖先。README、连接/多开文档与[整合记录](integration-audit.md)同步本轮行为和验证边界。

### 本次 main 分支整合（Windows x64，2026-10-23）

- 检查全部 22 个本地 `codex/*` 分支与 5 个额外 worktree；额外工作区均干净，有效改动已由当前任务分支或既有 main 的等价/改进实现覆盖，无需补入旧代码。记录来源分支的合并关系，保留已验证实现；[逐项审计记录](integration-audit.md)包含补丁及文件比对证据。
- 纳入本地未提交的受保护 worktree/分支清理工具及其开发说明，5 项临时仓库测试、Ruff 与格式检查通过；本次不执行项目 worktree/分支清理。
- README 同步默认任务、关卡、无人机、多开与游戏提醒，贡献指南修正失效的 `dev:mock` 和旧协议源指引，连接/开发说明对齐实例清单和客户端资源隔离。远端 `codex/typescript-cpp-runtime` 已确认是既有 main 的祖先，按用户要求随本次 main 同步删除。

### 本次原版常规设置、多开与游戏提醒（Windows x64，2026-10-23）

- 按用户截图、官方文档与固定 v6.20.0 配置/序列化源码补齐开始唤醒、作战、基建、公招、商店、奖励和更新数据设置。新建日常表按原版九项初始队列及默认值生成，名称自动用未占用的“日常表1”等；无人机使用下拉，关卡默认下拉并支持勾选手动输入。旧配置和未知 JSON 参数保留。
- 共享连接设置与独立多开实例清单接入实际 worker；每设备独立执行、单独停止、日志/结果和数据周期隔离，同一未绑定任务表可在多设备并行。默认消耗额度为 0，按每次执行分别校验，不提供跨设备共享总额。显式连接失败及时结束等待。
- 各 worker 按客户端依次加载基础与外服覆盖资源，缺失/加载失败明确报错；任务切换客户端只在目标设备空闲后释放旧进程与租约、保留原连接配置重建。连接确认、停止/退出取消与更新边界均纳入合成回归，其他设备不等待目标设备的重连。
- 活动日历参考原版 `StageManager` / `MaaApiService`，从相同官方主/备用源获取，使用 ETag / Last-Modified 与用户数据目录缓存；主页与关卡下拉共用数据。过期活动不因资源旧标记复活，官方日历关卡缺导航或核心版本不符时不可选择；联网失败保留有效缓存并显示来源和状态，无缓存时才降级到资源日历。Bun 对真实官方日历的只读验证通过；未请求或上传账号数据。
- 主页按客户端 04:00 换日、周一换周，给出剿灭提醒和手工产线估算。成功换号/客户端后清当前设备估算与旧草稿；其他设备保留。识别/访问周期仅在匹配结果及核心空闲后记成功。
- 最终 `pnpm check` 完整通过：10 项工程测试（另 2 项 Unix 进程组测试在 Windows 跳过）、契约同步与 9 项契约测试、三个工作区 TypeScript、4/4 CTest、725 项 Bun 测试（另 1 项 Windows SIGTERM 跳过）、Python ruff/mypy 与 274 项 pytest、Rust fmt/clippy/test；需独立打包服务的 Rust transport 测试保持原有默认忽略。新增客户端切换/取消、外服资源、官方日历缓存/失败回退、跨 04:00 一致性及账号隔离均有合成覆盖。
- 61 项 Edge 界面测试与 `pnpm -r build` 通过，包含默认任务表、表单/未知参数、关卡切换、多实例配置/并行控制、活动提醒与基建草稿失效。界面全量使用 2 个 worker 和隔离端口运行；初次与其他检查/构建并行且使用默认 10 个 worker 时出现 7 项页面等待超时，降低并发后全量通过，未修改断言或添加重试。桌面与 390px 主页布局已检查。
- 本轮自动验证使用隔离数据、合成 ADB/worker/网络夹具和浏览器桌面桥；未连接或操作真实多开游戏、调用付费模型、上传账号数据、发布或重新打包。macOS/Linux 和各模拟器/客户端真实行为仍待单独验收；公招加急及其他未交付功能继续明确受限。

### 本次 Codex worktree 与分支清理修复（Windows x64，2026-10-23）

- `tools/clean-codex-worktrees.py` 分别枚举关联 worktree 和本地 `codex/*` 分支，覆盖只有分支、没有 worktree 的情况。默认保留未合入 `main` 的分支；支持预览、强制清理和仅清理 worktree，保护主工作区、当前工作区与仍被占用的分支。
- Ruff 格式与检查、5 项临时仓库回归测试通过，覆盖分支独立清理、合并状态、脏文件、锁定、中文与空格路径及工作区保护。本仓库仅执行普通与强制模式预览，未实际删除分支或 worktree；未验证 macOS/Linux。

### 本次本地与远端主分支同步（Windows x64，2026-10-22）

- 集成本地移除产品模拟运行与远端编译环境、开发进程清理、模块加载恢复、设备连接反馈及圆形图标改动。产品继续只接受 native；界面测试通过测试目录注入 IPC 夹具，不恢复产品模拟入口。
- 适配新增设备发现测试的 Runtime 构造参数与测试桥，确保替代 ADB 配置生效；开发入口测试改为验证旧 mock 参数被拒绝。修复环境检查测试的 Windows 路径分隔符断言；引导保留 SkipReference 参数并安装固定 Bun，Playwright 使用同进程 Vite 和独立测试端口。
- `pnpm check` 完整通过：10 项工程回归（2 项 Unix 进程组测试在 Windows 明确跳过）、契约同步与 8 项契约测试、三个工作区类型检查、4/4 CTest、644 项 Bun 测试（Windows SIGTERM 另跳过 1 项）、Python ruff/mypy 与 274 项 pytest、Rust fmt/clippy/test。需包内服务的 Rust transport 测试保持默认忽略，本轮未另行执行。
- 42 项 Edge 界面测试与 `pnpm -r build` 通过，包含设备发现/异步连接反馈、模块失败重载恢复及无桌面桥时的明确错误；PowerShell 引导解析与 Bash 脚本语法检查通过。本轮未启动真实设备或桌面服务、调用模型、重新构建安装包或验收 macOS/Linux。

### 本次移除产品模拟运行（2026-10-22）

- `pnpm dev`、Tauri 和 Bun 服务入口统一真实 native，移除模拟设备、示例任务、模拟执行进度、假截图/点击和模拟更新源。普通浏览器无桌面桥时明确提示通过 `pnpm dev` 启动桌面应用，不再生成演示数据；`pnpm dev:ui` 只提供前端服务器。
- Agent 保留本地确定性提案，在真实运行下可审阅、编辑和保存，必须手动启动才提交到实际设备。界面不再出现“模拟工作空间”或“模拟画面”；连接失败、未安装核心、无真实设备均报告实际状态。
- 真实数据沿用 `<data-root>/native`，不读取、迁移或删除旧 `mock` 目录。`MAAVERGE_MODE=mock` 和旧 `--mock` 参数明确拒绝。浏览器 IPC、PNG 及运行夹具迁入测试目录；打包/桌面测试预置独立 native 数据并关闭自动连接/下载。
- Windows x64 本轮 `pnpm check` 通过：契约同步、三个工作区 TypeScript、8 项契约测试、4/4 CTest、638 项 Bun 测试（Windows 不支持可移植 SIGTERM，另跳过 1 项）、Python ruff/mypy 与 274 项 pytest、Rust fmt/clippy/test。Bun 合成验证器的中间 PE 改在独立测试目录创建，完整检查复测通过；编译失败时保留具体 stderr，不添加重试或跳过。
- 37 项 Edge 界面测试、前端生产构建、Bun/C++ 自包含打包、空 PATH 包内 smoke、Rust transport 集成 smoke 及 Windows release 构建（无安装包）通过。真实 WebView2 验证 native 空设备、无虚拟 worker、Agent 提案保存、关窗进程清理和重启持久化；生产前端包不包含测试运行时或 PNG 夹具。
- 本轮没有连接 MuMu、执行游戏任务、调用付费模型或发布安装包；Linux 容器和 macOS/Linux 运行未复测。此前各轮实测和 mock 验证记录保留下文，不能视为本轮复测结果。

### 本次真实开发模式与设备操作反馈（macOS arm64，2026-10-22）

- `pnpm dev` 与桌面宿主默认 native，启动器将所选模式传给 Vite/Tauri；保留显式 `MAAVERGE_MODE=mock` 和浏览器 `dev:mock`。已有 mock 数据仍与 native 数据隔离。旧终端若设置过 mock，需移除或修改变量后完全退出并重启。
- 设备发现、自动/手动连接和断开在页首显示进度、数量、空结果与错误，操作期间防止重复提交；重试清除旧诊断。连接按实际设备快照确认就绪，观察 35 秒以覆盖核心默认 30 秒异步期限，未就绪显示待确认，不误报成功。
- 自动连接保留 ADB 错误详情；本机候选端口改为最多 4 并发、总计 60 秒发现预算并预留最终列表查询，诊断按候选顺序呈现。超时只终止对应 ADB 客户端；不终止共享 ADB 服务。
- Playwright 在受管理的同一进程中直接运行 Vite，避免开发启动器的独立进程组在测试退出后残留；全套测试使用新建的独立端口，结束后确认端口可重新绑定。
- 完整 `pnpm check` 通过：12 项工程回归、契约同步与 8 项契约测试、三个工作区类型检查、643 项 Bun 测试、4/4 CTest、Python ruff/mypy 与 274 项 pytest、Rust fmt/clippy/test。41 项 Chromium mock E2E 通过，包含异步未就绪、重复点击、空结果、错误重试及 390px 窄窗。
- 完整 `pnpm build` 通过，包含自包含服务、包内空 PATH smoke、Rust transport smoke、release `.app` 与 arm64 `.dmg`。本轮未操作真实模拟器或游戏、请求模型或发布；真实连接与 Windows/Linux 的本次变更仍待对应环境验收。

### 本次 macOS 品牌行避让（2026-10-22）

- macOS 桌面侧栏顶部预留 32px 原生红黄绿按钮区域，Logo 与 Maa Verge 标题在其下方左对齐；恢复通用 32px Logo 和响应式字号，品牌区域仍可拖动窗口。Windows、Linux 和浏览器使用原有布局。
- 桌面前端类型检查与生产构建、41 项 Chromium mock E2E 通过。浏览器中对 900/1280/1440px 宽度、640/900px 高度与浅深主题进行 48 组修改前后检查：12 组 macOS 样式无图文重叠或横向溢出，36 组其他平台/浏览器布局测量一致；深色侧栏截图已检查。
- 本轮仅验证浏览器 mock 与平台样式，未重新构建安装包或验收原生红黄绿按钮；Windows/Linux 原生窗口仍待对应宿主验证。E2E 结束时遗留的本轮 Vite 进程组已手动清理。

### 本次圆形 Logo 与 macOS 显示修复（macOS arm64，2026-10-22）

- 修复 macOS 专用样式主动隐藏品牌图标的问题；品牌行保留原生窗口按钮空间，使用 24px Logo 与紧凑文字，900px 窄桌面不溢出。启动页、侧栏和浏览器共用圆形透明 PNG。
- 按用户明确要求，以现有 Logo 为编辑输入，通过 imagegen CLI、`gpt-image-2.5-flare` 和本机 Codex 当前接口配置生成圆形帕拉斯图标；保留双角、发型、玫瑰和蓝色渐变。凭据未输出或写入仓库。
- 重新生成 PNG/ICO/ICNS；macOS ICNS 在 1024px 透明画布上使用 824px 图案（每边 100px 留白），避免原满幅素材在 Dock 中偏大。脚本使用内嵌 PNG 的临时 SVG，无新增依赖；两个连续生成结果的五个文件哈希一致，ICO 六种尺寸与 ICNS 八个 PNG 条目均已解码检查，留白随分辨率缩放。
- 桌面前端类型检查与生产构建、37 项 Chromium mock E2E 通过。另检查 macOS 样式在 900/1280/1440px、浅深主题下图片已解码且可见、图文边界及页面无横向溢出；24–64px 图片浅深底已检查。`tauri build --bundles app -- --locked` 成功，使用独立数据根和 mock 模式启动新版 `.app`，原生 WebView 中圆形 Logo 正常显示；包内 ICNS 与源文件哈希一致。
- Dock 已验证图标文件尺寸、透明边界及包内资源；实际 Dock 与相邻应用的视觉对比因系统锁定未完成。未重新制作 DMG、交互安装或验证 Windows/Linux 原生图标，本轮未连接真实游戏设备或发布。

### 本次开发启动模块加载修复（macOS arm64，2026-10-22）

- 用户确认截图中的 `Importing a module script failed` 来自终端 `pnpm dev`。同一 checkout 的旧 Vite 实例共用 `.vite/deps`；不同依赖图覆盖预构建文件后，旧 Tauri 模块 URL 返回 `504 Outdated Optimize Dep`。现按实际开发端口隔离缓存，并提前包含 contracts 内动态导入的四个 Tauri API 模块。
- 启动页识别三类浏览器的动态模块加载失败，显示「重新加载界面」并完整重载页面，清除 WebKit 缓存的失败导入；普通服务错误继续使用重新连接。开发启动器在 macOS/Linux 清理自己创建的整个进程组，Windows 保持 `taskkill /t`，避免退出后残留桌面/Bun 进程。
- 最终 `pnpm check` 完整通过：9 项工程回归（环境 6、进程清理 2、实际 Vite 缓存隔离 1）、契约同步与 8 项契约测试、三个工作区类型检查、637 项 Bun 测试、4/4 CTest、Python ruff/mypy 与 274 项 pytest、Rust fmt/clippy/test。37 项 Chromium mock E2E 通过，包含人为中断 Tauri 模块请求后重载恢复。完整 `pnpm build` 再次通过，包含包内空 PATH smoke、Rust transport smoke、release `.app` 与 arm64 `.dmg`。
- 实际 `pnpm dev` 编译 Debug 二进制后，将同一可执行文件复制到隔离的临时 `.app`，连接本轮 Vite；在 macOS WKWebView 中实测主页与任务表正常显示，确认 WebView → Rust → TypeScript/Bun 的 mock 数据通信。另一次直接 `pnpm dev` 启动后发送 SIGINT，启动命令退出 0，Vite、Tauri、桌面与 Bun 后代均结束，已有其他 mock 实例保留。
- 本次验证使用独立 mock 数据与端口；未连接真实设备、请求模型、交互安装或发布。临时 Debug bundle 的开发 WebView 检查不代替发行包安装/退出验收。Windows/Linux 的本次变更仍待对应宿主执行。

### 本次编译恢复与跨平台环境处理（macOS arm64，2026-10-22）

- 在 macOS 26.6.2 / Apple Silicon 复现 `pnpm build` 无法解析 `tar` / `yauzl`，以及后端类型检查缺少 Bun 类型；原因是本地依赖未随 TypeScript 后端新增工作区同步。执行 `pnpm install --frozen-lockfile` 后恢复，依赖锁文件未修改。
- 构建、开发、检查与后端入口现在提前检查各工作区的直接依赖，缺失时提示冻结同步。引导脚本校验并修复固定 Node/pnpm，默认安装固定 Bun；浏览器 MockOnly 跳过 Bun/Python，同时指定 Native 时仍安装 Bun。包装脚本拒绝缓存中的错误版本，Node 下载/校验失败保留旧工具。
- 桌面编译前执行 `doctor --native`：校验固定 Node/pnpm/Bun/Rust、支持的宿主目标、CMake 3.25+ 与实际 C++20 编译/链接；Windows 复用 Visual Studio 内置 CMake，支持 `.tools/cmake/bin`，过期本地 CMake 可回退到合格系统工具。Linux 检查 pkg-config 系统库，文档明确 Ubuntu 22.04 的 CMake 升级路径与 24.04 的 FUSE 包差异。浏览器环境可用 `doctor --mock`。原生 CI 增加同一环境门禁。
- macOS 本机 `pnpm check` 通过：契约同步、三个工作区类型检查、637 项 Bun 测试、8 项契约测试、4/4 CTest、Python ruff/mypy 与 274 项 pytest、Rust fmt/clippy/test；默认跳过的包内 Rust transport 测试已在构建阶段单独执行通过。6 项环境回归覆盖缺少后端依赖、旧 CMake、系统回退、Windows VS CMake 和平台提示；另有 9 项隔离 Bash fixture 验证引导选项、版本恢复、失败保留及参数传递。
- 完整 `pnpm build` 通过，包含 Bun/C++ 自包含打包、空 PATH 包内 smoke、Rust transport smoke、release 桌面编译和 `.app` / arm64 `.dmg`。本轮未进行交互安装、WebView/界面重验、真实设备操作或发布；Windows/PowerShell、Linux 与 Intel macOS 的本次修改尚未在对应宿主执行，新增 CI 配置不作为已通过结果。

### 本次画面预览与人工点击（2026-10-22）

- 底部「画面」接入类型化 `device.frame` / `device.click`，与顶部当前设备联动；刷新频率保存于 `maaverge:ui:preview-fps`，非法或不可读设置回到默认 60 Hz。页面隐藏、面板收起或切换设备时停止后续刷新并丢弃旧回复，画面先解码再替换，截图慢于目标间隔时不堆积请求。
- 点击必须显式开启，并使用正在显示的 `frameId` 和 PNG 坐标；应用服务只接受当前设备、当前 worker、2 秒内且仍在最近 32 帧记录中的可控帧，另核验空闲状态与坐标范围。点击按 `requestId` 在会话内去重，成功与失败结果均保留于短时内存缓存；结果未知时不自动重放。预览实现不保存或上传图像，点击事件只记录操作元数据。
- 任务执行中只读取 MaaCore 最近缓存画面，禁止手动点击，不额外启动截图来争用任务控制权。目标 Hz 与画面中的实际「显示帧率 FPS」「往返延迟」分别展示；60 Hz 是默认目标，不能据此保证真实设备达到 60 FPS。取帧、PNG 编码、IPC、解码和 WebView 刷新都会影响实际表现。
- 取帧路径按设备 ID 读取连接记录，并通过 SQLite 的运行中记录索引查询控制状态，避免每帧解析全部执行历史；退出时提前启动 worker 的有界关闭，合成截图卡住时仍可释放设备锁。
- Windows x64 本轮通过契约同步、三个工作区 TypeScript 检查、8 项契约测试、4/4 CTest、636 项 Bun 测试（可移植 SIGTERM 在 Windows 明确跳过 1 项）、Python ruff/mypy 与 274 项 pytest、Rust fmt/clippy/test；包内 Rust transport 测试另行执行通过。新增测试包含 PNG/坐标校验、跨 worker/过期帧拒绝、截图与点击互斥、成功及未知结果去重、EOF 卡住截图清理，以及 TypeScript → 合成 C++ 核心的真实 NDJSON frame/click 贯通。
- 36 项 Edge（Chromium）mock E2E 与前端生产构建通过，覆盖默认 60 Hz、切换及持久化、非法偏好回退、点击坐标和留白、运行只读、暂停/隐藏/切换/收起及失败重试；浅深色与 390px 窄窗画面已检查。浏览器 mock 在 5/60/120 Hz 目标下短时显示约 5/57–58/112–115 FPS，仅作为本机前端调度结果。自包含 Bun/C++ 打包、空 PATH 包内 smoke 和 Tauri Rust transport smoke 通过。
- 本轮新增画面与点击能力的验证范围限定于 mock 和合成核心；真实模拟器持续帧率、点击延迟与坐标效果，以及 macOS/Linux 的实际 WebView 路径仍待单独验收。下节此前 MuMu 的截图选择耗时与连接记录不能替代此次持续预览和点击验收。

### 本次 Windows 真实 MuMu 与可选增强截图（2026-10-22）

- 设备页新增可保存的 ADB / MuMu / 雷电截图方式、安装根目录和实例索引，并展示核心回调确认的实际方式；草稿跨页/重载保留。设置在下次连接生效，旧配置保持 ADB。MuMu/雷电增强模式缺证据、失败或降级时拒绝任务；运行中协议失效会停止、标记离线并报告原因。实现及 API 限制见 [连接说明](emulator-connection.md)。
- Windows x64、MuMu 6.8.1.0 / Android 15，官方 MaaCore **v6.20.1** 与资源 **7ce3228b4744bae8571c641f85020de7a757c0c6** 实际下载、选择性安装、隔离校验并生效。修复 MuMu SDK 拒绝 Windows 扩展路径前缀的问题；实际选择 **MumuExtras，11 ms**，同次 ADB 候选为 145 / 227 / 616 ms。此数值为首次候选选择耗时，不是持续帧率。
- 连续十次新帧的异步成功确认、断开重连、MuMu TCP/serial 别名复用同一 worker、第二控制者被共享设备锁拒绝通过。锁身份不依赖截图选项，Python 参考同步相同别名规则。独立测试数据及核心日志位于忽略目录 `.maaverge/windows-real-20261022`，不提交真实画面或本地数据。
- `pnpm check` 通过：契约、TypeScript、**616 项 Bun 测试**（Windows SIGTERM 另有 1 项明确跳过）、7 项契约测试、4/4 CTest、Python lint/mypy 与 274 项 pytest、Rust fmt/clippy/test；Rust 包内 transport 集成测试另行执行通过。**30 项 Chromium mock E2E** 通过，新增截图配置持久化、草稿和输入校验；浅深色及窄窗布局已检查。
- 自包含 Bun 服务与 C++ worker 重新打包、空 PATH 包内 smoke、release 桌面构建（无安装包）通过；实际 WebView2 → Rust → 包内服务 → C++ → MuMu 连接成功，页面无脚本异常，设备页显示「MuMu 增强截图」。本轮未执行游戏内任务或消耗、调用付费模型、上传账号数据、发布 release；雷电、macOS/Linux 增强截图与真实游戏任务仍待分别验收。

### 本次 C++ includePath 与本地依赖（Windows x64，2026-10-22）

- nlohmann/json 3.12.0 的未修改单头文件及 MIT 许可证保存在 `3rdparty/nlohmann-json`，记录来源和 SHA-256；CMake 校验头文件并直接引用本地目录，配置时不再下载。VS Code 的 `includePath` 同步指向该目录，保留 CMake Tools 提供编译器、SDK、宏和 C++20 配置。
- Windows 生产构建及 4/4 组合成 CTest 通过；C/C++ 配置通过扩展 JSON Schema 校验，包含目录存在，头文件和许可证哈希与记录一致。本轮未直接验收编辑器界面或 macOS/Linux。

### 本次 TypeScript/C++20 迁移（Windows x64，2026-10-22）

- 固定 Bun 1.4.3，保留 Node 24.22.0/pnpm 10.20.0 前端工具链。本机完成四目标最小后端交叉编译和 Windows x64 执行；覆盖 stdio、SQLite、子进程、ZIP/TAR、保 rowid 备份与独占锁。空 PATH、损坏 dotenv/bunfig 不影响独立后端启动；其他宿主结果见下文 CI 记录。
- `pnpm check` 通过：契约同步、TypeScript、7 项契约测试、611 项 Bun 测试、Python ruff/mypy 与 274 项 pytest、Rust fmt/clippy/test。Bun 另有 1 项 Windows 不支持的可移植 SIGTERM 测试明确跳过；默认 Cargo 检查跳过需独立包的集成测试，该项已在打包阶段单独执行通过。Python 针对 Linux/macOS/Windows 的 mypy 均通过，28 项 Chromium mock E2E 通过。移除 PyInstaller 及其专用依赖后，冻结同步和 274 项 Python 回归、完整 `pnpm check` 再次通过。
- Python↔Bun 双向争锁、崩溃释放、保 rowid 备份、事件顺序、请求去重、停止竞态、EOF 尾帧与 stdout 断管清理回归通过。全部 19 类任务的参数/预算及 mock Agent 与 Python 对照通过，包括显式 null、Unicode、数字 token、重启后严格整数校验和未知大整数保留。
- Windows C++ Release 的 4 组 CTest 覆盖 23 个合成情形，包括回调、异步确认、超时/崩溃/EOF、跨语言设备互斥；生产构建不依赖 Python，工作进程 PE 导入表仅含 KERNEL32.dll。它动态加载的 MaaCore 仍有自己的原生依赖。
- 自包含后端 → C++ mock 设备锁、RPC、提案、持久化、去重、停止、资源等待切换与重启通过；同一编译后端的更新作业 → 选择性提取 → C++ 合成 MaaCore 校验通过。桌面宿主共用 Rust transport → 编译后端 → C++ 锁的冒烟测试通过，同时检查事件转发与退出释放。
- `pnpm test:desktop-webview` 已在本机真实 release WebView2 窗口通过：DOM 操作启动/停止计划、包内 C++ worker 出现及释放、正常关窗退出、重启后保留停止记录；页面异常与退出后残留进程均为零。独立数据、设备锁和 WebView profile 在测试后清理。该测试发现并修复了 Tauri 不允许点号事件名的问题，宿主改用 `runtime-event`，内部 JSON-RPC 继续使用 `runtime.event`；相同测试能检出旧程序的错误。应用进程树没有 Python/Node/Bun 解释器进程，但开发机本身仍装有这些工具。
- Windows MSI 与 NSIS 完整本地构建通过，运行时目录仅包含两个可执行文件、build-info 和许可证；未交互安装、签名或发布。新版安装包尚未在卸载全部开发工具的干净系统中验收，空 PATH 测试仅证明本次进程路径不依赖外部语言运行时。
- macOS 13.5、Ubuntu 22.04 为目标基线；Ubuntu 22.04 已覆盖宿主构建和后端容器运行，macOS 13.5 实机仍未验证。正式签名/公证、下载后的真实 MaaCore 加载、三平台干净系统交互安装以及 Linux/macOS 实际 WebView 生命周期仍待验收；宿主 CI 和容器不能替代这些结果。

本轮只运行 mock、替代 ADB 与合成库，未连接真实游戏设备、调用付费模型或发布 release。迁移交接见 [runtime-migration.md](runtime-migration.md)。下列较早记录属于当时的 Python 架构，不能作为新版跨平台验收结果。

### 四平台宿主 CI（2026-10-22）

提交 `302d52e` 的 [完整工作流 39644328852](https://github.com/DeathofBrain/maa-verge/actions/runs/39644328852) 全部成功。四个宿主分别编译并执行 Bun 1.4.3 最小探针，验证空 PATH、SQLite/WAL、独立 DELETE journal 备份、稀疏 rowid、独占锁、stdio、子进程和 ZIP/TAR。随后原生矩阵实际执行以下验证：

| 宿主与架构           | CMake/CTest | 后端测试                    | 完整构建产物       |
| -------------------- | ----------- | --------------------------- | ------------------ |
| `windows-2022` x64   | 4/4 通过    | 611 通过、1 项 SIGTERM 跳过 | MSI、NSIS          |
| Ubuntu 22.04 x64     | 4/4 通过    | 612 通过                    | DEB、RPM、AppImage |
| `macos-14` arm64     | 4/4 通过    | 612 通过                    | `.app`、DMG        |
| `macos-15-intel` x64 | 4/4 通过    | 612 通过                    | `.app`、DMG        |

- 四平台 Rust fmt/clippy/test、包内独立后端 smoke、编译后更新作业 → 精简提取 → C++ 合成核心校验，以及 Tauri Rust transport → 后端 → C++ 设备锁 smoke 均通过。macOS 两个后端可执行文件使用各自权限进行 ad-hoc hardened 签名，签名检查和签名后启动通过；未使用正式证书或公证。
- Ubuntu 应用 job 的契约、前端、Python lint/三平台类型检查与 274 项测试、28 项浏览器 mock E2E 通过。该 job 无原生测试产物，后端为 610 项通过、2 项明确跳过；原生矩阵则执行相应编译后辅助进程测试。
- `pnpm test:clean-linux` 在 Linux CI 非 root 用户下通过：原始 Ubuntu 22.04 容器确认没有 Python/python3/Node/Bun，运行会话断网，只挂载只读运行时和独立数据目录，验证 mock 提案、计划/设置持久化、C++ 设备锁、请求去重、停止及 EOF 后重启。另已将该安装包内的后端取出，在本机 Docker Linux 引擎中复验通过。容器与临时数据退出后清理。
- 发行运行时目录检查仅含两个可执行文件、build-info 与许可证；没有 Python 环境目录、node_modules 或原生 JS 插件。完整安装包作为未正式签名的 CI artifact 保存，不构成已发布 release。后端容器、Windows 实际 WebView 与目标系统安装的验收边界见上一节。

### 历史 Windows x64（Python 运行时）

宿主：Windows x64；Node 24.22.0、pnpm 10.20.0、Python 3.12.15、Rust 1.90.0。工具与虚拟环境保留在本机忽略目录，不提交至 Git。

- TypeScript 契约同步、前端类型检查与生产构建已通过。
- Python ruff、针对 linux/darwin/win32 的 mypy 检查与 73 项测试已通过。覆盖预算、请求去重、重启恢复、设备互斥、独立资源更新、任务边界切换、异步重连失败与超时恢复、归档别名、Windows 长路径和工作进程监督。
- Rust fmt/clippy/test 编译检查已通过；目前没有单独的 Rust 单元测试，不将编译检查计作业务测试。
- `pnpm check` 已完整通过：契约、前端类型、Python lint/类型/73 项测试及 Rust 检查。
- PyInstaller 打包服务的 stdio 快照、正常 EOF 退出及 frozen 辅助进程调用官方 Updater 的本地合成 ZIP 验证已通过。
- Windows 中文 MSI、NSIS EXE 完整构建已通过，输出位于 `apps/desktop/src-tauri/target/release/bundle/`。
- 7 项浏览器 mock 端到端测试已通过（默认 Chromium headless shell 及本机 Edge），覆盖计划持久化、提案审阅、停止、资源独立更新、任务中等待切换、错误反馈和窄屏导航；桌面及 390px 视口截图已检查。
- 官方在线元数据、实际下载与 Windows 原生加载验证通过：MaaCore **v6.20.0** 自动首装、MaaResource **d7ecff56c50e53424c787dfe435b565be50a586e** 独立安装与生效、回滚至基础资源；均由实际 MaaCore 隔离进程校验，未连接游戏设备。
- 归档测试覆盖 macOS 外目录和动态库文件别名；安全解压把合法文件别名物化为普通文件，拒绝越界及循环链接。macOS 最低目标按上游 MaaCore 设为 13.3。

该 Windows 主机未连接真实模拟器/安卓设备，也未调用付费模型。Linux 尚未实机验收，CI 的配置不能替代平台实测。安装包尚未进行交互安装、签名或公证。

### macOS arm64

2026-10-20 在 Apple Silicon、macOS 26.6.2 上完成开发环境验证：Node 24.22.0、pnpm 10.20.0、uv 0.13.3、Python 3.12.15、Rust 1.90.0。Node/pnpm/uv 和 Rust 安装在仓库忽略的 `.tools` 目录；Python 由 uv 管理，项目使用 `.venv`。未改动系统工具或用户 Shell 配置。

- `bash tools/bootstrap.sh` 冻结安装前端和 Python 依赖；三个锁文件均未改动。
- `bash tools/pnpm.sh run doctor --native` 通过；Command Line Tools 可用，ADB 未安装，不影响 mock 开发。
- `bash tools/pnpm.sh check` 完整通过：契约同步、TypeScript、ruff、mypy、73 项 Python 测试与 Rust fmt/clippy/test 编译检查。Rust 仍无独立业务单元测试。
- `bash tools/pnpm.sh -r build` 前端生产构建通过；Playwright Chromium 的 7 项浏览器 mock 端到端测试通过。测试服务复用项目开发启动器，避免误用全局不同版本的 pnpm；测试退出后未残留服务。
- `MAAVERGE_MODE=mock bash tools/pnpm.sh dev` 原生编译和启动通过。另行构建 Debug `.app`，实机检查总览、设置页和“模拟工作空间”状态，确认 WebView → Tauri → Python 的本地通信；通过应用退出命令确认桌面与 Python 子进程正常退出。

以上仅验证 macOS arm64 开发环境与 mock 路径。Debug `.app` 依赖项目 `.venv`，不是独立发行包；未验证 macOS Python 侧进程发行打包、签名、公证、下载 MaaCore 后的加载或真实游戏设备。

### 本次任务表与连接改动的验证（macOS arm64）

- `bash tools/pnpm.sh check` 通过：生成契约同步、前端 TypeScript、ruff、mypy、**179 项 Python 测试**及 Rust fmt/clippy/test 编译检查。新增测试覆盖 19 类任务的提交/回调、参数错误、禁用过滤、零消耗、过期回调隔离、自动发现、设备与 ADB server 别名锁、自动连接取消与手动断开竞态。Rust 仍无独立业务单元测试。
- `bash tools/pnpm.sh -r build` 前端生产构建通过；**13 项 Chromium mock 端到端测试**通过，涵盖全部 19 类任务的配置持久化、重复任务/排序/启停、高级参数与无效草稿保留、预算统一保存和拒绝、自动连接偏好，以及现有运行/停止/更新流程。桌面总览、任务编辑器和 390px 窄屏已截图检查。
- 验证使用浏览器 mock、替代 ADB/探测器及合成 Worker，未连接真实模拟器、未操作账号、未上传数据或调用付费模型；未把此次改动标为 Windows/Linux 或真实 MaaCore 游戏行为验收。

### 本次 UI 工作台重构验证（macOS arm64）

- `bash tools/pnpm.sh check` 通过：契约同步、TypeScript、ruff、mypy、**202 项 Python 测试**及 Rust fmt/clippy/test 编译检查。新增表级元数据、设备绑定、全局/表级双重额度和模拟器别名重连回归；Rust 仍无独立业务单元测试。
- `bash tools/pnpm.sh -r build` 生产构建通过；**23 项 Chromium mock 端到端测试**全部通过。保留原13项场景，并覆盖跨页/重载草稿、显式零限额、日常/专项分组、全局/字段搜索、两种草稿启动选择、设备连接去重、公招只计算预设、设置草稿、重复作业精确定位及任务表跨组/重启定位。
- 已截图检查 1440px 浅色桌面、1280px 深色桌面、390px 窄窗；窄窗遍历八个入口无页面横向溢出。设备、基建复杂表单、任务表设置和跨页停止也在浏览器 mock 中检查。
- React 仅使用 typed RPC；自动连接启动路径等待设备就绪。重连保留旧设备ID，避免 ADB 别名变化使表级绑定失效。应用授权与本表限额分开校验；运行中编辑保留为下次执行配置。
- 本轮未进行真实模拟器/账号、付费模型、原生安装包或 Windows/Linux 实机验证。截图为浏览器 mock；定时、真实画面和库存数据没有用虚构结果代替。

### 本次主页、动效与品牌改名验证（Windows x64，2026-10-21）

- 默认主页仅显示运行统计、当前执行、最近记录、设备与组件版本，任务表从侧栏进入。刷新回到主页；已保存任务表、设备绑定、预算及会话草稿保持原有行为。
- 应用显示名、窗口/托盘、关于页、文档与根包名已更新为 Maa Verge / `maa-verge`；GitHub 仓库已改名，本地 `origin` 已更新。为兼容已有数据及设备互斥，应用标识、运行时模块/可执行文件、环境变量、数据目录与存储键沿用现有标识。
- `pnpm check` 通过：契约同步、TypeScript、Python ruff/mypy、202 项 Python 测试与 Rust fmt/clippy/test 编译检查。Rust 仍无独立业务单元测试。`pnpm -r build` 前端生产构建通过。
- `pnpm test:e2e:mock` 的 26 项 Chromium 测试全部通过：主页不含任务表管理、侧栏进入编辑、运行/停止与最近记录同步、草稿恢复、原有预算/设备/更新流程和窄窗导航均已覆盖。
- 已截图检查 1440px 浅色、1280px 深色、390px 窄窗及运行中状态；窄窗无横向溢出，浏览器无页面脚本错误。验证侧栏悬停背景渐深（约 200ms）、页面淡入、按钮/快捷卡片反馈和系统减少动态效果；验证主页的更新与消耗设置快捷入口。
- 本轮验证使用 Windows 浏览器 mock 与合成运行时测试；未连接真实游戏、调用付费模型、重新构建发行安装包或验收其他平台。定时、掉落、库存与真实画面等未接入结果不在主页虚构展示。

### 本次一体化顶栏与缩放修复验证（Windows x64，2026-10-21）

- Windows/Linux 配置取消独立系统标题栏；工作空间顶栏与品牌区可拖动，原生双击最大化/还原，按钮、设备选择和搜索排除拖动。Windows/Linux 窗口按钮只在桌面显示，启动连接等待/失败页面也可操作。macOS 配置为 Overlay 并保留原生红黄绿按钮，预留品牌区域空间；本轮未进行 macOS/Linux 实机验证。
- 固定顶栏高度（桌面 57px），随界面主题同步原生窗口和 WebView 的背景，修正 resize 时露出固定深色底层的问题。Windows 实机捕捉到 DWM 最大化过渡拉伸整张旧 WebView 画面，现仅对主窗口关闭该系统过渡；复测最大化与双击还原后截图已无中间拉伸帧。CSS 悬停、页面切换及减少动态效果支持保留。
- `pnpm check` 通过：契约同步、TypeScript、Python ruff/mypy、202 项 Python 测试及 Rust fmt/clippy/test 编译检查；Rust 无独立业务单元测试。`pnpm -r build` 前端生产构建通过。
- 28 项 Chromium mock E2E 通过，包含浏览器隐藏窗口按钮、设备选择/搜索交互、加载期间窗口命令、resize 后最大化图标与监听清理、浅深主题的两层背景同步；连续 900/1280/1700px 宽度逐帧采样中，顶栏保持 57px、按钮区保持 56px 高及 138px 宽。这些浏览器测试不替代原生绘制验收。
- 使用独立标识、数据根和编译 profile 的 Windows 原生 mock 窗口，实测无独立标题栏、顶栏拖动、最大化、双击还原及边缘缩放。验证启用托盘偏好时关窗隐藏且进程驻留，单实例入口恢复窗口；关闭该偏好后正常退出。未连接真实设备、调用付费模型或重新制作发行安装包。

### 本次主页精简验证（Windows x64，2026-10-21）

- 主页侧栏不再展开“我的任务表”，日常任务表改从独立“任务表”入口进入；专项任务入口、已有配置、草稿和新增/复制行为保留。删除搜索快捷键徽标、侧栏“本地优先”、当前执行与最近记录的冗余说明；主页空闲时运行条仅显示就绪/等待连接，运行中的消息、进度和停止操作保留。
- `pnpm -r build` 前端生产构建通过，28 项 Chromium mock E2E 全部通过；覆盖独立任务表导航、草稿、运行/停止、搜索、设备、预算、更新与九个窄窗入口。另已检查 1440px 浅色/深色和 390px 窄窗截图，确认无横向溢出，Ctrl+K 搜索仍可用且无页面脚本错误；文档中的 mock 主页截图已更新。
- 本轮仅修改前端并验证 Windows 浏览器 mock，未重复原生窗口/安装包验收或进行其他平台、真实设备及付费模型测试。

### 本次帕拉斯 Logo 验证（Windows x64，2026-10-21）

- 按用户指定使用 `gpt-image-2.5-flare` 与所提供的帕拉斯参考图生成蓝色渐变、白色头部图形，保留双角、发型和玫瑰；处理外部白底为透明圆角。侧栏、启动页、浏览器、桌面与安装包图标统一来自 `public/logo.png`，托盘复用默认窗口图标，替换原有绿色占位图。
- 前端类型检查与生产构建、Rust fmt/clippy（locked，拒绝警告）通过；五个衍生图标连续生成的文件哈希一致，PNG/ICO/ICNS 的尺寸与解码已检查。已检查 16–128px 浅深背景图、1440px 浅色/深色主页和 390px 窄窗导航；图标以固定 32px 加载，浏览器图标来源一致，无横向溢出或页面脚本错误，主页文档截图已更新。
- 本轮未重新启动原生桌面或构建发行安装包，窗口/托盘在系统中的实际显示以及 macOS/Linux 图标展示仍需对应运行环境检查；未操作真实游戏设备。图片模型调用由用户明确指定并授权。

### 本次主分支集成验证（Windows x64，2026-10-21）

- 主分支集成主页仪表盘、独立任务表入口、顶栏与缩放修复、品牌改名及帕拉斯 Logo。README 同步当前功能、预览边界、Logo 与开发命令；AGENTS.md 规定 Conventional Commits 冒号后的说明使用简体中文。
- 合并后的 `pnpm check` 通过：契约同步、TypeScript、Python ruff/mypy、202 项 Python 测试和 Rust fmt/clippy/test 编译检查；Rust 仍无独立业务单元测试。`pnpm test:e2e:mock` 的 28 项 Chromium 测试全部通过，README 本地链接和图片路径已检查。
- 本次集成未重新构建发行安装包或进行其他平台、真实游戏设备的验收，沿用上述各次验证的实际范围。

### 本次 MaaCore 选择性安装验证（Windows x64，2026-10-21）

- 参考 maa-cli 的库/资源分别提取方式，为首装与官方 Python Updater 的 ZIP/TAR 更新统一接入选择性安全解压。保留顶层原生依赖、控制单元插件、完整基础资源和运行根许可声明，跳过原 GUI、独立更新器、.NET/WPF、示例与界面素材；不从任意子目录扁平化收集 DLL。[规则与依据](maacore-runtime.md)。
- Python ruff、针对 Windows/Linux/macOS 的 mypy、**242 项 Python 测试**通过。覆盖三平台库筛选、完整资源、版本化文件别名、跳过内容不打开/落盘、被跳过成员的路径/重复/特殊文件/链接检查，以及首装、更新、原版本不变和回滚。
- PyInstaller Python 侧进程构建与冒烟检查通过：mock JSON-RPC 快照、EOF 正常退出，以及 frozen 官方 Updater 的本地合成 ZIP 选择性提取均已验证；合成库文件只作文本载荷，不加载为原生库。
- 官方 v6.20.1 Windows x64 ZIP 下载及 SHA-256 校验通过；精简后约 **325.1 MiB**，较全部归档展开约 **545.0 MiB** 减少 **40.35%**。首装、从 v6.20.0 更新、空闲等待后激活及回滚均通过真实核心隔离进程的版本/API/资源加载校验；原核心文件哈希未变。没有连接游戏设备。
- 本轮未修改前端、契约或 Rust，未重复浏览器、原生窗口或完整安装包验收。macOS/Linux 选择规则由合成归档覆盖，尚未在对应平台加载精简后的真实核心；此前已安装的完整 generation 不做原位裁剪。

### 本次应用更新持久化与退出安装（Windows x64，2026-10-27）

- 应用更新入口位于 `apps/desktop/src-tauri/src/app_updater.rs`；MaaCore/资源下载继续由 TypeScript 服务负责。已验证应用包与清单先同步写盘再原子提交，默认位于程序目录 `config/updates/app`，遵循自定义数据根。
- 安装确认提供「立即更新并重启」与「下次启动时更新」，说明当前执行将停止；后台组件作业与任务占用不再禁用应用安装。已下载包在下次启动、本地服务和调度开始前离线复核并安装，与联网检查开关独立。
- 安装前记录尝试，失败或中断后允许旧版正常启动并手动重试；仅在候选版本实际启动后清理缓存。失效缓存拒绝安装且不阻止打开应用。立即安装不再等待组件 RPC 长时读锁，先正常关闭，再按截止时间收尾；Windows 核对本实例自有服务/更新作业/worker 并等待退出，不关闭共享 ADB。
- Windows Rust fmt、严格 clippy 及完整单元测试通过：34 项通过、3 项按既有条件忽略，覆盖真实 Tauri 更新插件离线恢复与签名/版本复核、缓存恢复、安装尝试重排、损坏/跨平台缓存、RPC/管道卡住、退出结果复用及残留工作进程清理。Windows debug 桌面二进制编译通过，程序与测试进程的 Common Controls v6 清单已核对。四个工作区类型检查、23 项契约与更新签名发行工具检查，以及 18 项 Bun 更新门禁/生命周期检查通过（另 2 项按平台或夹具条件跳过）。12 项 Edge 应用更新回归及前端生产构建通过，含失败重排、全局 RPC 忙碌不阻塞安装和安装自身重复保护。测试使用本地合成数据与进程，不连接游戏、不运行真实安装器、不发布版本。Windows 安装器启动后的取消/失败需要手动重开旧版；macOS/Linux 的本次变更与各平台真实升级、系统权限提示尚待对应宿主验收。

### 本次任务页三合一验证（macOS arm64，2026-10-28）

- 侧栏的「任务表」「专项任务」「任务表执行」合并为单一「任务」：任务表列表 + 右侧详情抽屉，执行监控为同页页签；开始执行不再跳转，抽屉运行条与底部运行栏就地反馈，「查看执行」和「返回任务设置」双向直达。页头提供多选设备批量启动，逐设备校验绑定、离线、忙碌状态并汇总成功/失败；同时修复批量启动未透传目标设备、误落到当前设备的问题。
- 仅取消界面概念：`Plan.group` 契约、校验器、后端与数据库未改；新表固定写入 `daily`，旧 `specialized` 表原样读取、统一显示，编辑保存不改写原分组。
- 新增 `tests/ui/task-center.spec.ts` 6 项，并迁移受影响的 13 个界面 spec。完整 Chromium 界面回归 **244/244** 通过（隔离测试服务与确定性夹具）；定向回归中的 101 项相关用例此前独立通过。
- `pnpm check` 通过：工程脚本、契约与产品知识生成同步、四个工作区 TypeScript、CTest **4/4**、固定 Bun **1,404 项通过、9 项条件跳过**、Python Ruff/mypy 与 **276 项 pytest**、Rust fmt/严格 clippy 与 **38 项通过、2 项忽略**。
- 已检查 1440×900 浅色列表/抽屉/运行条、1280×800 深色抽屉及 390px 窄窗列表/抽屉截图：窄窗侧栏正常收起，抽屉不遮挡底部运行栏，无页面横向溢出。截图来自浏览器确定性夹具，未连接真实设备或游戏。
- README 仍以已发布 v0.1.2 的界面为准，本次未改动安装与用户操作说明；包含本次改动的版本发布时需同步「任务」入口、抽屉编辑与开始执行路径。

### 本次 Ninja 缓存构建修复（macOS arm64，2026-10-28）

- 修复 CMake preset 强制 Ninja、而本机未安装 Ninja 时留下失败缓存的问题：preset 改用平台默认生成器；构建脚本新增显式 `--fresh`，由 CMake 刷新缓存并按当前环境重新配置，普通构建继续保留缓存，显式 `CMAKE_GENERATOR` 仍生效。
- 本机既有失败缓存已通过 `node tools/build-core-worker.mjs --fresh --production` 恢复为 Unix Makefiles，Apple Clang 生产构建成功；默认测试构建及 **4/4 组 CTest**、**4 项 CMake 集成回归**、**10 项环境/开发入口回归**和 `doctor --native` 通过。新增集成回归接入原生检查，覆盖真实 preset 的默认生成器、失败缓存恢复、正常缓存保留、默认 CTest 和显式生成器选择。
- 本次只验证 macOS arm64 本机编译与隔离合成夹具，未连接真实设备或下载 MaaCore；Windows、Linux 和 Intel macOS 的本次变更仍待对应宿主检查。

### 本次 CI 提交流程与发布流程简化（macOS arm64，2026-10-28）

- Checks 改为五个彼此独立的任务，且不生成任何安装包：Linux `application` 执行工程、契约、TypeScript、Python 参考与 Chromium 夹具检查；Windows x64、Linux x64、macOS arm64/x64 四个 `native` 任务各自执行 Bun 探针、C++ CTest、TypeScript 运行时、Rust 和本平台打包夹具。移除独立 Bun 门禁与 `needs` 依赖，任一宿主失败不再取消其他平台；Windows 显式准备 NSIS，缺少安装器工具时失败而不是跳过夹具。
- 发布流程改为推送 `v*` 标签或手动补跑已有标签：`verify` 校验标签格式与存在性、解析批注标签指向的提交、拒绝任何已有 Release（含草稿）、核对提交版本和发行说明，并等待该提交的 Checks 成功（最多 30 分钟）。四宿主只构建签名产物；`draft` 重新确认标签未移动且无并发 Release 后，用 `--verify-tag --draft` 创建草稿，上传后按 REST 资产集合校验，失败时删除本次草稿并保留标签，不自动公开发布。
- `tools/check.mjs` 成为检查清单单一来源，新增 `--app`/`--native` 和 `pnpm check:app`/`pnpm check:native`；`tools/ci/run.sh` 改为 `app|native|release`，`release` 只构建 Linux 签名包；新增 `tools/ci/require-checks.mjs` 及 5 项门禁状态测试；`validateRelease` 拆出 `validateAssetSet` 以校验草稿资产；运行时默认单测限时从 5 秒调整为 30 秒。
- 本机 macOS arm64 验证：`node tools/check.mjs --app` 通过（工程脚本测试 **61 项**、契约测试 **35 项**、Python **276 项**、Ruff / mypy 三平台、四个工作区类型检查）；`node tools/check.mjs --native` 通过（Bun **1,404 通过 / 9 条件跳过 / 0 失败**、CTest **4/4**、Rust **38 通过 / 2 忽略**、macOS codesign 夹具 1/1）；`shellcheck`、`bash -n`、Prettier、`git diff --check` 和产品知识 `--check` 通过；用合成 8 项资产执行工作流内联的 `validateAssetSet` 断言通过。
- 全量 Chromium 界面回归 **242/244** 通过；`copilot-library-actions.spec.ts` 的两项失败（保存作业设置后快照缺少 `copilotStorage`、取消右键删除时菜单元素抖动）在单 worker 复跑仍失败。它们位于本次未修改的设置与右键菜单界面，本 CI 变更未触及界面或相关测试。未运行新版远端 Checks；Windows/Linux 新任务、NSIS 安装、四宿主签名矩阵、标签解析和草稿创建均待合并后由真实推送验证。未创建标签、草稿或 Release，v0.1.3-alpha1 保持未发布。

### 本次 bootstrap 缓存恢复修复（Windows x64，2026-10-29）

- 复现 `uv sync --frozen` 构建 Python 参考包时，uv 共享缓存中的 `trove-classifiers` 归档缺少 `dist-info/WHEEL`、报 `os error 2` 的问题。两个平台的引导入口共用冻结同步脚本，仅对这类缓存文件缺失绕过缓存重试一次；保留原始诊断、共享缓存和锁文件，普通构建或网络错误直接失败，第二次失败也返回非零。
- Python 安装添加 `--no-bin --no-registry`，避免向用户命令目录或 Windows 注册表添加入口，消除已有 `python3.12.exe` 不受 uv 管理的冲突警告。
- Windows x64 实际完整 bootstrap 已从原损坏缓存触发恢复，成功构建参考包、安装 **28 个 Python 包**并输出 `Ready`；再次执行正常完成。新增缓存恢复回归 **12/12**；`pnpm check:app` 通过（工程测试 **70 通过、3 条件跳过**，契约 **35 项**、四工作区类型检查、Ruff / mypy 三平台、Python **276 项**）。PowerShell 解析、`bash -n`、Prettier 与 `git diff --check` 通过。未启动产品服务或连接设备；macOS/Linux 引导入口仍待对应宿主验证。

### 本次 bootstrap Rust 自动安装（Windows x64，2026-10-29）

- 原引导只检查原生工具，未安装 Rust；本机用户目录残留的 1.90.0 工具链缺少 `rustc.exe` 和运行 DLL，无法仅通过补 PATH 修复。两平台 bootstrap 现按 `rust-toolchain.toml` 安装并验证 Rust / Cargo、rustfmt 和 Clippy；缺少可复用工具链时，校验官方 rustup 1.28.2 安装器后安装到 checkout `.tools/cargo` 与 `.tools/rustup`，保留用户目录，不修改系统 PATH 或 Shell 配置。pnpm 包装入口同步传递本地 Rust 环境。
- Windows x64 实际安装固定 **Rust / Cargo 1.90.0** 成功，完整 `bootstrap.ps1 -Native` 通过，MSVC / Windows SDK / CMake 探针均通过。Rust 安装及损坏恢复回归 **13/13**，与缓存恢复合计 **25/25**；`pnpm check:app` 通过（契约 **35 项**、四工作区类型检查、Ruff / mypy 三平台、Python **276 项**）。重复运行 Rust 安装脚本直接复用已安装工具链。macOS/Linux 安装仍待对应宿主验证。

### 本次前端统一化基线复验（Windows x64，2026-10-30）

- 基线提交 `abf335c`，分支 `dev`，开始时工作区干净。`tsc -p apps/desktop --noEmit`、`node --test tools/tests/check-kit-css.test.mjs`（9/9）与 `node tools/check-kit-css.mjs` 通过；`pnpm run check:app` 退出 0；`pnpm --filter @maaverge/desktop build` 通过（16.55s）。Playwright 收集 **249 个用例、45 个 spec**，收集数量不代表通过。
- Playwright 默认 Chromium 未安装（`chromium_headless_shell-1248` 缺失），按项目技能改用 `MAAVERGE_TEST_BROWSER=msedge`。全量基线 **243 通过、6 失败**（3.6 分钟，14 workers）：`app-updates.spec.ts:174`、`copilot-attribution.spec.ts:31`、`component-readiness.spec.ts:108`、`component-updates.spec.ts:173`、`copilot-center.spec.ts:56`、`copilot-operators.spec.ts:157`，失败均为等待既有界面元素或文案超时，出现在本轮未改动的界面；按既有失败记录，后续迁移不得以这些用例的通过作为验收依据。
- 本轮未启动真实服务、未连接设备、未调用模型；截图为夹具产物，未提交。

### 本次前端统一化组件套装收尾（Windows x64，2026-10-31）

- 按执行手册完成基线、文档校正、页面类型解耦、Tabs/行组件/Drawer 原语、设置/设备/工具箱/执行监控采用、四个抽屉与删除确认收编、任务编辑器纯逻辑与视图拆分、设置页迁移、测试白名单合并、公共组件迁移与全局类退役。每批独立提交，提交信息为 Conventional Commits。
- 任务编辑器：`features/plans/task-fields.ts`、`plan-draft.ts`、`TaskQueueView.tsx`、`TaskInspectorView.tsx`、`TaskTableSettings.tsx`；保存协调仍由 `PlanEditor` 单点持有。
- 作业中心：`features/copilot/useCopilotWorkspace.ts`、`CopilotRating.tsx`、`CopilotCompatibility.tsx`、`CopilotSettingsView.tsx`、`CopilotImportPreview.tsx`、`CopilotQueueView.tsx`、`CopilotRunMonitor.tsx`、`CopilotLibraryList.tsx`；社区搜索控件与详情抽屉仍由 `CopilotPage.tsx` 容器持有。
- App：`features/app/navigation-model.ts`、`AppNavigation.tsx`、`AgentPage.tsx`、`HistoryPage.tsx`、`RunDock.tsx`、`useAppSnapshot.ts`、`usePlanWrites.ts`；`refreshSequence`、`planWrites` 与 `deletedPlans` 语义随 hook 保留。
- 已退役 `styles.css` 的 `.toggle` / `.segmented` / `.pill`，`Select` 与 `ContextMenu` 已迁入 `kit/`；其遗留样式表因类名不是 `mv-*` 暂留 `src/`。
- 测试：Playwright 收集由 **249 项降至 246 项**；三条白名单用例合并进 `task-center` 与 `autosave-context-menu`，新增 `tests/ui/fixtures/navigation.ts` 统一导航与类型化快照读取。定向验证：设置/设备/监控 **33/33**、弹层相关 **56/56**、任务编辑器 **33/33**、作业中心 **35/35**、多数 App 相关 **37/37** 通过。
- 最终验证（Windows x64 / Microsoft Edge 146，隔离合成夹具）：`tsc -p apps/desktop --noEmit`、`check-kit-css` 单元与门禁、`pnpm run check:app`、`pnpm --filter @maaverge/desktop build` 全部通过；全量 Playwright **246/246 通过**（4 workers，4.3 分钟），用例数由基线 249 减少 3 条（白名单合并），无新增 skip。
- 人工截图抽查（合成夹具，非完整矩阵）：1440×900 浅色、1280×800 深色、390×844 窄窗下的主页、设置、作业中心与任务表详情抽屉；`body` 与 `.main-content` 均无横向溢出，窄窗抽屉保留 20px 边距且不遮挡底栏；未发现遮挡或对齐异常。日志抽屉、右键菜单与全部表单状态未逐一截图。
- 本轮未执行真实设备、模型、下载或发布操作；未重新执行原生 WebView、macOS/Linux 与安装包验收。`Select`/`ContextMenu` 已迁入 `kit/`，其遗留 `select.css`/`context-menu.css` 因类名不是 `mv-*` 暂留 `src/`；新增 kit 样式均写入 `kit.css`。

## 尚未实现及边界

- 用户插件、插件宿主与插件市场尚未实现，已列入后续开发目标；[首轮调研](plugin-marketplace-research.md) 包含现状核查、候选架构与分阶段验收，具体运行时和插件 API 待验证，尚未排期。本次仅整理文档，不代表插件运行或任何平台的兼容性已通过验收。
- Agent 对话当前提供 **mock 规则提案**，供审阅、编辑和手动执行；独立 LangChain 结构化提案基础已就绪，尚未连接产品模型入口；已有离线知识与账号快照查询底座，对话的模型/知识检索编排、向量检索、自主托管、视觉工具和自动打新关卡尚未接入。养成成本、合成配方、掉落概率及完整基建条件计算仍待补齐。
- 新定时使用独立 Schedule；旧 Plan.schedule 字符串保留兼容且不解释为规则。Windows 已验证隔离注册/修改/清理，实际休眠唤醒、系统通知展示及各平台真实定时游戏行为仍待单独验收。
- 应用签名更新自 v0.1.1 起公开，当前正式版为 v0.1.2，包含完整更新包、签名与清单。既有 v0.1.0 无更新器与签名清单，须手动安装一次 v0.1.2；v0.1.1 macOS 无法启动时直接安装新版 DMG。当前源码中应用候选已持久化并支持下次启动安装，应用下载与组件共用 HTTP 代理和安全续传；应用内回滚仍不支持，安装失败后不自动循环重试。Windows 发布者签名、macOS 开发者签名/公证、各平台真实升级安装仍待验收。
- MirrorChyan 提供可选三通道分发；用户端高速下载需要付费 CDK，包型不适配或失败时保留官方免费来源，详见 [说明](mirrorchyan.md)。版本固定 UI、未完成下载缓存自动清理及磁盘配额管理尚未实现。两类组件分别保留最多三版并保护使用中的快照；内置 HTTP 下载失败后保留可恢复分片，重试时校验来源后续传，来源不支持安全续传时重新下载。支持 HTTP/HTTPS 代理下载，未实现多连接；实际速度取决于代理节点与网络。Linux 桌面系统代理、PAC/WPAD 和纯 SOCKS 暂不提供解析，自动模式尝试直连；真实 Clash/VPN/TUN 及 macOS/Linux 系统代理仍待对应环境验收。
- 当前热切换等待仍在执行的任务到达安全边界，并只重建切换前实际连接成功的设备；离线设备只保留记录，不参与重连、不阻塞更新。重连失败的设备标记离线，后续连接使用新组合；已校验的候选快照在切换失败后仍保留为待生效状态，可直接重试。尚未实现逐设备滚动切换。切换不迁移 MaaCore 战斗中上下文，不保证战斗中换核。
- 回滚恢复上一组核心/资源，不回滚业务数据库。资源加载自检通过不等于全部游戏行为验证通过。
- 作业中心支持本地/社区作业与作业集预览导入、独立库和三类队列，不再通过任务表创建新作业；社区账号、收藏/发布、作业编辑器、离线视频流程、跨执行掉落统计及全部上游选项专用表单仍待完成。普通列表限同区域且整体单次，保全仅单份，悖论不支持循环；SSS 或多次循环缺少逐战完整证据时保持通关未确认。新工具补货基于识别与已确认掉落，并非实时读取库存；小游戏只确认核心流程和空闲，不把回调当作已获游戏奖励的证明。所有游戏功能仍需真实设备验收，预算默认零。
- 任务表多选已支持并行执行与批量删除；导入、空表保存、可拖动分栏、密度选择、仅本次覆盖、失败策略及完成后系统动作仍待实现。任务表客户端由启动/关闭任务设置，尚无完整游戏档案层。
- 临期药、作业无上限用药、公招加急暂拒绝；任意 Custom 资源链尚未经过消耗策略审核，仅开放已审核入口。OperProgress 是消耗材料的养成任务，界面明确说明。完整兼容仍需补齐受限选项、完整多配置、外部通知/远控、平台专用连接和 [功能矩阵](maa-compatibility.md) 中的各项验收。
- 自动连接仅对正在运行的本机模拟器发起连接，不启动模拟器/游戏，也不自动执行任务。Windows 可从运行进程定位受支持模拟器的非默认安装路径，无法定位时仍需手动配置；本机单个 MuMu 已通过连接、既有手动增强截图及本轮自动 SDK 配置检查，真实多开、雷电、外服资源和每类游戏任务尚未实机验收。
- 资源版本已按客户端展示已安装活动名、更新时间和短提交号；此活动标签表示资源包内容，不代表活动仍开放。跨执行材料统计及六种客户端下的新工具真实行为仍待完善。
- 执行反馈截图保存任务回调后的核心缓存画面；当前 C API 不返回原始识别图，无法保证保存到结算原图。每任务最多三张、每次执行最多十二张，截图保存在本机，不写入事件或 SQLite 图像字段。
- macOS 下载组件后的签名加载策略、Linux 系统托盘与最低系统兼容性仍需目标机验收。

## 后续交接

1. 完成 macOS 15 最低系统、正式签名/公证和三平台干净系统交互安装验收，补 Linux 实际 WebView、macOS 下载隔离后的首次系统放行及真实下载核心的加载验证；随后由用户明确选择模拟器测试首次安装、任务回调、停止、断线与更新切换，记录版本及脱敏设备信息。
2. 以 [原 MAA 功能矩阵](maa-compatibility.md) 为发布门槛，补齐全参数专用表单、受限消耗控制、新工具/定时的真实验收、完整多配置、作业真机验收和失败恢复；继续连接诊断、平台专用驱动及六种客户端资源验证。
3. 接入用户自备模型 API、系统钥匙串、工具权限和费用预算，再逐步开放 Agent 的真实执行。
4. 后续版本继续执行四宿主签名构建、草稿全量附件和公开后下载复验，保留既有发行标签与产物；补齐三平台真实升级安装验收，随后推进独立战斗研究及评测。
5. 按 [插件系统与插件市场调研](plugin-marketplace-research.md) 推进后续扩展能力：先确定首批场景、包规范与权限边界，再做本地声明式扩展管理及审核制市场；可执行插件须先完成受限宿主原型和目标平台验证，当前不设交付日期。
6. 前端已按 `app/features/shared/kit` 归档并增加依赖与循环门禁；Drawer、展示原语、原生弹层和主要页面采用情况见 [component-kit.md](component-kit.md)。继续按[前端架构](frontend-architecture.md)拆分 App 计划命令、Copilot 查询/导入/执行状态，设计跨功能 settings 写入协调；推进尚未采用的行/表单原语、旧选择器清理和令牌回填。`kit/legacy`、`shared/styles/support-pages.css` 与部分全局旧规则仍需逐步迁移。当前不设交付日期。
7. 后端已按业务与基础设施归档、提取协议和 RPC 能力分派。继续按[后端架构](backend-architecture.md)拆分设备连接租约、执行会话与更新准入，并逐步缩小模块间的存储接口；保持关闭、取消、重连和请求幂等顺序。完整类型与行为回归不能被目录门禁替代。

开发者在另一台电脑从相同 Git 提交执行 bootstrap，按 [development.md](development.md) 恢复依赖；无需复制虚拟环境、下载缓存或原机器路径。
