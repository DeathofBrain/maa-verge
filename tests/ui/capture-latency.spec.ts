import type { ScreenFrame, Snapshot } from '@maaverge/contracts';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { navigate } from './fixtures/navigation';

test('screenshot tests report the current MaaFramework transport latency and preserve the known method', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const call = harness.call;
    const latencies = [987, 0, 7, 14];
    let frameIndex = 0;
    harness.call = async (method, params) => {
      const result = await call(method, params);
      if (method === 'app.snapshot') {
        const snapshot = result as Snapshot;
        return {
          ...snapshot,
          devices: snapshot.devices.map((device) => ({
            ...device,
            captureMethod: 'MumuExtras',
          })),
        };
      }
      if (method === 'device.frame') {
        return { ...(result as ScreenFrame), latencyMs: latencies[frameIndex++] };
      }
      return result;
    };
  });
  await navigate(page, '设备');
  const device = page.getByRole('article', { name: '设备：本地模拟设备', exact: true });
  await device.getByRole('button', { name: '连接设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设备连接设置', exact: true });
  const result = dialog.getByRole('status').filter({ hasText: '截图成功' });

  // 每次回执都显示本次总耗时，零值同样有效，不沿用上一次截图。
  for (const latencyMs of [987, 0, 7, 14]) {
    await dialog.getByRole('button', { name: '截图测试', exact: true }).click();
    await expect(result).toContainText(`总耗时 ${latencyMs} ms`);
    await expect(result).toContainText('（MumuExtras）');
  }
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames)).toEqual([
    'mock-device-1',
    'mock-device-1',
    'mock-device-1',
    'mock-device-1',
  ]);
});
