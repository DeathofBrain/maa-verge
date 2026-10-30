import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from './cx';

type Props = Omit<ComponentPropsWithRef<'input'>, 'type'> & {
  label: ReactNode;
  description?: ReactNode;
};

export default function CheckField({ label, description, className, ...rest }: Props) {
  return (
    <label className={cx('mv-check-field', className)}>
      <input {...rest} type="checkbox" className="mv-checkbox" />
      <span className="mv-check-field-copy">
        <span className="mv-check-field-label">{label}</span>
        {description && <span className="mv-check-field-description">{description}</span>}
      </span>
    </label>
  );
}
