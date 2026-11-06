// 图标按钮必须显式提供可访问名称，默认不触发表单提交。
import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';

type Props = Omit<ComponentPropsWithRef<'button'>, 'type' | 'aria-label'> & {
  label: string;
  size?: 'md' | 'sm';
};

export default function IconButton({ label, size = 'md', className, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      type="button"
      aria-label={label}
      className={cx('mv-icon-button', size !== 'md' && `mv-icon-button--${size}`, className)}
    >
      {children}
    </button>
  );
}
