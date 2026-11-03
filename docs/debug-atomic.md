# 原语 Debug 接口与手动测试

原语开发在主 checkout 的 `feat/atomic` 分支推进，`dev` 暂不引入 MaaFramework。官方 MaaCore 源码保持原样，既有业务继续由 MaaCore 执行；原语调试使用独立 MaaFramework 控制会话。

## 隐藏入口

在「设置 → 关于」点击「应用版本」标题五次。鼠标、Enter、Space 均可；没有计时窗口，离开关于页会清除未完成计数。解锁后在主导航「执行记录」后显示 Debug，紧凑与窄窗导航相同。偏好仅保存在本机界面的 `maaverge:ui:debug-enabled`，重启保留；Debug 页的「隐藏 Debug」会先释放自己的会话。开发版与发行版默认均隐藏，未解锁时不渲染页面，也不向搜索提供入口。

页面打开、选择设备、搜索能力和修改参数都不操作设备。必须明确点击「建立调试会话」，再执行选定能力。截图选点、选区只填写参数；旧帧不能用于设备输入，需要重新截图。

桌面上目录和右侧参数／结果分别纵向滚动，目录搜索保留在顶部；窄窗改为单列整页滚动，目录自身限高。首次使用前在「设置 → 更新」安装独立的 MaaFramework 组件；它与 MaaCore、MaaResource 分开管理，支持官方源和 Mirror酱，详见 [独立组件安装与更新](framework-updates.md)。

## 能力与协议

目录以操作、观察、游戏操作、业务流程四类供检索；实现另外使用 `primitiveLevel: 1 | 2 | 3` 表达最小原语、通用组合、游戏事件的依赖，完整业务流程位于 L3 之上。目录由注册表产生，业务与 Debug 复用同一实现。能力的输入 Schema 位于 `packages/contracts/schemas/atomic-inputs.schema.json`，公共 RPC 位于 `rpc.schema.json`，原生命令位于 `worker.schema.json`；运行 `pnpm contracts:generate` 同步目录 Schema、类型及独立校验器。产品不动态编译任意 Schema，不接受任意 Shell、ADB、原生方法或触点命令。

能力实现与注册表位于独立的 `services/automation`，backend 通过 `@maaverge/automation` 公共入口及注入的执行端口复用它。Debug 宿主服务位于 `services/backend/src/modules/debug/debug-service.ts`，继续负责调试会话、请求去重和 RPC 结果转换；控制会话及 worker 生命周期仍由 backend 管理。automation 在同一 Bun 服务进程中运行，不取得独立设备控制权。源码分层与扩展规则见 [automation README](../services/automation/README.md)。

通用目录位于 `src/registry/catalog.ts`，L1 最小原语在 `src/primitives`，L2 通用组合在 `src/composites`。它们不导入游戏；L2 的规则和参考尺寸由显式 profile 提供。各游戏功能由 `src/registry.ts` 统一组装，目录自动遍历 provider；缺少资源或适配证据时保留能力说明并报告不可用。Debug 仍使用同一包根公共目录与调用入口，不新增权限。

能力描述包含 `primitiveLevel`、`effect`、`pipelineEntry`、`dependencies` 和 `requiredResources`，可用于核对实现层、页面输入／业务提交、JSON 入口和资源前提；`available` 仍不能代替执行时的设备与会话检查。目录拒绝逆向层级和缺失依赖，调用时验证输入、输出及已声明下层调用。业务流程只组合 L3；旧 ID 如 `game.infrast.set_room` 保留，但不因历史命名被标成原语。

通用 JSON 位于 `services/automation/pipeline/{primitives,composites}/`；游戏 JSON 位于 `arknights/pipeline/<feature>/`，节点使用「大类@操作」命名。各功能 `definitions.ts` 静态登记，拒绝重名和断链，随 Bun 编译嵌入。功能适配器取得入口可达的独立副本，根图交给官方 Tasker，当前 Custom 内的已登记子图交给官方 Context 同步执行。通用绑定只处理 `execute/call/return`、输入引用及步骤结果，不解释 `next`。

基建现有页面链及房间准备／确认／复读链分别维护在七份 JSON 中，训练和批次保护保留 TS。其他目录包括 `startup`、`fight`、`recruit`、`mall`、`award`、`inventory`，分别提供有限登录、当前关卡、完成公招领取、信用、日常／周常和当前屏 OCR。资源与主题前提及具体限制见 [automation README](../services/automation/README.md#当前游戏功能边界)。目录可见不代表真实游戏已验证，默认消耗预算仍为零。

Debug 继续选择已登记的能力及参数，节点进度进入已有步骤记录；没有任意 JSON、Custom 或脚本编辑执行入口。维护者可从 `automation.components.<feature>.pipeline` 查阅类型化定义，从功能 `capabilities.ts` 检查事件契约，从 `pipeline.ts` 或通用绑定检查 handler；完整执行边界见 [MaaFramework Pipeline 开发](maaframework-integration.md#pipeline-与-custom-的分工)。

| 方法                     | 参数                                            | 返回                                                                                           |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `primitive.catalog.get`  | 可选 `deviceId`                                 | `items`：ID、分类、原语层／副作用／入口／依赖／资源、中文说明、输入／结果 Schema、可用性与原因 |
| `debug.session.start`    | `deviceId, requestId`                           | `debugSessionId, deviceId`                                                                     |
| `debug.primitive.invoke` | `debugSessionId, primitiveId, input, requestId` | 状态、结构化结果、步骤、可选 `ScreenFrame`                                                     |
| `debug.session.end`      | `debugSessionId, requestId`                     | `ended: true`                                                                                  |

调用结果区分 `nativeSuccess` 与 `verified`。设备输入已获确认不代表游戏业务目标达成；多房间失败保留逐房证据，JSON 子调用失败时保留 `data.pipelineSteps` 中已取得的结果。原语内部的 `completed` 映射为 Debug 的 `succeeded`，`partial`／`unavailable` 映射为 `failed` 并保留数据，`unknown`、`cancelled` 保持原意。返回结构 Schema 同样由契约源生成。

### 当前帧、轻量引用与预览

`composite.match`、`composite.texts`、`composite.click_box`、`composite.swipe` 的 `frame` 支持 `"current"`、`{ frameId, width, height }` 轻量引用及兼容的完整帧。参数表单可填写字符串或 JSON 对象。独立调试时，`"current"` 在本次根流程的 Custom 内截图，例如选择 `composite.texts` 后使用：

```json
{
  "profile": "infrast",
  "frame": "current",
  "roi": [360, 0, 460, 100]
}
```

ROI、点击框和滑动端点使用所选 profile 的参考画布。`match`、`texts` 省略 `frame` 也会取当前帧；引用对象必须来自真实返回的帧，手填一个 `frameId` 不会建立宿主缓存或权限。引用失效后直接拒绝，不自动刷新再执行输入。

根 Pipeline 的开始与结束都会清除旧帧。因此先独立执行 `operation.frame`，再把该结果传给下一次 L2 执行，会跨越根边界；下一次需要重新选择 `"current"`。若维护代码需要「同帧识别后输入」，应在一个静态登记根图内保存截图结果，并把三个身份字段传给后续节点。下面是 `saveAs: "capture"` 后的 `input.frame` 片段，不能作为用户任意图导入：

```json
{
  "frameId": { "$ref": "#/steps/capture/data/frameId" },
  "width": { "$ref": "#/steps/capture/data/width" },
  "height": { "$ref": "#/steps/capture/data/height" }
}
```

纯 Custom／Context 子调用和连续只读不清除同根帧；实际输入尝试会使旧帧失效。引用始终受原 worker、资源代、设备租约、动作最长 2 秒／只读最长 120 秒的年龄上限与取消门禁约束。新截图会清理已签发超过 2 秒的旧缓存，每台设备最多保留 32 张最近帧；帧可能更早失效，轻量引用不延长任何期限。调试动作后应重新观察，不用失败请求的旧证据自动重放。

Debug RPC 的 `data`、`steps` 及其嵌套结果使用轻量帧摘要，PNG 仅保留为顶层一张最新 `frame` 预览。摘要适用于正常返回、携带 `message` 的未知／取消结果和异常前已取得的步骤；不修改能力原始证据。顶层预览服务于检查画面，不代表可以跨根继续输入。

### 领域证据的判读

`observation.operators` 返回当前页可见卡片，不能单凭 `verified: true` 将它解释为全房间名单。普通房间实际容量及进驻人数来自目标、标题与计数同帧核对的 `room_panel`；名单完整性还须按明确人数逐名收齐。翻页后画面没变不证明绝对边界。缺少修改后独立计数时，`prepare_roster` 在清空前停止，而不是先清空再用房间旧人数验证。细节见[基建原语](atomic-infrast.md#明确房间身份与实际容量)。

公开 `prepare_roster` 成功后，确认参数须原样使用返回的完整准备对象，含随机 `selected.preparationId`。凭据只属于本会话 provider：进入新准备或其他基建输入 handler、取消、基建 handler 执行失败均清除旧凭据；`confirm` 通过公共输入校验并进入 handler 后即消费，资源变化也会拒绝消费结果。宿主 `inputRevision` 由 `getInputRevision()` 读取，覆盖 L1、其他功能与原生标准节点的实际输入尝试；中间修订号变化使旧凭据过期，截图、识别和根边界清帧不推进它。外部调用在 Schema／帧门禁处被拒绝且没有实际输入时，不一定清除准备凭据。没有可靠修订号时独立确认返回 `unavailable`，公开 JSON 不能自行授权提交。

`game.startup.login_step` 每次最多一个已审阅输入，随后只读等待。已知活动标题与关闭目标须同帧成立；主页活动卡片区内的同名文字在确认主页后不作为弹窗，区域外标题或未知关闭图标仍阻止就绪。初始等待和其他输入后的窗口仍为最多 20 秒；仅同帧复核、输入获确认的 `start`，在官方 3 秒 postDelay 后给最多 60 秒标题／神经反馈载入过渡。父剩余期限可更早截断，根期限仍为 120 秒；未知关闭图标或无有效关闭目标的活动标题会将本窗口收回到起算 20 秒，不追加等待或重点击。

主页稳定确认与关闭后的旧标题消失均须新帧证据，识别结束跨过局部截止也返回未知。完整登录最多十次输入，不领取活动奖励。状态变化与超时进度保留 `state`、固定标题类别、命中布尔／计数、`previous`、`oldVisible`、`stableHome`、`windowMs`、`elapsedMs`、`remainingMs`；每个窗口最多 16 条变化及一条超时末态，不含截图或 OCR 原文。停在 `unknown` 时应结合这些状态检查保留的画面事实，不能把 Tasker 完成当作已到主页。

同根首次确认稳定主页后，后续登录步骤仍逐步读取新帧，仅省去重复稳定等待；证据须保持同一登记器根身份与宿主输入修订号。非主页、读失败或输入变化会清除缓存，回到主页也须重新稳定；独立执行及缺少可靠输入修订号的端口不复用缓存。JSON 十步和 120 秒根期限保持不变。

`device.long_press` 使用 `x, y, durationMs`，`device.drag` 使用 `x1, y1, x2, y2, durationMs`；两者还需要设备、帧、请求 ID 和宿主持有的控制令牌。时长均为 1–10000 ms，由 C++ worker 完成一次闭合手势。导航滑动使用独立的 `device.swipe` 参数和 100–2000 ms 范围，不把补偿动作附加到拖拽。固定按键只开放 `back` 与 `escape`。

## 所有权、取消与资源

- Debug 的真实 `controlToken` 仅保存在服务端；界面获得随机的调试会话 ID。不能附着到或结束 Agent、其他工作流的控制会话。
- 进入调试控制前等待 MaaCore 安全空闲，关闭原控制者后由 MaaFramework 获取共享设备租约。空闲中的调试会话仍占用设备；任务、定时、其他应用实例和更新不能抢占。
- 点击、长按、拖拽、滑动及按键都复用正式帧校验、坐标检查、原生确认和去重。动作帧上限 2 秒，动作后使已有帧失效。没有未知副作用自动重试，也不切回 MaaCore 重做。
- 同一仍在缓存中的不可变帧可用于分步只读识别，允许的年龄最长 120 秒；新截图会清理超过 2 秒的旧缓存，每台设备最多保留 32 张最近帧，因此可能更早失效。它始终绑定原 worker 和资源版本，动作或交接会使其失效。识别结果如实报告 `fresh`，只读时限不延长动作时限。
- 结束会话会取消后续步骤、关闭自有控制者并清理触点。取消只读识别立即结束本调用方的等待，共享识别进程完成前仍受资源保护；退出应用同时关闭读者。释放失败保留设备占用并允许以新请求 ID 明确重试。
- 离开 Debug 页时立即请求停止并释放；建立中会话在返回后同样释放。释放失败会在本次界面生命周期内保留会话句柄，返回 Debug 后只允许重试释放，不能恢复执行或建立新会话。主动「隐藏 Debug」须先释放成功，失败时保留入口与重试操作；正在建立会话时暂不可隐藏。
- 请求账本保留到服务退出；重试同一 ID 返回原结果，不重放失败或未知输入。达到账本上限会阻止新操作，但不阻止停止。
- MaaFramework 和适配资源使用固定版本、独立不可变目录。更新只能空闲激活，活跃控制会话和识别进程保护其引用。资源适配显式登记支持字段；特殊入口或语义变化需要新增规则与验证记录。
- 同一 worker 只执行一条根 Pipeline；Custom 内允许已登记子图经当前 `MaaContextRunTask` 同步执行，禁止向等待中的根 Tasker 再次排队或并行提交根图。回调标识仅在对应节点执行期有效，不能被无关异步调用借用。子图继承根期限及取消边界，停止、取消和 EOF 终止等待并清理上下文。标准节点及 Custom 输入均受会话、帧和权限门禁保护；Pipeline 完成不单独证明业务目标。

## 验证边界

自动测试使用隔离临时数据、合成 IPC／原生 ABI 和图像夹具；不连接游戏、不调用付费模型、不下载组件。页面布局通过浅色、深色与窄窗合成截图人工检查，不添加外观断言。真实设备、各换班路径、Windows／Linux／Intel macOS 和原生 WebView 的验收必须另行记录；编译成功与识别探针不能替代这些结果。现有 Debug 不等同于官方可视化节点调试器，生态编辑器和通用 UI 的实际接入另行验收。
