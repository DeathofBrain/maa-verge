import type { Event, ResourceActivityVersion, UpdateChannel } from '@maaverge/contracts';

export function downloadSpeedLabel(channel: UpdateChannel): string | undefined {
  const speed = channel.downloadSpeedBytesPerSecond;
  if (
    channel.status !== 'downloading' ||
    speed === undefined ||
    !Number.isFinite(speed) ||
    speed < 0
  )
    return undefined;
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const unit =
    speed < 1 ? 0 : Math.min(units.length - 1, Math.floor(Math.log(speed) / Math.log(1024)));
  const value = speed / 1024 ** unit;
  return `${unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Download/check progress does not change the installed game data. */
export function gameDataChanged(event: Event): boolean {
  if (event.type === 'calendar.changed') return true;
  const update = event.data.update;
  return (
    event.type === 'update.changed' &&
    ['core', 'resource'].includes(String(event.data.channel)) &&
    !!update &&
    typeof update === 'object' &&
    'status' in update &&
    update.status === 'active'
  );
}

type GameClient = ResourceActivityVersion['clientType'];
export type ResourceClient = Exclude<GameClient, 'Bilibili'>;
export const resourceClientFor = (client: GameClient): ResourceClient =>
  client === 'Bilibili' ? 'Official' : client;
export const resourceClientLabels: Record<ResourceClient, string> = {
  Official: '国服（官服 / B服）',
  YoStarEN: '国际服',
  YoStarJP: '日服',
  YoStarKR: '韩服',
  txwy: '繁中服',
};
export function resourceVersionLabel(
  channel: UpdateChannel,
  client: GameClient = 'Official',
): string {
  if (channel.id !== 'resource' || !channel.currentVersion || channel.currentVersion === '未安装')
    return channel.currentVersion || '未安装';
  return (
    channel.resourceActivities?.find(
      (activity) => activity.clientType === resourceClientFor(client),
    )?.name || '活动信息未提供'
  );
}
export function resourceVersionDetail(
  channel: UpdateChannel,
  client: GameClient = 'Official',
): string {
  const resourceClient = resourceClientFor(client);
  const activity = channel.resourceActivities?.find((item) => item.clientType === resourceClient);
  return [
    resourceClientLabels[resourceClient],
    activity?.lastUpdated && `更新于 ${activity.lastUpdated}`,
    /^[a-f0-9]{40}$/.test(channel.currentVersion)
      ? channel.currentVersion.slice(0, 10)
      : channel.currentVersion,
  ]
    .filter(Boolean)
    .join(' · ');
}
