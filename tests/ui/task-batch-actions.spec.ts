import type { Page } from '@playwright/test';
import type { Run, Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

type BatchHarnessWindow = HarnessWindow & {
  batchStarts: { planId: string; deviceId: string; requestId: string }[];
  batchDeletes: string[];
};

const actions = (page: Page) => page.getByRole('group', { name: '所选任务表操作', exact: true });
const confirmation = (page: Page) =>
  page.getByRole('dialog', { name: '删除所选任务表', exact: true });
const launch = (page: Page) => page.getByRole('dialog', { name: '运行所选任务表', exact: true });
const snapshot = (page: Page) =>
  page.evaluate(
    async () =>
      (await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot,
  );
const openTasks = async (page: Page) => {
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await expect(page.getByRole('region', { name: '任务表列表', exact: true })).toBeVisible();
};
const selectAll = (page: Page) =>
  page.getByRole('checkbox', { name: '全选任务表', exact: true }).check();

test('selection actions count hidden selections, toggle visible rows and clear the whole selection', async ({
  page,
}) => {
  await page.goto('/');
  await openTasks(page);
  await expect(actions(page)).toHaveCount(0);
  await selectAll(page);
  await expect(actions(page)).toContainText('已选 2 张任务表');
  await page.getByLabel('搜索任务表', { exact: true }).fill('每日');
  await expect(
    page.getByRole('region', { name: '任务表列表', exact: true }).getByRole('article'),
  ).toHaveCount(1);
  await page.getByRole('checkbox', { name: '全选任务表', exact: true }).uncheck();
  await expect(actions(page)).toContainText('已选 1 张任务表');
  await actions(page).getByRole('button', { name: '取消选择', exact: true }).click();
  await expect(actions(page)).toHaveCount(0);
  await page.getByLabel('搜索任务表', { exact: true }).fill('');
  await expect(
    page.getByRole('checkbox', { name: '选择任务表固源岩补给', exact: true }),
  ).not.toBeChecked();
  await expect(
    page.locator('.tc-heading').getByRole('button', { name: '运行', exact: true }),
  ).toBeDisabled();
});

test('two tables bound to the same device cannot start together', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const state = (await api.call('app.snapshot', {})) as Snapshot;
    for (const plan of state.plans)
      await api.call('plan.save', { plan: { ...plan, deviceId: 'mock-device-1' } });
  });
  await openTasks(page);
  await selectAll(page);
  await actions(page).getByRole('button', { name: '同时执行', exact: true }).click();
  await expect(launch(page).getByText('同一设备只能运行一张任务表', { exact: true })).toHaveCount(
    2,
  );
  await expect(
    launch(page).getByRole('button', { name: '运行 2 张任务表', exact: true }),
  ).toBeDisabled();
  expect((await snapshot(page)).runs).toHaveLength(0);
  await launch(page).getByRole('button', { name: '取消', exact: true }).click();
  await expect(actions(page)).toContainText('已选 2 张任务表');
});

test('tables bound to different devices submit concurrently with distinct request identifiers', async ({
  page,
}) => {
  await page.goto('/');
  const secondDevice = await page.evaluate(async () => {
    const target = window as BatchHarnessWindow;
    const api = target.runtimeHarness;
    const device = (await api.call('device.connect', {
      address: '127.0.0.1:5581',
      name: '批量执行实例',
    })) as { id: string };
    const state = (await api.call('app.snapshot', {})) as Snapshot;
    for (const plan of state.plans)
      await api.call('plan.save', {
        plan: { ...plan, deviceId: plan.id === 'daily' ? 'mock-device-1' : device.id },
      });
    target.batchStarts = [];
    const original = api.call;
    let release!: () => void;
    const bothSubmitted = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.call = async (method, params) => {
      if (method === 'run.start') {
        target.batchStarts.push(params as (typeof target.batchStarts)[number]);
        if (target.batchStarts.length === 2) release();
        await bothSubmitted;
      }
      return original(method, params);
    };
    return device.id;
  });
  await openTasks(page);
  await selectAll(page);
  await actions(page).getByRole('button', { name: '同时执行', exact: true }).click();
  await launch(page).getByRole('button', { name: '运行 2 张任务表', exact: true }).click();
  await expect(launch(page)).toBeHidden();
  const state = await snapshot(page);
  expect(
    state.runs
      .filter((run) => run.status === 'running')
      .map((run) => `${run.planId}:${run.deviceId}`)
      .sort(),
  ).toEqual(['daily:mock-device-1', `farm-1-7:${secondDevice}`].sort());
  const requests = await page.evaluate(() => (window as BatchHarnessWindow).batchStarts);
  expect(new Set(requests.map((request) => request.requestId)).size).toBe(2);
  expect(requests.every((request) => !!request.requestId)).toBeTruthy();
  await expect(page.getByRole('tab', { name: '任务表', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('a selected device going offline blocks launch but can be deselected to run on the remaining device', async ({
  page,
}) => {
  await page.goto('/');
  const secondDevice = await page.evaluate(async () => {
    const device = (await (window as HarnessWindow).runtimeHarness.call('device.connect', {
      address: '127.0.0.1:5583',
      name: '临时离线实例',
    })) as { id: string };
    return device.id;
  });
  await openTasks(page);
  await page.getByRole('checkbox', { name: '选择任务表每日长草计划', exact: true }).check();
  await actions(page).getByRole('button', { name: '同时执行', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '运行任务表', exact: true });
  const offlineChoice = dialog.getByRole('checkbox', { name: '选择设备临时离线实例', exact: true });
  await dialog.getByRole('checkbox', { name: '选择设备本地模拟设备', exact: true }).check();
  await offlineChoice.check();
  await page.evaluate(async (deviceId) => {
    await (window as HarnessWindow).runtimeHarness.call('device.disconnect', { id: deviceId });
  }, secondDevice);
  await expect(dialog.getByRole('button', { name: '在 2 台设备运行', exact: true })).toBeDisabled();
  await expect(offlineChoice).toBeChecked();
  await expect(offlineChoice).toBeEnabled();
  await offlineChoice.uncheck();
  const start = dialog.getByRole('button', { name: '在 1 台设备运行', exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(dialog).toBeHidden();
  const state = await snapshot(page);
  expect(state.runs.filter((run) => run.status === 'running').map((run) => run.deviceId)).toEqual([
    'mock-device-1',
  ]);
  expect(state.runs.some((run) => run.deviceId === secondDevice)).toBeFalsy();
});

test('batch deletion requires confirmation, clears deleted drafts and stays deleted after reload while keeping history', async ({
  page,
}) => {
  await page.goto('/');
  const historyId = await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const run = (await api.call('run.start', {
      planId: 'farm-1-7',
      deviceId: 'mock-device-1',
      requestId: 'batch-delete-history',
    })) as Run;
    await api.call('run.stop', { id: run.id });
    return run.id;
  });
  await openTasks(page);
  await page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }).click();
  await page.getByRole('button', { name: '关闭任务表详情', exact: true }).click();
  await page.evaluate(() => {
    sessionStorage.setItem('maaverge.ui.draft.daily', 'daily draft');
    sessionStorage.setItem('maaverge.ui.draft.farm-1-7', 'farm draft');
  });
  await selectAll(page);
  await actions(page).getByRole('button', { name: '批量删除', exact: true }).click();
  await expect(confirmation(page)).toContainText('每日长草计划');
  await expect(confirmation(page)).toContainText('固源岩补给');
  await expect(confirmation(page)).toContainText('执行记录会保留');
  await confirmation(page).getByRole('button', { name: '取消', exact: true }).click();
  expect((await snapshot(page)).plans).toHaveLength(2);
  await expect(actions(page)).toContainText('已选 2 张任务表');
  await actions(page).getByRole('button', { name: '批量删除', exact: true }).click();
  await confirmation(page).getByRole('button', { name: '删除 2 张任务表', exact: true }).click();
  await expect(confirmation(page)).toBeHidden();
  await expect(actions(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '创建第一张任务表', exact: true })).toBeVisible();
  expect((await snapshot(page)).runs.some((run) => run.id === historyId)).toBeTruthy();
  expect(
    await page.evaluate(() => [
      sessionStorage.getItem('maaverge.ui.draft.daily'),
      sessionStorage.getItem('maaverge.ui.draft.farm-1-7'),
      localStorage.getItem('maaverge:ui:selected-plan'),
    ]),
  ).toEqual([null, null, null]);
  await page.reload();
  expect((await snapshot(page)).plans).toHaveLength(0);
  expect((await snapshot(page)).runs.some((run) => run.id === historyId)).toBeTruthy();
});

test('partial deletion preserves failed drafts and retries only the failed table', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const target = window as BatchHarnessWindow;
    const api = target.runtimeHarness;
    const original = api.call;
    let failed = false;
    target.batchDeletes = [];
    api.call = async (method, params) => {
      if (method === 'plan.save' && (params.plan as { id: string }).id === 'farm-1-7')
        throw new Error('合成草稿保存故障');
      if (method === 'plan.delete') {
        target.batchDeletes.push(String(params.id));
        if (params.id === 'farm-1-7' && !failed) {
          failed = true;
          throw new Error('合成批量删除故障');
        }
      }
      return original(method, params);
    };
  });
  await openTasks(page);
  await page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }).click();
  const workbench = page.getByRole('region', { name: '任务表工作台', exact: true });
  await workbench.getByLabel('作战次数').fill('9');
  await expect(page.getByRole('alert').filter({ hasText: '合成草稿保存故障' })).toBeVisible();
  await page.getByRole('button', { name: '关闭任务表详情', exact: true }).click();
  const draft = await page.evaluate(() => sessionStorage.getItem('maaverge.ui.draft.farm-1-7'));
  expect(draft).toBeTruthy();
  await selectAll(page);
  await actions(page).getByRole('button', { name: '批量删除', exact: true }).click();
  await confirmation(page).getByRole('button', { name: '删除 2 张任务表', exact: true }).click();
  await expect(confirmation(page)).toContainText('合成批量删除故障');
  await expect(confirmation(page)).not.toContainText('每日长草计划');
  await expect(actions(page)).toContainText('已选 1 张任务表');
  expect((await snapshot(page)).plans.map((plan) => plan.id)).toEqual(['farm-1-7']);
  expect(await page.evaluate(() => sessionStorage.getItem('maaverge.ui.draft.farm-1-7'))).toBe(
    draft,
  );
  await confirmation(page).getByRole('button', { name: '删除 1 张任务表', exact: true }).click();
  await expect(confirmation(page)).toBeHidden();
  expect((await snapshot(page)).plans).toHaveLength(0);
  expect(await page.evaluate(() => (window as BatchHarnessWindow).batchDeletes.sort())).toEqual([
    'daily',
    'farm-1-7',
    'farm-1-7',
  ]);
  expect(
    await page.evaluate(() => sessionStorage.getItem('maaverge.ui.draft.farm-1-7')),
  ).toBeNull();
});

test('a selected table becoming active blocks the whole batch deletion', async ({ page }) => {
  await page.goto('/');
  await openTasks(page);
  await selectAll(page);
  await actions(page).getByRole('button', { name: '批量删除', exact: true }).click();
  await page.evaluate(async () => {
    await (window as HarnessWindow).runtimeHarness.call('run.start', {
      planId: 'daily',
      deviceId: 'mock-device-1',
      requestId: 'batch-delete-race',
    });
  });
  await expect(
    confirmation(page).getByRole('button', { name: '删除 2 张任务表', exact: true }),
  ).toBeDisabled();
  await expect(confirmation(page)).toContainText('先停止');
  expect((await snapshot(page)).plans).toHaveLength(2);
});

for (const [name, width, height, colorScheme] of [
  ['desktop-light', 1440, 900, 'light'],
  ['desktop-dark', 1280, 800, 'dark'],
  ['narrow-light', 390, 844, 'light'],
  ['narrow-dark', 390, 844, 'dark'],
] as const) {
  test(`batch selection and dialogs fit the viewport: ${name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await openTasks(page);
    await selectAll(page);
    await page.setViewportSize({ width, height });
    await expect(actions(page)).toBeVisible();
    const noOverflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
    expect(await noOverflow()).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`${name}-selection.png`), fullPage: true });
    await actions(page).getByRole('button', { name: '同时执行', exact: true }).click();
    await expect(launch(page)).toBeVisible();
    expect(await noOverflow()).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`${name}-launch.png`), fullPage: true });
    await launch(page).getByRole('button', { name: '取消', exact: true }).click();
    await actions(page).getByRole('button', { name: '批量删除', exact: true }).click();
    await expect(confirmation(page)).toBeVisible();
    expect(await noOverflow()).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`${name}-delete.png`), fullPage: true });
  });
}
