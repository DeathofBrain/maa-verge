import type { Page } from '@playwright/test';
import type { Device, Run, Snapshot } from '@maaverge/contracts';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { selectDevice } from './fixtures/device-picker';

type DeletionWindow = HarnessWindow & {
  historyDeletes: { deviceIds: string[] }[];
  historyRefreshes: number;
  releaseHistoryDelete?: () => void;
};

const names = ['历史主账号', '历史小号'];
const monitor = (page: Page) => page.getByRole('region', { name: '任务表执行监控', exact: true });
const row = (page: Page, name: string) =>
  monitor(page).getByRole('article', { name: `设备执行${name}`, exact: true });
const bulk = (page: Page) => page.getByRole('region', { name: '设备批量操作', exact: true });
const menu = (page: Page) => page.getByRole('menu', { name: '设备执行菜单', exact: true });
const snapshot = (page: Page) =>
  page.evaluate(
    async () =>
      (await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot,
  );

async function openMonitor(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('tab', { name: '执行监控', exact: true }).click();
  await expect(monitor(page)).toBeVisible();
}

async function seedHistory(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  const result = await page.evaluate(async (names) => {
    const target = window as DeletionWindow;
    const api = target.runtimeHarness;
    const base = (await api.call('app.snapshot', {})) as Snapshot;
    const profiles = names.map((name, index) => ({
      id: `history-profile-${index}`,
      name,
      address: `127.0.0.1:${5557 + index * 2}`,
      connection: {
        adbPath: '',
        address: `127.0.0.1:${5557 + index * 2}`,
        config: 'General',
        touchMode: 'minitouch',
        adbLite: false,
        clientType: 'Official',
      },
      capture: { method: 'adb', autoDetect: true, emulatorPath: '', instanceIndex: index },
    }));
    await api.call('settings.save', {
      settings: { ...base.settings, autoConnect: false, deviceProfiles: profiles },
    });
    const devices: Device[] = [];
    for (const profile of profiles)
      devices.push((await api.call('device.connect', { address: profile.address })) as Device);
    await api.call('plan.save', { plan: { ...base.plans[0], deviceIds: [devices[0].id] } });
    const run = (await api.call('run.start', {
      planId: base.plans[0].id,
      deviceId: devices[0].id,
      requestId: 'history-device-deletion-fixture',
    })) as Run;
    await api.call('run.stop', { id: run.id });
    for (const device of devices) await api.call('device.disconnect', { id: device.id });
    const before = (await api.call('app.snapshot', {})) as Snapshot;
    const original = api.call;
    target.historyDeletes = [];
    api.call = async (method, params) => {
      if (method === 'device.delete')
        target.historyDeletes.push(structuredClone(params) as { deviceIds: string[] });
      return original(method, params);
    };
    return { ids: devices.map((device) => device.id), runId: run.id, before };
  }, names);
  await openMonitor(page);
  await expect(row(page, names[0])).toBeVisible();
  await expect(row(page, names[1])).toBeVisible();
  return result;
}

async function openActions(page: Page, name: string) {
  await row(page, name)
    .getByRole('button', { name: `设备操作${name}`, exact: true })
    .click();
  await expect(menu(page)).toBeVisible();
}

test('three-dot deletion removes the selected history card and preserves instance settings and records after reload', async ({
  page,
}) => {
  const { ids, runId, before } = await seedHistory(page);
  await row(page, names[0])
    .getByRole('button', { name: `查看设备执行${names[0]}`, exact: true })
    .click();
  await row(page, names[0]).getByRole('checkbox').check();
  await expect(page.getByRole('region', { name: '所选设备执行情况', exact: true })).toBeVisible();
  await openActions(page, names[0]);
  await menu(page).getByRole('menuitem', { name: '删除历史设备', exact: true }).click();
  await expect(row(page, names[0])).toHaveCount(0);
  await expect(bulk(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: '所选设备执行情况', exact: true })).toHaveCount(0);
  const after = await snapshot(page);
  expect(after.devices.map((device) => device.id)).not.toContain(ids[0]);
  expect(after.settings.deviceProfiles).toEqual(before.settings.deviceProfiles);
  expect(after.plans).toEqual(before.plans);
  expect(after.runs).toEqual(before.runs);
  expect(after.events).toEqual(expect.arrayContaining(before.events));
  expect(await page.evaluate(() => (window as DeletionWindow).historyDeletes)).toEqual([
    { deviceIds: [ids[0]] },
  ]);
  expect(
    await page.evaluate(
      (id) => (window as HarnessWindow).runtimeHarness.call('run.detail', { id }),
      runId,
    ),
  ).toMatchObject({ id: runId, deviceId: ids[0], status: 'stopped' });

  await page.reload();
  await openMonitor(page);
  await expect(row(page, names[0])).toHaveCount(0);
  await expect(row(page, names[1])).toBeVisible();
  expect((await snapshot(page)).settings.deviceProfiles).toEqual(before.settings.deviceProfiles);
  await page.locator('.sidebar').getByRole('button', { name: '执行记录', exact: true }).click();
  await page.getByRole('button', { name: `查看执行${runId}`, exact: true }).click();
  const detail = page.getByRole('region', { name: '任务表执行页面', exact: true });
  await expect(detail).toBeVisible();
  await expect(monitor(page)).toContainText('设备历史已删除');
  await page.evaluate(() => {
    const target = window as DeletionWindow;
    const api = target.runtimeHarness;
    const original = api.call;
    target.historyRefreshes = 0;
    api.call = async (method, params) => {
      const result = await original(method, params);
      if (method === 'app.snapshot') target.historyRefreshes++;
      return result;
    };
    api.emitEvent('device.updated');
  });
  await expect
    .poll(() => page.evaluate(() => (window as DeletionWindow).historyRefreshes))
    .toBeGreaterThan(0);
  await expect(detail).toBeVisible();
  await expect(monitor(page)).toContainText('设备历史已删除');
  await expect(row(page, names[0])).toHaveCount(0);
  await selectDevice(page, 'mock-device-1');
  await expect(detail).toHaveCount(0);
  await expect(monitor(page)).not.toContainText('设备历史已删除');
  await expect(
    page
      .getByRole('region', { name: '所选设备执行情况', exact: true })
      .getByRole('heading', { name: /^本地模拟设备/ }),
  ).toBeVisible();
  await expect(
    row(page, '本地模拟设备').getByRole('button', {
      name: '查看设备执行本地模拟设备',
      exact: true,
    }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await page.getByRole('tab', { name: /^多开管理/ }).click();
  await expect(
    page.getByRole('article', { name: `多开实例：${names[0]}`, exact: true }),
  ).toContainText('未连接');
  await page.evaluate(() =>
    (window as HarnessWindow).runtimeHarness.call('device.connect', { address: '127.0.0.1:5557' }),
  );
  await openMonitor(page);
  await expect(row(page, names[0])).toContainText('空闲');
});

test('right-click history deletion shares the menu and online devices have no delete action', async ({
  page,
}) => {
  const { ids } = await seedHistory(page);
  await row(page, '本地模拟设备').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('menuitem', { name: '删除历史设备', exact: true })).toHaveCount(
    0,
  );
  await page.keyboard.press('Escape');
  await row(page, names[1]).click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole('menuitem', { name: '删除历史设备', exact: true }).click();
  await expect(row(page, names[1])).toHaveCount(0);
  await expect(row(page, names[0])).toBeVisible();
  expect(await page.evaluate(() => (window as DeletionWindow).historyDeletes)).toEqual([
    { deviceIds: [ids[1]] },
  ]);
});

test('batch deletion includes selected history hidden by search and persists without affecting online devices', async ({
  page,
}) => {
  const { ids } = await seedHistory(page);
  await monitor(page).getByRole('button', { name: '离线', exact: true }).click();
  await monitor(page).getByRole('checkbox', { name: '全选监控设备', exact: true }).check();
  await expect(bulk(page)).toContainText('已选 2 台设备');
  await monitor(page).getByRole('textbox', { name: '搜索监控设备', exact: true }).fill(names[0]);
  await expect(monitor(page).getByRole('article')).toHaveCount(1);
  await bulk(page).getByRole('button', { name: '批量删除', exact: true }).click();
  await expect(bulk(page)).toHaveCount(0);
  const deletions = await page.evaluate(() => (window as DeletionWindow).historyDeletes);
  expect(deletions).toHaveLength(1);
  expect(deletions[0].deviceIds.toSorted()).toEqual(ids.toSorted());
  expect((await snapshot(page)).devices.map((device) => device.id)).toEqual(['mock-device-1']);
  await page.reload();
  await openMonitor(page);
  await expect(monitor(page).getByRole('article')).toHaveCount(1);
  await expect(row(page, '本地模拟设备')).toBeVisible();
});

test('mixed online and offline selection disables batch deletion until only history remains', async ({
  page,
}) => {
  await seedHistory(page);
  await row(page, '本地模拟设备').getByRole('checkbox').check();
  await row(page, names[0]).getByRole('checkbox').check();
  const deleteButton = bulk(page).getByRole('button', { name: '批量删除', exact: true });
  await expect(deleteButton).toBeDisabled();
  await expect(bulk(page)).toContainText('仅可删除离线历史设备');
  expect(await page.evaluate(() => (window as DeletionWindow).historyDeletes)).toEqual([]);
  await row(page, '本地模拟设备').getByRole('checkbox').uncheck();
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await expect(row(page, names[0])).toHaveCount(0);
  await expect(row(page, '本地模拟设备')).toBeVisible();
});

test('a failed deletion preserves the selected card and allows retry', async ({ page }) => {
  await seedHistory(page);
  await row(page, names[0]).getByRole('checkbox').check();
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness;
    const original = api.call;
    let failed = false;
    api.call = async (method, params) => {
      if (method === 'device.delete' && !failed) {
        failed = true;
        throw new Error('合成历史设备删除失败');
      }
      return original(method, params);
    };
  });
  await bulk(page).getByRole('button', { name: '批量删除', exact: true }).click();
  await expect(monitor(page).getByRole('alert')).toContainText('合成历史设备删除失败');
  await expect(row(page, names[0]).getByRole('checkbox')).toBeChecked();
  await expect(bulk(page)).toContainText('已选 1 台设备');
  await bulk(page).getByRole('button', { name: '批量删除', exact: true }).click();
  await expect(row(page, names[0])).toHaveCount(0);
  await expect(monitor(page).getByRole('alert')).toHaveCount(0);
});

test('pending deletion cannot be submitted twice and rejects a device that reconnects before the request finishes', async ({
  page,
}) => {
  const { ids } = await seedHistory(page);
  await row(page, names[0]).getByRole('checkbox').check();
  await page.evaluate(() => {
    const target = window as DeletionWindow;
    const api = target.runtimeHarness;
    const original = api.call;
    api.call = async (method, params) => {
      if (method === 'device.delete')
        await new Promise<void>((resolve) => {
          target.releaseHistoryDelete = resolve;
        });
      return original(method, params);
    };
  });
  await bulk(page).getByRole('button', { name: '批量删除', exact: true }).click();
  await expect(bulk(page).getByRole('button', { name: /批量删除|删除中/ })).toBeDisabled();
  await expect
    .poll(() => page.evaluate(() => !!(window as DeletionWindow).releaseHistoryDelete))
    .toBe(true);
  await page.evaluate(async () => {
    const target = window as DeletionWindow;
    await target.runtimeHarness.call('device.connect', { address: '127.0.0.1:5557' });
    target.releaseHistoryDelete!();
  });
  await expect(monitor(page).getByRole('alert')).toContainText('只能删除未被占用的离线历史设备');
  await expect(row(page, names[0])).toContainText('空闲');
  expect((await snapshot(page)).devices.map((device) => device.id)).toContain(ids[0]);
  expect(await page.evaluate(() => (window as DeletionWindow).historyDeletes)).toEqual([
    { deviceIds: [ids[0]] },
  ]);
});

test('a delayed history deletion preserves the different device selected while it was pending', async ({
  page,
}) => {
  await seedHistory(page);
  await row(page, names[0])
    .getByRole('button', { name: `查看设备执行${names[0]}`, exact: true })
    .click();
  await page.evaluate(() => {
    const target = window as DeletionWindow;
    const api = target.runtimeHarness;
    const original = api.call;
    api.call = async (method, params) => {
      if (method === 'device.delete')
        await new Promise<void>((resolve) => {
          target.releaseHistoryDelete = resolve;
        });
      return original(method, params);
    };
  });
  await openActions(page, names[0]);
  await menu(page).getByRole('menuitem', { name: '删除历史设备', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!(window as DeletionWindow).releaseHistoryDelete))
    .toBe(true);
  const current = row(page, '本地模拟设备').getByRole('button', {
    name: '查看设备执行本地模拟设备',
    exact: true,
  });
  await current.click();
  await expect(current).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => (window as DeletionWindow).releaseHistoryDelete!());
  await expect(row(page, names[0])).toHaveCount(0);
  await expect(current).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page
      .getByRole('region', { name: '所选设备执行情况', exact: true })
      .getByRole('heading', { name: /^本地模拟设备/ }),
  ).toBeVisible();
});
