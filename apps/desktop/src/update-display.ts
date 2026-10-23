import type { ResourceActivityVersion, UpdateChannel } from '@maaverge/contracts';

export type ResourceClient = ResourceActivityVersion['clientType'];
export const resourceClientLabels: Record<ResourceClient, string> = {
  Official: '官服', Bilibili: 'B 服', YoStarEN: '国际服', YoStarJP: '日服', YoStarKR: '韩服', txwy: '繁中服',
};
export function resourceVersionLabel(channel: UpdateChannel, client: ResourceClient = 'Official'): string {
  if (channel.id !== 'resource' || !channel.currentVersion || channel.currentVersion === '未安装') return channel.currentVersion || '未安装';
  return channel.resourceActivities?.find(activity => activity.clientType === client)?.name || '活动信息未提供';
}
export function resourceVersionDetail(channel: UpdateChannel, client: ResourceClient = 'Official'): string {
  const activity = channel.resourceActivities?.find(item => item.clientType === client);
  return [resourceClientLabels[client], activity?.lastUpdated && `更新于 ${activity.lastUpdated}`,
    /^[a-f0-9]{40}$/.test(channel.currentVersion) ? channel.currentVersion.slice(0, 10) : channel.currentVersion].filter(Boolean).join(' · ');
}
