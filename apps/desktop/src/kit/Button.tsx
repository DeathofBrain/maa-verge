import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import Spinner from './Spinner';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'text';
  size?: 'md' | 'sm';
  busy?: boolean;
  icon?: ReactNode;
  type?: 'button' | 'submit';
};

export default function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  icon,
  type = 'button',
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      type={type}
      data-busy={busy || undefined}
      className={cx(
        'mv-button',
        `mv-button--${variant}`,
        size !== 'md' && `mv-button--${size}`,
        className,
      )}
    >
      {busy ? <Spinner /> : icon && <span className="mv-button-icon">{icon}</span>}
      {children}
    </button>
  );
}
