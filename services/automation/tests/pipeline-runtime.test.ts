import { expect, test } from 'bun:test';
import {
  runPipeline,
  type AtomicExecutionPort,
  type CustomHandlers,
  type PipelineDefinitions,
} from '@maaverge/automation';

const definitions = (handler = 'observe'): PipelineDefinitions => ({
  'Utility@Observe': {
    action: 'Custom',
    custom_action: 'MaaVerge.Custom',
    custom_action_param: { handler, value: 'expected' },
    next: [],
  },
});

test('generic Pipeline dispatch accepts only the submitted node and its exact Custom parameters', async () => {
  let handled = 0;
  let callbackNode = 'Utility@Observe';
  let callbackParams = { handler: 'observe', value: 'expected' };
  const port: AtomicExecutionPort = {
    execute: async () => {
      throw new Error('native graph fixture must not call a primitive');
    },
    async runPipeline(_entry, _pipeline, custom) {
      await custom(callbackNode, callbackParams);
    },
  };
  const handlers = {
    async observe() {
      handled++;
    },
  };
  await runPipeline(port, 'Utility@Observe', definitions(), handlers);
  callbackNode = 'Utility@Outside';
  await expect(runPipeline(port, 'Utility@Observe', definitions(), handlers)).rejects.toThrow(
    '与已提交节点不一致',
  );
  callbackNode = 'Utility@Observe';
  callbackParams = { handler: 'observe', value: 'changed' };
  await expect(runPipeline(port, 'Utility@Observe', definitions(), handlers)).rejects.toThrow(
    '与已提交节点不一致',
  );
  expect(handled).toBe(1);
});

test('Custom handlers inherited from a prototype cannot be dispatched', async () => {
  let handled = 0;
  const handlers = Object.create({
    async inherited() {
      handled++;
    },
  }) as CustomHandlers;
  const port: AtomicExecutionPort = {
    execute: async () => {
      throw new Error('unexpected primitive');
    },
    async runPipeline(_entry, pipeline, custom) {
      const node = pipeline['Utility@Observe'] as Record<string, unknown>;
      await custom('Utility@Observe', node.custom_action_param as Record<string, unknown>);
    },
  };
  await expect(
    runPipeline(port, 'Utility@Observe', definitions('inherited'), handlers),
  ).rejects.toThrow('Custom 未登记');
  expect(handled).toBe(0);
});

test('cancellation during a Custom handler stops the native continuation at the callback boundary', async () => {
  const controller = new AbortController();
  let continuations = 0;
  const port: AtomicExecutionPort = {
    execute: async () => {
      throw new Error('unexpected primitive');
    },
    async runPipeline(_entry, pipeline, custom) {
      const node = pipeline['Utility@Observe'] as Record<string, unknown>;
      await custom('Utility@Observe', node.custom_action_param as Record<string, unknown>);
      continuations++;
    },
  };
  await expect(
    runPipeline(
      port,
      'Utility@Observe',
      definitions(),
      {
        async observe() {
          controller.abort(new Error('cancelled in handler'));
        },
      },
      { signal: controller.signal },
    ),
  ).rejects.toThrow('cancelled in handler');
  expect(continuations).toBe(0);
});

test('synchronous cancellation from progress observers stops before a Custom side effect', async () => {
  const controller = new AbortController();
  let effects = 0;
  const port: AtomicExecutionPort = {
    execute: async () => {
      throw new Error('unexpected primitive');
    },
    async runPipeline(_entry, pipeline, custom) {
      const node = pipeline['Utility@Observe'] as Record<string, unknown>;
      await custom('Utility@Observe', node.custom_action_param as Record<string, unknown>);
    },
  };
  await expect(
    runPipeline(
      port,
      'Utility@Observe',
      definitions(),
      { observe: async () => void effects++ },
      {
        signal: controller.signal,
        onProgress: () => controller.abort(new Error('cancelled by observer')),
      },
    ),
  ).rejects.toThrow('cancelled by observer');
  expect(effects).toBe(0);
});
