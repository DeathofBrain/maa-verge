import { errorMessage } from '@maaverge/contracts';
import { debugRpc, type DebugSession } from './debug-api';

type Owner = symbol;
type Ownership = { session: DebugSession; owner?: Owner; releaseRequired: boolean };
type Starting = { owner?: Owner; onCleanupError?: (message: string) => void };
type Snapshot = {
  phase: 'idle' | 'starting' | 'active' | 'releasing' | 'release_failed';
  owner?: Owner;
  session?: DebugSession;
  error: string;
};
let owned: Ownership | undefined;
let starting: Starting | undefined;
let releasing: Promise<boolean> | undefined;
let releaseError = '';
let snapshot: Snapshot = { phase: 'idle', error: '' };
const listeners = new Set<() => void>();
const requestId = () => crypto.randomUUID();

function publish() {
  snapshot = {
    phase: starting
      ? 'starting'
      : releasing
        ? 'releasing'
        : owned
          ? owned.releaseRequired
            ? 'release_failed'
            : 'active'
          : 'idle',
    owner: owned?.owner,
    session: owned?.session,
    error: releaseError,
  };
  listeners.forEach((listener) => listener());
}

export const debugSessionSnapshot = () => snapshot;
export function subscribeDebugSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function activeDebugSession(owner: Owner): DebugSession | undefined {
  return owned?.owner === owner && !owned.releaseRequired ? owned.session : undefined;
}

/** Only one Debug page can hold a session. An abandoned handle remains release-only. */
export async function startDebugSession(owner: Owner, deviceId: string) {
  if (starting || owned || releasing) throw new Error('请先完成上一调试会话的释放');
  const pending: Starting = { owner };
  starting = pending;
  releaseError = '';
  publish();
  try {
    const session = await debugRpc('debug.session.start', { deviceId, requestId: requestId() });
    owned = { session, owner: pending.owner, releaseRequired: !pending.owner };
    starting = undefined;
    publish();
    if (!pending.owner) {
      if (!(await releaseDebugSession())) pending.onCleanupError?.(debugSessionSnapshot().error);
      return undefined;
    }
    return session;
  } finally {
    if (starting === pending) {
      starting = undefined;
      publish();
    }
  }
}

export function releaseDebugSession(owner?: Owner): Promise<boolean> {
  if (releasing) return releasing;
  if (!owned) return Promise.resolve(!starting);
  if (!owned.releaseRequired && owned.owner !== owner)
    return Promise.reject(new Error('不能释放其他页面持有的调试会话'));
  const target = owned;
  target.releaseRequired = true;
  releaseError = '';
  const operation = (async () => {
    try {
      await debugRpc('debug.session.end', {
        debugSessionId: target.session.debugSessionId,
        requestId: requestId(),
      });
      if (owned === target) owned = undefined;
      return true;
    } catch (cause) {
      releaseError = `释放 Debug 会话失败，请重试：${errorMessage(cause)}`;
      return false;
    } finally {
      releasing = undefined;
      publish();
    }
  })();
  releasing = operation;
  publish();
  return operation;
}

export function detachDebugSession(owner: Owner, onError?: (message: string) => void) {
  if (starting?.owner === owner) {
    starting.owner = undefined;
    starting.onCleanupError = onError;
    publish();
  }
  if (owned?.owner === owner) {
    const needsInitialRelease = !owned.releaseRequired;
    owned.owner = undefined;
    owned.releaseRequired = true;
    publish();
    if (needsInitialRelease || releasing)
      void releaseDebugSession().then((released) => {
        if (!released) onError?.(debugSessionSnapshot().error);
      });
  }
}
