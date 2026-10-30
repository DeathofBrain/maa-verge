import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';

type Props = Omit<ComponentPropsWithRef<'input'>, 'type'>;

export default function RangeField({ className, ...rest }: Props) {
  return <input {...rest} type="range" className={cx('mv-range', className)} />;
}
