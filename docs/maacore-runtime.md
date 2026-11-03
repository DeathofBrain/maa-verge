# MaaFramework 与游戏资源的独立安装

当前分支只通过独立 C++20 worker 使用 MaaFramework。它不下载、打包或加载 MaaCore 动态库，也不恢复旧任务队列。本文保留 `maacore-runtime.md` 路径，兼容既有文档链接；旧版本的验证记录在文末明确标为历史。

应用、MaaFramework SDK 与游戏资源分别检查和更新。游戏资源继续复用官方 MAA 的任务字段、模板和 OCR 数据，经过逐项审阅后供本项目的原子能力使用；资源来源不意味着执行上游 MaaCore 任务图。尚未迁移的功能保留配置、导入和历史，执行时明确阻断。执行与数据边界见 [运行时迁移](runtime-migration.md)，实际实现和验收范围见 [开发状态](STATUS.md)。

## 独立运行组件

MaaFramework SDK 固定在应用已经验证的兼容版本及平台资产清单 [runtime-assets.json](../3rdparty/maaframework/runtime-assets.json)。更新服务核对归档大小、SHA-256、展开文件清单与补充许可，再由真实 MaaFramework 加载验证；任意上游新版本不会直接替换应用固定版本。Mirror酱只有在版本、大小和摘要都等于固定资产时才作为高速来源，否则使用官方兼容包。

设备连接持有持续存在的 Framework Controller 和共享设备租约，调试、原子流程和正式执行复用该控制器。更新必须等待设备、控制会话和原生操作均到达空闲边界，随后切换到新的不可变 SDK；失败保留原版本，可回滚到已验证的上一版本。C++ worker 不写业务数据库，标准输出只承载 NDJSON 协议。

游戏资源由独立快照提供，既不依附 SDK 目录，也不再依附旧核心目录。选定的客户端资源转换成 MaaFramework 可读视图；OCR 必须通过真实 Framework 加载和本地合成图探针才启用，模型不兼容时保留明确诊断。该探针不连接设备或运行游戏。

## 游戏资源与 OCR 基线

每次资源准备均从固定的官方源码资源重新构建，再覆盖选定的 MaaResource 完整包；不在上一份覆盖结果上继续叠加，不以任何核心版本相同为由跳过资源更新。

- 基础资源固定为官方 MAA v6.20.0 对应源码提交 `71bce1cc85bce55d3b20e19066b2dd33252072fc`，从官方 codeload 取得 `resource/` 与许可。它包含真实 OCR 模型和字典，Git LFS 指针不能作为模型通过校验。
- 覆盖资源来自固定提交的官方 MaaResource ZIP，或经身份、完整包、大小、摘要和包内资源时间戳验证的 Mirror酱 `MaaResource` 包。增量包及身份不符的包不能覆盖基础资源；失败回到官方来源。
- 最终快照包含任务 JSON、模板、模型、客户端资源及许可；原生 `.dll`、`.dylib`、`.so`、`.exe` 不得进入资源快照。源码中其他 GUI、构建和示例文件不作为产品载荷。

实现位于 [updates.ts](../services/backend/src/modules/updates/updates.ts) 与 [archives.ts](../services/backend/src/infrastructure/filesystem/archives.ts)。更新作业通过包内服务的 `--update-job` 模式执行，不打开业务数据库；准备完毕后记录实际归档摘要、展开文件摘要、基础资源提交与覆盖版本。内容校验不代替真实游戏行为验收。

## 下载与安装目录

“设置 → 更新”分别保存 MaaFramework 和游戏资源目录；`Settings.componentPaths` 只接受 `framework`、`resource`，空字符串恢复对应默认。旧 `core` 目录设置仅在迁移时忽略，不作为可用引擎设置继续暴露。

| 环境                 | MaaFramework 默认根目录                                 | 游戏资源默认根目录                                     |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| 源码开发             | `<checkout>/config/components/framework/`               | `<checkout>/config/components/resource/`               |
| macOS 安装版         | `~/Library/Application Support/Maa Verge/MaaFramework/` | `~/Library/Application Support/Maa Verge/MaaResource/` |
| Windows/Linux 安装版 | `<程序目录>/MaaFramework/`                              | `<程序目录>/MaaResource/`                              |

自定义业务数据根时，源码开发的组件默认根随该数据根变化。Linux AppImage 的程序目录以 AppImage 文件为准；不能按包内侧进程的 `runtime/` 位置推导。macOS 的运行期下载不写入签名 `.app`。`MAAVERGE_COMPONENT_HOME` 仅覆盖派生 macOS 组件位置所用的用户目录，不改变配置根和共享设备锁。

SDK 在组件根下使用按数据根隔离的 `maafw-data-<hash>/generations/`。资源使用不可变 `generations/resource-<id>/resource/`；macOS 安装版还在资源根下按 `data-<hash>/` 隔离业务数据根。保留内部 `resource/` 是资源读取与迁移约定，不再调用 `AsstLoadResource`。

保存目录需要完整绝对路径及实际写入能力；拒绝文件系统链接和越界路径。修改设置或恢复默认只影响后续准备位置，不搬动已启用、待生效或回滚的快照。使用中的 worker 保持其固定资源引用；版本维护保护活动、上一组回滚、待生效和正在使用的目录。资源通常最多保留三个自有版本，仍被引用时可暂时超过上限，不能为了数量限制删除活动文件。

## 旧核心与历史数据

已有 MaaCore 目录保留原样。迁移只把可安全读取的旧基础 `resource/` 和许可复制到新的独立资源 generation，重新校验后登记；不加载旧动态库，不改写或删除旧目录，不把迁移前的核心版本当作 Framework 版本。旧 `coreVersion`、`minimumCoreVersion` 和识别来源仍可作为执行历史或上游元数据读取。

旧 `runtime/bundled-components/` 资源载荷保留兼容导入。缺失、损坏或无法安全复制的来源不会被修补为可用；用户可通过独立资源通道重新安装。旧活动组合和目录不授权任何 MaaCore 回退执行。

macOS 安装版卸载取得独占组件租约后，将当前 `.app` 和默认 MaaFramework、MaaResource 目录移到废纸篓；配置、任务、执行记录、自定义目录、设备锁和旧 MaaCore 目录保留。Finder 直接删除 `.app` 不触发外部组件清理。Windows NSIS 完整卸载清理默认 MaaFramework、MaaResource 和旧随附载荷，保留旧 MaaCore、自定义目录及配置数据；应用内升级保留组件。共享稳定锁文件不随组件删除。

## Windows 随附离线资源

当前构建的 EXE 只有可选的完整游戏资源项，完整 ZIP 也只随附游戏资源；均不随附 MaaCore 或 MaaFramework SDK。Framework 在应用内独立安装。安装器只把资源文件置于程序目录的不可变 MaaResource generation，不修改业务数据库；应用取得数据根租约并完成校验后登记。已有活动或待生效版本继续保留，同名 generation 不覆盖。

构建来源由 [windows-components.lock.json](../tools/windows-components.lock.json) 固定：上述源码基线，以及 MaaResource 提交 `6d580cec2f1993557f21509aeadb5793cd3160dc`（14,677,518 字节，SHA-256 `025bfa388963802f157471db8cc8b9532f52b77073af84a5e6cd03c5e3bace3e`）。基础源码归档在下载后记录实际摘要；不能把固定提交标识误称为预先锁定的归档 SHA-256。资源载荷保留源码和覆盖包许可，格式为资源专用 `formatVersion: 2`。

构建复用生产资源组合与安全提取规则。发布占用输出锁时，失败的另一次构建仅清理自己的临时目录，保留占用者的锁和原载荷。完整 ZIP 必须完整解压到可写目录后运行，仍需 WebView2 Runtime；应用升级方式见 [应用更新](app-updates.md#windows-离线组件与完整-zip)。

## 后台下载与断点续传

下载由固定 Bun 上的 TypeScript 服务持有，切换页面不取消。更新页分别显示应用、MaaFramework 和游戏资源的状态、速度、解压与校验结果；下载完成仍需在空闲边界激活，不能当作已安装或游戏行为成功。

服务使用内置 HTTP 下载器，支持流式临时文件、安全断点续传及成功后的原子提交，不依赖 aria2、Python Updater 或旧核心下载器。资源可恢复分片保存在组件根，Framework 归档缓存在数据根的独立下载缓存；来源、版本、URL、大小和摘要共同限定缓存身份，不同数据根或候选不能混用。

HTTP Range / If-Range 和 Content-Range 必须确认续传内容一致，远端版本变化或缺少安全标记时重新下载。临时网络失败最多进行三轮请求，重连前分别等待一秒、两秒；证书、完整性、取消和手动代理配置错误不以临时网络错误反复重试。下载大小上限、官方摘要及归档边界继续校验。未完成缓存的自动清理和磁盘配额仍待实现。

资源与 Framework 复用下载代理策略；应用更新通过桌面宿主专用 RPC 委托 Bun 传输，Rust 保持应用标识、版本、minisign 校验和退出安装职责。Mirror酱使用各自正式分发标识 `maa-verge`、`MaaFramework`、`MaaResource`，不再请求旧核心 `MAA`。保存 Mirror酱配置使尚未开始的资源候选重新选源，不打断已经传输或准备的更新；详见 [Mirror酱说明](mirrorchyan.md)。

## Clash、系统代理与 VPN/TUN

“设置 → 更新 → 下载代理”统一用于当前三类组件的元数据和下载，共用 `Settings.downloadProxy`；旧配置缺失时使用自动模式。

| 模式                 | 行为                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| 自动                 | 优先读取环境代理，再读取系统手动代理；代理无法使用或传输中断时尝试直连                              |
| 手动 HTTP/HTTPS 代理 | 接受 `IP:端口` 或完整代理 URL，省略协议时补 `http://`；固定使用该代理，失败保留中文错误与可恢复分片 |
| 直连                 | 绕过环境和系统 HTTP 代理；VPN/TUN 仍可通过系统路由接管流量                                          |

自动模式读取目标协议对应的大小写环境变量和 `ALL_PROXY`，非空小写优先；`NO_PROXY` 支持地址、域名、端口与 `*`。系统代理不覆盖已有环境代理。Windows 读取当前用户 Internet 设置，macOS 读取 `scutil --proxy` 的顶层手动代理与例外；Linux 当前只支持环境变量和系统路由。自动转直连显式禁用代理继承，元数据格式、大小或归档完整性错误不触发绕过。

应用不猜测 Clash 端口、不启动或修改代理软件。HTTPS 目标通常可用普通 HTTP 代理的 CONNECT 隧道。纯 SOCKS、显式 PAC 和 WPAD 发现尚未支持；自动模式可尝试直连，手动模式拒绝不支持的地址。VPN/TUN 通过系统路由工作，不需要改写下载源。认证、TLS 证书与归档摘要分别验证，凭据不应进入日志或错误链。

## 历史 Windows 代理回环验证（2026-10-27）

以下记录来自去除 MaaCore 之前的 Windows 分支，不代表当前分支或其他平台的新验收。固定 Bun 1.4.3 的组件下载、代理与重连六文件专项共 **89 项通过、0 失败**，该数字不包含新增应用宿主 RPC 的验证。测试使用隔离数据、回环 HTTP/HTTPS 源和实际转发请求的合成代理，系统设置由解析夹具注入；未向公网下载资源。

| 场景           | 已验证行为                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 环境代理与绕过 | 大小写 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`、协议优先级、`NO_PROXY=*`、地址及目标端口绕过                             |
| 系统设置解析   | Windows 手动代理、协议分流、例外、停用与自动检测；macOS 顶层代理、例外及嵌套接口隔离；Linux 环境代理分支                    |
| 传输与认证     | HTTP 正向代理、HTTP CONNECT 与 HTTPS 代理；手动认证成功，407、不可达及不受信证书报错且不直连；凭据不传给源站、不留在错误链  |
| 模式与降级     | 自动代理不可达、407 与协议不支持时转直连，已有分片继续 Range / If-Range；直连模式绕过继承的代理环境                         |
| 元数据检查     | 自动模式代理正文断流后直连重取；手动 407 不直连；关闭服务、无效 JSON 和大小超限不触发直连                                   |
| 连接恢复与切换 | 直连→代理、代理→直连、代理→另一代理在断流后重新选路，并按 Range / If-Range 续传                                             |
| 连续中断       | 三次中断后累计保留 48,000 字节，自动重试耗尽后用户再次重试从该位置完成；手动模式四次请求均经过同一代理                      |
| 来源与完整性   | 重试从原始 URL 刷新过期签名地址；远端版本变化拒绝复用旧字节；没有安全版本标记时从零下载；大小、SHA-256 与重定向边界继续校验 |
| 取消与错误分类 | 重连等待期间立即取消；手动代理配置、证书、完整性及本地磁盘准备错误不按临时网络故障反复重试                                  |

另在本机 Windows 只读解析当前已配置的 HTTP 系统代理成功，没有通过该用户代理发送公网请求、启动或修改 Clash/VPN。macOS/Linux 目标系统、真实 Clash 节点转发、VPN/TUN 路由和公网提速尚未实测；回环结果只覆盖路由选择、故障恢复与数据校验，完整验证记录见 [开发状态](STATUS.md)。

## 历史 MaaCore 官方分发情况（2026-10-21）

以下是旧引擎分发背景，当前分支不再请求、下载或加载这些运行库。Windows v6.20.1 的稳定 Release 只有完整 ZIP。官方 [构建工作流](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/.github/workflows/ci.yml#L158) 提供 `MAARuntime-win-*`，但它是需要 GitHub 认证、有保留期限的 Actions 产物，且仍带独立更新器，不作为默认更新源。macOS 已有 `macos-runtime-universal.zip`，Linux 使用 `linux-*.tar.gz`。

旧分支的选择性解压主要减少本地磁盘占用；当前资源路径直接组合源码资源和 MaaResource，不采用这一运行库方案。

## 历史 MaaCore Windows x64 验证（2026-10-21）

以下为迁移前 Python 路径的历史验收记录，保留用于对照包体和提取规则；当前 TypeScript/C++ 路径的实际测试见 [STATUS.md](STATUS.md)，不据此推定新路径或其他平台已完成实测。

下载官方 `MAA-v6.20.1-win-x64.zip`，大小 297,879,254 字节，SHA-256 为 `28a6c812c184f4bd6e8a7e7448b2ffa6312d711de7d39595deac771e3e784ea8`，与 Release 元数据一致。全部归档文件展开共 571,424,588 字节（约 545.0 MiB）；选择性首装后的目录含本项目 manifest 共 340,850,391 字节（约 325.1 MiB），减少 **40.35%**。

保留的原生库为 `MaaCore.dll`、`MaaUtils.dll`、`DirectML.dll`、`MaaAdbControlUnit.dll`、`MaaWin32ControlUnit.dll`、`fastdeploy_ppocr_maa.dll`、`onnxruntime_maa.dll`、`opencv_world4_maa.dll`，以及完整 `resource/`。原 GUI、.NET/WPF、示例与素材目录未落盘。

在隔离数据目录中验证首装、通过官方 Python Updater 从 v6.20.0 更新到 v6.20.1、等待空闲激活及回滚。新旧核心均通过独立进程的版本/API/资源加载检查，原 v6.20.0 核心文件哈希保持一致。没有连接设备或运行游戏任务；macOS/Linux 的选择规则、归档布局和别名仅经合成归档测试，不代表目标平台原生实测。
