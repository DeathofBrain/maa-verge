import type { ReactNode } from 'react';
import { cx } from './cx';

type Props = {
  icon?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  variant?: 'default' | 'list' | 'panel';
  className?: string;
};

export default function EmptyState({
  icon,
  title,
  text,
  action,
  variant = 'default',
  className,
}: Props) {
  return (
    <div className={cx('mv-empty', variant !== 'default' && `mv-empty--${variant}`, className)}>
      {icon && <span className="mv-empty-icon">{icon}</span>}
      <h3 className="mv-empty-title">{title}</h3>
      {text && <p className="mv-empty-text">{text}</p>}
      {action && <div className="mv-empty-action">{action}</div>}
    </div>
  );
}
