import { expect, test } from 'bun:test';
import {
  createCapabilityRegistry,
  createPrimitiveCapabilities,
  registerAutomationComponents,
  registerPipeline,
  type AtomicExecutionPort,
  type CapabilityRegistration,
} from '@maaverge/automation';
import { unexpectedPipeline } from './pipeline-fixture';

const independentCapability = (id: string): CapabilityRegistration => ({
  descriptor: {
    id,
    label: '独立模块',
    description: '合成能力，不依赖游戏资源',
    layer: 'observation',
    inputSchema: { type: 'object', properties: { value: { type: 'string' } } },
    resultSchema: { type: 'object' },
    requiredCapabilities: ['frame'],
    available: true,
  },
  validate: (input) =>
    input !== null &&
    typeof input === 'object' &&
    'value' in input &&
    typeof input.value === 'string',
  handler: async (input) => ({ status: 'completed', data: input, verified: true }),
});

test('standalone primitive catalog validates schemas and never replays an unknown mutation', async () => {
  let calls = 0;
  let acknowledgementLost = false;
  const port: AtomicExecutionPort = {
    runPipeline: unexpectedPipeline,
    async execute() {
      calls++;
      if (acknowledgementLost) throw new Error('acknowledgement lost');
      return { accepted: false };
    },
  };
  const registry = createCapabilityRegistry(createPrimitiveCapabilities(port));
  expect(calls).toBe(0);
  expect(registry.list().every((entry) => entry.available)).toBe(true);
  expect(
    (await registry.execute('operation.click', { frameId: 'f', x: 1, y: 2, shell: 'invalid' }))
      .status,
  ).toBe('failed');
  expect(
    (await registry.execute('operation.press_key', { frameId: 'f', key: 'home' })).status,
  ).toBe('failed');
  expect(calls).toBe(0);
  const unaccepted = await registry.execute('operation.click', { frameId: 'f', x: 1, y: 2 });
  expect(unaccepted).toMatchObject({ status: 'unknown', verified: false, nativeSuccess: false });
  expect(calls).toBe(1);
  acknowledgementLost = true;
  const lost = await registry.execute('operation.click', { frameId: 'f', x: 1, y: 2 });
  expect(lost).toMatchObject({ status: 'unknown', verified: false });
  expect(calls).toBe(2);
  const controller = new AbortController();
  controller.abort();
  expect(
    (
      await registry.execute(
        'operation.click',
        { frameId: 'f', x: 1, y: 2 },
        { signal: controller.signal },
      )
    ).status,
  ).toBe('cancelled');
  expect(calls).toBe(2);
});

test('independent module validation and availability do not disable primitive capabilities', async () => {
  let primitiveCalls = 0;
  const blocked = independentCapability('module.blocked');
  blocked.descriptor.available = false;
  blocked.descriptor.unavailableReason = '独立模块尚未配置';
  blocked.handler = async () => {
    throw new Error('unavailable handler must not run');
  };
  const registry = createCapabilityRegistry([
    ...createPrimitiveCapabilities({
      runPipeline: unexpectedPipeline,
      async execute() {
        primitiveCalls++;
        return { accepted: true };
      },
    }),
    blocked,
    independentCapability('module.echo'),
  ]);
  expect((await registry.execute('module.blocked', { value: 'hello' })).status).toBe('unavailable');
  expect((await registry.execute('module.echo', { value: 1 })).status).toBe('failed');
  expect(await registry.execute('module.echo', { value: 'hello' })).toMatchObject({
    status: 'completed',
    data: { value: 'hello' },
    verified: true,
  });
  expect((await registry.execute('missing', {})).status).toBe('unavailable');
  expect(primitiveCalls).toBe(0);
  expect(
    (await registry.execute('operation.click', { frameId: 'f', x: 1, y: 2 })).nativeSuccess,
  ).toBe(true);
  expect(primitiveCalls).toBe(1);
});

test('primitive payload schemas reject malformed device facts before reporting verified evidence', async () => {
  let returned: unknown = {};
  const registry = createCapabilityRegistry(
    createPrimitiveCapabilities({ runPipeline: unexpectedPipeline, execute: async () => returned }),
  );
  expect(await registry.execute('operation.frame', {})).toMatchObject({
    status: 'unknown',
    verified: false,
  });
  returned = { hit: true, matches: [{ box: [0, 0, 10, 10], score: 'invalid' }] };
  expect(
    await registry.execute('operation.recognize', { frameId: 'frame', kind: 'ocr' }),
  ).toMatchObject({ status: 'unknown', verified: false });
  returned = { accepted: 'true' };
  expect(await registry.execute('operation.click', { frameId: 'frame', x: 1, y: 1 })).toMatchObject(
    { status: 'unknown', verified: false },
  );
  returned = { frameId: 'frame', width: 1280, height: 720, data: 'synthetic' };
  expect(await registry.execute('observation.frame', {})).toMatchObject({
    status: 'completed',
    verified: true,
    data: returned,
  });
});

test('catalog rejects duplicate IDs and isolates source, list and get descriptors', () => {
  const source = independentCapability('module.echo');
  expect(() => createCapabilityRegistry([source, independentCapability('module.echo')])).toThrow(
    '能力重复登记：module.echo',
  );
  const registry = createCapabilityRegistry([source]);
  source.descriptor.available = false;
  source.descriptor.requiredCapabilities!.push('mutated-source');
  const sourceProperties = source.descriptor.inputSchema.properties as Record<
    string,
    { type: string }
  >;
  sourceProperties.value!.type = 'number';
  const listed = registry.list()[0]!;
  listed.label = 'mutated-list';
  listed.requiredCapabilities!.push('mutated-list');
  const listedProperties = listed.inputSchema.properties as Record<string, { type: string }>;
  listedProperties.value!.type = 'boolean';
  const found = registry.get('module.echo')!;
  found.available = false;
  found.requiredCapabilities!.push('mutated-get');
  expect(registry.get('module.echo')).toMatchObject({
    label: '独立模块',
    available: true,
    requiredCapabilities: ['frame'],
    inputSchema: { properties: { value: { type: 'string' } } },
  });
  expect(registry.get('missing')).toBeUndefined();
});

test('registered components automatically join each fresh host catalog with their own options', async () => {
  let providerCalls = 0;
  const pipeline = registerPipeline({
    'utility.json': { 'Utility@Read': { next: [] } },
  });
  const application = registerAutomationComponents<{ value: string }>()({
    primitives: { capabilities: createPrimitiveCapabilities },
    utility: {
      pipeline,
      capabilities: (_port, options) => {
        providerCalls++;
        const capability = independentCapability('module.echo');
        capability.handler = async () => ({
          status: 'completed',
          data: { value: options.value },
          verified: true,
        });
        return [capability];
      },
    },
  });
  const port: AtomicExecutionPort = {
    runPipeline: unexpectedPipeline,
    execute: async () => {
      throw new Error('catalog registration must not execute device actions');
    },
  };
  expect(providerCalls).toBe(0);
  const first = application.createRegistry(port, { value: 'first' });
  const second = application.createRegistry(port, { value: 'second' });
  expect(providerCalls).toBe(2);
  expect(first.get('operation.click')?.available).toBe(true);
  expect(await first.execute('module.echo', { value: 'ignored' })).toMatchObject({
    data: { value: 'first' },
  });
  expect(await second.execute('module.echo', { value: 'ignored' })).toMatchObject({
    data: { value: 'second' },
  });
  expect(application.components.utility.pipeline.subgraph('Utility@Read')).toEqual({
    'Utility@Read': { next: [] },
  });
});

test('component composition rejects capability ID collisions across independently registered providers', () => {
  const application = registerAutomationComponents<void>()({
    first: { capabilities: () => [independentCapability('module.echo')] },
    second: { capabilities: () => [independentCapability('module.echo')] },
  });
  expect(() =>
    application.createRegistry(
      {
        runPipeline: unexpectedPipeline,
        execute: async () => {
          throw new Error('registration must not execute a device action');
        },
      },
      undefined,
    ),
  ).toThrow('能力重复登记：module.echo');
});
