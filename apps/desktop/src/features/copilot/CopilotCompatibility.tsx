import { Info } from 'lucide-react';
import type { CopilotRecord } from '@maaverge/contracts';

// 展示格式与资源兼容性检查结果，不将“可执行”当成实战通关保证。
export default function Compatibility({ record }: { record: CopilotRecord }) {
  return (
    <div
      className={`cp-compatibility ${record.compatibility.status === 'unsupported' ? 'is-error' : ''}`}
    >
      <Info size={14} />
      <span>
        {record.compatibility.status === 'ready'
          ? '作业格式与当前资源已检查'
          : record.compatibility.status === 'unsupported'
            ? '当前不可执行'
            : '仍需核对核心与资源'}
        {record.compatibility.reasons.length > 0 && `：${record.compatibility.reasons.join('；')}`}
      </span>
    </div>
  );
}
