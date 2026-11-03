import { afterEach, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime, type RuntimeOptions } from '@backend/app/runtime';
import { parseSettings } from '@backend/modules/settings/models';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function sdk(directory: string, target: string) {
  const library = target.startsWith('windows')
    ? 'MaaFramework.dll'
    : target.startsWith('macos')
      ? 'libMaaFramework.dylib'
      : 'libMaaFramework.so';
  await mkdir(path.join(directory, 'bin'), { recursive: true });
  await mkdir(path.join(directory, 'share/MaaAgentBinary'), { recursive: true });
  await writeFile(path.join(directory, 'bin', library), 'synthetic library');
  await writeFile(path.join(directory, 'share/MaaAgentBinary/LICENSE'), 'synthetic license');
}
function fixture(options: RuntimeOptions = {}) {
  const root = makeTemporaryDirectorySync(
    path.join(tmpdir(), 'maaverge-framework-update-runtime-'),
  );
  roots.push(root);
  let controllerClosed = false;
  const runtime = new Runtime(root, {
    calendar: { fetcher: null },
    source: {
      check: () => {
        throw new Error('synthetic offline source');
      },
    },
    validator: async () => {},
    adbExecutable: () => 'synthetic-adb',
    frameworkWorkerFactory: async () => ({
      connected: true,
      safeIdle: true,
      connect: async () => ({ accepted: true, nativeSuccess: true }),
      frame: async () => ({}),
      click: async () => ({}),
      request: async () => ({}),
      close: async () => {
        controllerClosed = true;
      },
    }),
    frameworkResources: async () => ({
      path: path.join(root, 'synthetic-view'),
      generation: 'view-1',
      sourcePaths: [],
      ocrAvailable: false,
      templates: {},
    }),
    ...options,
    frameworkUpdates: { prepareSdk: sdk, validate: async () => {}, ...options.frameworkUpdates },
  });
  runtimes.push(runtime);
  runtime.store.put('active', 'combo', {
    resource: { path: path.join(root, 'synthetic-resource'), version: 'r1' },
  });
  return { root, runtime, controllerClosed: () => controllerClosed };
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('framework update RPC is independent of the resource channel', async () => {
  const { runtime } = fixture();
  expect(runtime.snapshot().updates.map((item) => item.id)).toEqual([
    'app',
    'resource',
    'framework',
  ]);
  expect(runtime.updates.channels().map((item) => item.id)).toEqual(['app', 'resource']);
  const before = runtime.store.get('active', 'combo');
  expect(await runtime.handle('updates.check', { channel: 'framework' })).toMatchObject({
    id: 'framework',
    currentVersion: '未安装',
    latestVersion: 'v5.14.3',
    status: 'available',
  });
  await runtime.handle('updates.prepare', { channel: 'framework' });
  expect(await runtime.handle('updates.activate', { channel: 'framework' })).toMatchObject({
    currentVersion: 'v5.14.3',
    status: 'active',
  });
  expect(runtime.store.get('active', 'combo')).toEqual(before);
  expect((await runtime.frameworkUpdates.resolveInstalledSdk()).version).toBe('v5.14.3');
});

test('framework installation waits for the complete control session and activates after release', async () => {
  const { runtime, controllerClosed } = fixture();
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  const session = await runtime.handle('control.session.start', {
    deviceId: device.id,
    requestId: 'start-framework-update-session',
  });
  await runtime.handle('updates.prepare', { channel: 'framework' });
  expect(await runtime.handle('updates.activate', { channel: 'framework' })).toMatchObject({
    status: 'waiting_idle',
  });
  expect(runtime.controlSessions.owns(device.id)).toBe(true);
  expect(runtime.store.get('active', 'framework')).toBeUndefined();
  await runtime.activatePendingUpdates();
  expect(runtime.frameworkUpdates.channel().status).toBe('waiting_idle');
  await runtime.handle('control.session.end', {
    deviceId: device.id,
    controlToken: session.controlToken,
    requestId: 'end-framework-update-session',
  });
  await runtime.activatePendingUpdates();
  expect(runtime.frameworkUpdates.channel().status).toBe('active');
  expect(controllerClosed()).toBe(true); // Activation closes the old SDK controller before reconnecting.
  expect((runtime as any).switching).toBe(false);
});

test('legacy settings saves preserve the framework preference and install directory', async () => {
  const { root, runtime } = fixture();
  const directory = path.join(root, 'custom-framework');
  await runtime.handle('settings.save', {
    settings: {
      ...runtime.snapshot().settings,
      autoUpdateFramework: false,
      componentPaths: { ...runtime.snapshot().settings.componentPaths, framework: directory },
    },
  });
  const legacy = structuredClone(runtime.snapshot().settings);
  delete legacy.autoUpdateFramework;
  delete legacy.componentPaths!.framework;
  const saved = await runtime.handle('settings.save', { settings: legacy });
  expect(saved.autoUpdateFramework).toBe(false);
  expect(saved.componentPaths.framework).toBe(directory);
  const reset = await runtime.handle('settings.save', {
    settings: {
      ...saved,
      componentPaths: { ...saved.componentPaths, framework: '' },
    },
  });
  expect(reset.componentPaths.framework).toBe(path.join(root, 'components/framework'));
});

test('application installation drains an in-flight framework check and gates further work', async () => {
  const entered = deferred<void>(),
    result = deferred<Response>();
  const { runtime } = fixture({
    frameworkUpdates: {
      fetcher: (async () => {
        entered.resolve();
        return result.promise;
      }) as unknown as typeof fetch,
    },
  });
  runtime.store.put('settings', 'main', {
    ...runtime.snapshot().settings,
    mirrorChyan: { enabled: true, cdk: '' },
  });
  const checking = runtime.handle('updates.check', { channel: 'framework' });
  await entered.promise;
  const installing = runtime.handle('updates.activate', { channel: 'app' });
  expect(runtime.appUpdatePreparing).toBe(true);
  expect(runtime.appUpdating).toBe(false);
  await expect(runtime.handle('updates.prepare', { channel: 'framework' })).rejects.toThrow(
    '准备安装更新',
  );
  result.resolve(Response.json({ code: 8001 }));
  await checking;
  await installing;
  expect(runtime.appUpdating).toBe(true);
});

test('framework directory validation preserves a concurrent save from another settings form', async () => {
  const { root, runtime } = fixture();
  const entered = deferred<void>(),
    release = deferred<void>();
  const validate = runtime.frameworkUpdates.validateDirectory.bind(runtime.frameworkUpdates);
  runtime.frameworkUpdates.validateDirectory = async (directory) => {
    entered.resolve();
    await release.promise;
    await validate(directory);
  };
  const changingDirectory = runtime.handle('settings.save', {
    settings: {
      ...runtime.snapshot().settings,
      componentPaths: {
        ...runtime.snapshot().settings.componentPaths,
        framework: path.join(root, 'new-framework'),
      },
    },
  });
  await entered.promise;
  await runtime.handle('settings.save', {
    settings: { ...runtime.snapshot().settings, theme: 'dark' },
  });
  release.resolve();
  await changingDirectory;
  expect(runtime.snapshot().settings.theme).toBe('dark');
  expect(runtime.snapshot().settings.componentPaths!.framework).toBe(
    path.join(root, 'new-framework'),
  );
});

test('a control session starting during directory validation still protects connection settings', async () => {
  const { root, runtime } = fixture();
  const original = structuredClone(runtime.snapshot().settings);
  const entered = deferred<void>(),
    release = deferred<void>();
  const validate = runtime.frameworkUpdates.validateDirectory.bind(runtime.frameworkUpdates);
  runtime.frameworkUpdates.validateDirectory = async (directory) => {
    entered.resolve();
    await release.promise;
    await validate(directory);
  };
  const changing = runtime.handle('settings.save', {
    settings: {
      ...original,
      connection: { ...original.connection, clientType: 'Bilibili' },
      componentPaths: {
        ...original.componentPaths,
        framework: path.join(root, 'blocked-framework'),
      },
    },
  });
  const outcome = changing.catch((error) => error);
  await entered.promise;
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  await runtime.handle('control.session.start', {
    deviceId: device.id,
    requestId: 'protect-settings-session',
  });
  release.resolve();
  expect(await outcome).toBeInstanceOf(Error);
  expect(runtime.snapshot().settings.connection).toEqual(original.connection);
  expect(runtime.snapshot().settings.componentPaths).toEqual(original.componentPaths);
  expect(runtime.controlSessions.owns(device.id)).toBe(true);
});

test('framework automatic installation has its own preference and check schedule', async () => {
  let prepared = 0;
  const { runtime } = fixture({
    frameworkUpdates: {
      prepareSdk: async (directory, target) => {
        prepared++;
        await sdk(directory, target);
      },
    },
  });
  runtime.store.put(
    'settings',
    'main',
    parseSettings({
      ...runtime.snapshot().settings,
      autoUpdateResource: false,
      autoUpdateFramework: false,
    }),
  );
  (runtime as any).nextChecks = { framework: 0 };
  await runtime.automaticUpdates();
  expect(prepared).toBe(0);
  runtime.store.put('settings', 'main', {
    ...runtime.snapshot().settings,
    autoUpdateFramework: true,
  });
  await runtime.automaticUpdates();
  expect(prepared).toBe(1);
  expect(runtime.frameworkUpdates.channel().status).toBe('active');
});

test('resource generation maintenance preserves an independent installed framework', async () => {
  const { root, runtime } = fixture();
  const shared = path.join(root, 'shared-components');
  await runtime.handle('settings.save', {
    settings: {
      ...runtime.snapshot().settings,
      componentPaths: { resource: shared, framework: shared },
    },
  });
  await runtime.handle('updates.prepare', { channel: 'framework' });
  await runtime.handle('updates.activate', { channel: 'framework' });
  const installed = await runtime.frameworkUpdates.resolveInstalledSdk();
  await runtime.handle('settings.save', {
    settings: {
      ...runtime.snapshot().settings,
      componentPaths: {
        ...runtime.snapshot().settings.componentPaths,
        resource: path.join(root, 'another-resource'),
      },
    },
  });
  expect(
    JSON.parse(await readFile(path.join(installed.path, 'maafw-manifest.json'), 'utf8')).version,
  ).toBe('v5.14.3');
  expect((await runtime.frameworkUpdates.resolveInstalledSdk()).path).toBe(installed.path);
});
