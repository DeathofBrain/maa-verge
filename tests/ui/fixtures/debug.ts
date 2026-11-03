import type { Page } from '@playwright/test';
import type { Snapshot } from '../../../packages/contracts/src/types';
import type { HarnessWindow } from './desktop';
import { mockPreviewImage } from '../../fixtures/preview-image';
import { navigate } from './navigation';

export type DebugProbe = {
  calls: { method: string; params: Record<string, unknown> }[];
  sessions: string[];
  holdStart: boolean;
  holdInvoke: boolean;
  failInvoke: boolean;
  failEnd: boolean;
  releaseStart: () => void;
  releaseInvoke: () => void;
};
export type DebugWindow = HarnessWindow & { debugProbe: DebugProbe };
export async function installDebugFixture(page: Page, enabled = false) {
  await page.addInitScript(
    ({ image, enabled }) => {
      if (enabled) localStorage.setItem('maaverge:ui:debug-enabled', 'true');
      const target = window as DebugWindow;
      const original = target.runtimeHarness.call;
      const startWaiters: (() => void)[] = [];
      const invokeWaiters: (() => void)[] = [];
      let sequence = 0;
      const schema = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      });
      const catalog = [
        {
          id: 'operation.click',
          label: '点击',
          description: '在选定画面坐标点击',
          layer: 'operation',
          available: true,
          inputSchema: schema(
            {
              frameId: { type: 'string', title: '画面 ID' },
              x: { type: 'integer', title: 'X 坐标', minimum: 0 },
              y: { type: 'integer', title: 'Y 坐标', minimum: 0 },
            },
            ['frameId', 'x', 'y'],
          ),
        },
        {
          id: 'observation.frame',
          label: '截图',
          description: '获取一帧新画面',
          layer: 'observation',
          available: true,
          inputSchema: schema(),
        },
        {
          id: 'observation.ocr',
          label: 'OCR',
          description: '识别指定区域文字',
          layer: 'operation',
          primitiveLevel: 1,
          effect: 'observe',
          available: true,
          inputSchema: schema(
            {
              frameId: { type: 'string', title: '画面 ID' },
              roi: { type: 'array', title: '识别区域' },
              text: { type: 'string', title: '目标文字' },
            },
            ['frameId', 'roi'],
          ),
        },
        {
          id: 'game.home',
          label: '识别主页',
          description: '检查目标页面',
          layer: 'game',
          available: true,
          inputSchema: schema({
            retries: { type: 'integer', title: '重试次数', minimum: 0, maximum: 3, default: 0 },
            enabled: { type: 'boolean', title: '启用验证', default: true },
            mode: {
              type: 'string',
              title: '检查模式',
              enum: ['strict', 'loose'],
              default: 'strict',
            },
          }),
        },
        {
          id: 'workflow.unavailable',
          label: '活动导航',
          description: '适配尚未完成',
          layer: 'workflow',
          available: false,
          unavailableReason: '当前客户端尚未登记活动入口',
          inputSchema: schema(),
        },
      ].map((item) => ({ ...item, resultSchema: schema() }));
      const probe = (target.debugProbe = {
        calls: [],
        sessions: [],
        holdStart: false,
        holdInvoke: false,
        failInvoke: false,
        failEnd: false,
        releaseStart: () => {
          probe.holdStart = false;
          startWaiters.splice(0).forEach((resolve) => resolve());
        },
        releaseInvoke: () => {
          probe.holdInvoke = false;
          invokeWaiters.splice(0).forEach((resolve) => resolve());
        },
      });
      target.runtimeHarness.call = async (method, params) => {
        if (method === 'primitive.catalog.get' || method.startsWith('debug.'))
          probe.calls.push({ method, params: structuredClone(params) });
        if (method === 'primitive.catalog.get') return { items: catalog };
        if (method === 'debug.session.start') {
          if (probe.holdStart) await new Promise<void>((resolve) => startWaiters.push(resolve));
          const debugSessionId = `debug-fixture-${++sequence}`;
          probe.sessions.push(debugSessionId);
          return { debugSessionId, deviceId: params.deviceId };
        }
        if (method === 'debug.session.end') {
          if (probe.failEnd) throw new Error('合成释放失败');
          probe.sessions = probe.sessions.filter((id) => id !== params.debugSessionId);
          probe.releaseInvoke();
          return { ended: true };
        }
        if (method === 'debug.primitive.invoke') {
          if (probe.holdInvoke) await new Promise<void>((resolve) => invokeWaiters.push(resolve));
          if (probe.failInvoke) throw new Error('合成原语执行失败，结果未知');
          const cancelled = !probe.sessions.includes(String(params.debugSessionId));
          return {
            primitiveId: params.primitiveId,
            status: cancelled
              ? 'cancelled'
              : params.primitiveId === 'game.home'
                ? 'unknown'
                : 'succeeded',
            nativeSuccess: !cancelled,
            verified: params.primitiveId === 'game.home' ? undefined : false,
            data: { input: params.input, message: cancelled ? '已取消' : '合成原语返回' },
            steps: [
              { primitiveId: params.primitiveId, status: cancelled ? 'cancelled' : 'succeeded' },
            ],
            ...(params.primitiveId === 'observation.frame'
              ? {
                  frame: {
                    ...image,
                    deviceId: 'mock-device-1',
                    frameId: `debug-frame-${++sequence}`,
                    capturedAt: new Date().toISOString(),
                    canControl: true,
                    latencyMs: 1,
                  },
                }
              : {}),
          };
        }
        const result = await original(method, params);
        if (method === 'app.snapshot') {
          const snapshot = result as Snapshot;
          return {
            ...snapshot,
            devices: [
              ...snapshot.devices,
              {
                ...snapshot.devices[0],
                id: 'debug-device-2',
                name: '调试设备二',
                address: '127.0.0.1:5557',
                state: 'idle',
              },
            ],
          };
        }
        return result;
      };
    },
    { image: mockPreviewImage, enabled },
  );
}
export async function openAbout(page: Page) {
  await navigate(page, '设置');
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '关于', exact: true })
    .click();
}
export async function unlockDebug(page: Page) {
  await openAbout(page);
  const title = page.getByRole('button', { name: '应用版本', exact: true });
  for (let index = 0; index < 5; index++) await title.click();
}
export async function debugCalls(page: Page, method: string) {
  return page.evaluate(
    (method) => (window as DebugWindow).debugProbe.calls.filter((call) => call.method === method),
    method,
  );
}
