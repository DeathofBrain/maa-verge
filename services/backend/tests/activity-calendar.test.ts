import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ActivityCalendar,
  officialCalendarUrls,
  validCalendarDocument,
  type ActivityCalendarOptions,
} from '../src/modules/home/activity-calendar';
import { stageCatalog, supportsStageNavigation } from '../src/modules/resources/stages';
import { Runtime } from '../src/app/runtime';
import { validateStageListResult } from '../../../packages/contracts/src/validators.js';

const roots: string[] = [],
  services: ActivityCalendar[] = [],
  runtimes: Runtime[] = [];
const temporary = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-calendar-test-'));
  roots.push(root);
  return root;
};
const initial = Date.parse('2026-10-26T01:00:00Z');
const dates = {
  StageName: '合成官方活动',
  UtcStartTime: '2026/10/25 12:00:00',
  UtcExpireTime: '2026/10/28 12:00:00',
  TimeZone: 8,
};
const document = () => ({
  Official: {
    sideStoryStage: {
      AA: {
        MinimumRequired: 'v6.20.0',
        Activity: { ...dates },
        Stages: [
          { Value: 'AA-8' },
          { Value: 'AA-7' },
          { Value: '17-11' },
          { Value: 'SSReopen-AA' },
        ],
      },
    },
  },
});
const fake = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) =>
  ((input: string | URL | Request, init: RequestInit) =>
    Promise.resolve(handler(String(input), init))) as unknown as typeof fetch;
const response = (data = document(), headers: Record<string, string> = {}) =>
  Response.json(data, { headers });
function service(
  fetcher: typeof fetch | null,
  options: ActivityCalendarOptions = {},
  root = temporary(),
) {
  const value = new ActivityCalendar(root, { now: () => new Date(initial), ...options, fetcher });
  services.push(value);
  return value;
}
function resource(tasks: Record<string, unknown>) {
  const root = temporary(),
    directory = path.join(root, 'resource/tasks');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'tasks.json'), JSON.stringify(tasks));
  return { core: { version: 'v6.20.0' }, resource: { path: root, version: 'synthetic-r1' } };
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const calendar of services.splice(0)) await calendar.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('official activity calendar cache', () => {
  test('fixed official URLs, successful validation and persistent cache survive an offline restart', async () => {
    const calls: string[] = [],
      root = temporary();
    const calendar = service(
      fake((url) => {
        calls.push(url);
        return response();
      }),
      {},
      root,
    );
    const first = await calendar.get();
    expect(calls).toEqual([officialCalendarUrls[0]]);
    expect(first.status).toMatchObject({
      source: 'official-cache',
      stale: false,
      refreshing: false,
      fetchedAt: new Date(initial).toISOString(),
    });
    expect(first.document).toEqual(document());
    const saved = JSON.parse(readFileSync(calendar.filename, 'utf8'));
    expect(saved.document).toEqual(document());
    expect(saved.url).toBe(officialCalendarUrls[0]);
    const reopened = service(
      fake(() => {
        throw new Error('must not fetch a fresh cache');
      }),
      {},
      root,
    );
    expect((await reopened.get()).document).toEqual(document());
  });
  test('concurrent clients share one fetch and repeated UI reads do not bypass the TTL', async () => {
    let calls = 0,
      current = initial;
    const calendar = service(
      fake(async () => {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return response();
      }),
      { now: () => new Date(current), ttlMs: 600 },
    );
    const values = await Promise.all(Array.from({ length: 20 }, () => calendar.get()));
    expect(values.every((value) => value.status.source === 'official-cache')).toBe(true);
    expect(calls).toBe(1);
    current += 599;
    await Promise.all(Array.from({ length: 10 }, () => calendar.get()));
    expect(calls).toBe(1);
    current += 1;
    const stale = await calendar.get();
    expect(stale.status.refreshing).toBe(true);
    expect(stale.status.stale).toBe(true);
    await calendar.get(true);
    expect(calls).toBe(2);
    expect((await calendar.get()).status.stale).toBe(false);
  });
  test('explicit refresh uses ETag and Last-Modified; 304 advances validation time without replacing content', async () => {
    let calls = 0,
      current = initial;
    const headers: Record<string, string>[] = [];
    const calendar = service(
      fake((_url, init) => {
        headers.push(init.headers as Record<string, string>);
        calls++;
        return calls === 1
          ? response(document(), {
              etag: '"synthetic-v1"',
              'last-modified': 'Sun, 25 Oct 2026 00:00:00 GMT',
            })
          : new Response(null, { status: 304 });
      }),
      { now: () => new Date(current) },
    );
    const first = await calendar.get();
    current += 60_000;
    const second = await calendar.get(true);
    expect(calls).toBe(2);
    expect(headers[1]['If-None-Match']).toBe('"synthetic-v1"');
    expect(headers[1]['If-Modified-Since']).toBe('Sun, 25 Oct 2026 00:00:00 GMT');
    expect(second.document).toEqual(first.document);
    expect(second.status.fetchedAt).toBe(first.status.fetchedAt);
    expect(second.status.checkedAt).toBe(new Date(current).toISOString());
  });
  test('primary failure retries the official fallback and does not leak primary validators to it', async () => {
    const calls: string[] = [];
    const calendar = service(
      fake((url, init) => {
        calls.push(url);
        expect(new Headers(init.headers).has('If-None-Match')).toBe(false);
        return url === officialCalendarUrls[0] ? new Response(null, { status: 503 }) : response();
      }),
    );
    const value = await calendar.get();
    expect(calls).toEqual([...officialCalendarUrls]);
    expect(value.status.url).toBe(officialCalendarUrls[1]);
    expect(value.status.error).toBeNull();
  });
  test('failed or malformed refresh retains the last valid disk and memory cache with retry backoff', async () => {
    let fail = false,
      calls = 0,
      current = initial;
    const calendar = service(
      fake(() => {
        calls++;
        return fail
          ? Response.json({
              Official: { sideStoryStage: { AA: { Activity: dates, Stages: 'corrupt' } } },
            })
          : response();
      }),
      { now: () => new Date(current), retryMs: 1000 },
    );
    const first = await calendar.get(),
      saved = readFileSync(calendar.filename, 'utf8');
    fail = true;
    current += 100;
    const failed = await calendar.get(true);
    expect(calls).toBe(3);
    expect(failed.document).toEqual(first.document);
    expect(failed.status.stale).toBe(true);
    expect(failed.status.error).toContain('上次有效缓存');
    expect(readFileSync(calendar.filename, 'utf8')).toBe(saved);
    current += 999;
    await calendar.get();
    expect(calls).toBe(3);
    current += 1;
    await calendar.get(true);
    expect(calls).toBe(5);
  });
  test('without a good cache both endpoint failures are bounded and UI polling waits for retry', async () => {
    let calls = 0;
    const calendar = service(
      fake(() => {
        calls++;
        throw new Error('synthetic offline');
      }),
    );
    const first = await calendar.get();
    expect(first.document).toBeUndefined();
    expect(first.status).toMatchObject({ source: 'unavailable', stale: true });
    expect(first.status.error).toContain('synthetic offline');
    await Promise.all(Array.from({ length: 10 }, () => calendar.get()));
    expect(calls).toBe(2);
  });
  test('a partial client response cannot replace a previously complete calendar', async () => {
    let partial = false;
    const complete = { ...document(), YoStarEN: { sideStoryStage: {} } };
    const calendar = service(fake(() => Response.json(partial ? document() : complete)));
    await calendar.get();
    partial = true;
    const result = await calendar.get(true);
    expect(result.document).toEqual(complete);
    expect(result.status.error).toContain('缺少已缓存的客户端');
  });
  test('a stalled injected fetch times out and shutdown cancels an in-flight request promptly', async () => {
    const calendar = service(
      fake(() => new Promise(() => {})),
      { timeoutMs: 10 },
    );
    expect((await calendar.get()).status.error).toContain('超时');
    const closing = service(
      fake(() => new Promise(() => {})),
      { timeoutMs: 60_000 },
    );
    const pending = closing.get();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await closing.close();
    expect((await pending).document).toBeUndefined();
  });
  test('stalled response bodies time out and late responses after shutdown are canceled', async () => {
    let canceled = 0;
    const calendar = service(
      fake(
        () =>
          new Response(
            new ReadableStream({
              cancel() {
                canceled++;
              },
            }),
          ),
      ),
      { timeoutMs: 10 },
    );
    expect((await calendar.get()).status.error).toContain('超时');
    expect(canceled).toBe(2);
    let release!: (value: Response) => void;
    const closing = service(
      fake(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
      { timeoutMs: 60_000 },
    );
    const pending = closing.get();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await closing.close();
    release(
      new Response(
        new ReadableStream({
          cancel() {
            canceled++;
          },
        }),
      ),
    );
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(canceled).toBe(3);
    expect(existsSync(closing.filename)).toBe(false);
  });
  test('HTTP errors, oversized lengths and streamed oversized bodies are canceled', async () => {
    for (const mode of ['http', 'length', 'body']) {
      let canceled = 0;
      const calendar = service(
        fake(
          () =>
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  if (mode === 'body') controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
                },
                cancel() {
                  canceled++;
                },
              }),
              {
                status: mode === 'http' ? 503 : 200,
                headers: mode === 'length' ? { 'content-length': String(2 * 1024 * 1024 + 1) } : {},
              },
            ),
        ),
      );
      expect((await calendar.get()).status.source).toBe('unavailable');
      expect(canceled).toBe(2);
    }
  });
  test('corrupt cache files are replaced only after a valid official response', async () => {
    const root = temporary(),
      directory = path.join(root, 'gui');
    mkdirSync(directory);
    const filename = path.join(directory, 'StageActivityV2.cache.json');
    writeFileSync(filename, '{broken');
    const calendar = service(
      fake(() => response()),
      {},
      root,
    );
    expect((await calendar.get()).status.error).toBeNull();
    expect(JSON.parse(readFileSync(filename, 'utf8')).document).toEqual(document());
    expect(validCalendarDocument({ error: 'rate limited' })).toBe(false);
    expect(
      validCalendarDocument({
        Official: {
          sideStoryStage: {
            AA: { Activity: { ...dates, UtcStartTime: '2026/02/30 12:00:00' }, Stages: [] },
          },
        },
      }),
    ).toBe(false);
  });
});

describe('official calendar and installed navigation', () => {
  test('official periods supply homepage activities while installed tasks determine selectable navigation', async () => {
    const calendar = service(fake(() => response())),
      combo = resource({ 'AA-8': {}, Episode17: {}, 'AA-OpenOpt': {} });
    const official = await calendar.get();
    const result = await stageCatalog(combo, 'Bilibili', new Date(initial), official);
    expect(validateStageListResult(result)).toBe(true);
    expect(result.activities[0]).toMatchObject({
      source: 'official-calendar',
      status: 'active',
      clientType: 'Bilibili',
      endAt: '2026-10-28T04:00:00.000Z',
    });
    expect(result.stages.find((stage) => stage.value === 'AA-8')?.available).toBe(true);
    expect(result.stages.find((stage) => stage.value === 'AA-7')).toMatchObject({
      available: false,
      tip: '当前资源尚未支持该关卡导航，请在更新中心更新核心与资源',
    });
    expect(result.stages.find((stage) => stage.value === '17-11')?.available).toBe(true);
    expect(result.stages.find((stage) => stage.value === 'SSReopen-AA')?.available).toBe(true);
    const missing = await stageCatalog({}, 'Official', new Date(initial), official);
    expect(missing.activities[0].status).toBe('active');
    expect(
      missing.stages
        .filter((stage) => stage.category === 'activity')
        .every((stage) => !stage.available),
    ).toBe(true);
  });
  test('official expiry overrides stale resource labels and is recalculated even from an offline cache', async () => {
    const calendar = service(fake(() => response())),
      combo = resource({ 'AA-8': {} }),
      official = await calendar.get();
    writeFileSync(
      path.join(combo.resource.path, 'resource/version.json'),
      JSON.stringify({ activity: { name: '合成官方活动', time: 1 } }),
    );
    expect(
      (
        await stageCatalog(combo, 'Official', new Date('2026-10-25T04:00:00Z'), official)
      ).stages.find((stage) => stage.value === 'AA-8')?.available,
    ).toBe(false);
    expect(
      (await stageCatalog(combo, 'Official', new Date('2026-10-28T04:00:00Z'), official))
        .activities,
    ).toEqual([]);
    expect((await stageCatalog(combo, 'YoStarEN', new Date(initial), official)).activities).toEqual(
      [],
    );
  });
  test('MaaCore generalized navigation preserves direct-task precedence, reopen and difficulty requirements', () => {
    const tasks = {
      'AA-8': {},
      'AA-OpenOpt': {},
      Episode17: {},
      Episode10: {},
      Episode9: {},
      Episode01: {},
      ChapterDifficultyHard: {},
      ChangeToRaidDifficulty: {},
      RaidConfirm: {},
      ChangeToNormalDifficulty: {},
      NormalConfirm: {},
      'odd-navigation': {},
    };
    for (const stage of [
      'AA-8',
      'SSReopen-AA',
      '17-11',
      '17-11-hard',
      '17-11-NORMAL',
      '10-1-HARD',
      'ABC01-2',
      'odd-navigation',
    ])
      expect(supportsStageNavigation(tasks, stage)).toBe(true);
    for (const stage of ['AA-7', 'SSReopen-AAA', '18-1', '9-1-hard', '17-11-unsupported'])
      expect(supportsStageNavigation(tasks, stage)).toBe(false);
    expect(
      supportsStageNavigation({ Episode17: {}, ChangeToRaidDifficulty: {} }, '17-11-Hard'),
    ).toBe(false);
  });
  test('runtime shares one official calendar across client requests and rejects arbitrary refresh values', async () => {
    let calls = 0;
    const runtime = new Runtime(temporary(), {
      validator: async () => {},
      calendar: {
        now: () => new Date(initial),
        fetcher: fake(() => {
          calls++;
          return response();
        }),
      },
    });
    runtimes.push(runtime);
    runtime.store.put('active', 'combo', resource({ 'AA-8': {}, Episode17: {}, 'AA-OpenOpt': {} }));
    const first = await runtime.handle('stages.list', { clientType: 'Official' });
    expect(first.activities[0].status).toBe('active');
    await runtime.handle('stages.list', { clientType: 'Bilibili' });
    expect(calls).toBe(1);
    await runtime.handle('stages.list', { refresh: true });
    expect(calls).toBe(2);
    await expect(runtime.handle('stages.list', { refresh: 1 })).rejects.toMatchObject({
      code: -32602,
    });
    expect(runtime.workers.size).toBe(0);
  });
});
