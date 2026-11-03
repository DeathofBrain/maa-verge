import { spawn } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { nativeEnvironment } from '@backend/infrastructure/config';
import { nativeWorkerPath } from './native-path';
import { NativeWorkerTransport, NativeResponseError } from './worker';
import type { Settings } from '@contracts/types';
import {
  validateFrameworkWorkerCommand,
  validateFrameworkWorkerEvent,
} from '@contracts/validators.js';

export type FrameworkConnection = NonNullable<NonNullable<Settings['connection']>['framework']>;
export type FrameworkConfiguration = {
  framework: string;
  resource: string;
  userDir: string;
  mode: 'control' | 'recognition';
  adb?: string;
  address?: string;
  lockPath?: string;
  avd?: boolean;
  avdSerial?: string;
  touchMode?: FrameworkConnection['touchMode'];
  capture?: FrameworkConnection['capture'] & { pid?: number };
  touchExtras?: FrameworkConnection['touchExtras'];
};
export type FrameworkAction = { accepted: true; nativeSuccess: true };
export type FrameworkCustomHandler = (
  node: string,
  params: Record<string, unknown>,
  metadata: { inputEpoch: number },
) => Promise<void>;
export type FrameworkInputObserver = (inputEpoch: number) => void;
export interface FrameworkPort {
  readonly connected: boolean;
  readonly safeIdle: boolean;
  connect(): Promise<unknown>;
  frame(): Promise<unknown>;
  click(x: number, y: number): Promise<unknown>;
  request(operation: string, params?: Record<string, unknown>): Promise<any>;
  runPipeline?(
    entry: string,
    pipeline: Record<string, unknown>,
    custom: FrameworkCustomHandler,
    signal?: AbortSignal,
    onInputEpoch?: FrameworkInputObserver,
  ): Promise<void>;
  runContextPipeline?(
    entry: string,
    pipeline: Record<string, unknown>,
    custom: FrameworkCustomHandler,
    signal?: AbortSignal,
    onInputEpoch?: FrameworkInputObserver,
  ): Promise<void>;
  close(): Promise<void>;
}

/** 每层保存自己的提交图；父回调等待子任务期间不可继续操作设备。 */
type PipelineExecution = {
  id: string;
  depth: number;
  deadline: number;
  pipeline: Record<string, unknown>;
  custom: FrameworkCustomHandler;
  onInputEpoch?: FrameworkInputObserver;
  callback?: CustomContext;
  parent?: CustomContext;
  error?: unknown;
};
type CustomContext = {
  execution: PipelineExecution;
  callbackId: string;
  valid: boolean;
  childPending: boolean;
};

/** 每设备单原生引擎；JSON 流转和上下文子任务均由官方 MaaFramework 执行。 */
export class FrameworkWorker implements FrameworkPort {
  private pending = 0;
  private ready = false;
  private executions: PipelineExecution[] = [];
  private inputEpoch = 0;
  private customContext = new AsyncLocalStorage<CustomContext>();
  get connected() {
    return this.ready && this.worker.alive;
  }
  private constructor(private worker: NativeWorkerTransport) {
    worker.onEvent((event) => this.consumeCustom(event));
  }
  private activeContext() {
    const context = this.customContext.getStore();
    return context?.valid &&
      !context.childPending &&
      context.execution === this.executions.at(-1) &&
      context.execution.callback === context
      ? context
      : undefined;
  }
  get safeIdle() {
    // 根与挂起子任务各有一个待回执；只有栈顶 Custom 的异步链可在其间取得可控帧。
    return (
      this.worker.alive &&
      ((!this.executions.length && this.pending === 0) ||
        (this.pending === this.executions.length &&
          !!this.activeContext() &&
          this.activeContext()?.execution.error === undefined))
    );
  }
  static async start(config: FrameworkConfiguration, signal?: AbortSignal) {
    const worker = await NativeWorkerTransport.start(config, {
      command: [nativeWorkerPath(), '--framework-worker'],
      nativeDirectory: path.join(config.framework, 'bin'),
      signal,
    });
    return new FrameworkWorker(worker);
  }
  async request(operation: string, params: Record<string, unknown> = {}) {
    const retained = this.customContext.getStore();
    const context = this.activeContext();
    // 子失败已锁存：允许继续观察现场和停止收敛，拒绝任何后续输入或子流程。
    if (
      context?.execution.error !== undefined &&
      !['frame', 'recognize', 'stop'].includes(operation)
    )
      throw new Error('MaaFramework 子流程已失败，禁止后续输入');
    if (retained && !context) throw new Error('MaaFramework Custom 上下文已结束或正在等待子任务');
    if (this.executions.length && operation !== 'stop' && !context)
      throw new Error('MaaFramework Pipeline 正在执行');
    return this.send(
      operation,
      context && operation !== 'stop' ? { ...params, callbackId: context.callbackId } : params,
    );
  }
  private async send(operation: string, params: Record<string, unknown>, timeoutMs?: number) {
    if (!validateFrameworkWorkerCommand({ ...params, protocolVersion: 1, id: '', operation }))
      throw new Error('MaaFramework 原生请求参数无效');
    this.pending++;
    try {
      return await this.worker.request(operation, params, timeoutMs);
    } catch (error) {
      // 子任务的明确失败先回到父层收敛；未知原语、丢失回执及进程故障仍关闭控制进程。
      if (
        error instanceof NativeResponseError &&
        this.connected &&
        (operation === 'context_pipeline' ||
          (operation === 'pipeline' && this.executions[0]?.error !== undefined))
      )
        throw error;
      this.ready = false;
      await this.worker.close();
      throw error;
    } finally {
      this.pending--;
    }
  }
  private observeEpoch(value: number) {
    if (!Number.isSafeInteger(value) || value < this.inputEpoch)
      throw new Error('MaaFramework 输入代际无效');
    this.inputEpoch = value;
    // 返回父层前也同步：标准输入后直接结束的子图可能没有下一次 Custom。
    for (const execution of this.executions) execution.onInputEpoch?.(value);
  }
  private consumeCustom(event: unknown): boolean {
    if (!event || typeof event !== 'object' || !('type' in event)) return false;
    if (event.type !== 'framework_custom' && event.type !== 'framework_input_epoch') return false;
    if (!validateFrameworkWorkerEvent(event)) throw new Error('MaaFramework Custom 事件无效');
    if (event.type === 'framework_input_epoch') {
      this.observeEpoch(event.inputEpoch);
      return true;
    }
    if (event.type !== 'framework_custom') return false;
    const execution = this.executions.at(-1);
    const node = execution?.pipeline[event.node];
    if (
      !execution ||
      execution.callback ||
      execution.id !== event.contextId ||
      execution.depth !== event.depth ||
      (execution.parent?.callbackId ?? null) !== event.parentCallbackId ||
      !node ||
      typeof node !== 'object' ||
      !('action' in node) ||
      node.action !== 'Custom' ||
      !('custom_action' in node) ||
      node.custom_action !== 'MaaVerge.Custom' ||
      !('custom_action_param' in node) ||
      !isDeepStrictEqual(node.custom_action_param, event.params)
    )
      throw new Error('MaaFramework Custom 事件不属于当前 Pipeline 节点');
    this.observeEpoch(event.inputEpoch);
    const context: CustomContext = {
      execution,
      callbackId: event.callbackId,
      valid: true,
      childPending: false,
    };
    execution.callback = context;
    void this.customContext
      .run(context, async () => {
        let success = false;
        try {
          await execution.custom(event.node, event.params, { inputEpoch: event.inputEpoch });
          success = execution.error === undefined;
        } catch (error) {
          execution.error ??= error;
        } finally {
          context.valid = false;
          execution.callback = undefined;
        }
        await this.worker.request('custom_result', { callbackId: event.callbackId, success });
      })
      .catch((error: unknown) => {
        execution.error ??= error;
        void this.close().catch(() => {});
      });
    return true;
  }
  async runPipeline(
    entry: string,
    pipeline: Record<string, unknown>,
    custom: FrameworkCustomHandler,
    signal?: AbortSignal,
    onInputEpoch?: FrameworkInputObserver,
  ): Promise<void> {
    signal?.throwIfAborted();
    if (!this.connected || !this.safeIdle || this.executions.length)
      throw new Error('MaaFramework 尚未就绪或已有操作');
    await this.runExecution(entry, pipeline, custom, signal, onInputEpoch);
  }
  async runContextPipeline(
    entry: string,
    pipeline: Record<string, unknown>,
    custom: FrameworkCustomHandler,
    signal?: AbortSignal,
    onInputEpoch?: FrameworkInputObserver,
  ): Promise<void> {
    signal?.throwIfAborted();
    const parent = this.activeContext();
    if (!this.connected || !parent || !this.safeIdle)
      throw new Error('MaaFramework 子流程需要当前有效 Custom 上下文');
    if (parent.execution.error !== undefined)
      throw new Error('MaaFramework 子流程已失败，禁止后续输入');
    if (parent.execution.depth >= 8) throw new Error('MaaFramework 子流程深度超过 8 层');
    await this.runExecution(entry, pipeline, custom, signal, onInputEpoch, parent);
  }
  private async runExecution(
    entry: string,
    pipeline: Record<string, unknown>,
    custom: FrameworkCustomHandler,
    signal?: AbortSignal,
    onInputEpoch?: FrameworkInputObserver,
    parent?: CustomContext,
  ): Promise<void> {
    const graph = structuredClone(pipeline);
    const execution: PipelineExecution = {
      id: randomUUID(),
      depth: parent ? parent.execution.depth + 1 : 1,
      deadline: parent?.execution.deadline ?? Date.now() + 120_000,
      pipeline: graph,
      custom,
      onInputEpoch,
      parent,
    };
    const remaining = execution.deadline - Date.now();
    if (remaining <= 0) throw new Error('MaaFramework 根流程执行期限已到');
    if (parent) parent.childPending = true;
    this.executions.push(execution);
    const abort = () => {
      void this.worker.request('stop').catch(() => this.close());
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      signal?.throwIfAborted();
      const result = await this.send(
        parent ? 'context_pipeline' : 'pipeline',
        {
          entry,
          pipeline: graph,
          contextId: execution.id,
          ...(parent ? { callbackId: parent.callbackId } : {}),
        },
        Math.min(120_000, remaining),
      );
      signal?.throwIfAborted();
      if (execution.error !== undefined) throw execution.error;
      if (result?.accepted !== true || result?.nativeSuccess !== true)
        throw new Error('MaaFramework 未确认 Pipeline 执行结果');
    } catch (error) {
      const failure = signal?.aborted ? signal.reason : (execution.error ?? error);
      // 不允许调用者吞掉子失败后继续确认父动作成功。
      if (parent) parent.execution.error ??= failure;
      throw failure;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (execution.callback) execution.callback.valid = false;
      if (this.executions.at(-1) === execution) this.executions.pop();
      if (parent) parent.childPending = false;
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
    for (const execution of this.executions)
      if (execution.callback) execution.callback.valid = false;
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
