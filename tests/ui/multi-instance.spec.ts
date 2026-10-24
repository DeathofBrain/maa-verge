import type { Snapshot } from '@maaverge/contracts';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

test('multi-instance profiles keep independent capture and connection fields across edits and reloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: /^多开管理/ }).click();
  const editor = page.getByRole('form', { name: '多开实例配置', exact: true });
  for (const [name, address, index, touch] of [
    ['日常实例', '127.0.0.1:16384', '0', 'minitouch'],
    ['小号实例', '127.0.0.1:16416', '1', 'maatouch'],
  ]) {
    await page.getByRole('button', { name: '添加多开实例', exact: true }).click();
    await editor.getByLabel('实例名称', { exact: true }).fill(name);
    await editor.getByLabel('连接地址', { exact: true }).fill(address);
    await editor.getByLabel('ADB 路径', { exact: true }).fill(`C:\\synthetic\\${index}\\adb.exe`);
    await editor.getByLabel('连接配置', { exact: true }).selectOption('MuMuEmulator12');
    await editor.getByLabel('触控模式', { exact: true }).selectOption(touch);
    await editor.getByLabel('截图协议', { exact: true }).selectOption('mumu');
    await editor.getByLabel('模拟器安装目录', { exact: true }).fill('C:\\synthetic\\MuMu');
    await editor.getByLabel('模拟器实例索引', { exact: true }).fill(index);
    await editor.getByRole('button', { name: '保存实例配置', exact: true }).click();
    await expect(editor).toHaveCount(0);
  }
  const first = page.getByRole('article', { name: '多开实例：日常实例', exact: true });
  const second = page.getByRole('article', { name: '多开实例：小号实例', exact: true });
  await expect(first).toContainText('实例 0');
  await expect(second).toContainText('实例 1');
  await second.getByRole('button', { name: '编辑实例', exact: true }).click();
  await expect(editor.getByLabel('触控模式', { exact: true })).toHaveValue('maatouch');
  await editor.getByLabel('模拟器实例索引', { exact: true }).fill('2');
  await editor.getByRole('button', { name: '保存实例配置', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: /^多开管理/ }).click();
  await expect(first).toContainText('实例 0');
  await expect(second).toContainText('实例 2');
  await first.getByRole('button', { name: '编辑实例', exact: true }).click();
  await expect(editor.getByLabel('ADB 路径', { exact: true })).toHaveValue('C:\\synthetic\\0\\adb.exe');
  await expect(editor.getByLabel('触控模式', { exact: true })).toHaveValue('minitouch');
  await editor.getByRole('button', { name: '取消编辑', exact: true }).click();
  const snapshot = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as { settings: { capture: { method: string }; deviceProfiles: unknown[] } };
  expect(snapshot.settings.capture.method).toBe('adb');
  expect(snapshot.settings.deviceProfiles).toHaveLength(2);
});

test('duplicate device aliases are rejected and a connected instance must disconnect before deletion', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: /^多开管理/ }).click();
  const editor = page.getByRole('form', { name: '多开实例配置', exact: true });
  await page.getByRole('button', { name: '添加多开实例', exact: true }).click();
  await editor.getByLabel('实例名称', { exact: true }).fill('第二实例');
  await editor.getByLabel('连接地址', { exact: true }).fill('127.0.0.1:5557');
  await editor.getByRole('button', { name: '保存实例配置', exact: true }).click();
  const card = page.getByRole('article', { name: '多开实例：第二实例', exact: true });
  await expect(card).toContainText('未连接');
  await page.getByRole('button', { name: '添加多开实例', exact: true }).click();
  await editor.getByLabel('连接地址', { exact: true }).fill('emulator-5556');
  await editor.getByRole('button', { name: '保存实例配置', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('同一设备只能配置一个控制实例');
  await editor.getByRole('button', { name: '取消编辑', exact: true }).click();
  await expect(page.getByRole('article', { name: /^多开实例：/ })).toHaveCount(1);
  await card.getByRole('button', { name: '连接实例', exact: true }).click();
  await expect(card).toContainText('已连接');
  await expect(card.getByRole('button', { name: '删除实例', exact: true })).toBeDisabled();
  await card.getByRole('button', { name: '断开实例', exact: true }).click();
  await expect(card.getByRole('button', { name: '删除实例', exact: true })).toBeEnabled();
  await card.getByRole('button', { name: '删除实例', exact: true }).click();
  await expect(card).toHaveCount(0);
});

test('automatic multi-instance capture shows each detected type and user edits only change the selected profile', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = await harness.call('app.snapshot', {}) as Snapshot;
    const connection = { adbPath: '', address: '', config: 'General' as const, touchMode: 'minitouch' as const, adbLite: false, clientType: 'Official' as const };
    await harness.call('settings.save', { settings: { ...snapshot.settings, deviceProfiles: [
      { id: 'mumu-auto', autoDetected: true, name: '自动 MuMu', address: '127.0.0.1:16388', connection: { ...connection, address: '127.0.0.1:16388' }, capture: { method: 'mumu', autoDetect: true, emulatorPath: 'C:\\synthetic\\MuMu', instanceIndex: 32 } },
      { id: 'ld-auto', autoDetected: true, name: '自动雷电', address: '127.0.0.1:5559', connection: { ...connection, address: '127.0.0.1:5559' }, capture: { method: 'ldplayer', autoDetect: true, emulatorPath: 'C:\\synthetic\\LDPlayer', instanceIndex: 2 } },
    ] } });
  });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: /^多开管理/ }).click();
  const mumu = page.getByRole('article', { name: '多开实例：自动 MuMu', exact: true });
  const ldplayer = page.getByRole('article', { name: '多开实例：自动雷电', exact: true });
  await expect(mumu).toContainText('自动 · MuMu 增强截图 · 实例 32');
  await expect(ldplayer).toContainText('自动 · 雷电 增强截图 · 实例 2');
  await expect(mumu).toContainText('自动发现');
  await ldplayer.getByRole('button', { name: '编辑实例', exact: true }).click();
  const editor = page.getByRole('form', { name: '多开实例配置', exact: true });
  await expect(editor.getByLabel('截图协议', { exact: true })).toHaveValue('auto');
  await expect(editor.getByLabel('模拟器安装目录', { exact: true })).toHaveAttribute('readonly', '');
  await expect(editor.getByLabel('模拟器实例索引', { exact: true })).toHaveValue('2');
  await editor.getByLabel('截图协议', { exact: true }).selectOption('ldplayer');
  await expect(editor.getByLabel('模拟器安装目录', { exact: true })).toBeEditable();
  await editor.getByRole('button', { name: '保存实例配置', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(ldplayer).not.toContainText('自动发现');
  const snapshot = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot;
  expect(snapshot.settings.deviceProfiles?.[0]).toMatchObject({ autoDetected: true, capture: { method: 'mumu', autoDetect: true, instanceIndex: 32 } });
  expect(snapshot.settings.deviceProfiles?.[1]).toMatchObject({ autoDetected: false, capture: { method: 'ldplayer', autoDetect: false, instanceIndex: 2 } });
});

test('stored instance failures show a readable device authorization reason', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const original = harness.call;
    const state = await original('app.snapshot', {}) as Snapshot;
    await original('settings.save', { settings: { ...state.settings, deviceProfiles: [{
      id: 'authorization-test', name: '未授权实例', address: '127.0.0.1:5555',
      connection: { adbPath: 'adb', address: '127.0.0.1:5555', config: 'General', touchMode: 'maatouch', clientType: 'Official' },
      capture: { method: 'adb', emulatorPath: '', instanceIndex: 0 },
    }] } });
    harness.call = async (method, params) => {
      const result = await original(method, params);
      if (method === 'app.snapshot') (result as Snapshot).devices = (result as Snapshot).devices.map(device => ({
        ...device, state: 'offline', connectionProfileId: 'authorization-test', connectionError: 'Error: device unauthorized',
      }));
      return result;
    };
    await original('settings.save', { settings: (await original('app.snapshot', {}) as Snapshot).settings });
  });
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: /^多开管理/ }).click();
  const instance = page.getByRole('article', { name: '多开实例：未授权实例', exact: true });
  await expect(instance.getByRole('alert')).toContainText('设备尚未授权 ADB 调试');
  await expect(instance.getByRole('alert')).toContainText('确认调试授权后重试');
  await expect(instance.getByRole('button', { name: '连接实例', exact: true })).toBeEnabled();
});
