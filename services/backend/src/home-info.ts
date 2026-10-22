import type { Settings } from '../../../packages/contracts/src/types';
import type { RpcContract } from '../../../packages/contracts/src/rpc-types';
import { RpcError } from './errors';
import { gameDate } from './user-data-sync';

type Client = RpcContract['results']['home.info']['clientType'];
const clients = ['Official', 'Bilibili', 'YoStarEN', 'YoStarJP', 'YoStarKR', 'txwy'];
const hour = 3_600_000, day = 24 * hour;
const timestamp = (value: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));

export function validateInfrastructureProfiles(profiles: Settings['infrastructureEstimates']) {
  const devices = new Set<string>();
  for (const profile of profiles || []) {
    if (devices.has(profile.deviceId)) throw new RpcError(-32602, '同一设备只能保存一份基建估算配置');
    devices.add(profile.deviceId);
    const ids = new Set<string>();
    for (const line of profile.lines) {
      if (ids.has(line.id) || !line.name.trim() || !line.unit.trim() || !timestamp(line.lastCollectedAt)) throw new RpcError(-32602, '基建产线名称、单位、时间或标识无效');
      ids.add(line.id);
    }
  }
}

/** Manual estimates begin at zero on the user's last collection time. Never infer collection from a task callback. */
export function homeInfo(settings: Settings, deviceId: string | undefined, clientType = 'Official', at = new Date()): RpcContract['results']['home.info'] {
  if (!clients.includes(clientType)) throw new RpcError(-32602, '游戏客户端无效');
  const current = gameDate(at, clientType);
  const midnight = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  const shift = clientType === 'YoStarEN' ? -11 * hour : ['YoStarJP', 'YoStarKR'].includes(clientType) ? 5 * hour : 4 * hour;
  const weekday = current.getUTCDay();
  const nextWeeklyResetAt = new Date(midnight + (((8 - weekday) % 7) || 7) * day - shift).toISOString();
  const lines = settings.infrastructureEstimates?.find(profile => profile.deviceId === deviceId)?.lines || [];
  return {
    generatedAt: at.toISOString(), clientType: clientType as Client,
    gameDate: current.toISOString().slice(0, 10), weekday,
    nextDailyResetAt: new Date(midnight + day - shift).toISOString(), nextWeeklyResetAt,
    annihilation: weekday === 1 ? { kind: 'weekly-reset', message: '剿灭周常已刷新，可安排本周合成玉。' }
      : weekday === 0 ? { kind: 'weekly-last-day', message: '本游戏周最后一天，记得核对剿灭合成玉是否领满。' }
        : { kind: 'weekly', message: '剿灭每周一 04:00 刷新，可提前安排本周合成玉。' },
    infrastructure: {
      deviceId: deviceId || null,
      message: !deviceId ? '选择设备后可配置基建产出估算。' : !lines.length ? '尚未配置产线，填写实际速率、容量和上次收取时间后估算。' : '仅按手工产线参数估算；不代表游戏实测库存，不自动确认已收取。',
      lines: lines.map(line => {
        const last = Date.parse(line.lastCollectedAt), elapsed = at.getTime() - last;
        const error = !Number.isFinite(last) ? '上次收取时间无效' : elapsed < 0 ? '上次收取时间晚于当前时间，请校准' : null;
        const estimatedQuantity = error ? null : Math.min(line.capacity, line.hourlyRate * elapsed / hour);
        const fullMs = line.hourlyRate > 0 ? last + line.capacity / line.hourlyRate * hour : NaN;
        return { ...line, estimatedQuantity, full: estimatedQuantity !== null && estimatedQuantity >= line.capacity,
          fullAt: Number.isFinite(fullMs) && Math.abs(fullMs) <= 8.64e15 ? new Date(fullMs).toISOString() : null, error };
      }),
    },
  };
}
