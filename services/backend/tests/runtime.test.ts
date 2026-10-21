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

const roots: string[] = [], runtimes: Runtime[] = [];
const temp = () => { const root = mkdtempSync(path.join(tmpdir(), 'maaverge-ts-test-')); roots.push(root); return root; };
class FakeWorker {
  events: any[] = []; connected = true; safeIdle = true; submitted: any[] = []; stopped = false; closed = false;
  async task(task: any) { this.submitted.push(task); this.safeIdle = false; return { taskId: this.submitted.length }; }
  async connect() { return { asyncId: 1 }; }
  async stop() { this.stopped = true; return { stopping: true }; }
  async close() { this.closed = true; }
  async waitConnected() { return this.connected && this.safeIdle; }
  complete(id: number, pending: number[] = []) { this.events.push({ type: 'callback', message: 10002, details: { taskid: id } }, { type: 'callback', message: 3, details: { taskid: id } }, { type: 'status', running: false, pendingAsync: pending }); this.safeIdle = !pending.length; }
}
function mock(root = temp()) { const runtime = new Runtime(root, 'mock', { leaseFactory: async () => new FakeWorker() }); runtimes.push(runtime); return runtime; }
async function native() {
  const worker = new FakeWorker(), runtime = new Runtime(temp(), 'native', { workerFactory: async () => worker, validator: async () => {}, adbExecutable: () => 'synthetic-adb' }); runtimes.push(runtime);
  runtime.store.put('active', 'combo', { core: { path: 'synthetic-core', version: 'v1' }, resource: { path: 'synthetic-resource', version: 'r1' } });
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' }); device.state = 'idle'; runtime.store.put('device', device.id, device);
  return { runtime, worker, device };
}
afterEach(async () => { for (const r of runtimes.splice(0)) await r.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('business parity', () => {
  test('initial snapshot, Agent proposal and explicit manual execution', async () => {
    const r = mock(), snapshot = r.snapshot(); expect(snapshot.plans.map(p => p.id)).toEqual(['daily', 'farm-1-7']);
    const proposal = await r.handle('agent.message', { message: '刷1-7材料3次' });
    expect(proposal.plan.tasks[0].params).toEqual({ stage: '1-7', times: 3 }); expect(r.snapshot().runs).toHaveLength(0);
    const saved = await r.handle('plan.save', { plan: proposal.plan }); expect(saved.id.startsWith('plan-')).toBe(true);
    const run = await r.handle('run.start', { planId: saved.id, deviceId: 'mock-device-1', requestId: 'once' });
    for (let n = 0; n < 10; n++) await r.tick(true);
    expect(r.store.get('run', run.id).status).toBe('completed'); expect(r.snapshot().devices[0].state).toBe('idle');
  });
  test('persistent request IDs and plan snapshot survive edits', async () => {
    const r = mock(), params = { planId: 'daily', deviceId: 'mock-device-1', requestId: 'persisted' };
    const run = await r.startRun(params); const original = r.store.get('run_plan', run.id);
    await r.handle('plan.save', { plan: { ...r.store.get('plan', 'daily'), name: '已修改' } });
    expect(r.store.get('run_plan', run.id)).toEqual(original);
    expect((await r.startRun(params)).id).toBe(run.id); await r.stopRun(run.id);
    await expect(r.startRun({ ...params, planId: 'farm-1-7' })).rejects.toMatchObject({ code: -32011 });
    await r.close(); runtimes.splice(runtimes.indexOf(r), 1);
    const reopened = mock(r.root); expect((await reopened.startRun(params)).id).toBe(run.id); expect(reopened.snapshot().plans[0].name).toBe('已修改');
  });
  test('stop preserves pending plan and disallows deleting active plans', async () => {
    const r = mock(); const run = await r.startRun({ planId: 'daily', deviceId: 'mock-device-1', requestId: 'stop' });
    await expect(r.handle('plan.delete', { id: 'daily' })).rejects.toMatchObject({ code: -32011 });
    await r.stopRun(run.id); expect(r.store.get('plan', 'daily').tasks).toHaveLength(5); expect(r.store.get('run', run.id).status).toBe('stopped');
  });
  test('settings and plan budget limits remain independent and default to zero', async () => {
    const r = mock(); await expect(r.handle('plan.save', { plan: { name: '消耗', tasks: [{ type: 'Fight', params: { medicine: 1 } }] } })).rejects.toMatchObject({ code: -32010 });
    await r.handle('settings.save', { settings: { budgets: { medicine: 2 } } });
    await expect(r.handle('plan.save', { plan: { name: '本表禁用', budgets: { medicine: 0 }, tasks: [{ type: 'Fight', params: { medicine: 1 } }] } })).rejects.toMatchObject({ code: -32010 });
    expect((await r.handle('plan.save', { plan: { name: '继承', tasks: [{ type: 'Fight', params: { medicine: 2 } }] } })).budgets).toBeNull();
  });
  test('crash recovery fails uncertain execution instead of replaying', () => {
    const root = temp(), store = new Store(root);
    store.put('meta', 'initialized', true); store.put('settings', 'main', parseSettings()); store.put('run', 'unknown', { id: 'unknown', planId: 'daily', deviceId: 'd', status: 'running', progress: 10, message: '', startedAt: 'old' }); store.close();
    const r = mock(root); expect(r.store.get('run', 'unknown').status).toBe('failed'); expect(r.store.events()[0].type).toBe('run.interrupted');
  });
  test('JSON-RPC errors and notification handling', async () => {
    const r = mock(); expect((await processRequest(r, [])).error.code).toBe(-32600);
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

test('task policy denies commands, unbounded consumables and malformed values', () => {
  for (const params of [{ shell: 'bad' }, { extension: { 'ſhell': 'bad' } }, { medicine: 1 }, { expiring_medicine: 1 }, { expedite: true }, { use_sanity_potion: true }, { times: true }, { server: 'bad' }, { future: '\uD800' }]) {
    expect(() => validatePlan(parsePlan({ name: '校验', tasks: [{ type: 'Fight', params }] }), parseSettings())).toThrow();
  }
  expect(nativeTask(parsePlan({ name: '默认', tasks: [{ type: 'Fight' }] }).tasks[0]).params).toMatchObject({ medicine: 0, stone: 0, report_to_penguin: false });
});

test('SQLite preserves rowid order, event sequence, exclusive data lease and backup image', () => {
  const root = temp(), s = new Store(root); s.put('plan', 'z', { id: 'z' }); s.put('plan', 'a', { id: 'a' }); s.put('plan', 'z', { id: 'z', changed: true });
  const event = s.event('first', '事件'); expect(() => new Store(root)).toThrow('其他本地服务'); s.close();
  const reopened = new Store(root); expect(reopened.all('plan').map(p => p.id)).toEqual(['z', 'a']); expect(reopened.event('second', '事件').id).toBe(event.id + 1); reopened.close();
  const backup = new Database(path.join(root, 'pre-typescript.sqlite3'), { readonly: true });
  expect(backup.query('SELECT id FROM objects WHERE kind=? ORDER BY rowid').all('plan')).toEqual([{ id: 'z' }, { id: 'a' }]); expect(backup.query('SELECT count(*) n FROM events').get()).toEqual({ n: 1 }); backup.close();
});

const repo = fileURLToPath(new URL('../../..', import.meta.url));
const python = path.join(repo, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
test.skipIf(!existsSync(python))('Python and Bun services have identical deterministic RPC results', async () => {
  const trace = [
    ['app.snapshot', {}], ['agent.message', { message: '刷1-7材料3次' }],
    ['plan.save', { plan: { id: 'fixture', name: '保留未知参数', tasks: [{ type: 'Award', params: { future: { 中文: [1, true] } } }] } }],
    ['settings.save', { settings: { theme: 'dark', budgets: { medicine: 2 } } }], ['plan.delete', { id: 'fixture' }], ['app.snapshot', {}],
  ].map(([method, params], i) => ({ jsonrpc: '2.0', id: i + 1, method, params }));
  async function run(command: string[], root: string) {
    const child = spawn(command[0]!, command.slice(1), { cwd: repo, env: { ...process.env, MAAVERGE_MODE: 'mock', MAAVERGE_DATA_DIR: root, PYTHONPATH: path.join(repo, 'services/runtime') }, windowsHide: true });
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
