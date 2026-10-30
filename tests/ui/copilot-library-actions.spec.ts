import type { Page } from '@playwright/test';
import type {
  CopilotCategory,
  CopilotPreview,
  CopilotRecord,
  CopilotWorkspace,
  Snapshot,
} from '../../packages/contracts/src/index';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const queue = (page: Page) => page.getByRole('region', { name: '作业执行队列', exact: true });
const all = (page: Page) =>
  library(page).getByRole('checkbox', { name: '全选本页作业', exact: true });
const removeDialog = (page: Page, category = false) =>
  page.getByRole('dialog', { name: category ? '删除分类' : '删除作业', exact: true });
const call = <T>(page: Page, method: string, params: Record<string, unknown> = {}) =>
  page.evaluate(
    ({ method, params }) =>
      (window as unknown as HarnessWindow).runtimeHarness.call(method, params),
    { method, params },
  ) as Promise<T>;

async function seed(page: Page, title: string) {
  const preview = await call<CopilotPreview>(page, 'copilot.preview', {
    content: JSON.stringify({ stage_name: 'main_01-07', doc: { title }, actions: [] }),
  });
  return (await call<{ items: CopilotRecord[] }>(page, 'copilot.import', { previewId: preview.id }))
    .items[0];
}

async function enter(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
}

async function openCategoryMenu(page: Page, name: string) {
  await library(page).getByRole('button', { name, exact: true }).click({ button: 'right' });
}

test('the local station selects visible work and resets selection after paging, searching and changing category', async ({
  page,
}) => {
  await page.goto('/');
  const records: CopilotRecord[] = [];
  for (let index = 1; index <= 22; index++) records.push(await seed(page, `本地选择 ${index}`));
  const category = await call<CopilotCategory>(page, 'copilot.category.save', { name: '选择分类' });
  await call(page, 'copilot.category.assign', { ids: [records[0].id], categoryId: category.id });
  await enter(page);
  await expect(library(page).locator('.cp-record')).toHaveCount(20);
  await expect(all(page)).not.toBeChecked();
  await library(page).getByRole('checkbox', { name: '选择作业 本地选择 1', exact: true }).check();
  await expect(all(page)).toHaveJSProperty('indeterminate', true);
  await all(page).click();
  await expect(all(page)).toBeChecked();
  await expect(library(page).getByRole('checkbox', { name: /^选择作业 / })).toHaveCount(20);
  for (const input of await library(page)
    .getByRole('checkbox', { name: /^选择作业 / })
    .all()) {
    await expect(input).toBeChecked();
  }
  await library(page).getByRole('button', { name: '本地作业下一页', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(2);
  await expect(all(page)).not.toBeChecked();
  await expect(all(page)).toHaveJSProperty('indeterminate', false);
  await all(page).check();
  await library(page).getByRole('button', { name: '本地作业上一页', exact: true }).click();
  await expect(all(page)).not.toBeChecked();
  await all(page).check();
  await library(page).getByRole('searchbox').fill('本地选择 22');
  await expect(library(page).locator('.cp-record')).toHaveCount(0);
  await expect(all(page)).toBeDisabled();
  await library(page).getByRole('searchbox').fill('本地选择 1');
  await expect(library(page).locator('.cp-record')).toHaveCount(11);
  await all(page).check();
  await library(page).getByRole('button', { name: '选择分类', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(1);
  await expect(all(page)).not.toBeChecked();
  await expect(all(page)).toHaveJSProperty('indeterminate', false);
});

test('batch deletion requires confirmation and preserves unselected work and queued versions', async ({
  page,
}) => {
  await page.goto('/');
  const records = await Promise.all(
    ['批删甲', '批删乙', '保留丙'].map((title) => seed(page, title)),
  );
  const original = await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind: 'Copilot' });
  const workspace = {
    ...original,
    queue: [
      {
        id: 'keep-queued',
        versionId: records[0].versionId,
        enabled: true,
        isRaid: false,
        navName: '',
      },
    ],
  };
  await call(page, 'copilot.workspace.save', { workspace });
  await enter(page);
  for (const title of ['批删甲', '批删乙']) {
    await library(page)
      .getByRole('checkbox', { name: `选择作业 ${title}`, exact: true })
      .check();
  }
  await library(page).getByRole('button', { name: '删除所选', exact: true }).click();
  await expect(removeDialog(page)).toBeVisible();
  await expect(library(page).locator('.cp-record')).toHaveCount(3);
  await removeDialog(page).getByRole('button', { name: '取消', exact: true }).click();
  await expect(
    library(page).getByRole('checkbox', { name: '选择作业 批删甲', exact: true }),
  ).toBeChecked();
  await library(page).getByRole('button', { name: '删除所选', exact: true }).click();
  await removeDialog(page).getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(removeDialog(page)).toHaveCount(0);
  await expect(library(page).locator('.cp-record')).toHaveCount(1);
  await expect(library(page).locator('.cp-record-main')).toContainText('保留丙');
  expect(await call(page, 'copilot.workspace.get', { kind: 'Copilot' })).toEqual(workspace);
  await expect(queue(page).locator('.cp-queue-title strong')).toHaveText(['批删甲']);
});

test('category context menus can remove only the category or explicitly delete its work too', async ({
  page,
}) => {
  await page.goto('/');
  const kept = await seed(page, '分类删除后保留');
  const removed = await seed(page, '分类连同删除');
  const first = await call<CopilotCategory>(page, 'copilot.category.save', { name: '只删分类' });
  const second = await call<CopilotCategory>(page, 'copilot.category.save', {
    name: '连同作业分类',
  });
  await call(page, 'copilot.category.assign', { ids: [kept.id], categoryId: first.id });
  await call(page, 'copilot.category.assign', { ids: [removed.id], categoryId: second.id });
  await enter(page);
  await openCategoryMenu(page, '只删分类');
  await page.getByRole('menuitem', { name: '删除分类', exact: true }).click();
  await expect(
    removeDialog(page, true).getByRole('checkbox', { name: '同时删除分类中的作业', exact: true }),
  ).not.toBeChecked();
  await removeDialog(page, true).getByRole('button', { name: '取消', exact: true }).click();
  expect(
    (await call<{ items: CopilotCategory[] }>(page, 'copilot.category.list')).items,
  ).toHaveLength(2);
  await openCategoryMenu(page, '只删分类');
  await page.getByRole('menuitem', { name: '删除分类', exact: true }).click();
  await removeDialog(page, true).getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(library(page).getByRole('button', { name: '只删分类', exact: true })).toHaveCount(0);
  expect(
    (await call<{ items: CopilotRecord[] }>(page, 'copilot.list')).items.find(
      (item) => item.id === kept.id,
    )?.categoryId,
  ).toBeNull();
  await openCategoryMenu(page, '连同作业分类');
  await page.getByRole('menuitem', { name: '删除分类', exact: true }).click();
  await removeDialog(page, true)
    .getByRole('checkbox', { name: '同时删除分类中的作业', exact: true })
    .check();
  await page.setViewportSize({ width: 390, height: 844 });
  await removeDialog(page, true).getByRole('button', { name: '确认删除', exact: true }).click();
  expect(
    (await call<{ items: CopilotRecord[] }>(page, 'copilot.list')).items.map((item) => item.id),
  ).toEqual([kept.id]);
});

test('the All category deletion clears the entire library across pages and active filters', async ({
  page,
}) => {
  await page.goto('/');
  const records: CopilotRecord[] = [];
  for (let index = 1; index <= 23; index++) records.push(await seed(page, `全部删除 ${index}`));
  const category = await call<CopilotCategory>(page, 'copilot.category.save', { name: '局部筛选' });
  await call(page, 'copilot.category.assign', { ids: [records[0].id], categoryId: category.id });
  await enter(page);
  await library(page).getByRole('button', { name: '局部筛选', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(1);
  await openCategoryMenu(page, '全部');
  await page.getByRole('menuitem', { name: '删除全部作业', exact: true }).click();
  await removeDialog(page).getByRole('button', { name: '取消', exact: true }).click();
  expect((await call<{ total: number }>(page, 'copilot.list')).total).toBe(23);
  await openCategoryMenu(page, '全部');
  await page.getByRole('menuitem', { name: '删除全部作业', exact: true }).click();
  await removeDialog(page).getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(0);
  expect((await call<{ total: number }>(page, 'copilot.list')).total).toBe(0);
  expect((await call<{ items: CopilotCategory[] }>(page, 'copilot.category.list')).items).toEqual([
    category,
  ]);
});

test('JSON deletion and storage selections save automatically and survive reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '数据与诊断', exact: true }).click();
  const directory = page.getByRole('textbox', { name: '作业 JSON 存放目录', exact: true });
  const deleteFiles = page.getByRole('switch', {
    name: '删除作业时同时删除 JSON 文件',
    exact: true,
  });
  const initial = await call<{ directory: string }>(page, 'copilot.storage.info');
  expect(initial.directory.replaceAll('\\', '/')).toMatch(/\/cache\/copilot$/u);
  await expect(directory).toHaveValue('');
  await expect(directory).toHaveAttribute('placeholder', initial.directory);
  await expect(deleteFiles).not.toBeChecked();
  const custom = 'C:\\Synthetic Copilot\\JSON';
  await page.evaluate((directory) => {
    (window as HarnessWindow).runtimeHarness.directorySelection = directory;
  }, custom);
  await page.getByRole('button', { name: '选择作业目录', exact: true }).click();
  await expect
    .poll(
      async () => (await call<Snapshot>(page, 'app.snapshot')).settings.copilotStorage?.directory,
    )
    .toBe(custom);
  await deleteFiles.check();
  await expect
    .poll(async () => (await call<Snapshot>(page, 'app.snapshot')).settings.copilotStorage)
    .toEqual({
      directory: custom,
      deleteJsonFiles: true,
    });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '数据与诊断', exact: true }).click();
  await expect(directory).toHaveValue(custom);
  await expect(deleteFiles).toBeChecked();
  await page
    .getByRole('region', { name: '作业存储与删除' })
    .getByRole('button', { name: '恢复默认目录', exact: true })
    .click();
  await expect(directory).toHaveValue('');
  await expect(deleteFiles).toBeEnabled();
  await deleteFiles.uncheck();
  await expect
    .poll(
      async () =>
        (await call<Snapshot>(page, 'app.snapshot')).settings.copilotStorage?.deleteJsonFiles,
    )
    .toBe(false);
  await expect.poll(() => call(page, 'copilot.storage.info')).toEqual(initial);
});

test('automatically saving a selected JSON directory accepts the normalized saved path', async ({
  page,
}) => {
  await page.goto('/');
  const normalized = 'C:\\Synthetic Copilot\\JSON';
  await page.evaluate((normalized) => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call;
    harness.call = async (method, params) => {
      if (method === 'settings.save') {
        const settings = structuredClone(params.settings) as Snapshot['settings'];
        if (settings.copilotStorage) settings.copilotStorage.directory = normalized;
        return original(method, { ...params, settings });
      }
      return original(method, params);
    };
  }, normalized);
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '数据与诊断', exact: true }).click();
  const directory = page.getByRole('textbox', { name: '作业 JSON 存放目录', exact: true });
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.directorySelection =
      'C:\\Synthetic Copilot\\temporary\\..\\JSON\\';
  });
  await page.getByRole('button', { name: '选择作业目录', exact: true }).click();
  await expect(directory).toHaveValue(normalized);
  expect((await call<Snapshot>(page, 'app.snapshot')).settings.copilotStorage?.directory).toBe(
    normalized,
  );
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '数据与诊断', exact: true }).click();
  await expect(directory).toHaveValue(normalized);
});

test('keyboard context menu deletion returns focus to the original category or work when cancelled', async ({
  page,
}) => {
  await page.goto('/');
  await seed(page, '右键取消后恢复焦点');
  const name = '长分类'.repeat(100);
  await call(page, 'copilot.category.save', { name });
  await enter(page);
  const record = library(page).locator('.cp-record');
  await record.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: '从作业库移除', exact: true }).click();
  await removeDialog(page).getByRole('button', { name: '取消', exact: true }).click();
  await expect(record).toBeFocused();

  const category = library(page).getByRole('button', { name, exact: true });
  await category.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: '删除分类', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 500 });
  const cancel = removeDialog(page, true).getByRole('button', { name: '取消', exact: true });
  await cancel.scrollIntoViewIfNeeded();
  await cancel.click();
  await expect(category).toBeFocused();
});

test('a failed deletion retains the dialog and selection, and can be retried in a short narrow window', async ({
  page,
}) => {
  await page.goto('/');
  await seed(page, '删除失败重试甲');
  await seed(page, '删除失败重试乙');
  const failure = '合成磁盘删除失败，请检查目标目录权限。'.repeat(50);
  await page.evaluate((failure) => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call;
    let failed = false;
    harness.call = async (method, params) => {
      if (method === 'copilot.delete' && !failed) {
        failed = true;
        throw new Error(failure);
      }
      return original(method, params);
    };
  }, failure);
  await enter(page);
  await all(page).check();
  await library(page).getByRole('button', { name: '删除所选', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 500 });
  const confirm = removeDialog(page).getByRole('button', { name: '确认删除', exact: true });
  await confirm.click();
  await expect(removeDialog(page).getByRole('alert')).toContainText('合成磁盘删除失败');
  await expect(removeDialog(page)).toBeVisible();
  expect((await call<{ total: number }>(page, 'copilot.list')).total).toBe(2);
  await expect(all(page)).toBeChecked();
  await expect(
    library(page).getByRole('checkbox', { name: '选择作业 删除失败重试甲', exact: true }),
  ).toBeChecked();
  await expect(
    library(page).getByRole('checkbox', { name: '选择作业 删除失败重试乙', exact: true }),
  ).toBeChecked();
  await confirm.scrollIntoViewIfNeeded();
  await confirm.click();
  await expect(removeDialog(page)).toHaveCount(0);
  await expect(library(page).locator('.cp-record')).toHaveCount(0);
  expect((await call<{ total: number }>(page, 'copilot.list')).total).toBe(0);
});
