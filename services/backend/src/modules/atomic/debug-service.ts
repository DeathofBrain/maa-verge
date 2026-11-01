import { randomUUID } from 'node:crypto';
import type { RpcContract, PrimitiveDescriptor, ScreenFrame } from '@contracts/rpc-types';
import { RpcError } from '@backend/shared/errors';
import type { AtomicExecutionContext } from './types';

type Params = RpcContract['params'];
type Result = RpcContract['results']['debug.primitive.invoke'];
type Control = RpcContract['results']['control.session.start'];
export interface DebugRegistry {
  list(): PrimitiveDescriptor[];
  execute(
    id: string,
    input: Record<string, unknown>,
    context: AtomicExecutionContext,
  ): Promise<unknown>;
}
interface Owner {
  catalog(deviceId?: string): Promise<PrimitiveDescriptor[]>;
  start(deviceId: string, requestId: string): Promise<Control>;
  end(control: Control): Promise<unknown>;
  registry(control: Control, signal: AbortSignal): Promise<DebugRegistry>;
}
type Session = {
  id: string;
  control: Control;
  abort: AbortController;
  registry: DebugRegistry;
  active?: Promise<Result>;
  ending?: Promise<{ ended: true }>;
};

/** Debug owns only its own opaque sessions. Native control capabilities never cross this API. */
export class DebugService {
  private sessions = new Map<string, Session>();
  private requests = new Map<string, { signature: string; promise: Promise<any> }>();
  private starting = new Set<Promise<unknown>>();
  private closed = false;
  constructor(private owner: Owner) {}
  catalog(deviceId?: string) {
    return this.owner.catalog(deviceId).then((items) => ({ items }));
  }
  private once<T>(id: string, identity: unknown, operation: () => Promise<T>): Promise<T> {
    const signature = JSON.stringify(identity);
    const old = this.requests.get(id);
    if (old) {
      if (old.signature !== signature) throw new RpcError(-32011, '调试请求标识已用于其他操作');
      return old.promise;
    }
    // Do not evict: a delayed retry must never recreate a released session or replay a gesture.
    if (this.requests.size >= 4096) throw new RpcError(-32011, '本次运行的调试请求已达上限');
    const promise = operation();
    this.requests.set(id, { signature, promise });
    return promise;
  }
  start(
    params: Params['debug.session.start'],
  ): Promise<RpcContract['results']['debug.session.start']> {
    const operation = this.once(params.requestId, ['start', params.deviceId], async () => {
      if (this.closed) throw new RpcError(-32011, '调试服务已关闭');
      const control = await this.owner.start(params.deviceId, randomUUID());
      const abort = new AbortController();
      try {
        const registry = await this.owner.registry(control, abort.signal);
        if (this.closed) throw new RpcError(-32011, '调试服务已关闭');
        const id = randomUUID();
        this.sessions.set(id, { id, control, abort, registry });
        return { debugSessionId: id, deviceId: control.deviceId };
      } catch (error) {
        abort.abort();
        await this.owner.end(control);
        throw error;
      }
    });
    this.starting.add(operation);
    void operation.finally(() => this.starting.delete(operation)).catch(() => {});
    return operation;
  }
  invoke(params: Params['debug.primitive.invoke']): Promise<Result> {
    return this.once(
      params.requestId,
      ['invoke', params.debugSessionId, params.primitiveId, params.input],
      async () => {
        const session = this.sessions.get(params.debugSessionId);
        if (!session || session.ending || session.abort.signal.aborted)
          throw new RpcError(-32011, '调试会话已结束，请主动重新建立');
        if (session.active) throw new RpcError(-32011, '上一项调试尚未结束');
        const descriptor = session.registry.list().find((item) => item.id === params.primitiveId);
        if (!descriptor) throw new RpcError(-32602, '原语未注册');
        if (!descriptor.available)
          throw new RpcError(-32040, descriptor.unavailableReason ?? '原语当前不可用');
        const steps: Record<string, unknown>[] = [];
        const operation = (async (): Promise<Result> => {
          try {
            const output = await session.registry.execute(params.primitiveId, params.input, {
              signal: session.abort.signal,
              onProgress: (event) => {
                if (steps.length < 2000) steps.push({ ...event, at: new Date().toISOString() });
              },
            });
            const envelope =
              output && typeof output === 'object' && !Array.isArray(output)
                ? (output as Record<string, unknown>)
                : { value: output ?? null };
            const payload = 'status' in envelope && 'data' in envelope ? envelope.data : envelope;
            const data =
              payload && typeof payload === 'object' && !Array.isArray(payload)
                ? (payload as Record<string, unknown>)
                : { value: payload ?? null };
            const statuses: Record<string, Result['status']> = {
              completed: 'succeeded',
              succeeded: 'succeeded',
              partial: 'failed',
              unavailable: 'failed',
              failed: 'failed',
              unknown: 'unknown',
              cancelled: 'cancelled',
            };
            const status = statuses[String(envelope.status)] ?? 'succeeded';
            const frame =
              typeof data.frameId === 'string' && typeof data.data === 'string'
                ? (payload as ScreenFrame)
                : undefined;
            return {
              primitiveId: params.primitiveId,
              status: session.abort.signal.aborted ? 'cancelled' : status,
              data: frame
                ? { frameId: frame.frameId, width: frame.width, height: frame.height }
                : {
                    ...data,
                    ...(typeof envelope.message === 'string' ? { message: envelope.message } : {}),
                  },
              steps,
              ...(frame ? { frame } : {}),
              ...(typeof envelope.nativeSuccess === 'boolean'
                ? { nativeSuccess: envelope.nativeSuccess }
                : {}),
              ...(typeof envelope.verified === 'boolean' ? { verified: envelope.verified } : {}),
            };
          } catch (error) {
            return {
              primitiveId: params.primitiveId,
              status: session.abort.signal.aborted
                ? 'cancelled'
                : error instanceof RpcError && error.code === -32602
                  ? 'failed'
                  : 'unknown',
              data: { message: error instanceof Error ? error.message : String(error) },
              steps,
            };
          }
        })();
        session.active = operation;
        try {
          return await operation;
        } finally {
          if (session.active === operation) session.active = undefined;
        }
      },
    );
  }
  end(params: Params['debug.session.end']): Promise<{ ended: true }> {
    // Exhausting the command ledger may block new work, but must never block stop.
    if (this.requests.size >= 4096 && !this.requests.has(params.requestId)) {
      const session = this.sessions.get(params.debugSessionId);
      return session ? this.release(session) : Promise.resolve({ ended: true });
    }
    return this.once(params.requestId, ['end', params.debugSessionId], async () => {
      const session = this.sessions.get(params.debugSessionId);
      // A release acknowledgement can be lost after the controller was closed.
      // Retrying only this opaque owner must also succeed without touching another session.
      if (!session) return { ended: true };
      return this.release(session);
    });
  }
  private release(session: Session): Promise<{ ended: true }> {
    if (session.ending) return session.ending;
    session.abort.abort();
    const ending = (async () => {
      // Closing the owned native controller interrupts its current action and releases contacts.
      await this.owner.end(session.control);
      await session.active;
      this.sessions.delete(session.id);
      return { ended: true as const };
    })();
    session.ending = ending;
    void ending.catch(() => {
      if (session.ending === ending) session.ending = undefined;
    });
    return ending;
  }
  async close() {
    this.closed = true;
    await Promise.allSettled([...this.starting]);
    await Promise.all([...this.sessions.values()].map((session) => this.release(session)));
  }
}
