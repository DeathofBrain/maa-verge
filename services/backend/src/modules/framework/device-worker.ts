/** 常驻 Framework 控制进程的设备生命周期视图；不实现第二套任务执行器。 */
import type { FrameworkPort } from '@backend/infrastructure/native/framework-worker';

export type DeviceWorker = FrameworkPort & {
  events: any[];
  connected: boolean;
  stop(): Promise<unknown>;
  waitConnected(timeoutMs?: number, cancelled?: () => boolean): Promise<boolean>;
};

/** 连接与占用分别维护：空闲连接保留共享 OS 租约，业务会话负责互斥。 */
export function deviceWorker(port: FrameworkPort): DeviceWorker {
  let disconnected = false;
  return {
    events: [],
    get connected() {
      return !disconnected && port.connected;
    },
    set connected(value: boolean) {
      if (!value) disconnected = true;
    },
    get safeIdle() {
      return !disconnected && port.safeIdle;
    },
    connect: () => port.connect(),
    frame: () => port.frame(),
    click: (x, y) => port.click(x, y),
    request: (operation, params) => port.request(operation, params),
    runPipeline: port.runPipeline?.bind(port),
    runContextPipeline: port.runContextPipeline?.bind(port),
    stop: () => port.request('stop'),
    async waitConnected(timeoutMs = 30_000, cancelled = () => false) {
      const deadline = Date.now() + timeoutMs;
      while (!port.connected && !disconnected && Date.now() < deadline && !cancelled())
        await new Promise((resolve) => setTimeout(resolve, 25));
      return !disconnected && port.connected && !cancelled();
    },
    async close() {
      disconnected = true;
      await port.close();
    },
  };
}
