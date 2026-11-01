import { spawn } from 'node:child_process';
import path from 'node:path';
import { nativeEnvironment } from '@backend/infrastructure/config';
import { nativeWorkerPath } from './native-path';
import { CoreWorker } from './worker';

export type FrameworkConfiguration = {
  framework: string;
  resource: string;
  userDir: string;
  mode: 'control' | 'recognition';
  adb?: string;
  address?: string;
  lockPath?: string;
  avd?: boolean;
};
export type FrameworkAction = { accepted: true; nativeSuccess: true };
export interface FrameworkPort {
  readonly connected: boolean;
  readonly safeIdle: boolean;
  connect(): Promise<unknown>;
  frame(): Promise<unknown>;
  click(x: number, y: number): Promise<unknown>;
  request(operation: string, params?: Record<string, unknown>): Promise<any>;
  close(): Promise<void>;
}

/** One engine per process. Its library search path only points at the FW SDK. */
export class FrameworkWorker implements FrameworkPort {
  private pending = 0;
  private ready = false;
  get connected() {
    return this.ready && this.worker.alive;
  }
  private constructor(private worker: CoreWorker) {}
  get safeIdle() {
    return this.pending === 0 && this.worker.safeIdle;
  }
  static async start(config: FrameworkConfiguration, signal?: AbortSignal) {
    const worker = await CoreWorker.start(config, {
      command: [nativeWorkerPath(), '--framework-worker'],
      nativeDirectory: path.join(config.framework, 'bin'),
      signal,
    });
    return new FrameworkWorker(worker);
  }
  async request(operation: string, params: Record<string, unknown> = {}) {
    this.pending++;
    try {
      return await this.worker.request(operation, params);
    } catch (error) {
      // A lost native acknowledgement cannot leave an apparently idle controller.
      this.ready = false;
      await this.worker.close();
      throw error;
    } finally {
      this.pending--;
    }
  }
  async connect() {
    const result = await this.request('connect');
    if (result?.accepted !== true || result?.nativeSuccess !== true)
      throw new Error('MaaFramework 未确认设备连接');
    this.ready = true;
    return result;
  }
  frame() {
    return this.request('frame');
  }
  click(x: number, y: number) {
    return this.request('click', { x, y });
  }
  async close() {
    this.ready = false;
    await this.worker.close();
  }
}

/** Offline, controller-free initialization probe; never contacts ADB. */
export function validateFrameworkResources(
  config: FrameworkConfiguration,
  signal?: AbortSignal,
): Promise<{
  ocrAvailable: boolean;
  diagnostic?: string;
}> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn(nativeWorkerPath(), ['--framework-validate'], {
      env: nativeEnvironment(path.join(config.framework, 'bin'), process.platform, true),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '',
      diagnostic = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 45_000);
    const abort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.on('data', (bytes) => {
      output += bytes.toString('utf8');
      if (output.length > 64 * 1024) child.kill('SIGKILL');
    });
    child.stderr.on('data', (bytes) => {
      diagnostic = (diagnostic + bytes.toString('utf8')).slice(-8192);
    });
    child.once('error', reject);
    child.stdin.on('error', () => {});
    child.once('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      try {
        signal?.throwIfAborted();
        if (code !== 0) throw new Error('MaaFramework 离线探针失败：' + diagnostic);
        const result = JSON.parse(output.trim());
        if (
          result.protocolVersion !== 1 ||
          result.engine !== 'maafw' ||
          result.version !== 'v5.14.3' ||
          result.resourceLoaded !== true ||
          typeof result.ocrAvailable !== 'boolean'
        )
          throw new Error('MaaFramework 离线探针协议无效');
        resolve({
          ocrAvailable: result.ocrAvailable,
          ...(typeof result.diagnostic === 'string' ? { diagnostic: result.diagnostic } : {}),
        });
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify({ ...config, mode: 'recognition', protocolVersion: 1 }) + '\n');
  });
}
