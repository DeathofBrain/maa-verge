import Select from '@/kit/Select';
import { useState } from 'react';
import { CalendarClock, Factory, RefreshCw } from 'lucide-react';
import type { Device, Settings } from '@maaverge/contracts';
import IconButton from '@/kit/IconButton';
import StatusPill from '@/kit/StatusPill';
import InfrastructureEditor from './InfrastructureEditor';
import { useHomeInfo, type HomeInfoClient as Client } from './useHomeInfo';
import { formatDate as time } from '@/kit/format';
import './game-info.css';

const clients: [Client, string][] = [
  ['Official', '官服'],
  ['Bilibili', 'B 服'],
  ['YoStarEN', '国际服'],
  ['YoStarJP', '日服'],
  ['YoStarKR', '韩服'],
  ['txwy', '繁中服'],
];
const remaining = (end: string, at: string) => {
  const hours = Math.max(0, Math.ceil((Date.parse(end) - Date.parse(at)) / 3_600_000));
  return hours >= 24 ? `${Math.floor(hours / 24)} 天 ${hours % 24} 小时` : `${hours} 小时`;
};

export default function GameInfoPanel({
  device,
  settings,
}: {
  device?: Device;
  settings: Settings;
}) {
  const [client, setClient] = useState<Client | ''>('');
  const { info, error, loading, refresh } = useHomeInfo(
    device?.id,
    client,
    settings.infrastructureEstimates,
  );
  const deviceEstimatesKey = JSON.stringify(
    settings.infrastructureEstimates?.find((profile) => profile.deviceId === device?.id)?.lines ||
      [],
  );
  const stages = info?.activityCatalog;
  const activeActivities =
    stages?.activities.filter((activity) => activity.status === 'active') || [];
  const otherActivities =
    stages?.activities.filter((activity) => activity.status !== 'active') || [];
  return (
    <section className="home-game-info" aria-label="游戏提醒与基建估算">
      <section className="home-panel game-calendar" aria-label="游戏日与活动提醒">
        <div className="home-panel-heading">
          <h2>
            <CalendarClock size={16} />
            游戏提醒
          </h2>
          <div className="game-info-controls">
            <Select
              aria-label="提醒使用的客户端"
              value={client}
              onChange={(event) => setClient(event.target.value as Client | '')}
            >
              <option value="">跟随所选设备</option>
              {clients.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <IconButton label="刷新游戏提醒" disabled={loading} onClick={() => refresh(true)}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </IconButton>
          </div>
        </div>
        <div className="game-info-body">
          {error && <p role="alert">{error}</p>}
          {info ? (
            <>
              <div className="game-day">
                <span>
                  {clients.find(([value]) => value === info.clientType)?.[1]} · 游戏日{' '}
                  {info.gameDate} · 周{'日一二三四五六'[info.weekday]}
                </span>
                <small>每日 04:00 换日 · 按服务器时区</small>
              </div>
              <div className={`game-weekly ${info.annihilation.kind}`}>
                <strong>
                  {info.annihilation.kind === 'weekly-reset'
                    ? '周一 · 剿灭刷新'
                    : info.annihilation.kind === 'weekly-last-day'
                      ? '周日 · 剿灭查漏'
                      : '本周剿灭提醒'}
                </strong>
                <p>{info.annihilation.message}</p>
                <small>
                  下次周刷新 {time(info.nextWeeklyResetAt)}（本机时间）· 未读取游戏内完成状态
                </small>
              </div>
            </>
          ) : (
            !error && <p className="game-muted">正在读取游戏日…</p>
          )}
          <div className="game-activity-list">
            <h3>活动与限时安排</h3>
            {activeActivities.length ? (
              activeActivities.map((activity) => (
                <article className="game-activity" key={activity.id}>
                  <div>
                    <strong>{activity.name}</strong>
                    <StatusPill tone="running" label="进行中" />
                  </div>
                  {activity.endAt && (
                    <p>
                      距结束约{' '}
                      {remaining(activity.endAt, info?.generatedAt || new Date().toISOString())} ·{' '}
                      {time(activity.endAt)} 结束（本机时间）
                    </p>
                  )}
                </article>
              ))
            ) : (
              <p className="game-muted">
                {stages
                  ? '暂无已确认开放期的活动。'
                  : error
                    ? '活动信息暂不可用。'
                    : '正在读取活动信息…'}
              </p>
            )}
            {otherActivities.map((activity) => (
              <article className="game-activity" key={activity.id}>
                <div>
                  <strong>{activity.name}</strong>
                  <span className="game-activity-unknown">
                    {activity.status === 'upcoming' ? '即将开放' : '资源标记活动 · 开放期未确认'}
                  </span>
                </div>
                {activity.status === 'upcoming' && activity.startAt && (
                  <p>{time(activity.startAt)} 开始（本机时间）</p>
                )}
              </article>
            ))}
            {stages && <small className="game-source">{stages.message}</small>}
            {stages?.calendar && (
              <small className="game-source">
                {stages.calendar.source === 'official-cache'
                  ? 'MAA 官方活动日历'
                  : stages.calendar.source === 'installed'
                    ? '已安装资源日历'
                    : '活动日历暂不可用'}
                {stages.calendar.fetchedAt ? ` · 数据更新 ${time(stages.calendar.fetchedAt)}` : ''}
                {stages.calendar.checkedAt ? ` · 最近检查 ${time(stages.calendar.checkedAt)}` : ''}
                {stages.calendar.stale ? ' · 缓存待更新' : ''}
                {stages.calendar.error ? ` · ${stages.calendar.error}` : ''}
              </small>
            )}
          </div>
        </div>
      </section>
      <section className="home-panel game-infrastructure" aria-label="基建产出估算">
        <div className="home-panel-heading">
          <h2>
            <Factory size={16} />
            基建产出<span>估算</span>
          </h2>
          <small>{device?.name || '未选择设备'}</small>
        </div>
        <div className="game-info-body">
          <p className="game-muted">
            {info?.infrastructure.message || '根据手工填写的产线参数计算，未读取游戏库存。'}
          </p>
          {info?.infrastructure.lines.map((line) => (
            <article className="game-production" key={line.id}>
              <div>
                <strong>{line.name}</strong>
                <span className={line.full ? 'is-full' : ''}>
                  {line.error
                    ? '待校准'
                    : `约 ${Math.floor(line.estimatedQuantity || 0).toLocaleString('zh-CN')} / ${line.capacity.toLocaleString('zh-CN')} ${line.unit}`}
                </span>
              </div>
              <progress
                max={line.capacity}
                value={line.estimatedQuantity || 0}
                aria-label={`${line.name}估算容量`}
              />
              <small>
                {line.error ||
                  (line.full
                    ? '预计已满，请到游戏中核对并收取'
                    : line.fullAt
                      ? `预计 ${time(line.fullAt)} 满仓（本机时间）`
                      : '速率为 0，不累积产出')}
              </small>
            </article>
          ))}
          {device && (
            <InfrastructureEditor
              key={`${device.id}:${deviceEstimatesKey}`}
              deviceId={device.id}
              settings={settings}
              onSaved={() => refresh()}
            />
          )}
        </div>
      </section>
    </section>
  );
}
