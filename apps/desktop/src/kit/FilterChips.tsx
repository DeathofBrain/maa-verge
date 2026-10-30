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
  'aria-label': string;
  className?: string;
};

export default function FilterChips({ items, value, onChange, className, ...rest }: Props) {
  return (
    <div
      {...rest}
      role="group"
      aria-label={rest['aria-label']}
      className={cx('mv-chips', className)}
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
            className="mv-chip"
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {item.count !== undefined && <span className="mv-chip-count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
