import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Snapshot } from '../../packages/contracts/src/types';

const execution = (page: import('@playwright/test').Page) => page.getByRole('region', { name: '任务表执行页面', exact: true });

test('starting a table opens its execution page and preserves the editing draft', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '任务表', exact: true }).click();
  await page.getByRole('button', { name: '配置任务表固源岩补给', exact: true }).click();
  const workbench = page.getByRole('region', { name: '任务表工作台', exact: true });
  await workbench.getByLabel('作战次数', { exact: true }).fill('9');
  await workbench.getByRole('button', { name: '开始日常', exact: true }).click();
  await workbench.getByRole('button', { name: '使用已保存配置', exact: true }).click();
  await expect(execution(page)).toBeVisible();
  await expect(execution(page).getByRole('heading', { name: '固源岩补给', exact: true })).toBeVisible();
  await expect(execution(page).getByRole('complementary', { name: '本次执行任务', exact: true })).toContainText('自动作战');
  await expect(execution(page).getByRole('checkbox', { name: '允许点击操作' })).toHaveCount(0);
  await expect(execution(page)).not.toContainText(/StartUp|Fight|Infrast/);
  await execution(page).getByRole('button', { name: '停止执行', exact: true }).click();
  await expect(execution(page).getByRole('region', { name: '所选任务结果', exact: true })).toContainText('已停止');
  await execution(page).getByRole('button', { name: '返回任务设置', exact: true }).click();
  await expect(workbench.getByLabel('作战次数', { exact: true })).toHaveValue('9');
  await expect(workbench.locator('.wb-save-state')).toHaveText('未保存');
});

test('save-and-start respects navigation made while the save was pending', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '任务表', exact: true }).click();
  await page.getByRole('button', { name: '配置任务表固源岩补给', exact: true }).click();
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness;
    const call = api.call;
    let release!: () => void;
    const saved = new Promise<void>((resolve) => { release = resolve; });
    Object.assign(api, { releaseSave: release });
    api.call = async (method, params) => { if (method === 'plan.save') await saved; return call(method, params); };
  });
  const workbench = page.getByRole('region', { name: '任务表工作台', exact: true });
  await workbench.getByLabel('作战次数', { exact: true }).fill('9');
  await workbench.getByRole('button', { name: '开始日常', exact: true }).click();
  await workbench.getByRole('button', { name: '保存并开始', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await page.evaluate(() => ((window as HarnessWindow).runtimeHarness as unknown as { releaseSave: () => void }).releaseSave());
  await expect(page.locator('.toast')).toContainText('任务表已开始执行');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await expect(execution(page)).toHaveCount(0);
});

test('slow run details remain serial and are not discarded by progress snapshots', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const call = api.call;
    let active = 0;
    Object.assign(api, { maxDetails: 0 });
    api.call = async (method, params) => {
      if (method !== 'run.detail') return call(method, params);
      active++;
      Object.assign(api, { maxDetails: Math.max((api as unknown as { maxDetails: number }).maxDetails, active) });
      try { await new Promise((resolve) => setTimeout(resolve, 1400)); return await call(method, params); }
      finally { active--; }
    };
    await api.call('run.start', { planId: 'daily', deviceId: 'mock-device-1', requestId: 'slow-detail' });
  });
  await page.locator('.sidebar').getByRole('button', { name: '任务表执行', exact: true }).click();
  await expect(execution(page).locator('.exec-tasks > li').first()).toBeVisible({ timeout: 5000 });
  expect(await page.evaluate(() => ((window as HarnessWindow).runtimeHarness as unknown as { maxDetails: number }).maxDetails)).toBe(1);
});

test('duplicate tasks retain independent results, materials, infrastructure and local screenshots', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const state = await api.call('app.snapshot', {}) as Snapshot;
    const plan = { ...state.plans[0], id: 'execution-evidence', name: '作战与基建', budgets: null, tasks: [
      { type: 'StartUp', params: {}, enabled: true },
      { type: 'Fight', params: { stage: '1-7', times: 1, medicine: 0, stone: 0 }, enabled: true },
      { type: 'Fight', params: { stage: '1-7', times: 1, medicine: 0, stone: 0 }, enabled: true },
      { type: 'Infrast', params: {}, enabled: true },
    ] };
    await api.call('plan.save', { plan });
    await api.call('run.start', { planId: plan.id, deviceId: state.devices[0].id, requestId: 'execution-evidence' });
    // Editing the stored table must not rewrite the in-flight result list.
    await api.call('plan.save', { plan: { ...plan, name: '下次执行的新配置', tasks: [{ type: 'Award', params: {}, enabled: true }] } });
  });
  await page.locator('.sidebar').getByRole('button', { name: '任务表执行', exact: true }).click();
  await expect(execution(page).getByRole('heading', { name: '作战与基建', exact: true })).toBeVisible();
  await expect(execution(page).locator('.exec-tasks > li')).toHaveCount(4);
  await expect(execution(page).locator('.exec-eyebrow')).toContainText('已完成', { timeout: 18_000 });
  await expect(execution(page).locator('.exec-task.completed')).toHaveCount(4);
  const drops = execution(page).getByRole('region', { name: '本次获得材料', exact: true });
  await expect(drops).toContainText('固源岩');
  await expect(drops).toContainText('× 4');
  await expect(execution(page).getByRole('region', { name: '基建换班反馈', exact: true })).toContainText('制造站');
  await execution(page).getByRole('button', { name: '查看第 2 项自动作战结果', exact: true }).click();
  await expect(execution(page).getByRole('img', { name: '自动作战反馈画面', exact: true })).toBeVisible();
  await expect(execution(page).getByRole('region', { name: '所选任务掉落记录', exact: true })).toContainText('× 2');
  await page.screenshot({ path: testInfo.outputPath('execution-desktop.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: testInfo.outputPath('execution-desktop-dark.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('execution-mobile.png'), fullPage: true });
  await execution(page).getByRole('region', { name: '本次获得材料', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('execution-mobile-results.png'), fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: '任务表执行', exact: true }).click();
  await expect(execution(page).locator('.exec-task.completed')).toHaveCount(4);
  await execution(page).getByRole('button', { name: '查看第 4 项基建换班结果', exact: true }).click();
  await expect(execution(page).getByRole('img', { name: '基建反馈画面', exact: true })).toBeVisible();
});
