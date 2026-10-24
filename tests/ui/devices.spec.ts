import { expect, test, type Page } from '@playwright/test';

type DeviceHarness = {
  calls: string[];
  holdDiscovery: boolean;
  holdConnection: boolean;
  discovery: 'normal' | 'empty' | 'error';
  connection: 'normal' | 'empty' | 'error' | 'delayed';
  native: boolean;
  waiting: boolean;
  readyDeviceIds: string[];
  connectionErrors: Record<string, string>;
  errorSnapshots: number;
  rejections: Record<string, unknown>;
  releaseDiscovery: () => void;
  releaseConnection: () => void;
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
  const mockModuleUrl = new URL('../../../tests/ui/fixtures/runtime.ts', new URL(transport, entry.url())).href;
  await page.addInitScript(({ mockModuleUrl }) => {
    const callbacks = new Map<number, (event: unknown) => void>();
    const listeners = new Map<number, { event: string; handler: number }>();
    const held: (() => void)[] = [];
    const heldConnections: (() => void)[] = [];
    let sequence = 0;
    let subscribed = false;
    const target = window as unknown as HarnessWindow & { __TAURI_INTERNALS__: unknown; __TAURI_EVENT_PLUGIN_INTERNALS__: unknown };
    const harness: DeviceHarness = {
      calls: [], holdDiscovery: false, holdConnection: false, discovery: 'normal', connection: 'normal', native: false, waiting: false, readyDeviceIds: [], connectionErrors: {}, errorSnapshots: 0, rejections: {},
      releaseDiscovery: () => { harness.holdDiscovery = false; held.splice(0).forEach((release) => release()); },
      releaseConnection: () => { harness.holdConnection = false; heldConnections.splice(0).forEach((release) => release()); },
    };
    target.deviceHarness = harness;
    const loadMock = async () => {
      const mock = await import(mockModuleUrl);
      if (!subscribed) {
        subscribed = true;
        mock.onFixtureEvent((event: unknown) => {
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
          if (method in harness.rejections) throw harness.rejections[method];
          if (method === 'device.discover') {
            if (harness.holdDiscovery) await new Promise<void>((resolve) => held.push(resolve));
            if (harness.discovery === 'error') throw new Error('发现失败，请检查模拟器连接设置');
            if (harness.discovery === 'empty') return [];
          }
          if (method === 'device.auto_connect') {
            if (harness.holdConnection) await new Promise<void>((resolve) => heldConnections.push(resolve));
            if (harness.connection === 'error') throw new Error('连接失败，请先安装并启用核心');
            if (harness.connection === 'empty') return { devices: [], discovered: [], diagnostics: ['未检测到已启动的模拟器'] };
            if (harness.connection === 'delayed') harness.waiting = true;
          }
          const response = await mock.fixtureRpc(method, args.params || {});
          if (method === 'app.snapshot' && harness.native) response.mode = 'native';
          if (method === 'app.snapshot' && Object.keys(harness.connectionErrors).length) harness.errorSnapshots++;
          if (['app.snapshot', 'device.auto_connect'].includes(method) && harness.waiting) response.devices.forEach((device: { id: string; state: string; connectionError?: string }) => {
            if (!harness.readyDeviceIds.includes(device.id)) device.state = 'offline';
            // Failure evidence arrives in a later snapshot, like native Connect.
            if (method === 'app.snapshot' && harness.connectionErrors[device.id]) device.connectionError = harness.connectionErrors[device.id];
          });
          return response;
        }
        if (command === 'plugin:event|listen') {
          const id = ++sequence; listeners.set(id, { event: args.event as string, handler: args.handler as number }); return id;
        }
        if (command === 'plugin:event|unlisten') { listeners.delete(args.eventId as number); return; }
        if (command === 'plugin:window|is_maximized') return false;
        if (command === 'get_desktop_lifecycle') return 'running';
        if (['plugin:window|set_background_color', 'plugin:webview|set_webview_background_color'].includes(command)) return;
        throw new Error(`Unexpected desktop command: ${command}`);
      },
    };
    target.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_event: string, id: number) => { const listener = listeners.get(id); if (listener) callbacks.delete(listener.handler); },
    };
  }, { mockModuleUrl });
}

test.beforeEach(async ({ page }) => { await installDeviceHarness(page); });

test('discovery and auto connection report completion when mock devices already exist', async ({ page }) => {
  await openDevices(page);
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  await expect(result(page)).toHaveText('发现完成：找到 1 台设备。');
  await expect(page.locator('.sp-discovered')).toContainText('本地模拟设备');
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('连接完成：1 台设备已就绪。');
  await expect(page.locator('.sp-device-item')).toHaveCount(1);
  await expect(page.locator('.connection-diagnostics')).toContainText('未访问真实模拟器');
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  await expect(result(page)).toContainText('找到 1 台设备');
  await expect(page.locator('.connection-diagnostics')).not.toContainText('已连接演示设备');
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(result(page)).toBeVisible();
  expect(await page.locator('.sp-page').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy();
});

test('discovery shows progress, prevents duplicate requests and clears old results on empty or failed retries', async ({ page }) => {
  await openDevices(page);
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  await expect(result(page)).toContainText('找到 1 台设备');
  await page.evaluate(() => { const harness = (window as HarnessWindow).deviceHarness; harness.holdDiscovery = true; harness.discovery = 'empty'; harness.native = true; });
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  await expect(result(page)).toHaveText('正在发现设备…');
  await expect(page.getByRole('button', { name: '正在发现…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '自动连接模拟器', exact: true })).toBeDisabled();
  await expect(page.locator('.dp-discovered-row')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).deviceHarness.calls.filter((method) => method === 'device.discover').length)).toBe(2);
  await page.evaluate(() => (window as HarnessWindow).deviceHarness.releaseDiscovery());
  await expect(result(page)).toContainText('未发现设备');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.discovery = 'error'; });
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  await expect(result(page)).toHaveAttribute('role', 'alert');
  await expect(result(page)).toContainText('发现设备失败：发现失败，请检查模拟器连接设置');
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
  await openDevices(page);
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connection = 'delayed'; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('正在等待设备连接就绪（0/1）…');
  await expect(page.getByRole('region', { name: '正在连接设备', exact: true })).toContainText('正在连接');
  await expect(page.locator('.dp-history .sp-device-item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '正在连接…', exact: true })).toBeDisabled();
  await expect(result(page)).not.toContainText('连接完成');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.waiting = false; });
  await expect(result(page)).toHaveText('连接完成：1 台设备已就绪。');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connection = 'empty'; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('自动连接完成：没有连接到可用设备。');
  await expect(page.locator('.connection-diagnostics')).toContainText('未检测到已启动的模拟器');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connection = 'error'; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveAttribute('role', 'alert');
  await expect(result(page)).toContainText('连接设备失败：连接失败，请先安装并启用核心');
  await expect(page.locator('.connection-diagnostics')).toContainText('请先安装并启用核心');
  await expect(page.locator('.connection-diagnostics')).not.toContainText('未检测到已启动的模拟器');
});

test('a late connection does not replace the device chosen after leaving the page', async ({ page }) => {
  await openDevices(page);
  await page.getByLabel('手动连接 ADB 地址', { exact: true }).fill('127.0.0.1:5557');
  await page.getByRole('button', { name: '连接设备', exact: true }).click();
  await expect(result(page)).toHaveText('连接完成：1 台设备已就绪。');
  const secondId = await page.getByLabel('选择设备', { exact: true }).inputValue();
  await page.getByLabel('选择设备', { exact: true }).selectOption('mock-device-1');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connection = 'delayed'; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('正在等待设备连接就绪（0/2）…');
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await page.getByLabel('选择设备', { exact: true }).selectOption(secondId);
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.waiting = false; });
  // Allow the previously started readiness interval to finish after navigation.
  await page.waitForTimeout(600);
  await expect(page.getByLabel('选择设备', { exact: true })).toHaveValue(secondId);
});

test('a slow initial connection request preserves a device selected while it was pending', async ({ page }) => {
  await openDevices(page);
  await page.getByLabel('手动连接 ADB 地址', { exact: true }).fill('127.0.0.1:5557');
  await page.getByRole('button', { name: '连接设备', exact: true }).click();
  await expect(result(page)).toHaveText('连接完成：1 台设备已就绪。');
  const secondId = await page.getByLabel('选择设备', { exact: true }).inputValue();
  await page.getByLabel('选择设备', { exact: true }).selectOption('mock-device-1');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.holdConnection = true; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('正在发现并连接模拟器…');
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).deviceHarness.calls.filter(method => method === 'device.auto_connect').length)).toBe(1);
  await page.getByLabel('选择设备', { exact: true }).selectOption(secondId);
  await page.evaluate(() => (window as HarnessWindow).deviceHarness.releaseConnection());
  await expect(result(page)).toHaveText('连接完成：2 台设备已就绪。');
  await expect(page.getByLabel('选择设备', { exact: true })).toHaveValue(secondId);
});

test('an asynchronous connection that stays offline reports pending readiness without claiming success', async ({ page }) => {
  await openDevices(page);
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connection = 'delayed'; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('正在等待设备连接就绪（0/1）…');
  await page.clock.setFixedTime(new Date(Date.now() + 40_000));
  await expect(result(page)).toHaveText('连接结果：0 台已就绪，1 台尚未就绪。');
  await expect(page.locator('.connection-diagnostics')).toContainText('连接尚未就绪');
  await expect(page.locator('.sp-device-detail')).toContainText('已断开');
  await expect(page.getByRole('button', { name: '自动连接模拟器', exact: true })).toBeEnabled();
});

test('an explicit asynchronous connection failure finishes promptly and permits retry', async ({ page }) => {
  await openDevices(page);
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connection = 'delayed'; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('正在等待设备连接就绪（0/1）…');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connectionErrors['mock-device-1'] = '合成核心连接失败：ADB 地址不可达'; });
  await expect(result(page)).toHaveText('连接结果：0 台已就绪，1 台连接失败。合成核心连接失败：ADB 地址不可达', { timeout: 5000 });
  await expect(result(page)).toHaveAttribute('role', 'alert');
  await expect(page.locator('.connection-diagnostics')).toContainText('合成核心连接失败：ADB 地址不可达');
  await expect(page.locator('.connection-diagnostics')).not.toContainText('尚未就绪');
  await expect(page.getByRole('button', { name: '自动连接模拟器', exact: true })).toBeEnabled();
  await page.evaluate(() => { const harness = (window as HarnessWindow).deviceHarness; harness.connection = 'normal'; harness.waiting = false; harness.connectionErrors = {}; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('连接完成：1 台设备已就绪。');
  await expect(page.locator('.connection-diagnostics')).not.toContainText('合成核心连接失败');
});

test('one failed instance leaves other pending instances waiting until their own result arrives', async ({ page }) => {
  await openDevices(page);
  await page.getByLabel('手动连接 ADB 地址', { exact: true }).fill('127.0.0.1:5557');
  await page.getByRole('button', { name: '连接设备', exact: true }).click();
  await expect(result(page)).toHaveText('连接完成：1 台设备已就绪。');
  const secondId = await page.getByLabel('选择设备', { exact: true }).inputValue();
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connection = 'delayed'; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('正在等待设备连接就绪（0/2）…');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connectionErrors['mock-device-1'] = '合成第一实例连接失败'; });
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).deviceHarness.errorSnapshots)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: '正在连接…', exact: true })).toBeDisabled();
  await expect(result(page)).toHaveAttribute('aria-busy', 'true');
  await page.evaluate((id) => { (window as HarnessWindow).deviceHarness.readyDeviceIds = [id]; }, secondId);
  await expect(result(page)).toHaveText('连接结果：1 台已就绪，1 台连接失败。合成第一实例连接失败', { timeout: 5000 });
  await expect(page.locator('.connection-diagnostics')).toContainText('合成第一实例连接失败');
  await expect(page.locator('.connection-diagnostics')).not.toContainText('尚未就绪');
  await expect(page.getByRole('button', { name: '自动连接模拟器', exact: true })).toBeEnabled();
  await expect(page.getByLabel('选择设备', { exact: true })).toHaveValue(secondId);
});

test('a structured bridge failure shows the concrete ADB cause in the page and toast', async ({ page }) => {
  await openDevices(page);
  await page.evaluate(() => {
    (window as HarnessWindow).deviceHarness.rejections['device.auto_connect'] = JSON.stringify({ code: -32040, message: '设备连接失败', data: { error: 'Error: 未找到 ADB；请在连接设置选择模拟器内置 ADB' } });
  });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toContainText('未找到 ADB；请在连接设置选择模拟器内置 ADB');
  await expect(page.locator('.toast.error')).toContainText('未找到 ADB');
  await expect(page.locator('.connection-diagnostics')).toContainText('未找到 ADB');
  await expect(result(page)).not.toContainText('[object Object]');
  await expect(result(page)).not.toContainText('请查看');
});

test('asynchronous ADB authorization failures are explained before retrying', async ({ page }) => {
  await openDevices(page);
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connection = 'delayed'; });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toHaveText('正在等待设备连接就绪（0/1）…');
  await page.evaluate(() => { (window as HarnessWindow).deviceHarness.connectionErrors['mock-device-1'] = 'error: device unauthorized'; });
  await expect(result(page)).toContainText('设备尚未授权 ADB 调试');
  await expect(result(page)).toContainText('确认调试授权后重试');
  await expect(page.locator('.connection-diagnostics')).toContainText('设备尚未授权 ADB 调试');
  await expect(page.getByRole('button', { name: '自动连接模拟器', exact: true })).toBeEnabled();
});

test('an unknown connection cause is retained without claiming that ADB is disabled', async ({ page }) => {
  await openDevices(page);
  await page.evaluate(() => {
    (window as HarnessWindow).deviceHarness.rejections['device.auto_connect'] = { code: -32040, message: '设备连接失败', data: { reason: '合成未知连接故障 723' } };
  });
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(result(page)).toContainText('合成未知连接故障 723');
  await expect(result(page)).not.toContainText('ADB 未开启');
  await expect(result(page)).not.toContainText('模拟器未启动');
});
