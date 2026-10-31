# Mirror酱更新分发

本页描述当前开发源码，尚未随已有 v0.1.2 正式版或 v0.1.3-alpha.1 预览版发布。

## 设置与费用

在「设置 → 更新 → Mirror酱」启用服务并填写 CDK，停止输入后自动保存。Maa Verge 应用、MaaCore 核心和 MaaResource 游戏资源共用这一项配置，各自检查和更新。

**Mirror酱是独立运营的分发服务，用户端高速下载需要购买有效 CDK。** Maa Verge 本身免费开源，购买 CDK 不是使用 Maa Verge 的前提；不填写 CDK、关闭服务、CDK 不可用或当前平台没有适配包时，保留官方免费来源。价格、期限、次数、适用项目及售后以 [Mirror酱官网](https://mirrorchyan.com?source=maa_verge_docs) 的实际说明为准，不保证每种 CDK 都适用于所有项目。

CDK 输入采用掩码，未保存的内容只保留在当前应用会话内存，不缓存到浏览器存储；切换分类后仍可重试失败的保存，重新加载界面后丢弃。已保存 CDK 位于本机当前配置目录的业务设置；检查和下载时通过 HTTPS 发往 Mirror酱，URL 查询参数中包含 CDK。服务错误使用固定中文说明，诊断日志与导出对 `cdk` 字段脱敏；不记录带 CDK 的请求 URL，也不持久化限时下载链接。请勿直接分享配置数据库或 CDK。

## 三条分发对应关系

| Maa Verge 更新通道   | Mirror酱资源 ID | 处理方式                                                                                                                                                                                                        |
| -------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maa Verge 应用       | `maa-verge`     | 沿用 Mirror酱官方贡献的本项目分发工作流。Windows EXE、macOS DMG、Linux AppImage 仅在版本、大小与 SHA-256 对应官方选定资产时使用镜像；Rust 仍验证绑定内容和版本的更新签名后安装。                                |
| MaaCore 核心         | `MAA`           | Windows 从完整 ZIP 提取核心、依赖及基础资源；macOS 从完整 ZIP 中的官方 DMG 提取 `MAA.app` 内的核心、依赖及基础资源。均经过安全筛选和原生加载验证。Linux 继续回退官方原生运行时包。没有使用假定的 `MaaCore` ID。 |
| MaaResource 游戏资源 | `MaaResource`   | 独立请求，不带系统/架构参数。镜像版本使用上游时间戳，验证包内 `resource/version.json.last_updated` 一致；与 GitHub commit 身份分别记录，通过资源时间避免同版反复下载和自动降级。                                |

应用和核心的正式通道对应 `stable`，预览通道对应 `alpha`（包括正式、beta、alpha）；资源独立跟随上游稳定分发。核心版本相同不会跳过资源检查。应用发行列表和签名清单仍来自官方仓库，Mirror酱不能绕过来源、版本或签名校验。

macOS 核心请求沿用官方 `MAA` 分发：`os=darwin`，Apple Silicon 使用 `arch=arm64`，Intel 使用 `arch=amd64`，对应上游上传的 `macos`、`arm64` / `x64` 别名。两种架构由上游分发同一份 universal DMG，不新增资源 ID，也不把专用 runtime ZIP 当作 Mirror酱现有包型。

应用更新只复用官方工作流已上传的完整安装包，不另行上传专用增量包。Windows 校验完整 EXE 后以 `/P /UPDATE /R` 调用安装器，保留配置和已有组件；Linux AppImage 更新当前 AppImage；macOS 只接受发行清单中对应架构的签名 DMG，只读挂载并验证应用后原子替换 `.app`。缺少签名 DMG 时提示手动安装或等待新版本，不使用 `.app.tar.gz`，也不恢复旧归档缓存。完整 EXE 向导、DMG 拖拽安装与 AppImage 首次运行均保留。

这属于完整包下载后的原地更新，不是二进制差分下载。Maa Verge 应用的 DMG 使用独立 minisign 签名，不修改原安装包；后续发行不再生成 `.app.tar.gz`，只支持旧归档的 macOS 客户端需手动安装一次新版 DMG。MaaCore 的 macOS Mirror酱更新使用下述独立提取流程，Linux 对应核心组合目前没有可用镜像，继续回退官方源。Windows ZIP 版仍手动更新应用，不改变其安装方式。

## macOS 核心包提取

上游 MAA 的 Mirror酱工作流将 `MAA-<版本>-macos-universal.dmg` 再封装为 ZIP（`extra_zip=true`）；它与免费官方源的 `macos-runtime-universal.zip` 是两种包型。macOS 核心检查现已请求 Mirror酱，不再因宿主不是 Windows 而跳过。

下载后先校验外层完整 ZIP 的大小、SHA-256 和归档路径，要求其中只有一个顶层、文件名与所选版本一致的 DMG，再以只读、禁止自动打开的方式挂载。只从 `MAA.app/Contents/Frameworks` 读取核心及依赖 `.dylib`，从 `MAA.app/Contents/Resources/resource` 读取完整基础资源；保持库文件名并整理到新的候选目录，不启动 MAA GUI，也不将其 `.app` 安装到系统。上游 MaaCore 设置 `@loader_path/` 运行时搜索路径，库文件在同一候选目录解析依赖；对应版本库唯一时，沿用官方 runtime ZIP 的别名规则，将 `libonnxruntime.dylib`、`libopencv_world4.dylib` 生成为候选内的普通文件。

提取过程拒绝越界路径和目录链接，仅将指向包内普通文件的链接物化为独立文件。完成或失败后卸载本次挂载卷，再清理临时内容；若卸载失败，保留隔离目录，避免递归删除仍挂载的卷。候选仍须经过 C++ worker 检查真实核心版本、必需符号和资源加载，通过后才可在空闲边界激活。Mirror酱包损坏、结构不兼容、架构或原生加载验证失败时，保留旧组合并尝试官方 runtime ZIP。下载成功或提取成功不代表核心已经生效。

上游当前 DMG 没有嵌入实验性 `MaaFwAdb` 所需的 `libMaaAdbControlUnit.dylib`，默认 `maatouch`、ADB 和 minitouch 不依赖它。全局或任一设备配置选择 `MaaFwAdb` 时，准备阶段会检查该库，缺失则改用同通道的官方完整运行时。已准备候选之后切换到此模式，会拒绝激活缺库候选并要求重新检查；已经激活的镜像核心也可在检查更新时发现依赖缺口，按同版修复流程补齐。不会默默替换用户的触控模式，也不会将旧版本控制单元混入新核心。

## 完整包、校验与回退

接入复用现有 HTTP、代理、流式下载和安全续传，没有新增运行时 SDK。官方 API 为 `GET https://mirrorchyan.com/api/resources/{res_id}/latest`；本客户端标识为 `MaaVerge`，官网入口带 `source=maa_verge_*`。不填写 CDK 时也可请求公开版本信息，下载使用官方免费来源。

请求 `current_version=0` 获取完整包，拒绝将差分包当成完整安装：镜像必须声明 `update_type=full` 并提供大小、SHA-256；组件归档出现 `changes.json` 时拒绝。应用还必须通过所选官方资产的签名校验；macOS 的 DMG 必须由清单中的 `darwin-aarch64-dmg` 或 `darwin-x86_64-dmg` 目标绑定，不能用未签名安装包替代。下载摘要、大小、归档路径和资源版本验证通过后，组件仍先进入独立不可变候选目录，经原生校验，在空闲边界激活，保留旧版本及回滚保护。不会直接覆盖活动核心或资源。

CDK 过期、无效、次数限制、项目不匹配、平台无包、超时、摘要或完整包验证失败时，显示回退原因并尝试官方源；不会发起购买、消耗模型费用或自动打开付费网页。重新选源会重新绑定版本及内容身份，不能把另一份包的分片当作同一内容。限时 URL 仅用于当次传输，可恢复缓存绑定稳定来源身份与摘要。

保存 Mirror酱启用状态或 CDK 后，已检查但尚未下载的核心/资源候选会按新配置重新选源，准备更新时不会继续沿用旧配置下的官方源候选。下载中和已暂存的更新仍受既有作业及激活边界管理；填写 CDK 不会触发下载，也不会强制重新安装已是最新版本的核心。

更新卡片在下载时显示「下载来源：Mirror酱」，来源信号由实际选定并发起传输的下载器提供；仅启用服务或填写 CDK 不会显示该来源。回退后显示「下载来源：官方源」，未知来源不显示；切换页面和下载完成后的准备状态保留本次来源。

## 核查与验证范围

2026-10-31 先前的 Windows 宿主验证使用用户授权的测试 CDK，已真实下载 Windows、两种 macOS 架构及 Linux 的预览安装包，以及 Windows 核心和独立资源包；大小、SHA-256 与官方应用资产分别核对。生产应用传输验证了过期 CDK 回退 GitHub 与有效 CDK 经 Mirror酱下载，Windows/Linux 包的版本绑定签名通过。核心/资源在隔离目录使用真实 MaaCore 完成准备、原生加载验证、忙时等待、空闲激活与同版复查；未连接设备或改动现用配置。

本次 macOS 核心修复核对了 MAA v6.20.1 的分发工作流、构建步骤、固定 MaaMacGui 子模块布局与 MaaCore 加载路径；不带 CDK 查询 `MAA` 的 `darwin/arm64`、`darwin/amd64` 组合均返回 `code=0`，arm64 的正式和预览通道也均取得对应版本信息。固定工具链 `check:app` 通过，独立提交的完整运行时为 **1694 通过、9 平台条件跳过、0 失败**。本机 macOS arm64 另以合成 DMG、真实 `hdiutil` 和 C++ 合成核心完成更新作业的准备、原生验证、忙时等待和空闲激活，确认只提取运行时并清理本次挂载与临时目录。

本次没有读取或使用用户 CDK，也没有实际下载 Mirror酱付费包；公开元数据和合成探针成功不代表 CDK、真实包下载或真实 MaaCore 加载已验收，不能将先前 Windows 验证扩展为 macOS 验收。Intel macOS 及 Windows/Linux 原生宿主未在本轮执行；常规行为回归使用合成 HTTP/归档，不保存或使用真实 CDK。

已发布 v0.1.2 与 v0.1.3-alpha.1 的 macOS 清单没有签名 DMG 目标，首次 DMG 下载成功不代表 DMG 应用内更新已完成验收。新客户端应明确拒绝这些历史更新目标；macOS 挂载、替换、重启和 Linux 原生安装仍须对应宿主验收。详情及脱敏证据见 [真实下载验证](mirrorchyan-verification-2026-10-31.md)。常规自动测试仍只使用合成 HTTP/归档，不保存或使用真实 CDK。

依据与来源：

- [Mirror酱官方文档](https://github.com/MirrorChyan/docs)、[错误码](https://github.com/MirrorChyan/docs/blob/main/ErrorCode.md)、[增量包说明](https://github.com/MirrorChyan/docs/blob/main/Incremental.md)、[FAQ](https://github.com/MirrorChyan/docs/blob/main/FAQ.md)。
- [已安装的官方接入 skill](../.skill/mirrorchyan-integration/SKILL.md) 及[固定来源记录](../.skill/mirrorchyan-integration/UPSTREAM.md)。
- [本项目官方分发工作流](../.github/workflows/mirrorchyan_release.yml)；没有自行设计或替换 Mirror酱上传流程。
- [官方上传 action 的 ZIP 封装实现](https://github.com/MirrorChyan/uploading-action/blob/cca679d5e75017ac9ae236b55406b27f6f24c7db/action.yml#L140)，固定提交 `cca679d5e75017ac9ae236b55406b27f6f24c7db`；内部使用原 DMG 文件名作为唯一顶层条目。
- MAA v6.20.1，固定提交 `d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f`：[官方服务地址](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/src/MaaWpfGui/Constants/MaaUrls.cs)、[Mirror酱分发矩阵](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/.github/workflows/release-package-distribution.yml)、[universal 库、runtime ZIP 与 MAA.app 构建](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/.github/workflows/ci.yml)、[MaaCore 的 `@loader_path/` 配置](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/d94dd007aca3b519395fb1f0aee26c7bd5ba5d5f/src/MaaCore/CMakeLists.txt)。
- 该版本固定 MaaMacGui 子模块 `27c6ef8afc83df7b946174152beb1cc912851c7f` 的 [Frameworks 和 resource 打包布局](https://github.com/MaaAssistantArknights/MaaMacGui/blob/27c6ef8afc83df7b946174152beb1cc912851c7f/MeoAsstMac.xcodeproj/project.pbxproj)；[maa-cli 的原生 runtime ZIP 安装实现](https://github.com/MaaAssistantArknights/maa-cli/blob/main/crates/maa-cli/src/installer/maa_core.rs)。

服务及第三方内容声明见 [NOTICE.md](../NOTICE.md)。核查日期：2026-10-31。
