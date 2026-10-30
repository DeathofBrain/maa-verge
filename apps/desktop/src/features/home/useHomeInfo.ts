import { useEffect, useRef, useState } from 'react';
import { errorMessage, rpc, subscribe, type RpcResult, type Settings } from '@maaverge/contracts';
import { gameDataChanged } from '@/shared/lib/update-display';

export type HomeInfoClient = RpcResult<'home.info'>['clientType'];

type Result = {
  key: string;
  info: RpcResult<'home.info'> | null;
  error: string;
};

export function useHomeInfo(
  deviceId: string | undefined,
  client: HomeInfoClient | '',
  estimates: Settings['infrastructureEstimates'],
) {
  const [result, setResult] = useState<Result | null>(null);
  const [revision, setRevision] = useState(0);
  const requestedRefresh = useRef(false);
  const [loading, setLoading] = useState(false);
  const contextKey = JSON.stringify([deviceId, client, JSON.stringify(estimates)]);

  useEffect(
    () =>
      subscribe((event) => {
        if (gameDataChanged(event)) setRevision((value) => value + 1);
      }),
    [],
  );

  useEffect(() => {
    let active = true;
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      setLoading(true);
      try {
        const force = requestedRefresh.current;
        requestedRefresh.current = false;
        const info = await rpc('home.info', {
          ...(deviceId ? { deviceId } : {}),
          ...(client ? { clientType: client } : {}),
          ...(force ? { refresh: true } : {}),
        });
        if (active) setResult({ key: contextKey, info, error: '' });
      } catch (cause) {
        if (active)
          setResult((previous) => ({
            key: contextKey,
            info: previous?.key === contextKey ? previous.info : null,
            error: errorMessage(cause),
          }));
      } finally {
        busy = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [deviceId, client, contextKey, revision]);

  return {
    info: result?.key === contextKey ? result.info : null,
    error: result?.key === contextKey ? result.error : '',
    loading,
    refresh: (force = false) => {
      requestedRefresh.current ||= force;
      setRevision((value) => value + 1);
    },
  };
}
