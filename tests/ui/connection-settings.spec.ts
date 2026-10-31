import type { Snapshot } from '@maaverge/contracts';
import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

type MaafwAdbWindow = HarnessWindow & {
  releaseMaafwAdbCheck: () => void;
  releaseMaafwAdbDownload: () => void;
};

async function openConnectionSettings(page: Page, device?: string) {
  const entry = device
    ? page.getByRole('article', { name: `设备：${device}`, exact: true })
    : page.locator('.sp-heading-actions');
  await entry.getByRole('button', { name: '连接设置', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '设备连接设置', exact: true })).toBeVisible();
}

async function trackMaafwAdbRequests(
  page: Page,
  options: {
    available?: boolean;
    coreInstalled?: boolean;
    failFirstCheck?: boolean;
    failFirstDownload?: boolean;
    holdCheck?: boolean;
    holdDownload?: boolean;
  } = {},
) {
  await page.evaluate(
    ({ available, coreInstalled, failFirstCheck, failFirstDownload, holdCheck, holdDownload }) => {
      const harness = (window as HarnessWindow).runtimeHarness;
      const call = harness.call;
      let failed = false;
      let checkFailed = false;
      const checkReady = new Promise<void>((resolve) => {
        (window as MaafwAdbWindow).releaseMaafwAdbCheck = resolve;
        if (!holdCheck) resolve();
      });
      const downloadReady = new Promise<void>((resolve) => {
        (window as MaafwAdbWindow).releaseMaafwAdbDownload = resolve;
        if (!holdDownload) resolve();
      });
      harness.call = async (method, params) => {
        if (method === 'updates.maafwAdb.status' || method === 'updates.maafwAdb.prepare')
          harness.commands.push(method);
        if (method === 'updates.maafwAdb.status') await checkReady;
        if (method === 'updates.maafwAdb.status' && failFirstCheck && !checkFailed) {
          checkFailed = true;
          throw new Error('合成运行时状态检查失败');
        }
        if (
          method === 'updates.maafwAdb.status' &&
          (available !== undefined || coreInstalled !== undefined)
        )
          return { available: available ?? false, coreInstalled: coreInstalled ?? true };
        if (method === 'updates.maafwAdb.prepare' && failFirstDownload && !failed) {
          failed = true;
          throw new Error('合成官方运行时下载失败');
        }
        if (method === 'updates.maafwAdb.prepare') await downloadReady;
        return call(method, params);
      };
    },
    options,
  );
}

async function maafwAdbRequests(page: Page) {
  return page.evaluate(() => {
    const harness = (window as HarnessWindow).runtimeHarness;
    return {
      checks: harness.commands.filter((method) => method === 'updates.maafwAdb.status').length,
      downloads: harness.commands.filter((method) => method === 'updates.maafwAdb.prepare').length,
      settingsWrites: harness.settingsWrites,
    };
  });
}

test('declining the missing MaaFwAdb runtime keeps the saved touch mode without downloading', async ({
  page,
}) => {
  await page.goto('/');
  await trackMaafwAdbRequests(page);
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  const touch = page.getByLabel('触控模式', { exact: true });
  await expect(touch).toHaveValue('maatouch');
  await touch.selectOption('MaaFwAdb');
  const prompt = page.getByRole('dialog', { name: '下载 MaaFwAdb 运行时', exact: true });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('本次下载使用官方源，不使用 Mirror酱');
  await expect(prompt).toContainText('空闲');
  await expect(touch).toHaveValue('maatouch');
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 0, settingsWrites: 0 });
  await prompt.getByRole('button', { name: '取消', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(touch).toHaveValue('maatouch');
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 0, settingsWrites: 0 });
  const snapshot = (await page.evaluate(() =>
    (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
  )) as Snapshot;
  expect(snapshot.settings.connection).toBeUndefined();
});

test('confirming the missing MaaFwAdb runtime downloads once before the selected mode can be saved', async ({
  page,
}) => {
  await page.goto('/');
  await trackMaafwAdbRequests(page);
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  await page.getByLabel('连接配置', { exact: true }).selectOption('AVD');
  const touch = page.getByLabel('触控模式', { exact: true });
  await touch.selectOption('MaaFwAdb');
  const prompt = page.getByRole('dialog', { name: '下载 MaaFwAdb 运行时', exact: true });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('本次下载使用官方源，不使用 Mirror酱');
  await expect(touch).toHaveValue('maatouch');
  await prompt.getByRole('button', { name: '下载并启用', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(touch).toHaveValue('MaaFwAdb');
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 1, settingsWrites: 0 });
  await page.getByRole('button', { name: '保存连接配置', exact: true }).click();
  await expect(page.locator('.sp-connection-form .sp-form-actions > .sp-help')).toHaveText(
    '已保存',
  );
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 1, settingsWrites: 1 });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  await expect(page.getByLabel('连接配置', { exact: true })).toHaveValue('AVD');
  await expect(touch).toHaveValue('MaaFwAdb');
  await expect(prompt).toHaveCount(0);
});

test('an installed MaaFwAdb runtime enables the touch mode without a download prompt', async ({
  page,
}) => {
  await page.goto('/');
  await trackMaafwAdbRequests(page, { available: true });
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  const touch = page.getByLabel('触控模式', { exact: true });
  await touch.selectOption('MaaFwAdb');
  await expect(touch).toHaveValue('MaaFwAdb');
  await expect(page.getByRole('dialog', { name: '下载 MaaFwAdb 运行时', exact: true })).toHaveCount(
    0,
  );
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 0, settingsWrites: 0 });
});

test('MaaFwAdb selection asks to install MaaCore first when no core is active', async ({
  page,
}) => {
  await page.goto('/');
  await trackMaafwAdbRequests(page, { coreInstalled: false });
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  const touch = page.getByLabel('触控模式', { exact: true });
  await touch.selectOption('MaaFwAdb');
  await expect(page.getByRole('alert')).toHaveText(
    '请先在「设置 → 更新」安装并启用 MaaCore，再选择 MaaFwAdb。',
  );
  await expect(touch).toHaveValue('maatouch');
  await expect(page.getByRole('dialog', { name: '下载 MaaFwAdb 运行时', exact: true })).toHaveCount(
    0,
  );
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 0, settingsWrites: 0 });
});

test('a failed MaaFwAdb status check preserves the original mode and allows another check', async ({
  page,
}) => {
  await page.goto('/');
  await trackMaafwAdbRequests(page, { failFirstCheck: true });
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  const touch = page.getByLabel('触控模式', { exact: true });
  await touch.selectOption('MaaFwAdb');
  await expect(page.getByRole('alert')).toHaveText('合成运行时状态检查失败');
  await expect(touch).toBeEnabled();
  await expect(touch).toHaveValue('maatouch');
  const prompt = page.getByRole('dialog', { name: '下载 MaaFwAdb 运行时', exact: true });
  await expect(prompt).toHaveCount(0);
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 0, settingsWrites: 0 });
  await touch.selectOption('MaaFwAdb');
  await expect(prompt).toBeVisible();
  expect(await maafwAdbRequests(page)).toEqual({ checks: 2, downloads: 0, settingsWrites: 0 });
  await prompt.getByRole('button', { name: '取消', exact: true }).click();
  await expect(touch).toHaveValue('maatouch');
});

test('discarding a draft while MaaFwAdb status is pending ignores the stale available result', async ({
  page,
}) => {
  await page.goto('/');
  await trackMaafwAdbRequests(page, { available: true, holdCheck: true });
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  const touch = page.getByLabel('触控模式', { exact: true });
  await touch.selectOption('minitouch');
  await touch.selectOption('MaaFwAdb');
  await expect(touch).toBeDisabled();
  await page
    .locator('.sp-connection-form')
    .getByRole('button', { name: '放弃修改', exact: true })
    .click();
  await expect(touch).toHaveValue('maatouch');
  await page.evaluate(() => (window as MaafwAdbWindow).releaseMaafwAdbCheck());
  await expect(touch).toBeEnabled();
  await expect(touch).toHaveValue('maatouch');
  await expect(page.getByRole('dialog', { name: '下载 MaaFwAdb 运行时', exact: true })).toHaveCount(
    0,
  );
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 0, settingsWrites: 0 });
});

test('a failed MaaFwAdb runtime download preserves the original mode and can be retried', async ({
  page,
}) => {
  await page.goto('/');
  await trackMaafwAdbRequests(page, { failFirstDownload: true });
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  const touch = page.getByLabel('触控模式', { exact: true });
  await touch.selectOption('minitouch');
  await page.getByRole('button', { name: '保存连接配置', exact: true }).click();
  await expect(page.locator('.sp-connection-form .sp-form-actions > .sp-help')).toHaveText(
    '已保存',
  );
  await touch.selectOption('MaaFwAdb');
  const prompt = page.getByRole('dialog', { name: '下载 MaaFwAdb 运行时', exact: true });
  await prompt.getByRole('button', { name: '下载并启用', exact: true }).click();
  await expect(prompt).toContainText('合成官方运行时下载失败');
  await expect(touch).toHaveValue('minitouch');
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 1, settingsWrites: 1 });
  const snapshot = (await page.evaluate(() =>
    (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
  )) as Snapshot;
  expect(snapshot.settings.connection?.touchMode).toBe('minitouch');
  await prompt.getByRole('button', { name: '下载并启用', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(touch).toHaveValue('MaaFwAdb');
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 2, settingsWrites: 1 });
});

test('a MaaFwAdb runtime download disables duplicate confirmation and waits before changing the mode', async ({
  page,
}) => {
  await page.goto('/');
  await trackMaafwAdbRequests(page, { holdDownload: true });
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  const touch = page.getByLabel('触控模式', { exact: true });
  await touch.selectOption('MaaFwAdb');
  const prompt = page.getByRole('dialog', { name: '下载 MaaFwAdb 运行时', exact: true });
  await prompt.getByRole('button', { name: '下载并启用', exact: true }).click();
  await expect
    .poll(() => maafwAdbRequests(page))
    .toEqual({
      checks: 1,
      downloads: 1,
      settingsWrites: 0,
    });
  await expect(prompt.getByRole('button', { name: '正在下载…', exact: true })).toBeDisabled();
  await expect(prompt.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
  await expect(
    prompt.getByRole('button', { name: '关闭下载 MaaFwAdb 运行时', exact: true }),
  ).toBeDisabled();
  await expect(touch).toBeDisabled();
  await expect(touch).toHaveValue('maatouch');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(prompt).toBeVisible();
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 1, settingsWrites: 0 });
  await page.evaluate(() => (window as MaafwAdbWindow).releaseMaafwAdbDownload());
  await expect(prompt).toHaveCount(0);
  await expect(touch).toBeEnabled();
  await expect(touch).toHaveValue('MaaFwAdb');
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 1, settingsWrites: 0 });
});

test('MaaFwAdb runtime confirmation also protects an independent multi-instance profile', async ({
  page,
}) => {
  await page.goto('/');
  await trackMaafwAdbRequests(page);
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: /^多开管理/ }).click();
  await page.getByRole('button', { name: '添加多开实例', exact: true }).click();
  const editor = page.getByRole('form', { name: '多开实例配置', exact: true });
  await editor.getByLabel('实例名称', { exact: true }).fill('合成 MODAVD');
  await editor.getByLabel('连接地址', { exact: true }).fill('127.0.0.1:20001');
  await editor.getByLabel('连接配置', { exact: true }).selectOption('AVD');
  const touch = editor.getByLabel('触控模式', { exact: true });
  await touch.selectOption('MaaFwAdb');
  const prompt = page.getByRole('dialog', { name: '下载 MaaFwAdb 运行时', exact: true });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('本次下载使用官方源，不使用 Mirror酱');
  await prompt.getByRole('button', { name: '取消', exact: true }).click();
  await expect(touch).toHaveValue('maatouch');
  expect(await maafwAdbRequests(page)).toEqual({ checks: 1, downloads: 0, settingsWrites: 0 });
  await touch.selectOption('MaaFwAdb');
  await prompt.getByRole('button', { name: '下载并启用', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(touch).toHaveValue('MaaFwAdb');
  await editor.getByRole('button', { name: '保存实例配置', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(await maafwAdbRequests(page)).toEqual({ checks: 2, downloads: 1, settingsWrites: 1 });
  const snapshot = (await page.evaluate(() =>
    (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
  )) as Snapshot;
  expect(snapshot.settings.connection).toBeUndefined();
  expect(snapshot.settings.deviceProfiles).toHaveLength(1);
  expect(snapshot.settings.deviceProfiles?.[0]).toMatchObject({
    name: '合成 MODAVD',
    connection: { config: 'AVD', touchMode: 'MaaFwAdb' },
  });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: /^多开管理/ }).click();
  await page
    .getByRole('article', { name: '多开实例：合成 MODAVD', exact: true })
    .getByRole('button', { name: '编辑实例', exact: true })
    .click();
  await expect(touch).toHaveValue('MaaFwAdb');
});

test(
  'shared connection settings persist native profile, ADB, touch and bridge preferences',
  { tag: '@smoke' },
  async ({ page }) => {
    await page.goto('/');
    await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
    await openConnectionSettings(page);
    await page.getByLabel('连接配置', { exact: true }).selectOption('MuMuEmulator12');
    await page.getByLabel('ADB 路径', { exact: true }).fill('C:\\synthetic\\adb.exe');
    await page.getByLabel('连接地址', { exact: true }).fill('192.168.1.22:5555');
    await page.getByLabel('触控模式', { exact: true }).selectOption('maatouch');
    await page.getByRole('checkbox', { name: '启用 ADB Lite', exact: true }).check();
    await page.getByRole('button', { name: '保存连接配置', exact: true }).click();
    await expect(page.locator('.sp-connection-form .sp-form-actions > .sp-help')).toHaveText(
      '已保存',
    );
    await page.getByLabel('截图协议', { exact: true }).selectOption('mumu');
    await page.getByLabel('模拟器安装目录', { exact: true }).fill('C:\\synthetic\\MuMu');
    await page.getByLabel('模拟器实例索引', { exact: true }).fill('2');
    await page.getByRole('checkbox', { name: '启用 MuMu 触控增强（实验性）', exact: true }).check();
    await page.getByRole('checkbox', { name: 'MuMu 网络桥接模式', exact: true }).check();
    await page.getByRole('button', { name: '保存截图配置', exact: true }).click();
    await expect(page.locator('.sp-capture-form .sp-form-actions > .sp-help')).toHaveText('已保存');
    await page.reload();
    await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
    await openConnectionSettings(page);
    await expect(page.getByLabel('连接配置', { exact: true })).toHaveValue('MuMuEmulator12');
    await expect(page.getByLabel('ADB 路径', { exact: true })).toHaveValue(
      'C:\\synthetic\\adb.exe',
    );
    await expect(page.getByLabel('触控模式', { exact: true })).toHaveValue('maatouch');
    await expect(page.getByRole('checkbox', { name: '启用 ADB Lite', exact: true })).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: 'MuMu 网络桥接模式', exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: '启用 MuMu 触控增强（实验性）', exact: true }),
    ).toBeChecked();
    await expect(
      page.getByText('核心在接口不可用时可能回退 Minitouch。', { exact: false }),
    ).toBeVisible();
  },
);

test('screenshot test reads a single actual connected frame through typed transport', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page, '本地模拟设备');
  await page.getByRole('button', { name: '截图测试', exact: true }).click();
  await expect(page.getByRole('img', { name: '连接截图测试结果', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '截图成功' })).toContainText('耗时');
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames)).toEqual([
    'mock-device-1',
  ]);
});

test('automatic capture is the default and manual ADB remains an explicit saved choice', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  const protocol = page.getByLabel('截图协议', { exact: true });
  const save = page.getByRole('button', { name: '保存截图配置', exact: true });
  await expect(protocol).toHaveValue('auto');
  await protocol.selectOption('adb');
  await save.click();
  await expect(page.locator('.sp-capture-form .sp-form-actions > .sp-help')).toHaveText('已保存');
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  await expect(protocol).toHaveValue('adb');
  await protocol.selectOption('mumu');
  await page.getByLabel('模拟器安装目录', { exact: true }).fill('C:\\synthetic\\MuMu');
  await page.getByRole('checkbox', { name: '启用 MuMu 触控增强（实验性）', exact: true }).check();
  await page.getByRole('checkbox', { name: 'MuMu 网络桥接模式', exact: true }).check();
  await protocol.selectOption('auto');
  await expect(page.getByLabel('模拟器安装目录', { exact: true })).toHaveCount(0);
  await save.click();
  await expect(page.locator('.sp-capture-form .sp-form-actions > .sp-help')).toHaveText('已保存');
  const snapshot = (await page.evaluate(() =>
    (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
  )) as Snapshot;
  expect(snapshot.settings.capture).toMatchObject({
    method: 'adb',
    autoDetect: true,
    mumuTouch: false,
    mumuBridge: false,
  });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  await expect(protocol).toHaveValue('auto');
});

test('automatically identified capture details are read only while legacy enhanced settings remain manual', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await harness.call('app.snapshot', {})) as Snapshot;
    await harness.call('settings.save', {
      settings: {
        ...snapshot.settings,
        capture: {
          method: 'mumu',
          autoDetect: true,
          emulatorPath: 'C:\\synthetic\\MuMu',
          instanceIndex: 32,
        },
      },
    });
  });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  const protocol = page.getByLabel('截图协议', { exact: true });
  const directory = page.getByLabel('模拟器安装目录', { exact: true });
  const index = page.getByLabel('模拟器实例索引', { exact: true });
  await expect(protocol).toHaveValue('auto');
  await expect(page.getByText('已自动识别：MuMu 增强截图。', { exact: false })).toBeVisible();
  await expect(directory).toHaveValue('C:\\synthetic\\MuMu');
  await expect(directory).toHaveAttribute('readonly', '');
  await expect(index).toHaveValue('32');
  await expect(index).toHaveAttribute('readonly', '');
  expect(await directory.evaluate((input: HTMLInputElement) => input.required)).toBe(false);
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await harness.call('app.snapshot', {})) as Snapshot;
    await harness.call('settings.save', {
      settings: {
        ...snapshot.settings,
        capture: { method: 'ldplayer', emulatorPath: 'C:\\synthetic\\LDPlayer', instanceIndex: 3 },
      },
    });
  });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  await expect(protocol).toHaveValue('ldplayer');
  await expect(directory).toBeEditable();
  await expect(index).toBeEditable();
});
