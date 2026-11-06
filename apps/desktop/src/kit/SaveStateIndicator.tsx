// 呈现自动保存阶段，只有错误状态且提供重试动作时才显示重试入口。
import { autoSaveLabel, type SaveStatus } from '@/shared/lib/save-status';
import { cx } from './cx';

type Props = {
  status: SaveStatus;
  onRetry?: () => void;
  retryDisabled?: boolean;
  className?: string;
};

export default function SaveStateIndicator({ status, onRetry, retryDisabled, className }: Props) {
  return (
    <span className={cx('mv-save-state', className)} role="status" data-state={status}>
      <span className="mv-save-state-label">{autoSaveLabel(status)}</span>
      {status === 'error' && onRetry && (
        <button
          type="button"
          className="mv-save-state-retry"
          disabled={retryDisabled}
          onClick={onRetry}
        >
          重试
        </button>
      )}
    </span>
  );
}
