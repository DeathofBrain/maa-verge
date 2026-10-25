import { getCurrentRunTree } from 'langsmith/traceable';
import { CallbackManager, type Callbacks } from '@langchain/core/callbacks/manager';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';

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

/** Inspect explicit/inherited SDK callbacks before they can receive any input. */
export function assertAgentCallbacksLocal(callbacks?: Callbacks, localCallbacks?: Callbacks): void {
  assertAgentTracingDisabled();
  const isTracer = (handler: unknown) => handler instanceof LangChainTracer
    || (handler !== null && typeof handler === 'object' && 'name' in handler && handler.name === 'langchain_tracer');
  for (const candidate of [callbacks, localCallbacks]) {
    const handlers = Array.isArray(candidate) ? candidate : candidate?.handlers;
    if (handlers?.some(isTracer)) throw new AgentConfigurationError();
  }
  // configure() resolves inherited handlers and SDK configure hooks without
  // dispatching a run. Normal application callbacks remain usable locally.
  const manager = CallbackManager.configure(callbacks, localCallbacks);
  if (manager?.handlers.some(isTracer)) {
    throw new AgentConfigurationError();
  }
}
