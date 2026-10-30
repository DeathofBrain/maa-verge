import { useCallback, useRef } from 'react';

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
