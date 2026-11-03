import { rpc, taskLabels, type RpcParams, type RpcResult } from '@maaverge/contracts';

// 执行入口只消费服务端兼容结果，避免前端另建任务能力或参数白名单。
export type ExecutionPreflight = RpcResult<'execution.preflight'>;

export function executionIssueMessage(issue: ExecutionPreflight['issues'][number]): string {
  const task = taskLabels[issue.taskType] || issue.taskType;
  const position = issue.taskIndex >= 0 ? `第 ${issue.taskIndex + 1} 项` : '执行准备';
  return `${position}${task ? ` ${task}` : ''}${issue.field ? ` · ${issue.field}` : ''}：${issue.message}`;
}

export async function assertExecutionSupported(params: RpcParams<'execution.preflight'>) {
  // 预检必须先于自动连接和执行请求，失败时不产生设备操作。
  const result = await rpc('execution.preflight', params);
  if (!result.supported)
    throw new Error(result.issues.map(executionIssueMessage).join('；') || '当前配置暂不支持执行');
  return result;
}
