import Checkbox from '@/kit/Checkbox';
import IconButton from '@/kit/IconButton';
import { runDisplayName, runSourceLabel } from '@/shared/lib/run-source';
import { useContextMenu, useContextMenuShow, type MenuItem } from '@/kit/ContextMenu';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Check,
  CircleCheck,
  Clock3,
  LoaderCircle,
  Monitor,
  MoreHorizontal,
  Search,
  Square,
  Terminal,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import {
  errorMessage,
  localizeExecutionMessage,
  planDeviceIds,
  rpc,
  type Device,
  type Run,
  type Snapshot,
  type ToolJobSummary,
} from '@maaverge/contracts';
import SelectAll from '@/shared/ui/SelectAll';
import ExecutionPage from './ExecutionPage';
import MonitorLogDrawer from './MonitorLogDrawer';
import Button from '@/kit/Button';
import EmptyState from '@/kit/EmptyState';
import ErrorBanner from '@/kit/ErrorBanner';
import FilterChips from '@/kit/FilterChips';
import ProgressBar from '@/kit/ProgressBar';
import SearchField from '@/kit/SearchField';
import './execution-monitor.css';

type Props = {
  snapshot: Snapshot;
  selectedRun?: Run;
  selectedDeviceId?: string;
  onSelectDevice?: (id: string) => void;
  pending: Set<string>;
  onSelectRun: (run: Run) => void;
  onRunUpdate: (run: Run) => void;
  onOverview: () => void;
  onStop: (run: Run) => Promise<boolean>;
  onStopMany: (runs: Run[]) => Promise<boolean>;
  onPrepare: () => void;
  onDevicesDeleted: () => Promise<void>;
};
type DeviceFilter = 'all' | 'running' | 'idle' | 'offline';
const statusNames: Record<Run['status'], string> = {
  running: '执行中',
  completed: '已完成',
  failed: '执行失败',
  stopped: '已停止',
};
const toolNames: Record<ToolJobSummary['kind'], string> = {
  depot: '仓库识别',
  operators: '干员识别',
  recruit: '公招计算',
  inventory: '库存保持',
  data: '数据管理',
  games: '小游戏',
};
const dateTime = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
function elapsed(run: Run | ToolJobSummary, now: number) {
  const seconds = Math.max(
    0,
    Math.floor(
      ((run.finishedAt ? Date.parse(run.finishedAt) : now) - Date.parse(run.startedAt)) / 1000,
    ),
  );
  if (!Number.isFinite(seconds)) return '—';
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)} 时 ${Math.floor((seconds % 3600) / 60)} 分`
    : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
function newestFirst(a: Run | ToolJobSummary, b: Run | ToolJobSummary) {
  return b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id);
}
function categoryOf(device: Device, active?: Run | ToolJobSummary): Exclude<DeviceFilter, 'all'> {
  if (device.state === 'offline') return 'offline';
  if (active || device.state === 'running') return 'running';
  return 'idle';
}

export default function ExecutionMonitor({
  snapshot,
  selectedRun,
  selectedDeviceId,
  onSelectDevice,
  pending,
  onSelectRun,
  onRunUpdate,
  onOverview,
  onStop,
  onStopMany,
  onPrepare,
  onDevicesDeleted,
}: Props) {
  const contextMenu = useContextMenu();
  const showMenu = useContextMenuShow();
  const [filter, setFilter] = useState<DeviceFilter>('all');
  const [query, setQuery] = useState('');
  const [clock, setClock] = useState(Date.now);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [logDevices, setLogDevices] = useState<string[] | null>(null);
  const [deviceId, setDeviceId] = useState(selectedRun?.deviceId || '');
  const currentDeviceId = useRef(deviceId);
  currentDeviceId.current = deviceId;
  const [historyToolId, setHistoryToolId] = useState('');
  const [bulkStopping, setBulkStopping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [toolPending, setToolPending] = useState<Set<string>>(() => new Set());
  const [toolResults, setToolResults] = useState<Map<string, ToolJobSummary>>(() => new Map());
  const [operationError, setOperationError] = useState('');
  const toolPendingRef = useRef(new Set<string>());
  const previousHeaderDevice = useRef(selectedDeviceId);
  const deletedHeaderDevice = useRef<string | undefined>(undefined);
  const monitorScroll = useRef<HTMLDivElement>(null);
  const tools = (snapshot.toolJobs || []).map((job) => toolResults.get(job.id) || job);
  const activeByDevice = new Map<string, Run>();
  for (const run of [...snapshot.runs].sort(newestFirst)) {
    if (run.status === 'running' && !activeByDevice.has(run.deviceId))
      activeByDevice.set(run.deviceId, run);
  }
  const activeToolsByDevice = new Map<string, ToolJobSummary>();
  for (const job of [...tools].sort(newestFirst)) {
    if (job.status === 'running' && !activeToolsByDevice.has(job.deviceId))
      activeToolsByDevice.set(job.deviceId, job);
  }
  // A disconnected device may retain an unfinished record, but it has no live controls.
  for (const device of snapshot.devices) {
    if (device.state === 'offline') {
      activeByDevice.delete(device.id);
      activeToolsByDevice.delete(device.id);
    }
  }
  const latestByDevice = useMemo(() => {
    const map = new Map<string, Run>();
    for (const run of [...snapshot.runs].sort(newestFirst))
      if (!map.has(run.deviceId)) map.set(run.deviceId, run);
    return map;
  }, [snapshot.runs]);
  const latestToolsByDevice = new Map<string, ToolJobSummary>();
  for (const job of [...tools].sort(newestFirst))
    if (!latestToolsByDevice.has(job.deviceId)) latestToolsByDevice.set(job.deviceId, job);
  const categories = new Map(
    snapshot.devices.map((device) => [
      device.id,
      categoryOf(device, activeByDevice.get(device.id) || activeToolsByDevice.get(device.id)),
    ]),
  );
  const hasRunning = [...categories.values()].includes('running');
  useEffect(() => {
    if (!hasRunning) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunning]);
  useLayoutEffect(() => {
    if (!selectedRun) return;
    setDeviceId(selectedRun.deviceId);
    setHistoryToolId('');
    setFilter('all');
    setQuery('');
  }, [selectedRun?.id, selectedRun?.deviceId]);
  useEffect(() => {
    if (previousHeaderDevice.current === selectedDeviceId) return;
    const previous = previousHeaderDevice.current;
    previousHeaderDevice.current = selectedDeviceId;
    if (
      previous === deletedHeaderDevice.current &&
      previous &&
      !snapshot.devices.some((device) => device.id === previous)
    ) {
      deletedHeaderDevice.current = undefined;
      return;
    }
    if (!selectedDeviceId || selectedRun?.deviceId === selectedDeviceId) return;
    setDeviceId(selectedDeviceId);
    setHistoryToolId('');
    onOverview();
  }, [selectedDeviceId, selectedRun?.deviceId, onOverview, snapshot.devices]);
  useLayoutEffect(() => {
    monitorScroll.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [deviceId, selectedRun?.id]);
  useEffect(() => {
    setSelected((previous) => {
      const next = new Set(
        [...previous].filter((id) => snapshot.devices.some((device) => device.id === id)),
      );
      return next.size === previous.size ? previous : next;
    });
  }, [snapshot.devices]);
  const counts = {
    all: snapshot.devices.length,
    running: snapshot.devices.filter((device) => categories.get(device.id) === 'running').length,
    idle: snapshot.devices.filter((device) => categories.get(device.id) === 'idle').length,
    offline: snapshot.devices.filter((device) => categories.get(device.id) === 'offline').length,
  };
  const term = query.trim().toLocaleLowerCase();
  const visibleDevices = snapshot.devices
    .filter((device) => {
      if (filter !== 'all' && categories.get(device.id) !== filter) return false;
      if (!term) return true;
      const run = activeByDevice.get(device.id) || latestByDevice.get(device.id);
      const tool = activeToolsByDevice.get(device.id) || latestToolsByDevice.get(device.id);
      const bound = snapshot.plans.filter((plan) => planDeviceIds(plan).includes(device.id));
      return `${device.name} ${device.address} ${run ? runDisplayName(run, snapshot.plans) : ''} ${run ? localizeExecutionMessage(run.message) : ''} ${tool ? toolNames[tool.kind] + ' ' + localizeExecutionMessage(tool.message) : ''} ${bound.map((plan) => plan.name).join(' ')}`
        .toLocaleLowerCase()
        .includes(term);
    })
    .sort((a, b) => {
      const rank = { running: 0, idle: 1, offline: 2 };
      return (
        rank[categories.get(a.id)!] - rank[categories.get(b.id)!] ||
        a.name.localeCompare(b.name, 'zh-CN')
      );
    });
  const selectedRuns = snapshot.devices
    .filter((device) => selected.has(device.id))
    .flatMap((device) => {
      const run = activeByDevice.get(device.id);
      return run ? [run] : [];
    });
  const selectedTools = snapshot.devices
    .filter((device) => selected.has(device.id))
    .flatMap((device) => {
      const job = activeToolsByDevice.get(device.id);
      return job ? [job] : [];
    });
  const canDeleteSelected =
    selected.size > 0 &&
    [...selected].every((id) =>
      snapshot.devices.some((device) => device.id === id && device.state === 'offline'),
    );
  const chooseDevice = (id: string) => {
    setDeviceId(id);
    setHistoryToolId('');
    onOverview();
    if (id) onSelectDevice?.(id);
  };
  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectVisible = (checked: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      for (const device of visibleDevices) {
        if (checked) next.add(device.id);
        else next.delete(device.id);
      }
      return next;
    });
  const stopTool = async (job: ToolJobSummary) => {
    if (toolPendingRef.current.has(job.id)) return false;
    toolPendingRef.current.add(job.id);
    setToolPending(new Set(toolPendingRef.current));
    setOperationError('');
    try {
      const result = await rpc('tool.stop', { id: job.id });
      setToolResults((previous) => {
        const next = new Map(previous);
        if (result.status === 'running') next.delete(result.id);
        else next.set(result.id, result);
        return next;
      });
      return true;
    } catch (cause) {
      setOperationError(`工具停止失败：${errorMessage(cause)}`);
      return false;
    } finally {
      toolPendingRef.current.delete(job.id);
      setToolPending(new Set(toolPendingRef.current));
    }
  };
  const stopSelected = async () => {
    if ((!selectedRuns.length && !selectedTools.length) || bulkStopping) return;
    setBulkStopping(true);
    try {
      await Promise.allSettled([
        ...(selectedRuns.length ? [onStopMany(selectedRuns)] : []),
        ...selectedTools.map(stopTool),
      ]);
      setSelected(new Set());
    } finally {
      setBulkStopping(false);
    }
  };
  const deleteDevices = async (deviceIds: string[]) => {
    if (deletingRef.current || !deviceIds.length) return;
    deletingRef.current = true;
    setDeleting(true);
    setOperationError('');
    if (selectedDeviceId && deviceIds.includes(selectedDeviceId))
      deletedHeaderDevice.current = selectedDeviceId;
    try {
      await rpc('device.delete', { deviceIds });
      setSelected((previous) => new Set([...previous].filter((id) => !deviceIds.includes(id))));
      if (deletedHeaderDevice.current !== previousHeaderDevice.current)
        deletedHeaderDevice.current = undefined;
      if (deviceIds.includes(currentDeviceId.current)) {
        setDeviceId('');
        setHistoryToolId('');
        onOverview();
      }
      setLogDevices((previous) => {
        const next = previous?.filter((id) => !deviceIds.includes(id));
        return next?.length ? next : null;
      });
      await onDevicesDeleted();
    } catch (cause) {
      deletedHeaderDevice.current = undefined;
      setOperationError(`删除历史设备失败：${errorMessage(cause)}`);
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };
  const currentDevice = snapshot.devices.find((device) => device.id === deviceId);
  const currentCategory = currentDevice ? categories.get(currentDevice.id) : undefined;
  const currentRun = activeByDevice.get(deviceId);
  const currentTool = activeToolsByDevice.get(deviceId);
  const requestedRun = selectedRun?.deviceId === deviceId ? selectedRun : undefined;
  const historicalRun = requestedRun?.status !== 'running' ? requestedRun : undefined;
  // Detail polling keeps an explicitly selected live run tied to its ID when it
  // temporarily falls out of summary snapshots. Finished selections stay exact.
  const displayedRun = historyToolId
    ? undefined
    : historicalRun || (currentCategory !== 'offline' ? requestedRun || currentRun : undefined);
  const displayedTool = historyToolId
    ? tools.find((job) => job.id === historyToolId)
    : displayedRun
      ? undefined
      : currentTool;
  const showingHistory = !!historicalRun || !!historyToolId;
  const latestRun = [...snapshot.runs]
    .sort(newestFirst)
    .find((run) => run.deviceId === deviceId && run.status !== 'running');
  const latestTool = [...tools]
    .sort(newestFirst)
    .find((job) => job.deviceId === deviceId && job.status !== 'running');
  const latestIsTool = latestTool && (!latestRun || newestFirst(latestTool, latestRun) < 0);
  const boundPlans = snapshot.plans.filter((plan) => planDeviceIds(plan).includes(deviceId));
  const filters: { id: DeviceFilter; label: string; count: number }[] = [
    { id: 'all', label: '全部', count: counts.all },
    { id: 'running', label: '执行中', count: counts.running },
    { id: 'idle', label: '空闲', count: counts.idle },
    { id: 'offline', label: '离线', count: counts.offline },
  ];
  return (
    <section className="execution-monitor" aria-label="任务表执行监控">
      <div className="monitor-scroll" ref={monitorScroll}>
        <div className="monitor-toolbar">
          <div className="monitor-toolbar-main">
            <SelectAll
              label="全选监控设备"
              total={visibleDevices.length}
              selected={visibleDevices.filter((device) => selected.has(device.id)).length}
              onChange={selectVisible}
            />
            <FilterChips
              variant="subtle"
              className="monitor-filters"
              aria-label="筛选监控设备"
              value={filter}
              onChange={(id) => setFilter(id as DeviceFilter)}
              items={filters.map((item) => ({
                id: item.id,
                label: item.label,
                ariaLabel: item.label,
                count: item.count,
              }))}
            />
          </div>
          <SearchField
            className="monitor-search"
            aria-label="搜索监控设备"
            value={query}
            onValueChange={setQuery}
            placeholder="搜索设备、任务或反馈"
            icon={<Search size={15} />}
          />
        </div>
        {operationError && <ErrorBanner className="error-banner">{operationError}</ErrorBanner>}
        {selected.size > 0 && (
          <div className="monitor-bulk-bar" role="region" aria-label="设备批量操作">
            <span role="status">已选 {selected.size} 台设备</span>
            <div>
              <Button
                size="compact"
                icon={<Terminal size={14} />}
                onClick={() => setLogDevices([...selected])}
              >
                查看日志
              </Button>
              <Button
                size="compact"
                variant="danger"
                icon={<Square size={12} />}
                busy={bulkStopping}
                disabled={(!selectedRuns.length && !selectedTools.length) || bulkStopping}
                onClick={() => void stopSelected()}
              >
                停止所选
              </Button>
              <Button
                size="compact"
                variant="danger"
                icon={<Trash2 size={14} />}
                busy={deleting}
                disabled={!canDeleteSelected || deleting}
                title={!canDeleteSelected ? '仅可删除离线历史设备' : '删除所选历史设备'}
                onClick={() => void deleteDevices([...selected])}
              >
                批量删除
              </Button>
              <Button variant="text" onClick={() => setSelected(new Set())}>
                清除
              </Button>
            </div>
            {!canDeleteSelected && <p className="monitor-bulk-hint">仅可删除离线历史设备</p>}
          </div>
        )}
        <section className="monitor-devices" aria-label="设备执行列表">
          <header className="monitor-device-list-heading">
            <h2>设备列表</h2>
            <div className="monitor-summary" role="status">
              <span>
                <b>{counts.all}</b> 台设备
              </span>
              <span className="running">
                <i className="monitor-live-dot" />
                {counts.running} 台执行中
              </span>
            </div>
          </header>
          {!snapshot.devices.length ? (
            <EmptyState
              className="monitor-empty"
              icon={<Monitor size={34} />}
              title="还没有设备"
              text="请先在设备页添加并连接模拟器实例，执行状态会显示在这里。"
            />
          ) : !visibleDevices.length ? (
            <EmptyState
              className="monitor-empty"
              icon={<Search size={30} />}
              title="没有匹配的设备"
              text="调整筛选条件，或搜索其他设备、任务与反馈。"
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
            <div className="monitor-device-list-scroll">
              <div className="monitor-device-list">
                {visibleDevices.map((device) => {
                  const run = activeByDevice.get(device.id);
                  const job = activeToolsByDevice.get(device.id);
                  const active = run || job;
                  const latest = latestByDevice.get(device.id);
                  const latestJob = latestToolsByDevice.get(device.id);
                  const recentTool =
                    latestJob && (!latest || newestFirst(latestJob, latest) < 0)
                      ? latestJob
                      : undefined;
                  const recent = recentTool ? latestJob : latest;
                  const category = categories.get(device.id)!;
                  const isCurrent = deviceId === device.id;
                  const menuItems: MenuItem[] = [
                    { label: '查看设备执行', action: () => chooseDevice(device.id) },
                    { label: '查看设备日志', action: () => setLogDevices([device.id]) },
                    {
                      label: '停止设备任务',
                      danger: true,
                      disabled:
                        !active || (run ? pending.has(`stop-${run.id}`) : toolPending.has(job!.id)),
                      action: () => {
                        if (run) void onStop(run);
                        else if (job) void stopTool(job);
                      },
                    },
                    ...(category === 'offline'
                      ? [
                          {
                            label: '删除历史设备',
                            danger: true,
                            disabled: deleting,
                            action: () => void deleteDevices([device.id]),
                          },
                        ]
                      : []),
                  ];
                  return (
                    <article
                      className={`monitor-device-row ${category} ${selected.has(device.id) ? 'is-selected' : ''} ${isCurrent ? 'is-current' : ''}`}
                      key={device.id}
                      aria-label={`设备执行${device.name}`}
                      {...contextMenu('设备执行菜单', menuItems)}
                    >
                      <label className="monitor-device-check">
                        <Checkbox
                          aria-label={`选择设备${device.name}`}
                          checked={selected.has(device.id)}
                          onChange={() => toggle(device.id)}
                        />
                      </label>
                      <button
                        className="monitor-device-main"
                        aria-label={`查看设备执行${device.name}`}
                        aria-pressed={isCurrent}
                        aria-expanded={isCurrent}
                        aria-controls="monitor-selected-device"
                        onClick={() => chooseDevice(isCurrent ? '' : device.id)}
                      >
                        <span className="monitor-device-name">
                          <span className="monitor-device-icon">
                            <Monitor size={17} />
                          </span>
                          <span className="monitor-device-copy">
                            <strong>
                              {device.name}
                              <small
                                className={`monitor-device-connection ${category === 'offline' ? 'offline' : 'connected'}`}
                              >
                                {category !== 'offline' && <CircleCheck size={12} />}
                                {category === 'offline' ? '已离线' : '已连接'}
                              </small>
                              {category !== 'offline' && (
                                <small className={`monitor-device-state ${category}`}>
                                  {category === 'running' ? '执行中' : '空闲'}
                                </small>
                              )}
                            </strong>
                            {(active || category === 'running') && (
                              <small>
                                {active
                                  ? localizeExecutionMessage(active.message) ||
                                    statusNames[active.status]
                                  : '等待执行状态'}
                              </small>
                            )}
                          </span>
                        </span>
                        {active && (
                          <ProgressBar
                            className="monitor-progress"
                            value={active.progress}
                            label={`${device.name}执行进度`}
                          />
                        )}
                        <span className="monitor-device-meta">
                          <span>{device.address}</span>
                          {active ? (
                            <>
                              <span className="monitor-status running">
                                <LoaderCircle size={12} className="spin" />
                                {active.progress}%
                              </span>
                              <span>
                                {run
                                  ? `${runSourceLabel(run)} · ${runDisplayName(run, snapshot.plans)}`
                                  : `工具 · ${toolNames[job!.kind]}`}
                              </span>
                              <span>
                                <Clock3 size={12} />
                                {elapsed(active, clock)}
                              </span>
                            </>
                          ) : (
                            <span>
                              {recent
                                ? `最近执行：${recentTool ? toolNames[recentTool.kind] : runDisplayName(latest!, snapshot.plans)}${recent.status === 'running' ? '' : ` · ${statusNames[recent.status]}`}`
                                : '尚未执行任务'}
                            </span>
                          )}
                        </span>
                        <span className="monitor-device-open">
                          {isCurrent ? '收起执行' : '查看执行'}
                          <ArrowDown size={12} />
                        </span>
                      </button>
                      <div className="monitor-device-actions">
                        <Button
                          className="monitor-device-action"
                          icon={<Terminal size={14} />}
                          aria-label={`查看设备日志${device.name}`}
                          onClick={() => setLogDevices([device.id])}
                        >
                          日志
                        </Button>
                        {active && (
                          <Button
                            className="monitor-device-action"
                            variant="danger"
                            icon={<Square size={12} />}
                            busy={run ? pending.has(`stop-${run.id}`) : toolPending.has(job!.id)}
                            aria-label={`停止设备任务${device.name}`}
                            disabled={
                              run ? pending.has(`stop-${run.id}`) : toolPending.has(job!.id)
                            }
                            onClick={() => {
                              if (run) void onStop(run);
                              else if (job) void stopTool(job);
                            }}
                          >
                            停止
                          </Button>
                        )}
                        <IconButton
                          className="monitor-device-menu"
                          label={`设备操作${device.name}`}
                          aria-haspopup="menu"
                          title="更多操作"
                          onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            showMenu({
                              x: rect.right - 180,
                              y: rect.bottom + 4,
                              target: event.currentTarget,
                              items: menuItems,
                              label: '设备执行菜单',
                            });
                          }}
                        >
                          <MoreHorizontal size={18} />
                        </IconButton>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </section>
        {currentDevice ? (
          <section
            id="monitor-selected-device"
            className="monitor-selected-device"
            aria-label="所选设备执行情况"
          >
            <header className="monitor-selection-heading">
              <div>
                <span>所选设备</span>
                <h2>
                  {currentDevice.name}
                  <small className={`monitor-device-state ${currentCategory}`}>
                    {currentCategory === 'offline'
                      ? '离线'
                      : currentCategory === 'running'
                        ? '执行中'
                        : '空闲'}
                  </small>
                </h2>
              </div>
            </header>
            <section className="monitor-device-info" aria-label="设备信息">
              <dl className="monitor-device-info-grid">
                <div>
                  <dt>连接地址</dt>
                  <dd>{currentDevice.address}</dd>
                </div>
                <div>
                  <dt>核心版本</dt>
                  <dd>{currentDevice.coreVersion || '未加载'}</dd>
                </div>
                <div>
                  <dt>资源版本</dt>
                  <dd>{currentDevice.resourceVersion || '未加载'}</dd>
                </div>
                <div>
                  <dt>绑定任务表</dt>
                  <dd>{boundPlans.map((plan) => plan.name).join('、') || '未绑定'}</dd>
                </div>
              </dl>
              {currentDevice.state === 'offline' && currentDevice.connectionError && (
                <p className="monitor-device-error" role="alert">
                  {errorMessage(currentDevice.connectionError)}
                </p>
              )}
            </section>
            {showingHistory && (
              <div className="monitor-history-notice" role="status">
                <span>
                  正在查看历史执行
                  {currentCategory === 'offline'
                    ? ' · 设备已离线'
                    : currentRun || currentTool
                      ? ' · 当前设备另有执行'
                      : ' · 当前没有任务'}
                </span>
                <Button
                  variant="text"
                  onClick={() => {
                    setHistoryToolId('');
                    onOverview();
                  }}
                >
                  查看当前执行
                </Button>
              </div>
            )}
            {displayedRun ? (
              <ExecutionPage
                key={displayedRun.id}
                snapshot={snapshot}
                run={displayedRun}
                onRunUpdate={onRunUpdate}
                onPrepare={onPrepare}
              />
            ) : displayedTool ? (
              <section className="monitor-tool-execution" aria-label="工具执行状态">
                <header>
                  <h3>{toolNames[displayedTool.kind]}</h3>
                  <span className={`monitor-status ${displayedTool.status}`}>
                    <RunIcon status={displayedTool.status} />
                    {statusNames[displayedTool.status]}
                  </span>
                </header>
                <p>{localizeExecutionMessage(displayedTool.message)}</p>
                <ProgressBar value={displayedTool.progress} label="工具执行进度" />
                <dl className="monitor-tool-times">
                  <div>
                    <dt>开始时间</dt>
                    <dd>{dateTime(displayedTool.startedAt)}</dd>
                  </div>
                  {displayedTool.finishedAt && (
                    <div>
                      <dt>结束时间</dt>
                      <dd>{dateTime(displayedTool.finishedAt)}</dd>
                    </div>
                  )}
                </dl>
                {displayedTool.status === 'running' && currentCategory !== 'offline' && (
                  <Button
                    variant="danger"
                    icon={<Square size={12} />}
                    disabled={toolPending.has(displayedTool.id)}
                    onClick={() => void stopTool(displayedTool)}
                  >
                    停止工具
                  </Button>
                )}
              </section>
            ) : (
              <div className="monitor-idle-state">
                <Monitor size={30} />
                <h2>
                  {currentCategory === 'offline'
                    ? '设备已离线'
                    : currentCategory === 'running'
                      ? '正在等待执行状态'
                      : '当前没有任务'}
                </h2>
                <p>
                  {currentCategory === 'offline'
                    ? '重新连接后才能执行任务；历史记录仍可查看。'
                    : currentCategory === 'running'
                      ? '设备已被占用，收到执行信息后会显示在这里。'
                      : '在任务页或作业中心开始执行后，进度与结果会显示在这里。'}
                </p>
                {(latestRun || latestTool) && (
                  <Button
                    onClick={() => {
                      if (latestIsTool) {
                        setHistoryToolId(latestTool!.id);
                        onOverview();
                      } else if (latestRun) onSelectRun(latestRun);
                    }}
                  >
                    查看上次执行
                  </Button>
                )}
              </div>
            )}
          </section>
        ) : historicalRun ? (
          <section
            id="monitor-selected-device"
            className="monitor-selected-device"
            aria-label="历史设备执行情况"
          >
            <p className="monitor-history-notice" role="status">
              设备历史已删除，仍可查看此次执行记录。
            </p>
            <ExecutionPage
              key={historicalRun.id}
              snapshot={snapshot}
              run={historicalRun}
              onRunUpdate={onRunUpdate}
              onPrepare={onPrepare}
            />
          </section>
        ) : (
          snapshot.devices.length > 0 && (
            <div className="monitor-empty monitor-select-prompt">
              <Monitor size={30} />
              <h2>选择一台设备</h2>
            </div>
          )
        )}
      </div>
      {logDevices && (
        <MonitorLogDrawer
          snapshot={snapshot}
          initialDeviceIds={logDevices}
          onClose={() => setLogDevices(null)}
        />
      )}
    </section>
  );
}

function RunIcon({ status }: { status: Run['status'] }) {
  if (status === 'running') return <LoaderCircle size={13} className="spin" />;
  if (status === 'completed') return <Check size={13} />;
  if (status === 'failed') return <TriangleAlert size={13} />;
  return <Square size={11} />;
}
