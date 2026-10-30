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
  onPick,
  className,
}: Props) {
  return (
    <div className={cx('mv-directory', className)}>
      <TextField
        id={id}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        readOnly
        disabled={disabled || selecting}
      />
      <Button disabled={disabled || selecting} onClick={onPick}>
        {label}
      </Button>
    </div>
  );
}
