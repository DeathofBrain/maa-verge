import type { Page } from '@playwright/test';
import type { Device, Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const workbench = (page: Page) => page.getByRole('region', { name: '任务表工作台', exact: true });
const bindings = (page: Page) =>
  workbench(page).getByRole('group', { name: '绑定设备', exact: true });
const snapshot = (page: Page) =>
  page.evaluate(
    async () =>
      (await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot,
  );
const savedBindings = async (page: Page) =>
  (await snapshot(page)).plans.find((plan) => plan.id === 'farm-1-7')!.deviceIds;

function device(
  id: string,
  name: string,
  address: string,
  state: Device['state'] = 'idle',
): Device {
  return { id, name, address, state, coreVersion: 'v6.20.0', resourceVersion: 'synthetic' };
}

async function seed(page: Page, devices: Device[], deviceIds: string[]) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(
    async ({ devices, deviceIds }) => {
      const api = (window as HarnessWindow).runtimeHarness;
      const state = (await api.call('app.snapshot', {})) as Snapshot;
      state.settings.autoConnect = false;
      await api.call('settings.save', { settings: state.settings });
      state.devices = devices;
      const plan = state.plans.find((plan) => plan.id === 'farm-1-7')!;
      plan.deviceIds = deviceIds;
      plan.deviceId = deviceIds[0] ?? null;
      const storageKey = Object.keys(localStorage).find((key) =>
        key.startsWith('maaverge:test-runtime:v1:'),
      )!;
      localStorage.setItem(storageKey, JSON.stringify(state));
    },
    { devices, deviceIds },
  );
  await page.reload();
}

async function openPlan(page: Page, settings = true) {
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }).click();
  if (settings) await workbench(page).getByRole('tab', { name: '任务表设置', exact: true }).click();
}

test('filtered binding changes preserve hidden selections and persist offline and missing target removal', async ({
  page,
}) => {
  await seed(
    page,
    [
      device('local-device', '保留设备', '10.10.0.1:5555'),
      device('alpha-online', '批量A 在线', '10.10.0.11:5555'),
      device('alpha-offline', '批量A 离线', '10.10.0.12:5555', 'offline'),
      device('beta-device', '其他设备', '10.10.0.20:5555'),
    ],
    ['local-device', 'missing-device'],
  );
  await openPlan(page);
  const list = bindings(page);
  const search = list.getByRole('searchbox', { name: '搜索设备', exact: true });
  const filter = list.getByLabel('筛选设备', { exact: true });
  await search.fill('批量A');
  await list.getByRole('button', { name: '选择筛选结果', exact: true }).click();
  await expect
    .poll(() => savedBindings(page))
    .toEqual(['local-device', 'missing-device', 'alpha-online', 'alpha-offline']);

  await search.fill('10.10.0.12:5555');
  await list.getByRole('button', { name: '取消筛选结果', exact: true }).click();
  await expect
    .poll(() => savedBindings(page))
    .toEqual(['local-device', 'missing-device', 'alpha-online']);
  await search.fill('alpha-online');
  await expect(
    list.getByRole('checkbox', { name: '绑定设备批量A 在线', exact: true }),
  ).toBeChecked();

  await search.fill('');
  await filter.selectOption('offline');
  await expect(list.getByRole('checkbox')).toHaveCount(2);
  await expect(
    list.getByRole('checkbox', { name: '绑定设备missing-device', exact: true }),
  ).toBeChecked();
  await list.getByRole('button', { name: '取消筛选结果', exact: true }).click();
  await expect.poll(() => savedBindings(page)).toEqual(['local-device', 'alpha-online']);
  await filter.selectOption('selected');
  await expect(list.getByRole('checkbox')).toHaveCount(2);
  await search.fill('alpha-online');
  await expect(list.getByRole('checkbox')).toHaveCount(1);
  await page.reload();
  await openPlan(page);
  await expect.poll(() => savedBindings(page)).toEqual(['local-device', 'alpha-online']);
  await expect(
    bindings(page).getByRole('checkbox', { name: '绑定设备保留设备', exact: true }),
  ).toBeChecked();
  await expect(
    bindings(page).getByRole('checkbox', { name: '绑定设备批量A 在线', exact: true }),
  ).toBeChecked();
});

test('binding selection enforces the contract limit while retaining selections outside the filter', async ({
  page,
}) => {
  const devices = Array.from({ length: 102 }, (_, index) =>
    device(
      `cap-${index}`,
      index < 99 ? `保留设备 ${index}` : `候选设备 ${index}`,
      `10.20.0.${index + 1}:5555`,
    ),
  );
  const initial = devices.slice(0, 99).map((device) => device.id);
  await seed(page, devices, initial);
  await openPlan(page);
  const list = bindings(page);
  await list.getByRole('searchbox', { name: '搜索设备', exact: true }).fill('候选设备');
  await list.getByRole('button', { name: '选择筛选结果', exact: true }).click();
  await expect.poll(() => savedBindings(page)).toEqual([...initial, 'cap-99']);
  const first = list.getByRole('checkbox', { name: '绑定设备候选设备 99', exact: true });
  const second = list.getByRole('checkbox', { name: '绑定设备候选设备 100', exact: true });
  await expect(second).toBeDisabled();
  await first.uncheck();
  await expect(second).toBeEnabled();
  await second.check();
  await expect.poll(() => savedBindings(page)).toEqual([...initial, 'cap-100']);
  await list.getByRole('button', { name: '取消筛选结果', exact: true }).click();
  await expect.poll(() => savedBindings(page)).toEqual(initial);
});

test('launch filters keep unavailable selections blocking until removed and bulk selection respects binding scope', async ({
  page,
}) => {
  const initial = ['ready-device', 'offline-device', 'missing-device'];
  await seed(
    page,
    [
      device('ready-device', '可运行设备', '10.30.0.1:5555'),
      device('offline-device', '离线设备', '10.30.0.2:5555', 'offline'),
      device('outside-device', '范围外设备', '10.30.0.3:5555'),
    ],
    initial,
  );
  await openPlan(page, false);
  await workbench(page).getByRole('button', { name: '开始执行', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '运行任务表', exact: true });
  const list = dialog.getByRole('group', { name: '运行设备', exact: true });
  const search = list.getByRole('searchbox', { name: '搜索设备', exact: true });
  await search.fill('ready-device');
  await list.getByRole('button', { name: '取消筛选结果', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '在 2 台设备运行', exact: true })).toBeDisabled();
  expect((await snapshot(page)).runs).toHaveLength(0);

  await search.fill('');
  await list.getByLabel('筛选设备', { exact: true }).selectOption('offline');
  await list.getByRole('button', { name: '取消筛选结果', exact: true }).click();
  await list.getByLabel('筛选设备', { exact: true }).selectOption('online');
  await expect(
    list.getByRole('checkbox', { name: '选择设备范围外设备', exact: true }),
  ).toBeDisabled();
  await list.getByRole('button', { name: '选择筛选结果', exact: true }).click();
  await dialog.getByRole('button', { name: '在 1 台设备运行', exact: true }).click();
  await expect(dialog).toBeHidden();
  const state = await snapshot(page);
  expect(state.runs.map((run) => run.deviceId)).toEqual(['ready-device']);
  expect(state.plans.find((plan) => plan.id === 'farm-1-7')!.deviceIds).toEqual(initial);
});
