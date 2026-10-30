import type { ReactNode } from 'react';
import { cx } from './cx';

type Props = {
  children: ReactNode;
  className?: string;
};

export default function ErrorBanner({ children, className }: Props) {
  return (
    <p className={cx('mv-error-banner', className)} role="alert">
      {children}
    </p>
  );
}
