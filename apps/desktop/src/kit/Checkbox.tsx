// 保留原生复选框语义与 ref，供调用方设置部分选中等 DOM 状态。
import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';

type Props = Omit<ComponentPropsWithRef<'input'>, 'type'>;

export default function Checkbox({ className, ...rest }: Props) {
  return <input {...rest} type="checkbox" className={cx('mv-checkbox', className)} />;
}
