import { useEffect, useRef, useState } from 'react';
import {
  CalendarClock,
  Check,
  Info,
  ListChecks,
  LoaderCircle,
  Play,
  Settings2,
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
import { clients, taskCategories } from './features/plans/task-fields';
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
  type Draft,
  type Step,
  type Tab,
  type WorkbenchPlan,
} from './features/plans/plan-draft';
import { useContextMenu } from './kit/ContextMenu';
import TaskQueueView from './features/plans/TaskQueueView';
import TaskInspectorView from './features/plans/TaskInspectorView';
import TaskTableSettings from './features/plans/TaskTableSettings';
import './plan-workbench.css';
import SchedulePanel from './SchedulePanel';

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
          <TaskQueueView
            steps={draft.steps}
            selected={selected}
            contextMenu={contextMenu}
            onSelect={selectTask}
            onToggle={setEnabled}
            onReorder={reorder}
            onDuplicate={duplicateTask}
            onDelete={deleteTask}
            dragKey={dragKey}
            onDragKey={setDragKey}
            typeSearch={typeSearch}
            onTypeSearch={setTypeSearch}
            filteredTypes={filteredTypes}
            addType={addType}
            onAddType={(type) => setAddType(type as Task['type'])}
            onAdd={addTask}
          />
          <TaskInspectorView
            step={step}
            draft={draft}
            selected={selected}
            plan={plan}
            unsaved={unsaved}
            dirty={dirty}
            saving={saving}
            starting={starting}
            fieldSearch={fieldSearch}
            setFieldSearch={setFieldSearch}
            validJson={validJson}
            advanced={advanced}
            setAdvanced={setAdvanced}
            setJson={setJson}
            setParams={setParams}
            taskClient={taskClient}
            consumableSummary={consumableSummary}
            syncDevice={syncDevice}
            contextDeviceId={contextDeviceId}
            onOpenDeviceSettings={onOpenDeviceSettings}
            onCopyCopilot={onCopyCopilot}
            setMobileDetail={setMobileDetail}
            reorder={reorder}
            duplicateTask={duplicateTask}
            deleteTask={deleteTask}
          />
        </div>
      )}
      {tab === 'settings' && (
        <TaskTableSettings
          draft={draft}
          devices={devices}
          patch={patch}
          consumableSummary={consumableSummary}
          plan={plan}
          dirty={dirty}
          onExport={exportPlan}
          onRevert={revert}
        />
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
