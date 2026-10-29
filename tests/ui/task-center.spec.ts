import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const center = (page: Page) => page.getByRole('region', { name: '任务中心', exact: true });
const list = (page: Page) => page.getByRole('region', { name: '任务表列表', exact: true });
const drawer = (page: Page) => page.getByRole('dialog', { name: '任务表详情', exact: true });
const wb = (page: Page) => page.getByRole('region', { name: '任务表工作台', exact: true });
const snapshot = (page: Page) =>
  page.evaluate(
    async () =>
      (await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot,
  );
const nav = async (page: Page, name: string) => {
  const close = page.getByRole('button', { name: '关闭任务表详情', exact: true });
  if (await close.isVisible()) await close.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name, exact: name !== 'Agent 助手' })
    .click();
};
test('one task entry combines the table list, detail drawer and execution tab', async ({
  page,
}) => {
  await page.goto('/');
  const sidebar = page.locator('.sidebar');
  await expect(sidebar.getByRole('button', { name: '任务', exact: true })).toHaveCount(1);
  await expect(sidebar.getByRole('button', { name: /专项任务|任务表执行|任务表$/ })).toHaveCount(0);
  await sidebar.getByRole('button', { name: '任务', exact: true }).click();
  await expect(center(page)).toBeVisible();
  await expect(page.locator('.primary-nav .nav-item[aria-current="page"]')).toHaveText('任务');
  const tabs = page.getByRole('tablist', { name: '任务视图', exact: true });
  await expect(tabs.getByRole('tab', { name: '任务表', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(list(page).getByRole('article')).toHaveCount(2);
  await expect(list(page)).toContainText('每日长草计划');

  await list(page).getByRole('button', { name: '查看任务表详情每日长草计划', exact: true }).click();
  await expect(drawer(page)).toBeVisible();
  await expect(wb(page).getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
  await wb(page).getByRole('tab', { name: '任务表设置', exact: true }).click();
  await expect(wb(page).getByLabel('任务分组', { exact: true })).toHaveCount(0);
  await expect(wb(page).getByLabel('绑定设备', { exact: true })).toBeVisible();
  await wb(page).getByLabel('任务表说明', { exact: true }).fill('抽屉自动保存');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('已保存');

  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  await expect(wb(page)).toHaveCount(0);
  await expect(
    list(page).getByRole('article', { name: '任务表 每日长草计划', exact: true }),
  ).toBeVisible();
  await list(page).getByRole('checkbox', { name: '选择任务表每日长草计划', exact: true }).check();
  await list(page).getByRole('button', { name: '查看任务表详情每日长草计划', exact: true }).click();
  await expect(wb(page).getByRole('tab', { name: '任务编排', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await wb(page).getByRole('tab', { name: '任务表设置', exact: true }).click();
  await expect(wb(page).getByLabel('任务表说明', { exact: true })).toHaveValue('抽屉自动保存');
  await page
    .getByRole('button', { name: '关闭任务表详情遮罩', exact: true })
    .click({ position: { x: 8, y: 8 } });
  await expect(drawer(page)).toBeHidden();

  await page.getByRole('tab', { name: '执行监控', exact: true }).click();
  await expect(page.getByRole('region', { name: '任务表执行监控', exact: true })).toBeVisible();
  await expect(list(page)).toHaveCount(0);
});

test('search, home shortcut and Agent proposals open the unified task center', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /任务消耗设置/ }).click();
  await expect(center(page)).toBeVisible();
  await expect(wb(page)).toHaveCount(0);

  const search = page.getByLabel('搜索任务与设置', { exact: true });
  await search.fill('固源岩');
  await page
    .getByRole('region', { name: '搜索结果', exact: true })
    .getByRole('button', { name: /固源岩补给/ })
    .click();
  await expect(drawer(page)).toBeVisible();
  await expect(wb(page).getByRole('heading', { name: '固源岩补给', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭任务表详情', exact: true }).click();

  await nav(page, 'Agent 助手');
  await page.getByRole('button', { name: '制定刷 6 次 1-7 的计划' }).click();
  await page.getByRole('button', { name: '检查并保存计划' }).click();
  await expect(drawer(page)).toBeVisible();
  await expect(wb(page).getByLabel('作战关卡')).toHaveValue('1-7');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('待确认保存');
});

test('legacy specialized tables stay in the unified list and save without a group selector', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const state = (await api.call('app.snapshot', {})) as Snapshot;
    const source = state.plans.find((plan) => plan.id === 'daily')!;
    await api.call('plan.save', {
      plan: { ...source, id: 'legacy-specialized', name: '旧专项表', group: 'specialized' },
    });
  });
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await nav(page, '任务');
  await expect(
    list(page).getByRole('article', { name: '任务表 旧专项表', exact: true }),
  ).toBeVisible();
  await list(page).getByRole('button', { name: '查看任务表详情旧专项表', exact: true }).click();
  await expect(wb(page).getByRole('heading', { name: '旧专项表', exact: true })).toBeVisible();
  await wb(page).getByRole('tab', { name: '任务表设置', exact: true }).click();
  await expect(wb(page).getByLabel('任务分组', { exact: true })).toHaveCount(0);
  await wb(page).getByLabel('任务表名称', { exact: true }).fill('旧专项表改名');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('已保存');
  const saved = (await snapshot(page)).plans.find((plan) => plan.id === 'legacy-specialized')!;
  expect(saved.name).toBe('旧专项表改名');
  expect(saved.group).toBe('specialized');
  await page.getByRole('button', { name: '关闭任务表详情', exact: true }).click();
  await expect(
    list(page).getByRole('button', { name: '查看任务表详情旧专项表改名', exact: true }),
  ).toBeVisible();
});

test('multi-device launch blocks binding, offline and busy devices and starts on idle ones', async ({
  page,
}) => {
  await page.goto('/');
  const devices = await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const offline = (await api.call('device.connect', {
      address: '127.0.0.1:5561',
      name: '离线实例',
    })) as { id: string };
    await api.call('device.disconnect', { id: offline.id });
    const busy = (await api.call('device.connect', {
      address: '127.0.0.1:5559',
      name: '忙碌实例',
    })) as { id: string };
    const idle = (await api.call('device.connect', {
      address: '127.0.0.1:5563',
      name: '空闲实例',
    })) as { id: string };
    const state = (await api.call('app.snapshot', {})) as Snapshot;
    const farm = state.plans.find((plan) => plan.id === 'farm-1-7')!;
    await api.call('plan.save', { plan: { ...farm, deviceId: 'mock-device-1' } });
    return { busy: busy.id, idle: idle.id };
  });
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(async (busy) => {
    await (window as HarnessWindow).runtimeHarness.call('run.start', {
      planId: 'daily',
      deviceId: busy,
      requestId: 'busy-launch',
    });
  }, devices.busy);
  await expect(page.getByRole('region', { name: '当前执行', exact: true })).toContainText(
    '每日长草计划',
  );
  await nav(page, '任务');
  const runButton = page.locator('.tc-heading').getByRole('button', { name: '运行', exact: true });
  await expect(runButton).toBeDisabled();
  await page.getByRole('checkbox', { name: '选择任务表每日长草计划', exact: true }).check();
  await expect(runButton).toBeEnabled();
  await expect(runButton).toHaveText('运行');
  await runButton.click();
  const modal = page.getByRole('dialog', { name: '运行任务表', exact: true });
  await expect(modal).toContainText('每日长草计划');
  await expect(modal.getByLabel('选择启动任务表', { exact: true })).toHaveCount(0);
  for (const [name, reason] of [
    ['离线实例', '离线，请先连接'],
    ['忙碌实例', '正在执行其他任务'],
  ] as const) {
    await expect(
      modal.getByRole('checkbox', { name: `选择设备${name}`, exact: true }),
    ).toBeDisabled();
    await expect(modal.getByText(reason, { exact: true })).toBeVisible();
  }
  await expect(
    modal.getByRole('checkbox', { name: '选择设备空闲实例', exact: true }),
  ).toBeEnabled();
  await expect(
    modal.getByRole('checkbox', { name: '选择设备本地模拟设备', exact: true }),
  ).toBeEnabled();

  await modal.getByRole('checkbox', { name: '选择设备本地模拟设备', exact: true }).check();
  await modal.getByRole('checkbox', { name: '选择设备空闲实例', exact: true }).check();
  await modal.getByRole('button', { name: '在 2 台设备运行', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect
    .poll(async () => {
      const state = await snapshot(page);
      return state.runs.filter(
        (run) =>
          run.planId === 'daily' &&
          run.status === 'running' &&
          (run.deviceId === 'mock-device-1' || run.deviceId === devices.idle),
      ).length;
    })
    .toBe(2);
  await expect(
    list(page).getByRole('article', { name: '任务表 每日长草计划', exact: true }),
  ).toContainText('执行中');
  await expect(page.getByRole('tab', { name: '任务表', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('multi-device launch keeps failures visible and finishes the successful devices', async ({
  page,
}) => {
  await page.goto('/');
  const idle = await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const device = (await api.call('device.connect', {
      address: '127.0.0.1:5565',
      name: '失败实例',
    })) as { id: string };
    const call = api.call;
    api.call = async (method, params) => {
      if (method === 'run.start' && params.deviceId === device.id) throw new Error('合成启动失败');
      return call(method, params);
    };
    return device.id;
  });
  await nav(page, '任务');
  await page.getByRole('checkbox', { name: '选择任务表每日长草计划', exact: true }).check();
  await page.locator('.tc-heading').getByRole('button', { name: '运行', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '运行任务表', exact: true });
  await expect(modal).toContainText('每日长草计划');
  await modal.getByRole('checkbox', { name: '选择设备本地模拟设备', exact: true }).check();
  await modal.getByRole('checkbox', { name: '选择设备失败实例', exact: true }).check();
  await modal.getByRole('button', { name: '在 2 台设备运行', exact: true }).click();
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('status')).toContainText('已在 1 台设备开始执行，1 台失败。');
  await expect(
    modal.getByText('启动失败，请查看提示或连接状态后重试', { exact: true }),
  ).toHaveCount(1);
  await expect
    .poll(async () =>
      (await snapshot(page)).runs
        .filter((run) => run.status === 'running')
        .map((run) => run.deviceId),
    )
    .toEqual(['mock-device-1']);
  expect((await snapshot(page)).runs.filter((run) => run.deviceId === idle)).toHaveLength(0);
  await modal.getByRole('button', { name: '取消', exact: true }).click();
  await expect(modal).toBeHidden();
});

test('multiple selected tables run on their bound or chosen devices and reject duplicate targets', async ({
  page,
}) => {
  await page.goto('/');
  const idle = await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const device = (await api.call('device.connect', {
      address: '127.0.0.1:5567',
      name: '备用实例',
    })) as { id: string };
    const state = (await api.call('app.snapshot', {})) as Snapshot;
    const farm = state.plans.find((plan) => plan.id === 'farm-1-7')!;
    await api.call('plan.save', { plan: { ...farm, deviceId: 'mock-device-1' } });
    return device.id;
  });
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await nav(page, '任务');
  const runButton = page.locator('.tc-heading').getByRole('button', { name: '运行', exact: true });
  await expect(runButton).toBeDisabled();
  await page.getByRole('checkbox', { name: '选择任务表每日长草计划', exact: true }).check();
  await page.getByRole('checkbox', { name: '选择任务表固源岩补给', exact: true }).check();
  await runButton.click();
  const modal = page.getByRole('dialog', { name: '运行所选任务表', exact: true });
  await expect(
    modal.getByRole('checkbox', { name: '选择运行任务表每日长草计划', exact: true }),
  ).toBeChecked();
  await expect(
    modal.getByRole('checkbox', { name: '选择运行任务表固源岩补给', exact: true }),
  ).toBeChecked();
  await expect(modal).toContainText('绑定 本地模拟设备');
  await expect(modal.getByLabel('为固源岩补给选择设备', { exact: true })).toHaveCount(0);
  const target = modal.getByLabel('为每日长草计划选择设备', { exact: true });
  await expect(target).toHaveValue(idle);
  await target.selectOption('mock-device-1');
  await expect(modal.getByText('同一设备只能运行一张任务表', { exact: true })).toHaveCount(2);
  await expect(modal.getByRole('button', { name: '运行 2 张任务表', exact: true })).toBeDisabled();
  await target.selectOption(idle);
  await expect(modal.getByRole('button', { name: '运行 2 张任务表', exact: true })).toBeEnabled();
  await modal.getByRole('button', { name: '运行 2 张任务表', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect
    .poll(async () =>
      (await snapshot(page)).runs
        .filter((run) => run.status === 'running')
        .map((run) => `${run.planId}:${run.deviceId}`)
        .sort(),
    )
    .toEqual(['daily:' + idle, 'farm-1-7:mock-device-1'].sort());
});
