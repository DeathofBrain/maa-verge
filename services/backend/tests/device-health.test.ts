import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Device } from '../../../packages/contracts/src/types';
import type { AdbDevice } from '../src/adb';
import { Runtime } from '../src/runtime';
import { parseSettings } from '../src/models';

type Observer = {
  onDevices: (devices: AdbDevice[]) => void;
  onClose: () => void;
  close: () => Promise<void>;
  closed: boolean;
  releaseClose: () => void;
};

class FakeWorker {
  events: any[] = [];
  connected = false;
  safeIdle = true;
  submitted: any[] = [];
  closed = false;
  async connect() {
    queueMicrotask(() => {
      this.connected = true;
      this.events.push({
        type: 'callback',
        message: 4,
        details: { what: 'Connect', details: { ret: true } },
      });
    });
    return { asyncId: 1 };
  }
  async task(task: any) {
    this.submitted.push(task);
    this.safeIdle = false;
    return { taskId: this.submitted.length };
  }
  async stop() {
    return { stopping: true };
  }
  async close() {
    this.closed = true;
    this.connected = false;
  }
  async waitConnected() {
    return this.connected && this.safeIdle;
  }
}

const runtimes: Runtime[] = [];
const closeReleases: (() => void)[] = [];
async function flushMicrotasks() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
function fixture(holdClose = false) {
  const workers: FakeWorker[] = [];
  const observers: Observer[] = [];
  const runtime = new Runtime(mkdtempSync(path.join(tmpdir(), 'maaverge-device-health-')), {
    workerFactory: async () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    adbExecutable: () => 'synthetic-adb',
    observeDeviceConnections: (onDevices, onClose) => {
      let releaseClose!: () => void;
      const closed = new Promise<void>((resolve) => {
        releaseClose = resolve;
      });
      closeReleases.push(releaseClose);
      const observer: Observer = {
        onDevices,
        onClose,
        closed: false,
        releaseClose,
        async close() {
          observer.closed = true;
          onClose();
          if (holdClose) await closed;
        },
      };
      observers.push(observer);
      return observer;
    },
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
  return { runtime, workers, observers };
}
const adbDevice = (address: string, adbState = 'device'): AdbDevice => ({
  address,
  name: '合成设备',
  adbState,
});
async function connect(runtime: Runtime, address = '127.0.0.1:5555') {
  const device = await runtime.connectDevice({ address });
  await flushMicrotasks();
  await runtime.pollNativeWorkers();
  expect(runtime.snapshot().devices.find((item) => item.id === device.id)?.state).toBe('idle');
  return device;
}
async function tick(runtime: Runtime) {
  await runtime.tick(true);
  await flushMicrotasks();
}

afterEach(async () => {
  for (const release of closeReleases.splice(0)) release();
  for (const runtime of runtimes.splice(0)) {
    await runtime.close();
    rmSync(runtime.root, { recursive: true, force: true });
  }
  mock.restore();
});

test('an idle emulator disappearing goes offline even with automatic connection disabled', async () => {
  const { runtime, workers, observers } = fixture();
  const device = await connect(runtime);
  runtime.store.put('device', device.id, {
    ...runtime.store.get<Device>('device', device.id),
    captureMethod: 'MumuExtras',
  });
  expect(runtime.snapshot().settings.autoConnect).toBe(false);

  await tick(runtime);
  expect(observers).toHaveLength(1);
  observers[0].onDevices([]);
  await tick(runtime);

  const offline = runtime.snapshot().devices.find((item) => item.id === device.id)!;
  expect(offline.state).toBe('offline');
  expect(offline.captureMethod).toBeUndefined();
  expect(offline.connectionError).toBeString();
  expect(workers[0].closed).toBe(true);
  expect(runtime.workers.has(device.id)).toBe(false);
  expect(runtime.snapshot().events).toContainEqual(
    expect.objectContaining({
      type: 'device.failed',
      data: expect.objectContaining({ device: expect.objectContaining({ id: device.id }) }),
    }),
  );
});

test.each(['offline', 'unauthorized'])(
  'a tracked device with ADB state %s is no longer ready',
  async (adbState) => {
    const { runtime, workers, observers } = fixture();
    const device = await connect(runtime);
    await tick(runtime);
    observers[0].onDevices([adbDevice(device.address, adbState)]);
    await tick(runtime);
    expect(runtime.snapshot().devices[0].state).toBe('offline');
    expect(workers[0].closed).toBe(true);
  },
);

test('connection loss fails the active run and preserves request deduplication without replay', async () => {
  const { runtime, workers, observers } = fixture();
  const device = await connect(runtime);
  const plan = await runtime.handle('plan.save', {
    plan: {
      id: 'device-health-plan',
      name: '断线回归',
      tasks: [
        { type: 'Fight', params: { stage: '1-7', times: 1 } },
        { type: 'Fight', params: { stage: '1-7', times: 1 } },
      ],
    },
  });
  const request = { planId: plan.id, deviceId: device.id, requestId: 'health-no-replay' };
  const run = await runtime.startRun(request);
  expect(workers[0].submitted).toHaveLength(1);
  await tick(runtime);
  observers[0].onDevices([]);
  await tick(runtime);

  const failed = runtime.store.get('run', run.id);
  expect(failed.status).toBe('failed');
  expect(failed.tasks[0].status).toBe('failed');
  expect(failed.tasks[1].status).not.toBe('completed');
  expect(runtime.snapshot().devices[0].state).toBe('offline');
  expect(workers[0].closed).toBe(true);
  await tick(runtime);
  expect(workers[0].submitted).toHaveLength(1);

  await connect(runtime);
  expect((await runtime.startRun(request)).id).toBe(run.id);
  expect(runtime.store.get('run', run.id).status).toBe('failed');
  expect(workers[1].submitted).toHaveLength(0);
});

test('connected instances share one persistent subscription and refresh it when the set changes', async () => {
  let time = Date.now();
  spyOn(Date, 'now').mockImplementation(() => time);
  const { runtime, observers } = fixture();
  const first = await connect(runtime, '127.0.0.1:5555');
  const second = await connect(runtime, '127.0.0.1:5557');
  await tick(runtime);
  expect(observers).toHaveLength(1);
  observers[0].onDevices([adbDevice(first.address), adbDevice(second.address)]);
  await tick(runtime);
  for (let index = 0; index < 5; index++) {
    time += 60_000;
    await tick(runtime);
  }
  expect(observers).toHaveLength(1);
  expect(observers[0].closed).toBe(false);
  expect(runtime.snapshot().devices.map((device) => device.state)).toEqual(['idle', 'idle']);

  const third = await connect(runtime, '127.0.0.1:5559');
  await tick(runtime);
  expect(observers[0].closed).toBe(true);
  expect(observers).toHaveLength(2);
  expect(observers.filter((observer) => !observer.closed)).toHaveLength(1);
  observers[1].onDevices([adbDevice(first.address), adbDevice(third.address)]);
  await tick(runtime);
  expect(runtime.snapshot().devices.map((device) => device.state)).toEqual([
    'idle',
    'offline',
    'idle',
  ]);
});

test('tracked ADB aliases match the connected device identity', async () => {
  const { runtime, workers, observers } = fixture();
  await connect(runtime, 'localhost:5555');
  await tick(runtime);
  observers[0].onDevices([adbDevice('emulator-5554')]);
  await tick(runtime);
  expect(runtime.snapshot().devices[0].state).toBe('idle');
  expect(workers[0].closed).toBe(false);

  observers[0].onDevices([adbDevice('emulator-5556')]);
  await tick(runtime);
  expect(runtime.snapshot().devices[0].state).toBe('offline');
  expect(workers[0].closed).toBe(true);
});

test('subscription failure preserves device state and reconnects after five seconds', async () => {
  let time = Date.now();
  spyOn(Date, 'now').mockImplementation(() => time);
  const { runtime, workers, observers } = fixture();
  const device = await connect(runtime);
  await tick(runtime);
  observers[0].onDevices([adbDevice(device.address)]);
  await tick(runtime);
  const before = runtime.snapshot().events.length;
  observers[0].closed = true;
  observers[0].onClose();
  await tick(runtime);
  expect(runtime.snapshot().devices[0].state).toBe('idle');
  expect(runtime.snapshot().events).toHaveLength(before);
  expect(workers[0].closed).toBe(false);
  expect(observers).toHaveLength(1);

  time += 4_999;
  await tick(runtime);
  expect(observers).toHaveLength(1);
  time += 1;
  await tick(runtime);
  expect(observers).toHaveLength(2);
  observers[1].onDevices([]);
  await tick(runtime);
  expect(runtime.snapshot().devices[0].state).toBe('offline');
});

test('a stale subscription cannot disconnect a replacement worker or close its new subscription', async () => {
  let time = Date.now();
  spyOn(Date, 'now').mockImplementation(() => time);
  const { runtime, workers, observers } = fixture();
  const device = await connect(runtime);
  await tick(runtime);
  await runtime.disconnectDevice(device.id);
  const replacement = await connect(runtime);
  expect(replacement.id).toBe(device.id);
  await tick(runtime);
  expect(observers).toHaveLength(2);
  expect(observers[0].closed).toBe(true);

  observers[0].onDevices([]);
  observers[0].onClose();
  time += 6_000;
  await tick(runtime);
  expect(runtime.snapshot().devices[0].state).toBe('idle');
  expect(runtime.workers.get(device.id)).toBe(workers[1]);
  expect(workers[1].closed).toBe(false);
  expect(observers).toHaveLength(2);
  expect(observers[1].closed).toBe(false);
  observers[1].onDevices([adbDevice(replacement.address)]);
  await tick(runtime);
  expect(runtime.snapshot().devices[0].state).toBe('idle');
});

test('closing waits for the subscription and ignores callbacks during and after store shutdown', async () => {
  const { runtime, workers, observers } = fixture(true);
  await connect(runtime);
  await tick(runtime);
  expect(observers).toHaveLength(1);
  const put = spyOn(runtime.store, 'put');
  const event = spyOn(runtime.store, 'event');

  let finished = false;
  const closing = runtime.close().then(() => {
    finished = true;
  });
  await flushMicrotasks();
  expect(observers[0].closed).toBe(true);
  expect(finished).toBe(false);
  observers[0].onDevices([]);
  observers[0].onClose();
  observers[0].releaseClose();
  await closing;
  observers[0].onDevices([]);
  observers[0].onClose();
  await flushMicrotasks();
  await tick(runtime);
  expect(workers[0].closed).toBe(true);
  expect(runtime.workers.size).toBe(0);
  expect(put).not.toHaveBeenCalled();
  expect(event).not.toHaveBeenCalled();
});
