import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Device } from '@contracts/types';
import type { AdbDevice } from '@backend/infrastructure/native/adb';
import { defaultConnection, parseSettings } from '@backend/modules/settings/models';
import { Runtime } from '@backend/app/runtime';
import {
  emptyEmulatorInventory,
  type EmulatorInventory,
} from '@backend/infrastructure/native/windows-emulators';

type Options = NonNullable<ConstructorParameters<typeof Runtime>[1]>;
type Observer = {
  onDevices: (devices: AdbDevice[]) => void;
  onClose: () => void;
  closed: boolean;
};

class FakeWorker {
  events: any[] = [];
  connected = false;
  safeIdle = true;
  closed = false;
  submitted: any[] = [];
  private resolveConnection!: (connected: boolean) => void;
  private connection = new Promise<boolean>((resolve) => {
    this.resolveConnection = resolve;
  });
  constructor(private result: boolean | null = true) {}
  async connect() {
    this.safeIdle = false;
    if (this.result !== null) queueMicrotask(() => this.complete(this.result!));
    return { asyncId: 1 };
  }
  complete(connected: boolean) {
    this.connected = connected;
    this.safeIdle = true;
    this.events.push({
      type: 'callback',
      message: 4,
      details: { what: 'Connect', details: { ret: connected } },
    });
    this.resolveConnection(connected);
  }
  async task(task: any) {
    this.submitted.push(task);
    this.safeIdle = false;
    return { taskId: this.submitted.length };
  }
  completeTask(taskId = 1) {
    this.events.push(
      { type: 'callback', message: 10002, details: { taskid: taskId } },
      { type: 'callback', message: 3, details: { taskid: taskId } },
      { type: 'status', running: false, pendingAsync: [] },
    );
    this.safeIdle = true;
  }
  async stop() {
    this.safeIdle = true;
    return { stopping: true };
  }
  async waitConnected(_timeout = 30_000, _cancelled?: () => boolean) {
    return this.connection;
  }
  async close() {
    this.closed = true;
    this.connected = false;
    this.resolveConnection(false);
  }
}

const runtimes: Runtime[] = [];
const releases: (() => void)[] = [];
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  releases.push(resolve);
  return { promise, resolve };
}
function fixture(options: Options = {}, result: boolean | null = true) {
  let time = 1_800_000_000_000;
  spyOn(Date, 'now').mockImplementation(() => time);
  const calls = {
    adb: 0,
    inventory: 0,
    probes: [] as string[],
    transports: [] as string[],
    configurations: [] as any[],
  };
  const observers: Observer[] = [];
  const workers: FakeWorker[] = [];
  const runtime = new Runtime(mkdtempSync(path.join(tmpdir(), 'maaverge-reconnection-')), {
    adbExecutable: () => {
      calls.adb++;
      return 'synthetic-adb';
    },
    emulatorInventory: async () => {
      calls.inventory++;
      return emptyEmulatorInventory();
    },
    discoverDevices: async () => {
      throw new Error('快速历史重连不得触发广域发现');
    },
    observeDeviceConnections: (onDevices, onClose) => {
      const observer: Observer = { onDevices, onClose, closed: false };
      observers.push(observer);
      return {
        async close() {
          observer.closed = true;
        },
      };
    },
    probeDeviceEndpoint: async (address) => {
      calls.probes.push(address);
      return false;
    },
    connectDeviceTransport: async (_adb, address) => {
      calls.transports.push(address);
    },
    workerFactory: async (configuration) => {
      calls.configurations.push(configuration);
      const worker = new FakeWorker(result);
      workers.push(worker);
      return worker;
    },
    calendar: { fetcher: null },
    ...options,
  });
  runtimes.push(runtime);
  runtime.store.put(
    'settings',
    'main',
    parseSettings({
      autoConnect: true,
      autoUpdateApp: false,
      autoUpdateCore: false,
      autoUpdateResource: false,
    }),
  );
  runtime.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource', version: 'r1' },
  });
  // Keep these tests independent of the retained 30-second broad discovery.
  (runtime as any).nextAutoConnect = Infinity;
  return {
    runtime,
    calls,
    observers,
    workers,
    advance(milliseconds: number) {
      time += milliseconds;
    },
  };
}
function history(runtime: Runtime, id = 'history', address = '127.0.0.1:5555'): Device {
  const device: Device = {
    id,
    name: '历史模拟器',
    address,
    state: 'offline',
    coreVersion: null,
    resourceVersion: null,
  };
  runtime.store.put('device', id, device);
  return device;
}
function profile(id: string, address: string) {
  return {
    id,
    name: '保存实例',
    address,
    connection: { ...defaultConnection(), address },
    capture: { method: 'adb' as const, emulatorPath: '', instanceIndex: 0 },
  };
}
const ready = (address = '127.0.0.1:5555'): AdbDevice => ({
  address,
  name: '合成模拟器',
  adbState: 'device',
});
async function settle(runtime: Runtime) {
  for (let index = 0; index < 48; index++) {
    await Promise.resolve();
    if (index % 8 === 7) await runtime.pollNativeWorkers();
  }
}
async function cycle(runtime: Runtime) {
  await runtime.tick(true);
  await runtime.automaticConnections();
  await settle(runtime);
}
async function startAward(runtime: Runtime, deviceId: string, requestId: string) {
  await runtime.handle('plan.save', {
    plan: { id: requestId, name: '合成连接回归', tasks: [{ type: 'Award' }] },
  });
  return runtime.handle('run.start', { planId: requestId, deviceId, requestId });
}
function latestObserver(observers: Observer[]) {
  return observers.filter((observer) => !observer.closed).at(-1)!;
}

afterEach(async () => {
  for (const release of releases.splice(0)) release();
  for (const runtime of runtimes.splice(0)) {
    await runtime.close();
    rmSync(runtime.root, { recursive: true, force: true });
  }
  mock.restore();
});

test('automatic connection keeps one ADB subscription without an online worker', async () => {
  const { runtime, observers, calls } = fixture();
  await cycle(runtime);
  expect(observers).toHaveLength(1);
  expect(observers[0]!.closed).toBe(false);
  expect(calls.adb).toBe(0);
  expect(calls.inventory).toBe(0);
  expect(calls.configurations).toHaveLength(0);
  runtime.store.put('settings', 'main', { ...runtime.snapshot().settings, autoConnect: false });
  await cycle(runtime);
  expect(observers[0]!.closed).toBe(true);
});

test('closed historical ports are checked without ADB commands, workers or instance queries', async () => {
  const { runtime, calls, advance } = fixture();
  history(runtime);
  for (let index = 0; index < 5; index++) {
    await cycle(runtime);
    advance(2000);
  }
  expect(calls.probes).toEqual(Array(5).fill('127.0.0.1:5555'));
  expect(calls.adb).toBe(0);
  expect(calls.transports).toHaveLength(0);
  expect(calls.inventory).toBe(0);
  expect(calls.configurations).toHaveLength(0);
});

test('an old positive endpoint result cannot keep retrying transport after its port closes', async () => {
  let listening = true;
  let probes = 0;
  let transports = 0;
  const { runtime, calls, advance } = fixture({
    probeDeviceEndpoint: async () => {
      probes++;
      return listening;
    },
    connectDeviceTransport: async () => {
      transports++;
      throw new Error('synthetic transport registration failed');
    },
  });
  history(runtime);
  await cycle(runtime);
  expect(transports).toBe(1);
  listening = false;
  for (const elapsed of [1999, 1, 4000, 8000, 16000, 30000, 30000]) {
    advance(elapsed);
    await cycle(runtime);
  }
  expect(probes).toBeGreaterThan(4);
  expect(transports).toBe(1);
  expect(calls.configurations).toHaveLength(0);
});

test('a newly listening historical target registers its transport and reuses the saved device ID', async () => {
  const registered: string[] = [];
  const { runtime, calls, advance } = fixture({
    probeDeviceEndpoint: async () => true,
    connectDeviceTransport: async (_adb, address) => {
      registered.push(address);
    },
  });
  const device = history(runtime, 'preserved-device');
  await cycle(runtime);
  expect(registered).toEqual([device.address]);
  expect(calls.configurations).toHaveLength(1);
  expect(calls.configurations[0]!.lockTimeoutMs).toBe(0);
  expect(runtime.snapshot().devices).toContainEqual(
    expect.objectContaining({ id: device.id, state: 'idle' }),
  );
  for (let index = 0; index < 3; index++) {
    advance(2000);
    await cycle(runtime);
  }
  expect(registered).toHaveLength(1);
  expect(calls.configurations).toHaveLength(1);
});

test('ADB availability triggers a historical connection without TCP probing or transport registration', async () => {
  const { runtime, calls, observers } = fixture();
  history(runtime);
  await runtime.tick(true);
  latestObserver(observers).onDevices([ready()]);
  await cycle(runtime);
  expect(calls.configurations).toHaveLength(1);
  expect(calls.probes).toHaveLength(0);
  expect(calls.transports).toHaveLength(0);
  expect(runtime.snapshot().devices[0]!.state).toBe('idle');
});

test('asynchronous connection failures back off even when repeated snapshots report the target ready', async () => {
  const { runtime, workers, calls, observers, advance } = fixture({}, null);
  history(runtime);
  await runtime.tick(true);
  latestObserver(observers).onDevices([ready()]);
  await cycle(runtime);
  expect(calls.configurations).toHaveLength(1);
  expect(runtime.snapshot().devices[0]!.state).toBe('offline');

  for (const [index, delay] of [2000, 4000, 8000, 16000, 30000, 30000].entries()) {
    workers[index]!.complete(false);
    await settle(runtime);
    latestObserver(observers).onDevices([ready()]);
    advance(delay - 1);
    await cycle(runtime);
    expect(calls.configurations).toHaveLength(index + 1);
    advance(1);
    await cycle(runtime);
    expect(calls.configurations).toHaveLength(index + 2);
    expect(workers[index]!.closed).toBe(true);
  }
  workers.at(-1)!.complete(true);
  await settle(runtime);
});

test('reopening an ADB subscription with the same ready snapshot preserves failure backoff', async () => {
  const { runtime, workers, calls, observers, advance } = fixture({}, null);
  history(runtime);
  await runtime.tick(true);
  latestObserver(observers).onDevices([ready()]);
  await cycle(runtime);
  for (const [index, delay] of [2000, 4000].entries()) {
    workers[index]!.complete(false);
    await settle(runtime);
    advance(delay);
    await cycle(runtime);
  }
  expect(calls.configurations).toHaveLength(3);
  workers[2]!.complete(false);
  await settle(runtime);
  const previous = latestObserver(observers);
  previous.onClose();
  await settle(runtime);
  advance(5000);
  await cycle(runtime);
  const replacement = latestObserver(observers);
  expect(replacement).not.toBe(previous);
  replacement.onDevices([ready()]);
  await cycle(runtime);
  expect(calls.configurations).toHaveLength(3);
  advance(2999);
  await cycle(runtime);
  expect(calls.configurations).toHaveLength(3);
  advance(1);
  await cycle(runtime);
  expect(calls.configurations).toHaveLength(4);
  workers[3]!.complete(true);
  await settle(runtime);
});

test('manual disconnect suppresses later ADB and TCP readiness notifications', async () => {
  const { runtime, calls, observers, advance } = fixture({ probeDeviceEndpoint: async () => true });
  const device = history(runtime);
  await cycle(runtime);
  expect(calls.configurations).toHaveLength(1);
  await runtime.disconnectDevice(device.id);
  await runtime.tick(true);
  latestObserver(observers).onDevices([ready()]);
  advance(2000);
  await cycle(runtime);
  expect(calls.configurations).toHaveLength(1);
  expect(runtime.snapshot().devices[0]!.state).toBe('offline');
});

test('manual disconnect remains suppressed across a process identity change and proven address aliases', async () => {
  let pid = 101;
  const primary = '127.0.0.1:16384';
  const alias = '127.0.0.1:7555';
  const inventory = (): EmulatorInventory => ({
    instances: [
      {
        address: primary,
        name: '合成实例',
        index: 0,
        pid,
        emulatorPath: 'synthetic-emulator',
        aliases: [alias, '127.0.0.1:5555'],
      },
    ],
    identities: Object.fromEntries(
      [primary, alias, '127.0.0.1:5555'].map((address) => [address, `synthetic-pid:${pid}`]),
    ),
    diagnostics: [],
  });
  const { runtime, calls, observers, advance } = fixture({
    probeDeviceEndpoint: async () => true,
    emulatorInventory: async () => inventory(),
    discoverDevices: async () => ({
      devices: [ready(primary), ready(alias)],
      diagnostics: [],
      inventory: inventory(),
    }),
  });
  runtime.store.put(
    'settings',
    'main',
    parseSettings({
      ...runtime.snapshot().settings,
      deviceProfiles: [profile('saved-instance', primary)],
    }),
  );
  const device = await runtime.connectDevice({ address: alias });
  await settle(runtime);
  await runtime.disconnectDevice(device.id);

  // Simulate a restarted emulator whose stable endpoints now belong to a new PID.
  pid = 202;
  await runtime.handle('device.discover');
  await runtime.tick(true);
  latestObserver(observers).onDevices([ready(primary), ready(alias)]);
  advance(2000);
  await cycle(runtime);
  expect(calls.configurations).toHaveLength(1);
  expect(calls.transports).toHaveLength(0);
  expect(runtime.snapshot().devices[0]!.id).toBe(device.id);
  expect(runtime.snapshot().devices[0]!.state).toBe('offline');
});

test('a connected proven alias remains ready when ADB reports only its primary endpoint', async () => {
  const primary = '127.0.0.1:16384';
  const alias = '127.0.0.1:7555';
  const inventory: EmulatorInventory = {
    instances: [
      {
        address: primary,
        name: '合成实例',
        index: 0,
        emulatorPath: 'synthetic-emulator',
        aliases: [alias, '127.0.0.1:5555'],
      },
    ],
    identities: Object.fromEntries(
      [primary, alias, '127.0.0.1:5555'].map((address) => [address, 'synthetic-pid:101']),
    ),
    diagnostics: [],
  };
  const { runtime, calls, workers, observers, advance } = fixture({
    emulatorInventory: async () => inventory,
  });
  const device = await runtime.connectDevice({ address: alias });
  await settle(runtime);
  await runtime.tick(true);
  latestObserver(observers).onDevices([ready(primary)]);
  for (let index = 0; index < 3; index++) {
    advance(2000);
    await cycle(runtime);
  }
  expect(runtime.snapshot().devices).toContainEqual(
    expect.objectContaining({ id: device.id, address: alias, state: 'idle' }),
  );
  expect(workers[0]!.closed).toBe(false);
  expect(runtime.workers.get(device.id)).toBe(workers[0]);
  expect(calls.configurations).toHaveLength(1);
  expect(calls.transports).toHaveLength(0);
});

test('a device lease conflict fails fast and retries only after its longer cooldown', async () => {
  const configurations: any[] = [];
  const { runtime, observers, advance } = fixture({
    workerFactory: async (configuration) => {
      configurations.push(configuration);
      if (configurations.length === 1) throw new Error('device lock busy or unavailable');
      return new FakeWorker();
    },
  });
  history(runtime);
  await runtime.tick(true);
  latestObserver(observers).onDevices([ready()]);
  await cycle(runtime);
  expect(configurations).toHaveLength(1);
  expect(configurations[0]!.lockTimeoutMs).toBe(0);
  latestObserver(observers).onDevices([ready()]);
  advance(29_999);
  await cycle(runtime);
  expect(configurations).toHaveLength(1);
  advance(1);
  await cycle(runtime);
  expect(configurations).toHaveLength(2);
  expect(runtime.snapshot().devices[0]!.state).toBe('idle');
});

test('an unconfirmed native connection is closed and enters failure backoff', async () => {
  const workers: FakeWorker[] = [];
  const deadlines: number[] = [];
  const { runtime, advance } = fixture({
    probeDeviceEndpoint: async () => true,
    workerFactory: async () => {
      const worker = new FakeWorker(null);
      worker.waitConnected = async (timeout = 30_000) => {
        deadlines.push(timeout);
        return false;
      };
      workers.push(worker);
      return worker;
    },
  });
  history(runtime);
  await cycle(runtime);
  expect(deadlines).toEqual([30_000]);
  expect(workers[0]!.closed).toBe(true);
  expect(runtime.workers.size).toBe(0);
  expect(runtime.snapshot().devices[0]!.state).toBe('offline');
  expect(runtime.snapshot().devices[0]!.connectionError).toBeString();
  advance(1999);
  await cycle(runtime);
  expect(workers).toHaveLength(1);
  advance(1);
  await cycle(runtime);
  expect(workers).toHaveLength(2);
});

test('a late false connection wait preserves the connected worker and its running task', async () => {
  const waiting = deferred();
  const waitResult = deferred();
  const worker = new FakeWorker();
  worker.waitConnected = async () => {
    waiting.resolve();
    await waitResult.promise;
    return false;
  };
  const { runtime } = fixture({
    probeDeviceEndpoint: async () => true,
    workerFactory: async () => worker,
  });
  const device = history(runtime);
  await cycle(runtime);
  await waiting.promise;
  expect(runtime.store.get('device', device.id).state).toBe('idle');
  const run = await startAward(runtime, device.id, 'connection-wait-race');
  expect(worker.safeIdle).toBe(false);
  expect(runtime.store.get('device', device.id).state).toBe('running');

  waitResult.resolve();
  await settle(runtime);
  expect(worker.closed).toBe(false);
  expect(runtime.workers.get(device.id)).toBe(worker);
  expect(runtime.store.get('device', device.id).connectionError).toBeUndefined();
  expect(runtime.store.events().some((event) => event.type === 'device.failed')).toBe(false);
  expect(runtime.store.get('run', run.id).status).toBe('running');
  expect(worker.submitted).toHaveLength(1);

  worker.completeTask();
  await runtime.tick(true);
  expect(runtime.store.get('run', run.id).status).toBe('completed');
  expect(runtime.store.get('device', device.id).state).toBe('idle');
  expect(runtime.workers.get(device.id)).toBe(worker);
  expect(worker.closed).toBe(false);
});

test('a late alias transport failure cannot poison a manually connected running device', async () => {
  const manualEntered = deferred();
  const manualResult = deferred();
  const transportEntered = deferred();
  const transportResult = deferred();
  const primary = '127.0.0.1:5555';
  const alias = '127.0.0.1:5557';
  const worker = new FakeWorker();
  const configurations: any[] = [];
  const { runtime } = fixture({
    probeDeviceEndpoint: async (address) => address === alias,
    connectDeviceTransport: async (_adb, address) => {
      expect(address).toBe(alias);
      transportEntered.resolve();
      await transportResult.promise;
      throw new Error('late synthetic registration failure');
    },
    workerFactory: async (configuration) => {
      configurations.push(configuration);
      manualEntered.resolve();
      await manualResult.promise;
      return worker;
    },
  });
  history(runtime, 'alias-history', alias);
  runtime.store.put('device-alias', alias, primary);
  const manual = runtime.connectDevice({ address: primary });
  await manualEntered.promise;
  await cycle(runtime);
  await transportEntered.promise;
  expect(runtime.workers.size).toBe(0);

  manualResult.resolve();
  const device = await manual;
  await settle(runtime);
  const run = await startAward(runtime, device.id, 'alias-registration-race');
  expect(runtime.store.get('device', device.id).state).toBe('running');
  transportResult.resolve();
  await settle(runtime);
  expect(configurations).toHaveLength(1);
  expect(worker.closed).toBe(false);
  expect(runtime.workers.get(device.id)).toBe(worker);
  expect(runtime.store.get('device', device.id).state).toBe('running');
  expect(runtime.store.get('device', device.id).connectionError).toBeUndefined();
  expect(runtime.store.events().some((event) => event.type === 'device.failed')).toBe(false);
  expect(runtime.store.get('run', run.id).status).toBe('running');
  expect(worker.submitted).toHaveLength(1);

  worker.completeTask();
  await runtime.tick(true);
  expect(runtime.store.get('run', run.id).status).toBe('completed');
  expect(runtime.store.get('device', device.id).state).toBe('idle');
  expect(runtime.workers.get(device.id)).toBe(worker);
});

test('scheduled preparation cannot reset a device that became busy while connecting', async () => {
  const waiting = deferred();
  const waitResult = deferred();
  const worker = new FakeWorker(null);
  worker.waitConnected = async () => {
    waiting.resolve();
    await waitResult.promise;
    return true;
  };
  const { runtime } = fixture({ workerFactory: async () => worker });
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  const preparation = (runtime as any).prepareScheduledDevice(device.id).then(
    () => undefined,
    (error: unknown) => error,
  );
  await waiting.promise;
  worker.complete(true);
  await settle(runtime);
  const run = await startAward(runtime, device.id, 'scheduled-connection-race');
  waitResult.resolve();
  expect(await preparation).toMatchObject({ code: -32011 });

  expect(runtime.store.get('device', device.id).state).toBe('running');
  expect(runtime.store.get('run', run.id).status).toBe('running');
  expect(worker.submitted).toHaveLength(1);
  expect(runtime.workers.get(device.id)).toBe(worker);
  expect(worker.closed).toBe(false);
  worker.completeTask();
  await runtime.tick(true);
  expect(runtime.store.get('run', run.id).status).toBe('completed');
});

test.each(['initializingComponents', 'appUpdating', 'switching', 'appUpdatePreparation'])(
  'the %s gate pauses endpoint checks and native reconnection',
  async (gate) => {
    let probes = 0;
    const { runtime, calls } = fixture({
      probeDeviceEndpoint: async () => {
        probes++;
        return true;
      },
    });
    history(runtime);
    (runtime as any)[gate] = gate === 'appUpdatePreparation' ? Symbol('test-update') : true;
    try {
      await cycle(runtime);
      expect(probes).toBe(0);
      expect(calls.transports).toHaveLength(0);
      expect(calls.configurations).toHaveLength(0);
    } finally {
      (runtime as any)[gate] = gate === 'appUpdatePreparation' ? undefined : false;
    }
  },
);

test('deleting offline history suppresses its preserved instance profile for this session', async () => {
  const { runtime, calls, observers, advance } = fixture();
  const device = history(runtime);
  runtime.store.put(
    'settings',
    'main',
    parseSettings({
      ...runtime.snapshot().settings,
      deviceProfiles: [profile('preserved-profile', device.address)],
    }),
  );
  await cycle(runtime);
  expect(await runtime.handle('device.delete', { deviceIds: [device.id] })).toEqual({
    deletedDeviceIds: [device.id],
  });
  latestObserver(observers).onDevices([ready()]);
  advance(2000);
  await cycle(runtime);
  expect(runtime.snapshot().settings.deviceProfiles).toHaveLength(1);
  expect(runtime.snapshot().devices).toHaveLength(0);
  expect(calls.configurations).toHaveLength(0);
});

test('manual profiles restrict historical reconnect targets and USB devices remain manual', async () => {
  const { runtime, calls, observers } = fixture();
  history(runtime, 'outside-list', '127.0.0.1:5555');
  history(runtime, 'usb', 'synthetic-usb-serial');
  runtime.store.put(
    'settings',
    'main',
    parseSettings({
      ...runtime.snapshot().settings,
      deviceProfiles: [profile('selected', '127.0.0.1:5557')],
    }),
  );
  await runtime.tick(true);
  latestObserver(observers).onDevices([ready(), ready('synthetic-usb-serial')]);
  await cycle(runtime);
  expect(calls.probes).toEqual(['127.0.0.1:5557']);
  expect(calls.configurations).toHaveLength(0);
});

test('a saved USB serial keeps the existing native connection path without TCP registration', async () => {
  const { runtime, calls } = fixture();
  const serial = 'synthetic-saved-usb-serial';
  runtime.store.put(
    'settings',
    'main',
    parseSettings({
      ...runtime.snapshot().settings,
      deviceProfiles: [profile('saved-usb', serial)],
    }),
  );
  const result = await runtime.autoConnectDevices(true);
  await settle(runtime);
  expect(result.devices).toHaveLength(1);
  expect(calls.probes).toHaveLength(0);
  expect(calls.transports).toHaveLength(0);
  expect(calls.configurations).toHaveLength(1);
  expect(calls.configurations[0]!.address).toBe(serial);
  expect(runtime.snapshot().devices).toContainEqual(
    expect.objectContaining({ address: serial, state: 'idle', connectionProfileId: 'saved-usb' }),
  );
});

test('one busy device does not prevent a different historical device from reconnecting', async () => {
  const { runtime, workers, calls } = fixture({ probeDeviceEndpoint: async () => true });
  const first = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  await settle(runtime);
  workers[0]!.safeIdle = false;
  runtime.store.put('device', first.id, {
    ...runtime.store.get<Device>('device', first.id),
    state: 'running',
  });
  history(runtime, 'second', '127.0.0.1:5557');
  expect(runtime.busy()).toBe(true);
  await cycle(runtime);
  expect(calls.configurations).toHaveLength(2);
  expect(runtime.snapshot().devices).toContainEqual(
    expect.objectContaining({ id: 'second', state: 'idle' }),
  );
  expect(workers[0]!.closed).toBe(false);
});

test('disabling automatic connection invalidates a late endpoint result', async () => {
  const endpoint = deferred();
  const { runtime, calls } = fixture({
    probeDeviceEndpoint: async () => {
      await endpoint.promise;
      return true;
    },
  });
  history(runtime);
  const checking = runtime.automaticConnections();
  await Promise.resolve();
  await runtime.handle('settings.save', {
    settings: { ...runtime.snapshot().settings, autoConnect: false },
  });
  endpoint.resolve();
  await checking;
  await settle(runtime);
  expect(calls.transports).toHaveLength(0);
  expect(calls.configurations).toHaveLength(0);
});

test('deleting history during an endpoint check discards the late readiness result', async () => {
  const endpoint = deferred();
  const { runtime, calls } = fixture({
    probeDeviceEndpoint: async () => {
      await endpoint.promise;
      return true;
    },
  });
  const device = history(runtime);
  const checking = runtime.automaticConnections();
  await Promise.resolve();
  expect(await runtime.handle('device.delete', { deviceIds: [device.id] })).toEqual({
    deletedDeviceIds: [device.id],
  });
  endpoint.resolve();
  await checking;
  await settle(runtime);
  expect(calls.transports).toHaveLength(0);
  expect(calls.configurations).toHaveLength(0);
  expect(runtime.snapshot().devices).toHaveLength(0);
});

test('an in-flight transport registration reserves its historical device against deletion', async () => {
  const registration = deferred();
  let registering = false;
  const { runtime } = fixture({
    probeDeviceEndpoint: async () => true,
    connectDeviceTransport: async () => {
      registering = true;
      await registration.promise;
    },
  });
  const device = history(runtime);
  await cycle(runtime);
  expect(registering).toBe(true);
  await expect(runtime.handle('device.delete', { deviceIds: [device.id] })).rejects.toMatchObject({
    code: -32011,
  });
  registration.resolve();
  await settle(runtime);
  expect(runtime.snapshot().devices[0]!.id).toBe(device.id);
});

test('manual disconnect cancels an in-flight automatic transport registration', async () => {
  const registration = deferred();
  let registering = false;
  const { runtime, calls } = fixture({
    probeDeviceEndpoint: async () => true,
    connectDeviceTransport: async () => {
      registering = true;
      await registration.promise;
    },
  });
  const device = history(runtime);
  await cycle(runtime);
  expect(registering).toBe(true);
  await runtime.disconnectDevice(device.id);
  registration.resolve();
  await settle(runtime);
  expect(calls.configurations).toHaveLength(0);
  expect(runtime.snapshot().devices[0]!.state).toBe('offline');
});

test('removing a saved profile invalidates an in-flight transport registration', async () => {
  const registration = deferred();
  let registering = false;
  const { runtime, calls } = fixture({
    probeDeviceEndpoint: async () => true,
    connectDeviceTransport: async () => {
      registering = true;
      await registration.promise;
    },
  });
  runtime.store.put(
    'settings',
    'main',
    parseSettings({
      ...runtime.snapshot().settings,
      deviceProfiles: [profile('removed', '127.0.0.1:5555')],
    }),
  );
  await cycle(runtime);
  expect(registering).toBe(true);
  await runtime.handle('settings.save', {
    settings: { ...runtime.snapshot().settings, deviceProfiles: [] },
  });
  registration.resolve();
  await settle(runtime);
  expect(calls.configurations).toHaveLength(0);
  expect(runtime.snapshot().devices).toHaveLength(0);
});

test('shutdown cancels a late transport registration before the store closes', async () => {
  const registration = deferred();
  let registering = false;
  const { runtime, calls } = fixture({
    probeDeviceEndpoint: async () => true,
    connectDeviceTransport: async () => {
      registering = true;
      await registration.promise;
    },
  });
  history(runtime);
  await cycle(runtime);
  expect(registering).toBe(true);
  const closing = runtime.close();
  registration.resolve();
  await closing;
  expect(calls.configurations).toHaveLength(0);
});

test('a changed target waits for its cancelled registration to release the same device', async () => {
  const registration = deferred();
  let attempts = 0;
  const { runtime, calls, advance } = fixture({
    probeDeviceEndpoint: async () => true,
    connectDeviceTransport: async () => {
      if (++attempts === 1) await registration.promise;
    },
  });
  history(runtime);
  await cycle(runtime);
  await runtime.handle('settings.save', {
    settings: {
      ...runtime.snapshot().settings,
      connection: { ...defaultConnection(), adbLite: true },
    },
  });
  await cycle(runtime);
  expect(attempts).toBe(1);
  registration.resolve();
  await settle(runtime);
  expect(calls.configurations).toHaveLength(0);
  advance(2000);
  await cycle(runtime);
  expect(attempts).toBe(2);
  expect(calls.configurations).toHaveLength(1);
});

test('editing a different instance does not cancel a pending connection', async () => {
  const registration = deferred();
  let signal: AbortSignal | undefined;
  const { runtime, calls } = fixture({
    probeDeviceEndpoint: async (address) => address === '127.0.0.1:5555',
    connectDeviceTransport: async (_adb, _address, cancellation) => {
      signal = cancellation;
      await registration.promise;
    },
  });
  const first = profile('first', '127.0.0.1:5555');
  const second = profile('second', '127.0.0.1:5557');
  runtime.store.put(
    'settings',
    'main',
    parseSettings({
      ...runtime.snapshot().settings,
      deviceProfiles: [first, second],
    }),
  );
  await cycle(runtime);
  await runtime.handle('settings.save', {
    settings: {
      ...runtime.snapshot().settings,
      deviceProfiles: [first, { ...second, name: '已修改的其他实例' }],
    },
  });
  expect(signal?.aborted).toBe(false);
  registration.resolve();
  await settle(runtime);
  expect(calls.configurations).toHaveLength(1);
  expect(runtime.snapshot().devices[0]!.state).toBe('idle');
});

test('endpoint checks and background registrations respect their independent concurrency bounds', async () => {
  const endpoint = deferred();
  const registration = deferred();
  let probes = 0;
  let peakProbes = 0;
  let registrations = 0;
  let peakRegistrations = 0;
  let startedProbes = 0;
  const { runtime, calls } = fixture({
    probeDeviceEndpoint: async () => {
      startedProbes++;
      peakProbes = Math.max(peakProbes, ++probes);
      await endpoint.promise;
      probes--;
      return true;
    },
    connectDeviceTransport: async () => {
      peakRegistrations = Math.max(peakRegistrations, ++registrations);
      await registration.promise;
      registrations--;
    },
  });
  for (let index = 0; index < 7; index++)
    history(runtime, `target-${index}`, `127.0.0.1:${6001 + index}`);
  const checking = runtime.automaticConnections();
  for (let index = 0; index < 8; index++) await Promise.resolve();
  expect(startedProbes).toBe(4);
  endpoint.resolve();
  await checking;
  await settle(runtime);
  expect(peakProbes).toBe(4);
  expect(peakRegistrations).toBe(2);
  expect(calls.configurations).toHaveLength(0);
  registration.resolve();
  await settle(runtime);
  expect(peakRegistrations).toBe(2);
});
