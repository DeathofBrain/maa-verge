// 用明确的语气和尺寸属性表达提示级别，提示内容由调用方提供。
import type { ReactNode } from 'react';
import { cx } from './cx';

type Props = {
  tone?: 'info' | 'warning' | 'danger' | 'neutral';
  variant?: 'default' | 'banner';
  size?: 'md' | 'sm';
  className?: string;
  children: ReactNode;
};

export default function Notice({
  tone = 'info',
  variant = 'default',
  size = 'md',
  className,
  children,
}: Props) {
  return (
    <div
      className={cx(
        'mv-notice',
        size !== 'md' && `mv-notice--${size}`,
        variant === 'banner' && 'mv-notice--banner',
        className,
      )}
      data-tone={tone}
    >
      {children}
    </div>
  );
}
