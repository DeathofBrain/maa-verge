import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AccountKnowledge } from '../src/account-knowledge';
import { Store } from '../src/storage';
import { Runtime } from '../src/runtime';
import { recognitionKey } from '../src/recognition';
import {
  validateAccountKnowledgeSnapshot,
  validateAccountSnapshotListResult,
} from '../../../packages/contracts/src/validators.js';

const roots: string[] = [],
  stores: Store[] = [],
  runtimes: Runtime[] = [];
const root = () => {
  const value = mkdtempSync(path.join(tmpdir(), 'maaverge-account-knowledge-'));
  roots.push(value);
  return value;
};
const scan = (quantity = 12, deviceId = 'synthetic-device') => ({
  deviceId,
  clientType: 'Official' as const,
  kind: 'depot' as const,
  collectedAt: '2026-10-25T00:00:00Z',
  runId: 'synthetic-run',
  items: [{ id: '30012', name: '30012', quantity }],
  operators: [],
});
const provenance = {
  source: 'maacore-recognition' as const,
  coreVersion: 'v1',
  resourceVersion: 'resource-1',
  taskIndex: 0,
};
function fixture() {
  const store = new Store(root());
  stores.push(store);
  return { store, accounts: new AccountKnowledge(store) };
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const store of stores.splice(0)) store.close();
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
});

test('snapshots preserve observations, unknown fields, component provenance, and idempotent history', () => {
  const { store, accounts } = fixture(),
    result = scan();
  const snapshot = store.transaction(() => accounts.capture(result, provenance))!;
  expect(validateAccountKnowledgeSnapshot(snapshot)).toBe(true);
  expect(snapshot).toMatchObject({
    coverage: 'partial',
    identity: 'device-only',
    source: 'maacore-recognition',
    coreVersion: 'v1',
    resourceVersion: 'resource-1',
  });
  expect(snapshot.unknownFields).toContain('unseenItems');
  accounts.capture(result, provenance);
  expect(accounts.list(result.deviceId, result.clientType).total).toBe(1);
  store.put('inventory', recognitionKey(result.deviceId, result.clientType, 'depot'), {
    collectedAt: result.collectedAt,
    items: [{ id: '30012', quantity: 999 }],
  });
  expect(accounts.get(result.deviceId, result.clientType, 'depot')?.items[0].quantity).toBe(12);
  expect(accounts.get('other-device', result.clientType, 'depot', snapshot.id)).toBeNull();
  expect(accounts.get(result.deviceId, 'YoStarJP', 'depot', snapshot.id)).toBeNull();
  store.put('device_account', result.deviceId, 'different-label');
  expect(accounts.get(result.deviceId, result.clientType, 'depot', snapshot.id)).toBeNull();
});

test('legacy recognition imports retain unknown provenance and normalize negative or unowned progression', () => {
  const { store, accounts } = fixture(),
    result = scan();
  store.put('recognition', recognitionKey(result.deviceId, result.clientType, result.kind), result);
  store.put('active', 'combo', {
    core: { version: 'new-core' },
    resource: { version: 'new-resource' },
  });
  expect(accounts.get(result.deviceId, result.clientType, 'depot')).toMatchObject({
    source: 'legacy-cache',
    coreVersion: null,
    resourceVersion: null,
    taskIndex: null,
  });
  const operators = {
    ...result,
    kind: 'operators' as const,
    items: [],
    operators: [
      {
        id: 'char_known',
        name: '合成干员',
        own: true,
        elite: 2,
        level: 60,
        potential: -1,
        rarity: 6,
      },
      {
        id: 'char_unknown',
        name: '未持有',
        own: false,
        elite: -1,
        level: -1,
        potential: -1,
        rarity: 4,
      },
    ],
  };
  const snapshot = accounts.capture(operators, provenance)!;
  expect(snapshot.operators[0]).toMatchObject({ elite: 2, level: 60, potential: null });
  expect(snapshot.operators[1]).toMatchObject({
    own: false,
    elite: null,
    level: null,
    potential: null,
    rarity: 4,
  });
  expect(snapshot.unknownFields).toContain('masteries');
  expect(snapshot.unknownFields).toContain('modules');
});

test('bounded history pages contain summaries only and survive reopening the leased store', () => {
  const { store, accounts } = fixture(),
    directory = store.root;
  for (let i = 0; i < 25; i++) accounts.capture({ ...scan(i + 1), runId: 'run-' + i }, provenance);
  expect(store.all('account_snapshot')).toHaveLength(20);
  const first = accounts.list('synthetic-device', 'Official', undefined, 0, 3),
    next = accounts.list('synthetic-device', 'Official', undefined, 3, 3);
  expect(validateAccountSnapshotListResult(first)).toBe(true);
  expect(first.total).toBe(20);
  expect(new Set([...first.snapshots, ...next.snapshots].map((item) => item.id)).size).toBe(6);
  expect(first.snapshots.every((item) => !('items' in item) && !('operators' in item))).toBe(true);
  const id = first.latest.depot!;
  store.close();
  stores.splice(stores.indexOf(store), 1);
  const restarted = new Store(directory);
  stores.push(restarted);
  expect(
    new AccountKnowledge(restarted).get('synthetic-device', 'Official', 'depot', id)?.items[0]
      .quantity,
  ).toBe(25);
});

test('corrupt or mismatched summaries cannot poison lists or delete a different device snapshot', () => {
  const { store, accounts } = fixture();
  const first = accounts.capture(scan(), provenance)!,
    other = accounts.capture(scan(9, 'other-device'), provenance)!;
  store.put('account_snapshot_summary', 'broken', { ...first, id: other.id, recordCount: 'bad' });
  store.put('account_snapshot_summary', 'cross-device', {
    ...first,
    id: other.id,
    deviceId: 'other-device',
  });
  const list = accounts.list('synthetic-device', 'Official');
  expect(validateAccountSnapshotListResult(list)).toBe(true);
  expect(list.total).toBe(1);
  for (let i = 0; i < 21; i++)
    accounts.capture({ ...scan(i), runId: 'retention-' + i }, provenance);
  expect(accounts.get('other-device', 'Official', 'depot', other.id)?.items[0].quantity).toBe(9);
});

test('valid snapshots stored under a different key or account scope cannot escape through legacy fallback', () => {
  const { store, accounts } = fixture(),
    result = scan();
  const first = accounts.capture(result, provenance)!,
    other = accounts.capture(scan(9, 'other-device'), provenance)!;
  store.put('recognition', recognitionKey(result.deviceId, result.clientType, result.kind), result);
  for (const damaged of [
    { ...first, id: other.id },
    { ...first, accountId: other.accountId },
    { ...first, deviceId: other.deviceId },
    { ...first, clientType: 'YoStarJP' },
    { ...first, kind: 'operators', items: [], operators: [], recordCount: 0 },
  ]) {
    expect(validateAccountKnowledgeSnapshot(damaged)).toBe(true);
    store.put('account_snapshot', first.id, damaged);
    expect(accounts.get(result.deviceId, result.clientType, result.kind, first.id)).toBeNull();
    const restored = accounts.get(result.deviceId, result.clientType, result.kind)!;
    expect(restored).toMatchObject({
      id: first.id,
      accountId: first.accountId,
      deviceId: first.deviceId,
      clientType: first.clientType,
      kind: first.kind,
    });
    expect(restored.items[0].quantity).toBe(12);
    expect(store.get('account_snapshot', first.id)).toEqual(restored);
  }
});

class Worker {
  connected = true;
  safeIdle = true;
  events: any[] = [];
  count = 0;
  async connect() {
    return { asyncId: 1 };
  }
  async waitConnected() {
    return this.connected && this.safeIdle;
  }
  async task() {
    this.safeIdle = false;
    return { taskId: ++this.count };
  }
  async stop() {
    return { stopping: true };
  }
  async close() {}
  result(quantity = 12) {
    this.events.push({
      type: 'callback',
      message: 20003,
      details: {
        taskid: this.count,
        taskchain: 'Depot',
        what: 'DepotInfo',
        details: { done: true, data: JSON.stringify({ '30012': quantity }) },
      },
    });
  }
  complete(success = true, pending = false) {
    this.events.push(
      { type: 'callback', message: success ? 10002 : 10000, details: { taskid: this.count } },
      { type: 'callback', message: 3, details: { taskid: this.count } },
    );
    this.idle(pending);
  }
  idle(pending = false) {
    this.safeIdle = !pending;
    this.events.push({ type: 'status', running: false, pendingAsync: pending ? [8] : [] });
  }
}
async function native() {
  const worker = new Worker(),
    runtime = new Runtime(root(), {
      workerFactory: async () => worker,
      validator: async () => {},
      adbExecutable: () => 'synthetic-adb',
      calendar: { fetcher: null },
    });
  runtimes.push(runtime);
  runtime.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource', version: 'resource-1' },
  });
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  device.state = 'idle';
  runtime.store.put('device', device.id, device);
  let serial = 0;
  const start = async (type = 'Depot', params = {}) => {
    const id = 'account-test-' + ++serial;
    await runtime.handle('plan.save', {
      plan: { id, name: '合成任务', tasks: [{ type, params }] },
    });
    return runtime.startRun({ planId: id, deviceId: device.id, requestId: id });
  };
  const get = () => runtime.handle('account.snapshot.get', { deviceId: device.id, kind: 'depot' });
  const list = () => runtime.handle('account.snapshot.list', { deviceId: device.id });
  return { worker, runtime, device, start, get, list };
}

test('runtime commits account snapshots only at successful idle boundaries and preserves them on failure or stop', async () => {
  const { worker, runtime, start, get, list } = await native();
  await start();
  worker.result();
  worker.complete(true, true);
  await runtime.tick(true);
  expect(await get()).toBeNull();
  expect((await list()).total).toBe(0);
  worker.idle();
  await runtime.tick(true);
  const first = await get();
  expect(first).toMatchObject({
    source: 'maacore-recognition',
    coreVersion: 'v1',
    resourceVersion: 'resource-1',
    taskIndex: 0,
  });
  expect((await list()).total).toBe(1);
  await start();
  worker.result(99);
  worker.complete(false);
  await runtime.tick(true);
  expect((await get()).id).toBe(first.id);
  expect((await list()).total).toBe(1);
  const stopped = await start();
  await runtime.stopRun(stopped.id);
  worker.result(999);
  worker.complete();
  await runtime.tick(true);
  expect((await get()).id).toBe(first.id);
  expect((await list()).total).toBe(1);
  runtime.store.put('active', 'combo', {
    core: { version: 'v2' },
    resource: { version: 'resource-2' },
  });
  expect((await get()).resourceVersion).toBe('resource-1');
});

test('confirmed A to B to A switches preserve history without reviving an old current snapshot', async () => {
  const { worker, runtime, device, start, get, list } = await native();
  runtime.store.put('device_account', device.id, 'A');
  await start();
  worker.result();
  worker.complete();
  await runtime.tick(true);
  const first = await get();
  expect(first.identity).toBe('configured-label');
  await start('StartUp', { account_name: 'B' });
  worker.complete();
  await runtime.tick(true);
  expect(await get()).toBeNull();
  expect((await list()).total).toBe(0);
  await expect(
    runtime.handle('account.snapshot.get', {
      deviceId: device.id,
      kind: 'depot',
      snapshotId: first.id,
    }),
  ).resolves.toBeNull();
  await start('StartUp', { account_name: 'A' });
  worker.complete();
  await runtime.tick(true);
  expect(await get()).toBeNull();
  const history = await list();
  expect(history.total).toBe(1);
  expect(history.latest.depot).toBeNull();
  expect(
    (
      await runtime.handle('account.snapshot.get', {
        deviceId: device.id,
        kind: 'depot',
        snapshotId: first.id,
      })
    ).id,
  ).toBe(first.id);
  for (const params of [
    { deviceId: device.id, kind: 'depot', path: 'private' },
    { deviceId: device.id, kind: 'depot', snapshotId: '../private' },
  ]) {
    await expect(runtime.handle('account.snapshot.get', params)).rejects.toMatchObject({
      code: -32602,
    });
  }
  await expect(
    runtime.handle('account.snapshot.list', { deviceId: 'missing' }),
  ).rejects.toMatchObject({ code: -32004 });
});
