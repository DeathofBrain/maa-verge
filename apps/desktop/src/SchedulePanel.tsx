import { useEffect, useState } from 'react';
import { CalendarClock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { rpc, type Device, type Plan, type Settings, type RpcResult } from '@maaverge/contracts';
import './schedule-panel.css';
type Schedule = RpcResult<'schedule.save'>;
export default function SchedulePanel({ planId, devices, settings }: { planId?: string; devices: Device[]; settings?: Settings }) {
  const [data, setData] = useState<RpcResult<'schedule.list'>>();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [all, setAll] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [newDevice, setNewDevice] = useState('');
  const [newTime, setNewTime] = useState('04:10');
  const [newPlan, setNewPlan] = useState(planId ?? '');
  useEffect(() => { setNewPlan(planId ?? ''); }, [planId]);
  const [options, setOptions] = useState(settings?.scheduler ?? { forceScheduledStart: false, showWindowBeforeForceScheduledStart: false, notifyBeforeScheduledStart: false, notificationMinutes: 5, scheduledWakeUp: false });
  useEffect(() => {
    let cancelled = false;
    const refresh = () => { void Promise.all([rpc('schedule.list', {}), rpc('app.snapshot', {})]).then(([value, snapshot]) => { if (!cancelled) { setData(value); setPlans(snapshot.plans); setOptions(snapshot.settings.scheduler ?? options); } }, cause => { if (!cancelled) setError(String(cause)); }); };
    refresh(); const timer = window.setInterval(refresh, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [revision]);
  const action = async (call: () => Promise<unknown>) => {
    setBusy(true); setError(''); try { await call(); setRevision(value => value + 1); } catch (cause) { setError(String(cause)); } finally { setBusy(false); }
  };
  const save = (schedule: Schedule, patch: Partial<Schedule>) => action(() => rpc('schedule.save', { schedule: { ...schedule, ...patch } }));
  const settingsChange = (change: Partial<typeof options>) => { const value = { ...options, ...change }; setOptions(value); void action(async () => { const latest = await rpc('app.snapshot', {}); await rpc('settings.save', { settings: { ...latest.settings, scheduler: value } }); }); };
  const visible = data?.schedules.filter(schedule => all || schedule.planId === planId) ?? [];
  return <section className="schedule-panel" aria-label="定时计划">
    <header><div><h2><CalendarClock size={20} />定时计划</h2><p>每天按电脑本地时间执行 · {data?.timezone ?? '正在读取时区'}。至少可设置八组，支持继续添加。</p></div><div><button className="button secondary" onClick={() => setAll(value => !value)}>{all ? '只看本表' : '查看全部定时'}</button><button className="icon-button" aria-label="刷新定时计划" onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} /></button></div></header>
    {error && <p role="alert" className="error-banner">{error}</p>}
    {!planId && <p>请先保存任务表，再为它添加定时。</p>}
    <div className="sp-table-scroll"><table className="sp-table"><thead><tr><th>启用</th><th>时间</th><th>任务表</th><th>设备</th><th>下一次</th><th>最近结果</th><th>仅本次</th><th /></tr></thead><tbody>{visible.map(schedule => <tr key={schedule.id}><td><input type="checkbox" aria-label={`启用定时 ${schedule.id}`} checked={schedule.enabled} disabled={busy} onChange={event => { void save(schedule, { enabled: event.target.checked }); }} /></td><td><input className="text-input" aria-label={`定时时间 ${schedule.id}`} type="time" value={`${String(schedule.hour).padStart(2,'0')}:${String(schedule.minute).padStart(2,'0')}`} disabled={busy} onChange={event => { const [hour, minute] = event.target.value.split(':').map(Number); if (Number.isInteger(hour) && Number.isInteger(minute)) void save(schedule, { hour, minute }); }} /></td><td><select className="text-input" aria-label={`定时任务表 ${schedule.id}`} value={schedule.planId} disabled={busy} onChange={event=>{void save(schedule,{planId:event.target.value});}}>{!plans.some(plan=>plan.id===schedule.planId)&&<option value={schedule.planId}>已删除</option>}{plans.map(plan=><option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></td><td><select className="text-input" aria-label={`定时设备 ${schedule.id}`} value={schedule.deviceId} disabled={busy} onChange={event => { void save(schedule, { deviceId: event.target.value }); }}>{devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></td><td>{schedule.nextAt ? new Date(schedule.nextAt).toLocaleString('zh-CN') : '—'}</td><td>{schedule.disabledReason ?? String(schedule.last?.message ?? '尚未触发')}</td><td><select className="text-input" aria-label={`临时启停 ${schedule.id}`} value={schedule.override ?? 'clear'} disabled={busy} onChange={event => { void action(() => rpc('schedule.override', { id: schedule.id, mode: event.target.value as 'enable'|'skip'|'clear' })); }}><option value="clear">按保存设置</option><option value="enable">仅本次启用</option><option value="skip">仅本次跳过</option></select></td><td><button className="icon-button" aria-label={`删除定时 ${schedule.id}`} disabled={busy} onClick={() => { void action(() => rpc('schedule.delete', { id: schedule.id })); }}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>
    {!visible.length && <p className="sp-help">暂无定时计划。普通定时遇到设备忙会跳过当次，不排队、不补跑。</p>}
    <div className="schedule-create"><select className="text-input" aria-label="新增定时任务表" value={newPlan} onChange={event => setNewPlan(event.target.value)}><option value="">选择任务表</option>{plans.filter(plan => all || plan.id === planId).map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><select className="text-input" aria-label="新增定时设备" value={newDevice} onChange={event => setNewDevice(event.target.value)}><option value="">选择设备</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select><input className="text-input" type="time" aria-label="新增定时时间" value={newTime} onChange={event => setNewTime(event.target.value)} /><button className="button primary" disabled={busy || !newPlan || !newDevice || !newTime} onClick={() => { const [hour,minute]=newTime.split(':').map(Number); void action(() => rpc('schedule.save', { schedule: { id:'', planId:newPlan, deviceId:newDevice, hour, minute, enabled:true } })); }}><Plus size={15} />添加定时</button></div>
    <section className="sp-section"><h3>全局定时选项</h3><div className="schedule-options">
      <label><input type="checkbox" checked={options.forceScheduledStart} disabled={busy} onChange={event => settingsChange({forceScheduledStart:event.target.checked})} />强制定时启动</label><p>到点提供 10 秒取消倒计时，然后停止目标设备当前任务或工具，关闭游戏并执行目标任务表。需要启动游戏时，请启用表内“开始唤醒”。</p>
      <label><input type="checkbox" checked={options.showWindowBeforeForceScheduledStart} disabled={busy} onChange={event => settingsChange({showWindowBeforeForceScheduledStart:event.target.checked})} />强制启动前显示窗口</label>
      <label><input type="checkbox" checked={options.notifyBeforeScheduledStart} disabled={busy} onChange={event => settingsChange({notifyBeforeScheduledStart:event.target.checked})} />定时前通知</label><label>提前分钟数<input className="text-input" type="number" min={1} max={1439} value={options.notificationMinutes} disabled={busy} onChange={event => { const value=event.target.valueAsNumber;if(Number.isInteger(value)&&value>=1&&value<=1439)settingsChange({notificationMinutes:value}); }} /></label>
      <label><input type="checkbox" checked={options.scheduledWakeUp} disabled={busy || data?.wake.supported !== true} onChange={event => settingsChange({scheduledWakeUp:event.target.checked})} />Windows 提前五分钟唤醒并启动应用</label><p role="status">{String(data?.wake.message ?? '正在读取桌面唤醒支持情况')}</p><p>托盘驻留期间继续调度；关闭应用或系统休眠期间错过的定时不补跑。唤醒功能仅限 Windows，并受系统电源设置影响。</p>
    </div></section>
  </section>;
}
