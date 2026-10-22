import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Snapshot } from '../../packages/contracts/src/types';

test('manual infrastructure estimates persist and stay bound to the selected device', async ({ page }, testInfo) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: '基建产出估算', exact: true });
  await expect(panel).toContainText('尚未配置产线');
  await expect(panel.getByRole('progressbar')).toHaveCount(0);
  await panel.getByText('配置此设备的产线估算', { exact: true }).click();
  await panel.getByRole('button', { name: '添加产线', exact: true }).click();
  await panel.getByRole('button', { name: '保存估算配置', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('请填写');
  await panel.getByLabel('产线 1 名称', { exact: true }).fill('赤金制造站');
  await panel.getByLabel('产线 1 每小时产量', { exact: true }).fill('20');
  await panel.getByLabel('产线 1 容量', { exact: true }).fill('100');
  await panel.getByLabel('产线 1 单位', { exact: true }).fill('块');
  await panel.getByLabel('产线 1 上次收取时间', { exact: true }).fill('2020-01-01T00:00');
  await panel.getByRole('button', { name: '保存估算配置', exact: true }).click();
  await expect(panel).toContainText('约 100 / 100 块');
  await expect(panel).toContainText('预计已满');
  await page.locator('.home-dashboard').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('home-production-desktop.png'), animations: 'disabled' });
  await page.reload();
  await expect(panel).toContainText('约 100 / 100 块');
  const second = await page.evaluate(async () => (window as HarnessWindow).runtimeHarness.call('device.connect', { address: '127.0.0.1:5557', name: '第二个模拟器' })) as { id: string };
  await page.getByLabel('选择设备', { exact: true }).selectOption(second.id);
  await expect(panel).toContainText('第二个模拟器');
  await expect(panel).toContainText('尚未配置产线');
  await expect(panel.getByRole('progressbar')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.home-dashboard').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('home-production-mobile.png'), animations: 'disabled' });
});

test('the homepage distinguishes verified active events from resource markers with unknown expiry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '游戏日与活动提醒', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const call = harness.call;
    harness.call = async (method, params) => method === 'stages.list' ? {
      clientType: 'Official', source: 'installed', resourceVersion: 'fixture', generatedAt: new Date().toISOString(), stages: [], diagnostics: [], message: '合成活动日历',
      activities: [
        { id: 'active', name: '合成限时活动', startAt: '2020-01-01T00:00:00Z', endAt: '2099-01-01T00:00:00Z', clientType: 'Official', status: 'active', source: 'activity-metadata' },
        { id: 'unknown', name: '合成资源活动', startAt: null, endAt: null, clientType: 'Official', status: 'unknown', source: 'resource-version' },
      ],
    } : call(method, params);
  });
  await page.getByRole('button', { name: '刷新游戏提醒', exact: true }).click();
  const panel = page.getByRole('region', { name: '游戏日与活动提醒', exact: true });
  await expect(panel).toContainText('合成限时活动');
  await expect(panel.getByText('进行中', { exact: true })).toHaveCount(1);
  await expect(panel).toContainText('资源标记活动 · 开放期未确认');
  await expect(panel).toContainText('未读取游戏内完成状态');
  await page.getByLabel('提醒使用的客户端', { exact: true }).selectOption('YoStarEN');
  await expect(panel).toContainText('国际服 · 游戏日');
});

test('saved estimate changes reset only the selected device draft and cannot restore an invalidated baseline', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = await harness.call('app.snapshot', {}) as Snapshot;
    await harness.call('settings.save', { settings: { ...snapshot.settings, infrastructureEstimates: [{ deviceId: snapshot.devices[0].id, lines: [{ id: 'gold', name: '旧账号赤金', unit: '块', hourlyRate: 20, capacity: 100, lastCollectedAt: '2020-01-01T00:00:00Z' }] }] } });
  });
  const panel = page.getByRole('region', { name: '基建产出估算', exact: true });
  await expect(panel).toContainText('旧账号赤金');
  await panel.getByText('配置此设备的产线估算', { exact: true }).click();
  await panel.getByLabel('产线 1 名称', { exact: true }).fill('尚未保存的草稿');
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = await harness.call('app.snapshot', {}) as Snapshot;
    await harness.call('settings.save', { settings: { ...snapshot.settings, infrastructureEstimates: [...snapshot.settings.infrastructureEstimates!, { deviceId: 'other-device', lines: [] }] } });
  });
  await expect(panel.getByLabel('产线 1 名称', { exact: true })).toHaveValue('尚未保存的草稿');
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = await harness.call('app.snapshot', {}) as Snapshot;
    await harness.call('settings.save', { settings: { ...snapshot.settings, infrastructureEstimates: snapshot.settings.infrastructureEstimates!.filter(profile => profile.deviceId !== snapshot.devices[0].id) } });
  });
  await expect(panel).toContainText('尚未配置产线');
  await expect(panel.getByLabel('产线 1 名称', { exact: true })).toHaveCount(0);
  await panel.getByText('配置此设备的产线估算', { exact: true }).click();
  await panel.getByRole('button', { name: '保存估算配置', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const snapshot = await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}) as Snapshot;
    return snapshot.settings.infrastructureEstimates?.find(profile => profile.deviceId === snapshot.devices[0].id)?.lines;
  })).toEqual([]);
});
