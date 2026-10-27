import { withRunTree } from 'langsmith/traceable';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RunTree, type Client } from 'langsmith';
import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import { CallbackManager } from '@langchain/core/callbacks/manager';
import { registerConfigureHook, setContextVariable } from '@langchain/core/context';
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { AgentConfigurationError } from '../../src/tracing';
import { createLangChainMaaTools } from '../../tools/langchain';

const flags = [
  'LANGSMITH_TRACING',
  'LANGSMITH_TRACING_V2',
  'LANGCHAIN_TRACING',
  'LANGCHAIN_TRACING_V2',
] as const;
const before = Object.fromEntries(flags.map((flag) => [flag, process.env[flag]]));
let fetches = 0,
  callbacks = 0,
  calls = 0,
  tracedRuns = 0;
globalThis.fetch = Object.assign(
  async () => {
    fetches++;
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  },
  {
    preconnect: () => {
      fetches++;
    },
  },
);

const sdkTool = createLangChainMaaTools({
  definitions: [
    {
      name: 'maa_test_tracing',
      description: '合成追踪边界',
      effect: 'read',
      schema: { type: 'object', properties: {}, additionalProperties: false },
    },
  ],
  async invoke() {
    calls++;
    return { content: { ready: true } };
  },
})[0]!;
const scenario = process.argv[2];
const method = process.argv[3] === 'call' ? 'call' : 'invoke';
const localCallback = {
  handleToolStart() {
    callbacks++;
  },
};
const tracer = new LangChainTracer({
  client: {
    async createRun() {
      tracedRuns++;
    },
    async updateRun() {
      tracedRuns++;
    },
  } as unknown as Client,
});
let invoke: () => Promise<unknown> = () => sdkTool[method]({}, { callbacks: [localCallback] });
if (scenario === 'explicit-tracer')
  invoke = () => sdkTool[method]({}, { callbacks: [localCallback, tracer] });
if (scenario === 'manager-tracer') {
  const manager = new CallbackManager();
  manager.addHandler(tracer, true);
  invoke = () => sdkTool[method]({}, { callbacks: manager });
}
if (scenario === 'property-tracer') sdkTool.callbacks = [tracer];
if (scenario === 'default-tracer') sdkTool.defaultConfig = { callbacks: [tracer] };
if (scenario === 'bound-tracer')
  invoke = () => sdkTool.withConfig({ callbacks: [tracer] }).invoke({});
if (scenario === 'implicit-tracer') {
  AsyncLocalStorageProviderSingleton.initializeGlobalInstance(new AsyncLocalStorage());
  invoke = () =>
    AsyncLocalStorageProviderSingleton.runWithConfig({ callbacks: [tracer] }, () =>
      sdkTool[method]({}),
    );
}
if (scenario === 'hook-tracer') {
  const contextVar = 'maaverge-synthetic-tracer';
  registerConfigureHook({ contextVar });
  setContextVariable(contextVar, tracer);
}
let rejected = false,
  configurationError = false;
try {
  if (scenario === 'context-enabled' || scenario === 'context-disabled') {
    await withRunTree(
      new RunTree({
        name: 'synthetic-tool-parent',
        tracingEnabled: scenario === 'context-enabled',
      }),
      invoke,
    );
  } else await invoke();
} catch (error) {
  rejected = true;
  configurationError = error instanceof AgentConfigurationError;
}
await awaitAllCallbacks();
console.log(
  JSON.stringify({
    rejected,
    configurationError,
    fetches,
    callbacks,
    calls,
    ...(scenario?.endsWith('-tracer') ? { tracedRuns } : {}),
    environmentUnchanged:
      JSON.stringify(before) ===
      JSON.stringify(Object.fromEntries(flags.map((flag) => [flag, process.env[flag]]))),
  }),
);
