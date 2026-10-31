import Button from '@/kit/Button';
import IconButton from '@/kit/IconButton';
import PageHeading from '@/kit/PageHeading';
import ProgressBar from '@/kit/ProgressBar';
import { runDisplayName } from '@/shared/lib/run-source';
import { useContextMenu } from '@/kit/ContextMenu';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  History,
  House,
  LoaderCircle,
  Monitor,
  Settings2,
  ShieldCheck,
  Square,
  Terminal,
} from 'lucide-react';
import { localizeExecutionMessage, type Run, type Snapshot } from '@maaverge/contracts';
import './home-dashboard.css';
import GameInfoPanel from './GameInfoPanel';
import { resourceVersionDetail, resourceVersionLabel } from '@/shared/lib/update-display';
import { formatDate } from '@/kit/format';
import StatusPill from '@/kit/StatusPill';
import { runStatusLabels, runStatusTones, updateStatusShortLabels } from '@/kit/labels';

type Destination = 'tasks' | 'devices' | 'settings' | 'history' | 'copilot' | 'agent';
type Props = {
  snapshot: Snapshot;
  selectedDevice: string;
  stopping: boolean;
  onStopRun: (run: Run) => void;
  onShowRun: (run: Run) => void;
  onNavigate: (page: Destination) => void;
  onUpdates: () => void;
};

export default function HomeDashboard({
  snapshot,
  selectedDevice,
  stopping,
  onStopRun,
  onShowRun,
  onNavigate,
  onUpdates,
}: Props) {
  const now = new Date();
  const today = snapshot.runs.filter(
    (run) => new Date(run.startedAt).toDateString() === now.toDateString(),
  );
  const contextMenu = useContextMenu();
  const activeRuns = snapshot.runs.filter((run) => run.status === 'running');
  const recentRuns = [...snapshot.runs]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 4);
  const currentRun = activeRuns.find((run) => run.deviceId === selectedDevice) || activeRuns[0];
  const device = snapshot.devices.find((item) => item.id === selectedDevice);
  const resourceClient =
    snapshot.settings.deviceProfiles?.find((profile) => profile.address === device?.address)
      ?.connection.clientType ??
    snapshot.settings.connection?.clientType ??
    'Official';
  const connected = snapshot.devices.filter((item) => item.state !== 'offline');
  const metrics = [
    {
      label: '今日执行',
      aria: '今日执行统计',
      value: today.length,
      icon: Clock3,
      tone: 'blue',
    },
    {
      label: '今日完成',
      aria: '今日完成统计',
      value: today.filter((run) => run.status === 'completed').length,
      icon: CircleCheck,
      tone: 'green',
    },
    {
      label: '已连接设备',
      aria: '设备统计',
      value: connected.length,
      icon: Monitor,
      tone: 'violet',
    },
    {
      label: '正在运行',
      aria: '运行统计',
      value: activeRuns.length,
      icon: Activity,
      tone: 'amber',
    },
  ];

  return (
    <section className="home-dashboard" aria-label="主页仪表盘">
      <div className="home-container">
        <PageHeading
          className="home-heading"
          title="主页"
          icon={<House />}
          text="虽然没什么用，总归是要有一个的"
          actions={
            <span className="home-date">
              <CalendarDays size={14} />
              {now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
            </span>
          }
        />
        <div className="home-metrics">
          {metrics.map(({ label, aria, value, icon: Icon, tone }) => (
            <div className="home-metric" aria-label={aria} key={aria}>
              <div className="home-metric-top">
                <span>{label}</span>
                <span className={`home-metric-icon ${tone}`}>
                  <Icon size={18} />
                </span>
              </div>
              <strong className="numeric">{value}</strong>
            </div>
          ))}
        </div>

        <GameInfoPanel device={device} settings={snapshot.settings} />
        <div className="home-columns">
          <div className="home-primary">
            <section
              className={`home-panel home-current ${currentRun ? 'has-run' : ''}`}
              aria-label="当前执行"
            >
              <div className="home-panel-heading">
                <h2>
                  <Activity size={16} />
                  当前执行
                </h2>
                <span className={`home-live ${currentRun ? 'active' : ''}`}>
                  <span className={`status-dot ${currentRun ? '' : 'offline'}`} />
                  {currentRun ? '运行中' : '空闲'}
                </span>
              </div>
              {currentRun ? (
                <div className="home-current-body">
                  <h3>{runDisplayName(currentRun, snapshot.plans)}</h3>
                  <p>{localizeExecutionMessage(currentRun.message)}</p>
                  <div className="home-current-meta">
                    <span>
                      <Monitor size={13} />
                      {snapshot.devices.find((item) => item.id === currentRun.deviceId)?.name ||
                        '未知设备'}
                    </span>
                    <span>
                      <Clock3 size={13} />
                      开始于 {formatDate(currentRun.startedAt)}
                    </span>
                  </div>
                  <div className="home-progress-heading">
                    <span>任务进度</span>
                    <strong className="numeric">{currentRun.progress}%</strong>
                  </div>
                  <ProgressBar label="当前执行进度" value={currentRun.progress} />
                  <div className="home-current-actions">
                    <Button
                      variant="text"
                      className="home-run-details"
                      onClick={() => onShowRun(currentRun)}
                    >
                      查看运行详情
                      <ArrowRight size={13} />
                    </Button>
                    <Button
                      variant="danger"
                      className="home-stop-action"
                      disabled={stopping}
                      onClick={() => onStopRun(currentRun)}
                    >
                      <Square size={12} />
                      停止执行
                    </Button>
                  </div>
                  {activeRuns.length > 1 && (
                    <Button variant="text" onClick={() => onNavigate('history')}>
                      另有 {activeRuns.length - 1} 项执行，查看全部
                    </Button>
                  )}
                </div>
              ) : (
                <div className="home-idle">
                  <span className="home-idle-symbol">
                    <Check size={24} />
                  </span>
                  <h3>当前没有运行中的任务</h3>
                </div>
              )}
            </section>

            <section className="home-panel home-recent" aria-label="最近执行">
              <div className="home-panel-heading">
                <h2>最近执行</h2>
                <Button
                  variant="text"
                  className="home-panel-action"
                  onClick={() => onNavigate('history')}
                >
                  全部记录
                  <ArrowRight size={13} />
                </Button>
              </div>
              {recentRuns.length ? (
                <div className="home-recent-list">
                  {recentRuns.map((run) => (
                    <button
                      className="home-recent-row"
                      key={run.id}
                      {...contextMenu('执行记录菜单', [
                        { label: '查看执行详情', action: () => onShowRun(run) },
                        { label: '全部执行记录', action: () => onNavigate('history') },
                      ])}
                      aria-label={`查看执行${run.id}`}
                      onClick={() => onShowRun(run)}
                    >
                      <span className={`home-run-icon ${run.status}`}>
                        {run.status === 'completed' ? (
                          <Check size={16} />
                        ) : run.status === 'running' ? (
                          <LoaderCircle size={16} className="spin" />
                        ) : (
                          <History size={16} />
                        )}
                      </span>
                      <span className="home-recent-info">
                        <strong>{runDisplayName(run, snapshot.plans)}</strong>
                        <small>{localizeExecutionMessage(run.message)}</small>
                      </span>
                      <span className="home-recent-status">
                        <StatusPill
                          className="home-recent-pill"
                          tone={runStatusTones[run.status]}
                          label={runStatusLabels[run.status]}
                        />
                        <time>{formatDate(run.startedAt)}</time>
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="home-empty home-empty-history">
                  <span className="home-empty-history-icon">
                    <History size={23} />
                  </span>
                  <h3>还没有执行记录</h3>
                </div>
              )}
            </section>
          </div>

          <aside className="home-secondary">
            <section className="home-panel home-device" aria-label="当前设备">
              <div className="home-panel-heading">
                <h2>当前设备</h2>
                <Button
                  variant="text"
                  className="home-panel-action"
                  onClick={() => onNavigate('devices')}
                >
                  管理
                  <ArrowRight size={13} />
                </Button>
              </div>
              <div className="home-device-body">
                <div className="home-device-identity">
                  <span className="home-device-icon">
                    <Monitor size={23} />
                  </span>
                  <div>
                    <strong>{device?.name || '尚未选择设备'}</strong>
                    <span>
                      <span
                        className={`status-dot ${!device || device.state === 'offline' ? 'offline' : ''}`}
                      />
                      {!device || device.state === 'offline'
                        ? '未连接'
                        : device.state === 'running'
                          ? '执行中'
                          : '已连接 · 空闲就绪'}
                    </span>
                  </div>
                </div>
                {device && <p className="home-device-address">{device.address}</p>}
                <div className="home-device-setting">
                  <span>自动连接模拟器</span>
                  <span className={snapshot.settings.autoConnect ? 'enabled' : ''}>
                    {snapshot.settings.autoConnect ? '已开启' : '已关闭'}
                  </span>
                </div>
                {(!device || device.state === 'offline') && (
                  <Button
                    variant="secondary"
                    className="home-connect"
                    onClick={() => onNavigate('devices')}
                  >
                    前往连接设备
                    <ArrowRight size={14} />
                  </Button>
                )}
              </div>
            </section>
            <section className="home-panel home-updates" aria-label="组件版本">
              <div className="home-panel-heading">
                <h2>组件版本</h2>
                <IconButton label="打开更新设置" title="打开更新设置" onClick={onUpdates}>
                  <Settings2 size={15} />
                </IconButton>
              </div>
              <div className="home-version-list">
                {snapshot.updates.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={onUpdates}
                    title={
                      channel.id === 'resource'
                        ? `${resourceVersionDetail(channel, resourceClient)} · ${channel.message}`
                        : channel.message
                    }
                  >
                    <span>
                      {channel.id === 'app'
                        ? 'Maa Verge'
                        : channel.id === 'core'
                          ? 'MaaCore'
                          : '游戏资源'}
                      <strong>{resourceVersionLabel(channel, resourceClient)}</strong>
                    </span>
                    <small
                      className={
                        ['available', 'staged', 'waiting_idle', 'failed'].includes(channel.status)
                          ? 'attention'
                          : ''
                      }
                    >
                      {channel.id === 'app' && channel.status === 'idle'
                        ? '开发预览'
                        : updateStatusShortLabels[channel.status]}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <div className="home-shortcuts" aria-label="快捷入口">
          <button onClick={() => onNavigate('copilot')}>
            <span>
              <BookOpen size={19} />
            </span>
            <div>
              <strong>作业中心</strong>
              <small>管理与配置本地作业</small>
            </div>
            <ArrowRight size={16} />
          </button>
          <button onClick={() => onNavigate('agent')}>
            <span>
              <Bot size={20} />
            </span>
            <div>
              <strong>
                Agent 助手<em>预览</em>
              </strong>
              <small>从描述目标到审阅计划</small>
            </div>
            <ArrowRight size={16} />
          </button>
          <button onClick={() => onNavigate('tasks')}>
            <span>
              <ShieldCheck size={20} />
            </span>
            <div>
              <strong>任务消耗设置</strong>
              <small>在自动作战任务中设置用药与源石上限</small>
            </div>
            <ArrowRight size={16} />
          </button>
        </div>
        <footer className="home-footnote">
          <Terminal size={12} />
          任务与执行记录保存在本机。
        </footer>
      </div>
    </section>
  );
}
