import assert from 'node:assert/strict';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { createLangChainProposer } from '../../src/langchain';
import { createMaaTools } from '../../tools';
import type { MaaToolHost } from '../../tools/types';
import { SyntheticChatModel, syntheticProposal } from '../support/synthetic-model';

// The catalog has no application-service side effects; other ports are never used.
const maaTools = createMaaTools({} as MaaToolHost, { sessionId: 'compiled-catalog-smoke' });
const model = new SyntheticChatModel(({ call, messages }) => {
  if (call === 1)
    return new AIMessage({
      content: '',
      tool_calls: [
        { name: 'maa_task_catalog', id: 'compiled-catalog-1', type: 'tool_call', args: {} },
      ],
    });
  const observation = messages.find(
    (message) => message instanceof ToolMessage && message.name === 'maa_task_catalog',
  );
  assert.equal(typeof observation?.content, 'string');
  assert.equal(JSON.parse(observation!.content as string).tasks.length, 20);
  return new AIMessage({
    content: '',
    tool_calls: [
      {
        name: 'AgentPlanProposal',
        id: 'compiled-proposal-1',
        type: 'tool_call',
        args: structuredClone(syntheticProposal),
      },
    ],
  });
});
let validations = 0;
const proposer = createLangChainProposer({
  model,
  maxModelCalls: 2,
  maaTools,
  preparePlan: (draft) => {
    validations++;
    assert.ok(draft && typeof draft === 'object');
    return draft;
  },
});
const proposal = await proposer.propose('生成刷 2-8 三次的草稿');
assert.equal(validations, 1);
assert.equal(model.calls.length, 2);
assert.equal(proposal.requiresConfirmation, true);
assert.equal(proposal.mode, 'langchain');
console.log(
  'Compiled LangChain Maa tools/proposal smoke passed (synthetic model, no network or device access).',
);
