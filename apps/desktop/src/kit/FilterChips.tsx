import type { ReactNode } from 'react';
import { cx } from './cx';

export type FilterChip = {
  id: string;
  label: ReactNode;
  ariaLabel?: string;
  count?: number;
};

type Props = {
  items: FilterChip[];
  value: string;
  onChange: (id: string) => void;
  variant?: 'pill' | 'subtle';
  'aria-label': string;
  className?: string;
};

export default function FilterChips({
  items,
  value,
  onChange,
  variant = 'pill',
  className,
  ...rest
}: Props) {
  return (
    <div
      {...rest}
      role="group"
      aria-label={rest['aria-label']}
      className={cx('mv-chips', variant === 'subtle' && 'mv-chips--subtle', className)}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.ariaLabel}
            aria-pressed={selected}
            data-selected={selected || undefined}
            className={cx('mv-chip', variant === 'subtle' && 'mv-chip--subtle')}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cx('mv-chip-count', variant === 'subtle' && 'mv-chip-count--subtle')}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
