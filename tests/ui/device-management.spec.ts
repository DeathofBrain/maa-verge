import type { Snapshot } from '@maaverge/contracts';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

test('disconnected history stays separate and a discovered device can become an independent instance', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('button', { name: '断开设备', exact: true }).click();
  const current = page.getByRole('region', { name: '已连接设备', exact: true });
  await expect(current).toContainText('尚未连接设备');
  await expect(current.getByRole('article')).toHaveCount(0);
  await expect(page.locator('.dp-history')).not.toHaveAttribute('open');
  await expect(page.locator('.dp-history .sp-device-item')).not.toBeVisible();
  await expect(page.getByRole('tab', { name: /^当前设备\s*0$/ })).toBeVisible();
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  const discovery = page.getByRole('region', { name: '本次发现', exact: true });
  await expect(discovery).toContainText('可连接');
  await expect(discovery.getByRole('button', { name: '连接', exact: true })).toBeEnabled();
  await discovery.getByRole('button', { name: '保存为多开实例', exact: true }).click();
  const editor = page.getByRole('form', { name: '多开实例配置', exact: true });
  await expect(editor.getByLabel('连接地址', { exact: true })).toHaveValue('127.0.0.1:5555');
  await expect(editor.getByLabel('截图协议', { exact: true })).toHaveValue('auto');
  await editor.getByLabel('实例名称', { exact: true }).fill('主账号模拟器');
  await editor.getByRole('button', { name: '保存实例配置', exact: true }).click();
  await expect(page.getByRole('article', { name: '多开实例：主账号模拟器', exact: true })).toContainText('未连接');
  await page.getByRole('tab', { name: '连接设置', exact: true }).click();
  await expect(page.getByText('已启用手动实例清单', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: /^当前设备/ }).click();
  await expect(page.getByRole('button', { name: '连接已保存实例', exact: true })).toBeVisible();
});

test('editing detected profiles through connection or capture settings consistently makes them manual', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = await harness.call('app.snapshot', {}) as Snapshot;
    const connection = { adbPath: '', address: '', config: 'General' as const, touchMode: 'minitouch' as const, adbLite: false, clientType: 'Official' as const };
    await harness.call('settings.save', { settings: { ...snapshot.settings, deviceProfiles: ['first', 'second'].map((id, index) => ({ id, name: id, autoDetected: true, address: `127.0.0.1:${5555 + index * 2}`, connection: { ...connection, address: `127.0.0.1:${5555 + index * 2}` }, capture: { method: 'adb', autoDetect: true, emulatorPath: '', instanceIndex: index } })) } });
  });
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: '连接设置', exact: true }).click();
  await page.getByLabel('编辑设备连接配置', { exact: true }).selectOption('first');
  await page.getByLabel('触控模式', { exact: true }).selectOption('maatouch');
  await page.getByRole('button', { name: '保存连接配置', exact: true }).click();
  await expect(page.locator('.sp-connection-form .sp-form-actions > .sp-help')).toHaveText('已保存');
  let snapshot = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot;
  expect(snapshot.settings.deviceProfiles?.[0]).toMatchObject({ autoDetected: false, connection: { touchMode: 'maatouch' } });
  expect(snapshot.settings.deviceProfiles?.[1].autoDetected).toBe(true);
  expect(snapshot.settings.connection).toBeUndefined();
  await page.getByLabel('编辑设备连接配置', { exact: true }).selectOption('second');
  await page.getByLabel('截图协议', { exact: true }).selectOption('adb');
  await page.getByRole('button', { name: '保存截图配置', exact: true }).click();
  await expect(page.locator('.sp-capture-form .sp-form-actions > .sp-help')).toHaveText('已保存');
  snapshot = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot;
  expect(snapshot.settings.deviceProfiles?.[1]).toMatchObject({ autoDetected: false, capture: { autoDetect: false } });
  expect(snapshot.settings.capture?.method).toBe('adb');
  await page.getByRole('button', { name: '截图测试', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '请先连接需要测试的设备' })).toBeVisible();
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames)).toHaveLength(0);
});

test('StartUp keeps game actions local and opens its bound device settings without losing the draft', async ({ page }) => {
  await page.goto('/');
  const savedSettings = await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = await harness.call('app.snapshot', {}) as Snapshot;
    await harness.call('device.connect', { address: '127.0.0.1:5557' });
    const connection = { adbPath: '', address: '127.0.0.1:5555', config: 'General' as const, touchMode: 'minitouch' as const, adbLite: false, clientType: 'Official' as const };
    const settings = { ...snapshot.settings, deviceProfiles: [{ id: 'bound', name: '绑定实例', autoDetected: true, address: connection.address, connection, capture: { method: 'adb', autoDetect: true, emulatorPath: '', instanceIndex: 0 } }] };
    await harness.call('settings.save', { settings });
    await harness.call('plan.save', { plan: { ...snapshot.plans[0], deviceId: snapshot.devices[0].id } });
    return settings;
  });
  await page.getByLabel('选择设备', { exact: true }).selectOption('mock-device-' + encodeURIComponent('127.0.0.1:5557'));
  await page.locator('.sidebar').getByRole('button', { name: '任务表', exact: true }).click();
  await page.getByRole('button', { name: '配置任务表每日长草计划', exact: true }).click();
  const wb = page.getByRole('region', { name: '任务表工作台', exact: true });
  await wb.getByRole('button', { name: /^设置第 1 条/ }).click();
  await expect(wb.getByLabel('ADB 路径', { exact: true })).toHaveCount(0);
  await expect(wb.getByLabel('截图协议', { exact: true })).toHaveCount(0);
  await expect(wb).toContainText('本表绑定设备：本地模拟设备');
  await wb.getByLabel('游戏客户端', { exact: true }).selectOption('YoStarJP');
  await wb.getByRole('button', { name: '管理设备连接', exact: true }).click();
  await expect(page.getByRole('tab', { name: '连接设置', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('编辑设备连接配置', { exact: true })).toHaveValue('bound');
  await expect(page.getByRole('region', { name: '所选设备详情', exact: true })).toContainText('127.0.0.1:5555');
  const snapshot = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot;
  expect(snapshot.settings).toEqual(savedSettings);
  await page.locator('.sidebar').getByRole('button', { name: '任务表', exact: true }).click();
  await expect(wb.getByLabel('游戏客户端', { exact: true })).toHaveValue('YoStarJP');
  await expect(wb.locator('.wb-save-state')).toHaveText('已保存');
});

test('device and instance pages fit desktop, dark mode and a narrow window', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = await harness.call('app.snapshot', {}) as Snapshot;
    const connection = { adbPath: '', address: '', config: 'General' as const, touchMode: 'minitouch' as const, adbLite: false, clientType: 'Official' as const };
    await harness.call('settings.save', { settings: { ...snapshot.settings, deviceProfiles: ['主账号', '小号日常'].map((name, index) => ({ id: `visual-${index}`, name, address: `127.0.0.1:${5555 + index * 2}`, connection: { ...connection, address: `127.0.0.1:${5555 + index * 2}` }, capture: { method: 'adb', autoDetect: true, emulatorPath: '', instanceIndex: index } })) } });
  });
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('button', { name: '发现设备', exact: true }).click();
  for (const [theme, width] of [['light', 1440], ['dark', 1280], ['light', 390]] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width, height: 1000 });
    for (const tab of ['current', 'instances', 'settings']) {
      await page.locator(`#dp-tab-${tab}`).click();
      expect(await page.locator('.dp-page').evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}-${tab}.png`) });
    }
  }
  expect(errors).toEqual([]);
});

test('an instance reconnecting at a new address uses the live device while preserving old history', async ({ page }) => {
  await page.goto('/');
  const liveId = await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = await harness.call('app.snapshot', {}) as Snapshot;
    const profile = { id: 'moved', name: '迁移端口实例', address: '127.0.0.1:5555', connection: { adbPath: '', address: '127.0.0.1:5555', config: 'General', touchMode: 'minitouch', adbLite: false, clientType: 'Official' }, capture: { method: 'adb', autoDetect: true, emulatorPath: '', instanceIndex: 0 } };
    await harness.call('settings.save', { settings: { ...snapshot.settings, deviceProfiles: [profile] } });
    await harness.call('device.connect', { address: profile.address });
    await harness.call('device.disconnect', { id: snapshot.devices[0].id });
    profile.address = profile.connection.address = '127.0.0.1:5557';
    await harness.call('settings.save', { settings: { ...snapshot.settings, deviceProfiles: [profile] } });
    const live = await harness.call('device.connect', { address: profile.address }) as Snapshot['devices'][number];
    return live.id;
  });
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('button', { name: '管理多开', exact: true }).click();
  const card = page.getByRole('article', { name: '多开实例：迁移端口实例', exact: true });
  await expect(card).toContainText('已连接');
  await expect(card.getByRole('button', { name: '删除实例', exact: true })).toBeDisabled();
  await card.getByRole('button', { name: '连接设置', exact: true }).click();
  await expect(page.getByRole('region', { name: '所选设备详情', exact: true })).toContainText('127.0.0.1:5557');
  await page.getByRole('button', { name: '截图测试', exact: true }).click();
  await expect(page.getByRole('img', { name: '连接截图测试结果', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames)).toEqual([liveId]);
});
