import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { createAgent, toolStrategy } from 'langchain';
import { createLangChainMaaTools } from '../tools/langchain';
import type { MaaToolInvocation, MaaToolResult, MaaToolSet } from '../tools/types';
import { SyntheticChatModel } from './support/synthetic-model';

function fixture(result: MaaToolResult = { content: { ready: true } }) {
  const calls: { name: string; input: unknown; invocation: MaaToolInvocation }[] = [];
  const set: MaaToolSet = {
    definitions: [
      {
        name: 'maa_test_status',
        description: '读取合成状态',
        effect: 'read',
        schema: {
          type: 'object',
          properties: { label: { type: 'string' } },
          required: ['label'],
          additionalProperties: false,
        },
      },
    ],
    async invoke(name, input, invocation) {
      calls.push({ name, input, invocation });
      return result;
    },
  };
  return { sdkTool: createLangChainMaaTools(set)[0]!, calls };
}

test('model-supplied host fields fail SDK schema validation before entering the neutral tools', async () => {
  const { sdkTool, calls } = fixture();
  for (const [field, value] of Object.entries({
    requestId: 'forged',
    deviceId: 'other-device',
    approved: true,
    command: 'anything',
  })) {
    await expect(sdkTool.invoke({ label: 'test', [field]: value })).rejects.toThrow(
      'expected schema',
    );
  }
  await expect(sdkTool.invoke({ label: 1 })).rejects.toThrow('expected schema');
  expect(calls).toHaveLength(0);
});

test('SDK tool-call identity takes priority over host fallback and preserves cancellation', async () => {
  const { sdkTool, calls } = fixture();
  const controller = new AbortController();
  const result = await sdkTool.invoke(
    { type: 'tool_call' as const, name: sdkTool.name, id: 'model-call-1', args: { label: 'test' } },
    {
      configurable: { maaToolCallId: 'host-call' },
      signal: controller.signal,
    },
  );
  expect(result).toBeInstanceOf(ToolMessage);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({
    name: sdkTool.name,
    input: { label: 'test' },
    invocation: { callId: 'model-call-1', signal: controller.signal },
  });
});

test('direct invocation accepts a host delivery identity and generates isolated IDs when absent', async () => {
  const { sdkTool, calls } = fixture();
  await sdkTool.invoke({ label: 'test' }, { configurable: { maaToolCallId: 'host-retry-1' } });
  await sdkTool.invoke({ label: 'test' }, { configurable: { maaToolCallId: 'host-retry-1' } });
  await sdkTool.invoke({ label: 'test' });
  await sdkTool.invoke({ label: 'test' });
  expect(calls.map((call) => call.invocation.callId).slice(0, 2)).toEqual([
    'host-retry-1',
    'host-retry-1',
  ]);
  expect(calls[2]!.invocation.callId).toMatch(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i);
  expect(calls[3]!.invocation.callId).not.toBe(calls[2]!.invocation.callId);
});

test('screenshots stay in ToolMessage artifacts and never enter model-visible JSON content', async () => {
  const screenshot = { mime: 'image/png', data: 'synthetic-private-screenshot' };
  const { sdkTool } = fixture({ content: { width: 1280, height: 720 }, artifact: screenshot });
  const result = await sdkTool.invoke({
    type: 'tool_call' as const,
    name: sdkTool.name,
    id: 'capture-1',
    args: { label: 'frame' },
  });
  expect(result).toBeInstanceOf(ToolMessage);
  expect(result.artifact).toBe(screenshot);
  expect(result.content).toBe(JSON.stringify({ width: 1280, height: 720 }));
  expect(JSON.stringify(result.content)).not.toContain(screenshot.data);
});

test('real createAgent loop consumes a Maa tool result before producing structured output', async () => {
  const { sdkTool, calls } = fixture();
  const model = new SyntheticChatModel(({ call, messages }) => {
    if (call === 1)
      return new AIMessage({
        content: '',
        tool_calls: [
          { name: sdkTool.name, id: 'agent-status-1', type: 'tool_call', args: { label: 'agent' } },
        ],
      });
    const observation = messages.find(
      (message) => message instanceof ToolMessage && message.name === sdkTool.name,
    );
    expect(observation?.content).toBe('{"ready":true}');
    return new AIMessage({
      content: '',
      tool_calls: [
        {
          name: 'ToolSummary',
          id: 'summary-1',
          type: 'tool_call',
          args: { summary: '合成状态就绪' },
        },
      ],
    });
  });
  const agent = createAgent({
    model,
    tools: [sdkTool],
    responseFormat: toolStrategy(
      {
        title: 'ToolSummary',
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
        additionalProperties: false,
      },
      { handleError: false },
    ),
  });
  const result = await agent.invoke(
    { messages: [{ role: 'user', content: '读取合成状态' }] },
    { recursionLimit: 8 },
  );
  expect(result.structuredResponse).toEqual({ summary: '合成状态就绪' });
  expect(model.calls).toHaveLength(2);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.invocation.callId).toBe('agent-status-1');
});

const flags = [
  'LANGSMITH_TRACING',
  'LANGSMITH_TRACING_V2',
  'LANGCHAIN_TRACING',
  'LANGCHAIN_TRACING_V2',
] as const;
const tracingFixture = fileURLToPath(
  new URL('./fixtures/tools-tracing-boundary.ts', import.meta.url),
);

function probe(scenario: string, method: 'invoke' | 'call', enabledFlag?: (typeof flags)[number]) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    LANGSMITH_API_KEY: 'synthetic-offline-key',
    LANGSMITH_ENDPOINT: 'http://127.0.0.1:1',
  };
  for (const flag of flags) delete environment[flag];
  if (enabledFlag) environment[enabledFlag] = 'true';
  const child = spawnSync(process.execPath, [tracingFixture, scenario, method], {
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  });
  expect(child.error).toBeUndefined();
  expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout);
}

test('direct SDK invocation rejects every tracing switch before callbacks or neutral calls', () => {
  for (const flag of flags)
    expect(probe('environment', 'invoke', flag)).toEqual({
      rejected: true,
      configurationError: true,
      fetches: 0,
      callbacks: 0,
      calls: 0,
      environmentUnchanged: true,
    });
}, 30000);

test('invoke and deprecated call reject an inherited tracing context before SDK callbacks', () => {
  for (const method of ['invoke', 'call'] as const)
    expect(probe('context-enabled', method)).toEqual({
      rejected: true,
      configurationError: true,
      fetches: 0,
      callbacks: 0,
      calls: 0,
      environmentUnchanged: true,
    });
});

test('an explicitly disabled parent tracing context permits the local tool invocation', () => {
  expect(probe('context-disabled', 'invoke')).toEqual({
    rejected: false,
    configurationError: false,
    fetches: 0,
    callbacks: 1,
    calls: 1,
    environmentUnchanged: true,
  });
});

test('SDK explicit and inherited LangChainTracer callbacks reject before observing tool input', () => {
  for (const scenario of [
    'explicit-tracer',
    'manager-tracer',
    'property-tracer',
    'implicit-tracer',
    'hook-tracer',
  ]) {
    for (const method of ['invoke', 'call'] as const)
      expect(probe(scenario, method)).toEqual({
        rejected: true,
        configurationError: true,
        fetches: 0,
        callbacks: 0,
        calls: 0,
        tracedRuns: 0,
        environmentUnchanged: true,
      });
  }
  for (const scenario of ['default-tracer', 'bound-tracer'])
    expect(probe(scenario, 'invoke')).toEqual({
      rejected: true,
      configurationError: true,
      fetches: 0,
      callbacks: 0,
      calls: 0,
      tracedRuns: 0,
      environmentUnchanged: true,
    });
}, 30000);
