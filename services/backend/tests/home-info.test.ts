import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { homeInfo } from '../src/home-info';
import { defaultCapture, defaultConnection, parseSettings } from '../src/models';
import { Runtime } from '../src/runtime';

const roots: string[] = [], runtimes: Runtime[] = [];
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const line = { id: 'gold', name: '赤金制造站', unit: '块', hourlyRate: 20, capacity: 100, lastCollectedAt: '2026-10-25T18:00:00.000Z' };
test('annihilation switches from Sunday check to Monday reset exactly at client 04:00', () => {
  const settings = parseSettings();
  const before = homeInfo(settings, undefined, 'Official', new Date('2026-10-25T19:59:59.999Z'));
  const after = homeInfo(settings, undefined, 'Official', new Date('2026-10-25T20:00:00.000Z'));
  expect(before.annihilation.kind).toBe('weekly-last-day'); expect(before.gameDate).toBe('2026-10-25');
  expect(before.nextWeeklyResetAt).toBe('2026-10-25T20:00:00.000Z');
  expect(after.annihilation.kind).toBe('weekly-reset'); expect(after.gameDate).toBe('2026-10-26');
  expect(after.nextWeeklyResetAt).toBe('2026-11-01T20:00:00.000Z');
  expect(after.nextDailyResetAt).toBe('2026-10-26T20:00:00.000Z');
  expect(after.infrastructure.lines).toEqual([]);
});
test('server timezones stay independent from host timezone and EN has no daylight saving offset', () => {
  const at = new Date('2026-10-26T10:59:59.000Z');
  expect(homeInfo(parseSettings(), undefined, 'YoStarEN', at).weekday).toBe(0);
  expect(homeInfo(parseSettings(), undefined, 'YoStarJP', at).weekday).toBe(1);
  expect(homeInfo(parseSettings(), undefined, 'YoStarEN', new Date(at.getTime() + 1000)).weekday).toBe(1);
});
test('manual production estimates cap at capacity and never mix device profiles', () => {
  const settings = parseSettings({ infrastructureEstimates: [{ deviceId: 'a', lines: [line] }, { deviceId: 'b', lines: [{ ...line, hourlyRate: 2 }] }] });
  const at = new Date('2026-10-26T00:00:00Z');
  expect(homeInfo(settings, 'a', 'Official', at).infrastructure.lines[0]).toMatchObject({ estimatedQuantity: 100, full: true, fullAt: '2026-10-25T23:00:00.000Z' });
  expect(homeInfo(settings, 'b', 'Official', at).infrastructure.lines[0]).toMatchObject({ estimatedQuantity: 12, full: false });
  expect(homeInfo(settings, 'unknown', 'Official', at).infrastructure.lines).toEqual([]);
  expect(homeInfo(settings, 'a', 'Official', new Date('2026-10-25T17:00:00Z')).infrastructure.lines[0]).toMatchObject({ estimatedQuantity: null, full: false, error: '上次收取时间晚于当前时间，请校准' });
});
test('settings reject duplicate identities, malformed dates and invalid numeric rates', () => {
  for (const lines of [[line, line], [{ ...line, lastCollectedAt: 'not-an-iso-date-value' }], [{ ...line, hourlyRate: -1 }], [{ ...line, capacity: 0 }]]) expect(() => parseSettings({ infrastructureEstimates: [{ deviceId: 'a', lines }] })).toThrow();
  expect(() => parseSettings({ infrastructureEstimates: [{ deviceId: 'a', lines: [] }, { deviceId: 'a', lines: [] }] })).toThrow();
});
test('home.info uses persisted manual configuration and the selected device client without native calls', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'maaverge-home-info-')); roots.push(root);
  let runtime = new Runtime(root, { calendar: { fetcher: null } }); runtimes.push(runtime);
  runtime.store.put('device', 'a', { id: 'a', name: '合成设备', address: '127.0.0.1:5555', state: 'offline', coreVersion: null, resourceVersion: null });
  runtime.store.put('device_client', 'a', 'YoStarJP');
  await runtime.handle('settings.save', { settings: { infrastructureEstimates: [{ deviceId: 'a', lines: [line] }] } });
  expect((await runtime.handle('home.info', { deviceId: 'a' })).clientType).toBe('YoStarJP');
  await expect(runtime.handle('home.info', { deviceId: 'missing' })).rejects.toMatchObject({ code: -32004 });
  await expect(runtime.handle('home.info', { clientType: null })).rejects.toMatchObject({ code: -32602 });
  expect(runtime.workers.size).toBe(0);
  await runtime.close(); runtimes.pop();
  runtime = new Runtime(root, { calendar: { fetcher: null } }); runtimes.push(runtime);
  expect((await runtime.handle('home.info', { deviceId: 'a' })).infrastructure.lines[0].name).toBe(line.name);
});

test('home.info follows the selected instance client until a successful startup establishes account context', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'maaverge-home-client-')); roots.push(root);
  const runtime = new Runtime(root, { calendar: { fetcher: null } }); runtimes.push(runtime);
  runtime.store.put('device', 'a', { id: 'a', name: '合成实例', address: '127.0.0.1:5555', state: 'offline', coreVersion: null, resourceVersion: null, connectionProfileId: 'profile-a' });
  await runtime.handle('settings.save', { settings: { connection: { ...defaultConnection(), clientType: 'YoStarEN' }, deviceProfiles: [{ id: 'profile-a', name: '合成实例', address: '127.0.0.1:5555', connection: { ...defaultConnection(), clientType: 'YoStarKR' }, capture: defaultCapture() }] } });
  expect((await runtime.handle('home.info', { deviceId: 'a' })).clientType).toBe('YoStarKR');
  runtime.store.put('device_client', 'a', 'YoStarJP');
  expect((await runtime.handle('home.info', { deviceId: 'a' })).clientType).toBe('YoStarJP');
  expect((await runtime.handle('home.info', { deviceId: 'a', clientType: 'Bilibili' })).clientType).toBe('Bilibili');
});

test('home.info and stage selectors share the official calendar cache and explicit refresh', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'maaverge-home-calendar-')); roots.push(root);
  let requests = 0;
  const fetcher = (async () => {
    requests++;
    return new Response(JSON.stringify({ Official: { sideStoryStage: { sample: {
      Activity: { StageName: '合成官方活动', UtcStartTime: '2020/01/01 12:00:00', UtcExpireTime: '2099/01/01 12:00:00', TimeZone: 8 },
      Stages: [{ Display: '合成活动关卡 AA-8', Value: 'AA-8' }],
    } } } }), { headers: { ETag: '"synthetic-calendar"' } });
  }) as typeof fetch;
  const runtime = new Runtime(root, { calendar: { fetcher } }); runtimes.push(runtime);
  const home = await runtime.handle('home.info', {});
  expect(home.activityCatalog.activities[0]).toMatchObject({ name: '合成官方活动', status: 'active' });
  expect(home.activityCatalog.calendar.source).toBe('official-cache');
  const stages = await runtime.handle('stages.list', { clientType: 'Bilibili' });
  expect(stages.activities[0]).toMatchObject({ name: '合成官方活动', clientType: 'Bilibili' });
  expect(requests).toBe(1);
  await runtime.handle('home.info', { refresh: true });
  expect(requests).toBe(2);
  await expect(runtime.handle('home.info', { refresh: 'true' })).rejects.toMatchObject({ code: -32602 });
  expect(runtime.workers.size).toBe(0);
});
