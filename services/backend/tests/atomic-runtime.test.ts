import { afterEach, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RpcContract, ScreenFrame } from '@contracts/rpc-types';
import { Runtime } from '@backend/app/runtime';
import type {
  FrameworkConfiguration,
  FrameworkCustomHandler,
  FrameworkInputObserver,
  FrameworkPort,
} from '@backend/infrastructure/native/framework-worker';
import type { FrameworkView } from '@backend/modules/framework/sessions';
import { mockPreviewImage } from '../../../tests/fixtures/preview-image';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';
import { syntheticPipeline } from '../../automation/tests/pipeline-fixture';

type DebugSession = RpcContract['results']['debug.session.start'];
type DebugResult = RpcContract['results']['debug.primitive.invoke'];
type Call = { operation: string; params: Record<string, unknown> };
const roots: string[] = [];
const runtimes: Runtime[] = [];
const acknowledged = () => ({ accepted: true, nativeSuccess: true });
const image = () => ({ ...mockPreviewImage, canControl: true });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

class FakeFramework implements FrameworkPort {
  connected = true;
  safeIdle = true;
  closed = false;
  closeFailures = 0;
  onClose?: () => void;
  calls: Call[] = [];
  inputEpoch = 0;
  standardPrelude: Array<'Click' | 'DoNothing'> = [];
  result: (operation: string, params: Record<string, unknown>) => Promise<unknown> = async (
    operation,
  ) =>
    operation === 'frame'
      ? image()
      : operation === 'recognize'
        ? { engine: 'maafw', hit: false, matches: [] }
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
  connect() {
    return this.request('connect');
  }
  frame() {
    return this.request('frame');
  }
  click(x: number, y: number) {
    return this.request('click', { x, y });
  }
  /** 测试宿主只替代官方节点运行；输入 epoch 模拟标准 Node.Action.Starting，不走 TS request。 */
  async runPipeline(
    entry: string,
    pipeline: Record<string, unknown>,
    custom: FrameworkCustomHandler,
    signal?: AbortSignal,
    onInputEpoch?: FrameworkInputObserver,
  ) {
    this.calls.push({ operation: 'pipeline', params: { entry } });
    const graph = structuredClone(pipeline);
    // 有名标准节点仅注入合成 worker，产品登记图和 Runtime 不接受额外 JSON 入口。
    for (const [index, action] of this.standardPrelude.splice(0).entries()) {
      const name = `Synthetic@InputRevision@${index}`;
      graph[name] = { action, next: [entry] };
      entry = name;
    }
    const run = syntheticPipeline({
      action: () => onInputEpoch?.(++this.inputEpoch),
    });
    await run(
      entry,
      graph,
      (node, params) => custom(node, params, { inputEpoch: this.inputEpoch }),
      { signal },
    );
    onInputEpoch?.(this.inputEpoch);
  }
  runContextPipeline(
    ...args: Parameters<NonNullable<FrameworkPort['runContextPipeline']>>
  ): Promise<void> {
    return this.runPipeline(...args);
  }
  async close() {
    this.calls.push({ operation: 'close', params: {} });
    if (this.closeFailures-- > 0) throw new Error('synthetic controller release failed');
    this.closed = true;
    this.connected = false;
    this.onClose?.();
  }
}

async function fixture(templates: Record<string, string> = {}) {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-atomic-runtime-'));
  roots.push(root);
  const frameworks: { config: FrameworkConfiguration; worker: FakeFramework }[] = [];
  let resourcePreparations = 0;
  const view: FrameworkView = {
    path: path.join(root, 'synthetic-framework-view'),
    generation: 'synthetic-framework-generation',
    sourcePaths: [path.join(root, 'missing-game-resource')],
    ocrAvailable: false,
    templates,
  };
  const runtime = new Runtime(root, {
    adbExecutable: () => 'synthetic-adb',
    frameworkWorkerFactory: async (config) => {
      const worker = new FakeFramework();
      frameworks.push({ config: structuredClone(config), worker });
      return worker;
    },
    frameworkResources: async () => {
      resourcePreparations++;
      return structuredClone(view);
    },
  });
  runtimes.push(runtime);
  runtime.store.put('active', 'combo', {
    resource: { path: view.sourcePaths[0], version: 'r1' },
  });
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  device.state = 'idle';
  runtime.store.put('device', device.id, device);
  let sequence = 0;
  const start = (requestId = 'debug-start'): Promise<DebugSession> =>
    runtime.handle('debug.session.start', { deviceId: device.id, requestId });
  const invoke = (
    session: DebugSession,
    primitiveId: string,
    input: Record<string, unknown> = {},
    requestId = `debug-invoke-${++sequence}`,
  ): Promise<DebugResult> =>
    runtime.handle('debug.primitive.invoke', {
      debugSessionId: session.debugSessionId,
      primitiveId,
      input,
      requestId,
    });
  const frame = async (session: DebugSession, requestId?: string): Promise<ScreenFrame> => {
    const result = await invoke(session, 'operation.frame', {}, requestId);
    expect(result.status).toBe('succeeded');
    expect(result.frame).toBeDefined();
    return result.frame!;
  };
  const end = (session: DebugSession, requestId = 'debug-end') =>
    runtime.handle('debug.session.end', { debugSessionId: session.debugSessionId, requestId });
  const status = (): Promise<RpcContract['results']['control.session.get']> =>
    runtime.handle('control.session.get', { deviceId: device.id });
  const effects = () => ({
    frameworks: frameworks.map(({ worker }) => structuredClone(worker.calls)),
    resourcePreparations,
  });
  // 只观测宿主内部状态，不为产品添加可变测试能力或公开 RPC。
  const inputRevision = () => runtime['frameworkInputRevision'](device.id);
  return {
    root,
    runtime,
    device,
    frameworks,
    start,
    invoke,
    frame,
    end,
    status,
    effects,
    inputRevision,
  };
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('primitive catalog reads metadata without preparing resources, connecting or invoking devices', async () => {
  const { runtime, device, effects, status } = await fixture();
  const before = effects();
  for (const params of [{}, { deviceId: device.id }]) {
    const catalog: RpcContract['results']['primitive.catalog.get'] = await runtime.handle(
      'primitive.catalog.get',
      params,
    );
    expect(new Set(catalog.items.map((item) => item.layer)).size).toBe(4);
    for (const id of [
      'operation.frame',
      'operation.click',
      'operation.long_press',
      'operation.drag',
    ])
      expect(catalog.items.find((item) => item.id === id)?.available).toBe(true);
    const unavailable = catalog.items.filter((item) => !item.available);
    expect(unavailable.length).toBeGreaterThan(0);
    expect(unavailable.every((item) => Boolean(item.unavailableReason))).toBe(true);
  }
  expect(effects()).toEqual(before);
  expect(await status()).toMatchObject({ owner: 'none', busy: false });
});

test('Debug uses opaque exclusive sessions and executes frame, click, long press and drag without game resources', async () => {
  const { runtime, device, frameworks, start, invoke, frame, end, status } = await fixture();
  const session = await start();
  expect(Object.keys(session).sort()).toEqual(['debugSessionId', 'deviceId']);
  expect(frameworks[0]!.config.mode).toBe('control');
  expect(await status()).toMatchObject({ owner: 'maafw', busy: true });
  for (const [primitiveId, params, nativeOperation] of [
    ['operation.click', { x: 20, y: 30 }, 'click'],
    ['operation.long_press', { x: 40, y: 50, durationMs: 650 }, 'long_press'],
    ['operation.drag', { x1: 60, y1: 70, x2: 200, y2: 220, durationMs: 800 }, 'drag'],
  ] as const) {
    const current = await frame(session);
    expect(current).toMatchObject({
      deviceId: device.id,
      engine: 'maafw',
      coordinateSpace: 'frame',
      canControl: true,
    });
    const result = await invoke(session, primitiveId, { frameId: current.frameId, ...params });
    expect(result).toMatchObject({ status: 'succeeded', nativeSuccess: true, verified: false });
    expect(
      frameworks[0]!.worker.calls.find((call) => call.operation === nativeOperation)?.params,
    ).toEqual(params);
  }
  const snapshot = JSON.stringify(runtime.snapshot());
  expect(snapshot).not.toContain(session.debugSessionId);
  expect(await end(session)).toEqual({ ended: true });
  expect(frameworks[0]!.worker.closed).toBe(false);
  expect(await status()).toMatchObject({ owner: 'none', busy: false });
});

test('Debug retries share their original session, frame and action outcome without replaying unknown gestures', async () => {
  const { frameworks, start, invoke, frame, end, status } = await fixture();
  const [session, same] = await Promise.all([start(), start()]);
  expect(same).toEqual(session);
  expect(frameworks).toHaveLength(1);
  const [current, sameFrame] = await Promise.all([
    frame(session, 'frame-retry'),
    frame(session, 'frame-retry'),
  ]);
  expect(sameFrame).toEqual(current);
  expect(frameworks[0]!.worker.calls.filter((call) => call.operation === 'frame')).toHaveLength(1);
  const pending = deferred<unknown>();
  const entered = deferred<void>();
  frameworks[0]!.worker.result = async (operation) => {
    if (operation === 'drag') {
      entered.resolve();
      return pending.promise;
    }
    return acknowledged();
  };
  const input = { frameId: current.frameId, x1: 10, y1: 20, x2: 30, y2: 40, durationMs: 300 };
  const first = invoke(session, 'operation.drag', input, 'unknown-drag');
  await entered.promise;
  const retry = invoke(session, 'operation.drag', input, 'unknown-drag');
  pending.reject(new Error('synthetic acknowledgement lost'));
  const result = await first;
  expect(result.status).toBe('unknown');
  expect(await retry).toEqual(result);
  expect(await invoke(session, 'operation.drag', input, 'unknown-drag')).toEqual(result);
  expect(frameworks[0]!.worker.calls.filter((call) => call.operation === 'drag')).toHaveLength(1);
  await expect(
    invoke(session, 'operation.drag', { ...input, x1: 11 }, 'unknown-drag'),
  ).rejects.toMatchObject({ code: -32011 });
  expect(await end(session)).toEqual({ ended: true });
  expect(await end(session)).toEqual({ ended: true });
  expect(await start()).toEqual(session);
  expect(frameworks).toHaveLength(1);
  expect(await status()).toMatchObject({ owner: 'none', busy: false });
});

test('Debug rejects stale frames and invalid coordinates before mutation and invalidates each action frame', async () => {
  const { runtime, device, frameworks, start, invoke, frame } = await fixture();
  const old: ScreenFrame = await runtime.handle('device.frame', { deviceId: device.id });
  const session = await start();
  const stale = await invoke(session, 'operation.click', { frameId: old.frameId, x: 10, y: 20 });
  expect(stale.status).not.toBe('succeeded');
  expect(stale.data.message).toContain('画面');
  expect(frameworks[0]!.worker.calls.filter((call) => call.operation === 'click')).toHaveLength(0);
  const current = await frame(session);
  const outside = await invoke(session, 'operation.click', {
    frameId: current.frameId,
    x: current.width,
    y: 0,
  });
  expect(outside.status).toBe('failed');
  expect(outside.verified).toBe(false);
  expect(frameworks[0]!.worker.calls.filter((call) => call.operation === 'click')).toHaveLength(0);
  const valid = await frame(session);
  expect(
    await invoke(session, 'operation.click', { frameId: valid.frameId, x: 10, y: 20 }),
  ).toMatchObject({ status: 'succeeded' });
  const reused = await invoke(session, 'operation.long_press', {
    frameId: valid.frameId,
    x: 10,
    y: 20,
    durationMs: 500,
  });
  expect(reused.status).not.toBe('succeeded');
  expect(
    frameworks[0]!.worker.calls.filter((call) => call.operation === 'long_press'),
  ).toHaveLength(0);
});

test('host input revision counts each admitted L1 attempt once, including a lost acknowledgement', async () => {
  const { frameworks, start, invoke, frame, inputRevision } = await fixture();
  const session = await start();
  expect(inputRevision()).toBe(0);
  const actions = [
    ['operation.click', { x: 20, y: 30 }],
    ['operation.swipe', { x1: 10, y1: 20, x2: 30, y2: 40, durationMs: 100 }],
    ['operation.press_key', { key: 'back' }],
    ['operation.long_press', { x: 40, y: 50, durationMs: 100 }],
    ['operation.drag', { x1: 10, y1: 20, x2: 30, y2: 40, durationMs: 100 }],
  ] as const;
  for (const [index, [id, input]] of actions.entries()) {
    const current = await frame(session);
    expect(inputRevision()).toBe(index);
    const params = { frameId: current.frameId, ...input };
    const request = `revision-input-${index}`;
    const result = await invoke(session, id, params, request);
    expect(result.status).toBe('succeeded');
    expect(inputRevision()).toBe(index + 1);
    expect(await invoke(session, id, params, request)).toEqual(result);
    expect(inputRevision()).toBe(index + 1);
  }
  const current = await frame(session);
  frameworks[0]!.worker.result = async (operation) => {
    if (operation === 'click') throw new Error('synthetic acknowledgement lost');
    return acknowledged();
  };
  const input = { frameId: current.frameId, x: 10, y: 20 };
  const unknown = await invoke(session, 'operation.click', input, 'revision-unknown');
  expect(unknown.status).toBe('unknown');
  expect(inputRevision()).toBe(6);
  expect(await invoke(session, 'operation.click', input, 'revision-unknown')).toEqual(unknown);
  expect(inputRevision()).toBe(6);
  expect(
    await invoke(session, 'operation.click', { ...input, x: current.width }),
  ).not.toMatchObject({ status: 'succeeded' });
  expect(inputRevision()).toBe(6);
});

test('read-only and pure roots retain revision while unrelated L2 and standard native actions advance it', async () => {
  const { runtime, device, frameworks, start, invoke, frame, inputRevision } = await fixture({
    'Registered.png': 'image/Registered.png',
  });
  const session = await start();
  const current = await frame(session);
  await runtime.handle('primitive.catalog.get', { deviceId: device.id });
  expect(
    await invoke(session, 'operation.recognize', {
      frameId: current.frameId,
      kind: 'template',
      templateId: 'Registered.png',
    }),
  ).toMatchObject({ status: 'succeeded', verified: true });
  expect(await invoke(session, 'composite.delay', { ms: 0 })).toMatchObject({
    status: 'succeeded',
  });
  expect(inputRevision()).toBe(0);
  // 标准节点绕过 TS 输入端口；两次输入、多次同 epoch 通知只累计两次真实尝试。
  frameworks[0]!.worker.standardPrelude = ['Click', 'DoNothing', 'Click'];
  expect(await invoke(session, 'composite.delay', { ms: 0 })).toMatchObject({
    status: 'succeeded',
  });
  expect(inputRevision()).toBe(2);
  expect(await invoke(session, 'composite.delay', { ms: 0 })).toMatchObject({
    status: 'succeeded',
  });
  expect(inputRevision()).toBe(2);
  // 其他能力通过 L2 导航，再进入同类页面也必须使旧准备的宿主 revision 不匹配。
  expect(await invoke(session, 'composite.press_key', { key: 'back' })).toMatchObject({
    status: 'succeeded',
  });
  expect(inputRevision()).toBe(3);
  expect(
    await invoke(session, 'composite.click_box', { frame: 'current', box: [10, 20, 30, 40] }),
  ).toMatchObject({ status: 'succeeded' });
  expect(inputRevision()).toBe(4);
  expect(await invoke(session, 'composite.delay', { ms: 0 })).toMatchObject({
    status: 'succeeded',
  });
  expect(inputRevision()).toBe(4);
});

test('Debug cannot adopt or release an existing host control session', async () => {
  const { runtime, device, frameworks, start, status } = await fixture();
  const host: RpcContract['results']['control.session.start'] = await runtime.handle(
    'control.session.start',
    { deviceId: device.id, requestId: 'host-start' },
  );
  await expect(start()).rejects.toMatchObject({ code: -32011 });
  expect(
    await runtime.handle('debug.session.end', {
      debugSessionId: host.sessionId,
      requestId: 'cannot-release-host',
    }),
  ).toEqual({ ended: true });
  expect(frameworks).toHaveLength(1);
  expect(frameworks[0]!.worker.closed).toBe(false);
  expect(await status()).toMatchObject({ owner: 'maafw', sessionId: host.sessionId });
  const current: ScreenFrame = await runtime.handle('device.frame', {
    deviceId: device.id,
    controlToken: host.controlToken,
  });
  expect(current.canControl).toBe(true);
  await runtime.handle('control.session.end', {
    deviceId: device.id,
    controlToken: host.controlToken,
    requestId: 'host-end',
  });
});

test('Debug RGBCount resolves only registered templates and preserves its bounded native parameters', async () => {
  const { frameworks, start, invoke, frame } = await fixture({
    'InfrastMfg.png': 'image/InfrastMfg.png',
  });
  const session = await start();
  const current = await frame(session);
  const input = {
    frameId: current.frameId,
    kind: 'template',
    templateId: 'InfrastMfg.png',
    method: 'RGBCount',
    pureColor: true,
    colorScales: [
      [
        [200, 100, 0],
        [255, 255, 100],
      ],
    ],
    colorWithClose: false,
    nmsDistance: 40,
  };
  expect(await invoke(session, 'operation.recognize', input)).toMatchObject({
    status: 'succeeded',
    verified: true,
  });
  // Recognition gets a controller-free worker distinct from the Debug controller.
  const reader = frameworks[1]!.worker;
  expect(reader.calls.find((call) => call.operation === 'recognize')?.params).toMatchObject({
    template: 'InfrastMfg.png',
    method: 'RGBCount',
    pureColor: true,
    colorScales: input.colorScales,
    colorWithClose: false,
    nmsDistance: 40,
  });
  const calls = reader.calls.length;
  expect(
    await invoke(session, 'operation.recognize', { ...input, pureColor: false }),
  ).toMatchObject({
    status: 'failed',
  });
  expect(
    await invoke(session, 'operation.recognize', { ...input, templateId: 'unregistered.png' }),
  ).toMatchObject({ status: 'failed' });
  expect(reader.calls).toHaveLength(calls);
});

for (const closing of ['debug.session.end', 'runtime.close'] as const) {
  test(`${closing} cancels an in-flight Debug action and releases its controller`, async () => {
    const { runtime, frameworks, start, invoke, frame, end } = await fixture();
    const session = await start();
    const current = await frame(session);
    const pending = deferred<unknown>();
    const entered = deferred<void>();
    const worker = frameworks[0]!.worker;
    worker.result = async (operation) => {
      if (operation === 'long_press') {
        entered.resolve();
        return pending.promise;
      }
      return acknowledged();
    };
    worker.onClose = () => pending.reject(new Error('synthetic worker closed during action'));
    const previous = worker.result;
    worker.result = async (operation, params) => {
      if (operation === 'stop') {
        pending.reject(new Error('synthetic task cancelled'));
        return acknowledged();
      }
      return previous(operation, params);
    };
    const active = invoke(session, 'operation.long_press', {
      frameId: current.frameId,
      x: 10,
      y: 20,
      durationMs: 10000,
    });
    await entered.promise;
    if (closing === 'runtime.close') await runtime.close();
    else await end(session);
    expect(await active).toMatchObject({ status: 'cancelled' });
    expect(worker.closed).toBe(closing === 'runtime.close');
    expect(worker.calls.filter((call) => call.operation === 'long_press')).toHaveLength(1);
    await expect(
      invoke(session, 'operation.click', {
        frameId: current.frameId,
        x: 10,
        y: 20,
      }),
    ).rejects.toMatchObject({ code: -32011 });
  });
}

test('ending an idle Debug session preserves the resident Controller and reuses it next time', async () => {
  const { frameworks, start, invoke, end, status } = await fixture();
  const session = await start();
  const worker = frameworks[0]!.worker;
  await invoke(session, 'operation.frame');
  expect(await end(session)).toEqual({ ended: true });
  expect(worker.closed).toBe(false);
  expect(await status()).toMatchObject({ owner: 'none', busy: false });
  const next = await start('next-session');
  expect(next.debugSessionId).not.toBe(session.debugSessionId);
  expect(frameworks).toHaveLength(1);
  expect(await end(next, 'end-next')).toEqual({ ended: true });
});
