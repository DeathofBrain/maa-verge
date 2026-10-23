import { expect, test, type HarnessWindow } from './fixtures/desktop';

test('closing asks each time until a choice is remembered, and supports keyboard cancellation', async ({ page }) => {
  await page.goto('/');
  const close = page.getByRole('button', { name: '关闭窗口', exact: true });
  const dialog = page.getByRole('dialog', { name: '关闭 Maa Verge', exact: true });
  await close.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /记住我的选择/ })).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(close).toBeFocused();
  await close.click();
  await dialog.getByRole('button', { name: '最小化到托盘', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await close.click();
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.settingsWrites)).toBe(0);
  await dialog.getByRole('button', { name: '取消关闭', exact: true }).click();
});

test('remembering tray persists through reload and can be reset in settings', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('界面主题', { exact: true }).selectOption('dark');
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '关闭 Maa Verge', exact: true });
  await dialog.getByRole('checkbox', { name: /记住我的选择/ }).check();
  // Repeated native requests keep the current choice and a single dialog.
  await page.evaluate(() => (window as HarnessWindow).runtimeHarness.emitDesktopEvent('window-close-requested'));
  await expect(dialog.getByRole('checkbox', { name: /记住我的选择/ })).toBeChecked();
  await dialog.getByRole('button', { name: '最小化到托盘', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByLabel('界面主题', { exact: true })).toHaveValue('dark');
  await expect(page.getByLabel('关闭窗口时', { exact: true })).toHaveValue('tray');
  await page.getByLabel('关闭窗口时', { exact: true }).selectOption('ask');
  await expect(page.getByLabel('关闭窗口时', { exact: true })).toHaveValue('ask');
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /记住我的选择/ })).not.toBeChecked();
});

test('remembering exit persists and later closes directly with a painted waiting dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '关闭 Maa Verge', exact: true });
  await dialog.getByRole('checkbox', { name: /记住我的选择/ }).check();
  await dialog.getByRole('button', { name: '退出应用', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '正在退出…', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.commands.filter(command => command === 'exit_ui_ready').length)).toBe(1);
  const saved = await page.evaluate(async () => {
    const { settings } = await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}) as { settings: { rememberCloseAction: boolean; minimizeToTray: boolean } };
    return { rememberCloseAction: settings.rememberCloseAction, minimizeToTray: settings.minimizeToTray };
  });
  expect(saved).toEqual({ rememberCloseAction: true, minimizeToTray: false });
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '正在退出…', exact: true })).toBeVisible();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.settingsWrites)).toBe(0);
});

test('a failed remembered choice keeps the dialog open and allows retry without losing settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '关闭 Maa Verge', exact: true });
  await dialog.getByRole('checkbox', { name: /记住我的选择/ }).check();
  await page.evaluate(() => { (window as HarnessWindow).runtimeHarness.failSettings = true; });
  await dialog.getByRole('button', { name: '退出应用', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('合成设置保存失败');
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.commands)).toEqual(['plugin:window|close']);
  await page.evaluate(() => { (window as HarnessWindow).runtimeHarness.failSettings = false; });
  await dialog.getByRole('button', { name: '最小化到托盘', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.commands)).toEqual(['plugin:window|close', 'resolve_window_close:tray']);
});

test('tray exit stays modal and animated through repeated requests and runtime disconnection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const bridge = (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> } }).__TAURI_INTERNALS__;
    const invoke = bridge.invoke;
    bridge.invoke = async (command, args) => {
      if (command === 'exit_ui_ready' && !document.querySelector<HTMLDialogElement>('dialog[open]')?.textContent?.includes('正在退出')) throw new Error('退出提示尚未绘制');
      return invoke(command, args);
    };
    harness.emitDesktopEvent('app-exit-started');
  });
  const exiting = page.getByRole('dialog', { name: '正在退出…', exact: true });
  await expect(exiting).toBeVisible();
  await expect(exiting.locator('.spin')).toHaveCSS('animation-name', 'spin');
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.commands)).toEqual(['exit_ui_ready']);
  await page.evaluate(() => {
    const harness = (window as HarnessWindow).runtimeHarness;
    harness.emitDesktopEvent('app-exit-started');
    harness.emitDesktopEvent('runtime-disconnected');
    harness.emitDesktopEvent('window-close-requested');
  });
  await page.keyboard.press('Escape');
  await expect(exiting).toBeVisible();
  await expect(exiting.getByRole('button')).toHaveCount(0);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.commands)).toEqual(['exit_ui_ready']);
});

test('close and exit dialogs fit light, dark and narrow windows', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '关闭 Maa Verge', exact: true });
  for (const [theme, width] of [['light', 1440], ['dark', 1280], ['dark', 390]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByLabel('界面主题', { exact: true }).selectOption(theme);
    await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`close-${theme}-${width}.png`) });
    await dialog.getByRole('button', { name: '取消关闭', exact: true }).click();
  }
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await dialog.getByRole('button', { name: '退出应用', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '正在退出…', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('exiting-dark-390.png') });
  expect(errors).toEqual([]);
});

test.describe('before the application snapshot is ready', () => {
  test.use({ runtimeHoldSnapshot: true });
  test('close choices and exiting remain available on the loading screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('正在连接本地应用服务…', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '关闭 Maa Verge', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '退出应用', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '正在退出…', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.commands)).toContain('exit_ui_ready');
  });
});

test.describe('macOS native close', () => {
  test.use({ runtimePlatform: 'macos' });
  test('native close opens the same choice dialog without custom window buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
    await page.evaluate(() => (window as HarnessWindow).runtimeHarness.emitDesktopEvent('window-close-requested'));
    const dialog = page.getByRole('dialog', { name: '关闭 Maa Verge', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name: /记住我的选择/ }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: '取消关闭', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: '退出应用', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '正在退出…', exact: true })).toBeVisible();
  });
});
