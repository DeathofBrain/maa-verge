import { useEffect, useRef, useState } from 'react';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';
type Options<T> = {
  delay?: number;
  normalize?: (value: T) => T;
  isValid?: (value: T) => boolean;
  memoryKey?: string;
};
type CachedDraft = { base: string; value: object };
const memoryDrafts = new Map<string, CachedDraft>();
const draftOwners = new Map<string, number>();
let draftSequence = 0;

export function useAutoSaveDraft<T extends object>(
  key: string | null,
  saved: T,
  onSave: (value: T) => Promise<boolean | T>,
  options: Options<T> = {},
) {
  const fingerprint = JSON.stringify(saved);
  const cacheIdentity = key
    ? `stored:${key}`
    : options.memoryKey
      ? `memory:${options.memoryKey}`
      : null;
  const [owner] = useState(() => ++draftSequence);
  const [draft, setValue] = useState<T>(() => {
    if (cacheIdentity) {
      try {
        const cached =
          memoryDrafts.get(cacheIdentity) ??
          (key
            ? JSON.parse(sessionStorage.getItem(`maaverge:settings-draft:${key}`) || 'null')
            : null);
        if (
          cached?.value &&
          typeof cached.base === 'string' &&
          Object.entries(saved).every(
            ([field, value]) => typeof cached.value[field] === typeof value,
          )
        )
          return cached.value;
      } catch {
        // Draft caching is optional.
      }
    }
    return saved;
  });
  const [status, setStatus] = useState<SaveStatus>(
    JSON.stringify(draft) === fingerprint ? 'saved' : 'pending',
  );
  const current = useRef(draft);
  const acknowledged = useRef(fingerprint);
  const base = useRef(fingerprint);
  const callback = useRef(onSave);
  const serverValue = useRef(saved);
  const configuration = useRef(options);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  callback.current = onSave;
  serverValue.current = saved;
  configuration.current = options;

  const normalized = () => configuration.current.normalize?.(current.current) ?? current.current;
  const cache = () => {
    if (!cacheIdentity || draftOwners.get(cacheIdentity) !== owner) return;
    try {
      if (JSON.stringify(current.current) === acknowledged.current) {
        memoryDrafts.delete(cacheIdentity);
        if (key) sessionStorage.removeItem(`maaverge:settings-draft:${key}`);
      } else {
        const value = { base: acknowledged.current, value: current.current };
        memoryDrafts.set(cacheIdentity, value);
        if (key) sessionStorage.setItem(`maaverge:settings-draft:${key}`, JSON.stringify(value));
      }
    } catch {
      // Storage must not prevent saving preferences.
    }
  };
  const setPhase = (value: SaveStatus) => {
    if (mounted.current) setStatus(value);
  };
  const flush = async (): Promise<void> => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (inFlight.current) {
      await inFlight.current;
      if (JSON.stringify(normalized()) !== acknowledged.current) await flush();
      return;
    }
    const next = normalized();
    const nextFingerprint = JSON.stringify(next);
    const serverAtStart = JSON.stringify(serverValue.current);
    if (nextFingerprint === acknowledged.current) {
      setPhase('saved');
      cache();
      return;
    }
    if (configuration.current.isValid && !configuration.current.isValid(next)) {
      setPhase('pending');
      return;
    }
    setPhase('saving');
    inFlight.current = Promise.resolve().then(async () => {
      let result: boolean | T = false;
      try {
        result = await callback.current(next);
      } catch {
        // The caller owns the specific error message; keep the input available for retry.
      }
      if (result !== false) {
        acknowledged.current = nextFingerprint;
        if (JSON.stringify(normalized()) === nextFingerprint) {
          const confirmed =
            typeof result === 'object'
              ? result
              : JSON.stringify(serverValue.current) !== serverAtStart
                ? serverValue.current
                : next;
          acknowledged.current = JSON.stringify(confirmed);
          current.current = confirmed;
          if (mounted.current) setValue(confirmed);
          setPhase('saved');
        }
      } else setPhase('error');
      cache();
    });
    await inFlight.current;
    inFlight.current = null;
    if (
      timer.current === undefined &&
      JSON.stringify(normalized()) !== nextFingerprint &&
      JSON.stringify(normalized()) !== acknowledged.current
    )
      await flush();
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const setDraft = (update: T | ((value: T) => T), delay = options.delay ?? 500) => {
    const next = typeof update === 'function' ? update(current.current) : update;
    current.current = next;
    setValue(next);
    cache();
    clearTimeout(timer.current);
    timer.current = undefined;
    if (!inFlight.current && JSON.stringify(normalized()) === acknowledged.current) {
      setPhase('saved');
      return;
    }
    setPhase('pending');
    timer.current = setTimeout(() => void flushRef.current(), delay);
  };

  useEffect(() => {
    if (base.current === fingerprint) return;
    const unchanged =
      !inFlight.current &&
      (JSON.stringify(current.current) === base.current ||
        JSON.stringify(normalized()) === acknowledged.current);
    base.current = fingerprint;
    acknowledged.current = fingerprint;
    if (unchanged || JSON.stringify(normalized()) === fingerprint) {
      current.current = saved;
      setValue(saved);
      setPhase('saved');
      cache();
    }
  }, [fingerprint]);

  useEffect(() => {
    mounted.current = true;
    if (cacheIdentity) draftOwners.set(cacheIdentity, owner);
    if (JSON.stringify(normalized()) !== acknowledged.current)
      timer.current = setTimeout(() => void flushRef.current(), configuration.current.delay ?? 500);
    return () => {
      mounted.current = false;
      if (timer.current !== undefined) void flushRef.current();
    };
  }, []);

  return {
    draft,
    setDraft,
    flush,
    reset: () => setDraft(saved, 0),
    status,
    retry: flush,
    synchronize: (value: T) => {
      clearTimeout(timer.current);
      timer.current = undefined;
      acknowledged.current = JSON.stringify(value);
      current.current = value;
      if (mounted.current) setValue(value);
      setPhase('saved');
      cache();
    },
  };
}

export const autoSaveLabel = (status: SaveStatus) =>
  status === 'saved'
    ? ''
    : status === 'error'
      ? '保存失败，修改已保留'
      : status === 'pending'
        ? '等待保存…'
        : '正在保存…';
