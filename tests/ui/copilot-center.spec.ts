import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const json = (title: string, extra: Record<string, unknown> = {}) => JSON.stringify({ stage_name: 'main_01-07', minimum_required: 'v6.0.0', doc: { title, details: '合成作业，仅验证界面流程', author: '测试作者' }, opers: [{ name: '阿米娅', skill: 1, requirements: { elite: 2, level: 80 } }], actions: [{ type: 'SpeedUp' }], ...extra });
const queue = (page: Page) => page.getByRole('region', { name: '作业执行队列', exact: true });
const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const preview = (page: Page) => page.getByRole('region', { name: '导入预览', exact: true });
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: '打开导航', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
}
async function openCenter(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await navigate(page, '作业中心');
  await expect(page.getByRole('heading', { name: '作业中心', exact: true })).toBeVisible();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
}
async function importJson(page: Page, content: string, add = true, waitForClose = true) {
  const panel = page.locator('details.cp-import');
  if (!await panel.getAttribute('open').then(value => value !== null)) await page.getByRole('button', { name: '导入作业', exact: true }).click();
  const input = page.getByLabel('作业 JSON', { exact: true });
  if (!await input.isVisible()) await page.getByText('粘贴 JSON', { exact: true }).click();
  await input.fill(content);
  await page.getByRole('button', { name: '预览 JSON', exact: true }).click();
  await expect(preview(page)).toBeVisible();
  await preview(page).getByRole('button', { name: add ? '所选导入并加入队列' : '导入到作业库', exact: true }).click();
  if (waitForClose) await expect(preview(page)).toHaveCount(0);
}
async function call<T>(page: Page, method: string, params: Record<string, unknown> = {}): Promise<T> {
  return page.evaluate(async ({ method, params }) => (window as unknown as HarnessWindow).runtimeHarness.call(method, params), { method, params }) as Promise<T>;
}

test('local preview, duplicate queue entries and ordered edits persist without creating task tables', async ({ page }) => {
  await openCenter(page);
  const before = await call<{ plans: unknown[] }>(page, 'app.snapshot');
  await importJson(page, json('合成 1-7 作业'));
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
  await queue(page).locator('.cp-settings > summary').click();
  await queue(page).getByLabel('作业循环次数', { exact: true }).fill('3');
  await library(page).getByRole('button', { name: '加入队列 合成 1-7 作业', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(2);
  await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toHaveValue('1');
  await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toBeDisabled();
  await queue(page).getByLabel('导航关卡 2', { exact: true }).fill('1-7');
  await queue(page).getByRole('button', { name: '上移作业 2', exact: true }).click();
  await expect(queue(page).getByLabel('导航关卡 1', { exact: true })).toHaveValue('1-7');
  await queue(page).getByLabel('执行队列 2', { exact: true }).uncheck();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  const saved = await call<{ queue: { id: string; versionId: string; enabled: boolean; navName: string }[]; options: { loopTimes: number } }>(page, 'copilot.workspace.get', { kind: 'Copilot' });
  expect(saved.queue).toHaveLength(2);
  expect(saved.queue[0].id).not.toBe(saved.queue[1].id);
  expect(saved.queue[0].versionId).toBe(saved.queue[1].versionId);
  expect(saved.queue[0].navName).toBe('1-7');
  expect(saved.queue[1].enabled).toBe(false);
  expect((await call<{ plans: unknown[] }>(page, 'app.snapshot')).plans).toEqual(before.plans);
  await page.reload(); await navigate(page, '作业中心');
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(2);
  await expect(queue(page).getByLabel('执行队列 2', { exact: true })).not.toBeChecked();
  await queue(page).getByRole('button', { name: '清除未勾选项', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
  await expect(queue(page).getByLabel('导航关卡 1', { exact: true })).toBeVisible();
});

test('independent execution stays in the center, fixes its queue snapshot and supports source navigation and stop', async ({ page }) => {
  await openCenter(page); await importJson(page, json('独立作业快照'));
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  await expect(page.getByRole('heading', { name: '作业中心', exact: true })).toBeVisible();
  const run = page.getByRole('region', { name: '作业运行状态', exact: true });
  await expect(run).toContainText('通关未确认');
  await expect(run.getByRole('button', { name: '停止作业', exact: true })).toBeVisible();
  await queue(page).getByRole('button', { name: '移除作业 1', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(0);
  await expect(run.locator('.cp-run-entries')).toContainText('独立作业快照');
  const snapshot = await call<{ plans: unknown[]; runs: { id: string; source: string; planId: null; copilotEntries: unknown[] }[] }>(page, 'app.snapshot');
  const active = snapshot.runs[0]; expect(active.source).toBe('copilot'); expect(active.planId).toBeNull(); expect(snapshot.plans).toHaveLength(2);
  await navigate(page, '主页');
  const current = page.getByRole('region', { name: '当前执行', exact: true });
  await expect(current).toContainText('独立作业快照');
  await current.getByRole('button', { name: '查看运行详情', exact: true }).click();
  await expect(page.getByRole('heading', { name: '作业中心', exact: true })).toBeVisible();
  await expect(run).toContainText('独立作业快照');
  await navigate(page, '任务表执行');
  const monitor = page.getByRole('region', { name: '任务表执行监控', exact: true });
  await expect(monitor).not.toHaveClass(/inspecting/u); await expect(monitor.getByRole('article')).toHaveCount(0);
  await expect(page.getByLabel('执行状态栏', { exact: true })).toHaveClass(/is-running/u);
  await navigate(page, '作业中心');
  await run.getByRole('button', { name: '停止作业', exact: true }).click();
  await expect(run).toContainText('已停止');
  expect((await call<{ queue: unknown[] }>(page, 'copilot.workspace.get', { kind: 'Copilot' })).queue).toHaveLength(0);
});

test('busy device blocks the center while browsing and local import remain available', async ({ page }) => {
  await openCenter(page);
  await call(page, 'run.start', { planId: 'farm-1-7', deviceId: 'mock-device-1', requestId: 'busy-copilot-ui' });
  await importJson(page, json('忙时导入作业'));
  await expect(library(page)).toContainText('忙时导入作业');
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeDisabled();
  await expect(queue(page)).toContainText('设备正在执行');
  await expect(queue(page).getByRole('button', { name: '查看占用', exact: true })).toBeVisible();
  const snapshot = await call<{ runs: { id: string }[]; plans: unknown[] }>(page, 'app.snapshot');
  expect(snapshot.runs).toHaveLength(1); expect(snapshot.plans).toHaveLength(2);
  await call(page, 'run.stop', { id: snapshot.runs[0].id });
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeEnabled();
});

test('community pagination and set preview retain member order and explicitly show deleted members', async ({ page }) => {
  await openCenter(page);
  await page.getByRole('tab', { name: '社区搜索', exact: true }).click();
  await page.getByLabel('社区搜索关键词', { exact: true }).fill('合成');
  await expect(library(page)).toContainText('合成社区作业 1');
  await library(page).getByRole('button', { name: '下一页', exact: true }).click();
  await expect(library(page)).toContainText('合成社区作业 2');
  await expect(library(page).getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await library(page).getByRole('tab', { name: '社区作业集', exact: true }).click();
  await expect(library(page)).toContainText('合成有序作业集');
  await library(page).getByRole('button', { name: '查看详情 合成有序作业集', exact: true }).click();
  await expect(preview(page).locator('.cp-preview-entry')).toHaveCount(3);
  await expect(preview(page)).toContainText('作业 404 已删除');
  await expect(preview(page).getByLabel('选择导入 3', { exact: true })).toBeDisabled();
  await expect(preview(page).getByLabel('选择导入 1', { exact: true })).toBeChecked();
  await preview(page).getByRole('button', { name: '所选导入并加入队列', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-title strong')).toHaveText(['合成社区作业 101', '合成社区作业 102']);
  expect((await call<{ plans: unknown[] }>(page, 'app.snapshot')).plans).toHaveLength(2);
});

test('three kinds use separate persisted queues and SSS only allows a single work', async ({ page }) => {
  await openCenter(page); await importJson(page, json('普通独立队列'));
  await page.getByRole('tab', { name: '保全派驻', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(0);
  await importJson(page, json('保全独立队列', { type: 'SSS', stages: [{ stage_name: 'main_01-07', draw_as_possible: true, actions: [{ type: 'SpeedUp' }] }] }));
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
  await expect(library(page).getByRole('button', { name: '加入队列 保全独立队列', exact: true })).toBeDisabled();
  await expect(queue(page).getByLabel('自动编队', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '悖论模拟', exact: true }).click();
  await importJson(page, json('悖论独立队列', { type: 'Paradox', stage_name: 'mem_amiya_1' }));
  await queue(page).locator('.cp-settings > summary').click();
  await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: '普通作业', exact: true }).click();
  await expect(queue(page)).toContainText('普通独立队列');
  await expect(queue(page)).not.toContainText('保全独立队列');
});

test('switching workspaces keeps the running panel, expanded logs and stop control', async ({ page }) => {
  await openCenter(page); await importJson(page, json('切换时持续执行的普通作业'));
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  const panel = page.getByRole('region', { name: '作业运行状态', exact: true });
  await panel.locator('.cp-run-logs > summary').click();
  const originalPanel = await panel.elementHandle();
  const initialProgress = await panel.getByLabel('作业执行进度').getAttribute('value');
  for (const name of ['保全派驻', '悖论模拟']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(panel.getByRole('heading', { name: '切换时持续执行的普通作业', exact: true })).toBeVisible();
    await expect(panel.locator('.cp-run-logs')).toHaveAttribute('open', '');
    expect(await originalPanel!.evaluate(element => element.isConnected)).toBe(true);
  }
  await expect(panel.getByLabel('作业执行进度')).not.toHaveAttribute('value', initialProgress!);
  await expect(page.getByRole('tab', { name: '悖论模拟', exact: true })).toHaveAttribute('aria-selected', 'true');
  await panel.getByRole('button', { name: '停止作业', exact: true }).click();
  await expect(panel).toContainText('已停止');
  await expect(page.getByRole('tab', { name: '悖论模拟', exact: true })).toHaveAttribute('aria-selected', 'true');
  await navigate(page, '主页'); await navigate(page, '作业中心');
  await expect(panel.getByRole('heading', { name: '切换时持续执行的普通作业', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '悖论模拟', exact: true })).toHaveAttribute('aria-selected', 'true');
  await navigate(page, '执行记录');
  await page.locator('.history-table tbody tr').filter({ hasText: '切换时持续执行的普通作业' }).getByRole('button').click();
  await expect(page.getByRole('tab', { name: '普通作业', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('cached workspaces render their own queue and library without flashing during delayed reads', async ({ page }) => {
  await openCenter(page); await importJson(page, json('普通切换缓存'));
  await page.getByRole('tab', { name: '保全派驻', exact: true }).click();
  await importJson(page, json('保全切换缓存', { type: 'SSS', stages: [{ stage_name: 'main_01-07', actions: [] }] }));
  await page.getByRole('tab', { name: '悖论模拟', exact: true }).click();
  await importJson(page, json('悖论切换缓存', { type: 'Paradox', stage_name: 'mem_amiya_1' }));
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (['copilot.list', 'copilot.get', 'copilot.workspace.get'].includes(method)) await new Promise(resolve => setTimeout(resolve, 350));
      return original(method, params);
    };
    document.querySelector('.copilot-page')!.scrollTop = 0;
  });
  const positions: number[][] = [];
  for (const [name, title] of [['普通作业', '普通切换缓存'], ['保全派驻', '保全切换缓存'], ['悖论模拟', '悖论切换缓存']]) {
    await page.getByRole('tab', { name, exact: true }).click();
    const frames = await page.evaluate(async () => {
      const frames = [];
      for (let index = 0; index < 12; index++) {
        await new Promise(requestAnimationFrame);
        frames.push({
          queue: document.querySelector('.cp-queue-list')?.textContent ?? '',
          library: document.querySelector('.cp-record-list')?.textContent ?? '',
          loading: !!document.querySelector('.cp-browser > .cp-loading'),
          positions: ['.cp-type-bar', '.cp-source-tabs'].map(selector => document.querySelector(selector)!.getBoundingClientRect().top),
        });
      }
      return frames;
    });
    for (const frame of frames) {
      expect(frame.queue).toContain(title);
      expect(frame.queue).not.toContain('作业版本不可用');
      expect(frame.library).toContain(title);
      expect(frame.loading).toBe(false);
      positions.push(frame.positions);
    }
  }
  expect(positions.every(position => position.every((value, index) => Math.abs(value - positions[0][index]) < 1))).toBe(true);
});

test('a persisted queue distinguishes a pending version read from a confirmed unavailable version', async ({ page }) => {
  await openCenter(page);
  const parsed = await call<{ id: string }>(page, 'copilot.preview', { content: json('首次读取的悖论作业', { type: 'Paradox', stage_name: 'mem_amiya_1' }), name: 'paradox.json' });
  const imported = await call<{ items: { versionId: string }[] }>(page, 'copilot.import', { previewId: parsed.id });
  const workspace = await call<Record<string, unknown>>(page, 'copilot.workspace.get', { kind: 'ParadoxCopilot' });
  await call(page, 'copilot.workspace.save', { workspace: { ...workspace, queue: [{ id: 'first-paradox-entry', versionId: imported.items[0].versionId, enabled: true, isRaid: false, navName: '' }] } });
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness); let reads = 0;
    harness.call = async (method, params) => {
      if (method === 'copilot.get') {
        if (++reads === 1) await new Promise<void>(resolve => { (window as unknown as { releaseVersionRead: () => void }).releaseVersionRead = resolve; });
        else throw new Error('合成作业版本已损坏');
      }
      return original(method, params);
    };
  });
  await page.getByRole('tab', { name: '悖论模拟', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-title')).toContainText('正在读取作业…');
  await expect(queue(page)).not.toContainText('作业版本不可用');
  await expect(queue(page)).not.toContainText('请移除或取消勾选');
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeDisabled();
  await page.evaluate(() => (window as unknown as { releaseVersionRead: () => void }).releaseVersionRead());
  await expect(queue(page).locator('.cp-queue-title')).toContainText('首次读取的悖论作业');
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeEnabled();
  await library(page).getByRole('button', { name: '刷新作业库', exact: true }).click();
  await expect(queue(page)).toContainText('作业版本不可用');
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeDisabled();
});

test('desktop queue has room for multiple entries and only its list scrolls', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCenter(page); await importJson(page, json('可排序的长队列作业'));
  for (let index = 0; index < 7; index++) await library(page).getByRole('button', { name: '加入队列 可排序的长队列作业', exact: true }).click();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    const metrics = await queue(page).evaluate(element => {
      const list = element.querySelector('.cp-queue-list')!;
      const editor = element.querySelector('.cp-queue-editor')!;
      return { width: element.getBoundingClientRect().width, height: list.clientHeight, scrollable: list.scrollHeight > list.clientHeight, editorScrolls: editor.scrollHeight > editor.clientHeight };
    });
    expect(metrics.width).toBeGreaterThanOrEqual(360);
    expect(metrics.height).toBeGreaterThanOrEqual(280);
    expect(metrics.scrollable).toBe(true);
    expect(metrics.editorScrolls).toBe(false);
    await page.evaluate(() => { document.querySelector('.copilot-page')!.scrollTop = 0; });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await page.screenshot({ path: testInfo.outputPath(`copilot-queue-${viewport.width}-${theme}.png`), fullPage: true });
    }
  }
  await queue(page).getByRole('button', { name: '上移作业 8', exact: true }).click();
  await expect(queue(page).getByLabel('执行队列 8', { exact: true })).toBeVisible();
  for (const width of [960, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('local JSON selection and narrow dark/light layouts provide a return path without horizontal overflow', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await openCenter(page);
  await page.getByRole('button', { name: '导入作业', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(json('窄窗作业')) });
  await expect(preview(page)).toContainText('窄窗作业');
  await preview(page).getByRole('button', { name: '导入到作业库', exact: true }).click();
  await page.getByRole('button', { name: '返回作业列表', exact: true }).click();
  await library(page).getByRole('button', { name: /1-7.*窄窗作业|main_01-07.*窄窗作业/u }).click();
  await expect(page.getByRole('complementary', { name: '作业详情', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '返回作业列表', exact: true })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`copilot-narrow-${theme}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: '返回作业列表', exact: true }).click();
  await expect(library(page)).toBeVisible();
});


test('an explicitly restored historical selection survives outside the recent snapshot window', async ({ page }) => {
  await openCenter(page); await importJson(page, json('窗口外的旧作业'));
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  const panel = page.getByRole('region', { name: '作业运行状态', exact: true });
  await panel.getByRole('button', { name: '停止作业', exact: true }).click();
  const older = (await call<{ runs: { id: string }[] }>(page, 'app.snapshot')).runs[0].id;
  await queue(page).getByRole('button', { name: '移除作业 1', exact: true }).click();
  await importJson(page, json('最近窗口内的新作业'));
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  await panel.getByRole('button', { name: '停止作业', exact: true }).click();
  await navigate(page, '执行记录');
  await page.locator('.history-table tbody tr').filter({ hasText: '窗口外的旧作业' }).getByRole('button').click();
  await expect(panel.getByRole('heading', { name: '窗口外的旧作业', exact: true })).toBeVisible();
  await page.evaluate(older => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      const result = await original(method, params);
      if (method === 'app.snapshot') {
        const snapshot = result as { runs: { id: string }[] };
        return { ...snapshot, runs: snapshot.runs.filter(run => run.id !== older) };
      }
      return result;
    };
  }, older);
  await navigate(page, '主页'); await navigate(page, '作业中心');
  await expect(panel.getByRole('heading', { name: '窗口外的旧作业', exact: true })).toBeVisible();
  await expect.poll(async () => (await call<{ runs: { id: string }[] }>(page, 'app.snapshot')).runs.some(run => run.id === older)).toBe(false);
  await expect(panel.locator('.cp-run-summary')).not.toContainText('最近窗口内的新作业');
  await expect(panel.locator('.cp-run-entries')).not.toContainText('最近窗口内的新作业');
});

test('failed workspace writes retain the editable queue and retry before execution', async ({ page }) => {
  await openCenter(page);
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness); let failed = false;
    harness.call = async (method, params) => {
      if (method === 'copilot.workspace.save' && !failed) { failed = true; throw new Error('合成作业队列保存失败'); }
      return original(method, params);
    };
  });
  await importJson(page, json('保存失败后重试'), true, false);
  await expect(page.getByRole('alert')).toContainText('已保存 1 份到作业库');
  await expect(queue(page).locator('.cp-save-state')).toContainText('合成作业队列保存失败');
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeDisabled();
  await queue(page).getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  expect((await call<{ queue: unknown[] }>(page, 'copilot.workspace.get', { kind: 'Copilot' })).queue).toHaveLength(1);
  expect((await call<{ runs: unknown[] }>(page, 'app.snapshot')).runs).toHaveLength(0);
});

test('starting a newer run updates the selection retained after explicit history navigation', async ({ page }) => {
  await openCenter(page); await importJson(page, json('历史导航的旧作业'));
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  const panel = page.getByRole('region', { name: '作业运行状态', exact: true });
  await panel.getByRole('button', { name: '停止作业', exact: true }).click();
  await navigate(page, '执行记录');
  await page.locator('.history-table tbody tr').filter({ hasText: '历史导航的旧作业' }).getByRole('button').click();
  await expect(panel.getByRole('heading', { name: '历史导航的旧作业', exact: true })).toBeVisible();
  await queue(page).getByRole('button', { name: '移除作业 1', exact: true }).click();
  await importJson(page, json('导航后启动的新作业'));
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  await expect(panel.getByRole('heading', { name: '导航后启动的新作业', exact: true })).toBeVisible();
  await navigate(page, '主页'); await navigate(page, '作业中心');
  await expect(panel.getByRole('heading', { name: '导航后启动的新作业', exact: true })).toBeVisible();
  await expect(panel.locator('.cp-run-summary')).not.toContainText('历史导航的旧作业');
  await expect(panel.locator('.cp-run-entries')).not.toContainText('历史导航的旧作业');
});

test('the local library pages beyond twenty records without changing the execution queue', async ({ page }) => {
  await openCenter(page);
  await page.evaluate(async contents => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    for (const content of contents) {
      const result = await harness.call('copilot.preview', { content, name: '分页合成作业.json' }) as { id: string };
      await harness.call('copilot.import', { previewId: result.id });
    }
  }, Array.from({ length: 21 }, (_, index) => json(`分页作业 ${index + 1}`)));
  await library(page).getByRole('button', { name: '刷新作业库', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(20);
  await expect(library(page)).toContainText('共 21 份');
  await library(page).getByRole('button', { name: '本地作业下一页', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(1);
  await expect(library(page)).toContainText('第 2 页');
  await expect(library(page).getByRole('button', { name: '本地作业下一页', exact: true })).toBeDisabled();
  await library(page).getByRole('button', { name: '本地作业上一页', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(20);
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(0);
});

test('a failed draft for another kind does not block the selected saved workspace', async ({ page }) => {
  await openCenter(page);
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (method === 'copilot.workspace.save' && (params.workspace as { kind: string }).kind === 'Copilot') throw new Error('普通作业草稿暂时保存失败');
      return original(method, params);
    };
  });
  await importJson(page, json('保留的普通作业草稿'), true, false);
  await expect(queue(page).locator('.cp-save-state')).toContainText('普通作业草稿暂时保存失败');
  await page.getByRole('tab', { name: '保全派驻', exact: true }).click();
  await importJson(page, json('仍可执行的保全作业', { type: 'SSS', stages: [{ stage_name: 'main_01-07', draw_as_possible: true, actions: [{ type: 'SpeedUp' }] }] }));
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  await expect(queue(page).locator('.cp-save-state')).not.toContainText('普通作业草稿暂时保存失败');
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  const panel = page.getByRole('region', { name: '作业运行状态', exact: true });
  await expect(panel.getByRole('heading', { name: '仍可执行的保全作业', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '停止作业', exact: true }).click();
  await page.getByRole('tab', { name: '普通作业', exact: true }).click();
  await expect(queue(page)).toContainText('保留的普通作业草稿');
  await expect(queue(page).locator('.cp-save-state')).toContainText('普通作业草稿暂时保存失败');
});
