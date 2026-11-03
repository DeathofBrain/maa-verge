# MaaFramework 接入与 Pipeline 开发

Maa Verge 的新增自动化采用 MaaFramework 官方[方案二：JSON + 自定义逻辑扩展](https://github.com/MaaXYZ/MaaFramework/blob/v5.14.3/docs/zh_cn/1.1-%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B.md)：页面流程由 Pipeline 节点维护，特殊识别语义与业务校验由 Custom 扩展实现。自研界面、任务调度和持久化继续由应用负责。

迁移范围按[原版 MAA 全功能与设置清单](maa-feature-inventory.md)逐项拆解：游戏事件和流程归 automation，配置、调度、工具数据、通知、更新与系统行为归宿主。该清单是上游需求基线，完成状态与实测记录仍见 [STATUS](STATUS.md)。

当前兼容官方 MaaFramework **v5.14.3**，作为独立组件安装和更新；本分支的设备操作与任务执行统一使用 MaaFramework，不加载或分发 MaaCore。官方 MAA 资源中的已审阅字段由适配器读取，完整 MaaCore 任务图和 Copilot 不能直接交给 MaaFramework 执行。旧任务经整表预检编译为已登记流程，不支持的参数在连接和执行前阻断。基建实现见[基建语义原语](atomic-infrast.md)，实际迁移范围与实测限制见[兼容矩阵](maa-compatibility.md)和 [STATUS](STATUS.md)。

## 运行库与进程

唯一资产清单 `3rdparty/maaframework/runtime-assets.json` 固定官方四个归档、大小及 SHA-256：Windows x64、macOS arm64/x64、Linux x64。匹配版本的 C API 头文件、来源和许可证保存在同一目录。用户通过「设置 → 更新」安装兼容组件；开发启动和应用打包均不自动下载或内嵌完整 SDK，运行时只加载已校验的外置活动代际。安装目录、空闲激活、回滚与平台边界见 [MaaFramework 独立组件](framework-updates.md)。

维护者可以显式准备固定 SDK 做离线验证；此命令会联网，产品运行时不自动回退到它的缓存：

```sh
node tools/prepare-maafw.mjs
node tools/build-core-worker.mjs
```

显式准备工具的缓存位于 `.tools/maafw/v5.14.3/<target>/`；它与产品组件的安装记录分开。独立组件保留完整 `bin/`、`share/MaaAgentBinary/`、依赖及许可，将合法归档别名物化为独立普通文件，并校验逐文件完整性清单。应用、游戏资源和 MaaFramework 分别维护更新通道，当前兼容限制不因上游发布新版而自动放宽。旧核心目录默认保留供用户管理，运行时不再维护或加载其中的 MaaCore。

`maaverge-native-worker` 提供 `--framework-worker`（默认）、离线 `--framework-validate` 与仅租约验证模式，拒绝旧 MaaCore worker 模式。控制进程先取得既有共享设备锁；纯识别和验证进程不创建 Controller，不持有设备锁。stdout 只输出 `protocolVersion: 1` NDJSON，诊断写入 stderr；关闭 MaaFW stdout 日志、调试图与录制。

## Pipeline 与 Custom 的分工

`services/automation` 保持浅目录：通用 TS 在 `src/`，通用 JSON 在 `pipeline/{primitives,composites}/`；`arknights/` 与 `src/` 同级，根下只有 `pipeline/` 和 `custom/`，二者按 `infrast`、`startup`、`fight`、`recruit`、`mall`、`award`、`inventory` 各建一层功能目录。JSON 在功能目录内平放；TS 按资源、观察、事件、算法和业务策略拆分，不在通用模块名称中加入基建前缀。

实现依赖方向为业务流程 → L3 游戏事件 → L2 通用组合 → L1 最小原语；原语只向更低层调用，L3 也可直接复用 L1，业务流程只组合 L3。`primitiveLevel` 表达该依赖，旧 `operation / observation / game / workflow` 目录分类保留。最小原语、通用组合及游戏事件都有已登记 JSON 入口；L1 仍允许直接兼容调用，维护工具可显式执行其 JSON 入口。完整换班、动态批次和角色保护属于 TS 业务策略，具体页面顺序及事件阶段由 JSON 表达。

通用 `Vision` 的实现位于 `src/composites/vision.ts`，显式接收参考尺寸和规则配置，L2 provider 与 JSON handler 共用它；`src/primitives/vision.ts` 只保留兼容导出。基建的 `observations.ts` 扩展它解析设施和卡片，`roster.ts` 维护精确名单算法，`room.ts` 实现可单独调用的准备、提交与复读事件。`src/resources/maacore-adapter.ts` 提供通用的已审阅字段解析和真实模板 ID 定位，功能 `resources.ts` 决定允许哪些上游节点与字段，不转译完整 MaaCore 任务图。

逻辑层级写在节点 key 中，使用「大类@操作」及 `@` 分隔，例如 `Infrast@Base`、`Infrast@ApplyRoom@Prepare`。文件负责源码归档，不生成命名空间；`next` 等引用可跨文件共享同一已登记节点。每个功能的 `definitions.ts` 静态导入 JSON，通过 `registerPipeline(sources)` 登记，保留节点名类型并拒绝重名、无效边和断链。源文件、登记基准及每次 `subgraph(entry)` 返回的深副本互相隔离。JSON 随 Bun 服务编译嵌入，不在运行时扫描目录。

`src/registry.ts` 是唯一组件组装入口，用 `registerAutomationComponents` 登记 L1、L2 与各游戏 provider；通用目录使用 `createCapabilityRegistry(registrations, { port })`。功能的 `index.ts` 导出 Pipeline 与 provider，`automation.components.infrast.pipeline` 等保留精确节点类型。包内 `#automation/*`、`#common-pipeline/*`、`#components/*`、`#custom/*`、`#pipeline/*` 统一由 `package.json` 的 `imports` 解析；通配符只映射实际文件，新增功能不再复制 tsconfig 别名。backend 只从 `@maaverge/automation` 包根调用。扩展步骤见 [automation README](../services/automation/README.md#扩展与验证)。

`src/pipeline/runtime.ts` 维护页面链的 Custom 适配及回调核对；`handlers.ts` 复用共用动作和断言。`invocation.ts` 绑定已登记能力调用，`bindings.ts` 解析本次输入和步骤结果，不解释节点流转。其有限协议为：

- `execute` 调用当前登记项的 TS 实现，不能借此换成其他能力。
- `call` 以显式 `primitive` 调用已声明的下层能力，输入和结果均通过权威 Schema 校验。
- `input` 可使用本地 JSON Pointer 引用 `#/input/...` 或 `#/steps/<name>/...`，`saveAs` 保存完整能力结果；同一图拒绝重复别名。
- `return` 显式返回完整能力结果，缺少返回节点不被当成业务成功。

调用作用域互相隔离，只读取引用对象自身属性，限制数据大小与深度。子能力未完成时停止后续节点，在 `data.pipelineSteps` 保留已有结果。`effect: observe / input / commit` 描述副作用；导航复读仍是输入，原生任务完成不能替代 `verified` 业务证据。目录在构造时拒绝未登记依赖及逆向层级，执行时拒绝未声明调用。

本轮采用[宿主注册 Custom](https://github.com/MaaXYZ/MaaFramework/blob/v5.14.3/docs/zh_cn/1.3-Custom%26Agent.md)：C++ worker 通过 `MaaResourceRegisterCustomAction` 注册 `MaaVerge.Custom`，根图由 `MaaTaskerPostTask` 执行。到达 Custom 节点后，经既有 NDJSON 调用当前 Bun 服务中的有限 TS handler；没有额外官方 `AgentClient`／`AgentServer` 进程，这条桥接也不涉及大模型调用。

每个 worker 同时只接受一条根 Pipeline。根图中的已登记子图通过 `AtomicExecutionPort.runContextPipeline` 调用当前 `MaaContextRunTask` 同步执行；子回调沿用对应的 Context，返回后恢复父上下文。禁止在回调中再次向根 Tasker 排队或并行提交根图。当前上下文的基础动作使用 `MaaContextRunActionDirect`／`MaaContextRunRecognitionDirect`，业务纯识别仍可使用无 Controller 进程。根图期限为 120 秒，子图继承剩余期限；TS 批次中的各房间／各场战斗独立取得根图期限。调用深度有界，停止、取消、EOF 与回调结束都会终止等待或失效对应上下文。

官方 v5.14.3 的 [Context 克隆共享 TaskState](https://github.com/MaaXYZ/MaaFramework/blob/v5.14.3/source/MaaFramework/Task/Context.cpp#L49)，[Pipeline 在识别前检查命中计数](https://github.com/MaaXYZ/MaaFramework/blob/v5.14.3/source/MaaFramework/Task/PipelineTask.cpp#L303)。因此 worker 为每次子提交分配独立内部节点名，并映射当前有限协议允许的节点引用，避免第二次调用同名 `max_hit: 1` 入口被前一次阻断；不清空父图计数，同一子图内部的导航预算仍有效。Custom 回调恢复原节点名，参数原样核对。当前有限协议不支持 `anchor` 和 `[]` 节点属性语法，提交时明确拒绝。停止静止等待的 `target` 等引用同样接受校验与隔离。

标准节点在官方 `Node.Action.Starting` 事件推进 `inputEpoch`；Custom 入口及子图返回同步该代际。纯调用与连续只读不废弃当前帧，任何实际输入尝试使之前帧失效；根图开始和结束仍清理帧。只有当前栈顶可操作设备，外部请求在整条根调用期间保持忙碌。动作后缺失确认、取消或超时保留提交边界与已有步骤证据，不自动重放。

例如，`operators.json` 中 `Infrast@Filter` 仍用小节点连接筛选入口、选择全部与菜单关闭断言。`room.json` 的 `Infrast@ApplyRoom` 则通过 `call` 连接 `read_room → prepare_roster → confirm → verify_room`，逐阶段保存证据再返回结果；训练角色分别执行准备、确认与复读链。独立 L3 还包括重置筛选、单次翻页、当前可见页唯一完整姓名的待选切换和清空名单，均有 JSON 入口并复读结果；状态已满足不重复点击，输入后未确认则保持未知。动态扫描、跨房间名单冲突、训练锁定与保留角色检查由 TS 负责，不把整条换班流程藏进一个 Custom。

Pipeline 的标准节点在已授权且独占的控制会话内执行，Custom 的截图、识别和输入继续经过既有帧、坐标与权限门禁。宿主核对回调节点及参数与本次提交图一致。Custom 业务拒绝获得明确原生失败回执并完成停止收敛后，同一会话允许下一次主动调用；超时、进程退出或确认丢失仍关闭 worker，结果保持未知，不自动重放。

## 已登记游戏流程与后续扩展

除基建外，六类功能均有独立资源登记、L3 JSON 入口及业务 JSON：

| 功能 | 入口与范围                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 启动 | 固定官服／B服包名启动或关闭；`workflow.startup.login` 最多推进十个已审阅步骤，载入只读等待，最后复核主页；不切账号                         |
| 战斗 | 当前关卡及已适配常用关卡导航、代理、连续作战、结果与掉落读取；逐场检查证据，长战斗分段只读等待；药石默认零，未知开战不重放                 |
| 公招 | 完成槽领取及日常槽位、标签、时间设置与确认；消耗许可须持久预留，未适配加急或特殊选项在预检阻断                                             |
| 信用 | 免费信用收取、好友访问及显式预算内的商品选择与购买；提交前复核价格、余额及候选身份，默认信用预算零                                         |
| 奖励 | `workflow.award.daily_weekly`：日常、周常当页各一次领取并复核物资；无按钮只说明当页没有可领取项                                            |
| 资料 | `workflow.inventory.read_depot/read_operators`：导航并返回当前屏 OCR，`scope: current_screen`、`complete: false`，不承诺全库存或全干员档案 |

运行时只执行应用维护的静态登记图。用户任意 Pipeline JSON、Custom 或脚本导入仍未开放；公共 Debug 与模型工具不能提交原生路径或任意图。官方基建排班 JSON 是独立的数据输入：宿主只读快照，检查摘要、计划索引与支持字段后调用已登记流程，不把原文件作为可执行图。现有分层允许维护者将复杂操作继续拆成已登记下层 JSON，不增加另一套解释器。

组合遵守官方控制流：`next` 是按优先级寻找首个识别命中的候选列表，不是逐项顺序调用；`JumpBack` 回到父候选起点，不等同于函数返回。顺序步骤逐个连接，业务调用／返回使用受限绑定。

修改协议先维护 `packages/contracts/schemas` 并运行 `pnpm contracts:generate`；修改资源只登记已审阅语义，模板使用活动视图真实 ID，缺失或歧义明确拒绝。相关行为、类型与原生合成检查须通过，真实设备结果另记 [STATUS](STATUS.md)。标准节点与静态 JSON 为生态工具保留入口，可视化编辑器、调试器及通用 UI 的实际兼容性仍待单独验证。

## 工作流控制会话

`Runtime.controlSessions` 管理 `none / switching / maafw`。宿主通过 `control.session.start/get/end` 管理会话，或使用 `Runtime.withFrameworkSession(deviceId, workflow, signal)` 绑定完整工作流生命周期。

每设备由一个常驻 worker 与 Controller 持有共享设备租约。进入会话先检查任务与画面操作已结束，准备并离线验证资源，使旧帧失效，再为已经连接且空闲的同一 worker 签发排他授权；不会为预览或会话切换重建 Controller。未连接或未空闲时明确失败，不绕过设备锁。

会话内即使没有工具正在执行也占用设备。任务表、作业、工具箱、定时、自动重连、连接配置、断开、删除、组件激活和应用更新遵守同一门禁。结束会话停止仍在执行的 Tasker、撤销令牌并清理帧，正常情况下保留空闲连接及设备租约；停止不能收敛时关闭 worker。明确断开或应用退出才释放连接，退出同时取消资源准备与离线探针、关闭识别进程并等待在途操作结束。

`controlToken` 是仅在内存中保存的宿主能力；只在建立响应中返回给宿主，不能进入模型参数、工具输出、事件或业务数据库。查询会话不返回令牌。人工点击没有令牌时不能写入 MaaFW 会话，现有预览仍可只读显示。

## 原子工具与证据

沿用 `maa_get_frame / maa_click`，增加 `maa_ocr / maa_match_template / maa_swipe / maa_press_key`，详见 [Agent tools](agent-tools.md)。只允许固定返回/退出按键与登记的手势类型，不开放文本输入、Shell、文件路径或 Pipeline JSON。

帧绑定设备、worker、控制会话、资源版本和画面坐标空间。操作必须使用两秒内的同源可控帧，检查越界、宿主授权及稳定调用 ID；任何实际输入尝试使旧帧失效。预览复用常驻 Controller，帧显示不扩大其输入权限；会话、worker 或资源变化后必须重新截图。

OCR/模板识别可在无 Controller 的 MaaFW 进程中消费已授权帧，无需取得额外设备连接。每个应用服务最多保留一个纯识别进程，同版本请求串行执行并限制队列长度；切换资源版本先关闭空闲的旧进程，旧进程仍忙时明确拒绝新版本请求。空闲 30 秒回收，后续明确请求时重建。失败不自动重放。该回收不改变控制会话的持有期。识别是指定帧的证据，未命中不是动作失败，原生执行完成也不是目标已验证。目标验证需要宿主取得新画面并明确检查断言。

## 共享资源视图

官方 MAA 资源格式保持不变。资源更新将固定官方源码资源与模型底包叠加为完整的不可变 generation；适配器从选定代际复制普通文件到 `<data-root>/cache/framework-resources/framework-<hash>/`，写入来源、客户端、许可继承、文件 SHA-256、适配器及 MaaFW 版本清单，再原子发布。来源和视图均纳入活动引用保护，不覆盖运行中文件，不使用软链接或跨视图硬链接。派生视图缓存独立于来源代际，目前不自动回收。

这里复用模型内容与版本来源，来源与 MaaFW 视图各有普通文件。控制进程与纯识别进程分别创建推理实例；相同资源版本的纯识别请求共用一个识别进程，不代表所有进程共享 ONNX Runtime session。

历史 macOS arm64 官方库无 Controller 离线探针中，中文 det/rec/字典文件合计约 12.6 MiB；worker 启动 RSS 约 33 MiB，首次小图 OCR 后约 109 MiB，处理 1280×720 合成图后约 272 MiB，连续 20 次约 272 MiB，正常退出。RSS 包含共享页，不等于独占内存，也不能代表当前完整应用、真实画面或其他平台峰值。纯识别进程上限和空闲回收用于约束额外缓存；多设备控制进程和模拟器仍各有内存开销，目前没有整个应用的内存硬上限。

| 官方 MAA 资源来源              | MaaFW 视图             |
| ------------------------------ | ---------------------- |
| `PaddleOCR/det/inference.onnx` | `model/ocr/det.onnx`   |
| `PaddleOCR/rec/inference.onnx` | `model/ocr/rec.onnx`   |
| `PaddleOCR/rec/keys.txt`       | `model/ocr/keys.txt`   |
| `template/<相对路径>.png`      | `image/<相对路径>.png` |

国际客户端按官方 overlay 选择模型和图片；识别权重与字典成套选择。缺失或探针失败时禁用 OCR，保留诊断，不替换模型。中文资源为首期基线，其他客户端组合分别验收。

模板 ID 是登记的安全相对标识，例如 `BattleReady.png`、`items/xxx.png`。后端只查注册表，再由原生验证其位于视图 `image/` 内，模型不能指定磁盘路径。ROI 使用当前帧的 `[x,y,w,h]`。首期使用 MaaFW 通用识别语义并返回原始 OCR 文字；MaaCore 任务的特定缩放、掩码、阈值、文本替换及流程条件不自动继承，后续业务模块须显式登记与验证这些参数。

## 连接截图与触控

默认连接和每个多开实例各自保存 `connection.framework`，供常驻 MaaFramework Controller 使用。截图增强与触控分别配置，不沿用旧核心触控模式，也不会因切换其中一项重写另一项。未配置时默认自动识别截图和 MaaTouch 输入。

自动截图核对当前设备对应的 MuMu／雷电运行实例、安装目录、SDK 和实例编号；雷电同时核对进程编号。没有匹配的实例时，由 MaaFramework 探测 AVD 增强接口并保留普通 ADB 截图候选。自动探测结果不代表增强接口一定可用，真实表现仍需对应宿主和模拟器验收。手动提供 ADB、MuMu、雷电、AVD 四种选择；手动增强不可用时明确失败，不静默降级。AVD 无需填写安装目录，MuMu／雷电增强接口目前限 Windows。

本机 TCP 地址需要先用固定只读 ADB 查询确认 QEMU 标记和 AVD 名称，再与候选 console 的 `avd name` 结果核对，才为增强流的固定启动／停止命令使用 `emulator-N` 串号。Controller 和共享设备租约仍使用原地址，不因端口相邻便认定为同一模拟器；远程地址不做此探测。自动核对失败保留普通截图候选，手动 AVD 对无法核实的 TCP 地址明确报错。

触控列出固定版本 C API 支持的四种具体 ADB 输入方式：`Maatouch`（默认）、`MinitouchAndAdbKey`、`AdbShell`、`EmulatorExtras`。最后一项是 MuMu 增强触控，单独核对 MuMu 运行实例，也可保存独立 `touchExtras` 目录与编号；不要求启用 MuMu 增强截图。显式 ADB 截图排除原生截图候选中的 `EmulatorExtras`，防止选择 MuMu 输入时反向开启增强截图。固定版本 SDK 共用模拟器 extras，同一设备无法组合雷电／AVD 截图与 MuMu 输入，这类矛盾配置会明确拒绝。

## 导航消惯性与取消

普通 `drag` 与 `navigation` 分开，模型只能选择登记类型及补偿方向。

初始导航配置沿用核查的官方 MAA minitouch 参数：主滑动默认 200 ms，末端持指 150 ms，指定方向补偿 100 px（720 高度基线，按当前帧缩放）/200 ms，最后抬手。完整动作在同一 Controller 中执行，动作后重新截图核对。没有逐点触控能力时报告导航不可用，不改用 AdbShell。

停止、取消、失败和退出执行原生停止及触点释放。取消阻止后续动作；消惯性是主动导航手势的一部分。原生库卡死或进程被强制终止时释放只能尽力执行，结果可能未知，不承诺严格实时刹停。

旧 `MaaFwAdb` 连接配置保留为历史数据；本分支不执行该 MaaCore 路径，实际输入只使用已经验证的 MaaFramework 配置。

## 验收边界

合成库覆盖协议、加载、异步结果、失败、未命中、超时、EOF、崩溃、触点清理和共享租约；后端与 Agent 验证会话、令牌、旧帧、授权、坐标、去重和退出；资源与打包夹具验证独立文件、完整性、客户端隔离和签名。官方库离线探针不创建 Controller、不操作设备，执行记录见 [STATUS](STATUS.md)。

导航效果、三类增强截图自动识别、各触控模式、持续截图/识别性能及四目标平台运行仍须分别选择设备和宿主验收。自动测试通过不能作为真实游戏验收结论。
