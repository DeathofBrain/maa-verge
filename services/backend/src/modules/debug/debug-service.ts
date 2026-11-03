import { randomUUID } from 'node:crypto';
import type { RpcContract, PrimitiveDescriptor, ScreenFrame } from '@contracts/rpc-types';
import { validateAtomicFrameData, validateScreenFrame } from '@contracts/validators.js';
import { RpcError } from '@backend/shared/errors';
import type { AtomicExecutionContext } from '@maaverge/automation';

type Params = RpcContract['params'];
type Result = RpcContract['results']['debug.primitive.invoke'];
type Control = RpcContract['results']['control.session.start'];
/** 调试宿主只依赖能力目录与执行端口，复用正式自动化实现。 */
export interface DebugRegistry {
  list(): PrimitiveDescriptor[];
  execute(
    id: string,
    input: Record<string, unknown>,
    context: AtomicExecutionContext,
  ): Promise<unknown>;
}
/** 由应用运行时管理控制权和资源，Debug 不直接创建或接管原生 worker。 */
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

/** Debug 只在顶层传一张完整预览；嵌套步骤保留轻量帧引用，避免重复 PNG 撑大 stdio。 */
function debugFrames(value: unknown, collect: (frame: ScreenFrame) => void): unknown {
  if (Boolean(validateAtomicFrameData(value))) {
    const frame = value as Record<string, unknown>;
    if (validateScreenFrame(frame)) collect(frame);
    return Object.fromEntries(Object.entries(frame).filter(([key]) => key !== 'data'));
  }
  if (Array.isArray(value)) return value.map((item) => debugFrames(item, collect));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, debugFrames(item, collect)]),
    );
  return value;
}

/** 正常结果和异常进度共用同一摘要出口，确保部分执行证据也只携带一张预览。 */
function debugEvidence(data: Record<string, unknown>, steps: Record<string, unknown>[]) {
  let frame: ScreenFrame | undefined;
  const collect = (candidate: ScreenFrame) => {
    if (!frame || Date.parse(candidate.capturedAt) >= Date.parse(frame.capturedAt))
      frame = candidate;
  };
  const summary = debugFrames(data, collect) as Record<string, unknown>;
  const summarizedSteps = debugFrames(steps, collect) as Record<string, unknown>[];
  return { data: summary, steps: summarizedSteps, ...(frame ? { frame } : {}) };
}

/** 管理自有调试会话；界面只获得随机调试 ID，原生控制令牌始终保留在宿主。 */
export class DebugService {
  private sessions = new Map<string, Session>();
  private requests = new Map<string, { signature: string; promise: Promise<any> }>();
  private starting = new Set<Promise<unknown>>();
  private closed = false;
  constructor(private owner: Owner) {}
  catalog(deviceId?: string) {
    return this.owner.catalog(deviceId).then((items) => ({ items }));
  }
  /** 同一请求及参数复用原 Promise；标识冲突直接拒绝，避免副作用重放。 */
  private once<T>(id: string, identity: unknown, operation: () => Promise<T>): Promise<T> {
    const signature = JSON.stringify(identity);
    const old = this.requests.get(id);
    if (old) {
      if (old.signature !== signature) throw new RpcError(-32011, '调试请求标识已用于其他操作');
      return old.promise;
    }
    // 账本保留到进程退出，延迟重试不能重建已释放会话或重放手势。
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
      // 先取得自有控制权，再绑定能力目录；目录准备失败时释放刚取得的控制者。
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
    // 关闭服务时等待正在建立的会话收敛，避免遗漏稍后返回的控制者。
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
        // 同一会话串行执行，结束中的会话不能再追加动作。
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
            // 保留能力结果的业务证据，将内部状态适配为 Debug RPC 的固定返回结构。
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
            // 先识别原始业务数据中的完整帧，再追加 envelope 文案，保留严格帧结构供摘要。
            const evidence = debugEvidence(data, steps);
            return {
              primitiveId: params.primitiveId,
              status: session.abort.signal.aborted ? 'cancelled' : status,
              ...evidence,
              data: {
                ...evidence.data,
                ...(typeof envelope.message === 'string' ? { message: envelope.message } : {}),
              },
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
              ...debugEvidence(
                { message: error instanceof Error ? error.message : String(error) },
                steps,
              ),
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
    // 账本达到上限可以阻止新工作，但不能阻止释放已有控制者。
    if (this.requests.size >= 4096 && !this.requests.has(params.requestId)) {
      const session = this.sessions.get(params.debugSessionId);
      return session ? this.release(session) : Promise.resolve({ ended: true });
    }
    return this.once(params.requestId, ['end', params.debugSessionId], async () => {
      const session = this.sessions.get(params.debugSessionId);
      // 释放确认可能丢失；重试已结束的调试 ID 仍成功，也不影响其他所有者的会话。
      if (!session) return { ended: true };
      return this.release(session);
    });
  }
  private release(session: Session): Promise<{ ended: true }> {
    if (session.ending) return session.ending;
    // 先阻止后续步骤，再关闭自有控制者，等待在途调用结束后删除会话。
    session.abort.abort();
    const ending = (async () => {
      // 原生关闭负责中断当前动作和释放触点，失败时保留会话以便显式重试清理。
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
  /** 关闭入口后先等待建立过程，再释放所有已登记会话。 */
  async close() {
    this.closed = true;
    await Promise.allSettled([...this.starting]);
    await Promise.all([...this.sessions.values()].map((session) => this.release(session)));
  }
}
