import { useEffect, useState } from 'react';
import { CalendarClock, Factory, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { rpc, type Device, type Settings, type RpcResult } from '@maaverge/contracts';
import './game-info.css';

type Client = RpcResult<'home.info'>['clientType'];
type Line = NonNullable<Settings['infrastructureEstimates']>[number]['lines'][number];
type Lines = NonNullable<Settings['infrastructureEstimates']>[number]['lines'];
type LineDraft = { id: string; name: string; unit: string; hourlyRate: string; capacity: string; collected: string };
const clients: [Client, string][] = [['Official', '官服'], ['Bilibili', 'B 服'], ['YoStarEN', '国际服'], ['YoStarJP', '日服'], ['YoStarKR', '韩服'], ['txwy', '繁中服']];
const time = (value: string) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const localInput = (value: string) => { const at = new Date(value); return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const remaining = (end: string, at: string) => { const hours = Math.max(0, Math.ceil((Date.parse(end) - Date.parse(at)) / 3_600_000)); return hours >= 24 ? `${Math.floor(hours / 24)} 天 ${hours % 24} 小时` : `${hours} 小时`; };

export default function GameInfoPanel({ device, settings }: { device?: Device; settings: Settings }) {
  const [client, setClient] = useState<Client | ''>('');
  const [info, setInfo] = useState<RpcResult<'home.info'> | null>(null);
  const [stages, setStages] = useState<RpcResult<'stages.list'> | null>(null);
  const [error, setError] = useState('');
  const [activityError, setActivityError] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const estimatesKey = JSON.stringify(settings.infrastructureEstimates);
  const deviceEstimatesKey = JSON.stringify(settings.infrastructureEstimates?.find(profile => profile.deviceId === device?.id)?.lines || []);
  useEffect(() => {
    let active = true, busy = false;
    const refresh = async () => {
      if (busy) return; busy = true;
      setLoading(true);
      try {
        const next = await rpc('home.info', { ...(device ? { deviceId: device.id } : {}), ...(client ? { clientType: client } : {}) });
        if (!active) return;
        setInfo(next); setError('');
        try { const result = await rpc('stages.list', { clientType: next.clientType }); if (active) { setStages(result); setActivityError(''); } }
        catch (cause) { if (active) { setStages(null); setActivityError(cause instanceof Error ? cause.message : String(cause)); } }
      } catch (cause) { if (active) { setInfo(null); setStages(null); setError(cause instanceof Error ? cause.message : String(cause)); } }
      finally { busy = false; if (active) setLoading(false); }
    };
    setInfo(null); setStages(null); void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [device?.id, client, estimatesKey, revision]);
  const activeActivities = stages?.activities.filter(activity => activity.status === 'active') || [];
  const otherActivities = stages?.activities.filter(activity => activity.status !== 'active') || [];
  return <section className="home-game-info" aria-label="游戏提醒与基建估算">
    <section className="home-panel game-calendar" aria-label="游戏日与活动提醒">
      <div className="home-panel-heading"><h2><CalendarClock size={16} />游戏提醒</h2><div className="game-info-controls"><select aria-label="提醒使用的客户端" value={client} onChange={event => setClient(event.target.value as Client | '')}><option value="">跟随所选设备</option>{clients.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="icon-button" aria-label="刷新游戏提醒" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={14} className={loading ? 'spin' : ''} /></button></div></div>
      <div className="game-info-body">
        {error ? <p role="alert">{error}</p> : info ? <>
          <div className="game-day"><span>{clients.find(([value]) => value === info.clientType)?.[1]} · 游戏日 {info.gameDate} · 周{'日一二三四五六'[info.weekday]}</span><small>每日 04:00 换日 · 按服务器时区</small></div>
          <div className={`game-weekly ${info.annihilation.kind}`}><strong>{info.annihilation.kind === 'weekly-reset' ? '周一 · 剿灭刷新' : info.annihilation.kind === 'weekly-last-day' ? '周日 · 剿灭查漏' : '本周剿灭提醒'}</strong><p>{info.annihilation.message}</p><small>下次周刷新 {time(info.nextWeeklyResetAt)}（本机时间）· 未读取游戏内完成状态</small></div>
        </> : <p className="game-muted">正在读取游戏日…</p>}
        <div className="game-activity-list"><h3>活动与限时安排</h3>
          {activityError ? <p className="game-muted">活动信息暂不可用：{activityError}</p> : activeActivities.length ? activeActivities.map(activity => <article className="game-activity" key={activity.id}><div><strong>{activity.name}</strong><span className="pill running">进行中</span></div>{activity.endAt && <p>距结束约 {remaining(activity.endAt, info?.generatedAt || new Date().toISOString())} · {time(activity.endAt)} 结束（本机时间）</p>}</article>) : <p className="game-muted">{stages ? '暂无已确认开放期的活动。' : '正在读取活动信息…'}</p>}
          {otherActivities.map(activity => <article className="game-activity" key={activity.id}><div><strong>{activity.name}</strong><span className="game-activity-unknown">{activity.status === 'upcoming' ? '即将开放' : '资源标记活动 · 开放期未确认'}</span></div>{activity.status === 'upcoming' && activity.startAt && <p>{time(activity.startAt)} 开始（本机时间）</p>}</article>)}
          {stages && <small className="game-source">{stages.message}</small>}
        </div>
      </div>
    </section>
    <section className="home-panel game-infrastructure" aria-label="基建产出估算">
      <div className="home-panel-heading"><h2><Factory size={16} />基建产出<span>估算</span></h2><small>{device?.name || '未选择设备'}</small></div>
      <div className="game-info-body">
        <p className="game-muted">{info?.infrastructure.message || '根据手工填写的产线参数计算，未读取游戏库存。'}</p>
        {info?.infrastructure.lines.map(line => <article className="game-production" key={line.id}><div><strong>{line.name}</strong><span className={line.full ? 'is-full' : ''}>{line.error ? '待校准' : `约 ${Math.floor(line.estimatedQuantity || 0).toLocaleString('zh-CN')} / ${line.capacity.toLocaleString('zh-CN')} ${line.unit}`}</span></div><progress max={line.capacity} value={line.estimatedQuantity || 0} aria-label={`${line.name}估算容量`} /><small>{line.error || (line.full ? '预计已满，请到游戏中核对并收取' : line.fullAt ? `预计 ${time(line.fullAt)} 满仓（本机时间）` : '速率为 0，不累积产出')}</small></article>)}
        {device && <InfrastructureEditor key={`${device.id}:${deviceEstimatesKey}`} deviceId={device.id} settings={settings} onSaved={() => setRevision(value => value + 1)} />}
      </div>
    </section>
  </section>;
}

function InfrastructureEditor({ deviceId, settings, onSaved }: { deviceId: string; settings: Settings; onSaved: () => void }) {
  const saved = settings.infrastructureEstimates?.find(profile => profile.deviceId === deviceId)?.lines || [];
  const drafts = (lines: Line[]) => lines.map(line => ({ id: line.id, name: line.name, unit: line.unit, hourlyRate: String(line.hourlyRate), capacity: String(line.capacity), collected: localInput(line.lastCollectedAt) }));
  const [lines, setLines] = useState<LineDraft[]>(() => drafts(saved));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const patch = (id: string, value: Partial<LineDraft>) => { setLines(previous => previous.map(line => line.id === id ? { ...line, ...value } : line)); setMessage(''); };
  const submit = async () => {
    if (pending) return;
    setError(''); setMessage('');
    const values: Line[] = [];
    if (lines.length > 20) { setError('每台设备最多配置 20 条产线。'); return; }
    for (const line of lines) {
      const collected = Date.parse(line.collected), hourlyRate = Number(line.hourlyRate), capacity = Number(line.capacity);
      if (!line.name.trim() || !line.unit.trim() || line.hourlyRate === '' || line.capacity === '' || !Number.isFinite(hourlyRate) || hourlyRate < 0 || hourlyRate > 1e9 || !Number.isFinite(capacity) || capacity <= 0 || capacity > 1e9 || !Number.isFinite(collected) || collected > Date.now()) { setError('请填写名称、单位、非负速率、正数容量和不晚于现在的收取时间。'); return; }
      values.push({ id: line.id, name: line.name.trim(), unit: line.unit.trim(), hourlyRate, capacity, lastCollectedAt: new Date(collected).toISOString() });
    }
    setPending(true);
    try {
      await rpc('settings.save', { settings: { ...settings, infrastructureEstimates: [...(settings.infrastructureEstimates || []).filter(profile => profile.deviceId !== deviceId), { deviceId, lines: values as Lines }] } });
      setMessage('此设备的估算配置已保存'); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setPending(false); }
  };
  return <details className="game-estimate-editor"><summary>配置此设备的产线估算</summary><p>从上次收取后的空仓开始，按固定速率累积并在容量处封顶。干员心情、加成、订单完成和停工都会使实际结果不同；收取后请手动更新基准时间。</p><fieldset disabled={pending}>
    {lines.map((line, index) => <div className="game-line-form" key={line.id}><div className="game-line-title"><strong>产线 {index + 1}</strong><button className="icon-button" aria-label={`删除产线 ${index + 1}`} onClick={() => setLines(previous => previous.filter(item => item.id !== line.id))}><Trash2 size={14} /></button></div><label>名称<input className="text-input" aria-label={`产线 ${index + 1} 名称`} maxLength={80} value={line.name} placeholder="例如：制造站 1 · 赤金" onChange={event => patch(line.id, { name: event.target.value })} /></label><div className="game-line-numbers"><label>每小时产量<input className="text-input" aria-label={`产线 ${index + 1} 每小时产量`} type="number" min="0" max="1000000000" step="any" value={line.hourlyRate} onChange={event => patch(line.id, { hourlyRate: event.target.value })} /></label><label>容量<input className="text-input" aria-label={`产线 ${index + 1} 容量`} type="number" min="0.000001" max="1000000000" step="any" value={line.capacity} onChange={event => patch(line.id, { capacity: event.target.value })} /></label><label>单位<input className="text-input" aria-label={`产线 ${index + 1} 单位`} maxLength={20} value={line.unit} onChange={event => patch(line.id, { unit: event.target.value })} /></label></div><label>上次收取时间（本机时间）<input className="text-input" aria-label={`产线 ${index + 1} 上次收取时间`} type="datetime-local" value={line.collected} onChange={event => patch(line.id, { collected: event.target.value })} /></label><button className="text-button" onClick={() => patch(line.id, { collected: localInput(new Date().toISOString()) })}>我刚已收取，设为现在</button></div>)}
    <div className="game-editor-actions"><button className="button secondary" disabled={lines.length >= 20} onClick={() => setLines(previous => [...previous, { id: crypto.randomUUID(), name: '', unit: '个', hourlyRate: '', capacity: '', collected: '' }])}><Plus size={13} />添加产线</button><button className="button primary" onClick={() => void submit()}>{pending ? '保存中…' : '保存估算配置'}</button></div>
  </fieldset>{error && <p role="alert" className="game-form-error">{error}</p>}{message && <p role="status">{message}</p>}</details>;
}
