import type { Event } from './types';
import type { RpcContract } from './rpc-types';
import { mockRpc, onMockEvent } from './mock';

function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export type RpcMethod = keyof RpcContract['params'];
export type RpcParams<M extends RpcMethod> = keyof RpcContract['params'][M] extends never
  ? Record<string, never> : RpcContract['params'][M];
export type RpcResult<M extends RpcMethod> = RpcContract['results'][M];

export async function rpc<M extends RpcMethod>(
  method: M,
  ...arguments_: keyof RpcContract['params'][M] extends never ? [params?: RpcParams<M>] : [params: RpcParams<M>]
): Promise<RpcResult<M>> {
  const params = arguments_[0] ?? {};
  if (!isDesktop()) return mockRpc(method, params) as Promise<RpcResult<M>>;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<RpcResult<M>>('runtime_request', { method, params });
}

export function subscribe(callback: (event: Event) => void): () => void {
  if (!isDesktop()) return onMockEvent(callback);
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void import('@tauri-apps/api/event')
    .then(({ listen }) => listen<Event>('runtime.event', ({ payload }) => callback(payload)))
    .then((dispose) => { if (disposed) dispose(); else unlisten = dispose; });
  return () => { disposed = true; unlisten?.(); };
}
