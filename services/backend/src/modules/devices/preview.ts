import { randomUUID } from 'node:crypto';
import type { RpcContract, ScreenFrame } from '@contracts/rpc-types';
import {
  validateDeviceClickParams,
  validateDeviceFrameParams,
  validateWorkerFrame,
} from '@contracts/validators.js';
import { RpcError } from '@backend/shared/errors';

type ClickParams = RpcContract['params']['device.click'];
type Accepted = { accepted: true; nativeSuccess?: true };
export interface PreviewWorker {
  connected: boolean;
  safeIdle: boolean;
  frame?: () => Promise<unknown>;
  click?: (x: number, y: number) => Promise<unknown>;
}
interface Owner {
  available: () => boolean;
  device: (id: string) => { state: string } | undefined;
  worker: (id: string) => PreviewWorker | undefined;
  hasRun: (id: string) => boolean;
  clicked: (data: ClickParams) => void;
  context?: (id: string) => {
    engine: 'maafw';
    sessionId?: string;
    resourceGeneration?: string;
  };
  canOperate?: (id: string) => boolean;
  authorize?: (id: string, controlToken?: string) => boolean;
}
type FrameRecord = {
  deviceId: string;
  issuedAt: number;
  width: number;
  height: number;
  worker?: PreviewWorker;
  canControl: boolean;
  image: ScreenFrame;
};
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function validPngHeader(data: string, width: number, height: number): boolean {
  // Buffer's base64 decoder accepts whitespace, URL-safe characters and nonzero
  // padding bits. Check canonical encoding directly rather than allocating and
  // re-encoding a complete PNG for every preview frame.
  if (data.length % 4 || /[^A-Za-z0-9+/=]/.test(data)) return false;
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const firstPadding = data.indexOf('=');
  if (firstPadding !== -1 && firstPadding !== data.length - padding) return false;
  const bytes = (data.length / 4) * 3 - padding;
  if (bytes < 24 || bytes > 3 * 1024 * 1024 - 8192) return false;
  if (
    padding &&
    base64Alphabet.indexOf(data[data.length - padding - 1]!) & (padding === 2 ? 15 : 3)
  )
    return false;
  // The first 24 bytes contain the signature, IHDR type and both dimensions.
  // Frame pixels remain encoded until their consumer decodes or saves them.
  const header = Buffer.from(data.slice(0, 32), 'base64');
  return (
    header.subarray(0, 8).equals(pngSignature) &&
    header.readUInt32BE(8) === 13 &&
    header.toString('ascii', 12, 16) === 'IHDR' &&
    header.readUInt32BE(16) === width &&
    header.readUInt32BE(20) === height
  );
}

/** Images and short-lived control tokens stay in memory, outside business data. */
export class Preview {
  private frames = new Map<string, FrameRecord>();
  private reading = new Map<string, Promise<ScreenFrame>>();
  private clicking = new Set<string>();
  private clicks = new Map<
    string,
    { signature: string; started: number; promise: Promise<Accepted> }
  >();
  constructor(private owner: Owner) {}
  get busy() {
    return this.clicking.size > 0;
  }
  isClicking(deviceId: string) {
    return this.clicking.has(deviceId);
  }
  isReading(deviceId: string) {
    return this.reading.has(deviceId);
  }
  invalidate(deviceId?: string) {
    for (const [id, frame] of this.frames)
      if (!deviceId || frame.deviceId === deviceId) this.frames.delete(id);
  }
  private device(deviceId: string) {
    if (!this.owner.available()) throw new RpcError(-32011, '正在退出或切换运行组件，请稍后重试');
    const device = this.owner.device(deviceId);
    if (!device) throw new RpcError(-32004, '设备不存在');
    const worker = this.owner.worker(deviceId);
    if (device.state === 'offline' || !worker?.connected)
      throw new RpcError(-32040, '设备尚未连接，请先连接设备');
    return { device, worker };
  }
  frame(params: unknown): Promise<ScreenFrame> {
    if (!validateDeviceFrameParams(params)) throw new RpcError(-32602, '画面请求参数无效');
    const { deviceId } = params;
    if (params.controlToken && !this.authorized(deviceId, params.controlToken))
      throw new RpcError(-32011, '控制会话令牌无效');
    this.device(deviceId);
    if (this.clicking.has(deviceId)) throw new RpcError(-32011, '正在发送点击，请稍后刷新画面');
    const previous = this.reading.get(deviceId);
    if (previous)
      return previous.then((frame) => ({
        ...frame,
        canControl: frame.canControl && this.authorized(deviceId, params.controlToken),
      }));
    const promise = this.read(deviceId).finally(() => {
      if (this.reading.get(deviceId) === promise) this.reading.delete(deviceId);
    });
    this.reading.set(deviceId, promise);
    return promise.then((frame) => ({
      ...frame,
      canControl: frame.canControl && this.authorized(deviceId, params.controlToken),
    }));
  }
  private authorized(deviceId: string, token?: string) {
    return this.owner.authorize?.(deviceId, token) ?? true;
  }
  isCurrent(image: ScreenFrame) {
    return (
      this.frames.get(image.frameId)?.image === image &&
      this.owner.worker(image.deviceId) === this.frames.get(image.frameId)?.worker
    );
  }
  reference(deviceId: string, frameId: string, maxAgeMs = 2000): ScreenFrame {
    const { worker } = this.device(deviceId),
      record = this.frames.get(frameId);
    if (
      !record ||
      record.deviceId !== deviceId ||
      record.worker !== worker ||
      Date.now() - record.issuedAt > maxAgeMs
    )
      throw new RpcError(-32011, '画面已失效，请重新截图');
    return record.image;
  }
  private async read(deviceId: string): Promise<ScreenFrame> {
    const { worker } = this.device(deviceId),
      started = Date.now();
    if (!worker?.frame) throw new RpcError(-32040, '当前 MaaFramework 不支持画面预览');
    let image: unknown;
    try {
      image = await worker.frame();
    } catch (error) {
      throw new RpcError(
        -32040,
        '获取画面失败：' + (error instanceof Error ? error.message : String(error)),
      );
    }
    if (!validateWorkerFrame(image) || image.width * image.height > 16_777_216)
      throw new RpcError(-32040, 'MaaFramework 返回了无效的画面');
    if (!validPngHeader(image.data, image.width, image.height)) {
      throw new RpcError(-32040, 'MaaFramework 返回了无效的 PNG 画面');
    }
    const current = this.device(deviceId);
    if (current.worker !== worker) throw new RpcError(-32040, '设备连接已更换，请刷新画面');
    const canControl =
      image.canControl &&
      (current.device.state === 'idle' || !!this.owner.canOperate?.(deviceId)) &&
      !this.owner.hasRun(deviceId) &&
      !this.clicking.has(deviceId) &&
      worker.safeIdle;
    for (const [id, frame] of this.frames)
      if (Date.now() - frame.issuedAt > 2000) this.frames.delete(id);
    // Keep several recent frames: rendering can legitimately lag the newest RPC.
    const recent = [...this.frames.entries()].filter(([, frame]) => frame.deviceId === deviceId);
    for (const [id] of recent.slice(0, Math.max(0, recent.length - 31))) this.frames.delete(id);
    const frameId = randomUUID();
    const frame: ScreenFrame = {
      ...image,
      deviceId,
      frameId,
      capturedAt: new Date(started).toISOString(),
      canControl,
      latencyMs: Date.now() - started,
      ...(this.owner.context?.(deviceId) ?? {}),
      coordinateSpace: 'frame',
      fresh: worker.safeIdle && !this.owner.hasRun(deviceId),
    };
    this.frames.set(frameId, {
      deviceId,
      issuedAt: started,
      width: image.width,
      height: image.height,
      worker,
      canControl,
      image: frame,
    });
    return frame;
  }
  click(params: unknown): Promise<Accepted> {
    if (!validateDeviceClickParams(params)) throw new RpcError(-32602, '点击参数无效');
    const signature = JSON.stringify([
      'click',
      params.deviceId,
      params.frameId,
      params.x,
      params.y,
      params.controlToken,
    ]);
    const existing = this.clicks.get(params.requestId);
    if (existing) {
      if (existing.signature !== signature)
        throw new RpcError(-32011, '同一点击标识不能用于不同操作');
      return existing.promise;
    }
    for (const [id, value] of this.clicks)
      if (Date.now() - value.started > 300_000) this.clicks.delete(id);
    if (this.clicks.size >= 2048) throw new RpcError(-32011, '点击请求过于频繁，请稍后重试');
    const promise = this.sendClick(params);
    // Remember successes and failures. A lost acknowledgement must never replay a tap.
    this.clicks.set(params.requestId, { signature, started: Date.now(), promise });
    return promise;
  }
  private async sendClick(params: ClickParams): Promise<Accepted> {
    const { deviceId, frameId, x, y } = params;
    if (this.clicking.has(deviceId)) throw new RpcError(-32011, '上一条点击尚未完成');
    this.clicking.add(deviceId);
    try {
      if (!this.authorized(deviceId, params.controlToken))
        throw new RpcError(-32011, '该设备由 MaaFramework 工作流占用，需要宿主控制令牌');
      // Let the single in-flight read finish; no additional frames queue behind it.
      await this.reading.get(deviceId);
      const { device, worker } = this.device(deviceId),
        frame = this.frames.get(frameId);
      if (
        !frame ||
        frame.deviceId !== deviceId ||
        frame.worker !== worker ||
        Date.now() - frame.issuedAt > 2000 ||
        !frame.canControl
      ) {
        throw new RpcError(-32011, '画面已失效，请刷新后再点击');
      }
      if (x >= frame.width || y >= frame.height) throw new RpcError(-32602, '点击位置超出画面范围');
      if (
        (device.state !== 'idle' && !this.owner.canOperate?.(deviceId)) ||
        this.owner.hasRun(deviceId) ||
        !worker?.safeIdle
      ) {
        throw new RpcError(-32011, '设备正在执行任务，暂不能手动点击');
      }
      if (!worker.click) throw new RpcError(-32040, '当前 MaaFramework 不支持画面点击');
      let result: unknown;
      try {
        result = await worker.click(x, y);
      } catch (error) {
        throw new RpcError(
          -32040,
          '点击未获确认，结果可能未知，请查看画面后再操作：' +
            (error instanceof Error ? error.message : String(error)),
        );
      }
      if (
        !result ||
        typeof result !== 'object' ||
        !('accepted' in result) ||
        result.accepted !== true
      )
        throw new RpcError(-32040, 'MaaFramework 未确认点击，结果未知，请查看画面');
      if (
        this.owner.context?.(deviceId).engine === 'maafw' &&
        (!('nativeSuccess' in result) || result.nativeSuccess !== true)
      )
        throw new RpcError(-32040, 'MaaFramework 未确认点击执行结果，请重新截图核对');
      if (this.owner.available()) this.owner.clicked(params);
      return {
        accepted: true,
        ...('nativeSuccess' in result && result.nativeSuccess === true
          ? { nativeSuccess: true as const }
          : {}),
      };
    } finally {
      this.invalidate(deviceId);
      this.clicking.delete(deviceId);
    }
  }
  /** All atomic writes share the frame gate and at-most-once acknowledgement cache. */
  action(
    params: { deviceId: string; frameId: string; requestId: string; controlToken: string },
    signature: unknown,
    points: number[][],
    send: () => Promise<unknown>,
  ): Promise<{ accepted: true; nativeSuccess: true }> {
    const identity = JSON.stringify(['action', params, signature]);
    const existing = this.clicks.get(params.requestId);
    if (existing) {
      if (existing.signature !== identity)
        throw new RpcError(-32011, '同一操作标识不能用于不同操作');
      return existing.promise as Promise<{ accepted: true; nativeSuccess: true }>;
    }
    for (const [id, value] of this.clicks)
      if (Date.now() - value.started > 300_000) this.clicks.delete(id);
    if (this.clicks.size >= 2048) throw new RpcError(-32011, '操作请求过于频繁');
    const promise = (async () => {
      const id = params.deviceId;
      if (this.clicking.has(id)) throw new RpcError(-32011, '上一条控制操作尚未完成');
      this.clicking.add(id);
      try {
        await this.reading.get(id);
        if (!this.authorized(id, params.controlToken))
          throw new RpcError(-32011, '控制会话令牌无效');
        const image = this.reference(id, params.frameId),
          { worker, device } = this.device(id);
        if (
          !image.canControl ||
          (device.state !== 'idle' && !this.owner.canOperate?.(id)) ||
          this.owner.hasRun(id) ||
          !worker.safeIdle
        )
          throw new RpcError(-32011, '设备或画面当前不可控制');
        for (const [x, y] of points)
          if (x! < 0 || y! < 0 || x! >= image.width || y! >= image.height)
            throw new RpcError(-32602, '操作位置超出画面范围');
        const result = await send();
        if (
          !result ||
          typeof result !== 'object' ||
          !('accepted' in result) ||
          result.accepted !== true ||
          !('nativeSuccess' in result) ||
          result.nativeSuccess !== true
        )
          throw new Error('原生执行未确认');
        return { accepted: true as const, nativeSuccess: true as const };
      } catch (error) {
        if (error instanceof RpcError) throw error;
        throw new RpcError(
          -32040,
          '操作未获确认，结果可能未知，请重新截图核对；不会自动重放：' + String(error),
        );
      } finally {
        this.invalidate(id);
        this.clicking.delete(id);
      }
    })();
    this.clicks.set(params.requestId, { signature: identity, started: Date.now(), promise });
    return promise;
  }
}
