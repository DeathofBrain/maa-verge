import type { ReactNode } from 'react';
import { cx } from './cx';

type Props = {
  title?: ReactNode;
  icon?: ReactNode;
  eyebrow?: ReactNode;
  text?: string;
  actions?: ReactNode;
  actionsClassName?: string;
  padding?: 'none' | 'page';
  className?: string;
};

export default function PageHeading({
  title,
  icon,
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
        {title != null && (
          <h1
            className={cx(
              'mv-page-heading-title',
              icon != null && 'mv-page-heading-title--with-icon',
            )}
          >
            {icon != null ? (
              <>
                <span className="mv-page-heading-icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="mv-page-heading-label">{title}</span>
              </>
            ) : (
              title
            )}
          </h1>
        )}
        {text && <p className="mv-page-heading-text">{text}</p>}
      </div>
      {actions && <div className={cx('mv-page-heading-actions', actionsClassName)}>{actions}</div>}
    </header>
  );
}
