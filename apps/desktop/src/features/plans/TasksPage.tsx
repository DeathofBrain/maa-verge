import Button from '@/kit/Button';
import Checkbox from '@/kit/Checkbox';
import IconButton from '@/kit/IconButton';
import PageHeading from '@/kit/PageHeading';
import Tabs from '@/kit/Tabs';
import FilterChips from '@/kit/FilterChips';
import SearchField from '@/kit/SearchField';
import EmptyState from '@/kit/EmptyState';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  FileJson,
  ListChecks,
  LoaderCircle,
  Monitor,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import {
  localizeExecutionMessage,
  planDeviceIds,
  type Plan,
  type Run,
  type Snapshot,
} from '@maaverge/contracts';
import { useContextMenu, useContextMenuShow } from '@/kit/ContextMenu';
import SelectAll from '@/shared/ui/SelectAll';
import RunTasksDialog from './RunTasksDialog';
import TaskDetailDrawer from './TaskDetailDrawer';
import './task-center.css';

type Props = {
  snapshot: Snapshot;
  selectedDeviceId: string;
  pending: Set<string>;
  view: 'plans' | 'execution';
  editor?: ReactNode;
  execution: ReactNode;
  onView: (view: 'plans' | 'execution') => void;
  onOpenPlan: (plan: Plan) => void;
  onCreatePlan: () => void;
  onCommand: (plan: Plan, command: 'settings' | 'rename' | 'duplicate' | 'export') => void;
  onDelete: (plan: Plan) => void;
  onDeleteMany: (plans: Plan[]) => void;
  onStart: (plan: Plan, deviceId?: string, requestId?: string) => Promise<boolean>;
  onStop: (run: Run) => Promise<boolean>;
  onShowRun: (run: Run) => void;
  onCloseDetail: () => void;
};
const statusNames: Record<Run['status'], string> = {
  running: '执行中',
  completed: '已完成',
  failed: '执行失败',
  stopped: '已停止',
};
const dateTime = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function TasksPage({
  snapshot,
  selectedDeviceId,
  pending,
  view,
  editor,
  execution,
  onView,
  onOpenPlan,
  onCreatePlan,
  onCommand,
  onDelete,
  onDeleteMany,
  onStart,
  onStop,
  onShowRun,
  onCloseDetail,
}: Props) {
  const contextMenu = useContextMenu();
  const showMenu = useContextMenuShow();
  const [filter, setFilter] = useState<'all' | 'running'>('all');
  const [query, setQuery] = useState('');
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(() => new Set());
  const [runningDialog, setRunningDialog] = useState(false);
  const selectedPlans = snapshot.plans.filter((plan) => selectedPlanIds.has(plan.id));
  const planRuns = useMemo(
    () =>
      snapshot.runs.filter(
        (run): run is Run & { planId: string } => run.source !== 'copilot' && !!run.planId,
      ),
    [snapshot.runs],
  );
  const runningByPlan = useMemo(() => {
    const map = new Map<string, Run[]>();
    for (const run of planRuns)
      if (run.status === 'running') map.set(run.planId, [...(map.get(run.planId) || []), run]);
    return map;
  }, [planRuns]);
  const lastByPlan = useMemo(() => {
    const map = new Map<string, Run>();
    for (const run of [...planRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt)))
      if (!map.has(run.planId)) map.set(run.planId, run);
    return map;
  }, [planRuns]);
  const counts = {
    all: snapshot.plans.length,
    running: snapshot.plans.filter((plan) => runningByPlan.has(plan.id)).length,
  };
  const filters = [
    ['all', '全部'],
    ['running', '执行中'],
  ] as const;
  const term = query.trim().toLowerCase();
  const plans = snapshot.plans.filter((plan) => {
    if (filter === 'running' && !runningByPlan.has(plan.id)) return false;
    if (!term) return true;
    const devices = snapshot.devices.filter((item) => planDeviceIds(plan).includes(item.id));
    return `${plan.name} ${plan.description || ''} ${devices.map((device) => device.name).join(' ')}`
      .toLowerCase()
      .includes(term);
  });
  const menuItems = (plan: Plan) => [
    { label: '任务表设置', action: () => onCommand(plan, 'settings') },
    { label: '重命名', action: () => onCommand(plan, 'rename') },
    { label: '复制任务表', action: () => onCommand(plan, 'duplicate') },
    { label: '导出任务表', action: () => onCommand(plan, 'export') },
    {
      label: '删除任务表',
      danger: true,
      disabled: runningByPlan.has(plan.id),
      action: () => onDelete(plan),
    },
  ];
  const startPending = (plan: Plan) =>
    (planDeviceIds(plan).length ? planDeviceIds(plan) : [selectedDeviceId]).some((id) =>
      pending.has(`start-plan-${id}`),
    );
  const togglePlan = (planId: string) =>
    setSelectedPlanIds((previous) => {
      const next = new Set(previous);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  const selectVisible = (checked: boolean) =>
    setSelectedPlanIds((previous) => {
      const next = new Set(previous);
      for (const plan of plans) {
        if (checked) next.add(plan.id);
        else next.delete(plan.id);
      }
      return next;
    });
  useEffect(() => {
    setSelectedPlanIds((previous) => {
      const next = new Set(
        [...previous].filter((id) => snapshot.plans.some((plan) => plan.id === id)),
      );
      return next.size === previous.size ? previous : next;
    });
  }, [snapshot.plans]);

  return (
    <section className="tc-page" aria-label="任务中心">
      <PageHeading
        className="tc-heading"
        actionsClassName="tc-heading-actions"
        title="任务"
        icon={<ListChecks />}
        text="管理任务表与多开"
        actions={
          <>
            <Button
              aria-label="运行"
              title={selectedPlans.length ? '运行所选任务表' : '请先勾选任务表'}
              onClick={() => setRunningDialog(true)}
              disabled={!selectedPlans.length}
            >
              <Play size={15} />
              运行
            </Button>
            <Button variant="primary" onClick={onCreatePlan}>
              <Plus size={15} />
              新建任务表
            </Button>
          </>
        }
      />
      <Tabs
        className="tc-view-tabs"
        aria-label="任务视图"
        idPrefix="tc"
        value={view}
        onChange={(id) => onView(id as Props['view'])}
        items={[
          {
            id: 'plans',
            label: (
              <>
                <ListChecks size={16} />
                任务表
              </>
            ),
            ariaLabel: '任务表',
            count: counts.all,
          },
          {
            id: 'execution',
            label: (
              <>
                <Monitor size={16} />
                执行监控
              </>
            ),
            ariaLabel: '执行监控',
            count: counts.running,
          },
        ]}
      />
      {view === 'execution' ? (
        <div
          className="tc-execution-panel"
          id="tc-panel-execution"
          role="tabpanel"
          aria-labelledby="tc-tab-execution"
        >
          {execution}
        </div>
      ) : (
        <div
          className="tc-plans-scroll"
          id="tc-panel-plans"
          role="tabpanel"
          aria-labelledby="tc-tab-plans"
        >
          <div className="tc-toolbar">
            <div className="tc-toolbar-main">
              <SelectAll
                label="全选任务表"
                total={plans.length}
                selected={plans.filter((plan) => selectedPlanIds.has(plan.id)).length}
                onChange={selectVisible}
              />
              <FilterChips
                variant="subtle"
                aria-label="筛选任务表"
                value={filter}
                onChange={(id) => setFilter(id as typeof filter)}
                items={filters.map(([id, label]) => ({ id, label, count: counts[id] }))}
              />
            </div>
            <SearchField
              className="tc-search"
              aria-label="搜索任务表"
              placeholder="搜索任务表、说明或设备"
              value={query}
              onValueChange={setQuery}
            />
          </div>
          {selectedPlans.length > 0 && (
            <div className="tc-selection-actions" role="group" aria-label="所选任务表操作">
              <strong aria-live="polite">已选 {selectedPlans.length} 张任务表</strong>
              <div>
                <Button variant="primary" onClick={() => setRunningDialog(true)}>
                  <Play size={14} />
                  同时执行
                </Button>
                <Button
                  variant="danger"
                  disabled={pending.has('delete-plan')}
                  onClick={() => onDeleteMany(selectedPlans)}
                >
                  <Trash2 size={14} />
                  批量删除
                </Button>
                <Button onClick={() => setSelectedPlanIds(new Set())}>取消选择</Button>
              </div>
            </div>
          )}
          {!snapshot.plans.length ? (
            <EmptyState
              variant="panel"
              icon={
                <span className="tc-empty-icon">
                  <ListChecks size={30} />
                </span>
              }
              title="创建第一张任务表"
              text="把启动游戏、基建、公招与作战按顺序安排好，再绑定设备开始执行。"
              action={
                <Button variant="primary" onClick={onCreatePlan}>
                  <Plus size={16} />
                  新建任务表
                </Button>
              }
            />
          ) : !plans.length ? (
            <EmptyState
              variant="panel"
              icon={
                <span className="tc-empty-icon">
                  <Search size={28} />
                </span>
              }
              title="没有匹配的任务表"
              text="调整筛选条件或搜索其他任务表、设备。"
              action={
                <Button
                  onClick={() => {
                    setFilter('all');
                    setQuery('');
                  }}
                >
                  清除筛选
                </Button>
              }
            />
          ) : (
            <section className="tc-plan-list" aria-label="任务表列表">
              {plans.map((plan) => {
                const activeRuns = runningByPlan.get(plan.id) || [];
                const active = activeRuns[0];
                const last = lastByPlan.get(plan.id);
                const enabled = plan.tasks.filter((task) => task.enabled !== false).length;
                const bindings = planDeviceIds(plan);
                const boundNames = bindings.map(
                  (id) =>
                    snapshot.devices.find((device) => device.id === id)?.name ||
                    `未发现的设备（${id}）`,
                );
                const starting = startPending(plan);
                return (
                  <article
                    className={`tc-plan-row ${selectedPlanIds.has(plan.id) ? 'is-checked' : ''}`}
                    key={plan.id}
                    aria-label={`任务表 ${plan.name}`}
                    tabIndex={0}
                    {...contextMenu('任务表菜单', menuItems(plan))}
                  >
                    <label className="tc-plan-check">
                      <Checkbox
                        aria-label={`选择任务表${plan.name}`}
                        checked={selectedPlanIds.has(plan.id)}
                        onChange={() => togglePlan(plan.id)}
                      />
                    </label>
                    <div className="tc-plan-main">
                      <div className="tc-plan-name">
                        <span className="tc-plan-icon">
                          <FileJson size={17} />
                        </span>
                        <span className="tc-plan-copy">
                          <strong>{plan.name}</strong>
                          <small>
                            {plan.description || '按顺序执行任务；点击详情打开并编辑。'}
                          </small>
                        </span>
                      </div>
                      <div className="tc-plan-meta">
                        <span>
                          {plan.tasks.length} 项任务 · {enabled} 项启用
                        </span>
                        <span>
                          <Monitor size={13} />
                          {bindings.length
                            ? `绑定 ${bindings.length} 台 · ${boundNames.slice(0, 2).join('、')}${bindings.length > 2 ? ' 等' : ''}`
                            : '未绑定设备'}
                        </span>
                        {active ? (
                          <span className="tc-last-run running">
                            <LoaderCircle size={13} className="spin" />
                            {statusNames[active.status]} · {activeRuns.length} 台设备 ·{' '}
                            {localizeExecutionMessage(active.message) || '等待反馈'}
                          </span>
                        ) : last ? (
                          <span className={`tc-last-run ${last.status}`}>
                            {last.status === 'failed' ? <Square size={11} /> : null}最近执行{' '}
                            {statusNames[last.status]} · {dateTime(last.startedAt)}
                          </span>
                        ) : (
                          <span className="tc-last-run">尚未执行</span>
                        )}
                      </div>
                    </div>
                    <div className="tc-plan-actions">
                      {active && (
                        <Button
                          className="tc-plan-main-action"
                          size="compact"
                          onClick={() => onShowRun(active)}
                        >
                          查看执行
                        </Button>
                      )}
                      <Button
                        className="tc-plan-main-action"
                        size="compact"
                        variant="primary"
                        disabled={starting}
                        onClick={() => void onStart(plan)}
                      >
                        {starting ? (
                          <LoaderCircle size={14} className="spin" />
                        ) : (
                          <Play size={14} />
                        )}
                        {starting ? '正在开始…' : '开始执行'}
                      </Button>
                      <Button
                        className="tc-plan-main-action"
                        size="compact"
                        aria-label={`查看任务表详情${plan.name}`}
                        onClick={() => onOpenPlan(plan)}
                      >
                        详情
                      </Button>
                      {active && (
                        <Button
                          size="compact"
                          variant="danger"
                          disabled={activeRuns.some((run) => pending.has(`stop-${run.id}`))}
                          aria-label={`停止任务表${plan.name}`}
                          onClick={() => void Promise.all(activeRuns.map((run) => onStop(run)))}
                        >
                          <Square size={12} />
                          停止
                        </Button>
                      )}
                      <IconButton
                        label={`更多任务表操作${plan.name}`}
                        title="更多操作"
                        onClick={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          showMenu({
                            x: rect.right - 180,
                            y: rect.bottom + 4,
                            target: event.currentTarget,
                            items: menuItems(plan),
                            label: '任务表菜单',
                          });
                        }}
                      >
                        <MoreHorizontal size={18} />
                      </IconButton>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
          {snapshot.plans.length > 0 && (
            <p className="tc-footnote">
              勾选任务表后可同时执行或批量删除；同一设备同时只允许执行一张任务表。修改任务表不改变已经启动的执行快照。
            </p>
          )}
        </div>
      )}
      {runningDialog && (
        <RunTasksDialog
          snapshot={snapshot}
          plans={selectedPlans}
          selectedDeviceId={selectedDeviceId}
          pending={pending}
          onStart={onStart}
          onClose={() => setRunningDialog(false)}
        />
      )}
      {editor && <TaskDetailDrawer onClose={onCloseDetail}>{editor}</TaskDetailDrawer>}
    </section>
  );
}
