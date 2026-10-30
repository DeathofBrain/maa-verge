import type { TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export default function TextArea({ invalid = false, className, ...rest }: Props) {
  return (
    <textarea
      {...rest}
      data-invalid={invalid || undefined}
      className={cx('mv-textarea', className)}
    />
  );
}
