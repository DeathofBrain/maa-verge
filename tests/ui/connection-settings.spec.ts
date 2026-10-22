import { expect, test } from './fixtures/desktop';

test('shared connection settings persist native profile, ADB, touch and bridge preferences', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
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
  await page.getByRole('button', { name: '截图测试', exact: true }).click();
  await expect(page.getByRole('img', { name: '连接截图测试结果', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '截图成功' })).toContainText('耗时');
});
