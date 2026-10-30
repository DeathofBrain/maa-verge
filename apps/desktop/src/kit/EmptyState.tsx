import type { ReactNode } from 'react';
import { cx } from './cx';

type Props = {
  icon?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export default function EmptyState({ icon, title, text, action, className }: Props) {
  return (
    <div className={cx('mv-empty', className)}>
      {icon && <span className="mv-empty-icon">{icon}</span>}
      <h3 className="mv-empty-title">{title}</h3>
      {text && <p className="mv-empty-text">{text}</p>}
      {action && <div className="mv-empty-action">{action}</div>}
    </div>
  );
}
