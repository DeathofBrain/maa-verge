import { afterEach, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMaaToolHost } from '@backend/app/agent-tools';
import { Runtime } from '@backend/app/runtime';
import { parseSettings } from '@backend/modules/settings/models';
import type { Plan } from '@contracts/types';
import { mockPreviewImage } from '../../../tests/fixtures/preview-image';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [];
class Worker {
  events: any[] = [];
  connected = true;
  safeIdle = true;
  tasks: any[] = [];
  clicks: number[][] = [];
  stops = 0;
  frameError?: Error;
  clickError?: Error;
  taskError?: Error;
  async connect() {
    return { asyncId: 1 };
  }
  async waitConnected() {
    return this.connected && this.safeIdle;
  }
  async task(task: any) {
    this.tasks.push(structuredClone(task));
    if (this.taskError) throw this.taskError;
    this.safeIdle = false;
    return { taskId: this.tasks.length };
  }
  async frame() {
    if (this.frameError) throw this.frameError;
    return { ...mockPreviewImage, canControl: true };
  }
  async click(x: number, y: number) {
    this.clicks.push([x, y]);
    if (this.clickError) throw this.clickError;
    return { accepted: true as const };
  }
  async stop() {
    this.stops++;
    return { stopping: true };
  }
  async close() {
    this.connected = false;
    this.safeIdle = true;
  }
}
function instrument(runtime: Runtime, calls: { method: string; params: any }[] = []) {
  return createMaaToolHost({
    handle(method, params) {
      calls.push({ method, params: structuredClone(params) });
      return runtime.handle(method, params);
    },
    snapshot: () => runtime.snapshot(),
    validatePolicy: (plan) => runtime.validatePolicy(plan),
    deviceClient: (id) => runtime.deviceClient(id),
    startRun(params, snapshot) {
      calls.push({ method: 'run.start', params: structuredClone(params) });
      return runtime.startRun(params, snapshot);
    },
    copilot: { workspaceGet: (params) => runtime.copilot.workspaceGet(params) },
  });
}
async function fixture() {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-agent-tools-'));
  roots.push(root);
  const worker = new Worker();
  const runtime = new Runtime(root, {
    workerFactory: async () => worker,
    validator: async () => {},
    adbExecutable: () => 'synthetic-adb',
    calendar: { fetcher: null },
  });
  runtimes.push(runtime);
  runtime.store.put(
    'settings',
    'main',
    parseSettings({
      autoConnect: false,
      autoUpdateApp: false,
      autoUpdateCore: false,
      autoUpdateResource: false,
    }),
  );
  runtime.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource', version: 'r1' },
  });
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  device.state = 'idle';
  runtime.store.put('device', device.id, device);
  const plan: Plan = await runtime.handle('plan.save', {
    plan: { name: '合成任务表', tasks: [{ type: 'Fight', params: { stage: '1-7', times: 1 } }] },
  });
  const calls: { method: string; params: any }[] = [],
    host = instrument(runtime, calls);
  return { runtime, worker, device, plan, calls, host };
}
function reverseKeys(value: any): any {
  return Array.isArray(value)
    ? value.map(reverseKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, item]) => [key, reverseKeys(item)]),
        )
      : value;
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}, 30_000);

test('device and plan lists project the snapshot without settings, events or generic RPC', async () => {
  const { runtime, device, plan, host, calls } = await fixture();
  expect(await host.listDevices()).toEqual(runtime.snapshot().devices);
  expect(await host.listPlans()).toEqual([plan]);
  expect((await host.listDevices())[0].id).toBe(device.id);
  expect(calls).toEqual([]);
  expect(host).not.toHaveProperty('handle');
  expect(host).not.toHaveProperty('store');
  expect(host).not.toHaveProperty('worker');
  expect(host).not.toHaveProperty('snapshot');
});

test('draft preparation uses backend normalization and deterministic native policy without persisting', async () => {
  const { runtime, host } = await fixture();
  const draft = host.preparePlan({
    name: '待核验',
    tasks: [{ type: 'Fight', params: { stage: '1-7', times: 2 } }],
  });
  expect(draft).toMatchObject({
    id: '',
    enabled: true,
    deviceId: null,
    tasks: [{ enabled: true }],
  });
  expect(runtime.snapshot().plans).toHaveLength(1);
  expect(() => host.preparePlan({ tasks: [] })).toThrow();
  expect(() =>
    host.preparePlan({
      name: '危险参数',
      tasks: [{ type: 'Fight', params: { shell: 'arbitrary' } }],
    }),
  ).toThrow();
  expect(() =>
    host.preparePlan({ name: '无效消耗', tasks: [{ type: 'Fight', params: { medicine: -1 } }] }),
  ).toThrow();
});

test('plan changes while host authorization is pending reject before run.start', async () => {
  const { runtime, worker, device, plan, host, calls } = await fixture();
  let authorize!: () => void;
  const permission = new Promise<void>((resolve) => {
    authorize = resolve;
  });
  const pending = (async () => {
    await permission;
    return host.startPlan(
      { planId: plan.id, deviceId: device.id, requestId: 'reviewed-plan' },
      plan,
      'Official',
    );
  })();
  await runtime.handle('plan.save', {
    plan: { ...plan, tasks: [{ type: 'Fight', params: { stage: '1-7', times: 2 } }] },
  });
  authorize();
  await expect(pending).rejects.toMatchObject({ code: -32011 });
  expect(calls.filter((call) => call.method === 'run.start')).toEqual([]);
  expect(worker.tasks).toEqual([]);
  expect(runtime.snapshot().runs).toEqual([]);
});

test('workspace changes while host authorization is pending reject before copilot.start', async () => {
  const { runtime, worker, device, host, calls } = await fixture();
  const workspace = await host.getCopilotWorkspace('Copilot');
  let authorize!: () => void;
  const permission = new Promise<void>((resolve) => {
    authorize = resolve;
  });
  const pending = (async () => {
    await permission;
    return host.startCopilot(
      { kind: 'Copilot', deviceId: device.id, requestId: 'reviewed-copilot' },
      workspace,
      'Official',
    );
  })();
  await runtime.handle('copilot.workspace.save', {
    workspace: { ...workspace, options: { ...workspace.options, loopTimes: 2 } },
  });
  authorize();
  await expect(pending).rejects.toMatchObject({ code: -32011 });
  expect(calls.filter((call) => call.method === 'copilot.start')).toEqual([]);
  expect(worker.tasks).toEqual([]);
  expect(runtime.snapshot().runs).toEqual([]);
});

test('remembered and configured client changes during approval reject both start ports before admission', async () => {
  for (const source of ['remembered', 'settings'] as const) {
    const { runtime, worker, device, plan, host, calls } = await fixture();
    const workspace = await host.getCopilotWorkspace('Copilot');
    let authorize!: () => void;
    const permission = new Promise<void>((resolve) => {
      authorize = resolve;
    });
    const planStart = (async () => {
      await permission;
      return host.startPlan(
        { planId: plan.id, deviceId: device.id, requestId: 'client-plan' },
        plan,
        'Official',
      );
    })();
    const copilotStart = (async () => {
      await permission;
      return host.startCopilot(
        { kind: 'Copilot', deviceId: device.id, requestId: 'client-copilot' },
        workspace,
        'Official',
      );
    })();
    if (source === 'remembered') runtime.store.put('device_client', device.id, 'Bilibili');
    else {
      const settings = runtime.snapshot().settings;
      runtime.store.put(
        'settings',
        'main',
        parseSettings({
          ...settings,
          connection: { ...settings.connection, clientType: 'Bilibili' },
        }),
      );
    }
    const outcomes = [planStart, copilotStart].map((pending) =>
      pending.then(
        (value) => ({ value }),
        (error) => ({ error }),
      ),
    );
    authorize();
    for (const outcome of await Promise.all(outcomes)) {
      expect(outcome).toMatchObject({
        error: { code: -32011, message: expect.stringContaining('客户端已变更') },
      });
    }
    expect(calls.filter((call) => ['run.start', 'copilot.start'].includes(call.method))).toEqual(
      [],
    );
    expect(worker.tasks).toEqual([]);
    expect(runtime.snapshot().runs).toEqual([]);
  }
});

test('explicit task clients cannot differ from the approved host client', async () => {
  const { runtime, worker, device, host } = await fixture();
  const plan: Plan = await runtime.handle('plan.save', {
    plan: {
      name: '其他客户端',
      tasks: [{ type: 'Fight', params: { stage: '1-7', times: 1, client_type: 'Bilibili' } }],
    },
  });
  await expect(
    host.startPlan(
      { planId: plan.id, deviceId: device.id, requestId: 'mismatched-task' },
      plan,
      'Official',
    ),
  ).rejects.toMatchObject({ code: -32011 });
  expect(worker.tasks).toEqual([]);
  expect(runtime.snapshot().runs).toEqual([]);
});

test('later tasks retain the approved client when ambient device defaults change', async () => {
  const { runtime, worker, device, host } = await fixture();
  const plan: Plan = await runtime.handle('plan.save', {
    plan: {
      name: '固定客户端',
      tasks: [
        { type: 'Fight', params: { stage: '1-7', times: 1 } },
        { type: 'Fight', params: { stage: 'CE-6', times: 1 } },
      ],
    },
  });
  const original = structuredClone(plan);
  const run = await host.startPlan(
    { planId: plan.id, deviceId: device.id, requestId: 'bound-plan' },
    plan,
    'Official',
  );
  const snapshot = runtime.store.get('run_plan', run.id);
  expect(snapshot.tasks.map((task: any) => task.params.client_type)).toEqual([
    'Official',
    'Official',
  ]);
  expect(runtime.store.get('plan', plan.id)).toEqual(original);
  expect(plan).toEqual(original);
  runtime.store.put('device_client', device.id, 'Bilibili');
  worker.safeIdle = true;
  worker.events.push(
    { type: 'callback', message: 10002, details: { taskid: 1 } },
    { type: 'callback', message: 3, details: { taskid: 1 } },
    { type: 'status', running: false, pendingAsync: [] },
  );
  await runtime.tick(true);
  expect(worker.tasks).toHaveLength(2);
  expect(worker.tasks[1].params).toMatchObject({ client_type: 'Official', stage: 'CE-6' });
  expect((await host.getRun(run.id)).status).toBe('running');
});

test('equivalent object ordering starts once and preserves persistent requestId deduplication', async () => {
  const { runtime, worker, device, plan, host, calls } = await fixture();
  const params = { planId: plan.id, deviceId: device.id, requestId: 'stable-host-request' };
  const run = await host.startPlan(params, reverseKeys(plan), 'Official');
  expect((await host.startPlan(params, plan, 'Official')).id).toBe(run.id);
  expect(worker.tasks).toHaveLength(1);
  expect(runtime.store.get('request', params.requestId)).toMatchObject({
    runId: run.id,
    planId: plan.id,
  });
  expect(calls.filter((call) => call.method === 'run.start').map((call) => call.params)).toEqual([
    params,
    params,
  ]);
  expect(await host.getRun(run.id)).toEqual(await runtime.handle('run.detail', { id: run.id }));
  await host.stopRun(run.id);
  expect(worker.stops).toBe(1);
});

test('the final plan comparison does not yield before the runtime freezes execution inputs', async () => {
  const { runtime, worker, device, plan } = await fixture();
  const changed = {
    ...plan,
    name: '随后编辑',
    tasks: [{ ...plan.tasks[0], params: { stage: '1-7', times: 3 } }],
  };
  const host = createMaaToolHost({
    handle: (method, params) => runtime.handle(method, params),
    validatePolicy: (value) => runtime.validatePolicy(value),
    deviceClient: (id) => runtime.deviceClient(id),
    startRun: (params, snapshot) => runtime.startRun(params, snapshot),
    copilot: { workspaceGet: (params) => runtime.copilot.workspaceGet(params) },
    snapshot() {
      const snapshot = runtime.snapshot();
      queueMicrotask(() => runtime.store.put('plan', plan.id, changed));
      return snapshot;
    },
  });
  const run = await host.startPlan(
    { planId: plan.id, deviceId: device.id, requestId: 'no-yield' },
    plan,
    'Official',
  );
  expect(runtime.store.get('run_plan', run.id)).toMatchObject({
    name: plan.name,
    tasks: [{ params: { times: 1 } }],
  });
  expect(runtime.store.get('plan', plan.id).name).toBe(changed.name);
  expect(worker.tasks[0].params.times).toBe(1);
});

test('workspace field ordering passes through to the fixed copilot RPC and preserves its validation', async () => {
  const { device, host, calls, worker } = await fixture();
  const workspace = await host.getCopilotWorkspace('Copilot');
  const params = {
    kind: 'Copilot' as const,
    deviceId: device.id,
    requestId: 'empty-reviewed-workspace',
  };
  await expect(host.startCopilot(params, reverseKeys(workspace), 'Official')).rejects.toThrow(
    '请先勾选至少一份作业',
  );
  expect(calls.at(-1)).toEqual({ method: 'copilot.start', params });
  expect(worker.tasks).toEqual([]);
});

test('fixed status, recognition, frame and click ports preserve runtime gates and uncertain native errors', async () => {
  const { runtime, worker, device, plan, host, calls } = await fixture();
  expect(await host.deviceStatus({ deviceId: device.id })).toMatchObject({
    available: true,
    owner: 'none',
  });
  expect(
    await host.getRecognition({ deviceId: device.id, clientType: 'Official', kind: 'depot' }),
  ).toMatchObject({ deviceId: device.id, items: [] });
  const frame = await host.getFrame({ deviceId: device.id });
  const click = {
    deviceId: device.id,
    frameId: frame.frameId,
    x: 7,
    y: 9,
    requestId: 'click-identity',
  };
  expect(await host.click(click)).toEqual({ accepted: true });
  expect(await host.click(click)).toEqual({ accepted: true });
  expect(worker.clicks).toEqual([[7, 9]]);
  worker.clickError = new Error('synthetic lost acknowledgement');
  const nextFrame = await host.getFrame({ deviceId: device.id });
  const uncertain = { ...click, frameId: nextFrame.frameId, requestId: 'uncertain-click' };
  await expect(host.click(uncertain)).rejects.toMatchObject({
    code: -32040,
    message: expect.stringContaining('结果可能未知'),
  });
  await expect(host.click(uncertain)).rejects.toMatchObject({ code: -32040 });
  expect(worker.clicks).toHaveLength(2);
  const run = await host.startPlan(
    { planId: plan.id, deviceId: device.id, requestId: 'occupy' },
    plan,
    'Official',
  );
  await expect(
    host.startTool({
      kind: 'depot',
      deviceId: device.id,
      clientType: 'Official',
      requestId: 'busy-tool',
      config: {},
    }),
  ).rejects.toMatchObject({ code: -32011 });
  expect(await host.deviceStatus({ deviceId: device.id })).toMatchObject({
    available: false,
    owner: 'run',
    ownerId: run.id,
  });
  expect(calls.find((call) => call.method === 'device.click')?.params).toEqual(click);
  expect(runtime.snapshot().runs).toHaveLength(1);
});

test('tool jobs use fixed start/get/stop ports and retain runtime request identity', async () => {
  const { device, host, calls, runtime } = await fixture();
  const params = {
    kind: 'depot' as const,
    deviceId: device.id,
    clientType: 'Official' as const,
    requestId: 'tool-identity',
    config: {},
  };
  const job = await host.startTool(params);
  expect((await host.startTool(params)).id).toBe(job.id);
  expect((await host.getTool(job.id)).id).toBe(job.id);
  expect((await host.stopTool(job.id)).id).toBe(job.id);
  expect(calls.filter((call) => call.method === 'tool.start').map((call) => call.params)).toEqual([
    params,
    params,
  ]);
  expect(runtime.store.all('tool_job')).toHaveLength(1);
});

test('native submission failure remains a failed run with the backend evidence message', async () => {
  const { worker, device, plan, host } = await fixture();
  worker.taskError = new Error('synthetic native failure');
  const run = await host.startPlan(
    { planId: plan.id, deviceId: device.id, requestId: 'native-failure' },
    plan,
    'Official',
  );
  expect(run).toMatchObject({
    status: 'failed',
    message: expect.stringContaining('synthetic native failure'),
  });
  expect((await host.getRun(run.id)).status).toBe('failed');
  expect(worker.tasks).toHaveLength(1);
});
