import { expect, test } from 'bun:test';
import {
  Vision,
  createCapabilityRegistry,
  createCompositeCapabilities,
  type AtomicExecutionPort,
  type AtomicRecognition,
  type VisionResourceProfile,
} from '@maaverge/automation';
import { unexpectedPipeline, syntheticPipeline } from './pipeline-fixture';

const frame = () => ({ frameId: 'scaled-frame', width: 1280, height: 960, data: 'synthetic' });
const profile = (): VisionResourceProfile => ({
  rules: {
    button: {
      id: 'button',
      kind: 'template',
      templateId: 'button.png',
      roi: [50, 60, 100, 40],
      source: { repository: 'fixture', ref: 'synthetic', path: 'memory' },
    },
  },
  actions: {},
});
const recognition = (): AtomicRecognition => ({
  hit: true,
  coordinateSize: [640, 480],
  matches: [{ box: [50, 60, 100, 40], score: 1 }],
});

test('generic Vision keeps 640x480 recognition coordinates and scales clicks to the device frame', async () => {
  const calls: Array<{ operation: string; input: Record<string, unknown> }> = [];
  const port: AtomicExecutionPort = {
    runPipeline: unexpectedPipeline,
    async execute(operation, input) {
      calls.push({ operation, input });
      if (operation === 'frame') return frame();
      if (operation === 'recognize') return recognition();
      if (operation === 'click') return { accepted: true };
      throw new Error('unexpected primitive');
    },
  };
  const vision = new Vision(port, profile(), { referenceSize: [640, 480] });
  const observed = await vision.match('button');
  await vision.click(observed.frame, observed.matches[0]!.box);
  expect(calls.map((call) => call.operation)).toEqual(['frame', 'recognize', 'click']);
  expect(calls[1]!.input).toMatchObject({
    frameId: 'scaled-frame',
    roi: [50, 60, 100, 40],
    referenceSize: [640, 480],
  });
  expect(calls[2]!.input).toEqual({ frameId: 'scaled-frame', x: 200, y: 160 });
});

test('generic Vision rejects invalid ROI, result coordinates and aspect ratio before a mutation', async () => {
  const calls: string[] = [];
  let result = recognition();
  const vision = new Vision(
    {
      runPipeline: unexpectedPipeline,
      async execute(operation) {
        calls.push(operation);
        if (operation === 'recognize') return result;
        if (operation === 'frame') return { ...frame(), height: 720 };
        throw new Error('mutation must not run');
      },
    },
    profile(),
    { referenceSize: [640, 480] },
  );
  await expect(
    vision.recognize(frame(), vision.rule('button'), [600, 450, 60, 40]),
  ).rejects.toThrow('相对识别区域超出参考画面');
  expect(calls).toEqual([]);
  result = { ...recognition(), coordinateSize: [1280, 720] };
  await expect(vision.recognize(frame(), vision.rule('button'))).rejects.toThrow('参考坐标空间');
  result = { ...recognition(), matches: [{ box: [639, 0, 2, 10], score: 1 }] };
  await expect(vision.recognize(frame(), vision.rule('button'))).rejects.toThrow('无效位置');
  await expect(vision.frame()).rejects.toThrow('4:3');
  expect(calls).toEqual(['recognize', 'recognize', 'frame']);
});

test('cancelling configured settling prevents the next action without waiting for a timer deadline', async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  let enteredWait!: () => void;
  const waiting = new Promise<void>((resolve) => {
    enteredWait = resolve;
  });
  class ObservedVision extends Vision {
    override async wait(ms: number) {
      const pending = super.wait(ms);
      enteredWait();
      await pending;
    }
  }
  const vision = new ObservedVision(
    {
      runPipeline: unexpectedPipeline,
      async execute(operation) {
        calls.push(operation);
        if (operation === 'frame') return frame();
        if (operation === 'recognize') return recognition();
        return { accepted: true };
      },
    },
    profile(),
    { referenceSize: [640, 480], settleMs: 60_000 },
    { signal: controller.signal },
  );
  const sequence = vision.clickRule('button').then(() => vision.back());
  await waiting;
  controller.abort(new Error('fixture cancellation'));
  await expect(sequence).rejects.toThrow('fixture cancellation');
  await expect(vision.back()).rejects.toThrow('fixture cancellation');
  expect(calls).toEqual(['frame', 'recognize', 'click']);
});

test('L2 read-only polling never inputs and respects both cancellation and root deadlines', async () => {
  const calls: string[] = [];
  let observations = 0;
  const port: AtomicExecutionPort = {
    runPipeline: unexpectedPipeline,
    execute: async (operation) => {
      calls.push(operation);
      if (operation === 'frame') return frame();
      if (operation === 'recognize')
        return { ...recognition(), matches: ++observations < 2 ? [] : recognition().matches };
      throw new Error('polling must be read-only');
    },
  };
  const view = new Vision(port, profile(), { referenceSize: [640, 480] });
  expect((await view.waitUntil('button', true, 1000, 1)).hit).toBe(true);
  expect(calls).toEqual(['frame', 'recognize', 'frame', 'recognize']);
  const expired = new Vision(
    port,
    profile(),
    { referenceSize: [640, 480] },
    { deadline: Date.now() - 1 },
  );
  await expect(expired.wait(10)).rejects.toThrow('期限');
  await expect(view.waitUntil('button', true, 0, 1)).rejects.toThrow('期限');
  const abort = new AbortController();
  abort.abort();
  await expect(
    new Vision(port, profile(), { referenceSize: [640, 480] }, { signal: abort.signal }).waitUntil(
      'button',
      true,
      1000,
      1,
    ),
  ).rejects.toThrow();
  expect(calls).toHaveLength(4);
});

test('reference operations reject outside positions before input and preserve an explicit escape key', async () => {
  const calls: Array<{ operation: string; input: Record<string, unknown> }> = [];
  const view = new Vision(
    {
      runPipeline: unexpectedPipeline,
      execute: async (operation, input) => {
        calls.push({ operation, input });
        return operation === 'frame' ? frame() : { accepted: true };
      },
    },
    profile(),
    { referenceSize: [640, 480] },
  );
  await expect(view.click(frame(), [630, 0, 20, 20])).rejects.toThrow('参考画布');
  await expect(view.swipe(frame(), [0, 0], [640, 480])).rejects.toThrow('参考画布');
  expect(calls).toEqual([]);
  await view.pressKey('escape');
  expect(calls).toEqual([
    { operation: 'frame', input: {} },
    { operation: 'press_key', input: { frameId: 'scaled-frame', key: 'escape' } },
  ]);
});

test('generic delay is independently usable without canvas, resources or device primitives', async () => {
  const port: AtomicExecutionPort = {
    execute: async () => {
      throw new Error('delay cannot access a device');
    },
    runPipeline: syntheticPipeline(),
  };
  const delay = createCompositeCapabilities(port, {}).filter(
    ({ descriptor }) => descriptor.id === 'composite.delay',
  );
  const registry = createCapabilityRegistry(delay, { port });
  expect(registry.list()[0]!.dependencies).toEqual([]);
  expect(await registry.execute('composite.delay', { ms: 1 })).toMatchObject({
    status: 'completed',
    verified: true,
  });
});
