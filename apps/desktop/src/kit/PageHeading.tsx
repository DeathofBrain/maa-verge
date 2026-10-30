import type { ReactNode } from 'react';
import { cx } from './cx';

type Props = {
  title?: ReactNode;
  eyebrow?: ReactNode;
  text?: string;
  actions?: ReactNode;
  actionsClassName?: string;
  padding?: 'none' | 'page';
  className?: string;
};

export default function PageHeading({
  title,
  eyebrow,
  text,
  actions,
  actionsClassName,
  padding = 'none',
  className,
}: Props) {
  return (
    <header
      className={cx('mv-page-heading', padding === 'page' && 'mv-page-heading--page', className)}
    >
      <div className="mv-page-heading-copy">
        {eyebrow}
        {title != null && <h1 className="mv-page-heading-title">{title}</h1>}
        {text && <p className="mv-page-heading-text">{text}</p>}
      </div>
      {actions && <div className={cx('mv-page-heading-actions', actionsClassName)}>{actions}</div>}
    </header>
  );
}
