import type { InputHTMLAttributes } from 'react';
import { cx } from './cx';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { invalid?: boolean };

export default function NumberField({ invalid = false, className, ...rest }: Props) {
  return (
    <input
      {...rest}
      type="number"
      data-invalid={invalid || undefined}
      className={cx('mv-input', className)}
    />
  );
}
