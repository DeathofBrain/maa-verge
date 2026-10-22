import { expect, test, type Page } from '@playwright/test';

type DeviceHarness = {
  calls: string[];
  holdDiscovery: boolean;
  discovery: 'normal' | 'empty' | 'error';
  connection: 'normal' | 'empty' | 'error' | 'delayed';
  native: boolean;
  waiting: boolean;
  releaseDiscovery: () => void;
};
type HarnessWindow = Window & { deviceHarness: DeviceHarness };
const result = (page: Page) => page.getByLabel('设备操作结果', { exact: true });

async function openDevices(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '设备', exact: true }).click();
}

async function installDeviceHarness(page: Page) {
  const entry = await page.request.get('/@id/@maaverge/contracts');
  expect(entry.ok()).toBeTruthy();
  const transport = (await entry.text()).match(/from\s+["']([^"']+\/transport\.ts(?:\?[^"']*)?)["']/)?.[1];
  if (!transport) throw new Error('Cannot locate the contracts mock runtime module');
  const mockModuleUrl = new URL('mock.ts', new URL(transport, entry.url())).href;
  await page.addInitScript(({ mockModuleUrl }) => {
    const callbacks = new Map<number, (event: unknown) => void>();
    const listeners = new Map<number, { event: string; handler: number }>();
    const held: (() => void)[] = [];
    let sequence = 0;
    let subscribed = false;
    const target = window as unknown as HarnessWindow & { __TAURI_INTERNALS__: unknown; __TAURI_EVENT_PLUGIN_INTERNALS__: unknown };
    const harness: DeviceHarness = {
      calls: [], holdDiscovery: false, discovery: 'normal', connection: 'normal', native: false, waiting: false,
      releaseDiscovery: () => { harness.holdDiscovery = false; held.splice(0).forEach((release) => release()); },
    };
    target.deviceHarness = harness;
    const loadMock = async () => {
      const mock = await import(mockModuleUrl);
      if (!subscribed) {
        subscribed = true;
        mock.onMockEvent((event: unknown) => {
          for (const [id, listener] of listeners) if (listener.event === 'runtime-event') callbacks.get(listener.handler)?.({ event: listener.event, id, payload: event });
        });
      }
      return mock;
    };
    target.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: (callback: (event: unknown) => void) => { const id = ++sequence; callbacks.set(id, callback); return id; },
      unregisterCallback: (id: number) => callbacks.delete(id),
      invoke: async (command: string, args: Record<string, unknown> = {}) => {
        if (command === 'runtime_request') {
          const method = String(args.method);
          const mock = await loadMock();
          harness.calls.push(method);
          if (method === 'device.discover') {
            if (harness.holdDiscovery) await new Promise<void>((resolve) => held.push(resolve));
            if (harness.discovery === 'error') throw new Error('发现失败，请检查模拟器连接设置');
            if (harness.discovery === 'empty') return [];
          }
          if (method === 'device.auto_connect') {
            if (harness.connection === 'error') throw new Error('连接失败，请先安装并启用核心');
            if (harness.connection === 'empty') return { devices: [], discovered: [], diagnostics: ['未检测到已启动的模拟器'] };
            if (harness.connection === 'delayed') harness.waiting = true;
          }
          const response = await mock.mockRpc(method, args.params || {});
          if (method === 'app.snapshot' && harness.native) response.mode = 'native';
          if (['app.snapshot', 'device.auto_connect'].includes(method) && harness.waiting) response.devices.forEach((device: { state: string }) => { device.state = 'offline'; });
          return response;
        }
        if (command === 'plugin:event|listen') {
          const id = ++sequence; listeners.set(id, { event: args.event as string, handler: args.handler as number }); return id;
        }
        if (command === 'plugin:event|unlisten') { listeners.delete(args.eventId as number); return; }
        if (command === 'plugin:window|is_maximized') return false;
        if (['plugin:window|set_background_color', 'plugin:webview|set_webview_background_color'].includes(command)) return;
        throw new Error(`Unexpected desktop command: ${command}`);
      },
    };
    target.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_event: string, id: number) => { const listener = listeners.get(id); if (listener) callbacks.delete(listener.handler); },
    };
  }, { mockModuleUrl });
}

test('discovery and auto connection report completion when mock devices already exist', async ({ page }) => {
  await openDevices(page);
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  await expect(result(page)).toHaveText('模拟发现完成：找到 1 台设备，其中 1 台已在设备列表中。');
  await expect(page.locator('.sp-discovered')).toContainText('本地模拟设备');
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('模拟连接完成：1 台设备已就绪。');
  await expect(page.locator('.sp-device-item')).toHaveCount(1);
  await expect(page.locator('.connection-diagnostics')).toContainText('未访问真实模拟器');
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  await expect(result(page)).toContainText('其中 1 台已在设备列表中');
  await expect(page.locator('.connection-diagnostics')).not.toContainText('已连接演示设备');
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(result(page)).toBeVisible();
  expect(await page.locator('.sp-page').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy();
});

test('discovery shows progress, prevents duplicate requests and clears old results on empty or failed retries', async ({ page }) => {
  await installDeviceHarness(page);
  await openDevices(page);
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  await expect(result(page)).toContainText('找到 1 台设备');
  await page.evaluate(() => { const harness = (window as HarnessWindow).deviceHarness; harness.holdDiscovery = true; harness.discovery = 'empty'; harness.native = true; });
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  await expect(result(page)).toHaveText('正在发现设备…');
  await expect(page.getByRole('button', { name: '正在发现…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '自动连接模拟器', exact: true })).toBeDisabled();
  await expect(page.locator('.sp-discovered')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).deviceHarness.calls.filter((method) => method === 'device.discover').length)).toBe(2);
  await page.evaluate(() => (window as HarnessWindow).deviceHarness.releaseDiscovery());
  await expect(result(page)).toContainText('未发现设备');
  // The next snapshot switches the harness to the native display mode; all data
  // and RPC calls remain deterministic mock responses.
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.discovery = 'error'; });
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  await expect(result(page)).toHaveAttribute('role', 'alert');
  await expect(result(page)).toContainText('发现设备失败，请查看下方连接诊断。');
  await expect(page.locator('.connection-diagnostics')).toContainText('发现失败，请检查模拟器连接设置');
  await expect(page.locator('.connection-diagnostics')).not.toContainText('暂无演示设备');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.discovery = 'normal'; });
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  await expect(result(page)).toHaveAttribute('role', 'status');
  await expect(result(page)).toContainText('找到 1 台设备');
  await expect(page.locator('.toast.error')).toHaveCount(0);
  await expect(page.locator('.connection-diagnostics')).not.toContainText('发现失败');
});

test('auto connection waits for ready devices and reports an empty result or connection error', async ({ page }) => {
  await installDeviceHarness(page);
  await openDevices(page);
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connection = 'delayed'; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('正在等待设备连接就绪（0/1）…');
  await expect(page.getByRole('button', { name: '正在连接…', exact: true })).toBeDisabled();
  await expect(result(page)).not.toContainText('连接完成');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.waiting = false; });
  await expect(result(page)).toHaveText('模拟连接完成：1 台设备已就绪。');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connection = 'empty'; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('自动连接完成：没有连接到可用设备。');
  await expect(page.locator('.connection-diagnostics')).toContainText('未检测到已启动的模拟器');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connection = 'error'; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveAttribute('role', 'alert');
  await expect(result(page)).toContainText('连接设备失败，请查看下方连接诊断。');
  await expect(page.locator('.connection-diagnostics')).toContainText('请先安装并启用核心');
  await expect(page.locator('.connection-diagnostics')).not.toContainText('未检测到已启动的模拟器');
});

test('an asynchronous connection that stays offline reports pending readiness without claiming success', async ({ page }) => {
  await installDeviceHarness(page);
  await openDevices(page);
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connection = 'delayed'; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('正在等待设备连接就绪（0/1）…');
  await page.clock.setFixedTime(new Date(Date.now() + 20_000));
  await expect(result(page)).toHaveText('模拟连接结果：0 台已就绪，1 台尚未就绪。');
  await expect(page.locator('.connection-diagnostics')).toContainText('连接尚未就绪');
  await expect(page.locator('.sp-device-detail')).toContainText('已断开');
  await expect(page.getByRole('button', { name: '自动连接模拟器', exact: true })).toBeEnabled();
});
