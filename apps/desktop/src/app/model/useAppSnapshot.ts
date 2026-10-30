import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { errorMessage, rpc, type Snapshot } from '@maaverge/contracts';

type Options = {
  historicalDeviceRef: RefObject<string | undefined>;
  setSelectedDevice: Dispatch<SetStateAction<string>>;
};

export default function useAppSnapshot({ historicalDeviceRef, setSelectedDevice }: Options) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const refreshSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const next = await rpc('app.snapshot', {});
      if (sequence !== refreshSequence.current) return;
      setSnapshot(next);
      setSelectedDevice((previous) =>
        next.devices.some((item) => item.id === previous) ||
        historicalDeviceRef.current === previous
          ? previous
          : next.devices.find((item) => item.state !== 'offline')?.id || next.devices[0]?.id || '',
      );
      setError('');
    } catch (cause) {
      if (sequence === refreshSequence.current) setError(errorMessage(cause));
    }
  }, [historicalDeviceRef, setSelectedDevice]);

  return { snapshot, refresh, error, refreshSequence };
}
