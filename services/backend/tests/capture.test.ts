import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { captureAdbPath, connectionCapture, ldPlayerPid } from '../src/capture';
import { deviceLockAddress } from '../src/adb';
import { parseSettings } from '../src/models';
import { Runtime } from '../src/runtime';
import { validateWorkerConfiguration } from '../../../packages/contracts/src/validators.js';
import { configuredAdbPath } from '../src/adb';

const roots: string[] = [];
const temporary = () => { const root = mkdtempSync(path.join(tmpdir(), 'maaverge-capture-')); roots.push(root); return root; };
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });

test('legacy settings keep ADB and capture settings validate without accepting arbitrary extras', () => {
  expect(parseSettings().capture).toBeUndefined();
  expect(parseSettings({ capture: {} }).capture).toEqual({ method: 'adb', emulatorPath: '', instanceIndex: 0 });
  for (const capture of [null, { method: 'shell' }, { method: 'mumu', instanceIndex: -1 }, { instanceIndex: 1.5 }, { pid: 12 }]) {
    expect(() => parseSettings({ capture })).toThrow();
  }
});

test('connection settings reject unsupported native options and normalize legacy settings without adding defaults', () => {
  expect(parseSettings().connection).toBeUndefined();
  expect(parseSettings({ connection: {} }).connection?.touchMode).toBe('minitouch');
  for (const connection of [null, { config: 'arbitrary' }, { touchMode: 'shell' }, { adbLite: 'yes' }, { command: 'unsafe' }]) expect(() => parseSettings({ connection })).toThrow();
  expect(() => parseSettings({ capture: { method: 'adb', mumuTouch: true } })).toThrow('MuMu');
  expect(() => parseSettings({ capture: { method: 'ldplayer', mumuBridge: true } })).toThrow('MuMu');
});

test('configured ADB supports explicit existing files or PATH discovery without executing them', () => {
  const root = temporary(), adb = path.join(root, process.platform === 'win32' ? 'adb.exe' : 'adb');
  writeFileSync(adb, 'synthetic, never executed');
  expect(configuredAdbPath(adb)).toBe(realpathSync(adb));
  expect(configuredAdbPath('adb', { PATH: root, MAAVERGE_ADB_PATH: 'missing' })).toBe(realpathSync(adb));
  expect(() => configuredAdbPath('./adb')).toThrow('绝对路径');
});

test('explicit connection profile and touch preferences reach the worker without changing active connections', async () => {
  const root = temporary(), configs: any[] = [];
  const worker = { events: [] as any[], connected: false, safeIdle: true, async connect() {}, async close() {}, async task() {}, async stop() {}, async waitConnected() { return false; } };
  const runtime = new Runtime(root, { workerFactory: async config => { configs.push(config); return worker; }, adbExecutable: () => 'synthetic-adb' });
  try {
    runtime.store.put('active', 'combo', { core: { path: 'synthetic-core', version: 'v1' }, resource: { path: 'synthetic-resource', version: 'r1' } });
    const settings = parseSettings({ connection: { config: 'BlueStacks', touchMode: 'maatouch', adbLite: true, clientType: 'Bilibili' } });
    await runtime.handle('settings.save', { settings });
    const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
    expect(configs[0].connection).toEqual({ config: 'BlueStacks', touchMode: 'maatouch', adbLite: true, clientType: 'Bilibili' });
    expect(validateWorkerConfiguration({ ...configs[0], protocolVersion: 1 })).toBe(true);
    await runtime.handle('settings.save', { settings: parseSettings({ connection: { config: 'AVD', touchMode: 'MaaFwAdb' } }) });
    expect((await runtime.connectDevice({ address: device.address })).id).toBe(device.id);
    expect(configs).toHaveLength(1);
    await runtime.disconnectDevice(device.id);
    await runtime.connectDevice({ address: device.address });
    expect(configs[1].connection.touchMode).toBe('MaaFwAdb');
  } finally { await runtime.close(); }
});

test('MuMu bridge requires explicit selection and preserves the selected local SDK instance', async () => {
  const root = temporary(), sdk = path.join(root, 'shell/sdk'); mkdirSync(sdk, { recursive: true });
  writeFileSync(path.join(sdk, 'external_renderer_ipc.dll'), 'synthetic, never loaded');
  const capture = { method: 'mumu' as const, emulatorPath: root, instanceIndex: 2, mumuBridge: true, mumuTouch: true };
  const result = await connectionCapture(capture, '192.168.1.22:5555', 'win32');
  expect(result.mumuTouch).toBe(true);
  expect(result.instanceIndex).toBe(2);
  await expect(connectionCapture({ ...capture, mumuBridge: false }, '192.168.1.22:5555', 'win32')).rejects.toThrow('本机');
});

test.skipIf(process.platform !== 'win32')('MuMu bridge and standard serial use one worker and shared lease even after settings edits', async () => {
  const root = temporary(), sdk = path.join(root, 'shell/sdk'), configs: any[] = [];
  mkdirSync(sdk, { recursive: true }); writeFileSync(path.join(sdk, 'external_renderer_ipc.dll'), 'synthetic, never loaded');
  const worker = { events: [] as any[], connected: false, safeIdle: true, async connect() {}, async close() {}, async task() {}, async stop() {}, async waitConnected() { return false; } };
  const runtime = new Runtime(root, { workerFactory: async config => { configs.push(config); return worker; }, adbExecutable: () => 'synthetic-adb' });
  try {
    runtime.store.put('active', 'combo', { core: { path: 'synthetic-core', version: 'v1' }, resource: { path: 'synthetic-resource', version: 'r1' } });
    await runtime.handle('settings.save', { settings: parseSettings({ capture: { method: 'mumu', emulatorPath: root, instanceIndex: 2, mumuBridge: true } }) });
    const bridge = await runtime.connectDevice({ address: '192.168.1.22:5555' });
    expect((await runtime.connectDevice({ address: 'emulator-5558' })).id).toBe(bridge.id);
    expect(configs).toHaveLength(1);
    expect(validateWorkerConfiguration({ ...configs[0], protocolVersion: 1 })).toBe(true);
    await runtime.handle('settings.save', { settings: parseSettings({ capture: { method: 'mumu', emulatorPath: root, instanceIndex: 3, mumuBridge: true } }) });
    expect((await runtime.connectDevice({ address: bridge.address })).id).toBe(bridge.id);
    expect(configs).toHaveLength(1);
    await runtime.disconnectDevice(bridge.id);
    await runtime.handle('settings.save', { settings: parseSettings({ capture: { method: 'mumu', emulatorPath: root, instanceIndex: 2, mumuBridge: true } }) });
    const serial = await runtime.connectDevice({ address: 'emulator-5558' });
    expect(serial.id).toBe(bridge.id);
    expect(configs[1].lockPath).toBe(configs[0].lockPath);
  } finally { await runtime.close(); }
});

test('MuMu 15 SDK uses the root and rejects wrong instance or remote devices before connection', async () => {
  const root = temporary(), sdk = path.join(root, 'nx_device/15.0/shell/sdk'); mkdirSync(sdk, { recursive: true });
  writeFileSync(path.join(sdk, 'external_renderer_ipc.dll'), 'synthetic, never loaded');
  mkdirSync(path.join(root, 'nx_main')); writeFileSync(path.join(root, 'nx_main/adb.exe'), 'synthetic, never executed');
  const capture = { method: 'mumu' as const, emulatorPath: root, instanceIndex: 2 };
  expect(await connectionCapture(capture, '127.0.0.1:16448', 'win32')).toEqual({ ...capture, emulatorPath: realpathSync(root) });
  expect(captureAdbPath(capture)).toBe(path.join(root, 'nx_main/adb.exe'));
  await expect(connectionCapture(capture, '127.0.0.1:16384', 'win32')).rejects.toThrow('不匹配');
  await expect(connectionCapture(capture, 'remote:16448', 'win32')).rejects.toThrow('本机');
  await expect(connectionCapture(capture, '127.0.0.1:16448', 'darwin')).rejects.toThrow('Windows');
  await expect(connectionCapture({ ...capture, emulatorPath: temporary() }, '127.0.0.1:16448', 'win32')).rejects.toThrow('SDK');
});

test('LDPlayer PID is selected from the running requested instance and never guessed', () => {
  expect(ldPlayerPid('0,默认,1,2,1,1024,1025\r\n2,多开,3,4,1,2048,2049', 2)).toBe(2048);
  for (const output of ['2,未启动,0,0,0,0,0', '2,坏进程,0,0,1,NaN,0', '0,其他,0,0,1,100,101']) expect(() => ldPlayerPid(output, 2)).toThrow();
});

test('MuMu SDK selection unifies the actual emulator serial and TCP aliases', () => {
  expect(deviceLockAddress('emulator-5554')).toBe(deviceLockAddress('127.0.0.1:16384'));
  expect(deviceLockAddress('emulator-5558')).toBe(deviceLockAddress('localhost:16448'));
  expect(deviceLockAddress('emulator-5554')).toBe('127.0.0.1:5555');
});

test('native connection records core capture evidence and preserves preferences across restart', async () => {
  const root = temporary();
  const worker = { events: [] as any[], connected: false, safeIdle: true, async connect() {}, async close() {}, async task() {}, async stop() {}, async waitConnected() { return false; } };
  const runtime = new Runtime(root, { workerFactory: async () => worker, adbExecutable: () => 'synthetic-adb' });
  try {
    runtime.store.put('active', 'combo', { core: { path: 'synthetic-core', version: 'v1' }, resource: { path: 'synthetic-resource', version: 'r1' } });
    const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
    expect(runtime.snapshot().devices[0].captureMethod).toBeUndefined();
    worker.events.push({ type: 'callback', message: 2, details: { what: 'FastestWayToScreencap', details: { method: 'MumuExtras', cost: 8 } } });
    await runtime.pollNativeWorkers();
    expect(runtime.snapshot().devices[0].captureMethod).toBe('MumuExtras');
    expect(runtime.snapshot().events.some(e => e.type === 'device.capture')).toBe(true);
    const capture = { method: 'mumu', emulatorPath: root, instanceIndex: 0 };
    await runtime.handle('settings.save', { settings: { capture } });
    expect(runtime.store.get('device', device.id).captureMethod).toBe('MumuExtras');
    worker.events.push({ type: 'callback', message: 2, details: { what: 'Disconnect', why: 'RequiredCaptureProtocolUnavailable', details: { error: 'expected MumuExtras, selected RawByNc' } } });
    await runtime.pollNativeWorkers();
    expect(runtime.snapshot().devices[0].state).toBe('offline');
    expect(runtime.snapshot().devices[0].captureMethod).toBeUndefined();
    expect(runtime.snapshot().events.some(e => e.message.includes('expected MumuExtras'))).toBe(true);
  } finally { await runtime.close(); }
  const reopened = new Runtime(root);
  try { expect(reopened.snapshot().settings.capture?.method).toBe('mumu'); } finally { await reopened.close(); }
});
