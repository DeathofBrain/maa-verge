import type { Snapshot } from '@maaverge/contracts';
import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

async function openConnectionSettings(page: Page, device?: string) {
  const entry = device
    ? page.getByRole('article', { name: `设备：${device}`, exact: true })
    : page.locator('.sp-heading-actions');
  await entry.getByRole('button', { name: '连接设置', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '设备连接设置', exact: true })).toBeVisible();
}

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

test('MaaFramework capture and all supported touch modes remain independent and persist', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  const framework = page.getByRole('group', { name: 'MaaFramework 连接设置', exact: true });
  const touch = framework.getByLabel('MaaFramework 触控模式', { exact: true });
  const capture = framework.getByLabel('MaaFramework 截图增强', { exact: true });
  await expect(touch).toHaveValue('maatouch');
  await expect(capture).toHaveValue('auto');
  expect(
    await touch.locator('option').evaluateAll((options) => options.map((option) => option.value)),
  ).toEqual(['maatouch', 'minitouch', 'adb', 'emulator-extras']);
  expect(
    await capture.locator('option').evaluateAll((options) => options.map((option) => option.value)),
  ).toEqual(['auto', 'adb', 'mumu', 'ldplayer', 'avd']);
  await touch.selectOption('emulator-extras');
  const touchDirectory = framework.getByLabel('MaaFramework 触控模拟器安装目录', { exact: true });
  const touchIndex = framework.getByLabel('MaaFramework 触控模拟器实例索引', { exact: true });
  await touchDirectory.fill('C:\\synthetic\\MuMu');
  await touchIndex.fill('2');
  for (const method of ['mumu', 'ldplayer', 'avd', 'adb', 'auto']) {
    await capture.selectOption(method);
    await expect(touch).toHaveValue('emulator-extras');
    await expect(touchDirectory).toHaveValue('C:\\synthetic\\MuMu');
    await expect(touchIndex).toHaveValue('2');
  }
  await capture.selectOption('avd');
  for (const mode of ['maatouch', 'adb', 'minitouch']) {
    await touch.selectOption(mode);
    await expect(capture).toHaveValue('avd');
  }
  await page.getByRole('button', { name: '保存连接配置', exact: true }).click();
  await expect(page.locator('.sp-connection-form .sp-form-actions > .sp-help')).toHaveText(
    '已保存',
  );
  const snapshot = (await page.evaluate(() =>
    (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
  )) as Snapshot;
  expect(snapshot.settings.connection).toMatchObject({
    touchMode: 'maatouch',
    framework: {
      touchMode: 'minitouch',
      capture: { method: 'avd', emulatorPath: '', instanceIndex: 0 },
      touchExtras: { emulatorPath: 'C:\\synthetic\\MuMu', instanceIndex: 2 },
    },
  });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await openConnectionSettings(page);
  await expect(touch).toHaveValue('minitouch');
  await expect(capture).toHaveValue('avd');
  await touch.selectOption('emulator-extras');
  await expect(touchDirectory).toHaveValue('C:\\synthetic\\MuMu');
  await expect(touchIndex).toHaveValue('2');
});

test('MaaFramework defaults and manual capture settings stay isolated between instances', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: /^多开管理/ }).click();
  await page.getByRole('button', { name: '添加多开实例', exact: true }).click();
  const editor = page.getByRole('form', { name: '多开实例配置', exact: true });
  const framework = editor.getByRole('group', { name: 'MaaFramework 连接设置', exact: true });
  const touch = framework.getByLabel('MaaFramework 触控模式', { exact: true });
  const capture = framework.getByLabel('MaaFramework 截图增强', { exact: true });
  await editor.getByLabel('实例名称', { exact: true }).fill('合成 Framework 雷电');
  await editor.getByLabel('连接地址', { exact: true }).fill('127.0.0.1:5557');
  await expect(touch).toHaveValue('maatouch');
  await expect(capture).toHaveValue('auto');
  await touch.selectOption('adb');
  await capture.selectOption('ldplayer');
  await framework
    .getByLabel('MaaFramework 截图模拟器安装目录', { exact: true })
    .fill('C:\\synthetic\\LDPlayer');
  await framework.getByLabel('MaaFramework 截图模拟器实例索引', { exact: true }).fill('1');
  await editor.getByRole('button', { name: '保存实例配置', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', { name: '添加多开实例', exact: true }).click();
  await expect(touch).toHaveValue('maatouch');
  await expect(capture).toHaveValue('auto');
  await editor.getByLabel('实例名称', { exact: true }).fill('合成 Framework AVD');
  await editor.getByLabel('连接地址', { exact: true }).fill('emulator-20000');
  await capture.selectOption('avd');
  await expect(touch).toHaveValue('maatouch');
  await editor.getByRole('button', { name: '保存实例配置', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const snapshot = (await page.evaluate(() =>
    (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
  )) as Snapshot;
  expect(snapshot.settings.connection?.framework).toBeUndefined();
  expect(snapshot.settings.deviceProfiles?.map((profile) => profile.connection.framework)).toEqual([
    {
      touchMode: 'adb',
      capture: { method: 'ldplayer', emulatorPath: 'C:\\synthetic\\LDPlayer', instanceIndex: 1 },
    },
    { touchMode: 'maatouch', capture: { method: 'avd', emulatorPath: '', instanceIndex: 0 } },
  ]);
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: /^多开管理/ }).click();
  await page
    .getByRole('article', { name: '多开实例：合成 Framework 雷电', exact: true })
    .getByRole('button', { name: '编辑实例', exact: true })
    .click();
  await expect(touch).toHaveValue('adb');
  await expect(capture).toHaveValue('ldplayer');
  await expect(
    framework.getByLabel('MaaFramework 截图模拟器安装目录', { exact: true }),
  ).toHaveValue('C:\\synthetic\\LDPlayer');
});
