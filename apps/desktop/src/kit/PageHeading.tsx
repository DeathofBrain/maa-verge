import type { ReactNode } from 'react';
import { cx } from './cx';

type Props = {
  title: string;
  text?: string;
  actions?: ReactNode;
  actionsClassName?: string;
  className?: string;
};

export default function PageHeading({ title, text, actions, actionsClassName, className }: Props) {
  return (
    <header className={cx('mv-page-heading', className)}>
      <div className="mv-page-heading-copy">
        <h1 className="mv-page-heading-title">{title}</h1>
        {text && <p className="mv-page-heading-text">{text}</p>}
      </div>
      {actions && <div className={cx('mv-page-heading-actions', actionsClassName)}>{actions}</div>}
    </header>
  );
}
