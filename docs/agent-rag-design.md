# JSON/KV RAG 与知识图谱设计

本轮交付设计，暂不增加模型知识工具、向量库、图数据库或 embedding 调用。现有资源索引、产品知识 JSON 和账号识别快照继续由现有知识模块提供；所有未来查询复用同一应用服务、Store 与数据根租约。

## 记录与索引

JSON 为事实来源，KV 仅保存可重建索引。公共实体使用稳定 ID，例如 `ark:operator:char_002_amiya`、`ark:item:30012`、`ark:stage:main_01-07`；不得以中文展示名作为主键。实体类型及来源沿用现有五类公开资源和产品能力记录，不为缺失数据编造关系。

```json
{
  "id": "ark:stage:main_01-07",
  "kind": "stage",
  "name": "1-7",
  "aliases": ["暴君"],
  "facts": {},
  "relations": [],
  "source": {
    "id": "public-resource-id",
    "version": "immutable-generation-id",
    "sha256": "source-content-sha256",
    "collectedAt": "2026-11-01T00:00:00Z",
    "pointer": "/stages/main_01-07"
  },
  "unknownFields": ["currentAccountInventory"]
}
```

此处是结构示例，不代表该关卡别名或具体资源已核验。正式导入使用来源中的真实 ID、名称和版本。

| KV key（概念）                     | value                                      |
| ---------------------------------- | ------------------------------------------ |
| `entity/<kind>/<id>`               | JSON 记录引用、版本、哈希                  |
| `alias/<client>/<normalized-text>` | 有界实体 ID 列表，保留歧义                 |
| `term/<client>/<token>`            | 排序后的实体 ID 列表和字段命中信息         |
| `edge/<relation>/<from-id>`        | JSON 邻接数组 `{toId, sourceId, pointer}`  |
| `generation/<source-id>`           | 构建状态、索引格式版本、来源哈希及活动代号 |

索引不接收模型提供的任意 namespace、SQL 或文件路径。宿主把类型化 `query/entityId/relation/limit` 翻译为固定键，限制结果数量和字符数。名称规范化处理空白、全半角和登记别名；客户端、语言和原始名称不被覆盖。分词可先使用 Unicode 单词／中文二元词与精确子串，不增加模型成本。

## 查询组合

1. 先精确 ID，再精确别名；多义名称返回候选，必要时通过 `ask_user` 澄清。
2. 使用关键词索引交集／并集，按精确名、别名、字段命中、来源版本和完整程度确定性排序。
3. 仅沿允许的关系扩展，例如关卡→掉落物、干员→培养材料、材料→合成配方。默认深度 1，最多深度 2、50 个实体、100 条边；访问集合去重，循环不能扩大预算。
4. 拼装有限上下文包，逐条给出实体 ID、事实字段、来源版本、采集时间、JSON pointer 和未知项。工具结果只说明检索证据，模型回答需要引用记录 ID。

接口候选：`knowledge.lookup({ids,clientType})`、`knowledge.search({query,kinds,clientType,limit})`、`knowledge.related({entityId,relations,depth,limit})`。正式实施时才写入权威 Schema；本设计不向现有 RPC 添加无实现的入口。图查询不执行任意用户表达式或无限路径。

## 账号私有覆盖层

公共 JSON 描述稳定资料；账号库存、干员持有／练度和近期运行结果来自带范围的本机快照。范围沿用设备＋客户端＋配置账号标签哈希，配置标签不是已验证 UID。账号叠加在宿主查询阶段进行，模型不能请求其他账号 namespace。

每次结果携带 `snapshotId/collectedAt/coverage/unknownFields`。未扫描的条目不是零、未拥有或不存在；旧快照不是实时库存。切号后重新绑定范围，不将账号事实写入永久公共实体、不从 Agent memory 恢复库存或执行许可。公开资源更新与私有快照独立版本化。

## 更新、失败与删除

按来源哈希构建不可变索引代际，在同一 Store 事务内切换活动代号；构建失败保留旧代际并报告陈旧状态。增量更新只重建受影响的记录、倒排项和邻接关系；删除来源时删除其索引引用，不能留下无来源的孤立“事实”。查询时来源与索引哈希不一致则降级到有界 JSON 精确查询或返回不可用，不混用两个版本。

JSON 与 KV 已足以支撑首版可追溯检索。只有在真实查询评估显示词法召回明显不足后，再考虑可选 embedding；同样保留原记录、范围、版本与来源，不能用向量相似度替代权限或事实校验。

## 后续验收

冻结一组真实资源查询：精确 ID、中文别名、同名歧义、配方循环、跨客户端差异、版本切换和缺失来源。验证确定性排序、有界扩展、可追溯来源、过期／未知标记，以及账号切换后的缓存和上下文隔离。以人工标注答案评估召回和引用正确率；合成执行验证重建失败和恢复，不调用付费 embedding 或接触真实账号。
