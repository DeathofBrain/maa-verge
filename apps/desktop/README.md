# Maa Verge 桌面前端

本目录包含 React 19 / TypeScript / Vite 界面与 `src-tauri` 桌面宿主。本文提供开发入口；安装与使用见[项目 README](../../README.md)，仓库约束见 [AGENTS.md](../../AGENTS.md)。

## 目录导航

| 位置                               | 用途                                            |
| ---------------------------------- | ----------------------------------------------- |
| `src/main.tsx`                     | React 挂载、基础 provider、样式导入顺序         |
| `src/app/`                         | 页面组合、应用外壳与应用级状态                  |
| `src/features/`                    | 按业务域共置页面、局部状态与 CSS                |
| `src/shared/`                      | 跨功能组合 UI、游戏展示与公共辅助               |
| `src/kit/`                         | 无业务知识的 UI 原语、统一样式和弹层机制        |
| `src-tauri/`                       | Rust 宿主、平台配置与安装集成                   |
| `tsconfig.json` / `vite.config.ts` | TypeScript 检查及开发、测试、构建共用的路径解析 |

完整目录、依赖方向、状态归属、`@/` 导入约定及扩展步骤以[前端架构](../../docs/frontend-architecture.md)为准。React 通过 `@maaverge/contracts` 的类型化传输调用业务与宿主能力；进程和数据边界见[运行时迁移](../../docs/runtime-migration.md)。

## 开发入口

从仓库根执行 `pnpm dev:ui` 启动前端，或 `pnpm dev` 启动真实桌面运行时。普通浏览器打开产品页面会提示缺少桌面环境；合成桥与数据只存在于测试目录中。环境恢复、平台依赖、配置隔离与命令说明见[开发指南](../../docs/development.md)。

检查与测试使用[统一入口](../../docs/development.md#检查与测试)，不在本 README 维护另一套命令或测试数量。相关行为回归在 `tests/ui`；浏览器夹具的结果不代表原生 WebView、安装包或真实设备验收，实际结果记录到本次任务或 PR。

## 组件与样式入口

组件快速示例、浅色/深色样式图与独立交互预览见 [Kit README](src/kit/README.md)。kit API、可访问性、设计令牌、样式导入顺序及 CSS 规则以[组件套装](../../docs/component-kit.md)为准；修改前遵循[组件套装 skill](../../.skill/maa-verge-component-kit/SKILL.md)。
