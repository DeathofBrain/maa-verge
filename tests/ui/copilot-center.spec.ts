import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const json = (title: string, extra: Record<string, unknown> = {}) => JSON.stringify({ stage_name: 'main_01-07', minimum_required: 'v6.0.0', doc: { title, details: '合成作业，仅验证界面流程', author: '测试作者' }, opers: [{ name: '阿米娅', skill: 1, requirements: { elite: 2, level: 80 } }], actions: [{ type: 'SpeedUp' }], ...extra });
const queue = (page: Page) => page.getByRole('region', { name: '作业执行队列', exact: true });
const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const preview = (page: Page) => page.getByRole('region', { name: '导入预览', exact: true });
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: '打开导航', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
}
async function openCenter(page: Page) {
  await page.goto('/');
  await navigate(page, '作业中心');
  await expect(page.getByRole('heading', { name: '作业中心', exact: true })).toBeVisible();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
}
async function importJson(page: Page, content: string, add = true) {
  const panel = page.locator('details.cp-import');
  if (!await panel.getAttribute('open').then(value => value !== null)) await page.getByRole('button', { name: '导入作业', exact: true }).click();
  const input = page.getByLabel('作业 JSON', { exact: true });
  if (!await input.isVisible()) await page.getByText('粘贴 JSON', { exact: true }).click();
  await input.fill(content);
  await page.getByRole('button', { name: '预览 JSON', exact: true }).click();
  await expect(preview(page)).toBeVisible();
  await preview(page).getByRole('button', { name: add ? '导入并加入当前队列' : '导入到作业库', exact: true }).click();
  await expect(preview(page)).toHaveCount(0);
}
async function call<T>(page: Page, method: string, params: Record<string, unknown> = {}): Promise<T> {
  return page.evaluate(async ({ method, params }) => (window as unknown as HarnessWindow).runtimeHarness.call(method, params), { method, params }) as Promise<T>;
}

test('local preview, duplicate queue entries and ordered edits persist without creating task tables', async ({ page }) => {
  await openCenter(page);
  const before = await call<{ plans: unknown[] }>(page, 'app.snapshot');
  await importJson(page, json('合成 1-7 作业'));
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
  await queue(page).getByLabel('作业循环次数', { exact: true }).fill('3');
  await library(page).getByRole('button', { name: '加入队列 合成 1-7 作业', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(2);
  await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toHaveValue('1');
  await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toBeDisabled();
  await queue(page).getByLabel('导航关卡 2', { exact: true }).fill('1-7');
  await queue(page).getByRole('button', { name: '上移作业 2', exact: true }).click();
  await expect(queue(page).getByLabel('导航关卡 1', { exact: true })).toHaveValue('1-7');
  await queue(page).getByLabel('执行队列 2', { exact: true }).uncheck();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  const saved = await call<{ queue: { id: string; versionId: string; enabled: boolean; navName: string }[]; options: { loopTimes: number } }>(page, 'copilot.workspace.get', { kind: 'Copilot' });
  expect(saved.queue).toHaveLength(2);
  expect(saved.queue[0].id).not.toBe(saved.queue[1].id);
  expect(saved.queue[0].versionId).toBe(saved.queue[1].versionId);
  expect(saved.queue[0].navName).toBe('1-7');
  expect(saved.queue[1].enabled).toBe(false);
  expect((await call<{ plans: unknown[] }>(page, 'app.snapshot')).plans).toEqual(before.plans);
  await page.reload(); await navigate(page, '作业中心');
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(2);
  await expect(queue(page).getByLabel('执行队列 2', { exact: true })).not.toBeChecked();
  await queue(page).getByRole('button', { name: '清除未勾选项', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
  await expect(queue(page).getByText('突袭', { exact: true })).toHaveCount(0);
});

test('independent execution stays in the center, fixes its queue snapshot and supports source navigation and stop', async ({ page }) => {
  await openCenter(page); await importJson(page, json('独立作业快照'));
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  await expect(page.getByRole('heading', { name: '作业中心', exact: true })).toBeVisible();
  const run = page.getByRole('region', { name: '作业运行状态', exact: true });
  await expect(run).toContainText('通关未确认');
  await expect(run.getByRole('button', { name: '停止作业', exact: true })).toBeVisible();
  await queue(page).getByRole('button', { name: '移除作业 1', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(0);
  await expect(run.locator('.cp-run-entries')).toContainText('独立作业快照');
  const snapshot = await call<{ plans: unknown[]; runs: { id: string; source: string; planId: null; copilotEntries: unknown[] }[] }>(page, 'app.snapshot');
  const active = snapshot.runs[0]; expect(active.source).toBe('copilot'); expect(active.planId).toBeNull(); expect(snapshot.plans).toHaveLength(2);
  await navigate(page, '主页');
  const current = page.getByRole('region', { name: '当前执行', exact: true });
  await expect(current).toContainText('独立作业快照');
  await current.getByRole('button', { name: '查看运行详情', exact: true }).click();
  await expect(page.getByRole('heading', { name: '作业中心', exact: true })).toBeVisible();
  await expect(run).toContainText('独立作业快照');
  await run.getByRole('button', { name: '停止作业', exact: true }).click();
  await expect(run).toContainText('已停止');
  expect((await call<{ queue: unknown[] }>(page, 'copilot.workspace.get', { kind: 'Copilot' })).queue).toHaveLength(0);
});

test('busy device blocks the center while browsing and local import remain available', async ({ page }) => {
  await openCenter(page);
  await call(page, 'run.start', { planId: 'farm-1-7', deviceId: 'mock-device-1', requestId: 'busy-copilot-ui' });
  await importJson(page, json('忙时导入作业'));
  await expect(library(page)).toContainText('忙时导入作业');
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeDisabled();
  await expect(queue(page)).toContainText('设备正在执行');
  await expect(queue(page).getByRole('button', { name: '查看占用', exact: true })).toBeVisible();
  const snapshot = await call<{ runs: { id: string }[]; plans: unknown[] }>(page, 'app.snapshot');
  expect(snapshot.runs).toHaveLength(1); expect(snapshot.plans).toHaveLength(2);
  await call(page, 'run.stop', { id: snapshot.runs[0].id });
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeEnabled();
});

test('community pagination and set preview retain member order and explicitly show deleted members', async ({ page }) => {
  await openCenter(page);
  await page.getByRole('tab', { name: '社区搜索', exact: true }).click();
  await page.getByLabel('社区搜索关键词', { exact: true }).fill('合成');
  await expect(library(page)).toContainText('合成社区作业 1');
  await library(page).getByRole('button', { name: '下一页', exact: true }).click();
  await expect(library(page)).toContainText('合成社区作业 2');
  await expect(library(page).getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await library(page).getByRole('button', { name: '作业集', exact: true }).click();
  await expect(library(page)).toContainText('合成有序作业集');
  await library(page).getByRole('button', { name: '预览 合成有序作业集', exact: true }).click();
  await expect(preview(page).locator('.cp-preview-entry')).toHaveCount(3);
  await expect(preview(page)).toContainText('作业 404 已删除');
  await expect(preview(page).getByLabel('选择导入 3', { exact: true })).toBeDisabled();
  await expect(preview(page).getByLabel('选择导入 1', { exact: true })).toBeChecked();
  await preview(page).getByRole('button', { name: '导入并加入当前队列', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-title strong')).toHaveText(['合成社区作业 101', '合成社区作业 102']);
  expect((await call<{ plans: unknown[] }>(page, 'app.snapshot')).plans).toHaveLength(2);
});

test('three kinds use separate persisted queues and SSS only allows a single work', async ({ page }) => {
  await openCenter(page); await importJson(page, json('普通独立队列'));
  await page.getByRole('tab', { name: '保全派驻', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(0);
  await importJson(page, json('保全独立队列', { type: 'SSS', stages: [] }));
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
  await expect(library(page).getByRole('button', { name: '加入队列 保全独立队列', exact: true })).toBeDisabled();
  await expect(queue(page).getByLabel('自动编队', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '悖论模拟', exact: true }).click();
  await importJson(page, json('悖论独立队列', { type: 'Paradox', stage_name: 'mem_amiya_1' }));
  await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: '普通作业', exact: true }).click();
  await expect(queue(page)).toContainText('普通独立队列');
  await expect(queue(page)).not.toContainText('保全独立队列');
});

test('local JSON selection and narrow dark/light layouts provide a return path without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCenter(page);
  await page.getByRole('button', { name: '导入作业', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(json('窄窗作业')) });
  await expect(preview(page)).toContainText('窄窗作业');
  await preview(page).getByRole('button', { name: '导入到作业库', exact: true }).click();
  await page.getByRole('button', { name: '返回作业列表', exact: true }).click();
  await library(page).getByRole('button', { name: /1-7.*窄窗作业|main_01-07.*窄窗作业/u }).click();
  await expect(page.getByRole('region', { name: '作业详情', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '返回作业列表', exact: true })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.getByRole('button', { name: '返回作业列表', exact: true }).click();
  await expect(library(page)).toBeVisible();
});
