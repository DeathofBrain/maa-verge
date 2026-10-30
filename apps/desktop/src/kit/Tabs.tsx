import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';

export type TabItem = {
  id: string;
  label: ReactNode;
  disabled?: boolean;
  count?: number;
};

type Props = {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  'aria-label': string;
  orientation?: 'horizontal' | 'vertical';
  idPrefix: string;
  className?: string;
};

export default function Tabs({
  items,
  value,
  onChange,
  orientation = 'horizontal',
  idPrefix,
  className,
  ...rest
}: Props) {
  const list = useRef<HTMLDivElement>(null);
  const enabled = items.filter((item) => !item.disabled);

  const move = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const index = enabled.findIndex((item) => item.id === id);
    if (index < 0) return;
    const horizontal = orientation === 'horizontal';
    let next: number;
    if (event.key === (horizontal ? 'ArrowRight' : 'ArrowDown')) next = index + 1;
    else if (event.key === (horizontal ? 'ArrowLeft' : 'ArrowUp')) next = index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    else return;
    event.preventDefault();
    const target = enabled[(next + enabled.length) % enabled.length];
    onChange(target.id);
    list.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${idPrefix}-tab-${target.id}`)}`)
      ?.focus();
  };

  return (
    <div
      {...rest}
      ref={list}
      role="tablist"
      aria-label={rest['aria-label']}
      aria-orientation={orientation}
      className={cx('mv-tabs', orientation === 'vertical' && 'mv-tabs--vertical', className)}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${item.id}`}
          aria-selected={value === item.id}
          aria-controls={`${idPrefix}-panel-${item.id}`}
          tabIndex={value === item.id ? 0 : -1}
          disabled={item.disabled}
          className="mv-tabs-tab"
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => move(event, item.id)}
        >
          {item.label}
          {item.count !== undefined && <span className="mv-tabs-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}
