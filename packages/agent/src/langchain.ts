import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createAgent, modelCallLimitMiddleware, toolStrategy } from 'langchain';
import { validateAgentMessage } from './input';
import { proposalSchema } from './proposal-schema';
import { assertZeroConsumableProposal } from './proposal-policy';
import { assertAgentTracingDisabled } from './tracing';
import type { AgentProposal, PreparePlan } from './types';

export { AgentConfigurationError } from './tracing';
export { AgentProposalPolicyError } from './proposal-policy';

export interface LangChainProposerOptions<TPlan> {
  /** The host configures the provider, credentials, retries and token ceiling. */
  model: BaseChatModel;
  /** Must normalize the draft and enforce the same policy as the plan editor. */
  preparePlan: PreparePlan<TPlan>;
  /** Zero by default. Counts agent calls, not provider-internal retries or cost. */
  maxModelCalls?: number;
  timeoutMs?: number;
}

export class AgentBudgetError extends Error {
  constructor() { super('模型调用额度为 0，请先明确配置额度'); this.name = 'AgentBudgetError'; }
}

export class AgentOutputError extends Error {
  constructor() { super('模型未返回有效的待确认计划'); this.name = 'AgentOutputError'; }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Optional foundation only; the production RPC still selects the local proposer. */
export function createLangChainProposer<TPlan>(options: LangChainProposerOptions<TPlan>) {
  const { model, preparePlan, maxModelCalls = 0, timeoutMs = 30000 } = options;
  if (!Number.isSafeInteger(maxModelCalls) || maxModelCalls < 0 || maxModelCalls > 8) throw new RangeError('maxModelCalls must be an integer from 0 to 8');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new RangeError('timeoutMs must be an integer from 1 to 300000');
  const agent = createAgent({
    model,
    tools: [],
    systemPrompt: '你是 Maa Verge 的计划草稿助手。只生成简体中文说明和待审阅的任务表，不声称已执行。只使用任务契约中的类型；源石、理智药和加急许可默认额度均为 0，不申请任何消耗，不指定设备或定时。无法可靠规划时应说明原因，不虚构结果。',
    responseFormat: toolStrategy(proposalSchema, { handleError: false }),
    middleware: [modelCallLimitMiddleware({ runLimit: maxModelCalls, exitBehavior: 'error' })],
  });

  return {
    async propose(message: unknown, invocation: { signal?: AbortSignal } = {}): Promise<AgentProposal<TPlan, 'langchain'>> {
      const text = validateAgentMessage(message);
      if (maxModelCalls === 0) throw new AgentBudgetError();
      assertAgentTracingDisabled();
      const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(invocation.signal ? [invocation.signal] : [])]);
      signal.throwIfAborted();
      const result = await agent.invoke({ messages: [{ role: 'user', content: text }] }, { signal, recursionLimit: maxModelCalls * 4 + 4 });
      signal.throwIfAborted();
      const output: unknown = result.structuredResponse;
      // JSON Schema strategy support varies by model. The host remains the final
      // schema/policy authority even when the provider reports a valid response.
      if (!record(output) || typeof output.reply !== 'string' || !output.reply.trim() || [...output.reply].length > 2000
        || !record(output.plan) || Object.keys(output).some(key => !['reply', 'plan'].includes(key))
        || Object.keys(output.plan).some(key => !['name', 'tasks'].includes(key))) throw new AgentOutputError();
      assertZeroConsumableProposal(output.plan.tasks);
      const plan = preparePlan({ ...output.plan, id: '' });
      return { reply: output.reply, plan, requiresConfirmation: true, mode: 'langchain' };
    },
  };
}
