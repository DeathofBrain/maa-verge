# 作业社区评价

作业中心详情可读取社区作业的真实点赞、点踩及当前评价，并手动点赞、点踩或取消评价。未导入的有效社区预览也可以评价；本地 JSON 和旧任务复制不推定社区身份。请求只提交到固定 PRTS Plus 服务，React 使用 `copilot.rating.get` / `copilot.rating.set`，由服务端根据已校验版本与作业条目定位社区编号。

## 身份及数据

当前 PRTS Plus 支持匿名评价，按服务端所见网络地址识别；本功能不登录账号、不伪造用户或客户端身份，也不承诺匿名评价跨网络同步。查询返回真实 `like`、`dislike`、`rating_type`，写入使用 `Like`、`Dislike`、`None`；写后重新查询真实计数。查询失败不补造比例或票数，写请求失败不自动重试。

同一原始 JSON 可以对应多个社区上传编号。手动评价传 `versionId` 与 `recordId`，服务端检查已存作业或一小时内的有界预览；客户端无法指定任意社区编号。未提供条目标识时，只有唯一已核实社区来源才可评价。已删除或预览过期的条目须重新打开或预览。

## 通关后自动点赞

`CopilotOptions.autoLikeOnSuccess` 为每类作业工作区的独立选项，默认关闭，旧配置缺省按关闭读取。启用后，只在本次执行启动快照绑定了唯一社区来源，且执行正常结束、该条目 `status=completed` 与 `verdict=success` 同时成立时才尝试点赞。运行中修改配置只影响下次启动。

文件加载、任务完成、结果未知、失败、停止、断线、保全或未确认整个循环均不足以触发；本地作业及多个社区来源有歧义的相同内容跳过。队列编辑、库条目删除或后来预览其他社区编号，不改变本次执行冻结的来源。

自动流程只点赞，永不点踩或取消评价。已有在线评价（包括点踩）以及本机记录的手动点踩均使自动流程跳过；手动点踩即使联网失败也保留本机偏好。并发手动请求按提交顺序记录意图，早先完成的点赞不能覆盖后来请求但联网失败的点踩。每个社区编号在联网前持久登记一次自动尝试，重复回调、重复条目和重启不重放；失败仅记录反馈事件，不改变通关结果，可在详情中手动重试。

同一编号的查询及评价串行。服务开始退出时立即关闭社区入口并取消所有活动 HTTP 请求；尚未开始的排队评价取消，关闭后不再发起 POST。反馈清理最多等待一秒。已提交但未确认结果的自动评价保留 `unknown` 或原有 `pending` 记录，重启后不自动重放；取消不会改动已确认的通关结果。

## 接口依据与验证范围

2026-10-24 只读核查公开源码与线上查询，未发送任何真实评价：

- [后端评价路由与响应](https://github.com/ZOOT-Plus/ZootPlusBackend/blob/746b3948babc61db82654247711fa99c86c5426b/src/main/kotlin/plus/maa/backend/controller/CopilotController.kt#L89-L95)
- [匿名网络地址身份](https://github.com/ZOOT-Plus/ZootPlusBackend/blob/746b3948babc61db82654247711fa99c86c5426b/src/main/kotlin/plus/maa/backend/config/security/AuthenticationHelper.kt#L61-L72)
- [评分字段和默认值](https://github.com/ZOOT-Plus/ZootPlusBackend/blob/746b3948babc61db82654247711fa99c86c5426b/src/main/kotlin/plus/maa/backend/controller/response/copilot/CopilotInfo.kt#L25-L32)
- [前端评价枚举映射](https://github.com/ZOOT-Plus/zoot-plus-frontend/blob/840e7d98cf2efd59ec34dae007d407491e0541e1/src/apis/operation.ts#L206-L219)

运行时与契约使用合成 HTTP、合成 Worker 和隔离临时数据验证，未连接真实游戏或提交真实赞踩。匿名跨网络行为及真实评价效果不在此次合成验证范围。
