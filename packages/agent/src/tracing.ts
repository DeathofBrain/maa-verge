import { getCurrentRunTree } from 'langsmith/traceable';

const tracingFlags = ['LANGSMITH_TRACING', 'LANGSMITH_TRACING_V2', 'LANGCHAIN_TRACING_V2'] as const;

export class AgentConfigurationError extends Error {
  constructor() {
    super('当前 Agent 模块尚未开放外部追踪；请关闭 LangSmith/LangChain 追踪后重试');
    this.name = 'AgentConfigurationError';
  }
}

/** Reject ambient tracing before invoking the graph; never modify process.env. */
export function assertAgentTracingDisabled(): void {
  // These are the exact boolean switches read by the pinned LangChain SDK.
  // A false outer scope does not override inherited environment flags here:
  // Bun's graph iterator can start outside the enclosing tracing context.
  if (tracingFlags.some(flag => process.env[flag] === 'true')) throw new AgentConfigurationError();
  // The legacy switch is also used as a raw truthy string by CallbackManager.
  // Reject even "false" or "0" instead of relying on its current inner branches.
  if (process.env.LANGCHAIN_TRACING) throw new AgentConfigurationError();
  const context = getCurrentRunTree(true);
  if (context && context.tracingEnabled !== false) throw new AgentConfigurationError();
}
