/** Framework 正式执行的隔离行为：持久查重、整表门禁、未知结果、预算及每设备会话。 */
import { afterEach, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';
import { FakeFramework, frameworkFixtureOptions, seedFrameworkResource } from './framework-fixture';

const roots: string[] = [],
  runtimes: Runtime[] = [];
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Framework fixture did not settle');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
async function fixture(root?: string) {
  root ??= makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-execution-'));
  if (!roots.includes(root)) roots.push(root);
  const workers: FakeFramework[] = [];
  const runtime = new Runtime(
    root,
    frameworkFixtureOptions({
      frameworkWorkerFactory: async () => {
        const worker = new FakeFramework();
        workers.push(worker);
        return worker;
      },
    }),
  );
  runtimes.push(runtime);
  seedFrameworkResource(runtime);
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  const save = (tasks: any[] = [{ type: 'CloseDown' }]) =>
    runtime.handle('plan.save', { plan: { id: 'execution', name: '隔离执行', tasks } });
  const start = (requestId = 'run', target = device.id) =>
    runtime.startRun({ planId: 'execution', deviceId: target, requestId });
  await save();
  return { root, runtime, device, workers, save, start };
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('without any MaaCore files, registered Framework lifecycle executes and preserves evidence', async () => {
  const { root, runtime, device, workers, start } = await fixture();
  expect(existsSync(path.join(root, 'core'))).toBe(false);
  const run = await start();
  await until(() => runtime['execution'](run.id).status !== 'running');
  expect(runtime['execution'](run.id)).toMatchObject({
    status: 'completed',
    tasks: [{ type: 'CloseDown', status: 'completed' }],
  });
  expect(workers[0]!.calls.filter((call) => call.operation === 'stop_app')).toEqual([
    { operation: 'stop_app', params: { appId: 'com.hypergryph.arknights' } },
  ]);
  expect(runtime.store.all('execution_evidence')[0].result).toMatchObject({
    status: 'completed',
    verified: true,
  });
  expect(runtime.availability(device.id)).toMatchObject({ owner: 'none', available: true });
  expect(workers).toHaveLength(1);
  expect(workers[0]!.closed).toBe(false);
});

test('unsupported tail, unknown parameter and overseas client block the entire table before native effects', async () => {
  const { runtime, workers, save, start, device } = await fixture();
  for (const tasks of [
    [{ type: 'CloseDown' }, { type: 'Roguelike' }],
    [{ type: 'CloseDown', params: { future_option: { keep: true } } }],
    [{ type: 'CloseDown', params: { client_type: 'YoStarJP' } }],
  ]) {
    await save(tasks);
    const before = structuredClone(workers[0]!.calls);
    const result = await runtime.handle('execution.preflight', {
      planId: 'execution',
      deviceId: device.id,
    });
    expect(result.supported).toBe(false);
    expect(result.issues[0].taskIndex).toBe(tasks.length - 1);
    await expect(start(crypto.randomUUID())).rejects.toMatchObject({ code: -32010 });
    expect(workers[0]!.calls).toEqual(before);
    expect(runtime['executions']()).toHaveLength(0);
    expect(runtime.snapshot().plans[0].tasks[0].params).toEqual(
      'params' in tasks[0] ? tasks[0].params : {},
    );
  }
});

test('start checks the current complete snapshot again after a successful preflight', async () => {
  const { runtime, workers, save, start, device } = await fixture();
  expect(
    (await runtime.handle('execution.preflight', { planId: 'execution', deviceId: device.id }))
      .supported,
  ).toBe(true);
  await save([
    { type: 'CloseDown' },
    { type: 'Custom', params: { task_names: ['MiniGame@PixelPaint@Begin'] } },
  ]);
  await expect(start()).rejects.toMatchObject({ code: -32010 });
  expect(workers[0]!.submitted).toHaveLength(0);
});

test('persisted requests return the original result after edits, disconnection, resource deletion and restart', async () => {
  const first = await fixture();
  const run = await first.start('durable');
  await until(() => first.runtime['execution'](run.id).status !== 'running');
  await first.save([{ type: 'Roguelike' }]);
  await first.runtime.disconnectDevice(first.device.id);
  first.runtime.store.delete('active', 'combo');
  expect((await first.start('durable')).id).toBe(run.id);
  await first.runtime.close();
  const reopened = new Runtime(first.root, frameworkFixtureOptions());
  runtimes.push(reopened);
  expect(
    (
      await reopened.startRun({
        planId: 'execution',
        deviceId: first.device.id,
        requestId: 'durable',
      })
    ).id,
  ).toBe(run.id);
  expect(reopened['execution'](run.id).tasks[0].type).toBe('CloseDown');
});

test('unknown controller acknowledgement stops the workflow, keeps evidence and never replays a duplicate request', async () => {
  const { runtime, workers, save, start } = await fixture();
  await save([{ type: 'CloseDown' }, { type: 'CloseDown' }]);
  workers[0]!.result = async (operation) => {
    if (operation === 'stop_app')
      throw new Error('controller disconnected after submission; result unknown');
    return { accepted: true, nativeSuccess: true };
  };
  const run = await start();
  await until(() => runtime['execution'](run.id).status !== 'running');
  expect(runtime['execution'](run.id)).toMatchObject({
    status: 'failed',
    tasks: [{ status: 'failed' }, { status: 'waiting' }],
  });
  const calls = workers[0]!.calls.filter((call) => call.operation === 'stop_app');
  expect(calls).toHaveLength(1);
  expect(runtime.store.all('execution_evidence').length).toBeGreaterThan(0);
  expect((await start()).id).toBe(run.id);
  expect(workers[0]!.calls.filter((call) => call.operation === 'stop_app')).toHaveLength(1);
});

test('cancellation holds the whole table exclusively and cannot stop a different device', async () => {
  const { runtime, workers, start, device } = await fixture();
  const other = await runtime.connectDevice({ address: '127.0.0.1:5557' });
  workers[0]!.holdTasks = true;
  workers[1]!.holdTasks = true;
  const first = await start('first'),
    second = await start('second', other.id);
  await until(() => workers.every((worker) => worker.submitted.length > 0));
  expect(runtime.availability(device.id).owner).toBe('run');
  await expect(
    runtime.handle('control.session.start', { deviceId: device.id, requestId: 'steal' }),
  ).rejects.toMatchObject({ code: -32011 });
  await runtime.stopRun(first.id);
  expect(runtime['execution'](first.id).status).toBe('stopped');
  expect(runtime['execution'](second.id).status).toBe('running');
  expect(workers[1]!.calls.some((call) => call.operation === 'stop')).toBe(false);
  await runtime.stopRun(second.id);
});

test('durable consumable reservations survive unknown outcomes and are isolated by run and task', async () => {
  const { runtime } = await fixture();
  const reserve = (
    run: string,
    index: number,
    kind: string,
    amount: number,
    limit: number,
    id: string,
  ) =>
    runtime['reserveConsumption'](
      run,
      index,
      { medicine: 2, stone: 1, credit_budget: 100, times: 1 },
      kind,
      amount,
      limit,
      id,
    );
  reserve('r', 0, 'medicine', 1, 2, 'commit-1');
  expect(() => reserve('r', 0, 'medicine', 1, 2, 'commit-1')).toThrow('重放');
  reserve('r', 0, 'medicine', 1, 2, 'commit-2');
  expect(() => reserve('r', 0, 'medicine', 1, 2, 'commit-3')).toThrow('上限');
  reserve('r', 0, 'credit', 100, 100, 'purchase');
  expect(() => reserve('r', 0, 'credit', 1, 100, 'next')).toThrow('上限');
  expect(() => reserve('r', 0, 'stone', 1, 2, 'inflated')).toThrow('无效');
  reserve('r', 1, 'medicine', 1, 2, 'commit-1');
  reserve('other', 0, 'medicine', 1, 2, 'commit-1');
  expect(runtime.store.get('consumption', 'r:0:medicine').reserved).toBe(2);
  await runtime.close();
  const reopened = new Runtime(runtime.root, frameworkFixtureOptions());
  runtimes.push(reopened);
  expect(reopened.store.get('consumption', 'r:0:credit').reserved).toBe(100);
  expect(() =>
    reopened['reserveConsumption'](
      'r',
      0,
      { credit_budget: 100 },
      'credit',
      1,
      100,
      'after-restart',
    ),
  ).toThrow('上限');
});

test('Framework history retains confirmed partial drops and final reread rosters, never requested names', async () => {
  const { recordFrameworkResult, boundedExecutionEvidence } =
    await import('@backend/modules/execution/execution-evidence');
  const task: any = {
    index: 0,
    type: 'Fight',
    status: 'running',
    message: '',
    startedAt: null,
    finishedAt: null,
    drops: [],
    infrastructure: [],
    artifacts: [],
  };
  recordFrameworkResult(
    task,
    'workflow.fight.legacy_batch',
    {
      status: 'unknown',
      verified: false,
      data: { completedRuns: 3, drops: { '30013': 4 }, recent: [] },
    },
    'now',
    '1-7',
  );
  recordFrameworkResult(
    task,
    'workflow.fight.legacy_batch',
    { status: 'completed', verified: true, data: { drops: { '30013': 4 } } },
    'later',
    '1-7',
  );
  expect(task.drops).toEqual([
    {
      itemId: '30013',
      name: '30013',
      quantity: 4,
      stage: '1-7',
      at: 'now',
      scope: 'visible_rewards',
    },
  ]);
  const target = { facility: 'Mfg', room: 1, operators: ['配置名单'] };
  recordFrameworkResult(
    task,
    'workflow.infrast.custom_shift',
    {
      status: 'completed',
      verified: true,
      data: {
        rooms: [{ target, result: { status: 'completed', verified: true, data: {} } }],
        finalChecks: [
          {
            target,
            result: { status: 'completed', verified: true, data: { operators: ['实际名单'] } },
          },
        ],
      },
    },
    'now',
  );
  expect(task.infrastructure[0]).toMatchObject({
    operators: ['实际名单'],
    staffingStatus: 'confirmed',
  });
  recordFrameworkResult(
    task,
    'workflow.infrast.custom_shift',
    {
      status: 'unknown',
      verified: false,
      data: { rooms: [{ target, result: { status: 'unknown', verified: false, data: {} } }] },
    },
    'later',
  );
  expect(task.infrastructure[0]).toMatchObject({ operators: [], staffingStatus: 'unavailable' });
  const bounded = boundedExecutionEvidence({
    status: 'unknown',
    verified: false,
    data: {
      frame: { data: 'x'.repeat(3 * 1024 * 1024) },
      observations: Array.from({ length: 2000 }, () => ({ text: '证据'.repeat(4000) })),
    },
  });
  expect(Buffer.byteLength(JSON.stringify(bounded))).toBeLessThan(512 * 1024);
  expect(bounded.truncated).toBe(true);
  expect(bounded.resultSha256).toMatch(/^[0-9a-f]{64}$/);
});

test('resource and Framework switching cannot replace generations while a complete start preflight is pending', async () => {
  const { runtime, start, workers } = await fixture();
  const original = runtime.executionPreflight.bind(runtime);
  let release!: () => void, entered!: () => void;
  const pending = new Promise<void>((resolve) => {
      release = resolve;
    }),
    ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
  runtime.executionPreflight = async (...args) => {
    entered();
    await pending;
    return original(...args);
  };
  const starting = start('generation-protection');
  await ready;
  try {
    expect(runtime.busy()).toBe(true);
    const previous = runtime.store.get('active', 'combo');
    await expect(runtime.beforeSwitch()).rejects.toThrow('仍在运行');
    expect(runtime.store.get('active', 'combo')).toEqual(previous);
    expect(runtime['switching']).toBe(false);
    expect(workers[0]!.closed).toBe(false);
    expect(workers[0]!.submitted).toHaveLength(0);
  } finally {
    release();
  }
  const run = await starting;
  await until(() => runtime['execution'](run.id).status !== 'running');
  expect(runtime['execution'](run.id).status).toBe('completed');
});
