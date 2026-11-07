// 以 alert 语义播报调用方提供的错误，具体恢复操作由所在页面负责。
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
