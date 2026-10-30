import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-label'> & {
  label: string;
  size?: 'md' | 'sm';
};

export default function IconButton({ label, size = 'md', className, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      type="button"
      aria-label={label}
      className={cx('mv-icon-button', size !== 'md' && `mv-icon-button--${size}`, className)}
    >
      {children}
    </button>
  );
}
