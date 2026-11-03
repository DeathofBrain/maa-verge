import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { FakeFramework, frameworkFixtureOptions, seedFrameworkResource } from './framework-fixture';
import { NativeWorkerTransport } from '@backend/infrastructure/native/worker';
import {
  defaultConnection,
  parseSettings,
  type DeviceConnectionProfile,
} from '@backend/modules/settings/models';
import { validateFrameworkWorkerConfiguration } from '@contracts/validators.js';
import { mumuDefaultAdbAddress } from '@contracts/device-profiles';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const temporary = () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-multi-instance-'));
  roots.push(root);
  return root;
};
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const fakeWorker = () => new FakeFramework();
function instance(options: ConstructorParameters<typeof Runtime>[1] = {}) {
  const runtime = new Runtime(
    temporary(),
    frameworkFixtureOptions({ adbExecutable: undefined, ...options }),
  );
  runtimes.push(runtime);
  seedFrameworkResource(runtime);
  return runtime;
}
function profile(index: number, enhanced = false): DeviceConnectionProfile {
  const root = temporary(),
    adb = path.join(root, process.platform === 'win32' ? 'adb.exe' : 'adb');
  writeFileSync(adb, 'synthetic, never executed');
  if (enhanced) {
    mkdirSync(path.join(root, 'shell/sdk'), { recursive: true });
    writeFileSync(
      path.join(root, 'shell/sdk/external_renderer_ipc.dll'),
      'synthetic, never loaded',
    );
  }
  const address = enhanced ? mumuDefaultAdbAddress(index)! : `127.0.0.1:${5555 + index * 2}`;
  return {
    id: `instance-${index}`,
    name: `实例 ${index}`,
    address,
    connection: {
      ...defaultConnection(),
      address,
      adbPath: adb,
      framework: {
        touchMode: index ? 'maatouch' : 'minitouch',
        capture: {
          method: enhanced ? 'mumu' : 'adb',
          emulatorPath: enhanced ? root : '',
          instanceIndex: index,
        },
      },
    },
    capture: {
      method: enhanced ? 'mumu' : 'adb',
      emulatorPath: enhanced ? root : '',
      instanceIndex: index,
    },
  };
}

test('multi-instance settings reject duplicate serial/TCP/bridge aliases and keep legacy settings unchanged', () => {
  const first = profile(0),
    second = profile(1);
  expect(parseSettings().deviceProfiles).toBeUndefined();
  expect(parseSettings({ deviceProfiles: [first, second] }).deviceProfiles).toHaveLength(2);
  for (const duplicate of [
    { ...second, address: first.address },
    { ...second, address: 'emulator-5554' },
    { ...second, address: 'localhost:05555' },
    { ...second, id: first.id },
  ])
    expect(() => parseSettings({ deviceProfiles: [first, duplicate] })).toThrow('重复');
  expect(
    parseSettings({ deviceProfiles: [first, { ...second, address: '127.0.0.1:16384' }] })
      .deviceProfiles,
  ).toHaveLength(2);
  expect(
    parseSettings({
      deviceProfiles: [
        first,
        {
          ...second,
          address: '192.168.1.2:5555',
          capture: { ...second.capture, method: 'mumu', mumuBridge: true, instanceIndex: 0 },
        },
      ],
    }).deviceProfiles,
  ).toHaveLength(2);
  expect(() => parseSettings({ deviceProfiles: [{ ...first, address: '-unsafe' }] })).toThrow(
    '地址',
  );
  expect(() =>
    parseSettings({
      deviceProfiles: [{ ...first, capture: { ...first.capture, mumuTouch: true } }],
    }),
  ).toThrow('MuMu');
});

test('auto-connect selects independent ADB and touch settings and an edit only changes the reconnected instance', async () => {
  const configs: any[] = [],
    workers: ReturnType<typeof fakeWorker>[] = [];
  const runtime = instance({
    frameworkWorkerFactory: async (config) => {
      configs.push(config);
      const worker = fakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  const profiles = [profile(0), profile(1)];
  await runtime.handle('settings.save', {
    settings: parseSettings({
      connection: { adbPath: path.join(temporary(), 'missing-global-adb') },
      capture: { method: 'mumu', emulatorPath: 'missing-global-sdk', instanceIndex: 9 },
      deviceProfiles: profiles,
    }),
  });
  const result = await runtime.autoConnectDevices();
  await runtime.pollNativeWorkers();
  expect(result.devices).toHaveLength(2);
  expect(workers).toHaveLength(2);
  expect(configs.map((config) => config.adb)).toEqual(
    profiles.map((item) => realpathSync(item.connection.adbPath)),
  );
  expect(configs.map((config) => config.touchMode)).toEqual(['minitouch', 'maatouch']);
  expect(configs[0].lockPath).not.toBe(configs[1].lockPath);
  expect(
    configs.every((config) =>
      validateFrameworkWorkerConfiguration({ ...config, protocolVersion: 1 }),
    ),
  ).toBe(true);
  const devices = runtime.snapshot().devices;
  expect(devices.map((device) => device.connectionProfileId)).toEqual(['instance-0', 'instance-1']);
  expect(devices.every((device) => device.state === 'idle')).toBe(true);
  const settings = runtime.snapshot().settings;
  settings.deviceProfiles![1]!.connection.framework!.touchMode = 'adb';
  await runtime.handle('settings.save', { settings });
  expect(configs).toHaveLength(2);
  await runtime.disconnectDevice(devices[1]!.id);
  await runtime.connectDevice({ address: profiles[1]!.address });
  expect(configs).toHaveLength(3);
  expect(configs[2].touchMode).toBe('adb');
  expect(runtime.workers.get(devices[0]!.id)?.connected).toBe(workers[0].connected);
});

test.skipIf(process.platform !== 'win32')(
  'two MuMu SDK instances receive independent capture indices instead of the global index',
  async () => {
    const configs: any[] = [],
      profiles = [profile(0, true), profile(1, true)];
    const runtime = instance({
      frameworkWorkerFactory: async (config) => {
        configs.push(config);
        return fakeWorker();
      },
    });
    await runtime.handle('settings.save', {
      settings: parseSettings({
        capture: { method: 'mumu', emulatorPath: 'invalid-global-sdk', instanceIndex: 9 },
        deviceProfiles: profiles,
      }),
    });
    const result = await runtime.autoConnectDevices();
    expect(result.devices).toHaveLength(2);
    expect(configs.map((config) => config.capture.instanceIndex)).toEqual([0, 1]);
    expect(configs.map((config) => config.capture.emulatorPath)).toEqual(
      profiles.map((item) => realpathSync(item.capture.emulatorPath)),
    );
  },
);

test('one configured connection failure does not block another instance and async native errors remain per device', async () => {
  const configs: any[] = [],
    workers: ReturnType<typeof fakeWorker>[] = [],
    first = profile(0),
    second = profile(1);
  first.connection.adbPath = path.join(temporary(), 'missing-adb');
  const runtime = instance({
    frameworkWorkerFactory: async (config) => {
      configs.push(config);
      const worker = fakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  await runtime.handle('settings.save', {
    settings: parseSettings({ deviceProfiles: [first, second] }),
  });
  const result = await runtime.autoConnectDevices();
  await runtime.pollNativeWorkers();
  expect(result.devices).toHaveLength(1);
  expect(result.devices[0].connectionProfileId).toBe(second.id);
  expect(result.diagnostics.some((message: string) => message.includes(first.address))).toBe(true);
  expect(
    runtime
      .snapshot()
      .events.some(
        (event) =>
          event.type === 'device.connection_failed' &&
          event.data.profileId === first.id &&
          String(event.data.error).includes('不存在'),
      ),
  ).toBe(true);
  runtime.workers
    .get(result.devices[0].id)!
    .events.push({ type: 'protocol_error', message: 'synthetic native connection error' });
  await runtime.pollNativeWorkers();
  expect(runtime.snapshot().devices[0]!.state).toBe('offline');
  expect(workers[0]!.closed).toBe(true);
});

test('connection setup RPC errors expose the specific cause and retain raw diagnostic data', async () => {
  const runtime = instance({
    adbExecutable: () => {
      throw new Error('未找到 ADB；请选择模拟器内置 ADB');
    },
  });
  try {
    await runtime.connectDevice({ address: '127.0.0.1:5555' });
    throw new Error('expected rejection');
  } catch (error: any) {
    expect(error.code).toBe(-32040);
    expect(error.message).toContain('未找到 ADB');
    expect(error.data).toContain('未找到 ADB');
  }
  await expect(runtime.autoConnectDevices()).rejects.toThrow('未找到 ADB');
  runtime.store.delete('active', 'combo');
  await expect(runtime.connectDevice({ address: '127.0.0.1:5555' })).rejects.toThrow(
    '安装并启用游戏资源',
  );
});

test('connection diagnostics stay per device and clear only after a successful explicit reconnect', async () => {
  const failures = new Map<string, string>([
    ['127.0.0.1:5555', 'error: device unauthorized.'],
    ['127.0.0.1:5557', 'error: device offline'],
  ]);
  const runtime = instance({
    adbExecutable: () => 'synthetic-adb',
    frameworkWorkerFactory: async (config) => {
      const worker = fakeWorker();
      worker.connect = async () => {
        const error = failures.get(config.address!);
        if (error) throw new Error(error);
        return { accepted: true, nativeSuccess: true };
      };
      return worker;
    },
  });
  for (const address of failures.keys())
    await expect(runtime.connectDevice({ address })).rejects.toThrow();
  const devices = runtime.snapshot().devices;
  expect(devices[0].connectionError).toContain('尚未授权');
  expect(devices[1].connectionError).toContain('已离线');
  await runtime.pollNativeWorkers();
  expect(runtime.store.get('device', devices[0].id).connectionError).toContain('尚未授权');
  failures.delete(devices[0].address);
  await runtime.connectDevice({ address: devices[0].address });
  expect(runtime.store.get('device', devices[0].id).connectionError).toBeUndefined();
  expect(runtime.store.get('device', devices[1].id).connectionError).toContain('已离线');
});

for (const enhanced of [false, true])
  test(`configured instance preserves probe diagnostics when its connection ${enhanced ? 'fails' : 'succeeds'}`, async () => {
    const selected = profile(0, enhanced),
      configs: any[] = [];
    if (enhanced) selected.capture.autoDetect = true;
    const inventoryDiagnostics = ['MuMu 多开管理器查询超时：无法核实正在运行的实例'];
    let discoveries = 0;
    const runtime = instance({
      emulatorInventory: async () => ({ instances: [], diagnostics: inventoryDiagnostics }),
      discoverDevices: async () => {
        discoveries++;
        throw new Error('手动清单不应触发全量发现');
      },
      frameworkWorkerFactory: async (config) => {
        configs.push(config);
        return fakeWorker();
      },
    });
    await runtime.handle('settings.save', {
      settings: parseSettings({ deviceProfiles: [selected] }),
    });
    const result = await runtime.handle('device.auto_connect');
    await runtime.pollNativeWorkers();
    expect(discoveries).toBe(0);
    expect(result.diagnostics).toContain(inventoryDiagnostics[0]);
    const event = runtime
      .snapshot()
      .events.reverse()
      .find((event) => event.type === 'device.auto_connect');
    expect(event?.data.diagnostics).toEqual(result.diagnostics);
    expect(inventoryDiagnostics).toEqual(['MuMu 多开管理器查询超时：无法核实正在运行的实例']);
    if (enhanced) {
      expect(result.devices).toHaveLength(0);
      expect(configs).toHaveLength(0);
      expect(
        result.diagnostics.some(
          (message: string) =>
            message.includes(selected.address) && /增强截图|Windows|MuMu/.test(message),
        ),
      ).toBe(true);
      expect(runtime.snapshot().settings.deviceProfiles![0]!.capture.method).toBe('mumu');
    } else {
      expect(result.devices).toHaveLength(1);
      expect(configs).toHaveLength(1);
      expect(result.devices[0].connectionProfileId).toBe(selected.id);
      expect(runtime.snapshot().devices[0]!.state).toBe('idle');
      expect(result.diagnostics).toEqual(inventoryDiagnostics);
    }
  });

test('concurrent aliases cannot create a second controller and later alias requests reuse the first worker', async () => {
  let release!: () => void, began!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      began = resolve;
    });
  const configs: any[] = [],
    first = profile(0);
  const runtime = instance({
    frameworkWorkerFactory: async (config) => {
      configs.push(config);
      began();
      await gate;
      return fakeWorker();
    },
  });
  await runtime.handle('settings.save', { settings: parseSettings({ deviceProfiles: [first] }) });
  const connecting = runtime.connectDevice({ address: first.address });
  await started;
  await expect(runtime.connectDevice({ address: 'emulator-5554' })).rejects.toMatchObject({
    code: -32011,
  });
  release();
  const device = await connecting;
  expect((await runtime.connectDevice({ address: 'localhost:05555' })).id).toBe(device.id);
  expect(configs).toHaveLength(1);
  expect(runtime.workers.size).toBe(1);
});

const nativeWorker = process.env.MAAVERGE_TEST_NATIVE_WORKER;
test.skipIf(!nativeWorker)(
  'separate data roots still share the native lease for the same configured device',
  async () => {
    const address = `synthetic-profile-${crypto.randomUUID()}`,
      selected = { ...profile(0), address };
    const factory = async (config: any) => {
      const lease = await NativeWorkerTransport.start(
        { lockPath: config.lockPath, userDir: config.userDir, lockTimeoutMs: 0 },
        { command: [nativeWorker!, '--lease-only'] },
      );
      const worker = fakeWorker();
      const close = worker.close.bind(worker);
      worker.close = async () => {
        await close();
        await lease.close();
      };
      return worker;
    };
    const first = instance({ frameworkWorkerFactory: factory }),
      second = instance({ frameworkWorkerFactory: factory });
    for (const runtime of [first, second])
      await runtime.handle('settings.save', {
        settings: parseSettings({ deviceProfiles: [selected] }),
      });
    const owner = await first.connectDevice({ address });
    await expect(second.connectDevice({ address })).rejects.toThrow('设备连接失败');
    expect(second.workers.size).toBe(0);
    await first.disconnectDevice(owner.id);
    const next = await second.connectDevice({ address });
    expect(next.connectionProfileId).toBe(selected.id);
  },
);
