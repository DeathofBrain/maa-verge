import { Activity, ArrowRight, BookOpen, Bot, CalendarDays, Check, CircleCheck, Clock3, History, LoaderCircle, Monitor, Settings2, ShieldCheck, Square, Terminal } from 'lucide-react';
import { type Run, type Snapshot, type UpdateChannel } from '@maaverge/contracts';
import './home-dashboard.css';
import GameInfoPanel from './GameInfoPanel';

type Destination = 'devices' | 'settings' | 'history' | 'copilot' | 'agent';
type Props = {
  snapshot: Snapshot;
  selectedDevice: string;
  stopping: boolean;
  onStopRun: (run: Run) => void;
  onShowRun: (run: Run) => void;
  onNavigate: (page: Destination) => void;
  onUpdates: () => void;
};
const runLabels: Record<Run['status'], string> = { running: '执行中', completed: '已完成', failed: '执行失败', stopped: '已停止' };
const updateLabels: Record<UpdateChannel['status'], string> = { idle: '未检查', checking: '检查中', available: '有更新', downloading: '准备中', staged: '待生效', waiting_idle: '等待空闲', active: '已更新', failed: '更新失败' };
const dateTime = (value: string) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function HomeDashboard({ snapshot, selectedDevice, stopping, onStopRun, onShowRun, onNavigate, onUpdates }: Props) {
  const now = new Date();
  const today = snapshot.runs.filter((run) => new Date(run.startedAt).toDateString() === now.toDateString());
  const activeRuns = snapshot.runs.filter((run) => run.status === 'running');
  const recentRuns = [...snapshot.runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 4);
  const currentRun = activeRuns.find((run) => run.deviceId === selectedDevice) || activeRuns[0];
  const device = snapshot.devices.find((item) => item.id === selectedDevice);
  const connected = snapshot.devices.filter((item) => item.state !== 'offline');
  const metrics = [
    { label: '今日执行', aria: '今日执行统计', value: today.length, detail: '按本地日期统计运行次数', icon: Clock3, tone: 'blue' },
    { label: '今日完成', aria: '今日完成统计', value: today.filter((run) => run.status === 'completed').length, detail: '今日发起且已完成的执行', icon: CircleCheck, tone: 'green' },
    { label: '已连接设备', aria: '设备统计', value: connected.length, detail: connected.length ? `${connected.filter((item) => item.state === 'idle').length} 台空闲就绪` : '连接设备后开始执行', icon: Monitor, tone: 'violet' },
    { label: '正在运行', aria: '运行统计', value: activeRuns.length, detail: activeRuns.length ? '可随时查看进度或停止' : '当前没有执行中的任务', icon: Activity, tone: 'amber' },
  ];

  return <section className="home-dashboard" aria-label="主页仪表盘">
    <div className="home-container">
      <header className="home-heading">
        <div><div className="home-eyebrow"><span className="status-dot" />工作空间总览</div><h1>主页</h1><p>设备状态与执行动态，一目了然。</p></div>
        <span className="home-date"><CalendarDays size={14} />{now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span>
      </header>
      <div className="home-metrics">{metrics.map(({ label, aria, value, detail, icon: Icon, tone }) => <div className="home-metric" aria-label={aria} key={aria}>
        <div className="home-metric-top"><span>{label}</span><span className={`home-metric-icon ${tone}`}><Icon size={18} /></span></div>
        <strong className="numeric">{value}</strong><small>{detail}</small>
      </div>)}</div>

      <GameInfoPanel device={device} settings={snapshot.settings} />
      <div className="home-columns">
        <div className="home-primary">
          <section className={`home-panel home-current ${currentRun ? 'has-run' : ''}`} aria-label="当前执行">
            <div className="home-panel-heading"><h2><Activity size={16} />当前执行</h2><span className={`home-live ${currentRun ? 'active' : ''}`}><span className={`status-dot ${currentRun ? '' : 'offline'}`} />{currentRun ? '运行中' : '空闲'}</span></div>
            {currentRun ? <div className="home-current-body">
              <h3>{snapshot.plans.find((plan) => plan.id === currentRun.planId)?.name || '任务执行'}</h3><p>{currentRun.message}</p>
              <div className="home-current-meta"><span><Monitor size={13} />{snapshot.devices.find((item) => item.id === currentRun.deviceId)?.name || '未知设备'}</span><span><Clock3 size={13} />开始于 {dateTime(currentRun.startedAt)}</span></div>
              <div className="home-progress-heading"><span>任务进度</span><strong className="numeric">{currentRun.progress}%</strong></div>
              <div className="run-progress" role="progressbar" aria-label="当前执行进度" aria-valuenow={currentRun.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${currentRun.progress}%` }} /></div>
              <div className="home-current-actions"><button className="text-button" onClick={() => onShowRun(currentRun)}>查看运行详情<ArrowRight size={13} /></button><button className="button danger" disabled={stopping} onClick={() => onStopRun(currentRun)}><Square size={12} />停止执行</button></div>
              {activeRuns.length > 1 && <button className="text-button" onClick={() => onNavigate('history')}>另有 {activeRuns.length - 1} 项执行，查看全部</button>}
            </div> : <div className="home-idle"><span className="home-idle-symbol"><Check size={24} /></span><h3>当前没有运行中的任务</h3></div>}
          </section>

          <section className="home-panel home-recent" aria-label="最近执行">
            <div className="home-panel-heading"><h2>最近执行</h2><button className="text-button" onClick={() => onNavigate('history')}>全部记录<ArrowRight size={13} /></button></div>
            {recentRuns.length ? <div className="home-recent-list">{recentRuns.map((run) => <button className="home-recent-row" key={run.id} aria-label={`查看执行${run.id}`} onClick={() => onShowRun(run)}>
              <span className={`home-run-icon ${run.status}`}>{run.status === 'completed' ? <Check size={16} /> : run.status === 'running' ? <LoaderCircle size={16} className="spin" /> : <History size={16} />}</span>
              <span className="home-recent-info"><strong>{snapshot.plans.find((plan) => plan.id === run.planId)?.name || '已删除的任务表'}</strong><small>{run.message}</small></span>
              <span className="home-recent-status"><span className={`pill ${run.status}`}>{runLabels[run.status]}</span><time>{dateTime(run.startedAt)}</time></span><ArrowRight size={14} />
            </button>)}</div> : <div className="home-empty home-empty-history"><span className="home-empty-history-icon"><History size={23} /></span><h3>还没有执行记录</h3></div>}
          </section>
        </div>

        <aside className="home-secondary">
          <section className="home-panel home-device" aria-label="当前设备">
            <div className="home-panel-heading"><h2>当前设备</h2><button className="text-button" onClick={() => onNavigate('devices')}>管理<ArrowRight size={13} /></button></div>
            <div className="home-device-body"><div className="home-device-identity"><span className="home-device-icon"><Monitor size={23} /></span><div><strong>{device?.name || '尚未选择设备'}</strong><span><span className={`status-dot ${!device || device.state === 'offline' ? 'offline' : ''}`} />{!device || device.state === 'offline' ? '未连接' : device.state === 'running' ? '执行中' : '已连接 · 空闲就绪'}</span></div></div>
              {device && <p className="home-device-address">{device.address}</p>}
              <div className="home-device-setting"><span>自动连接模拟器</span><span className={snapshot.settings.autoConnect ? 'enabled' : ''}>{snapshot.settings.autoConnect ? '已开启' : '已关闭'}</span></div>
              {(!device || device.state === 'offline') && <button className="button secondary home-connect" onClick={() => onNavigate('devices')}>前往连接设备<ArrowRight size={14} /></button>}
            </div>
          </section>
          <section className="home-panel home-updates" aria-label="组件版本">
            <div className="home-panel-heading"><h2>组件版本</h2><button className="icon-button" aria-label="打开更新设置" title="打开更新设置" onClick={onUpdates}><Settings2 size={15} /></button></div>
            <div className="home-version-list">{snapshot.updates.map((channel) => <button key={channel.id} onClick={onUpdates} title={channel.message}><span>{channel.id === 'app' ? 'Maa Verge' : channel.id === 'core' ? 'MaaCore' : '游戏资源'}<strong>{channel.currentVersion || '未安装'}</strong></span><small className={['available', 'staged', 'waiting_idle', 'failed'].includes(channel.status) ? 'attention' : ''}>{channel.id === 'app' && channel.status === 'idle' ? '开发预览' : updateLabels[channel.status]}</small></button>)}</div>
          </section>
        </aside>
      </div>

      <div className="home-shortcuts" aria-label="快捷入口">
        <button onClick={() => onNavigate('copilot')}><span><BookOpen size={19} /></span><div><strong>作业中心</strong><small>管理与配置本地作业</small></div><ArrowRight size={16} /></button>
        <button onClick={() => onNavigate('agent')}><span><Bot size={20} /></span><div><strong>Agent 助手<em>预览</em></strong><small>从描述目标到审阅计划</small></div><ArrowRight size={16} /></button>
        <button onClick={() => onNavigate('settings')}><span><ShieldCheck size={20} /></span><div><strong>执行与消耗设置</strong><small>管理授权、限额与偏好</small></div><ArrowRight size={16} /></button>
      </div>
      <footer className="home-footnote"><Terminal size={12} />任务与执行记录保存在本机。</footer>
    </div>
  </section>;
}
