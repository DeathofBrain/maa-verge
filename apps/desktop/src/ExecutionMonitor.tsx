import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock3, Layers, ListChecks, LoaderCircle, Monitor, Search, Square, TriangleAlert } from 'lucide-react';
import { localizeExecutionMessage, type Plan, type Run, type Snapshot } from '@maaverge/contracts';
import ExecutionPage from './ExecutionPage';
import MultiRunPanel from './MultiRunPanel';
import './execution-monitor.css';

type Props = {
  snapshot: Snapshot;
  selectedRun?: Run;
  pending: Set<string>;
  onSelectRun: (run: Run) => void;
  onRunUpdate: (run: Run) => void;
  onOverview: () => void;
  onStart: (plan: Plan, deviceId: string) => Promise<boolean>;
  onStop: (run: Run) => Promise<boolean>;
  onEdit: (plan: Plan) => void;
  onPrepare: () => void;
  onDevices: () => void;
};
const statusNames: Record<Run['status'], string> = { running: '执行中', completed: '已完成', failed: '执行失败', stopped: '已停止' };
const dateTime = (value: string) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function elapsed(run: Run, now: number) {
  const seconds = Math.max(0, Math.floor(((run.finishedAt ? Date.parse(run.finishedAt) : now) - Date.parse(run.startedAt)) / 1000));
  if (!Number.isFinite(seconds)) return '—';
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)} 时 ${Math.floor(seconds % 3600 / 60)} 分` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export default function ExecutionMonitor({ snapshot, selectedRun, pending, onSelectRun, onRunUpdate, onOverview, onStart, onStop, onEdit, onPrepare, onDevices }: Props) {
  const [view, setView] = useState<'monitor' | 'instances'>('monitor');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [clock, setClock] = useState(Date.now);
  const overviewScroll = useRef<HTMLDivElement>(null);
  const overviewPosition = useRef(0);
  const overviewFocus = useRef('');
  const runStrip = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (selectedRun) {
      runStrip.current?.querySelector('[aria-current=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if (overviewScroll.current) {
      overviewScroll.current.scrollTop = overviewPosition.current;
      const trigger = [...overviewScroll.current.querySelectorAll<HTMLButtonElement>('[data-inspect-run]')].find((button) => button.dataset.inspectRun === overviewFocus.current);
      trigger?.focus({ preventScroll: true });
    }
  }, [selectedRun?.id]);
  const running = snapshot.runs.filter((run) => run.status === 'running').sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
  const ended = snapshot.runs.filter((run) => run.status !== 'running').sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id));
  const hasRunning = running.length > 0;
  useEffect(() => {
    if (!hasRunning) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunning]);
  const planName = (run: Run) => run.planName || snapshot.plans.find((plan) => plan.id === run.planId)?.name || '已删除的任务表';
  const deviceName = (run: Run) => snapshot.devices.find((device) => device.id === run.deviceId)?.name || run.deviceId;

  if (selectedRun) {
    const watched = running.some((run) => run.id === selectedRun.id) ? running : [selectedRun, ...running];
    return <section className="execution-monitor inspecting" aria-label="任务表执行监控">
      <div className="monitor-inspector-bar"><button className="text-button" onClick={() => { setView('monitor'); onOverview(); }}><ArrowLeft size={15} />返回监控总览</button><span><i className={hasRunning ? 'monitor-live-dot' : ''} />{running.length} 项正在执行</span></div>
      <nav className="monitor-run-strip" ref={runStrip} aria-label="正在监控的执行">{watched.map((run) => <button key={run.id} className={`monitor-run-tab ${run.status} ${selectedRun.id === run.id ? 'selected' : ''}`} aria-label={`切换执行${run.id}`} aria-current={selectedRun.id === run.id ? 'true' : undefined} onClick={() => onSelectRun(run)}><span><RunIcon status={run.status} /><strong>{planName(run)}</strong><b>{run.progress}%</b></span><small><span className="monitor-run-device" title={deviceName(run)}>{deviceName(run)}</span><span>{statusNames[run.status]}</span></small></button>)}</nav>
      <ExecutionPage key={selectedRun.id} snapshot={snapshot} run={selectedRun} pending={pending} onRunUpdate={onRunUpdate} onStop={onStop} onEdit={onEdit} onPrepare={onPrepare} />
    </section>;
  }

  const matches = (run: Run) => {
    const statusMatches = filter === 'all' || (filter === 'ended' ? run.status !== 'running' : run.status === filter);
    const term = query.trim().toLocaleLowerCase();
    return statusMatches && (!term || `${planName(run)} ${deviceName(run)} ${statusNames[run.status]} ${localizeExecutionMessage(run.message)}`.toLocaleLowerCase().includes(term));
  };
  const activeMatches = running.filter(matches), endedMatches = ended.filter(matches);
  const filters = [
    { id: 'all', label: '全部', count: snapshot.runs.length },
    { id: 'running', label: '执行中', count: running.length },
    { id: 'failed', label: '执行失败', count: ended.filter((run) => run.status === 'failed').length },
    { id: 'ended', label: '已结束', count: ended.length },
  ];
  const renderCard = (run: Run) => <article key={run.id} className={`monitor-card ${run.status}`} aria-label={`执行 ${planName(run)} · ${deviceName(run)}`}>
    <header><span className={`monitor-status ${run.status}`}><RunIcon status={run.status} />{statusNames[run.status]}</span><time dateTime={run.startedAt} title={`开始于 ${dateTime(run.startedAt)}`}>{dateTime(run.startedAt)}</time></header>
    <h3>{planName(run)}</h3><div className="monitor-card-device"><Monitor size={14} /><span>{deviceName(run)}</span></div>
    <p className="monitor-card-message" title={localizeExecutionMessage(run.message)}>{localizeExecutionMessage(run.message) || statusNames[run.status]}</p>
    <div className="monitor-card-progress"><span>执行进度</span><strong>{run.progress}%</strong></div><div className="monitor-progress" role="progressbar" aria-label={`${planName(run)} · ${deviceName(run)}执行进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={run.progress}><i style={{ width: `${run.progress}%` }} /></div>
    <div className="monitor-card-timing"><span><Clock3 size={13} />{elapsed(run, clock)}</span>{run.finishedAt && <span title={dateTime(run.finishedAt)}>结束于 {new Date(run.finishedAt).toLocaleTimeString('zh-CN', { hour12: false })}</span>}</div>
    <footer><button className="button secondary" data-inspect-run={run.id} aria-label={`查看执行${run.id}`} onClick={() => { overviewFocus.current = run.id; onSelectRun(run); }}>查看详情<ArrowRight size={14} /></button>{run.status === 'running' && <button className="button danger" aria-label={`停止执行${run.id}`} disabled={pending.has(`stop-${run.id}`)} onClick={() => void onStop(run)}>{pending.has(`stop-${run.id}`) ? <LoaderCircle size={13} className="spin" /> : <Square size={12} />}停止此执行</button>}</footer>
  </article>;

  return <section className="execution-monitor" aria-label="任务表执行监控">
    <div className="monitor-scroll" ref={overviewScroll} onScroll={(event) => { overviewPosition.current = event.currentTarget.scrollTop; }}>
      <header className="monitor-heading"><div><div className="monitor-eyebrow"><Monitor size={14} />执行工作区</div><h1>任务表执行</h1><p>同时查看各任务表的进度，按设备区分每一次执行。</p></div><button className="button secondary" onClick={onPrepare}><ListChecks size={15} />配置任务表</button></header>
      <div className="monitor-view-tabs" role="tablist" aria-label="执行工作区视图" onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : view === 'monitor' ? 1 : 0;
        setView(index === 0 ? 'monitor' : 'instances');
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[index]?.focus();
      }}><button role="tab" id="monitor-tab" aria-controls="monitor-panel" aria-selected={view === 'monitor'} tabIndex={view === 'monitor' ? 0 : -1} onClick={() => setView('monitor')}><Monitor size={16} />监控总览{running.length > 0 && <span>{running.length}</span>}</button><button role="tab" id="instances-tab" aria-controls="instances-panel" aria-selected={view === 'instances'} tabIndex={view === 'instances' ? 0 : -1} onClick={() => setView('instances')}><Layers size={16} />实例启动</button></div>
      {view === 'instances' ? <div role="tabpanel" id="instances-panel" aria-labelledby="instances-tab"><MultiRunPanel devices={snapshot.devices} plans={snapshot.plans} runs={snapshot.runs} pending={pending} onStart={onStart} onStop={onStop} onInspect={onSelectRun} onConnect={onDevices} /></div> : <div role="tabpanel" id="monitor-panel" aria-labelledby="monitor-tab">
        <div className="monitor-toolbar"><div className="monitor-filters" role="group" aria-label="筛选监控执行">{filters.map((item) => <button key={item.id} aria-label={item.label} aria-pressed={filter === item.id} className={filter === item.id ? 'selected' : ''} onClick={() => setFilter(item.id)}>{item.label}<span>{item.count}</span></button>)}</div><label className="monitor-search"><Search size={15} /><input aria-label="搜索监控执行" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务表、设备或结果" /></label></div>
        {activeMatches.length > 0 && <section className="monitor-group" aria-label="正在执行"><div className="monitor-group-heading"><h2><i className="monitor-live-dot" />正在执行<span>{activeMatches.length}</span></h2><small>进度自动更新</small></div><div className="monitor-grid">{activeMatches.map(renderCard)}</div></section>}
        {endedMatches.length > 0 && <section className="monitor-group" aria-label="最近结束"><div className="monitor-group-heading"><h2>最近结束<span>{endedMatches.length}</span></h2><small>保留结果，可随时查看详情</small></div><div className="monitor-grid">{endedMatches.map(renderCard)}</div></section>}
        {!activeMatches.length && !endedMatches.length && <div className="monitor-empty"><Monitor size={34} /><h2>{snapshot.runs.length ? '没有匹配的执行' : '还没有执行任务表'}</h2><p>{snapshot.runs.length ? '调整筛选条件，或搜索其他任务表、设备。' : '从任务表开始执行，或在「实例启动」为多个设备分别启动任务。'}</p>{snapshot.runs.length ? <button className="button secondary" onClick={() => { setFilter('all'); setQuery(''); }}>清除筛选</button> : <button className="button primary" onClick={() => setView('instances')}><Layers size={15} />选择实例与任务表</button>}</div>}
        {snapshot.runs.length > 0 && <p className="monitor-footnote">展示本机最近的执行记录。同一张任务表在不同设备上的执行分别显示，停止仅影响对应执行。</p>}
      </div>}
    </div>
  </section>;
}

function RunIcon({ status }: { status: Run['status'] }) {
  return status === 'running' ? <LoaderCircle size={14} className="spin" /> : status === 'completed' ? <Check size={14} /> : status === 'failed' ? <TriangleAlert size={14} /> : <Square size={12} />;
}
