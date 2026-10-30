import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Snapshot } from '../../packages/contracts/src/types';

test('toolbox requires explicit selection, handles checking failures, and ignores late device responses', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '工具箱', exact: true }).click();
  await expect(page.getByRole('heading', { name: '先选择目标设备' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始仓库识别' })).toHaveCount(0);
  const second = await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const device = (await api.call('device.connect', {
      address: '127.0.0.1:5557',
      name: '第二设备',
    })) as { id: string };
    const original = api.call;
    api.call = async (method, params) => {
      if (method === 'device.availability' && params.deviceId === 'mock-device-1')
        return new Promise((resolve) =>
          Object.assign(window, {
            releaseOld: () =>
              resolve({
                deviceId: 'mock-device-1',
                connected: true,
                available: false,
                owner: 'run',
                ownerId: 'old',
                reason: '旧设备仍忙',
              }),
          }),
        );
      return original(method, params);
    };
    return device.id;
  });
  await page.getByLabel('工具箱设备', { exact: true }).selectOption('mock-device-1');
  await expect(page.getByText('正在检查设备占用…')).toBeVisible();
  await page.getByLabel('工具箱设备', { exact: true }).selectOption(second);
  await expect(page.getByRole('button', { name: '开始仓库识别' })).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as { releaseOld: () => void }).releaseOld();
  });
  await expect(page.getByText('旧设备仍忙')).toHaveCount(0);
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness,
      original = api.call;
    let failed = false;
    api.call = async (method, params) => {
      if (method === 'device.availability' && !failed) {
        failed = true;
        throw new Error('合成状态查询失败');
      }
      return original(method, params);
    };
  });
  await page.getByRole('button', { name: '重新检查' }).click();
  await expect(page.getByRole('alert')).toContainText('合成状态查询失败');
  await expect(page.getByRole('button', { name: '开始仓库识别' })).toHaveCount(0);
  await page.getByRole('button', { name: '重新检查' }).click();
  await expect(page.getByRole('button', { name: '开始仓库识别' })).toBeEnabled();
});

test('tools continue across pages, keep cached results while busy, and never add plans', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '工具箱', exact: true }).click();
  await page.getByLabel('工具箱设备', { exact: true }).selectOption('mock-device-1');
  await page.getByRole('button', { name: '开始仓库识别' }).click();
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await page.clock.runFor(12600);
  await page.locator('.sidebar').getByRole('button', { name: '工具箱', exact: true }).click();
  await expect(page.getByRole('list', { name: '仓库物品' }).getByRole('listitem')).toHaveCount(3);
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    await api.call('run.start', { planId: 'daily', deviceId: 'mock-device-1', requestId: 'busy' });
  });
  await expect(page.getByRole('button', { name: '开始仓库识别' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导出仓库结果' })).toBeEnabled();
  await page
    .getByRole('navigation', { name: '工具分类' })
    .getByRole('button', { name: '库存保持', exact: true })
    .click();
  await expect(page.getByRole('button', { name: '添加库存目标' })).toBeDisabled();
  const snapshot = (await page.evaluate(async () =>
    (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
  )) as Snapshot;
  expect(snapshot.plans).toHaveLength(2);
  expect(snapshot.toolJobs).toHaveLength(1);
});

test('daily schedules support eight rules, temporary overrides, global options and restart persistence', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '查看任务表详情每日长草计划', exact: true }).click();
  await page.getByRole('tab', { name: '定时计划', exact: true }).click();
  const panel = page.getByRole('region', { name: '定时计划', exact: true });
  await panel.getByLabel('新增定时设备', { exact: true }).selectOption('mock-device-1');
  for (let i = 0; i < 8; i++) {
    await panel
      .getByLabel('新增定时时间', { exact: true })
      .fill(`04:${String(i).padStart(2, '0')}`);
    await panel.getByRole('button', { name: '添加定时', exact: true }).click();
    await expect(panel.getByRole('row')).toHaveCount(i + 2);
  }
  await panel.getByLabel('临时启停', { exact: false }).first().selectOption('skip');
  await expect(panel.getByLabel('临时启停', { exact: false }).first()).toHaveValue('skip');
  await panel.getByRole('checkbox', { name: '强制定时启动', exact: true }).check();
  await panel.getByRole('checkbox', { name: '定时前通知', exact: true }).check();
  await panel.getByRole('spinbutton', { name: '提前分钟数' }).fill('10');
  await expect(panel.getByRole('spinbutton', { name: '提前分钟数' })).toBeEnabled();
  await expect
    .poll(
      async () =>
        (
          (await page.evaluate(() =>
            (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
          )) as Snapshot
        ).settings.scheduler,
    )
    .toMatchObject({
      forceScheduledStart: true,
      notifyBeforeScheduledStart: true,
      notificationMinutes: 10,
    });
  await panel.getByRole('button', { name: '查看全部定时' }).click();
  await expect(panel.getByRole('row')).toHaveCount(9);
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '查看任务表详情每日长草计划', exact: true }).click();
  await page.getByRole('tab', { name: '定时计划', exact: true }).click();
  await expect(panel.getByRole('row')).toHaveCount(9);
  await expect(panel.getByLabel('临时启停', { exact: false }).first()).toHaveValue('clear');
  await expect(panel.getByRole('checkbox', { name: '强制定时启动', exact: true })).toBeChecked();
  await expect(panel.getByRole('spinbutton', { name: '提前分钟数' })).toHaveValue('10');
  await panel.getByLabel('删除定时', { exact: false }).first().click();
  await expect(panel.getByRole('row')).toHaveCount(8);
});

test('a shared table schedules either bound device and removing that relationship disables only its schedule', async ({
  page,
}) => {
  await page.goto('/');
  const second = await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const device = (await api.call('device.connect', {
      address: '127.0.0.1:5557',
      name: '共享定时设备',
    })) as { id: string };
    await api.call('device.connect', { address: '127.0.0.1:5559', name: '未绑定设备' });
    const state = (await api.call('app.snapshot', {})) as Snapshot;
    const plan = state.plans.find((plan) => plan.id === 'daily')!;
    await api.call('plan.save', { plan: { ...plan, deviceIds: ['mock-device-1', device.id] } });
    return device.id;
  });
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '查看任务表详情每日长草计划', exact: true }).click();
  await page.getByRole('tab', { name: '定时计划', exact: true }).click();
  const panel = page.getByRole('region', { name: '定时计划', exact: true });
  const picker = panel.getByLabel('新增定时设备', { exact: true });
  await expect
    .poll(() =>
      picker.locator('option').evaluateAll((options) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .filter(Boolean)
          .sort(),
      ),
    )
    .toEqual(['mock-device-1', second].sort());
  for (const device of ['mock-device-1', second]) {
    await picker.selectOption(device);
    await panel.getByRole('button', { name: '添加定时', exact: true }).click();
  }
  await expect(panel.getByRole('row')).toHaveCount(3);
  await page.getByRole('tab', { name: '任务表设置', exact: true }).click();
  const wb = page.getByRole('region', { name: '任务表工作台', exact: true });
  await wb.getByRole('checkbox', { name: '绑定设备共享定时设备', exact: true }).uncheck();
  await expect(wb.locator('.wb-save-state')).toHaveText('已保存');
  await page.getByRole('tab', { name: '定时计划', exact: true }).click();
  await expect(panel).toContainText('定时设备不在任务表绑定范围内');
  const schedules = await page.evaluate(
    async () =>
      (await (window as HarnessWindow).runtimeHarness.call('schedule.list', {})) as {
        schedules: { deviceId: string; enabled: boolean; disabledReason?: string | null }[];
      },
  );
  expect(schedules.schedules.find((item) => item.deviceId === 'mock-device-1')?.enabled).toBe(true);
  expect(schedules.schedules.find((item) => item.deviceId === second)).toMatchObject({
    enabled: false,
    disabledReason: '定时设备不在任务表绑定范围内',
  });
});

test('force countdown keeps a rejected cancellation visible and locks cancellation after start commits', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness,
      original = api.call;
    let committed = false;
    Object.assign(window, {
      commitSchedule: () => {
        committed = true;
        api.emitEvent('schedule.starting');
      },
    });
    api.call = async (method, params) => {
      if (method === 'schedule.cancel') return { cancelled: false };
      const value = await original(method, params);
      if (method === 'schedule.list')
        return {
          ...(value as object),
          occurrences: [
            {
              id: 'countdown-test',
              status: 'countdown',
              countdownUntil: Date.now() + 10000,
              startCommitted: committed,
            },
          ],
        };
      return value;
    };
    api.emitEvent('schedule.countdown');
  });
  const notices = page.getByRole('complementary', { name: '定时通知', exact: true });
  await expect(notices.getByText(/强制定时将在/)).toBeVisible();
  await notices.getByRole('button', { name: '取消本次定时' }).click();
  await expect(notices.getByText('本次定时已进入启动阶段，请在执行页查看或停止。')).toBeVisible();
  await expect(notices.getByRole('button', { name: '取消本次定时' })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { commitSchedule: () => void }).commitSchedule();
  });
  await expect(notices.getByRole('button', { name: '取消本次定时' })).toBeDisabled();
});
