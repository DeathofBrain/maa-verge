import { useEffect, useState } from 'react';
import {
  errorMessage,
  rpc,
  type CopilotPreview,
  type RpcParams,
  type RpcResult,
} from '@maaverge/contracts';

type Cached<T> = { value: T; savedAt: number; bytes: number };

/** Session-only reads survive page navigation; failed requests remain retryable. */
class ReadCache<T> {
  private values = new Map<string, Cached<T>>();
  private pending = new Map<string, Promise<T>>();
  constructor(
    private ttl: number,
    private limit: number,
    private byteLimit: number,
  ) {}
  peek(key: string) {
    return this.values.get(key);
  }
  fresh(value?: Cached<T>) {
    return !!value && Date.now() - value.savedAt < this.ttl;
  }
  invalidate(key: string) {
    const value = this.values.get(key);
    if (value) value.savedAt = 0;
  }
  read(key: string, request: () => Promise<T>, cacheable = (_value: T) => true): Promise<T> {
    const cached = this.peek(key);
    if (this.fresh(cached)) return Promise.resolve(cached!.value);
    const previous = this.pending.get(key);
    if (previous) return previous;
    const operation = request()
      .then((value) => {
        const bytes = JSON.stringify(value).length * 2;
        if (cacheable(value) && bytes <= this.byteLimit) {
          this.values.delete(key);
          this.values.set(key, { value, savedAt: Date.now(), bytes });
          let total = [...this.values.values()].reduce((sum, entry) => sum + entry.bytes, 0);
          while (this.values.size > this.limit || total > this.byteLimit) {
            const first = this.values.keys().next().value!;
            total -= this.values.get(first)!.bytes;
            this.values.delete(first);
          }
        }
        return value;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, operation);
    return operation;
  }
}

const searches = new ReadCache<RpcResult<'copilot.search'>>(5 * 60_000, 40, 4 * 1024 * 1024);
// Shorter than the service's one-hour preview lease. Import also recovers eviction.
const previews = new ReadCache<CopilotPreview>(10 * 60_000, 10, 8 * 1024 * 1024);
type SearchParams = RpcParams<'copilot.search'>;
type PreviewParams = RpcParams<'copilot.preview'>;
const searchKey = (params: SearchParams, scope: string) =>
  JSON.stringify([
    scope,
    params.target,
    params.keyword ?? '',
    params.stage ?? '',
    params.orderBy ?? 'hot',
    params.page ?? 1,
  ]);
const previewKey = (params: PreviewParams, scope: string) =>
  JSON.stringify([scope, params.code?.trim()]);

export function useCommunitySearch(params: SearchParams, enabled: boolean, scope: string) {
  const key = searchKey(params, scope);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    result?: RpcResult<'copilot.search'>;
    pending: boolean;
    error: string;
  }>();
  const cached = searches.peek(key);
  const current = state?.key === key ? state : undefined;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const previous = searches.peek(key);
    const fresh = searches.fresh(previous);
    setState({ key, result: previous?.value, pending: !fresh, error: '' });
    if (fresh) return;
    const timer = setTimeout(
      () => {
        void searches
          .read(key, () => rpc('copilot.search', params))
          .then(
            (result) => {
              if (!cancelled) setState({ key, result, pending: false, error: '' });
            },
            (cause) => {
              if (!cancelled)
                setState({
                  key,
                  result: previous?.value,
                  pending: false,
                  error: errorMessage(cause),
                });
            },
          );
      },
      previous ? 0 : 350,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, key, revision]);
  return {
    result: current?.result ?? cached?.value,
    searching: enabled && (current?.pending ?? !searches.fresh(cached)),
    error: current?.error ?? '',
    refresh: () => {
      searches.invalidate(key);
      setRevision((value) => value + 1);
    },
  };
}

export function cachedCommunityPreview(params: PreviewParams, scope: string) {
  if (params.code === undefined) return undefined;
  const cached = previews.peek(previewKey(params, scope));
  return previews.fresh(cached) ? cached?.value : undefined;
}

export function readCopilotPreview(params: PreviewParams, scope: string, refresh = false) {
  if (params.code === undefined) return rpc('copilot.preview', params);
  const key = previewKey(params, scope);
  if (refresh) previews.invalidate(key);
  return previews.read(
    key,
    () => rpc('copilot.preview', params),
    (value) => value.entries.some((entry) => !!entry.record && !entry.error),
  );
}

export function invalidateCopilotPreview(params: PreviewParams, scope: string) {
  if (params.code !== undefined) previews.invalidate(previewKey(params, scope));
}
