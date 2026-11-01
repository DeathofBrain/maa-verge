import { afterEach, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RpcContract, ScreenFrame } from '@contracts/rpc-types';
import { Runtime } from '@backend/app/runtime';
import type {
  FrameworkConfiguration,
  FrameworkPort,
} from '@backend/infrastructure/native/framework-worker';
import type { FrameworkView } from '@backend/modules/framework/sessions';
import { mockPreviewImage } from '../../../tests/fixtures/preview-image';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [];
const runtimes: Runtime[] = [];
const image = () => ({ ...mockPreviewImage, canControl: true });
const acknowledged = () => ({ accepted: true, nativeSuccess: true });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('synthetic runtime condition did not settle');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
class FakeCore {
  events: any[] = [];
  connected = true;
  safeIdle = true;
  closed = false;
  frameResult: () => Promise<unknown> = async () => image();
  submitted: unknown[] = [];
  async frame() {
    return this.frameResult();
  }
  async click() {
    return { accepted: true };
  }
  async connect() {
    return { asyncId: 1 };
  }
  async waitConnected() {
    return this.connected && this.safeIdle;
  }
  async task(task: unknown) {
    this.submitted.push(task);
    this.safeIdle = false;
    return { taskId: this.submitted.length };
  }
  async stop() {
    this.safeIdle = true;
    return { stopping: true };
  }
  async close() {
    this.closed = true;
    this.connected = false;
  }
}
class FakeFramework implements FrameworkPort {
  connected = true;
  safeIdle = true;
  closed = false;
  calls: { operation: string; params: Record<string, unknown> }[] = [];
  result: (operation: string, params: Record<string, unknown>) => Promise<any> = async (
    operation,
  ) =>
    operation === 'recognize'
      ? {
          hit: true,
          matches: [{ text: '合成识别', box: [0, 0, 10, 10], score: 0.9 }],
          engine: 'maafw',
        }
      : acknowledged();
  async request(operation: string, params: Record<string, unknown> = {}) {
    this.calls.push({ operation, params: structuredClone(params) });
    this.safeIdle = false;
    try {
      return await this.result(operation, params);
    } finally {
      this.safeIdle = true;
    }
  }
  async connect() {
    return this.request('connect');
  }
  async frame() {
    this.calls.push({ operation: 'frame', params: {} });
    return image();
  }
  async click(x: number, y: number) {
    return this.request('click', { x, y });
  }
  async close() {
    this.closed = true;
    this.connected = false;
    this.calls.push({ operation: 'close', params: {} });
  }
}
async function fixture(options: { frameworkReaderIdleMs?: number } = {}) {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-framework-runtime-'));
  roots.push(root);
  const cores: FakeCore[] = [];
  const frameworks: { config: FrameworkConfiguration; worker: FakeFramework }[] = [];
  const controls: {
    resourceGate?: Promise<void>;
    resourceEntered?: () => void;
    launchError?: Error;
    native?: FakeFramework['result'];
  } = {};
  const view: FrameworkView = {
    path: path.join(root, 'framework-view'),
    generation: 'synthetic-resource-generation',
    sourcePaths: [path.join(root, 'core-resource')],
    ocrAvailable: true,
    templates: { 'home-button': 'home.png' },
  };
  const runtime = new Runtime(root, {
    ...options,
    workerFactory: async () => {
      const worker = new FakeCore();
      cores.push(worker);
      return worker;
    },
    adbExecutable: () => 'synthetic-adb',
    frameworkWorkerFactory: async (config) => {
      if (controls.launchError) throw controls.launchError;
      const worker = new FakeFramework();
      if (controls.native) worker.result = controls.native;
      frameworks.push({ config: structuredClone(config), worker });
      return worker;
    },
    frameworkResources: async () => {
      controls.resourceEntered?.();
      await controls.resourceGate;
      return structuredClone(view);
    },
  });
  runtimes.push(runtime);
  runtime.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource', version: 'r1' },
  });
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  device.state = 'idle';
  runtime.store.put('device', device.id, device);
  await runtime.handle('plan.save', {
    plan: { id: 'framework-plan', name: '合成控制会话', tasks: [{ type: 'Award' }] },
  });
  const start = (
    requestId = 'start-session',
  ): Promise<RpcContract['results']['control.session.start']> =>
    runtime.handle('control.session.start', { deviceId: device.id, requestId });
  const status = (): Promise<RpcContract['results']['control.session.get']> =>
    runtime.handle('control.session.get', { deviceId: device.id });
  const end = (
    session: RpcContract['results']['control.session.start'],
    requestId = 'end-session',
  ) =>
    runtime.handle('control.session.end', {
      deviceId: device.id,
      controlToken: session.controlToken,
      requestId,
    });
  const frame = (controlToken?: string): Promise<ScreenFrame> =>
    runtime.handle('device.frame', {
      deviceId: device.id,
      ...(controlToken ? { controlToken } : {}),
    });
  return { root, runtime, device, cores, frameworks, view, controls, start, status, end, frame };
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('MaaFW handoff requires idle MaaCore and keeps the original controller on rejection', async () => {
  const { start, cores, frameworks, status } = await fixture();
  cores[0]!.safeIdle = false;
  await expect(start()).rejects.toMatchObject({ code: -32011 });
  expect(cores[0]!.closed).toBe(false);
  expect(frameworks).toHaveLength(0);
  expect(await status()).toMatchObject({ owner: 'maacore', busy: true });
});

test('workflow sessions hold device ownership while idle and exclude tasks, connections and updates', async () => {
  const { runtime, device, cores, frameworks, start, status, end } = await fixture();
  expect(runtime.busy()).toBe(false);
  expect(await status()).toMatchObject({ owner: 'maacore', busy: false });
  const session = await start();
  expect(cores[0]!.closed).toBe(true);
  expect(frameworks).toHaveLength(1);
  expect(frameworks[0]!.config).toMatchObject({ mode: 'control', adb: 'synthetic-adb' });
  expect(frameworks[0]!.worker.safeIdle).toBe(true);
  expect(await status()).toMatchObject({
    owner: 'maafw',
    busy: true,
    sessionId: session.sessionId,
  });
  expect(await status()).not.toHaveProperty('controlToken');
  expect(runtime.busy()).toBe(true);
  for (const [method, params] of [
    ['run.start', { deviceId: device.id, planId: 'framework-plan', requestId: 'blocked-run' }],
    [
      'tool.start',
      { deviceId: device.id, kind: 'depot', clientType: 'Official', requestId: 'blocked-tool' },
    ],
    ['device.disconnect', { id: device.id }],
    ['device.connect', { address: device.address }],
  ] as const) {
    const [result] = await Promise.allSettled([runtime.handle(method, params)]);
    expect({ method, ...result }).toMatchObject({
      method,
      status: 'rejected',
      reason: { code: -32011 },
    });
  }
  await expect(runtime.beforeSwitch()).rejects.toThrow();
  expect(cores).toHaveLength(1);
  expect(await end(session)).toEqual({ ended: true });
  expect(frameworks[0]!.worker.closed).toBe(true);
  expect(await status()).toMatchObject({ owner: 'none', busy: false });
  expect(runtime.busy()).toBe(false);
});

test('session start and end request IDs remain idempotent without resurrecting released controllers', async () => {
  const { start, end, frameworks, status } = await fixture();
  const [first, duplicate] = await Promise.all([start(), start()]);
  expect(first).toEqual(duplicate);
  expect(frameworks).toHaveLength(1);
  expect(await end(first)).toEqual({ ended: true });
  expect(await end(first)).toEqual({ ended: true });
  expect(await start()).toEqual(first);
  expect(await status()).toMatchObject({ owner: 'none', busy: false });
  expect(frameworks).toHaveLength(1);
});

test('handoff invalidates old frames and UI previews cannot write to a host-owned MaaFW session', async () => {
  const { root, runtime, device, start, frame, frameworks, view } = await fixture();
  const old = await frame();
  expect(old.resourceGeneration).toMatch(/^maacore-resource-[a-f0-9]{32}$/u);
  const session = await start();
  expect(session.resourceGeneration).toBe(view.generation);
  const ui = await frame();
  expect(ui).toMatchObject({
    engine: 'maafw',
    sessionId: session.sessionId,
    canControl: false,
    fresh: true,
  });
  const point = { deviceId: device.id, x: 20, y: 30 };
  for (const [frameId, controlToken, requestId] of [
    [old.frameId, session.controlToken, 'old-core-frame'],
    [ui.frameId, undefined, 'ui-click'],
    [ui.frameId, 'forged', 'forged-click'],
  ] as const)
    await expect(
      runtime.handle('device.click', {
        ...point,
        frameId,
        requestId,
        ...(controlToken ? { controlToken } : {}),
      }),
    ).rejects.toMatchObject({ code: -32011 });
  const current = await frame(session.controlToken);
  expect(current).toMatchObject({
    engine: 'maafw',
    coordinateSpace: 'frame',
    canControl: true,
    resourceGeneration: session.resourceGeneration,
  });
  for (const generation of [
    old.resourceGeneration,
    session.resourceGeneration,
    current.resourceGeneration,
  ]) {
    expect(path.isAbsolute(generation!)).toBe(false);
    expect(generation).not.toContain(root);
    expect(generation).not.toBe(view.path);
  }
  expect(
    await runtime.handle('device.click', {
      ...point,
      frameId: current.frameId,
      requestId: 'host-click',
      controlToken: session.controlToken,
    }),
  ).toMatchObject({ accepted: true });
  expect(frameworks[0]!.worker.calls.filter((call) => call.operation === 'click')).toHaveLength(1);
  expect(JSON.stringify(runtime.snapshot())).not.toContain(session.controlToken);
  const persisted = runtime.store.db
    .query('SELECT value FROM objects UNION ALL SELECT data AS value FROM events')
    .all();
  expect(JSON.stringify(persisted)).not.toContain(session.controlToken);
});

test('MaaFW swipe and fixed keys share frame freshness, authorization and native acknowledgement gates', async () => {
  const { runtime, device, start, frame, frameworks } = await fixture();
  const session = await start();
  let current = await frame(session.controlToken);
  const swipe = {
    deviceId: device.id,
    controlToken: session.controlToken,
    frameId: current.frameId,
    requestId: 'navigation',
    x1: 10,
    y1: 10,
    x2: 100,
    y2: 100,
    profile: 'navigation',
    compensationDirection: 'left',
  };
  expect(await runtime.handle('device.swipe', swipe)).toEqual(acknowledged());
  expect(
    frameworks[0]!.worker.calls.find((call) => call.operation === 'swipe')?.params,
  ).toMatchObject({
    x1: 10,
    y1: 10,
    x2: 100,
    y2: 100,
    profile: 'navigation',
    compensationDirection: 'left',
  });
  await expect(
    runtime.handle('device.press_key', {
      deviceId: device.id,
      controlToken: session.controlToken,
      frameId: current.frameId,
      requestId: 'old-frame-key',
      key: 'back',
    }),
  ).rejects.toMatchObject({ code: -32011 });
  current = await frame(session.controlToken);
  expect(
    await runtime.handle('device.press_key', {
      deviceId: device.id,
      controlToken: session.controlToken,
      frameId: current.frameId,
      requestId: 'current-key',
      key: 'back',
    }),
  ).toEqual(acknowledged());
  expect(frameworks[0]!.worker.calls.filter((call) => call.operation === 'press_key')).toHaveLength(
    1,
  );
});

test('unknown native gesture outcomes stay deduplicated even after the frame has been invalidated', async () => {
  const { runtime, device, start, frame, frameworks } = await fixture();
  const session = await start();
  const current = await frame(session.controlToken);
  const pending = deferred<unknown>();
  const entered = deferred<void>();
  frameworks[0]!.worker.result = async (operation) => {
    if (operation === 'swipe') {
      entered.resolve();
      return pending.promise;
    }
    return acknowledged();
  };
  const params = {
    deviceId: device.id,
    controlToken: session.controlToken,
    frameId: current.frameId,
    requestId: 'uncertain-swipe',
    x1: 10,
    y1: 20,
    x2: 30,
    y2: 40,
  };
  const first = runtime.handle('device.swipe', params);
  await entered.promise;
  const duplicate = runtime.handle('device.swipe', params);
  const outcomes = Promise.allSettled([first, duplicate]);
  pending.reject(new Error('synthetic acknowledgement lost'));
  for (const outcome of await outcomes) {
    expect(outcome.status).toBe('rejected');
    if (outcome.status === 'rejected') expect(outcome.reason).toMatchObject({ code: -32040 });
  }
  await expect(runtime.handle('device.swipe', params)).rejects.toMatchObject({ code: -32040 });
  expect(frameworks[0]!.worker.calls.filter((call) => call.operation === 'swipe')).toHaveLength(1);
  await expect(runtime.handle('device.swipe', { ...params, x1: 11 })).rejects.toMatchObject({
    code: -32011,
  });
});

test('a host workflow releases its controller on completion, failure and abort', async () => {
  const { runtime, device, frameworks, status } = await fixture();
  expect(await runtime.withFrameworkSession(device.id, async () => 'completed')).toBe('completed');
  expect(frameworks.at(-1)!.worker.closed).toBe(true);
  expect(await status()).toMatchObject({ owner: 'none', busy: false });
  await expect(
    runtime.withFrameworkSession(device.id, async () => {
      throw new Error('workflow failed');
    }),
  ).rejects.toThrow('workflow failed');
  expect(frameworks.at(-1)!.worker.closed).toBe(true);
  const controller = new AbortController();
  const entered = deferred<void>();
  const finish = deferred<void>();
  const active = runtime.withFrameworkSession(
    device.id,
    async () => {
      entered.resolve();
      await finish.promise;
      return 'stopped';
    },
    controller.signal,
  );
  await entered.promise;
  controller.abort();
  // Allow the release promise to complete without advancing real time.
  for (let turn = 0; turn < 12; turn++) {
    if ((await status()).owner === 'none') break;
    await Promise.resolve();
  }
  expect(frameworks.at(-1)!.worker.closed).toBe(true);
  expect(await status()).toMatchObject({ owner: 'none', busy: false });
  finish.resolve();
  await active;
});

test('runtime shutdown closes MaaFW controllers and controller-free recognition workers', async () => {
  const { runtime, device, start, frame, frameworks } = await fixture();
  const source = await frame();
  await runtime.handle('vision.recognize', {
    deviceId: device.id,
    frameId: source.frameId,
    kind: 'ocr',
  });
  expect(frameworks.some((entry) => entry.config.mode === 'recognition')).toBe(true);
  await start();
  expect(frameworks.some((entry) => entry.config.mode === 'control')).toBe(true);
  await runtime.close();
  expect(frameworks.every((entry) => entry.worker.closed)).toBe(true);
});

test('switching reserves the device before resource preparation and rejects competing work', async () => {
  const { runtime, device, start, end, status, controls, cores, frameworks } = await fixture();
  const prepared = deferred<void>();
  controls.resourceGate = prepared.promise;
  const handingOff = start();
  try {
    expect(await status()).toMatchObject({ owner: 'switching', busy: true });
    expect(cores[0]!.closed).toBe(false);
    expect(frameworks).toHaveLength(0);
    await expect(start('competing-start')).rejects.toMatchObject({ code: -32011 });
    await expect(
      runtime.handle('run.start', {
        deviceId: device.id,
        planId: 'framework-plan',
        requestId: 'switching-run',
      }),
    ).rejects.toMatchObject({ code: -32011 });
    await expect(runtime.handle('device.disconnect', { id: device.id })).rejects.toMatchObject({
      code: -32011,
    });
    await expect(runtime.connectDevice({ address: device.address })).rejects.toMatchObject({
      code: -32011,
    });
  } finally {
    prepared.resolve();
    const session = await handingOff;
    await end(session);
  }
});

test('aborting resource preparation retains the connected idle MaaCore before controller detachment', async () => {
  const { runtime, device, controls, cores, frameworks, status } = await fixture();
  const prepared = deferred<void>();
  const entered = deferred<void>();
  controls.resourceGate = prepared.promise;
  controls.resourceEntered = () => entered.resolve();
  const controller = new AbortController();
  let reached = false;
  const active = runtime.withFrameworkSession(
    device.id,
    async () => {
      reached = true;
    },
    controller.signal,
  );
  void active.catch(() => {});
  await entered.promise;
  try {
    expect(await status()).toMatchObject({ owner: 'switching', busy: true });
    expect(cores[0]!.closed).toBe(false);
    controller.abort();
  } finally {
    prepared.resolve();
  }
  await expect(active).rejects.toMatchObject({ code: -32040 });
  expect(reached).toBe(false);
  expect(cores).toHaveLength(1);
  expect(cores[0]).toMatchObject({ connected: true, safeIdle: true, closed: false });
  expect(frameworks).toHaveLength(0);
  expect(runtime.store.get('device', device.id).state).toBe('idle');
  expect(await status()).toMatchObject({ owner: 'maacore', busy: false });
  expect(runtime.busy()).toBe(false);
});

test('switching rejects fresh screenshots and frame recognition before issuing native work', async () => {
  const { runtime, device, start, end, status, controls, cores, frameworks, frame } =
    await fixture();
  let screenshots = 0;
  cores[0]!.frameResult = async () => {
    screenshots++;
    return image();
  };
  const previous = await frame();
  const prepared = deferred<void>();
  const entered = deferred<void>();
  controls.resourceGate = prepared.promise;
  controls.resourceEntered = () => entered.resolve();
  const handingOff = start();
  await entered.promise;
  try {
    expect(await status()).toMatchObject({ owner: 'switching', busy: true });
    await expect(frame()).rejects.toMatchObject({ code: -32011 });
    await expect(
      runtime.handle('vision.recognize', {
        deviceId: device.id,
        frameId: previous.frameId,
        kind: 'ocr',
      }),
    ).rejects.toMatchObject({ code: -32011 });
    expect(screenshots).toBe(1);
    expect(cores[0]!.closed).toBe(false);
    expect(frameworks).toHaveLength(0);
  } finally {
    prepared.resolve();
    const session = await handingOff;
    await end(session);
  }
});

test('a MaaFW lease failure after MaaCore exit leaves the device offline without reconnect or replay', async () => {
  const { runtime, device, start, status, controls, cores, frameworks } = await fixture();
  controls.launchError = new Error('synthetic shared device lease already held');
  for (let retry = 0; retry < 2; retry++)
    await expect(start()).rejects.toMatchObject({ code: -32040 });
  expect(cores[0]!.closed).toBe(true);
  expect(cores).toHaveLength(1);
  expect(frameworks).toHaveLength(0);
  expect(runtime.store.get('device', device.id).state).toBe('offline');
  expect(await status()).toMatchObject({ owner: 'none', busy: false });
  expect(runtime.busy()).toBe(false);
});

test('aborting a rejected workflow cannot close a pre-existing host control session', async () => {
  const { runtime, device, start, end, status, frameworks } = await fixture();
  const original = await start();
  const controller = new AbortController();
  let reached = false;
  const rejected = runtime.withFrameworkSession(
    device.id,
    async () => {
      reached = true;
    },
    controller.signal,
  );
  controller.abort();
  await expect(rejected).rejects.toMatchObject({ code: -32011 });
  expect(reached).toBe(false);
  expect(frameworks[0]!.worker.closed).toBe(false);
  expect(await status()).toMatchObject({ owner: 'maafw', sessionId: original.sessionId });
  await end(original);
});

test('controller-free OCR consumes the current MaaCore frame and retains its freshness without handoff', async () => {
  const { runtime, device, frame, status, cores, frameworks, view } = await fixture();
  const current = await frame();
  const result = await runtime.handle('vision.recognize', {
    deviceId: device.id,
    frameId: current.frameId,
    kind: 'ocr',
    roi: [0, 0, 100, 100],
  });
  expect(result).toMatchObject({
    frameId: current.frameId,
    engine: 'maafw',
    resourceGeneration: view.generation,
    hit: true,
    fresh: true,
  });
  expect(result.resourceGeneration).not.toBe(view.path);
  expect(path.isAbsolute(result.resourceGeneration!)).toBe(false);
  expect(cores[0]!.closed).toBe(false);
  expect(await status()).toMatchObject({ owner: 'maacore', busy: false });
  expect(frameworks).toHaveLength(1);
  expect(frameworks[0]!.config).toMatchObject({ mode: 'recognition' });
  expect(frameworks[0]!.config).not.toHaveProperty('lockPath');
  expect(frameworks[0]!.config).not.toHaveProperty('adb');
  expect(
    frameworks[0]!.worker.calls.find((call) => call.operation === 'recognize')?.params,
  ).toMatchObject({
    kind: 'ocr',
    image: { data: current.data, width: current.width, height: current.height },
    roi: [0, 0, 100, 100],
  });
  expect(JSON.stringify(runtime.snapshot())).not.toContain(current.data);
  await runtime.handle('run.start', {
    deviceId: device.id,
    planId: 'framework-plan',
    requestId: 'core-reading',
  });
  const cached = await frame();
  expect(cached).toMatchObject({ canControl: false, fresh: false });
  expect(
    await runtime.handle('vision.recognize', {
      deviceId: device.id,
      frameId: cached.frameId,
      kind: 'ocr',
    }),
  ).toMatchObject({ fresh: false });
  expect(frameworks).toHaveLength(1);
  expect(cores[0]!.closed).toBe(false);
});

test('shutdown drains pending recognition preparation and never launches readers after closing', async () => {
  const { runtime, device, frame, controls, frameworks } = await fixture();
  const current = await frame();
  const prepared = deferred<void>();
  const entered = deferred<void>();
  controls.resourceGate = prepared.promise;
  controls.resourceEntered = () => entered.resolve();
  const recognition = runtime.handle('vision.recognize', {
    deviceId: device.id,
    frameId: current.frameId,
    kind: 'ocr',
  });
  void recognition.catch(() => {});
  await entered.promise;
  let closed = false;
  const closing = runtime.close().then(() => {
    closed = true;
  });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
    expect(frameworks).toHaveLength(0);
  } finally {
    prepared.resolve();
    await closing;
  }
  await expect(recognition).rejects.toThrow();
  expect(frameworks.every((entry) => entry.worker.closed)).toBe(true);
});

test('two devices serialize OCR through their shared generation reader without mixing frame identities', async () => {
  const { runtime, device, frame, controls, frameworks } = await fixture();
  const current = await frame();
  const other = await runtime.connectDevice({ address: '127.0.0.1:5557' });
  other.state = 'idle';
  runtime.store.put('device', other.id, other);
  const otherFrame: ScreenFrame = await runtime.handle('device.frame', { deviceId: other.id });
  const entered = deferred<void>();
  const release = deferred<void>();
  let active = 0,
    maximumActive = 0,
    calls = 0;
  controls.native = async (operation) => {
    if (operation !== 'recognize') return acknowledged();
    active++;
    maximumActive = Math.max(maximumActive, active);
    const ordinal = calls++;
    if (ordinal === 0) {
      entered.resolve();
      await release.promise;
    }
    active--;
    return { engine: 'maafw', hit: false, matches: [] };
  };
  const first = runtime.handle('vision.recognize', {
    deviceId: device.id,
    frameId: current.frameId,
    kind: 'ocr',
  });
  await entered.promise;
  const second = runtime.handle('vision.recognize', {
    deviceId: other.id,
    frameId: otherFrame.frameId,
    kind: 'ocr',
  });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(calls).toBe(1);
    expect(frameworks).toHaveLength(1);
  } finally {
    release.resolve();
  }
  const results = await Promise.all([first, second]);
  expect(results[0]).toMatchObject({ frameId: current.frameId });
  expect(results[1]).toMatchObject({ frameId: otherFrame.frameId });
  expect(calls).toBe(2);
  expect(maximumActive).toBe(1);
  expect(frameworks[0]!.worker.closed).toBe(false);
});

test('an idle recognition reader exits before a different resource generation can launch', async () => {
  const { root, runtime, device, frame, view, frameworks } = await fixture();
  const current = await frame();
  await runtime.handle('vision.recognize', {
    deviceId: device.id,
    frameId: current.frameId,
    kind: 'ocr',
  });
  const previous = frameworks[0]!.worker;
  view.generation = 'synthetic-resource-generation-2';
  view.path = path.join(root, 'framework-view-2');
  runtime.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource-2', version: 'r2' },
  });
  const other = await runtime.connectDevice({ address: '127.0.0.1:5557' });
  other.state = 'idle';
  runtime.store.put('device', other.id, other);
  const nextFrame: ScreenFrame = await runtime.handle('device.frame', { deviceId: other.id });
  const entered = deferred<void>();
  const release = deferred<void>();
  const close = previous.close.bind(previous);
  previous.close = async () => {
    entered.resolve();
    await release.promise;
    await close();
  };
  const replacement = runtime.handle('vision.recognize', {
    deviceId: other.id,
    frameId: nextFrame.frameId,
    kind: 'ocr',
  });
  void replacement.catch(() => {});
  await entered.promise;
  try {
    expect(frameworks).toHaveLength(1);
    expect(previous.closed).toBe(false);
  } finally {
    release.resolve();
  }
  expect(await replacement).toMatchObject({ resourceGeneration: view.generation });
  expect(previous.closed).toBe(true);
  expect(frameworks).toHaveLength(2);
  expect(frameworks[1]!.config).toMatchObject({ resource: view.path, mode: 'recognition' });
  expect(frameworks[1]!.worker.closed).toBe(false);
});

test('a busy recognition reader rejects another resource generation without starting a second process', async () => {
  const { root, runtime, device, frame, view, frameworks } = await fixture();
  const current = await frame();
  await runtime.handle('vision.recognize', {
    deviceId: device.id,
    frameId: current.frameId,
    kind: 'ocr',
  });
  const previous = frameworks[0]!.worker;
  view.generation = 'synthetic-resource-generation-2';
  view.path = path.join(root, 'framework-view-2');
  runtime.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource-2', version: 'r2' },
  });
  const other = await runtime.connectDevice({ address: '127.0.0.1:5557' });
  other.state = 'idle';
  runtime.store.put('device', other.id, other);
  const nextFrame: ScreenFrame = await runtime.handle('device.frame', { deviceId: other.id });
  const entered = deferred<void>();
  const release = deferred<void>();
  previous.result = async () => {
    entered.resolve();
    await release.promise;
    return { engine: 'maafw', hit: false, matches: [] };
  };
  const active = runtime.handle('vision.recognize', {
    deviceId: device.id,
    frameId: current.frameId,
    kind: 'ocr',
  });
  await entered.promise;
  try {
    await expect(
      runtime.handle('vision.recognize', {
        deviceId: other.id,
        frameId: nextFrame.frameId,
        kind: 'ocr',
      }),
    ).rejects.toMatchObject({
      code: -32011,
      message: expect.stringContaining('识别进程正在处理另一资源版本'),
    });
    expect(frameworks).toHaveLength(1);
    expect(previous.closed).toBe(false);
    expect(previous.calls.filter((call) => call.operation === 'recognize')).toHaveLength(2);
  } finally {
    release.resolve();
    await active;
  }
  expect(frameworks).toHaveLength(1);
  expect(previous.closed).toBe(false);
});

test('idle recognition readers are reclaimed and explicit requests rebuild them without ending control sessions', async () => {
  const { runtime, device, frame, start, status, frameworks } = await fixture({
    frameworkReaderIdleMs: 25,
  });
  const session = await start();
  const current = await frame(session.controlToken);
  await runtime.handle('vision.recognize', {
    deviceId: device.id,
    frameId: current.frameId,
    kind: 'ocr',
  });
  expect(frameworks).toHaveLength(2);
  const controller = frameworks.find((entry) => entry.config.mode === 'control')!.worker;
  const reader = frameworks.find((entry) => entry.config.mode === 'recognition')!.worker;
  await waitFor(() => reader.closed);
  expect(controller.closed).toBe(false);
  expect(await status()).toMatchObject({
    owner: 'maafw',
    busy: true,
    sessionId: session.sessionId,
  });
  const refreshed = await frame(session.controlToken);
  expect(
    await runtime.handle('vision.recognize', {
      deviceId: device.id,
      frameId: refreshed.frameId,
      kind: 'ocr',
    }),
  ).toMatchObject({ frameId: refreshed.frameId, resourceGeneration: session.resourceGeneration });
  expect(frameworks).toHaveLength(3);
  expect(frameworks[2]!.config.mode).toBe('recognition');
  expect(frameworks[2]!.worker.closed).toBe(false);
  expect(controller.closed).toBe(false);
});

test('a failed reader is closed and evicted so a fresh explicit recognition can create a new process', async () => {
  const { runtime, device, frame, controls, frameworks } = await fixture();
  const current = await frame();
  let attempts = 0;
  controls.native = async () => {
    if (attempts++ === 0) throw new Error('synthetic reader crashed');
    return { engine: 'maafw', hit: false, matches: [] };
  };
  await expect(
    runtime.handle('vision.recognize', {
      deviceId: device.id,
      frameId: current.frameId,
      kind: 'ocr',
    }),
  ).rejects.toThrow('synthetic reader crashed');
  expect(frameworks).toHaveLength(1);
  expect(frameworks[0]!.worker.closed).toBe(true);
  const refreshed = await frame();
  expect(
    await runtime.handle('vision.recognize', {
      deviceId: device.id,
      frameId: refreshed.frameId,
      kind: 'ocr',
    }),
  ).toMatchObject({ frameId: refreshed.frameId, hit: false });
  expect(frameworks).toHaveLength(2);
  expect(frameworks[1]!.worker.closed).toBe(false);
});

test('normal MaaFW release reconnects MaaCore only when an explicit mature task starts and retains run deduplication', async () => {
  const { runtime, device, cores, start, end, status } = await fixture();
  const session = await start();
  await end(session);
  expect(cores).toHaveLength(1);
  expect(cores[0]!.closed).toBe(true);
  expect(await status()).toMatchObject({ owner: 'none', busy: false });
  const params = { deviceId: device.id, planId: 'framework-plan', requestId: 'lazy-core-run' };
  const [first, duplicate] = await Promise.all([
    runtime.handle('run.start', params),
    runtime.handle('run.start', params),
  ]);
  expect(first.id).toBe(duplicate.id);
  expect(cores).toHaveLength(2);
  expect(cores[1]!.submitted).toHaveLength(1);
  expect(await runtime.handle('run.start', params)).toMatchObject({ id: first.id });
  expect(cores).toHaveLength(2);
  expect(cores[1]!.submitted).toHaveLength(1);
});

test('an active MaaFW workflow never takes the lazy MaaCore path for a mature task', async () => {
  const { runtime, device, cores, start } = await fixture();
  await start();
  await expect(
    runtime.handle('run.start', {
      deviceId: device.id,
      planId: 'framework-plan',
      requestId: 'no-lazy-core-while-owned',
    }),
  ).rejects.toMatchObject({ code: -32011 });
  expect(cores).toHaveLength(1);
  expect(cores[0]!.closed).toBe(true);
  expect(cores[0]!.submitted).toHaveLength(0);
});
