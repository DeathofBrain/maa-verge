import type { ReactNode } from 'react';
import { cx } from './cx';

type Props = {
  as?: 'p' | 'div';
  children: ReactNode;
  className?: string;
};

export default function ErrorBanner({ as: Tag = 'p', children, className }: Props) {
  return (
    <Tag className={cx('mv-error-banner', className)} role="alert">
      {children}
    </Tag>
  );
}
