import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const wb = (page: Page) => page.getByRole('region', { name: '任务表工作台', exact: true });
const nav = (page: Page, name: string) => page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
const menu = (page: Page) => page.getByRole('menu');
const snapshot = (page: Page) => page.evaluate(async () => await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}) as Snapshot);
async function openFarm(page: Page) {
  await page.goto('/'); await nav(page, '任务表');
  await page.getByRole('button', { name: '配置任务表固源岩补给', exact: true }).click();
}
async function saved(page: Page) { await expect(wb(page).locator('.wb-save-state')).toHaveText('已保存'); }

test('valid parameters and metadata automatically persist without manual saving', async ({ page }) => {
  await openFarm(page);
  await wb(page).getByLabel('作战次数', { exact: true }).fill('17');
  await saved(page);
  expect((await snapshot(page)).plans.find((p) => p.id === 'farm-1-7')?.tasks[0].params.times).toBe(17);
  await wb(page).getByRole('tab', { name: '任务表设置', exact: true }).click();
  await wb(page).getByLabel('任务表名称', { exact: true }).fill('自动保存的表');
  await wb(page).getByLabel('任务表说明', { exact: true }).fill('自动保存说明');
  await wb(page).getByLabel('绑定设备', { exact: true }).selectOption('mock-device-1');
  await saved(page);
  await page.reload(); await nav(page, '任务表');
  await expect(wb(page).getByLabel('任务表名称', { exact: true })).toHaveValue('自动保存的表');
  await expect(wb(page).getByLabel('任务表说明', { exact: true })).toHaveValue('自动保存说明');
  await expect(wb(page).getByLabel('绑定设备', { exact: true })).toHaveValue('mock-device-1');
});

test('leaving before the debounce saves the outgoing table without redirecting navigation', async ({ page }) => {
  await openFarm(page);
  await wb(page).getByLabel('作战次数', { exact: true }).fill('19');
  await page.getByRole('button', { name: '配置任务表每日长草计划', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).plans.find((p) => p.id === 'farm-1-7')?.tasks[0].params.times).toBe(19);
  await expect(wb(page).getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
});

test('edits remain available during a slow save and the final write wins', async ({ page }) => {
  await openFarm(page);
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness; const call = api.call;
    Object.assign(api, { releaseSave: () => {}, saveCount: 0 });
    let first = true;
    api.call = async (method, params) => {
      if (method === 'plan.save') {
        Object.assign(api, { saveCount: (api as unknown as { saveCount: number }).saveCount + 1 });
        if (first) { first = false; await new Promise<void>((resolve) => Object.assign(api, { releaseSave: resolve })); }
      }
      return call(method, params);
    };
  });
  await wb(page).getByLabel('作战次数', { exact: true }).fill('11');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('正在保存…');
  await wb(page).getByLabel('作战次数', { exact: true }).fill('23');
  await page.evaluate(() => ((window as HarnessWindow).runtimeHarness as unknown as { releaseSave: () => void }).releaseSave());
  await saved(page);
  await expect(wb(page).getByLabel('作战次数', { exact: true })).toHaveValue('23');
  expect((await snapshot(page)).plans.find((p) => p.id === 'farm-1-7')?.tasks[0].params.times).toBe(23);
});

test('failed and invalid saves retain drafts and can be corrected or retried', async ({ page }) => {
  await openFarm(page);
  await wb(page).locator('.advanced-params summary').click();
  await wb(page).getByLabel('任务参数 JSON').fill('{"times":');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('保存失败');
  expect((await snapshot(page)).plans.find((p) => p.id === 'farm-1-7')?.tasks[0].params.times).toBe(6);
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness; const call = api.call; let fail = true;
    api.call = async (method, params) => { if (method === 'plan.save' && fail) { fail = false; throw new Error('合成保存故障'); } return call(method, params); };
  });
  await wb(page).getByLabel('任务参数 JSON').fill('{"stage":"1-7","times":29,"medicine":0,"stone":0}');
  await expect(wb(page).getByRole('alert')).toContainText('自动保存失败');
  await wb(page).getByRole('button', { name: '重试保存', exact: true }).click();
  await saved(page);
  expect((await snapshot(page)).plans.find((p) => p.id === 'farm-1-7')?.tasks[0].params.times).toBe(29);
});

test('deletion waits for an earlier save and never revives the deleted table', async ({ page }) => {
  await openFarm(page);
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness; const call = api.call;
    api.call = async (method, params) => { if (method === 'plan.save') await new Promise<void>((resolve) => Object.assign(api, { releaseSave: resolve })); return call(method, params); };
  });
  await wb(page).getByLabel('作战次数').fill('31');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('正在保存…');
  await page.getByRole('button', { name: '配置任务表固源岩补给', exact: true }).click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '删除任务表', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '删除任务表', exact: true });
  await dialog.getByRole('button', { name: '删除任务表', exact: true }).click();
  await page.evaluate(() => ((window as HarnessWindow).runtimeHarness as unknown as { releaseSave: () => void }).releaseSave());
  await expect(dialog).toBeHidden();
  expect((await snapshot(page)).plans.some((p) => p.id === 'farm-1-7')).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem('maaverge.ui.draft.farm-1-7'))).toBeNull();
  await page.reload(); await nav(page, '任务表');
  await expect(page.getByRole('button', { name: '配置任务表固源岩补给', exact: true })).toHaveCount(0);
});

test('sidebar menu edits names, copies the current configuration and preserves selection on deleting another table', async ({ page }) => {
  await openFarm(page);
  const farm = page.getByRole('button', { name: '配置任务表固源岩补给', exact: true });
  await farm.click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: '重命名', exact: true }).click();
  const name = wb(page).getByLabel('任务表名称', { exact: true });
  await expect(name).toBeFocused(); await name.fill('新名称'); await saved(page);
  const renamed = page.getByRole('button', { name: '配置任务表新名称', exact: true });
  await renamed.click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: '停用任务表', exact: true }).click();
  await saved(page); expect((await snapshot(page)).plans.find((p) => p.id === 'farm-1-7')?.enabled).toBe(false);
  await renamed.click({ button: 'right' });
  const download = page.waitForEvent('download'); await menu(page).getByRole('menuitem', { name: '导出任务表', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('新名称.json');
  await renamed.click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: '复制任务表', exact: true }).click();
  await expect(wb(page).getByRole('heading', { name: '新名称 副本', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '配置任务表每日长草计划', exact: true }).click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '删除任务表', exact: true }).click();
  await page.getByRole('dialog', { name: '删除任务表', exact: true }).getByRole('button', { name: '删除任务表', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(wb(page).getByRole('heading', { name: '新名称 副本', exact: true })).toBeVisible();
});

test('task context actions share copy, enable, ordering and delete behavior with the toolbar', async ({ page }) => {
  await openFarm(page);
  const rows = wb(page).locator('.editor-steps > li');
  await rows.first().click({ button: 'right' });
  await expect(menu(page).getByRole('menuitem', { name: '上移任务', exact: true })).toBeDisabled();
  await menu(page).getByRole('menuitem', { name: '复制任务', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await rows.last().click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: '停用任务', exact: true }).click();
  await rows.last().click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: '上移任务', exact: true }).click();
  await expect(wb(page).getByRole('checkbox', { name: '启用第 1 条任务', exact: true })).not.toBeChecked();
  await rows.last().click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: '删除任务', exact: true }).click();
  await saved(page);
  const plan = (await snapshot(page)).plans.find((p) => p.id === 'farm-1-7')!;
  expect(plan.tasks).toHaveLength(1); expect(plan.tasks[0].enabled).toBe(false);
});

test('device, instance, execution and history menus expose matching actions', async ({ page }) => {
  await openFarm(page); await nav(page, '设备');
  const device = page.getByRole('article', { name: '设备：本地模拟设备', exact: true });
  await device.click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: '保存为多开实例', exact: true }).click();
  await page.getByRole('button', { name: '保存实例配置', exact: true }).click();
  const instance = page.getByRole('article', { name: '多开实例：本地模拟设备', exact: true });
  await instance.click({ button: 'right' });
  await expect(menu(page).getByRole('menuitem', { name: '删除实例', exact: true })).toBeDisabled();
  await menu(page).getByRole('menuitem', { name: '编辑实例', exact: true }).click();
  await expect(page.getByRole('form', { name: '多开实例配置', exact: true })).toBeVisible();
  await nav(page, '任务表');
  await wb(page).getByRole('button', { name: '开始日常', exact: true }).click();
  await page.getByRole('button', { name: '返回监控总览', exact: true }).click();
  await page.locator('.monitor-card').first().click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '停止执行', exact: true }).click();
  await nav(page, '执行记录'); await page.locator('.history-table tbody tr').first().click({ button: 'right' });
  await expect(menu(page).getByRole('menuitem', { name: '停止执行', exact: true })).toBeDisabled();
  await menu(page).getByRole('menuitem', { name: '查看执行详情', exact: true }).click();
  await expect(page.getByRole('region', { name: '任务表执行页面', exact: true })).toBeVisible();
});

test('menus support keyboard navigation, viewport edges, and no menu on plain surfaces', async ({ page }, testInfo) => {
  await openFarm(page);
  const target = page.getByRole('button', { name: '配置任务表固源岩补给', exact: true });
  await target.focus(); await target.press('Shift+F10');
  await expect(menu(page).getByRole('menuitem', { name: '任务表设置', exact: true })).toBeFocused();
  await page.keyboard.press('End'); await expect(menu(page).getByRole('menuitem', { name: '删除任务表', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(menu(page)).toBeHidden(); await expect(target).toBeFocused();
  const prevented = await wb(page).getByRole('heading', { name: '固源岩补给', exact: true }).evaluate((element) => !element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  expect(prevented).toBe(true); await expect(menu(page)).toBeHidden();
  const native = await wb(page).getByLabel('作战次数').evaluate((element) => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  expect(native).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 600, height: 520 });
  // Let the resize event dismiss the previous menu before opening the edge case.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await wb(page).locator('.editor-steps > li').first().evaluate((element) => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 595, clientY: 515 })));
  await expect.poll(async () => {
    const rect = await menu(page).boundingBox();
    return !!rect && rect.x + rect.width <= 600 && rect.y + rect.height <= 520;
  }).toBe(true);
  const rect = await menu(page).boundingBox(); expect(rect!.x).toBeGreaterThan(300); expect(rect!.x + rect!.width).toBeLessThanOrEqual(600); expect(rect!.y + rect!.height).toBeLessThanOrEqual(520);
  await page.screenshot({ path: testInfo.outputPath('context-menu-narrow.png'), animations: 'disabled' });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.screenshot({ path: testInfo.outputPath('context-menu-narrow-dark.png'), animations: 'disabled' });
});

test('new task tables automatically become saved sidebar entries', async ({ page }) => {
  await openFarm(page);
  await page.getByRole('button', { name: '添加任务表', exact: true }).click();
  await wb(page).getByLabel('任务表名称', { exact: true }).fill('新建自动保存');
  await wb(page).getByLabel('作战次数', { exact: true }).fill('7');
  await saved(page);
  await expect(page.getByRole('button', { name: '配置任务表新建自动保存', exact: true })).toBeVisible();
  const plan = (await snapshot(page)).plans.find((p) => p.name === '新建自动保存')!;
  expect(plan.tasks).toHaveLength(9); expect(plan.tasks.find((task) => task.type === 'Fight')?.params.times).toBe(7);
});

test('cancelled tables and unconfirmed Agent proposals do not automatically persist', async ({ page }) => {
  await openFarm(page); await page.clock.install();
  const before = (await snapshot(page)).plans.map((p) => p.id);
  await page.getByRole('button', { name: '添加任务表', exact: true }).click();
  await wb(page).getByRole('button', { name: '取消新建', exact: true }).click();
  await page.clock.runFor(1000);
  expect((await snapshot(page)).plans.map((p) => p.id)).toEqual(before);
  await page.locator('.sidebar').getByRole('button', { name: /^Agent 助手/ }).click();
  await page.getByRole('button', { name: '制定刷 6 次 1-7 的计划', exact: true }).click();
  await page.getByRole('button', { name: '检查并保存计划', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(wb(page).locator('.wb-save-state')).toHaveText('待确认保存');
  expect((await snapshot(page)).plans.map((p) => p.id)).toEqual(before);
  await wb(page).getByRole('button', { name: '保存任务表', exact: true }).click();
  await saved(page); expect((await snapshot(page)).runs).toHaveLength(0);
});

test('copilot context editing opens the exact task among duplicate types', async ({ page }) => {
  await openFarm(page);
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness; const state = await api.call('app.snapshot', {}) as Snapshot;
    await api.call('plan.save', { plan: { ...state.plans[0], id: 'context-copilot', name: '右键作业', tasks: [
      { type: 'Copilot', enabled: true, params: { filename: '/synthetic/first.json' } },
      { type: 'Copilot', enabled: true, params: { filename: '/synthetic/second.json' } },
    ] } });
  });
  await nav(page, '作业中心');
  await page.locator('details.cp-legacy summary').click();
  await page.locator('.cp-legacy-row').filter({ hasText: '/synthetic/second.json' }).click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '编辑作业配置', exact: true }).click();
  await expect(wb(page).getByLabel('作业文件路径', { exact: true })).toHaveValue('/synthetic/second.json');
});
