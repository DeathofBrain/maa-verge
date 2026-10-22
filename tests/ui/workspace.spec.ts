import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/desktop';

const wb = (page: Page) => page.getByRole('region', { name: '任务表工作台', exact: true });
const dock = (page: Page) => page.getByRole('contentinfo', { name: '执行状态栏', exact: true });
const home = (page: Page) => page.getByRole('region', { name: '主页仪表盘', exact: true });
const metric = (page: Page, name: string) => home(page).getByLabel(name, { exact: true }).locator('strong');
async function openHome(page: Page) {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await expect(page.locator('.environment-badge')).toHaveText('本地运行');
}
async function openTaskTables(page: Page, group: 'daily' | 'specialized' = 'daily') {
  const menu = page.getByRole('button', { name: '打开导航', exact: true });
  if (await menu.isVisible()) await menu.click();
  await navigate(page, group === 'specialized' ? '专项任务' : '任务表');
  if (await menu.isVisible()) await menu.click();
}
async function openSavedPlan(page: Page, name = '每日长草计划', group: 'daily' | 'specialized' = 'daily') {
  await openTaskTables(page, group);
  await page.locator('.sidebar').getByRole('button', { name: `配置任务表${name}`, exact: true }).click();
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
async function navigate(page: Page, name: string) {
  await page.locator('.sidebar').getByRole('button', { name, exact: name !== 'Agent 助手' }).click();
}
async function createPlan(page: Page, name: string) {
  await openTaskTables(page);
  await page.getByRole('button', { name: '添加任务表', exact: true }).click();
  await wb(page).getByLabel('任务表名称', { exact: true }).fill(name);
}
async function savePlan(page: Page) {
  await wb(page).getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(wb(page).locator('.wb-save-state')).toHaveText('已保存');
}
async function tab(page: Page, name: string) { await wb(page).getByRole('tab', { name, exact: true }).click(); }
async function settingsCategory(page: Page, name: string) {
  await navigate(page, '设置');
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name, exact: true }).click();
}
function channel(page: Page, name: string) { return page.locator('.update-channel').filter({ has: page.getByRole('heading', { name, exact: true }) }); }

test('home shows runtime information and task tables have their own navigation entry', async ({ page }) => {
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
  await expect(home(page).getByRole('button', { name: /新建任务表|新增日常任务表|运行已保存任务表|编辑任务表|开始/ })).toHaveCount(0);
  await expect(page.locator('.sidebar').getByRole('button', { name: /^配置任务表/ })).toHaveCount(0);
  await expect(page.locator('.sidebar').getByRole('button', { name: '添加任务表', exact: true })).toHaveCount(0);
  await openSavedPlan(page, '固源岩补给');
  await expect(page.locator('.primary-nav .nav-item[aria-current="page"]')).toHaveText('任务表');
  await expect(page.locator('.sidebar').getByRole('button', { name: '配置任务表每日长草计划', exact: true })).toBeVisible();
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('6');
  await navigate(page, '主页');
  await expect(home(page)).toBeVisible();
  await expect(page.locator('.sidebar').getByRole('button', { name: /^配置任务表/ })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('maaverge:ui:selected-plan'))).toBe('farm-1-7');
  await page.reload();
  await expect(home(page)).toBeVisible();
  await expect(wb(page)).toHaveCount(0);
  await expect(page.locator('.sidebar').getByRole('button', { name: /^配置任务表/ })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('maaverge:ui:selected-plan'))).toBe('farm-1-7');
});

test('home reports an editor-started run without changing its unsaved draft', async ({ page }) => {
  await openHome(page);
  await openSavedPlan(page, '固源岩补给');
  await wb(page).getByLabel('作战次数').fill('9');
  await wb(page).getByRole('button', { name: '开始日常', exact: true }).click();
  await wb(page).getByRole('button', { name: '使用已保存配置', exact: true }).click();
  await expect(dock(page)).toContainText('执行中');
  await navigate(page, '主页');
  await expect(metric(page, '今日执行统计')).toHaveText('1');
  await expect(metric(page, '今日完成统计')).toHaveText('0');
  await expect(metric(page, '运行统计')).toHaveText('1');
  const current = home(page).getByRole('region', { name: '当前执行', exact: true });
  await expect(current).toContainText('固源岩补给');
  await expect(current.getByRole('progressbar', { name: '当前执行进度', exact: true })).toBeVisible();
  await current.getByRole('button', { name: '查看运行详情', exact: true }).click();
  await expect(page.getByRole('region', { name: '运行详情', exact: true })).toContainText('固源岩补给');
  await page.getByRole('button', { name: '收起运行详情', exact: true }).click();
  await current.getByRole('button', { name: '停止执行', exact: true }).click();
  await expect(metric(page, '运行统计')).toHaveText('0');
  await expect(metric(page, '今日执行统计')).toHaveText('1');
  await expect(metric(page, '今日完成统计')).toHaveText('0');
  await expect(home(page).getByRole('region', { name: '最近执行', exact: true })).toContainText('模拟执行已停止');
  await openSavedPlan(page, '固源岩补给');
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('9');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('未保存');
  await tab(page, '任务表设置');
  await wb(page).getByRole('button', { name: '恢复已保存配置', exact: true }).click();
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('6');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('已保存');
  await navigate(page, '主页');
  await expect(metric(page, '今日执行统计')).toHaveText('1');
  await expect(metric(page, '今日完成统计')).toHaveText('0');
  await expect(metric(page, '运行统计')).toHaveText('0');
  await expect(home(page)).toContainText('模拟执行已停止');
});

test('home remains useful without task tables and new tables can be added through their own page', async ({ page }) => {
  await openHome(page);
  for (const name of ['每日长草计划', '固源岩补给']) {
    await openSavedPlan(page, name);
    await tab(page, '任务表设置');
    await wb(page).getByRole('button', { name: '删除任务表', exact: true }).click();
    await page.getByRole('dialog', { name: '删除任务表', exact: true }).getByRole('button', { name: '删除任务表', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '删除任务表', exact: true })).toBeHidden();
    await navigate(page, '主页');
  }
  await expect(home(page).getByRole('heading', { name: '主页', exact: true })).toBeVisible();
  await expect(metric(page, '今日执行统计')).toHaveText('0');
  await expect(metric(page, '今日完成统计')).toHaveText('0');
  await expect(metric(page, '设备统计')).toHaveText('1');
  await expect(metric(page, '运行统计')).toHaveText('0');
  await expect(home(page).getByRole('article', { name: /^任务表/ })).toHaveCount(0);
  await expect(home(page).getByRole('button', { name: /新建任务表|新增日常任务表|开始/ })).toHaveCount(0);
  await expect(page.locator('.sidebar').getByRole('button', { name: /^配置任务表/ })).toHaveCount(0);
  await expect(home(page).getByRole('heading', { name: '还没有执行记录', exact: true })).toBeVisible();
  await openTaskTables(page);
  await page.locator('.sidebar').getByRole('button', { name: '添加任务表', exact: true }).click();
  await expect(wb(page).getByRole('heading', { name: '日常表1', exact: true })).toBeVisible();
  await wb(page).getByLabel('任务表名称', { exact: true }).fill('第一张任务表');
  await savePlan(page);
  await navigate(page, '主页');
  await expect(home(page).getByLabel('任务表统计', { exact: true })).toHaveCount(0);
  await expect(page.locator('.sidebar').getByRole('button', { name: /^配置任务表/ })).toHaveCount(0);
  await openSavedPlan(page, '第一张任务表');
});

// Preserve the original persistence, policy, task coverage and update scenarios.
test('create, edit and restore a zero-consumption task table', async ({ page }) => {
  await openWorkspace(page);
  await createPlan(page, '测试：每日固源岩');
  await wb(page).getByLabel('作战次数').fill('3');
  await expect(wb(page).getByText('本表有效上限：理智药 0 · 源石 0')).toBeVisible();
  await savePlan(page);
  await expect(page.getByRole('button', { name: '配置任务表测试：每日固源岩', exact: true })).toBeVisible();
  await tab(page, '任务表设置');
  await wb(page).getByLabel('任务表名称', { exact: true }).fill('测试：更新后的计划');
  await tab(page, '任务编排');
  await wb(page).getByLabel('作战次数').fill('4');
  await savePlan(page);
  await reloadWorkspace(page, '测试：更新后的计划');
  await expect(wb(page).getByRole('heading', { name: '测试：更新后的计划', exact: true })).toBeVisible();
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('4');
});

test('Agent proposes a reviewable plan without starting a run', async ({ page }) => {
  await openWorkspace(page);
  await navigate(page, 'Agent 助手');
  await page.getByRole('button', { name: '制定刷 6 次 1-7 的计划' }).click();
  await expect(page.getByText('这是本地规则生成的演示计划', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '检查并保存计划' }).click();
  await expect(wb(page).getByLabel('作战关卡')).toHaveValue('1-7');
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('6');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('未保存');
  await savePlan(page);
  await navigate(page, '执行记录');
  await expect(page.getByRole('heading', { name: '还没有执行记录' })).toBeVisible();
  await navigate(page, '主页');
  await openSavedPlan(page, 'Agent 刷图计划 · 1-7');
  await expect(wb(page).getByRole('heading', { name: 'Agent 刷图计划 · 1-7' })).toBeVisible();
});

test('the persistent run dock reports progress and stop preserves the plan and history', async ({ page }) => {
  await openWorkspace(page);
  await wb(page).getByRole('button', { name: '开始日常', exact: true }).click();
  await expect(dock(page)).toContainText('执行中');
  await navigate(page, '工具箱');
  await expect(dock(page)).toContainText('任务进度');
  await dock(page).getByRole('button', { name: '运行详情', exact: true }).click();
  const details = page.getByRole('region', { name: '运行详情', exact: true });
  await expect(details).toContainText('运行中编辑和保存的设置用于下一次执行。停止会结束当前队列。');
  await dock(page).getByRole('button', { name: '停止执行', exact: true }).click();
  await expect(dock(page).getByRole('button', { name: '停止执行', exact: true })).toBeHidden();
  await page.getByRole('button', { name: '收起运行详情', exact: true }).click();
  await navigate(page, '执行记录');
  await expect(page.getByRole('cell', { name: '已停止', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '模拟执行已停止', exact: true })).toBeVisible();
  await reloadWorkspace(page, '每日长草计划');
  await expect(wb(page).getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
});

test('resource updates activate independently without changing MaaCore', async ({ page }) => {
  await openWorkspace(page);
  await settingsCategory(page, '更新');
  const core = channel(page, 'MaaCore 核心');
  const resource = channel(page, '游戏资源');
  await expect(core.locator('.channel-version')).toHaveText('v6.19.0');
  await resource.getByRole('button', { name: '检查更新', exact: true }).click();
  await resource.getByRole('button', { name: '准备更新', exact: true }).click();
  await resource.getByRole('button', { name: '应用更新', exact: true }).click();
  await expect(resource.locator('.channel-version')).toHaveText('2026-10-20');
  await expect(resource.locator('.pill')).toHaveText('已更新');
  await expect(core.locator('.channel-version')).toHaveText('v6.19.0');
  await resource.getByRole('button', { name: '回滚上一版本', exact: true }).click();
  await expect(resource.locator('.channel-version')).toContainText('2026-10-18');
});

test('a prepared update waits for the running device before activating', async ({ page }) => {
  await openWorkspace(page);
  await wb(page).getByRole('button', { name: '开始日常', exact: true }).click();
  await settingsCategory(page, '更新');
  const core = channel(page, 'MaaCore 核心');
  await core.getByRole('button', { name: '检查更新', exact: true }).click();
  await core.getByRole('button', { name: '准备更新', exact: true }).click();
  await core.getByRole('button', { name: '应用更新', exact: true }).click();
  await expect(core.getByRole('button', { name: '等待空闲生效' })).toBeDisabled();
  await expect(core.locator('.channel-version')).toContainText('v6.19.0');
  await dock(page).getByRole('button', { name: '停止执行', exact: true }).click();
  await expect(core.locator('.pill')).toHaveText('已更新');
  await expect(core.locator('.channel-version')).toHaveText('v6.20.0');
});

test('the runtime rejects deleting an executing task table and displays the error', async ({ page }) => {
  await openWorkspace(page);
  await wb(page).getByRole('button', { name: '开始日常', exact: true }).click();
  await tab(page, '任务表设置');
  await wb(page).getByRole('button', { name: '删除任务表', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '删除任务表', exact: true });
  await confirmation.getByRole('button', { name: '删除任务表', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('请先停止执行中的计划');
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(wb(page).getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
});

test('mobile navigation and all primary pages fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  for (const name of ['任务表', '专项任务', '作业中心', '工具箱', 'Agent 助手', '执行记录', '设备', '设置', '主页']) {
    await page.getByRole('button', { name: '打开导航', exact: true }).click();
    await navigate(page, name);
    await expect(page.getByRole('navigation', { name: '主导航' })).not.toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await openTaskTables(page);
  await page.getByRole('button', { name: '添加任务表', exact: true }).click();
  await expect(wb(page).getByRole('heading', { name: '日常表1', exact: true })).toBeVisible();
  await expect(wb(page).getByRole('tab', { name: '任务表设置', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('task tables preserve duplicate tasks, order, switches and advanced parameters', async ({ page }) => {
  await openWorkspace(page);
  await createPlan(page, '多步骤配置');
  await expect(wb(page).getByLabel('添加任务类型').locator('option')).toHaveCount(20);
  await wb(page).getByRole('button', { name: '添加任务', exact: true }).click();
  await wb(page).locator('.advanced-params summary').click();
  await wb(page).getByLabel('任务参数 JSON').fill(JSON.stringify({ stage: '2-4', times: 2, medicine: 0, stone: 0, drops: { '30012': 3 }, custom_future: { preserve: true } }));
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

test('advanced JSON preserves invalid drafts and updates list fields and switches', async ({ page }) => {
  await openWorkspace(page);
  await wb(page).getByRole('button', { name: '设置第 2 条公开招募' }).click();
  await wb(page).locator('.advanced-params summary').click();
  await wb(page).getByLabel('任务参数 JSON').fill('{"confirm":[5],"times":0}');
  await expect(wb(page).getByRole('checkbox', { name: '自动确认 5 星', exact: true })).toBeChecked();
  await expect(wb(page).getByRole('checkbox', { name: '自动确认 4 星', exact: true })).not.toBeChecked();
  await wb(page).getByLabel('任务参数 JSON').fill('{"confirm":');
  await expect(wb(page).getByLabel('招募次数')).toBeDisabled();
  await wb(page).getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(wb(page).getByRole('alert').first()).toContainText('有效 JSON');
  await expect(wb(page).getByLabel('任务参数 JSON')).toHaveValue('{"confirm":');
  await wb(page).getByLabel('任务参数 JSON').fill('{"enable":false,"confirm":[4,5],"times":0}');
  await expect(wb(page).getByLabel('启用第 2 条任务')).not.toBeChecked();
  await wb(page).getByLabel('启用第 2 条任务').check();
  expect(JSON.parse(await wb(page).getByLabel('任务参数 JSON').inputValue()).enable).toBe(true);
  await expect(wb(page).getByRole('checkbox', { name: '自动确认 4 星', exact: true })).toBeChecked();
  await expect(wb(page).getByRole('checkbox', { name: '自动确认 5 星', exact: true })).toBeChecked();
  await savePlan(page);
});

test('routine fight settings preserve targets, multiplier and unlimited count after reload', async ({ page }) => {
  await openWorkspace(page);
  await openSavedPlan(page, '固源岩补给');
  await wb(page).getByLabel('作战关卡', { exact: true }).selectOption('CE-6');
  await expect(wb(page).getByLabel('作战关卡', { exact: true })).toHaveValue('CE-6');
  await wb(page).getByRole('checkbox', { name: '指定次数', exact: true }).uncheck();
  await wb(page).getByLabel('代理倍率', { exact: true }).selectOption('0');
  await wb(page).getByLabel('目标材料', { exact: true }).selectOption('30013');
  await wb(page).getByRole('button', { name: '添加材料目标', exact: true }).click();
  await wb(page).getByLabel('固源岩组目标数量', { exact: true }).fill('7');
  await savePlan(page);
  await reloadWorkspace(page, '固源岩补给');
  await expect(wb(page).getByRole('checkbox', { name: '指定次数', exact: true })).not.toBeChecked();
  await expect(wb(page).getByLabel('固源岩组目标数量', { exact: true })).toHaveValue('7');
  await expect(wb(page).getByLabel('代理倍率', { exact: true })).toHaveValue('0');
  await wb(page).locator('.advanced-params summary').click();
  const params = JSON.parse(await wb(page).getByLabel('任务参数 JSON').inputValue());
  expect(params).toMatchObject({ stage: 'CE-6', series: 0, times: 2147483647, drops: { '30013': 7 }, medicine: 0, stone: 0 });
  await wb(page).getByLabel('代理倍率', { exact: true }).selectOption('-1');
  expect(JSON.parse(await wb(page).getByLabel('任务参数 JSON').inputValue()).series).toBe(-1);
});

test('all eleven base facilities and credit clue actions map to core parameters', async ({ page }) => {
  await openWorkspace(page);
  await wb(page).getByRole('button', { name: '设置第 3 条基建换班', exact: true }).click();
  const facilities = wb(page).getByRole('group', { name: '换班设施与顺序', exact: true });
  await expect(facilities.getByRole('checkbox')).toHaveCount(11);
  await wb(page).getByRole('button', { name: '全选设施', exact: true }).click();
  await facilities.getByRole('checkbox', { name: '回收站', exact: true }).uncheck();
  await wb(page).getByLabel('换班心情阈值', { exact: false }).fill('40');
  for (const label of ['会客室信息板收取信用', '进行线索交流', '赠送线索']) await wb(page).getByRole('checkbox', { name: label, exact: true }).check();
  await savePlan(page);
  await reloadWorkspace(page, '每日长草计划');
  await wb(page).getByRole('button', { name: '设置第 3 条基建换班', exact: true }).click();
  await wb(page).locator('.advanced-params summary').click();
  const params = JSON.parse(await wb(page).getByLabel('任务参数 JSON').inputValue());
  expect(params.facility).toHaveLength(10);
  expect(params.facility).toEqual(expect.arrayContaining(['Processing', 'Training', 'AssistantChange']));
  expect(params).toMatchObject({ threshold: 0.4, reception_message_board: true, reception_clue_exchange: true, reception_send_clue: true });
  await wb(page).getByRole('button', { name: '清空设施', exact: true }).click();
  expect(JSON.parse(await wb(page).getByLabel('任务参数 JSON').inputValue()).facility).toEqual([]);
});

test('recruitment confirmation and per-star times save without enabling restricted consumption', async ({ page }) => {
  await openWorkspace(page);
  await wb(page).getByRole('button', { name: '设置第 2 条公开招募', exact: true }).click();
  await wb(page).getByRole('checkbox', { name: '自动确认 5 星', exact: true }).check();
  await wb(page).getByLabel('3 星招募时长', { exact: true }).fill('07:40');
  await expect(wb(page).getByLabel('5 星招募时长', { exact: true })).toBeDisabled();
  await expect(wb(page).getByRole('checkbox', { name: '自动确认 6 星', exact: true })).toBeDisabled();
  await expect(wb(page).getByRole('checkbox', { name: '自动使用加急许可', exact: true })).toBeDisabled();
  await savePlan(page);
  await reloadWorkspace(page, '每日长草计划');
  await wb(page).getByRole('button', { name: '设置第 2 条公开招募', exact: true }).click();
  await expect(wb(page).getByLabel('3 星招募时长', { exact: true })).toHaveValue('07:40');
  await wb(page).locator('.advanced-params summary').click();
  expect(JSON.parse(await wb(page).getByLabel('任务参数 JSON').inputValue())).toMatchObject({ confirm: [3, 4, 5], select: [3, 4, 5], recruitment_time: { '3': 460 }, set_time: true });
});

test('reward switches and combined data update restore their independent settings', async ({ page }) => {
  await openWorkspace(page);
  await wb(page).getByRole('button', { name: '设置第 5 条领取奖励', exact: true }).click();
  const rewards = wb(page).locator('.task-fields').getByRole('checkbox');
  await expect(rewards).toHaveCount(7);
  for (const checkbox of await rewards.all()) await checkbox.check();
  await wb(page).getByLabel('添加任务类型').selectOption('UserDataUpdate');
  await wb(page).getByRole('button', { name: '添加任务', exact: true }).click();
  await wb(page).getByRole('checkbox', { name: '干员识别', exact: true }).uncheck();
  await wb(page).getByLabel('触发间隔', { exact: true }).selectOption('weekly');
  await expect(wb(page).getByLabel('数据同步状态', { exact: true })).toContainText('暂无成功记录');
  await savePlan(page);
  await reloadWorkspace(page, '每日长草计划');
  await wb(page).getByRole('button', { name: '设置第 6 条更新数据', exact: true }).click();
  await expect(wb(page).getByRole('checkbox', { name: '干员识别', exact: true })).not.toBeChecked();
  await expect(wb(page).getByRole('checkbox', { name: '仓库识别', exact: true })).toBeChecked();
  await expect(wb(page).getByLabel('触发间隔', { exact: true })).toHaveValue('weekly');
  await wb(page).getByRole('button', { name: '设置第 5 条领取奖励', exact: true }).click();
  for (const checkbox of await wb(page).locator('.task-fields').getByRole('checkbox').all()) await expect(checkbox).toBeChecked();
});

test('routine settings stay usable in desktop and narrow inspectors', async ({ page }, testInfo) => {
  await openWorkspace(page);
  for (const [width, theme] of [[1440, 'light'], [390, 'dark']] as const) {
    await page.setViewportSize({ width, height: 950 });
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    for (const [index, name] of [[1, '启动游戏'], [2, '公开招募'], [3, '基建换班']] as const) {
      const back = wb(page).getByRole('button', { name: '任务列表', exact: true });
      if (await back.isVisible()) await back.click();
      await wb(page).getByRole('button', { name: `设置第 ${index} 条${name}`, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const inspector = wb(page).getByRole('region', { name: '单项任务设置', exact: true });
      expect(await inspector.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${index}.png`) });
    }
  }
});

test('automatic connection is deterministic with the test runtime and its preference persists', async ({ page }) => {
  await openWorkspace(page);
  await navigate(page, '设备');
  await expect(page.getByRole('switch', { name: '自动连接模拟器', exact: true })).toBeChecked();
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(page.locator('.connection-diagnostics')).toContainText('未访问真实模拟器');
  await page.getByRole('switch', { name: '自动连接模拟器', exact: true }).click();
  await expect(page.getByRole('switch', { name: '自动连接模拟器', exact: true })).not.toBeChecked();
  await page.reload();
  await navigate(page, '设备');
  await expect(page.getByRole('switch', { name: '自动连接模拟器', exact: true })).not.toBeChecked();
  await navigate(page, '执行记录');
  await expect(page.getByRole('heading', { name: '还没有执行记录' })).toBeVisible();
});

test('capture choices preserve drafts and save independently of the actual connected protocol', async ({ page }) => {
  await openHome(page);
  await navigate(page, '设备');
  const form = page.locator('.sp-capture-form');
  await expect(page.getByLabel('截图协议', { exact: true })).toHaveValue('adb');
  await expect(page.getByLabel('实际截图方式', { exact: true })).toHaveText('未确认');
  await page.getByLabel('截图协议', { exact: true }).selectOption('mumu');
  await page.getByLabel('模拟器安装目录', { exact: true }).fill('C:\\synthetic\\MuMu');
  await page.getByLabel('模拟器实例索引', { exact: true }).fill('2');
  await navigate(page, '主页');
  await navigate(page, '设备');
  await expect(page.getByLabel('截图协议', { exact: true })).toHaveValue('mumu');
  await page.reload();
  await navigate(page, '设备');
  await expect(page.getByLabel('模拟器安装目录', { exact: true })).toHaveValue('C:\\synthetic\\MuMu');
  await expect(page.getByLabel('模拟器实例索引', { exact: true })).toHaveValue('2');
  await expect(form).toContainText('有未保存的修改');
  await form.getByRole('button', { name: '放弃修改', exact: true }).click();
  await expect(page.getByLabel('截图协议', { exact: true })).toHaveValue('adb');
  await page.getByLabel('截图协议', { exact: true }).selectOption('mumu');
  await page.getByLabel('模拟器安装目录', { exact: true }).fill('  C:\\synthetic\\MuMu  ');
  await page.getByLabel('模拟器实例索引', { exact: true }).fill('2');
  await form.getByRole('button', { name: '保存截图配置', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('断开设备后重新连接生效');
  await expect(form.getByText('已保存', { exact: true })).toBeVisible();
  await expect(page.getByLabel('实际截图方式', { exact: true })).toHaveText('未确认');
  await page.reload();
  await navigate(page, '设备');
  await expect(page.getByLabel('截图协议', { exact: true })).toHaveValue('mumu');
  await expect(page.getByLabel('模拟器安装目录', { exact: true })).toHaveValue('C:\\synthetic\\MuMu');
  await expect(page.getByLabel('模拟器实例索引', { exact: true })).toHaveValue('2');
  await page.getByLabel('截图协议', { exact: true }).selectOption('ldplayer');
  await page.getByLabel('模拟器安装目录', { exact: true }).fill('C:\\synthetic\\LDPlayer');
  await page.getByLabel('模拟器实例索引', { exact: true }).fill('0');
  await form.getByRole('button', { name: '保存截图配置', exact: true }).click();
  await expect(form.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await navigate(page, '设备');
  await expect(page.getByLabel('截图协议', { exact: true })).toHaveValue('ldplayer');
  await expect(page.getByLabel('模拟器安装目录', { exact: true })).toHaveValue('C:\\synthetic\\LDPlayer');
  await expect(page.getByLabel('模拟器实例索引', { exact: true })).toHaveValue('0');
  await expect(page.getByRole('switch', { name: '自动连接模拟器', exact: true })).toBeChecked();
  await page.getByRole('button', { name: '断开设备', exact: true }).click();
  await expect(page.getByLabel('实际截图方式', { exact: true })).toHaveText('未确认（设备已断开）');
  await navigate(page, '执行记录');
  await expect(page.getByRole('heading', { name: '还没有执行记录' })).toBeVisible();
});

test('enhanced capture requires an installation directory and a nonnegative integer instance', async ({ page }) => {
  await openHome(page);
  await navigate(page, '设备');
  const form = page.locator('.sp-capture-form');
  await page.getByLabel('截图协议', { exact: true }).selectOption('ldplayer');
  await expect(form).toContainText('不会自动改用 ADB 截图');
  await form.getByRole('button', { name: '保存截图配置', exact: true }).click();
  expect(await page.getByLabel('模拟器安装目录', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await page.getByLabel('模拟器安装目录', { exact: true }).fill('   ');
  expect(await page.getByLabel('模拟器安装目录', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.patternMismatch)).toBe(true);
  await page.getByLabel('模拟器安装目录', { exact: true }).fill('C:\\synthetic\\LDPlayer');
  await page.getByLabel('模拟器实例索引', { exact: true }).fill('-1');
  expect(await page.getByLabel('模拟器实例索引', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);
  await page.getByLabel('模拟器实例索引', { exact: true }).fill('1.5');
  expect(await page.getByLabel('模拟器实例索引', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.stepMismatch)).toBe(true);
  await form.getByRole('button', { name: '放弃修改', exact: true }).click();
  await expect(page.getByLabel('截图协议', { exact: true })).toHaveValue('adb');
});

test('task budgets and all-disabled execution are checked after saving', async ({ page }) => {
  await openWorkspace(page);
  await createPlan(page, '预算校验');
  await wb(page).getByLabel('理智药上限', { exact: true }).fill('1');
  await wb(page).getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(page.locator('.toast.error')).toContainText('已授权额度');
  await wb(page).getByLabel('理智药上限', { exact: true }).fill('0');
  for (const checkbox of await wb(page).getByRole('checkbox', { name: /^启用第 \d+ 条任务$/ }).all()) await checkbox.uncheck();
  await savePlan(page);
  await wb(page).getByRole('button', { name: '开始日常', exact: true }).click();
  await expect(page.locator('.toast.error')).toContainText('至少需要启用一条任务');
});

test('all upstream task entries can be configured and restored', async ({ page }) => {
  await openWorkspace(page);
  await createPlan(page, '上游任务参数');
  const options = ['StartUp', 'CloseDown', 'Fight', 'Recruit', 'Infrast', 'Mall', 'Award', 'SwitchTheme', 'Roguelike', 'Copilot', 'SSSCopilot', 'ParadoxCopilot', 'Depot', 'OperBox', 'Reclamation', 'Custom', 'SingleStep', 'VideoRecognition', 'OperProgress'];
  const paths: Record<string, string> = { Copilot: '作业文件路径', SSSCopilot: '保全作业文件路径', ParadoxCopilot: '悖论作业文件路径', VideoRecognition: '视频文件路径' };
  for (const type of options) {
    await wb(page).getByLabel('添加任务类型').selectOption(type);
    await wb(page).getByRole('button', { name: '添加任务', exact: true }).click();
    if (paths[type]) await wb(page).getByLabel(paths[type], { exact: true }).fill(`/synthetic/${type}.json`);
    if (type === 'Custom') await wb(page).getByLabel('资源任务入口', { exact: true }).fill('MiniGame@PixelPaint@Begin');
  }
  await savePlan(page);
  await reloadWorkspace(page, '上游任务参数');
  await expect(wb(page).locator('.editor-steps > li')).toHaveCount(28);
  await wb(page).getByRole('button', { name: '设置第 19 条自动作业', exact: true }).click();
  await expect(wb(page).getByLabel('作业文件路径', { exact: true })).toHaveValue('/synthetic/Copilot.json');
});

test('application budget form saves multiple values together', async ({ page }) => {
  await openWorkspace(page);
  await settingsCategory(page, '执行与消耗');
  await page.getByLabel('理智药预算', { exact: true }).fill('2');
  await page.getByLabel('源石预算', { exact: true }).fill('1');
  await page.getByRole('button', { name: '保存预算', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('消耗预算已保存');
  await page.reload();
  await settingsCategory(page, '执行与消耗');
  await expect(page.getByLabel('理智药预算', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('源石预算', { exact: true })).toHaveValue('1');
});

// New workbench behavior: drafts, scoped settings, search, and common tool entry points.
test('unsaved task drafts survive navigation and page reloads without corrupting saved data', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: '配置任务表固源岩补给', exact: true }).click();
  await wb(page).getByLabel('作战次数').fill('9');
  await wb(page).locator('.advanced-params summary').click();
  await wb(page).getByLabel('任务参数 JSON').fill('{"stage":');
  await navigate(page, '工具箱');
  await navigate(page, '主页');
  await openSavedPlan(page, '固源岩补给');
  await expect(wb(page).getByLabel('任务参数 JSON')).toHaveValue('{"stage":');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('未保存');
  await reloadWorkspace(page, '固源岩补给');
  await expect(wb(page).getByLabel('任务参数 JSON')).toHaveValue('{"stage":');
  await expect(wb(page).getByLabel('作战次数')).toBeDisabled();
  await tab(page, '任务表设置');
  await wb(page).getByRole('button', { name: '恢复已保存配置', exact: true }).click();
  await expect(wb(page).locator('.wb-save-state')).toHaveText('已保存');
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('6');
});

test('task-table metadata, device binding and explicit zero limits persist together', async ({ page }) => {
  await openWorkspace(page);
  await tab(page, '任务表设置');
  await wb(page).getByLabel('任务表名称', { exact: true }).fill('晚间日常');
  await wb(page).getByLabel('任务表说明', { exact: true }).fill('先收取，再换班；不使用消耗品。');
  await wb(page).getByLabel('绑定设备', { exact: true }).selectOption('mock-device-1');
  await wb(page).getByRole('checkbox', { name: '使用全局授权上限', exact: true }).uncheck();
  await expect(wb(page).getByLabel('任务表理智药上限', { exact: true })).toHaveValue('0');
  await savePlan(page);
  await reloadWorkspace(page, '晚间日常');
  await expect(wb(page).getByLabel('任务表名称', { exact: true })).toHaveValue('晚间日常');
  await expect(wb(page).getByLabel('任务表说明', { exact: true })).toHaveValue('先收取，再换班；不使用消耗品。');
  await expect(wb(page).getByLabel('绑定设备', { exact: true })).toHaveValue('mock-device-1');
  await expect(wb(page).getByRole('checkbox', { name: '使用全局授权上限', exact: true })).not.toBeChecked();
  await expect(wb(page).getByLabel('任务表理智药上限', { exact: true })).toBeEnabled();
  await tab(page, '定时计划');
  await expect(wb(page).getByRole('heading', { name: '定时执行尚未接入', exact: true })).toBeVisible();
  await expect(wb(page).getByRole('button', { name: '开始日常', exact: true })).toBeVisible();
});

test('a task-table limit can be lower than the application authorization', async ({ page }) => {
  await openWorkspace(page);
  await settingsCategory(page, '执行与消耗');
  await page.getByLabel('理智药预算', { exact: true }).fill('2');
  await page.getByRole('button', { name: '保存预算', exact: true }).click();
  await navigate(page, '主页');
  await createPlan(page, '表级限额');
  await wb(page).getByLabel('理智药上限', { exact: true }).fill('2');
  await tab(page, '任务表设置');
  await wb(page).getByRole('checkbox', { name: '使用全局授权上限', exact: true }).uncheck();
  await wb(page).getByLabel('任务表理智药上限', { exact: true }).fill('1');
  await wb(page).getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(page.locator('.toast.error')).toContainText('已授权额度');
  await tab(page, '任务编排');
  await expect(wb(page).getByText('本表有效上限：理智药 1 · 源石 0')).toBeVisible();
  await wb(page).getByLabel('理智药上限', { exact: true }).fill('1');
  await savePlan(page);
});

test('global search locates updates, saved tables and individual task settings', async ({ page }) => {
  await openWorkspace(page);
  const search = page.getByLabel('搜索任务与设置', { exact: true });
  await search.fill('资源更新');
  await page.getByRole('region', { name: '搜索结果' }).getByRole('button', { name: /更新/ }).click();
  await expect(channel(page, 'Maa Verge 应用')).toBeVisible();
  await expect(channel(page, 'MaaCore 核心')).toBeVisible();
  await expect(channel(page, '游戏资源')).toBeVisible();
  await expect(page.getByLabel('搜索设置', { exact: true })).toHaveValue('资源更新');
  await search.fill('固源岩');
  await page.getByRole('region', { name: '搜索结果' }).getByRole('button', { name: /固源岩补给/ }).click();
  await expect(wb(page).getByRole('heading', { name: '固源岩补给', exact: true })).toBeVisible();
  await wb(page).getByLabel('搜索当前任务设置', { exact: true }).fill('作战次数');
  await expect(wb(page).getByLabel('作战次数')).toBeVisible();
  await expect(wb(page).getByLabel('理智药上限', { exact: true })).toHaveCount(0);
  await wb(page).getByRole('button', { name: '清除任务设置搜索', exact: true }).click();
  await wb(page).getByLabel('搜索任务类型', { exact: true }).fill('仓库');
  await expect(wb(page).getByLabel('添加任务类型').locator('option')).toHaveCount(1);
  await wb(page).getByRole('button', { name: '添加任务', exact: true }).click();
  await expect(wb(page).getByRole('heading', { name: '仓库识别', exact: true })).toBeVisible();
  await search.fill('无人机');
  await page.getByRole('region', { name: '搜索结果' }).getByRole('button', { name: /无人机用途/ }).click();
  await expect(wb(page).getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
  await expect(wb(page).getByRole('heading', { name: '基建换班', exact: true })).toBeVisible();
  await expect(wb(page).getByLabel('无人机用途', { exact: true })).toBeVisible();
  await expect(wb(page).getByLabel('设施顺序', { exact: true })).toHaveCount(0);
});

test('starting with a draft offers saved execution or save-and-start explicitly', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: '配置任务表固源岩补给', exact: true }).click();
  await wb(page).getByLabel('作战次数').fill('9');
  await wb(page).getByRole('button', { name: '开始日常', exact: true }).click();
  await expect(wb(page).getByText('任务表有未保存的改动')).toBeVisible();
  await wb(page).getByRole('button', { name: '使用已保存配置', exact: true }).click();
  await expect(dock(page)).toContainText('执行中');
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('9');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('未保存');
  await dock(page).getByRole('button', { name: '停止执行', exact: true }).click();
  await wb(page).getByRole('button', { name: '开始日常', exact: true }).click();
  await wb(page).getByRole('button', { name: '保存并开始', exact: true }).click();
  await expect(wb(page).locator('.wb-save-state')).toHaveText('已保存');
  await expect(dock(page)).toContainText('执行中');
  await dock(page).getByRole('button', { name: '停止执行', exact: true }).click();
  await reloadWorkspace(page, '固源岩补给');
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('9');
});

test('device connect and disconnect stay deterministic with the test runtime', async ({ page }) => {
  await openWorkspace(page);
  await navigate(page, '设备');
  await page.getByLabel('手动连接 ADB 地址', { exact: true }).fill('localhost:5557');
  await page.getByRole('button', { name: '连接设备', exact: true }).click();
  await expect(page.locator('.sp-device-item')).toHaveCount(2);
  await expect(page.locator('.sp-device-detail')).toContainText('127.0.0.1:5557');
  await page.getByLabel('手动连接 ADB 地址', { exact: true }).fill('127.0.0.1:5557');
  await page.getByRole('button', { name: '连接设备', exact: true }).click();
  await expect(page.locator('.sp-device-item')).toHaveCount(2);
  await page.getByRole('button', { name: '断开设备', exact: true }).click();
  await expect(page.locator('.sp-device-detail')).toContainText('已断开');
  await expect(page.getByRole('button', { name: '断开设备', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(page.locator('.sp-device-detail')).toContainText('空闲就绪');
  await navigate(page, '执行记录');
  await expect(page.getByRole('heading', { name: '还没有执行记录' })).toBeVisible();
});

test('recruitment calculation opens a safe common task configuration', async ({ page }) => {
  await openWorkspace(page);
  await navigate(page, '工具箱');
  await page.getByRole('navigation', { name: '工具分类' }).getByRole('button', { name: '公招计算', exact: true }).click();
  await page.getByRole('button', { name: '配置只计算任务', exact: true }).click();
  await expect(wb(page).locator('.editor-steps > li')).toHaveCount(1);
  await expect(wb(page).getByLabel('招募次数', { exact: true })).toHaveValue('0');
  for (const star of [3, 4, 5, 6]) await expect(wb(page).getByRole('checkbox', { name: `自动确认 ${star} 星`, exact: true })).not.toBeChecked();
  await wb(page).locator('.wb-field-section').filter({ has: page.locator('summary', { hasText: '招募策略' }) }).locator('summary').click();
  await expect(wb(page).getByLabel('自动刷新标签', { exact: true })).not.toBeChecked();
  await expect(wb(page).getByLabel('自动使用加急许可', { exact: true })).not.toBeChecked();
  await expect(wb(page).getByLabel('自动使用加急许可', { exact: true })).toBeDisabled();
  await expect(dock(page)).not.toContainText('执行中');
});

test('budget drafts survive settings category changes without saving prematurely', async ({ page }) => {
  await openWorkspace(page);
  await settingsCategory(page, '执行与消耗');
  await page.getByLabel('理智药预算', { exact: true }).fill('3');
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '通用与外观', exact: true }).click();
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '执行与消耗', exact: true }).click();
  await expect(page.getByLabel('理智药预算', { exact: true })).toHaveValue('3');
  await expect(page.getByText('有未保存的修改', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存预算', exact: true }).click();
  await page.reload();
  await settingsCategory(page, '执行与消耗');
  await expect(page.getByLabel('理智药预算', { exact: true })).toHaveValue('3');
});

test('copilot entries focus the exact task when a table contains duplicate task types', async ({ page }) => {
  await openWorkspace(page);
  await createPlan(page, '双作业');
  for (const filename of ['/synthetic/first.json', '/synthetic/second.json']) {
    await wb(page).getByLabel('添加任务类型').selectOption('Copilot');
    await wb(page).getByRole('button', { name: '添加任务', exact: true }).click();
    await wb(page).getByLabel('作业文件路径', { exact: true }).fill(filename);
  }
  await savePlan(page);
  await navigate(page, '作业中心');
  await page.getByRole('button', { name: '/synthetic/second.json', exact: true }).click();
  await page.getByRole('button', { name: '编辑作业配置', exact: true }).click();
  await expect(wb(page).getByRole('heading', { name: '双作业', exact: true })).toBeVisible();
  await expect(wb(page).getByLabel('作业文件路径', { exact: true })).toHaveValue('/synthetic/second.json');
  await expect(wb(page).getByText('第 11 条任务 · 独立设置', { exact: true })).toBeVisible();
});

test('moving a table to specialized tasks preserves its editor entry while reload returns home', async ({ page }) => {
  await openWorkspace(page);
  await tab(page, '任务表设置');
  await wb(page).getByLabel('任务分组', { exact: true }).selectOption('specialized');
  await wb(page).getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(page.locator('.primary-nav .nav-item[aria-current="page"]')).toHaveText('专项任务');
  await expect(wb(page).getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
  await page.reload();
  await expect(home(page)).toBeVisible();
  await expect(page.locator('.primary-nav .nav-item[aria-current="page"]')).toHaveText('主页');
  await openSavedPlan(page, '每日长草计划', 'specialized');
  await expect(page.locator('.primary-nav .nav-item[aria-current="page"]')).toHaveText('专项任务');
  await expect(wb(page).getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
  await tab(page, '任务表设置');
  await expect(wb(page).getByLabel('任务分组', { exact: true })).toHaveValue('specialized');
});
