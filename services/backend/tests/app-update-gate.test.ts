import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime, type RuntimeOptions } from '../src/runtime';
import { parseSettings } from '../src/models';
import { snapshotIntegrity } from '../src/snapshot-integrity';

const roots: string[] = [],
  runtimes: Runtime[] = [];
function fixture(source?: any, options: Partial<RuntimeOptions> = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'maaverge-app-update-')));
  roots.push(root);
  const runtime = new Runtime(root, {
    source,
    calendar: { fetcher: null },
    workerFactory: async () => {
      throw new Error('No device access');
    },
    ...options,
  });
  runtimes.push(runtime);
  return runtime;
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('application installation gate blocks new work and automatic activity until explicitly cancelled', async () => {
  let checks = 0;
  const runtime = fixture({
    check: () => {
      checks++;
      throw new Error('No network');
    },
  });
  await runtime.updates.check('app');
  const state = await runtime.handle('updates.activate', { channel: 'app' });
  expect(state.status).toBe('staged');
  expect(runtime.appUpdating).toBe(true);
  expect((await runtime.handle('app.snapshot')).mode).toBe('native');
  await expect(runtime.handle('run.start', {})).rejects.toThrow('准备安装更新');
  await expect(runtime.handle('device.connect', { address: '127.0.0.1:5555' })).rejects.toThrow(
    '准备安装更新',
  );
  await expect(runtime.handle('settings.save', { settings: parseSettings() })).rejects.toThrow(
    '准备安装更新',
  );
  (runtime as any).nextChecks = { core: 0, resource: 0 };
  await runtime.automaticUpdates();
  await runtime.automaticConnections();
  expect(checks).toBe(0);
  await runtime.handle('updates.rollback', { channel: 'app' });
  expect(runtime.appUpdating).toBe(false);
  expect((await runtime.handle('agent.message', { message: '刷1-7三次' })).mode).toBe('mock');
});

test('application installation rejects runs at a component boundary as well as busy native workers', async () => {
  const runtime = fixture();
  await runtime.updates.check('app');
  runtime.store.put('run', 'held', { id: 'held', status: 'running' });
  runtime.store.put('execution', 'held', { boundaryWaiting: true });
  expect(runtime.busy()).toBe(false);
  await expect(runtime.handle('updates.activate', { channel: 'app' })).rejects.toThrow(
    '空闲后安装',
  );
  expect(runtime.appUpdating).toBe(false);
  runtime.store.delete('run', 'held');
  runtime.workers.set('busy', { safeIdle: false, close: async () => {} } as any);
  await expect(runtime.handle('updates.activate', { channel: 'app' })).rejects.toThrow(
    '空闲后安装',
  );
  runtime.workers.clear();
});

test('installation waits for a queued component check while preventing new work', async () => {
  let complete!: (metadata: any) => void;
  const runtime = fixture({
    check: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  });
  const checking = runtime.updates.check('core');
  // The operation is queued before its visible state changes to checking.
  expect(runtime.updates.channel('core').status).toBe('idle');
  const installing = runtime.handle('updates.activate', { channel: 'app' });
  const outcome = installing.catch((error) => error);
  await Bun.sleep(10);
  expect(runtime.updates.pendingOperations).toBe(1);
  expect(runtime.appUpdating).toBe(false);
  await expect(runtime.handle('run.start', {})).rejects.toThrow('准备安装更新');
  await expect(runtime.connectDevice({ address: '127.0.0.1:5555' })).rejects.toThrow('安装更新');
  complete({ version: 'v9.0.0' });
  await checking;
  expect((await outcome).status).toBe('staged');
  expect(runtime.updates.pendingOperations).toBe(0);
  expect(runtime.appUpdating).toBe(true);
});

test('installation preparation stops an automatic check from starting downloads or the next channel', async () => {
  let complete!: (metadata: any) => void,
    entered!: () => void,
    downloads = 0;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const checks: string[] = [];
  const runtime = fixture({
    check: (channel: string) => {
      checks.push(channel);
      entered();
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
    download: () => {
      downloads++;
      throw new Error('Installation must not start another download');
    },
  });
  (runtime as any).nextChecks = { core: 0, resource: 0 };
  const automatic = runtime.automaticUpdates();
  await started;
  const installing = runtime.handle('updates.activate', { channel: 'app' });
  const outcome = installing.catch((error) => error);
  complete({ version: 'v9.0.0' });
  await automatic;
  expect((await outcome).status).toBe('staged');
  expect(checks).toEqual(['core']);
  expect(downloads).toBe(0);
  expect(runtime.appUpdating).toBe(true);
});

test('installation rechecks native safety after draining and releases preparation on rejection', async () => {
  let complete!: (metadata: any) => void;
  const runtime = fixture({
    check: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  });
  const checking = runtime.updates.check('core');
  await Bun.sleep(10);
  const installing = runtime.handle('updates.activate', { channel: 'app' });
  const outcome = installing.catch((error) => error);
  runtime.workers.set('late-native-operation', { safeIdle: false, close: async () => {} } as any);
  complete({ version: 'v9.0.0' });
  await checking;
  expect(await outcome).toMatchObject({
    code: -32021,
    message: expect.stringContaining('核心或异步操作尚未结束'),
  });
  expect(runtime.appUpdating).toBe(false);
  expect((await runtime.handle('agent.message', { message: '刷1-7三次' })).mode).toBe('mock');
  runtime.workers.clear();
  await runtime.handle('updates.activate', { channel: 'app' });
  expect(runtime.appUpdating).toBe(true);
});

test('cancelling preparation cannot let an older queued installation acquire the gate', async () => {
  let complete!: (metadata: any) => void;
  const runtime = fixture({
    check: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  });
  const checking = runtime.updates.check('core');
  await Bun.sleep(10);
  const installing = runtime.handle('updates.activate', { channel: 'app' });
  const outcome = installing.catch((error) => error);
  await runtime.handle('updates.rollback', { channel: 'app' });
  expect((await runtime.handle('agent.message', { message: '刷1-7三次' })).mode).toBe('mock');
  const retrying = runtime.handle('updates.activate', { channel: 'app' });
  complete({ version: 'v9.0.0' });
  await checking;
  expect(await outcome).toMatchObject({ code: -32011, message: expect.stringContaining('已取消') });
  expect((await retrying).status).toBe('staged');
  expect(runtime.appUpdating).toBe(true);
  expect(runtime.appUpdatePreparing).toBe(false);
});

test('installation preparation lets an existing component activation finish its internal reconnect', async () => {
  let finish!: () => void, entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const workers: any[] = [];
  const runtime = fixture(undefined, {
    adbExecutable: () => 'synthetic-adb',
    validator: () => {
      entered();
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    workerFactory: async () => {
      const worker = {
        events: [],
        connected: true,
        safeIdle: true,
        closed: false,
        connect: async () => ({ asyncId: 1 }),
        waitConnected: async () => true,
        task: async () => {
          throw new Error('No tasks allowed');
        },
        stop: async () => {},
        close: async () => {
          worker.closed = true;
        },
      };
      workers.push(worker);
      return worker;
    },
  });
  const coreName =
    process.platform === 'win32'
      ? 'MaaCore.dll'
      : process.platform === 'darwin'
        ? 'libMaaCore.dylib'
        : 'libMaaCore.so';
  async function generation(name: string, version: string) {
    const directory = path.join(runtime.root, 'components', 'generations', name);
    mkdirSync(path.join(directory, 'resource'), { recursive: true });
    writeFileSync(path.join(directory, coreName), 'synthetic library, never loaded');
    writeFileSync(path.join(directory, 'resource', 'version.json'), '{}');
    return {
      path: directory,
      version,
      releaseChannel: 'stable',
      ...(await snapshotIntegrity(directory)),
    };
  }
  const original = await generation('core-original', 'v1.0.0'),
    candidate = await generation('core-candidate', 'v2.0.0');
  runtime.store.put('active', 'combo', { core: original, resource: original });
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  runtime.store.put('device', device.id, { ...device, state: 'idle' });
  runtime.store.put('staged', 'core', candidate);
  const activating = runtime.updates.activate('core');
  await started;
  const installing = runtime.handle('updates.activate', { channel: 'app' });
  const outcome = installing.catch((error) => error);
  expect(runtime.appUpdatePreparing).toBe(true);
  expect(runtime.appUpdating).toBe(false);
  finish();
  await activating;
  expect((await outcome).status).toBe('staged');
  expect(workers).toHaveLength(2);
  expect(workers[0].closed).toBe(true);
  expect(runtime.workers.get(device.id)).toBe(workers[1]);
  expect(runtime.store.get('active', 'combo').core.version).toBe('v2.0.0');
  expect(runtime.appUpdating).toBe(true);
});

test('shutdown while draining prevents installation from acquiring the gate', async () => {
  let complete!: (metadata: any) => void;
  const runtime = fixture({
    check: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  });
  const checking = runtime.updates.check('core');
  await Bun.sleep(10);
  const installing = runtime.handle('updates.activate', { channel: 'app' });
  const outcome = installing.catch((error) => error);
  const closing = runtime.close();
  complete({ version: 'v9.0.0' });
  await checking;
  await closing;
  expect(await outcome).toMatchObject({ code: -32011, message: '应用运行时正在退出' });
  expect(runtime.appUpdating).toBe(false);
  expect(runtime.appUpdatePreparing).toBe(false);
});

test('application and core release preferences default independently and survive saving and reopening', async () => {
  const runtime = fixture(),
    settings = runtime.snapshot().settings;
  expect(settings.autoUpdateApp).toBe(true);
  expect(settings.appUpdateChannel).toBe('preview');
  expect(settings.coreUpdateChannel).toBe('stable');
  const saved = await runtime.handle('settings.save', {
    settings: {
      ...settings,
      autoUpdateApp: false,
      appUpdateChannel: 'stable',
      coreUpdateChannel: 'preview',
    },
  });
  expect(saved.appUpdateChannel).toBe('stable');
  expect(saved.coreUpdateChannel).toBe('preview');
  await runtime.close();
  const reopened = new Runtime(runtime.root, { calendar: { fetcher: null } });
  runtimes.push(reopened);
  expect(reopened.snapshot().settings).toMatchObject({
    autoUpdateApp: false,
    appUpdateChannel: 'stable',
    coreUpdateChannel: 'preview',
  });
});

test('device inventory discovery reserves the installation gate before a worker or device ID exists', async () => {
  let finish!: (inventory: any) => void, entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const runtime = fixture();
  (runtime as any).options.emulatorInventory = () => {
    entered();
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const connecting = runtime.connectDevice({ address: '127.0.0.1:5555' });
  const rejected = connecting.catch(() => {});
  await started;
  expect(runtime.busy()).toBe(false);
  await expect(runtime.handle('updates.activate', { channel: 'app' })).rejects.toThrow(
    '空闲后安装',
  );
  expect(runtime.appUpdating).toBe(false);
  finish({ instances: [], diagnostics: [] });
  await rejected;
  await runtime.handle('updates.activate', { channel: 'app' });
  await expect(runtime.connectDevice({ address: '127.0.0.1:5555' })).rejects.toThrow('安装更新');
});

test('saving a different core channel drops its prepared preview without changing the installed version', async () => {
  const runtime = fixture();
  const settings = { ...runtime.snapshot().settings, coreUpdateChannel: 'preview' };
  await runtime.handle('settings.save', { settings });
  runtime.store.put('staged', 'core', {
    version: 'v6.22.0-beta.1',
    releaseChannel: 'preview',
    path: 'synthetic-unused-candidate',
  });
  runtime.store.put('update_metadata', 'core', {
    version: 'v6.22.0-beta.1',
    releaseChannel: 'preview',
  });
  runtime.store.put('update', 'core', {
    ...runtime.updates.channel('core'),
    status: 'staged',
    latestVersion: 'v6.22.0-beta.1',
  });
  await runtime.handle('settings.save', { settings: { ...settings, coreUpdateChannel: 'stable' } });
  expect(runtime.store.get('staged', 'core')).toBeUndefined();
  expect(runtime.store.get('update_metadata', 'core')).toBeUndefined();
  expect(runtime.updates.channel('core')).toMatchObject({
    status: 'idle',
    latestVersion: null,
    currentVersion: '未安装',
  });
});
