import { AlertCircle, Check, X } from 'lucide-react';
import IconButton from './IconButton';
import { cx } from './cx';

type Props = {
  text: string;
  error?: boolean;
  onDismiss: () => void;
  dismissLabel?: string;
};

export default function Toast({
  text,
  error = false,
  onDismiss,
  dismissLabel = '关闭提示',
}: Props) {
  return (
    <div
      role={error ? 'alert' : 'status'}
      data-tone={error ? 'danger' : 'success'}
      className={cx('toast', 'mv-toast', error && 'error')}
    >
      <span className="mv-toast-icon" aria-hidden="true">
        {error ? <AlertCircle size={17} /> : <Check size={17} />}
      </span>
      <span className="mv-toast-text">{text}</span>
      <IconButton label={dismissLabel} size="sm" onClick={onDismiss}>
        <X size={15} />
      </IconButton>
    </div>
  );
}
