import { useState } from 'react';
import { Monitor, Play, Square } from 'lucide-react';
import { localizeExecutionMessage, type Device, type Plan, type Run } from '@maaverge/contracts';
import './multi-run.css';

export default function MultiRunPanel({ devices, plans, runs, pending, onStart, onStop, onInspect, onConnect }: {
  devices: Device[]; plans: Plan[]; runs: Run[]; pending: Set<string>;
  onStart: (plan: Plan, deviceId: string) => Promise<boolean>;
  onStop: (run: Run) => Promise<boolean>;
  onInspect: (run: Run) => void;
  onConnect: () => void;
}) {
  const [selectedPlans, setSelectedPlans] = useState<Record<string, string>>({});
  return <section className="multi-run-panel" aria-label="多开执行面板"><div className="multi-run-heading"><div><h2>多开执行</h2><p>每个实例独立执行与停止。可为不同实例选择不同任务表，也可同时运行同一张未绑定的任务表。</p></div><button className="button secondary" onClick={onConnect}>管理模拟器实例</button></div>{!devices.length ? <p>请先在设备页添加并连接模拟器实例。</p> : <div className="multi-run-grid">{devices.map((device) => {
    const run = runs.find((item) => item.deviceId === device.id && item.status === 'running');
    const lastRun = runs.find((item) => item.deviceId === device.id);
    const choices = plans.filter((plan) => plan.enabled && (!plan.deviceId || plan.deviceId === device.id));
    const selected = choices.find((plan) => plan.id === selectedPlans[device.id]) || choices.find((plan) => plan.deviceId === device.id) || choices[0];
    return <article className="multi-run-card" key={device.id} aria-label={`模拟器实例 ${device.name}`}><header><Monitor size={17} /><div><h3>{device.name}</h3><small>{device.address}</small></div><span className={`pill ${run ? 'running' : ''}`}>{run ? '执行中' : device.state === 'offline' ? '离线' : '就绪'}</span></header>{run ? <><strong>{run.planName || plans.find((plan) => plan.id === run.planId)?.name || '任务执行'}</strong><p>{localizeExecutionMessage(run.message)}</p><progress aria-label={`${device.name}执行进度`} max={100} value={run.progress} /><div className="multi-run-actions"><button className="button secondary" onClick={() => onInspect(run)}>查看此实例</button><button className="button danger" disabled={pending.has(`stop-${run.id}`)} aria-label={`停止实例 ${device.name}`} onClick={() => void onStop(run)}><Square size={13} />停止此实例</button></div></> : <><label className="field-label" htmlFor={`instance-plan-${device.id}`}>任务表</label><select id={`instance-plan-${device.id}`} className="text-input" aria-label={`${device.name}使用的任务表`} value={selected?.id || ''} onChange={(event) => setSelectedPlans((previous) => ({ ...previous, [device.id]: event.target.value }))}>{!choices.length && <option value="">没有可用任务表</option>}{choices.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}{plan.deviceId ? ' · 已绑定' : ''}</option>)}</select><button className="button primary" aria-label={`启动实例 ${device.name}`} disabled={!selected || device.state !== 'idle' || pending.has(`start-plan-${device.id}`)} onClick={() => selected && void onStart(selected, device.id)}><Play size={13} />{device.state === 'offline' ? '请先连接实例' : '在此实例执行'}</button>{lastRun && <p><button className="text-button" onClick={() => onInspect(lastRun)}>查看上次执行</button>：{localizeExecutionMessage(lastRun.message)}</p>}</>}</article>;
  })}</div>}<p className="multi-run-note">消耗上限按每次执行分别检查；同一实例同时只允许一个控制者。修改任务表不改变已经启动的执行快照。</p></section>;
}
