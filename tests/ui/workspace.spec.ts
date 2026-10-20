import { expect, test, type Page } from '@playwright/test';

const wb = (page: Page) => page.getByRole('region', { name: '任务表工作台', exact: true });
const dock = (page: Page) => page.getByRole('contentinfo', { name: '执行状态栏', exact: true });
async function openWorkspace(page: Page) {
  await page.goto('/');
  await expect(wb(page)).toBeVisible();
  await expect(page.locator('.environment-badge')).toHaveText('模拟工作空间');
}
async function navigate(page: Page, name: string) {
  await page.locator('.sidebar').getByRole('button', { name, exact: name !== 'Agent 助手' }).click();
}
async function createPlan(page: Page, name: string) {
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
  await page.reload();
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
  await navigate(page, '日常');
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
  await page.reload();
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
  for (const name of ['专项任务', '作业中心', '工具箱', 'Agent 助手', '执行记录', '设备', '设置', '日常']) {
    await page.getByRole('button', { name: '打开导航', exact: true }).click();
    await navigate(page, name);
    await expect(page.getByRole('navigation', { name: '主导航' })).not.toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await page.getByRole('button', { name: '添加任务表', exact: true }).click();
  await expect(wb(page).getByRole('heading', { name: '新建任务表', exact: true })).toBeVisible();
  await expect(wb(page).getByRole('tab', { name: '任务表设置', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('task tables preserve duplicate tasks, order, switches and advanced parameters', async ({ page }) => {
  await openWorkspace(page);
  await createPlan(page, '多步骤配置');
  await expect(wb(page).getByLabel('添加任务类型').locator('option')).toHaveCount(19);
  await wb(page).getByRole('button', { name: '添加任务', exact: true }).click();
  await wb(page).locator('.advanced-params summary').click();
  await wb(page).getByLabel('任务参数 JSON').fill(JSON.stringify({ stage: '2-4', times: 2, medicine: 0, stone: 0, drops: { '30012': 3 }, custom_future: { preserve: true } }));
  await wb(page).getByLabel('作战次数').fill('5');
  await wb(page).getByRole('button', { name: '上移任务', exact: true }).click();
  await wb(page).getByLabel('启用第 2 条任务').uncheck();
  await savePlan(page);
  await page.reload();
  await expect(wb(page).getByLabel('启用第 2 条任务')).not.toBeChecked();
  await wb(page).getByRole('button', { name: '设置第 3 条自动作战', exact: true }).click();
  await expect(wb(page).getByLabel('作战关卡')).toHaveValue('2-4');
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('5');
  await wb(page).locator('.advanced-params summary').click();
  const parameters = JSON.parse(await wb(page).getByLabel('任务参数 JSON').inputValue());
  expect(parameters.drops).toEqual({ '30012': 3 });
  expect(parameters.custom_future).toEqual({ preserve: true });
  await wb(page).getByRole('button', { name: '设置第 2 条自动作战', exact: true }).click();
  await expect(wb(page).getByLabel('作战关卡')).toHaveValue('1-7');
});

test('advanced JSON preserves invalid drafts and updates list fields and switches', async ({ page }) => {
  await openWorkspace(page);
  await wb(page).getByRole('button', { name: '设置第 2 条公开招募' }).click();
  await wb(page).locator('.advanced-params summary').click();
  await wb(page).getByLabel('任务参数 JSON').fill('{"confirm":[5],"times":0}');
  await expect(wb(page).getByLabel('自动确认星级')).toHaveValue('5');
  await wb(page).getByLabel('任务参数 JSON').fill('{"confirm":');
  await expect(wb(page).getByLabel('招募次数')).toBeDisabled();
  await wb(page).getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(wb(page).getByRole('alert').first()).toContainText('有效 JSON');
  await expect(wb(page).getByLabel('任务参数 JSON')).toHaveValue('{"confirm":');
  await wb(page).getByLabel('任务参数 JSON').fill('{"enable":false,"confirm":[4,5],"times":0}');
  await expect(wb(page).getByLabel('启用第 2 条任务')).not.toBeChecked();
  await wb(page).getByLabel('启用第 2 条任务').check();
  expect(JSON.parse(await wb(page).getByLabel('任务参数 JSON').inputValue()).enable).toBe(true);
  await expect(wb(page).getByLabel('自动确认星级')).toHaveValue('4, 5');
  await savePlan(page);
});

test('automatic connection is safe in mock mode and its preference persists', async ({ page }) => {
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

test('task budgets and all-disabled execution are checked after saving', async ({ page }) => {
  await openWorkspace(page);
  await createPlan(page, '预算校验');
  await wb(page).getByLabel('理智药上限', { exact: true }).fill('1');
  await wb(page).getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(page.locator('.toast.error')).toContainText('已授权额度');
  await wb(page).getByLabel('理智药上限', { exact: true }).fill('0');
  for (const index of [1, 2, 3]) await wb(page).getByLabel(`启用第 ${index} 条任务`).uncheck();
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
  await page.reload();
  await expect(wb(page).locator('.editor-steps > li')).toHaveCount(22);
  await wb(page).getByRole('button', { name: '设置第 13 条自动作业', exact: true }).click();
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
  await navigate(page, '日常');
  await expect(wb(page).getByLabel('任务参数 JSON')).toHaveValue('{"stage":');
  await expect(wb(page).locator('.wb-save-state')).toHaveText('未保存');
  await page.reload();
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
  await page.reload();
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
  await navigate(page, '日常');
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
  await expect(channel(page, 'MAAVerge 应用')).toBeVisible();
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
  await page.reload();
  await expect(wb(page).getByLabel('作战次数')).toHaveValue('9');
});

test('device connect and disconnect stay deterministic in mock mode', async ({ page }) => {
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
  await expect(wb(page).getByLabel('自动确认星级', { exact: true })).toHaveValue('');
  await expect(wb(page).getByLabel('自动刷新标签', { exact: true })).not.toBeChecked();
  await wb(page).locator('.wb-field-section').filter({ has: page.locator('summary', { hasText: '加急设置' }) }).locator('summary').click();
  await expect(wb(page).getByLabel('使用加急许可', { exact: true })).not.toBeChecked();
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
  await expect(wb(page).getByText('第 5 条任务 · 独立设置', { exact: true })).toBeVisible();
});

test('moving an existing table to specialized tasks follows it and restores the group after reload', async ({ page }) => {
  await openWorkspace(page);
  await tab(page, '任务表设置');
  await wb(page).getByLabel('任务分组', { exact: true }).selectOption('specialized');
  await wb(page).getByRole('button', { name: '保存任务表', exact: true }).click();
  await expect(page.locator('.primary-nav .nav-item[aria-current="page"]')).toHaveText('专项任务');
  await expect(wb(page).getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.primary-nav .nav-item[aria-current="page"]')).toHaveText('专项任务');
  await expect(wb(page).getByRole('heading', { name: '每日长草计划', exact: true })).toBeVisible();
  await tab(page, '任务表设置');
  await expect(wb(page).getByLabel('任务分组', { exact: true })).toHaveValue('specialized');
});
