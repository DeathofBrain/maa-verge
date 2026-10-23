import type { Page } from '@playwright/test';
import type { Run, Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

type MonitorState = {
  runs: Run[];
  calls: { method: string; params: Record<string, unknown> }[];
  releaseDetails: Record<string, () => void>;
  holdStart?: boolean;
  releaseStart?: () => void;
};
type MonitorWindow = HarnessWindow & { monitorState: MonitorState };

const monitor = (page: Page) => page.getByRole('region', { name: '任务表执行监控', exact: true });
const detail = (page: Page) => page.getByRole('region', { name: '任务表执行页面', exact: true });
const switcher = (page: Page) => page.getByRole('navigation', { name: '正在监控的执行', exact: true });
const card = (page: Page, id: string) => monitor(page).getByRole('article').filter({ has: page.getByRole('button', { name: `查看执行${id}`, exact: true }) });

async function openMonitor(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '任务表执行', exact: true }).click();
  await expect(monitor(page)).toBeVisible();
}

// Keep runs outside the fixture's automatic completion timer. This bridge still
// exercises the real typed transport and snapshot refreshes, without real devices.
async function seedMonitor(page: Page, heldDetails: string[] = []) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(async (heldDetails) => {
    const target = window as unknown as MonitorWindow;
    const api = target.runtimeHarness;
    const call = api.call;
    const base = await call('app.snapshot', {}) as Snapshot;
    const names = ['一号模拟器', '二号模拟器', '三号模拟器', '四号模拟器'];
    const devices = names.map((name, index) => ({ ...base.devices[0], id: `monitor-device-${index + 1}`, name, address: `127.0.0.1:${5555 + index * 2}`, state: index < 3 ? 'running' as const : 'idle' as const }));
    const plans = [
      { ...base.plans[0], id: 'monitor-daily', name: '共同日常', deviceId: null, tasks: [{ enabled: true, type: 'Fight' as const, params: { stage: '1-7', times: 6, medicine: 0, stone: 0 } }] },
      { ...base.plans[0], id: 'monitor-other', name: '剿灭检查', deviceId: null, tasks: [{ enabled: true, type: 'Award' as const, params: {} }] },
    ];
    const startedAt = new Date().toISOString();
    const makeRun = (id: string, planIndex: number, deviceIndex: number, status: Run['status'] = 'running', planName = plans[planIndex].name): Run => ({
      id, planId: plans[planIndex].id, planName, deviceId: devices[deviceIndex].id, status,
      progress: status === 'completed' ? 100 : 36, message: `${names[deviceIndex]} · ${status === 'running' ? '执行中' : status === 'failed' ? '识别失败，请检查设备' : '执行已完成'}`,
      startedAt, finishedAt: status === 'running' ? null : startedAt,
      tasks: [{ index: 0, type: plans[planIndex].tasks[0].type, status, message: `${names[deviceIndex]}的独立任务结果`, startedAt, finishedAt: status === 'running' ? null : startedAt, drops: [], artifacts: [], infrastructure: [] }],
    });
    const state: MonitorState = {
      runs: [makeRun('monitor-a', 0, 0), makeRun('monitor-b', 0, 1), makeRun('monitor-c', 1, 2), makeRun('monitor-failed', 1, 0, 'failed', '历史识别'), makeRun('monitor-completed', 0, 1, 'completed', '已完成领奖')],
      calls: [], releaseDetails: {},
    };
    target.monitorState = state;
    api.call = async (method, params) => {
      state.calls.push({ method, params: structuredClone(params) });
      if (method === 'app.snapshot') return { ...base, devices: structuredClone(devices), plans: structuredClone(plans), runs: state.runs.map(({ tasks: _tasks, ...summary }) => structuredClone(summary)) };
      if (method === 'run.detail') {
        const run = state.runs.find((item) => item.id === params.id);
        if (!run) throw new Error('合成执行不存在');
        const result = structuredClone(run);
        if (heldDetails.includes(run.id)) await new Promise<void>((resolve) => { state.releaseDetails[run.id] = resolve; });
        return result;
      }
      if (method === 'run.stop') {
        const run = state.runs.find((item) => item.id === params.id)!;
        run.status = 'stopped'; run.message = '此实例已停止'; run.finishedAt = startedAt;
        run.tasks = run.tasks?.map((task) => ({ ...task, status: 'stopped', finishedAt: startedAt }));
        devices.find((device) => device.id === run.deviceId)!.state = 'idle';
        api.emitEvent('run.stopped', { runId: run.id });
        return structuredClone(run);
      }
      if (method === 'run.start') {
        const run = makeRun('monitor-new', plans.findIndex((plan) => plan.id === params.planId), devices.findIndex((device) => device.id === params.deviceId));
        state.runs.unshift(run); devices.find((device) => device.id === run.deviceId)!.state = 'running';
        api.emitEvent('run.started', { runId: run.id });
        if (state.holdStart) await new Promise<void>((resolve) => { state.releaseStart = resolve; });
        return structuredClone(run);
      }
      return call(method, params);
    };
    api.emitEvent('run.started');
  }, heldDetails);
  await expect(page.getByLabel('选择设备', { exact: true }).getByRole('option', { name: /四号模拟器/ })).toHaveCount(1);
}

test('monitor shows each concurrent execution and stops only its own run without reading details or images', async ({ page }) => {
  await seedMonitor(page);
  await openMonitor(page);
  await expect(monitor(page).getByRole('article')).toHaveCount(5);
  for (const name of ['执行 共同日常 · 一号模拟器', '执行 共同日常 · 二号模拟器', '执行 剿灭检查 · 三号模拟器']) {
    await expect(monitor(page).getByRole('article', { name, exact: true })).toBeVisible();
  }
  await expect(detail(page)).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as MonitorWindow).runtimeHarness.emitEvent('run.progress'); });
  await expect.poll(() => page.evaluate(() => (window as unknown as MonitorWindow).monitorState.calls.filter((item) => item.method === 'app.snapshot').length)).toBeGreaterThan(1);
  expect(await page.evaluate(() => (window as unknown as MonitorWindow).monitorState.calls.filter((item) => ['run.detail', 'run.artifact', 'device.frame'].includes(item.method)))).toEqual([]);
  await card(page, 'monitor-a').getByRole('button', { name: '停止执行monitor-a', exact: true }).click();
  await expect(card(page, 'monitor-a')).toContainText('已停止');
  await expect(card(page, 'monitor-b').getByRole('button', { name: '停止执行monitor-b', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as MonitorWindow).monitorState.runs.filter((run) => run.status === 'running').map((run) => run.id))).toEqual(['monitor-b', 'monitor-c']);
  expect(await page.evaluate(() => (window as unknown as MonitorWindow).monitorState.calls.filter((item) => item.method === 'run.stop').map((item) => item.params.id))).toEqual(['monitor-a']);
});

test('monitor filters and searches all runs and fits desktop, dark and narrow layouts', async ({ page }, testInfo) => {
  await seedMonitor(page);
  await openMonitor(page);
  const filters = monitor(page).getByRole('group', { name: '筛选监控执行', exact: true });
  await filters.getByRole('button', { name: '执行中', exact: true }).click();
  await expect(monitor(page).getByRole('article')).toHaveCount(3);
  await filters.getByRole('button', { name: '执行失败', exact: true }).click();
  await expect(monitor(page).getByRole('article')).toHaveCount(1);
  await expect(monitor(page).getByRole('article')).toContainText('历史识别');
  await filters.getByRole('button', { name: '已结束', exact: true }).click();
  await expect(monitor(page).getByRole('article')).toHaveCount(2);
  await filters.getByRole('button', { name: '全部', exact: true }).click();
  const search = monitor(page).getByRole('textbox', { name: '搜索监控执行', exact: true });
  await search.fill('二号模拟器');
  await expect(monitor(page).getByRole('article')).toHaveCount(2);
  await search.fill('剿灭检查');
  await expect(monitor(page).getByRole('article')).toHaveCount(1);
  await search.fill('没有匹配的任务表');
  await expect(monitor(page).getByRole('article')).toHaveCount(0);
  await search.fill('');
  await page.setViewportSize({ width: 1440, height: 960 });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.screenshot({ path: testInfo.outputPath(`execution-monitor-${theme}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await monitor(page).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('execution-monitor-mobile.png'), fullPage: true });
});

test('inspected execution survives device changes, drawers, background starts and completion', async ({ page }) => {
  await seedMonitor(page);
  await openMonitor(page);
  await card(page, 'monitor-a').getByRole('button', { name: '查看执行monitor-a', exact: true }).click();
  await expect(detail(page)).toContainText('一号模拟器的独立任务结果');
  await expect(switcher(page).getByRole('button', { name: /^切换执行/ })).toHaveCount(3);
  await page.getByLabel('选择设备', { exact: true }).selectOption('monitor-device-2');
  await expect(detail(page)).toContainText('一号模拟器的独立任务结果');
  const dock = page.getByRole('contentinfo', { name: '执行状态栏', exact: true });
  await dock.getByRole('button', { name: '日志', exact: true }).click();
  await expect(detail(page)).toContainText('一号模拟器的独立任务结果');
  await page.getByRole('button', { name: '收起运行详情', exact: true }).click();
  await dock.getByRole('button', { name: '多开执行', exact: true }).click();
  const instances = page.getByRole('region', { name: '多开执行面板', exact: true });
  await instances.getByRole('button', { name: '启动实例 四号模拟器', exact: true }).click();
  await expect(instances.getByRole('button', { name: '停止实例 四号模拟器', exact: true })).toBeEnabled();
  await expect(page.getByLabel('选择设备', { exact: true })).toHaveValue('monitor-device-2');
  await page.getByRole('button', { name: '收起运行详情', exact: true }).click();
  await expect(detail(page)).toContainText('一号模拟器的独立任务结果');
  await page.evaluate(() => {
    const target = window as unknown as MonitorWindow;
    const run = target.monitorState.runs.find((item) => item.id === 'monitor-a')!;
    run.status = 'completed'; run.progress = 100; run.finishedAt = new Date().toISOString();
    run.tasks = run.tasks?.map((task) => ({ ...task, status: 'completed', finishedAt: run.finishedAt }));
    target.runtimeHarness.emitEvent('run.completed', { runId: run.id });
  });
  await expect(detail(page).getByRole('region', { name: '本次执行总览', exact: true })).toContainText('已完成');
  await expect(detail(page).getByRole('heading', { name: '共同日常', exact: true })).toBeVisible();
  await expect(switcher(page).getByRole('button', { name: '切换执行monitor-b', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回监控总览', exact: true }).click();
  await expect(card(page, 'monitor-a')).toContainText('已完成');
  await expect(card(page, 'monitor-b')).toContainText('执行中');
});

test('late run details cannot overwrite a different inspected execution', async ({ page }) => {
  await seedMonitor(page, ['monitor-a']);
  await openMonitor(page);
  await card(page, 'monitor-a').getByRole('button', { name: '查看执行monitor-a', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!(window as unknown as MonitorWindow).monitorState.releaseDetails['monitor-a'])).toBe(true);
  await switcher(page).getByRole('button', { name: '切换执行monitor-b', exact: true }).click();
  await expect(detail(page)).toContainText('二号模拟器的独立任务结果');
  await page.evaluate(() => { (window as unknown as MonitorWindow).monitorState.releaseDetails['monitor-a'](); });
  await expect(detail(page)).toContainText('二号模拟器的独立任务结果');
  await expect(detail(page)).not.toContainText('一号模拟器的独立任务结果');
  await page.getByRole('button', { name: '返回监控总览', exact: true }).click();
  await expect(monitor(page)).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
});

test('a delayed background start does not replace execution selected while it was pending', async ({ page }) => {
  await seedMonitor(page);
  await openMonitor(page);
  await card(page, 'monitor-a').getByRole('button', { name: '查看执行monitor-a', exact: true }).click();
  await page.evaluate(() => { (window as unknown as MonitorWindow).monitorState.holdStart = true; });
  await page.getByRole('contentinfo', { name: '执行状态栏', exact: true }).getByRole('button', { name: '多开执行', exact: true }).click();
  await page.getByRole('region', { name: '多开执行面板', exact: true }).getByRole('button', { name: '启动实例 四号模拟器', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!(window as unknown as MonitorWindow).monitorState.releaseStart)).toBe(true);
  await page.getByRole('button', { name: '收起运行详情', exact: true }).click();
  await switcher(page).getByRole('button', { name: '切换执行monitor-b', exact: true }).click();
  await expect(detail(page)).toContainText('二号模拟器的独立任务结果');
  const selectedDevice = await page.getByLabel('选择设备', { exact: true }).inputValue();
  await page.evaluate(() => { (window as unknown as MonitorWindow).monitorState.releaseStart!(); });
  await expect(page.locator('.toast')).toContainText('任务表已开始执行');
  await expect(detail(page)).toContainText('二号模拟器的独立任务结果');
  await expect(page.getByLabel('选择设备', { exact: true })).toHaveValue(selectedDevice);
});

test('empty monitor keeps instance startup available and navigation opens the overview', async ({ page }) => {
  await page.goto('/');
  await openMonitor(page);
  await expect(monitor(page).getByRole('article')).toHaveCount(0);
  await expect(detail(page)).toHaveCount(0);
  await page.getByRole('tab', { name: '实例启动', exact: true }).click();
  await expect(page.getByRole('region', { name: '多开执行面板', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '监控总览', exact: true }).click();
  await expect(monitor(page)).toBeVisible();
});
