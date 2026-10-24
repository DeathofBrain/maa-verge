import type { Event } from './types';
import type { RpcContract } from './rpc-types';
import { RuntimeRequestError } from './error-display';

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
  if (!isDesktop()) throw new Error('未连接桌面运行时，请使用 pnpm dev 启动 Maa Verge 桌面应用。');
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<RpcResult<M>>('runtime_request', { method, params });
  } catch (cause) { throw cause instanceof RuntimeRequestError ? cause : new RuntimeRequestError(cause); }
}

export function subscribe(callback: (event: Event) => void): () => void {
  // The snapshot request reports the missing desktop bridge. There is no local
  // event source to subscribe to when this page is opened in a plain browser.
  if (!isDesktop()) return () => {};
  let disposed = false;
  let unlisten: (() => void) | undefined;
  // The desktop host maps the stdio method runtime.event to a legal Tauri name.
  void import('@tauri-apps/api/event')
    .then(({ listen }) => listen<Event>('runtime-event', ({ payload }) => callback(payload)))
    .then((dispose) => { if (disposed) dispose(); else unlisten = dispose; });
  return () => { disposed = true; unlisten?.(); };
}
