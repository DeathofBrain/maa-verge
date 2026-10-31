# Mirror酱更新分发

本页描述当前开发源码，尚未随已有 v0.1.2 正式版或 v0.1.3-alpha.1 预览版发布。

## 设置与费用

在「设置 → 更新 → Mirror酱」启用服务并填写 CDK，停止输入后自动保存。Maa Verge 应用、MaaCore 核心和 MaaResource 游戏资源共用这一项配置，各自检查和更新。

**Mirror酱是独立运营的分发服务，用户端高速下载需要购买有效 CDK。** Maa Verge 本身免费开源，购买 CDK 不是使用 Maa Verge 的前提；不填写 CDK、关闭服务、CDK 不可用或当前平台没有适配包时，保留官方免费来源。价格、期限、次数、适用项目及售后以 [Mirror酱官网](https://mirrorchyan.com?source=maa_verge_docs) 的实际说明为准，不保证每种 CDK 都适用于所有项目。

CDK 输入采用掩码，未保存的内容只保留在当前应用会话内存，不缓存到浏览器存储；切换分类后仍可重试失败的保存，重新加载界面后丢弃。已保存 CDK 位于本机当前配置目录的业务设置；检查和下载时通过 HTTPS 发往 Mirror酱，URL 查询参数中包含 CDK。服务错误使用固定中文说明，诊断日志与导出对 `cdk` 字段脱敏；不记录带 CDK 的请求 URL，也不持久化限时下载链接。请勿直接分享配置数据库或 CDK。

## 三条分发对应关系

| Maa Verge 更新通道   | Mirror酱资源 ID | 处理方式                                                                                                                                                                         |
| -------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maa Verge 应用       | `maa-verge`     | 沿用 Mirror酱官方贡献的本项目分发工作流。Windows EXE、macOS DMG、Linux AppImage 仅在版本、大小与 SHA-256 对应官方选定资产时使用镜像；Rust 仍验证绑定内容和版本的更新签名后安装。 |
| MaaCore 核心         | `MAA`           | 从 MAA 发行包提取核心及所需依赖、基础资源，沿用现有安全筛选与原生加载验证。当前仅 Windows 对应包启用镜像，其他宿主回退官方原生运行时包。没有使用假定的 `MaaCore` ID。            |
| MaaResource 游戏资源 | `MaaResource`   | 独立请求，不带系统/架构参数。镜像版本使用上游时间戳，验证包内 `resource/version.json.last_updated` 一致；与 GitHub commit 身份分别记录，通过资源时间避免同版反复下载和自动降级。 |

应用和核心的正式通道对应 `stable`，预览通道对应 `alpha`（包括正式、beta、alpha）；资源独立跟随上游稳定分发。核心版本相同不会跳过资源检查。应用发行列表和签名清单仍来自官方仓库，Mirror酱不能绕过来源、版本或签名校验。

应用更新只复用官方工作流已上传的完整安装包，不另行上传专用增量包。Windows 校验完整 EXE 后以 `/P /UPDATE /R` 调用安装器，保留配置和已有组件；Linux AppImage 更新当前 AppImage；macOS 只接受发行清单中对应架构的签名 DMG，只读挂载并验证应用后原子替换 `.app`。缺少签名 DMG 时提示手动安装或等待新版本，不使用 `.app.tar.gz`，也不恢复旧归档缓存。完整 EXE 向导、DMG 拖拽安装与 AppImage 首次运行均保留。

这属于完整包下载后的原地更新，不是二进制差分下载。DMG 使用独立 minisign 签名，不修改原安装包；后续发行不再生成 `.app.tar.gz`，只支持旧归档的 macOS 客户端需手动安装一次新版 DMG。MAA 的 macOS 镜像安装包不能当作本项目需要的通用核心运行时包，Linux 对应核心组合目前没有可用镜像，均正常回退。Windows ZIP 版仍手动更新应用，不改变其安装方式。

## 完整包、校验与回退

接入复用现有 HTTP、代理、流式下载和安全续传，没有新增运行时 SDK。官方 API 为 `GET https://mirrorchyan.com/api/resources/{res_id}/latest`；本客户端标识为 `MaaVerge`，官网入口带 `source=maa_verge_*`。不填写 CDK 时也可请求公开版本信息，下载使用官方免费来源。

请求 `current_version=0` 获取完整包，拒绝将差分包当成完整安装：镜像必须声明 `update_type=full` 并提供大小、SHA-256；组件归档出现 `changes.json` 时拒绝。应用还必须通过所选官方资产的签名校验；macOS 的 DMG 必须由清单中的 `darwin-aarch64-dmg` 或 `darwin-x86_64-dmg` 目标绑定，不能用未签名安装包替代。下载摘要、大小、归档路径和资源版本验证通过后，组件仍先进入独立不可变候选目录，经原生校验，在空闲边界激活，保留旧版本及回滚保护。不会直接覆盖活动核心或资源。

CDK 过期、无效、次数限制、项目不匹配、平台无包、超时、摘要或完整包验证失败时，显示回退原因并尝试官方源；不会发起购买、消耗模型费用或自动打开付费网页。重新选源会重新绑定版本及内容身份，不能把另一份包的分片当作同一内容。限时 URL 仅用于当次传输，可恢复缓存绑定稳定来源身份与摘要。

更新卡片在下载时显示「下载来源：Mirror酱」，来源信号由实际选定并发起传输的下载器提供；仅启用服务或填写 CDK 不会显示该来源。回退后显示「下载来源：官方源」，未知来源不显示；切换页面和下载完成后的准备状态保留本次来源。

## 核查与验证范围

2026-10-31 使用用户授权的测试 CDK，已真实下载 Windows、两种 macOS 架构及 Linux 的预览安装包，以及 Windows 核心和独立资源包；大小、SHA-256 与官方应用资产分别核对。生产应用传输验证了过期 CDK 回退 GitHub 与有效 CDK 经 Mirror酱下载，Windows/Linux 包的版本绑定签名通过。核心/资源在隔离目录使用真实 MaaCore 完成准备、原生加载验证、忙时等待、空闲激活与同版复查；未连接设备或改动现用配置。

已发布 v0.1.2 与 v0.1.3-alpha.1 的 macOS 清单没有签名 DMG 目标，首次 DMG 下载成功不代表 DMG 应用内更新已完成验收。新客户端应明确拒绝这些历史更新目标；macOS 挂载、替换、重启和 Linux 原生安装仍须对应宿主验收。详情及脱敏证据见 [真实下载验证](mirrorchyan-verification-2026-10-31.md)。常规自动测试仍只使用合成 HTTP/归档，不保存或使用真实 CDK。

依据与来源：

- [Mirror酱官方文档](https://github.com/MirrorChyan/docs)、[错误码](https://github.com/MirrorChyan/docs/blob/main/ErrorCode.md)、[增量包说明](https://github.com/MirrorChyan/docs/blob/main/Incremental.md)、[FAQ](https://github.com/MirrorChyan/docs/blob/main/FAQ.md)。
- [已安装的官方接入 skill](../.skill/mirrorchyan-integration/SKILL.md) 及[固定来源记录](../.skill/mirrorchyan-integration/UPSTREAM.md)。
- [本项目官方分发工作流](../.github/workflows/mirrorchyan_release.yml)；没有自行设计或替换 Mirror酱上传流程。
- [MAA 的官方服务地址常量](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/master/src/MaaWpfGui/Constants/MaaUrls.cs)、[maa-cli 的更新实现](https://github.com/MaaAssistantArknights/maa-cli/tree/main/crates/maa-cli/src/installer)。

服务及第三方内容声明见 [NOTICE.md](../NOTICE.md)。核查日期：2026-10-31。
