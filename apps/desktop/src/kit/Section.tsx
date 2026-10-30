import type { ElementType, ReactNode } from 'react';
import { cx } from './cx';

type Props = {
  title?: ReactNode;
  description?: ReactNode;
  as?: 'section' | 'div';
  variant?: 'plain' | 'card';
  className?: string;
  children?: ReactNode;
};

export default function Section({
  title,
  description,
  as = 'section',
  variant = 'plain',
  className,
  children,
}: Props) {
  const Tag: ElementType = as;
  return (
    <Tag className={cx('mv-section', variant === 'card' && 'mv-section--card', className)}>
      {(title || description) && (
        <div className="mv-section-heading">
          {title && <h2 className="mv-section-title">{title}</h2>}
          {description && <p className="mv-section-description">{description}</p>}
        </div>
      )}
      {children}
    </Tag>
  );
}
