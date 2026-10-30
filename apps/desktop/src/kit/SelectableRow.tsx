import type { ReactNode } from 'react';
import Checkbox from './Checkbox';
import { cx } from './cx';

type Props = {
  checked?: boolean;
  onCheckedChange?: (value: boolean) => void;
  checkboxLabel?: string;
  expanded?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export default function SelectableRow({
  checked,
  onCheckedChange,
  checkboxLabel,
  expanded,
  selected,
  onSelect,
  leading,
  title,
  subtitle,
  meta,
  actions,
  className,
}: Props) {
  return (
    <article
      className={cx('mv-list-row', 'mv-selectable-row', className)}
      data-selected={selected || undefined}
    >
      {checkboxLabel && (
        <Checkbox
          aria-label={checkboxLabel}
          checked={checked}
          onChange={(event) => onCheckedChange?.(event.target.checked)}
        />
      )}
      <button
        type="button"
        className="mv-list-row-main"
        aria-expanded={expanded}
        aria-pressed={selected}
        onClick={() => onSelect?.()}
      >
        {leading && <span className="mv-list-row-leading">{leading}</span>}
        <span className="mv-list-row-copy">
          <strong className="mv-list-row-title">{title}</strong>
          {subtitle && <small className="mv-list-row-subtitle">{subtitle}</small>}
        </span>
        {meta && <span className="mv-list-row-meta">{meta}</span>}
      </button>
      {actions && <span className="mv-list-row-actions">{actions}</span>}
    </article>
  );
}
