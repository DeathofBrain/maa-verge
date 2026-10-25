import { withRunTree } from 'langsmith/traceable';
import { RunTree } from 'langsmith';
import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import { AgentConfigurationError, createLangChainProposer } from '../../src/langchain';
import { SyntheticChatModel } from '../support/synthetic-model';

const flags = ['LANGSMITH_TRACING', 'LANGSMITH_TRACING_V2', 'LANGCHAIN_TRACING', 'LANGCHAIN_TRACING_V2'] as const;
const before = Object.fromEntries(flags.map(flag => [flag, process.env[flag]]));
let fetches = 0, preparations = 0;
// A regression is recorded without sending any data or depending on a server.
globalThis.fetch = Object.assign(async () => {
  fetches++;
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
}, { preconnect: () => { fetches++; } });

const model = new SyntheticChatModel();
const proposer = createLangChainProposer({ model, maxModelCalls: 1, preparePlan: draft => { preparations++; return draft; } });
const invoke = () => proposer.propose('合成离线目标');
const scenario = process.argv[2];
let rejected = false, configurationError = false;
try {
  if (scenario === 'context-enabled' || scenario === 'context-disabled') {
    await withRunTree(new RunTree({ name: 'synthetic-parent', tracingEnabled: scenario === 'context-enabled' }), invoke);
  } else await invoke();
} catch (error) {
  rejected = true;
  configurationError = error instanceof AgentConfigurationError;
}
await awaitAllCallbacks();
console.log(JSON.stringify({ rejected, configurationError, fetches, calls: model.calls.length, preparations,
  environmentUnchanged: JSON.stringify(before) === JSON.stringify(Object.fromEntries(flags.map(flag => [flag, process.env[flag]]))) }));
