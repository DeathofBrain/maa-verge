# 前端架构

本文维护前端目录、依赖方向、状态与生命周期边界，以及设计依据。开发入口见 [desktop README](../apps/desktop/README.md)，组件 API、设计令牌和选择器规则以[组件套装](component-kit.md)为准，检查命令统一维护在[开发指南](development.md#检查与测试)。目录归档不代表所有业务状态已完成解耦。

## 开源项目中的实际做法

以下依据读取时的固定提交与源文件，三个项目的 `package.json` 均使用 Tauri 2 API。Tauri 本身不规定 React/Svelte 的目录结构；需要借鉴的是模块职责和依赖约束。

| 项目                                                                                                                                        | 核对的结构与实现                                                                                                                                                                                                                                                                                                                                                                                               | 对 Maa Verge 的启发                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev/tree/ef784e459d31fe9d1946568b6fe47ac3a7e692b7/src)（React）            | `pages`、`components`、`services`、`providers`、`store`；[main.tsx](https://github.com/clash-verge-rev/clash-verge-rev/blob/ef784e459d31fe9d1946568b6fe47ac3a7e692b7/src/main.tsx) 组合 provider 与路由；[架构检查](https://github.com/clash-verge-rev/clash-verge-rev/blob/ef784e459d31fe9d1946568b6fe47ac3a7e692b7/scripts/check-architecture.mjs) 强制 IPC 边界                                             | 应用启动、页面组合与通信能力要分开；边界需要自动检查             |
| [GitButler](https://github.com/gitbutlerapp/gitbutler/tree/501c97a2c9fd6b62551b6deb36555a1cdc23478d/apps/desktop/src)（Svelte）             | `routes` 与按 `branches`、`commits`、`worktree` 等业务域组织的 `lib`；[IBackend](https://github.com/gitbutlerapp/gitbutler/blob/501c97a2c9fd6b62551b6deb36555a1cdc23478d/apps/desktop/src/lib/backend/backend.ts) 隔离宿主能力；[重构记录](https://github.com/gitbutlerapp/gitbutler/blob/501c97a2c9fd6b62551b6deb36555a1cdc23478d/apps/desktop/src/lib/LIB_PLAN.md) 专门清理跨域循环与通用 utils 中的业务逻辑 | 按业务归档组件、状态与辅助函数；共享目录不能成为业务代码的中转站 |
| [screenpipe](https://github.com/mediar-ai/screenpipe/tree/31ea7168fbf446837c2be61c7d4f4ed22bcba0a5/apps/screenpipe-app-tauri)（React/Next） | `app` 路由和 providers、`components/ui` 原语、业务组件、`lib`；[layout.tsx](https://github.com/mediar-ai/screenpipe/blob/31ea7168fbf446837c2be61c7d4f4ed22bcba0a5/apps/screenpipe-app-tauri/app/layout.tsx) 组合全局功能和宿主集成                                                                                                                                                                             | 区分应用级挂载点与页面内交互；普通组件和设计原语要有清楚归属     |

Maa Verge 已有 Vite、React 与类型化 contracts，无需为目录整理引入 Next、Svelte、路由库或新的全局状态库。外部项目直接使用 Tauri 插件的方式也不适用于本项目：本项目的宿主能力仍必须经 `@maaverge/contracts`。

组件、状态和 CSS 按归属组织，避免按文件长度拆分后仍由页面反向依赖应用状态。页面各自声明最小 props；共享 `ActionRunner` 只描述注入的操作执行器，不暴露 App 的 pending/toast 实现。目录、层级、宿主入口及运行时循环由结构门禁维护。目录整理的历史记录见[固定提交中的架构文档](https://github.com/maa-verge/maa-verge/blob/3a8ad44ba3e31e7f2d4354ff9c89b5d9a9927a43/docs/frontend-architecture.md)。

## 目录与依赖

```text
apps/desktop/src/
  main.tsx                    React 挂载、基础 provider、样式顺序
  app/
    App.tsx                   全局组合与页面导航接线
    shell/                    侧栏、顶栏、底栏、窗口控制、退出提示
    model/                    快照刷新、全局操作、运行选择、导航类型
    styles/                   全局令牌、reset、应用外壳及待拆的旧样式
  features/
    home/                     仪表盘、游戏提醒、产线估算
    plans/                    任务表、编辑器、草稿、字段、运行确认、写入顺序
    copilot/                  作业库、社区、导入、编队、队列、详情与监控
    devices/                  设备发现、连接、选择、配置入口、预览
    execution/                执行详情、监控、日志、多开
    tools/                    工具箱、识别结果、导出
    settings/                 设置页面和各分类
    updates/                  更新下载状态与通知
    schedules/                定时配置和通知
    agent/                    对话与提案视图
    history/                  历史筛选与列表
  shared/
    game/                     干员、材料、关卡等跨功能游戏展示
    ui/                       跨功能组合组件：SideDrawer、SelectAll
    lib/                      通用草稿 hook、纯映射和业务展示辅助
    styles/                   暂存仍由多个功能使用的旧页面样式
  kit/                        纯 UI 原语、弹层与焦点机制
    kit.css                   mv-* 原语样式
    README.md                 用法、样式预览与维护边界
```

依赖方向为 `main → app → features → kit/shared/contracts`。`shared/ui` 可以组合 kit，kit 可以使用 `shared/lib` 的纯类型或映射；两者不能依赖任何 feature。feature 也不能导入 `app` 的组件、状态或 CSS。

跨 feature 的现有显式复用继续保留，例如计划设置使用设备选择器，设备设置使用实例配置表单。新增复用应指向对方明确提供的组件或模型入口，不读取对方页面内部状态；导航和多个功能的联合流程由 app 接线。当前检查并未禁止所有跨 feature 导入，避免把合理组合也变成共享目录中的隐式依赖。

小模块先共置文件；当状态和视图职责明显分化时再建立 `model/`、`ui/`。不为每个组件增加空壳目录，也不要求通过一个导出全部内部文件的 barrel 访问业务模块。

## 导入约定

`@/` 指向 `apps/desktop/src/`，由桌面 `tsconfig.json` 的 `paths` 与 `vite.config.ts` 的 `resolve.alias` 同时配置。Playwright 的测试服务加载相同的 Vite 配置，开发、测试和生产构建共用解析规则。

同目录文件使用 `./`；跨目录组件、模型和样式使用 `@/`，避免移动文件时维护多层 `../../`。例如 `@/kit/Button`、`@/shared/lib/save-status`、`@/features/devices/DevicePicker`。工作区包仍使用 `@maaverge/contracts`。别名只缩短路径，不改变分层约束，也不需要为每个目录再建立一个别名或导出所有内部文件的 `index.ts`。

## 状态、宿主与业务边界

- `app/model/useAppSnapshot` 持有应用快照的刷新与订阅顺序。feature 收到快照与业务回调后呈现自己的视图，不自行复制整个全局快照状态。
- 输入草稿、筛选、展开、列表选择优先保留在所属 feature。跨页面持续存在的执行、下载和写入协调器在应用生命周期内挂载，其代码可以属于相应业务域，不能仅因换页就重置。
- 设置入口由 App 传入独立的 `SettingsNavigation` 分类请求：Agent 定位模型，主页定位更新，全局搜索定位所选分类，侧栏恢复通用分类。每次导航创建新请求（包括同页重复进入），设置页清空局部筛选；搜索文本只用于检索，不作为分类导航参数。普通模型草稿继续按现有会话缓存恢复，导航不触发保存。
- `features/plans/usePlanWrites` 负责逐计划串行写入和已删除标记，由 App 挂载。计划详情关闭、删除与在途自动保存的顺序仍须保持；不能将它移入会随页面卸载的编辑器。
- 业务操作通过 `@maaverge/contracts` 的 typed transport。React 不导入 Tauri 插件、shell、ADB 或 MaaCore，也不维护自己的数据库与设备租约。
- Schema 与协议仍由 `packages/contracts/schemas` 定义。后端 TypeScript、C++ worker 和 Rust 宿主的职责不因前端目录改变。
- `DesktopLifecycle` 与 App 是兄弟挂载点。App 退场时，原生退出提示仍须存活，不能将其改为页面内普通 Modal。

## 样式归属

业务页面 CSS 与消费组件共置，负责容器布局及自己投放的插槽内容；令牌与基础规则归 `app/styles`，无业务知识的原语样式归 `kit/kit.css`。导入顺序、props 与宿主样式的边界由[组件套装规范](component-kit.md#导入顺序不变量)统一定义。

`shared/styles/support-pages.css` 与部分全局旧规则仍需按组件逐步迁移，移动文件不等于清理 CSS。`SelectAll` 归公共组合组件并保留行为定位类 `.cp-select-all`；Toast 的内部样式归 kit，应用只决定提示位置。

## 新增或修改功能

1. 找到对应 feature，让页面、局部 hook、辅助函数和 CSS 保持同一归属。新增独立功能则在 `features` 下建立一个领域目录，并由 App 连接导航。
2. 先声明页面的最小 props 或业务意图回调；不要传入一组 App 的状态 setter，也不要扩展所有页面共用的 props 大接口。
3. 需要后端能力时，先改 authoritative schema 并生成契约；前端通过类型化入口调用。不会因为需要一个宿主功能而直接导入插件。
4. 仅在多个功能确实复用且职责稳定时提入 `shared`。按钮、输入、弹层等无业务知识的原语放入 kit；干员、设备或任务语义不应进入 kit。
5. 按[开发指南](development.md#检查与测试)选择相关结构、类型与行为检查；组件和样式变动遵循[组件套装验证要求](component-kit.md#验证)。

## 尚待完成的数据解耦

目录归属与检查已落地，以下工作仍需按业务场景推进：

- App 仍包含计划创建、删除、启动、导航保护等流程；应继续把计划命令移入领域 controller，保持挂载位置与 requestId/删除防复活语义。
- Copilot 仍有较大的容器和模块级浏览会话；后续按“库/社区查询、导入、执行”职责整理状态，不能通过多路径导入复制缓存实例。
- Settings 页的更新视图与更新领域仍有耦合；跨功能全量 `settings.save` 的协调需要独立设计，产线编辑仍基于收到的 settings 保存。
- 全局旧 CSS、旧类名与组件样式之间还存在覆盖。继续逐组件迁移和清理，不将目录移动视为 CSS 隔离已完成。

## 结构检查

`tools/check-frontend-architecture.mjs` 维护根目录白名单、依赖方向、Tauri 入口与运行时循环；`tools/check-kit-css.mjs` 维护组件选择器规则，两者接入 `check:app`。统一命令、UI 夹具复用与并行隔离见[开发指南](development.md#检查与测试)。实际验证范围与结果记录在任务或 PR。
