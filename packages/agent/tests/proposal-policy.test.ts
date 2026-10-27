import { expect, test } from 'bun:test';
import { AIMessage } from '@langchain/core/messages';
import { createLangChainProposer } from '../src/langchain';
import { AgentProposalPolicyError } from '../src/proposal-policy';
import { SyntheticChatModel, syntheticProposal } from './support/synthetic-model';

for (const params of [
  { stone: 1 },
  { medicine: 1 },
  { expedite_times: 1 },
  { expiring_medicine: 1 },
  { medicine_expire_days: 1 },
  { expedite: true },
  { use_sanity_potion: true },
])
  test(`model proposal cannot request consumables through ${Object.keys(params)[0]}`, async () => {
    const model = new SyntheticChatModel(
      ({ toolNames }) =>
        new AIMessage({
          content: '',
          tool_calls: [
            {
              name: toolNames[0]!,
              id: 'synthetic-spend',
              type: 'tool_call',
              args: {
                ...syntheticProposal,
                plan: {
                  ...syntheticProposal.plan,
                  tasks: [{ type: 'Fight', enabled: false, params }],
                },
              },
            },
          ],
        }),
    );
    let preparations = 0;
    const proposer = createLangChainProposer({
      model,
      maxModelCalls: 1,
      preparePlan: () => {
        preparations++;
      },
    });
    await expect(proposer.propose('生成草稿')).rejects.toBeInstanceOf(AgentProposalPolicyError);
    expect(preparations).toBe(0);
  });
