import { devicePicker } from './fixtures/device-picker';
import type { Page } from '@playwright/test';
import type { Plan, Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { closeTaskDetail as closeDetail, navigate } from './fixtures/navigation';

const wb = (page: Page) => page.getByRole('region', { name: '任务表工作台', exact: true });
const dock = (page: Page) => page.getByRole('contentinfo', { name: '执行状态栏', exact: true });
const home = (page: Page) => page.getByRole('region', { name: '主页仪表盘', exact: true });
const metric = (page: Page, name: string) =>
  home(page).getByLabel(name, { exact: true }).locator('strong');
async function openHome(page: Page) {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
}
async function openTaskTables(page: Page) {
  await closeDetail(page);
  const menu = page.getByRole('button', { name: '打开导航', exact: true });
  if (await menu.isVisible()) await menu.click();
  await navigate(page, '任务');
}
async function openSavedPlan(page: Page, name = '每日长草计划') {
  await openTaskTables(page);
  await page
    .getByRole('region', { name: '任务表列表', exact: true })
    .getByRole('button', { name: `查看任务表详情${name}`, exact: true })
    .click();
  await expect(wb(page).getByRole('heading', { name, exact: true })).toBeVisible();
}
async function openWorkspace(page: Page) {
  await openHome(page);
  await openSavedPlan(page);
}
async function reloadWorkspace(page: Page, name: string) {
  await page.reload();
  await expect(home(page)).toBeVisible();
  await openSavedPlan(page, name);
}
async function openConnectionSettings(page: Page) {
  await page
    .locator('.sp-heading-actions')
    .getByRole('button', { name: '连接设置', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: '设备连接设置', exact: true })).toBeVisible();
}
async function createPlan(page: Page, name: string) {
  await openTaskTables(page);
  await page
    .locator('.tc-heading')
    .getByRole('button', { name: '新建任务表', exact: true })
    .click();
  await wb(page).getByLabel('任务表名称', { exact: true }).fill(name);
}
async function savePlan(page: Page) {
  await page.keyboard.press('Control+s');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('已保存');
}
async function tab(page: Page, name: string) {
  await wb(page).getByRole('tab', { name, exact: true }).click();
}
async function settingsCategory(page: Page, name: string) {
  await navigate(page, '设置');
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name, exact: true })
    .click();
}

test('Escape closes an instance context menu before the surrounding run panel', async ({
  page,
}) => {
  await openHome(page);
  await dock(page).getByRole('button', { name: '多开执行', exact: true }).click();
  const panel = page.getByRole('region', { name: '运行面板', exact: true });
  await panel.getByRole('article', { name: '模拟器实例 本地模拟设备', exact: true }).click({
    button: 'right',
  });
  const menu = page.getByRole('menu', { name: '实例执行菜单', exact: true });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});
function channel(page: Page, name: string) {
  return page
    .locator('.update-channel')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}

test('home shows runtime information and task tables have their own navigation entry', async ({
  page,
}) => {
  await openHome(page);
  await expect(home(page).getByRole('heading', { name: '主页', exact: true })).toBeVisible();
  await expect(wb(page)).toHaveCount(0);
  await expect(page.locator('.primary-nav .nav-item[aria-current="page"]')).toHaveText('主页');
  await expect(metric(page, '今日执行统计')).toHaveText('0');
  await expect(metric(page, '今日完成统计')).toHaveText('0');
  await expect(metric(page, '设备统计')).toHaveText('1');
  await expect(metric(page, '运行统计')).toHaveText('0');
  await expect(home(page).getByLabel('任务表统计', { exact: true })).toHaveCount(0);
  await expect(home(page).getByRole('region', { name: '我的任务表', exact: true })).toHaveCount(0);
  await expect(home(page).getByRole('article', { name: /^任务表/ })).toHaveCount(0);
  await expect(
    home(page).getByRole('button', {
      name: /新建任务表|新增日常任务表|运行已保存任务表|编辑任务表|开始/,
    }),
  ).toHaveCount(0);
  await expect(
    page.locator('.sidebar').getByRole('button', { name: /^查看任务表详情/ }),
  ).toHaveCount(0);
  await expect(page.getByRole('region', { name: '任务表列表', exact: true })).toHaveCount(0);
  await openSavedPlan(page, '固源岩补给');
  await expect(page.locator('.primary-nav .nav-item[aria-current="page"]')).toHaveText('任务');
  await expect(
    page
      .getByRole('region', { name: '任务表列表', exact: true })
      .getByRole('button', { name: '查看任务表详情每日长草计划', exact: true }),
  ).toBeVisible();
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('6');
  await navigate(page, '主页');
  await expect(home(page)).toBeVisible();
  await expect(page.getByRole('region', { name: '任务表列表', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('maaverge:ui:selected-plan'))).toBe(
    'farm-1-7',
  );
  await page.reload();
  await expect(home(page)).toBeVisible();
  await expect(wb(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: '任务表列表', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('maaverge:ui:selected-plan'))).toBe(
    'farm-1-7',
  );
});

test('home reports a run started after automatically saving editor changes', async ({ page }) => {
  await openHome(page);
  await openSavedPlan(page, '固源岩补给');
  await wb(page).getByLabel('作战次数').fill('9');
  await wb(page).getByRole('button', { name: '开始执行', exact: true }).click();
  await expect(dock(page)).toContainText('执行中');
  await navigate(page, '主页');
  await expect(metric(page, '今日执行统计')).toHaveText('1');
  await expect(metric(page, '今日完成统计')).toHaveText('0');
  await expect(metric(page, '运行统计')).toHaveText('1');
  const current = home(page).getByRole('region', { name: '当前执行', exact: true });
  await expect(current).toContainText('固源岩补给');
  await expect(
    current.getByRole('progressbar', { name: '当前执行进度', exact: true }),
  ).toBeVisible();
  await current.getByRole('button', { name: '查看运行详情', exact: true }).click();
  await expect(page.getByRole('region', { name: '任务表执行页面', exact: true })).toContainText(
    '固源岩补给',
  );
  await navigate(page, '主页');
  await current.getByRole('button', { name: '停止执行', exact: true }).click();
  await expect(metric(page, '运行统计')).toHaveText('0');
  await expect(metric(page, '今日执行统计')).toHaveText('1');
  await expect(metric(page, '今日完成统计')).toHaveText('0');
  await expect(home(page).getByRole('region', { name: '最近执行', exact: true })).toContainText(
    '模拟执行已停止',
  );
  await openSavedPlan(page, '固源岩补给');
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('9');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('已保存');
  await tab(page, '任务表设置');
  await expect(
    wb(page).getByRole('button', { name: '恢复已保存配置', exact: true }),
  ).toBeDisabled();
  await navigate(page, '主页');
  await expect(metric(page, '今日执行统计')).toHaveText('1');
  await expect(metric(page, '今日完成统计')).toHaveText('0');
  await expect(metric(page, '运行统计')).toHaveText('0');
  await expect(home(page)).toContainText('模拟执行已停止');
});

test('home remains useful without task tables and new tables can be added through their own page', async ({
  page,
}) => {
  await openHome(page);
  for (const name of ['每日长草计划', '固源岩补给']) {
    await openSavedPlan(page, name);
    await tab(page, '任务表设置');
    await wb(page).getByRole('button', { name: '删除任务表', exact: true }).click();
    await page
      .getByRole('dialog', { name: '删除任务表', exact: true })
      .getByRole('button', { name: '删除任务表', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: '删除任务表', exact: true })).toBeHidden();
    await navigate(page, '主页');
  }
  await expect(home(page).getByRole('heading', { name: '主页', exact: true })).toBeVisible();
  await expect(metric(page, '今日执行统计')).toHaveText('0');
  await expect(metric(page, '今日完成统计')).toHaveText('0');
  await expect(metric(page, '设备统计')).toHaveText('1');
  await expect(metric(page, '运行统计')).toHaveText('0');
  await expect(home(page).getByRole('article', { name: /^任务表/ })).toHaveCount(0);
  await expect(
    home(page).getByRole('button', { name: /新建任务表|新增日常任务表|开始/ }),
  ).toHaveCount(0);
  await expect(page.getByRole('region', { name: '任务表列表', exact: true })).toHaveCount(0);
  await expect(
    home(page).getByRole('heading', { name: '还没有执行记录', exact: true }),
  ).toBeVisible();
  await openTaskTables(page);
  await page
    .locator('.tc-heading')
    .getByRole('button', { name: '新建任务表', exact: true })
    .click();
  await expect(wb(page).getByRole('heading', { name: '日常表1', exact: true })).toBeVisible();
  await wb(page).getByLabel('任务表名称', { exact: true }).fill('第一张任务表');
  await savePlan(page);
  await navigate(page, '主页');
  await expect(home(page).getByLabel('任务表统计', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '任务表列表', exact: true })).toHaveCount(0);
  await openSavedPlan(page, '第一张任务表');
});

// Preserve the original persistence, policy, task coverage and update scenarios.
test('Agent proposes a reviewable plan without starting a run', async ({ page }) => {
  await openWorkspace(page);
  await navigate(page, 'Agent 助手');
  await page.getByRole('button', { name: '制定刷 6 次 1-7 的计划' }).click();
  await expect(page.getByText('这是本地规则生成的演示计划', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '检查并保存计划' }).click();
  await expect(wb(page).getByLabel('作战关卡')).toHaveValue('1-7');
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('6');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('待确认保存');
  await savePlan(page);
  await navigate(page, '执行记录');
  await expect(page.getByRole('heading', { name: '还没有执行记录' })).toBeVisible();
  await navigate(page, '主页');
  await openSavedPlan(page, 'Agent 刷图计划 · 1-7');
  await expect(wb(page).getByRole('heading', { name: 'Agent 刷图计划 · 1-7' })).toBeVisible();
});

test('the persistent run dock reports progress and stop preserves the plan and history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page);
  await wb(page).getByRole('button', { name: '开始执行', exact: true }).click();
  await expect(dock(page)).toContainText('执行中');
  await navigate(page, '工具箱');
  await expect(dock(page)).toContainText('任务进度');
  await dock(page).getByRole('button', { name: '运行详情', exact: true }).click();
  const panel = page.getByRole('region', { name: '运行面板', exact: true });
  const details = panel.getByRole('region', { name: '任务表执行页面', exact: true });
  await expect(details).toContainText('本页显示开始执行时的任务。修改设置用于下次执行。');
  await expect(page.locator('.primary-nav .nav-item[aria-current="page"]')).toHaveText('工具箱');
  await expect(page.locator('.main-shell')).not.toHaveAttribute('inert');
  await expect(devicePicker(page)).toBeEnabled();
  await dock(page).getByRole('button', { name: '停止执行', exact: true }).click();
  await expect(dock(page).getByRole('button', { name: '停止执行', exact: true })).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await panel.getByRole('button', { name: '收起运行详情', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await navigate(page, '执行记录');
  await expect(page.getByRole('cell', { name: '已停止', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '模拟执行已停止', exact: true })).toBeVisible();
  await reloadWorkspace(page, '每日长草计划');
  await expect(wb(page).getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
});

test('mobile navigation closes after selecting pages and can create task tables', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  await closeDetail(page);
  for (const name of [
    '任务',
    '作业中心',
    '工具箱',
    'Agent 助手',
    '执行记录',
    '设备',
    '设置',
    '主页',
  ]) {
    await page.getByRole('button', { name: '打开导航', exact: true }).click();
    await navigate(page, name);
  }
  await openTaskTables(page);
  await page
    .locator('.tc-heading')
    .getByRole('button', { name: '新建任务表', exact: true })
    .click();
  await expect(wb(page).getByRole('heading', { name: '日常表1', exact: true })).toBeVisible();
  await expect(wb(page).getByRole('tab', { name: '任务表设置', exact: true })).toBeVisible();
});

test('task tables preserve duplicate tasks, order, switches and advanced parameters', async ({
  page,
}) => {
  await openWorkspace(page);
  await createPlan(page, '多步骤配置');
  await expect(wb(page).getByLabel('添加任务类型').locator('option')).toHaveCount(17);
  await wb(page).getByRole('button', { name: '添加任务', exact: true }).click();
  await wb(page).locator('.advanced-params summary').click();
  await wb(page)
    .getByLabel('任务参数 JSON')
    .fill(
      JSON.stringify({
        stage: '2-4',
        times: 2,
        medicine: 0,
        stone: 0,
        drops: { '30012': 3 },
        custom_future: { preserve: true },
      }),
    );
  await expect(wb(page).getByRole('checkbox', { name: '指定材料', exact: true })).toBeChecked();
  await wb(page).getByLabel('作战次数').fill('5');
  await wb(page).getByRole('button', { name: '上移任务', exact: true }).click();
  await wb(page).getByLabel('启用第 2 条任务').uncheck();
  await savePlan(page);
  await reloadWorkspace(page, '多步骤配置');
  await expect(wb(page).getByLabel('启用第 2 条任务')).not.toBeChecked();
  await wb(page).getByRole('button', { name: '设置第 9 条自动作战', exact: true }).click();
  await expect(wb(page).getByLabel('作战关卡')).toHaveValue('2-4');
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('5');
  await wb(page).locator('.advanced-params summary').click();
  const parameters = JSON.parse(await wb(page).getByLabel('任务参数 JSON').inputValue());
  expect(parameters.drops).toEqual({ '30012': 3 });
  expect(parameters.custom_future).toEqual({ preserve: true });
  await wb(page).getByRole('button', { name: '设置第 2 条自动作战', exact: true }).click();
  await expect(wb(page).getByLabel('作战关卡')).toHaveValue('');
});

test('advanced JSON preserves invalid drafts and updates list fields and switches', async ({
  page,
}) => {
  await openWorkspace(page);
  await wb(page).getByRole('button', { name: '设置第 2 条公开招募' }).click();
  await wb(page).locator('.advanced-params summary').click();
  await wb(page).getByLabel('任务参数 JSON').fill('{"confirm":[5],"times":0}');
  await expect(
    wb(page).getByRole('checkbox', { name: '自动确认 5 星', exact: true }),
  ).toBeChecked();
  await expect(
    wb(page).getByRole('checkbox', { name: '自动确认 4 星', exact: true }),
  ).not.toBeChecked();
  await wb(page).getByLabel('任务参数 JSON').fill('{"confirm":');
  await expect(wb(page).getByLabel('招募次数')).toBeDisabled();
  await page.keyboard.press('Control+s');
  await expect(wb(page).getByRole('alert').first()).toContainText('有效 JSON');
  await expect(wb(page).getByLabel('任务参数 JSON')).toHaveValue('{"confirm":');
  await wb(page).getByLabel('任务参数 JSON').fill('{"enable":false,"confirm":[4,5],"times":0}');
  await expect(wb(page).getByLabel('启用第 2 条任务')).not.toBeChecked();
  await wb(page).getByLabel('启用第 2 条任务').check();
  expect(JSON.parse(await wb(page).getByLabel('任务参数 JSON').inputValue()).enable).toBe(true);
  await expect(
    wb(page).getByRole('checkbox', { name: '自动确认 4 星', exact: true }),
  ).toBeChecked();
  await expect(
    wb(page).getByRole('checkbox', { name: '自动确认 5 星', exact: true }),
  ).toBeChecked();
  await savePlan(page);
});

test('automatic connection is deterministic with the test runtime and its preference persists', async ({
  page,
}) => {
  await openWorkspace(page);
  await navigate(page, '设备');
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(page.locator('.connection-diagnostics')).toContainText('未访问真实模拟器');
  await openConnectionSettings(page);
  const automatic = page.getByRole('checkbox', { name: '自动检测连接', exact: true });
  await expect(automatic).toBeChecked();
  // The checkbox reflects saved settings after the asynchronous write finishes.
  await automatic.click();
  await expect(automatic).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const snapshot = (await (window as HarnessWindow).runtimeHarness.call(
          'app.snapshot',
          {},
        )) as {
          settings: { autoConnect: boolean };
        };
        return snapshot.settings.autoConnect;
      }),
    )
    .toBe(false);
  await page.reload();
  await navigate(page, '设备');
  await openConnectionSettings(page);
  await expect(page.getByRole('checkbox', { name: '自动检测连接', exact: true })).not.toBeChecked();
  await navigate(page, '执行记录');
  await expect(page.getByRole('heading', { name: '还没有执行记录' })).toBeVisible();
});

test('Fight consumption limits save directly and all-disabled execution is rejected', async ({
  page,
}) => {
  await openWorkspace(page);
  await createPlan(page, '作战消耗');
  await wb(page).getByLabel('理智药上限', { exact: true }).fill('1');
  await expect(wb(page).getByText('本表自动作战累计上限：理智药 1 · 源石 0')).toBeVisible();
  await savePlan(page);
  await reloadWorkspace(page, '作战消耗');
  await tab(page, '任务编排');
  await expect(wb(page).getByLabel('理智药上限', { exact: true })).toHaveValue('1');
  for (const checkbox of await wb(page)
    .getByRole('checkbox', { name: /^启用第 \d+ 条任务$/ })
    .all())
    await checkbox.uncheck();
  await expect(wb(page).getByText('本表自动作战累计上限：理智药 0 · 源石 0')).toBeVisible();
  await savePlan(page);
  await wb(page).getByRole('button', { name: '开始执行', exact: true }).click();
  await expect(page.locator('.toast.error')).toContainText('至少需要启用一条任务');
});

test('new task entries exclude copilot while legacy task settings remain editable', async ({
  page,
}) => {
  await openWorkspace(page);
  await createPlan(page, '上游任务参数');
  const options = [
    'StartUp',
    'CloseDown',
    'Fight',
    'Recruit',
    'Infrast',
    'Mall',
    'Award',
    'SwitchTheme',
    'Roguelike',
    'Depot',
    'OperBox',
    'Reclamation',
    'Custom',
    'SingleStep',
    'VideoRecognition',
    'OperProgress',
  ];
  const paths: Record<string, string> = {
    Copilot: '作业文件路径',
    SSSCopilot: '保全作业文件路径',
    ParadoxCopilot: '悖论作业文件路径',
    VideoRecognition: '视频文件路径',
  };
  for (const type of options) {
    await wb(page).getByLabel('添加任务类型').selectOption(type);
    await wb(page).getByRole('button', { name: '添加任务', exact: true }).click();
    if (paths[type])
      await wb(page).getByLabel(paths[type], { exact: true }).fill(`/synthetic/${type}.json`);
    if (type === 'Custom')
      await wb(page).getByLabel('资源任务入口', { exact: true }).fill('MiniGame@PixelPaint@Begin');
  }
  await savePlan(page);
  await reloadWorkspace(page, '上游任务参数');
  await expect(wb(page).locator('.editor-steps > li')).toHaveCount(25);
  for (const type of ['Copilot', 'SSSCopilot', 'ParadoxCopilot'])
    await expect(
      wb(page).getByLabel('添加任务类型').locator(`option[value="${type}"]`),
    ).toHaveCount(0);
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await api.call('app.snapshot', {})) as { plans: Plan[] };
    const plan = snapshot.plans.find((item) => item.name === '上游任务参数')!;
    plan.tasks.push(
      ...(['Copilot', 'SSSCopilot', 'ParadoxCopilot'] as const).map((type) => ({
        type,
        enabled: true,
        params: { filename: `/synthetic/${type}.json` },
      })),
    );
    await api.call('plan.save', { plan });
  });
  await reloadWorkspace(page, '上游任务参数');
  for (const [index, label, type] of [
    [26, '自动作业', 'Copilot'],
    [27, '保全派驻', 'SSSCopilot'],
    [28, '悖论模拟', 'ParadoxCopilot'],
  ] as const) {
    await wb(page)
      .getByRole('button', { name: `设置第 ${index} 条${label}`, exact: true })
      .click();
    await expect(wb(page).getByLabel(paths[type], { exact: true })).toHaveValue(
      `/synthetic/${type}.json`,
    );
    await expect(wb(page).getByRole('button', { name: '复制到作业库', exact: true })).toBeVisible();
  }
});

test('unsaved task drafts survive navigation and page reloads without corrupting saved data', async ({
  page,
}) => {
  await openWorkspace(page);
  await closeDetail(page);
  await page.getByRole('button', { name: '查看任务表详情固源岩补给', exact: true }).click();
  await wb(page).getByLabel('作战次数').fill('9');
  await wb(page).locator('.advanced-params summary').click();
  await wb(page).getByLabel('任务参数 JSON').fill('{"stage":');
  await navigate(page, '工具箱');
  await navigate(page, '主页');
  await openSavedPlan(page, '固源岩补给');
  await expect(wb(page).getByLabel('任务参数 JSON')).toHaveValue('{"stage":');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('保存失败');
  await reloadWorkspace(page, '固源岩补给');
  await expect(wb(page).getByLabel('任务参数 JSON')).toHaveValue('{"stage":');
  await expect(wb(page).getByLabel('作战次数')).toBeDisabled();
  await tab(page, '任务表设置');
  await wb(page).getByRole('button', { name: '恢复已保存配置', exact: true }).click();
  await expect(wb(page).locator('.wb-save-state')).toHaveText('已保存');
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('6');
});

test('global search locates updates, saved tables and individual task settings', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWorkspace(page);
  await closeDetail(page);
  const search = page.getByLabel('搜索任务与设置', { exact: true });
  const results = page.getByRole('region', { name: '搜索结果', exact: true });
  await search.fill('资源更新');
  await expect(results).toBeVisible();
  await results.getByRole('button', { name: /更新/ }).click();
  await expect(channel(page, 'Maa Verge 应用')).toBeVisible();
  await expect(channel(page, 'MaaCore 核心')).toBeVisible();
  await expect(channel(page, '游戏资源')).toBeVisible();
  await expect(page.getByLabel('搜索设置', { exact: true })).toHaveValue('资源更新');
  await expect(results).toBeHidden();
  await search.fill('固源岩');
  await page
    .getByRole('region', { name: '搜索结果' })
    .getByRole('button', { name: /固源岩补给/ })
    .click();
  await expect(wb(page).getByRole('heading', { name: '固源岩补给', exact: true })).toBeVisible();
  await wb(page).getByLabel('搜索当前任务设置', { exact: true }).fill('作战次数');
  await expect(wb(page).getByLabel('作战次数')).toBeVisible();
  await expect(wb(page).getByLabel('理智药上限', { exact: true })).toHaveCount(0);
  await wb(page).getByRole('button', { name: '清除任务设置搜索', exact: true }).click();
  await wb(page).getByLabel('搜索任务类型', { exact: true }).fill('仓库');
  await expect(wb(page).getByLabel('添加任务类型').locator('option')).toHaveCount(1);
  await wb(page).getByRole('button', { name: '添加任务', exact: true }).click();
  await expect(wb(page).getByRole('heading', { name: '仓库识别', exact: true })).toBeVisible();
  await closeDetail(page);
  await search.fill('无人机');
  await page
    .getByRole('region', { name: '搜索结果' })
    .getByRole('button', { name: /无人机用途/ })
    .click();
  await expect(wb(page).getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
  await expect(wb(page).getByRole('heading', { name: '基建换班', exact: true })).toBeVisible();
  await expect(wb(page).getByLabel('无人机用途', { exact: true })).toBeVisible();
  await expect(wb(page).getByLabel('设施顺序', { exact: true })).toHaveCount(0);
});

test('recruitment calculation is independent and never creates a task table', async ({ page }) => {
  await openWorkspace(page);
  await navigate(page, '工具箱');
  await page.getByLabel('工具箱设备', { exact: true }).selectOption('mock-device-1');
  await page
    .getByRole('navigation', { name: '工具分类' })
    .getByRole('button', { name: '公招计算', exact: true })
    .click();
  await expect(page.getByText('仅计算，不确认招募、不刷新标签、不使用加急许可。')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始计算', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '配置只计算任务', exact: true })).toHaveCount(0);
  await expect(dock(page)).not.toContainText('执行中');
});

test('model preferences automatically save when changing settings categories', async ({ page }) => {
  await openWorkspace(page);
  await settingsCategory(page, '模型与 Agent');
  await page.getByLabel('模型名称', { exact: true }).fill('synthetic-model');
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '通用与外观', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '模型与 Agent', exact: true })
    .click();
  await expect(page.getByLabel('模型名称', { exact: true })).toHaveValue('synthetic-model');
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
            .settings.model.model,
      ),
    )
    .toBe('synthetic-model');
  await page.reload();
  await settingsCategory(page, '模型与 Agent');
  await expect(page.getByLabel('模型名称', { exact: true })).toHaveValue('synthetic-model');
});
