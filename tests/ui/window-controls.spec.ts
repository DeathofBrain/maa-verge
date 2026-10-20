import { expect, test, type Page } from '@playwright/test';

type WindowHarness = {
  commands: string[];
  releaseSnapshot: () => void;
  emitResize: (maximized: boolean) => void;
  resizeListeners: () => number;
};
type HarnessWindow = Window & { windowHarness: WindowHarness };

async function installDesktopWindowMock(page: Page) {
  // Resolve the running Vite workspace so this also works against another checkout's server.
  const entry = await page.request.get('/@id/@maaverge/contracts');
  expect(entry.ok()).toBeTruthy();
  const transport = (await entry.text()).match(/from\s+["']([^"']+\/transport\.ts(?:\?[^"']*)?)["']/)?.[1];
  if (!transport) throw new Error('Cannot locate the contracts mock runtime module');
  const mockModuleUrl = new URL('mock.ts', new URL(transport, entry.url())).href;
  await page.addInitScript(({ mockModuleUrl }) => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' });
    const commands: string[] = [];
    const callbacks = new Map<number, (event: unknown) => void>();
    const listeners = new Map<number, { event: string; handler: number }>();
    let sequence = 0;
    let maximized = false;
    let releaseSnapshot!: () => void;
    const snapshotReady = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
    const target = window as unknown as HarnessWindow & {
      __TAURI_INTERNALS__: unknown;
      __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
    };
    target.windowHarness = {
      commands,
      releaseSnapshot,
      emitResize: (next) => {
        maximized = next;
        for (const [id, listener] of listeners) {
          if (listener.event === 'tauri://resize') callbacks.get(listener.handler)?.({
            event: listener.event, id, payload: { width: next ? 1600 : 1280, height: 900 },
          });
        }
      },
      resizeListeners: () => [...listeners.values()].filter((listener) => listener.event === 'tauri://resize').length,
    };
    target.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: (callback: (event: unknown) => void) => {
        const id = ++sequence;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback: (id: number) => callbacks.delete(id),
      invoke: async (command: string, args: Record<string, unknown> = {}) => {
        if (command === 'runtime_request') {
          if (args.method === 'app.snapshot') await snapshotReady;
          const { mockRpc } = await import(mockModuleUrl);
          return mockRpc(args.method as string, args.params as Record<string, unknown>);
        }
        if (command === 'plugin:event|listen') {
          const id = ++sequence;
          listeners.set(id, { event: args.event as string, handler: args.handler as number });
          return id;
        }
        if (command === 'plugin:event|unlisten') {
          listeners.delete(args.eventId as number);
          return;
        }
        if (command === 'plugin:window|is_maximized') return maximized;
        if (['plugin:window|minimize', 'plugin:window|toggle_maximize', 'plugin:window|close'].includes(command)) {
          commands.push(command);
          return;
        }
        throw new Error(`Unexpected desktop command: ${command}`);
      },
    };
    target.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_event: string, id: number) => {
        const listener = listeners.get(id);
        if (listener) callbacks.delete(listener.handler);
      },
    };
  }, { mockModuleUrl });
}

test('browser preview has no window buttons and keeps topbar controls interactive', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: '窗口控制', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(最小化|最大化|还原|关闭)窗口$/ })).toHaveCount(0);
  await page.getByLabel('选择设备', { exact: true }).selectOption('mock-device-1');
  await expect(page.getByLabel('选择设备', { exact: true })).toHaveValue('mock-device-1');
  await page.getByLabel('搜索任务与设置', { exact: true }).fill('资源更新');
  await page.getByRole('region', { name: '搜索结果', exact: true }).getByRole('button').filter({ hasText: '应用设置' }).first().click();
  await expect(page.getByRole('heading', { name: '更新', exact: true })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('desktop window controls work during loading and track native resize after loading', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installDesktopWindowMock(page);
  await page.goto('/');
  await expect(page.getByText('正在连接本地应用服务…', { exact: true })).toBeVisible();
  const controls = page.getByRole('group', { name: '窗口控制', exact: true });
  await expect(controls).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).windowHarness.resizeListeners())).toBe(1);
  await controls.getByRole('button', { name: '最小化窗口', exact: true }).click();
  await controls.getByRole('button', { name: '最大化窗口', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).windowHarness.commands)).toEqual([
    'plugin:window|minimize', 'plugin:window|toggle_maximize',
  ]);
  await page.evaluate(() => (window as HarnessWindow).windowHarness.emitResize(true));
  await expect(controls.getByRole('button', { name: '还原窗口', exact: true })).toBeVisible();
  await page.evaluate(() => (window as HarnessWindow).windowHarness.releaseSnapshot());
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await expect(page.locator('.boot-titlebar')).toHaveCount(0);
  await expect(controls).toHaveCount(1);
  await expect(controls.getByRole('button', { name: '还原窗口', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).windowHarness.resizeListeners())).toBe(1);
  for (const width of [900, 1280, 1700, 1280, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => (window as HarnessWindow).windowHarness.emitResize(true));
    const frames = await page.evaluate(async () => {
      const sizes = [];
      for (let frame = 0; frame < 4; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const topbar = document.querySelector('.topbar')!.getBoundingClientRect();
        const controls = document.querySelector('.window-controls')!.getBoundingClientRect();
        sizes.push({ topbarHeight: topbar.height, controlsHeight: controls.height, controlsWidth: controls.width });
      }
      return sizes;
    });
    expect(frames, `window controls remain stable while resizing to ${width}px`).toEqual(
      Array.from({ length: 4 }, () => ({ topbarHeight: 57, controlsHeight: 56, controlsWidth: 138 })),
    );
    await expect(controls.getByRole('button', { name: '还原窗口', exact: true })).toBeVisible();
  }
  await controls.getByRole('button', { name: '还原窗口', exact: true }).click();
  await page.evaluate(() => (window as HarnessWindow).windowHarness.emitResize(false));
  await expect(controls.getByRole('button', { name: '最大化窗口', exact: true })).toBeVisible();
  await controls.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).windowHarness.commands)).toEqual([
    'plugin:window|minimize', 'plugin:window|toggle_maximize', 'plugin:window|toggle_maximize', 'plugin:window|close',
  ]);
  expect(errors).toEqual([]);
});
