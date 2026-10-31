import { afterEach, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime, type RuntimeOptions } from '@backend/app/runtime';
import { emptyEmulatorInventory } from '@backend/infrastructure/native/windows-emulators';
import { defaultConnection, parseSettings } from '@backend/modules/settings/models';
import type { Settings } from '@contracts/types';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [];
const runtimes: Runtime[] = [];

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function fixture(
  ensure: NonNullable<RuntimeOptions['ensureAvdTransport']>,
  connection: NonNullable<Settings['connection']> = {
    ...defaultConnection(),
    config: 'AVD',
    touchMode: 'MaaFwAdb',
  },
) {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-avd-connection-'));
  roots.push(root);
  const calls: string[] = [];
  const configs: any[] = [];
  const workers: Array<{ closed: boolean; connects: number }> = [];
  const runtime = new Runtime(root, {
    ensureAvdTransport: async (...args) => {
      calls.push(`ensure:${args[0]}`);
      await ensure(...args);
    },
    workerFactory: async (config) => {
      calls.push('startWorker');
      configs.push(config);
      const worker = {
        events: [],
        connected: true,
        safeIdle: true,
        closed: false,
        connects: 0,
        async connect() {
          calls.push('connect');
          this.connects += 1;
        },
        async close() {
          calls.push('close');
          this.closed = true;
        },
        async task() {},
        async stop() {},
        async waitConnected() {
          return true;
        },
      };
      workers.push(worker);
      return worker;
    },
    adbExecutable: () => 'synthetic-adb',
    emulatorInventory: async () => emptyEmulatorInventory(),
    calendar: { fetcher: null },
  });
  runtimes.push(runtime);
  runtime.store.put(
    'settings',
    'main',
    parseSettings({
      autoConnect: false,
      autoUpdateCore: false,
      autoUpdateResource: false,
      connection,
    }),
  );
  runtime.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource', version: 'r1' },
  });
  return { runtime, calls, configs, workers };
}

test('AVD registration runs after the worker lease and finishes before MaaCore connects', async () => {
  const started = deferred();
  const registered = deferred();
  const { runtime, calls, configs } = fixture(async () => {
    started.resolve();
    await registered.promise;
  });
  const connection = runtime.connectDevice({ address: 'EMULATOR-20050' });
  try {
    await started.promise;
    expect(calls).toEqual(['startWorker', 'ensure:emulator-20050']);
    expect(configs[0].address).toBe('emulator-20050');
    expect(runtime.workers.size).toBe(0);
  } finally {
    registered.resolve();
  }
  const device = await connection;
  expect(calls).toEqual(['startWorker', 'ensure:emulator-20050', 'connect']);
  expect(device.address).toBe('emulator-20050');
  expect((await runtime.connectDevice({ address: 'Emulator-20050' })).id).toBe(device.id);
  expect(calls).toEqual(['startWorker', 'ensure:emulator-20050', 'connect']);
});

test('a rejected AVD registration closes its leased worker without connecting or saving a device', async () => {
  let fail = true;
  const { runtime, calls, workers } = fixture(async () => {
    if (fail) throw new Error('合成 AVD 登记失败');
  });
  await expect(runtime.connectDevice({ address: 'EMULATOR-20050' })).rejects.toThrow(
    '合成 AVD 登记失败',
  );
  expect(calls).toEqual(['startWorker', 'ensure:emulator-20050', 'close']);
  expect(workers[0]).toMatchObject({ closed: true, connects: 0 });
  expect(runtime.workers.size).toBe(0);
  expect(runtime.snapshot().devices).toEqual([]);
  fail = false;
  await runtime.connectDevice({ address: 'emulator-20050' });
  expect(workers).toHaveLength(2);
  expect(workers[1]).toMatchObject({ closed: false, connects: 1 });
  expect(runtime.snapshot().devices).toHaveLength(1);
});

test.each([
  ['127.0.0.1:20051', 'AVD', 'MaaFwAdb'],
  ['emulator-20050', 'General', 'MaaFwAdb'],
  ['emulator-20050', 'AVD', 'maatouch'],
  ['UsbSerialABC', 'AVD', 'MaaFwAdb'],
] as const)(
  '%s with %s / %s keeps its existing connection path without AVD registration',
  async (address, config, touchMode) => {
    const { runtime, calls, configs } = fixture(
      async () => {
        throw new Error('this connection must not register an AVD serial');
      },
      { ...defaultConnection(), config, touchMode },
    );
    const device = await runtime.connectDevice({ address });
    expect(calls).toEqual(['startWorker', 'connect']);
    expect(device.address).toBe(address);
    expect(configs[0].address).toBe(address);
  },
);
