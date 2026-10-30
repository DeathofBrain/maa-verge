import { deviceOption, deviceOptions, devicePicker, selectDevice } from './fixtures/device-picker';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Snapshot } from '../../packages/contracts/src/index';

test('tables can share device bindings and removing one binding preserves all other relationships after reload', async ({
  page,
}) => {
  await page.goto('/');
  const second = await page.evaluate(async () => {
    const device = (await (window as HarnessWindow).runtimeHarness.call('device.connect', {
      address: '127.0.0.1:5557',
      name: '共享模拟器',
    })) as { id: string };
    return device.id;
  });
  const open = async (name: string) => {
    await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
    await page.getByRole('button', { name: `查看任务表详情${name}`, exact: true }).click();
    await page.getByRole('tab', { name: '任务表设置', exact: true }).click();
  };
  const wb = page.getByRole('region', { name: '任务表工作台', exact: true });
  const local = wb.getByRole('checkbox', { name: '绑定设备本地模拟设备', exact: true });
  const shared = wb.getByRole('checkbox', { name: '绑定设备共享模拟器', exact: true });
  await open('固源岩补给');
  await local.check();
  await expect(wb.locator('.wb-save-state')).toHaveText('已保存');
  await shared.check();
  await expect(wb.locator('.wb-save-state')).toHaveText('已保存');
  await wb.getByRole('button', { name: '开始执行', exact: true }).click();
  const launch = page.getByRole('dialog', { name: '运行任务表', exact: true });
  await expect(
    launch.getByRole('checkbox', { name: '选择设备本地模拟设备', exact: true }),
  ).toBeChecked();
  await expect(
    launch.getByRole('checkbox', { name: '选择设备共享模拟器', exact: true }),
  ).toBeChecked();
  await launch.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '关闭任务表详情', exact: true }).click();
  await open('每日长草计划');
  await shared.check();
  await expect(wb.locator('.wb-save-state')).toHaveText('已保存');
  await page.reload();
  await open('固源岩补给');
  await expect(local).toBeChecked();
  await expect(shared).toBeChecked();
  await local.uncheck();
  await expect(wb.locator('.wb-save-state')).toHaveText('已保存');
  const state = (await page.evaluate(async () =>
    (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
  )) as Snapshot;
  expect(state.plans.find((plan) => plan.id === 'farm-1-7')?.deviceIds).toEqual([second]);
  expect(state.plans.find((plan) => plan.id === 'daily')?.deviceIds).toEqual([second]);
  await page.reload();
  await open('固源岩补给');
  await expect(local).not.toBeChecked();
  await expect(shared).toBeChecked();
});

test('one task table runs on two instances and each instance stops independently', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const device = (await api.call('device.connect', {
      address: '127.0.0.1:5557',
      name: '第二个模拟器',
    })) as { id: string };
    const state = (await api.call('app.snapshot', {})) as Snapshot;
    const plan = state.plans.find((plan) => plan.id === 'farm-1-7')!;
    await api.call('plan.save', { plan: { ...plan, deviceIds: ['mock-device-1', device.id] } });
  });
  await page
    .getByRole('contentinfo', { name: '执行状态栏' })
    .getByRole('button', { name: '多开执行', exact: true })
    .click();
  const panel = page.getByRole('region', { name: '多开执行面板', exact: true });
  await expect(panel.getByRole('article')).toHaveCount(2);
  await panel.getByLabel('本地模拟设备使用的任务表', { exact: true }).selectOption('farm-1-7');
  await panel.getByLabel('第二个模拟器使用的任务表', { exact: true }).selectOption('farm-1-7');
  await panel.getByRole('button', { name: '启动实例 本地模拟设备', exact: true }).click();
  await panel.getByRole('button', { name: '启动实例 第二个模拟器', exact: true }).click();
  await expect(panel.getByRole('progressbar')).toHaveCount(2);
  await panel.getByRole('button', { name: '停止实例 本地模拟设备', exact: true }).click();
  await expect(panel.getByRole('progressbar')).toHaveCount(1);
  await expect(
    panel.getByRole('button', { name: '启动实例 本地模拟设备', exact: true }),
  ).toBeEnabled();
  await expect(
    panel.getByRole('button', { name: '停止实例 第二个模拟器', exact: true }),
  ).toBeEnabled();
  const state = (await page.evaluate(async () =>
    (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
  )) as { runs: { deviceId: string; status: string; planId: string }[] };
  expect(
    state.runs
      .filter((run) => run.planId === 'farm-1-7')
      .map((run) => run.status)
      .sort(),
  ).toEqual(['running', 'stopped']);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole('button', { name: '停止实例 第二个模拟器', exact: true }).click();
});

test('the dock device selector follows progress and logs without borrowing another device run', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  const second = (await page.evaluate(async () =>
    (window as HarnessWindow).runtimeHarness.call('device.connect', {
      address: '127.0.0.1:5557',
      name: '第二个模拟器',
    }),
  )) as { id: string };
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }).click();
  const wb = page.getByRole('region', { name: '任务表工作台', exact: true });
  await wb.getByRole('button', { name: '开始执行', exact: true }).click();
  await expect(wb.getByRole('status', { name: '任务表运行状态', exact: true })).toContainText(
    '执行中',
  );
  await page.getByRole('button', { name: '关闭任务表详情', exact: true }).click();
  const dock = page.getByRole('contentinfo', { name: '执行状态栏', exact: true });
  const target = devicePicker(page);
  const runPanel = page.getByRole('region', { name: '运行面板', exact: true });
  await target.focus();
  await target.press('ArrowUp');
  await expect(deviceOptions(page)).toBeVisible();
  await expect(deviceOptions(page)).not.toContainText(/执行中|空闲|离线|已连接/);
  await expect(deviceOptions(page)).toContainText('127.0.0.1:5557');
  await target.press('End');
  await expect(target).toBeFocused();
  await expect(target).toHaveAttribute(
    'aria-activedescendant',
    (await deviceOption(page, second.id).getAttribute('id'))!,
  );
  await expect(target).toHaveAttribute('data-value', 'mock-device-1');
  await target.press('Enter');
  await expect(deviceOptions(page)).toHaveCount(0);
  await expect(target).toHaveAttribute('data-value', second.id);
  await expect(dock.getByRole('button', { name: '停止执行', exact: true })).toHaveCount(0);
  await dock.getByRole('button', { name: '运行详情', exact: true }).click();
  await expect(runPanel).toBeVisible();
  await expect(runPanel.getByRole('region', { name: '任务表执行页面', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('tab', { name: '任务表', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await dock.getByRole('button', { name: '日志', exact: true }).click();
  const logs = runPanel.getByRole('region', { name: '设备日志', exact: true });
  await expect(runPanel.locator('.run-panel-heading')).toContainText('第二个模拟器');
  await expect(logs.locator('code').filter({ hasText: /^run.started$/ })).toHaveCount(0);
  await target.click();
  await target.press('Escape');
  await expect(deviceOptions(page)).toHaveCount(0);
  await expect(target).toBeFocused();
  await expect(runPanel).toBeVisible();
  await selectDevice(page, 'mock-device-1');
  await expect(dock.getByRole('button', { name: '停止执行', exact: true })).toBeVisible();
  await expect(runPanel.locator('.run-panel-heading')).toContainText('本地模拟设备');
  await expect(logs.locator('code').filter({ hasText: /^run.started$/ })).toHaveCount(1);
  await selectDevice(page, second.id);
  await expect(runPanel.locator('.run-panel-heading')).toContainText('第二个模拟器');
  await expect(logs.locator('code').filter({ hasText: /^run.started$/ })).toHaveCount(0);
  await expect(dock.getByRole('button', { name: '停止执行', exact: true })).toHaveCount(0);
  const active = (await page.evaluate(async () =>
    (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
  )) as { runs: { deviceId: string; status: string }[] };
  expect(active.runs.filter((run) => run.status === 'running').map((run) => run.deviceId)).toEqual([
    'mock-device-1',
  ]);
  await runPanel.getByRole('button', { name: '收起运行详情', exact: true }).click();
  await page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }).click();
  await expect(wb.getByRole('button', { name: '开始执行', exact: true })).toBeEnabled();
  await wb.getByRole('button', { name: '开始执行', exact: true }).click();
  await page.getByRole('button', { name: '关闭任务表详情', exact: true }).click();
  await expect(dock).toContainText('第二个模拟器');
  await dock.getByRole('button', { name: '日志', exact: true }).click();
  await expect(logs.locator('code').filter({ hasText: /^run.started$/ })).toHaveCount(1);
  await runPanel.getByRole('button', { name: '收起运行详情', exact: true }).click();
  await dock.getByRole('button', { name: '运行详情', exact: true }).click();
  const execution = runPanel.getByRole('region', { name: '任务表执行页面', exact: true });
  await expect(execution).toBeVisible();
  await expect(execution).toContainText('第二个模拟器');
  await expect(page.getByRole('tab', { name: '任务表', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await selectDevice(page, 'mock-device-1');
  await expect(execution).toContainText('本地模拟设备');
  await dock.getByRole('button', { name: '多开执行', exact: true }).click();
  const panel = page.getByRole('region', { name: '多开执行面板', exact: true });
  await expect(panel.getByRole('progressbar')).toHaveCount(2);
});

test('a busy device binding automatically saves and blocks a conflicting start', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  const second = await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const device = (await api.call('device.connect', {
      address: '127.0.0.1:5557',
      name: '忙碌模拟器',
    })) as { id: string };
    const snapshot = (await api.call('app.snapshot', {})) as {
      plans: { id: string; deviceId: string | null }[];
    };
    const plan = snapshot.plans.find((item) => item.id === 'farm-1-7')!;
    await api.call('plan.save', { plan: { ...plan, deviceIds: ['mock-device-1'] } });
    await api.call('run.start', { planId: 'daily', deviceId: device.id, requestId: 'busy-draft' });
    return device;
  });
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }).click();
  const wb = page.getByRole('region', { name: '任务表工作台', exact: true });
  await wb.getByRole('tab', { name: '任务表设置', exact: true }).click();
  await wb.getByRole('checkbox', { name: '绑定设备本地模拟设备', exact: true }).uncheck();
  await expect(wb.locator('.wb-save-state')).toHaveText('已保存');
  await wb.getByRole('checkbox', { name: '绑定设备忙碌模拟器', exact: true }).check();
  await expect(wb.getByRole('button', { name: '开始执行', exact: true })).toBeDisabled();
  await expect(wb.locator('.wb-save-state')).toHaveText('已保存');
  const state = (await page.evaluate(async () =>
    (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
  )) as {
    runs: { planId: string; deviceId: string; status: string }[];
    plans: { id: string; deviceId: string | null }[];
  };
  expect(state.runs.some((run) => run.planId === 'farm-1-7')).toBe(false);
  expect(state.plans.find((item) => item.id === 'farm-1-7')?.deviceId).toBe(second.id);
  await expect(wb.getByRole('checkbox', { name: '绑定设备忙碌模拟器', exact: true })).toBeChecked();
});

test('an offline bound device reaches runtime validation after auto connection fails without starting another instance', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  const second = await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const device = (await api.call('device.connect', {
      address: '127.0.0.1:5557',
      name: '可用的其他模拟器',
    })) as { id: string };
    const state = (await api.call('app.snapshot', {})) as Snapshot;
    const plan = state.plans.find((item) => item.id === 'farm-1-7')!;
    await api.call('plan.save', { plan: { ...plan, deviceIds: ['mock-device-1'] } });
    await api.call('device.disconnect', { id: 'mock-device-1' });
    const original = api.call.bind(api);
    api.call = async (method, params) => {
      if (method === 'device.auto_connect') {
        api.commands.push(method);
        throw new Error('合成自动连接失败');
      }
      if (method === 'run.start') api.commands.push(`run.start:${params.deviceId}`);
      return original(method, params);
    };
    return device.id;
  });
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }).click();
  const wb = page.getByRole('region', { name: '任务表工作台', exact: true });
  await wb.getByRole('tab', { name: '任务表设置', exact: true }).click();
  await expect(
    wb.getByRole('checkbox', { name: '绑定设备本地模拟设备', exact: true }),
  ).toBeChecked();
  const start = wb.getByRole('button', { name: '开始执行', exact: true });
  await start.click();
  await expect(page.getByRole('alert')).toContainText('设备不可用或正在执行任务');
  await expect(start).toBeEnabled();
  const state = await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    return {
      snapshot: (await api.call('app.snapshot', {})) as Snapshot,
      attempts: api.commands.filter(
        (command) => command === 'device.auto_connect' || command.startsWith('run.start:'),
      ),
    };
  });
  expect(state.attempts).toEqual(['device.auto_connect', 'run.start:mock-device-1']);
  expect(state.snapshot.runs).toHaveLength(0);
  expect(state.snapshot.devices.find((device) => device.id === second)?.state).toBe('idle');
});
