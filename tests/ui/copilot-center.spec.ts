import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { call, importJson, library, openCenter, preview, queue } from './fixtures/copilot-page';
import { navigate } from './fixtures/navigation';

type CopilotActionWindow = HarnessWindow & {
  copilotStopRequests: string[];
  releaseCopilotStop: () => void;
};

const json = (title: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    stage_name: 'main_01-07',
    minimum_required: 'v6.0.0',
    doc: { title, details: '合成作业，仅验证界面流程', author: '测试作者' },
    opers: [{ name: '阿米娅', skill: 1, requirements: { elite: 2, level: 80 } }],
    actions: [{ type: 'SpeedUp' }],
    ...extra,
  });
const monitoredExecution = (page: Page) =>
  page.getByRole('region', { name: '所选设备执行情况', exact: true });

test(
  'local preview, duplicate queue entries and ordered edits persist without creating task tables',
  { tag: '@smoke' },
  async ({ page }) => {
    await openCenter(page);
    const before = await call<{ plans: unknown[] }>(page, 'app.snapshot');
    await importJson(page, json('合成 1-7 作业'));
    await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
    await expect(queue(page).locator('.cp-start-hint')).toContainText('单份作业');
    await expect(queue(page).getByLabel('导航关卡 1', { exact: true })).toHaveCount(0);
    await expect(queue(page).getByLabel('突袭', { exact: true })).toHaveCount(0);
    await queue(page).locator('.cp-settings > summary').click();
    await queue(page).getByLabel('作业循环次数', { exact: true }).fill('3');
    await library(page)
      .getByRole('button', { name: '加入队列 合成 1-7 作业', exact: true })
      .click();
    await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(2);
    await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toHaveValue('1');
    await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toBeDisabled();
    await expect(queue(page).locator('.cp-start-hint')).toContainText('关卡地图');
    await expect(queue(page).getByLabel('导航关卡 2', { exact: true })).toHaveCount(0);
    await queue(page).getByRole('button', { name: '上移作业 2', exact: true }).click();
    await queue(page).getByLabel('执行队列 2', { exact: true }).uncheck();
    await expect(queue(page).getByLabel('导航关卡 1', { exact: true })).toHaveCount(0);
    await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toBeEnabled();
    await queue(page).getByLabel('作业循环次数', { exact: true }).fill('3');
    await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
    const saved = await call<{
      queue: { id: string; versionId: string; enabled: boolean; navName: string }[];
      options: { loopTimes: number };
    }>(page, 'copilot.workspace.get', { kind: 'Copilot' });
    expect(saved.queue).toHaveLength(2);
    expect(saved.queue[0].id).not.toBe(saved.queue[1].id);
    expect(saved.queue[0].versionId).toBe(saved.queue[1].versionId);
    expect(saved.queue.every((entry) => entry.navName === '')).toBe(true);
    expect(saved.queue[1].enabled).toBe(false);
    expect(saved.options.loopTimes).toBe(3);
    expect((await call<{ plans: unknown[] }>(page, 'app.snapshot')).plans).toEqual(before.plans);
    await page.reload();
    await navigate(page, '作业中心');
    await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(2);
    await expect(queue(page).getByLabel('执行队列 2', { exact: true })).not.toBeChecked();
    await queue(page).getByRole('button', { name: '清除未勾选项', exact: true }).click();
    await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
    await expect(queue(page).getByLabel('导航关卡 1', { exact: true })).toHaveCount(0);
    await expect(queue(page).locator('.cp-start-hint')).toContainText('「开始行动」');
  },
);

test('disabled entries do not change a single annihilation work into a navigation list', async ({
  page,
}) => {
  await openCenter(page);
  await importJson(page, json('合成剿灭作业', { stage_name: 'camp_r34' }));
  await queue(page).getByLabel('执行队列 1', { exact: true }).uncheck();
  await queue(page).locator('.cp-settings > summary').click();
  await queue(page).getByLabel('作业循环次数', { exact: true }).fill('3');
  await library(page).getByRole('button', { name: '加入队列 合成剿灭作业', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(2);
  await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toHaveValue('3');
  await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toBeEnabled();
  await expect(queue(page).getByLabel('导航关卡 2', { exact: true })).toHaveCount(0);
  await expect(queue(page).getByLabel('突袭', { exact: true })).toHaveCount(0);
  await expect(queue(page).locator('.cp-start-hint')).toContainText('关卡、难度或演习模式');
  await expect(queue(page).locator('.cp-start-hint')).toContainText('「开始行动」');
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  const saved = await call<{
    queue: { enabled: boolean }[];
    options: { loopTimes: number };
  }>(page, 'copilot.workspace.get', { kind: 'Copilot' });
  expect(saved.queue.map((entry) => entry.enabled)).toEqual([false, true]);
  expect(saved.options.loopTimes).toBe(3);
  await queue(page).getByLabel('执行队列 2', { exact: true }).uncheck();
  await importJson(page, json('导入的新剿灭作业', { stage_name: 'camp_r34' }));
  await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toHaveValue('3');
  await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toBeEnabled();
  await expect(queue(page).getByLabel('导航关卡 3', { exact: true })).toHaveCount(0);
});

test('new ordinary queue entries follow declared difficulties, default to normal and preserve repeated adds', async ({
  page,
}) => {
  await openCenter(page);
  for (const [title, extra] of [
    ['仅普通作业', { difficulty: 1 }],
    ['仅突袭作业', { difficulty: 2 }],
    ['双难度作业', { difficulty: 3 }],
    ['未声明作业', { difficulty: 0 }],
    ['缺省难度作业', {}],
    ['无效难度作业', { difficulty: 99 }],
  ] as const)
    await importJson(page, json(title, extra));
  const entries = queue(page).locator('.cp-queue-list > li');
  await expect(entries).toHaveCount(7);
  await expect(entries.nth(0)).toContainText('普通');
  await expect(entries.nth(1)).toContainText('突袭');
  await expect(entries.nth(2)).toContainText('普通');
  await expect(entries.nth(3)).toContainText('突袭');
  for (const index of [4, 5, 6]) await expect(entries.nth(index)).toContainText('普通');
  for (const title of ['未声明作业', '缺省难度作业', '无效难度作业'])
    await expect(
      library(page)
        .getByRole('button', { name: `加入队列 ${title}`, exact: true })
        .locator('..')
        .getByLabel('作业支持难度', { exact: true }),
    ).toContainText('普通');
  await expect(queue(page).getByRole('textbox')).toHaveCount(0);
  await expect(queue(page).getByRole('checkbox', { name: '突袭', exact: true })).toHaveCount(0);
  await library(page).getByRole('button', { name: '加入队列 双难度作业', exact: true }).click();
  await entries.nth(2).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '重复添加', exact: true }).click();
  await expect(entries).toHaveCount(11);
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  const saved = await call<{
    queue: { id: string; versionId: string; isRaid: boolean; navName: string }[];
    options: { loopTimes: number };
  }>(page, 'copilot.workspace.get', { kind: 'Copilot' });
  expect(saved.queue.map((entry) => entry.isRaid)).toEqual([
    false,
    true,
    false,
    true,
    false,
    false,
    false,
    false,
    true,
    false,
    true,
  ]);
  expect(new Set(saved.queue.map((entry) => entry.id)).size).toBe(11);
  expect(saved.queue[2].versionId).toBe(saved.queue[3].versionId);
  expect(saved.queue[7].versionId).toBe(saved.queue[2].versionId);
  expect(saved.queue.every((entry) => entry.navName === '')).toBe(true);
  expect(saved.options.loopTimes).toBe(1);
  await page.reload();
  await navigate(page, '作业中心');
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(11);
  expect(
    (await call<{ queue: unknown[] }>(page, 'copilot.workspace.get', { kind: 'Copilot' })).queue,
  ).toEqual(saved.queue);
});

test('difficulty expansion checks the queue limit without changing existing entries', async ({
  page,
}) => {
  await openCenter(page);
  await importJson(page, json('容量检查双难度作业', { difficulty: 3 }), false);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '作业详情弹窗', exact: true })).toHaveCount(0);
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const records = (await api.call('copilot.list', {})) as {
      items: { versionId: string }[];
    };
    const workspace = (await api.call('copilot.workspace.get', { kind: 'Copilot' })) as {
      queue: unknown[];
    };
    await api.call('copilot.workspace.save', {
      workspace: {
        ...workspace,
        queue: Array.from({ length: 99 }, (_, index) => ({
          id: `existing-${index}`,
          versionId: records.items[0].versionId,
          enabled: true,
          isRaid: index % 2 === 1,
          navName: `保留的历史导航 ${index}`,
        })),
      },
    });
  });
  await page.reload();
  await navigate(page, '作业中心');
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(99);
  const before = await call<{ queue: unknown[] }>(page, 'copilot.workspace.get', {
    kind: 'Copilot',
  });
  await library(page)
    .getByRole('button', { name: '加入队列 容量检查双难度作业', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('每个队列最多 100 项');
  expect(
    (await call<{ queue: unknown[] }>(page, 'copilot.workspace.get', { kind: 'Copilot' })).queue,
  ).toEqual(before.queue);
});

test(
  'independent execution stays in the center, fixes its queue snapshot and supports source navigation and stop',
  { tag: '@smoke' },
  async ({ page }) => {
    await openCenter(page);
    await importJson(page, json('独立作业快照'));
    await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '开始作业', exact: true }).click();
    await expect(page.getByRole('heading', { name: '作业中心', exact: true })).toBeVisible();
    const run = page.getByRole('region', { name: '作业运行状态', exact: true });
    await expect(run).toContainText('通关未确认');
    await expect(run.getByRole('button', { name: '停止作业', exact: true })).toBeVisible();
    await queue(page).getByRole('button', { name: '移除作业 1', exact: true }).click();
    await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(0);
    await expect(run.locator('.cp-run-entries')).toContainText('独立作业快照');
    const snapshot = await call<{
      plans: unknown[];
      runs: { id: string; source: string; planId: null; copilotEntries: unknown[] }[];
    }>(page, 'app.snapshot');
    const active = snapshot.runs[0];
    expect(active.source).toBe('copilot');
    expect(active.planId).toBeNull();
    expect(snapshot.plans).toHaveLength(2);
    await navigate(page, '主页');
    const current = page.getByRole('region', { name: '当前执行', exact: true });
    await expect(current).toContainText('独立作业快照');
    await current.getByRole('button', { name: '查看运行详情', exact: true }).click();
    const monitor = page.getByRole('region', { name: '任务表执行监控', exact: true });
    await expect(page.getByRole('tab', { name: '执行监控', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      monitoredExecution(page).getByRole('heading', { name: '独立作业快照', exact: true }),
    ).toBeVisible();
    await expect(
      monitor.getByRole('button', { name: '停止设备任务本地模拟设备', exact: true }),
    ).toBeVisible();
    await expect(monitor.getByRole('article')).toContainText('作业 · 独立作业快照');
    await expect(
      monitor.getByRole('button', { name: '查看设备执行本地模拟设备', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await navigate(page, '作业中心');
    await run.getByRole('button', { name: '停止作业', exact: true }).click();
    await expect(run).toContainText('已停止');
    expect(
      (await call<{ queue: unknown[] }>(page, 'copilot.workspace.get', { kind: 'Copilot' })).queue,
    ).toHaveLength(0);
  },
);

test('busy device blocks the center while browsing and local import remain available', async ({
  page,
}) => {
  await openCenter(page);
  await call(page, 'run.start', {
    planId: 'farm-1-7',
    deviceId: 'mock-device-1',
    requestId: 'busy-copilot-ui',
  });
  await importJson(page, json('忙时导入作业'));
  await expect(library(page)).toContainText('忙时导入作业');
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeDisabled();
  await expect(queue(page)).toContainText('设备正在执行');
  await expect(queue(page).getByRole('button', { name: '查看占用', exact: true })).toBeVisible();
  const snapshot = await call<{ runs: { id: string }[]; plans: unknown[] }>(page, 'app.snapshot');
  expect(snapshot.runs).toHaveLength(1);
  expect(snapshot.plans).toHaveLength(2);
  await call(page, 'run.stop', { id: snapshot.runs[0].id });
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeEnabled();
});

test('the queue stops its active work and shares the pending state with the monitor and dock', async ({
  page,
}) => {
  await openCenter(page);
  await importJson(page, json('从执行队列停止的作业'));
  await page.evaluate(() => {
    const target = window as CopilotActionWindow;
    const original = target.runtimeHarness.call.bind(target.runtimeHarness);
    const stopped = new Promise<void>((resolve) => {
      target.releaseCopilotStop = resolve;
    });
    target.copilotStopRequests = [];
    target.runtimeHarness.call = async (method, params) => {
      if (method === 'run.stop') {
        target.copilotStopRequests.push(String(params.id));
        await stopped;
      }
      return original(method, params);
    };
  });
  await queue(page).getByRole('button', { name: '开始作业', exact: true }).click();
  await expect(queue(page).getByRole('button', { name: '停止作业', exact: true })).toBeEnabled();
  const run = (await call<{ runs: { id: string }[] }>(page, 'app.snapshot')).runs[0];
  await queue(page).getByRole('button', { name: '移除作业 1', exact: true }).click();
  await queue(page).getByRole('button', { name: '停止作业', exact: true }).click();
  await expect(queue(page).getByRole('button', { name: '正在停止…', exact: true })).toBeDisabled();
  await expect(
    page
      .getByRole('region', { name: '作业运行状态', exact: true })
      .getByRole('button', { name: '正在停止…', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: '停止执行', exact: true })).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => (window as CopilotActionWindow).copilotStopRequests))
    .toEqual([run.id]);
  await page.evaluate(() => (window as CopilotActionWindow).releaseCopilotStop());
  await expect(queue(page).getByRole('button', { name: '开始作业', exact: true })).toBeDisabled();
  expect(
    (await call<{ runs: { id: string; status: string }[] }>(page, 'app.snapshot')).runs,
  ).toEqual(expect.arrayContaining([expect.objectContaining({ id: run.id, status: 'stopped' })]));
});

test('queue stop targets the selected device and workspace kind while other execution stays active', async ({
  page,
}) => {
  await openCenter(page);
  await importJson(page, json('按类型和设备停止的作业'));
  await queue(page).getByRole('button', { name: '开始作业', exact: true }).click();
  await expect(queue(page).getByRole('button', { name: '停止作业', exact: true })).toBeEnabled();
  const copilot = (await call<{ runs: { id: string }[] }>(page, 'app.snapshot')).runs[0];
  await page.getByRole('tab', { name: '保全派驻', exact: true }).click();
  await expect(queue(page).getByRole('button', { name: '停止作业', exact: true })).toHaveCount(0);
  await expect(queue(page).getByRole('button', { name: '开始作业', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: '普通作业', exact: true }).click();
  const otherDevice = await call<{ id: string }>(page, 'device.connect', {
    address: '127.0.0.1:5557',
    name: '另一个执行设备',
  });
  const otherRun = await call<{ id: string }>(page, 'run.start', {
    planId: 'farm-1-7',
    deviceId: otherDevice.id,
    requestId: 'other-copilot-stop-device',
  });
  await queue(page).getByLabel('作业目标设备', { exact: true }).selectOption(otherDevice.id);
  await expect(queue(page).getByRole('button', { name: '停止作业', exact: true })).toHaveCount(0);
  await expect(queue(page).getByRole('button', { name: '开始作业', exact: true })).toBeDisabled();
  await queue(page).getByLabel('作业目标设备', { exact: true }).selectOption('mock-device-1');
  await queue(page).getByRole('button', { name: '停止作业', exact: true }).click();
  await expect(queue(page).getByRole('button', { name: '开始作业', exact: true })).toBeEnabled();
  const saved = await call<{ runs: { id: string; status: string }[] }>(page, 'app.snapshot');
  expect(saved.runs.find((run) => run.id === copilot.id)?.status).toBe('stopped');
  expect(saved.runs.find((run) => run.id === otherRun.id)?.status).toBe('running');
});

test('community pagination and set preview retain member order and explicitly show deleted members', async ({
  page,
}) => {
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
  await expect(queue(page).locator('.cp-queue-title strong')).toHaveText([
    '合成社区作业 101',
    '合成社区作业 102',
  ]);
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  expect(
    (
      await call<{ queue: { isRaid: boolean }[] }>(page, 'copilot.workspace.get', {
        kind: 'Copilot',
      })
    ).queue.map((entry) => entry.isRaid),
  ).toEqual([false, true]);
  expect((await call<{ plans: unknown[] }>(page, 'app.snapshot')).plans).toHaveLength(2);
});

test('three kinds use separate persisted queues and SSS only allows a single work', async ({
  page,
}) => {
  await openCenter(page);
  await importJson(page, json('普通独立队列'));
  await page.getByRole('tab', { name: '保全派驻', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(0);
  await importJson(
    page,
    json('保全独立队列', {
      type: 'SSS',
      difficulty: 3,
      stages: [
        { stage_name: 'main_01-07', draw_as_possible: true, actions: [{ type: 'SpeedUp' }] },
      ],
    }),
  );
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
  await expect(
    library(page).getByRole('button', { name: '加入队列 保全独立队列', exact: true }),
  ).toBeDisabled();
  await expect(queue(page).getByLabel('自动编队', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '悖论模拟', exact: true }).click();
  await importJson(
    page,
    json('悖论独立队列', { type: 'Paradox', stage_name: 'mem_amiya_1', difficulty: 3 }),
  );
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
  await expect(queue(page).locator('.cp-start-hint')).toContainText('「开始模拟」');
  await queue(page).locator('.cp-settings > summary').click();
  await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toBeDisabled();
  await library(page).getByRole('button', { name: '加入队列 悖论独立队列', exact: true }).click();
  await expect(queue(page).locator('.cp-start-hint')).toContainText('「等级／稀有度」');
  await expect(queue(page).locator('.cp-start-hint')).toContainText('按作业选择技能');
  await queue(page).getByLabel('执行队列 2', { exact: true }).uncheck();
  await expect(queue(page).locator('.cp-start-hint')).toContainText('「开始模拟」');
  await page.getByRole('tab', { name: '普通作业', exact: true }).click();
  await expect(queue(page)).toContainText('普通独立队列');
  await expect(queue(page)).not.toContainText('保全独立队列');
});

test('switching workspaces keeps the running panel, expanded logs and stop control', async ({
  page,
}) => {
  await openCenter(page);
  await importJson(page, json('切换时持续执行的普通作业'));
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  const panel = page.getByRole('region', { name: '作业运行状态', exact: true });
  await panel.locator('.cp-run-logs > summary').click();
  const initialProgress = await panel.getByLabel('作业执行进度').getAttribute('value');
  for (const name of ['保全派驻', '悖论模拟']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(
      panel.getByRole('heading', { name: '切换时持续执行的普通作业', exact: true }),
    ).toBeVisible();
    await expect(panel.locator('.cp-run-logs')).toHaveAttribute('open', '');
  }
  await expect(panel.getByLabel('作业执行进度')).not.toHaveAttribute('value', initialProgress!);
  await expect(page.getByRole('tab', { name: '悖论模拟', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await panel.getByRole('button', { name: '停止作业', exact: true }).click();
  await expect(panel).toContainText('已停止');
  await expect(page.getByRole('tab', { name: '悖论模拟', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await navigate(page, '主页');
  await navigate(page, '作业中心');
  await expect(
    panel.getByRole('heading', { name: '切换时持续执行的普通作业', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: '悖论模拟', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await navigate(page, '执行记录');
  await page
    .locator('.history-table tbody tr')
    .filter({ hasText: '切换时持续执行的普通作业' })
    .getByRole('button')
    .click();
  await expect(
    monitoredExecution(page).getByRole('heading', {
      name: '切换时持续执行的普通作业',
      exact: true,
    }),
  ).toBeVisible();
  await expect(monitoredExecution(page)).toContainText('正在查看历史执行');
  await navigate(page, '作业中心');
  await expect(page.getByRole('tab', { name: '悖论模拟', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('a persisted queue distinguishes a pending version read from a confirmed unavailable version', async ({
  page,
}) => {
  await openCenter(page);
  const parsed = await call<{ id: string }>(page, 'copilot.preview', {
    content: json('首次读取的悖论作业', { type: 'Paradox', stage_name: 'mem_amiya_1' }),
    name: 'paradox.json',
  });
  const imported = await call<{ items: { versionId: string }[] }>(page, 'copilot.import', {
    previewId: parsed.id,
  });
  const workspace = await call<Record<string, unknown>>(page, 'copilot.workspace.get', {
    kind: 'ParadoxCopilot',
  });
  await call(page, 'copilot.workspace.save', {
    workspace: {
      ...workspace,
      queue: [
        {
          id: 'first-paradox-entry',
          versionId: imported.items[0].versionId,
          enabled: true,
          isRaid: false,
          navName: '',
        },
      ],
    },
  });
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    let reads = 0;
    harness.call = async (method, params) => {
      if (method === 'copilot.get') {
        if (++reads === 1)
          await new Promise<void>((resolve) => {
            (window as unknown as { releaseVersionRead: () => void }).releaseVersionRead = resolve;
          });
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
  await page.evaluate(() =>
    (window as unknown as { releaseVersionRead: () => void }).releaseVersionRead(),
  );
  await expect(queue(page).locator('.cp-queue-title')).toContainText('首次读取的悖论作业');
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeEnabled();
  await library(page).getByRole('button', { name: '刷新作业库', exact: true }).click();
  await expect(queue(page)).toContainText('作业版本不可用');
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeDisabled();
});

test('an explicitly restored historical selection survives outside the recent snapshot window', async ({
  page,
}) => {
  await openCenter(page);
  await importJson(page, json('窗口外的旧作业'));
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  const panel = page.getByRole('region', { name: '作业运行状态', exact: true });
  await panel.getByRole('button', { name: '停止作业', exact: true }).click();
  const older = (await call<{ runs: { id: string }[] }>(page, 'app.snapshot')).runs[0].id;
  await queue(page).getByRole('button', { name: '移除作业 1', exact: true }).click();
  await importJson(page, json('最近窗口内的新作业'));
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  await panel.getByRole('button', { name: '停止作业', exact: true }).click();
  await navigate(page, '执行记录');
  await page
    .locator('.history-table tbody tr')
    .filter({ hasText: '窗口外的旧作业' })
    .getByRole('button')
    .click();
  await expect(
    monitoredExecution(page).getByRole('heading', { name: '窗口外的旧作业', exact: true }),
  ).toBeVisible();
  await expect(monitoredExecution(page)).toContainText('正在查看历史执行');
  // History details now open the shared device monitor. Explicit selection in
  // the authoring workspace still has to survive the recent-summary window.
  await navigate(page, '作业中心');
  await panel.getByLabel('查看作业记录', { exact: true }).selectOption(older);
  await expect(panel.getByRole('heading', { name: '窗口外的旧作业', exact: true })).toBeVisible();
  await page.evaluate((older) => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      const result = await original(method, params);
      if (method === 'app.snapshot') {
        const snapshot = result as { runs: { id: string }[] };
        return { ...snapshot, runs: snapshot.runs.filter((run) => run.id !== older) };
      }
      return result;
    };
  }, older);
  await navigate(page, '主页');
  await navigate(page, '作业中心');
  await expect(panel.getByRole('heading', { name: '窗口外的旧作业', exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      (await call<{ runs: { id: string }[] }>(page, 'app.snapshot')).runs.some(
        (run) => run.id === older,
      ),
    )
    .toBe(false);
  await expect(panel.locator('.cp-run-summary')).not.toContainText('最近窗口内的新作业');
  await expect(panel.locator('.cp-run-entries')).not.toContainText('最近窗口内的新作业');
});

test('failed workspace writes retain the editable queue and retry before execution', async ({
  page,
}) => {
  await openCenter(page);
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    let failed = false;
    harness.call = async (method, params) => {
      if (method === 'copilot.workspace.save' && !failed) {
        failed = true;
        throw new Error('合成作业队列保存失败');
      }
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
  expect(
    (await call<{ queue: unknown[] }>(page, 'copilot.workspace.get', { kind: 'Copilot' })).queue,
  ).toHaveLength(1);
  expect((await call<{ runs: unknown[] }>(page, 'app.snapshot')).runs).toHaveLength(0);
});

test('starting a newer run updates the selection retained after explicit history navigation', async ({
  page,
}) => {
  await openCenter(page);
  await importJson(page, json('历史导航的旧作业'));
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  const panel = page.getByRole('region', { name: '作业运行状态', exact: true });
  await panel.getByRole('button', { name: '停止作业', exact: true }).click();
  const older = (await call<{ runs: { id: string }[] }>(page, 'app.snapshot')).runs[0].id;
  await navigate(page, '执行记录');
  await page
    .locator('.history-table tbody tr')
    .filter({ hasText: '历史导航的旧作业' })
    .getByRole('button')
    .click();
  await expect(
    monitoredExecution(page).getByRole('heading', { name: '历史导航的旧作业', exact: true }),
  ).toBeVisible();
  await navigate(page, '作业中心');
  await panel.getByLabel('查看作业记录', { exact: true }).selectOption(older);
  await expect(panel.getByRole('heading', { name: '历史导航的旧作业', exact: true })).toBeVisible();
  await queue(page).getByRole('button', { name: '移除作业 1', exact: true }).click();
  await importJson(page, json('导航后启动的新作业'));
  await expect(page.getByRole('button', { name: '开始作业', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  await expect(
    panel.getByRole('heading', { name: '导航后启动的新作业', exact: true }),
  ).toBeVisible();
  await navigate(page, '主页');
  await navigate(page, '作业中心');
  await expect(
    panel.getByRole('heading', { name: '导航后启动的新作业', exact: true }),
  ).toBeVisible();
  await expect(panel.locator('.cp-run-summary')).not.toContainText('历史导航的旧作业');
  await expect(panel.locator('.cp-run-entries')).not.toContainText('历史导航的旧作业');
});

test('a failed draft for another kind does not block the selected saved workspace', async ({
  page,
}) => {
  await openCenter(page);
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (
        method === 'copilot.workspace.save' &&
        (params.workspace as { kind: string }).kind === 'Copilot'
      )
        throw new Error('普通作业草稿暂时保存失败');
      return original(method, params);
    };
  });
  await importJson(page, json('保留的普通作业草稿'), true, false);
  await expect(queue(page).locator('.cp-save-state')).toContainText('普通作业草稿暂时保存失败');
  await page.getByRole('tab', { name: '保全派驻', exact: true }).click();
  await importJson(
    page,
    json('仍可执行的保全作业', {
      type: 'SSS',
      stages: [
        { stage_name: 'main_01-07', draw_as_possible: true, actions: [{ type: 'SpeedUp' }] },
      ],
    }),
  );
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  await expect(queue(page).locator('.cp-save-state')).not.toContainText('普通作业草稿暂时保存失败');
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  const panel = page.getByRole('region', { name: '作业运行状态', exact: true });
  await expect(
    panel.getByRole('heading', { name: '仍可执行的保全作业', exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: '停止作业', exact: true }).click();
  await page.getByRole('tab', { name: '普通作业', exact: true }).click();
  await expect(queue(page)).toContainText('保留的普通作业草稿');
  await expect(queue(page).locator('.cp-save-state')).toContainText('普通作业草稿暂时保存失败');
});
