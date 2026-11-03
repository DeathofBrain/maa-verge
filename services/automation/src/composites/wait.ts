/** 通用只读等待；不需要设备、截图、画布或游戏资源，同时服从取消和根期限。 */
import { AtomicFailure, checkCancelled } from '../core/errors';
import type { AtomicExecutionContext } from '../core/types';

export async function waitForDuration(ms: number, context: AtomicExecutionContext = {}) {
  checkCancelled(context);
  if (!Number.isFinite(ms) || ms < 0) throw new AtomicFailure('等待时间无效');
  const remaining = (context.deadline ?? Infinity) - Date.now();
  if (remaining <= 0) throw new AtomicFailure('根流程期限已耗尽', 'unknown');
  if (ms <= 0) return;
  // 定时器与取消监听只保留一个退出路径；期限到达后不能继续执行后续输入。
  await new Promise<void>((resolve, reject) => {
    const signal = context.signal;
    const timer = setTimeout(
      () => {
        signal?.removeEventListener('abort', abort);
        resolve();
      },
      Math.min(ms, remaining),
    );
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('已取消'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
  checkCancelled(context);
  if (context.deadline !== undefined && Date.now() >= context.deadline)
    throw new AtomicFailure('根流程期限已耗尽', 'unknown');
}
