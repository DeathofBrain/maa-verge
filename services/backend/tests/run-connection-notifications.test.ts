import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/app/runtime';
import { parsePlan, parseSettings } from '../src/modules/settings/models';

const runtimes: Runtime[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) {
    await runtime.close();
    rmSync(runtime.root, { recursive: true, force: true });
  }
});

function fixture(probe: () => Promise<boolean> = async () => false, address = '127.0.0.1:16416') {
  const runtime = new Runtime(mkdtempSync(path.join(tmpdir(), 'maaverge-launch-notification-')), {
    adbExecutable: () => 'synthetic-adb',
    probeDeviceEndpoint: probe,
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
    }),
  );
  runtime.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource', version: 'r1' },
  });
  const device = { id: 'other-instance', name: '多开实例 2', address, state: 'offline' };
  runtime.store.put('device', device.id, device);
  const plan = parsePlan({
    id: 'daily',
    name: '日常',
    deviceId: device.id,
    tasks: [{ type: 'StartUp' }],
  });
  runtime.store.put('plan', plan.id, plan);
  const request = { planId: plan.id, deviceId: device.id, requestId: 'launch-request' };
  const notices = () =>
    runtime.store.events(100).filter((event) => event.type === 'run.connection_failed');
  return { runtime, device, plan, request, notices };
}
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

test('an explicit task launch on an unreachable local instance emits one scoped notice and no execution', async () => {
  const { runtime, device, request, notices } = fixture();
  await expect(runtime.startRun(request)).rejects.toThrow('设备尚未连接');
  await flush();
  expect(notices()).toHaveLength(1);
  expect(notices()[0].data).toMatchObject({
    requestId: request.requestId,
    deviceId: device.id,
    profileId: device.id,
    profileName: device.name,
    address: device.address,
    reason: 'emulator_unavailable',
  });
  await expect(runtime.startRun(request)).rejects.toThrow();
  await flush();
  expect(notices()).toHaveLength(1);
  expect(runtime.store.all('run')).toHaveLength(0);
});

test('a listening emulator, a remote target and an inconclusive probe stay silent', async () => {
  for (const [probe, address] of [
    [async () => true, '127.0.0.1:16416'],
    [async () => false, '192.0.2.10:5555'],
    [
      async () => {
        throw new Error('probe failed');
      },
      '127.0.0.1:16416',
    ],
  ] as const) {
    const { runtime, request, notices } = fixture(probe, address);
    await expect(runtime.startRun(request)).rejects.toThrow();
    await flush();
    expect(notices()).toHaveLength(0);
  }
});

test('passive device errors and task validation failures never trigger launch notices', async () => {
  let probes = 0;
  const { runtime, plan, request, notices } = fixture(async () => {
    probes++;
    return false;
  });
  runtime.emit('device.failed', 'background failure', { deviceId: request.deviceId });
  runtime.emit('device.connection_failed', 'background retry', { profileId: 'profile' });
  runtime.store.put('plan', plan.id, {
    ...plan,
    tasks: plan.tasks.map((task) => ({ ...task, enabled: false })),
  });
  await expect(runtime.startRun(request)).rejects.toThrow('至少需要启用一条任务');
  await flush();
  expect(probes).toBe(0);
  expect(notices()).toHaveLength(0);
});

test('a late unavailable result after exit or reconnection cannot send a notice', async () => {
  for (const change of ['exit', 'reconnect'] as const) {
    let release!: (value: boolean) => void;
    const { runtime, device, request, notices } = fixture(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await expect(runtime.startRun(request)).rejects.toThrow();
    if (change === 'exit') runtime.running = false;
    else runtime.workers.set(device.id, { connected: true } as any);
    release(false);
    await flush();
    expect(notices()).toHaveLength(0);
    runtime.workers.delete(device.id);
  }
});

test('update and scheduling occupancy do not classify a disconnected target as a launch failure', async () => {
  let probes = 0;
  const { runtime, request, plan, notices } = fixture(async () => {
    probes++;
    return false;
  });
  runtime.appUpdating = true;
  await expect(runtime.startRun(request)).rejects.toThrow('更新');
  runtime.appUpdating = false;
  await expect(runtime.startRun(request, plan, { id: 'schedule-occurrence' })).rejects.toThrow();
  await flush();
  expect(probes).toBe(0);
  expect(notices()).toHaveLength(0);
});
