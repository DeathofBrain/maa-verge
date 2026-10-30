import type { InputHTMLAttributes } from 'react';
import { cx } from './cx';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export default function Checkbox({ className, ...rest }: Props) {
  return <input {...rest} type="checkbox" className={cx('mv-checkbox', className)} />;
}
