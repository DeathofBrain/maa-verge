import type { ScreenFrame, Snapshot } from '@maaverge/contracts';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { navigate } from './fixtures/navigation';

test('screenshot tests report only the current MaaCore latency and preserve the known method', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const call = harness.call;
    const latencies = [undefined, 0, 7, undefined];
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
        const image = { ...(result as ScreenFrame), latencyMs: 987 };
        delete image.coreLatencyMs;
        const coreLatencyMs = latencies[frameIndex++];
        if (coreLatencyMs !== undefined) image.coreLatencyMs = coreLatencyMs;
        return image;
      }
      return result;
    };
  });
  await navigate(page, '设备');
  const device = page.getByRole('article', { name: '设备：本地模拟设备', exact: true });
  await device.getByRole('button', { name: '连接设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设备连接设置', exact: true });
  const result = dialog.getByRole('status').filter({ hasText: '截图成功' });

  // A missing first value and a missing value after 7 ms must both stay unknown.
  for (const coreLatencyMs of [undefined, 0, 7, undefined]) {
    await dialog.getByRole('button', { name: '截图测试', exact: true }).click();
    await expect(result).toContainText(
      coreLatencyMs === undefined ? '核心未提供截图耗时' : `核心截图耗时 ${coreLatencyMs} ms`,
    );
    await expect(result).toContainText('（MumuExtras）');
    await expect(result).not.toContainText('987');
    if (coreLatencyMs === undefined) await expect(result).not.toContainText('核心截图耗时');
  }
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames)).toEqual([
    'mock-device-1',
    'mock-device-1',
    'mock-device-1',
    'mock-device-1',
  ]);
});
