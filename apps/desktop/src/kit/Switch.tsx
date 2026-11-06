// 受控开关先交给调用方处理点击，未阻止默认行为时再提出取反后的值。
import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';

type Props = Omit<
  ComponentPropsWithRef<'button'>,
  'onChange' | 'type' | 'role' | 'aria-checked'
> & {
  checked: boolean;
  onChange: (value: boolean) => void;
  size?: 'md' | 'lg';
};

export default function Switch({
  checked,
  onChange,
  onClick,
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
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onChange(!checked);
      }}
      className={cx('mv-switch', size !== 'md' && `mv-switch--${size}`, className)}
    >
      <i className="mv-switch-knob" />
    </button>
  );
}
