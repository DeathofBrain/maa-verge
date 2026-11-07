import { useCallback, useRef } from 'react';

// 同一任务表的保存、删除串行执行，不同任务表互不阻塞；一次失败不截断后续写入。
export default function usePlanWrites() {
  const planWrites = useRef(new Map<string, Promise<unknown>>());
  const deletedPlans = useRef(new Set<string>());

  const mutatePlan = useCallback(async <T>(id: string, call: () => Promise<T>): Promise<T> => {
    const previous = planWrites.current.get(id);
    const next = (previous || Promise.resolve()).catch(() => {}).then(call);
    planWrites.current.set(id, next);
    try {
      return await next;
    } finally {
      if (planWrites.current.get(id) === next) planWrites.current.delete(id);
    }
  }, []);

  return { mutatePlan, deletedPlans };
}
