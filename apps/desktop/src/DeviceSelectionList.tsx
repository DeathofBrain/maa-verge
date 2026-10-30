import { useId, useState } from 'react';
import { Search } from 'lucide-react';
import type { Device } from '@maaverge/contracts';
import Select from './Select';
import './device-selection-list.css';

export type DeviceSelectionItem = {
  id: string;
  name: string;
  address?: string;
  state: Device['state'] | 'missing';
  note?: string;
  disabled?: boolean;
  tag?: string;
};

type Props = {
  items: DeviceSelectionItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  ariaLabel: string;
  checkboxLabel: (item: DeviceSelectionItem) => string;
  disabled?: boolean;
  maxSelected?: number;
  emptyMessage?: string;
  selectedLabel?: string;
};

const filters = [
  ['all', '全部'],
  ['selected', '已选'],
  ['online', '在线'],
  ['offline', '离线'],
] as const;
type Filter = (typeof filters)[number][0];

const stateLabels: Record<DeviceSelectionItem['state'], string> = {
  idle: '空闲',
  running: '执行中',
  offline: '离线',
  missing: '未发现',
};

export default function DeviceSelectionList({
  items,
  selectedIds,
  onChange,
  ariaLabel,
  checkboxLabel,
  disabled = false,
  maxSelected,
  emptyMessage = '暂无设备，请先在设备页添加。',
  selectedLabel = '已选',
}: Props) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const selected = new Set(selectedIds);
  const limitReached = maxSelected !== undefined && selected.size >= maxSelected;
  const term = query.trim().toLocaleLowerCase();
  const matches = items.filter((item) => {
    const offline = item.state === 'offline' || item.state === 'missing';
    if (filter === 'selected' && !selected.has(item.id)) return false;
    if (filter === 'online' && offline) return false;
    if (filter === 'offline' && !offline) return false;
    return `${item.name}\n${item.address || ''}\n${item.id}`.toLocaleLowerCase().includes(term);
  });
  const selectable = matches.filter((item) => !item.disabled && !selected.has(item.id));
  const removable = new Set(
    matches.filter((item) => !item.disabled && selected.has(item.id)).map((item) => item.id),
  );
  const selectMatches = () => {
    if (disabled) return;
    const capacity = maxSelected === undefined ? selectable.length : maxSelected - selected.size;
    const additions = selectable.slice(0, Math.max(0, capacity)).map((item) => item.id);
    if (additions.length) onChange([...selectedIds, ...additions]);
  };
  const clearMatches = () => {
    if (!disabled && removable.size) onChange(selectedIds.filter((id) => !removable.has(id)));
  };

  return (
    <div className="device-selection" role="group" aria-label={ariaLabel}>
      <div className="device-selection-summary">
        <span>
          {selectedLabel} <strong>{selected.size}</strong> 台
        </span>
        <span>共 {items.length} 台设备</span>
      </div>
      <label className="device-selection-search" htmlFor={searchId}>
        <Search size={15} aria-hidden="true" />
        <input
          id={searchId}
          type="search"
          aria-label="搜索设备"
          placeholder="搜索设备名称、地址或标识"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="device-selection-tools">
        <Select
          className="device-selection-filter"
          aria-label="筛选设备"
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
        >
          {filters.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <span className="device-selection-match-count">显示 {matches.length} 台</span>
      </div>
      <div className="device-selection-rows" tabIndex={-1}>
        {matches.length ? (
          matches.map((item) => {
            const checked = selected.has(item.id);
            const unavailable = disabled || item.disabled || (!checked && limitReached);
            return (
              <label
                className={`device-selection-row ${unavailable ? 'is-unavailable' : ''}`}
                key={item.id}
              >
                <input
                  type="checkbox"
                  aria-label={checkboxLabel(item)}
                  checked={checked}
                  disabled={unavailable}
                  onChange={(event) => {
                    if (unavailable) return;
                    onChange(
                      event.target.checked
                        ? [...selectedIds, item.id]
                        : selectedIds.filter((id) => id !== item.id),
                    );
                  }}
                />
                <span className="device-selection-copy">
                  <span className="device-selection-name">
                    <strong>{item.name}</strong>
                    {item.tag && <small>{item.tag}</small>}
                  </span>
                  <small className="device-selection-address">{item.address || item.id}</small>
                  {item.note && <small className="device-selection-note">{item.note}</small>}
                </span>
                <span className={`device-selection-state is-${item.state}`}>
                  {stateLabels[item.state]}
                </span>
              </label>
            );
          })
        ) : (
          <p className="device-selection-empty">
            {items.length ? '没有符合条件的设备，请调整搜索或筛选。' : emptyMessage}
          </p>
        )}
      </div>
      <div className="device-selection-actions">
        <button
          className="button secondary"
          type="button"
          disabled={disabled || !selectable.length || limitReached}
          onClick={selectMatches}
        >
          选择筛选结果
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={disabled || !removable.size}
          onClick={clearMatches}
        >
          取消筛选结果
        </button>
        {maxSelected !== undefined && (
          <small role={limitReached ? 'status' : undefined}>
            {limitReached ? `已达到 ${maxSelected} 台选择上限` : `最多选择 ${maxSelected} 台设备`}
          </small>
        )}
      </div>
    </div>
  );
}
