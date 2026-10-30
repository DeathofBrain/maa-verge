import type { KeyboardEvent, MouseEvent } from 'react';
import { GripVertical, Plus } from 'lucide-react';
import { taskEnabled, taskLabels } from '@maaverge/contracts';
import Select from '../../kit/Select';
import Button from '../../kit/Button';
import SearchField from '../../kit/SearchField';
import type { MenuItem } from '../../kit/ContextMenu';
import { taskCategories } from './task-fields';
import { taskSummary, type Step } from './plan-draft';

type ContextMenuBinding = {
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

type Props = {
  steps: Step[];
  selected: number;
  contextMenu: (label: string, items: MenuItem[]) => ContextMenuBinding;
  onSelect: (index: number) => void;
  onToggle: (index: number, enabled: boolean) => void;
  onReorder: (from: number, to: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  dragKey: string | null;
  onDragKey: (key: string | null) => void;
  typeSearch: string;
  onTypeSearch: (value: string) => void;
  filteredTypes: [string, string][];
  addType: string;
  onAddType: (type: string) => void;
  onAdd: () => void;
};

export default function TaskQueueView({
  steps,
  selected,
  contextMenu,
  onSelect,
  onToggle,
  onReorder,
  onDuplicate,
  onDelete,
  dragKey,
  onDragKey,
  typeSearch,
  onTypeSearch,
  filteredTypes,
  addType,
  onAddType,
  onAdd,
}: Props) {
  return (
    <aside className="wb-queue" aria-label="任务顺序">
      <div className="wb-queue-heading">
        <h2>任务顺序</h2>
        <span>{steps.length} / 30</span>
      </div>
      <ol className="wb-step-list editor-steps">
        {steps.map((entry, index) => (
          <li
            key={entry.key}
            {...contextMenu('任务编辑菜单', [
              { label: '编辑任务', action: () => onSelect(index) },
              {
                label: taskEnabled(entry.task) ? '停用任务' : '启用任务',
                action: () => onToggle(index, !taskEnabled(entry.task)),
              },
              {
                label: '上移任务',
                disabled: index === 0,
                action: () => onReorder(index, index - 1),
              },
              {
                label: '下移任务',
                disabled: index === steps.length - 1,
                action: () => onReorder(index, index + 1),
              },
              {
                label: '复制任务',
                disabled: steps.length >= 30,
                action: () => onDuplicate(index),
              },
              { label: '删除任务', danger: true, action: () => onDelete(index) },
            ])}
            draggable
            onDragStart={() => onDragKey(entry.key)}
            onDragEnd={() => onDragKey(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const from = steps.findIndex((item) => item.key === dragKey);
              if (from >= 0) onReorder(from, index);
              onDragKey(null);
            }}
            className={`${index === selected ? 'selected' : ''} ${!taskEnabled(entry.task) ? 'wb-disabled-step' : ''} ${dragKey === entry.key ? 'wb-dragging' : ''}`}
          >
            <GripVertical className="wb-grip" size={14} aria-hidden="true" />
            <input
              type="checkbox"
              aria-label={`启用第 ${index + 1} 条任务`}
              checked={taskEnabled(entry.task)}
              onChange={(event) => onToggle(index, event.target.checked)}
            />
            <button
              className="wb-step-select"
              aria-label={`设置第 ${index + 1} 条${taskLabels[entry.task.type] || entry.task.type}`}
              aria-current={index === selected ? 'step' : undefined}
              onClick={() => onSelect(index)}
              onKeyDown={(event) => {
                if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
                  event.preventDefault();
                  onReorder(index, index + (event.key === 'ArrowUp' ? -1 : 1));
                }
              }}
            >
              <span className="wb-step-number">{index + 1}</span>
              <span className="wb-step-copy">
                <strong>{taskLabels[entry.task.type] || entry.task.type}</strong>
                <small>{taskSummary(entry.task)}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="wb-add-task">
        <SearchField
          className="wb-type-search"
          aria-label="搜索任务类型"
          placeholder="搜索任务类型"
          value={typeSearch}
          onValueChange={onTypeSearch}
        />
        <label className="wb-sr-only" htmlFor="task-type">
          添加任务类型
        </label>
        <Select
          id="task-type"
          className="text-input"
          value={
            filteredTypes.some(([type]) => type === addType) ? addType : filteredTypes[0]?.[0] || ''
          }
          onChange={(event) => onAddType(event.target.value)}
        >
          {filteredTypes.map(([type, label]) => (
            <option key={type} value={type}>
              {taskCategories[type]} · {label}
            </option>
          ))}
        </Select>
        <Button
          className="button"
          icon={<Plus size={15} />}
          disabled={steps.length >= 30 || !filteredTypes.length}
          onClick={onAdd}
        >
          添加任务
        </Button>
        <small>
          {steps.filter((entry) => taskEnabled(entry.task)).length} 项已启用 ·
          拖动或使用排序按钮调整
        </small>
      </div>
    </aside>
  );
}
