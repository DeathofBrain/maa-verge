import Select from './Select';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  Check,
  Copy,
  FileText,
  GripVertical,
  Info,
  ListChecks,
  LoaderCircle,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  localizeExecutionMessage,
  taskEnabled,
  taskConsumableLimits,
  taskLabels,
  type Device,
  type Plan,
  type Run,
  type Settings,
  type RpcParams,
} from '@maaverge/contracts';
import TaskParameterField from './TaskParameterField';
import { clients, fieldGroups, fields, taskCategories } from './features/plans/task-fields';
import {
  cacheSavedDraft,
  createDraft,
  createStep,
  draftPlan,
  draftVersion,
  fingerprint,
  focusedTaskIndex,
  loadDraft,
  parseDraft,
  stable,
  taskSummary,
  type Draft,
  type Step,
  type Tab,
  type WorkbenchPlan,
} from './features/plans/plan-draft';
import { useContextMenu } from './ContextMenu';
import './plan-workbench.css';
import SchedulePanel from './SchedulePanel';
import DeviceSelectionList from './DeviceSelectionList';

type Task = Plan['tasks'][number];
export type PlanEditorCommand = {
  id: string;
  type: 'settings' | 'rename' | 'export' | 'duplicate';
};
type Props = {
  plan: Plan | 'new';
  devices?: Device[];
  settings?: Settings;
  running?: boolean;
  unsaved?: boolean;
  selectedDeviceId?: string;
  busyDeviceIds?: string[];
  activeRun?: Run;
  stopping?: boolean;
  onViewRun?: (run: Run) => void;
  onStopRun?: (run: Run) => void;
  suspended?: boolean;
  command?: PlanEditorCommand;
  onCommandHandled?: () => void;
  onDuplicate?: (plan: Plan) => void;
  onOpenDeviceSettings?: (deviceId?: string) => void;
  onCopyCopilot?: (planId: string, taskIndex: number) => void;
  onSave: (plan: Plan) => Promise<boolean>;
  onStart?: (plan: Plan) => Promise<boolean>;
  onDelete?: (plan: Plan) => void;
  onClose?: () => void;
  onSaved?: (plan: Plan) => void;
  defaultName?: string;
  focusTaskType?: Task['type'];
  focusTaskIndex?: number;
  initialParams?: Task['params'];
  initialTab?: Tab;
  searchQuery?: string;
};
export default function PlanEditor({
  plan,
  devices = [],
  settings,
  selectedDeviceId,
  busyDeviceIds = [],
  activeRun,
  stopping = false,
  onViewRun,
  onStopRun,
  suspended = false,
  command,
  onCommandHandled,
  onDuplicate,
  onOpenDeviceSettings,
  onCopyCopilot,
  running = false,
  unsaved = false,
  onSave,
  onStart,
  onDelete,
  onClose,
  onSaved,
  defaultName,
  focusTaskType,
  focusTaskIndex,
  initialParams,
  initialTab,
  searchQuery = '',
}: Props) {
  const contextMenu = useContextMenu();
  const cacheKey = `maaverge.ui.draft.${plan === 'new' ? `new:${focusTaskType || 'default'}:${stable(initialParams || {})}` : plan.id}`;
  const [draft, setDraft] = useState<Draft>(() =>
    loadDraft(
      cacheKey,
      plan,
      focusTaskType,
      initialParams,
      focusTaskIndex,
      defaultName,
      initialTab,
    ),
  );
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [addType, setAddType] = useState<Task['type']>('Fight');
  const [typeSearch, setTypeSearch] = useState('');
  const [fieldSearch, setFieldSearch] = useState(searchQuery);
  const [advanced, setAdvanced] = useState<Record<string, boolean>>({});
  const [mobileDetail, setMobileDetail] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const savingVersion = useRef('');
  const renameRequested = useRef(false);
  const discardOnLeave = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const callbacks = useRef({ onSave, onSaved, onStart });
  callbacks.current = { onSave, onSaved, onStart };
  const selected = Math.min(draft.selected, Math.max(0, draft.steps.length - 1));
  const step = draft.steps[selected];
  const validJson = (() => {
    try {
      const value = JSON.parse(step?.json || '{}');
      return !!value && typeof value === 'object' && !Array.isArray(value);
    } catch {
      return false;
    }
  })();
  const dirty =
    unsaved ||
    plan === 'new' ||
    draft.steps.some((entry) => {
      try {
        return stable(JSON.parse(entry.json)) !== stable(entry.task.params);
      } catch {
        return true;
      }
    }) ||
    fingerprint(draftPlan(draft, plan)) !== draft.base;
  const sourceVersion = plan === 'new' ? '' : fingerprint(plan as WorkbenchPlan);
  const consumableSummary = (() => {
    try {
      const limits = taskConsumableLimits({
        tasks: draft.steps.map((entry) => ({ ...entry.task, params: JSON.parse(entry.json) })),
      });
      return `本表自动作战累计上限：理智药 ${limits.medicine} · 源石 ${limits.originium}`;
    } catch {
      return '请检查自动作战任务的消耗参数。';
    }
  })();
  const contextDeviceId = draft.deviceIds.includes(selectedDeviceId || '')
    ? selectedDeviceId
    : draft.deviceIds[0] || selectedDeviceId;
  const syncDevice = devices.find((device) => device.id === contextDeviceId);
  const precedingClient = [...draft.steps.slice(0, selected)]
    .reverse()
    .find((entry) => entry.task.type === 'StartUp' && taskEnabled(entry.task))?.task
    .params.client_type;
  const connectionClient =
    settings?.deviceProfiles?.find((profile) => profile.id === syncDevice?.connectionProfileId)
      ?.connection.clientType || settings?.connection?.clientType;
  const requestedClient =
    step?.task.params.client_type || precedingClient || connectionClient || 'Official';
  const taskClient = (
    clients.some(([id]) => id === requestedClient) ? requestedClient : 'Official'
  ) as NonNullable<RpcParams<'stages.list'>['clientType']>;
  const draftTargetBusy =
    draft.deviceIds.length > 1 ? false : busyDeviceIds.includes(contextDeviceId || '');
  const hasSavedPlan = plan !== 'new' && !unsaved;
  const startUnavailable = draftTargetBusy;
  const contentVersion = draftVersion(draft);
  const filteredTypes = Object.entries(taskLabels)
    .filter(([type]) => !['Copilot', 'SSSCopilot', 'ParadoxCopilot'].includes(type))
    .filter(([type, label]) =>
      `${label} ${type} ${taskCategories[type]}`.toLowerCase().includes(typeSearch.toLowerCase()),
    );
  const tab = draft.tab;
  const patch = (value: Partial<Draft>) => setDraft((previous) => ({ ...previous, ...value }));

  useEffect(() => {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(draft));
    } catch {
      /* A full/unavailable session store must not block editing. */
    }
  }, [cacheKey, draft]);
  useEffect(() => {
    if (plan === 'new' || unsaved || saving) return;
    setDraft((previous) => {
      if (previous.base === sourceVersion) return previous;
      const changed =
        previous.steps.some((entry) => {
          try {
            return stable(JSON.parse(entry.json)) !== stable(entry.task.params);
          } catch {
            return true;
          }
        }) || fingerprint(draftPlan(previous, plan)) !== previous.base;
      if (changed) return previous;
      const next = createDraft(plan, focusTaskType, initialParams, focusTaskIndex);
      return {
        ...next,
        selected: Math.min(previous.selected, Math.max(0, next.steps.length - 1)),
        tab: previous.tab,
      };
    });
    // The stable fingerprint, rather than each snapshot object, controls refreshes.
  }, [sourceVersion, saving, unsaved]);
  useEffect(() => {
    setFieldSearch(searchQuery);
  }, [searchQuery]);
  useEffect(() => {
    if (!focusTaskType && focusTaskIndex === undefined) return;
    const index = focusedTaskIndex(draftRef.current.steps, focusTaskType, focusTaskIndex);
    if (index >= 0) {
      setDraft((previous) => ({ ...previous, selected: index, tab: 'tasks' }));
      setMobileDetail(true);
    } else setFormError('任务顺序已变化，请从任务列表选择要编辑的任务。');
  }, [focusTaskType, focusTaskIndex]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 's' &&
        root.current?.getClientRects().length
      ) {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    setFormError('');
  }, [contentVersion]);
  const setTask = (index: number, transform: (entry: Step) => Step) =>
    setDraft((previous) => ({
      ...previous,
      steps: previous.steps.map((entry, i) => (i === index ? transform(entry) : entry)),
    }));
  const setEnabled = (index: number, enabled: boolean) =>
    setTask(index, (entry) => {
      let params = entry.task.params;
      let json = entry.json;
      try {
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'enable' in parsed) {
          params = { ...parsed, enable: enabled };
          json = JSON.stringify(params, null, 2);
        }
      } catch {
        /* Keep invalid expert drafts intact. */
      }
      return { ...entry, task: { ...entry.task, params, enabled }, json };
    });
  const setParams = (updates: Record<string, unknown>) =>
    setTask(selected, (entry) => {
      const params = { ...entry.task.params, ...updates };
      for (const [key, value] of Object.entries(updates))
        if (value === undefined) delete params[key];
      return { ...entry, task: { ...entry.task, params }, json: JSON.stringify(params, null, 2) };
    });
  const setJson = (json: string) =>
    setTask(selected, (entry) => {
      try {
        const params = JSON.parse(json);
        if (params && typeof params === 'object' && !Array.isArray(params))
          return { ...entry, json, task: { ...entry.task, params } };
      } catch {
        /* Preserve incomplete JSON until it can be corrected. */
      }
      return { ...entry, json };
    });
  const selectTask = (index: number) => {
    patch({ selected: index });
    setFieldSearch('');
    setMobileDetail(true);
  };
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= draft.steps.length) return;
    const next = [...draft.steps];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry);
    patch({ steps: next, selected: to });
    setNotice(`已将${taskLabels[entry.task.type]}移到第 ${to + 1} 条`);
  };
  const addTask = () => {
    if (draft.steps.length >= 30) return;
    const type = filteredTypes.some(([type]) => type === addType)
      ? addType
      : (filteredTypes[0]?.[0] as Task['type'] | undefined);
    if (!type) return;
    patch({
      steps: [...draft.steps, createStep(type)],
      selected: draft.steps.length,
      tab: 'tasks',
    });
    setMobileDetail(true);
    setFieldSearch('');
    setNotice('已添加任务');
  };
  const buildPlan = (): WorkbenchPlan | null => {
    try {
      return parseDraft(draftRef.current, plan);
    } catch (cause) {
      setFormError((cause as Error).message);
      return null;
    }
  };
  const save = async (andStart = false): Promise<void> => {
    if (suspended || starting || (andStart && draftTargetBusy)) return;
    if (inFlight.current) {
      await inFlight.current;
      return saveRef.current(andStart);
    }
    const value = buildPlan();
    if (!value) return;
    const captured = draftRef.current;
    setSaving(true);
    setFormError('');
    savingVersion.current = draftVersion(captured);
    try {
      inFlight.current = callbacks.current.onSave(value);
      const saved = await inFlight.current;
      if (saved) cacheSavedDraft(cacheKey, captured, value);
      if (!mounted.current) {
        if (saved && andStart) await callbacks.current.onStart?.(value);
        return;
      }
      if (!saved) {
        setFormError('自动保存失败，草稿已保留。请检查参数或连接后重试。');
        return;
      }
      setDraft((previous) => ({
        ...previous,
        name: previous.name === captured.name ? value.name : previous.name,
        base: fingerprint(value),
      }));
      setNotice('任务表已自动保存');
      if (draftVersion(draftRef.current) === savingVersion.current)
        callbacks.current.onSaved?.(value);
      if (andStart && callbacks.current.onStart) {
        setStarting(true);
        await callbacks.current.onStart(value);
      }
    } finally {
      inFlight.current = null;
      if (mounted.current) {
        setSaving(false);
        setStarting(false);
      }
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  const leaveRef = useRef(() => {});
  leaveRef.current = () => {
    if (
      discardOnLeave.current ||
      suspended ||
      unsaved ||
      !dirty ||
      savingVersion.current === contentVersion
    )
      return;
    try {
      const captured = draftRef.current;
      const value = parseDraft(captured, plan);
      void callbacks.current.onSave(value).then((saved) => {
        if (saved) cacheSavedDraft(cacheKey, captured, value);
      });
    } catch {
      /* Invalid input remains in the recovery cache. */
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) leaveRef.current();
      });
    };
  }, []);
  useEffect(() => {
    if (!dirty || unsaved || suspended || saving || starting || formError) return;
    const timer = window.setTimeout(() => {
      void saveRef.current();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [contentVersion, dirty, unsaved, suspended, saving, starting, formError]);
  const start = async () => {
    if (starting || suspended || draftTargetBusy) return;
    if (dirty || saving) {
      await saveRef.current(true);
      return;
    }
    const value = buildPlan();
    if (!value || !onStart) return;
    setStarting(true);
    try {
      await onStart(value);
    } finally {
      if (mounted.current) setStarting(false);
    }
  };
  const revert = () => {
    setDraft(createDraft(plan, focusTaskType, initialParams, focusTaskIndex, defaultName));
    setFormError('');
    setNotice('已恢复为保存的配置');
  };
  const exportPlan = () => {
    const value = buildPlan();
    if (!value) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${value.name}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const duplicateTask = (index: number) => {
    if (draft.steps.length >= 30) return;
    const next = [...draft.steps];
    next.splice(index + 1, 0, { ...structuredClone(draft.steps[index]), key: crypto.randomUUID() });
    patch({ steps: next, selected: index + 1 });
    setNotice('已复制任务');
  };
  const deleteTask = (index: number) => {
    patch({
      steps: draft.steps.filter((_, i) => i !== index),
      selected: Math.max(0, selected - (index <= selected ? 1 : 0)),
    });
    setNotice('已删除任务');
  };
  useEffect(() => {
    if (!command) return;
    if (command.type === 'settings' || command.type === 'rename') {
      patch({ tab: 'settings' });
      if (command.type === 'rename') renameRequested.current = true;
    }
    if (command.type === 'export') exportPlan();
    if (command.type === 'duplicate') {
      const value = buildPlan();
      if (value) onDuplicate?.(value);
    }
    onCommandHandled?.();
  }, [command?.id]);
  useEffect(() => {
    if (tab !== 'settings' || !renameRequested.current) return;
    const input = root.current?.querySelector<HTMLInputElement>('[aria-label="任务表名称"]');
    input?.focus();
    input?.select();
    renameRequested.current = false;
  }, [tab, command?.id]);

  return (
    <section
      ref={root}
      className={`wb-workbench ${mobileDetail ? 'wb-show-detail' : ''}`}
      aria-label="任务表工作台"
      aria-busy={saving}
    >
      <header className="wb-page-header">
        <div className="wb-page-title">
          <h1>{draft.name || '新建任务表'}</h1>
          <span className={`wb-save-state ${dirty ? 'is-dirty' : ''}`} role="status">
            <i />
            {saving
              ? '正在保存…'
              : formError
                ? '保存失败'
                : dirty
                  ? unsaved
                    ? '待确认保存'
                    : '等待自动保存'
                  : '已保存'}
          </span>
          <p>
            {draft.description ||
              `${draft.steps.filter((entry) => taskEnabled(entry.task)).length} 项已启用 · 按顺序执行，每条任务独立设置`}
          </p>
        </div>
        <div className="wb-header-actions">
          {plan === 'new' && onClose && (
            <button
              className="button secondary"
              disabled={saving}
              onClick={() => {
                discardOnLeave.current = true;
                try {
                  sessionStorage.removeItem(cacheKey);
                } catch {
                  /* Optional recovery cache. */
                }
                onClose();
              }}
            >
              取消新建
            </button>
          )}
          {hasSavedPlan && onDelete && (
            <button
              className="button secondary wb-danger"
              disabled={running || starting}
              title={running ? '请先停止此任务表的执行，再删除任务表' : '删除当前任务表'}
              onClick={() => onDelete(plan)}
            >
              <Trash2 size={15} />
              删除任务表
            </button>
          )}
          {(unsaved || formError) && (
            <button
              className="button secondary"
              data-save-plan
              disabled={saving}
              onClick={() => void save()}
            >
              <Check size={15} />
              {unsaved ? '保存任务表' : '重试保存'}
            </button>
          )}
          {onStart && (
            <button
              className="button primary"
              disabled={startUnavailable || starting || suspended}
              onClick={() => void start()}
            >
              <Play size={15} fill="currentColor" />
              {starting ? '正在开始…' : '开始执行'}
            </button>
          )}
        </div>
      </header>
      {activeRun && (
        <div
          className={`wb-active-run ${activeRun.status}`}
          role="status"
          aria-label="任务表运行状态"
        >
          <div className="wb-active-run-head">
            <LoaderCircle size={16} className="spin" />
            <strong>
              {activeRun.status === 'running'
                ? '执行中'
                : activeRun.status === 'failed'
                  ? '执行失败'
                  : activeRun.status === 'completed'
                    ? '已完成'
                    : '已停止'}
            </strong>
            <span>
              {devices.find((device) => device.id === activeRun.deviceId)?.name ||
                activeRun.deviceId}
            </span>
            <b>{activeRun.progress}%</b>
          </div>
          <p>{localizeExecutionMessage(activeRun.message) || '正在等待执行反馈'}</p>
          <div
            className="wb-active-run-bar"
            role="progressbar"
            aria-label="任务表执行进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={activeRun.progress}
          >
            <i style={{ width: `${activeRun.progress}%` }} />
          </div>
          <div className="wb-active-run-actions">
            {onViewRun && (
              <button className="button secondary" onClick={() => onViewRun(activeRun)}>
                查看执行
              </button>
            )}
            {activeRun.status === 'running' && onStopRun && (
              <button
                className="button danger"
                disabled={stopping}
                onClick={() => onStopRun(activeRun)}
              >
                <Square size={12} />
                停止执行
              </button>
            )}
          </div>
        </div>
      )}
      <div className="wb-tabs" role="tablist" aria-label="任务表页面">
        {(
          [
            ['tasks', '任务编排', ListChecks],
            ['settings', '任务表设置', Settings2],
            ['schedule', '定时计划', CalendarClock],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`wb-panel-${id}`}
            id={`wb-tab-${id}`}
            onClick={() => patch({ tab: id })}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      {running && (
        <div className="wb-running-note">
          <Info size={15} />
          当前执行使用启动时配置。这里的修改用于下次执行。
        </div>
      )}
      {dirty && !unsaved && plan !== 'new' && draft.base !== sourceVersion && (
        <div className="wb-running-note">
          <Info size={15} />
          已保存配置有更新，当前草稿已保留。保存将以这份草稿替换已保存配置。
        </div>
      )}
      {formError && (
        <div className="wb-form-error" role="alert">
          <Info size={16} />
          <span>{formError}</span>
          <button
            className="icon-button"
            aria-label="关闭参数错误"
            onClick={() => setFormError('')}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <span className="wb-sr-only" role="status">
        {notice}
      </span>
      {tab === 'tasks' && (
        <div
          className="wb-task-layout"
          id="wb-panel-tasks"
          role="tabpanel"
          aria-labelledby="wb-tab-tasks"
        >
          <aside className="wb-queue" aria-label="任务顺序">
            <div className="wb-queue-heading">
              <h2>任务顺序</h2>
              <span>{draft.steps.length} / 30</span>
            </div>
            <ol className="wb-step-list editor-steps">
              {draft.steps.map((entry, index) => (
                <li
                  key={entry.key}
                  {...contextMenu('任务编辑菜单', [
                    { label: '编辑任务', action: () => selectTask(index) },
                    {
                      label: taskEnabled(entry.task) ? '停用任务' : '启用任务',
                      action: () => setEnabled(index, !taskEnabled(entry.task)),
                    },
                    {
                      label: '上移任务',
                      disabled: index === 0,
                      action: () => reorder(index, index - 1),
                    },
                    {
                      label: '下移任务',
                      disabled: index === draft.steps.length - 1,
                      action: () => reorder(index, index + 1),
                    },
                    {
                      label: '复制任务',
                      disabled: draft.steps.length >= 30,
                      action: () => duplicateTask(index),
                    },
                    { label: '删除任务', danger: true, action: () => deleteTask(index) },
                  ])}
                  draggable
                  onDragStart={() => setDragKey(entry.key)}
                  onDragEnd={() => setDragKey(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = draft.steps.findIndex((item) => item.key === dragKey);
                    if (from >= 0) reorder(from, index);
                    setDragKey(null);
                  }}
                  className={`${index === selected ? 'selected' : ''} ${!taskEnabled(entry.task) ? 'wb-disabled-step' : ''} ${dragKey === entry.key ? 'wb-dragging' : ''}`}
                >
                  <GripVertical className="wb-grip" size={14} aria-hidden="true" />
                  <input
                    type="checkbox"
                    aria-label={`启用第 ${index + 1} 条任务`}
                    checked={taskEnabled(entry.task)}
                    onChange={(event) => setEnabled(index, event.target.checked)}
                  />
                  <button
                    className="wb-step-select"
                    aria-label={`设置第 ${index + 1} 条${taskLabels[entry.task.type] || entry.task.type}`}
                    aria-current={index === selected ? 'step' : undefined}
                    onClick={() => selectTask(index)}
                    onKeyDown={(event) => {
                      if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
                        event.preventDefault();
                        reorder(index, index + (event.key === 'ArrowUp' ? -1 : 1));
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
              <div className="wb-type-search">
                <Search size={14} />
                <input
                  aria-label="搜索任务类型"
                  placeholder="搜索任务类型"
                  value={typeSearch}
                  onChange={(event) => setTypeSearch(event.target.value)}
                />
              </div>
              <label className="wb-sr-only" htmlFor="task-type">
                添加任务类型
              </label>
              <Select
                id="task-type"
                className="text-input"
                value={
                  filteredTypes.some(([type]) => type === addType)
                    ? addType
                    : filteredTypes[0]?.[0] || ''
                }
                onChange={(event) => setAddType(event.target.value as Task['type'])}
              >
                {filteredTypes.map(([type, label]) => (
                  <option key={type} value={type}>
                    {taskCategories[type]} · {label}
                  </option>
                ))}
              </Select>
              <button
                className="button secondary"
                disabled={draft.steps.length >= 30 || !filteredTypes.length}
                onClick={addTask}
              >
                <Plus size={15} />
                添加任务
              </button>
              <small>
                {draft.steps.filter((entry) => taskEnabled(entry.task)).length} 项已启用 ·
                拖动或使用排序按钮调整
              </small>
            </div>
          </aside>
          <section className="wb-inspector" aria-label="单项任务设置">
            {step ? (
              <>
                <div className="wb-inspector-header">
                  <div>
                    <button className="wb-mobile-back" onClick={() => setMobileDetail(false)}>
                      <ArrowLeft size={15} />
                      任务列表
                    </button>
                    <h2>{taskLabels[step.task.type] || step.task.type}</h2>
                    <p>第 {selected + 1} 条任务 · 独立设置</p>
                  </div>
                  <div className="wb-step-tools">
                    <button
                      className="icon-button"
                      aria-label="上移任务"
                      title="上移任务（Alt ↑）"
                      disabled={selected === 0}
                      onClick={() => reorder(selected, selected - 1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="下移任务"
                      title="下移任务（Alt ↓）"
                      disabled={selected === draft.steps.length - 1}
                      onClick={() => reorder(selected, selected + 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="复制任务"
                      title="复制任务"
                      disabled={draft.steps.length >= 30}
                      onClick={() => duplicateTask(selected)}
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      className="icon-button danger-hover"
                      aria-label="删除任务"
                      title="删除任务"
                      onClick={() => deleteTask(selected)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="wb-field-search">
                  <Search size={15} />
                  <input
                    aria-label="搜索当前任务设置"
                    placeholder="查找当前任务设置"
                    value={fieldSearch}
                    onChange={(event) => setFieldSearch(event.target.value)}
                  />
                  {fieldSearch && (
                    <button
                      className="icon-button"
                      aria-label="清除任务设置搜索"
                      onClick={() => setFieldSearch('')}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <fieldset className="wb-fieldset task-fields" disabled={!validJson}>
                  {fieldGroups(step.task.type).map((group) => {
                    const visible = group.fields.filter(
                      (field) =>
                        (step.task.type !== 'Infrast' ||
                          !['filename', 'plan_index'].includes(field.key) ||
                          Number(step.task.params.mode) === 10000) &&
                        (!fieldSearch ||
                          `${field.label} ${field.key} ${field.hint || ''}`
                            .toLowerCase()
                            .includes(fieldSearch.toLowerCase())),
                    );
                    return (
                      !!visible.length && (
                        <FieldSection
                          key={`${step.key}-${group.title}`}
                          title={group.title}
                          expanded={group.expanded || !!fieldSearch}
                          summary={`${group.fields.length} 项设置`}
                        >
                          <div className="wb-fields">
                            {visible.map((field) => (
                              <TaskParameterField
                                key={step.key + field.key}
                                field={field}
                                params={step.task.params}
                                onChange={setParams}
                                clientType={taskClient}
                              />
                            ))}
                          </div>
                          {group.title === '消耗上限' && (
                            <p className="wb-helper">
                              <ShieldCheck size={14} />
                              {consumableSummary}
                            </p>
                          )}
                        </FieldSection>
                      )
                    );
                  })}
                </fieldset>
                {fieldSearch &&
                  !fields[step.task.type]?.some((field) =>
                    `${field.label} ${field.key} ${field.hint || ''}`
                      .toLowerCase()
                      .includes(fieldSearch.toLowerCase()),
                  ) && <p className="wb-helper">没有匹配的表单项，可清除搜索或检查高级参数。</p>}
                {!validJson && (
                  <p role="alert" className="wb-inline-error">
                    请先修正高级参数中的 JSON，再使用表单。
                  </p>
                )}
                {['Copilot', 'SSSCopilot', 'ParadoxCopilot'].includes(step.task.type) && (
                  <div className="wb-task-help">
                    <Info size={17} />
                    <div>
                      <p>此旧任务继续兼容。新作业请在作业中心管理，复制不会删除或修改原任务。</p>
                      {plan !== 'new' && !unsaved && onCopyCopilot && (
                        <button
                          className="button secondary"
                          disabled={dirty || saving || starting}
                          title={dirty ? '等待自动保存完成后复制' : undefined}
                          onClick={() => onCopyCopilot(draft.id, selected)}
                        >
                          复制到作业库
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {step.task.type === 'OperProgress' && (
                  <div className="wb-task-help">
                    <Info size={17} />
                    <p>
                      干员养成会执行精英化、技能升级与专精并消耗材料。在高级参数的 plans
                      数组填写目标，执行前逐项核对。
                    </p>
                  </div>
                )}
                {!fields[step.task.type]?.length && step.task.type !== 'OperProgress' && (
                  <div className="wb-task-help">
                    <FileText size={17} />
                    <p>识别使用核心默认参数。结果可在运行事件中查看；专用结果与导出仍待接入。</p>
                  </div>
                )}
                {step.task.type === 'Recruit' && (
                  <p className="wb-helper">
                    次数为 0 时仅识别标签。当前核心无法保证加急次数上限，加急请求会被策略拒绝。
                  </p>
                )}
                {step.task.type === 'StartUp' && (
                  <FieldSection
                    key={`${step.key}-connection`}
                    title="执行设备"
                    expanded
                    summary={syncDevice?.name || '尚未选择设备'}
                  >
                    <p className="wb-helper">
                      {draft.deviceIds.length
                        ? `本表绑定 ${draft.deviceIds.length} 台设备，当前查看：${syncDevice?.name || '设备暂不可用'}`
                        : `使用底栏所选设备：${syncDevice?.name || '尚未选择'}`}
                      {syncDevice ? `（${syncDevice.address}）` : ''}
                    </p>
                    <p className="wb-helper">
                      开始唤醒负责启动游戏与切换账号。请先在模拟器中启动实例并连接设备；ADB、触控与截图统一在设备页配置。
                    </p>
                    {onOpenDeviceSettings && (
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => onOpenDeviceSettings(contextDeviceId)}
                      >
                        管理设备连接
                      </button>
                    )}
                  </FieldSection>
                )}
                {step.task.type === 'Mall' && (
                  <p className="wb-helper">
                    会客室信息板收取信用、线索交流与赠送线索，请在「基建换班 → 信用与线索」中设置。
                  </p>
                )}
                {step.task.type === 'UserDataUpdate' && (
                  <div className="wb-sync-times" aria-label="数据同步状态">
                    <span>设备：{syncDevice?.name || '请绑定或选择设备'}</span>
                    <span>
                      干员上次同步：
                      {syncDevice?.dataSync?.operatorsAt
                        ? new Date(syncDevice.dataSync.operatorsAt).toLocaleString('zh-CN')
                        : '暂无成功记录'}
                    </span>
                    <span>
                      仓库上次同步：
                      {syncDevice?.dataSync?.depotAt
                        ? new Date(syncDevice.dataSync.depotAt).toLocaleString('zh-CN')
                        : '暂无成功记录'}
                    </span>
                    <span>
                      按游戏客户端时区在凌晨 4 点换日，周一换周；已成功同步的项目在本周期内跳过。
                    </span>
                  </div>
                )}
                {step.task.type === 'SingleStep' && (
                  <p className="wb-helper">
                    在高级参数的 details 配置动作；战斗动作使用 details.actions
                    数组，完成后仍需观察验证。
                  </p>
                )}
                <details
                  className="wb-advanced advanced-params"
                  open={advanced[step.key] || !validJson}
                  onToggle={(event) => {
                    const open = event.currentTarget.open;
                    setAdvanced((previous) =>
                      previous[step.key] === open ? previous : { ...previous, [step.key]: open },
                    );
                  }}
                >
                  <summary>
                    高级参数 <span>完整 MaaCore JSON</span>
                  </summary>
                  <p>补充未列出的上游字段；保存时完整保留，并校验参数和消耗。</p>
                  <label className="field-label" htmlFor="task-json">
                    任务参数 JSON
                  </label>
                  <textarea
                    id="task-json"
                    spellCheck={false}
                    value={step.json}
                    onChange={(event) => setJson(event.target.value)}
                  />
                </details>
                <p className="wb-inspector-footnote">修改后自动保存，用于下次执行。</p>
              </>
            ) : (
              <div className="wb-empty">
                <ListChecks size={30} />
                <h2>添加第一条任务</h2>
                <p>从任务目录选择要执行的能力。</p>
              </div>
            )}
          </section>
        </div>
      )}
      {tab === 'settings' && (
        <div
          className="wb-table-settings"
          id="wb-panel-settings"
          role="tabpanel"
          aria-labelledby="wb-tab-settings"
        >
          <div className="wb-settings-index">
            <a href="#wb-basic">基本信息</a>
            <a href="#wb-device">设备绑定</a>
            <a href="#wb-consumption">消耗汇总</a>
            <a href="#wb-manage">任务表管理</a>
          </div>
          <div className="wb-settings-form">
            <section id="wb-basic">
              <h2>基本信息</h2>
              <div className="wb-fields">
                <label className="param-field">
                  <span className="field-label">任务表名称</span>
                  <input
                    className="text-input"
                    aria-label="任务表名称"
                    maxLength={80}
                    placeholder="例如：晚间日常"
                    value={draft.name}
                    onChange={(event) => patch({ name: event.target.value })}
                  />
                </label>
                <label className="param-field wide">
                  <span className="field-label">说明</span>
                  <textarea
                    className="text-input wb-description"
                    aria-label="任务表说明"
                    maxLength={500}
                    placeholder="记录这张表的用途"
                    value={draft.description}
                    onChange={(event) => patch({ description: event.target.value })}
                  />
                </label>
              </div>
            </section>
            <section id="wb-device">
              <h2>设备绑定</h2>
              <DeviceSelectionList
                ariaLabel="绑定设备"
                items={[
                  ...devices,
                  ...draft.deviceIds
                    .filter((id) => !devices.some((device) => device.id === id))
                    .map((id) => ({ id, name: id, state: 'missing' as const })),
                ]}
                selectedIds={draft.deviceIds}
                selectedLabel="已绑定"
                checkboxLabel={(device) => `绑定设备${device.name}`}
                maxSelected={100}
                emptyMessage="暂无设备，请先在设备页添加。"
                onChange={(deviceIds) => patch({ deviceIds })}
              />
              {draft.deviceIds.length > 0 && (
                <div className="wb-device-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => patch({ deviceIds: [] })}
                  >
                    解除全部绑定
                  </button>
                </div>
              )}
              <p className="wb-helper">
                一张任务表可绑定多台设备，一台设备也可绑定多张任务表；绑定不占用设备。运行时可选择绑定设备，未绑定时可临时选择任意设备，同一设备同时只执行一项操作。切换底栏设备不会改写绑定。
              </p>
              <p className="wb-helper">
                所有绑定设备共用本表的任务、游戏客户端和账号设置；每台设备独立计算本次执行的消耗上限。需要不同配置时请复制任务表。
              </p>
            </section>
            <section id="wb-consumption">
              <h2>消耗汇总</h2>
              <p className="wb-helper">
                <ShieldCheck size={14} />
                {consumableSummary}
              </p>
              <p className="wb-helper">
                上限由本表已启用的自动作战任务分别设置，停用的任务不计入。请在任务编排中调整各项理智药与源石上限；默认均为
                0。
              </p>
            </section>
            <section id="wb-manage">
              <h2>任务表管理</h2>
              <div className="wb-management-actions">
                <button className="button secondary" onClick={exportPlan}>
                  <FileText size={15} />
                  导出任务表
                </button>
                <button className="button secondary" disabled={!dirty} onClick={revert}>
                  <RotateCcw size={15} />
                  {plan === 'new' ? '恢复初始配置' : '恢复已保存配置'}
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
      {tab === 'schedule' && (
        <div id="wb-panel-schedule" role="tabpanel" aria-labelledby="wb-tab-schedule">
          <SchedulePanel
            planId={plan === 'new' ? undefined : plan.id}
            devices={devices}
            settings={settings}
          />
        </div>
      )}
      {plan === 'new' && tab === 'tasks' && (
        <div className="wb-new-name">
          <label htmlFor="wb-new-name">任务表名称</label>
          <input
            id="wb-new-name"
            className="text-input"
            value={draft.name}
            placeholder="先给任务表起一个名字"
            maxLength={80}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </div>
      )}
    </section>
  );
}

function FieldSection({
  title,
  expanded,
  summary,
  children,
}: {
  title: string;
  expanded: boolean;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(expanded);
  useEffect(() => {
    if (expanded) setOpen(true);
  }, [expanded]);
  return (
    <details
      className="wb-field-section"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>{title}</span>
        <small>{!open && summary}</small>
      </summary>
      {children}
    </details>
  );
}
