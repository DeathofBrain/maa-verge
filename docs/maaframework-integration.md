# MaaFramework 首期接入

Maa Verge 固定携带官方 MaaFramework **v5.14.3**，用于原子视觉工具；MaaCore 继续执行成熟任务。两者是独立引擎，MaaFramework 不是 MaaCore 的通用基底，也不能直接加载整套 MaaCore 任务 JSON 或 Copilot。首期不包含新的手动操作面板、真实模型、基建换班重构、肉鸽原子流程、小游戏适配或全干员采集。

## 运行库与进程

唯一资产清单 `3rdparty/maaframework/runtime-assets.json` 固定官方四个归档、大小及 SHA-256：Windows x64、macOS arm64/x64、Linux x64。匹配版本的 C API 头文件、来源和许可证保存在同一目录。准备 SDK 会联网；例行测试使用合成库与本地夹具，不下载运行库。

```sh
node tools/prepare-maafw.mjs
node tools/build-core-worker.mjs
```

开发库位于 `.tools/maafw/v5.14.3/<target>/`，发行库位于 `runtime/engines/maafw/v5.14.3/<target>/`。开发准备与发行构建使用同一入口。保留完整 `bin/`、`share/MaaAgentBinary/`、依赖及许可，将合法归档别名物化为独立普通文件。目录不能与 MaaCore 库目录混合；macOS 对 SDK `bin/` 内的运行时 Mach-O 文件逐个签名后重新生成完整性清单，再校验包内所有文件。MaaFW 首期随应用升级，没有独立更新通道。

同一 `maaverge-core-worker` 可执行文件具有 `--worker`、`--framework-worker` 和离线 `--framework-validate` 模式，每个进程只加载一种引擎。控制进程先取得既有共享设备锁；纯识别和验证进程不创建 Controller，不持有设备锁。stdout 只输出 `protocolVersion: 1` NDJSON，日志进入本地目录；关闭 MaaFW stdout 日志、调试图与录制。

## 工作流控制会话

`Runtime.controlSessions` 管理 `none / maacore / switching / maafw`。宿主通过 `control.session.start/get/end` 管理会话，或使用 `Runtime.withFrameworkSession(deviceId, workflow, signal)` 绑定完整工作流生命周期。

进入会话先检查 MaaCore 任务、异步操作和画面操作已结束，准备并离线验证资源，再使旧帧失效、关闭旧 worker、确认退出，最后启动持相同设备锁的 MaaFW worker。交接间隙可能被另一个应用实例抢锁；此时明确失败、保持离线，不自动重试。两引擎不会同时控制设备。

会话内即使没有工具正在执行也占用设备。任务表、作业、工具箱、定时、自动重连、连接配置、断开、删除、组件激活和应用更新遵守同一门禁。结束会话关闭控制进程；随后明确启动成熟任务时才重新连接 MaaCore。退出时取消资源准备与离线探针，关闭控制、识别进程并等待在途操作结束。

`controlToken` 是仅在内存中保存的宿主能力；只在建立响应中返回给宿主，不能进入模型参数、工具输出、事件或业务数据库。查询会话不返回令牌。人工点击没有令牌时不能写入 MaaFW 会话，现有预览仍可只读显示。

## 原子工具与证据

沿用 `maa_get_frame / maa_click`，增加 `maa_ocr / maa_match_template / maa_swipe / maa_press_key`，详见 [Agent tools](agent-tools.md)。只允许固定返回/退出按键与登记的手势类型，不开放文本输入、Shell、文件路径或 Pipeline JSON。

帧绑定设备、worker、引擎、控制会话、资源版本和画面坐标空间。操作必须使用两秒内的同源可控帧，检查越界、宿主授权及稳定调用 ID；点击、滑动、按键完成后使旧帧失效。两种引擎分别使用自身截图坐标，交接后必须重新截图。运行中 MaaCore 的缓存图标为 `fresh: false`。

OCR/模板识别可消费 MaaCore 截图，在无 Controller 的 MaaFW 进程中运行，无需交接设备。每个应用服务最多保留一个纯识别进程，同版本请求串行执行并限制队列长度；切换资源版本先关闭空闲的旧进程，旧进程仍忙时明确拒绝新版本请求。空闲 30 秒回收，后续明确请求时重建。失败不自动重放。该回收不改变控制会话的持有期，也不增加两引擎的控制权交接。识别是指定帧的证据，未命中不是动作失败，原生执行完成也不是目标已验证。目标验证需要宿主取得新画面并明确检查断言。

## 共享资源视图

MaaCore 保持官方目录。适配器从选定 generation 复制普通文件到 `<data-root>/cache/framework-resources/framework-<hash>/`，写入来源、客户端、许可继承、文件 SHA-256、适配器及 MaaFW 版本清单，再原子发布。来源和视图均纳入活动引用保护，不覆盖运行中文件，不使用软链接或跨视图硬链接。缓存独立于 MaaCore generation 清理器，目前不自动回收派生视图。

这里复用模型内容与版本来源，不共享已加载的模型内存：MaaCore 原文件与 MaaFW 视图各有普通文件，两个引擎及 MaaFW 控制/识别进程分别创建自己的推理实例。相同资源版本的 MaaFW 纯识别请求共用一个识别进程；这不等于复用 MaaCore 的 ONNX Runtime session。跨引擎只加载一份模型需要另行改造 OCR 服务边界，官方预编译接口不提供该能力。

本机 macOS arm64 官方库无 Controller 探针中，中文 det/rec/字典文件合计约 12.6 MiB；worker 启动 RSS 约 33 MiB，首次小图 OCR 后约 109 MiB，处理 1280×720 合成图后约 272 MiB，连续 20 次约 272 MiB，正常退出。RSS 包含共享页，不等于独占内存，也不能代表真实画面或其他平台峰值。纯识别进程上限和空闲回收用于约束额外缓存；多设备控制进程、MaaCore 和模拟器仍各有内存开销，目前没有整个应用的内存硬上限。

| MaaCore 来源                   | MaaFW 视图             |
| ------------------------------ | ---------------------- |
| `PaddleOCR/det/inference.onnx` | `model/ocr/det.onnx`   |
| `PaddleOCR/rec/inference.onnx` | `model/ocr/rec.onnx`   |
| `PaddleOCR/rec/keys.txt`       | `model/ocr/keys.txt`   |
| `template/<相对路径>.png`      | `image/<相对路径>.png` |

国际客户端按官方 overlay 选择模型和图片；识别权重与字典成套选择。缺失或探针失败时禁用 OCR，保留诊断，不替换模型。中文资源为首期基线，其他客户端组合分别验收。

模板 ID 是登记的安全相对标识，例如 `BattleReady.png`、`items/xxx.png`。后端只查注册表，再由原生验证其位于视图 `image/` 内，模型不能指定磁盘路径。ROI 使用当前帧的 `[x,y,w,h]`。首期使用 MaaFW 通用识别语义并返回原始 OCR 文字；MaaCore 任务的特定缩放、掩码、阈值、文本替换及流程条件不自动继承，后续业务模块须显式登记与验证这些参数。

## 导航消惯性与取消

固定使用 MaaTouch 输入，截图选择独立于输入，保留连接配置的 AVD 增强截图适配路径。普通 `drag` 与 `navigation` 分开，模型只能选择登记类型及补偿方向。

初始导航配置沿用核查的 MaaCore minitouch 参数：主滑动默认 200 ms，末端持指 150 ms，指定方向补偿 100 px（720 高度基线，按当前帧缩放）/200 ms，最后抬手。完整动作在同一 Controller 中执行，不能逐次滑动切换引擎；动作后重新截图核对。没有逐点触控能力时报告导航不可用，不改用 AdbShell。

停止、取消、失败和退出执行原生停止及触点释放。取消阻止后续动作；消惯性是主动导航手势的一部分。原生库卡死或进程被强制终止时释放只能尽力执行，结果可能未知，不承诺严格实时刹停。

官方 MaaCore 的 `MaaFwAdb` 保持不变：该路径使用 AdbShell，导航补偿缺口仍存在。上述导航能力属于独立 MaaFW 会话。

## 验收边界

合成库覆盖协议、加载、异步结果、失败、未命中、超时、EOF、崩溃、触点清理和共享租约；后端与 Agent 验证会话、令牌、旧帧、授权、坐标、去重和退出；资源与打包夹具验证独立文件、完整性、客户端隔离和签名。官方库离线探针不创建 Controller、不操作设备，执行记录见 [STATUS](STATUS.md)。

导航效果、AVD＋MaaTouch、持续截图/识别性能及四目标平台运行仍须分别选择设备和宿主验收。自动测试通过不能作为真实游戏验收结论。
