import type { ReactNode } from 'react';
import { cx } from './cx';

type Props = {
  tone?: 'info' | 'warning' | 'danger';
  className?: string;
  children: ReactNode;
};

export default function Notice({ tone = 'info', className, children }: Props) {
  return (
    <div className={cx('mv-notice', className)} data-tone={tone}>
      {children}
    </div>
  );
}
