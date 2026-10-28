import { expect, test, type HarnessWindow } from './fixtures/desktop';

test('new daily tables have upstream defaults, save immediately and receive unused names', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page
    .locator('.tc-heading')
    .getByRole('button', { name: '新建任务表', exact: true })
    .click();
  const wb = page.getByRole('region', { name: '任务表工作台', exact: true });
  await expect(wb.getByLabel('任务表名称', { exact: true })).toHaveValue('日常表1');
  await expect(wb.locator('.editor-steps > li')).toHaveCount(9);
  await expect(wb.getByRole('checkbox', { name: '指定次数', exact: true })).not.toBeChecked();
  await expect(wb.getByRole('checkbox', { name: '指定材料', exact: true })).not.toBeChecked();
  await expect(wb.getByLabel('目标材料', { exact: true })).toBeDisabled();
  await expect(wb.getByRole('button', { name: '添加材料目标', exact: true })).toBeDisabled();
  await wb.getByRole('button', { name: '设置第 3 条基建换班', exact: true }).click();
  await expect(wb.getByRole('combobox', { name: '无人机用途', exact: true })).toHaveValue('Money');
  for (const checkbox of await wb
    .getByRole('group', { name: '换班设施与顺序', exact: true })
    .getByRole('checkbox')
    .all())
    await expect(checkbox).toBeChecked();
  await page.keyboard.press('Control+s');
  await expect(wb.locator('.wb-save-state')).toHaveText('已保存');
  const plan = await page.evaluate(async () => {
    const snapshot = (await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as {
      plans: {
        name: string;
        tasks: { type: string; enabled: boolean; params: Record<string, unknown> }[];
      }[];
    };
    return snapshot.plans.find((item) => item.name === '日常表1')!;
  });
  expect(plan.tasks.map((task) => task.type)).toEqual([
    'StartUp',
    'Fight',
    'Infrast',
    'Recruit',
    'Mall',
    'Award',
    'Roguelike',
    'Reclamation',
    'UserDataUpdate',
  ]);
  expect(plan.tasks.every((task) => task.enabled)).toBe(true);
  expect(plan.tasks[1].params).toMatchObject({
    stage: '',
    times: 2147483647,
    medicine: 0,
    stone: 0,
    series: 0,
  });
  expect(plan.tasks[3].params).toMatchObject({
    times: 4,
    select: [4],
    confirm: [3, 4],
    expedite: false,
    recruitment_time: { '3': 540, '4': 540 },
  });
  expect(plan.tasks[4].params).toMatchObject({
    buy_first: ['招聘许可'],
    blacklist: ['碳', '家具', '加急许可'],
  });
  expect(plan.tasks[5].params).toEqual({
    award: true,
    mail: false,
    recruit: false,
    orundum: false,
    mining: false,
    specialaccess: false,
    signinevent: false,
  });
  await page.getByRole('button', { name: '关闭任务表详情', exact: true }).click();
  await page
    .locator('.tc-heading')
    .getByRole('button', { name: '新建任务表', exact: true })
    .click();
  await expect(wb.getByLabel('任务表名称', { exact: true })).toHaveValue('日常表2');
  await page.keyboard.press('Control+s');
  await expect(wb.locator('.wb-save-state')).toHaveText('已保存');
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '查看任务表详情日常表1', exact: true }).click();
  await expect(wb.locator('.editor-steps > li')).toHaveCount(9);
});
