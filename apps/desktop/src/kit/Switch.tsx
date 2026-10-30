import { cx } from './cx';

type Props = {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  size?: 'md' | 'lg';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
};

export default function Switch({
  checked,
  onChange,
  disabled,
  size = 'md',
  className,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('mv-switch', size !== 'md' && `mv-switch--${size}`, className)}
    >
      <i className="mv-switch-knob" />
    </button>
  );
}
