// 统一单行输入外观；错误标记只负责展示，校验与保存仍由业务层决定。
import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';
import { textInputBehavior } from './text-input-behavior';

type Props = ComponentPropsWithRef<'input'> & { invalid?: boolean };

export default function TextField({ invalid = false, className, type = 'text', ...rest }: Props) {
  return (
    <input
      {...rest}
      {...textInputBehavior}
      type={type}
      data-invalid={invalid || undefined}
      className={cx('mv-input', className)}
    />
  );
}
