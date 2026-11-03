import { afterEach, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AccountKnowledge } from '@backend/modules/knowledge/account-knowledge';
import { Store } from '@backend/infrastructure/storage/storage';
import { Runtime } from '@backend/app/runtime';
import { FakeFramework, frameworkFixtureOptions, seedFrameworkResource } from './framework-fixture';
import { recognitionKey } from '@backend/modules/recognition/recognition';
import {
  validateAccountKnowledgeSnapshot,
  validateAccountSnapshotListResult,
} from '@contracts/validators.js';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  stores: Store[] = [],
  runtimes: Runtime[] = [];
const root = () => {
  const value = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-account-knowledge-'));
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

/** Historical account records remain readable while unsupported native scans stay blocked. */
async function native() {
  const worker = new FakeFramework();
  const runtime = new Runtime(
    root(),
    frameworkFixtureOptions({ frameworkWorkerFactory: async () => worker }),
  );
  runtimes.push(runtime);
  seedFrameworkResource(runtime);
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  const get = () => runtime.handle('account.snapshot.get', { deviceId: device.id, kind: 'depot' });
  const list = () => runtime.handle('account.snapshot.list', { deviceId: device.id });
  return { worker, runtime, device, get, list };
}

test('unsupported scans and account switching preserve historical account observations without native effects', async () => {
  const { worker, runtime, device, get, list } = await native();
  const first = runtime.accounts.capture(scan(12, device.id), provenance)!;
  for (const task of [
    { type: 'Depot' },
    { type: 'OperBox' },
    { type: 'StartUp', params: { account_name: 'B' } },
  ]) {
    const plan = await runtime.handle('plan.save', {
      plan: { name: '保留待迁移配置', tasks: [task] },
    });
    await expect(
      runtime.startRun({ planId: plan.id, deviceId: device.id, requestId: plan.id }),
    ).rejects.toThrow('尚未迁移');
  }
  expect((await get()).id).toBe(first.id);
  expect((await list()).total).toBe(1);
  expect(runtime.store.all('run')).toEqual([]);
  expect(worker.submitted).toEqual([]);
  expect(worker.clicks).toEqual([]);
});

test('confirmed historical A to B to A scopes preserve history without reviving an old current snapshot', async () => {
  const { runtime, device, get, list } = await native();
  runtime.store.put('device_account', device.id, 'A');
  const first = runtime.accounts.capture(scan(12, device.id), provenance)!;
  expect(first.identity).toBe('configured-label');
  runtime.accounts.invalidate(device.id);
  runtime.store.put('device_account', device.id, 'B');
  expect(await get()).toBeNull();
  expect((await list()).total).toBe(0);
  expect(
    await runtime.handle('account.snapshot.get', {
      deviceId: device.id,
      kind: 'depot',
      snapshotId: first.id,
    }),
  ).toBeNull();
  runtime.accounts.invalidate(device.id);
  runtime.store.put('device_account', device.id, 'A');
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
  ])
    await expect(runtime.handle('account.snapshot.get', params)).rejects.toMatchObject({
      code: -32602,
    });
  await expect(
    runtime.handle('account.snapshot.list', { deviceId: 'missing' }),
  ).rejects.toMatchObject({ code: -32004 });
});
