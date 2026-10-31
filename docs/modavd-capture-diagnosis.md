# ModAVD 增强截图诊断

检查日期：2026-11-01；宿主：macOS arm64。仅代表本机当前 ModAVD 与安装版 Maa Verge 的链路，不代表其他平台或实例已经验收。

## 结论

用户重启开发版并改用 `emulator-20000` 后，最新只读复核已确认当前 MaaCore worker 接入 ModAVD 共享内存增强链路，核心截图约 0–2 ms。界面尚未收到具体方法名是回调信息缺失，截图成功后的提示已由「等待核心确认截图方式」改为「核心未提供具体截图方式」。核验依据见下方「用户重连后的增强链路确认」。

最初检查时增强截图没有被 MaaCore 使用。直接原因是使用 `127.0.0.1:20001` 连接后，MaaFramework 原样把该地址用于 `adb emu` 命令；ADB 的模拟器 console 命令要求 `emulator-20000` 形式的串号。AVD 共享内存截图初始化失败，控制单元仍通过其他候选截图方式连接成功。

当前 ModAVD 的 POSIX 共享内存存在且持续更新，不能把本次问题归为 macOS 移植缺少增强截图生产端。Maa Verge 没有漏传 `AVD` 或 `MaaFwAdb`，但没有为这条链路校验实际截图方法，因而未向用户明确报告增强截图初始化失败。

后续用户尝试模拟器串号时，还发现两项连接问题：实际传入的是大写 `Emulator-20000`；Maa Verge 所用 server 只有 TCP 设备记录，而小写 `emulator-20000` 登记在 ModAVD 的独立 server。`adb emu avd name` 直接访问 console，成功并不证明同一 server 内的 `get-state` 能找到设备，因此仅建议更换地址还不够。

## 实际运行证据

- 安装版当前 worker 日志确认：MaaCore `v6.20.1`、MaaAdbControlUnit `v5.14.3`，实例选项 `TouchMode=MaaFwAdb`，连接配置 `AVD`，地址 `127.0.0.1:20001`。
- `worker.stderr.log` 在 00:31:32.392 记录子进程失败，参数为 `-s 127.0.0.1:20001 emu "screenrecord webrtc start"`。随后核心报告连接成功，并继续截图；失败发生在共享内存初始化之前。
- 本次只读查询 `adb -s 127.0.0.1:20001 emu avd name` 退出 1、无输出；改成 `adb -s emulator-20000 emu avd name` 退出 0，返回 `mas_0` 和 `OK`。BlueStacks ADB 与 ModAVD 自带 ADB 的结果一致，不能简单归因为某一套 ADB 太旧。ModAVD ADB 的检查复用其已运行的 20050 server，未起停 server。
- 对当前实例执行只读 `shm_open("videmulator20000", O_RDONLY)` 并仅采样 24 字节头：映射大小 3,702,784 B，1280×720，头部声明 60 fps；三次间隔约 50 ms 的帧号为 `145902 → 145904 → 145907`，时间戳同步增加。没有读取当前像素或起停共享流；声明的 60 fps 不作为实际帧率测量。
- 当前 worker 已有六次异步截图回调耗时为 `165 / 169 / 166 / 152 / 173 / 174 ms`。这些是核心控制器调用耗时，不能直接视为显示延迟，也不能据此确定具体选中了哪一种普通截图候选。
- 用户后续连接失败日志在 00:40:05.050 / 00:41:09.211 记录 `-s Emulator-20000 get-state` 失败，确认大写地址被原样传入。只读 `devices -l` 查询显示：当前默认 server 只有 `127.0.0.1:20001`，ModAVD 自身 server 则登记了 `emulator-20000`，两者当时均为 `device`。

原始日志保留在安装版数据目录 `config/native/workers/<device-id>/`，未复制账号图像或完整业务日志到仓库。

## 源码对应关系

1. Maa Verge 在 `services/backend/src/app/runtime.ts` 的 `connectDevice()` 中把选定地址传给 worker；`services/native/src/core.cpp` 的连接操作把它原样交给 `AsstAsyncConnect`。`AVD` 与 `MaaFwAdb` 均在支持列表内，实例触控选项也正确设置。
2. [MaaCore v6.20.1 的 MaaFwAdbController](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/src/MaaCore/Controller/MaaFwAdbController.cpp) 创建控制单元时传入该地址、默认截图候选以及 `extras.avd.enable=true`。
3. [MaaFramework v5.14.3 的 AVDExtras](https://github.com/MaaXYZ/MaaFramework/blob/v5.14.3/source/MaaAdbControlUnit/EmulatorExtras/AVDExtras.cpp) 使用同一串号执行 `adb -s <serial> emu "screenrecord webrtc start"`；子进程失败就返回初始化失败。成功后才用 `shm_open` / `mmap` 读取帧。
4. [ADB 的 console 客户端](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/client/console.cpp) 通过 `sscanf(serial, "emulator-%d", &port)` 取得 console 端口；TCP 串号不符合该规则，返回失败。这也与两套本机二进制的查询结果一致。
5. [MaaFramework 的 ScreencapAgent](https://github.com/MaaXYZ/MaaFramework/blob/v5.14.3/source/MaaAdbControlUnit/Manager/ScreencapAgent.cpp) 会移除初始化失败的候选，再从剩余候选选最快的方法。因此 `MaaFwAdb` 连接成功不等于 `AVDExtras` 成功。
6. ModAVD 本地移植源码保留 console 的 `startSharedMemoryModule`、POSIX `shm_open` / `MAP_SHARED` 和 `VideoFrameSharer` 的帧号及时间戳更新；当前运行实例的共享内存采样进一步确认生产端在工作。

## 为什么界面仍显示约 200 ms

`apps/desktop/src/features/devices/DevicePreview.tsx` 从发起 `device.frame` 到 PNG 解码完成计时；它包含核心截图、`AsstGetImage` 的 PNG 输出、Base64、进程间传输和浏览器解码。`services/backend/src/modules/devices/preview.ts` 返回的 `latencyMs` 也包含整个 worker 请求。

产品代码没有固定的 200 ms 截图等待。原生截图等待通过回调条件变量直接唤醒，不依赖 100 ms 事件 pump；界面的 250 ms 指标刷新定时器也不延迟画面赋值。当前核心调用已经花费约 150–170 ms，再叠加预览处理后显示约 200 ms，与增强截图初始化失败的证据一致。

## 开发版二次日志复核与设备列表格式修复

2026-11-01 再次只读核对当前开发版，MaaCore 已为 `v6.21.0-beta.3`，控制库仍为 `v5.14.3`。`config/native/workers/device-fa7e16a31c8f/worker.stderr.log:2` 在 `01:15:53.470`、worker PID `37559` 再次记录 `-s 127.0.0.1:20001 emu "screenrecord webrtc start"` 子进程失败；同一进程 `debug/asst.log:1840` 随后在 `01:15:54.566` 报告 `AVD` 连接成功。该会话开始的六次截图为 `180 / 166 / 189 / 178 / 170 / 269 ms`。这次仍是增强初始化失败后继续使用其他截图候选，不能把配置名或连接成功当作增强已生效。

ModAVD 当前 PID `54065` 的输出仍指向 `.macos-work/package/ModAVD-validated/logs/mas_0-20261031-234943.log`，第 123 行有 `Initialized handle: videmulator20000`；该行没有时间戳，是当前模拟器进程的历史初始化记录。`01:17:10+08:00` 只读采样 24 字节头时帧号为 `275099 → 275105 → 275111`，约每 100 ms 增加 6 帧。生产端持续工作；当前 MaaCore worker 没有对应共享内存条目。没有起停流、重新连接控制器或操作游戏。

用户改用 `emulator-20000` 后，应用服务在 `01:14:02` 与 `01:18:20` 报「ADB server 返回无效设备列表」。本机只读 `host:devices-l` 回复实际为 `127.0.0.1:20001        device product:… model:… device:… transport_id:…`，其中串号后是用于对齐的空格。新增的登记检查曾误将长列表也限定为制表符分隔，导致尚未发送登记请求就拒绝正常回复；这是 Maa Verge 新增解析的缺陷。现已兼容空格和制表符分隔，并继续要求原始串号精确等于小写目标；普通设备状态、重复串号、非法响应与超时检查保留。回归使用真实格式的合成回复，没有向真实 server 发出登记请求。

## 用户重连后的增强链路确认

用户重启并再次连接后，`debug/asst.log:4463` 在 `2026-11-01 01:26:48.974+08:00` 记录当前 worker PID `50862` 使用 `emulator-20000 + AVD` 连接成功，实例选项为 `MaaFwAdb`。本次没有新增增强初始化失败记录；`asst.log:4466` 及后续核心截图调用为 0–2 ms，毫秒粒度的 0 不表示整个预览链路零耗时。

本次额外只读检查了仍在运行的消费进程：`lsof` 显示 worker fd7 只读打开 `videmulator20000`，与 ModAVD PID `54065` 的 fd101 共享对象同名，均为 3,702,784 字节。`01:28:24+08:00` 的 `vmmap` 确认 worker 内对应大小的 `r--/r-- SM=SHM` 映射；对象名由 `lsof` 确认，`vmmap` 自身不显示名称。`01:27:49+08:00` 仅读取共享内存 24 字节头时帧号 `311669 → 311672 → 311675` 持续增加。结合成功截图和 0–2 ms 的核心耗时，确认本次已接入并使用共享内存增强链路，区别于此前 TCP 地址初始化失败的会话。

结论使用上述组合证据，而非单看共享内存映射：[MaaCore v6.21.0-beta.3 的默认候选](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.21.0-beta.3/src/MaaCore/Controller/MaaFwControlUnitInterface.h#L93) 排除了 MinicapDirect / MinicapStream / RawByNetcat；当前 macOS 的其他候选每次通过 ADB 截图，没有同类流缓存。未获选的候选对象也可能保留映射，因此映射单独只能证明初始化成功。当前日志未输出控制库的内部最终方法；若启用该级别日志，`The fastest method is 9` 才是直接的最终选用记录，`Testing 9` 只代表候选测试，内部枚举 9 也不能与公开截图位标志混用。

用户报告的界面约 30 ms 包含 PNG、进程通信及解码，与核心调用耗时口径不同。没有新增受控截图采样或执行游戏动作；本次读取的是用户自行连接和执行产生的日志与进程状态。

截图测试原文案会在 `captureMethod` 缺失时一直显示「等待核心确认截图方式」。该字段目前只由 `FastestWayToScreencap` 回调赋值，而当前 MaaFwAdb 桥接没有转发内部最终截图方法，因此即使截图成功，该提示也不会自动结束。现改为「核心未提供具体截图方式」，保留方法名未上报的事实；没有依据配置名、耗时或本机诊断自动写入持久化的 `captureMethod`。

## 截图测试耗时口径修正

按用户要求，连接设置中的「截图测试」改为展示 MaaCore 本次 `AsstAsyncScreencap` 成功回调 `details.cost`，通过可选 `coreLatencyMs` 原样传递到界面。该数值表示核心截图调用内部耗时，不包含之后的 `AsstGetImage` / PNG 编码、Base64、进程间传输与前端解码显示，也不使用连接阶段的候选测速结果。

只接受本次异步 ID、`what:"Screencap"` 与成功状态均匹配的有限非负数值，保留 `0 ms` 与小数。没有合法 `cost`、旧 worker 未返回该字段，或任务运行中仅读取核心缓存时显示「核心未提供截图耗时」，不以总请求耗时补位，也不复用上次结果。原 `latencyMs` 保留服务请求耗时语义，底栏实时预览指标保持原口径；本次只改变截图测试。

## 修复与后续验证边界

- 项目已在手动连接和共用连接配置输入框关闭自动首字母大写、自动纠正、拼写检查与自动填充。共享 `normalizeDeviceAddress` 只规范标准 `emulator-数字` 前缀，普通 USB 串号保留大小写；连接请求、配置保存、旧历史重连及设备身份去重使用同一规则。未发现项目主动将地址转成大写的代码；原输入框未明确禁止系统文本处理，且后端也未纠正标准模拟器前缀。
- 对明确选用 `AVD + MaaFwAdb`、地址为 `emulator-N` 的连接，取得设备租约后先向当前既有本机 server 发送固定 `host:connect:emu:N,N+1` 请求，并确认实际 `emulator-N` 为 `device`，再交给 MaaCore。该正式 [ADB 登记接口](https://android.googlesource.com/platform/packages/modules/adb/+/1cf2f017d312f73b3dc53bda85ef2610e35a80e9/services.cpp#98) 支持高端口，无需更换或起停 server，也不硬编码 ModAVD 的 server 端口。请求有超时、取消与响应大小限制；登记失败时关闭尚未连接的 worker。
- 对本机这个实例，修改后的代码应使用 `emulator-20000`，保留 `AVD + MaaFwAdb`。`20000` 是 console 端口，`20001` 是 ADB 端口；其他实例必须使用自身的端口，不照抄本机数值。仅更换 ADB 可执行文件不能修复原 TCP 串号问题。
- 若产品要继续允许通过 TCP 地址启用 AVD 增强截图，需要核实对应的本机 console / 模拟器串号，再让初始化命令使用正确串号；不能对任意远程地址或模拟器无条件用端口减一推断身份。
- AVD 增强截图还需要实际方法与初始化失败的诊断，避免把 `MaaFwAdb` 控制器已连接当作增强截图已生效。上游当前 MaaCore 路径没有转发内部选中的截图方法，不能伪造 `FastestWayToScreencap` 证据。
- 修复后的验收需同时确认共享内存初始化成功、核心截图耗时及预览总耗时；不能只看配置名称或界面帧率。共享内存读取可能使用最近缓存，快速读取本身不保证新帧。

本次修改项目源码，没有替换当前安装版、修改运行中的设备配置、重建真实控制器、执行游戏操作、起停截图流、调用模型或下载核心。自动验证使用合成 ADB server 和 worker；用户自行重启重连后的本机增强链路已通过日志与只读映射检查确认，但这不代表其他实例、其他平台或受控端到端性能验收，也不保证固定的毫秒数。
