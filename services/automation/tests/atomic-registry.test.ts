import { unexpectedPipeline } from './pipeline-fixture';
import { expect, test } from 'bun:test';
import { createAtomicCapabilityRegistry } from '@maaverge/automation';
import { atomicInputValidators } from '@contracts/validators.js';
import type { AtomicResourceProfile } from '@maaverge/automation';
import { AtomicFailure } from '@maaverge/automation';
const profile: AtomicResourceProfile = {
  id: 'unavailable',
  clientType: 'Official',
  available: false,
  diagnostics: ['资源未安装'],
  rules: {},
  card: null,
  actions: {},
  sources: [],
};

test('registered implementations and authoritative input schemas form one catalog across all four layers', async () => {
  let calls = 0;
  const registry = createAtomicCapabilityRegistry(
    {
      runPipeline: unexpectedPipeline,
      execute: async () => {
        calls++;
        return { accepted: true, nativeSuccess: true };
      },
    },
    { profile },
  );
  const items = registry.list();
  expect(items.map((item) => item.id).sort()).toEqual(Object.keys(atomicInputValidators).sort());
  expect(new Set(items.map((item) => item.layer))).toEqual(
    new Set(['operation', 'observation', 'game', 'workflow']),
  );
  // 对外兼容保留原 19 个 ID；目录扩展不应依靠固定总数阻止新组件加入。
  const legacyIds = [
    'operation.frame',
    'operation.click',
    'operation.swipe',
    'operation.press_key',
    'operation.long_press',
    'operation.drag',
    'operation.recognize',
    'observation.frame',
    'observation.base',
    'observation.operators',
    'observation.overview',
    'observation.training',
    'game.infrast.enter_overview',
    'game.infrast.read_room',
    'game.infrast.set_room',
    'workflow.infrast.queue_rotate',
    'workflow.infrast.trim',
    'workflow.infrast.overview_shift',
    'workflow.infrast.room_shift',
  ];
  for (const id of legacyIds) expect(items.some((item) => item.id === id)).toBe(true);
  expect(
    new Set(items.map((item) => item.primitiveLevel).filter((level) => level !== undefined)),
  ).toEqual(new Set([1, 2, 3]));
  for (const item of items) {
    expect(item.pipelineEntry).toBeTypeOf('string');
    expect(item.effect).toBeDefined();
    expect(['observe', 'input', 'commit']).toContain(item.effect!);
    for (const target of item.dependencies ?? []) {
      const destination = items.find((candidate) => candidate.id === target)!;
      expect(destination).toBeDefined();
      if (item.primitiveLevel !== undefined)
        expect(destination.primitiveLevel!).toBeLessThan(item.primitiveLevel);
      else expect(destination.primitiveLevel).toBe(3);
    }
  }
  expect(items.find((item) => item.id === 'game.infrast.read_room')!.effect).toBe('input');
  expect(items.find((item) => item.id === 'game.infrast.confirm')!.effect).toBe('commit');
  expect(items.find((item) => item.id === 'game.infrast.set_room')!.primitiveLevel).toBeUndefined();
  expect(calls).toBe(0);
  expect(items.find((item) => item.id === 'operation.click')!.available).toBe(true);
  expect(items.find((item) => item.id === 'workflow.infrast.overview_shift')!.available).toBe(
    false,
  );
  expect(
    (await registry.execute('operation.click', { frameId: 'f', x: 0, y: 0, shell: 'arbitrary' }))
      .status,
  ).toBe('failed');
  expect(
    (await registry.execute('operation.press_key', { frameId: 'f', key: 'home' })).status,
  ).toBe('failed');
  expect(
    (
      await registry.execute('operation.long_press', {
        frameId: 'f',
        x: 0,
        y: 0,
        durationMs: 10001,
      })
    ).status,
  ).toBe('failed');
  expect(calls).toBe(0);
  expect(
    (await registry.execute('operation.click', { frameId: 'f', x: 0, y: 0 })).nativeSuccess,
  ).toBe(true);
  expect(calls).toBe(1);
});

test('known rejection, lost native acknowledgement and cancellation keep distinct effect semantics', async () => {
  let failure: Error = new AtomicFailure('输入在执行前被拒绝');
  let calls = 0;
  const registry = createAtomicCapabilityRegistry(
    {
      runPipeline: unexpectedPipeline,
      async execute() {
        calls++;
        throw failure;
      },
    },
    { profile },
  );
  const input = { frameId: 'fresh-frame', x: 10, y: 20 };
  const rejected = await registry.execute('operation.click', input);
  expect(rejected.status).toBe('failed');
  expect(rejected.verified).toBe(false);
  expect(rejected.nativeSuccess).toBeUndefined();

  failure = new Error('native acknowledgement lost');
  const unknown = await registry.execute('operation.click', input);
  expect(unknown.status).toBe('unknown');
  expect(unknown.verified).toBe(false);
  expect(calls).toBe(2);

  const abort = new AbortController();
  abort.abort();
  expect((await registry.execute('operation.click', input, { signal: abort.signal })).status).toBe(
    'cancelled',
  );
  expect(calls).toBe(2);
});
