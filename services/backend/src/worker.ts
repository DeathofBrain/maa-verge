import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { childEnvironment } from './config';
import { nativeWorkerPath } from './native-path';
import { stringifyWireJson } from './wire-json';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export class CoreWorker {
  readonly events: any[] = [];
  connected = false;
  running = false;
  pending = 0;
  closed = false;
  private exited = false;
  private requests = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private child!: ChildProcessWithoutNullStreams;
  private finished!: Promise<void>;
  private log?: number;
  get safeIdle() { return !this.running && !this.pending && !this.exited && !this.closed; }
  static async start(config: any, options: { leaseOnly?: boolean; command?: string[] } = {}): Promise<CoreWorker> {
    const worker = new CoreWorker();
    await worker.launch(config, options); return worker;
  }
  private async launch(config: any, options: { leaseOnly?: boolean; command?: string[] }) {
    const directory = config.userDir || path.dirname(config.lockPath);
    mkdirSync(directory, { recursive: true });
    this.log = openSync(path.join(directory, 'worker.stderr.log'), 'a');
    const command = options.command || [nativeWorkerPath(), ...(options.leaseOnly ? ['--lease-only'] : ['--worker'])];
    const env = childEnvironment();
    if (config.core && process.platform !== 'win32') { const key = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH'; env[key] = config.core + path.delimiter + (env[key] || ''); }
    this.child = spawn(command[0]!, command.slice(1), { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', bytes => { if (this.log !== undefined) { try { writeSync(this.log, bytes); } catch { /* process is unwinding */ } } });
    let resolveReady!: () => void, rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const timer = setTimeout(() => rejectReady(new Error('核心工作进程启动超时')), 45_000);
    this.finished = new Promise(resolve => this.child.once('close', () => {
      this.exited = true; this.connected = false;
      if (this.log !== undefined) { closeSync(this.log); this.log = undefined; }
      rejectReady(new Error('核心工作进程已退出，请查看本地日志'));
      for (const item of this.requests.values()) { clearTimeout(item.timer); item.reject(new Error('核心工作进程已退出，操作结果未知')); }
      this.requests.clear(); this.events.push({ type: 'exit' }); resolve();
    }));
    this.child.once('error', rejectReady);
    this.child.stdin.on('error', error => { rejectReady(error); });
    const reader = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    reader.on('line', line => {
      try {
        if (Buffer.byteLength(line) > 4 * 1024 * 1024) throw new Error('核心工作进程消息过大');
        const event = JSON.parse(line);
        if (!event || event.protocolVersion !== 1) throw new Error('核心工作进程协议版本不兼容');
        if (event.type === 'ready') resolveReady();
        else if (event.type === 'response') {
          const item = this.requests.get(event.id);
          if (item) { clearTimeout(item.timer); this.requests.delete(event.id); event.error ? item.reject(new Error(event.error)) : item.resolve(event.result); }
        } else {
          if (event.type === 'status') { this.running = !!event.running; this.pending = event.pendingAsync.length; }
          if (event.type === 'callback' && event.message === 4 && event.details?.what === 'Connect') this.connected = !!event.details.details?.ret;
          if (event.type === 'callback' && event.message === 2 && ['Disconnect', 'ResolutionChanged'].includes(event.details?.what)) this.connected = false;
          this.events.push(event);
          if (event.type === 'error') rejectReady(new Error(event.error || event.message || '核心工作进程启动失败'));
        }
      } catch (error) { this.events.push({ type: 'protocol_error' }); rejectReady(error as Error); void this.close(); }
    });
    this.child.stdin.write(stringifyWireJson({ ...config, protocolVersion: 1 }) + '\n');
    try { await ready; if (this.exited) throw new Error('核心工作进程启动失败'); }
    catch (error) { await this.close(); throw error; }
    finally { clearTimeout(timer); }
  }
  request(operation: string, params: any = {}): Promise<any> {
    if (this.closed || this.exited) return Promise.reject(new Error('核心工作进程已关闭'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.requests.delete(id); reject(new Error('核心工作进程未确认操作，结果未知')); }, 20_000);
      this.requests.set(id, { resolve, reject, timer });
      this.child.stdin.write(stringifyWireJson({ id, operation, protocolVersion: 1, ...params }) + '\n', error => {
        if (error) { clearTimeout(timer); this.requests.delete(id); reject(error); }
      });
    });
  }
  connect() { this.connected = false; this.pending = 1; return this.request('connect'); }
  task(task: any) { this.running = true; return this.request('task', { task }); }
  stop() { return this.request('stop'); }
  async waitConnected(timeout = 30_000) {
    const deadline = Date.now() + timeout;
    while (!this.exited && !this.closed && Date.now() < deadline) { if (this.connected && this.safeIdle) return true; await delay(20); }
    return false;
  }
  async close() {
    if (this.closed) return this.finished;
    this.closed = true;
    this.child?.stdin.end();
    if (this.finished) {
      const timeout = setTimeout(() => this.child.kill('SIGKILL'), 3000);
      try { await this.finished; } finally { clearTimeout(timeout); }
    }
  }
}
