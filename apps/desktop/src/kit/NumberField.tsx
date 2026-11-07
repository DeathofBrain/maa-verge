// 保留原生数字输入约束；invalid 仅用于展示，不替代业务数值校验。
import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';

type Props = Omit<ComponentPropsWithRef<'input'>, 'type'> & { invalid?: boolean };

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
