import { devicePicker } from './fixtures/device-picker';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

test.describe('Windows desktop loading', () => {
  test.use({ runtimeHoldSnapshot: true });

  test('a failed desktop module can recover by reloading the interface', async ({ page }) => {
    let failOnce = true;
    await page.route('**/*@tauri-apps_api_core.js*', async (route) => {
      if (failOnce) {
        failOnce = false;
        await route.abort('failed');
      } else await route.continue();
    });
    await page.goto('/');
    await expect(page.getByRole('alert')).toHaveText('界面组件加载失败，请重新加载界面后重试。');
    await Promise.all([
      page.waitForEvent('domcontentloaded'),
      page.getByRole('button', { name: '重新加载界面', exact: true }).click(),
    ]);
    await page.evaluate(() => (window as HarnessWindow).runtimeHarness.releaseSnapshot());
    await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  });

  test('desktop window controls work during loading and track native resize after loading', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByText('正在连接本地应用服务…', { exact: true })).toBeVisible();
    const controls = page.getByRole('group', { name: '窗口控制', exact: true });
    await expect(controls).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.resizeListeners()))
      .toBe(1);
    await controls.getByRole('button', { name: '最小化窗口', exact: true }).click();
    await controls.getByRole('button', { name: '最大化窗口', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.commands))
      .toEqual(['plugin:window|minimize', 'plugin:window|toggle_maximize']);
    await page.evaluate(() => (window as HarnessWindow).runtimeHarness.emitResize(true));
    await expect(controls.getByRole('button', { name: '还原窗口', exact: true })).toBeVisible();
    await page.evaluate(() => (window as HarnessWindow).runtimeHarness.releaseSnapshot());
    await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
    await expect(page.locator('.boot-titlebar')).toHaveCount(0);
    await expect(controls).toHaveCount(1);
    await expect(controls.getByRole('button', { name: '还原窗口', exact: true })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.resizeListeners()))
      .toBe(1);
    await controls.getByRole('button', { name: '还原窗口', exact: true }).click();
    await page.evaluate(() => (window as HarnessWindow).runtimeHarness.emitResize(false));
    await expect(controls.getByRole('button', { name: '最大化窗口', exact: true })).toBeVisible();
    await controls.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.commands))
      .toEqual([
        'plugin:window|minimize',
        'plugin:window|toggle_maximize',
        'plugin:window|toggle_maximize',
        'plugin:window|close',
      ]);
    expect(errors).toEqual([]);
  });
});

test.describe('without a desktop bridge', () => {
  test.use({ runtimeBridge: false });

  test('plain browser reports the desktop requirement without simulated devices', async ({
    page,
  }) => {
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('alert')).toHaveText(
      '未连接桌面运行时，请使用 pnpm dev 启动 Maa Verge 桌面应用。',
    );
    await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toHaveCount(0);
    await expect(devicePicker(page)).toHaveCount(0);
    await expect(page.getByRole('group', { name: '窗口控制', exact: true })).toHaveCount(0);
    await expect(page.getByText('模拟工作空间', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '重新连接', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('pnpm dev');
    expect(requests.some((url) => url.includes('/tests/ui/fixtures/runtime.ts'))).toBe(false);
    expect(errors).toEqual([]);
  });
});
