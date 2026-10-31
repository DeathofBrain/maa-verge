import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { automaticCapture } from '@backend/modules/devices/auto-capture';
import { connectionCapture } from '@backend/modules/devices/capture';
import { Runtime } from '@backend/app/runtime';
import { defaultConnection, parseSettings } from '@backend/modules/settings/models';
import { validateWorkerConfiguration } from '@contracts/validators.js';
import type { EmulatorInventory } from '@backend/infrastructure/native/windows-emulators';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const temporary = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-auto-capture-'));
  roots.push(root);
  return root;
};
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const worker = () => ({
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
});
function inventory(root = 'D:\\MuMu'): EmulatorInventory {
  return {
    instances: [
      {
        kind: 'mumu',
        address: '127.0.0.1:16384',
        name: 'MuMu 主实例',
        index: 0,
        emulatorPath: root,
        aliases: ['127.0.0.1:7555'],
      },
      {
        kind: 'mumu',
        address: '127.0.0.1:18432',
        name: 'MuMu 多开',
        index: 32,
        emulatorPath: root,
        aliases: [],
      },
    ],
    diagnostics: [],
  };
}
function instance(
  metadata: EmulatorInventory,
  configurations: any[],
  extra: ConstructorParameters<typeof Runtime>[1] = {},
) {
  const runtime = new Runtime(temporary(), {
    adbExecutable: () => 'synthetic-adb',
    emulatorInventory: async () => metadata,
    workerFactory: async (config) => {
      configurations.push(config);
      return worker();
    },
    ...extra,
  });
  runtimes.push(runtime);
  runtime.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource', version: 'r1' },
  });
  return runtime;
}
function mumuSdk() {
  const root = temporary();
  mkdirSync(path.join(root, 'shell/sdk'), { recursive: true });
  writeFileSync(path.join(root, 'shell/sdk/external_renderer_ipc.dll'), 'synthetic, never loaded');
  return root;
}

test('automatic capture selects only a verified instance with an available SDK and preserves explicit manual ADB', () => {
  const metadata = inventory();
  for (const [index, address] of [
    [0, '127.0.0.1:7555'],
    [32, '127.0.0.1:18432'],
  ] as const) {
    const selected = automaticCapture(undefined, address, metadata, 'win32', () => true)!;
    expect(selected.capture).toEqual({
      method: 'mumu',
      emulatorPath: 'D:\\MuMu',
      instanceIndex: index,
      autoDetect: true,
    });
    expect(selected.config).toBe('MuMuEmulator12');
  }
  expect(
    automaticCapture(
      { method: 'adb', emulatorPath: '', instanceIndex: 0, autoDetect: false },
      '127.0.0.1:16384',
      metadata,
      'win32',
      () => true,
    ),
  ).toBeUndefined();
  for (const platform of ['darwin', 'linux'] as const)
    expect(
      automaticCapture(undefined, '127.0.0.1:16384', metadata, platform, () => true)?.capture
        .method,
    ).toBe('adb');
  expect(
    automaticCapture(undefined, '127.0.0.1:16384', metadata, 'win32', () => false)?.capture.method,
  ).toBe('adb');
  expect(
    automaticCapture(undefined, '127.0.0.1:62001', metadata, 'win32', () => true)?.capture.method,
  ).toBe('adb');
  expect(() =>
    automaticCapture(
      { method: 'mumu', emulatorPath: 'D:\\MuMu', instanceIndex: 0, autoDetect: true },
      '127.0.0.1:16384',
      metadata,
      'win32',
      () => false,
    ),
  ).toThrow('无法确认');
});

test.skipIf(process.platform !== 'win32')(
  'MuMu auto setup persists independent profiles and sends only native capture fields',
  async () => {
    const root = mumuSdk(),
      metadata = inventory(root),
      configurations: any[] = [],
      runtime = instance(metadata, configurations);
    for (const item of metadata.instances) await runtime.connectDevice({ address: item.address });
    const profiles = runtime.snapshot().settings.deviceProfiles!;
    expect(
      profiles.map((profile) => [
        profile.capture.method,
        profile.capture.instanceIndex,
        profile.autoDetected,
      ]),
    ).toEqual([
      ['mumu', 0, true],
      ['mumu', 32, true],
    ]);
    expect(configurations.map((config) => config.connection.config)).toEqual([
      'MuMuEmulator12',
      'MuMuEmulator12',
    ]);
    expect(configurations.map((config) => config.capture.instanceIndex)).toEqual([0, 32]);
    expect(
      configurations.every((config) =>
        validateWorkerConfiguration({ ...config, protocolVersion: 1 }),
      ),
    ).toBe(true);
    expect(configurations.every((config) => !('autoDetect' in config.capture))).toBe(true);
    expect(runtime.snapshot().devices.map((device) => device.connectionProfileId)).toEqual(
      profiles.map((profile) => profile.id),
    );
    const device = runtime.snapshot().devices[1];
    await runtime.disconnectDevice(device.id);
    const settings = runtime.snapshot().settings;
    settings.deviceProfiles![1].capture = {
      method: 'adb',
      emulatorPath: '',
      instanceIndex: 0,
      autoDetect: false,
    };
    await runtime.handle('settings.save', { settings });
    await runtime.connectDevice({ address: metadata.instances[1].address });
    expect(configurations[2].capture).toEqual({ method: 'adb' });
  },
);

test.skipIf(process.platform !== 'win32')(
  'existing named profiles retain connection preferences while automatic capture fills the correct SDK index',
  async () => {
    const root = mumuSdk(),
      metadata = inventory(root),
      configurations: any[] = [],
      runtime = instance(metadata, configurations),
      address = metadata.instances[1].address;
    await runtime.handle('settings.save', {
      settings: parseSettings({
        deviceProfiles: [
          {
            id: 'custom',
            name: '我的小号',
            address,
            connection: {
              ...defaultConnection(),
              adbPath: '',
              touchMode: 'maatouch',
              clientType: 'YoStarJP',
            },
            capture: { method: 'adb', emulatorPath: '', instanceIndex: 0 },
          },
        ],
      }),
    });
    await runtime.connectDevice({ address });
    const profile = runtime.snapshot().settings.deviceProfiles![0];
    expect(profile.id).toBe('custom');
    expect(profile.name).toBe('我的小号');
    expect(profile.capture.instanceIndex).toBe(32);
    expect(profile.capture.method).toBe('mumu');
    expect(profile.autoDetected).toBeUndefined();
    expect(configurations[0].connection.touchMode).toBe('maatouch');
    expect(configurations[0].connection.clientType).toBe('YoStarJP');
  },
);

test.skipIf(process.platform !== 'win32')(
  'LDPlayer auto setup binds the console PID and never persists runtime PID in settings',
  async () => {
    const root = temporary();
    for (const name of ['ldopengl64.dll', 'ldconsole.exe'])
      writeFileSync(path.join(root, name), 'synthetic, never executed');
    const metadata: EmulatorInventory = {
      instances: [
        {
          kind: 'ldplayer',
          address: '127.0.0.1:5557',
          name: '雷电多开',
          index: 1,
          emulatorPath: root,
          aliases: [],
          pid: 202,
        },
      ],
      diagnostics: [],
    };
    await expect(
      connectionCapture(
        { method: 'ldplayer', emulatorPath: root, instanceIndex: 1 },
        '127.0.0.1:5557',
        'win32',
        { ...metadata.instances[0], pid: 0x80000000 },
      ),
    ).rejects.toThrow('不匹配');
    const configurations: any[] = [],
      runtime = instance(metadata, configurations);
    await runtime.connectDevice({ address: 'emulator-5556' });
    expect(configurations[0].connection.config).toBe('LDPlayer');
    expect(configurations[0].capture).toEqual({
      method: 'ldplayer',
      emulatorPath: root,
      instanceIndex: 1,
      pid: 202,
    });
    expect(runtime.snapshot().settings.deviceProfiles![0].capture).toEqual({
      method: 'ldplayer',
      emulatorPath: root,
      instanceIndex: 1,
      autoDetect: true,
    });
    expect(validateWorkerConfiguration({ ...configurations[0], protocolVersion: 1 })).toBe(true);
  },
);

test.skipIf(process.platform !== 'win32')(
  'automatic profiles continue discovering newly started instances and survive restart',
  async () => {
    const root = mumuSdk(),
      metadata = inventory(root),
      configurations: any[] = [];
    let passes = 0;
    const runtime = instance(metadata, configurations, {
      discoverDevices: async () => ({
        inventory: metadata,
        diagnostics: [],
        devices: metadata.instances
          .slice(0, ++passes === 1 ? 1 : 2)
          .map((item) => ({ address: item.address, name: item.name, adbState: 'device' })),
      }),
    });
    await runtime.autoConnectDevices();
    expect(runtime.snapshot().settings.deviceProfiles).toHaveLength(1);
    await runtime.autoConnectDevices();
    expect(runtime.snapshot().settings.deviceProfiles).toHaveLength(2);
    expect(configurations).toHaveLength(2);
    const dataRoot = runtime.root;
    await runtime.close();
    const reopened = new Runtime(dataRoot, {
      workerFactory: async () => worker(),
      emulatorInventory: async () => metadata,
      adbExecutable: () => 'synthetic-adb',
    });
    runtimes.push(reopened);
    expect(
      reopened.snapshot().settings.deviceProfiles!.map((profile) => profile.capture.instanceIndex),
    ).toEqual([0, 32]);
  },
);

test.skipIf(process.platform !== 'win32')(
  'automatic capture never recreates a profile deleted while the connection is being prepared',
  async () => {
    const root = mumuSdk(),
      metadata = inventory(root),
      configurations: any[] = [];
    let release!: (value: EmulatorInventory) => void;
    const pending = new Promise<EmulatorInventory>((resolve) => {
      release = resolve;
    });
    const runtime = instance(metadata, configurations, { emulatorInventory: () => pending });
    await runtime.handle('settings.save', {
      settings: parseSettings({
        deviceProfiles: [
          {
            id: 'user-profile',
            name: '可删除的实例',
            address: metadata.instances[0].address,
            connection: defaultConnection(),
            capture: { method: 'adb', emulatorPath: '', instanceIndex: 0 },
          },
        ],
      }),
    });
    const connecting = runtime.connectDevice({ address: metadata.instances[0].address });
    release(metadata);
    const deleted = new Promise<void>((resolve, reject) =>
      queueMicrotask(() => {
        const settings = runtime.snapshot().settings;
        settings.deviceProfiles = [];
        runtime.handle('settings.save', { settings }).then(() => resolve(), reject);
      }),
    );
    await Promise.all([connecting, deleted]);
    expect(runtime.snapshot().settings.deviceProfiles).toEqual([]);
    expect(configurations).toHaveLength(1);
  },
);

test.skipIf(process.platform !== 'win32')(
  'a concurrent manual screenshot preference applies on reconnect without an automatic profile overriding it',
  async () => {
    const root = mumuSdk(),
      metadata = inventory(root),
      configurations: any[] = [];
    let release!: (value: EmulatorInventory) => void;
    const pending = new Promise<EmulatorInventory>((resolve) => {
      release = resolve;
    });
    const runtime = instance(metadata, configurations, { emulatorInventory: () => pending });
    const connecting = runtime.connectDevice({ address: metadata.instances[0].address });
    release(metadata);
    const saved = new Promise<void>((resolve, reject) =>
      queueMicrotask(() => {
        const settings = runtime.snapshot().settings;
        settings.capture = { method: 'adb', emulatorPath: '', instanceIndex: 0, autoDetect: false };
        runtime.handle('settings.save', { settings }).then(() => resolve(), reject);
      }),
    );
    const [device] = await Promise.all([connecting, saved]);
    expect(runtime.snapshot().settings.deviceProfiles ?? []).toEqual([]);
    await runtime.disconnectDevice(device.id);
    await runtime.connectDevice({ address: metadata.instances[0].address });
    expect(configurations[1].capture).toEqual({ method: 'adb' });
  },
);
