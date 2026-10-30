import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';

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
      data-invalid={invalid || undefined}
      className={cx('mv-textarea', variant === 'embedded' && 'mv-textarea--embedded', className)}
    />
  );
}
