import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/runtime';
import { parseSettings } from '../src/models';

const roots: string[] = [], runtimes: Runtime[] = [];
function fixture(source?: any) {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-app-update-')); roots.push(root);
  const runtime = new Runtime(root, { source, calendar: { fetcher: null }, workerFactory: async () => { throw new Error('No device access'); } });
  runtimes.push(runtime); return runtime;
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('application installation gate blocks new work and automatic activity until explicitly cancelled', async () => {
  let checks = 0;
  const runtime = fixture({ check: () => { checks++; throw new Error('No network'); } });
  await runtime.updates.check('app');
  const state = await runtime.handle('updates.activate', { channel: 'app' });
  expect(state.status).toBe('staged'); expect(runtime.appUpdating).toBe(true);
  expect((await runtime.handle('app.snapshot')).mode).toBe('native');
  await expect(runtime.handle('run.start', {})).rejects.toThrow('准备安装更新');
  await expect(runtime.handle('device.connect', { address: '127.0.0.1:5555' })).rejects.toThrow('准备安装更新');
  await expect(runtime.handle('settings.save', { settings: parseSettings() })).rejects.toThrow('准备安装更新');
  (runtime as any).nextChecks = { core: 0, resource: 0 };
  await runtime.automaticUpdates(); await runtime.automaticConnections(); expect(checks).toBe(0);
  await runtime.handle('updates.rollback', { channel: 'app' });
  expect(runtime.appUpdating).toBe(false);
  expect((await runtime.handle('agent.message', { message: '刷1-7三次' })).mode).toBe('mock');
});

test('application installation rejects runs at a component boundary as well as busy native workers', async () => {
  const runtime = fixture(); await runtime.updates.check('app');
  runtime.store.put('run', 'held', { id: 'held', status: 'running' });
  runtime.store.put('execution', 'held', { boundaryWaiting: true });
  expect(runtime.busy()).toBe(false);
  await expect(runtime.handle('updates.activate', { channel: 'app' })).rejects.toThrow('空闲后安装');
  expect(runtime.appUpdating).toBe(false);
  runtime.store.delete('run', 'held');
  runtime.workers.set('busy', { safeIdle: false, close: async () => {} } as any);
  await expect(runtime.handle('updates.activate', { channel: 'app' })).rejects.toThrow('空闲后安装');
  runtime.workers.clear();
});

test('an in-flight component metadata check prevents application shutdown even before downloading', async () => {
  let complete!: (metadata: any) => void;
  const runtime = fixture({ check: () => new Promise(resolve => { complete = resolve; }) });
  const checking = runtime.updates.check('core');
  await Bun.sleep(10);
  expect(runtime.updates.pendingOperations).toBe(1);
  await expect(runtime.handle('settings.save', { settings: { ...runtime.snapshot().settings, coreUpdateChannel: 'preview' } })).rejects.toThrow('完成后再切换');
  await expect(runtime.handle('updates.activate', { channel: 'app' })).rejects.toThrow('空闲后安装');
  complete({ version: 'v9.0.0' }); await checking;
  expect(runtime.updates.pendingOperations).toBe(0);
  await runtime.handle('updates.activate', { channel: 'app' });
  expect(runtime.appUpdating).toBe(true);
});

test('application and core release preferences default independently and survive saving and reopening', async () => {
  const runtime = fixture(), settings = runtime.snapshot().settings;
  expect(settings.autoUpdateApp).toBe(true); expect(settings.appUpdateChannel).toBe('preview'); expect(settings.coreUpdateChannel).toBe('stable');
  const saved = await runtime.handle('settings.save', { settings: { ...settings, autoUpdateApp: false, appUpdateChannel: 'stable', coreUpdateChannel: 'preview' } });
  expect(saved.appUpdateChannel).toBe('stable'); expect(saved.coreUpdateChannel).toBe('preview');
  await runtime.close();
  const reopened = new Runtime(runtime.root, { calendar: { fetcher: null } }); runtimes.push(reopened);
  expect(reopened.snapshot().settings).toMatchObject({ autoUpdateApp: false, appUpdateChannel: 'stable', coreUpdateChannel: 'preview' });
});

test('device inventory discovery reserves the installation gate before a worker or device ID exists', async () => {
  let finish!: (inventory: any) => void, entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const runtime = fixture();
  (runtime as any).options.emulatorInventory = () => { entered(); return new Promise(resolve => { finish = resolve; }); };
  const connecting = runtime.connectDevice({ address: '127.0.0.1:5555' });
  const rejected = connecting.catch(() => {});
  await started;
  expect(runtime.busy()).toBe(false);
  await expect(runtime.handle('updates.activate', { channel: 'app' })).rejects.toThrow('空闲后安装');
  expect(runtime.appUpdating).toBe(false);
  finish({ instances: [], diagnostics: [] }); await rejected;
  await runtime.handle('updates.activate', { channel: 'app' });
  await expect(runtime.connectDevice({ address: '127.0.0.1:5555' })).rejects.toThrow('安装更新');
});

test('saving a different core channel drops its prepared preview without changing the installed version', async () => {
  const runtime = fixture();
  const settings = { ...runtime.snapshot().settings, coreUpdateChannel: 'preview' };
  await runtime.handle('settings.save', { settings });
  runtime.store.put('staged', 'core', { version: 'v6.22.0-beta.1', releaseChannel: 'preview', path: 'synthetic-unused-candidate' });
  runtime.store.put('update_metadata', 'core', { version: 'v6.22.0-beta.1', releaseChannel: 'preview' });
  runtime.store.put('update', 'core', { ...runtime.updates.channel('core'), status: 'staged', latestVersion: 'v6.22.0-beta.1' });
  await runtime.handle('settings.save', { settings: { ...settings, coreUpdateChannel: 'stable' } });
  expect(runtime.store.get('staged', 'core')).toBeUndefined(); expect(runtime.store.get('update_metadata', 'core')).toBeUndefined();
  expect(runtime.updates.channel('core')).toMatchObject({ status: 'idle', latestVersion: null, currentVersion: '未安装' });
});
