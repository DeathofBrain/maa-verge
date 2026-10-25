import type { Page } from '@playwright/test';
import type { CopilotCategory, CopilotPreview, CopilotRecord, CopilotWorkspace } from '../../packages/contracts/src/index';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const queue = (page: Page) => page.getByRole('region', { name: '作业执行队列', exact: true });
const detail = (page: Page) => page.getByRole('complementary', { name: '作业详情', exact: true });
const preview = (page: Page) => page.getByRole('region', { name: '导入预览', exact: true });
const call = <T>(page: Page, method: string, params: Record<string, unknown> = {}) => page.evaluate(({ method, params }) => (window as unknown as HarnessWindow).runtimeHarness.call(method, params), { method, params }) as Promise<T>;
async function enter(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
}
async function seed(page: Page, title: string, extra: Record<string, unknown> = {}) {
  const value = await call<CopilotPreview>(page, 'copilot.preview', { content: JSON.stringify({ stage_name: 'main_01-07', doc: { title }, actions: [], ...extra }) });
  return (await call<{ items: CopilotRecord[] }>(page, 'copilot.import', { previewId: value.id })).items[0];
}

test('categories can be created, assigned in the drawer, renamed and deleted without deleting work', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/'); await seed(page, '分类管理作业'); await enter(page);
  await library(page).getByRole('button', { name: '管理分类', exact: true }).click();
  await library(page).getByLabel('分类名称', { exact: true }).fill('每周作业');
  await library(page).getByRole('button', { name: '新建分类', exact: true }).click();
  await expect(library(page).getByRole('button', { name: '每周作业', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await library(page).getByRole('button', { name: '全部', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(1);
  await library(page).getByRole('button', { name: '管理分类', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('categories-station-desktop.png') });
  await library(page).getByRole('button', { name: '管理分类', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('categories-manager-desktop.png') });
  await library(page).locator('.cp-record-main').click();
  await expect(detail(page).getByRole('heading', { name: '分类管理作业', exact: true })).toBeFocused();
  await page.locator('.cp-drawer-panel').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('category-drawer-desktop.png') });
  const category = (await call<{ items: CopilotCategory[] }>(page, 'copilot.category.list')).items[0];
  await detail(page).getByLabel('详情作业分类', { exact: true }).selectOption(category.id);
  await expect(detail(page).getByLabel('详情作业分类', { exact: true })).toHaveValue(category.id);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sidebar')).not.toBeInViewport();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.querySelector('.copilot-page')!.scrollTop = 0; }, theme);
    await page.screenshot({ path: testInfo.outputPath(`categories-mobile-${theme}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await library(page).getByRole('button', { name: '每周作业', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(1);
  await expect(library(page).locator('.cp-record select')).toHaveCount(0);
  await library(page).getByLabel('分类名称', { exact: true }).fill('常用作业');
  await library(page).getByRole('button', { name: '重命名分类', exact: true }).click();
  await expect(library(page).getByRole('button', { name: '常用作业', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await library(page).getByRole('button', { name: '删除分类', exact: true }).click();
  await library(page).getByRole('button', { name: '确认删除分类', exact: true }).click();
  await expect(library(page).getByRole('button', { name: '常用作业', exact: true })).toHaveCount(0);
  await expect(library(page).locator('.cp-record')).toHaveCount(1);
  const records = await call<{ items: CopilotRecord[] }>(page, 'copilot.list');
  expect(records.items[0].categoryId).toBeNull();
});

test('whole categories include later pages and append to the existing target queue in library order', async ({ page }) => {
  await page.goto('/');
  const existing = await seed(page, '原有普通队列');
  const category = await call<CopilotCategory>(page, 'copilot.category.save', { name: '整套周常' });
  const records: CopilotRecord[] = [];
  for (let index = 1; index <= 23; index++) records.push(await seed(page, `周常 ${index}`));
  await call(page, 'copilot.category.assign', { ids: records.map(record => record.id), categoryId: category.id });
  const workspace = await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind: 'Copilot' });
  await call(page, 'copilot.workspace.save', { workspace: { ...workspace, queue: [{ id: 'existing', versionId: existing.versionId, enabled: false, isRaid: true, navName: '保留导航' }] } });
  await enter(page);
  await queue(page).getByRole('tab', { name: '悖论模拟', exact: true }).click();
  await library(page).getByRole('button', { name: '整套周常', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(20);
  await library(page).getByRole('button', { name: '整类加入队列', exact: true }).click();
  await expect(queue(page).getByRole('tab', { name: '普通作业', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(24);
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  const saved = await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind: 'Copilot' });
  expect(saved.queue.map(entry => entry.versionId)).toEqual([existing.versionId, ...records.map(record => record.versionId)]);
  expect(saved.queue[0]).toMatchObject({ id: 'existing', enabled: false, isRaid: true, navName: '保留导航' });
});

test('a mixed category requires an explicit type and SSS bulk addition does not partially mutate queues', async ({ page }) => {
  await page.goto('/');
  const normal = await seed(page, '混合集普通');
  const sss = await seed(page, '混合集保全', { type: 'SSS', stages: [] });
  const secondSss = await seed(page, '混合集第二保全', { type: 'SSS', stages: [] });
  const category = await call<CopilotCategory>(page, 'copilot.category.save', { name: '混合分类' });
  await call(page, 'copilot.category.assign', { ids: [normal.id, sss.id, secondSss.id], categoryId: category.id });
  await enter(page);
  await library(page).getByRole('button', { name: '混合分类', exact: true }).click();
  await library(page).getByRole('button', { name: '整类加入队列', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('不同类型');
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(0);
  await library(page).getByLabel('分类入队类型', { exact: true }).selectOption('SSSCopilot');
  await library(page).getByRole('button', { name: '整类加入队列', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('保全派驻仅支持一份作业');
  expect((await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind: 'SSSCopilot' })).queue).toEqual([]);
  await library(page).getByLabel('分类入队类型', { exact: true }).selectOption('Copilot');
  await library(page).getByRole('button', { name: '整类加入队列', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-title strong')).toHaveText(['混合集普通']);
});

test('whole sets naturally select their target queue, preserve existing entries and expose unavailable members', async ({ page }) => {
  await page.goto('/');
  const existing = await seed(page, '整集之前的作业');
  const workspace = await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind: 'Copilot' });
  await call(page, 'copilot.workspace.save', { workspace: { ...workspace, queue: [{ id: 'set-existing', versionId: existing.versionId, enabled: true, isRaid: false, navName: '' }] } });
  await enter(page);
  await queue(page).getByRole('tab', { name: '保全派驻', exact: true }).click();
  await library(page).getByRole('tab', { name: '社区作业集', exact: true }).click();
  await library(page).getByRole('button', { name: '查看详情 合成有序作业集', exact: true }).click();
  await expect(preview(page)).toContainText('2 项可用，1 项无效');
  await preview(page).getByRole('button', { name: '全集导入并加入队列', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-title strong')).toHaveText(['整集之前的作业', '合成社区作业 101', '合成社区作业 102']);
  await expect(preview(page)).toContainText('作业 404 已删除');
  await preview(page).getByRole('button', { name: '关闭导入预览', exact: true }).click();
  await library(page).getByRole('tab', { name: '本地作业', exact: false }).click();
  await expect(library(page).getByRole('button', { name: '合成有序作业集', exact: true })).toBeVisible();
  await library(page).getByRole('button', { name: '合成有序作业集', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(2);
});

test('whole-set capacity is checked before importing any members or changing the queue', async ({ page }) => {
  await page.goto('/');
  const existing = await seed(page, '容量边界原作业');
  const workspace = await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind: 'Copilot' });
  await call(page, 'copilot.workspace.save', { workspace: { ...workspace, queue: Array.from({ length: 99 }, (_, index) => ({ id: `capacity-${index}`, versionId: existing.versionId, enabled: true, isRaid: false, navName: '' })) } });
  await enter(page);
  await queue(page).getByRole('tab', { name: '悖论模拟', exact: true }).click();
  await library(page).getByRole('tab', { name: '社区作业集', exact: true }).click();
  await library(page).getByRole('button', { name: '查看详情 合成有序作业集', exact: true }).click();
  await preview(page).getByRole('button', { name: '全集导入并加入队列', exact: true }).click();
  await expect(page.locator('.cp-feedback[role="alert"]')).toContainText('每个队列最多 100 项');
  expect((await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind: 'Copilot' })).queue).toHaveLength(99);
  expect((await call<{ total: number }>(page, 'copilot.list')).total).toBe(1);
  expect((await call<{ items: CopilotCategory[] }>(page, 'copilot.category.list')).items).toEqual([]);
  await expect(queue(page).getByRole('tab', { name: '悖论模拟', exact: true })).toHaveAttribute('aria-selected', 'true');
});
