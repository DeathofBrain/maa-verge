/** 合成官方图端口只用于测试，参数解析与跨层分派复用产品实现。 */
import { expect, test } from 'bun:test';
import { createCapabilityRegistry } from '../src/registry/catalog';
import { resolvePipelineValue } from '../src/pipeline/bindings';
import { invokePipeline } from '../src/pipeline/invocation';
import type { CapabilityRegistration } from '../src/registry/types';
import type { AtomicExecutionPort, PrimitiveLevel } from '../src/core/types';
import { syntheticPipeline } from './pipeline-fixture';

const custom = (params: Record<string, unknown>, next: string[] = []) => ({
  recognition: 'DirectHit',
  action: 'Custom',
  custom_action: 'MaaVerge.Custom',
  custom_action_param: params,
  next,
});
const wrap = (
  id: string,
  level: PrimitiveLevel,
  handler: CapabilityRegistration['handler'],
): CapabilityRegistration => ({
  descriptor: {
    id,
    label: id,
    description: 'synthetic',
    layer: 'operation',
    primitiveLevel: level,
    effect: 'observe',
    available: true,
    inputSchema: { type: 'object' },
    resultSchema: { type: 'object' },
  },
  validate: (input) => !!input && typeof input === 'object' && !Array.isArray(input),
  handler,
  pipeline: {
    entry: id,
    definitions: {
      [id]: custom({ handler: 'execute', saveAs: 'value' }, [id + 'Return']),
      [id + 'Return']: custom({ handler: 'return', value: { $ref: '#/steps/value' } }),
    },
  },
});

test('JSON Pointer supports escaped properties, arrays and literal object composition without prototype lookup', () => {
  const scope = {
    input: { 'a/b': { '~key': [0, 3] }, '中文 空格': 7 },
    steps: { read: { data: { count: 2 } } },
  };
  expect(
    resolvePipelineValue(
      {
        values: [{ $ref: '#/input/a~1b/~0key/1' }, { $ref: '#/steps/read/data/count' }],
        literal: 'text',
      },
      scope,
    ),
  ).toEqual({ values: [3, 2], literal: 'text' });
  for (const reference of [
    '#/steps/missing/data',
    '#/input/toString',
    '#/unknown/value',
    '#/input/a~2b',
    '#/input/a~1b/~0key/01',
  ])
    expect(() => resolvePipelineValue({ $ref: reference }, scope)).toThrow();
  expect(() => resolvePipelineValue({ $ref: '#/input', other: true }, scope)).toThrow();
  expect(
    resolvePipelineValue({ $ref: '#/input/%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC' }, scope),
  ).toBe(7);
  expect(() => resolvePipelineValue({ $ref: '#/input/%ZZ' }, scope)).toThrow('URI');
});

test('resolved child inputs are schema-checked before input and native failures retain completed evidence', async () => {
  let effects = 0;
  const base = wrap('base', 1, async () => {
    effects++;
    return { status: 'completed', data: { count: effects }, verified: true };
  });
  base.validate = (input) => typeof (input as { count?: unknown })?.count === 'number';
  const game = wrap('game', 3, async () => {
    throw new Error('not reached');
  });
  game.pipeline = {
    entry: 'Game',
    definitions: {
      Game: custom(
        {
          handler: 'call',
          primitive: 'base',
          input: { count: { $ref: '#/input/count' } },
          saveAs: 'evidence',
        },
        ['End'],
      ),
      End: custom({ handler: 'return', value: { $ref: '#/steps/evidence' } }),
    },
  };
  const submit = syntheticPipeline();
  const port: AtomicExecutionPort = {
    execute: async () => ({}),
    runPipeline: submit,
    runContextPipeline: submit,
  };
  const registry = createCapabilityRegistry([base, game], { port });
  expect((await registry.execute('game', { count: 'wrong type' })).status).toBe('failed');
  expect(effects).toBe(0);
  // 下层调用完成后的传输错误保留证据；调用者可据此决定复读，不能直接重放已尝试动作。
  const failing: AtomicExecutionPort = {
    ...port,
    runPipeline: async (_entry, _graph, custom) => {
      await custom(
        'Game',
        game.pipeline!.definitions.Game.custom_action_param as Record<string, unknown>,
      );
      throw new Error('native status failed');
    },
  };
  const result = await createCapabilityRegistry([base, game], { port: failing }).execute('game', {
    count: 1,
  });
  expect(result).toMatchObject({
    status: 'unknown',
    verified: false,
    data: { pipelineSteps: { evidence: { status: 'completed', data: { count: 1 } } } },
  });
  expect(effects).toBe(1);
});

test('one looping node refreshes its alias and a native completion without return remains unknown', async () => {
  let calls = 0;
  const definitions = {
    Step: custom({ handler: 'execute', saveAs: 'latest' }, ['Return']),
    Return: custom({ handler: 'return', value: { $ref: '#/steps/latest' } }),
  };
  const run: AtomicExecutionPort['runPipeline'] = async (_entry, _graph, custom) => {
    await custom('Step', definitions.Step.custom_action_param!);
    await custom('Step', definitions.Step.custom_action_param!);
    await custom('Return', definitions.Return.custom_action_param!);
  };
  const port: AtomicExecutionPort = { execute: async () => ({}), runPipeline: run };
  const options = {
    id: 'loop',
    entry: 'Step',
    definitions,
    input: {},
    context: {},
    port,
    invoke: async () => {
      throw new Error('unused');
    },
    execute: async () => ({
      status: 'completed' as const,
      data: { count: ++calls },
      verified: true,
    }),
  };
  expect(await invokePipeline(options)).toMatchObject({ status: 'completed', data: { count: 2 } });
  port.runPipeline = async () => {};
  expect(await invokePipeline(options)).toMatchObject({ status: 'unknown', verified: false });
});

test('child scopes cannot see parent aliases and raw batches receive a separate deadline for each root', async () => {
  const submit = syntheticPipeline();
  const deadlines: number[] = [];
  const port: AtomicExecutionPort = {
    execute: async () => ({}),
    runPipeline: async (...args) => {
      deadlines.push(args[3].deadline!);
      await submit(...args);
    },
    runContextPipeline: submit,
  };
  const base = wrap('base', 1, async (input) => ({
    status: 'completed',
    data: input,
    verified: true,
  }));
  const game = wrap('game', 3, async () => {
    throw new Error('unused');
  });
  game.pipeline = {
    entry: 'Child',
    definitions: {
      Child: custom(
        { handler: 'call', primitive: 'base', input: { $ref: '#/steps/parent' }, saveAs: 'child' },
        ['ChildReturn'],
      ),
      ChildReturn: custom({ handler: 'return', value: { $ref: '#/steps/child' } }),
    },
  };
  expect((await createCapabilityRegistry([base, game], { port }).execute('game', {})).status).toBe(
    'failed',
  );
  game.pipeline = wrap('game', 3, async () => ({
    status: 'completed',
    data: {},
    verified: true,
  })).pipeline;
  game.handler = async () => ({ status: 'completed', data: {}, verified: true });
  const workflow: CapabilityRegistration = {
    ...wrap('batch', 3, async () => {
      throw new Error('unused');
    }),
    descriptor: {
      ...wrap('batch', 3, async () => {
        throw new Error('unused');
      }).descriptor,
      primitiveLevel: undefined,
    },
    dependencies: ['game'],
    pipeline: undefined,
    handler: async (_input, context) => {
      expect(context.deadline).toBeUndefined();
      const graph = {
        Entry: custom({ handler: 'call', primitive: 'game', saveAs: 'value' }, ['End']),
        End: custom({ handler: 'return', value: { $ref: '#/steps/value' } }),
      };
      const first = await context.runWorkflow!('Entry', graph, {});
      const second = await context.runWorkflow!('Entry', graph, {});
      return second.status === 'completed' ? first : second;
    },
  };
  deadlines.length = 0;
  expect(
    (await createCapabilityRegistry([base, game, workflow], { port }).execute('batch', {})).status,
  ).toBe('completed');
  expect(deadlines).toHaveLength(2);
  expect(deadlines.every((deadline) => deadline >= Date.now() + 119000)).toBe(true);
});

test('registered L3→L2→L1 graphs isolate child input/results and return schema-checked data', async () => {
  const visited: string[] = [];
  const submit = syntheticPipeline({ entered: (node) => void visited.push(node) });
  const port: AtomicExecutionPort = {
    execute: async () => {
      throw new Error('no raw device access');
    },
    runPipeline: submit,
    runContextPipeline: submit,
  };
  const base = wrap('base', 1, async (input) => ({
    status: 'completed',
    data: { value: input.value },
    verified: true,
  }));
  const middle = wrap('middle', 2, async () => {
    throw new Error('JSON graph should compose base');
  });
  middle.pipeline = {
    entry: 'Middle',
    definitions: {
      Middle: custom(
        {
          handler: 'call',
          primitive: 'base',
          input: { value: { $ref: '#/input/value' } },
          saveAs: 'read',
        },
        ['MiddleReturn'],
      ),
      MiddleReturn: custom({ handler: 'return', value: { $ref: '#/steps/read' } }),
    },
  };
  const game = wrap('game', 3, async () => {
    throw new Error('JSON graph should compose middle');
  });
  game.pipeline = {
    entry: 'Game',
    definitions: {
      Game: custom(
        {
          handler: 'call',
          primitive: 'middle',
          input: { value: { $ref: '#/input/value' } },
          saveAs: 'read',
        },
        ['GameReturn'],
      ),
      GameReturn: custom({ handler: 'return', value: { $ref: '#/steps/read' } }),
    },
  };
  const registry = createCapabilityRegistry([base, middle, game], { port });
  expect(await registry.execute('game', { value: 8 })).toMatchObject({
    status: 'completed',
    data: { value: 8 },
    verified: true,
  });
  expect(visited).toEqual(['Game', 'Middle', 'base', 'baseReturn', 'MiddleReturn', 'GameReturn']);
  expect(await registry.execute('game', { value: 9 })).toMatchObject({ data: { value: 9 } });
});

test('registration rejects missing dependencies, same-level calls, reverse calls and duplicate result aliases', () => {
  const first = wrap('first', 1, async () => ({ status: 'completed', data: {}, verified: true }));
  first.dependencies = ['missing'];
  expect(() => createCapabilityRegistry([first])).toThrow('未登记');
  const second = wrap('second', 2, async () => ({ status: 'completed', data: {}, verified: true }));
  first.dependencies = ['second'];
  expect(() => createCapabilityRegistry([first, second])).toThrow('只能向下');
  first.dependencies = [];
  second.dependencies = ['second'];
  expect(() => createCapabilityRegistry([first, second])).toThrow('只能向下');
  second.dependencies = [];
  second.pipeline!.definitions.extra = custom({ handler: 'execute', saveAs: 'value' });
  second.pipeline!.definitions.second.next = ['extra'];
  expect(() => createCapabilityRegistry([first, second])).toThrow('别名重复');
  const workflow = wrap('workflow', 3, async () => ({
    status: 'completed',
    data: {},
    verified: true,
  }));
  workflow.descriptor.primitiveLevel = undefined;
  workflow.pipeline = undefined;
  workflow.dependencies = ['first'];
  expect(() => createCapabilityRegistry([first, workflow])).toThrow('只能组合 L3');
});

test('cancellation or deadline after the return callback cannot become verified success', async () => {
  const abort = new AbortController();
  const definitions = {
    End: custom({ handler: 'return', value: { status: 'completed', data: {}, verified: true } }),
  };
  const port: AtomicExecutionPort = {
    execute: async () => ({}),
    runPipeline: async (_entry, _graph, custom) => {
      await custom('End', definitions.End.custom_action_param!);
      abort.abort(new Error('cancel while native task settles'));
    },
  };
  const options = {
    id: 'return',
    entry: 'End',
    definitions,
    input: {},
    context: { signal: abort.signal },
    port,
    invoke: async () => {
      throw new Error('unused');
    },
  };
  expect(await invokePipeline(options)).toMatchObject({ status: 'cancelled', verified: false });
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    port.runPipeline = async (_entry, _graph, custom) => {
      await custom('End', definitions.End.custom_action_param!);
      now += 1001;
    };
    expect(await invokePipeline({ ...options, context: { deadline: now + 1000 } })).toMatchObject({
      status: 'unknown',
      verified: false,
    });
  } finally {
    Date.now = originalNow;
  }
});

test('raw handlers preserve completed evidence but cannot verify success after cancellation', async () => {
  const abort = new AbortController();
  const base = wrap('base', 1, async () => {
    abort.abort();
    return { status: 'completed', verified: true, data: { attempted: true } };
  });
  expect(
    await createCapabilityRegistry([base]).execute('base', {}, { signal: abort.signal }),
  ).toMatchObject({ status: 'cancelled', verified: false, data: { attempted: true } });
});

test('return references cannot amplify bounded step evidence beyond the invocation data limit', async () => {
  const repeated = Array.from({ length: 5 }, () => ({ $ref: '#/steps/value/data' }));
  const definitions = {
    Read: custom({ handler: 'execute', saveAs: 'value' }, ['End']),
    End: custom({
      handler: 'return',
      value: { status: 'completed', verified: true, data: repeated },
    }),
  };
  const port: AtomicExecutionPort = { execute: async () => ({}), runPipeline: syntheticPipeline() };
  const result = await invokePipeline({
    id: 'bounded',
    entry: 'Read',
    definitions,
    input: {},
    context: {},
    port,
    invoke: async () => {
      throw new Error('unused');
    },
    execute: async () => ({
      status: 'completed',
      verified: true,
      data: 'x'.repeat(8 * 1024 * 1024),
    }),
  });
  expect(result).toMatchObject({
    status: 'failed',
    verified: false,
    message: 'Pipeline 本次数据超过 32 MiB 限制',
  });
});

test('unresolved references and invalid results fail before any later side effect', async () => {
  let effects = 0;
  const submit = syntheticPipeline();
  const port: AtomicExecutionPort = {
    execute: async () => ({}),
    runPipeline: submit,
    runContextPipeline: submit,
  };
  const base = wrap('base', 1, async () => {
    effects++;
    return { status: 'completed', data: {}, verified: true };
  });
  const game = wrap('game', 3, async () => ({ status: 'completed', data: {}, verified: true }));
  game.pipeline = {
    entry: 'Game',
    definitions: {
      Game: custom(
        {
          handler: 'call',
          primitive: 'base',
          input: { value: { $ref: '#/steps/missing/data' } },
          saveAs: 'read',
        },
        ['End'],
      ),
      End: custom({ handler: 'return', value: { $ref: '#/steps/read' } }),
    },
  };
  expect((await createCapabilityRegistry([base, game], { port }).execute('game', {})).status).toBe(
    'failed',
  );
  expect(effects).toBe(0);
  base.handler = async () => ({ status: 'completed', data: {} }) as never;
  expect((await createCapabilityRegistry([base], { port }).execute('base', {})).status).toBe(
    'unknown',
  );
});
