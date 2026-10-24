import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const depot = (page: Page) => page.getByRole('region', { name: '仓库识别结果', exact: true });
const operators = (page: Page) => page.getByRole('region', { name: '干员识别结果', exact: true });

async function openTools(page: Page, kind: '仓库' | '干员' = '仓库') {
  await page.locator('.sidebar').getByRole('button', { name: '工具箱', exact: true }).click();
  if (await page.getByLabel('工具箱设备', { exact: true }).inputValue() === '') await page.getByLabel('工具箱设备', { exact: true }).selectOption('mock-device-1');
  await page.getByRole('navigation', { name: '工具分类', exact: true }).getByRole('button', { name: kind, exact: true }).click();
}

async function downloadResult(page: Page, label: string) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const path = await download.path();
  if (!path) throw new Error('The recognition export did not create a local file');
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
}

test('recognition requires completed structured results and ignores unrelated warehouse events', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const snapshot = await api.call('app.snapshot', {}) as Snapshot;
    await api.call('plan.save', { plan: { ...snapshot.plans[0], id: 'old-depot-event', name: '历史仓库事件：固源岩 999', tasks: [{ type: 'Depot', params: {}, enabled: true }] } });
    const run = await api.call('run.start', { planId: 'old-depot-event', deviceId: snapshot.devices[0].id, requestId: 'stopped-recognition' }) as { id: string };
    await api.call('run.stop', { id: run.id });
  });
  await openTools(page);
  await expect(depot(page).getByRole('listitem')).toHaveCount(0);
  await expect(depot(page)).toContainText('尚无仓库识别结果');
  await expect(depot(page).getByRole('button', { name: '导出仓库结果', exact: true })).toHaveCount(0);
  await expect(depot(page)).not.toContainText('固源岩 999');
  await openTools(page, '干员');
  await expect(operators(page).getByRole('table')).toHaveCount(0);
  await expect(operators(page)).toContainText('尚无干员识别结果');
  await expect(operators(page).getByRole('button', { name: '导出干员结果', exact: true })).toHaveCount(0);
});

test('warehouse recognition shows decoded resource images, searches and exports persistent quantities', async ({ page }, testInfo) => {
  await page.clock.install();
  await page.goto('/');
  await openTools(page);
  await page.getByRole('button', { name: '开始仓库识别', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始仓库识别', exact: true })).toBeDisabled();
  const started = await page.evaluate(async () => (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot;
  expect(started.plans).toHaveLength(2);
  expect(started.runs).toHaveLength(0);
  expect(started.toolJobs?.[0]).toMatchObject({kind:'depot',deviceId:'mock-device-1',status:'running'});
  await page.clock.runFor(12_600);
  await expect(depot(page).getByRole('listitem')).toHaveCount(3);
  const rock = depot(page).getByRole('listitem').filter({ has: page.getByText('固源岩', { exact: true }) });
  await expect(rock).toContainText('42');
  const icon = rock.getByRole('img', { name: '固源岩', exact: true });
  await expect(icon).toBeVisible();
  await expect.poll(() => icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(depot(page).getByRole('listitem').filter({ hasText: '合成无图材料' }).getByRole('img')).toHaveCount(0);
  await depot(page).getByLabel('搜索仓库物品', { exact: true }).fill('30013');
  await expect(depot(page).getByRole('listitem')).toHaveCount(1);
  await expect(depot(page).getByRole('listitem')).toContainText('固源岩组');
  await depot(page).getByLabel('搜索仓库物品', { exact: true }).fill('不存在的材料');
  await expect(depot(page).getByRole('listitem')).toHaveCount(0);
  await depot(page).getByLabel('搜索仓库物品', { exact: true }).fill('');
  expect(await downloadResult(page, '导出仓库结果')).toMatchObject({ deviceId: 'mock-device-1', kind: 'depot', clientType: 'Official', runId: started.toolJobs![0].id, items: [{ id: '30012', name: '固源岩', quantity: 42 }, { id: '30013', name: '固源岩组', quantity: 7 }, { id: 'fixture-no-icon', name: '合成无图材料', quantity: 3 }], operators: [] });
  await page.screenshot({ path: testInfo.outputPath('warehouse-results.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.sidebar').evaluate((sidebar) => sidebar.getBoundingClientRect().right <= 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('warehouse-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await openTools(page);
  await expect(depot(page).getByRole('listitem')).toHaveCount(3);
  await expect(depot(page).getByRole('img', { name: '固源岩', exact: true })).toBeVisible();
});

test('operator recognition exports owned progress and isolates devices and clients', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await openTools(page, '干员');
  await page.getByRole('button', { name: '开始干员识别', exact: true }).click();
  await page.clock.runFor(12_600);
  const amiya = operators(page).getByRole('row').filter({ hasText: '阿米娅' });
  await expect(amiya).toContainText('5 星');
  await amiya.scrollIntoViewIfNeeded();
  await page.clock.runFor(100);
  const portrait=amiya.getByRole('img',{name:'阿米娅头像'});await expect(portrait).toBeVisible();
  await expect.poll(()=>portrait.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
  await expect(amiya).toContainText('精英 2');
  await expect(amiya).toContainText('80');
  await expect(amiya).toContainText('6');
  await expect(operators(page).getByRole('row').filter({ hasText: '能天使' })).toContainText('90');
  await operators(page).getByLabel('搜索干员', { exact: true }).fill('阿米娅');
  await expect(operators(page).getByRole('row').filter({ hasText: '能天使' })).toHaveCount(0);
  await operators(page).getByLabel('搜索干员', { exact: true }).fill('');
  expect(await downloadResult(page, '导出干员结果')).toMatchObject({ deviceId: 'mock-device-1', kind: 'operators', clientType: 'Official', items: [], operators: [{ id: 'char_002_amiya', name: '阿米娅', own: true, elite: 2, level: 80, potential: 6, rarity: 5 }, { id: 'char_103_angel', name: '能天使', own: true, elite: 2, level: 90, potential: 1, rarity: 6 }] });
  await page.getByLabel('识别结果客户端', { exact: true }).selectOption('YoStarJP');
  await expect(operators(page).getByRole('table')).toHaveCount(0);
  await expect(operators(page)).toContainText('尚无干员识别结果');
  await expect(operators(page).getByRole('button', { name: '导出干员结果', exact: true })).toHaveCount(0);
  await openTools(page, '仓库');
  await expect(page.getByLabel('识别结果客户端', { exact: true })).toHaveValue('YoStarJP');
  await openTools(page, '干员');
  await expect(page.getByLabel('识别结果客户端', { exact: true })).toHaveValue('YoStarJP');
  await page.getByLabel('识别结果客户端', { exact: true }).selectOption('Official');
  await expect(amiya).toBeVisible();
  const second = await page.evaluate(async () => (window as HarnessWindow).runtimeHarness.call('device.connect', { address: '127.0.0.1:5557', name: '第二个模拟器' })) as { id: string };
  await page.getByLabel('工具箱设备', { exact: true }).selectOption(second.id);
  await expect(operators(page).getByRole('table')).toHaveCount(0);
  await page.getByLabel('识别结果客户端', { exact: true }).selectOption('YoStarEN');
  await page.getByLabel('工具箱设备', { exact: true }).selectOption('mock-device-1');
  await expect(page.getByLabel('识别结果客户端', { exact: true })).toHaveValue('Official');
  await expect(amiya).toBeVisible();
});

test('recognition read and start errors remain actionable', async ({ page }) => {
  await page.goto('/');
  await openTools(page);
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness;
    const call = api.call;
    Object.assign(api, { restoreRecognition: () => { api.call = call; } });
    api.call = async (method, params) => {
      if (method === 'recognition.get') throw new Error('合成识别读取失败');
      return call(method, params);
    };
  });
  await page.getByRole('button', { name: '刷新识别结果', exact: true }).click();
  await expect(depot(page).getByRole('alert')).toContainText('合成识别读取失败');
  await expect(depot(page).getByRole('button', { name: '导出仓库结果', exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness;
    (api as unknown as { restoreRecognition: () => void }).restoreRecognition();
    const call = api.call;
    api.call = async (method, params) => {
      if (method === 'tool.start') throw new Error('合成设备连接失败');
      return call(method, params);
    };
  });
  await depot(page).getByRole('button', { name: '重试', exact: true }).click();
  await expect(depot(page).getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '开始仓库识别', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('合成设备连接失败');
  await expect(page.getByRole('button', { name: '开始仓库识别', exact: true })).toBeEnabled();
});

test('combined data sync stores only enabled recognition kinds and execution materials use resource images', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const snapshot = await api.call('app.snapshot', {}) as Snapshot;
    await api.call('plan.save', { plan: { ...snapshot.plans[0], id: 'combined-recognition', name: '数据与材料', tasks: [{ type: 'UserDataUpdate', params: { operators: true, depot: false, interval: 'always' }, enabled: true }, { type: 'Fight', params: { stage: '1-7', times: 1, medicine: 0, stone: 0 }, enabled: true }] } });
    await api.call('run.start', { planId: 'combined-recognition', deviceId: snapshot.devices[0].id, requestId: 'combined-recognition' });
  });
  await page.clock.runFor(12_600);
  await openTools(page);
  await expect(depot(page).getByRole('listitem')).toHaveCount(0);
  await openTools(page, '干员');
  await expect(operators(page).getByRole('row').filter({ hasText: '阿米娅' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '任务表执行', exact: true }).click();
  const run = await page.evaluate(async () => ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot).runs[0]);
  await page.getByRole('region', { name: '任务表执行监控', exact: true }).getByRole('button', { name: `查看执行${run.id}`, exact: true }).click();
  const drops = page.getByRole('region', { name: '本次获得材料', exact: true });
  const image = drops.getByRole('img', { name: '固源岩', exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
});
