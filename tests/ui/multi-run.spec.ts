import { expect, test, type HarnessWindow } from './fixtures/desktop';

test('one task table runs on two instances and each instance stops independently', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.evaluate(async () => {
    await (window as HarnessWindow).runtimeHarness.call('device.connect', {
      address: '127.0.0.1:5557',
      name: '第二个模拟器',
    });
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.getByRole('button', { name: '停止实例 第二个模拟器', exact: true }).click();
});

test('switching the target device allows the same unbound editor plan to start in parallel', async ({
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
  await page.getByLabel('选择设备', { exact: true }).selectOption(second.id);
  await page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }).click();
  await expect(wb.getByRole('button', { name: '开始执行', exact: true })).toBeEnabled();
  await wb.getByRole('button', { name: '开始执行', exact: true }).click();
  await page.getByRole('button', { name: '关闭任务表详情', exact: true }).click();
  const dock = page.getByRole('contentinfo', { name: '执行状态栏', exact: true });
  await expect(dock).toContainText('第二个模拟器');
  await dock.getByRole('button', { name: '日志', exact: true }).click();
  const logs = page.getByRole('dialog', { name: '设备日志', exact: true });
  await expect(logs.locator('code').filter({ hasText: /^run.started$/ })).toHaveCount(1);
  await logs.getByRole('button', { name: '关闭设备日志', exact: true }).click();
  await dock.getByRole('button', { name: '运行详情', exact: true }).click();
  const execution = page.getByRole('region', { name: '所选设备执行情况', exact: true });
  await expect(execution).toBeVisible();
  await expect(execution).toContainText('第二个模拟器');
  await page.getByLabel('选择设备', { exact: true }).selectOption('mock-device-1');
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
    await api.call('plan.save', { plan: { ...plan, deviceId: 'mock-device-1' } });
    await api.call('run.start', { planId: 'daily', deviceId: device.id, requestId: 'busy-draft' });
    return device;
  });
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }).click();
  const wb = page.getByRole('region', { name: '任务表工作台', exact: true });
  await wb.getByRole('tab', { name: '任务表设置', exact: true }).click();
  await wb.getByLabel('绑定设备', { exact: true }).selectOption(second.id);
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
  await expect(wb.getByLabel('绑定设备', { exact: true })).toHaveValue(second.id);
});
