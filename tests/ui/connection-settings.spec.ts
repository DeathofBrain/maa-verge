import type { Snapshot } from '@maaverge/contracts';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

test('shared connection settings persist native profile, ADB, touch and bridge preferences', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: '连接设置', exact: true }).click();
  await page.getByLabel('连接配置', { exact: true }).selectOption('MuMuEmulator12');
  await page.getByLabel('ADB 路径', { exact: true }).fill('C:\\synthetic\\adb.exe');
  await page.getByLabel('连接地址', { exact: true }).fill('192.168.1.22:5555');
  await page.getByLabel('触控模式', { exact: true }).selectOption('maatouch');
  await page.getByRole('checkbox', { name: '启用 ADB Lite', exact: true }).check();
  await page.getByRole('button', { name: '保存连接配置', exact: true }).click();
  await page.getByLabel('截图协议', { exact: true }).selectOption('mumu');
  await page.getByLabel('模拟器安装目录', { exact: true }).fill('C:\\synthetic\\MuMu');
  await page.getByLabel('模拟器实例索引', { exact: true }).fill('2');
  await page.getByRole('checkbox', { name: '启用 MuMu 触控增强（实验性）', exact: true }).check();
  await page.getByRole('checkbox', { name: 'MuMu 网络桥接模式', exact: true }).check();
  await page.getByRole('button', { name: '保存截图配置', exact: true }).click();
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: '连接设置', exact: true }).click();
  await expect(page.getByLabel('连接配置', { exact: true })).toHaveValue('MuMuEmulator12');
  await expect(page.getByLabel('ADB 路径', { exact: true })).toHaveValue('C:\\synthetic\\adb.exe');
  await expect(page.getByLabel('触控模式', { exact: true })).toHaveValue('maatouch');
  await expect(page.getByRole('checkbox', { name: '启用 ADB Lite', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'MuMu 网络桥接模式', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '启用 MuMu 触控增强（实验性）', exact: true })).toBeChecked();
  await expect(page.getByText('核心在接口不可用时可能回退 Minitouch。', { exact: false })).toBeVisible();
});

test('screenshot test reads a single actual connected frame through typed transport', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: '连接设置', exact: true }).click();
  await page.getByRole('button', { name: '截图测试', exact: true }).click();
  await expect(page.getByRole('img', { name: '连接截图测试结果', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '截图成功' })).toContainText('耗时');
});

test('automatic capture is the default and manual ADB remains an explicit saved choice', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: '连接设置', exact: true }).click();
  const protocol = page.getByLabel('截图协议', { exact: true });
  const save = page.getByRole('button', { name: '保存截图配置', exact: true });
  await expect(protocol).toHaveValue('auto');
  await protocol.selectOption('adb');
  await save.click();
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: '连接设置', exact: true }).click();
  await expect(protocol).toHaveValue('adb');
  await protocol.selectOption('mumu');
  await page.getByLabel('模拟器安装目录', { exact: true }).fill('C:\\synthetic\\MuMu');
  await page.getByRole('checkbox', { name: '启用 MuMu 触控增强（实验性）', exact: true }).check();
  await page.getByRole('checkbox', { name: 'MuMu 网络桥接模式', exact: true }).check();
  await protocol.selectOption('auto');
  await expect(page.getByLabel('模拟器安装目录', { exact: true })).toHaveCount(0);
  await save.click();
  const snapshot = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot;
  expect(snapshot.settings.capture).toMatchObject({ method: 'adb', autoDetect: true, mumuTouch: false, mumuBridge: false });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: '连接设置', exact: true }).click();
  await expect(protocol).toHaveValue('auto');
});

test('automatically identified capture details are read only while legacy enhanced settings remain manual', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = await harness.call('app.snapshot', {}) as Snapshot;
    await harness.call('settings.save', { settings: { ...snapshot.settings, capture: { method: 'mumu', autoDetect: true, emulatorPath: 'C:\\synthetic\\MuMu', instanceIndex: 32 } } });
  });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: '连接设置', exact: true }).click();
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
    const snapshot = await harness.call('app.snapshot', {}) as Snapshot;
    await harness.call('settings.save', { settings: { ...snapshot.settings, capture: { method: 'ldplayer', emulatorPath: 'C:\\synthetic\\LDPlayer', instanceIndex: 3 } } });
  });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: '连接设置', exact: true }).click();
  await expect(protocol).toHaveValue('ldplayer');
  await expect(directory).toBeEditable();
  await expect(index).toBeEditable();
});
