import { isCopilotRun } from './run-source';
import { useContextMenu } from './ContextMenu';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
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
  localizeExecutionMessage,
  type Device,
  type Plan,
  type Run,
  type Snapshot,
} from '@maaverge/contracts';
import CopilotSelectAll from './CopilotSelectAll';
import DeviceDetailDrawer from './DeviceDetailDrawer';
import ExecutionPage from './ExecutionPage';
import MonitorLogDrawer from './MonitorLogDrawer';
import './execution-monitor.css';

type Props = {
  snapshot: Snapshot;
  selectedRun?: Run;
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
const dateTime = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
function elapsed(run: Run, now: number) {
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
function categoryOf(device: Device, active?: Run): Exclude<DeviceFilter, 'all'> {
  if (active || device.state === 'running') return 'running';
  if (device.state === 'offline') return 'offline';
  return 'idle';
}

export default function ExecutionMonitor({
  snapshot,
  selectedRun,
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
  const [detailDeviceId, setDetailDeviceId] = useState('');
  const [bulkStopping, setBulkStopping] = useState(false);
  const listScroll = useRef<HTMLDivElement>(null);
  const runStrip = useRef<HTMLElement>(null);
  const planRuns = useMemo(
    () => snapshot.runs.filter((run) => !isCopilotRun(run) && !!run.planId),
    [snapshot.runs],
  );
  const running = planRuns
    .filter((run) => run.status === 'running')
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
  const hasRunning = running.length > 0;
  useEffect(() => {
    if (!hasRunning) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunning]);
  const activeByDevice = useMemo(() => {
    const map = new Map<string, Run>();
    for (const run of [...running].reverse())
      if (!map.has(run.deviceId)) map.set(run.deviceId, run);
    return map;
  }, [running]);
  const latestByDevice = useMemo(() => {
    const map = new Map<string, Run>();
    for (const run of [...planRuns].sort(
      (a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id),
    ))
      if (!map.has(run.deviceId)) map.set(run.deviceId, run);
    return map;
  }, [planRuns]);
  const detailDevice = snapshot.devices.find((device) => device.id === detailDeviceId);
  const planName = (run: Run) =>
    run.planName || snapshot.plans.find((plan) => plan.id === run.planId)?.name || '已删除的任务表';
  const categories = new Map(
    snapshot.devices.map((device) => [
      device.id,
      categoryOf(device, activeByDevice.get(device.id)),
    ]),
  );
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
      const active = activeByDevice.get(device.id);
      const latest = latestByDevice.get(device.id);
      const bound = snapshot.plans.find((plan) => plan.deviceId === device.id);
      const run = active || latest;
      return `${device.name} ${device.address} ${run ? planName(run) : ''} ${run ? localizeExecutionMessage(run.message) : ''} ${bound?.name || ''}`
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
  useEffect(() => {
    setSelected((previous) => {
      const next = new Set(
        [...previous].filter((id) => snapshot.devices.some((device) => device.id === id)),
      );
      return next.size === previous.size ? previous : next;
    });
  }, [snapshot.devices]);
  useLayoutEffect(() => {
    if (selectedRun)
      runStrip.current
        ?.querySelector('[aria-current=true]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedRun?.id]);
  const toggle = (deviceId: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
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
  const runMenu = (run: Run) =>
    contextMenu('执行菜单', [
      { label: '查看执行详情', action: () => onSelectRun(run) },
      {
        label: '编辑任务表',
        disabled: !snapshot.plans.some((plan) => plan.id === run.planId),
        action: () => {
          const plan = snapshot.plans.find((plan) => plan.id === run.planId);
          if (plan) onEdit(plan);
        },
      },
      {
        label: '停止执行',
        danger: true,
        disabled: run.status !== 'running' || pending.has(`stop-${run.id}`),
        action: () => {
          void onStop(run);
        },
      },
    ]);
  const deviceMenu = (device: Device, active: Run | undefined) =>
    contextMenu('设备执行菜单', [
      { label: '查看设备详情', action: () => setDetailDeviceId(device.id) },
      { label: '查看设备日志', action: () => setLogDevices([device.id]) },
      {
        label: '停止设备任务',
        danger: true,
        disabled: !active || pending.has(`stop-${active.id}`),
        action: () => {
          if (active) void onStop(active);
        },
      },
    ]);
  const stopSelected = async () => {
    if (!selectedRuns.length || bulkStopping) return;
    setBulkStopping(true);
    await onStopMany(selectedRuns);
    setBulkStopping(false);
    setSelected(new Set());
  };

  if (selectedRun) {
    const watched = running.some((run) => run.id === selectedRun.id)
      ? running
      : [selectedRun, ...running];
    return (
      <section className="execution-monitor inspecting" aria-label="任务表执行监控">
        <div className="monitor-inspector-bar">
          <button
            className="text-button"
            onClick={() => {
              onOverview();
            }}
          >
            <ArrowLeft size={15} />
            返回设备监控
          </button>
          <span>
            <i className={hasRunning ? 'monitor-live-dot' : ''} />
            {running.length} 项正在执行
          </span>
        </div>
        <nav className="monitor-run-strip" ref={runStrip} aria-label="正在监控的执行">
          {watched.map((run) => (
            <button
              key={run.id}
              {...runMenu(run)}
              className={`monitor-run-tab ${run.status} ${selectedRun.id === run.id ? 'selected' : ''}`}
              aria-label={`切换执行${run.id}`}
              aria-current={selectedRun.id === run.id ? 'true' : undefined}
              onClick={() => onSelectRun(run)}
            >
              <span>
                <RunIcon status={run.status} />
                <strong>{planName(run)}</strong>
                <b>{run.progress}%</b>
              </span>
              <small>
                <span
                  className="monitor-run-device"
                  title={
                    snapshot.devices.find((device) => device.id === run.deviceId)?.name ||
                    run.deviceId
                  }
                >
                  {snapshot.devices.find((device) => device.id === run.deviceId)?.name ||
                    run.deviceId}
                </span>
                <span>{statusNames[run.status]}</span>
              </small>
            </button>
          ))}
        </nav>
        <ExecutionPage
          key={selectedRun.id}
          snapshot={snapshot}
          run={selectedRun}
          pending={pending}
          onRunUpdate={onRunUpdate}
          onStop={onStop}
          onEdit={onEdit}
          onPrepare={onPrepare}
        />
      </section>
    );
  }

  const filters: { id: DeviceFilter; label: string; count: number }[] = [
    { id: 'all', label: '全部', count: counts.all },
    { id: 'running', label: '执行中', count: counts.running },
    { id: 'idle', label: '空闲', count: counts.idle },
    { id: 'offline', label: '离线', count: counts.offline },
  ];
  return (
    <section className="execution-monitor" aria-label="任务表执行监控">
      <div className="monitor-scroll" ref={listScroll}>
        <header className="monitor-heading">
          <div>
            <div className="monitor-eyebrow">
              <Monitor size={14} />
              设备监控
            </div>
            <p>查看每台设备当前是否正在执行，并单独停止或查看日志。</p>
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
                disabled={!selectedRuns.length || bulkStopping}
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
          <section className="monitor-device-list" aria-label="设备执行列表">
            {visibleDevices.map((device) => {
              const active = activeByDevice.get(device.id);
              const latest = latestByDevice.get(device.id);
              const category = categories.get(device.id)!;
              const displayRun = active || (category === 'running' ? undefined : latest);
              const bound = snapshot.plans.find((plan) => plan.deviceId === device.id);
              const selectedDevice = selected.has(device.id);
              return (
                <article
                  className={`monitor-device-row ${category} ${selectedDevice ? 'is-selected' : ''}`}
                  key={device.id}
                  aria-label={`设备执行${device.name}`}
                  {...deviceMenu(device, active)}
                >
                  <label className="monitor-device-check">
                    <input
                      type="checkbox"
                      aria-label={`选择设备${device.name}`}
                      checked={selectedDevice}
                      onChange={() => toggle(device.id)}
                    />
                  </label>
                  <div className="monitor-device-main">
                    <div className="monitor-device-name">
                      <span className="monitor-device-icon">
                        <Monitor size={17} />
                      </span>
                      <span className="monitor-device-copy">
                        <strong>
                          {device.name}
                          <small className={`monitor-device-state ${category}`}>
                            {category === 'running'
                              ? active
                                ? '执行中'
                                : '其他任务'
                              : category === 'offline'
                                ? '离线'
                                : '空闲'}
                          </small>
                        </strong>
                        <small>
                          {displayRun
                            ? localizeExecutionMessage(displayRun.message) ||
                              statusNames[displayRun.status]
                            : category === 'running'
                              ? '设备正被其他任务占用。'
                              : bound
                                ? `尚未执行；已绑定 ${bound.name}。`
                                : '尚未执行任务。'}
                        </small>
                      </span>
                    </div>
                    {active && (
                      <div
                        className="monitor-progress"
                        role="progressbar"
                        aria-label={`${device.name}执行进度`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={active.progress}
                      >
                        <i style={{ width: `${active.progress}%` }} />
                      </div>
                    )}
                    <div className="monitor-device-meta">
                      <span>{device.address}</span>
                      {displayRun ? (
                        <>
                          <span className={`monitor-status ${displayRun.status}`}>
                            <RunIcon status={displayRun.status} />
                            {statusNames[displayRun.status]}
                            {active && ` ${active.progress}%`}
                          </span>
                          {active && <span>{planName(displayRun)}</span>}
                          <span>
                            <Clock3 size={12} />
                            {active
                              ? elapsed(active, clock)
                              : `最近 ${dateTime(displayRun.startedAt)}`}
                          </span>
                          {displayRun.finishedAt && (
                            <span>
                              结束于{' '}
                              {new Date(displayRun.finishedAt).toLocaleTimeString('zh-CN', {
                                hour12: false,
                              })}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span>
                            {category === 'offline'
                              ? '设备离线'
                              : category === 'running'
                                ? '等待当前任务结束'
                                : '等待任务'}
                          </span>
                          {bound && <span>绑定 {bound.name}</span>}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="monitor-device-actions">
                    <button
                      className="button secondary"
                      data-device-detail={device.id}
                      aria-label={`查看设备详情${device.name}`}
                      onClick={() => setDetailDeviceId(device.id)}
                    >
                      详情
                      <ArrowRight size={14} />
                    </button>
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
                        disabled={pending.has(`stop-${active.id}`)}
                        onClick={() => void onStop(active)}
                      >
                        {pending.has(`stop-${active.id}`) ? (
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
          </section>
        )}
        {snapshot.devices.length > 0 && (
          <p className="monitor-footnote">
            每台设备同时只允许一个执行；停止只影响对应设备。历史结果可在执行记录中查看。
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
      {detailDevice && (
        <DeviceDetailDrawer
          snapshot={snapshot}
          device={detailDevice}
          run={activeByDevice.get(detailDevice.id)}
          pending={pending}
          onRunUpdate={onRunUpdate}
          onStop={onStop}
          onEdit={onEdit}
          onPrepare={onPrepare}
          onClose={() => setDetailDeviceId('')}
        />
      )}
    </section>
  );
}

function RunIcon({ status }: { status: Run['status'] }) {
  return status === 'running' ? (
    <LoaderCircle size={14} className="spin" />
  ) : status === 'completed' ? (
    <Check size={14} />
  ) : status === 'failed' ? (
    <TriangleAlert size={14} />
  ) : (
    <Square size={12} />
  );
}
