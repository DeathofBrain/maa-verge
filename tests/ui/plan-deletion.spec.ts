import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const workbench = (page: Page) => page.getByRole('region', { name: '任务表工作台', exact: true });
const confirmation = (page: Page) => page.getByRole('dialog', { name: '删除任务表', exact: true });
const remove = (page: Page) =>
  workbench(page).getByRole('button', { name: '删除任务表', exact: true });
const snapshot = (page: Page) =>
  page.evaluate(
    async () =>
      (await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot,
  );
const closeDetail = async (page: Page) => {
  const close = page.getByRole('button', { name: '关闭任务表详情', exact: true });
  if (await close.isVisible()) await close.click();
};
const navigate = async (page: Page, name: string) => {
  await closeDetail(page);
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
};
async function openFarm(page: Page) {
  await page.goto('/');
  await navigate(page, '任务');
  await page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }).click();
  await expect(workbench(page).getByRole('tab', { name: '任务编排', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}
async function confirmDelete(page: Page) {
  await remove(page).click();
  await confirmation(page).getByRole('button', { name: '删除任务表', exact: true }).click();
  await expect(confirmation(page)).toBeHidden();
}

test(
  'task arrangement exposes deletion, cancel preserves the draft, and deletion keeps history after reload',
  { tag: '@smoke' },
  async ({ page }) => {
    await openFarm(page);
    await workbench(page).getByRole('button', { name: '开始执行', exact: true }).click();
    await expect(
      workbench(page).getByRole('status', { name: '任务表运行状态', exact: true }),
    ).toContainText('执行中');
    await workbench(page).getByRole('button', { name: '停止执行', exact: true }).click();
    await workbench(page).getByLabel('作战次数').fill('9');
    await remove(page).click();
    await expect(confirmation(page)).toContainText('未保存改动也会丢弃，执行记录会保留');
    await confirmation(page).getByRole('button', { name: '取消', exact: true }).click();
    await expect(workbench(page).getByLabel('作战次数')).toHaveValue('9');
    await expect(workbench(page).locator('.wb-save-state')).toHaveText('已保存');
    expect(
      (await snapshot(page)).plans.find((plan) => plan.id === 'farm-1-7')?.tasks[0].params.times,
    ).toBe(9);

    await confirmDelete(page);
    await expect(
      page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }),
    ).toHaveCount(0);
    await expect(workbench(page)).toHaveCount(0);
    expect(
      await page.evaluate(() => sessionStorage.getItem('maaverge.ui.draft.farm-1-7')),
    ).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('maaverge:ui:selected-plan'))).toBeNull();
    await navigate(page, '执行记录');
    await expect(page.getByRole('cell', { name: '固源岩补给', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^查看执行/ }).click();
    await expect(page.getByRole('region', { name: '任务表执行页面', exact: true })).toContainText(
      '固源岩补给',
    );

    await page.reload();
    await navigate(page, '任务');
    await expect(workbench(page)).toHaveCount(0);
    await page.getByRole('button', { name: '查看任务表详情每日长草计划', exact: true }).click();
    await expect(
      workbench(page).getByRole('heading', { name: '每日长草计划', exact: true }),
    ).toBeVisible();
    expect((await snapshot(page)).plans.map((plan) => plan.id)).toEqual(['daily']);
    await navigate(page, '执行记录');
    await expect(page.getByRole('cell', { name: '固源岩补给', exact: true })).toBeVisible();
  },
);

test('failed deletion preserves the table, selection and unsaved edits for a retry', async ({
  page,
}) => {
  await openFarm(page);
  await workbench(page).getByLabel('作战次数').fill('9');
  await page.evaluate(() => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const original = harness.call;
    let failed = false;
    harness.call = async (method, params) => {
      if (method === 'plan.delete' && !failed) {
        failed = true;
        throw new Error('合成删除故障');
      }
      return original(method, params);
    };
  });
  await remove(page).click();
  await confirmation(page).getByRole('button', { name: '删除任务表', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('合成删除故障');
  await expect(confirmation(page)).toBeVisible();
  expect((await snapshot(page)).plans.some((plan) => plan.id === 'farm-1-7')).toBeTruthy();
  expect(await page.evaluate(() => localStorage.getItem('maaverge:ui:selected-plan'))).toBe(
    'farm-1-7',
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem('maaverge.ui.draft.farm-1-7') || '{}').steps[0].task
          .params.times,
    ),
  ).toBe(9);
  await confirmation(page).getByRole('button', { name: '取消', exact: true }).click();
  await expect(workbench(page).getByLabel('作战次数')).toHaveValue('9');
  await confirmDelete(page);
  expect((await snapshot(page)).plans.some((plan) => plan.id === 'farm-1-7')).toBeFalsy();
});
