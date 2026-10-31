# Maa Verge 桌面前端

本目录包含 React 19 / TypeScript / Vite 界面与 `src-tauri` 桌面宿主。本文面向开发者，说明代码结构、用途、边界和扩展方法。安装与使用见[项目 README](../../README.md)，Tauri 2 开源项目调研与设计依据见[前端架构](../../docs/frontend-architecture.md)。

## 运行边界

业务与窗口操作都经过 `@maaverge/contracts` 的类型化传输。Tauri 2 管理窗口、托盘、系统集成和侧进程，将业务请求交给固定 Bun 上的 TypeScript 应用服务；C++ worker 负责 MaaCore、设备租约和原生调用。

React 不直接导入 `@tauri-apps/*`，不执行 shell、ADB 或 MaaCore，不打开业务数据库，也不管理设备锁。协议以 `packages/contracts/schemas` 为准，接口变化先修改 schema，再从仓库根执行 `pnpm contracts:generate`。进程、数据与更新边界见[运行时迁移](../../docs/runtime-migration.md)。

开发与产品使用真实运行时。普通浏览器打开产品页面会提示缺少桌面环境；合成桥与数据仅用于测试。Agent 当前仍提供本地确定性提案，模型接入及真实设备验收状态见 [STATUS](../../docs/STATUS.md)。

## 目录

```text
apps/desktop/
  src/
    main.tsx                  React 挂载、基础 provider、样式导入顺序
    app/
      App.tsx                 页面组合、导航与跨页面流程
      shell/                  导航、底栏、运行面板、窗口按钮、退出提示
      model/                  快照刷新、全局操作、设备运行选择、导航类型
      styles/styles.css       令牌、reset、应用外壳及待拆的全局旧样式
    features/
      home/                   主页、游戏提醒、产线估算
      plans/                  任务表、编辑器、草稿、运行确认、写入协调
      copilot/                作业库、社区、导入、队列、详情与执行监控
      devices/                设备发现、连接、选择、配置入口、画面预览
      execution/              执行详情、日志、监控、多开
      tools/                  独立工具、识别结果与导出
      settings/               设置入口和分类表单
      updates/                更新状态与下载通知
      schedules/              定时配置与通知
      agent/                  对话与提案展示
      history/                执行记录与本地筛选
    shared/
      game/                   跨功能的干员、材料和关卡展示
      ui/                     SideDrawer、SelectAll 等组合组件
      lib/                    公共草稿 hook、保存状态及展示辅助
      styles/                 尚由多个功能消费的旧页面样式
    kit/                      无业务知识的 UI 原语和弹层机制
      kit.css                 mv-* 原语样式
      README.md               组件用法、样式预览与维护边界
  src-tauri/                  Rust 宿主、平台配置与安装集成
  tsconfig.json               TypeScript 检查和 @/* 路径映射
  vite.config.ts              开发、测试、构建共用的 Vite 配置
```

业务组件、局部 hook、纯函数和 CSS 按 feature 共置。小模块先使用平坦目录；职责分化后再建立 `model/` 或 `ui/`，无需给每个组件套一层目录。

## 依赖和状态归属

主要依赖方向为 `main → app → features → kit/shared/contracts`：

- `app` 负责组合与应用生命周期。feature 不得反向导入 app 的状态、组件或样式。
- `features` 持有业务视图和局部交互。页面声明最小 props，跨页面操作使用业务回调，避免传入父级的一组 setter 或所有页面共用的大接口。
- `shared` 放多个功能实际复用的组件与能力。`shared/ui` 可以组合 kit；kit 只使用共享层的纯类型或映射。两者都不得依赖 feature。
- `kit` 负责按钮、输入、选择、Tabs、提示、Drawer 等原语，以及焦点、Escape 和滚动锁。设备、任务和作业知识留在业务层。API 与 CSS 规则见[组件套装](../../docs/component-kit.md)。

现有跨 feature 复用允许显式引用，例如任务表使用设备选择器。新增复用应指向职责稳定的组件或模型；跨域导航与联合流程交给 app。不要通过 shared 中转业务代码隐藏依赖，也不要增加导出所有内部文件的 barrel。

全局快照由 `app/model/useAppSnapshot` 协调刷新。表单草稿、筛选和展开状态归所属 feature；需要跨页面持续存在的写入、执行和下载协调器在应用生命周期内挂载。`features/plans/usePlanWrites` 虽属于计划领域，仍由 App 挂载，以保留串行保存、删除防复活和导航期间写入的语义。

`DesktopLifecycle` 与 App 在 `main.tsx` 中作为兄弟挂载点：App 退场时，原生退出提示仍须存活。原生 dialog 使用 `useNativeDialog`，普通弹层使用 kit，不重新编写焦点陷阱。

## 导入简写

`@/` 指向本目录的 `src/`，同目录使用 `./`，跨目录使用 `@/`：

```tsx
import Button from '@/kit/Button';
import DevicePicker from '@/features/devices/DevicePicker';
import { autoSaveLabel } from '@/shared/lib/save-status';
import TaskQueueView from './TaskQueueView';
import './plan-workbench.css';
```

工作区包仍用 `@maaverge/contracts`。别名同时配置在 TypeScript `paths` 与 Vite `resolve.alias`；测试服务加载同一 Vite 配置，无需另配测试别名。入口 `main.tsx` 保留直接相对导入以明确启动顺序。别名不会改变依赖边界。

## 样式归属

`kit/kit.css` 是模块图的第一个样式表，在 App 之前导入；字体与全局样式随后加载。纯格式化函数从具体模块导入，避免通过 kit barrel 间接加载其他样式表。字体使用随应用打包的 Noto Sans SC，图标使用 lucide-react。

原语的尺寸、颜色和变体通过 props 表达，页面 CSS 不得定位 `.mv-*` 内部类。页面通过自己的根类控制布局，通过插槽控制自己投放的内容。样式与消费组件共置，令牌在 `app/styles/styles.css` 中维护。

组件用法、浅色/深色样式图与独立交互预览见 [Kit README](src/kit/README.md)。如无必要，不得修改 kit 的组件代码与样式；先使用现有 props、插槽和页面布局容器。Select / ContextMenu 已使用 `mv-*` 类并统一到 `kit.css`，原 `kit/legacy` 已移除。`shared/styles/support-pages.css` 和部分全局规则仍是迁移中的存量；删除旧类前应检索 JSX、动态类名和行为测试定位，不能只按静态字符串判断无引用。

## 扩展一个功能

1. 在对应 feature 中增加视图、局部状态和样式；独立领域才新建 feature。
2. 声明最小输入和业务回调，由 App 连接导航与跨域行为。持久业务状态由应用服务负责。
3. 若需要新 IPC，先改 contracts schema 并重新生成，再实现服务与前端调用；宿主能力也通过 contracts。
4. 复用 kit；新增无业务知识的原语时同步维护组件文档和 CSS 门禁，确定被多个功能消费后再提取 shared。
5. 执行相关类型、结构及行为检查；样式变化使用合成截图人工检查，不添加外观断言测试。

## 开发与检查

从仓库根执行命令。依赖恢复、固定 Node/pnpm/Bun 与原生环境见[开发指南](../../docs/development.md)。Windows 无全局 pnpm 时，用 `powershell -ExecutionPolicy Bypass -File tools/pnpm.ps1` 替代下方 `pnpm`。

```powershell
pnpm dev:ui
pnpm dev
pnpm --filter @maaverge/desktop check
pnpm run check:app
pnpm --filter @maaverge/desktop build
pnpm test:e2e --workers=4
```

`dev:ui` 仅启动 Vite；`dev` 启动真实桌面运行时。日常回归使用 `test:e2e` 的隔离合成夹具，不连接真实游戏、下载原生组件或调用付费模型。

`check:app` 包含 contracts 同步、工作区类型、kit CSS、前端分层与运行时循环检查。结构检查也可单独运行：

```powershell
node tools/check-frontend-architecture.mjs
node tools/check-kit-css.mjs
```

行为测试位于 `tests/ui`，通用导航和就绪检查复用 `fixtures/navigation.ts`，场景与业务断言留在 spec 附近。Playwright 默认使用自带 Chromium；可设置 `MAAVERGE_TEST_BROWSER=msedge` 使用已安装的 Edge。并行运行不同测试任务时，同时设置独立 `MAAVERGE_TEST_PORT` 与 `--output`，防止共用服务或互相清理 trace。

浏览器夹具不覆盖原生 WebView、安装包或实际设备。平台验证与具体结果记录在 [STATUS](../../docs/STATUS.md)。

## 后续拆分

App 仍协调部分计划创建、删除和启动流程；Copilot 容器及模块级浏览会话仍需按查询、导入、执行继续整理。全量 `settings.save` 的跨功能写入协调也需要单独设计。后续重构应保持请求去重、缓存实例、异步失效与挂载生命周期，具体边界见[前端架构](../../docs/frontend-architecture.md)。
