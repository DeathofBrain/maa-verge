# MaaFramework 原生工作进程

C++20 可执行文件 `maaverge-native-worker` 独立于 UI 与业务数据库；它只加载
MaaFramework，不包含 MaaCore C API、旧任务队列、回调协议或其他引擎回退。
宿主通过 NDJSON v1 发出类型化命令，stdout 仅输出协议，第三方诊断被重定向至 stderr。
单条消息上限 4 MiB，原生超时和丢失回执代表结果未知，宿主不得重放。

```sh
node tools/build-core-worker.mjs
node tools/build-core-worker.mjs --production
```

构建脚本保留既有命令名，只输出 `maaverge-native-worker`；不下载 SDK 或游戏资源。
合成 CTest 包含 `native.lease`、`native.protocol` 与 `native.framework`，不连接设备。
独立 OS 锁探针验证跨进程排他、EOF／崩溃释放和销毁期间持锁，协议夹具验证未知命令、
版本拒绝、消息上限和 stdout 隔离。旧 `--worker`、`--validate` 入口明确拒绝。

`--lease-only` 首行仅需 `{protocolVersion:1,lockPath,lockTimeoutMs?}`，取得共享设备 OS 锁后
回复 `ready`，只接受 EOF。该模式不加载 SDK、不创建 Controller、不负责业务数据根锁。
锁文件路径始终保留；在 POSIX 上 unlink 会使竞争者锁住不同 inode，因此禁止删除锁文件。

## MaaFramework 模式

原生执行仅使用 MaaFramework，固定为
官方 `v5.14.3`，直接包含
[`3rdparty/maaframework`](../../3rdparty/maaframework/README.md) 的原始 C 头文件，
以 `decltype` 声明动态函数指针，不自行复制 ABI，不静态链接，也不在构建时下载 SDK。

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
`lockPath`，先取得跨数据根、checkout 与实例共享的设备 OS 锁再加载库，直到停止、销毁与卸载完成。
截图和触控配置独立解析；`touchMode` 明确选择 MaaTouch、minitouch、ADB 或模拟器增强，连接失败直接报错。
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
- `start_app`：`appId` 为明确 Android 包名，可选 `intent` 为同包名的显式组件；
  `stop_app` 只接受 `appId`。两者直接使用官方 Controller API，不需要坐标帧，
  不接受 shell、启动参数或跨包组件。提交前推进输入代际并废弃原有坐标，
  `{accepted:true,nativeSuccess:true}` 不证明游戏已登录或业务目标已完成。
  生命周期操作可在当前已登记 Custom 回调内执行，不向等待中的 Tasker 重新排队。
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

CTest `native.framework` 使用官方头文件编译的两份合成 ABI 动态库，覆盖
OCR/模板/HSV、参考坐标、上游灰度 mask 和缺失 OCR、识别不占设备、MaaTouch 无回退、
AVD 配置、滑动补偿、完整长按/拖拽、坐标和
图像校验、忙时拒绝、停止/EOF/失败触点清理、超时禁止重放、共享 OS 锁互斥以及
销毁和卸载的租约寿命。合成测试不需要真实 SDK 或模型，不连接 ADB。

macOS arm64 的官方 SDK `v5.14.3` 已用官方 MAA 资源的原始 OCR 模型进行完整检测/识别
离线探针，并用官方模板 PNG 原文件作输入及模板得到 `hit:true,score:1`，两者均退出 0，
未创建 Controller。资源视图验证结果以本轮 `docs/STATUS.md` 记录为准。Windows/Linux
和 MaaTouch 真实设备行为仍需对应目标环境单独验收。
