# 作业来源与版权说明

更新日期：2026-10-24。适用于开发中的独立作业中心；不改变 Maa Verge 自有代码的 AGPL-3.0-only 许可。

## 社区服务与联网

社区搜索、编号/链接解析和导入由本地应用服务请求 [PRTS Plus](https://prts.plus/) 的 `https://prts.maa.plus` 接口。关键词、关卡筛选和作业/作业集编号会发送给该服务；浏览本地已导入作业不需要请求社区。此功能不接入社区账号、收藏或发布，不自动上传本地作业、游戏账号或设备截图。Maa Verge 是独立社区客户端，不代表 PRTS Plus 或作业作者。

## 署名与导出

- 社区 API 的 `uploader` 是上传者，不能据此认定其为攻略、JSON 或视频原作者。界面分别标注上传者与内容内实际提供的署名；未提供时显示未标注，原说明中可能还有不同作者的署名。
- 作业、说明、攻略和参考视频的权利归各自作者或权利人所有。本轮未核实全站统一的内容许可，不能将下载内容自动套用 Maa Verge 或服务端的 AGPL 许可。转载、修改及再分发应核对并遵循具体作者的声明与授权。
- 导入及导出保留原始 JSON 字节，不向动作内容植入应用许可。原始 JSON 之外另附 `.attribution.json`，记录版本 SHA-256、来源、原站地址、编号、上传者与内容署名；保留原 JSON、说明和参考视频中的版权及许可声明。该说明文件记录来源，不表示已取得转载授权，也不代替原作者的声明。
- 原站链接和视频仅作为来源、参考入口。重新导入不覆盖已选队列或运行使用的不可变版本。

## 许可核查依据

| 对象 | 2026-10-24 核查结果 | 固定来源 |
| --- | --- | --- |
| PRTS Plus 后端 | GNU AGPL v3 | [LICENSE](https://github.com/ZOOT-Plus/ZootPlusBackend/blob/746b3948babc61db82654247711fa99c86c5426b/LICENSE) |
| TypeScript SDK | README 声明 GNU AGPL v3 | [README License](https://github.com/ZOOT-Plus/zoot-plus-client-ts/blob/56769efaafa431cb3aaeb7c4edef20f17766dc82/README.md#license) |
| 前端代码及素材 | 已检查 main/dev 的仓库许可入口、README 与 package.json，未找到明确许可授予，不能推定允许复制复用 | [前端固定提交](https://github.com/ZOOT-Plus/zoot-plus-frontend/tree/840e7d98cf2efd59ec34dae007d407491e0541e1) |
| 用户上传内容 | 未发现可统一套用的内容许可，按各作者具体声明核实 | [详情响应模型](https://github.com/ZOOT-Plus/ZootPlusBackend/blob/746b3948babc61db82654247711fa99c86c5426b/src/main/kotlin/plus/maa/backend/controller/response/copilot/CopilotInfo.kt) |

本集成自行实现 HTTP 适配器，没有分发上述前端、后端或 SDK 源码。访问 AGPL 服务端的 API 本身不等于分发或修改该程序；代码许可、在线服务使用条款与内容作者授权需要分别判断。未找到统一 API 限额或使用条款，不据此宣称无限量调用、商业使用或镜像转载已获授权。

核查覆盖公开仓库固定提交、官网首页公告、关于、登录/注册及发布表单，未登录、发布或提交资料。未发现声明只描述该次核查范围，不证明不存在其他条款。新增复制上游代码、素材、托管服务、批量镜像或二次分发功能前，应按届时的具体来源和条款重新核对。

根目录 [NOTICE.md](../NOTICE.md) 及本文随应用打包到 `runtime/licenses/NOTICE.md` 和 `runtime/licenses/docs/copilot-attribution.md`；原始作业的来源与权利说明随导出文件保留。
