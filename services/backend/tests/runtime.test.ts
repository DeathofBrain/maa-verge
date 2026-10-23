import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Runtime } from '../src/runtime';
import { Store } from '../src/storage';
import { parsePlan, parseSettings } from '../src/models';
import { validatePlan, nativeTask } from '../src/task-policy';
import { processRequest } from '../src/entry';
import { syncDue, userDataSteps } from '../src/user-data-sync';
import { taskConsumableLimits, validatePlan as validateSharedPlan } from '../../../packages/contracts/src/task-policy';

const roots: string[] = [], runtimes: Runtime[] = [];
const temp = () => { const root = mkdtempSync(path.join(tmpdir(), 'maaverge-ts-test-')); roots.push(root); return root; };
class FakeWorker {
  events: any[] = []; connected = true; safeIdle = true; submitted: any[] = []; stopped = false; closed = false;
  async task(task: any) { this.submitted.push(task); this.safeIdle = false; return { taskId: this.submitted.length }; }
  async connect() { return { asyncId: 1 }; }
  async stop() { this.stopped = true; return { stopping: true }; }
  async close() { this.closed = true; }
  async waitConnected() { return this.connected && this.safeIdle; }
  recognize(id: number, type: 'OperBox' | 'Depot', result?: any, extra: any = {}) {
    const details = result ?? (type === 'OperBox' ? { done: true, own_opers: [{ id: 'char_172_svrash', name: '银灰', own: true, elite: 2, level: 90, potential: 1, rarity: 6 }] } : { done: true, data: '{"30012":12,"4001":12345}' });
    this.events.push({ type: 'callback', message: 20003, details: { taskid: id, taskchain: type, what: type === 'OperBox' ? 'OperBoxInfo' : 'DepotInfo', details, ...extra } });
  }
  complete(id: number, pending: number[] = []) { this.events.push({ type: 'callback', message: 10002, details: { taskid: id } }, { type: 'callback', message: 3, details: { taskid: id } }, { type: 'status', running: false, pendingAsync: pending }); this.safeIdle = !pending.length; }
}
function fresh(root = temp(), worker = new FakeWorker()) {
  const runtime = new Runtime(root, { workerFactory: async () => worker, validator: async () => {}, adbExecutable: () => 'synthetic-adb', calendar: { fetcher: null } });
  runtimes.push(runtime); return runtime;
}
async function connectFixture(runtime: Runtime) {
  runtime.store.put('active', 'combo', { core: { path: 'synthetic-core', version: 'v1' }, resource: { path: 'synthetic-resource', version: 'r1' } });
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  device.state = 'idle'; runtime.store.put('device', device.id, device); return device;
}
async function native(root = temp()) {
  const worker = new FakeWorker(), runtime = fresh(root, worker), device = await connectFixture(runtime);
  return { runtime, worker, device };
}
async function stopAtIdle(runtime: Runtime, worker: FakeWorker, runId: string) {
  await runtime.stopRun(runId);
  worker.safeIdle = true; worker.events.push({ type: 'status', running: false, pendingAsync: [] });
  await runtime.tick(true);
}

afterEach(async () => { for (const r of runtimes.splice(0)) await r.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('business parity', () => {
  test('empty native snapshot, local Agent proposal and explicit manual execution', async () => {
    const worker = new FakeWorker(), r = fresh(undefined, worker), snapshot = r.snapshot();
    expect(snapshot.mode).toBe('native');
    expect(snapshot.devices).toEqual([]); expect(snapshot.plans).toEqual([]); expect(snapshot.runs).toEqual([]);
    for (const channel of ['core', 'resource']) expect(snapshot.updates.find(state => state.id === channel)?.currentVersion).toBe('未安装');
    const proposal = await r.handle('agent.message', { message: '刷1-7材料3次' });
    expect(proposal.mode).toBe('mock');
    expect(proposal.plan.tasks[0].params).toEqual({ stage: '1-7', times: 3 }); expect(r.snapshot().runs).toHaveLength(0);
    const saved = await r.handle('plan.save', { plan: proposal.plan }); expect(saved.id.startsWith('plan-')).toBe(true);
    const device = await connectFixture(r);
    const run = await r.handle('run.start', { planId: saved.id, deviceId: device.id, requestId: 'once' });
    for (let index = 0; index < saved.tasks.length; index++) { worker.complete(index + 1); await r.tick(true); }
    expect(r.store.get('run', run.id).status).toBe('completed'); expect(r.snapshot().devices[0].state).toBe('idle');
  });
  test('persistent request IDs and plan snapshot survive edits', async () => {
    const { runtime: r, worker, device } = await native();
    const proposal = await r.handle('agent.message', { message: '做日常' });
    await r.handle('plan.save', { plan: { ...proposal.plan, id: 'daily' } });
    const params = { planId: 'daily', deviceId: device.id, requestId: 'persisted' };
    const run = await r.startRun(params); const original = r.store.get('run_plan', run.id);
    await r.handle('plan.save', { plan: { ...r.store.get('plan', 'daily'), name: '已修改' } });
    expect(r.store.get('run_plan', run.id)).toEqual(original);
    expect((await r.startRun(params)).id).toBe(run.id); await stopAtIdle(r, worker, run.id);
    await expect(r.startRun({ ...params, planId: 'different-plan' })).rejects.toMatchObject({ code: -32011 });
    await r.close(); runtimes.splice(runtimes.indexOf(r), 1);
    const reopened = fresh(r.root); expect((await reopened.startRun(params)).id).toBe(run.id); expect(reopened.snapshot().plans[0].name).toBe('已修改');
    expect(reopened.workers.size).toBe(0);
  });
  test('stop preserves pending plan and disallows deleting active plans', async () => {
    const { runtime: r, worker, device } = await native();
    const proposal = await r.handle('agent.message', { message: '做日常' });
    await r.handle('plan.save', { plan: { ...proposal.plan, id: 'daily' } });
    const run = await r.startRun({ planId: 'daily', deviceId: device.id, requestId: 'stop' });
    await expect(r.handle('plan.delete', { id: 'daily' })).rejects.toMatchObject({ code: -32011 });
    await stopAtIdle(r, worker, run.id); expect(r.store.get('plan', 'daily').tasks).toHaveLength(5); expect(r.store.get('run', run.id).status).toBe('stopped');
    expect(worker.submitted).toHaveLength(1);
  });
  test('Fight parameters govern execution despite legacy zero budgets and remain immutable after launch', async () => {
    const { runtime: r, worker, device } = await native();
    expect(taskConsumableLimits(parsePlan({ name: '默认', tasks: [{ type: 'Fight' }] }))).toEqual({ medicine: 0, originium: 0, expedited: 0 });
    const plan = await r.handle('plan.save', { plan: { name: '消耗', budgets: { medicine: 0 }, tasks: [
      { type: 'Fight', params: { medicine: 2, stone: 1 } },
      { type: 'Fight', params: { medicine: 3, stone: 2 } },
      { type: 'Fight', params: { medicine: 99, stone: 99 }, enabled: false },
      { type: 'Fight', params: { medicine: 99, stone: 99, enable: false } },
    ] } });
    expect(taskConsumableLimits(plan)).toEqual({ medicine: 5, originium: 3, expedited: 0 });
    expect(r.snapshot().settings.budgets).toEqual({ medicine: 0, originium: 0, expedited: 0 });
    const run = await r.startRun({ planId: plan.id, deviceId: device.id, requestId: 'task-limits' });
    await r.handle('plan.save', { plan: { ...plan, tasks: [{ type: 'Fight', params: {} }] } });
    expect(worker.submitted[0].params).toMatchObject({ medicine: 2, stone: 1 });
    worker.complete(1); await r.tick(true);
    expect(worker.submitted[1].params).toMatchObject({ medicine: 3, stone: 2 });
    worker.complete(2); await r.tick(true);
    expect(worker.submitted).toHaveLength(2);
    expect(r.store.get('run', run.id).status).toBe('completed');
    expect(taskConsumableLimits(r.store.get('run_plan', run.id))).toEqual({ medicine: 5, originium: 3, expedited: 0 });
  });
  test('crash recovery fails uncertain execution instead of replaying', () => {
    const root = temp(), store = new Store(root);
    store.put('meta', 'initialized', true); store.put('settings', 'main', parseSettings()); store.put('run', 'unknown', { id: 'unknown', planId: 'daily', deviceId: 'd', status: 'running', progress: 10, message: '', startedAt: 'old' }); store.close();
    const r = fresh(root); expect(r.store.get('run', 'unknown').status).toBe('failed'); expect(r.store.events()[0].type).toBe('run.interrupted');
  });
  test('JSON-RPC errors and notification handling', async () => {
    const r = fresh(); expect((await processRequest(r, [])).error.code).toBe(-32600);
    expect((await processRequest(r, { jsonrpc: '2.0', id: true, method: 'app.snapshot' })).error.code).toBe(-32600);
    expect(await processRequest(r, { jsonrpc: '2.0', method: 'unknown' })).toBeUndefined();
    expect((await processRequest(r, { jsonrpc: '2.0', id: 4, method: 'unknown' })).error.code).toBe(-32601);
    expect((await processRequest(r, { jsonrpc: '2.0', id: 4, method: 'plan.save', params: {} })).error.code).toBe(-32602);
  });
});

describe('native execution evidence', () => {
  test('task ID, queue end and idle async state are all required', async () => {
    const { runtime: r, worker, device } = await native();
    await r.handle('plan.save', { plan: { id: 'one', name: '任务', tasks: [{ type: 'Award' }] } });
    const run = await r.startRun({ planId: 'one', deviceId: device.id, requestId: 'native-once' });
    worker.complete(1, [88]); await r.tick(true); expect(r.store.get('run', run.id).status).toBe('running');
    worker.safeIdle = true; worker.events.push({ type: 'status', running: false, pendingAsync: [] }); await r.tick(true); expect(r.store.get('run', run.id).status).toBe('completed');
  });
  test('stale completion does not authorize the next task', async () => {
    const { runtime: r, worker, device } = await native();
    await r.handle('plan.save', { plan: { id: 'two', name: '任务', tasks: [{ type: 'Award' }, { type: 'Mall' }] } });
    const run = await r.startRun({ planId: 'two', deviceId: device.id, requestId: 'wrong-id' });
    worker.events.push({ type: 'callback', message: 10002, details: { taskid: 999 } }, { type: 'callback', message: 3, details: {} }, { type: 'status', running: false, pendingAsync: [] }); worker.safeIdle = true;
    await r.tick(true); expect(r.store.get('run', run.id).status).toBe('failed'); expect(worker.submitted).toHaveLength(1);
  });
  test('AsstStop stops and preserves the remaining plan', async () => {
    const { runtime: r, worker, device } = await native();
    await r.handle('plan.save', { plan: { id: 'two', name: '任务', tasks: [{ type: 'Award' }, { type: 'Mall' }] } });
    const run = await r.startRun({ planId: 'two', deviceId: device.id, requestId: 'stop-native' }); await r.stopRun(run.id);
    expect(worker.stopped).toBe(true); worker.safeIdle = true; worker.events.push({ type: 'status', running: false, pendingAsync: [] }); await r.tick(true);
    expect(r.store.get('run', run.id).status).toBe('stopped'); expect(worker.submitted).toHaveLength(1); expect(r.store.get('plan', 'two').tasks).toHaveLength(2);
  });
  test('native worker crash never replays uncertain actions', async () => {
    const { runtime: r, worker, device } = await native();
    await r.handle('plan.save', { plan: { id: 'one', name: '任务', tasks: [{ type: 'Award' }] } });
    const params = { planId: 'one', deviceId: device.id, requestId: 'crash' }, run = await r.startRun(params);
    worker.events.push({ type: 'exit' }); await r.tick(true); expect(r.store.get('run', run.id).status).toBe('failed');
    expect((await r.startRun(params)).id).toBe(run.id); expect(worker.submitted).toHaveLength(1);
  });
  test('a delayed stop acknowledgement cannot start a queued successor', async () => {
    const { runtime: r, worker, device } = await native();
    await r.handle('plan.save', { plan: { id: 'two', name: '任务', tasks: [{ type: 'Award' }, { type: 'Mall' }] } });
    const run = await r.startRun({ planId: 'two', deviceId: device.id, requestId: 'stop-race' });
    let acknowledge!: () => void;
    worker.stop = () => new Promise(resolve => { acknowledge = () => resolve({ stopping: true }); });
    const stopping = r.stopRun(run.id); worker.complete(1); await r.tick(true);
    expect(worker.submitted).toHaveLength(1); expect(r.store.get('run', run.id).status).toBe('stopped');
    acknowledge(); expect((await stopping).status).toBe('stopped');
  });
});

describe('combined user data update', () => {
  const params = { operators: true, depot: true, interval: 'daily' };
  test('keeps one application task while sequencing recognition and recording only idle success', async () => {
    const { runtime: r, worker, device } = await native();
    await r.handle('plan.save', { plan: { id: 'sync', name: '数据', tasks: [{ type: 'UserDataUpdate', params }, { type: 'Award' }] } });
    const run = await r.startRun({ planId: 'sync', deviceId: device.id, requestId: 'sync' });
    expect(r.store.get('run_plan', run.id).tasks).toHaveLength(2);
    expect(worker.submitted.map(task => task.type)).toEqual(['OperBox']);
    worker.recognize(1, 'OperBox'); worker.complete(1, [9]); await r.tick(true);
    expect(r.snapshot().devices[0].dataSync).toEqual({ operatorsAt: null, depotAt: null });
    worker.safeIdle = true; worker.events.push({ type: 'status', running: false, pendingAsync: [] }); await r.tick(true);
    expect(worker.submitted.map(task => task.type)).toEqual(['OperBox', 'Depot']);
    expect(r.snapshot().devices[0].dataSync?.operatorsAt).toBeString();
    expect(r.snapshot().devices[0].dataSync?.depotAt).toBeNull();
    expect(r.store.get('run', run.id).progress).toBe(0);
    worker.recognize(2, 'Depot'); worker.complete(2); await r.tick(true);
    expect(worker.submitted.map(task => task.type)).toEqual(['OperBox', 'Depot', 'Award']);
    expect(r.snapshot().devices[0].dataSync?.depotAt).toBeString();
    expect(r.store.get('run', run.id).progress).toBe(50);
    worker.complete(3); await r.tick(true);
    expect(r.store.get('run', run.id).status).toBe('completed');
    const next = await r.startRun({ planId: 'sync', deviceId: device.id, requestId: 'same-day' });
    expect(worker.submitted.map(task => task.type)).toEqual(['OperBox', 'Depot', 'Award', 'Award']);
    worker.complete(4); await r.tick(true); expect(r.store.get('run', next.id).status).toBe('completed');
  });
  test('partial failure preserves successful item and retries only the due item after restart', async () => {
    const { runtime: r, worker, device } = await native();
    await r.handle('plan.save', { plan: { id: 'sync', name: '数据', tasks: [{ type: 'UserDataUpdate', params }] } });
    const run = await r.startRun({ planId: 'sync', deviceId: device.id, requestId: 'partial' });
    worker.recognize(1, 'OperBox'); worker.complete(1); await r.tick(true);
    worker.events.push({ type: 'callback', message: 10000, details: { taskid: 2 } }); worker.complete(2); await r.tick(true);
    expect(r.store.get('run', run.id).status).toBe('failed');
    const synced = r.snapshot().devices[0].dataSync;
    expect(synced?.operatorsAt).toBeString(); expect(synced?.depotAt).toBeNull();
    await r.close();
    const replacement = new FakeWorker(), reopened = fresh(r.root, replacement), reconnected = await connectFixture(reopened);
    expect(reopened.snapshot().devices[0].dataSync).toEqual(synced);
    const retry = await reopened.startRun({ planId: 'sync', deviceId: reconnected.id, requestId: 'retry' });
    expect(replacement.submitted.map(task => task.type)).toEqual(['Depot']);
    replacement.recognize(1, 'Depot'); replacement.complete(1); await reopened.tick(true); expect(reopened.store.get('run', retry.id).status).toBe('completed');
  });
  test('unmatched completion, queue-end only, and stopped tasks never record success', async () => {
    for (const evidence of ['unmatched', 'queue-only', 'stopped']) {
      const { runtime: r, worker, device } = await native();
      await r.handle('plan.save', { plan: { id: 'sync', name: '数据', tasks: [{ type: 'UserDataUpdate', params }] } });
      const run = await r.startRun({ planId: 'sync', deviceId: device.id, requestId: evidence });
      if (evidence === 'stopped') await r.stopRun(run.id);
      if (evidence !== 'queue-only') worker.events.push({ type: 'callback', message: 10002, details: { taskid: evidence === 'unmatched' ? 999 : 1 } });
      worker.events.push({ type: 'callback', message: 3, details: {} }, { type: 'status', running: false, pendingAsync: [] }); worker.safeIdle = true;
      await r.tick(true);
      expect(r.snapshot().devices[0].dataSync).toEqual({ operatorsAt: null, depotAt: null }); expect(worker.submitted).toHaveLength(1);
      expect(r.store.get('run', run.id).status).toBe(evidence === 'stopped' ? 'stopped' : 'failed');
    }
  });
  test('hot update boundary holds and resumes the remaining recognition step', async () => {
    const { runtime: r, worker, device } = await native();
    await r.handle('plan.save', { plan: { id: 'sync', name: '数据', tasks: [{ type: 'UserDataUpdate', params }] } });
    const run = await r.startRun({ planId: 'sync', deviceId: device.id, requestId: 'boundary' });
    const channel = r.updates.channel('resource'); r.store.put('update', 'resource', { ...channel, status: 'waiting_idle' });
    worker.recognize(1, 'OperBox'); worker.complete(1); await r.tick(true);
    expect(worker.submitted).toHaveLength(1); expect(r.busy()).toBe(false);
    r.store.put('update', 'resource', { ...channel, status: 'idle' }); await r.tick(true);
    expect(worker.submitted.map(task => task.type)).toEqual(['OperBox', 'Depot']);
    worker.recognize(2, 'Depot'); worker.complete(2); await r.tick(true); expect(r.store.get('run', run.id).status).toBe('completed');
  });
  test('nothing selected and an entirely synced period finish without native calls', async () => {
    const { runtime: r, worker, device } = await native();
    for (const [id, chosen] of [['none', { operators: false, depot: false }], ['done', params]] as const) {
      r.store.put('user_data_sync', device.id, { operatorsAt: new Date().toISOString(), depotAt: new Date().toISOString() });
      await r.handle('plan.save', { plan: { id, name: '数据', tasks: [{ type: 'UserDataUpdate', params: chosen }] } });
      const run = await r.startRun({ planId: id, deviceId: device.id, requestId: id });
      expect(run.status).toBe('completed'); expect(worker.submitted).toHaveLength(0);
    }
  });
  test('standalone recognition shares success timestamps while device histories stay isolated', async () => {
    const { runtime: r, worker, device } = await native();
    const other = { ...device, id: 'second-device', address: '127.0.0.1:5557' }, otherWorker = new FakeWorker();
    r.store.put('device', other.id, other); r.workers.set(other.id, otherWorker);
    await r.handle('plan.save', { plan: { id: 'oper', name: '干员', tasks: [{ type: 'OperBox' }] } });
    await r.startRun({ planId: 'oper', deviceId: device.id, requestId: 'oper' }); worker.recognize(1, 'OperBox'); worker.complete(1); await r.tick(true);
    expect(r.snapshot().devices.find(d => d.id === device.id)?.dataSync?.operatorsAt).toBeString();
    expect(r.snapshot().devices.find(d => d.id === other.id)?.dataSync).toEqual({ operatorsAt: null, depotAt: null });
    await r.handle('plan.save', { plan: { id: 'sync', name: '数据', tasks: [{ type: 'UserDataUpdate', params }] } });
    await r.startRun({ planId: 'sync', deviceId: device.id, requestId: 'same-device' });
    await r.startRun({ planId: 'sync', deviceId: other.id, requestId: 'other-device' });
    expect(worker.submitted.map(task => task.type)).toEqual(['OperBox', 'Depot']);
    expect(otherWorker.submitted.map(task => task.type)).toEqual(['OperBox']);
  });
  test('standalone recognition rejects absent, malformed, stale and late final results', async () => {
    const { runtime: r, worker, device } = await native();
    for (const type of ['OperBox', 'Depot'] as const) for (const evidence of ['none', 'partial', 'empty', 'invalid', 'wrong-id', 'wrong-chain', 'wrong-what', 'wrong-message', 'late', 'no-chain-success', 'failed-chain']) {
      await r.handle('plan.save', { plan: { id: 'recognize', name: '识别', tasks: [{ type }] } });
      const run = await r.startRun({ planId: 'recognize', deviceId: device.id, requestId: type + evidence }), id = worker.submitted.length;
      if (evidence !== 'none' && evidence !== 'late') {
        const result = evidence === 'partial' ? { done: false, own_opers: [], data: '{}' }
          : evidence === 'empty' ? { done: true, own_opers: [], data: '{}' }
          : evidence === 'invalid' ? { done: true, own_opers: [{ id: 'id', name: 'name', own: 'true', elite: 0, level: 1, potential: 0, rarity: 0 }], data: '{"item":1.5}' } : undefined;
        worker.recognize(evidence === 'wrong-id' ? id - 1 : id, type, result,
          evidence === 'wrong-chain' ? { taskchain: type === 'OperBox' ? 'Depot' : 'OperBox' }
            : evidence === 'wrong-what' ? { what: type === 'OperBox' ? 'DepotInfo' : 'OperBoxInfo' } : {});
        if (evidence === 'wrong-message') worker.events[worker.events.length - 1].message = 20002;
      }
      if (evidence === 'failed-chain') worker.events.push({ type: 'callback', message: 10000, details: { taskid: id } });
      if (evidence === 'no-chain-success') {
        worker.events.push({ type: 'callback', message: 3, details: { taskid: id } }, { type: 'status', running: false, pendingAsync: [] }); worker.safeIdle = true;
      } else worker.complete(id);
      if (evidence === 'late') worker.recognize(id, type);
      await r.tick(true);
      expect(r.store.get('run', run.id).status).toBe('failed');
      if (!['no-chain-success', 'failed-chain'].includes(evidence)) expect(r.store.get('run', run.id).message).toContain('结果未知');
      expect(r.snapshot().devices[0].dataSync).toEqual({ operatorsAt: null, depotAt: null });
      // A late callback after the failed run cannot revive its result.
      worker.recognize(id, type); await r.tick(true);
      expect(r.store.get('run', run.id).status).toBe('failed');
    }
  });
  test('an earlier recognition result cannot authorize its successor', async () => {
    const { runtime: r, worker, device } = await native();
    await r.handle('plan.save', { plan: { id: 'sync', name: '数据', tasks: [{ type: 'UserDataUpdate', params }] } });
    const run = await r.startRun({ planId: 'sync', deviceId: device.id, requestId: 'stale-result' });
    worker.recognize(1, 'OperBox'); worker.complete(1); await r.tick(true);
    worker.recognize(1, 'OperBox'); worker.recognize(1, 'Depot'); worker.complete(2); await r.tick(true);
    expect(r.store.get('run', run.id).status).toBe('failed');
    expect(r.snapshot().devices[0].dataSync?.operatorsAt).toBeString(); expect(r.snapshot().devices[0].dataSync?.depotAt).toBeNull();
  });
  test('periods use client game days and Monday weeks with independent item history', () => {
    const monday = new Date('2026-10-18T20:00:00Z'), sunday = new Date('2026-10-18T19:59:59Z'), friday = new Date('2026-10-23T02:00:00Z');
    expect(syncDue(sunday.toISOString(), 'weekly', friday)).toBe(true);
    expect(syncDue(monday.toISOString(), 'weekly', friday)).toBe(false);
    expect(syncDue('2026-10-22T19:59:59Z', 'daily', friday)).toBe(true);
    expect(syncDue('2026-10-22T20:00:00Z', 'daily', friday)).toBe(false);
    expect(syncDue(friday.toISOString(), 'always', friday)).toBe(true);
    expect(syncDue('invalid', 'daily', friday)).toBe(true);
    expect(syncDue('2026-10-24T00:00:00Z', 'daily', friday)).toBe(true);
    for (const [client, before, after] of [
      ['Official', '2026-10-22T19:59:59Z', '2026-10-22T20:00:00Z'],
      ['Bilibili', '2026-10-22T19:59:59Z', '2026-10-22T20:00:00Z'],
      ['txwy', '2026-10-22T19:59:59Z', '2026-10-22T20:00:00Z'],
      ['YoStarEN', '2026-10-23T10:59:59Z', '2026-10-23T11:00:00Z'],
      ['YoStarJP', '2026-10-22T18:59:59Z', '2026-10-22T19:00:00Z'],
      ['YoStarKR', '2026-10-22T18:59:59Z', '2026-10-22T19:00:00Z'],
    ]) {
      expect(syncDue(before, 'daily', new Date(after), client)).toBe(true);
      expect(syncDue(after, 'daily', new Date(after), client)).toBe(false);
    }
    expect(userDataSteps(params, { operatorsAt: friday.toISOString(), depotAt: sunday.toISOString() }, friday)).toEqual([{ type: 'Depot', key: 'depotAt' }]);
    expect(userDataSteps(params, {}, friday).map(step => step.type)).toEqual(['OperBox', 'Depot']);
  });
});

describe('daily friend visits', () => {
  const params = { visit_friends: true, visit_friends_once_a_day: true, shopping: true };
  function visited(worker: FakeWorker, taskid: number, task = 'VisitLimited', extra: any = {}) {
    worker.events.push({ type: 'callback', message: 20002, details: { taskid, subtask: 'ProcessTask', taskchain: 'Mall', details: { task }, ...extra } });
  }
  test('uses specific visit evidence and strips the application-only option before submission', async () => {
    const { runtime: r, worker, device } = await native();
    await r.handle('plan.save', { plan: { id: 'mall', name: '信用', tasks: [{ type: 'Mall', params }] } });
    const start = (requestId: string) => r.startRun({ planId: 'mall', deviceId: device.id, requestId });
    await start('first'); expect(worker.submitted[0].params).toEqual({ visit_friends: true, shopping: true });
    visited(worker, 1); worker.complete(1, [5]); await r.tick(true);
    expect(r.store.get('mall_visit', device.id)).toBeUndefined();
    worker.safeIdle = true; worker.events.push({ type: 'status', running: false, pendingAsync: [] }); await r.tick(true);
    expect(r.store.get('mall_visit', device.id).visitedAt).toBeString();
    await start('second'); expect(worker.submitted[1].params.visit_friends).toBe(false);
    worker.complete(2); await r.tick(true);
    r.store.put('mall_visit', device.id, { visitedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() });
    await start('next-day'); expect(worker.submitted[2].params.visit_friends).toBe(true);
    worker.complete(3); await r.tick(true);
  });
  test('overall Mall success and unrelated or stale subtask callbacks do not suppress visits', async () => {
    const { runtime: r, worker, device } = await native();
    await r.handle('plan.save', { plan: { id: 'mall', name: '信用', tasks: [{ type: 'Mall', params }] } });
    await r.startRun({ planId: 'mall', deviceId: device.id, requestId: 'wrong-evidence' });
    visited(worker, 999); visited(worker, 1, 'VisitLimited', { taskchain: 'Infrast' }); visited(worker, 1, 'VisitLimited', { subtask: 'Other' }); visited(worker, 1, 'CreditShopping');
    worker.complete(1); await r.tick(true); expect(r.store.get('mall_visit', device.id)).toBeUndefined();
    await r.startRun({ planId: 'mall', deviceId: device.id, requestId: 'again' }); expect(worker.submitted[1].params.visit_friends).toBe(true);
    visited(worker, 2, 'VisitNextBlack'); worker.events.push({ type: 'callback', message: 10000, details: { taskid: 2 } }); worker.complete(2); await r.tick(true);
    expect(r.store.get('mall_visit', device.id).visitedAt).toBeString();
  });
  test('Fight reporting follows StartUp and preserves explicit client and server parameters', async () => {
    const { runtime: r, worker, device } = await native();
    const reporting = { report_to_penguin: true, report_to_yituliu: true };
    const tasks = [{ type: 'StartUp', params: { client_type: 'YoStarJP' } },
      { type: 'Fight', params: reporting }, { type: 'Fight', params: { ...reporting, client_type: 'YoStarEN' } },
      { type: 'Fight', params: { ...reporting, server: 'KR' } }, { type: 'Fight', params: { ...reporting, client_type: 'YoStarKR', server: 'US' } }];
    await r.handle('plan.save', { plan: { id: 'fight-clients', name: '外服汇报', tasks } });
    const run = await r.startRun({ planId: 'fight-clients', deviceId: device.id, requestId: 'fight-clients' });
    for (let index = 0; index < tasks.length; index++) { worker.complete(index + 1); await r.tick(true); await new Promise(resolve => setTimeout(resolve, 0)); }
    expect(worker.submitted.slice(1).map(task => [task.params.client_type, task.params.server])).toEqual([
      ['YoStarJP', 'JP'], ['YoStarEN', 'US'], ['YoStarJP', 'KR'], ['YoStarKR', 'US'],
    ]);
    expect(r.store.get('run_plan', run.id).tasks.map((task: any) => task.params)).toEqual(tasks.map(task => task.params));
    await r.handle('plan.save', { plan: { id: 'remembered-client', name: '记住渠道', tasks: [{ type: 'Fight', params: reporting }] } });
    await r.startRun({ planId: 'remembered-client', deviceId: device.id, requestId: 'remembered-client' });
    expect(worker.submitted.at(-1).params).toMatchObject({ client_type: 'YoStarJP', server: 'JP', ...reporting });
  });
  test('Fight reporting falls back through independent profile, global connection and Official defaults', async () => {
    const profile = (clientType: string) => ({ id: 'independent', name: '独立实例', address: 'localhost:05555', connection: { clientType }, capture: {} });
    for (const scenario of [
      { settings: {}, client: 'Official', server: 'CN', remembered: undefined },
      { settings: { connection: { clientType: 'YoStarEN' } }, client: 'YoStarEN', server: 'US', remembered: undefined },
      { settings: { connection: { clientType: 'YoStarEN' }, deviceProfiles: [profile('YoStarJP')] }, client: 'YoStarJP', server: 'JP', remembered: undefined },
      { settings: { connection: { clientType: 'YoStarEN' }, deviceProfiles: [profile('YoStarKR')] }, client: 'YoStarKR', server: 'KR', remembered: undefined },
      { settings: { connection: { clientType: 'YoStarEN' }, deviceProfiles: [profile('YoStarJP')] }, client: 'txwy', server: 'CN', remembered: 'txwy' },
      { settings: { connection: { clientType: 'Bilibili' } }, client: 'Bilibili', server: 'CN', remembered: undefined },
    ]) {
      const worker = new FakeWorker(), r = fresh(undefined, worker);
      await r.handle('settings.save', { settings: scenario.settings });
      const device = await connectFixture(r);
      // Legacy records without a profile ID still resolve a canonical address alias.
      if (scenario.client === 'YoStarKR') { delete device.connectionProfileId; r.store.put('device', device.id, device); }
      if (scenario.remembered) r.store.put('device_client', device.id, scenario.remembered);
      await r.handle('plan.save', { plan: { id: 'profile-fight', name: '实例渠道', tasks: [{ type: 'Fight', params: { report_to_penguin: true } }] } });
      await r.startRun({ planId: 'profile-fight', deviceId: device.id, requestId: 'profile-fight' });
      expect(worker.submitted[0].params).toMatchObject({ client_type: scenario.client, server: scenario.server, medicine: 0, stone: 0 });
    }
  });
  test('successful StartUp stores client context across restarts and a current explicit client overrides it', async () => {
    const { runtime: r, worker, device } = await native();
    await r.handle('plan.save', { plan: { id: 'client', name: '渠道', tasks: [{ type: 'StartUp', params: { client_type: 'YoStarEN' } }, { type: 'Mall', params }] } });
    await r.startRun({ planId: 'client', deviceId: device.id, requestId: 'client' }); worker.complete(1); await r.tick(true);
    expect(r.store.get('execution', r.snapshot().runs[0].id).clientType).toBe('YoStarEN'); worker.complete(2); await r.tick(true);
    await r.close();
    const replacement = new FakeWorker(), reopened = fresh(r.root, replacement), reconnected = await connectFixture(reopened);
    await reopened.handle('plan.save', { plan: { id: 'mall', name: '信用', tasks: [{ type: 'Mall', params }, { type: 'Mall', params: { ...params, client_type: 'YoStarJP' } }] } });
    const run = await reopened.startRun({ planId: 'mall', deviceId: reconnected.id, requestId: 'new-plan' });
    expect(reopened.store.get('execution', run.id).clientType).toBe('YoStarEN'); replacement.complete(1); await reopened.tick(true);
    expect(reopened.store.get('execution', run.id).clientType).toBe('YoStarJP'); replacement.complete(2); await reopened.tick(true);
  });
  test('explicit client overrides do not inherit another client\'s visit or recognition history', async () => {
    const { runtime: r, worker, device } = await native();
    const syncedAt = new Date().toISOString();
    r.store.put('user_data_sync', device.id, { clientType: 'YoStarEN', operatorsAt: syncedAt, depotAt: syncedAt });
    r.store.put('mall_visit', device.id, { clientType: 'YoStarEN', visitedAt: syncedAt });
    expect(r.snapshot().devices[0].dataSync).toEqual({ operatorsAt: null, depotAt: null });
    await r.handle('plan.save', { plan: { id: 'different-client', name: '渠道隔离', tasks: [{ type: 'Mall', params }, { type: 'UserDataUpdate', params: { operators: true, depot: false, interval: 'daily' } }] } });
    await r.startRun({ planId: 'different-client', deviceId: device.id, requestId: 'different-client' });
    expect(worker.submitted[0].params.visit_friends).toBe(true);
    worker.complete(1); await r.tick(true); expect(worker.submitted[1].type).toBe('OperBox');
    worker.recognize(2, 'OperBox'); worker.complete(2); await r.tick(true);
    expect(r.snapshot().devices[0].dataSync?.operatorsAt).toBeString(); expect(r.snapshot().devices[0].dataSync?.depotAt).toBeNull();
  });
  test('successful explicit account or client changes clear per-device period state', async () => {
    const { runtime: r, worker, device } = await native();
    const context = async (client_type: string, account_name: string, requestId: string) => {
      await r.handle('plan.save', { plan: { id: 'context', name: '账号', tasks: [{ type: 'StartUp', params: { client_type, account_name } }] } });
      await r.startRun({ planId: 'context', deviceId: device.id, requestId }); worker.complete(worker.submitted.length); await r.tick(true);
    };
    const seed = (clientType = 'Official') => {
      const at = new Date().toISOString();
      r.store.put('user_data_sync', device.id, { clientType, operatorsAt: at, depotAt: at });
      r.store.put('mall_visit', device.id, { clientType, visitedAt: at });
    };
    await context('Official', 'A', 'account-a'); seed();
    await context('Official', 'A', 'same-account'); expect(r.snapshot().devices[0].dataSync?.operatorsAt).toBeString(); expect(r.store.get('mall_visit', device.id)).toBeDefined();
    await context('Official', 'B', 'account-b'); expect(r.snapshot().devices[0].dataSync).toEqual({ operatorsAt: null, depotAt: null }); expect(r.store.get('mall_visit', device.id)).toBeUndefined();
    seed(); await context('YoStarJP', 'B', 'other-client'); expect(r.snapshot().devices[0].dataSync).toEqual({ operatorsAt: null, depotAt: null }); expect(r.store.get('mall_visit', device.id)).toBeUndefined();
    seed('YoStarJP'); await context('YoStarJP', '', 'unknown-account'); expect(r.snapshot().devices[0].dataSync).toEqual({ operatorsAt: null, depotAt: null }); expect(r.store.get('mall_visit', device.id)).toBeUndefined();
    expect(r.store.get('device_account', device.id)).toBe('');
  });
  test('account changes invalidate only the current device estimates after successful idle completion', async () => {
    const { runtime: r, worker, device } = await native();
    r.store.put('device_client', device.id, 'Official'); r.store.put('device_account', device.id, 'A');
    const line = { id: 'gold', name: '赤金', unit: '块', hourlyRate: 20, capacity: 100, lastCollectedAt: '2020-01-01T00:00:00Z' };
    const settings = { ...r.snapshot().settings, theme: 'dark', infrastructureEstimates: [{ deviceId: device.id, lines: [line] }, { deviceId: 'other-device', lines: [{ ...line, id: 'other-gold' }] }] };
    const remaining = { ...settings, infrastructureEstimates: settings.infrastructureEstimates.slice(1) };
    const seed = () => r.store.put('settings', 'main', settings);
    const start = async (client_type: string, account_name: string, requestId: string) => {
      await r.handle('plan.save', { plan: { id: 'estimate-account', name: '估算账号', tasks: [{ type: 'StartUp', params: { client_type, account_name } }] } });
      return r.startRun({ planId: 'estimate-account', deviceId: device.id, requestId });
    };
    const invalidations = () => r.store.events().filter(event => event.type === 'device.infrastructure_estimate_invalidated');
    seed();
    await start('Official', 'A', 'estimate-same'); worker.complete(1); await r.tick(true);
    expect(r.store.get('settings', 'main')).toEqual(settings); expect(invalidations()).toHaveLength(0);
    const switched = await start('Official', 'B', 'estimate-other-account'); worker.complete(2, [42]); await r.tick(true);
    expect(r.store.get('settings', 'main')).toEqual(settings); expect(r.store.get('device_account', device.id)).toBe('A');
    worker.safeIdle = true; worker.events.push({ type: 'status', running: false, pendingAsync: [] }); await r.tick(true);
    expect(r.store.get('settings', 'main')).toEqual(remaining);
    expect(invalidations()).toHaveLength(1); expect(invalidations()[0].data).toEqual({ deviceId: device.id, runId: switched.id });
    expect((await r.handle('home.info', { deviceId: device.id })).infrastructure.lines).toEqual([]);
    for (const [client, account, requestId] of [['YoStarJP', 'B', 'estimate-other-client'], ['YoStarJP', '', 'estimate-unknown-account']]) {
      seed(); await start(client!, account!, requestId!); worker.complete(worker.submitted.length); await r.tick(true);
      expect(r.store.get('settings', 'main')).toEqual(remaining);
    }
    expect(invalidations()).toHaveLength(3);
    await start('YoStarJP', 'C', 'estimate-already-empty'); worker.complete(worker.submitted.length); await r.tick(true);
    expect(invalidations()).toHaveLength(3); expect(r.store.get('settings', 'main')).toEqual(remaining);
  });
  test('failed, unproven or stopped startup cannot clear estimates or change the remembered account', async () => {
    for (const evidence of ['failed', 'queue-only', 'stopped']) {
      const { runtime: r, worker, device } = await native();
      r.store.put('device_client', device.id, 'Official'); r.store.put('device_account', device.id, 'A');
      const settings = { ...r.snapshot().settings, infrastructureEstimates: [{ deviceId: device.id, lines: [{ id: 'gold', name: '赤金', unit: '块', hourlyRate: 20, capacity: 100, lastCollectedAt: '2020-01-01T00:00:00Z' }] }] };
      r.store.put('settings', 'main', settings);
      await r.handle('plan.save', { plan: { id: 'estimate-unconfirmed', name: '未知结果', tasks: [{ type: 'StartUp', params: { client_type: 'YoStarJP', account_name: 'B' } }] } });
      const run = await r.startRun({ planId: 'estimate-unconfirmed', deviceId: device.id, requestId: evidence });
      if (evidence === 'stopped') await r.stopRun(run.id);
      if (evidence === 'failed') worker.events.push({ type: 'callback', message: 10000, details: { taskid: 1 } });
      if (evidence === 'queue-only') {
        worker.events.push({ type: 'callback', message: 3, details: { taskid: 1 } }, { type: 'status', running: false, pendingAsync: [] }); worker.safeIdle = true;
      } else worker.complete(1);
      await r.tick(true);
      expect(r.store.get('run', run.id).status).toBe(evidence === 'stopped' ? 'stopped' : 'failed');
      expect(r.store.get('settings', 'main')).toEqual(settings); expect(r.store.get('device_account', device.id)).toBe('A'); expect(r.store.get('device_client', device.id)).toBe('Official');
      expect(r.store.events().some(event => event.type === 'device.infrastructure_estimate_invalidated')).toBe(false);
    }
  });
});

describe('parallel device execution', () => {
  async function dual() {
    const { runtime, worker: first, device: deviceA } = await native();
    const second = new FakeWorker(), deviceB = { ...deviceA, id: 'device-second', address: '127.0.0.1:5557' };
    runtime.store.put('device', deviceB.id, deviceB); runtime.workers.set(deviceB.id, second);
    return { r: runtime, first, second, deviceA, deviceB };
  }
  test('one unbound plan runs concurrently with independent snapshots and stopping one device preserves the other', async () => {
    const { r, first, second, deviceA, deviceB } = await dual();
    const save = (stage: string, times: number) => r.handle('plan.save', { plan: { id: 'shared', name: '多开', tasks: [{ type: 'Fight', params: { stage, times } }, { type: 'Award' }] } });
    await save('1-7', 1);
    const pendingA = r.startRun({ planId: 'shared', deviceId: deviceA.id, requestId: 'parallel-a' });
    await save('CE-6', 2);
    const pendingB = r.startRun({ planId: 'shared', deviceId: deviceB.id, requestId: 'parallel-b' });
    const [runA, runB] = await Promise.all([pendingA, pendingB]);
    expect(runA.status).toBe('running'); expect(runB.status).toBe('running');
    expect(first.submitted[0].params).toMatchObject({ stage: '1-7', times: 1 }); expect(second.submitted[0].params).toMatchObject({ stage: 'CE-6', times: 2 });
    expect(r.store.get('run_plan', runA.id).tasks[0].params.stage).toBe('1-7'); expect(r.store.get('run_plan', runB.id).tasks[0].params.stage).toBe('CE-6');
    await expect(r.startRun({ planId: 'shared', deviceId: deviceA.id, requestId: 'duplicate-controller' })).rejects.toMatchObject({ code: -32011 });
    await expect(r.startRun({ planId: 'shared', deviceId: deviceB.id, requestId: 'parallel-a' })).rejects.toMatchObject({ code: -32011 });
    expect(first.submitted).toHaveLength(1); expect(second.submitted).toHaveLength(1);
    await stopAtIdle(r, first, runA.id);
    expect(r.store.get('run', runA.id).status).toBe('stopped'); expect(r.store.get('run', runB.id).status).toBe('running'); expect(second.stopped).toBe(false);
    second.complete(1); await r.tick(true); expect(second.submitted.map(task => task.type)).toEqual(['Fight', 'Award']); expect(first.submitted).toHaveLength(1);
    second.complete(2); await r.tick(true);
    expect(r.store.get('run', runB.id).status).toBe('completed'); expect(r.store.get('run', runA.id).status).toBe('stopped');
    expect(r.snapshot().devices.map(device => device.state)).toEqual(['idle', 'idle']);
  });
  test('colliding native task IDs and late recognition callbacks cannot cross device or run boundaries', async () => {
    const { r, first, second, deviceA, deviceB } = await dual();
    await r.handle('plan.save', { plan: { id: 'shared', name: '识别多开', tasks: [{ type: 'UserDataUpdate', params: { operators: true, depot: true, interval: 'always' } }] } });
    const [runA, runB] = await Promise.all([
      r.startRun({ planId: 'shared', deviceId: deviceA.id, requestId: 'recognize-a' }),
      r.startRun({ planId: 'shared', deviceId: deviceB.id, requestId: 'recognize-b' }),
    ]);
    first.recognize(1, 'OperBox'); first.complete(1); second.complete(1); await r.tick(true);
    expect(r.store.get('run', runA.id).status).toBe('running'); expect(r.store.get('run', runB.id).status).toBe('failed');
    expect(r.snapshot().devices.find(device => device.id === deviceA.id)?.dataSync?.operatorsAt).toBeString();
    expect(r.snapshot().devices.find(device => device.id === deviceB.id)?.dataSync).toEqual({ operatorsAt: null, depotAt: null });
    second.recognize(1, 'OperBox'); await r.tick(true);
    const stale = await r.startRun({ planId: 'shared', deviceId: deviceB.id, requestId: 'stale-b' });
    second.recognize(1, 'OperBox'); second.complete(2); await r.tick(true);
    expect(r.store.get('run', stale.id).status).toBe('failed'); expect(r.store.get('run', runA.id).status).toBe('running');
    const retry = await r.startRun({ planId: 'shared', deviceId: deviceB.id, requestId: 'retry-b' });
    second.recognize(3, 'OperBox'); second.complete(3); await r.tick(true);
    first.recognize(1, 'OperBox'); first.recognize(2, 'Depot'); first.complete(2); await r.tick(true);
    expect(r.store.get('run', runA.id).status).toBe('completed'); expect(r.store.get('run', retry.id).status).toBe('running');
    second.recognize(3, 'OperBox'); second.recognize(4, 'Depot'); second.complete(4); await r.tick(true);
    expect(r.store.get('run', retry.id).status).toBe('completed');
    for (const device of r.snapshot().devices) { expect(device.dataSync?.operatorsAt).toBeString(); expect(device.dataSync?.depotAt).toBeString(); }
    const synced = r.store.events().filter(event => event.type === 'device.data_synced');
    expect(synced.filter(event => event.data.deviceId === deviceA.id).map(event => event.data.runId)).toEqual([runA.id, runA.id]);
    expect(synced.filter(event => event.data.deviceId === deviceB.id).map(event => event.data.runId)).toEqual([retry.id, retry.id]);
  });
  test('global updates wait for both idle boundaries and preserve only the device still running its plan', async () => {
    const { r, first, second, deviceA, deviceB } = await dual();
    await r.handle('plan.save', { plan: { id: 'shared', name: '热切换多开', tasks: [{ type: 'Award' }, { type: 'Mall' }] } });
    const [runA, runB] = await Promise.all([
      r.startRun({ planId: 'shared', deviceId: deviceA.id, requestId: 'boundary-a' }),
      r.startRun({ planId: 'shared', deviceId: deviceB.id, requestId: 'boundary-b' }),
    ]);
    const channel = r.updates.channel('resource'); r.store.put('update', 'resource', { ...channel, status: 'waiting_idle' });
    first.complete(1); await r.tick(true);
    expect(r.store.get('execution', runA.id).boundaryWaiting).toBe(true); expect(r.busy()).toBe(true);
    await expect(r.beforeSwitch()).rejects.toThrow('核心或异步操作仍在运行');
    second.complete(1, [9]); await r.tick(true); expect(r.busy()).toBe(true);
    second.safeIdle = true; second.events.push({ type: 'status', running: false, pendingAsync: [] }); await r.tick(true);
    expect(r.store.get('execution', runB.id).boundaryWaiting).toBe(true); expect(r.busy()).toBe(false);
    expect(first.submitted).toHaveLength(1); expect(second.submitted).toHaveLength(1);
    await stopAtIdle(r, first, runA.id); expect(r.store.get('run', runA.id).status).toBe('stopped'); expect(r.store.get('run', runB.id).status).toBe('running');
    r.store.put('update', 'resource', { ...channel, status: 'active' }); await r.tick(true);
    expect(first.submitted).toHaveLength(1); expect(second.submitted.map(task => task.type)).toEqual(['Award', 'Mall']);
    second.complete(2); await r.tick(true); expect(r.store.get('run', runB.id).status).toBe('completed'); expect(r.store.get('run', runA.id).status).toBe('stopped');
  });
});

test('shared and backend policies validate the new conventional settings consistently', () => {
  const valid = [
    ['UserDataUpdate', { operators: true, depot: false, interval: 'weekly' }],
    ['Mall', { visit_friends_once_a_day: true }],
    ['Recruit', { set_time: true, recruitment_time: { '3': 60, '4': 540 }, extra_tags_mode: 2 }],
    ['Infrast', { facility: ['Mfg', 'Trade', 'Power', 'Control', 'Reception', 'Office', 'Recycle', 'Dorm', 'Processing', 'Training', 'AssistantChange'], drones: 'Money' }],
  ] as const;
  const invalid = [
    ['UserDataUpdate', { operators: 'true' }], ['UserDataUpdate', { depot: null }], ['UserDataUpdate', { interval: 'monthly' }], ['UserDataUpdate', { interval: null }],
    ['Mall', { visit_friends_once_a_day: 1 }], ['Recruit', { recruitment_time: [] }], ['Recruit', { recruitment_time: { '2': 540 } }], ['Recruit', { recruitment_time: { '3': 59 } }], ['Recruit', { recruitment_time: { '4': 541 } }], ['Recruit', { recruitment_time: { '5': true } }],
    ['Infrast', { facility: ['Factory'] }], ['Infrast', { drones: 'invalid' }],
  ] as const;
  for (const validate of [validatePlan, validateSharedPlan]) {
    for (const [type, params] of valid) expect(() => validate(parsePlan({ name: '配置', tasks: [{ type, params }] }), parseSettings())).not.toThrow();
    for (const [type, params] of invalid) expect(() => validate(parsePlan({ name: '配置', tasks: [{ type, params }] }), parseSettings())).toThrow();
  }
  expect(() => nativeTask(parsePlan({ name: '配置', tasks: [{ type: 'UserDataUpdate' }] }).tasks[0])).toThrow();
});

test('task policy denies commands, unbounded consumables and malformed values', () => {
  for (const params of [{ shell: 'bad' }, { extension: { 'ſhell': 'bad' } }, { medicine: -1 }, { expiring_medicine: 1 }, { expedite: true }, { use_sanity_potion: true }, { times: true }, { server: 'bad' }, { future: '\uD800' }]) {
    expect(() => validatePlan(parsePlan({ name: '校验', tasks: [{ type: 'Fight', params }] }), parseSettings())).toThrow();
  }
  expect(nativeTask(parsePlan({ name: '默认', tasks: [{ type: 'Fight' }] }).tasks[0]).params).toMatchObject({ medicine: 0, stone: 0, report_to_penguin: false });
});

test('shared and backend consumption policy ignores legacy limits and rejects unaudited spending', () => {
  for (const validate of [validatePlan, validateSharedPlan]) {
    for (const oldLimit of [0, 100]) {
      const settings = parseSettings({ budgets: { medicine: oldLimit, originium: oldLimit, expedited: oldLimit } });
      const plan = parsePlan({ name: '旧版兼容', budgets: { medicine: 100 - oldLimit, originium: 100 - oldLimit }, tasks: [{ type: 'Fight', params: { medicine: 2, stone: 3 } }] });
      expect(() => validate(plan, settings)).not.toThrow();
      expect(taskConsumableLimits(plan)).toEqual({ medicine: 2, originium: 3, expedited: 0 });
    }
    for (const [type, params] of [
      ['Fight', { medicine: -1 }], ['Fight', { stone: 1.5 }], ['Fight', { medicine: null }], ['Fight', { stone: false }],
      ['Fight', { expiring_medicine: 1 }], ['Fight', { medicine_expire_days: 1 }],
      ['Copilot', { filename: 'synthetic.json', use_sanity_potion: true }],
      ['Recruit', { expedite: true, expedite_times: 1 }], ['Award', { medicine: 1 }], ['Award', { stone: 1 }],
    ] as const) expect(() => validate(parsePlan({ name: '受限消耗', tasks: [{ type, params }] }), parseSettings({ budgets: { medicine: 100, originium: 100, expedited: 100 } }))).toThrow();
  }
});

test('SQLite preserves rowid order, event sequence, exclusive data lease and backup image', () => {
  const root = temp(), s = new Store(root); s.put('plan', 'z', { id: 'z' }); s.put('plan', 'a', { id: 'a' }); s.put('plan', 'z', { id: 'z', changed: true });
  const event = s.event('first', '事件'); expect(() => new Store(root)).toThrow('其他本地服务'); s.close();
  const reopened = new Store(root); expect(reopened.all('plan').map(p => p.id)).toEqual(['z', 'a']); expect(reopened.event('second', '事件').id).toBe(event.id + 1); reopened.close();
  const backup = new Database(path.join(root, 'pre-typescript.sqlite3'), { readonly: true });
  expect(backup.query('SELECT id FROM objects WHERE kind=? ORDER BY rowid').all('plan')).toEqual([{ id: 'z' }, { id: 'a' }]); expect(backup.query('SELECT count(*) n FROM events').get()).toEqual({ n: 1 }); backup.close();
});

test('active-run lookup tracks device changes, completion, deletion and transaction rollback', () => {
  const store = new Store(temp());
  try {
    expect(store.hasRunningRun()).toBe(false);
    store.put('run', 'history', { deviceId: 'a', status: 'completed' });
    store.put('run', 'active', { deviceId: 'b', status: 'running' });
    expect(store.hasRunningRun()).toBe(true);
    expect(store.hasRunningRun('a')).toBe(false);
    expect(store.hasRunningRun('b')).toBe(true);
    expect(() => store.transaction(() => {
      store.put('run', 'active', { deviceId: 'b', status: 'stopped' });
      expect(store.hasRunningRun()).toBe(false);
      throw new Error('rollback');
    })).toThrow('rollback');
    expect(store.hasRunningRun('b')).toBe(true);
    store.put('run', 'active', { deviceId: 'a', status: 'running' });
    expect(store.hasRunningRun('b')).toBe(false);
    expect(store.hasRunningRun('a')).toBe(true);
    store.put('run', 'active', { deviceId: 'a', status: 'completed' });
    expect(store.hasRunningRun()).toBe(false);
    store.put('run', 'active', { deviceId: 'a', status: 'running' });
    store.delete('run', 'active');
    expect(store.hasRunningRun()).toBe(false);
  } finally { store.close(); }
});

test('WAL takeover backup is standalone, read-only accessible and preserves sparse rowids', () => {
  const root = temp(), source = new Database(path.join(root, 'maaverge.sqlite3'));
  let store: Store | undefined;
  try {
    source.exec('PRAGMA journal_mode=WAL; CREATE TABLE objects(kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id))');
    source.query('INSERT INTO objects(rowid,kind,id,value) VALUES(?,?,?,?)').run(7, 'plan', 'z', '{"id":"z"}');
    source.query('INSERT INTO objects(rowid,kind,id,value) VALUES(?,?,?,?)').run(2, 'plan', 'a', '{"id":"a"}');
    expect(existsSync(path.join(root, 'maaverge.sqlite3-wal'))).toBe(true);
    const original = source.query('SELECT rowid,* FROM objects ORDER BY rowid').all();
    store = new Store(root);
    const file = path.join(root, 'pre-typescript.sqlite3'), backup = new Database(file, { readonly: true });
    try {
      expect(backup.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' });
      expect(backup.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
      expect(backup.query('SELECT rowid,* FROM objects ORDER BY rowid').all()).toEqual(original);
      expect(existsSync(`${file}-wal`)).toBe(false);
      expect(existsSync(`${file}-shm`)).toBe(false);
    } finally { backup.close(); }
  } finally { store?.close(); source.close(); }
});

const repo = fileURLToPath(new URL('../../..', import.meta.url));
const python = path.join(repo, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
test.skipIf(!existsSync(python))('Python reference and Bun native service preserve plan/settings CRUD parity', async () => {
  const trace = [
    ['plan.save', { plan: { id: 'fixture', name: '保留未知参数', tasks: [{ type: 'Award', params: { future: { 中文: [1, true] } } }] } }],
    ['settings.save', { settings: { theme: 'dark', budgets: { medicine: 2 } } }], ['plan.delete', { id: 'fixture' }],
  ].map(([method, params], i) => ({ jsonrpc: '2.0', id: i + 1, method, params }));
  async function run(command: string[], root: string) {
    const child = spawn(command[0]!, command.slice(1), { cwd: repo, env: { ...process.env, MAAVERGE_MODE: 'native', MAAVERGE_DATA_DIR: root, PYTHONPATH: path.join(repo, 'services/runtime') }, windowsHide: true });
    let stdout = '', stderr = ''; child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.stdin.end(trace.map(value => JSON.stringify(value)).join('\n') + '\n');
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    expect(code, stderr).toBe(0); return stdout.trim().split(/\r?\n/).map(line => JSON.parse(line)).filter(item => 'id' in item).sort((a, b) => a.id - b.id);
  }
  const normalize = (value: any): any => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'createdAt' ? '<timestamp>' : normalize(v)])) : value;
  const py = await run([python, '-m', 'maaverge_runtime'], temp());
  const ts = await run([process.execPath, path.join(repo, 'services/backend/src/entry.ts')], temp());
  expect(normalize(ts)).toEqual(normalize(py));
});
