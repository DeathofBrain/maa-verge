import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { RunTask, RunDrop, RunArtifact } from '../../../packages/contracts/src/types';
import type { ScreenFrame } from '../../../packages/contracts/src/rpc-types';
import { RpcError } from './errors';

const facilities: Record<string, string> = { Mfg: '制造站', Trade: '贸易站', Control: '控制中枢', Power: '发电站', Reception: '会客室', Office: '办公室', Recycle: '加工站', Dorm: '宿舍', Processing: '加工站', Training: '训练室', AssistantChange: '助理' };
const products: Record<string, string> = { Money: '龙门币', Gold: '赤金', CombatRecord: '作战记录', PureGold: '赤金', OriginiumShard: '源石碎片', Chip: '芯片' };
const text = (value: unknown, limit = 200): string => typeof value === 'string' ? value.slice(0, limit) : '';
const quantity = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 2_147_483_647;

/** Uses the upstream cumulative stats, so repeated notifications cannot inflate totals. */
export function recordDrops(task: RunTask, details: any, at: string): boolean {
  if (!Array.isArray(details?.stats) || details.stats.length > 200) return false;
  const stage = text(details.stage?.stageCode);
  const stats = details.stats;
  if (!stats.every((drop: any) => drop && text(drop.itemId) && quantity(drop.quantity) && typeof drop.itemName === 'string')) return false;
  let changed = false;
  for (const drop of stats) {
    const itemId = text(drop.itemId), previous = task.drops.find(item => item.itemId === itemId);
    if (previous && drop.quantity <= previous.quantity) continue;
    const value: RunDrop = { itemId, name: text(drop.itemName) || itemId, quantity: drop.quantity, stage, at };
    if (previous) Object.assign(previous, value);
    else if (task.drops.length < 200) task.drops.push(value);
    else continue;
    changed = true;
  }
  return changed;
}

const infrastructureMessages: Record<string, string> = {
  EnterFacility: '已进入设施', ProductOfFacility: '识别到设施产物', NotEnoughStaff: '可用干员不足',
  CustomInfrastRoomOperators: '排班方案指定干员（尚未确认换班）', InfrastConfirmButton: '核心已确认换班',
  CustomInfrastRoomKeptUnchanged: '保留当前房间排班', CustomInfrastRoomsNotConfigured: '未配置的房间保留原排班',
  CustomInfrastRoomGroupsMatchFailed: '排班编组不可用',
};
/** CustomInfrastRoomOperators is a proposal; only the confirm callback says it was applied. */
export function recordInfrastructure(task: RunTask, what: string, details: any, at: string): boolean {
  if (!Object.hasOwn(infrastructureMessages, what) || !details || !Number.isInteger(details.index) || details.index < 0 || details.index > 99 || !text(details.facility, 80)) return false;
  const facility = text(details.facility, 80), room = details.index + 1;
  let record = task.infrastructure.find(item => item.facility === (facilities[facility] ?? facility) && item.room === room);
  if (!record) {
    if (task.infrastructure.length >= 100) return false;
    record = { facility: facilities[facility] ?? facility, room, operators: [], product: '', message: '', at };
    task.infrastructure.push(record);
  }
  const previous = JSON.stringify(record);
  if (what === 'CustomInfrastRoomOperators' && Array.isArray(details.names)) record.operators = details.names.filter((name: unknown) => typeof name === 'string').slice(0, 20).map((name: string) => text(name, 80));
  if (['CustomInfrastRoomKeptUnchanged', 'CustomInfrastRoomGroupsMatchFailed', 'CustomInfrastRoomsNotConfigured'].includes(what)) record.operators = [];
  if (what === 'ProductOfFacility') record.product = products[text(details.product)] ?? text(details.product);
  const message = infrastructureMessages[what]!;
  record.message = message;
  if (JSON.stringify(record) === previous) return false;
  record.at = at;
  return true;
}

/** Each run stores at most twelve PNGs, each task three, each image below 3 MiB. */
export class RunArtifacts {
  constructor(private root: string) {}
  save(runId: string, task: RunTask, frame: ScreenFrame, label: string) {
    const id = randomUUID(), directory = this.directory(runId), png = Buffer.from(frame.data, 'base64');
    if (png.length > 3 * 1024 * 1024 - 8192) throw new Error('执行截图超过大小限制');
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, id + '.png'), png, { flag: 'wx', mode: 0o600 });
    const artifact = { id, kind: 'screenshot' as const, label, capturedAt: frame.capturedAt, width: frame.width, height: frame.height };
    (task.artifacts as RunArtifact[]).push(artifact); return artifact;
  }
  read(runId: string, artifactId: string) {
    const file = path.join(this.directory(runId), artifactId + '.png');
    try {
      if (statSync(file).size > 3 * 1024 * 1024 - 8192) throw new Error();
      return { mimeType: 'image/png' as const, data: readFileSync(file).toString('base64') };
    } catch { throw new RpcError(-32004, '执行截图不存在或已不可用'); }
  }
  private directory(runId: string) {
    if (!/^run-[a-f0-9]{12}$/.test(runId)) throw new RpcError(-32004, '执行截图不存在');
    return path.join(this.root, 'run-artifacts', runId);
  }
}
