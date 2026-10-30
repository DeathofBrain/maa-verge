import type { ReactNode } from 'react';
import { cx } from './cx';

export type StatusTone =
  'neutral' | 'info' | 'running' | 'success' | 'danger' | 'warning' | 'offline';

type Props = {
  tone?: StatusTone;
  dot?: boolean;
  label: ReactNode;
  className?: string;
};

export default function StatusPill({ tone = 'neutral', dot = false, label, className }: Props) {
  return (
    <span className={cx('mv-pill', className)} data-tone={tone}>
      {dot && <i className="mv-pill-dot" aria-hidden="true" />}
      <span className="mv-pill-label">{label}</span>
    </span>
  );
}
