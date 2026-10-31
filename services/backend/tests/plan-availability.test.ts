import { afterEach, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { parsePlan, parseSettings } from '@backend/modules/settings/models';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots = new Set<string>();
const runtimes: Runtime[] = [];
class Worker {
  connected = true;
  safeIdle = true;
  events: any[] = [];
  tasks: any[] = [];
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
    return { stopping: true };
  }
  async close() {
    this.connected = false;
    this.safeIdle = true;
  }
}
function fixture(
  root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-plan-availability-')),
) {
  roots.add(root);
  const worker = new Worker();
  let clock = new Date(2026, 9, 30, 3, 0);
  const runtime = new Runtime(root, {
    now: () => new Date(clock),
    calendar: { fetcher: null },
    workerFactory: async () => worker,
    validator: async () => {},
    adbExecutable: () => 'synthetic-adb',
  });
  runtimes.push(runtime);
  runtime.store.put(
    'settings',
    'main',
    parseSettings({ autoConnect: false, autoUpdateCore: false, autoUpdateResource: false }),
  );
  runtime.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource', version: 'r1' },
  });
  const setTime = (minute: number) => {
    clock = new Date(2026, 9, 30, 4, minute);
  };
  return { runtime, worker, setTime };
}
async function connect(runtime: Runtime) {
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  device.state = 'idle';
  runtime.store.put('device', device.id, device);
  return device;
}
async function settle() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

const legacyPlan = () => ({
  ...parsePlan({
    id: 'legacy',
    name: '旧任务表',
    tasks: [{ type: 'Award' }, { type: 'Fight', enabled: false }],
  }),
  enabled: false,
});

test('persisted disabled plans can execute after restart while disabled tasks remain skipped', async () => {
  const first = fixture().runtime;
  first.store.put('plan', 'legacy', legacyPlan());
  await first.close();
  runtimes.splice(runtimes.indexOf(first), 1);

  const { runtime, worker } = fixture(first.root);
  expect(runtime.snapshot().plans[0]).toMatchObject({ id: 'legacy', enabled: true });
  const device = await connect(runtime);
  const run = await runtime.startRun({
    planId: 'legacy',
    deviceId: device.id,
    requestId: 'legacy-manual',
  });
  expect(run.status).toBe('running');
  expect(worker.tasks.map((task) => task.type)).toEqual(['Award']);
  expect(runtime.store.get('run_plan', run.id).tasks.map((task: any) => task.type)).toEqual([
    'Award',
  ]);
});

test('legacy client saves normalize plan enablement without changing per-task enablement', async () => {
  const { runtime } = fixture();
  const saved = await runtime.handle('plan.save', { plan: legacyPlan() });
  expect(saved.enabled).toBe(true);
  expect(runtime.store.get('plan', 'legacy').enabled).toBe(true);
  expect(saved.tasks.map((task: any) => task.enabled)).toEqual([true, false]);
});

test('legacy plan enablement cannot block an enabled schedule or enable a disabled schedule', async () => {
  const { runtime, worker, setTime } = fixture();
  const device = await connect(runtime);
  runtime.store.put('plan', 'legacy', legacyPlan());
  for (const [id, minute, enabled] of [
    ['disabled', 0, false],
    ['enabled', 1, true],
  ] as const)
    await runtime.handle('schedule.save', {
      schedule: { id, planId: 'legacy', deviceId: device.id, hour: 4, minute, enabled },
    });

  setTime(0);
  await runtime.tick(true);
  await settle();
  expect(runtime.store.all('run')).toHaveLength(0);
  expect(runtime.store.get('schedule', 'disabled').enabled).toBe(false);

  setTime(1);
  await runtime.tick(true);
  await settle();
  await runtime.tick(true);
  const runs = runtime.store.all('run');
  expect(runs).toHaveLength(1);
  expect(runs[0].scheduleId).toBe('enabled');
  expect(worker.tasks.map((task) => task.type)).toEqual(['Award']);
  expect(runtime.store.get('schedule', 'disabled').enabled).toBe(false);
});
