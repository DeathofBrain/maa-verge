import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, rpc, type Run } from '@maaverge/contracts';

type ToastMessage = { text: string; error?: boolean };

export default function useAppActions(refresh: () => Promise<void>) {
  const pendingRef = useRef(new Set<string>());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const isPending = useCallback((key: string) => pendingRef.current.has(key), []);
  const action = useCallback(
    async (key: string, call: () => Promise<unknown>, success?: string) => {
      if (pendingRef.current.has(key)) return false;
      setToast(null);
      pendingRef.current.add(key);
      setPending(new Set(pendingRef.current));
      try {
        await call();
        await refresh();
        if (success) setToast({ text: success });
        return true;
      } catch (cause) {
        await refresh();
        setToast({ text: errorMessage(cause), error: true });
        return false;
      } finally {
        pendingRef.current.delete(key);
        setPending(new Set(pendingRef.current));
      }
    },
    [refresh],
  );

  const stopMany = useCallback(
    async (runs: Run[]) => {
      const unique = [...new Map(runs.map((run) => [run.id, run])).values()];
      if (!unique.length) return false;
      return action(
        'stop-many',
        async () => {
          const settled = await Promise.allSettled(
            unique.map((run) => rpc('run.stop', { id: run.id })),
          );
          const failed = settled.filter((result) => result.status === 'rejected').length;
          if (failed)
            throw new Error(`已停止 ${unique.length - failed} 台设备，${failed} 台失败。`);
        },
        `已停止 ${unique.length} 台设备。`,
      );
    },
    [action],
  );

  return { action, pending, isPending, stopMany, toast, setToast };
}
