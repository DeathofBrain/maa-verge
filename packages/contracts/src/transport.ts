import type { Device, Event, Plan, Run, Settings, Snapshot, UpdateChannel } from './types';
import { mockRpc, onMockEvent } from './mock';

function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface Results {
  'app.snapshot': Snapshot;
  'plan.save': Plan;
  'plan.delete': { deleted: boolean };
  'device.discover': { address: string; name: string; adbState: string }[];
  'device.connect': Device;
  'device.auto_connect': { devices: Device[]; discovered: { address: string; name: string; adbState: string }[]; diagnostics: string[] };
  'device.disconnect': { disconnected: boolean };
  'run.start': Run;
  'run.stop': Run;
  'updates.check': UpdateChannel;
  'updates.prepare': UpdateChannel;
  'updates.activate': UpdateChannel;
  'updates.rollback': UpdateChannel;
  'settings.save': Settings;
  'agent.message': { reply: string; plan?: Plan; requiresConfirmation: boolean; mode: string };
}

export function rpc<M extends keyof Results>(method: M, params?: Record<string, unknown>): Promise<Results[M]>;
export function rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
export async function rpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  if (!isDesktop()) return mockRpc(method, params) as Promise<T>;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>('runtime_request', { method, params });
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
