import { cx } from './cx';
import Button from './Button';
import TextField from './TextField';

type Props = {
  label: string;
  value: string;
  ariaLabel: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  selecting?: boolean;
  surface?: 'default' | 'subtle';
  layout?: 'inline' | 'responsive';
  onPick: () => void;
  className?: string;
};

export default function DirectoryPicker({
  label,
  value,
  ariaLabel,
  placeholder,
  id,
  disabled,
  selecting,
  surface = 'default',
  layout = 'inline',
  onPick,
  className,
}: Props) {
  return (
    <div
      className={cx(
        'mv-directory',
        layout === 'responsive' && 'mv-directory--responsive',
        className,
      )}
    >
      <TextField
        className={cx('mv-directory-input', surface === 'subtle' && 'mv-directory-input--subtle')}
        id={id}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        readOnly
        disabled={disabled || selecting}
      />
      <Button className="mv-directory-action" disabled={disabled || selecting} onClick={onPick}>
        {label}
      </Button>
    </div>
  );
}
