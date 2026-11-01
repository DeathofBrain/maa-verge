# MaaCore 工作进程

C++20 可执行文件 `maaverge-core-worker` 独立于 UI 和业务数据库。构建与开发测试
均不需要 Python；CTest 由 Node.js 驱动，设备锁测试使用独立原生探针。仅将此文件夹
作为 CMake source：

```sh
cmake -S services/native -B build/native -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF
cmake --build build/native --config Release
cmake --install build/native --config Release --prefix dist/native
```

Windows 在 Visual Studio 开发环境使用 Ninja，或使用匹配本机工具的 Visual Studio
generator。Windows 的目标使用 `/MT`（Debug 为 `/MTd`）；Linux 静态链接 libstdc++
和 libgcc，保留系统 libc/loader；macOS 使用系统库。MaaCore 及其依赖动态加载，不
随工作进程编译或下载。nlohmann/json 3.12.0 的单头文件和许可证保存在
[`3rdparty/nlohmann-json`](../../3rdparty/nlohmann-json/README.md)，无需在配置时下载；
该目录记录来源和哈希，CMake 配置时校验头文件 SHA-256。

## 协议

stdin/stdout 使用 UTF-8 NDJSON，每条消息最多 4 MiB。所有输出包含
`protocolVersion: 1`。为兼容早期 supervisor，输入可暂时省略版本；显式版本必须
为 1。原生日志的 CRT stdout 和系统 stdout handle 在加载动态库前改向 stderr，
协议描述符不被原生子进程继承。调用者应继续对进程设置总体超时。

既有 MaaCore 与租约模式：

- 默认或 `--worker`：首行配置包含 `core`、`resource`、`userDir`、`adb`、`address`、
  `lockPath`。取得设备锁、加载资源和创建实例后输出 `{type:"ready",protocolVersion:1}`。
  后续命令为 `{id,operation:"connect"}`、`{id,operation:"task",task:{type,params}}`、
  `{id,operation:"screencap"}`、`{id,operation:"frame"}`、
  `{id,operation:"click",x,y}` 或
  `{id,operation:"stop"}`。返回现有 `response`、`callback` 与 `status` 消息；异步调用的
  ID、task ID、`pendingAsync` 和 `running` 保持既有协议语义。参数、授权和预算仍由
  确定性业务服务校验。AsstStop 清空原生队列，不提供暂停恢复。
- `--validate`：读取一条 `{core,resource,version}`，在临时用户目录检查 11 个必需
  API、版本及资源加载。成功仅输出一条 `{version,resourceLoaded:true,protocolVersion:1}`。
  不创建控制实例、不连接设备；失败日志保留最后 8 条错误，至多 1200 字节。
- `--lease-only`：读取 `{lockPath,lockTimeoutMs?}`，取得锁后输出
  `{type:"ready",mode:"lease-only",protocolVersion:1}`。stdin EOF 释放锁；不接受操作命令，
  不加载 MaaCore。仅用于独立租约测试，不承担业务数据根锁；产品设备控制使用 `--worker`。

Windows 锁为相同文件 offset 0、length 1 的独占 LockFileEx，Unix 为 flock，保持
既有共享租约格式。调用者计算现有规范化 ADB server/设备标识的哈希和共享锁目录；
工作进程只持有传入的锁文件。无 soft-lock 回退，Unix 不删除锁文件。锁一直持有至
AsstDestroy 和动态库卸载完成。EOF 先停止、销毁再退出；回调 context 在 Destroy
返回前保持有效，借用字符串会立即复制到队列。

`--worker` 的可选 `capture` 配置默认为 `{method:"adb"}`；增强截图使用
`{method:"mumu"|"ldplayer",emulatorPath,instanceIndex,pid?}`。`emulatorPath` 是模拟器
安装根目录，`instanceIndex` 是实际多开索引；雷电可额外传入正整数 `pid`。worker 在
连接前调用 `AsstSetConnectionExtras`，MuMu 使用 `MuMuEmulator12` 配置并关闭额外触控，
雷电使用 `LDPlayer` 配置。增强截图必须由 `FastestWayToScreencap` 回调证实方法为
`MumuExtras` / `LDExtras`，否则 Connect 结果改为失败并附带 `error`、`expectedMethod`
和 `actualMethod`；未验证的连接不能执行任务。连接成功后如重探测选择 ADB 截图或
截图失败，worker 停止原生队列并发出 `Disconnect`，不会静默降级。

`screencap` 只在连接完成且核心和异步调用均空闲时接受，返回 `asyncId`，随后通过
`AsyncCallInfo` 的 `what:"Screencap"` 和 `details.ret` 确认新帧结果，不返回图像数据。
增强模式须先通过截图协议验证。新 API 符号为按需要求，旧核心的默认 ADB 路径保持兼容。

`frame` 在空闲时调用 `AsstAsyncScreencap(..., true)` 并等待成功的异步回调，再通过
`AsstGetImage` 读取 PNG；运行任务时只读取核心最近缓存，不额外启动截图。异步调用
未结束时拒绝取帧。结果为 `{width,height,mimeType:"image/png",data,canControl,coreLatencyMs?}`，其中
`data` 为 base64；PNG 字节数与 IHDR 尺寸均受限，以便整个 NDJSON 消息保持在 4 MiB
内。运行中 `canControl:false`；缓存画面可能早于这次请求，不能把读取频率视为核心
实际采集频率。预览图像只在内存与本地协议中流转，worker 不为此写入截图文件。

`coreLatencyMs` 仅取自本次 `AsstAsyncScreencap` 成功回调中 `details.cost` 的非负有限
数值，表示 MaaCore 完成截图的内部耗时；不含之后的 `AsstGetImage` / PNG 编码、
base64、进程间传输和前端解码显示。以异步 ID 和 `what:"Screencap"` 关联本次回调，
不采用连接测速或其他截图的耗时。回调未提供合法 `cost` 或正在读取任务缓存画面时
省略字段，不用总请求耗时代替，也不沿用旧值。

`click` 要求已连接、核心及异步调用空闲、已有有效预览尺寸，且 `(x,y)` 为 PNG 范围
内的非负整数。`AsstGetImage` 与 `AsstAsyncClick` 使用相同 MaaCore 缩放代理，直接
传预览 PNG 坐标，不再按设备物理分辨率放大。worker 调用 `AsstAsyncClick(..., true)`
后核验 `AsyncCallInfo` 的 `what:"Click"`、成功的 `details.ret` 及连接状态，才返回
`{accepted:true}`。超时或结果未知不自动重试，成功确认也不证明游戏内业务目标完成。

外层 `device.frame` / `device.click` 的 `frameId`、设备与 worker 身份、2 秒/最近 32
帧有效期、`canControl` 及 `requestId` 去重由 TypeScript 应用服务维护；这些令牌不
写入业务数据库，原生 worker 只校验本层连接、空闲与坐标约束。应用服务复用单个
未完成取帧请求；点击等待它结束并阻止后续截图排队。前端可选 5–120 Hz、默认
60 Hz 的目标刷新频率，受原生采集、IPC 和显示耗时限制，不构成真实 60 FPS 承诺。
完整页面接口、会话内去重边界和画面保存约束见
[模拟器连接说明](../../docs/emulator-connection.md#画面预览与人工点击)。

可选超时（毫秒）：`lockTimeoutMs` 默认 10000、最大 60000，允许 0 表示立即尝试；
`startupTimeoutMs` 默认 45000；`nativeCallTimeoutMs` 默认 20000（validate 为 90000）；
`asyncTimeoutMs` 默认 30000；`shutdownTimeoutMs` 默认 5000。其余上限 120000。
原生调用无法安全取消；超时将以 124 退出，执行结果未知，supervisor 必须阻止自动重放。
状态泵和卸载异常以 70 退出；协议管道断开以 74 退出。初始化/配置失败以 1 退出，
单条命令失败返回 response.error。Linux/macOS 的 supervisor 应在启动时设置核心
目录对应的 LD_LIBRARY_PATH/DYLD_LIBRARY_PATH，供原生依赖解析。

## 合成测试

```sh
cmake -S services/native -B build/native -DBUILD_TESTING=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build/native --config Release
ctest --test-dir build/native -C Release --output-on-failure
```

可用 `-DNode_EXECUTABLE=/path/to/node` 指定 Node.js。根目录也可运行
`node tools/build-core-worker.mjs` 完成构建和五组测试。MaaCore 测试现场编译三份
`vsynthetic` 动态库，完全不连接 ADB、模拟器或游戏，不使用 MaaCore 下载与模型。
四组 CTest 覆盖版本/符号/资源错误、协议隔离、Unicode 路径、回调复制、异步与原生
调用超时、停止清队列、销毁回调寿命、独立 OS 锁探针与 worker 的双向互斥及异常退出释放；另验证两类
增强截图的参数及调用顺序、禁止降级、截图失败停止和未验证任务拦截。

Windows 测试额外编译原生启动器，重新建立标准句柄并用 Job Object 约束子进程寿命，
避免 Node 传递的 CRT 描述符元数据干扰静态 CRT 动态库的 stdout 重定向断言。
启动器与锁探针仅用于测试，不随生产 worker 安装。

既有 MaaCore 的四组 Release 合成测试已在 Windows x64 运行；新增 MaaFramework
测试的平台记录见下文与 `docs/STATUS.md`。代码和 CI 配置不代表对应平台原生加载或
设备行为已经验收。

## MaaFramework 模式

同一可执行文件另提供两种显式模式；一进程只选择一种引擎。MaaFramework 固定为
官方 `v5.14.3`，直接包含
[`3rdparty/maaframework`](../../3rdparty/maaframework/README.md) 的原始 C 头文件，
以 `decltype` 声明动态函数指针，不自行复制 ABI，不静态链接，也不在构建时下载 SDK。
现有 MaaCore 的任务、资源、回调与更新语义继续使用原模式。

- `--framework-worker`：首行 `{protocolVersion:1,framework,resource,userDir,mode}`，
  `framework` 是含 `bin`、`share/MaaAgentBinary` 的官方 SDK 根目录；`resource` 是已完成
  校验的 MaaFW 资源视图根目录，包含 `image` 与可选 `model/ocr`。就绪响应为
  `{type:"ready",engine:"maafw",mode,version:"v5.14.3",protocolVersion:1}`。
- `--framework-validate`：只接受 `mode:"recognition"`，加载 SDK/资源并用确定性本地图像
  实际调用 OCR，返回 `{engine:"maafw",version:"v5.14.3",resourceLoaded:true,ocrAvailable}`。
  缺少或不能使用 OCR 模型时返回 `ocrAvailable:false` 与 `diagnostic`，不冒充 OCR 可用；
  模板识别可以独立可用。必须同时检查进程退出码为 0。

`mode:"recognition"` 不创建 Controller、不取得设备锁，且拒绝 `adb`、`address`、
`lockPath`、`avd` 配置和所有设备操作。`mode:"control"` 另需 `adb`、`address`、
`lockPath`，先取得与 MaaCore 相同的设备 OS 锁再加载库，直到停止、销毁与卸载完成。
可选 `avd:true` 显式启用官方 AVD extras；输入只选择 MaaTouch，连接失败直接报错。
连接后用官方 `PostTouchUp(0)` 确认逐点触控能力；不支持时导航滑动明确报不可用。
固定版本没有公开 `GetFeatures` C API，不为内部 C++ 接口编造动态 ABI。
截图独立使用官方默认截图能力选择，不跟随输入切换，也不把输入降级到 AdbShell。
不支持自动启动其他引擎作为失败回退。

框架命令也使用 `{id,operation,...}` 和现有 `response` 信封，操作成功必须等原生异步
终态，并对动作核验节点完成与 `MaaTaskerGetActionDetail.success`，结果包含
`{accepted:true,nativeSuccess:true}`；这不证明游戏业务目标已实现。
同一进程最多一个正在执行的命令，忙时拒绝新命令，`stop` 可以并发取消：

- `connect`：完成 MaaTouch 连接并核验原生连接状态。
- `frame`：主动取得新截图并返回 `{width,height,mimeType:"image/png",data,canControl}`。
- `click`：`x,y` 为最近有效帧坐标；未取帧或越界时拒绝。
- `long_press`：`x,y,durationMs`，时长为 1–10000 ms，使用官方 `LongPress` 完成
  按下、保持、抬起；必须通过触点能力检查，不提供裸触点入口。
- `drag`：`x1,y1,x2,y2,durationMs`，时长为 1–10000 ms，在同一触点上完成单段
  拖拽并抬起，不添加导航惯性补偿；必须通过触点能力检查。
- `swipe`：`x1,y1,x2,y2,durationMs,profile,compensationDirection`。
  `drag` 只有单段滑动，补偿方向必须为 `none`；`navigation` 先在终点保持 150 ms，
  可按显式方向追加 200 ms 的短段惯性补偿，距离按图像高度的 `100/720` 比例缩放并
  限制在帧内。补偿来自 MaaCore 的 extra-swipe 语义，不是暂停部署。
- `press_key`：只接受 `key:"back"|"escape"`。
- `recognize`：`kind:"ocr"|"template"|"color"`、`image:{data,width,height}`、可选
  `roi:[x,y,width,height]`；模板另需资源 `image` 下的相对 `template` 文件名。拒绝越界
  ROI、路径穿越、非 PNG、编码/解码尺寸不一致和超出 4 MiB 传输限制的图像。
  OCR 和模板可指定 `threshold`；OCR 支持 `onlyRec`（为 true 时必须有显式 ROI）与
  最多 256 对 `replace`（每个字符串不超过 2048 UTF-8 字节），完整保留上游纠错映射，
  模板支持官方方法 `method:5` 与 `greenMask`。颜色仅支持 HSV `method:40`、三通道
  `lower/upper`、最低像素数 `count` 及 `connected`。
  返回 `{hit,matches:[{text?,box:[x,y,width,height],score,count?}],engine:"maafw"}`，
  颜色的 `count` 是实际像素数，`score` 是像素数除以 ROI 面积，不能当作识别置信度。
  保留全部命中，上限 256，超过则报错而不截断。
  登记的上游规则可显式指定 `referenceSize:[1280,720]`，仅接受 16:9 输入，先缩放
  本次识别图像再解释 ROI，结果增加 `coordinateSize:[1280,720]`；源帧保持原尺寸，
  宿主将参考坐标映射回原帧后才能操作。未指定时保持输入坐标，不自动裁剪或缩放。
  模板 `maskRange` 仅支持已核查的 `[1,255]`、`[100,255]`：按 MaaCore 的模板
  BGR2GRAY/inRange 语义保留范围内像素，范围外在内存派生模板中涂绿，再使用官方
  `MaaResourceOverrideImage` 与 `green_mask`；不修改来源或资源视图磁盘文件，
  不支持源图 mask、闭运算及与 `greenMask` 同时使用。缓存最多 128 份派生模板；
  原模板存在范围内纯绿或 mask 排除全部像素时明确拒绝。
  纯色设施模板另支持显式 `method:"RGBCount"`、`pureColor:true`：
  `colorScales` 为 1–16 组 `[[R下限,G下限,B下限],[R上限,G上限,B上限]]`，
  每通道为 0–255 整数且下限不大于上限，范围包含端点并取并集。
  `colorWithClose` 默认为 true，复刻 3×3 矩形闭运算及中性边界；
  `nmsDistance` 为 0–16384 整数，默认 0 时使用模板短边的一半。
  `threshold` 默认 0.8，分数为 `2*共激活像素数/(窗口激活数+模板激活数)`，
  并复刻上游逐行扫描、逆序近邻更新的多匹配去重。图像解码与缩放仍使用固定
  MaaFramework C API；数色数学在 worker 中显式移植自 MaaCore v6.20.0 的
  `Matcher.cpp` / `MultiMatcher.cpp`，没有以 Ccoeff 近似。不支持非纯色分支、
  灰度色域、HSVCount 或同时指定 `maskRange` / `greenMask`。
  稀疏模板使用行段与积分图精确计数，最多 64 Mi 次行段查询；超限明确拒绝，
  不降低分辨率、不截断结果。官方纯色完整矩形模板使用常数时间窗口计数。
  算法验证使用无 Controller 合成图与现有上游模板；未据此宣称真实游戏流程已验收。
- `stop`：取消原生队列，等待停止终态及触点释放；不提供暂停恢复，不自动重放动作。

框架模式的 `startupTimeoutMs`、`nativeCallTimeoutMs` 默认均为 90000，
`asyncTimeoutMs` 默认 30000，`shutdownTimeoutMs` 默认 5000，必须为正数；锁超时仍允许
0。动作失败、EOF 和主动停止均尝试释放触点。调用或异步等待超时会给原生停止/触点
释放最多 250 ms 的清理机会，然后以 124 退出；原生或设备故障时不能据此保证物理
触点已经释放。停止受原生驱动与 `end_hold` 阻塞影响，不是实时中断保证。
销毁前必须等待 `MaaTaskerPostStop` 排入的结束任务完成，防止异步 runner 访问已销毁
的缓存。POSIX 使用 `RTLD_NODELETE` 保留 SDK 及其依赖注册的进程退出回调代码映射，
每实例对象仍先停止并销毁，随后关闭动态库句柄引用；代码映射由进程退出统一回收。
更换 SDK 必须创建新进程，禁止替换活动进程的库文件。工作进程不写业务数据库，
也不保存传入截图。

第五组 CTest `native.framework` 使用官方头文件编译的两份合成 ABI 动态库，覆盖
OCR/模板/HSV、参考坐标、上游灰度 mask 和缺失 OCR、识别不占设备、MaaTouch 无回退、
AVD 配置、滑动补偿、完整长按/拖拽、坐标和
图像校验、忙时拒绝、停止/EOF/失败触点清理、超时禁止重放、引擎间 OS 锁互斥以及
销毁和卸载的租约寿命。合成测试不需要真实 SDK 或模型，不连接 ADB。

macOS arm64 的官方 SDK `v5.14.3` 已用当前 MaaCore 的原始 OCR 模型进行完整检测/识别
离线探针，并用官方模板 PNG 原文件作输入及模板得到 `hit:true,score:1`，两者均退出 0，
未创建 Controller。资源视图验证结果以本轮 `docs/STATUS.md` 记录为准。Windows/Linux
和 MaaTouch 真实设备行为仍需对应目标环境单独验收。
