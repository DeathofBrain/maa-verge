import { runDisplayName, runSourceLabel } from './run-source';
import { useContextMenu } from './ContextMenu';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Check,
  Clock3,
  LoaderCircle,
  Monitor,
  Search,
  Square,
  Terminal,
  TriangleAlert,
} from 'lucide-react';
import {
  errorMessage,
  localizeExecutionMessage,
  rpc,
  type Device,
  type Plan,
  type Run,
  type Snapshot,
  type ToolJobSummary,
} from '@maaverge/contracts';
import CopilotSelectAll from './CopilotSelectAll';
import ExecutionPage from './ExecutionPage';
import MonitorLogDrawer from './MonitorLogDrawer';
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
  onEdit: (plan: Plan) => void;
  onPrepare: () => void;
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
  onEdit,
  onPrepare,
}: Props) {
  const contextMenu = useContextMenu();
  const [filter, setFilter] = useState<DeviceFilter>('all');
  const [query, setQuery] = useState('');
  const [clock, setClock] = useState(Date.now);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [logDevices, setLogDevices] = useState<string[] | null>(null);
  const [deviceId, setDeviceId] = useState(selectedRun?.deviceId || '');
  const [historyToolId, setHistoryToolId] = useState('');
  const [bulkStopping, setBulkStopping] = useState(false);
  const [toolPending, setToolPending] = useState<Set<string>>(() => new Set());
  const [toolResults, setToolResults] = useState<Map<string, ToolJobSummary>>(() => new Map());
  const [operationError, setOperationError] = useState('');
  const toolPendingRef = useRef(new Set<string>());
  const previousHeaderDevice = useRef(selectedDeviceId);
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
    previousHeaderDevice.current = selectedDeviceId;
    if (!selectedDeviceId || selectedRun?.deviceId === selectedDeviceId) return;
    setDeviceId(selectedDeviceId);
    setHistoryToolId('');
    onOverview();
  }, [selectedDeviceId, selectedRun?.deviceId, onOverview]);
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
      const bound = snapshot.plans.find((plan) => plan.deviceId === device.id);
      return `${device.name} ${device.address} ${run ? runDisplayName(run, snapshot.plans) : ''} ${run ? localizeExecutionMessage(run.message) : ''} ${tool ? toolNames[tool.kind] + ' ' + localizeExecutionMessage(tool.message) : ''} ${bound?.name || ''}`
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
  const chooseDevice = (id: string) => {
    setDeviceId(id);
    setHistoryToolId('');
    onOverview();
    onSelectDevice?.(id);
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
      setOperationError(errorMessage(cause));
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
  const boundPlan = snapshot.plans.find((plan) => plan.deviceId === deviceId);
  const groups = [
    {
      id: 'online',
      title: '已连接设备',
      label: '已连接监控设备',
      devices: visibleDevices.filter((device) => device.state !== 'offline'),
    },
    {
      id: 'offline',
      title: '历史离线设备',
      label: '历史离线监控设备',
      devices: visibleDevices.filter((device) => device.state === 'offline'),
    },
  ];
  const filters: { id: DeviceFilter; label: string; count: number }[] = [
    { id: 'all', label: '全部', count: counts.all },
    { id: 'running', label: '执行中', count: counts.running },
    { id: 'idle', label: '空闲', count: counts.idle },
    { id: 'offline', label: '离线', count: counts.offline },
  ];
  return (
    <section className="execution-monitor" aria-label="任务表执行监控">
      <div className="monitor-scroll" ref={monitorScroll}>
        <header className="monitor-heading">
          <div>
            <div className="monitor-eyebrow">
              <Monitor size={14} />
              设备监控
            </div>
            <p>选择上方设备，在下方查看当前执行；日志从右侧打开。</p>
          </div>
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
        <div className="monitor-toolbar">
          <div className="monitor-toolbar-main">
            <CopilotSelectAll
              label="全选监控设备"
              total={visibleDevices.length}
              selected={visibleDevices.filter((device) => selected.has(device.id)).length}
              onChange={selectVisible}
            />
            <div className="monitor-filters" role="group" aria-label="筛选监控设备">
              {filters.map((item) => (
                <button
                  key={item.id}
                  aria-label={item.label}
                  aria-pressed={filter === item.id}
                  className={filter === item.id ? 'selected' : ''}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  <span>{item.count}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="monitor-search">
            <Search size={15} />
            <input
              aria-label="搜索监控设备"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索设备、任务或反馈"
            />
          </label>
        </div>
        {operationError && (
          <p className="error-banner" role="alert">
            工具停止失败：{operationError}
          </p>
        )}
        {selected.size > 0 && (
          <div className="monitor-bulk-bar" role="region" aria-label="设备批量操作">
            <span role="status">已选 {selected.size} 台设备</span>
            <div>
              <button className="button secondary" onClick={() => setLogDevices([...selected])}>
                <Terminal size={14} />
                查看日志
              </button>
              <button
                className="button danger"
                disabled={(!selectedRuns.length && !selectedTools.length) || bulkStopping}
                onClick={() => void stopSelected()}
              >
                {bulkStopping ? <LoaderCircle size={14} className="spin" /> : <Square size={12} />}
                停止所选
              </button>
              <button className="text-button" onClick={() => setSelected(new Set())}>
                清除
              </button>
            </div>
          </div>
        )}
        {!snapshot.devices.length ? (
          <div className="monitor-empty">
            <Monitor size={34} />
            <h2>还没有设备</h2>
            <p>请先在设备页添加并连接模拟器实例，执行状态会显示在这里。</p>
          </div>
        ) : !visibleDevices.length ? (
          <div className="monitor-empty">
            <Search size={30} />
            <h2>没有匹配的设备</h2>
            <p>调整筛选条件，或搜索其他设备、任务与反馈。</p>
            <button
              className="button secondary"
              onClick={() => {
                setFilter('all');
                setQuery('');
              }}
            >
              清除筛选
            </button>
          </div>
        ) : (
          <section className="monitor-device-groups" aria-label="设备执行列表">
            {groups
              .filter((group) => group.devices.length)
              .map((group) => (
                <section className="monitor-device-group" key={group.id} aria-label={group.label}>
                  <h2>
                    {group.title}
                    <span>{group.devices.length}</span>
                  </h2>
                  {group.id === 'offline' && (
                    <p>保留曾连接的设备。选择后可查看设备信息和历史记录。</p>
                  )}
                  <div className="monitor-device-list">
                    {group.devices.map((device) => {
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
                      return (
                        <article
                          className={`monitor-device-row ${category} ${selected.has(device.id) ? 'is-selected' : ''} ${isCurrent ? 'is-current' : ''}`}
                          key={device.id}
                          aria-label={`设备执行${device.name}`}
                          {...contextMenu('设备执行菜单', [
                            { label: '查看设备执行', action: () => chooseDevice(device.id) },
                            { label: '查看设备日志', action: () => setLogDevices([device.id]) },
                            {
                              label: '停止设备任务',
                              danger: true,
                              disabled:
                                !active ||
                                (run ? pending.has(`stop-${run.id}`) : toolPending.has(job!.id)),
                              action: () => {
                                if (run) void onStop(run);
                                else if (job) void stopTool(job);
                              },
                            },
                          ])}
                        >
                          <label className="monitor-device-check">
                            <input
                              type="checkbox"
                              aria-label={`选择设备${device.name}`}
                              checked={selected.has(device.id)}
                              onChange={() => toggle(device.id)}
                            />
                          </label>
                          <button
                            className="monitor-device-main"
                            aria-label={`查看设备执行${device.name}`}
                            aria-pressed={isCurrent}
                            aria-controls="monitor-selected-device"
                            onClick={() => chooseDevice(device.id)}
                          >
                            <span className="monitor-device-name">
                              <span className="monitor-device-icon">
                                <Monitor size={17} />
                              </span>
                              <span className="monitor-device-copy">
                                <strong>
                                  {device.name}
                                  <small className={`monitor-device-state ${category}`}>
                                    {category === 'offline'
                                      ? '离线'
                                      : category === 'running'
                                        ? '执行中'
                                        : '空闲'}
                                  </small>
                                </strong>
                                <small>
                                  {active
                                    ? localizeExecutionMessage(active.message) ||
                                      statusNames[active.status]
                                    : category === 'offline'
                                      ? '设备已离线'
                                      : category === 'running'
                                        ? '设备已被占用，等待执行状态'
                                        : '当前没有任务'}
                                </small>
                              </span>
                            </span>
                            {active && (
                              <span
                                className="monitor-progress"
                                role="progressbar"
                                aria-label={`${device.name}执行进度`}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={active.progress}
                              >
                                <i style={{ width: `${active.progress}%` }} />
                              </span>
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
                              {isCurrent ? '正在下方查看' : '查看执行'}
                              <ArrowDown size={12} />
                            </span>
                          </button>
                          <div className="monitor-device-actions">
                            <button
                              className="button secondary"
                              aria-label={`查看设备日志${device.name}`}
                              onClick={() => setLogDevices([device.id])}
                            >
                              <Terminal size={14} />
                              日志
                            </button>
                            {active && (
                              <button
                                className="button danger"
                                aria-label={`停止设备任务${device.name}`}
                                disabled={
                                  run ? pending.has(`stop-${run.id}`) : toolPending.has(job!.id)
                                }
                                onClick={() => {
                                  if (run) void onStop(run);
                                  else if (job) void stopTool(job);
                                }}
                              >
                                {(
                                  run ? pending.has(`stop-${run.id}`) : toolPending.has(job!.id)
                                ) ? (
                                  <LoaderCircle size={13} className="spin" />
                                ) : (
                                  <Square size={12} />
                                )}
                                停止
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
          </section>
        )}
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
              <button
                className="button secondary"
                onClick={() => setLogDevices([currentDevice.id])}
              >
                <Terminal size={14} />
                查看此设备日志
              </button>
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
                  <dd>{boundPlan?.name || '未绑定'}</dd>
                </div>
              </dl>
              {currentDevice.connectionError && (
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
                <button
                  className="text-button"
                  onClick={() => {
                    setHistoryToolId('');
                    onOverview();
                  }}
                >
                  查看当前执行
                </button>
              </div>
            )}
            {displayedRun ? (
              <ExecutionPage
                key={displayedRun.id}
                snapshot={snapshot}
                run={displayedRun}
                pending={pending}
                onRunUpdate={onRunUpdate}
                onStop={onStop}
                onEdit={onEdit}
                onPrepare={onPrepare}
                onOpenLogs={() => setLogDevices([deviceId])}
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
                <progress max={100} value={displayedTool.progress} aria-label="工具执行进度" />
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
                  <button
                    className="button danger"
                    disabled={toolPending.has(displayedTool.id)}
                    onClick={() => void stopTool(displayedTool)}
                  >
                    <Square size={12} />
                    停止工具
                  </button>
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
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (latestIsTool) {
                        setHistoryToolId(latestTool!.id);
                        onOverview();
                      } else if (latestRun) onSelectRun(latestRun);
                    }}
                  >
                    查看上次执行
                  </button>
                )}
              </div>
            )}
          </section>
        ) : (
          snapshot.devices.length > 0 && (
            <div className="monitor-empty monitor-select-prompt">
              <Monitor size={30} />
              <h2>选择一台设备</h2>
              <p>选择上方已连接或历史离线设备，在这里查看执行情况。</p>
            </div>
          )
        )}
        {snapshot.devices.length > 0 && (
          <p className="monitor-footnote">
            每台设备同时只允许一个执行。停止只影响对应设备；任务表、作业和工具共享设备占用。
          </p>
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
