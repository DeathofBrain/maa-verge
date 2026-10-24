import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/runtime';
import type { CopilotKind } from '../../../packages/contracts/src/rpc-types';
import { mockPreviewImage } from '../../../tests/fixtures/preview-image';

const roots: string[] = [], runtimes: Runtime[] = [];
class Worker {
  connected = true; safeIdle = true; events: any[] = []; tasks: any[] = []; stops = 0;
  async connect() { return { asyncId: 1 }; }
  async waitConnected() { return true; }
  async task(task: any) { this.tasks.push(structuredClone(task)); this.safeIdle = false; return { taskId: this.tasks.length }; }
  async stop() { this.stops++; return { stopping: true }; }
  async close() { this.connected = false; this.safeIdle = true; }
  async frame() { return { ...mockPreviewImage, canControl: true }; }
  async click(_x: number, _y: number): Promise<{ accepted: true }> { return { accepted: true }; }
  callback(message: number, details: any = {}) { this.events.push({ type: 'callback', message, details: { taskid: this.tasks.length, ...details } }); }
  load(index: number) {
    const params = this.tasks.at(-1).params, list = params.copilot_list ?? params.list;
    this.callback(20003, { what: 'CopilotListLoadTaskFileSuccess', details: { id: list[index].id, file_name: list[index].filename, stage_name: 'main_01-07' } });
  }
  battle(task: string) { if (task.includes('StageDrops-Stars')) this.callback(20001, { subtask: 'BattleProcessTask' }); this.callback(20002, { taskchain: 'Copilot', subtask: 'ProcessTask', details: { task } }); }
  complete(pending: number[] = []) { this.callback(10002); this.callback(3); this.idle(pending); }
  idle(pending: number[] = []) { this.safeIdle = !pending.length; this.events.push({ type: 'status', running: false, pendingAsync: pending }); }
}
function open(root: string, worker = new Worker()) {
  const r = new Runtime(root, { workerFactory: async config => config.address === '127.0.0.1:5555' ? worker : new Worker(), validator: async () => {}, adbExecutable: () => 'synthetic-adb', calendar: { fetcher: null } }); runtimes.push(r); return r;
}
async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-copilot-runtime-')); roots.push(root);
  const resource = path.join(root, 'generation', 'resource', 'Arknights-Tile-Pos'); mkdirSync(resource, { recursive: true });
  writeFileSync(path.join(resource, 'overview.json'), JSON.stringify({ main: { stageId: 'main_01-07', levelId: 'main_01-07', code: '1-7', name: '合成关卡', filename: 'main.json' }, paradox: { stageId: 'mem_test', levelId: 'mem_test', code: 'mem_test', name: '合成悖论', filename: 'paradox.json' }, sss: { stageId: 'sss_stage', levelId: 'sss_stage', code: 'sss_stage', name: '合成保全', filename: 'sss.json' } }));
  for (const file of ['main.json', 'paradox.json', 'sss.json']) writeFileSync(path.join(resource, file), '{}');
  const worker = new Worker(), r = open(root, worker);
  r.store.put('active', 'combo', { core: { path: 'fixture-core', version: 'v6.20.0' }, resource: { path: path.join(root, 'generation'), version: 'fixture-resource' } });
  const connect = async (port = 5555) => { const device = await r.connectDevice({ address: `127.0.0.1:${port}`, name: '合成设备' }); device.state = 'idle'; r.store.put('device', device.id, device); return device; };
  const device = await connect();
  const imported = async (content: any = { stage_name: 'main_01-07', opers: [], actions: [{ type: 'SpeedUp' }], minimum_required: 'v6.20.0', doc: { title: '合成作业' } }) => {
    const preview = await r.handle('copilot.preview', { content: JSON.stringify(content), name: 'fixture.json' });
    const result = await r.handle('copilot.import', { previewId: preview.id });
    expect(result.errors).toEqual([]); expect(result.items).toHaveLength(1); return result.items[0];
  };
  const queue = async (versions: string[], kind: CopilotKind = 'Copilot', patch: any = {}) => {
    const workspace = await r.handle('copilot.workspace.get', { kind });
    workspace.queue = versions.map((versionId, index) => ({ id: `entry-${index + 1}`, versionId, enabled: true, isRaid: false, navName: '' }));
    Object.assign(workspace.options, patch); return r.handle('copilot.workspace.save', { workspace });
  };
  const start = (requestId: string = crypto.randomUUID(), kind: CopilotKind = 'Copilot', deviceId = device.id) => r.handle('copilot.start', { kind, requestId, deviceId });
  const detail = (id: string) => r.handle('run.detail', { id });
  return { r, root, worker, device, connect, imported, queue, start, detail };
}
afterEach(async () => { for (const r of runtimes.splice(0)) await r.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); }, 30_000);

test('independent single run creates no task table and keeps missing victory evidence unknown', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported(); await queue([item.versionId], 'Copilot', { formation: true, formationIndex: 2, addTrust: true, supportUnitName: '合成干员', additionalOperators: [{ name: '合成干员', skill: 1 }] });
  const run = await start();
  expect(r.store.all('plan')).toHaveLength(0); expect(r.store.all('run_plan')).toHaveLength(0);
  expect(r.store.get('run_snapshot', run.id).source).toBe('copilot');
  expect(run).toMatchObject({ source: 'copilot', planId: null, copilotKind: 'Copilot' });
  expect(worker.tasks).toHaveLength(1); expect(worker.tasks[0]).toMatchObject({ type: 'Copilot', params: { formation: true, formation_index: 2, add_trust: true, use_sanity_potion: false, support_unit_name: '合成干员', support_unit_usage: 2, user_additional: [{ name: '合成干员', skill: 1 }] } });
  expect(worker.tasks[0].params.filename).toBeString(); expect(worker.tasks[0].params.copilot_list).toBeUndefined();
  worker.complete([19]); await r.tick(true); expect((await detail(run.id)).status).toBe('running');
  worker.idle(); await r.tick(true);
  const finished = await detail(run.id); expect(finished.status).toBe('completed'); expect(finished.copilotEntries[0]).toMatchObject({ status: 'completed', verdict: 'unknown' }); expect(finished.message).toContain('未确认');
  expect(r.snapshot().runs[0].copilotEntries).toBeUndefined();
  expect(r.snapshot().events.every(event => !(event.data.run as any)?.copilotEntries)).toBe(true);
});

test('native multi-file navigation preserves duplicate occurrences and rejects stale IDs and files', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported(); const workspace = await queue([item.versionId, item.versionId]);
  workspace.queue[1].isRaid = true; workspace.queue[1].navName = '1-7'; await r.handle('copilot.workspace.save', { workspace });
  const run = await start(); const task = worker.tasks[0];
  expect(worker.tasks).toHaveLength(1); expect(task.params.filename).toBeUndefined();
  expect(task.params.copilot_list).toHaveLength(2); expect(task.params.copilot_list[0].id).not.toBe(task.params.copilot_list[1].id);
  expect(task.params.copilot_list[1]).toMatchObject({ is_raid: true, nav_name_override: '1-7' });
  worker.load(0); await r.tick(true); expect((await detail(run.id)).copilotEntries[0]).toMatchObject({ status: 'running', verdict: 'unknown' });
  worker.callback(20003, { taskid: 999, what: 'CopilotListLoadTaskFileSuccess', details: { id: task.params.copilot_list[1].id, file_name: task.params.copilot_list[1].filename } });
  worker.callback(20003, { what: 'CopilotListLoadTaskFileSuccess', details: { id: task.params.copilot_list[1].id, file_name: 'different.json' } }); await r.tick(true);
  expect((await detail(run.id)).copilotEntries[1].status).toBe('waiting');
  worker.battle('Copilot@StageDrops-Stars-3'); worker.load(1); await r.tick(true);
  let entries = (await detail(run.id)).copilotEntries;
  expect(entries[0]).toMatchObject({ status: 'completed', verdict: 'success' }); expect(entries[1]).toMatchObject({ status: 'running', verdict: 'unknown' });
  worker.load(0); await r.tick(true); entries = (await detail(run.id)).copilotEntries;
  expect(entries[0].status).toBe('completed'); expect(entries[1].status).toBe('running');
  worker.complete(); await r.tick(true); expect((await detail(run.id)).copilotEntries[1].verdict).toBe('unknown');
});

test('a delayed previous-entry settlement cannot confirm the next entry before its battle starts', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture(); const item = await imported(); await queue([item.versionId, item.versionId]); const run = await start();
  worker.load(0); worker.callback(20001, { subtask: 'BattleProcessTask' }); worker.load(1);
  worker.callback(20002, { taskchain: 'Copilot', subtask: 'ProcessTask', details: { task: 'Copilot@StageDrops-Stars-3' } }); await r.tick(true);
  const entries = (await detail(run.id)).copilotEntries;
  expect(entries[0]).toMatchObject({ status: 'completed', verdict: 'unknown' }); expect(entries[1]).toMatchObject({ status: 'running', verdict: 'unknown' });
  worker.battle('Copilot@StageDrops-Stars-Adverse'); worker.complete(); await r.tick(true);
  expect((await detail(run.id)).copilotEntries[1]).toMatchObject({ status: 'completed', verdict: 'success' });
});

test('individual settlement callbacks cannot prove every iteration of a native loop succeeded', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture(); const item = await imported(); await queue([item.versionId], 'Copilot', { loopTimes: 2 }); const run = await start();
  expect(worker.tasks[0].params.loop_times).toBe(2);
  worker.battle('Copilot@StageDrops-Stars-3'); await r.tick(true);
  expect((await detail(run.id)).copilotEntries[0].verdict).toBe('unknown');
  worker.battle('Copilot@StageDrops-Stars-3'); worker.complete(); await r.tick(true);
  expect((await detail(run.id)).copilotEntries[0]).toMatchObject({ status: 'completed', verdict: 'unknown' });
});

test('workspace edits, reimport and deleting a library record cannot change an active native snapshot', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture(); const item = await imported(); await queue([item.versionId]);
  const run = await start('fixed-snapshot'), snapshot = r.store.get('run_snapshot', run.id), file = worker.tasks[0].params.filename, bytes = readFileSync(file, 'utf8');
  const changed = await imported({ stage_name: 'main_01-07', opers: [], actions: [{ type: 'SpeedUp' }, { type: 'Output', doc: '另一版本' }], doc: { title: '另一作业' } });
  await queue([changed.versionId]); await r.handle('copilot.delete', { id: item.id });
  expect(r.store.get('run_snapshot', run.id)).toEqual(snapshot); expect(readFileSync(file, 'utf8')).toBe(bytes);
  expect((await detail(run.id)).copilotEntries[0].versionId).toBe(item.versionId);
  await expect(start('fixed-snapshot')).rejects.toThrow('同一请求标识');
});

test('persistent request deduplication spans restarts and cannot collide with task-table requests', async () => {
  const { r, root, worker, device, imported, queue, start } = await fixture(); const item = await imported(); await queue([item.versionId]);
  const run = await start('persistent'); expect((await start('persistent')).id).toBe(run.id); expect(worker.tasks).toHaveLength(1);
  await r.handle('plan.save', { plan: { id: 'legacy', name: '旧任务表', tasks: [{ type: 'Award' }] } });
  await expect(r.startRun({ planId: 'legacy', deviceId: device.id, requestId: 'persistent' })).rejects.toThrow('同一请求标识');
  worker.complete(); await r.tick(true); await r.close(); runtimes.splice(runtimes.indexOf(r), 1);
  const nextWorker = new Worker(), next = open(root, nextWorker);
  const existing = await next.handle('copilot.start', { kind: 'Copilot', requestId: 'persistent', deviceId: device.id });
  expect(existing.id).toBe(run.id); expect(nextWorker.tasks).toHaveLength(0);
});

test('task-table, tool, update, manual-click and worker idle gates share copilot occupancy', async () => {
  const { r, worker, device, imported, queue, start } = await fixture(); const item = await imported(); await queue([item.versionId]);
  await r.handle('plan.save', { plan: { id: 'legacy', name: '旧任务表', tasks: [{ type: 'Award' }] } });
  const attempts = await Promise.allSettled([start('competing-copilot'), r.startRun({ planId: 'legacy', deviceId: device.id, requestId: 'competing-plan' }), r.handle('tool.start', { kind: 'depot', deviceId: device.id, requestId: 'competing-tool' })]);
  expect(attempts.filter(value => value.status === 'fulfilled')).toHaveLength(1); expect(worker.tasks).toHaveLength(1);
  const winner = (attempts[0] as PromiseFulfilledResult<any>).value; expect(winner.source).toBe('copilot');
  expect(r.availability(device.id)).toMatchObject({ owner: 'run', ownerId: winner.id, available: false });
  await r.stopRun(winner.id); worker.idle(); await r.tick(true);
  worker.safeIdle = false; await expect(start('unsafe')).rejects.toThrow('核心或异步操作'); worker.safeIdle = true;
  r.appUpdating = true; await expect(r.startCopilot({ kind: 'Copilot', deviceId: device.id, requestId: 'updating' })).rejects.toThrow('更新'); r.appUpdating = false;
  const frame = await r.preview.frame({ deviceId: device.id }); let acknowledge!: () => void;
  worker.click = async () => { await new Promise<void>(resolve => { acknowledge = resolve; }); return { accepted: true }; };
  const click = r.preview.click({ deviceId: device.id, frameId: frame.frameId, requestId: 'manual', x: 10, y: 10 });
  await Promise.resolve(); await expect(start('manual-race')).rejects.toThrow('人工控制'); acknowledge(); await click;
});

test('stop keeps workspace and unexecuted entries; stale callbacks cannot turn it into success', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture(); const item = await imported(), workspace = await queue([item.versionId, item.versionId]); const run = await start();
  worker.load(0); await r.tick(true); await r.stopRun(run.id); worker.battle('Copilot@StageDrops-Stars-3'); worker.complete(); await r.tick(true);
  const ended = await detail(run.id); expect(ended.status).toBe('stopped'); expect(ended.copilotEntries[0].verdict).toBe('unknown'); expect(ended.copilotEntries[1].status).toBe('skipped');
  expect(await r.handle('copilot.workspace.get', { kind: 'Copilot' })).toEqual(workspace); expect(worker.tasks).toHaveLength(1);
});

test('battle failure clears the native queue and never begins or confirms later duplicate entries', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture(); const item = await imported(); await queue([item.versionId, item.versionId]); const run = await start();
  worker.load(0); worker.battle('Copilot@FightMissionFailed'); worker.load(1); await r.tick(true);
  expect(worker.stops).toBe(1); expect((await detail(run.id)).status).toBe('running');
  worker.idle(); await r.tick(true); const failed = await detail(run.id);
  expect(failed.status).toBe('failed'); expect(failed.copilotEntries[0]).toMatchObject({ status: 'failed', verdict: 'failure' }); expect(failed.copilotEntries[1].status).toBe('skipped');
});

test('disconnect and restart interrupt uncertain copilot work without replaying native effects', async () => {
  const { r, root, worker, imported, queue, start, detail } = await fixture(); const item = await imported(); await queue([item.versionId]); const run = await start('disconnect');
  worker.callback(2, { what: 'Disconnect' }); await r.tick(true); expect((await detail(run.id))).toMatchObject({ status: 'failed', copilotEntries: [{ verdict: 'unknown' }] });
  expect((await start('disconnect')).id).toBe(run.id); expect(worker.tasks).toHaveLength(1);
  // Persist an uncertain active run to verify the constructor marks its per-entry state too.
  const stored = r.store.get('run', run.id); stored.status = 'running'; stored.copilotEntries[0].status = 'running'; r.store.put('run', run.id, stored);
  await r.close(); runtimes.splice(runtimes.indexOf(r), 1);
  const next = open(root); expect((await next.handle('run.detail', { id: run.id })).status).toBe('failed');
});


test('SSS uses one native file with loops while paradox keeps its dedicated list and occurrence IDs', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const sss = await imported({ type: 'SSS', stage_name: '合成保全地图', tool_men: {}, stages: [{ stage_name: 'sss_stage', strategies: [] }] });
  await queue([sss.versionId], 'SSSCopilot', { loopTimes: 2 }); const sssRun = await start('sss', 'SSSCopilot');
  expect(worker.tasks[0]).toMatchObject({ type: 'SSSCopilot', params: { loop_times: 2 } }); expect(Object.keys(worker.tasks[0].params).sort()).toEqual(['filename', 'loop_times']);
  worker.complete(); await r.tick(true); expect((await detail(sssRun.id)).copilotEntries[0].verdict).toBe('unknown');
  const paradox = await imported({ stage_name: 'mem_test', opers: [], actions: [], doc: { title: '合成悖论' } });
  await queue([paradox.versionId, paradox.versionId], 'ParadoxCopilot'); const paradoxRun = await start('paradox', 'ParadoxCopilot');
  expect(worker.tasks[1].type).toBe('ParadoxCopilot'); expect(worker.tasks[1].params.filename).toBeUndefined(); expect(worker.tasks[1].params.copilot_list).toBeUndefined(); expect(worker.tasks[1].params.list).toHaveLength(2);
  expect(worker.tasks[1].params.list[0].id).toBe(1); expect(worker.tasks[1].params.list[1].id).toBe(2);
  worker.load(0); await r.tick(true); expect((await detail(paradoxRun.id)).copilotEntries[0].status).toBe('running');
});

test('idle devices can run separately and stopping one never stops another source', async () => {
  const { r, worker, device, connect, imported, queue, start, detail } = await fixture(); const item = await imported(); await queue([item.versionId]);
  const other = await connect(5557), otherWorker = r.workers.get(other.id) as unknown as Worker;
  const first = await start('first-device');
  await r.handle('plan.save', { plan: { id: 'parallel', name: '并行任务表', tasks: [{ type: 'Award' }] } });
  const second = await r.startRun({ planId: 'parallel', deviceId: other.id, requestId: 'other-device' });
  expect(r.snapshot().runs.filter(run => run.status === 'running')).toHaveLength(2); expect(otherWorker.tasks).toHaveLength(1);
  await r.stopRun(first.id); worker.idle(); await r.tick(true);
  expect((await detail(first.id)).status).toBe('stopped'); expect((await detail(second.id)).status).toBe('running'); expect(otherWorker.stops).toBe(0);
  expect(r.availability(device.id).available).toBe(true); expect(r.availability(other.id).available).toBe(false);
});

test('a delayed callback from an older task cannot update the next run on the same device', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture(); const item = await imported(); await queue([item.versionId]);
  const old = await start('old'); worker.complete(); await r.tick(true); const next = await start('next');
  worker.callback(20002, { taskid: 1, taskchain: 'Copilot', subtask: 'ProcessTask', details: { task: 'Copilot@StageDrops-Stars-3' } });
  worker.callback(10002, { taskid: 1 }); worker.callback(3, { taskid: 1 }); worker.idle(); await r.tick(true);
  expect((await detail(old.id)).status).toBe('completed'); expect((await detail(next.id)).status).toBe('running'); expect((await detail(next.id)).copilotEntries[0].verdict).toBe('unknown');
  worker.battle('Copilot@StageDrops-Stars-3'); worker.complete(); await r.tick(true); expect((await detail(next.id)).copilotEntries[0].verdict).toBe('success');
});

test('legacy request records and run_plan snapshots remain readable after the shared execution refactor', async () => {
  const { r, worker, device } = await fixture();
  await r.handle('plan.save', { plan: { id: 'legacy', name: '旧任务表', tasks: [{ type: 'Award' }, { type: 'Mall' }] } });
  const run = await r.startRun({ planId: 'legacy', deviceId: device.id, requestId: 'legacy-request' });
  const persisted = r.store.get('request', 'legacy-request'); delete persisted.source; delete persisted.identity; r.store.put('request', 'legacy-request', persisted);
  expect((await r.startRun({ planId: 'legacy', deviceId: device.id, requestId: 'legacy-request' })).id).toBe(run.id);
  expect(r.store.get('run_plan', run.id).tasks).toHaveLength(2); expect(r.store.get('run_snapshot', run.id)).toBeUndefined();
  worker.complete(); await r.tick(true); expect(worker.tasks).toHaveLength(2); worker.complete(); await r.tick(true); expect(r.store.get('run', run.id).status).toBe('completed');
});
