import type {
  AtomicCapabilityDescriptor,
  AtomicCapabilityResult,
  AtomicExecutionContext,
} from '../core/types';
import type { PipelineDefinitions } from '../pipeline/definitions';

export type CapabilityHandler = (
  input: Record<string, unknown>,
  context: AtomicExecutionContext,
) => Promise<AtomicCapabilityResult>;

/** 功能提供自己的契约、可用性和实现，通用目录只负责校验与分派。 */
export type CapabilityRegistration = {
  descriptor: AtomicCapabilityDescriptor;
  validate: (input: unknown) => boolean;
  handler: CapabilityHandler;
  /** JSON 入口只执行同一份 handler；组合节点通过 call 显式调用下层。 */
  pipeline?: { definitions: PipelineDefinitions; entry: string };
  dependencies?: readonly string[];
  validateResult?: (result: unknown) => boolean;
};
