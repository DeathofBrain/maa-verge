import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

type ActionWindow = HarnessWindow & {
  startRequests: string[];
  releaseStart: () => void;
  releaseStop: () => void;
};
const row = (page: Page) => page.getByRole('article', { name: '任务表 每日长草计划', exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: '运行任务表', exact: true });
const openTasks = (page: Page) =>
  page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
const snapshot = (page: Page) =>
  page.evaluate(
    async () =>
      (await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot,
  );
const additional = async (page: Page) => {
  await row(page).getByRole('button', { name: '更多任务表操作每日长草计划', exact: true }).click();
  return page.getByRole('menuitem', { name: /^在其他设备执行…/ });
};

test('single-device card prevents repeat start and stop requests and restores start after stopping', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const target = window as ActionWindow;
    const api = target.runtimeHarness;
    const state = (await api.call('app.snapshot', {})) as Snapshot;
    await api.call('plan.save', {
      plan: { ...state.plans.find((plan) => plan.id === 'daily')!, deviceIds: ['mock-device-1'] },
    });
    const start = new Promise<void>((resolve) => {
      target.releaseStart = resolve;
    });
    const stop = new Promise<void>((resolve) => {
      target.releaseStop = resolve;
    });
    const original = api.call;
    target.startRequests = [];
    api.call = async (method, params) => {
      if (method === 'run.start') {
        target.startRequests.push(String(params.deviceId));
        await start;
      }
      if (method === 'run.stop') await stop;
      return original(method, params);
    };
  });
  await openTasks(page);
  await row(page).getByRole('button', { name: '开始执行', exact: true }).click();
  await expect(row(page).getByRole('button', { name: '正在启动…', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as ActionWindow).startRequests)).toEqual([
    'mock-device-1',
  ]);
  await page.evaluate(() => (window as ActionWindow).releaseStart());
  await expect(row(page).getByRole('button', { name: '查看执行', exact: true })).toBeVisible();
  await expect(row(page).getByRole('button', { name: '开始执行', exact: true })).toHaveCount(0);
  const unavailable = await additional(page);
  await expect(unavailable).toBeDisabled();
  await expect(unavailable).toContainText('暂无可用设备');
  await page.keyboard.press('Escape');
  await row(page).getByRole('button', { name: '停止任务表每日长草计划', exact: true }).click();
  await expect(
    row(page).getByRole('button', { name: '停止任务表每日长草计划', exact: true }),
  ).toBeDisabled();
  await expect(row(page)).toContainText('正在停止…');
  await page.evaluate(() => (window as ActionWindow).releaseStop());
  await expect(row(page).getByRole('button', { name: '开始执行', exact: true })).toBeEnabled();
  expect((await snapshot(page)).runs.map((run) => run.status)).toEqual(['stopped']);
});

test('additional launch excludes running and offline targets and monitor shows every run of this table', async ({
  page,
}) => {
  await page.goto('/');
  const ids = await page.evaluate(async () => {
    const target = window as ActionWindow;
    const api = target.runtimeHarness;
    const second = (await api.call('device.connect', {
      address: '127.0.0.1:5591',
      name: '追加设备',
    })) as { id: string };
    const offline = (await api.call('device.connect', {
      address: '127.0.0.1:5593',
      name: '离线绑定',
    })) as { id: string };
    const other = (await api.call('device.connect', {
      address: '127.0.0.1:5595',
      name: '其他表设备',
    })) as { id: string };
    const state = (await api.call('app.snapshot', {})) as Snapshot;
    await api.call('plan.save', {
      plan: {
        ...state.plans.find((plan) => plan.id === 'daily')!,
        deviceIds: ['mock-device-1', second.id, offline.id],
      },
    });
    await api.call('device.disconnect', { id: offline.id });
    await api.call('run.start', {
      planId: 'daily',
      deviceId: 'mock-device-1',
      requestId: 'first-run',
    });
    await api.call('run.start', { planId: 'farm-1-7', deviceId: other.id, requestId: 'other-run' });
    const original = api.call;
    target.startRequests = [];
    api.call = async (method, params) => {
      if (method === 'run.start') target.startRequests.push(String(params.deviceId));
      return original(method, params);
    };
    return { second: second.id, other: other.id };
  });
  await openTasks(page);
  await (await additional(page)).click();
  const running = dialog(page).getByRole('checkbox', { name: '选择设备本地模拟设备', exact: true });
  await expect(running).not.toBeChecked();
  await expect(running).toBeDisabled();
  await expect(dialog(page)).toContainText('本表执行中');
  await expect(
    dialog(page).getByRole('checkbox', { name: '选择设备离线绑定', exact: true }),
  ).not.toBeChecked();
  await expect(
    dialog(page).getByRole('checkbox', { name: '选择设备追加设备', exact: true }),
  ).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(
    row(page).getByRole('button', { name: '更多任务表操作每日长草计划', exact: true }),
  ).toBeFocused();
  await (await additional(page)).click();
  await dialog(page).getByRole('button', { name: '在 1 台设备运行', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  expect(await page.evaluate(() => (window as ActionWindow).startRequests)).toEqual([ids.second]);
  await expect(
    row(page).getByRole('button', { name: '停止全部任务表每日长草计划', exact: true }),
  ).toHaveText('停止全部');
  await expect(await additional(page)).toBeDisabled();
  await page.keyboard.press('Escape');
  await row(page).getByRole('button', { name: '查看执行', exact: true }).click();
  const devices = page.getByRole('region', { name: '设备执行列表', exact: true });
  await expect(devices.getByRole('article')).toHaveCount(2);
  await expect(devices).toContainText('追加设备');
  await expect(devices).not.toContainText('其他表设备');
  await page.getByRole('button', { name: '显示全部设备', exact: true }).click();
  await expect(devices.getByRole('article')).toHaveCount(4);
});

test('unbound tables can explicitly add another temporary target without changing bindings', async ({
  page,
}) => {
  await page.goto('/');
  const second = await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const device = (await api.call('device.connect', {
      address: '127.0.0.1:5591',
      name: '临时追加设备',
    })) as { id: string };
    await api.call('run.start', {
      planId: 'daily',
      deviceId: 'mock-device-1',
      requestId: 'unbound-first',
    });
    return device.id;
  });
  await openTasks(page);
  await (await additional(page)).click();
  const target = dialog(page).getByRole('checkbox', { name: '选择设备临时追加设备', exact: true });
  await expect(target).not.toBeChecked();
  await target.check();
  await dialog(page).getByRole('button', { name: '在 1 台设备运行', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  const state = await snapshot(page);
  expect(
    state.runs
      .filter((run) => run.planId === 'daily')
      .map((run) => run.deviceId)
      .sort(),
  ).toEqual(['mock-device-1', second].sort());
  const plan = state.plans.find((plan) => plan.id === 'daily')!;
  expect(plan.deviceIds || []).toEqual([]);
  expect(plan.deviceId).toBeFalsy();
});

test('a chosen device starting this table elsewhere becomes read-only and is removed from launch targets', async ({
  page,
}) => {
  await page.goto('/');
  const second = await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const device = (await api.call('device.connect', {
      address: '127.0.0.1:5591',
      name: '并发启动设备',
    })) as { id: string };
    const state = (await api.call('app.snapshot', {})) as Snapshot;
    await api.call('plan.save', {
      plan: {
        ...state.plans.find((plan) => plan.id === 'daily')!,
        deviceIds: ['mock-device-1', device.id],
      },
    });
    await api.call('run.start', {
      planId: 'daily',
      deviceId: 'mock-device-1',
      requestId: 'race-first',
    });
    return device.id;
  });
  await openTasks(page);
  await (await additional(page)).click();
  const choice = dialog(page).getByRole('checkbox', { name: '选择设备并发启动设备', exact: true });
  await expect(choice).toBeChecked();
  await page.evaluate(async (deviceId) => {
    await (window as HarnessWindow).runtimeHarness.call('run.start', {
      planId: 'daily',
      deviceId,
      requestId: 'race-second',
    });
  }, second);
  await expect(choice).not.toBeChecked();
  await expect(choice).toBeDisabled();
  await expect(
    dialog(page).getByRole('button', { name: '选择设备后运行', exact: true }),
  ).toBeDisabled();
  expect((await snapshot(page)).runs).toHaveLength(2);
});
