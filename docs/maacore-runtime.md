# MaaCore 运行文件的选择性安装

Maa Verge 的 TypeScript 服务从官方稳定 Release 下载对应架构的完整归档，在不可变候选目录中选择性解压，再由独立 C++20 进程校验核心版本、API 和资源加载。首次安装和后续核心更新共用同一 TypeScript 提取规则；独立 MaaResource 覆盖包使用通用安全解压。发行路径不再调用官方 Python Updater。

核心精简提取和接入提交（`e6e8493`、`103bc99`）已包含在迁移基线中。其保留范围已迁至 [archives.ts](../services/backend/src/infrastructure/filesystem/archives.ts)，安装、独立资源更新和空闲切换位于 [updates.ts](../services/backend/src/modules/updates/updates.ts)。旧参考实现已移除；进程与数据库交接见 [runtime-migration.md](runtime-migration.md)。

## 下载与安装目录

“设置 → 更新”分别提供 MaaCore 与游戏资源的下载/安装根目录。macOS 安装版默认使用 `~/Library/Application Support/Maa Verge/MaaCore/`、`~/Library/Application Support/Maa Verge/MaaResource/`，运行期下载不写入签名 `.app`。Windows/Linux 安装版继续使用主程序同级的 `MaaCore/`、`MaaResource/`，由 Tauri 传入主程序目录，不能使用包内 `runtime/` 侧进程位置推导；Linux AppImage 以 AppImage 文件为程序。源码开发使用各 checkout 独立数据根中的 `native/components/core/`、`native/components/resource/`，避免不同开发工作树共用下载。

macOS 启动时仅将仍与旧程序同级默认位置相同的下载设置改为新默认；用户自定义目录保留，已安装、待生效与回滚版本继续引用原有不可变路径，不自动搬动文件。恢复默认和后续下载采用新位置。`MAAVERGE_COMPONENT_HOME` 可覆盖派生组件位置所用的用户目录，实际路径仍为该目录下的 `Library/Application Support/Maa Verge/`；它不改变配置数据根或共享设备锁。包内服务和更新子进程共同持有独立的共享 SQLite 组件租约，卸载须取得独占租约；稳定锁文件位于 `Library/Application Support/.maaverge-components-lock.sqlite3`，不随组件删除。

组件使用不可变的 `generations/` 版本目录，不再创建 `downloads/`。macOS 安装版在所选组件根内按业务数据根划分 `data-<hash>/generations/`，避免多个配置数据根共享外层目录时互相复用或清理版本；其他平台和源码开发仍直接使用 `generations/`。下载压缩包以绑定数据根和不可变来源的稳定文件名放在组件根目录，完整归档用完即删，中断保留可恢复分片供后续重试；归档最外层的发布包或仓库目录会移除。核心库位于对应 `generations/core-<id>/`，资源位于对应 `generations/resource-<id>/resource/`；版本内部这一层 `resource/` 是上游 `AsstLoadResource` 接口自动追加的固定目录，保留以兼容核心加载、外服资源及关卡读取。

核心与独立资源分别跨新旧安装根保留最多三个版本，macOS 安装版在各数据根自己的命名空间内计数；优先保护活动、上一组回滚、待生效以及仍被 worker 使用的快照。设备忙碌或仍有引用时可暂时超过上限，下一次空闲更新维护再清理；不会为满足数量上限删除使用中的文件。仅清理自身命名和归属明确的 generation，链接目录（包括祖先路径的链接或系统别名）、不明文件及清理失败的目录保守保留。macOS 旧版未隔离的直接 `generations/` 和其他数据根的命名空间保留，不推断归属。失败的新候选会移除。旧版遗留的 `downloads/` 不再使用，空目录在维护时移除，剩余内容在卸载默认组件目录时一并删除。

保存目录要求完整绝对路径，并检测实际写入能力；安装在系统只读目录时可选择用户可写目录，错误会保留当前设置和活动版本。恢复默认只改变后续下载位置。变更目录不移动或覆盖现有活动、候选、上一组回滚文件，运行中的 worker 继续使用其固定路径；后续维护也会统计旧目录中的自有版本。

启动时轻量核对已安装核心库、有效资源版本文件及文件清单；检查新版时完整验证当前活动的核心与资源，不重复读取候选和回滚版本的全部内容，也不在版本查询前执行旧版本清理。准备、激活和回滚前仍完整验证所有引用快照。新候选在隔离验证后记录文件清单，以及由相对路径、大小和各文件 SHA-256 汇总的摘要，排除安装清单本身；可识别文件缺失、截断、零字节与同尺寸内容改写，拒绝文件或中间目录链接。摘要扫描最多并行读取八个文件，保持流式异步读取与原有路径排序、摘要格式；发生失败时等待已打开文件全部关闭后再返回，不同步读取整个模型或阻塞执行轮询。目录为空、必需文件或内容损坏时，清除失效活动/候选/回滚记录，允许重新安装同一版本；独立资源损坏时先恢复仍有效的核心基础资源。

v0.1.0 旧核心没有可信的展开文件摘要，压缩包 SHA-256 和对现存文件重新枚举都不能证明原安装完整。检查时会提供同版本重新下载安装，以新 generation 建立完整性记录；可用旧组合保留到新候选验证、空闲切换完成，失败不原位补写旧目录。旧版独立资源已有 `contentHash` 时直接复核该资源摘要。内容摘要证明文件与安装时一致，不代替原生加载或全部游戏行为验证。

资源下载完成后再次核对基础资源，失败时也同步磁盘与组件状态；若下载或解压期间核心基础目录丢失，会提示先修复核心，避免继续显示活动组合可用。修复损坏核心后仍保留最近有效回滚组合，不以已经清空的活动记录覆盖它；仍被 worker 引用的目录继续受保护。

Windows EXE（NSIS）完整卸载会删除程序同级默认的 `MaaCore/`、`MaaResource/` 和 `runtime/bundled-components/`，包括旧布局；应用内升级保留这些目录。自定义目录和用户数据根（数据库、计划、记录及数据锁）保留；重新安装后按磁盘文件重新判断组件状态。v0.1.3-alpha1 起不再提供 MSI，旧 MSI 用户须先备份再卸载旧版，手动迁移至 EXE 或完整 ZIP。ZIP 不注册卸载器。

macOS 安装版通过「设置 → 关于 → 卸载 Maa Verge」确认卸载：服务必须正常退出，清理进程取得独占组件租约并检查没有其他服务或核心进程使用组件，再将两个新默认组件文件夹和当前 `.app` 移到废纸篓。配置、任务、执行记录、自定义组件/作业目录、设备锁及旧默认位置中的历史文件保留；保留数据嵌套在待卸载目录、路径含符号链接、其他实例占用或服务强制退出时拒绝继续。部分移动失败会列出已移入废纸篓的项目，应用重新打开以恢复服务。macOS 不提供普通应用的 Finder 删除回调，直接把 `.app` 拖进废纸篓不会清理外部组件；开发环境和 Windows/Linux 不提供此入口，Linux 移除方式不变。

契约新增可选 `Settings.componentPaths`（`core`、`resource`；保存空字符串恢复对应默认目录）与 `UpdateChannel.installDirectory`。服务初始化补全旧设置，旧客户端保存其他设置时保留目录。`UpdateChannel.resourceActivities` 按客户端提供已安装资源的活动名与 `last_updated`；官服和 B 服共享基础 `resource/version.json`，资源页合并显示为「国服（官服 / B服）」，其他客户端读取各自 `global/<client>/resource/version.json`，缺失时明确显示“活动信息未提供”。主页和更新页以活动名显示游戏资源版本，保留提交号、基础资源版本和更新时间用于核对。这是资源包标记，不替代官方活动日历的开放时间。

## Windows 随附离线组件

v0.1.3-alpha1 的 Windows EXE 包含 MaaCore（原生依赖与完整基础资源）和 MaaResource（由完整基础资源合并官方覆盖包）两个可选项，默认勾选，MaaResource 依赖 MaaCore；取消后可在应用更新页下载。完整 ZIP 同时包含两者，须完全解压到可写目录后运行，系统仍需 WebView2 Runtime。

构建来源固定在 [windows-components.lock.json](../tools/windows-components.lock.json)：MaaCore v6.20.1 与 MaaResource 提交 `6d580cec2f1993557f21509aeadb5793cd3160dc`。构建工具先核对官方归档大小和 SHA-256，再复用生产提取、资源重基线与 C++ 加载校验，保留上游许可并记录展开文件摘要；“完整”指核心所需依赖与完整游戏资源，不包含上游 GUI 或 .NET/WPF。

随附核心许可从 v6.20.1 对应源码提交 `d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f` 的 `LICENSE` / `LICENSE.spdx` 补齐，同时保留其固定 MaaUtils 子模块的 LGPLv3 许可与 GNU GPLv3 全文；原生依赖声明取自固定的 MaaDeps v2.14.1 官方开发归档，各来源均绑定大小和 SHA-256。工具仅抽取依赖许可通知，不将开发归档的库或可执行文件加入载荷；核心和完整资源各自的 `licenses/sources.json` 记录来源，资源载荷同时保留 MaaResource 原始许可。这些文件纳入展开内容摘要。

当前源码的安装器和完整 ZIP 直接将组件放入程序同级 `MaaCore/generations/`、`MaaResource/generations/`，每个版本保存普通快照清单，不再保留一份 `runtime/bundled-components/` 载荷。安装器不修改业务数据库，也不覆盖已经存在的同名 generation。服务取得数据根租约后，完整验证内容及原生加载，再把这些版本登记为已下载完成的普通版本；已有活动或待生效组件继续保留。后续自动更新、同版本复用、空闲激活、回滚和版本保留使用同一套规则，自定义组件目录仍按设置生效。旧安装包的 `runtime/bundled-components/` 保留兼容导入。应用内升级跳过安装器的组件选项。ZIP 的配置默认仍位于程序同级 `config/`，应用升级须手动下载新 ZIP，详见[应用更新](app-updates.md#windows-离线组件与完整-zip)。

## 后台下载与断点续传

下载由 TypeScript 应用服务持有，切换设置分类或侧栏页面不会取消。窗口右上角持续显示 MaaCore / 游戏资源的进度、解压校验和结果；下载不占用其他页面的操作状态。准备完成仍需点击「应用更新」或等待自动更新流程在空闲边界生效，不能把下载完成当作安装成功。

更新页与右上角通知同时显示应用、MaaCore 和游戏资源的当前下载速度，按 B/s、KB/s、MB/s 或 GB/s 自动换算。服务每约 250 毫秒按本次连接新增字节采样，续传已缓存的部分不计入速度；总大小未知或百分比未变化时仍可刷新，传输停滞时显示 0 B/s。重连等待、下载结束、解压及校验阶段不显示速度。契约通过可选 `UpdateChannel.downloadSpeedBytesPerSecond` 传递非负字节/秒速率，旧响应省略该字段仍兼容。

当前开发源码统一使用 TypeScript 服务内置的 HTTP 下载器，已移除下载器选择、自定义 aria2 路径和 aria2 的准备、打包依赖。下载流式写入临时文件，验证成功后原子改名；无需额外安装下载工具。已发布的 v0.1.2 仍使用其原有下载器设置，本节描述后续源码行为。

Maa Verge 应用、MaaCore 和游戏资源三条通道共用 Bun 的 HTTP 请求、代理选择、失败转直连和安全断点续传。应用发行元数据、所选版本的 `latest.json` 与更新包通过桌面宿主专用 RPC 委托 Bun 传输；Rust 继续负责应用仓库、平台、登记大小、版本与 minisign 校验，以及已签名包的持久化和退出安装。版本频道和安装职责仍分别管理，详见 [应用更新](app-updates.md)。

HTTP 下载支持 HTTP/HTTPS 代理；自动模式遵循 `NO_PROXY`（含 `*`），手动模式固定使用所填代理。证书、HTTPS 重定向、大小和摘要校验保持启用。当前开发源码在「设置 → 更新 → Mirror酱」提供三通道共用 CDK：用户端高速分发为付费服务，未填写 CDK、服务不可用或平台无适配包时保留官方免费来源。核心对应 `MAA`，资源对应 `MaaResource`。macOS 核心实际请求对应架构的镜像，从上游完整 ZIP 内的 DMG 只读提取 `MAA.app` 内的核心、依赖和基础资源，经过原生加载验证后进入不可变候选，不启动或安装 MAA GUI；Linux 核心继续使用官方运行时源。保存 Mirror酱配置会使未开始下载的旧候选重新选源，不打断正在传输或已经准备的更新。完整包、资源时间及回退规则见 [Mirror酱说明](mirrorchyan.md)。

下载器在对应组件根目录保存可恢复的数据。缓存身份包含数据根、通道、固定来源 URL、版本、文件名、大小和摘要，重试同一包或重启服务可继续使用，其他版本或数据根不会混用。使用 HTTP Range / If-Range，并核对服务端版本标记及 Content-Range；不能确认分片属于同一内容或来源不支持续传时重新下载。旧 aria2 分片不能作为 HTTP 连续数据复用，遇到时重新下载。

下载没有两分钟总时限；连接或数据长时间停滞才会失败。临时网络错误、连接空闲超时及可恢复 HTTP 错误默认最多进行三轮请求，重连前分别等待一秒、两秒，并从原始固定 URL 重新请求；自动模式可在代理失败时另尝试直连。取消、手动代理地址或认证错误、证书错误和完整性失败不按临时网络故障反复重试。中断或正常退出保留可用分片，重新打开后在失败通道点击「重试下载」。下载完成后检查大小、完整 SHA-256（上游提供时核对官方摘要）、2 GiB 上限，再执行归档安全校验及 C++ 核心/资源加载验证；完整性失败的分片会丢弃，已启用版本保持原样。未完成缓存的自动清理与磁盘配额仍待实现。

实现对照上游 MAA v6.20.1（固定提交 `d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f`）的 [ResourceUpdater](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/src/MaaWpfGui/Models/ResourceUpdater.cs#L41) 与 [HttpService](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/src/MaaWpfGui/Services/Web/HttpService.cs#L250)，参考内置 HTTP、流式临时文件和进度反馈；重连间隔参考其[更新包最多三次、间隔一秒和两秒的重试](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/src/MaaWpfGui/ViewModels/Dialogs/VersionUpdateDialogViewModel.cs#L1811)。上游资源 ZIP 直接使用同一 HTTP 服务。Maa Verge 保留既有的来源固定、断点续传、完整性校验和不可变候选版本，不将资源合并写入活动目录。

## Clash、系统代理与 VPN/TUN

“设置 → 更新 → 下载代理”提供三种连接方式，统一用于 Maa Verge 应用、MaaCore 与 MaaResource 的版本检查和更新包下载，共用 `Settings.downloadProxy`。旧配置没有该字段时使用自动模式。

| 模式                 | 行为                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 自动                 | 优先读取环境代理，再读取系统手动代理；配置无法解析、协议不支持、代理不可达、认证失败或传输中断时尝试直连。                                                 |
| 手动 HTTP/HTTPS 代理 | 接受 `IP:端口` 或完整代理 URL，省略协议时补 `http://`。保存前验证地址，固定使用该代理并覆盖环境、系统代理及 `NO_PROXY`；失败显示中文错误并保留可恢复分片。 |
| 直连                 | 强制绕过环境和系统 HTTP 代理；VPN/TUN 仍可通过系统路由接管流量。                                                                                           |

代理输入参考上游 MAA 的[地址与协议设置](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/src/MaaWpfGui/ViewModels/UserControl/Settings/VersionUpdateSettingsUserControlModel.cs#L405)。上游[默认地址为空](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/src/MaaWpfGui/Configuration/Global/Update.cs#L51)，由 .NET HTTP handler 的默认策略读取代理；填写地址后[建立显式代理](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/src/MaaWpfGui/Services/Web/HttpService.cs#L330)。其下载失败后重试同一 HTTP 服务，没有主动切换到直连。Maa Verge 的自动失败转直连按本次用户要求增加，安全续传与 SHA-256 校验为本项目既有能力。

自动模式按目标协议读取 `http_proxy` / `HTTP_PROXY` 或 `https_proxy` / `HTTPS_PROXY`，再使用 `all_proxy` / `ALL_PROXY`；非空的小写值优先。`no_proxy` / `NO_PROXY` 交由固定 Bun 匹配，支持全局 `*`、域名、地址和端口等绕过规则。系统代理不能覆盖已配置的环境代理。转直连时明确传入 `proxy: false`，避免再次继承同一环境代理；归档和元数据均覆盖取得响应头前的失败及读取正文时断流，元数据格式、大小与归档完整性错误不触发绕过。

从开始菜单或 Finder 启动时，应用通常没有终端里的代理环境变量，因此还需读取系统手动代理。Windows 从当前用户的 Internet 设置读取代理服务器、按协议配置和绕过列表；macOS 从 `scutil --proxy` 读取当前手动 HTTP/HTTPS 代理与例外列表。使用 Clash 的「系统代理」时，请以其设置的 HTTP 或 mixed 端口为准，程序不猜测端口、不启动 Clash，也不修改代理软件或系统设置。HTTPS 目标通常也通过普通 HTTP 代理的 CONNECT 隧道传输，目标使用 HTTPS 不代表代理地址必须使用 `https://`。

VPN/TUN 通过系统路由接管流量，应用直接连接即可，不需要探测节点或额外改写下载地址。Linux 本轮支持代理环境变量与系统路由，不读取 GNOME/KDE 的桌面代理配置。纯 SOCKS 端口与显式 PAC 配置暂不支持；自动模式遇到它们时尝试直连，手动模式拒绝无效或不支持的代理地址。有效的系统手动代理优先于并存的自动检测设置；只有「自动检测」而没有手动代理或显式 PAC 时直接连接，不执行 WPAD 发现。macOS 仅采用默认路由的顶层代理配置，不展开按接口或域名划分的代理作用域。

自动模式每次建立连接重新读取代理设置，包含重定向和失败重试；已失败的同一代理在本次下载后续重连中绕过，新选中的代理仍可使用。手动模式正文传输中断可在同一代理上重连，默认三轮耗尽后显示错误，供用户再次重试；不会自动直连。切换代理不会改变下载来源和缓存身份，仍需核对 Range / If-Range 与远端版本后才能续传。代理认证、TLS 证书和归档 SHA-256 分别校验，保持证书检查启用。

### Windows 回环验证（2026-10-27）

固定 Bun 1.4.3 的组件下载、代理与重连六文件专项共 **89 项通过、0 失败**，该数字不包含新增应用宿主 RPC 的验证。测试使用隔离数据、回环 HTTP/HTTPS 源和实际转发请求的合成代理，系统设置由解析夹具注入；未向公网下载资源。

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

## 与 maa-cli 的关系

参考 [maa-cli v0.7.7 的 `extract_mapper`](https://github.com/MaaAssistantArknights/maa-cli/blob/v0.7.7/crates/maa-cli/src/installer/maa_core.rs#L127)：完整下载后，分别提取动态库和资源。该逻辑不减少下载流量。

maa-cli 会将任意子目录中匹配动态库名称的文件扁平化到库目录；Windows 下匹配 `.dll` 也可能选入 GUI/.NET 文件。Maa Verge 因此限制库的来源目录，保留上游官方运行根的布局，避免子目录同名库覆盖和 GUI 依赖混入。

## 保留范围

- 仅接受平铺运行根或唯一一层外目录；从核心库和同级 `resource/version.json` 判断归档布局及平台。
- 保留运行根顶层的平台动态库，包括依赖、控制单元插件和 macOS/Linux 的版本化库文件。Windows 排除原 GUI 的 `MAA.dll` 及 .NET 主机 `hostfxr.dll`、`hostpolicy.dll`。
- 保留完整 `resource/`：任务、模板、OCR/ONNX 模型、国际服资源和设备端 minitouch/maatouch 等辅助程序均属于运行资源。
- 保留归档运行根中的许可证、版权及 NOTICE 声明。
- 不提取原 GUI、独立 GUI 更新器、`externals/` 中的 .NET/WPF 依赖、GUI 素材、Python 示例或调试符号。

原生依赖不能只剩 `MaaCore.dll`。上游 [核心构建脚本](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/src/MaaCore/CMakeLists.txt) 还安装 MaaUtils、OpenCV、FastDeploy、ONNX Runtime 等依赖；控制器也可能动态加载插件。

## 解压与切换边界

选择性解压仍检查归档的全部成员，拒绝路径越界、重复路径、特殊文件、目录链接、无效或循环别名。macOS/Linux 的合法文件别名物化为普通文件；选中的别名不得引用被过滤的目标。不会通过创建系统链接或扁平化子目录绕过筛选。

文件只写入新候选 generation。验证失败不切换；验证成功后仍等待任务空闲边界。切换只重建切换前实际连接成功的设备；离线设备不参与重连，重连失败只把该设备标记离线，不回滚已验证的组件更新。已有活动 generation 与回滚文件不做原位精简。此前安装的完整包会保留，到下一次核心版本更新时才使用精简的新目录。

解压由包内服务的 `--update-job` 模式完成，该进程不打开业务数据库；随后调用 `maaverge-core-worker --validate`，检查必需符号、实际版本和资源加载。资源更新固定 MaaResource commit，候选以对应核心的完整基础资源重新构建，再应用该提交覆盖包，清除前次覆盖残留。核心版本相同不跳过资源检查。

## 官方分发情况（2026-10-21）

Windows v6.20.1 的稳定 Release 只有完整 ZIP。官方 [构建工作流](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/.github/workflows/ci.yml#L158) 提供 `MAARuntime-win-*`，但它是需要 GitHub 认证、有保留期限的 Actions 产物，且仍带独立更新器，不作为默认更新源。macOS 已有 `macos-runtime-universal.zip`，Linux 使用 `linux-*.tar.gz`。

若以后需要减少下载流量，可以推动上游正式发布 Windows runtime，或按固定官方 tag 构建并分发自己的运行时包；选择性解压主要减少本地磁盘占用。

## Windows x64 验证（2026-10-21）

以下为迁移前 Python 路径的历史验收记录，保留用于对照包体和提取规则；当前 TypeScript/C++ 路径的实际测试见 [STATUS.md](STATUS.md)，不据此推定新路径或其他平台已完成实测。

下载官方 `MAA-v6.20.1-win-x64.zip`，大小 297,879,254 字节，SHA-256 为 `28a6c812c184f4bd6e8a7e7448b2ffa6312d711de7d39595deac771e3e784ea8`，与 Release 元数据一致。全部归档文件展开共 571,424,588 字节（约 545.0 MiB）；选择性首装后的目录含本项目 manifest 共 340,850,391 字节（约 325.1 MiB），减少 **40.35%**。

保留的原生库为 `MaaCore.dll`、`MaaUtils.dll`、`DirectML.dll`、`MaaAdbControlUnit.dll`、`MaaWin32ControlUnit.dll`、`fastdeploy_ppocr_maa.dll`、`onnxruntime_maa.dll`、`opencv_world4_maa.dll`，以及完整 `resource/`。原 GUI、.NET/WPF、示例与素材目录未落盘。

在隔离数据目录中验证首装、通过官方 Python Updater 从 v6.20.0 更新到 v6.20.1、等待空闲激活及回滚。新旧核心均通过独立进程的版本/API/资源加载检查，原 v6.20.0 核心文件哈希保持一致。没有连接设备或运行游戏任务；macOS/Linux 的选择规则、归档布局和别名仅经合成归档测试，不代表目标平台原生实测。
