import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { navigate as nav, readSnapshot as snapshot } from './fixtures/navigation';

const wb = (page: Page) => page.getByRole('region', { name: '任务表工作台', exact: true });
const menu = (page: Page) => page.getByRole('menu');
async function openFarm(page: Page) {
  await page.goto('/');
  await nav(page, '任务');
  await page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }).click();
}
async function saved(page: Page) {
  await expect(wb(page).locator('.wb-save-state')).toHaveText('已保存');
}

test('valid parameters and metadata automatically persist without manual saving', async ({
  page,
}) => {
  await openFarm(page);
  await wb(page).getByLabel('作战次数', { exact: true }).fill('17');
  await saved(page);
  expect((await snapshot(page)).plans.find((p) => p.id === 'farm-1-7')?.tasks[0].params.times).toBe(
    17,
  );
  await wb(page).getByRole('tab', { name: '任务表设置', exact: true }).click();
  await wb(page).getByLabel('任务表名称', { exact: true }).fill('自动保存的表');
  await wb(page).getByLabel('任务表说明', { exact: true }).fill('自动保存说明');
  await wb(page).getByRole('checkbox', { name: '绑定设备本地模拟设备', exact: true }).check();
  await expect(wb(page).getByText('本表自动作战累计上限：理智药 0 · 源石 0')).toBeVisible();
  await expect(wb(page).getByLabel('任务表理智药上限', { exact: true })).toHaveCount(0);
  await saved(page);
  await page.reload();
  await nav(page, '任务');
  await page.getByRole('button', { name: '查看任务表详情自动保存的表', exact: true }).click();
  await wb(page).getByRole('tab', { name: '任务表设置', exact: true }).click();
  await expect(wb(page).getByLabel('任务表名称', { exact: true })).toHaveValue('自动保存的表');
  await expect(wb(page).getByLabel('任务表说明', { exact: true })).toHaveValue('自动保存说明');
  await expect(
    wb(page).getByRole('checkbox', { name: '绑定设备本地模拟设备', exact: true }),
  ).toBeChecked();
  await expect(wb(page).getByText('本表自动作战累计上限：理智药 0 · 源石 0')).toBeVisible();
});

test('leaving before the debounce saves the outgoing table without redirecting navigation', async ({
  page,
}) => {
  await openFarm(page);
  await wb(page).getByLabel('作战次数', { exact: true }).fill('19');
  await closeDetail(page);
  await page.getByRole('button', { name: '查看任务表详情每日长草计划', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await snapshot(page)).plans.find((p) => p.id === 'farm-1-7')?.tasks[0].params.times,
    )
    .toBe(19);
  await expect(wb(page).getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
});

test('edits remain available during a slow save and the final write wins', async ({ page }) => {
  await openFarm(page);
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness;
    const call = api.call;
    Object.assign(api, { releaseSave: () => {}, saveCount: 0 });
    let first = true;
    api.call = async (method, params) => {
      if (method === 'plan.save') {
        Object.assign(api, { saveCount: (api as unknown as { saveCount: number }).saveCount + 1 });
        if (first) {
          first = false;
          await new Promise<void>((resolve) => Object.assign(api, { releaseSave: resolve }));
        }
      }
      return call(method, params);
    };
  });
  await wb(page).getByLabel('作战次数', { exact: true }).fill('11');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('正在保存…');
  await wb(page).getByLabel('作战次数', { exact: true }).fill('23');
  await page.evaluate(() =>
    (
      (window as HarnessWindow).runtimeHarness as unknown as { releaseSave: () => void }
    ).releaseSave(),
  );
  await saved(page);
  await expect(wb(page).getByLabel('作战次数', { exact: true })).toHaveValue('23');
  expect((await snapshot(page)).plans.find((p) => p.id === 'farm-1-7')?.tasks[0].params.times).toBe(
    23,
  );
});

test('failed and invalid saves retain drafts and can be corrected or retried', async ({ page }) => {
  await openFarm(page);
  await wb(page).locator('.advanced-params summary').click();
  await wb(page).getByLabel('任务参数 JSON').fill('{"times":');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('保存失败');
  expect((await snapshot(page)).plans.find((p) => p.id === 'farm-1-7')?.tasks[0].params.times).toBe(
    6,
  );
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness;
    const call = api.call;
    let fail = true;
    api.call = async (method, params) => {
      if (method === 'plan.save' && fail) {
        fail = false;
        throw new Error('合成保存故障');
      }
      return call(method, params);
    };
  });
  await wb(page)
    .getByLabel('任务参数 JSON')
    .fill('{"stage":"1-7","times":29,"medicine":0,"stone":0}');
  await expect(wb(page).getByRole('alert')).toContainText('自动保存失败');
  await wb(page).getByRole('button', { name: '重试保存', exact: true }).click();
  await saved(page);
  expect((await snapshot(page)).plans.find((p) => p.id === 'farm-1-7')?.tasks[0].params.times).toBe(
    29,
  );
});

test('deletion waits for an earlier save and never revives the deleted table', async ({ page }) => {
  await openFarm(page);
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness;
    const call = api.call;
    api.call = async (method, params) => {
      if (method === 'plan.save')
        await new Promise<void>((resolve) => Object.assign(api, { releaseSave: resolve }));
      return call(method, params);
    };
  });
  await wb(page).getByLabel('作战次数').fill('31');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('正在保存…');
  await closeDetail(page);
  await page
    .getByRole('button', { name: '查看任务表详情固源岩补给', exact: true })
    .click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '删除任务表', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '删除任务表', exact: true });
  await dialog.getByRole('button', { name: '删除任务表', exact: true }).click();
  await page.evaluate(() =>
    (
      (window as HarnessWindow).runtimeHarness as unknown as { releaseSave: () => void }
    ).releaseSave(),
  );
  await expect(dialog).toBeHidden();
  expect((await snapshot(page)).plans.some((p) => p.id === 'farm-1-7')).toBe(false);
  expect(
    await page.evaluate(() => sessionStorage.getItem('maaverge.ui.draft.farm-1-7')),
  ).toBeNull();
  await page.reload();
  await nav(page, '任务');
  await expect(
    page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }),
  ).toHaveCount(0);
});

test('the task list menu edits names, copies the current configuration and preserves selection on deleting another table', async ({
  page,
}) => {
  await openFarm(page);
  await closeDetail(page);
  const farm = page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true });
  await farm.click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '重命名', exact: true }).click();
  const name = wb(page).getByLabel('任务表名称', { exact: true });
  await expect(name).toBeFocused();
  await name.fill('新名称');
  await saved(page);
  await closeDetail(page);
  const renamed = page.getByRole('button', { name: '查看任务表详情新名称', exact: true });
  await renamed.click({ button: 'right' });
  const download = page.waitForEvent('download');
  await menu(page).getByRole('menuitem', { name: '导出任务表', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('新名称.json');
  await closeDetail(page);
  await renamed.click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '复制任务表', exact: true }).click();
  await expect(wb(page).getByRole('heading', { name: '新名称 副本', exact: true })).toBeVisible();
  await closeDetail(page);
  const copy = page.getByRole('article', { name: '任务表 新名称 副本', exact: true });
  const copyCheck = copy.getByRole('checkbox', { name: '选择任务表新名称 副本', exact: true });
  await copyCheck.check();
  await page
    .getByRole('article', { name: '任务表 每日长草计划', exact: true })
    .click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '删除任务表', exact: true }).click();
  await page
    .getByRole('dialog', { name: '删除任务表', exact: true })
    .getByRole('button', { name: '删除任务表', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(copy).toBeVisible();
  await expect(copyCheck).toBeChecked();
  await expect(page.getByRole('article', { name: '任务表 每日长草计划', exact: true })).toHaveCount(
    0,
  );
});

test('menus support keyboard navigation and preserve native menus on editable fields', async ({
  page,
}) => {
  await openFarm(page);
  await closeDetail(page);
  const target = page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true });
  await target.focus();
  await target.press('Shift+F10');
  await expect(menu(page).getByRole('menuitem', { name: '任务表设置', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu(page).getByRole('menuitem', { name: '删除任务表', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await expect(target).toBeFocused();
  await target.click();
  const prevented = await wb(page)
    .getByRole('heading', { name: '固源岩补给', exact: true })
    .evaluate(
      (element) =>
        !element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
  expect(prevented).toBe(true);
  await expect(menu(page)).toBeHidden();
  const native = await wb(page)
    .getByLabel('作战次数')
    .evaluate((element) =>
      element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
  expect(native).toBe(true);
});

test('new task tables automatically become saved task list entries', async ({ page }) => {
  await openFarm(page);
  await closeDetail(page);
  await page
    .locator('.tc-heading')
    .getByRole('button', { name: '新建任务表', exact: true })
    .click();
  await wb(page).getByLabel('任务表名称', { exact: true }).fill('新建自动保存');
  await wb(page).getByLabel('作战次数', { exact: true }).fill('7');
  await expect(wb(page).getByText('本表自动作战累计上限：理智药 0 · 源石 0')).toBeVisible();
  await saved(page);
  await expect(
    page.getByRole('button', { name: '查看任务表详情新建自动保存', exact: true }),
  ).toBeVisible();
  const plan = (await snapshot(page)).plans.find((p) => p.name === '新建自动保存')!;
  expect(plan.tasks).toHaveLength(9);
  expect(plan.tasks.find((task) => task.type === 'Fight')?.params.times).toBe(7);

  await wb(page).getByRole('tab', { name: '任务表设置', exact: true }).click();
  await wb(page).getByLabel('任务表名称', { exact: true }).fill('新建自动保存（改）');
  await wb(page).getByRole('tab', { name: '任务编排', exact: true }).click();
  await wb(page).getByLabel('作战次数', { exact: true }).fill('8');
  await saved(page);
  await page.reload();
  await nav(page, '任务');
  await page.getByRole('button', { name: '查看任务表详情新建自动保存（改）', exact: true }).click();
  await expect(wb(page).getByLabel('作战次数', { exact: true })).toHaveValue('8');
});

test('cancelled tables and unconfirmed Agent proposals do not automatically persist', async ({
  page,
}) => {
  await openFarm(page);
  await page.clock.install();
  const before = (await snapshot(page)).plans.map((p) => p.id);
  await closeDetail(page);
  await page
    .locator('.tc-heading')
    .getByRole('button', { name: '新建任务表', exact: true })
    .click();
  await wb(page).getByRole('button', { name: '取消新建', exact: true }).click();
  await page.clock.runFor(1000);
  expect((await snapshot(page)).plans.map((p) => p.id)).toEqual(before);
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /^Agent 助手/ })
    .click();
  await page.getByRole('button', { name: '制定刷 6 次 1-7 的计划', exact: true }).click();
  await page.getByRole('button', { name: '检查并保存计划', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(wb(page).locator('.wb-save-state')).toHaveText('待确认保存');
  expect((await snapshot(page)).plans.map((p) => p.id)).toEqual(before);
  await wb(page).getByRole('button', { name: '保存任务表', exact: true }).click();
  await saved(page);
  expect((await snapshot(page)).runs).toHaveLength(0);
});
