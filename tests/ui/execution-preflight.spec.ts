import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { navigate, readSnapshot } from './fixtures/navigation';
import type { Plan, Snapshot } from '@maaverge/contracts';

test('unsupported parameters stay editable and saved while execution stops before automatic connection', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await api.call('app.snapshot', {})) as Snapshot;
    const plan: Plan = {
      ...snapshot.plans.find((item) => item.id === 'farm-1-7')!,
      name: '兼容配置保留',
      tasks: [
        {
          type: 'Fight',
          enabled: true,
          params: { stage: 'OF-8', times: 2, medicine: 0, stone: 0, future_option: { keep: true } },
        },
        {
          type: 'Roguelike',
          enabled: true,
          params: { theme: 'Phantom', mode: 0, starts_count: 1 },
        },
      ],
    };
    await api.call('plan.save', { plan });
    await api.call('device.disconnect', { id: 'mock-device-1' });
  });
  await page.reload();
  await navigate(page, '任务');
  await page.getByRole('button', { name: '查看任务表详情兼容配置保留', exact: true }).click();
  const editor = page.getByRole('region', { name: '任务表工作台', exact: true });
  const notice = editor.getByRole('status', { name: '执行兼容检查', exact: true });
  await expect(notice).toContainText('stage');
  await expect(notice).toContainText('future_option');
  await expect(notice).toContainText('第 2 项');
  await editor.getByLabel('作战次数', { exact: true }).fill('3');
  await expect
    .poll(
      async () =>
        (await readSnapshot(page)).plans.find((item) => item.name === '兼容配置保留')?.tasks[0]
          .params.times,
    )
    .toBe(3);
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness;
    const call = api.call;
    api.commands.length = 0;
    api.call = async (method, params) => {
      if (['device.auto_connect', 'device.connect', 'device.frame', 'run.start'].includes(method))
        api.commands.push(method);
      return call(method, params);
    };
  });
  await editor.getByRole('button', { name: '开始执行', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('future_option');
  const saved = (await readSnapshot(page)).plans.find((item) => item.name === '兼容配置保留')!;
  expect(saved.tasks[0].params.future_option).toEqual({ keep: true });
  expect(saved.tasks[1].type).toBe('Roguelike');
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.commands)).toEqual([]);
  expect((await readSnapshot(page)).runs).toEqual([]);
});

test('execution preflight uses the Framework engine and ignores disabled compatibility tasks', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () =>
    (window as HarnessWindow).runtimeHarness.call('execution.preflight', {
      tasks: [
        {
          type: 'Fight',
          enabled: true,
          params: { stage: '', times: 1, series: 1, medicine: 0, stone: 0 },
        },
        { type: 'Roguelike', enabled: false, params: { future_option: true } },
      ],
    }),
  );
  expect(result).toEqual({ supported: true, engine: 'maafw', issues: [] });
});
