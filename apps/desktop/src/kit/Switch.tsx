import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'type' | 'role' | 'aria-checked'
> & {
  checked: boolean;
  onChange: (value: boolean) => void;
  size?: 'md' | 'lg';
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
