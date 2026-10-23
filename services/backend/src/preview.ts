import { randomUUID } from 'node:crypto';
import type { RpcContract, ScreenFrame } from '../../../packages/contracts/src/rpc-types';
import { validateDeviceClickParams, validateDeviceFrameParams, validateWorkerFrame } from '../../../packages/contracts/src/validators.js';
import { RpcError } from './errors';

type ClickParams = RpcContract['params']['device.click'];
type Accepted = { accepted: true };
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
}
type FrameRecord = { deviceId: string; issuedAt: number; width: number; height: number; worker?: PreviewWorker; canControl: boolean };
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
  const bytes = data.length / 4 * 3 - padding;
  if (bytes < 24 || bytes > 3 * 1024 * 1024 - 8192) return false;
  if (padding && (base64Alphabet.indexOf(data[data.length - padding - 1]!) & (padding === 2 ? 15 : 3))) return false;
  // The first 24 bytes contain the signature, IHDR type and both dimensions.
  // Frame pixels remain encoded until their consumer decodes or saves them.
  const header = Buffer.from(data.slice(0, 32), 'base64');
  return header.subarray(0, 8).equals(pngSignature) && header.readUInt32BE(8) === 13 &&
    header.toString('ascii', 12, 16) === 'IHDR' && header.readUInt32BE(16) === width && header.readUInt32BE(20) === height;
}

/** Images and short-lived control tokens stay in memory, outside business data. */
export class Preview {
  private frames = new Map<string, FrameRecord>();
  private reading = new Map<string, Promise<ScreenFrame>>();
  private clicking = new Set<string>();
  private clicks = new Map<string, { signature: string; started: number; promise: Promise<Accepted> }>();
  constructor(private owner: Owner) {}
  get busy() { return this.clicking.size > 0; }
  isClicking(deviceId: string) { return this.clicking.has(deviceId); }
  invalidate(deviceId?: string) {
    for (const [id, frame] of this.frames) if (!deviceId || frame.deviceId === deviceId) this.frames.delete(id);
  }
  private device(deviceId: string) {
    if (!this.owner.available()) throw new RpcError(-32011, '正在退出或切换核心，请稍后重试');
    const device = this.owner.device(deviceId);
    if (!device) throw new RpcError(-32004, '设备不存在');
    const worker = this.owner.worker(deviceId);
    if (device.state === 'offline' || !worker?.connected) throw new RpcError(-32040, '设备尚未连接，请先连接设备');
    return { device, worker };
  }
  frame(params: unknown): Promise<ScreenFrame> {
    if (!validateDeviceFrameParams(params)) throw new RpcError(-32602, '画面请求参数无效');
    const { deviceId } = params;
    this.device(deviceId);
    if (this.clicking.has(deviceId)) throw new RpcError(-32011, '正在发送点击，请稍后刷新画面');
    const previous = this.reading.get(deviceId);
    if (previous) return previous;
    const promise = this.read(deviceId).finally(() => { if (this.reading.get(deviceId) === promise) this.reading.delete(deviceId); });
    this.reading.set(deviceId, promise);
    return promise;
  }
  private async read(deviceId: string): Promise<ScreenFrame> {
    const { worker } = this.device(deviceId), started = Date.now();
    if (!worker?.frame) throw new RpcError(-32040, '当前核心不支持画面预览');
    let image: unknown;
    try { image = await worker.frame(); }
    catch (error) { throw new RpcError(-32040, '获取画面失败：' + (error instanceof Error ? error.message : String(error))); }
    if (!validateWorkerFrame(image) || image.width * image.height > 16_777_216) throw new RpcError(-32040, '核心返回了无效的画面');
    if (!validPngHeader(image.data, image.width, image.height)) {
      throw new RpcError(-32040, '核心返回了无效的 PNG 画面');
    }
    const current = this.device(deviceId);
    if (current.worker !== worker) throw new RpcError(-32040, '设备连接已更换，请刷新画面');
    const canControl = image.canControl && current.device.state === 'idle' && !this.owner.hasRun(deviceId) &&
      !this.clicking.has(deviceId) && worker.safeIdle;
    for (const [id, frame] of this.frames) if (Date.now() - frame.issuedAt > 2000) this.frames.delete(id);
    // Keep several recent frames: rendering can legitimately lag the newest RPC.
    const recent = [...this.frames.entries()].filter(([, frame]) => frame.deviceId === deviceId);
    for (const [id] of recent.slice(0, Math.max(0, recent.length - 31))) this.frames.delete(id);
    const frameId = randomUUID();
    this.frames.set(frameId, { deviceId, issuedAt: started, width: image.width, height: image.height, worker, canControl });
    return { ...image, deviceId, frameId, capturedAt: new Date(started).toISOString(), canControl, latencyMs: Date.now() - started };
  }
  click(params: unknown): Promise<Accepted> {
    if (!validateDeviceClickParams(params)) throw new RpcError(-32602, '点击参数无效');
    const signature = JSON.stringify([params.deviceId, params.frameId, params.x, params.y]);
    const existing = this.clicks.get(params.requestId);
    if (existing) {
      if (existing.signature !== signature) throw new RpcError(-32011, '同一点击标识不能用于不同操作');
      return existing.promise;
    }
    for (const [id, value] of this.clicks) if (Date.now() - value.started > 300_000) this.clicks.delete(id);
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
      // Let the single in-flight read finish; no additional frames queue behind it.
      await this.reading.get(deviceId);
      const { device, worker } = this.device(deviceId), frame = this.frames.get(frameId);
      if (!frame || frame.deviceId !== deviceId || frame.worker !== worker || Date.now() - frame.issuedAt > 2000 || !frame.canControl) {
        throw new RpcError(-32011, '画面已失效，请刷新后再点击');
      }
      if (x >= frame.width || y >= frame.height) throw new RpcError(-32602, '点击位置超出画面范围');
      if (device.state !== 'idle' || this.owner.hasRun(deviceId) || !worker?.safeIdle) {
        throw new RpcError(-32011, '设备正在执行任务，暂不能手动点击');
      }
      if (!worker.click) throw new RpcError(-32040, '当前核心不支持画面点击');
      let result: unknown;
      try { result = await worker.click(x, y); }
      catch (error) { throw new RpcError(-32040, '点击未获确认，结果可能未知，请查看画面后再操作：' + (error instanceof Error ? error.message : String(error))); }
      if (!result || typeof result !== 'object' || !('accepted' in result) || result.accepted !== true) throw new RpcError(-32040, '核心未确认点击，结果未知，请查看画面');
      if (this.owner.available()) this.owner.clicked(params);
      return { accepted: true };
    } finally { this.invalidate(deviceId); this.clicking.delete(deviceId); }
  }
}
