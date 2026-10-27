import { expect, test } from 'bun:test';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { AgentInputError } from '../src';
import { AgentBudgetError, AgentOutputError, createLangChainProposer } from '../src/langchain';
import { SyntheticChatModel, syntheticProposal } from './support/synthetic-model';
import type { MaaToolSet } from '../tools/types';

function outputModel(output: Record<string, unknown>) {
  return new SyntheticChatModel(
    ({ toolNames, call }) =>
      new AIMessage({
        content: '',
        tool_calls: [
          { name: toolNames[0]!, id: `output-${call}`, type: 'tool_call', args: output },
        ],
      }),
  );
}

test('real LangChain tool strategy returns only the host-prepared plan for review', async () => {
  const model = new SyntheticChatModel();
  const prepared = Object.freeze({
    normalizedBy: 'host',
    budgets: { originium: 0, medicine: 0, expedited: 0 },
  });
  let preparations = 0;
  const proposer = createLangChainProposer({
    model,
    maxModelCalls: 1,
    preparePlan: (draft) => {
      preparations++;
      expect(draft).toEqual({ ...syntheticProposal.plan, id: '' });
      return prepared;
    },
  });
  const proposal = await proposer.propose('刷 2-8 三次');
  expect(model.calls).toHaveLength(1);
  expect(model.calls[0]!.toolNames).toEqual(['AgentPlanProposal']);
  expect(model.calls[0]!.messages.at(-1)!.content).toBe('刷 2-8 三次');
  expect(preparations).toBe(1);
  expect(proposal.plan).toBe(prepared);
  expect(proposal).toMatchObject({
    reply: syntheticProposal.reply,
    requiresConfirmation: true,
    mode: 'langchain',
  });
});

test('default model budget is zero and prevents all model and host calls', async () => {
  const model = new SyntheticChatModel();
  let preparations = 0;
  const proposer = createLangChainProposer({
    model,
    preparePlan: () => {
      preparations++;
    },
  });
  await expect(proposer.propose('做日常')).rejects.toBeInstanceOf(AgentBudgetError);
  expect(model.calls).toHaveLength(0);
  expect(preparations).toBe(0);
});

test('optional host tools participate in the proposer loop while the final plan remains a draft', async () => {
  let toolCalls = 0;
  const maaTools: MaaToolSet = {
    definitions: [
      {
        name: 'maa_test_status',
        description: '合成状态',
        effect: 'read',
        schema: { type: 'object', properties: {}, additionalProperties: false },
      },
    ],
    async invoke(name, input, invocation) {
      expect({ name, input, callId: invocation.callId }).toEqual({
        name: 'maa_test_status',
        input: {},
        callId: 'observe-1',
      });
      toolCalls++;
      return { content: { state: 'idle' }, artifact: { data: 'private-local-evidence' } };
    },
  };
  const model = new SyntheticChatModel(({ call, messages, toolNames }) => {
    expect(toolNames).toEqual(['maa_test_status', 'AgentPlanProposal']);
    if (call === 1)
      return new AIMessage({
        content: '',
        tool_calls: [{ name: 'maa_test_status', id: 'observe-1', type: 'tool_call', args: {} }],
      });
    const observation = messages.find((message) => message instanceof ToolMessage);
    expect(observation?.content).toBe('{"state":"idle"}');
    expect(JSON.stringify(observation?.content)).not.toContain('private-local-evidence');
    return new AIMessage({
      content: '',
      tool_calls: [
        {
          name: 'AgentPlanProposal',
          id: 'proposal-1',
          type: 'tool_call',
          args: structuredClone(syntheticProposal),
        },
      ],
    });
  });
  const proposer = createLangChainProposer({
    model,
    maaTools,
    maxModelCalls: 2,
    preparePlan: (draft) => draft,
  });
  const proposal = await proposer.propose('查询状态后生成草稿');
  expect(toolCalls).toBe(1);
  expect(model.calls).toHaveLength(2);
  expect(proposal).toMatchObject({
    mode: 'langchain',
    requiresConfirmation: true,
    plan: syntheticProposal.plan,
  });
});

test('invalid input is rejected before model invocation even with an authorized call budget', async () => {
  const model = new SyntheticChatModel();
  let preparations = 0;
  const proposer = createLangChainProposer({
    model,
    maxModelCalls: 1,
    preparePlan: () => {
      preparations++;
    },
  });
  for (const message of [null, 1, '\u001c\u0085 ', '😀'.repeat(4001)]) {
    await expect(proposer.propose(message)).rejects.toBeInstanceOf(AgentInputError);
  }
  expect(model.calls).toHaveLength(0);
  expect(preparations).toBe(0);
});

test('provider failure propagates without a deterministic fallback or extra model calls', async () => {
  const failure = new Error('synthetic provider unavailable');
  const model = new SyntheticChatModel(() => {
    throw failure;
  });
  let preparations = 0;
  const proposer = createLangChainProposer({
    model,
    maxModelCalls: 2,
    preparePlan: () => {
      preparations++;
    },
  });
  await expect(proposer.propose('做日常')).rejects.toBe(failure);
  expect(model.calls).toHaveLength(1);
  expect(preparations).toBe(0);
});

test('plain model text is rejected without fabricating a structured proposal', async () => {
  const model = new SyntheticChatModel(() => new AIMessage('继续考虑，尚无结构化草稿。'));
  let preparations = 0;
  const proposer = createLangChainProposer({
    model,
    maxModelCalls: 2,
    preparePlan: () => {
      preparations++;
    },
  });
  await expect(proposer.propose('做日常')).rejects.toBeInstanceOf(AgentOutputError);
  expect(model.calls).toHaveLength(1);
  expect(preparations).toBe(0);
});

test('unsupported tool calls fail with no host execution or additional model calls', async () => {
  const model = new SyntheticChatModel(
    ({ call }) =>
      new AIMessage({
        content: '',
        tool_calls: [
          { name: 'unavailable_tool', args: {}, id: `unsupported-${call}`, type: 'tool_call' },
        ],
      }),
  );
  let preparations = 0;
  const proposer = createLangChainProposer({
    model,
    maxModelCalls: 2,
    preparePlan: () => {
      preparations++;
    },
  });
  await expect(proposer.propose('做日常')).rejects.toThrow();
  expect(model.calls).toHaveLength(1);
  expect(model.calls[0]!.toolNames).toEqual(['AgentPlanProposal']);
  expect(preparations).toBe(0);
});

test('the authorized model budget is scoped to each proposal invocation', async () => {
  const model = new SyntheticChatModel();
  let preparations = 0;
  const proposer = createLangChainProposer({
    model,
    maxModelCalls: 1,
    preparePlan: () => {
      preparations++;
      return 'prepared';
    },
  });
  await expect(proposer.propose('第一次草稿')).resolves.toHaveProperty('plan', 'prepared');
  await expect(proposer.propose('第二次草稿')).resolves.toHaveProperty('plan', 'prepared');
  expect(model.calls).toHaveLength(2);
  expect(model.calls[1]!.messages.filter((message) => message.type === 'human')).toHaveLength(1);
  expect(preparations).toBe(2);
});

test('invalid call or time budgets cannot create a model proposer', () => {
  const model = new SyntheticChatModel();
  for (const maxModelCalls of [-1, 1.5, 9, NaN, Infinity]) {
    expect(() =>
      createLangChainProposer({ model, maxModelCalls, preparePlan: (draft) => draft }),
    ).toThrow(RangeError);
  }
  for (const timeoutMs of [0, 1.5, 300001, NaN, Infinity]) {
    expect(() =>
      createLangChainProposer({ model, timeoutMs, preparePlan: (draft) => draft }),
    ).toThrow(RangeError);
  }
  expect(model.calls).toHaveLength(0);
});

test('a host policy rejection prevents any unvalidated plan from escaping', async () => {
  const model = new SyntheticChatModel();
  const failure = new Error('synthetic host policy rejects this task');
  let preparations = 0;
  const proposer = createLangChainProposer({
    model,
    maxModelCalls: 1,
    preparePlan: () => {
      preparations++;
      throw failure;
    },
  });
  await expect(proposer.propose('做日常')).rejects.toBe(failure);
  expect(model.calls).toHaveLength(1);
  expect(preparations).toBe(1);
});

for (const [field, value] of Object.entries({
  budgets: { originium: 1 },
  id: 'existing-plan',
  deviceId: 'device-1',
})) {
  test(`model cannot set host-owned plan field ${field}`, async () => {
    const model = outputModel({
      ...syntheticProposal,
      plan: { ...syntheticProposal.plan, [field]: value },
    });
    let preparations = 0;
    const proposer = createLangChainProposer({
      model,
      maxModelCalls: 1,
      preparePlan: () => {
        preparations++;
      },
    });
    await expect(proposer.propose('做日常')).rejects.toThrow();
    expect(model.calls).toHaveLength(1);
    expect(preparations).toBe(0);
  });
}

test('an invalid task type fails schema validation before host preparation', async () => {
  const model = outputModel({
    ...syntheticProposal,
    plan: {
      ...syntheticProposal.plan,
      tasks: [{ type: 'Shell', params: { command: 'anything' }, enabled: true }],
    },
  });
  let preparations = 0;
  const proposer = createLangChainProposer({
    model,
    maxModelCalls: 1,
    preparePlan: () => {
      preparations++;
    },
  });
  await expect(proposer.propose('做日常')).rejects.toThrow();
  expect(model.calls).toHaveLength(1);
  expect(preparations).toBe(0);
});

function pendingModel(started: () => void) {
  return new SyntheticChatModel(
    ({ signal }) =>
      new Promise<AIMessage>((_resolve, reject) => {
        if (!signal) return reject(new Error('agent did not pass an abort signal'));
        if (signal.aborted) return reject(signal.reason);
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        started();
      }),
  );
}

test('timeout cancels an in-flight model call and never prepares a plan', async () => {
  const model = pendingModel(() => {});
  let preparations = 0;
  const proposer = createLangChainProposer({
    model,
    maxModelCalls: 1,
    timeoutMs: 100,
    preparePlan: () => {
      preparations++;
    },
  });
  await expect(proposer.propose('做日常')).rejects.toThrow();
  expect(model.calls).toHaveLength(1);
  expect(model.calls[0]!.signal!.aborted).toBe(true);
  expect(preparations).toBe(0);
});

test('caller cancellation reaches an in-flight model and never prepares a plan', async () => {
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const model = pendingModel(markStarted);
  const controller = new AbortController();
  let preparations = 0;
  const proposer = createLangChainProposer({
    model,
    maxModelCalls: 1,
    preparePlan: () => {
      preparations++;
    },
  });
  const invocation = proposer.propose('做日常', { signal: controller.signal }).then(
    () => ({ error: undefined }),
    (error) => ({ error }),
  );
  await started;
  controller.abort(new Error('synthetic caller cancellation'));
  expect((await invocation).error).toBeInstanceOf(Error);
  expect(model.calls).toHaveLength(1);
  expect(model.calls[0]!.signal!.aborted).toBe(true);
  expect(preparations).toBe(0);
});

test('a pre-cancelled invocation never reaches the model', async () => {
  const model = new SyntheticChatModel();
  const controller = new AbortController();
  const reason = new Error('already cancelled');
  controller.abort(reason);
  const proposer = createLangChainProposer({
    model,
    maxModelCalls: 1,
    preparePlan: (draft) => draft,
  });
  await expect(proposer.propose('做日常', { signal: controller.signal })).rejects.toBe(reason);
  expect(model.calls).toHaveLength(0);
});
