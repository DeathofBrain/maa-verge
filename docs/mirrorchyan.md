# Mirror酱更新分发

本页描述当前开发源码，尚未随已有 v0.1.2 正式版或 v0.1.3-alpha.1 预览版发布。

## 设置与费用

在「设置 → 更新 → Mirror酱」启用服务并填写 CDK，停止输入后自动保存。Maa Verge 应用、MaaCore 核心和 MaaResource 游戏资源共用这一项配置，各自检查和更新。

**Mirror酱是独立运营的分发服务，用户端高速下载需要购买有效 CDK。** Maa Verge 本身免费开源，购买 CDK 不是使用 Maa Verge 的前提；不填写 CDK、关闭服务、CDK 不可用或当前平台没有适配包时，保留官方免费来源。价格、期限、次数、适用项目及售后以 [Mirror酱官网](https://mirrorchyan.com?source=maa_verge_docs) 的实际说明为准，不保证每种 CDK 都适用于所有项目。

CDK 输入采用掩码，未保存的内容只保留在当前应用会话内存，不缓存到浏览器存储；切换分类后仍可重试失败的保存，重新加载界面后丢弃。已保存 CDK 位于本机当前配置目录的业务设置；检查和下载时通过 HTTPS 发往 Mirror酱，URL 查询参数中包含 CDK。服务错误使用固定中文说明，诊断日志与导出对 `cdk` 字段脱敏；不记录带 CDK 的请求 URL，也不持久化限时下载链接。请勿直接分享配置数据库或 CDK。

## 三条分发对应关系

| Maa Verge 更新通道   | Mirror酱资源 ID | 处理方式                                                                                                                                                                         |
| -------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maa Verge 应用       | `maa-verge`     | 沿用 Mirror酱官方贡献的本项目分发工作流。Windows EXE、Linux AppImage 仅在版本、大小与 SHA-256 对应官方选定资产时使用镜像；Rust 仍验证更新签名后安装。                            |
| MaaCore 核心         | `MAA`           | 从 MAA 发行包提取核心及所需依赖、基础资源，沿用现有安全筛选与原生加载验证。当前仅 Windows 对应包启用镜像，其他宿主回退官方原生运行时包。没有使用假定的 `MaaCore` ID。            |
| MaaResource 游戏资源 | `MaaResource`   | 独立请求，不带系统/架构参数。镜像版本使用上游时间戳，验证包内 `resource/version.json.last_updated` 一致；与 GitHub commit 身份分别记录，通过资源时间避免同版反复下载和自动降级。 |

应用和核心的正式通道对应 `stable`，预览通道对应 `alpha`（包括正式、beta、alpha）；资源独立跟随上游稳定分发。核心版本相同不会跳过资源检查。应用发行列表和签名清单仍来自官方仓库，Mirror酱不能绕过来源、版本或签名校验。

当前官方 Mirror酱工作流为 macOS 上传 DMG，应用内更新使用单独签名的 `.app.tar.gz`，因此 macOS 应用自动更新仍走官方来源。MAA 的 macOS 镜像安装包也不能当作本项目需要的通用核心运行时包，Linux 对应核心组合目前没有可用镜像，均正常回退。Windows ZIP 版仍手动更新应用，不改变其安装方式。

## 完整包、校验与回退

接入复用现有 HTTP、代理、流式下载和安全续传，没有新增运行时 SDK。官方 API 为 `GET https://mirrorchyan.com/api/resources/{res_id}/latest`；本客户端标识为 `MaaVerge`，官网入口带 `source=maa_verge_*`。不填写 CDK 时也可请求公开版本信息，下载使用官方免费来源。

请求 `current_version=0` 获取完整包，拒绝将增量更新当成完整安装：镜像必须声明 `update_type=full` 并提供大小、SHA-256；归档出现 `changes.json` 时拒绝。下载摘要、大小、归档路径和资源版本验证通过后，组件仍先进入独立不可变候选目录，经原生校验，在空闲边界激活，保留旧版本及回滚保护。不会直接覆盖活动核心或资源。

CDK 过期、无效、次数限制、项目不匹配、平台无包、超时、摘要或完整包验证失败时，显示回退原因并尝试官方源；不会发起购买、消耗模型费用或自动打开付费网页。重新选源会重新绑定版本及内容身份，不能把另一份包的分片当作同一内容。限时 URL 仅用于当次传输，可恢复缓存绑定稳定来源身份与摘要。

## 核查与验证范围

官方无 CDK 元数据核查确认本项目 `maa-verge` 已分发 Windows、两种 macOS 架构及 Linux 安装包，`MAA` 与 `MaaResource` 的映射参考上游实现。自动测试使用合成 HTTP 响应及小型归档，覆盖付费错误、回退、取消、版本和摘要校验、资源时间、凭据脱敏及设置持久化，不使用真实 CDK、不下载真实分发包。真实付费下载及 macOS/Linux 原生安装仍需单独验收，不能据元数据查询声称已验证。

依据与来源：

- [Mirror酱官方文档](https://github.com/MirrorChyan/docs)、[错误码](https://github.com/MirrorChyan/docs/blob/main/ErrorCode.md)、[增量包说明](https://github.com/MirrorChyan/docs/blob/main/Incremental.md)、[FAQ](https://github.com/MirrorChyan/docs/blob/main/FAQ.md)。
- [已安装的官方接入 skill](../.skill/mirrorchyan-integration/SKILL.md) 及[固定来源记录](../.skill/mirrorchyan-integration/UPSTREAM.md)。
- [本项目官方分发工作流](../.github/workflows/mirrorchyan_release.yml)；没有自行设计或替换 Mirror酱上传流程。
- [MAA 的官方服务地址常量](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/master/src/MaaWpfGui/Constants/MaaUrls.cs)、[maa-cli 的更新实现](https://github.com/MaaAssistantArknights/maa-cli/tree/main/crates/maa-cli/src/installer)。

服务及第三方内容声明见 [NOTICE.md](../NOTICE.md)。核查日期：2026-10-30。
