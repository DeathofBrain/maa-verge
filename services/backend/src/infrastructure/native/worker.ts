import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { StringDecoder } from 'node:string_decoder';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { childEnvironment, nativeEnvironment } from '@backend/infrastructure/config';
import { stringifyWireJson } from '@backend/shared/wire-json';
import { nativeStartupError } from './connection-errors';

/** 原生已明确回执的失败；与超时或进程退出导致的未知结果区分。 */
export class NativeResponseError extends Error {}
/** 只负责隔离原生进程、NDJSON 回执和关闭收敛，不解释任何自动化引擎事件。 */
export class NativeWorkerTransport {
  readonly events: any[] = [];
  closed = false;
  private exited = false;
  private requests = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private child!: ChildProcessWithoutNullStreams;
  private finished!: Promise<void>;
  private log?: number;
  private stderrTail = '';
  private stderrDecoder = new StringDecoder('utf8');
  private eventListeners = new Set<(event: unknown) => boolean>();
  /** 内部扩展协议由专用适配器消费，不进入业务事件队列。 */
  onEvent(listener: (event: unknown) => boolean) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
  get alive() {
    return !this.exited && !this.closed;
  }
  static async start(
    config: any,
    options: {
      command: string[];
      signal?: AbortSignal;
      nativeDirectory?: string;
    },
  ): Promise<NativeWorkerTransport> {
    const worker = new NativeWorkerTransport();
    await worker.launch(config, options);
    return worker;
  }
  private async launch(
    config: any,
    options: {
      command: string[];
      signal?: AbortSignal;
      nativeDirectory?: string;
    },
  ) {
    options.signal?.throwIfAborted();
    const directory = config.userDir || path.dirname(config.lockPath);
    mkdirSync(directory, { recursive: true });
    this.log = openSync(path.join(directory, 'worker.stderr.log'), 'a');
    const command = options.command;
    if (!command.length) throw new Error('原生工作进程命令不能为空');
    const directoryForLibraries = options.nativeDirectory;
    const env = directoryForLibraries
      ? nativeEnvironment(directoryForLibraries, process.platform, !!options.nativeDirectory)
      : childEnvironment();
    this.child = spawn(command[0]!, command.slice(1), {
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stderr.on('data', (bytes) => {
      this.stderrTail = (this.stderrTail + this.stderrDecoder.write(bytes)).slice(-16 * 1024);
      if (this.log !== undefined) {
        try {
          writeSync(this.log, bytes);
        } catch {
          /* process is unwinding */
        }
      }
    });
    let resolveReady!: () => void, rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const timer = setTimeout(() => rejectReady(new Error('原生工作进程启动超时')), 45_000);
    this.finished = new Promise((resolve) =>
      this.child.once('close', (code, signal) => {
        this.exited = true;
        this.stderrTail = (this.stderrTail + this.stderrDecoder.end()).slice(-16 * 1024);
        if (this.log !== undefined) {
          closeSync(this.log);
          this.log = undefined;
        }
        const diagnostic = this.stderrTail
          .match(
            /(?:^|\n)(?:maaverge-native-worker: [^\r\n]+|native timeout in [^\r\n]+; result unknown, do not replay)/g,
          )
          ?.at(-1)
          ?.replace(/^\n?(?:maaverge-native-worker: )?/, '');
        const reason = diagnostic
          ? nativeStartupError(diagnostic)
          : `原生工作进程已退出（${signal ? `信号 ${signal}` : `退出码 ${code ?? '未知'}`}），请重新连接；若仍失败可在设置中导出诊断日志`;
        rejectReady(new Error(reason));
        for (const item of this.requests.values()) {
          clearTimeout(item.timer);
          item.reject(new Error(reason + '；操作结果未知，请核对设备现场'));
        }
        this.requests.clear();
        this.events.push({
          type: 'exit',
          error: reason,
          ...(diagnostic ? { detail: diagnostic } : {}),
        });
        resolve();
      }),
    );
    this.child.once('error', (error) => rejectReady(new Error(nativeStartupError(error))));
    this.child.stdin.on('error', (error) => {
      rejectReady(error);
    });
    const reader = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    reader.on('line', (line) => {
      try {
        if (Buffer.byteLength(line) > 4 * 1024 * 1024) throw new Error('原生工作进程消息过大');
        const event = JSON.parse(line);
        if (!event || event.protocolVersion !== 1) throw new Error('原生工作进程协议版本不兼容');
        if (event.type === 'ready') resolveReady();
        else if (event.type === 'response') {
          const item = this.requests.get(event.id);
          if (item) {
            clearTimeout(item.timer);
            this.requests.delete(event.id);
            event.error
              ? item.reject(new NativeResponseError(event.error))
              : item.resolve(event.result);
          }
        } else {
          if ([...this.eventListeners].some((listener) => listener(event))) return;
          this.events.push(event);
          if (event.type === 'error')
            rejectReady(new Error(event.error || event.message || '原生工作进程启动失败'));
        }
      } catch (error) {
        this.events.push({ type: 'protocol_error' });
        rejectReady(error as Error);
        void this.close();
      }
    });
    const abort = () => {
      rejectReady(new Error('原生工作进程启动已取消'));
      void this.close().catch(() => {});
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    if (!options.signal?.aborted)
      this.child.stdin.write(stringifyWireJson({ ...config, protocolVersion: 1 }) + '\n');
    try {
      await ready;
      if (this.exited) throw new Error('原生工作进程启动失败');
    } catch (error) {
      await this.close();
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
  request(operation: string, params: any = {}, timeoutMs = 20_000): Promise<any> {
    if (this.closed || this.exited) return Promise.reject(new Error('原生工作进程已关闭'));
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
      return Promise.reject(new Error('原生工作进程请求超时范围无效'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(id);
        reject(new Error('原生工作进程未确认操作，结果未知'));
      }, timeoutMs);
      this.requests.set(id, { resolve, reject, timer });
      this.child.stdin.write(
        stringifyWireJson({ id, operation, protocolVersion: 1, ...params }) + '\n',
        (error) => {
          if (error) {
            clearTimeout(timer);
            this.requests.delete(id);
            reject(error);
          }
        },
      );
    });
  }
  async close() {
    if (this.closed) return this.finished;
    this.closed = true;
    this.child?.stdin.end();
    if (this.finished) {
      const timeout = setTimeout(() => this.child.kill('SIGKILL'), 3000);
      try {
        await this.finished;
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}
