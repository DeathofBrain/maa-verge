import { expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { emptyEmulatorInventory } from '@backend/infrastructure/native/windows-emulators';
import { defaultConnection, parseSettings } from '@backend/modules/settings/models';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

test('connection settings normalize emulator prefixes and preserve USB serial case', () => {
  const settings = parseSettings({
    connection: { address: 'EMULATOR-5554' },
    deviceProfiles: ['Emulator-5556', 'UsbSerialABC'].map((address, index) => ({
      id: `instance-${index}`,
      name: `实例 ${index}`,
      address: ` ${address} `,
      connection: { ...defaultConnection(), address: 'unused' },
      capture: { method: 'adb' },
    })),
  });
  expect(settings.connection?.address).toBe('emulator-5554');
  expect(
    settings.deviceProfiles?.map(({ address, connection }) => [address, connection.address]),
  ).toEqual([
    ['emulator-5556', 'emulator-5556'],
    ['UsbSerialABC', 'UsbSerialABC'],
  ]);
  expect(parseSettings({ connection: { address: 'UsbSerialABC' } }).connection?.address).toBe(
    'UsbSerialABC',
  );
});

test('saved settings and uppercase historical emulator addresses reconnect to one existing device', async () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-device-address-'));
  const configs: any[] = [];
  const createRuntime = () =>
    new Runtime(root, {
      workerFactory: async (config) => {
        configs.push(config);
        return {
          events: [],
          connected: true,
          safeIdle: true,
          async connect() {},
          async close() {},
          async task() {},
          async stop() {},
          async waitConnected() {
            return true;
          },
        };
      },
      adbExecutable: () => 'synthetic-adb',
      emulatorInventory: async () => emptyEmulatorInventory(),
      calendar: { fetcher: null },
    });
  let runtime: Runtime | undefined;
  try {
    runtime = createRuntime();
    const saved = await runtime.handle('settings.save', {
      settings: {
        autoConnect: false,
        autoUpdateCore: false,
        autoUpdateResource: false,
        connection: { address: 'EMULATOR-5554' },
        deviceProfiles: [
          {
            id: 'avd',
            name: '合成 AVD',
            address: 'EMULATOR-5554',
            connection: { ...defaultConnection(), config: 'AVD', touchMode: 'MaaFwAdb' },
            capture: { method: 'adb' },
          },
        ],
      },
    });
    expect(saved.connection?.address).toBe('emulator-5554');
    expect(saved.deviceProfiles?.[0]?.address).toBe('emulator-5554');
    runtime.store.put('device', 'historical-avd', {
      id: 'historical-avd',
      name: '历史 AVD',
      address: 'EMULATOR-5554',
      state: 'offline',
      coreVersion: null,
      resourceVersion: null,
    });
    await runtime.close();
    runtime = createRuntime();
    runtime.store.put('active', 'combo', {
      core: { path: 'synthetic-core', version: 'v1' },
      resource: { path: 'synthetic-resource', version: 'r1' },
    });
    expect(runtime.snapshot().settings.deviceProfiles?.[0]?.connection.address).toBe(
      'emulator-5554',
    );
    const historical = runtime.snapshot().devices[0]!;
    expect(historical.address).toBe('EMULATOR-5554');
    const connected = await runtime.connectDevice({ address: historical.address });
    expect(connected.id).toBe(historical.id);
    expect(connected.address).toBe('emulator-5554');
    expect(connected.connectionProfileId).toBe('avd');
    expect(configs[0]).toMatchObject({
      address: 'emulator-5554',
      connection: { config: 'AVD', touchMode: 'MaaFwAdb' },
    });
    expect((await runtime.connectDevice({ address: 'Emulator-5554' })).id).toBe(historical.id);
    expect(configs).toHaveLength(1);
    expect(runtime.snapshot().devices).toHaveLength(1);
  } finally {
    await runtime?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
