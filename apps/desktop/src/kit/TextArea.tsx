// 保留原生多行输入属性，字段式与嵌入式外观通过 variant 区分。
import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';
import { textInputBehavior } from './text-input-behavior';

type Props = ComponentPropsWithRef<'textarea'> & {
  invalid?: boolean;
  variant?: 'field' | 'embedded';
};

export default function TextArea({
  invalid = false,
  variant = 'field',
  className,
  ...rest
}: Props) {
  return (
    <textarea
      {...rest}
      {...textInputBehavior}
      data-invalid={invalid || undefined}
      className={cx('mv-textarea', variant === 'embedded' && 'mv-textarea--embedded', className)}
    />
  );
}
