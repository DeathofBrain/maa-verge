import type { AtomicExecutionContext } from './types';

/** 可明确分类的能力失败，由注册表保留其状态；其余异常按结果未知处理。 */
export class AtomicFailure extends Error {
  constructor(
    message: string,
    readonly status: 'failed' | 'unavailable' | 'unknown' = 'failed',
  ) {
    super(message);
  }
}
/** 供观察与流程在步骤边界检查取消；正在执行的原生操作由宿主负责终止和清理。 */
export const checkCancelled = (context: AtomicExecutionContext) => context.signal?.throwIfAborted();
