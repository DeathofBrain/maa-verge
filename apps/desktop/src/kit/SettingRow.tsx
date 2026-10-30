import type { ReactNode } from 'react';
import { cx } from './cx';

type Props = {
  title: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  padding?: 'md' | 'compact' | 'card' | 'flush';
  className?: string;
};

export default function SettingRow({
  title,
  description,
  control,
  padding = 'md',
  className,
}: Props) {
  return (
    <div
      className={cx('mv-setting-row', padding !== 'md' && `mv-setting-row--${padding}`, className)}
    >
      <div className="mv-setting-row-copy">
        <strong className="mv-setting-row-title">{title}</strong>
        {description && <p className="mv-setting-row-description">{description}</p>}
      </div>
      <div className="mv-setting-row-control">{control}</div>
    </div>
  );
}
