import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/runtime';
import { CoreWorker } from '../src/worker';
import { mockPreviewImage } from '../../../tests/fixtures/preview-image';
import { localizeExecutionMessage } from '../../../packages/contracts/src/execution';

const runtimes: Runtime[] = [], roots: string[] = [];
class EvidenceWorker {
  events: any[] = []; connected = true; safeIdle = true; frameCalls = 0; submitted: any[] = [];
  frameResult = async () => ({ ...mockPreviewImage, canControl: false });
  async frame() { this.frameCalls++; return this.frameResult(); }
  async connect() { return {}; }
  async waitConnected() { return true; }
  async close() {}
  async stop() { return {}; }
  async task(task: any) { this.safeIdle = false; this.submitted.push(task); return { taskId: this.submitted.length }; }
  result(taskid: number, what: string, details: any, taskchain = 'Fight') { this.events.push({ type: 'callback', message: 20003, details: { taskid, taskchain, what, details } }); }
  finish(taskid: number) { this.safeIdle = true; this.events.push({ type: 'callback', message: 10002, details: { taskid } }, { type: 'callback', message: 3, details: { finished_tasks: [taskid] } }, { type: 'status', running: false, pendingAsync: [] }); }
}
async function setup(types = ['Fight', 'Fight']) {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-results-')); roots.push(root);
  const worker = new EvidenceWorker(), runtime = new Runtime(root, { workerFactory: async () => worker, adbExecutable: () => 'synthetic-adb', calendar: { fetcher: null } }); runtimes.push(runtime);
  runtime.store.put('active', 'combo', { core: { path: 'synthetic-core', version: 'v1' }, resource: { path: 'synthetic-resource', version: 'r1' } });
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  device.state = 'idle'; runtime.store.put('device', device.id, device);
  await runtime.handle('plan.save', { plan: { id: 'results', name: '结果任务表', tasks: types.map(type => ({ type })) } });
  const run = await runtime.startRun({ planId: 'results', deviceId: device.id, requestId: 'results' });
  return { runtime, worker, run };
}
const drops = (quantity = 1) => ({ stage: { stageCode: '1-7' }, drops: [{ itemId: '30012', itemName: '固源岩', quantity: 1 }], stats: [{ itemId: '30012', itemName: '固源岩', quantity }] });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test('repeated task types retain independent states, snapshots and cumulative drop totals', async () => {
  const { runtime, worker, run } = await setup();
  expect(run.planName).toBe('结果任务表');
  expect(run.tasks.map((task: any) => task.status)).toEqual(['running', 'waiting']);
  expect(run.message).toContain('自动作战'); expect(run.message).not.toContain('Fight');
  worker.result(99, 'StageDrops', drops(99)); worker.result(1, 'StageDrops', drops(2)); worker.result(1, 'StageDrops', drops(2));
  await runtime.tick(true); await flush();
  let current = runtime.store.get('run', run.id);
  expect(current.tasks[0].drops).toEqual([{ itemId: '30012', name: '固源岩', quantity: 2, stage: '1-7', at: expect.any(String) }]);
  expect(current.tasks[1].drops).toEqual([]);
  worker.finish(1); await runtime.tick(true);
  current = runtime.store.get('run', run.id); expect(current.tasks.map((task: any) => task.status)).toEqual(['completed', 'running']);
  worker.result(1, 'StageDrops', drops(100)); worker.result(2, 'StageDrops', drops(1)); await runtime.tick(true); await flush();
  worker.finish(2); await runtime.tick(true);
  current = await runtime.handle('run.detail', { id: run.id }); expect(current.status).toBe('completed'); expect(current.tasks?.map((task: any) => task.status)).toEqual(['completed', 'completed']);
  expect(runtime.snapshot().runs[0]?.tasks).toBeUndefined();
  expect(runtime.snapshot().events.every(event => !(event.data.run as any)?.tasks)).toBe(true);
  expect(current.tasks?.map((task: any) => task.drops[0]?.quantity)).toEqual([2, 1]);
  await runtime.handle('plan.save', { plan: { id: 'results', name: '另一个名称', tasks: [{ type: 'Award' }] } });
  await runtime.close();
  const reopened = new Runtime(runtime.root, { calendar: { fetcher: null } }); runtimes.push(reopened);
  expect(reopened.snapshot().runs[0]?.planName).toBe('结果任务表'); expect((await reopened.handle('run.detail', { id: run.id })).tasks).toEqual(current.tasks);
});

test('queue completion does not mark a task successful and later tasks stay waiting after failure or stop', async () => {
  const { runtime, worker, run } = await setup();
  worker.events.push({ type: 'callback', message: 3, details: { finished_tasks: [1] } }, { type: 'status', running: false, pendingAsync: [] }); worker.safeIdle = true;
  await runtime.tick(true);
  expect((await runtime.handle('run.detail', { id: run.id })).tasks.map((task: any) => task.status)).toEqual(['failed', 'waiting']);
  const next = await runtime.startRun({ planId: run.planId, deviceId: run.deviceId, requestId: 'stop' });
  await runtime.stopRun(next.id); worker.safeIdle = true; worker.events.push({ type: 'status', running: false, pendingAsync: [] }); await runtime.tick(true);
  expect(runtime.store.get('run', next.id).tasks.map((task: any) => task.status)).toEqual(['stopped', 'waiting']);
});

test('real callback shapes persist base feedback and PNG is retrieved separately with run ownership', async () => {
  const { runtime, worker, run } = await setup(['Infrast']);
  worker.result(1, 'CustomInfrastRoomOperators', { facility: 'Mfg', index: 0, names: ['阿米娅', '白面鸮'] }, 'Infrast');
  worker.result(1, 'ProductOfFacility', { facility: 'Mfg', index: 0, product: 'Gold' }, 'Infrast');
  worker.result(1, 'InfrastConfirmButton', { facility: 'Mfg', index: 0 }, 'Infrast');
  await runtime.tick(true); await flush();
  const task = (await runtime.handle('run.detail', { id: run.id })).tasks[0];
  expect(task?.infrastructure).toEqual([{ facility: '制造站', room: 1, operators: ['阿米娅', '白面鸮'], staffingStatus: 'confirmed', product: '赤金', message: '核心已确认换班', at: expect.any(String) }]);
  const artifact = task?.artifacts[0]!;
  expect(artifact.label).toBe('基建反馈画面'); expect(worker.frameCalls).toBe(1);
  expect(existsSync(path.join(runtime.root, 'run-artifacts', run.id, artifact.id + '.png'))).toBe(true);
  expect((await runtime.handle('run.artifact', { runId: run.id, artifactId: artifact.id })).data).toBe(mockPreviewImage.data);
  const data = JSON.stringify({ objects: runtime.store.db.query('SELECT * FROM objects').all(), events: runtime.store.events() });
  expect(data).not.toContain(mockPreviewImage.data); expect(data).not.toContain('data:image');
  await expect(runtime.handle('run.artifact', { runId: 'other', artifactId: artifact.id })).rejects.toThrow('执行截图不存在');
  await expect(runtime.handle('run.artifact', { runId: run.id, artifactId: '../../outside' })).rejects.toThrow('参数无效');
  worker.finish(1); await runtime.tick(true); await runtime.close();
  expect(readFileSync(path.join(runtime.root, 'run-artifacts', run.id, artifact.id + '.png')).toString('base64')).toBe(mockPreviewImage.data);
});

test('result images are bounded per task and per run without discarding cumulative materials', async () => {
  const { runtime, worker, run } = await setup(['Fight', 'Fight', 'Fight', 'Fight', 'Fight']);
  for (let task = 1; task <= 5; task++) {
    for (let amount = 1; amount <= 5; amount++) { worker.result(task, 'StageDrops', drops(amount)); await runtime.tick(true); await flush(); }
    worker.finish(task); await runtime.tick(true);
  }
  const current = runtime.store.get('run', run.id);
  expect(current.tasks.map((task: any) => task.artifacts.length)).toEqual([3, 3, 3, 3, 0]);
  expect(current.tasks.map((task: any) => task.drops[0].quantity)).toEqual([5, 5, 5, 5, 5]); expect(worker.frameCalls).toBe(12);
});

test('base rooms kept unchanged or with unavailable groups do not retain a proposed operator list', async () => {
  const { runtime, worker, run } = await setup(['Infrast']);
  for (const what of ['CustomInfrastRoomKeptUnchanged', 'CustomInfrastRoomGroupsMatchFailed', 'CustomInfrastRoomsNotConfigured']) {
    worker.result(1, 'CustomInfrastRoomOperators', { facility: 'Mfg', index: 0, names: ['阿米娅'] }, 'Infrast');
    worker.result(1, what, { facility: 'Mfg', index: 0 }, 'Infrast'); await runtime.tick(true);
    expect((await runtime.handle('run.detail', { id: run.id })).tasks[0].infrastructure[0].operators).toEqual([]);
    expect((await runtime.handle('run.detail', { id: run.id })).tasks[0].infrastructure[0].staffingStatus).toBe('unavailable');
  }
});

test('duplicate base feedback preserves screenshot capacity for a later confirmation', async () => {
  const { runtime, worker, run } = await setup(['Infrast']);
  for (let index = 0; index < 6; index++) {
    worker.result(1, 'ProductOfFacility', { facility: 'Mfg', index: 0, product: 'Gold' }, 'Infrast'); await runtime.tick(true); await flush();
  }
  expect(worker.frameCalls).toBe(1);
  worker.result(1, 'InfrastConfirmButton', { facility: 'Mfg', index: 0 }, 'Infrast'); await runtime.tick(true); await flush();
  const task = (await runtime.handle('run.detail', { id: run.id })).tasks[0];
  expect(worker.frameCalls).toBe(2); expect(task.artifacts).toHaveLength(2);
  expect(task.infrastructure[0].message).toBe('核心已确认换班');
});

test('room staffing confirmation survives later product feedback and retries return to planned', async () => {
  const { runtime, worker, run } = await setup(['Infrast']);
  const room = { facility: 'Mfg', index: 0 };
  worker.result(1, 'CustomInfrastRoomOperators', { ...room, names: ['白面鸮'] }, 'Infrast'); await runtime.tick(true);
  expect((await runtime.handle('run.detail', { id: run.id })).tasks[0].infrastructure[0].staffingStatus).toBe('planned');
  worker.result(1, 'InfrastConfirmButton', room, 'Infrast');
  worker.result(1, 'ProductOfFacility', { ...room, product: 'Gold' }, 'Infrast'); await runtime.tick(true);
  expect((await runtime.handle('run.detail', { id: run.id })).tasks[0].infrastructure[0]).toMatchObject({ staffingStatus: 'confirmed', operators: ['白面鸮'], product: '赤金' });
  worker.result(1, 'CustomInfrastRoomOperators', { ...room, names: ['银灰'] }, 'Infrast'); await runtime.tick(true);
  expect((await runtime.handle('run.detail', { id: run.id })).tasks[0].infrastructure[0]).toMatchObject({ staffingStatus: 'planned', operators: ['银灰'] });
});

test('large result metadata remains below one MiB, warns once, and still records final task states', async () => {
  const { runtime, worker, run } = await setup(['Infrast', 'Infrast']);
  const current = runtime.store.get('run', run.id), names = Array.from({ length: 20 }, () => '甲'.repeat(80));
  for (const [taskIndex, rooms] of [[0, 70], [1, 100]]) current.tasks[taskIndex!].infrastructure = Array.from({ length: rooms! }, (_, index) => ({ facility: '制造站', room: index + 1, operators: names, product: '', message: '方案', at: new Date().toISOString() }));
  runtime.store.put('run', run.id, current);
  for (let index = 70; index < 100; index++) {
    worker.result(1, 'CustomInfrastRoomOperators', { facility: 'Mfg', index, names }, 'Infrast'); await runtime.tick(true);
  }
  expect(runtime.store.events().filter(event => event.type === 'run.results_limited')).toHaveLength(1);
  expect(Buffer.byteLength(JSON.stringify((await runtime.handle('run.detail', { id: run.id })).tasks))).toBeLessThan(1024 * 1024);
  expect(runtime.snapshot().runs[0]?.tasks).toBeUndefined();
  worker.finish(1); await runtime.tick(true); await runtime.stopRun(run.id); worker.safeIdle = true; worker.events.push({ type: 'status', running: false, pendingAsync: [] }); await runtime.tick(true);
  expect((await runtime.handle('run.detail', { id: run.id })).tasks.map((task: any) => task.status)).toEqual(['completed', 'stopped']);
});

test('late frame responses cannot attach to the next task and malformed images never persist', async () => {
  const { runtime, worker, run } = await setup();
  let resolve!: (frame: any) => void;
  worker.frameResult = () => new Promise(yes => { resolve = yes; });
  worker.result(1, 'StageDrops', drops()); await runtime.tick(true);
  worker.finish(1); await runtime.tick(true); resolve({ ...mockPreviewImage, canControl: false }); await flush();
  expect(runtime.store.get('run', run.id).tasks.map((task: any) => task.artifacts.length)).toEqual([0, 0]);
  worker.frameResult = async () => ({ ...mockPreviewImage, data: 'not-png', canControl: false });
  worker.result(2, 'StageDrops', drops()); await runtime.tick(true); await flush();
  expect(runtime.store.get('run', run.id).tasks[1].artifacts).toEqual([]);
  expect(runtime.store.events().some(event => event.type === 'run.artifact_unavailable')).toBe(true);
});

test('callback, completion and idle in one batch preserve the image before the next task starts', async () => {
  const { runtime, worker, run } = await setup();
  worker.frameResult = async () => { await new Promise(resolve => setTimeout(resolve, 20)); return { ...mockPreviewImage, canControl: false }; };
  worker.result(1, 'StageDrops', drops()); worker.finish(1);
  await runtime.tick(true);
  const current = runtime.store.get('run', run.id);
  expect(current.tasks.map((task: any) => task.status)).toEqual(['completed', 'running']);
  expect(current.tasks[0].artifacts).toHaveLength(1); expect(current.tasks[1].artifacts).toHaveLength(0);
  const eventCount = runtime.store.events().length;
  worker.events.push({ type: 'callback', message: 20001, details: { taskid: 2, subtask: 'ProcessTask', details: { task: 'UnmappedInternalFlow' } } }); await runtime.tick(true);
  expect(runtime.store.get('run', run.id).message).toBe(current.message);
  expect(runtime.store.events()).toHaveLength(eventCount);
});

test('internal Fight steps do not announce task completion or flood progress with generic callbacks', async () => {
  const { runtime, worker, run } = await setup(['Fight']);
  const callback = (message: number, details: any) => worker.events.push({ type: 'callback', message, details: { taskid: 1, taskchain: 'Fight', ...details } });
  callback(10001, {}); await runtime.tick(true);
  const genericEvents = runtime.store.events().length;
  for (let repeat = 0; repeat < 3; repeat++) for (const details of [
    ...['UnmappedInternalFlow', 'ProcessTask', 'Start', 'Fight', '未登记内部动作', '123'].map(task => ({ subtask: 'ProcessTask', details: { task } })),
    { subtask: 'ProcessTask' }, {},
  ]) { callback(20001, details); callback(20002, details); }
  await runtime.tick(true);
  let current = await runtime.handle('run.detail', { id: run.id });
  expect(current.message).toBe('自动作战执行中');
  expect(current.status).toBe('running'); expect(current.tasks[0].status).toBe('running');
  expect(runtime.store.events()).toHaveLength(genericEvents);

  callback(20001, { subtask: 'ProcessTask', details: { task: 'Fight@StartButton2' } }); await runtime.tick(true);
  expect(runtime.store.get('run', run.id).message).toBe('自动作战 · 开始作战');
  expect(runtime.store.events().at(-1).data.action).toBe('Fight@StartButton2');
  const namedEvents = runtime.store.events().length;
  callback(20001, { subtask: 'ProcessTask', details: { task: 'Fight@StartButton2' } });
  callback(20002, { subtask: 'ProcessTask', details: { task: 'Fight@StartButton2' } });
  callback(20001, { taskid: 99, subtask: 'ProcessTask', details: { task: 'EndOfAction' } });
  await runtime.tick(true);
  current = await runtime.handle('run.detail', { id: run.id });
  expect(current.message).toBe('自动作战 · 开始作战');
  expect(current.status).toBe('running'); expect(current.tasks[0].status).toBe('running');
  expect(current.progress).toBe(0); expect(runtime.store.events()).toHaveLength(namedEvents);

  callback(20001, { subtask: 'ProcessTask', details: { task: 'EndOfAction' } }); await runtime.tick(true);
  expect(runtime.store.get('run', run.id).message).toBe('自动作战 · 作战结算');
});

test('chain completion keeps its idle-wait message through late internal progress until success is confirmed', async () => {
  const { runtime, worker, run } = await setup(['Fight']);
  worker.events.push({ type: 'callback', message: 10002, details: { taskid: 1, taskchain: 'Fight' } }); await runtime.tick(true);
  const waiting = await runtime.handle('run.detail', { id: run.id }), eventCount = runtime.store.events().length;
  expect(waiting.message).toBe('自动作战流程结束，正在确认核心空闲');
  expect(waiting.status).toBe('running'); expect(waiting.tasks[0].status).toBe('running');
  for (const message of [10001, 20001, 20002, 10002]) worker.events.push({ type: 'callback', message, details: { taskid: 1, taskchain: 'Fight', subtask: 'ProcessTask', details: { task: 'Fight@StartButton2' } } });
  worker.events.push({ type: 'status', running: false, pendingAsync: [] }); await runtime.tick(true);
  expect(runtime.store.get('run', run.id).message).toBe(waiting.message);
  expect(runtime.store.events()).toHaveLength(eventCount);
  worker.events.push({ type: 'callback', message: 3, details: { finished_tasks: [1] } }, { type: 'status', running: false, pendingAsync: [5] }); await runtime.tick(true);
  expect(runtime.store.get('run', run.id).status).toBe('running');
  worker.safeIdle = true; worker.events.push({ type: 'status', running: false, pendingAsync: [] }); await runtime.tick(true);
  const completed = await runtime.handle('run.detail', { id: run.id });
  expect(completed.status).toBe('completed'); expect(completed.tasks[0].status).toBe('completed');
});

test('an internal completion followed by an idle queue is insufficient evidence of Fight success', async () => {
  const { runtime, worker, run } = await setup(['Fight']);
  worker.events.push({ type: 'callback', message: 20002, details: { taskid: 1, taskchain: 'Fight', subtask: 'ProcessTask', details: { task: 'EndOfAction' } } },
    { type: 'callback', message: 3, details: { finished_tasks: [1] } }, { type: 'status', running: false, pendingAsync: [] });
  worker.safeIdle = true; await runtime.tick(true);
  const current = await runtime.handle('run.detail', { id: run.id });
  expect(current.status).toBe('failed'); expect(current.tasks[0].status).toBe('failed');
  expect(runtime.store.events().some(event => event.type === 'run.task_progress' && event.message.includes('已完成'))).toBe(false);
});

test('a timed-out final image cannot attach after another run reuses the same worker and native ID', async () => {
  const { runtime, worker, run } = await setup(['Fight']);
  let resolve!: (frame: any) => void;
  worker.frameResult = () => new Promise(yes => { resolve = yes; });
  worker.result(1, 'StageDrops', drops()); worker.finish(1); const started = Date.now(); await runtime.tick(true);
  expect(Date.now() - started).toBeLessThan(1800); expect(runtime.store.get('run', run.id).status).toBe('completed');
  worker.submitted = [];
  const next = await runtime.startRun({ planId: run.planId, deviceId: run.deviceId, requestId: 'same-native-id' });
  resolve({ ...mockPreviewImage, canControl: false }); await flush();
  expect(runtime.store.get('run', run.id).tasks[0].artifacts).toHaveLength(0);
  expect(runtime.store.get('run', next.id).tasks[0].artifacts).toHaveLength(0);
});

test('execution protocol labels translate task chains and ProcessTask actions', () => {
  expect(localizeExecutionMessage('Start / Fight / StartUp / ProcessTask Fight@StartButton2')).toBe('开始 / 自动作战 / 启动游戏 / 流程任务 自动作战 · 开始作战');
});

const nativeWorker = process.env.MAAVERGE_TEST_NATIVE_WORKER, coreLibrary = process.env.MAAVERGE_TEST_CORE_LIBRARY;
test.skipIf(!nativeWorker || !coreLibrary || !existsSync(nativeWorker) || !existsSync(coreLibrary))('native result callbacks and PNG pass through the C++ NDJSON worker into persisted run evidence', async () => {
  for (const type of ['Fight', 'Infrast']) {
    const root = mkdtempSync(path.join(tmpdir(), 'maaverge-native-results-')); roots.push(root);
    const resource = path.join(root, 'resources'); mkdirSync(path.join(resource, 'resource'), { recursive: true }); writeFileSync(path.join(resource, 'resource/version.json'), '{}');
    const previous = process.env.MAAVERGE_SYNTHETIC_CASE;
    const runtime = new Runtime(root, { adbExecutable: () => 'synthetic-adb', calendar: { fetcher: null }, workerFactory: async config => {
      process.env.MAAVERGE_SYNTHETIC_CASE = 'execution-results';
      try { return await CoreWorker.start({ ...config, core: path.dirname(coreLibrary!), resource, adb: 'synthetic-adb', address: 'synthetic://no-device', lockPath: path.join(root, 'synthetic-device.lock') }, { command: [nativeWorker!, '--worker'] }); }
      finally { if (previous === undefined) delete process.env.MAAVERGE_SYNTHETIC_CASE; else process.env.MAAVERGE_SYNTHETIC_CASE = previous; }
    } }); runtimes.push(runtime);
    runtime.store.put('active', 'combo', { core: { path: path.dirname(coreLibrary!), version: 'vsynthetic' }, resource: { path: resource, version: 'synthetic' } });
    const device = await runtime.connectDevice({ address: '127.0.0.1:5555' }), worker = runtime.workers.get(device.id)!;
    expect(await worker.waitConnected(2000)).toBe(true); await runtime.tick(true);
    await runtime.handle('plan.save', { plan: { id: 'native-result', name: '合成原生回调', tasks: [{ type }] } });
    const run = await runtime.startRun({ planId: 'native-result', deviceId: device.id, requestId: type });
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && runtime.store.get('run', run.id).status === 'running') { await runtime.tick(true); await new Promise(resolve => setTimeout(resolve, 10)); }
    const task = (await runtime.handle('run.detail', { id: run.id })).tasks[0];
    expect(task?.status).toBe('completed');
    if (type === 'Fight') expect(task?.drops[0]).toMatchObject({ itemId: '30012', name: 'synthetic-rock', quantity: 2, stage: '1-7' });
    else expect(task?.infrastructure[0]).toMatchObject({ facility: '制造站', room: 1, product: '赤金' });
    expect(task?.artifacts).toHaveLength(1);
    const artifact = await runtime.handle('run.artifact', { runId: run.id, artifactId: task!.artifacts[0]!.id });
    expect(Buffer.from(artifact.data, 'base64').subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    await runtime.close();
  }
});
