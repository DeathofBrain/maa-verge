# Third-party notices

Maa Verge is an independent community project and is not an official product of the MAA Team or Hypergryph. Its original source is distributed under AGPL-3.0-only.

MaaCore binaries and game resources retain their respective upstream notices, whether included in an installer or downloaded separately. The previous Python reference backend and vendored updater bindings have been removed from the current source tree.

The Maa Verge mark and geometric icon in this repository were created for this project. The upstream MAA logo is not used.

No game account data or model credentials are distributed with this repository.

## Mirror酱分发服务

[Mirror酱（MirrorChyan）](https://mirrorchyan.com?source=maa_verge_notice) 是由其团队独立运营的第三方分发服务。**Mirror酱在用户端的高速下载分发为付费服务，需要购买适用项目的有效 CDK**；价格、有效期、限额及售后以其官网说明为准。Maa Verge 本身仍为免费开源软件，使用官方免费来源无需购买 CDK。

Maa Verge 的分发对应 `maa-verge`，核心使用上游 `MAA` 分发中的 MaaCore，独立资源对应 `MaaResource`。分发服务不改变应用、核心、依赖或游戏资源各自的许可证及权利归属，也不代表游戏官方授权或背书。Mirror酱名称与标识归其相应权利人；本项目不将其作为自身品牌或声称提供该服务的售后保障。

本集成根据[官方 API 文档](https://github.com/MirrorChyan/docs)复用现有 HTTP 下载器，没有随应用打包第三方运行时 SDK。仓库内 `.skill/mirrorchyan-integration/SKILL.md` 来自 MirrorChyan/docs，保留原文与[固定来源记录](.skill/mirrorchyan-integration/UPSTREAM.md)，仅供项目开发。配置、联网、费用与平台限制见 [Mirror酱说明](docs/mirrorchyan.md)。

## PRTS Plus 社区服务与内容归属

作业中心通过 HTTP 接口访问 [PRTS Plus](https://prts.plus/)（API：`https://prts.maa.plus`），保留社区来源、原站链接、上传者及作业内的原始署名、说明和视频链接。PRTS Plus 由其社区运营；Maa Verge 是独立客户端，不代表该站及作业作者。

作业 JSON、说明、攻略及参考视频的权利归各自作者或权利人所有。上传者不必然是原作者。未核实全站统一的内容许可，不能将这些内容自动视为 Maa Verge 的 AGPL-3.0-only 许可内容；转载、修改或再分发须遵循具体作者的声明及适用授权。原始 JSON 导出另附来源与署名说明文件，不表示已取得转载授权。

本集成使用自行实现的 HTTP 适配器，未随应用分发 PRTS Plus 前端、后端或 TypeScript SDK 代码。核查时，[后端](https://github.com/ZOOT-Plus/ZootPlusBackend/blob/746b3948babc61db82654247711fa99c86c5426b/LICENSE)采用 AGPL v3，[SDK README](https://github.com/ZOOT-Plus/zoot-plus-client-ts/blob/56769efaafa431cb3aaeb7c4edef20f17766dc82/README.md#license)声明 AGPL v3；[前端仓库](https://github.com/ZOOT-Plus/zoot-plus-frontend/tree/840e7d98cf2efd59ec34dae007d407491e0541e1)未找到明确许可授予，不能据此推定允许复用其代码或素材。代码许可、在线服务使用与用户内容授权分别适用，公开 API 不等于无限量使用或任意再分发授权。

核查日期：2026-10-24。详细范围及来源见 [作业来源与版权说明](docs/copilot-attribution.md)。
