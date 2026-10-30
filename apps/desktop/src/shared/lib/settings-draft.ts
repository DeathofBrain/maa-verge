import { useEffect, useState } from 'react';
export function useSettingsDraft<T extends object>(key: string, saved: T) {
  const fingerprint = JSON.stringify(saved);
  const [state, setState] = useState<{ base: string; value: T }>(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(`maaverge:settings-draft:${key}`) || 'null');
      const valid =
        cached &&
        typeof cached.base === 'string' &&
        cached.value &&
        Object.entries(saved).every(
          ([field, value]) =>
            typeof cached.value[field] === typeof value &&
            (typeof value !== 'number' || Number.isFinite(cached.value[field])),
        );
      if (valid && JSON.stringify(cached.value) !== cached.base) return cached;
    } catch {
      /* A damaged cache should not block application settings. */
    }
    return { base: fingerprint, value: saved };
  });
  useEffect(() => {
    setState((current) =>
      JSON.stringify(current.value) === current.base ||
      JSON.stringify(current.value) === fingerprint
        ? { base: fingerprint, value: saved }
        : current,
    );
  }, [fingerprint]);
  useEffect(() => {
    try {
      const cacheKey = `maaverge:settings-draft:${key}`;
      if (JSON.stringify(state.value) === state.base) sessionStorage.removeItem(cacheKey);
      else sessionStorage.setItem(cacheKey, JSON.stringify(state));
    } catch {
      /* Session caching is optional. */
    }
  }, [key, state]);
  const setDraft = (update: T | ((value: T) => T)) =>
    setState((current) => ({
      ...current,
      value: typeof update === 'function' ? update(current.value) : update,
    }));
  return [state.value, setDraft, () => setState({ base: fingerprint, value: saved })] as const;
}
