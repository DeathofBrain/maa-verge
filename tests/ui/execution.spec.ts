import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Run, RunTask, Snapshot } from '../../packages/contracts/src/types';

const execution = (page: import('@playwright/test').Page) => page.getByRole('region', { name: '任务表执行页面', exact: true });

async function openLatestExecution(page: import('@playwright/test').Page) {
  await page.locator('.sidebar').getByRole('button', { name: '任务表执行', exact: true }).click();
  const run = await page.evaluate(async () => ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot).runs[0]);
  await page.getByRole('region', { name: '任务表执行监控', exact: true }).getByRole('button', { name: `查看执行${run.id}`, exact: true }).click();
}

test('starting a table opens its execution page and preserves the editing draft', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '任务表', exact: true }).click();
  await page.getByRole('button', { name: '配置任务表固源岩补给', exact: true }).click();
  const workbench = page.getByRole('region', { name: '任务表工作台', exact: true });
  await workbench.getByLabel('作战次数', { exact: true }).fill('9');
  await workbench.getByRole('button', { name: '开始日常', exact: true }).click();
  await expect(execution(page)).toBeVisible();
  await expect(execution(page).getByRole('heading', { name: '固源岩补给', exact: true })).toBeVisible();
  await expect(execution(page).getByRole('complementary', { name: '本次执行任务', exact: true })).toContainText('自动作战');
  await expect(execution(page).getByRole('checkbox', { name: '允许点击操作' })).toHaveCount(0);
  await expect(execution(page).getByRole('region', { name: '设备画面预览', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.length)).toBe(0);
  await expect(execution(page).locator('.exec-tasks button')).toHaveCount(0);
  await expect(execution(page).getByRole('region', { name: '本次执行总览', exact: true })).toBeVisible();
  await expect(execution(page).getByRole('region', { name: '设备画面预览', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.length)).toBe(0);
  await expect(execution(page).getByRole('button', { name: '实时画面', exact: true })).toHaveCount(0);
  await page.getByRole('contentinfo', { name: '执行状态栏', exact: true }).getByRole('button', { name: '画面', exact: true }).click();
  await expect(page.getByRole('region', { name: '设备画面预览', exact: true }).getByRole('img', { name: /实时画面$/ })).toBeVisible();
  await page.getByRole('button', { name: '收起运行详情', exact: true }).click();
  await expect(execution(page)).not.toContainText(/StartUp|Fight|Infrast/);
  await execution(page).getByRole('button', { name: '停止执行', exact: true }).click();
  await expect(execution(page).getByRole('region', { name: '本次执行总览', exact: true })).toContainText('已停止');
  await execution(page).getByRole('button', { name: '返回任务设置', exact: true }).click();
  await expect(workbench.getByLabel('作战次数', { exact: true })).toHaveValue('9');
  await expect(workbench.locator('.wb-save-state')).toHaveText('已保存');
});

test('save-and-start respects navigation made while the save was pending', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '任务表', exact: true }).click();
  await page.getByRole('button', { name: '配置任务表固源岩补给', exact: true }).click();
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness;
    const call = api.call;
    let release!: () => void;
    const saved = new Promise<void>((resolve) => { release = resolve; });
    Object.assign(api, { releaseSave: release });
    api.call = async (method, params) => { if (method === 'plan.save') await saved; return call(method, params); };
  });
  const workbench = page.getByRole('region', { name: '任务表工作台', exact: true });
  await workbench.getByLabel('作战次数', { exact: true }).fill('9');
  await workbench.getByRole('button', { name: '开始日常', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await page.evaluate(() => ((window as HarnessWindow).runtimeHarness as unknown as { releaseSave: () => void }).releaseSave());
  await expect(page.locator('.toast')).toContainText('任务表已开始执行');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await expect(execution(page)).toHaveCount(0);
});

test('slow run details remain serial and are not discarded by progress snapshots', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const call = api.call;
    let active = 0;
    Object.assign(api, { maxDetails: 0 });
    api.call = async (method, params) => {
      if (method !== 'run.detail') return call(method, params);
      active++;
      Object.assign(api, { maxDetails: Math.max((api as unknown as { maxDetails: number }).maxDetails, active) });
      try { await new Promise((resolve) => setTimeout(resolve, 1400)); return await call(method, params); }
      finally { active--; }
    };
    await api.call('run.start', { planId: 'daily', deviceId: 'mock-device-1', requestId: 'slow-detail' });
  });
  await openLatestExecution(page);
  await expect(execution(page).locator('.exec-tasks > li').first()).toBeVisible({ timeout: 5000 });
  expect(await page.evaluate(() => ((window as HarnessWindow).runtimeHarness as unknown as { maxDetails: number }).maxDetails)).toBe(1);
});

test('execution overview shows every result, facility staff and optional reference images', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const call = api.call;
    Object.assign(api, { artifactReads: 0 });
    api.call = async (method, params) => {
      if (method === 'run.artifact') Object.assign(api, { artifactReads: (api as unknown as { artifactReads: number }).artifactReads + 1 });
      return call(method, params);
    };
    const state = await api.call('app.snapshot', {}) as Snapshot;
    const plan = { ...state.plans[0], id: 'execution-evidence', name: '作战与基建', budgets: null, tasks: [
      { type: 'StartUp', params: {}, enabled: true },
      { type: 'Fight', params: { stage: '1-7', times: 1, medicine: 0, stone: 0 }, enabled: true },
      { type: 'Fight', params: { stage: '1-7', times: 1, medicine: 0, stone: 0 }, enabled: true },
      { type: 'Infrast', params: {}, enabled: true },
    ] };
    await api.call('plan.save', { plan });
    await api.call('run.start', { planId: plan.id, deviceId: state.devices[0].id, requestId: 'execution-evidence' });
    // Editing the stored table must not rewrite the in-flight result list.
    await api.call('plan.save', { plan: { ...plan, name: '下次执行的新配置', tasks: [{ type: 'Award', params: {}, enabled: true }] } });
  });
  await openLatestExecution(page);
  await expect(execution(page).getByRole('heading', { name: '作战与基建', exact: true })).toBeVisible();
  await expect(execution(page).locator('.exec-tasks > li')).toHaveCount(4);
  await expect(execution(page).locator('.exec-eyebrow')).toContainText('已完成', { timeout: 18_000 });
  await expect(execution(page).locator('.exec-task.completed')).toHaveCount(4);
  await execution(page).hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => execution(page).evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await execution(page).evaluate((element) => element.scrollTo(0, 0));
  const drops = execution(page).getByRole('region', { name: '本次获得材料', exact: true });
  await expect(drops).toContainText('固源岩');
  await expect(drops).toContainText('× 4');
  const outcomes = execution(page).getByRole('region', { name: '全部任务结果', exact: true });
  await expect(outcomes.locator('.exec-outcomes > li')).toHaveCount(4);
  await expect(outcomes.locator('.exec-outcomes > li').nth(1)).toContainText('× 2');
  await expect(outcomes.locator('.exec-outcomes > li').nth(2)).toContainText('× 2');
  const infrastructure = execution(page).getByRole('region', { name: '基建换班反馈', exact: true });
  await expect(infrastructure).toContainText('制造站');
  await expect(infrastructure).toContainText('核心已确认换班');
  for (const rarity of [3, 4, 5, 6]) {
    const badge = infrastructure.locator(`.operator-badge.rarity-${rarity}`);
    await expect(badge).toContainText(`${rarity} 星`);
    await expect(badge.getByRole('img')).toBeVisible();
    expect(await badge.locator('.operator-avatar').evaluate((element) => getComputedStyle(element).borderBottomColor)).not.toBe('rgba(0, 0, 0, 0)');
  }
  await expect(infrastructure.locator('.operator-badge.rarity-unknown')).toContainText('合成未知干员');
  await expect(infrastructure.locator('.operator-badge.rarity-unknown').getByRole('img')).toHaveCount(0);
  const reference = execution(page).getByRole('region', { name: '参考截图', exact: true });
  await expect(reference.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => ((window as HarnessWindow).runtimeHarness as unknown as { artifactReads: number }).artifactReads)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('execution-desktop.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: testInfo.outputPath('execution-desktop-dark.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await execution(page).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('execution-mobile.png'), fullPage: true });
  await execution(page).getByRole('region', { name: '本次获得材料', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('execution-mobile-results.png'), fullPage: true });
  await reference.getByRole('button').click();
  await reference.getByLabel('选择结果截图', { exact: true }).selectOption(await reference.getByRole('option').filter({ hasText: '2. 自动作战' }).getAttribute('value') as string);
  await expect(reference.getByRole('img', { name: '自动作战反馈画面', exact: true })).toBeVisible();
  await expect(outcomes.locator('.exec-outcomes > li')).toHaveCount(4);
  await page.reload();
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await openLatestExecution(page);
  await expect(execution(page).locator('.exec-task.completed')).toHaveCount(4);
  await expect(reference.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  await reference.getByRole('button').click();
  await expect(execution(page).getByRole('img', { name: '基建反馈画面', exact: true })).toBeVisible();
});

test('overview preserves failure reasons and separates confirmed staff from a pending plan', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const snapshot = await api.call('app.snapshot', {}) as Snapshot;
    const started = await api.call('run.start', { planId: 'daily', deviceId: snapshot.devices[0].id, requestId: 'failure-overview' }) as Run;
    await api.call('run.stop', { id: started.id });
    const at = new Date().toISOString();
    const task = (index: number, type: string, status: RunTask['status'], message: string): RunTask => ({ index, type, status, message, startedAt: status === 'skipped' ? null : at, finishedAt: at, drops: [], artifacts: [], infrastructure: [] });
    const run: Run = { ...started, status: 'failed', progress: 75, finishedAt: at, message: '基建换班失败，请检查可用干员', tasks: [
      task(0, 'StartUp', 'completed', '启动已完成'), task(1, 'Infrast', 'failed', '可用干员不足，换班未完成'), task(2, 'Award', 'skipped', '前序任务失败，未执行'), task(3, 'CloseDown', 'stopped', '本次执行已停止'),
    ] };
    run.tasks![1].infrastructure = [
      { facility: '制造站', room: 1, operators: ['合成五星干员'], staffingStatus: 'planned', product: '赤金', message: '排班方案指定干员（尚未确认换班）', at },
      { facility: '贸易站', room: 1, operators: [], staffingStatus: 'confirmed', product: '龙门币', message: '核心已确认换班', at },
      { facility: '宿舍', room: 1, operators: ['合成未知干员'], product: '', message: '历史换班记录', at },
    ];
    const call = api.call;
    api.call = async (method, params) => {
      if (method === 'run.detail' && params.id === run.id) return run;
      if (method === 'app.snapshot') {
        const next = await call(method, params) as Snapshot;
        return { ...next, runs: next.runs.map((item) => item.id === run.id ? { ...run, tasks: undefined } : item) };
      }
      if (method === 'resources.operator' && params.name === '合成未知干员') throw new Error('合成资源读取失败');
      return call(method, params);
    };
    api.emitEvent('run.failed');
  });
  await openLatestExecution(page);
  const outcomes = execution(page).getByRole('region', { name: '全部任务结果', exact: true });
  await expect(outcomes).toContainText('可用干员不足，换班未完成');
  await expect(outcomes).toContainText('前序任务失败，未执行');
  const progress = execution(page).getByRole('complementary', { name: '本次执行任务', exact: true });
  await expect(progress.locator('.exec-task.completed')).toHaveCount(1);
  await expect(progress.locator('.exec-task.failed')).toHaveCount(1);
  await expect(progress.locator('.exec-task.skipped')).toHaveCount(1);
  await expect(progress.locator('.exec-task.stopped')).toHaveCount(1);
  const infrastructure = execution(page).getByRole('region', { name: '基建换班反馈', exact: true });
  const planned = infrastructure.getByRole('article').filter({ hasText: '制造站' });
  await expect(planned).toContainText('方案待确认');
  await expect(planned).not.toContainText('核心已确认换班');
  await expect(infrastructure.getByRole('article').filter({ hasText: '贸易站' })).toContainText('本次反馈未提供干员名单');
  const legacy = infrastructure.getByRole('article').filter({ hasText: '宿舍' });
  await expect(legacy).toContainText('确认状态未记录');
  await expect(legacy.locator('.operator-badge')).toContainText('合成未知干员');
  await expect(legacy.getByRole('img')).toHaveCount(0);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const colors = await progress.evaluate((element) => {
      const success = getComputedStyle(element.querySelector('.completed')!), failed = getComputedStyle(element.querySelector('.failed')!);
      return { success: success.backgroundColor, failed: failed.backgroundColor, successBorder: success.borderLeftColor, failedBorder: failed.borderLeftColor, surface: getComputedStyle(element).backgroundColor };
    });
    expect(colors.success).not.toBe(colors.failed);
    expect(colors.success).not.toBe(colors.surface);
    expect(colors.failed).not.toBe(colors.surface);
    expect(colors.successBorder).not.toBe(colors.failedBorder);
    await page.screenshot({ path: testInfo.outputPath(`execution-failed-${theme}.png`), fullPage: true });
  }
});
