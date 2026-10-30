import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  as?: 'article' | 'li' | 'div';
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export default function ListRow({
  as = 'article',
  leading,
  title,
  subtitle,
  meta,
  actions,
  className,
  ...rest
}: Props) {
  const Tag: ElementType = as;
  return (
    <Tag {...rest} className={cx('mv-list-row', className)}>
      {leading && <span className="mv-list-row-leading">{leading}</span>}
      <span className="mv-list-row-copy">
        <strong className="mv-list-row-title">{title}</strong>
        {subtitle && <small className="mv-list-row-subtitle">{subtitle}</small>}
      </span>
      {meta && <span className="mv-list-row-meta">{meta}</span>}
      {actions && <span className="mv-list-row-actions">{actions}</span>}
    </Tag>
  );
}
