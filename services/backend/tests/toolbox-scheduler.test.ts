import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { FakeFramework, frameworkFixtureOptions } from './framework-fixture';
import { recognitionKey } from '@backend/modules/recognition/recognition';
import { defaultScheduler } from '@backend/modules/schedules/scheduler';
import { parseRecognition } from '@backend/modules/recognition/recognition';
import { toolCatalog } from '@backend/modules/tools/toolbox';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
};
async function drive(r: Runtime, count = 4) {
  for (let i = 0; i < count; i++) {
    await r.tick(true);
    // 等待当前异步准入阶段收敛；计时仍由测试时钟控制，不依赖磁盘在 10 ms 内完成。
    const deadline = Date.now() + 2000;
    while (r.scheduler['pending'].size && Date.now() < deadline) await settle();
    expect(r.scheduler['pending'].size).toBe(0);
  }
}
async function fixture() {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-tools-scheduler-'));
  roots.push(root);
  let clock = new Date(2026, 9, 24, 3, 0, 0),
    worker = new FakeFramework();
  const generation = path.join(root, 'generation'),
    resource = path.join(generation, 'resource');
  mkdirSync(resource, { recursive: true });
  writeFileSync(
    path.join(resource, 'recruitment.json'),
    JSON.stringify({
      tags: { 治疗: '治疗', 医疗干员: '医疗干员' },
      operators: [{ id: 'char_test', name: '合成干员', rarity: 4, tags: ['治疗', '医疗干员'] }],
    }),
  );
  writeFileSync(
    path.join(resource, 'tasks.json'),
    JSON.stringify({ 'MiniGame@PixelPaint@Begin': {}, 'MiniGame@SecretFront@Begin@EndingA': {} }),
  );
  const r = new Runtime(root, {
    now: () => new Date(clock),
    calendar: { fetcher: null },
    ...frameworkFixtureOptions(),
    frameworkWorkerFactory: async (config) =>
      config.address === '127.0.0.1:5555' ? worker : new FakeFramework(),
    adbExecutable: () => 'synthetic-adb',
    validator: async () => {},
  });
  runtimes.push(r);
  r.store.put('active', 'combo', {
    resource: { path: generation, version: 'fixture-r1' },
  });
  worker.holdTasks = true;
  const device = await r.connectDevice({ address: '127.0.0.1:5555', name: '合成设备' });
  device.state = 'idle';
  r.store.put('device', device.id, device);
  const start = (kind: string, config: any = {}, requestId: string = crypto.randomUUID()) =>
    r.handle('tool.start', {
      kind,
      deviceId: device.id,
      clientType: 'Official',
      requestId,
      config,
    });
  const plan = async (tasks = [{ type: 'CloseDown', params: {} }]) =>
    r.handle('plan.save', { plan: { id: 'test-plan', name: '合成任务表', tasks } });
  const schedule = async (minute = 0, hour = 4, id = '') => {
    await plan();
    return r.handle('schedule.save', {
      schedule: { id, planId: 'test-plan', deviceId: device.id, hour, minute, enabled: true },
    });
  };
  const setTime = (hour: number, minute: number, second = 0, date = 24) => {
    clock = new Date(2026, 9, date, hour, minute, second);
  };
  return { r, root, worker, device, start, plan, schedule, setTime };
}
afterEach(async () => {
  for (const r of runtimes.splice(0)) await r.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}, 30_000);

test('manual public recruitment uses installed data and has no native recruitment effects', async () => {
  const { r, worker, start } = await fixture();
  const job = await start('recruit', { mode: 'manual', tags: ['治疗'] });
  for (let i = 0; i < 30; i++) {
    await settle();
    if ((await r.handle('tool.get', { id: job.id })).status !== 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const completed = await r.handle('tool.get', { id: job.id });
  expect(completed.status).toBe('completed');
  expect(completed.result.combinations[0].minimumRarity).toBe(4);
  expect(worker.submitted).toHaveLength(0);
});

test('full scans, copilot games and inventory execution are blocked while their management stays available', async () => {
  const { r, start, worker } = await fixture();
  for (const kind of ['depot', 'operators', 'inventory', 'data', 'games', 'recruit'])
    await expect(start(kind, kind === 'games' ? { game: 'pixelpaint' } : {})).rejects.toMatchObject(
      { code: -32010 },
    );
  expect(r.store.all('tool_job')).toHaveLength(0);
  expect(worker.submitted).toHaveLength(0);
});
test('manual recruitment requests remain idempotent after disconnect and restart', async () => {
  const { r, start, root, device } = await fixture();
  const job = await start('recruit', { mode: 'manual', tags: ['治疗'] }, 'manual-once');
  await settle();
  await r.disconnectDevice(device.id);
  expect((await start('recruit', { mode: 'manual', tags: ['治疗'] }, 'manual-once')).id).toBe(
    job.id,
  );
  await r.close();
  const reopened = new Runtime(root, frameworkFixtureOptions());
  runtimes.push(reopened);
  expect(
    (
      await reopened.handle('tool.start', {
        deviceId: device.id,
        kind: 'recruit',
        clientType: 'Official',
        config: { mode: 'manual', tags: ['治疗'] },
        requestId: 'manual-once',
      })
    ).id,
  ).toBe(job.id);
});
test('daily scheduling deduplicates complete immutable tables and never backfills missed minutes', async () => {
  const { r, device, schedule, setTime } = await fixture();
  await schedule();
  setTime(4, 0);
  await drive(r);
  expect(r.store.all('run')).toHaveLength(1);
  expect(r.store.all('run')[0].deviceId).toBe(device.id);
  await drive(r);
  expect(r.store.all('run')).toHaveLength(1);
  setTime(4, 2, 0, 25);
  await drive(r);
  expect(r.store.all('run')).toHaveLength(1);
});
test('forced scheduling refuses an unsupported tail before countdown, stop or device preparation', async () => {
  const { r, device, schedule, setTime, worker } = await fixture();
  await schedule();
  await r.handle('plan.save', {
    plan: { id: 'active', name: '进行中', tasks: [{ type: 'CloseDown' }] },
  });
  const current = await r.startRun({ planId: 'active', deviceId: device.id, requestId: 'active' });
  await settle();
  await r.handle('plan.save', {
    plan: {
      id: 'test-plan',
      name: '不兼容尾项',
      tasks: [{ type: 'CloseDown' }, { type: 'Roguelike' }],
    },
  });
  r.store.put('settings', 'main', {
    ...r.snapshot().settings,
    scheduler: { ...defaultScheduler(), forceScheduledStart: true },
  });
  const calls = worker.calls.length;
  setTime(4, 0);
  await drive(r);
  setTime(4, 0, 20);
  await drive(r);
  expect(r.store.all('schedule_occurrence')[0].status).toBe('failed');
  expect(r.store.events().some((event) => event.type === 'schedule.countdown')).toBe(false);
  expect(worker.calls).toHaveLength(calls);
  expect(r['execution'](current.id).status).toBe('running');
});
test('compatible forced countdown can be cancelled without stopping current work', async () => {
  const { r, device, schedule, setTime, worker } = await fixture();
  await schedule();
  await r.handle('plan.save', {
    plan: { id: 'active', name: '进行中', tasks: [{ type: 'CloseDown' }] },
  });
  const current = await r.startRun({ planId: 'active', deviceId: device.id, requestId: 'active' });
  await settle();
  r.store.put('settings', 'main', {
    ...r.snapshot().settings,
    scheduler: { ...defaultScheduler(), forceScheduledStart: true },
  });
  setTime(4, 0);
  await drive(r, 2);
  const occurrence = r.store.all('schedule_occurrence')[0];
  expect(occurrence.status).toBe('countdown');
  await r.handle('schedule.cancel', { id: occurrence.id });
  setTime(4, 0, 11);
  await drive(r);
  expect(worker.calls.filter((call) => call.operation === 'stop')).toHaveLength(0);
  expect(r['execution'](current.id).status).toBe('running');
});
test('normal simultaneous timers keep persisted order and deletion disables only associated schedules', async () => {
  const { r, schedule, setTime } = await fixture();
  const first = await schedule(0, 4, 'first');
  await schedule(0, 4, 'second');
  setTime(4, 0);
  await drive(r);
  expect(r.store.all('run')).toHaveLength(1);
  expect(r.store.all('run')[0].scheduleId).toBe(first.id);
  expect(
    r.store.all('schedule_occurrence').find((item) => item.scheduleId === 'second').status,
  ).toBe('skipped');
  await r.stopRun(r.store.all('run')[0].id);
  await r.handle('plan.delete', { id: 'test-plan' });
  expect(r.store.all('schedule').every((item) => item.enabled === false)).toBe(true);
});
test('schedule occurrence deduplication and source history survive restart', async () => {
  const { r, root, schedule, setTime } = await fixture();
  const timer = await schedule();
  setTime(4, 0);
  await drive(r);
  const run = r.store.all('run')[0];
  await r.stopRun(run.id);
  await r.handle('schedule.override', { id: timer.id, mode: 'skip' });
  await r.close();
  const reopened = new Runtime(
    root,
    frameworkFixtureOptions({ now: () => new Date(2026, 9, 24, 4, 0) }),
  );
  runtimes.push(reopened);
  await drive(reopened);
  expect(reopened.store.all('run')).toHaveLength(1);
  expect(reopened.store.all('run')[0].scheduleId).toBe(timer.id);
  expect((await reopened.handle('schedule.list')).schedules[0].override).toBeNull();
});
test('complete operator roster retains unowned identities without inventing progression', () => {
  const value = parseRecognition('OperBox', {
    taskchain: 'OperBox',
    what: 'OperBoxInfo',
    details: {
      done: true,
      own_opers: [
        { id: 'char_a', name: '持有', own: true, elite: 1, level: 30, potential: 2, rarity: 4 },
      ],
      all_opers: [
        { id: 'char_a', name: '持有', own: true, rarity: 4 },
        { id: 'char_b', name: '未持有', own: false, rarity: 6 },
      ],
    },
  });
  expect(value?.operators[1]).toEqual({
    id: 'char_b',
    name: '未持有',
    own: false,
    rarity: 6,
    elite: -1,
    level: -1,
    potential: -1,
  });
});
