import path from 'node:path';
import { open, readdir, stat } from 'node:fs/promises';
import { stagePresets } from '../../../packages/contracts/src/stages';
import type { RpcContract } from '../../../packages/contracts/src/rpc-types';
import { gameDate } from './user-data-sync';

type Catalog = RpcContract['results']['stages.list'];
type ClientType = Catalog['clientType'];
type Stage = Catalog['stages'][number];
type Activity = Catalog['activities'][number];
type ObjectValue = Record<string, unknown>;
type Combo = { resource?: { path?: string; version?: string }; core?: { version?: string } };
const object = (value: unknown): value is ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, maximum: number): string | undefined => typeof value === 'string' && value.length > 0 && [...value].length <= maximum ? value : undefined;
const clientResource = (client: ClientType) => ['Official', 'Bilibili'].includes(client) ? '' : path.join('global', client, 'resource');
const calendarClient = (client: ClientType) => client === 'Bilibili' ? 'Official' : client;

// Read only fixed files beneath the active immutable generation. A caller cannot
// supply a filename, and a damaged resource pack cannot cause unbounded reads.
class ResourceReader {
  private remaining = 32 * 1024 * 1024;
  constructor(private root: string, private diagnostics: string[]) {}
  async json(relative: string, limit = 8 * 1024 * 1024): Promise<unknown> {
    let file;
    try {
      file = await open(path.join(this.root, relative), 'r');
      const info = await file.stat();
      if (!info.isFile() || info.size > limit || info.size > this.remaining) throw new Error('文件超出读取限制');
      this.remaining -= info.size;
      const buffer = Buffer.alloc(info.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > info.size) throw new Error('文件在读取期间变化');
      return JSON.parse(buffer.subarray(0, length).toString('utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.diagnostics.push(`无法读取资源 ${relative}：文件无效或超出限制`);
      return undefined;
    } finally { await file?.close(); }
  }
  async taskFiles(relative: string): Promise<string[]> {
    try {
      const entries = await readdir(path.join(this.root, relative), { withFileTypes: true });
      if (entries.length > 512) { this.diagnostics.push('活动关卡导航文件数量超出限制'); return []; }
      return entries.filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(entry => path.join(relative, entry.name)).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.diagnostics.push('无法读取活动关卡导航目录');
      return [];
    }
  }
}

function time(value: ObjectValue, key: string): number | undefined {
  const input = value[key], zone = value.TimeZone ?? 0;
  if (typeof input !== 'string' || typeof zone !== 'number' || !Number.isInteger(zone) || Math.abs(zone) > 14) return;
  const match = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(input);
  if (!match) return;
  const [, y, m, d, h, min, s] = match.map(Number);
  const stamp = Date.UTC(y, m - 1, d, h, min, s), check = new Date(stamp);
  if (y < 1970 || check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d || check.getUTCHours() !== h || check.getUTCMinutes() !== min || check.getUTCSeconds() !== s) return;
  return stamp - zone * 3_600_000;
}
function period(value: unknown) {
  if (!object(value)) return;
  const start = time(value, 'UtcStartTime'), end = time(value, 'UtcExpireTime');
  if (start === undefined || end === undefined || start >= end) return;
  return { start, end };
}
function version(value: unknown): { numbers: number[]; pre: string[] } | undefined {
  if (typeof value !== 'string') return;
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match) return;
  const numbers = match.slice(1, 4).map(Number);
  if (!numbers.every(Number.isSafeInteger)) return;
  const pre = match[4]?.split('.') ?? [];
  if (pre.some(part => /^0\d+$/.test(part))) return;
  return { numbers, pre };
}
function meetsVersion(current: ReturnType<typeof version>, required: NonNullable<ReturnType<typeof version>>): boolean {
  if (!current) return false;
  for (let i = 0; i < 3; i++) if (current.numbers[i] !== required.numbers[i]) return current.numbers[i] > required.numbers[i];
  if (!required.pre.length) return !current.pre.length;
  if (!current.pre.length) return true;
  for (let i = 0; i < Math.max(current.pre.length, required.pre.length); i++) {
    const a = current.pre[i], b = required.pre[i];
    if (a === b) continue;
    if (a === undefined || b === undefined) return b === undefined;
    const numericA = /^\d+$/.test(a), numericB = /^\d+$/.test(b);
    if (numericA !== numericB) return !numericA;
    return numericA ? a.length !== b.length ? a.length > b.length : a > b : a > b;
  }
  return true;
}

function parseCalendar(client: ObjectValue, clientType: ClientType, at: number, coreVersion: string | undefined, diagnostics: string[]) {
  const stages: Stage[] = [], activities: Activity[] = [], groups = client.sideStoryStage;
  const addActivity = (id: string, info: ObjectValue, dates: NonNullable<ReturnType<typeof period>>, fallbackName: string) => {
    if (at >= dates.end || activities.some(activity => activity.id === id) || activities.length >= 100) return;
    activities.push({ id, name: text(info.StageName, 300) ?? fallbackName, startAt: new Date(dates.start).toISOString(), endAt: new Date(dates.end).toISOString(), clientType, status: at <= dates.start ? 'upcoming' : 'active', source: 'activity-metadata' });
  };
  if (object(groups)) for (const [id, group] of Object.entries(groups).slice(0, 100)) {
    if (!text(id, 200) || !object(group)) continue;
    const info = group.Activity ?? group.activity, dates = period(info), entries = group.Stages ?? group.stages;
    if (!object(info) || !dates || !Array.isArray(entries)) { diagnostics.push(`活动 ${id.slice(0, 200)} 的关卡或开放时间无效`); continue; }
    addActivity(id, info, dates, id);
    for (const entry of entries.slice(0, 2000)) {
      if (!object(entry)) continue;
      const value = text(entry.Value, 200), label = text(entry.Display, 300) ?? value;
      if (!value || !label) continue;
      const ownInfo = entry.Activity ?? entry.activity, ownDates = ownInfo === undefined ? dates : period(ownInfo);
      if (!ownDates || at >= ownDates.end) continue;
      const minimum = entry.MinimumRequired ?? entry.minimumRequired ?? group.MinimumRequired ?? group.minimumRequired;
      const required = minimum === undefined ? undefined : version(minimum);
      if (minimum !== undefined && !required) { diagnostics.push(`关卡 ${value} 的最低核心版本无效`); continue; }
      const supported = !required || meetsVersion(version(coreVersion), required), open = ownDates.start < at;
      const activityId = ownInfo === undefined ? id : `${id}:${value}`.slice(0, 200);
      if (object(ownInfo)) addActivity(activityId, ownInfo, ownDates, text(info.StageName, 300) ?? id);
      const tip = !supported ? `需要核心 ${String(minimum).slice(0, 100)} 或更新版本` : !open ? '活动尚未开放' : text(entry.Drop, 1000) ?? text(info.Tip, 1000);
      stages.push({ value, label, category: 'activity', available: open && supported, activityId, ...(tip ? { tip } : {}) });
      if (stages.length >= 1900) break;
    }
    if (stages.length >= 1900) break;
  }
  const collection = period(client.resourceCollection);
  const collectionOpen = !!collection && collection.start < at && at < collection.end;
  if (collection && object(client.resourceCollection)) addActivity('resource-collection', client.resourceCollection, collection, '资源收集关卡全天开放');
  return { stages, activities, collectionOpen };
}

async function fallback(reader: ResourceReader, clientType: ClientType, at: number, diagnostics: string[]) {
  const selected = clientResource(clientType), result: { stages: Stage[]; activities: Activity[] } = { stages: [], activities: [] };
  const value = await reader.json(path.join(selected, 'version.json'), 256 * 1024);
  if (!object(value) || !object(value.activity)) return result;
  const name = text(value.activity.name, 300), stamp = value.activity.time;
  if (!name) return result;
  const start = typeof stamp === 'number' && Number.isFinite(stamp) && stamp > 0 && stamp < 8_640_000_000_000 ? new Date(stamp * 1000).toISOString() : null;
  const id = 'resource-current';
  result.activities.push({ id, name, startAt: start, endAt: null, clientType, status: start && at <= Date.parse(start) ? 'upcoming' : 'unknown', source: 'resource-version' });
  const tasks: ObjectValue = Object.create(null);
  // Older resources used tasks.json; newer resources split stage navigation.
  const roots = selected ? ['', selected] : [''];
  for (const root of roots) {
    const legacy = await reader.json(path.join(root, 'tasks.json'));
    if (object(legacy)) Object.assign(tasks, legacy);
    for (const file of await reader.taskFiles(path.join(root, 'tasks', 'Stages'))) {
      const part = await reader.json(file, 2 * 1024 * 1024);
      if (object(part)) Object.assign(tasks, part);
    }
  }
  const prefixes = new Set<string>();
  for (const [key, task] of Object.entries(tasks)) if (/^[A-Za-z0-9]+-OpenOcr$/.test(key) && object(task) && Array.isArray(task.text) && task.text.includes(name)) prefixes.add(key.slice(0, -'-OpenOcr'.length));
  for (const [key, task] of Object.entries(tasks)) {
    const match = /^([A-Za-z0-9]+)-(\d{1,2})$/.exec(key);
    if (!match || !prefixes.has(match[1]) || !object(task) || !Array.isArray(task.sub) || !task.sub.some(sub => sub === `${key}@${match[1]}-OpenOpt`)) continue;
    result.stages.push({ value: key, label: key, category: 'activity', available: result.activities[0].status !== 'upcoming', activityId: id, tip: '资源标记的活动关卡；本地资源未提供结束时间，请核对游戏内开放状态' });
  }
  result.stages.sort((a, b) => b.value.localeCompare(a.value, 'en', { numeric: true }));
  result.stages = result.stages.slice(0, 1900);
  diagnostics.push('本地资源未包含活动日历；仅显示资源版本标记及对应导航关卡，开放时间未确认');
  return result;
}

export async function stageCatalog(combo: Combo, clientType: ClientType = 'Official', at = new Date()): Promise<Catalog> {
  const diagnostics: string[] = [], timestamp = at.getTime();
  const result: Catalog = { clientType, resourceVersion: text(combo.resource?.version, 200) ?? null, source: 'builtin', generatedAt: at.toISOString(), stages: [], activities: [], message: '', diagnostics };
  let collectionOpen = false;
  const root = combo.resource?.path ? path.join(combo.resource.path, 'resource') : undefined;
  if (root && await stat(root).then(info => info.isDirectory(), () => false)) {
    result.source = 'installed';
    const reader = new ResourceReader(root, diagnostics);
    let calendar: ObjectValue | undefined;
    for (const relative of [path.join('gui', 'StageActivityV2.json'), 'StageActivityV2.json']) {
      const value = await reader.json(relative, 2 * 1024 * 1024);
      if (object(value) && object(value[calendarClient(clientType)])) { calendar = value[calendarClient(clientType)] as ObjectValue; break; }
    }
    if (calendar) {
      const parsed = parseCalendar(calendar, clientType, timestamp, combo.core?.version, diagnostics);
      result.stages = parsed.stages; result.activities = parsed.activities; collectionOpen = parsed.collectionOpen;
      result.message = '已读取当前启用资源的活动日历';
    } else {
      Object.assign(result, await fallback(reader, clientType, timestamp, diagnostics));
      result.message = result.activities.length ? '已读取资源标记的活动，开放时间未确认' : '当前资源未提供该客户端的活动信息';
    }
  } else result.message = '尚未启用可读取的资源，显示常驻关卡';
  const day = gameDate(at, clientType).getUTCDay();
  const permanent: Stage[] = stagePresets.map(preset => {
    const available = !preset.openDays || collectionOpen || preset.openDays.includes(day);
    return { value: preset.value, label: preset.label, category: preset.value ? 'permanent' : 'default', available, ...(!available ? { tip: '按客户端游戏日期，今日未开放' } : {}) };
  });
  const seen = new Set<string>();
  result.stages = [permanent[0], ...result.stages, ...permanent.slice(1)].filter(stage => { if (seen.has(stage.value)) return false; seen.add(stage.value); return true; });
  result.diagnostics = diagnostics.slice(0, 100).map(message => message.slice(0, 1000));
  return result;
}
