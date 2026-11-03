/** 隔离测试用 Framework 端口：只有合成回执和测试图流转，不加载 SDK、启动 ADB 或操作设备。 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Runtime, RuntimeOptions } from '@backend/app/runtime';
import type { FrameworkPort } from '@backend/infrastructure/native/framework-worker';
import { mockPreviewImage } from '../../../tests/fixtures/preview-image';
import { syntheticPipeline } from '../../automation/tests/pipeline-fixture';

export class FakeFramework implements FrameworkPort {
  connected = true;
  safeIdle = true;
  closed = false;
  events: any[] = [];
  async stop() {
    return this.request('stop');
  }
  async waitConnected() {
    return this.connected;
  }
  calls: { operation: string; params: Record<string, unknown> }[] = [];
  submitted: { entry: string; pipeline: Record<string, unknown> }[] = [];
  clicks: { x: number; y: number }[] = [];
  frameCalls = 0;
  holdTasks = false;
  private releases = new Set<() => void>();
  frameResult: () => Promise<any> = async () => ({ ...mockPreviewImage, canControl: true });
  result: (operation: string, params: Record<string, unknown>) => Promise<any> = async () => ({
    accepted: true,
    nativeSuccess: true,
  });

  async request(operation: string, params: Record<string, unknown> = {}) {
    this.calls.push({ operation, params: structuredClone(params) });
    if (operation === 'stop') this.completeTask();
    return this.result(operation, params);
  }
  async connect() {
    return this.request('connect');
  }
  async frame() {
    this.frameCalls++;
    this.calls.push({ operation: 'frame', params: {} });
    return this.frameResult();
  }
  async click(x: number, y: number) {
    this.clicks.push({ x, y });
    return this.request('click', { x, y });
  }
  async runPipeline(...args: Parameters<NonNullable<FrameworkPort['runPipeline']>>) {
    const [entry, pipeline, custom, signal, onInput] = args;
    this.submitted.push({ entry, pipeline: structuredClone(pipeline) });
    this.safeIdle = false;
    try {
      if (this.holdTasks) {
        // 由测试显式释放，取消同样结束等待，防止关闭运行时时遗留悬挂动作。
        await new Promise<void>((resolve, reject) => {
          const finish = () => {
            signal?.removeEventListener('abort', abort);
            this.releases.delete(finish);
            resolve();
          };
          const abort = () => {
            this.releases.delete(finish);
            reject(signal?.reason ?? new Error('合成执行已取消'));
          };
          this.releases.add(finish);
          signal?.addEventListener('abort', abort, { once: true });
          if (signal?.aborted) abort();
        });
      }
      await syntheticPipeline()(
        entry,
        pipeline as any,
        (node, params) => custom(node, params, { inputEpoch: 0 }),
        { signal },
      );
      onInput?.(0);
    } finally {
      this.safeIdle = true;
    }
  }
  async runContextPipeline(...args: Parameters<NonNullable<FrameworkPort['runContextPipeline']>>) {
    const [entry, pipeline, custom, signal] = args;
    await syntheticPipeline()(
      entry,
      pipeline as any,
      (node, params) => custom(node, params, { inputEpoch: 0 }),
      { signal },
    );
  }
  completeTask() {
    for (const finish of [...this.releases]) finish();
  }
  async close() {
    this.closed = true;
    this.connected = false;
    this.completeTask();
  }
}

/** 保留真实 Runtime 协调器，仅替换明确注入的 Framework 原生与资源端口。 */
export function frameworkFixtureOptions(options: RuntimeOptions = {}): RuntimeOptions {
  return {
    adbExecutable: () => 'synthetic-adb',
    frameworkWorkerFactory: async () => new FakeFramework(),
    frameworkResources: async (_id, source) => ({
      path: source,
      generation: 'synthetic-generation',
      sourcePaths: [source],
      ocrAvailable: false,
      templates: {},
    }),
    calendar: { fetcher: null },
    ...options,
  };
}

/** 生命周期／连接用例无需游戏资源；空快照仅让兼容预检读取真实文件边界。 */
export function seedFrameworkResource(runtime: Runtime) {
  const resource = path.join(runtime.root, 'synthetic-resource');
  mkdirSync(path.join(resource, 'resource'), { recursive: true });
  writeFileSync(path.join(resource, 'resource', 'tasks.json'), '{}');
  writeFileSync(path.join(resource, 'resource', 'version.json'), '{}');
  runtime.store.put('active', 'combo', {
    resource: { path: resource, version: 'synthetic-resource' },
  });
  return resource;
}
