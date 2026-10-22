import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/runtime';
import { CoreWorker } from '../src/worker';
import type { EmulatorInventory } from '../src/windows-emulators';
import { defaultConnection, parseSettings } from '../src/models';

const runtimes: Runtime[] = [];
const worker = () => ({ events: [], connected: true, safeIdle: true, async connect() {}, async close() {}, async task() {}, async stop() {}, async waitConnected() { return true; } });
const inventory: EmulatorInventory = { instances: [
  { address: '127.0.0.1:16384', name: '合成主实例', index: 0, emulatorPath: 'D:\\synthetic', aliases: ['127.0.0.1:7555', '127.0.0.1:5555'] },
  { address: '127.0.0.1:18432', name: '合成多开', index: 32, emulatorPath: 'D:\\synthetic', aliases: [] },
], identities: { '127.0.0.1:16384': 'synthetic-mumu-pid:101', '127.0.0.1:5555': 'synthetic-mumu-pid:101', '127.0.0.1:7555': 'synthetic-mumu-pid:101', '127.0.0.1:18432': 'synthetic-mumu-pid:102' }, diagnostics: [] };
function runtime(factory: NonNullable<ConstructorParameters<typeof Runtime>[1]>['workerFactory'], metadata = async () => inventory) {
  const instance = new Runtime(mkdtempSync(path.join(tmpdir(), 'maaverge-emulator-leases-')), { workerFactory: factory, adbExecutable: () => 'synthetic-adb', emulatorInventory: metadata });
  runtimes.push(instance); instance.store.put('active', 'combo', { core: { path: 'synthetic-core', version: 'v1' }, resource: { path: 'synthetic-resource', version: 'r1' } }); return instance;
}
afterEach(async () => { for (const instance of runtimes.splice(0)) { await instance.close(); rmSync(instance.root, { recursive: true, force: true }); } });

test('manual aliases share one worker while multiple MuMu processes keep independent controllers', async () => {
  const configurations: any[] = [];
  const instance = runtime(async config => { configurations.push(config); return worker(); });
  const first = await instance.connectDevice({ address: 'localhost:7555' });
  for (const address of ['127.0.0.1:16384', 'emulator-5554', '[::1]:5555']) expect((await instance.connectDevice({ address })).id).toBe(first.id);
  const second = await instance.connectDevice({ address: '127.0.0.1:18432' });
  expect(second.id).not.toBe(first.id); expect(configurations).toHaveLength(2); expect(configurations[1].lockPath).not.toBe(configurations[0].lockPath);
  await instance.disconnectDevice(first.id); expect(instance.workers.has(second.id)).toBe(true);
});

test('shutdown during asynchronous emulator inspection prevents a late native controller', async () => {
  let finish!: (value: EmulatorInventory) => void, inspecting!: () => void, started = 0;
  const entered = new Promise<void>(resolve => { inspecting = resolve; });
  const metadata = new Promise<EmulatorInventory>(resolve => { finish = resolve; });
  const instance = runtime(async () => { started++; return worker(); }, () => { inspecting(); return metadata; });
  const connecting = instance.connectDevice({ address: '127.0.0.1:16384' }); await entered;
  // Observe the rejection immediately, before allowing shutdown to release data.
  const outcome = connecting.catch(error => error);
  instance.running = false; finish(inventory);
  expect((await outcome).message).toContain('连接已取消'); expect(started).toBe(0);
});

test('configured discovery retries a failed worker and respects manual disconnect under dynamic PID identities', async () => {
  const workers: ReturnType<typeof worker>[] = [];
  const instance = runtime(async () => { const created = worker(); workers.push(created); return created; });
  const address = '127.0.0.1:16384';
  await instance.handle('settings.save', { settings: parseSettings({ deviceProfiles: [{ id: 'main', name: '主实例', address,
    connection: defaultConnection(), capture: { method: 'adb', instanceIndex: 0, emulatorPath: '' } }] }) });
  const first = await instance.autoConnectDevices(); expect(first.devices).toHaveLength(1);
  workers[0].connected = false;
  const second = await instance.autoConnectDevices(true); expect(second.devices).toHaveLength(1); expect(workers).toHaveLength(2);
  await instance.disconnectDevice(second.devices[0].id);
  const suppressed = await instance.autoConnectDevices(true); expect(suppressed.devices).toEqual([]); expect(workers).toHaveLength(2);
});

const nativeWorker = process.env.MAAVERGE_TEST_NATIVE_WORKER;
test.skipIf(!nativeWorker)('independent data roots resolve different proven aliases to the same native lease', async () => {
  // Isolate test locks from any real PID/instance; only the lease-only worker runs.
  const token = crypto.randomUUID(), synthetic = { ...inventory, identities: Object.fromEntries(Object.entries(inventory.identities!).map(([key, value]) => [key, `${value}:${token}`])) };
  const factory = async (config: any) => {
    const lease = await CoreWorker.start({ lockPath: config.lockPath, userDir: config.userDir, lockTimeoutMs: 0 }, { leaseOnly: true, command: [nativeWorker!, '--lease-only'] });
    return { ...worker(), close: () => lease.close() };
  };
  const first = runtime(factory, async () => synthetic), second = runtime(factory, async () => synthetic);
  const owner = await first.connectDevice({ address: '127.0.0.1:7555' });
  await expect(second.connectDevice({ address: '127.0.0.1:16384' })).rejects.toThrow('设备连接失败');
  const separate = await second.connectDevice({ address: '127.0.0.1:18432' }); expect(separate).toBeDefined();
  await first.disconnectDevice(owner.id); expect(await second.connectDevice({ address: 'emulator-5554' })).toBeDefined();
});
