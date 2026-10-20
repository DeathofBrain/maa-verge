# MAAVerge 开发计划

状态：工程已初始化，M0/M1/M2 部分能力已实现，尚未通过完整发行验收；当前实现与验证记录见 [docs/STATUS.md](docs/STATUS.md)。本文件保留完整交付路线，不把待办视为已交付。更新日期：2026-10-20。

## 1. 产品目标与总体架构

### 1.1 已确认的目标

- 开源免费的明日方舟桌面助手，支持 Windows、macOS、Linux。
- 提供现代界面、传统任务配置，以及问答、计划执行、持续托管和视觉操作 Agent。
- 数据、调度、执行记录和 Agent 状态以本机为主；首版接入用户配置的云端模型 API。
- 三平台统一通过 ADB 连接安卓模拟器或设备。
- 首次启动由 MAAVerge 自动下载安装 MaaCore、原生依赖和基础资源。
- MaaCore 与游戏资源自动检查、后台准备、空闲生效；界面、Agent 和调度器无需重启。
- 自动打新关卡作为独立研究模块，与桌面产品并行推进。允许使用公开地图、敌人和干员资料，不提供现成作业作为解题输入。
- 开发环境支持不同电脑、不同操作系统以及多个开发 Agent 协作，不依赖单台机器的路径或聊天记录。

首版不依赖项目自建云服务。跨电脑同步产品数据、手机应用、Windows 原生游戏窗口和 PlayCover 专用驱动不列入本轮交付。

### 1.2 技术选型

| 层次 | 选型 | 职责 |
| --- | --- | --- |
| 桌面外壳 | Tauri 2、少量 Rust | 窗口、托盘、通知、系统集成、侧进程管理、应用更新 |
| 页面 | React、TypeScript、Vite | 共用桌面页面、任务表单、Agent 交互和执行可视化 |
| 样式组件 | Tailwind CSS、shadcn/ui | 明暗主题、键盘操作、响应式布局与统一组件 |
| 本地应用服务 | Python 3.12、Pydantic | 设备、计划、策略、调度、数据与更新服务 |
| Agent | LangGraph、LiteLLM | 可持久化编排、工具调用、云模型接入与调用预算 |
| 自动化核心 | MaaCore C API、Python ctypes | 复用日常、公招、基建、作战和识别任务 |
| 视觉控制 | 固定 ADB 操作、本地 OpenCV/OCR | 截图、点击、滑动、观察与动作验证 |
| 持久化 | SQLite WAL、LangGraph SQLite checkpoint | 业务记录、事件和 Agent 状态 |
| 凭据 | 系统密钥环 | 用户模型密钥；不可用时只在当前会话持有 |
| 本地通信 | JSON-RPC 2.0 over stdio、Tauri 命令与事件 | 类型化请求、响应和执行事件 |

Tauri 的外壳较轻，但 Python、MaaCore 和资源仍占主要包体。原生打包和下载后动态库加载必须在第一阶段验证。

### 1.3 进程与数据边界

~~~mermaid
flowchart TD
    UI[React 页面] <--> Host[Tauri 桌面进程]
    Host <-->|本地 IPC| Runtime[Python 应用服务]
    Runtime <--> Store[SQLite 与 Agent checkpoint]
    Runtime <--> Model[用户配置的云端模型 API]
    Runtime --> Updates[安装及更新服务]
    Runtime --> Broker[设备控制权管理]
    Broker --> Core[MaaCore 工作进程：每设备独立]
    Broker --> Vision[视觉控制器]
    Core --> Device[ADB 模拟器或安卓设备]
    Vision --> Device
~~~

- Tauri 负责进程生命周期；业务逻辑集中在 Python 应用服务，界面不直接调用 MaaCore、ADB 或 Shell。
- 每个设备的 MaaCore 在独立进程中加载，隔离原生崩溃和进程级资源状态。
- 任务、事件、设备控制权和更新状态由应用服务管理，核心工作进程不直接写业务数据库。
- 使用 Pydantic 定义 IPC schema 并生成 TypeScript 类型；请求和运行分别有唯一标识，事件带递增序号。
- 设备、计划、执行、截图、Agent 和更新都通过业务接口访问；模型不能访问任意文件或构造任意系统命令。
- SQLite 使用版本化 SQL 迁移。核心版本回滚不回滚业务数据库，工作进程协议须保持兼容。

## 2. 执行能力、Agent 与界面

### 2.1 MaaCore 适配与任务管理

初始集成基线为官方 v6.20.0，发布于 2026-10-18。开发测试锁定核心、绑定和资源快照，用户运行期通过更新服务获得经过验证的新组合。

- 按当前 C API 实现资源加载、实例创建、异步连接、任务追加、启动、停止、截图和销毁。
- 回调立即复制 JSON 并进入事件队列，保持回调对象生命周期，不在回调中调用模型或运行耗时逻辑。
- 异步调用返回 ID 后继续等待结果；添加任务返回 0 视为失败。
- 业务队列保存在 SQLite，每次向核心提交当前任务或短批次。
- 逐任务记录成功、失败和中断。AllTasksCompleted 只代表队列处理结束。
- AsstStop 会清空当前实例队列，界面使用“停止当前执行、保留未执行计划”的语义。重新执行前读取设备状态。
- 对应用重启、崩溃和网络重试进行去重；结果不明的非幂等操作先核对，不盲目重放。

### 2.2 设备控制与视觉操作

- 每个设备同时只有 MaaCore、视觉控制器或人工操作中的一个控制者。
- 控制权切换等待任务终止、AsstRunning 为 false，以及已发异步操作完成。
- 默认不在工作进程退出时终止共享 ADB 服务。
- 同机多个应用实例和开发工作树共享设备互斥锁，锁键包含 ADB server 与设备标识。
- 视觉路径为“截图、页面识别、有限动作、本地校验、执行、新截图验证”。
- 首版动作仅含截图、点击、滑动、返回、等待；ADB 命令由内部固定模板构造。
- 截图携带帧号、时间、原始尺寸和坐标变换，显式区分 MAA 预览坐标与原始设备坐标。
- 过期观察先重新截图；非幂等动作不因超时自动重复。连续三次验证失败后转人工接管。
- 登录、验证码、支付等敏感页面进入人工接管点。

### 2.3 Agent 三种模式

| 模式 | 行为 |
| --- | --- |
| 问答辅助 | 查询 MAA 文档、公开游戏资料、本地记录，显示来源和数据时间 |
| 计划执行 | 将自然语言转成可编辑计划，确认后执行并解释结果 |
| 自主托管 | 在预设任务范围、时间和消耗额度内调度、调整、恢复及汇总 |

- 传统表单和 Agent 使用同一套任务模型、参数校验、权限规则及执行服务。
- 模型负责目标理解和工具选择，确定性代码执行预算计算、参数检查和设备操作。
- 库存、干员和任务状态标注来源、采集时间及完成程度。
- 默认碎石、理智药和加急许可额度为 0，用户可明确配置。自主模式只执行已授权范围。
- 设置每次运行的模型调用、时长和费用预算；工具调用与实际执行结果分别记录。
- 文本模型和视觉模型可以分别配置，通过能力检查后启用对应功能。
- 云模型不可用时，已确认的确定性 MAA 任务和传统界面仍可使用。

### 2.4 自动新关卡研究

研究定义：给定队伍、练度及公开关卡资料，不向解题过程提供现成作业，由 Agent 生成打法并验证。

1. 先做固定队伍、普通关卡、演习模式。模型生成结构化战斗计划，编译为 Copilot 作业后执行，根据结果和关键画面修正。
2. 再增加费用、击杀、待部署干员等本地视觉状态，在契约验证通过后接入 SingleStep 做反馈调整。
3. 云模型在战前、可暂停点和低频战略节点决策；本地控制器处理部署、朝向、技能、撤退和时序。
4. 不假设公共 API 能导出完整战场状态，也不将 SingleStep 完成回调当作动作成功。
5. 缺少地图数据、未知特殊机制和纯视觉探索列为后续研究。

当前 SingleStep 文档与源码对动作参数结构存在差异；先做固定版本的契约探针，再接产品适配器。

研究前登记开发关卡和留出评测关卡，固定队伍及练度。报告通关率、人工介入、动作失败、耗时和模型成本。自动新关卡保持实验入口，不阻塞桌面稳定版。

### 2.5 页面

| 页面 | 内容 |
| --- | --- |
| 总览 | 设备、当前任务、今日计划、快捷操作 |
| 任务与计划 | 日常编排、定时任务、资源预算和配置 |
| Agent | 对话、可编辑计划卡片、工具进度、执行与接管 |
| 执行记录 | 任务结果、掉落、失败原因、关键截图 |
| 设置 | 设备、模型、权限、应用/核心/资源更新和主题 |

关闭窗口默认进入托盘；完全退出会停止本地调度与执行。电脑关机或休眠期间不执行，恢复后合并过期的周期触发，避免补跑多份相同日常。

## 3. 首次安装、MaaCore 更新与资源更新

### 3.1 三条独立更新通道

| 对象 | 默认检测 | 来源与实现 |
| --- | --- | --- |
| MAAVerge 应用 | 启动时和手动 | Tauri 更新机制、项目发布源 |
| MaaCore 二进制及基础依赖 | 启动时、每 24 小时、手动 | 官方版本 API 与发布资产，优先复用官方 Python Updater |
| 游戏资源 | 启动时、每 6 小时、手动；UnsupportedLevel 触发带冷却的检查 | 官方 MaaResource 固定提交快照；MirrorChyan 为可选加速源 |

三者独立展示版本、更新说明、检查时间、进度和失败状态。用户可关闭自动下载、固定版本或手动回滚。定时检测增加轻量随机抖动和失败退避。

MaaCore C API 当前没有更新入口，只有版本查询和资源加载。官方 Python Updater 可更新已有安装；核心版本不变时直接返回，因此不能代替独立资源更新服务。

### 3.2 首次自动安装

- 自动识别 OS 和 CPU 架构，下载官方稳定版组件；macOS 选择 runtime-universal.zip。
- 复用官方版本查询和下载辅助逻辑。空目录首次安装不直接调用需要现有 MaaCore 的 Updater 构造器。
- 下载、解压到用户数据目录下的候选版本目录，检查目标架构、必需文件、实际核心版本和资源加载。
- 成功后设置活动版本，失败保留错误信息并允许重试；不要求用户手动下载 MaaCore。
- 核心安装后独立检查最新游戏资源，资源源不可达时保留可用基础资源并显示其时间。
- 用户仍需安装模拟器或连接设备，安装向导负责发现、连接和诊断。

### 3.3 MaaCore 更新

- Windows/Linux 优先在候选目录中调用官方 Updater.update；macOS 适配其资产选择逻辑。
- 官方更新器放在受监控的独立进程中，设置超时，并把输出转换成结构化事件。
- Updater 没有可靠的结构化成功返回，外层必须验证实际版本和资源加载，并防止意外降级。
- 更新包只写候选目录。工作进程不引用随时变化的 current 路径，而固定使用实际版本路径。
- 保存官方包提供的基础资源，避免将旧资源快照无条件覆盖到新核心。
- MAAVerge 应用更新与核心更新分离。核心更新不要求退出桌面应用。

### 3.4 游戏资源独立更新

- 默认免费源为官方 MaaResource GitHub 仓库。解析固定 commit 后，读取同一 commit 的 resource/version.json 并下载同一 commit 的归档。
- 记录 commit、last_updated、来源、本地内容哈希和加载结果，避免检测与下载期间分支变化。
- 以基础资源和现有已验证资源为依据，在新快照中按上游覆盖语义合并。MaaResource 包不视为包含模型和全部基础文件的完整安装包。
- 使用来源清单区分官方资源和用户自定义配置；不覆盖用户数据，不自行推断上游未声明的删除。
- 外服显示对应资源的活动信息，并保留基础资源版本。新快照更新后同步刷新界面中的关卡、活动和公招等数据。
- MirrorChyan 使用其官方 MaaResource 接口，只有用户配置相应凭据后才作为加速源；免费自动更新不依赖该服务。
- 上游未提供完整核心/资源兼容矩阵。记录本项目验证过的组合；加载或契约自检失败则保留旧资源并提示处理，不能声称自检保证全部游戏行为兼容。

### 3.5 热更新与回滚

热更新定义为：MAAVerge 界面、Agent 和调度器保持运行，MaaCore 工作进程在安全边界切换。核心与资源均采用同一生效机制。

1. 后台下载并构建独立候选目录。
2. 启动验证进程，调用版本查询、检查必需 API、使用 AsstLoadResource 加载候选资源；验证进程不连接游戏设备。
3. 当前设备任务自然结束后，等待核心空闲及异步调用完成，暂停向该设备派发新任务。
4. 退出旧工作进程，新工作进程接管设备并重新读取画面，之后执行持久化队列中的剩余任务。
5. 新版加载或初始化失败则恢复旧组合；结果不明的游戏动作不自动重放。

- 多设备可逐设备切换。每个工作进程固定一组核心和资源，旧版本在仍被使用时不得清理。
- 下载成功、验证成功和已生效是三个不同状态，界面分别显示。
- 保留上一组已验证版本；磁盘不足、下载中断和应用重启后可恢复更新状态。
- 不在使用中的目录覆盖 DLL、SO、DYLIB 或资源。AsstLoadResource 用于资源加载，不作为事务式原位更新手段。
- 当前 MaaCore 没有运行中任务上下文迁移接口，不能承诺战斗中跨版本无缝换核。长任务默认等到结束；用户可明确停止后立即切换。

## 4. 跨机器协同开发与环境文件

### 4.1 单仓库结构

~~~
MAAVerge/
  AGENTS.md
  PLAN.md
  README.md
  CONTRIBUTING.md
  apps/desktop/          React 与 Tauri，Rust 桥接位于 src-tauri
  services/runtime/      Python 应用服务、Agent、设备、更新与工作进程
  packages/contracts/    Pydantic 导出的 schema 与 TypeScript 类型
  tests/fixtures/        合成或脱敏场景、事件与截图
  tools/                 环境引导、诊断、测试、打包脚本
  docs/                  架构决策、三平台环境、测试与交接文档
  .github/workflows/     持续集成与发行
~~~

多设备协同开发指不同开发电脑从同一 Git 提交恢复一致工程环境；与产品运行期管理多个游戏设备是两项独立能力。

### 4.2 AGENTS.md 与协作规范

使用标准自动发现文件名 AGENTS.md，对应用户所说的 agent.md；规则只维护一份。根文件至少包括：

- 产品目标、本计划入口、目录职责和当前架构边界。
- 环境初始化、开发、检查、测试、打包的标准命令。
- IPC、数据库及 MaaCore 适配变更时的契约和文档同步要求。
- 生成类型与锁文件的更新方式，以及禁止直接修改的产物。
- 不硬编码机器绝对路径，不提交凭据、运行数据库、真实账号截图和原生下载缓存。
- 默认使用 mock；真实设备和付费模型的测试边界、设备独占规则及操作记录。
- 每项任务独立分支；同机并行任务使用独立 worktree 和数据目录，修改前检查已有改动。
- 合并前处理冲突并运行相关检查，不覆盖他人未提交工作，不批量改动无关锁文件。
- 交接记录包含分支/提交、已完成内容、验证结果、待办和阻塞，不依赖聊天历史。

M0 初始化 Git 仓库并建立公共主分支及功能分支流程；远程仓库地址按项目实际配置，不写入机器专属路径。不同电脑通过 Git 提交同步代码和文档，不同步整个虚拟环境、工作目录或产品运行数据库。同一真实游戏设备只指定一个执行宿主。

### 4.3 工具链、锁文件与配置

- Node 24 LTS、pnpm 10、Python 3.12/uv、Rust/rustup。
- 提交 Node 版本文件、packageManager 字段、.python-version、rust-toolchain.toml 和所有依赖锁文件。
- Node 与 Rust 在首次环境验证后锁定具体补丁版本；CI 与引导脚本读取相同版本源。
- 提交 pnpm-lock.yaml、uv.lock、Cargo.lock；持续集成使用 frozen/locked 模式。
- 提供根 package.json、pnpm-workspace.yaml、Python pyproject.toml、Rust 配置、.editorconfig、.gitattributes 和 .gitignore。
- 提供 .env.example 和本地设备配置示例；实际 .env、设备路径、模型凭据与本机覆盖配置不进入 Git。
- 通过标准用户目录定位运行数据，用环境变量覆盖开发数据根目录；无 E 盘、用户名或特定 ADB 安装路径假设。
- MaaCore、资源包、ADB、.venv、node_modules 和构建产物不提交 Git；发布记录及问题报告保存实际核心/资源版本。

### 4.4 环境搭建与统一命令

提供 tools/bootstrap.ps1 与 tools/bootstrap.sh，完成版本检查、依赖同步、本地配置初始化和必要工具引导。缺少需要系统权限的原生依赖时，输出对应系统的具体安装步骤。

| 命令 | 用途 |
| --- | --- |
| pnpm dev:mock | 无模拟器、无 MaaCore、无模型 Key 的完整开发模式 |
| pnpm dev | 启动 React、Tauri 和通过 uv 管理的 Python 服务 |
| pnpm doctor | 检查工具链、原生 SDK、数据目录、ADB 和核心加载 |
| pnpm check | 运行格式检查、lint、类型、契约及必要测试 |
| pnpm test:e2e:mock | 基于相同 IPC 和事件模型验证产品流程 |
| pnpm build | 构建当前 OS/架构的应用与 Python 侧进程 |

doctor 的设备连接和云模型网络检查为显式选项，不在普通检查中操作真实游戏或消耗模型费用。不同 worktree 隔离运行数据、日志和开发端口。

为 Windows、macOS、Linux 分别记录 Tauri 原生 SDK、WebView、Python 打包和 ADB 设置。原生开发不以 Docker 为前提。

### 4.5 Mock、测试与 CI

- MaaCore、ADB、模型和下载源均定义可替换适配器；mock 模式使用相同接口与事件模型。
- 固定场景覆盖任务进度、失败、掉线、worker 崩溃、首次安装、核心更新、独立资源更新、空闲切换和回滚。
- 视觉与坐标测试使用合成或脱敏图片；真实账号数据保持本地。
- PR 检查包含前端 lint/类型/测试，Python lint/类型/测试，Rust fmt/clippy/测试，schema 一致性和 mock 端到端测试。
- 原生构建覆盖 Windows x64、Linux x64、macOS arm64/x64；Python 在目标 OS 与架构上打包，不假设跨平台编译。
- 真实核心的加载及资源契约测试单独执行，普通 CI 不依赖模拟器、真实账号或付费模型。
- 发布流水线执行签名、公证和发布元数据生成，凭据使用 CI secret，产物可追溯至提交和锁文件。

## 5. 里程碑、验收与发布

| 阶段 | 主要交付 | 验收 |
| --- | --- | --- |
| M0 工程与原生可行性 | AGENTS.md、环境文件、锁文件、引导/doctor、最小三平台安装包、IPC、mock | 新电脑按文档可启动 mock；发行包能加载自行下载的核心并完成一次工作进程切换 |
| M1 安装与更新基础 | 自动首装、核心更新、独立资源更新、快照、空闲生效、回滚 | 无需手动安装 MaaCore；核心版本不变时仍能更新资源；任务中仅准备更新，不覆盖活动目录 |
| M2 桌面日常产品 | 五个主页面、设备、MAA 任务、计划、托盘、记录 | 能完整执行常用日常，正确展示失败与停止，重启后保留计划和记录 |
| M3 Agent 与视觉操作 | 问答、计划确认、自主托管、有限视觉工具、权限预算与接管 | Agent 与表单行为一致，越界操作被拒绝，断网和异常可控恢复 |
| R1 并行战斗研究 | 固定队伍的计划生成、演习反馈、SingleStep 契约和评测报告 | 在开发/留出关卡分开报告能力与成本，不以导入现成作业充当自主解题 |
| M4 发行完善 | 三平台回归、更新中心、签名、公证、许可证及贡献文档 | 安装包和更新流程在支持平台通过验收，发布可复现且故障可诊断 |

M0 完成后，战斗研究可与产品阶段并行；M1 的更新和版本管理贯穿后续开发。

重点验收场景：

- 首次无核心、错误架构、网络中断、损坏包、磁盘不足与加载失败。
- MaaCore 版本不变但资源更新；外服资源信息刷新；资源加载失败仍保留旧组合。
- 任务中准备更新、逐设备切换、多个更新请求合并、旧版本仍被引用时延后清理。
- 核心回调结束但仍有异步操作时不切换；新进程失败能恢复旧版；不误终止共享 ADB。
- 应用崩溃后的更新状态恢复；设备掉线与模型超时；不重复结果未知的动作。
- macOS 签名后的发行包能够加载后续下载的原生组件；Linux 在最低支持系统构建并验证新系统。
- 在另一台电脑从干净 checkout 按文档搭建，不需要复制原电脑路径、虚拟环境或聊天记录。

首批支持目标为 Windows 10/11 x64、macOS 13.3+ arm64/x64、Ubuntu 22.04/24.04 x64。Linux 其他发行版及 Windows/Linux arm64 在建立相应构建和实机验证后扩展。

项目采用 AGPL-3.0-only 开源路线，保留上游声明，使用独立品牌和美术资源。应用资源和第三方游戏资料分别保留来源与授权说明。

### 官方依据

- [MAA v6.20.0 发布与平台资产](https://github.com/MaaAssistantArknights/MaaAssistantArknights/releases/tag/v6.20.0)
- [MaaCore C API](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/include/AsstCaller.h)
- [任务集成及 SingleStep](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/protocol/integration.md)
- [Copilot 战斗协议](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/docs/zh-cn/protocol/copilot-schema.md)
- [官方 Python 更新器](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/Python/asst/updater.py)
- [原版资源更新实现](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaWpfGui/Models/ResourceUpdater.cs)
- [MaaResource 说明](https://github.com/MaaAssistantArknights/MaaResource)
- [资源加载实现](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Config/ResourceLoader.cpp)
- [OpenAI Docs：AGENTS.md 约定](https://developers.openai.com/codex/guides/agents-md/)
- [Tauri 侧进程](https://v2.tauri.app/develop/sidecar/)
- [上游许可证](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/LICENSE)
- [上游用户协议](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/terms-of-service.md)
