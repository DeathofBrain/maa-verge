import { expect, test, type Page } from '@playwright/test';

async function openWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '工作空间.' })).toBeVisible();
  await expect(page.getByText('模拟工作空间', { exact: true })).toBeVisible();
}

function channel(page: Page, name: string) {
  return page.locator('.update-channel').filter({ has: page.getByRole('heading', { name, exact: true }) });
}

test('create, edit and restore a zero-consumption plan', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '创建任务表', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '创建任务表' });
  await editor.getByLabel('任务表名称').fill('测试：每日固源岩');
  await editor.getByLabel('作战次数').fill('3');
  await expect(editor.getByText('理智药 0 · 源石 0')).toBeVisible();
  await editor.getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(editor).toBeHidden();
  const card = page.locator('.plan-card').filter({ has: page.getByRole('heading', { name: '测试：每日固源岩' }) });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('任务表名称').fill('测试：更新后的计划');
  await page.getByLabel('作战次数').fill('4');
  await page.getByRole('button', { name: '保存任务表', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '任务', exact: true }).click();
  await expect(page.getByRole('heading', { name: '测试：更新后的计划' })).toBeVisible();
  await page.getByRole('button', { name: '编辑测试：更新后的计划', exact: true }).click();
  await expect(page.getByLabel('作战次数')).toHaveValue('4');
});

test('Agent proposes a reviewable plan without starting a run', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: 'Agent 助手', exact: true }).click();
  await page.getByRole('button', { name: '制定刷 6 次 1-7 的计划' }).click();
  await expect(page.getByText('这是本地规则生成的演示计划', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '检查并保存计划' }).click();
  await expect(page.getByLabel('作战关卡')).toHaveValue('1-7');
  await expect(page.getByLabel('作战次数')).toHaveValue('6');
  await expect(page.getByText('理智药 0 · 源石 0')).toBeVisible();
  await page.getByRole('button', { name: '保存任务表', exact: true }).click();
  await page.getByRole('button', { name: '执行记录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '还没有执行记录' })).toBeVisible();
  await page.getByRole('button', { name: '任务', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Agent 刷图计划 · 1-7' })).toBeVisible();
});

test('a run reports progress and stopping preserves its plan and history', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: '开始日常任务', exact: true }).click();
  await expect(page.locator('.current-run')).toBeVisible();
  await expect(page.locator('.progress-caption')).toContainText('%');
  await page.locator('.current-run').getByRole('button', { name: '停止', exact: true }).click();
  await expect(page.locator('.current-run')).toBeHidden();
  await page.getByRole('button', { name: '执行记录', exact: true }).click();
  await expect(page.getByRole('cell', { name: '已停止', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '模拟执行已停止', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '任务', exact: true }).click();
  await expect(page.getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
});

test('resource updates activate independently without changing MaaCore', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: '设置与更新', exact: true }).click();
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
  await page.getByRole('button', { name: '开始日常任务', exact: true }).click();
  await page.getByRole('button', { name: '设置与更新', exact: true }).click();
  const core = channel(page, 'MaaCore 核心');
  await core.getByRole('button', { name: '检查更新', exact: true }).click();
  await core.getByRole('button', { name: '准备更新', exact: true }).click();
  await core.getByRole('button', { name: '应用更新', exact: true }).click();
  await expect(core.getByRole('button', { name: '等待空闲生效' })).toBeDisabled();
  await expect(core.locator('.channel-version')).toContainText('v6.19.0');
  await page.getByRole('button', { name: '任务总览', exact: true }).click();
  await page.locator('.current-run').getByRole('button', { name: '停止', exact: true }).click();
  await page.getByRole('button', { name: '设置与更新', exact: true }).click();
  await expect(core.locator('.pill')).toHaveText('已更新');
  await expect(core.locator('.channel-version')).toHaveText('v6.20.0');
});

test('the runtime rejects deleting an executing plan and displays the error', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: '开始日常任务', exact: true }).click();
  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '删除每日长草计划', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('请先停止执行中的计划');
  await expect(page.getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
});

test('mobile navigation and all primary pages fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  for (const name of ['任务', 'Agent 助手', '执行记录', '设置与更新', '任务总览']) {
    await page.getByRole('button', { name: '打开导航', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('navigation', { name: '主导航' })).not.toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.getByRole('button', { name: '创建新任务表', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '创建任务表' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('sidebar task tables preserve duplicate tasks, order, switches and advanced parameters', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: '添加任务表', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '创建任务表' });
  await editor.getByLabel('任务表名称').fill('多步骤配置');
  await expect(editor.getByLabel('添加任务类型').locator('option')).toHaveCount(19);
  await editor.getByRole('button', { name: '添加任务', exact: true }).click();
  await editor.getByLabel('作战关卡', { exact: true }).fill('2-4');
  await editor.locator('summary').click();
  await editor.getByLabel('任务参数 JSON').fill(JSON.stringify({ stage: '2-4', times: 2, medicine: 0, stone: 0, drops: { '30012': 3 }, custom_future: { preserve: true } }));
  await editor.getByLabel('作战次数', { exact: true }).fill('5');
  await editor.getByRole('button', { name: '上移任务' }).click();
  await editor.getByLabel('启用第 2 条任务').uncheck();
  await editor.getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: '配置任务表多步骤配置', exact: true }).click();
  await expect(page.getByLabel('启用第 2 条任务')).not.toBeChecked();
  await page.getByRole('button', { name: '设置第 3 条自动作战', exact: true }).click();
  await expect(page.getByLabel('作战关卡', { exact: true })).toHaveValue('2-4');
  await expect(page.getByLabel('作战次数', { exact: true })).toHaveValue('5');
  await page.locator('.plan-editor summary').click();
  const parameters = JSON.parse(await page.getByLabel('任务参数 JSON').inputValue());
  expect(parameters.drops).toEqual({ '30012': 3 });
  expect(parameters.custom_future).toEqual({ preserve: true });
  await page.getByRole('button', { name: '设置第 2 条自动作战', exact: true }).click();
  await expect(page.getByLabel('作战关卡', { exact: true })).toHaveValue('1-7');
});

test('advanced JSON stays editable without losing invalid drafts and updates list fields', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: '配置任务表每日长草计划' }).click();
  const editor = page.getByRole('dialog', { name: '编辑任务表' });
  await editor.getByRole('button', { name: '设置第 2 条公开招募' }).click();
  await editor.locator('summary').click();
  await editor.getByLabel('任务参数 JSON').fill('{"confirm":[5],"times":0}');
  await expect(editor.getByLabel('自动确认星级')).toHaveValue('5');
  await editor.getByLabel('任务参数 JSON').fill('{"confirm":');
  await expect(editor.getByLabel('招募次数')).toBeDisabled();
  await editor.getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(editor.getByRole('alert').last()).toContainText('有效 JSON');
  await expect(editor.getByLabel('任务参数 JSON')).toHaveValue('{"confirm":');
  await editor.getByLabel('任务参数 JSON').fill('{"confirm":[4,5],"times":0}');
  await expect(editor.getByLabel('自动确认星级')).toHaveValue('4, 5');
  await editor.getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(editor).toBeHidden();
});

test('automatic connection is safe in mock mode and its preference persists', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: '设置与更新', exact: true }).click();
  await expect(page.getByRole('switch', { name: '自动连接模拟器', exact: true })).toBeChecked();
  await page.getByRole('button', { name: '自动连接模拟器', exact: true }).click();
  await expect(page.locator('.connection-diagnostics')).toContainText('未访问真实模拟器');
  await page.getByRole('switch', { name: '自动连接模拟器', exact: true }).click();
  await expect(page.getByRole('switch', { name: '自动连接模拟器', exact: true })).not.toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: '设置与更新', exact: true }).click();
  await expect(page.getByRole('switch', { name: '自动连接模拟器', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: '执行记录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '还没有执行记录' })).toBeVisible();
});

test('task budgets and all-disabled execution are checked after saving', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: '添加任务表', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '创建任务表' });
  await editor.getByLabel('任务表名称').fill('预算校验');
  await editor.getByLabel('理智药上限', { exact: true }).fill('1');
  await editor.getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(page.locator('.toast.error')).toContainText('已授权额度');
  await editor.getByLabel('理智药上限', { exact: true }).fill('0');
  for (const index of [1, 2, 3]) await editor.getByLabel(`启用第 ${index} 条任务`).uncheck();
  await editor.getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(editor).toBeHidden();
  const card = page.locator('.plan-card').filter({ has: page.getByRole('heading', { name: '预算校验', exact: true }) });
  await card.getByRole('button', { name: '开始执行', exact: true }).click();
  await expect(page.locator('.toast.error')).toContainText('至少需要启用一条任务');
});
