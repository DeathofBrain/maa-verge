# Mirror酱更新分发

本文描述 `feat/atomic` 当前源码的应用、MaaFramework 与游戏资源三条独立更新通道。本分支停止 MaaCore 的检查、下载、加载和分发；文末保留迁移前的真实验证记录，不能据此认定新的 Framework 路径已完成真实下载或游戏验收。

## 设置与费用

在「设置 → 更新 → Mirror酱」启用服务并填写 CDK，停止输入后自动保存。Maa Verge 应用、MaaFramework SDK 和 MaaResource 游戏资源共用这一项配置，分别检查、下载和激活。

**Mirror酱是独立运营的分发服务，用户端高速下载需要购买有效 CDK。** Maa Verge 本身免费开源，购买 CDK 不是使用 Maa Verge 的前提；不填写 CDK、关闭服务、CDK 不可用或当前平台没有适配包时，保留官方免费来源。价格、期限、次数、适用项目及售后以[Mirror酱官网](https://mirrorchyan.com?source=maa_verge_docs)的实际说明为准，不保证每种 CDK 都适用于所有项目。

CDK 输入采用掩码，未保存内容只在当前应用会话内存中保留，不缓存到浏览器存储；切换分类后仍可重试失败的保存，重新加载界面后丢弃。已保存 CDK 位于本机当前配置目录的业务设置；检查和下载时通过 HTTPS 发往 Mirror酱，URL 查询参数包含 CDK。服务错误使用固定中文说明，诊断及导出对 `cdk` 字段脱敏，不记录带 CDK 的请求 URL，也不持久化限时下载链接。请勿直接分享配置数据库或 CDK。

## 当前三条分发对应关系

| 更新通道       | Mirror酱资源 ID | 处理方式                                                                                                                                                                                 |
| -------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maa Verge 应用 | `maa-verge`     | 沿用 Mirror酱官方贡献的本项目分发工作流。Windows EXE、macOS DMG、Linux AppImage 仅在版本、大小、SHA-256 对应官方选定资产时使用镜像；Rust 继续验证绑定内容和版本的更新签名后安装。        |
| MaaFramework   | `MaaFramework`  | 仅接受与本应用兼容清单相同版本、大小、SHA-256 的稳定通道完整 SDK ZIP；其他情况回退 GitHub 固定兼容版本。SDK 独立安装、校验、激活和回滚。                                                 |
| 游戏资源       | `MaaResource`   | 独立请求，不带系统／架构参数。镜像版本使用上游时间戳，要求包内 `resource/version.json.last_updated` 一致；与官方 Git commit 身份分别记录，避免按引擎版本跳过资源检查或反复下载同版资源。 |

当前客户端不请求旧核心 `MAA` RID，不新增或猜测替代 ID。应用的稳定通道对应 `stable`，预览通道对应 `alpha`；MaaFramework 和资源使用 `stable`。应用发行列表和签名清单仍来自官方仓库，Mirror酱不能绕过来源、版本或签名校验。

MaaFramework 当前兼容版本为 `v5.14.3`，不会把未经验证的上游新版作为可安装候选。SDK 请求使用 canonical 平台值：Windows `windows/amd64`、Linux `linux/amd64`、macOS `darwin/arm64` 或 `darwin/amd64`，对应官方页面中的系统／架构别名。2026-11-02 曾根据用户提供的[官方项目页面](https://mirrorchyan.com/zh/projects?rid=MaaFramework&os=macos&channel=stable)核对分发矩阵，不带 CDK 的 macOS arm64 请求返回 `code=0` 和稳定版 `v5.14.3`；这只验证公开元数据，未使用真实 CDK 或下载付费 SDK。组件说明见[MaaFramework 独立组件](framework-updates.md)。

游戏资源每次从固定官方 MAA 源码资源与 OCR 模型底包重建，再覆盖 MaaResource 完整包；镜像替换的是覆盖资源来源，不是 SDK、旧核心或模型底包。不在上一次覆盖目录上继续叠加，也不以 Framework 版本相同为由跳过检查。原生库不能进入资源快照。固定来源、目录、离线资源包及回滚约定见[独立组件与游戏资源](maacore-runtime.md)。

## 应用更新

应用更新复用官方工作流上传的完整安装包，不另行上传专用增量包。Windows 校验完整 EXE 后以 `/P /UPDATE /R` 调用安装器，保留配置和已有组件；Linux AppImage 更新当前 AppImage；macOS 只接受发行清单中对应架构的签名 DMG，只读挂载并验证应用后原子替换 `.app`。缺少签名 DMG 时提示手动安装或等待新版本，不使用 `.app.tar.gz`，也不恢复旧归档缓存。

这属于完整包下载后的原地更新，不是二进制差分下载。Maa Verge 的 DMG 使用独立 minisign 签名，不修改原安装包；仅支持旧归档的 macOS 客户端需手动安装一次新版 DMG。完整 EXE 向导、DMG 拖拽安装及 AppImage 首次运行仍保留，Windows ZIP 版继续手动更新应用。当前应用安装器或 ZIP 可选随附游戏资源，均不随附 MaaCore 或完整 MaaFramework SDK。

## 完整包、校验与回退

接入复用 TypeScript 服务内置 HTTP、下载代理、流式文件和安全续传，不引入新的运行时 SDK。官方 API 为 `GET https://mirrorchyan.com/api/resources/{res_id}/latest`；客户端标识为 `MaaVerge`，官网入口带 `source=maa_verge_*`。没有 CDK 也可请求公开版本信息，实际下载使用官方免费来源。

请求 `current_version=0` 获取完整包，镜像必须声明 `update_type=full` 并提供大小、SHA-256；拒绝把差分包用于完整安装，组件归档出现 `changes.json` 时也拒绝。应用还须通过官方选定资产的签名校验，macOS DMG 必须由清单中的 `darwin-aarch64-dmg` 或 `darwin-x86_64-dmg` 目标绑定，不能用未签名包替代。

资源先核对完整包身份、摘要、大小、归档路径和包内时间戳，再与固定底包组合、校验内容并准备不可变快照。资源激活前用真实 Framework 的无 Controller 探针复核；SDK 则验证固定资产、展开文件清单、补充许可及原生加载。二者均在空闲边界切换，保护活动、待生效、回滚和正在使用的目录；下载或解压完成不代表组件已激活，更不代表真实游戏成功。

CDK 过期、无效、次数限制、项目不匹配、平台无包、超时、摘要或完整包验证失败时，显示回退原因并尝试官方源；不发起购买、消耗模型费用或自动打开付费网页。重新选源会重新绑定内容身份，另一份包的分片不能混用。限时 URL 只用于当次传输，可恢复缓存绑定稳定来源和摘要；回退后的官方资源候选在失败重试时继续保留其来源身份。

保存 Mirror酱开关或 CDK 后，已检查但尚未下载的资源候选按新配置重新选源；在途旧检查不能覆盖新的选择。SDK 在检查和准备时分别读取当前配置。下载中和已暂存的作业继续受原有作业及空闲激活边界管理，填写 CDK 不会触发下载，也不会强制重装已经满足要求的版本。

更新卡片只在实际选择并发起传输后显示「下载来源：Mirror酱」；仅启用服务或填写 CDK 不会显示该来源。回退时显示「下载来源：官方源」，未知来源不显示；切换页面和准备阶段保留本次来源。

## 当前验证范围

当前资源、SDK、代理、选源及回退回归使用隔离合成 HTTP／归档／SDK，不保存或使用真实 CDK，不连接设备，不下载真实组件。本机 macOS arm64 的打包与桌面 transport smoke 验证了自包含运行时、独立资源更新作业和原生租约链路。公开元数据或合成探针通过不能证明付费下载、真实 SDK、模拟器增强接口、真实游戏或其他平台已验收；当前完整结果见[开发状态](STATUS.md)。

## 历史真实下载验证（2026-10-31）

以下记录来自去除 MaaCore 之前的分支，保留为来源、下载和签名证据，不是当前 Framework 执行路径的验收。

当时的 Windows 宿主验证使用用户授权测试 CDK，真实下载 Windows、两种 macOS 架构及 Linux 的预览安装包，以及 Windows 核心和独立资源包，分别核对大小、SHA-256 和官方应用资产。生产应用传输验证了过期 CDK 回退 GitHub、有效 CDK 经 Mirror酱下载，Windows/Linux 包的版本绑定签名通过。核心／资源在隔离目录中使用真实 MaaCore 完成准备、原生加载、忙时等待、空闲激活和同版复查，未连接设备或改动现用配置。详情及脱敏证据见[真实下载验证](mirrorchyan-verification-2026-10-31.md)。

已发布 v0.1.2 与 v0.1.3-alpha.1 的 macOS 清单没有签名 DMG 目标，历史首次下载成功不代表当时完成 DMG 应用内更新验收。新客户端须拒绝这些缺失目标，不能恢复旧 `.app.tar.gz` 缓存。后续正式版的发布和安装验收记录另见 STATUS，不把历史限制推定为当前发行状态。

## 历史 macOS 核心接入核查（2026-10-31）

旧实现沿用官方 `MAA` RID，以 `darwin/arm64`、`darwin/amd64` 请求两种 macOS 架构；上游将同一份 universal DMG 再封装为 ZIP。旧更新器只读挂载后，提取 `MAA.app/Contents/Frameworks` 的核心／依赖和 `Contents/Resources/resource` 的基础资源，不安装或启动 MAA GUI。提取包含路径、文件、链接、挂载清理及原生加载检查；缺少实验性 `MaaFwAdb` 控制库时改用官方完整运行时。该核心提取器与专用修复下载入口已从当前分支移除。

当时核对了 MAA v6.20.1 的分发工作流、构建步骤、固定 MaaMacGui 子模块布局及加载路径。不带 CDK 查询 `MAA` 的两种 macOS 架构均返回 `code=0`，arm64 正式／预览通道取得版本信息。固定工具链 `check:app` 通过，完整运行时 **1694 通过、9 平台条件跳过、0 失败**。本机 macOS arm64 以合成 DMG、真实 `hdiutil` 和 C++ 合成核心完成准备、原生验证、忙时等待及空闲激活，并确认只提取运行时、清理本次挂载与临时目录。

该轮 macOS 核查未读取或使用用户 CDK，也未下载 Mirror酱付费包；公开元数据和合成探针不能替代真实 MaaCore 加载或真实包验收。Intel macOS、Windows/Linux 原生宿主未在该轮执行，不能把先前 Windows 的真实下载记录扩展为 macOS 验收。

## 依据与来源

- [Mirror酱官方文档](https://github.com/MirrorChyan/docs)、[错误码](https://github.com/MirrorChyan/docs/blob/main/ErrorCode.md)、[增量包说明](https://github.com/MirrorChyan/docs/blob/main/Incremental.md)、[FAQ](https://github.com/MirrorChyan/docs/blob/main/FAQ.md)。
- [已安装的官方接入 skill](../.skill/mirrorchyan-integration/SKILL.md) 及[固定来源记录](../.skill/mirrorchyan-integration/UPSTREAM.md)。
- [本项目官方分发工作流](../.github/workflows/mirrorchyan_release.yml)；没有自行设计或替换上传流程。
- [MaaFramework 官方项目页面](https://mirrorchyan.com/zh/projects?rid=MaaFramework&os=macos&channel=stable)及[兼容资产清单](../3rdparty/maaframework/runtime-assets.json)。
- 历史包型依据：[官方上传 action 的 ZIP 封装](https://github.com/MirrorChyan/uploading-action/blob/cca679d5e75017ac9ae236b55406b27f6f24c7db/action.yml#L140)，固定提交 `cca679d5e75017ac9ae236b55406b27f6f24c7db`。
- 历史 MAA v6.20.1 固定提交 `d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f`：[服务地址](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/src/MaaWpfGui/Constants/MaaUrls.cs)、[分发矩阵](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/.github/workflows/release-package-distribution.yml)、[打包工作流](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/.github/workflows/ci.yml)、[库搜索路径](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/src/MaaCore/CMakeLists.txt)。
- 历史 MaaMacGui 子模块 `27c6ef8afc83df7b946174152beb1cc912851c7f` 的[包内布局](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac.xcodeproj/project.pbxproj)；[maa-cli 的原生 runtime 安装实现](https://github.com/MaaAssistantArknights/maa-cli/blob/main/crates/maa-cli/src/installer/maa_core.rs)。

服务及第三方内容声明见 [NOTICE.md](../NOTICE.md)。当前文档更新日期：2026-11-04；历史核查日期保留于各节。
