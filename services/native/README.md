# MaaCore 工作进程

C++20 可执行文件 `maaverge-core-worker` 独立于 UI 和业务数据库。生产构建不需要
Python；CTest 的开发测试使用 Python 3.12 和 filelock。仅将此文件夹作为 CMake
source：

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
`protocolVersion: 1`。为兼容 Python supervisor，输入可暂时省略版本；显式版本必须
为 1。原生日志的 CRT stdout 和系统 stdout handle 在加载动态库前改向 stderr，
协议描述符不被原生子进程继承。调用者应继续对进程设置总体超时。

三种模式互斥：

- 默认或 `--worker`：首行配置包含 `core`、`resource`、`userDir`、`adb`、`address`、
  `lockPath`。取得设备锁、加载资源和创建实例后输出 `{type:"ready",protocolVersion:1}`。
  后续命令为 `{id,operation:"connect"}`、`{id,operation:"task",task:{type,params}}`、
  `{id,operation:"screencap"}`、`{id,operation:"frame"}`、
  `{id,operation:"click",x,y}` 或
  `{id,operation:"stop"}`。返回现有 `response`、`callback` 与 `status` 消息；异步调用的
  ID、task ID、`pendingAsync` 和 `running` 与 Python 实现相同。参数、授权和预算仍由
  确定性业务服务校验。AsstStop 清空原生队列，不提供暂停恢复。
- `--validate`：读取一条 `{core,resource,version}`，在临时用户目录检查 11 个必需
  API、版本及资源加载。成功仅输出一条 `{version,resourceLoaded:true,protocolVersion:1}`。
  不创建控制实例、不连接设备；失败日志保留最后 8 条错误，至多 1200 字节。
- `--lease-only`：读取 `{lockPath,lockTimeoutMs?}`，取得锁后输出
  `{type:"ready",mode:"lease-only",protocolVersion:1}`。stdin EOF 释放锁；不接受操作命令，
  不加载 MaaCore。仅用于独立租约测试，不承担业务数据根锁；产品设备控制使用 `--worker`。

Windows 锁为相同文件 offset 0、length 1 的独占 LockFileEx，Unix 为 flock，兼容
Python filelock。调用者计算现有规范化 ADB server/设备标识的哈希和共享锁目录；
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
未结束时拒绝取帧。结果为 `{width,height,mimeType:"image/png",data,canControl}`，其中
`data` 为 base64；PNG 字节数与 IHDR 尺寸均受限，以便整个 NDJSON 消息保持在 4 MiB
内。运行中 `canControl:false`；缓存画面可能早于这次请求，不能把读取频率视为核心
实际采集频率。预览图像只在内存与本地协议中流转，worker 不为此写入截图文件。

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

可用 `-DPython3_EXECUTABLE=/path/to/python` 指定开发解释器。测试现场编译两份
`vsynthetic` 动态库，完全不连接 ADB、模拟器或游戏，不使用 MaaCore 下载与模型。
四组 CTest 覆盖版本/符号/资源错误、协议隔离、Unicode 路径、回调复制、异步与原生
调用超时、停止清队列、销毁回调寿命、Python/C++ 锁互斥及异常退出释放；另验证两类
增强截图的参数及调用顺序、禁止降级、截图失败停止和未验证任务拦截。

Windows x64 已运行上述 Release 构建和合成测试；其他平台的代码和 CI 配置不代表
对应平台原生加载或设备行为已经验收。
