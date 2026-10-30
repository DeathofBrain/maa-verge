import { useId, type ReactNode } from 'react';
import { cx } from './cx';

type Props = {
  label: ReactNode;
  help?: ReactNode;
  error?: string;
  layout?: 'wrap' | 'side';
  id?: string;
  className?: string;
  children: ReactNode | ((id: string) => ReactNode);
};

export default function Field({
  label,
  help,
  error,
  layout = 'wrap',
  id,
  className,
  children,
}: Props) {
  const generated = useId();
  const fieldId = id ?? generated;
  const helpId = `${fieldId}-help`;
  return (
    <div className={cx('mv-field', layout === 'side' && 'mv-field--side', className)}>
      <label className="mv-field-label" htmlFor={fieldId}>
        {label}
      </label>
      <div className="mv-field-control">
        {typeof children === 'function' ? children(fieldId) : children}
        {help && (
          <p className="mv-field-help" id={helpId}>
            {help}
          </p>
        )}
        {error && (
          <p className="mv-field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
