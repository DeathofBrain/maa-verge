import type { InputHTMLAttributes } from 'react';
import { cx } from './cx';

type Props = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export default function TextField({ invalid = false, className, type = 'text', ...rest }: Props) {
  return (
    <input
      {...rest}
      type={type}
      data-invalid={invalid || undefined}
      className={cx('mv-input', className)}
    />
  );
}
