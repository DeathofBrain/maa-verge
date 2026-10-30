import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { StringDecoder } from 'node:string_decoder';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { childEnvironment, nativeEnvironment } from '../config';
import { nativeWorkerPath } from './native-path';
import { stringifyWireJson } from '../../shared/wire-json';
import { nativeStartupError } from './connection-errors';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export class CoreWorker {
  readonly events: any[] = [];
  connected = false;
  running = false;
  pending = 0;
  closed = false;
  private exited = false;
  private connectionFailed = false;
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
  get safeIdle() {
    return !this.running && !this.pending && !this.exited && !this.closed;
  }
  static async start(
    config: any,
    options: { leaseOnly?: boolean; command?: string[]; signal?: AbortSignal } = {},
  ): Promise<CoreWorker> {
    const worker = new CoreWorker();
    await worker.launch(config, options);
    return worker;
  }
  private async launch(
    config: any,
    options: { leaseOnly?: boolean; command?: string[]; signal?: AbortSignal },
  ) {
    options.signal?.throwIfAborted();
    const directory = config.userDir || path.dirname(config.lockPath);
    mkdirSync(directory, { recursive: true });
    this.log = openSync(path.join(directory, 'worker.stderr.log'), 'a');
    const command = options.command || [
      nativeWorkerPath(),
      ...(options.leaseOnly ? ['--lease-only'] : ['--worker']),
    ];
    const env = config.core ? nativeEnvironment(config.core) : childEnvironment();
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
    const timer = setTimeout(() => rejectReady(new Error('核心工作进程启动超时')), 45_000);
    this.finished = new Promise((resolve) =>
      this.child.once('close', (code, signal) => {
        this.exited = true;
        this.connected = false;
        this.stderrTail = (this.stderrTail + this.stderrDecoder.end()).slice(-16 * 1024);
        if (this.log !== undefined) {
          closeSync(this.log);
          this.log = undefined;
        }
        const diagnostic = this.stderrTail
          .match(
            /(?:^|\n)(?:maaverge-core-worker: [^\r\n]+|native timeout in [^\r\n]+; result unknown, do not replay)/g,
          )
          ?.at(-1)
          ?.replace(/^\n?(?:maaverge-core-worker: )?/, '');
        const reason = diagnostic
          ? nativeStartupError(diagnostic)
          : `核心工作进程已退出（${signal ? `信号 ${signal}` : `退出码 ${code ?? '未知'}`}），请重新连接；若仍失败可在设置中导出诊断日志`;
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
        if (Buffer.byteLength(line) > 4 * 1024 * 1024) throw new Error('核心工作进程消息过大');
        const event = JSON.parse(line);
        if (!event || event.protocolVersion !== 1) throw new Error('核心工作进程协议版本不兼容');
        if (event.type === 'ready') resolveReady();
        else if (event.type === 'response') {
          const item = this.requests.get(event.id);
          if (item) {
            clearTimeout(item.timer);
            this.requests.delete(event.id);
            event.error ? item.reject(new Error(event.error)) : item.resolve(event.result);
          }
        } else {
          if (event.type === 'status') {
            this.running = !!event.running;
            this.pending = event.pendingAsync.length;
          }
          if (
            event.type === 'callback' &&
            event.message === 4 &&
            event.details?.what === 'Connect'
          ) {
            this.connected = !!event.details.details?.ret;
            this.connectionFailed = !this.connected;
          }
          if (
            event.type === 'callback' &&
            event.message === 2 &&
            ['Disconnect', 'ResolutionChanged'].includes(event.details?.what)
          )
            this.connected = false;
          this.events.push(event);
          if (event.type === 'error')
            rejectReady(new Error(event.error || event.message || '核心工作进程启动失败'));
        }
      } catch (error) {
        this.events.push({ type: 'protocol_error' });
        rejectReady(error as Error);
        void this.close();
      }
    });
    const abort = () => {
      rejectReady(new Error('核心工作进程启动已取消'));
      void this.close().catch(() => {});
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    if (!options.signal?.aborted)
      this.child.stdin.write(stringifyWireJson({ ...config, protocolVersion: 1 }) + '\n');
    try {
      await ready;
      if (this.exited) throw new Error('核心工作进程启动失败');
    } catch (error) {
      await this.close();
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
  request(operation: string, params: any = {}): Promise<any> {
    if (this.closed || this.exited) return Promise.reject(new Error('核心工作进程已关闭'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(id);
        reject(new Error('核心工作进程未确认操作，结果未知'));
      }, 20_000);
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
  connect() {
    this.connected = false;
    this.connectionFailed = false;
    this.pending = 1;
    return this.request('connect');
  }
  task(task: any) {
    this.running = true;
    return this.request('task', { task });
  }
  stop() {
    return this.request('stop');
  }
  frame() {
    return this.request('frame');
  }
  click(x: number, y: number) {
    return this.request('click', { x, y });
  }
  async waitConnected(timeout = 30_000, cancelled?: () => boolean) {
    const deadline = Date.now() + timeout;
    // A task may start immediately after the connect callback and final status.
    // Running work does not undo the confirmed connection; pending native setup
    // still has to finish before callers can proceed.
    while (
      !this.exited &&
      !this.closed &&
      !this.connectionFailed &&
      !cancelled?.() &&
      Date.now() < deadline
    ) {
      if (this.connected && !this.pending) return true;
      await delay(20);
    }
    return false;
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
