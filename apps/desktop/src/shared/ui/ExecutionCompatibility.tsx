import { useEffect, useState } from 'react';
import { errorMessage, rpc, type RpcParams } from '@maaverge/contracts';
import Notice from '@/kit/Notice';
import { executionIssueMessage, type ExecutionPreflight } from '@/shared/lib/execution-preflight';

type Props = {
  params?: RpcParams<'execution.preflight'>;
  label?: string;
};

// 编辑与保存始终可用；兼容提示仅说明当前配置的执行边界，不建立设备会话。
export default function ExecutionCompatibility({ params, label = '执行兼容检查' }: Props) {
  const identity = params ? JSON.stringify(params) : '';
  const [checked, setChecked] = useState<{
    identity: string;
    result?: ExecutionPreflight;
    error?: string;
  }>();
  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    // 短暂合并连续表单输入，并丢弃已切换任务或设备的过期结果。
    const timer = window.setTimeout(() => {
      void rpc(
        'execution.preflight',
        JSON.parse(identity) as RpcParams<'execution.preflight'>,
      ).then(
        (result) => {
          if (!cancelled) setChecked({ identity, result });
        },
        (cause) => {
          if (!cancelled) setChecked({ identity, error: errorMessage(cause) });
        },
      );
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [identity]);
  if (!identity || checked?.identity !== identity) return null;
  if (checked.error)
    return (
      <Notice tone="warning" size="sm">
        <div role="status" aria-label={label}>
          暂无法完成执行检查：{checked.error}。配置仍可编辑和保存，开始执行前会重新检查。
        </div>
      </Notice>
    );
  if (!checked.result || checked.result.supported) return null;
  return (
    <Notice tone="warning" size="sm">
      <div role="status" aria-label={label}>
        <p>此配置当前无法执行，可继续编辑和保存。</p>
        <ul>
          {checked.result.issues.map((issue, index) => (
            <li key={`${index}-${issue.field}`}>{executionIssueMessage(issue)}</li>
          ))}
        </ul>
      </div>
    </Notice>
  );
}
