import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import type { RpcContract } from '../../../packages/contracts/src/rpc-types';

// The same fixed primary and fallback used by MAA v6.20.0 MaaUrls/MaaApiService.
export const officialCalendarUrls = [
  'https://api.maa.plus/MaaAssistantArknights/api/gui/StageActivityV2.json',
  'https://api2.maa.plus/MaaAssistantArknights/api/gui/StageActivityV2.json',
] as const;
const maximumBytes = 2 * 1024 * 1024;
const clients = ['Official', 'YoStarEN', 'YoStarJP', 'YoStarKR', 'txwy'];
type ObjectValue = Record<string, unknown>;
export type CalendarDocument = Record<string, ObjectValue>;
export type CalendarStatus = RpcContract['results']['stages.list']['calendar'];
export interface CalendarSnapshot { document?: CalendarDocument; status: CalendarStatus }
export interface ActivityCalendarOptions {
  /** null explicitly disables networking for isolated tests. */
  fetcher?: typeof fetch | null;
  now?: () => Date;
  ttlMs?: number;
  retryMs?: number;
  timeoutMs?: number;
  changed?: () => void;
}
type Cache = { formatVersion: 1; url: string; fetchedAt: string; checkedAt: string; etag: string | null; lastModified: string | null; document: CalendarDocument };
export const calendarObject = (value: unknown): value is ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown, length: number) => typeof value === 'string' && value.length > 0 && [...value].length <= length;

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
export function calendarPeriod(value: unknown) {
  if (!calendarObject(value)) return;
  const start = time(value, 'UtcStartTime'), end = time(value, 'UtcExpireTime');
  if (start === undefined || end === undefined || start >= end) return;
  return { start, end };
}

/** Reject partial/error responses before they can replace the last good calendar. */
export function validCalendarDocument(value: unknown): value is CalendarDocument {
  if (!calendarObject(value) || !calendarObject(value.Official)) return false;
  for (const client of clients) {
    const data = value[client];
    if (data === undefined) continue;
    if (!calendarObject(data) || !calendarObject(data.sideStoryStage) || Object.keys(data.sideStoryStage).length > 100) return false;
    if (data.resourceCollection !== undefined && !calendarPeriod(data.resourceCollection)) return false;
    let count = 0;
    for (const [id, group] of Object.entries(data.sideStoryStage)) {
      if (!string(id, 200) || !calendarObject(group)) return false;
      const info = group.Activity ?? group.activity, stages = group.Stages ?? group.stages;
      if (!calendarPeriod(info) || !Array.isArray(stages) || (count += stages.length) > 1900) return false;
      for (const stage of stages) {
        if (!calendarObject(stage) || !string(stage.Value, 200) || stage.Display !== undefined && !string(stage.Display, 300)) return false;
        const ownInfo = stage.Activity ?? stage.activity;
        if (ownInfo !== undefined && !calendarPeriod(ownInfo)) return false;
      }
    }
  }
  return true;
}

const header = (value: string | null) => value && value.length <= 500 && !/[\r\n]/.test(value) ? value : null;
async function boundedFile(filename: string): Promise<unknown> {
  const file = await open(filename, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maximumBytes + 4096) throw new Error('缓存超出大小限制');
    const buffer = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > info.size) throw new Error('缓存在读取期间变化');
    return JSON.parse(buffer.subarray(0, length).toString('utf8'));
  } finally { await file.close(); }
}
function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

export class ActivityCalendar {
  readonly filename: string;
  private readonly fetcher: typeof fetch | null;
  private readonly now: () => Date;
  private readonly ttl: number;
  private readonly retry: number;
  private readonly timeout: number;
  private readonly abort = new AbortController();
  private loaded?: Promise<void>;
  private pending?: Promise<void>;
  private cache?: Cache;
  private nextAttempt = 0;
  private failures = 0;
  private error: string | null = null;
  private closed = false;
  constructor(root: string, private options: ActivityCalendarOptions = {}) {
    this.filename = path.join(root, 'gui', 'StageActivityV2.cache.json');
    this.fetcher = options.fetcher === undefined ? fetch : options.fetcher;
    this.now = options.now ?? (() => new Date());
    this.ttl = options.ttlMs ?? 6 * 3_600_000;
    this.retry = options.retryMs ?? 5 * 60_000;
    this.timeout = options.timeoutMs ?? 8_000;
  }
  private async load() {
    try {
      const value = await boundedFile(this.filename);
      if (!calendarObject(value) || value.formatVersion !== 1 || !officialCalendarUrls.includes(value.url as typeof officialCalendarUrls[number])
        || typeof value.fetchedAt !== 'string' || !Number.isFinite(Date.parse(value.fetchedAt))
        || typeof value.checkedAt !== 'string' || !Number.isFinite(Date.parse(value.checkedAt)) || !validCalendarDocument(value.document)) throw new Error('活动日历缓存无效');
      this.cache = { formatVersion: 1, url: value.url as string, fetchedAt: value.fetchedAt, checkedAt: value.checkedAt,
        etag: typeof value.etag === 'string' ? header(value.etag) : null, lastModified: typeof value.lastModified === 'string' ? header(value.lastModified) : null, document: value.document };
      const checked = Date.parse(value.checkedAt), now = this.now().getTime();
      this.nextAttempt = checked <= now ? checked + this.ttl : 0;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.error = '本地活动日历缓存无效，将重新获取官方日历';
    }
  }
  private snapshot(): CalendarSnapshot {
    const now = this.now().getTime(), checked = this.cache ? Date.parse(this.cache.checkedAt) : 0;
    return { ...(this.cache ? { document: this.cache.document } : {}), status: {
      source: this.cache ? 'official-cache' : 'unavailable', url: this.cache?.url ?? null,
      fetchedAt: this.cache?.fetchedAt ?? null, checkedAt: this.cache?.checkedAt ?? null,
      nextRefreshAt: this.nextAttempt ? new Date(this.nextAttempt).toISOString() : null,
      stale: !this.cache || !!this.error || checked > now || now - checked >= this.ttl,
      refreshing: !!this.pending, error: this.error,
    } };
  }
  async get(refresh = false): Promise<CalendarSnapshot> {
    await (this.loaded ??= this.load());
    if (this.closed) return this.snapshot();
    if (!this.fetcher) { this.error = '活动日历联网获取已关闭'; return this.snapshot(); }
    if (refresh || this.now().getTime() >= this.nextAttempt) {
      const request = this.pending ??= this.update().finally(() => {
        this.pending = undefined;
        if (!this.closed) this.options.changed?.();
      });
      // Serve a previous valid calendar immediately while revalidating it.
      if (refresh || !this.cache) await request;
    }
    return this.snapshot();
  }
  private async persist(cache: Cache) {
    await mkdir(path.dirname(this.filename), { recursive: true });
    const temporary = this.filename + `.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx');
      try { await file.writeFile(JSON.stringify(cache)); await file.sync(); } finally { await file.close(); }
      this.abort.signal.throwIfAborted();
      await rename(temporary, this.filename);
    } finally { await rm(temporary, { force: true }); }
  }
  private async request(url: string): Promise<Cache> {
    const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(new Error('官方活动日历请求超时')), this.timeout);
    const signal = AbortSignal.any([this.abort.signal, timeout.signal]);
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'maa-verge/0.1' };
    if (this.cache?.url === url) {
      if (this.cache.etag) headers['If-None-Match'] = this.cache.etag;
      if (this.cache.lastModified) headers['If-Modified-Since'] = this.cache.lastModified;
    }
    let response: Response | undefined;
    try {
      const request = this.fetcher!(url, { headers, signal }).then(value => {
        if (signal.aborted) { void value.body?.cancel().catch(() => {}); signal.throwIfAborted(); }
        return value;
      });
      response = await bounded(request, signal);
      signal.throwIfAborted();
      const checkedAt = this.now().toISOString();
      if (response.status === 304 && this.cache?.url === url) return { ...this.cache, checkedAt };
      if (!response.ok || !response.body) throw new Error(`官方活动日历 HTTP ${response.status}`);
      const length = Number(response.headers.get('content-length') ?? 0);
      if (!Number.isSafeInteger(length) || length < 0 || length > maximumBytes) throw new Error('官方活动日历超出大小限制');
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let count = 0;
      try {
        while (true) {
          const part = await bounded(reader.read(), signal);
          if (part.done) break;
          if ((count += part.value.length) > maximumBytes) throw new Error('官方活动日历超出大小限制');
          chunks.push(part.value);
        }
      } finally { void reader.cancel().catch(() => {}); }
      signal.throwIfAborted();
      const document: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!validCalendarDocument(document)) throw new Error('官方活动日历格式无效');
      if (this.cache && clients.some(client => this.cache!.document[client] !== undefined && document[client] === undefined)) throw new Error('官方活动日历缺少已缓存的客户端');
      return { formatVersion: 1, url, fetchedAt: checkedAt, checkedAt, document, etag: header(response.headers.get('etag')), lastModified: header(response.headers.get('last-modified')) };
    } finally { void response?.body?.cancel().catch(() => {}); clearTimeout(timer); }
  }
  private async update() {
    let failure: unknown;
    for (const url of officialCalendarUrls) {
      if (this.closed) return;
      try {
        const cache = await this.request(url);
        this.abort.signal.throwIfAborted();
        await this.persist(cache);
        this.cache = cache; this.failures = 0; this.error = null; this.nextAttempt = this.now().getTime() + this.ttl;
        return;
      } catch (error) { failure = error; }
    }
    if (this.closed) return;
    this.failures++;
    this.nextAttempt = this.now().getTime() + Math.min(this.retry * 2 ** Math.min(this.failures - 1, 4), 3_600_000);
    const reason = failure instanceof Error ? failure.message : String(failure);
    this.error = `官方活动日历更新失败${this.cache ? '，继续使用上次有效缓存' : ''}：${reason}`.slice(0, 1000);
  }
  async close(): Promise<void> { this.closed = true; this.abort.abort(new Error('应用服务正在关闭')); await this.pending; }
}
