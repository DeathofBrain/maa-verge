import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';

type Props = Omit<ComponentPropsWithRef<'input'>, 'type'>;

export default function Checkbox({ className, ...rest }: Props) {
  return <input {...rest} type="checkbox" className={cx('mv-checkbox', className)} />;
}
