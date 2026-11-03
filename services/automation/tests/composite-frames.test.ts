/** 合成宿主模拟根边界、短期帧和输入失效；JSON 分派与 L2/L1 实现全部使用产品代码。 */
import { expect, test } from 'bun:test';
import {
  createCapabilityRegistry,
  createCompositeCapabilities,
  createPrimitiveCapabilities,
  type AtomicExecutionPort,
  type AtomicFrame,
  type CapabilityRegistration,
} from '@maaverge/automation';
import { syntheticPipeline } from './pipeline-fixture';

const reference = (frame: AtomicFrame) => ({
  frameId: frame.frameId,
  width: frame.width,
  height: frame.height,
});

function fixture() {
  const frames = new Set<string>();
  const operations: Array<{ operation: string; input: Record<string, unknown> }> = [];
  const calls = { roots: 0, contexts: 0, effects: 0 };
  let active = false;
  let sequence = 0;
  let beforeInput: (() => void) | undefined;
  const run = syntheticPipeline();
  const submit =
    (nested: boolean): AtomicExecutionPort['runPipeline'] =>
    async (...args) => {
      if (nested) {
        expect(active).toBe(true);
        calls.contexts++;
      } else {
        expect(active).toBe(false);
        calls.roots++;
        frames.clear();
        active = true;
      }
      try {
        await run(...args);
      } finally {
        if (!nested) {
          frames.clear();
          active = false;
        }
      }
    };
  const port: AtomicExecutionPort = {
    runPipeline: submit(false),
    runContextPipeline: submit(true),
    async execute(operation, input, context) {
      context.signal?.throwIfAborted();
      operations.push({ operation, input });
      if (operation === 'frame') {
        const frame = {
          frameId: `frame-${++sequence}`,
          width: 1280,
          height: 960,
          data: 'synthetic',
        };
        frames.add(frame.frameId);
        return frame;
      }
      if (operation === 'recognize') {
        if (!frames.has(input.frameId as string)) throw new Error('画面已失效，不能自动续期');
        return {
          hit: true,
          coordinateSize: [640, 480],
          matches: [{ text: 'fixture', box: [50, 60, 100, 40], score: 1 }],
        };
      }
      beforeInput?.();
      if (!frames.has(input.frameId as string)) throw new Error('画面已失效，不能自动续期');
      calls.effects++;
      frames.clear();
      return { accepted: true, nativeSuccess: true };
    },
  };
  const registrations = [
    ...createPrimitiveCapabilities(port),
    ...createCompositeCapabilities(
      port,
      {
        generic: {
          profile: {
            rules: {
              button: {
                id: 'button',
                kind: 'ocr',
                source: { repository: 'fixture', ref: 'synthetic', path: 'memory' },
              },
            },
            actions: {},
          },
          options: { referenceSize: [640, 480] },
        },
      },
      'generic',
    ),
  ];
  return {
    port,
    registrations,
    registry: createCapabilityRegistry(registrations, { port }),
    calls,
    operations,
    beforeInput: (callback: () => void) => (beforeInput = callback),
    expire: () => frames.clear(),
  };
}

test('standalone L2 current captures inside its root and uses nested L1 Contexts for one scaled input', async () => {
  for (const [id, input, expected] of [
    ['composite.click_box', { frame: 'current', box: [50, 60, 100, 40] }, { x: 200, y: 160 }],
    [
      'composite.swipe',
      { frame: 'current', from: [10, 20], to: [300, 400], durationMs: 250 },
      { x1: 20, y1: 40, x2: 600, y2: 800, durationMs: 250 },
    ],
  ] as const) {
    const f = fixture();
    const result = await f.registry.execute(id, structuredClone(input));
    expect(result).toMatchObject({ status: 'completed', verified: false, nativeSuccess: true });
    expect(f.calls).toEqual({ roots: 1, contexts: 2, effects: 1 });
    expect(f.operations.map(({ operation }) => operation)).toEqual([
      'frame',
      id === 'composite.click_box' ? 'click' : 'swipe',
    ]);
    expect(f.operations[1]!.input).toEqual({ frameId: 'frame-1', ...expected });
  }
});

test('an explicit frame from another root remains invalid and never triggers a refresh or input replay', async () => {
  const f = fixture();
  const old = await f.registry.execute('operation.frame', {});
  const result = await f.registry.execute('composite.click_box', {
    frame: reference(old.data as AtomicFrame),
    box: [50, 60, 100, 40],
  });
  expect(result.status).toBe('unknown');
  expect(JSON.stringify(result)).toContain('画面已失效');
  expect(f.operations.map(({ operation }) => operation)).toEqual(['frame', 'click']);
  expect(f.calls.effects).toBe(0);
});

test('read-only L2 current inputs share the resolver while malformed or missing mutation frames never start a root', async () => {
  for (const [id, input] of [
    ['composite.match', { frame: 'current', rule: 'button' }],
    ['composite.texts', { frame: 'current' }],
  ] as const) {
    const f = fixture();
    const result = await f.registry.execute(id, structuredClone(input));
    expect(result).toMatchObject({ status: 'completed', verified: true });
    expect(f.calls).toEqual({ roots: 1, contexts: 2, effects: 0 });
    expect(f.operations.map(({ operation }) => operation)).toEqual(['frame', 'recognize']);
  }
  const invalid = fixture();
  for (const frame of [undefined, 'unknown', {}, { frameId: 'x', width: 0, height: 960 }]) {
    expect(
      (
        await invalid.registry.execute('composite.click_box', {
          ...(frame === undefined ? {} : { frame }),
          box: [50, 60, 100, 40],
        })
      ).status,
    ).toBe('failed');
  }
  expect(invalid.calls).toEqual({ roots: 0, contexts: 0, effects: 0 });
  expect(invalid.operations).toEqual([]);
});

test('same-root JSON passes a lightweight frame reference through L2 and preserves its original identity', async () => {
  const f = fixture();
  const node = (params: Record<string, unknown>, next: string[] = []) => ({
    recognition: 'DirectHit',
    action: 'Custom',
    custom_action: 'MaaVerge.Custom',
    custom_action_param: params,
    next,
  });
  const event: CapabilityRegistration = {
    descriptor: {
      id: 'fixture.frame_event',
      label: '合成带帧事件',
      description: '测试内静态登记，产品不暴露任意 JSON 入口。',
      layer: 'game',
      primitiveLevel: 3,
      effect: 'input',
      inputSchema: {},
      resultSchema: {},
      available: true,
    },
    validate: () => true,
    handler: async () => {
      throw new Error('must execute the registered JSON');
    },
    pipeline: {
      entry: 'Read',
      definitions: {
        Read: node({ handler: 'call', primitive: 'operation.frame', input: {}, saveAs: 'read' }, [
          'Click',
        ]),
        Click: node(
          {
            handler: 'call',
            primitive: 'composite.click_box',
            input: {
              frame: {
                frameId: { $ref: '#/steps/read/data/frameId' },
                width: { $ref: '#/steps/read/data/width' },
                height: { $ref: '#/steps/read/data/height' },
              },
              box: [50, 60, 100, 40],
            },
            saveAs: 'click',
          },
          ['Return'],
        ),
        Return: node({ handler: 'return', value: { $ref: '#/steps/click' } }),
      },
    },
  };
  const result = await createCapabilityRegistry([...f.registrations, event], {
    port: f.port,
  }).execute(event.descriptor.id, {});
  expect(result.status).toBe('completed');
  expect(f.calls).toEqual({ roots: 1, contexts: 3, effects: 1 });
  expect(f.operations).toEqual([
    { operation: 'frame', input: {} },
    { operation: 'click', input: { frameId: 'frame-1', x: 200, y: 160 } },
  ]);
});

test('expiry after current capture does not replace the frame, and cancellation prevents its input', async () => {
  const expired = fixture();
  expired.beforeInput(expired.expire);
  const result = await expired.registry.execute('composite.click_box', {
    frame: 'current',
    box: [50, 60, 100, 40],
  });
  expect(result.status).toBe('unknown');
  expect(expired.operations.map(({ operation }) => operation)).toEqual(['frame', 'click']);
  expect(expired.calls.effects).toBe(0);
  const cancelled = fixture();
  const controller = new AbortController();
  const pending = cancelled.registry.execute(
    'composite.click_box',
    { frame: 'current', box: [50, 60, 100, 40] },
    {
      signal: controller.signal,
      onProgress: ({ message }) => {
        if (message === '执行流程节点：Primitive@click') controller.abort();
      },
    },
  );
  expect((await pending).status).toBe('cancelled');
  expect(cancelled.operations.map(({ operation }) => operation)).toEqual(['frame']);
  expect(cancelled.calls.effects).toBe(0);
});
