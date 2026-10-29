import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/runtime';
import { defaultConnection, parseSettings } from '../src/models';
import { emptyEmulatorInventory } from '../src/windows-emulators';

const runtimes: Runtime[] = [];
const roots: string[] = [];
class FakeWorker {
  events: any[] = [];
  connected = true;
  safeIdle = true;
  closed = false;
  async connect() {
    return { asyncId: 1 };
  }
  async task() {
    return { taskId: 1 };
  }
  async stop() {
    return { stopping: true };
  }
  async waitConnected() {
    return true;
  }
  async close() {
    this.closed = true;
  }
}

function fixture(root = mkdtempSync(path.join(tmpdir(), 'maaverge-device-deletion-'))) {
  roots.push(root);
  const notifications: any[] = [];
  const workers: FakeWorker[] = [];
  const runtime = new Runtime(root, {
    workerFactory: async () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    adbExecutable: () => 'synthetic-adb',
    discoverDevices: async () => ({
      devices: [{ address: '127.0.0.1:5555', name: '合成设备', adbState: 'device' }],
      diagnostics: [],
      inventory: emptyEmulatorInventory(),
    }),
    notify: (message) => notifications.push(message),
    calendar: { fetcher: null },
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
  return { runtime, notifications, workers };
}

function offline(runtime: Runtime, id: string, address = '127.0.0.1:5555') {
  const device = {
    id,
    name: id,
    address,
    state: 'offline',
    coreVersion: null,
    resourceVersion: null,
  };
  runtime.store.put('device', id, device);
  return device;
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of new Set(roots.splice(0))) rmSync(root, { recursive: true, force: true });
});

test('batch deletion persists and preserves instance configuration, bindings and execution evidence', async () => {
  const { runtime, notifications } = fixture();
  const first = offline(runtime, 'first');
  offline(runtime, 'second', '127.0.0.1:5557');
  const settings = parseSettings({
    ...runtime.snapshot().settings,
    deviceProfiles: [
      {
        id: 'instance',
        name: '保留实例',
        address: first.address,
        connection: defaultConnection(),
        capture: { method: 'adb' },
      },
    ],
  });
  runtime.store.put('settings', 'main', settings);
  const plan = await runtime.handle('plan.save', {
    plan: { id: 'bound-plan', name: '保留绑定', deviceId: first.id, tasks: [{ type: 'Award' }] },
  });
  const evidence = [
    ['run', 'finished-run', { id: 'finished-run', deviceId: first.id, status: 'completed' }],
    ['tool_job', 'finished-tool', { id: 'finished-tool', deviceId: first.id, status: 'completed' }],
    ['recognition', 'snapshot', { deviceId: first.id, result: '保留识别记录' }],
    ['account_snapshot', 'snapshot', { deviceId: first.id, result: '保留账号记录' }],
    ['device_client', first.id, 'Official'],
    ['device_account', first.id, '保留账号'],
    ['schedule', 'daily', { id: 'daily', planId: plan.id, deviceId: first.id }],
  ] as const;
  for (const [kind, id, value] of evidence) runtime.store.put(kind, id, value);
  const oldEvent = runtime.store.event('run.completed', '保留日志', { deviceId: first.id });

  expect(await runtime.handle('device.delete', { deviceIds: ['first', 'second'] })).toEqual({
    deletedDeviceIds: ['first', 'second'],
  });
  expect(runtime.store.all('device')).toEqual([]);
  expect(runtime.store.get('settings', 'main')).toEqual(settings);
  expect(runtime.store.get('plan', plan.id)).toEqual(plan);
  for (const [kind, id, value] of evidence) expect(runtime.store.get(kind, id)).toEqual(value);
  expect(runtime.store.events()).toContainEqual(oldEvent);
  expect(notifications).toContainEqual(
    expect.objectContaining({
      method: 'runtime.event',
      params: expect.objectContaining({
        type: 'device.deleted',
        data: { deletedDeviceIds: ['first', 'second'] },
      }),
    }),
  );
  // Remove the deliberately minimal evidence records before validating snapshots.
  runtime.store.delete('run', 'finished-run');
  runtime.store.delete('tool_job', 'finished-tool');
  expect(runtime.snapshot().devices).toEqual([]);
  await runtime.close();
  const reopened = fixture(runtime.root).runtime;
  expect(reopened.snapshot().devices).toEqual([]);
  expect(reopened.store.get('plan', plan.id).deviceId).toBe(first.id);
});

test('missing device IDs are idempotent and do not emit another deletion event', async () => {
  const { runtime, notifications } = fixture();
  offline(runtime, 'history');
  expect(await runtime.handle('device.delete', { deviceIds: ['missing', 'history'] })).toEqual({
    deletedDeviceIds: ['history'],
  });
  const count = notifications.length;
  expect(await runtime.handle('device.delete', { deviceIds: ['missing', 'history'] })).toEqual({
    deletedDeviceIds: [],
  });
  expect(notifications).toHaveLength(count);
});

test.each(['idle', 'running'])('a %s device rejects the entire batch', async (state) => {
  const { runtime } = fixture();
  offline(runtime, 'history');
  runtime.store.put('device', 'active', { ...offline(runtime, 'active'), state });
  await expect(
    runtime.handle('device.delete', { deviceIds: ['history', 'active'] }),
  ).rejects.toMatchObject({ code: -32011 });
  expect(runtime.store.all('device')).toHaveLength(2);
});

test.each(['run', 'tool_job', 'schedule_occurrence'])(
  'an offline device reserved by %s cannot be deleted',
  async (kind) => {
    const { runtime } = fixture();
    offline(runtime, 'history');
    offline(runtime, 'reserved');
    runtime.store.put(kind, 'active', {
      id: 'active',
      deviceId: 'reserved',
      status: kind === 'schedule_occurrence' ? 'starting' : 'running',
    });
    await expect(
      runtime.handle('device.delete', { deviceIds: ['history', 'reserved'] }),
    ).rejects.toMatchObject({ code: -32011 });
    expect(runtime.store.all('device')).toHaveLength(2);
    // These partial records only represent a reservation, not a runnable job.
    runtime.store.delete(kind, 'active');
  },
);

test('a connecting native worker cannot be deleted while its list state is offline', async () => {
  const { runtime, workers } = fixture();
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  expect(device.state).toBe('offline');
  await expect(runtime.handle('device.delete', { deviceIds: [device.id] })).rejects.toMatchObject({
    code: -32011,
  });
  expect(workers[0].closed).toBe(false);
  expect(runtime.store.get('device', device.id)).toEqual(device);
});

test('a connection reserved before worker creation protects canonical aliases', async () => {
  const { runtime } = fixture();
  offline(runtime, 'history', 'localhost:5555');
  let release!: (value: ReturnType<typeof emptyEmulatorInventory>) => void;
  const inventory = new Promise<ReturnType<typeof emptyEmulatorInventory>>((resolve) => {
    release = resolve;
  });
  (runtime as any).options.emulatorInventory = () => inventory;
  const connection = runtime.connectDevice({ address: '127.0.0.1:5555' });
  await expect(runtime.handle('device.delete', { deviceIds: ['history'] })).rejects.toMatchObject({
    code: -32011,
  });
  release(emptyEmulatorInventory());
  expect((await connection).id).toBe('history');
});

test.each([
  { message: 4, details: { what: 'Connect', details: { ret: false } } },
  { message: 2, details: { what: 'Disconnect' } },
  { message: 2, details: { what: 'ResolutionChanged' } },
])('native terminal callback %j releases history only after worker shutdown', async (callback) => {
  const { runtime, workers } = fixture();
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  const worker = workers[0];
  worker.safeIdle = false;
  let finishClosing!: () => void;
  const closing = new Promise<void>((resolve) => {
    finishClosing = resolve;
  });
  const close = spyOn(worker, 'close').mockImplementation(async () => {
    await closing;
    worker.closed = true;
  });
  worker.events.push(
    { type: 'callback', ...callback },
    { type: 'callback', message: 4, details: { what: 'Connect', details: { ret: true } } },
  );
  const polling = runtime.pollNativeWorkers();
  try {
    expect(runtime.store.get('device', device.id).state).toBe('offline');
    expect(runtime.workers.get(device.id)).toBe(worker);
    expect(worker.closed).toBe(false);
    await expect(runtime.handle('device.delete', { deviceIds: [device.id] })).rejects.toMatchObject(
      {
        code: -32011,
      },
    );
  } finally {
    finishClosing();
    await polling;
    close.mockRestore();
  }
  expect(worker.closed).toBe(true);
  expect(runtime.workers.has(device.id)).toBe(false);
  expect(runtime.store.get('device', device.id).state).toBe('offline');
  expect(runtime.store.get('device', device.id).connectionError).toBeString();
  expect(await runtime.handle('device.delete', { deviceIds: [device.id] })).toEqual({
    deletedDeviceIds: [device.id],
  });
  await runtime.pollNativeWorkers();
  expect(runtime.snapshot().devices).toEqual([]);
});

test('native disconnection fails active work before releasing its history for deletion', async () => {
  const { runtime, workers } = fixture();
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  runtime.store.put('device', device.id, { ...device, state: 'idle' });
  const plan = await runtime.handle('plan.save', {
    plan: { id: 'disconnect-plan', name: '断线记录', tasks: [{ type: 'Award' }] },
  });
  const run = await runtime.handle('run.start', {
    planId: plan.id,
    deviceId: device.id,
    requestId: 'native-disconnect-history',
  });
  workers[0].safeIdle = false;
  workers[0].events.push({ type: 'callback', message: 2, details: { what: 'Disconnect' } });
  await runtime.pollNativeWorkers();
  expect(runtime.store.get('run', run.id).status).toBe('failed');
  expect(runtime.workers.has(device.id)).toBe(false);
  await runtime.handle('device.delete', { deviceIds: [device.id] });
  expect(runtime.store.get('run', run.id).status).toBe('failed');
  expect(runtime.store.get('plan', plan.id)).toEqual(plan);
});

test('transaction failure restores every device in a batch', async () => {
  const { runtime, notifications } = fixture();
  offline(runtime, 'first');
  offline(runtime, 'second', '127.0.0.1:5557');
  const remove = runtime.store.delete.bind(runtime.store);
  const deletion = spyOn(runtime.store, 'delete').mockImplementation((kind, id) => {
    if (kind === 'device' && id === 'second') throw new Error('synthetic write failure');
    remove(kind, id);
  });
  await expect(runtime.handle('device.delete', { deviceIds: ['first', 'second'] })).rejects.toThrow(
    'synthetic write failure',
  );
  deletion.mockRestore();
  expect(runtime.store.all('device').map((device) => device.id)).toEqual(['first', 'second']);
  expect(notifications).toEqual([]);
});

test('deletion skips background rediscovery and explicit reconnect restores the same identity', async () => {
  const { runtime, workers } = fixture();
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  await runtime.disconnectDevice(device.id);
  runtime.store.put(
    'settings',
    'main',
    parseSettings({ ...runtime.snapshot().settings, autoConnect: true }),
  );
  await runtime.handle('device.delete', { deviceIds: [device.id] });
  expect((await runtime.autoConnectDevices(true)).devices).toEqual([]);
  expect(runtime.snapshot().devices).toEqual([]);
  expect(workers).toHaveLength(1);
  const reconnected = await runtime.connectDevice({ address: device.address });
  expect(reconnected.id).toBe(device.id);
  expect(runtime.snapshot().devices.map((item) => item.id)).toEqual([device.id]);
  expect(workers).toHaveLength(2);
});

test.each([
  {},
  { deviceIds: [] },
  { deviceIds: [''] },
  { deviceIds: ['history', 'history'] },
  { deviceIds: [123] },
  { deviceIds: ['history'], deleteProfiles: true },
])('invalid deletion requests preserve the historical device: %j', async (params) => {
  const { runtime } = fixture();
  offline(runtime, 'history');
  await expect(runtime.handle('device.delete', params)).rejects.toMatchObject({ code: -32602 });
  expect(runtime.store.get('device', 'history')).toBeDefined();
});
