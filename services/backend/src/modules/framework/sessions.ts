import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { RpcContract } from '@contracts/rpc-types';
import { RpcError } from '@backend/shared/errors';
import type { FrameworkPort } from '@backend/infrastructure/native/framework-worker';

export type FrameworkView = {
  path: string;
  generation: string;
  sourcePaths: string[];
  ocrAvailable: boolean;
  templates: Record<string, string>;
};
type SessionResult = RpcContract['results']['control.session.start'];
type Entry = {
  sessionId: string;
  token: string;
  state: 'switching' | 'maafw';
  abort: AbortController;
  worker?: FrameworkPort;
  view?: FrameworkView;
  starting?: Promise<SessionResult>;
  ending?: Promise<{ ended: true }>;
};
interface Owner {
  assertStart(id: string, requestId: string, internal: boolean): void;
  worker(id: string): FrameworkPort | undefined;
  prepare(id: string, signal: AbortSignal): Promise<FrameworkView>;
  invalidate(id: string): void;
  changed(id: string): void;
}
const equal = (left: string, right?: string) => {
  if (!right) return false;
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Host capabilities persist for an entire workflow, including idle intervals. */
export class ControlSessions {
  private entries = new Map<string, Entry>();
  private requests = new Map<string, { signature: string; promise: Promise<any> }>();
  private closed = false;
  constructor(private owner: Owner) {}
  get busy() {
    return this.entries.size > 0;
  }
  owns(id: string) {
    return this.entries.has(id);
  }
  worker(id: string) {
    return this.entries.get(id)?.worker;
  }
  view(id: string) {
    return this.entries.get(id)?.view;
  }
  authorize(id: string, token?: string) {
    const session = this.entries.get(id);
    return session
      ? session.state === 'maafw' && !session.ending && equal(session.token, token)
      : !token;
  }
  get(id: string): RpcContract['results']['control.session.get'] {
    const session = this.entries.get(id),
      worker = this.owner.worker(id);
    return {
      deviceId: id,
      owner: session?.state ?? 'none',
      busy: session ? true : !!worker && !worker.safeIdle,
      ...(session ? { sessionId: session.sessionId } : {}),
      ...(session?.view ? { resourceGeneration: session.view.generation } : {}),
    };
  }
  private once<T>(requestId: string, signature: string, operation: () => Promise<T>): Promise<T> {
    const prior = this.requests.get(requestId);
    if (prior) {
      if (prior.signature !== signature) throw new RpcError(-32011, '会话请求标识已用于其他操作');
      return prior.promise;
    }
    // Keep capabilities until shutdown: an old start request must not resurrect a session.
    if (this.requests.size >= 2048) throw new RpcError(-32011, '控制会话请求已达到本次运行上限');
    const promise = operation();
    this.requests.set(requestId, { signature, promise });
    return promise;
  }
  start(
    params: RpcContract['params']['control.session.start'],
    internal = false,
  ): Promise<SessionResult> {
    return this.once(params.requestId, JSON.stringify(['start', params.deviceId]), async () => {
      const id = params.deviceId;
      if (this.closed) throw new RpcError(-32011, '控制会话管理器已关闭');
      this.owner.assertStart(id, params.requestId, internal);
      if (this.entries.has(id)) throw new RpcError(-32011, '该设备已有控制会话');
      const entry: Entry = {
        sessionId: randomUUID(),
        token: randomUUID(),
        state: 'switching',
        abort: new AbortController(),
      };
      this.entries.set(id, entry);
      this.owner.invalidate(id);
      const starting = (async () => {
        try {
          entry.view = await this.owner.prepare(id, entry.abort.signal);
          entry.abort.signal.throwIfAborted();
          // 已连接 worker 保持不变；仅签发当前排他会话的授权，不重建 Controller。
          entry.worker = this.owner.worker(id);
          if (!entry.worker?.connected || !entry.worker.safeIdle)
            throw new Error('设备尚未连接或原生操作未结束');
          entry.abort.signal.throwIfAborted();
          entry.state = 'maafw';
          this.owner.changed(id);
          return {
            deviceId: id,
            sessionId: entry.sessionId,
            controlToken: entry.token,
            engine: 'maafw' as const,
            resourceGeneration: entry.view.generation,
            capabilities: {
              ocr: entry.view.ocrAvailable,
              template: Object.keys(entry.view.templates).length > 0,
              click: true,
              swipe: true,
              keys: true,
            },
          };
        } catch (error) {
          if (this.entries.get(id) === entry) this.entries.delete(id);
          this.owner.invalidate(id);
          this.owner.changed(id);
          throw new RpcError(
            -32040,
            'MaaFramework 控制权交接失败；不会自动重试或重连：' + String(error),
          );
        }
      })();
      entry.starting = starting;
      return starting;
    });
  }
  end(params: RpcContract['params']['control.session.end']): Promise<{ ended: true }> {
    if (this.requests.size >= 2048 && !this.requests.has(params.requestId)) {
      const entry = this.entries.get(params.deviceId);
      if (!entry || !equal(entry.token, params.controlToken))
        throw new RpcError(-32011, '控制会话令牌无效或会话已结束');
      return this.release(params.deviceId, entry);
    }
    return this.once(
      params.requestId,
      JSON.stringify(['end', params.deviceId, params.controlToken]),
      async () => {
        const entry = this.entries.get(params.deviceId);
        if (!entry || !equal(entry.token, params.controlToken))
          throw new RpcError(-32011, '控制会话令牌无效或会话已结束');
        return this.release(params.deviceId, entry);
      },
    );
  }
  private release(id: string, entry: Entry): Promise<{ ended: true }> {
    if (entry.ending) return entry.ending;
    entry.state = 'switching';
    entry.abort.abort();
    this.owner.invalidate(id);
    const ending = (async () => {
      await entry.starting?.catch(() => {});
      // 取消先收敛当前 Tasker，保留空闲连接与 OS 设备租约供下一会话复用。
      if (entry.worker && !entry.worker.safeIdle) {
        try {
          await entry.worker.request('stop');
        } catch {
          await entry.worker.close();
        }
      }
      if (this.entries.get(id) === entry) {
        this.entries.delete(id);
        this.owner.changed(id);
      }
      return { ended: true as const };
    })();
    entry.ending = ending;
    void ending.catch(() => {
      if (entry.ending === ending) entry.ending = undefined;
    });
    return ending;
  }
  async withSession<T>(
    deviceId: string,
    workflow: (session: SessionResult) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted();
    const previous = this.entries.get(deviceId);
    const pending = this.start({ deviceId, requestId: randomUUID() });
    const entry = this.entries.get(deviceId),
      owned = entry !== previous ? entry : undefined;
    const abort = () => {
      if (owned) void this.release(deviceId, owned).catch(() => {});
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const session = await pending;
      signal?.throwIfAborted();
      return await workflow(session);
    } finally {
      signal?.removeEventListener('abort', abort);
      if (owned) await this.release(deviceId, owned);
    }
  }
  protectedPaths() {
    return [...this.entries.values()].flatMap((entry) =>
      entry.view ? [entry.view.path, ...entry.view.sourcePaths] : [],
    );
  }
  async close() {
    this.closed = true;
    await Promise.all([...this.entries].map(([id, entry]) => this.release(id, entry)));
  }
}
