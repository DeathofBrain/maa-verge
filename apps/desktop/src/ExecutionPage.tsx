import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Circle, Clock3, ImageIcon, Layers, ListChecks, LoaderCircle, Monitor, Package, Square, Terminal, TriangleAlert } from 'lucide-react';
import { localizeExecutionMessage, rpc, taskLabels, type Plan, type Run, type RunArtifact, type RunTask, type Snapshot } from '@maaverge/contracts';
import MaterialIcon from './MaterialIcon';
import './execution-page.css';

type Props = {
  snapshot: Snapshot;
  run?: Run;
  pending: Set<string>;
  onSelectRun: (run: Run) => void;
  onStop: (run: Run) => Promise<boolean>;
  onEdit: (plan: Plan) => void;
  onPrepare: () => void;
};
const runNames: Record<Run['status'], string> = { running: '执行中', completed: '已完成', failed: '执行失败', stopped: '已停止' };
const taskNames: Record<RunTask['status'], string> = { waiting: '未执行', running: '执行中', completed: '已完成', failed: '执行失败', stopped: '已停止', skipped: '已跳过' };
const pendingDetails = new Map<string, Promise<Run>>();
function readRunDetail(id: string): Promise<Run> {
  const previous = pendingDetails.get(id);
  if (previous) return previous;
  const request = rpc('run.detail', { id });
  pendingDetails.set(id, request);
  const clear = () => { if (pendingDetails.get(id) === request) pendingDetails.delete(id); };
  void request.then(clear, clear);
  return request;
}
const dateTime = (value: string) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const duration = (start: string, end: string | null | undefined, now: number) => {
  const seconds = Math.max(0, Math.floor(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000));
  if (!Number.isFinite(seconds)) return '—';
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};

export default function ExecutionPage({ snapshot, run: summary, pending, onSelectRun, onStop, onEdit, onPrepare }: Props) {
  const [detail, setDetail] = useState<Run>();
  const [loadError, setLoadError] = useState('');
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const run = detail?.id === summary?.id && detail?.status === summary?.status ? detail : summary;
  const [selection, setSelection] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (!summary) return;
    const id = summary.id;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const value = await readRunDetail(id);
        if (cancelled) return;
        setDetail(value); setLoadError('');
        if (summaryRef.current?.status === 'running' || value.status === 'running') timer = window.setTimeout(() => { void poll(); }, 1000);
      } catch (cause) {
        if (cancelled) return;
        setLoadError(cause instanceof Error ? cause.message : String(cause));
        timer = window.setTimeout(() => { void poll(); }, 5000);
      }
    };
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [summary?.id]);
  useEffect(() => {
    if (run?.status !== 'running') return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [run?.status]);
  if (!run) return <section className="exec-empty" aria-label="任务表执行页面"><ListChecks size={36} /><h1>任务表执行</h1><p>开始执行后，在这里查看任务进度、材料和反馈画面。</p><button className="button primary" onClick={onPrepare}>前往任务表</button></section>;

  const plan = snapshot.plans.find((item) => item.id === run.planId);
  const device = snapshot.devices.find((item) => item.id === run.deviceId);
  const tasks = run.tasks || [];
  const running = tasks.findIndex((task) => task.status === 'running');
  const currentIndex = running >= 0 ? running : Math.max(0, tasks.reduce((last, task, index) => task.status !== 'waiting' ? index : last, -1));
  const selected = tasks[selection ?? currentIndex];
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const allDrops = tasks.flatMap((task) => task.drops);
  const totals = new Map<string, { itemId: string; name: string; quantity: number; stages: Set<string> }>();
  for (const drop of allDrops) {
    const key = drop.itemId || drop.name;
    const item = totals.get(key) || { itemId: drop.itemId, name: drop.name || drop.itemId, quantity: 0, stages: new Set<string>() };
    item.quantity += drop.quantity;
    if (drop.stage) item.stages.add(drop.stage);
    totals.set(key, item);
  }
  const infrastructure = tasks.flatMap((task) => task.infrastructure);
  const events = snapshot.events.filter((event) => {
    const data = event.data as { runId?: string; run?: { id?: string } };
    return (data.runId || data.run?.id) === run.id;
  }).slice(-35).reverse();

  return <section className="exec-page" aria-label="任务表执行页面">
    <header className="exec-header"><div><div className="exec-eyebrow"><ListChecks size={14} />任务表执行<span className={`pill ${run.status}`}>{runNames[run.status]}</span></div><h1>{run.planName || plan?.name || '已删除的任务表'}</h1><p>{localizeExecutionMessage(run.message)}</p></div><div className="exec-actions"><button className="button secondary" onClick={() => plan ? onEdit(plan) : onPrepare()}><ArrowLeft size={15} />返回任务设置</button>{run.status === 'running' && <button className="button danger" disabled={pending.has(`stop-${run.id}`)} onClick={() => void onStop(run)}><Square size={13} />停止执行</button>}</div></header>
    {loadError && <p className="error-banner" role="alert">任务结果读取失败：{loadError}</p>}
    <div className="exec-overview"><label className="exec-run-picker"><span>查看执行</span><select className="text-input" aria-label="执行页选择记录" value={run.id} onChange={(event) => { const next = snapshot.runs.find((item) => item.id === event.target.value); if (next) onSelectRun(next); }}>{snapshot.runs.map((item) => <option key={item.id} value={item.id}>{item.planName || snapshot.plans.find((p) => p.id === item.planId)?.name || '任务表'} · {snapshot.devices.find((d) => d.id === item.deviceId)?.name || item.deviceId} · {dateTime(item.startedAt)}</option>)}</select></label><div className="exec-meta"><span><Monitor size={14} />{device?.name || run.deviceId}</span><span><Clock3 size={14} />{duration(run.startedAt, run.finishedAt, clock)}</span><span title={dateTime(run.startedAt)}>开始于 {new Date(run.startedAt).toLocaleTimeString('zh-CN', { hour12: false })}</span></div></div>
    <div className="exec-layout">
      <aside className="exec-task-panel" aria-label="本次执行任务"><div className="exec-panel-heading"><h2>任务进度</h2><span>{completed} / {tasks.length}</span></div><div className="exec-progress" role="progressbar" aria-label="整表执行进度" aria-valuenow={run.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${run.progress}%` }} /></div>{tasks.length ? <ol className="exec-tasks">{tasks.map((task, index) => <li key={task.index}><button className={`exec-task ${selected?.index === task.index ? 'selected' : ''} ${task.status}`} aria-label={`查看第 ${index + 1} 项${taskLabels[task.type] || '任务'}结果`} aria-pressed={selected?.index === task.index} onClick={() => { setSelection(index); }}><span className="exec-task-icon">{task.status === 'completed' ? <Check size={15} /> : task.status === 'running' ? <LoaderCircle size={16} className="spin" /> : task.status === 'failed' ? <TriangleAlert size={15} /> : task.status === 'stopped' ? <Square size={12} /> : <Circle size={13} />}</span><span className="exec-task-info"><strong>{index + 1}. {taskLabels[task.type] || '任务'}</strong><small>{taskNames[task.status]}</small>{task.startedAt && <small>{duration(task.startedAt, task.finishedAt, clock)}</small>}</span><ChevronRight size={13} /></button></li>)}</ol> : <p className="exec-placeholder">{!detail && !loadError ? '正在读取任务结果…' : '此历史记录未保存逐任务结果。'}</p>}{run.status === 'running' && selection !== null && <button className="text-button exec-follow" onClick={() => { setSelection(null); }}>跟随当前任务</button>}<p className="exec-snapshot-note">本页显示开始执行时的任务。修改设置用于下次执行。</p></aside>
      <div className="exec-results">
        <section className="exec-task-summary" aria-label="所选任务结果"><div><span className={`pill ${selected?.status || run.status}`}>{selected ? taskNames[selected.status] : runNames[run.status]}</span><h2>{selected ? taskLabels[selected.type] || '任务结果' : '执行结果'}</h2></div><p>{localizeExecutionMessage(selected?.message || run.message)}</p>{selected?.startedAt && <small>开始 {dateTime(selected.startedAt)}{selected.finishedAt ? ` · 结束 ${dateTime(selected.finishedAt)}` : ''}</small>}</section>
        <div className="exec-result-columns"><section className="exec-panel exec-visual" aria-label="执行画面与截图"><div className="exec-panel-heading"><h2><ImageIcon size={16} />结果截图</h2>{!!selected?.artifacts.length && <span>{selected.artifacts.length} 张</span>}</div><ResultImages runId={run.id} artifacts={selected?.artifacts || []} taskName={selected ? taskLabels[selected.type] : undefined} /><p className="exec-visual-note">截图来自任务反馈时的核心画面，保存在本机。</p></section>
          <section className="exec-panel exec-drops" aria-label="本次获得材料"><div className="exec-panel-heading"><h2><Package size={16} />本次获得材料</h2><span>{totals.size} 种</span></div>{totals.size ? <ul className="exec-drop-list">{[...totals].map(([key, item]) => <li key={key}><MaterialIcon itemId={item.itemId} name={item.name} resourceKey={snapshot.updates.filter((channel) => channel.id !== 'app').map((channel) => channel.currentVersion).join(':')} className="exec-item-symbol" /><div><strong>{item.name}</strong><small>{[...item.stages].join(' · ') || '核心掉落识别'}</small></div><b>× {item.quantity.toLocaleString('zh-CN')}</b></li>)}</ul> : <div className="exec-placeholder"><Package size={26} /><p>暂无材料反馈</p><small>作战识别到掉落后，会在这里累计。</small></div>}<p className="exec-result-note">按本次执行的掉落识别汇总。</p></section></div>
        {infrastructure.length > 0 && <section className="exec-panel" aria-label="基建换班反馈"><div className="exec-panel-heading"><h2><Layers size={16} />基建换班反馈</h2><span>{infrastructure.length} 条</span></div><div className="exec-infrastructure">{infrastructure.map((item, index) => <article key={index}><div><strong>{item.facility}{item.room ? ` · ${item.room}` : ''}</strong><time>{new Date(item.at).toLocaleTimeString('zh-CN', { hour12: false })}</time></div>{item.operators.length > 0 && <p>方案干员：{item.operators.join('、')}</p>}{item.product && <p>产物：{item.product}</p>}<small>{localizeExecutionMessage(item.message)}</small></article>)}</div></section>}
        {selected?.drops.length ? <section className="exec-panel exec-task-drops" aria-label="所选任务掉落记录"><div className="exec-panel-heading"><h2>此任务的掉落记录</h2></div><div className="exec-drop-records">{selected.drops.map((item, index) => <div key={index}><time>{new Date(item.at).toLocaleTimeString('zh-CN', { hour12: false })}</time><span>{item.stage || '当前关卡'}</span><strong>{item.name || item.itemId}</strong><b>× {item.quantity}</b></div>)}</div></section> : null}
        <section className="exec-panel exec-events" aria-label="本次执行动态"><div className="exec-panel-heading"><h2><Terminal size={16} />执行动态</h2><span>最近 {events.length} 条</span></div>{events.length ? <ol>{events.map((event) => <li key={event.id}><time>{new Date(event.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}</time><span>{localizeExecutionMessage(event.message)}</span></li>)}</ol> : <p className="exec-placeholder">本次执行暂无动态。</p>}</section>
      </div>
    </div>
  </section>;
}

function ResultImages({ runId, artifacts, taskName }: { runId: string; artifacts: RunArtifact[]; taskName?: string }) {
  const [selection, setSelection] = useState('');
  const [data, setData] = useState<{ id: string; src: string } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const artifact = artifacts.find((item) => item.id === selection) || artifacts.at(-1);
  useEffect(() => {
    setData(null); setError('');
    if (!artifact) return;
    let cancelled = false;
    const id = artifact.id;
    void rpc('run.artifact', { runId, artifactId: id }).then((result) => { if (!cancelled) setData({ id, src: `data:${result.mimeType};base64,${result.data}` }); }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, [runId, artifact?.id, retry]);
  if (!artifact) return <div className="exec-no-capture"><ImageIcon size={32} /><strong>{taskName ? `${taskName}暂无截图` : '暂无结果截图'}</strong><p>收到任务反馈并成功取帧后，画面会保存在这里。</p></div>;
  return <div className="exec-captures">{artifacts.length > 1 && <label>反馈截图<select className="text-input" aria-label="选择结果截图" value={artifact.id} onChange={(event) => setSelection(event.target.value)}>{artifacts.map((item) => <option key={item.id} value={item.id}>{item.label} · {new Date(item.capturedAt).toLocaleTimeString('zh-CN', { hour12: false })}</option>)}</select></label>}{error ? <div className="exec-no-capture" role="alert"><TriangleAlert size={26} /><p>{error}</p><button className="button secondary" onClick={() => setRetry((value) => value + 1)}>重新读取截图</button></div> : data?.id === artifact.id ? <figure><img src={data.src} width={artifact.width} height={artifact.height} alt={artifact.label} /><figcaption>{artifact.label}<time>{dateTime(artifact.capturedAt)}</time></figcaption></figure> : <div className="exec-no-capture" role="status"><LoaderCircle size={24} className="spin" />正在读取本机截图…</div>}</div>;
}
