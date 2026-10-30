import Select from './kit/Select';
import { useEffect, useState } from 'react';
import type { RpcParams } from '@maaverge/contracts';
import StageSelector from './StageSelector';
import type { Field } from './features/plans/task-fields';

const facilities = [
  ['Power', '发电站'],
  ['Office', '办公室'],
  ['Control', '控制中枢'],
  ['Mfg', '制造站'],
  ['Trade', '贸易站'],
  ['Reception', '会客室'],
  ['Recycle', '回收站'],
  ['Dorm', '宿舍'],
  ['Processing', '加工站'],
  ['Training', '训练室'],
  ['AssistantChange', '副手换人'],
] as const;
const defaultFacilities = ['Mfg', 'Trade', 'Power', 'Control', 'Reception', 'Office', 'Dorm'];
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const unlimited = 2_147_483_647;
const materials: [string, string][] = [
  ['30012', '固源岩'],
  ['30013', '固源岩组'],
  ['30023', '糖组'],
  ['30033', '聚酸酯组'],
  ['30043', '异铁组'],
  ['30053', '酮凝集组'],
  ['30062', '装置'],
  ['30063', '全新装置'],
  ['30073', '扭转醇'],
  ['30083', '轻锰矿'],
  ['30093', '研磨石'],
  ['30103', 'RMA70-12'],
  ['31013', '凝胶'],
  ['31023', '炽合金'],
  ['31033', '晶体元件'],
  ['31043', '半自然溶剂'],
  ['31053', '化合切削液'],
  ['31063', '转质盐组'],
];

export default function TaskParameterField({
  field,
  params,
  onChange,
  clientType,
}: {
  field: Field;
  params: Record<string, unknown>;
  clientType?: RpcParams<'stages.list'>['clientType'];
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const value = params[field.key];
  const [accountEnabled, setAccountEnabled] = useState(
    typeof value === 'string' && value.length > 0,
  );
  const set = (next: unknown) => onChange({ [field.key]: next });
  const id = `param-${field.key}`;
  const textValue = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  const hint = field.hint && <small className="wb-param-hint">{field.hint}</small>;

  if (field.kind === 'facilities') {
    const selected = Array.isArray(value) ? (value as string[]) : defaultFacilities;
    const known = new Set(facilities.map(([key]) => key));
    return (
      <div className="param-field wide">
        <span className="field-label">{field.label}</span>
        <div className="wb-facilities" role="group" aria-label={field.label}>
          {facilities.map(([key, label]) => (
            <label className="param-check" key={key}>
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={(event) =>
                  set(
                    event.target.checked
                      ? [...selected, key]
                      : selected.filter((item) => item !== key),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
        <div className="wb-field-actions">
          <button
            type="button"
            className="text-button"
            onClick={() =>
              set([
                ...selected,
                ...facilities.map(([key]) => key).filter((key) => !selected.includes(key)),
              ])
            }
          >
            全选设施
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              set(selected.filter((key) => !known.has(key as (typeof facilities)[number][0])))
            }
          >
            清空设施
          </button>
        </div>
        {Number(params.mode ?? 0) === 0 ? (
          <small>常规模式由核心自动安排设施顺序。</small>
        ) : (
          <FacilityOrder selected={selected} onChange={set} />
        )}
        {hint}
      </div>
    );
  }
  if (field.kind === 'stars') {
    const selected = Array.isArray(value) ? value : [3, 4, 5];
    return (
      <div className="param-field wide">
        <span className="field-label">{field.label}</span>
        <div className="wb-star-options" role="group" aria-label={field.label}>
          {[1, 2, 3, 4, 5, 6].map((star) => (
            <label className="param-check" key={star}>
              <input
                type="checkbox"
                checked={selected.includes(star)}
                onChange={(event) =>
                  set(
                    event.target.checked
                      ? [...selected, star].sort()
                      : selected.filter((item) => item !== star),
                  )
                }
              />
              {star} 星
            </label>
          ))}
        </div>
        {hint}
      </div>
    );
  }
  if (field.kind === 'recruit-confirm') {
    const selected = Array.isArray(value) ? value : [3, 4];
    const times = isObject(params.recruitment_time) ? params.recruitment_time : {};
    return (
      <div className="param-field wide">
        <span className="field-label">{field.label}</span>
        <div className="wb-recruit-confirm" role="group" aria-label={field.label}>
          {[3, 4, 5, 6].map((star) => {
            const minutes = Number(times[String(star)] ?? 540);
            const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
            return (
              <div className="wb-recruit-row" key={star}>
                <label className="param-check">
                  <input
                    type="checkbox"
                    disabled={star === 6 && !selected.includes(6)}
                    checked={selected.includes(star)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selected, star].sort()
                        : selected.filter((item) => item !== star);
                      const select = Array.isArray(params.select) ? params.select : [3, 4, 5];
                      onChange({
                        confirm: next,
                        ...(star >= 4
                          ? {
                              select: event.target.checked
                                ? [...new Set([...select, star])].sort()
                                : select.filter((item) => item !== star),
                            }
                          : {}),
                      });
                    }}
                  />
                  自动确认 {star} 星
                </label>
                <input
                  className="text-input"
                  type="time"
                  min="01:00"
                  max="09:00"
                  step={60}
                  aria-label={`${star} 星招募时长`}
                  disabled={star >= 5 || !selected.includes(star) || params.set_time === false}
                  value={time}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    const [hours, mins] = event.target.value.split(':').map(Number);
                    onChange({
                      recruitment_time: { ...times, [star]: hours * 60 + mins },
                      set_time: true,
                    });
                  }}
                />
              </div>
            );
          })}
        </div>
        <small>
          3 / 4 星可设置 1–9 小时；5 / 6 星默认 9 小时。与原版一致，6
          星自动确认不提供新开关，遇高级资深干员请人工处理。
        </small>
        {hint}
      </div>
    );
  }
  if (field.kind === 'drops')
    return (
      <DropTargets
        id={id}
        value={value}
        enabled={params.drops_enabled}
        onToggle={(enabled) => onChange({ drops_enabled: enabled })}
        onChange={set}
      />
    );
  if (field.kind === 'threshold')
    return (
      <div className="param-field wide">
        <label className="field-label" htmlFor={id}>
          {field.label}：{Math.round(Number(value ?? 0.3) * 100)}%
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(Number(value ?? 0.3) * 100)}
          onChange={(event) => set(Number(event.target.value) / 100)}
        />
        {hint}
      </div>
    );
  if (field.kind === 'limit') {
    const isTimes = field.key === 'times';
    const enabled = isTimes ? value !== unlimited : Number(value ?? 0) > 0;
    return (
      <div className="param-field">
        <label className="param-check">
          <input
            type="checkbox"
            aria-label={isTimes ? '指定次数' : field.key === 'medicine' ? '使用药剂' : '使用源石'}
            checked={enabled}
            onChange={(event) =>
              set(event.target.checked ? (isTimes ? 5 : 1) : isTimes ? unlimited : 0)
            }
          />
          {isTimes ? '指定次数' : field.key === 'medicine' ? '使用药剂' : '使用源石'}
        </label>
        <label className="wb-sr-only" htmlFor={id}>
          {field.label}
        </label>
        <input
          id={id}
          className="text-input"
          type="number"
          min={field.min}
          max={field.max}
          step={1}
          value={enabled ? Number(value ?? 1) : isTimes ? '' : 0}
          placeholder={isTimes ? '不限次数' : undefined}
          onChange={(event) =>
            set(event.target.value === '' ? (isTimes ? unlimited : 0) : Number(event.target.value))
          }
        />
        {!enabled && isTimes && <small>持续作战，直到理智不足或达到材料目标。</small>}
        {hint}
      </div>
    );
  }
  if (field.kind === 'account')
    return (
      <div className="param-field wide">
        <label className="param-check">
          <input
            type="checkbox"
            checked={accountEnabled || textValue.length > 0}
            onChange={(event) => {
              setAccountEnabled(event.target.checked);
              if (!event.target.checked) set('');
            }}
          />
          账号切换
        </label>
        {(accountEnabled || textValue.length > 0) && (
          <>
            <label className="field-label" htmlFor={id}>
              {field.label}
            </label>
            <input
              id={id}
              className="text-input"
              value={textValue}
              placeholder="已登录账号显示名的唯一片段"
              onChange={(event) => {
                setAccountEnabled(true);
                set(event.target.value);
              }}
            />
          </>
        )}
        {hint}
      </div>
    );
  if (field.kind === 'check')
    return (
      <div className="param-field">
        <label className="param-check" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            aria-label={field.label}
            disabled={field.disabled}
            ref={(input) => {
              if (input) input.indeterminate = value === undefined && !field.disabled;
            }}
            checked={value === true}
            onChange={(event) => set(event.target.checked)}
          />
          {field.label}
          {value === undefined && !field.disabled && <small>核心默认</small>}
        </label>
        {hint}
      </div>
    );
  if (field.kind === 'stage')
    return (
      <div className="param-field wide">
        <StageSelector
          id={id}
          label={field.label}
          value={textValue}
          onChange={set}
          clientType={clientType}
        />
        {hint}
      </div>
    );
  return (
    <div className={`param-field ${field.kind === 'list' || field.hint ? 'wide' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {field.label}
      </label>
      {field.kind === 'select' ? (
        <Select
          id={id}
          className="text-input"
          value={textValue}
          onChange={(event) =>
            set(
              event.target.value === ''
                ? undefined
                : field.numeric || field.key === 'mode'
                  ? Number(event.target.value)
                  : event.target.value,
            )
          }
        >
          <option value="">使用核心默认值</option>
          {textValue &&
            !field.options?.some(
              (option) => (Array.isArray(option) ? option[0] : option) === textValue,
            ) && <option value={textValue}>{textValue}</option>}
          {field.options?.map((option) => {
            const [v, label] = Array.isArray(option) ? option : [option, option];
            return (
              <option key={v} value={v}>
                {label}
              </option>
            );
          })}
        </Select>
      ) : field.kind === 'list' || field.kind === 'numbers' ? (
        <ListInput id={id} value={textValue} numeric={field.kind === 'numbers'} onChange={set} />
      ) : (
        <input
          id={id}
          className="text-input"
          type={field.kind === 'number' ? 'number' : 'text'}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={textValue}
          onChange={(event) =>
            set(
              field.kind === 'number'
                ? event.target.value === ''
                  ? undefined
                  : Number(event.target.value)
                : event.target.value,
            )
          }
        />
      )}
      {hint}
    </div>
  );
}

function FacilityOrder({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (value: unknown) => void;
}) {
  return (
    <div className="wb-facility-order">
      <span className="wb-param-hint">执行顺序（可调整）</span>
      {selected.map((key, index) => (
        <div key={`${index}-${key}`}>
          <span>
            {index + 1}. {facilities.find(([id]) => id === key)?.[1] || key}
          </span>
          <button
            type="button"
            aria-label={`上移${facilities.find(([id]) => id === key)?.[1] || key}`}
            disabled={index === 0}
            onClick={() => {
              const next = [...selected];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              onChange(next);
            }}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`下移${facilities.find(([id]) => id === key)?.[1] || key}`}
            disabled={index === selected.length - 1}
            onClick={() => {
              const next = [...selected];
              [next[index + 1], next[index]] = [next[index], next[index + 1]];
              onChange(next);
            }}
          >
            ↓
          </button>
        </div>
      ))}
    </div>
  );
}

function DropTargets({
  id,
  value,
  enabled,
  onToggle,
  onChange,
}: {
  id: string;
  value: unknown;
  enabled: unknown;
  onToggle: (enabled: boolean) => void;
  onChange: (value: unknown) => void;
}) {
  const drops = isObject(value) ? value : {};
  const active = typeof enabled === 'boolean' ? enabled : Object.keys(drops).length > 0;
  const [itemId, setItemId] = useState('30012');
  const [custom, setCustom] = useState(false);
  const materialName = (key: string) =>
    materials.find(([item]) => item === key)?.[1] || `物品 ${key}`;
  return (
    <div className="param-field wide">
      <label className="param-check" id={`${id}-label`}>
        <input
          id={id}
          type="checkbox"
          checked={active}
          onChange={(event) => onToggle(event.target.checked)}
        />
        指定材料
      </label>
      <fieldset aria-labelledby={`${id}-label`} className="wb-drop-targets" disabled={!active}>
        {Object.entries(drops).map(([key, count]) => (
          <div className="wb-drop-row" key={key}>
            <span>{materialName(key)}</span>
            <input
              className="text-input"
              type="number"
              min={1}
              max={unlimited}
              aria-label={`${materialName(key)}目标数量`}
              value={String(count)}
              onChange={(event) => onChange({ ...drops, [key]: Number(event.target.value) })}
            />
            <button
              type="button"
              className="text-button"
              aria-label={`移除材料 ${key}`}
              onClick={() => {
                const next = { ...drops };
                delete next[key];
                onChange(next);
              }}
            >
              移除
            </button>
          </div>
        ))}
        <div className="wb-drop-row">
          <Select
            className="text-input"
            aria-label="目标材料"
            value={custom ? '__custom' : itemId}
            onChange={(event) => {
              const nextCustom = event.target.value === '__custom';
              setCustom(nextCustom);
              setItemId(nextCustom ? '' : event.target.value);
            }}
          >
            {materials.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
            <option value="__custom">其他材料（物品 ID）</option>
          </Select>
          <button
            className="button secondary"
            type="button"
            disabled={!itemId.trim() || itemId.trim() in drops}
            onClick={() => onChange({ ...drops, [itemId.trim()]: 1 })}
          >
            添加材料目标
          </button>
        </div>
        {custom && (
          <input
            className="text-input"
            aria-label="目标材料物品 ID"
            value={itemId}
            placeholder="输入其他材料的物品 ID"
            onChange={(event) => setItemId(event.target.value)}
          />
        )}
      </fieldset>
      <small>
        {!active
          ? '未启用材料目标，按次数或理智条件停止；已设置的材料和数量会保留。'
          : Object.keys(drops).length
            ? '本次运行累计获得任一材料的目标数量后停止。'
            : '添加材料目标后，累计获得目标数量即停止。'}
      </small>
    </div>
  );
}

function ListInput({
  id,
  value,
  numeric,
  onChange,
}: {
  id: string;
  value: string;
  numeric: boolean;
  onChange: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    const canonical = (text: string) =>
      text
        .split(/[,，]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .join(',');
    setDraft((previous) => (canonical(previous) === canonical(value) ? previous : value));
  }, [value]);
  return (
    <input
      id={id}
      className="text-input"
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const entries = next
          .split(/[,，]/)
          .map((entry) => entry.trim())
          .filter(Boolean);
        onChange(numeric ? entries.map(Number) : entries);
      }}
    />
  );
}
