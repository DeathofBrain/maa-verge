import assert from 'node:assert/strict';
import { createLangChainProposer } from '../../src/langchain';
import { SyntheticChatModel } from '../support/synthetic-model';

const model = new SyntheticChatModel();
let validations = 0;
const proposer = createLangChainProposer({
  model,
  maxModelCalls: 1,
  preparePlan: draft => {
    validations++;
    assert.ok(draft && typeof draft === 'object');
    return draft;
  },
});
const proposal = await proposer.propose('生成刷 2-8 三次的草稿');
assert.equal(validations, 1);
assert.equal(model.calls.length, 1);
assert.equal(proposal.requiresConfirmation, true);
assert.equal(proposal.mode, 'langchain');
console.log('Compiled LangChain proposal smoke passed (synthetic model, no network or device access).');
