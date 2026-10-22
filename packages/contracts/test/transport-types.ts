import { rpc } from '../src/transport';
import type { Snapshot } from '../src/types';

// Compile-only assertions: the generated method map must prevent invalid calls
// before they can reach Tauri. This function is never invoked.
void function verifyTransportTypes() {
  const snapshot: Promise<Snapshot> = rpc('app.snapshot');
  void snapshot;
  void rpc('app.snapshot', {});
  void rpc('run.start', { planId: 'plan', deviceId: 'device', requestId: 'unique' });
  void rpc('updates.check', { channel: 'resource' });
  void rpc('stages.list', { clientType: 'YoStarEN' });
  void rpc('stages.list', { refresh: true });
  // @ts-expect-error Explicit refresh is a boolean.
  void rpc('stages.list', { refresh: 1 });
  // @ts-expect-error Stage clients form a closed set.
  void rpc('stages.list', { clientType: 'unknown' });
  // @ts-expect-error Filesystem locations are selected by the service.
  void rpc('stages.list', { resourcePath: '/arbitrary' });
  // @ts-expect-error Unknown methods must not bypass typed transport.
  void rpc('arbitrary.shell', {});
  // @ts-expect-error Requests with required parameters cannot omit them.
  void rpc('run.start');
  // @ts-expect-error A persistent deduplication key is required for starting runs.
  void rpc('run.start', { planId: 'plan', deviceId: 'device' });
  // @ts-expect-error Empty parameter methods accept no extra properties.
  void rpc('app.snapshot', { shell: 'arbitrary' });
  // @ts-expect-error Update channels form a closed set.
  void rpc('updates.check', { channel: 'combined' });
  // @ts-expect-error Result types are determined by method, not caller assertions.
  const wrong: Promise<string> = rpc('app.snapshot');
  void wrong;
};
