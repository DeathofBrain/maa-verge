import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { recognitionKey } from '@backend/modules/recognition/recognition';
import { defaultScheduler } from '@backend/modules/schedules/scheduler';
import { parseRecognition } from '@backend/modules/recognition/recognition';
import { toolCatalog } from '@backend/modules/tools/toolbox';

const roots: string[] = [],
  runtimes: Runtime[] = [];
class Worker {
  connected = true;
  safeIdle = true;
  events: any[] = [];
  tasks: any[] = [];
  stops = 0;
  async connect() {
    return { asyncId: 1 };
  }
  async waitConnected() {
    return true;
  }
  async task(task: any) {
    this.tasks.push(task);
    this.safeIdle = false;
    return { taskId: this.tasks.length };
  }
  async stop() {
    this.stops++;
    return { stopping: true };
  }
  async close() {
    this.connected = false;
    this.safeIdle = true;
  }
  callback(message: number, details: any = {}) {
    this.events.push({
      type: 'callback',
      message,
      details: { taskid: this.tasks.length, ...details },
    });
  }
  result(type: string, details: any) {
    this.callback(20003, {
      taskchain: type,
      what: type === 'Depot' ? 'DepotInfo' : 'OperBoxInfo',
      details,
    });
  }
  complete(success = true, pending: number[] = []) {
    this.callback(success ? 10002 : 10000);
    this.callback(3);
    this.safeIdle = !pending.length;
    this.events.push({ type: 'status', running: false, pendingAsync: pending });
  }
  idle() {
    this.safeIdle = true;
    this.events.push({ type: 'status', running: false, pendingAsync: [] });
  }
}
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-tools-scheduler-'));
  roots.push(root);
  let clock = new Date(2026, 9, 24, 3, 0, 0),
    worker = new Worker();
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
    workerFactory: async (config) => (config.address === '127.0.0.1:5555' ? worker : new Worker()),
    adbExecutable: () => 'synthetic-adb',
    validator: async () => {},
  });
  runtimes.push(r);
  r.store.put('active', 'combo', {
    core: { path: 'fixture-core', version: 'v6.20.0' },
    resource: { path: generation, version: 'fixture-r1' },
  });
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
  const plan = async (tasks = [{ type: 'Fight', params: { times: 1 } }]) =>
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

test('standalone recognition creates no plans or runs, waits for evidence and persists results', async () => {
  const { r, worker, device, start } = await fixture();
  expect((await r.handle('device.availability', { deviceId: device.id })).available).toBe(true);
  const job = await start('depot');
  await settle();
  expect(r.store.all('plan')).toHaveLength(0);
  expect(r.store.all('run')).toHaveLength(0);
  expect(r.snapshot().toolJobs?.[0].id).toBe(job.id);
  expect((await r.handle('device.availability', { deviceId: device.id })).owner).toBe('tool');
  worker.result('Depot', { done: true, data: '{"30012":12}' });
  worker.complete(true, [7]);
  await r.tick(true);
  expect(
    (await r.handle('recognition.get', { deviceId: device.id, kind: 'depot' })).collectedAt,
  ).toBeNull();
  worker.idle();
  await r.tick(true);
  expect((await r.handle('tool.get', { id: job.id })).status).toBe('completed');
  expect(
    (await r.handle('recognition.get', { deviceId: device.id, kind: 'depot' })).items[0].quantity,
  ).toBe(12);
  expect((await r.handle('device.availability', { deviceId: device.id })).available).toBe(true);
});

test('tool request deduplication and races cannot steal a device from an entire task table', async () => {
  const { r, worker, device, start, plan } = await fixture();
  await plan([
    { type: 'Fight', params: { times: 1 } },
    { type: 'Fight', params: { times: 1 } },
  ]);
  const run = await r.startRun({ planId: 'test-plan', deviceId: device.id, requestId: 'run-1' });
  await expect(start('depot')).rejects.toThrow('整个操作结束');
  worker.complete();
  await r.tick(true);
  expect(r.store.get('run', run.id).status).toBe('running');
  await expect(start('operators')).rejects.toThrow();
  worker.complete();
  await r.tick(true);
  const job = await start('depot', {}, 'same-request');
  expect((await start('depot', {}, 'same-request')).id).toBe(job.id);
  await expect(start('operators', {}, 'same-request')).rejects.toThrow('同一请求标识');
  await expect(
    r.startRun({ planId: 'test-plan', deviceId: device.id, requestId: 'run-2' }),
  ).rejects.toThrow();
});

test('failed standalone recognition preserves last successful result and invalid configuration is rejected', async () => {
  const { r, worker, device, start } = await fixture();
  const first = await start('depot');
  await settle();
  worker.result('Depot', { done: true, data: '{"30012":8}' });
  worker.complete();
  await r.tick(true);
  const second = await start('depot');
  await settle();
  worker.result('Depot', { done: true, data: '{"30012":99}' });
  worker.complete(false);
  await r.tick(true);
  expect((await r.handle('tool.get', { id: second.id })).status).toBe('failed');
  expect((await r.handle('recognition.get', { deviceId: device.id, kind: 'depot' })).runId).toBe(
    first.id,
  );
  await expect(
    start('inventory', {
      targets: [{ stage: '1-7', itemId: '30012', quantity: 1, medicine: -1, stone: 0, id: 'x' }],
    }),
  ).rejects.toThrow('请求无效');
});

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
  expect(worker.tasks).toHaveLength(0);
});

test('inventory refresh recomputes shortage and cumulative drop callbacks cannot inflate stock', async () => {
  const { r, worker, device, start } = await fixture();
  const job = await start('inventory', {
    targets: [{ id: 'rock', stage: '1-7', itemId: '30012', quantity: 15, medicine: 0, stone: 0 }],
    updateDepot: true,
  });
  for (let i = 0; i < 30 && !worker.tasks.length; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  expect(worker.tasks[0].type).toBe('Depot');
  worker.result('Depot', { done: true, data: '{"30012":12}' });
  worker.complete();
  await r.tick(true);
  expect(worker.tasks[1].params.drops).toEqual({ '30012': 3 });
  const drops = {
    taskchain: 'Fight',
    what: 'StageDrops',
    details: {
      stage: { stageCode: '1-7' },
      stats: [{ itemId: '30012', itemName: '固源岩', quantity: 3 }],
    },
  };
  worker.callback(20003, drops);
  worker.callback(20003, drops);
  await r.tick(true);
  expect(
    r.store
      .get('inventory', recognitionKey(device.id, 'Official', 'depot'))
      .items.find((item: any) => item.id === '30012').quantity,
  ).toBe(15);
  worker.complete();
  await r.tick(true);
  expect((await r.handle('tool.get', { id: job.id })).result.outcome).toBe('target_reached');
});

test('daily scheduler persists occurrence deduplication and never backfills missed minutes', async () => {
  const { r, device, schedule, setTime } = await fixture();
  await schedule();
  setTime(4, 0);
  await r.tick(true);
  await settle();
  await r.tick(true);
  expect(r.store.all('run')).toHaveLength(1);
  await r.tick(true);
  expect(r.store.all('run')).toHaveLength(1);
  const run = r.store.all('run')[0];
  expect(run.scheduleId).toBeString();
  expect(run.deviceId).toBe(device.id);
  setTime(4, 2, 0, 25);
  await r.tick(true);
  expect(r.store.all('run')).toHaveLength(1);
});

test('normal timer skips a busy tool and temporary skip only applies to its next occurrence', async () => {
  const { r, start, schedule, setTime } = await fixture();
  const first = await schedule();
  await start('depot');
  await settle();
  setTime(4, 0);
  await r.tick(true);
  expect(r.store.all('run')).toHaveLength(0);
  expect((await r.handle('schedule.list')).occurrences[0].status).toBe('skipped');
  await r.handle('schedule.override', { id: first.id, mode: 'skip' });
  setTime(4, 0, 0, 25);
  await r.tick(true);
  expect((await r.handle('schedule.list')).schedules[0].override).toBeNull();
});

test('forced scheduling can be cancelled before stopping, then takes over only after safe idle', async () => {
  const { r, worker, start, schedule, setTime } = await fixture();
  const timer = await schedule();
  await start('depot');
  await settle();
  r.store.put('settings', 'main', {
    ...r.snapshot().settings,
    scheduler: { ...defaultScheduler(), forceScheduledStart: true },
  });
  setTime(4, 0);
  await r.tick(true);
  let occurrence = (await r.handle('schedule.list')).occurrences[0];
  expect(occurrence.status).toBe('countdown');
  await r.handle('schedule.cancel', { id: occurrence.id });
  setTime(4, 0, 11);
  await r.tick(true);
  expect(worker.stops).toBe(0);
  await r.handle('schedule.save', { schedule: { ...timer, hour: 4, minute: 1 } });
  setTime(4, 1);
  await r.tick(true);
  setTime(4, 1, 11);
  await r.tick(true);
  await settle();
  expect(worker.stops).toBe(1);
  expect(r.store.all('run')).toHaveLength(0);
  worker.complete(true, [4]);
  await r.tick(true);
  expect(r.store.all('run')).toHaveLength(0);
  worker.idle();
  await r.tick(true);
  await settle();
  await r.tick(true);
  expect(r.store.all('run')).toHaveLength(1);
  expect(worker.tasks.at(-1).type).toBe('CloseDown');
});

test('same-device simultaneous timers use list order and deleted plans disable their timers', async () => {
  const { r, schedule, setTime } = await fixture();
  await schedule(0, 4, 'first');
  await schedule(0, 4, 'second');
  setTime(4, 0);
  await r.tick(true);
  await settle();
  expect(r.store.all('run')).toHaveLength(1);
  expect(
    r.store.all('schedule_occurrence').find((item) => item.scheduleId === 'second').status,
  ).toBe('skipped');
  r.store.delete('plan', 'test-plan');
  expect(
    (await r.handle('schedule.list')).schedules.every(
      (item: any) => !item.enabled && item.disabledReason,
    ),
  ).toBe(true);
});

test('audited games are detected from split resource files and cancelled preparation submits nothing', async () => {
  const { r, root, start, worker } = await fixture();
  const dir = path.join(root, 'generation/resource/tasks/MiniGame');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(root, 'generation/resource/tasks.json'), '{}');
  writeFileSync(
    path.join(dir, 'PixelPaint.json'),
    JSON.stringify({ 'MiniGame@PixelPaint@Begin': {} }),
  );
  writeFileSync(
    path.join(dir, 'SecretFront.json'),
    JSON.stringify({ 'MiniGame@SecretFront@Begin': {} }),
  );
  expect((await toolCatalog(r.store.get('active', 'combo'))).games).toEqual([
    'pixelpaint',
    'secretfront',
  ]);
  const job = await start('games', { game: 'pixelpaint' });
  await r.handle('tool.stop', { id: job.id });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(worker.tasks).toHaveLength(0);
  expect((await r.handle('tool.get', { id: job.id })).status).toBe('stopped');
});

test('inventory ordering uses refreshed attainment and only-first skips subsequent shortages', async () => {
  const { r, start, worker } = await fixture();
  const job = await start('inventory', {
    sortByProgress: true,
    onlyFirst: true,
    targets: [
      { id: 'a', stage: '1-7', itemId: '30012', quantity: 10, medicine: 0, stone: 0 },
      { id: 'b', stage: '1-7', itemId: '30013', quantity: 100, medicine: 0, stone: 0 },
    ],
  });
  for (let i = 0; i < 30 && !worker.tasks.length; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  worker.result('Depot', { done: true, data: '{"30012":9,"30013":1}' });
  worker.complete();
  await r.tick(true);
  expect(worker.tasks[1].params.drops).toEqual({ '30013': 99 });
  worker.complete();
  await r.tick(true);
  expect(worker.tasks).toHaveLength(2);
  expect((await r.handle('tool.get', { id: job.id })).result.outcome).toBe('partial');
});

test('recruit result normalization adds saved potentials and refuses malformed callback data', async () => {
  const { r, start, worker, device } = await fixture();
  r.store.put('recognition', recognitionKey(device.id, 'Official', 'operators'), {
    deviceId: device.id,
    clientType: 'Official',
    kind: 'operators',
    collectedAt: new Date().toISOString(),
    runId: 'old',
    items: [],
    operators: [
      {
        id: 'char_test',
        name: '合成干员',
        own: true,
        elite: 1,
        level: 20,
        potential: 4,
        rarity: 4,
      },
    ],
  });
  const job = await start('recruit');
  await settle();
  expect(worker.tasks[0].params).toMatchObject({
    times: 0,
    confirm: [],
    refresh: false,
    expedite: false,
    set_time: false,
  });
  worker.callback(20003, {
    taskchain: 'Recruit',
    what: 'RecruitResult',
    details: {
      result: [
        {
          tags: ['治疗'],
          level: 4,
          opers: [{ id: 'char_test', name: '合成干员', level: 4, private: 'discard' }],
        },
      ],
    },
  });
  worker.complete(true, [8]);
  await r.tick(true);
  expect((await r.handle('tool.get', { id: job.id })).result.combinations).toBeUndefined();
  worker.idle();
  await r.tick(true);
  expect((await r.handle('tool.get', { id: job.id })).result.combinations[0].operators[0]).toEqual({
    id: 'char_test',
    name: '合成干员',
    rarity: 4,
    potential: 4,
  });
  const successful = (await r.handle('tool.get', { id: job.id })).result;
  const failed = await start('recruit');
  await settle();
  worker.callback(20003, {
    what: 'RecruitResult',
    details: {
      result: [
        { tags: ['治疗'], level: 6, opers: [{ id: 'char_other', name: '失败结果', level: 6 }] },
      ],
    },
  });
  worker.complete(false);
  await r.tick(true);
  expect((await r.handle('tool.get', { id: failed.id })).result).toEqual(successful);
  const bad = await start('recruit');
  await settle();
  worker.callback(20003, {
    what: 'RecruitResult',
    details: { result: [{ level: 6, opers: 'bad' }] },
  });
  worker.complete();
  await r.tick(true);
  expect((await r.handle('tool.get', { id: bad.id })).status).toBe('failed');
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

test('cross-midnight preparation and notification occur once and completion updates the last result', async () => {
  const { r, schedule, setTime, worker } = await fixture();
  await schedule(1, 0);
  r.store.put('settings', 'main', {
    ...r.snapshot().settings,
    scheduler: { ...defaultScheduler(), notifyBeforeScheduledStart: true },
  });
  setTime(23, 56);
  await r.tick(true);
  await r.tick(true);
  expect(r.store.events().filter((event) => event.type === 'schedule.notice')).toHaveLength(1);
  setTime(23, 59);
  await r.tick(true);
  expect(r.store.events().filter((event) => event.type === 'schedule.preparing')).toHaveLength(1);
  setTime(0, 1, 0, 25);
  await r.tick(true);
  await settle();
  worker.complete();
  await r.tick(true);
  expect((await r.handle('schedule.list')).schedules[0].last.status).toBe('completed');
  setTime(0, 0, 0, 25);
  await r.tick(true);
  setTime(0, 1, 0, 25);
  await r.tick(true);
  expect(r.store.all('run')).toHaveLength(1);
});

test('daily deduplication survives restart and temporary overrides are discarded', async () => {
  const { r, root, schedule, setTime, device, worker } = await fixture();
  const item = await schedule();
  setTime(4, 0);
  await r.tick(true);
  await settle();
  worker.complete();
  await r.tick(true);
  await r.handle('schedule.override', { id: item.id, mode: 'skip' });
  await r.close();
  runtimes.splice(runtimes.indexOf(r), 1);
  const restarted = new Runtime(root, {
    now: () => new Date(2026, 9, 24, 4, 0),
    calendar: { fetcher: null },
    workerFactory: async () => new Worker(),
    adbExecutable: () => 'synthetic-adb',
  });
  runtimes.push(restarted);
  expect((await restarted.handle('schedule.list')).schedules[0].override).toBeNull();
  await restarted.tick(true);
  expect(restarted.store.all('run')).toHaveLength(1);
  expect(restarted.store.all('run')[0].deviceId).toBe(device.id);
});

test('separate devices run independent tools and retain the original target after another selection', async () => {
  const { r, start, worker } = await fixture();
  const second = await r.connectDevice({ address: '127.0.0.1:5557', name: '第二合成设备' });
  second.state = 'idle';
  r.store.put('device', second.id, second);
  const first = await start('depot');
  const other = await r.handle('tool.start', {
    kind: 'operators',
    deviceId: second.id,
    requestId: 'second-device',
  });
  await settle();
  expect(r.store.all('tool_job').filter((item) => item.status === 'running')).toHaveLength(2);
  worker.result('Depot', { done: true, data: '{"30012":5}' });
  worker.complete();
  await r.tick(true);
  expect((await r.handle('tool.get', { id: first.id })).status).toBe('completed');
  expect((await r.handle('tool.get', { id: other.id })).status).toBe('running');
  expect((await r.handle('device.availability', { deviceId: second.id })).owner).toBe('tool');
});

test('tool configuration is isolated at confirmed account boundaries and stop timeouts stay unknown', async () => {
  const { r, device, start } = await fixture();
  const identity = { deviceId: device.id, kind: 'inventory', clientType: 'Official' };
  await r.handle('tool.config.save', { ...identity, config: { onlyFirst: true } });
  r.store.put('device_account', device.id, 'second-account');
  expect(await r.handle('tool.config.get', identity)).toEqual({});
  r.store.put('device_account', device.id, '');
  expect(await r.handle('tool.config.get', identity)).toEqual({ onlyFirst: true });
  const job = await start('inventory', {
    targets: [{ id: 'a', stage: '1-7', itemId: '30012', quantity: 10, medicine: 0, stone: 0 }],
  });
  for (let i = 0; i < 30 && !r.store.get('execution', job.id); i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  const execution = r.store.get('execution', job.id);
  execution.stopRequested = Date.now() - 16_000;
  r.store.put('execution', job.id, execution);
  await r.tick(true);
  expect((await r.handle('tool.get', { id: job.id })).result.outcome).toBe('unknown');
});
