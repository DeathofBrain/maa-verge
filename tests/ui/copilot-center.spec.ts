import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { expectHome, navigate } from './fixtures/navigation';
import { historicalCopilotRun, restoreHistoricalRuns } from './fixtures/history';

const json = (title: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    stage_name: 'main_01-07',
    minimum_required: 'v6.0.0',
    doc: { title, details: '合成作业，仅验证界面流程', author: '测试作者' },
    opers: [{ name: '阿米娅', skill: 1, requirements: { elite: 2, level: 80 } }],
    actions: [{ type: 'SpeedUp' }],
    ...extra,
  });
const queue = (page: Page) => page.getByRole('region', { name: '作业执行队列', exact: true });
const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const preview = (page: Page) => page.getByRole('region', { name: '导入预览', exact: true });
const monitoredExecution = (page: Page) =>
  page.getByRole('region', { name: '所选设备执行情况', exact: true });
async function openCenter(page: Page) {
  await page.goto('/');
  await expectHome(page);
  await navigate(page, '作业中心');
  await expect(page.getByRole('heading', { name: '作业中心', exact: true })).toBeVisible();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
}
async function importJson(page: Page, content: string, add = true, waitForClose = true) {
  const panel = page.locator('details.cp-import');
  if (!(await panel.getAttribute('open').then((value) => value !== null)))
    await page.getByRole('button', { name: '导入作业', exact: true }).click();
  const input = page.getByLabel('作业 JSON', { exact: true });
  if (!(await input.isVisible())) await page.getByText('粘贴 JSON', { exact: true }).click();
  await input.fill(content);
  await page.getByRole('button', { name: '预览 JSON', exact: true }).click();
  await expect(preview(page)).toBeVisible();
  await preview(page)
    .getByRole('button', { name: add ? '所选导入并加入队列' : '导入到作业库', exact: true })
    .click();
  if (waitForClose) await expect(preview(page)).toHaveCount(0);
}
async function call<T>(
  page: Page,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return page.evaluate(
    async ({ method, params }) =>
      (window as unknown as HarnessWindow).runtimeHarness.call(method, params),
    { method, params },
  ) as Promise<T>;
}

test(
  'local preview, duplicate queue entries and ordered edits persist without creating task tables',
  { tag: '@smoke' },
  async ({ page }) => {
    await openCenter(page);
    const before = await call<{ plans: unknown[] }>(page, 'app.snapshot');
    await importJson(page, json('合成 1-7 作业'));
    await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
    await queue(page).locator('.cp-settings > summary').click();
    await queue(page).getByLabel('作业循环次数', { exact: true }).fill('3');
    await library(page)
      .getByRole('button', { name: '加入队列 合成 1-7 作业', exact: true })
      .click();
    await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(2);
    await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toHaveValue('1');
    await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toBeDisabled();
    await queue(page).getByLabel('导航关卡 2', { exact: true }).fill('1-7');
    await queue(page).getByRole('button', { name: '上移作业 2', exact: true }).click();
    await expect(queue(page).getByLabel('导航关卡 1', { exact: true })).toHaveValue('1-7');
    await queue(page).getByLabel('执行队列 2', { exact: true }).uncheck();
    await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
    const saved = await call<{
      queue: { id: string; versionId: string; enabled: boolean; navName: string }[];
      options: { loopTimes: number };
    }>(page, 'copilot.workspace.get', { kind: 'Copilot' });
    expect(saved.queue).toHaveLength(2);
    expect(saved.queue[0].id).not.toBe(saved.queue[1].id);
    expect(saved.queue[0].versionId).toBe(saved.queue[1].versionId);
    expect(saved.queue[0].navName).toBe('1-7');
    expect(saved.queue[1].enabled).toBe(false);
    expect((await call<{ plans: unknown[] }>(page, 'app.snapshot')).plans).toEqual(before.plans);
    await page.reload();
    await navigate(page, '作业中心');
    await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(2);
    await expect(queue(page).getByLabel('执行队列 2', { exact: true })).not.toBeChecked();
    await queue(page).getByRole('button', { name: '清除未勾选项', exact: true }).click();
    await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
    await expect(queue(page).getByLabel('导航关卡 1', { exact: true })).toBeVisible();
  },
);

test('unmigrated copilot execution is blocked while the imported immutable queue remains editable', async ({
  page,
}) => {
  await openCenter(page);
  await importJson(page, json('保留待迁移作业'));
  const saved = await call<{ queue: { versionId: string }[] }>(page, 'copilot.workspace.get', {
    kind: 'Copilot',
  });
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  await expect(page.getByRole('status', { name: '作业执行检查', exact: true })).toContainText(
    '尚未迁移到 MaaFramework',
  );
  await expect(page.getByRole('alert')).toContainText('尚未迁移到 MaaFramework');
  expect((await call<{ runs: unknown[] }>(page, 'app.snapshot')).runs).toHaveLength(0);
  expect(
    (await call<{ queue: unknown[] }>(page, 'copilot.workspace.get', { kind: 'Copilot' })).queue,
  ).toEqual(saved.queue);
  await queue(page).getByRole('button', { name: '移除作业 1', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(0);
});

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
  await importJson(page, json('悖论独立队列', { type: 'Paradox', stage_name: 'mem_amiya_1' }));
  await queue(page).locator('.cp-settings > summary').click();
  await expect(queue(page).getByLabel('作业循环次数', { exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: '普通作业', exact: true }).click();
  await expect(queue(page)).toContainText('普通独立队列');
  await expect(queue(page)).not.toContainText('保全独立队列');
});

test('switching workspaces retains restored historical details without enabling new execution', async ({
  page,
}) => {
  await openCenter(page);
  await importJson(page, json('旧普通作业记录'));
  const saved = await call<{ queue: { versionId: string }[] }>(page, 'copilot.workspace.get', {
    kind: 'Copilot',
  });
  await restoreHistoricalRuns(page, [
    historicalCopilotRun('旧普通作业记录', saved.queue[0].versionId),
  ]);
  await navigate(page, '作业中心');
  const panel = page.getByRole('region', { name: '作业运行状态', exact: true });
  await panel.locator('.cp-run-logs > summary').click();
  for (const name of ['保全派驻', '悖论模拟']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(panel.getByRole('heading', { name: '旧普通作业记录', exact: true })).toBeVisible();
    await expect(panel.locator('.cp-run-logs')).toHaveAttribute('open', '');
  }
  await expect(panel).toContainText('已停止');
  await expect(panel.getByRole('button', { name: '停止作业', exact: true })).toHaveCount(0);
  await navigate(page, '执行记录');
  await page
    .locator('.history-table tbody tr')
    .filter({ hasText: '旧普通作业记录' })
    .getByRole('button')
    .click();
  await expect(monitoredExecution(page)).toContainText('正在查看历史执行');
  expect((await call<{ runs: unknown[] }>(page, 'app.snapshot')).runs).toHaveLength(1);
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
  const saved = await call<{ queue: { versionId: string }[] }>(page, 'copilot.workspace.get', {
    kind: 'Copilot',
  });
  const oldRun = historicalCopilotRun('窗口外的旧作业', saved.queue[0].versionId, 'historical-old'),
    newRun = historicalCopilotRun('最近窗口内的新作业', saved.queue[0].versionId, 'historical-new');
  await restoreHistoricalRuns(page, [newRun, oldRun]);
  const older = oldRun.id;
  const panel = page.getByRole('region', { name: '作业运行状态', exact: true });
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

test('historical selection remains fixed when another saved run enters the recent snapshot', async ({
  page,
}) => {
  await openCenter(page);
  await importJson(page, json('历史导航的旧作业'));
  const saved = await call<{ queue: { versionId: string }[] }>(page, 'copilot.workspace.get', {
    kind: 'Copilot',
  });
  const older = historicalCopilotRun('历史导航的旧作业', saved.queue[0].versionId, 'selection-old');
  await restoreHistoricalRuns(page, [older]);
  await navigate(page, '作业中心');
  const panel = page.getByRole('region', { name: '作业运行状态', exact: true });
  await panel.getByLabel('查看作业记录', { exact: true }).selectOption(older.id);
  const newer = historicalCopilotRun('后来恢复的新记录', saved.queue[0].versionId, 'selection-new');
  await page.evaluate((newer) => {
    const api = (window as HarnessWindow).runtimeHarness,
      original = api.call;
    api.call = async (method, params) => {
      if (method === 'run.detail' && params.id === newer.id) return newer;
      const value = await original(method, params);
      if (method === 'app.snapshot')
        return { ...(value as object), runs: [newer, ...(value as { runs: unknown[] }).runs] };
      return value;
    };
    api.emitEvent('run.completed', { runId: newer.id });
  }, newer);
  await expect(panel.getByRole('heading', { name: '历史导航的旧作业', exact: true })).toBeVisible();
  await panel.getByLabel('查看作业记录', { exact: true }).selectOption(newer.id);
  await expect(panel.getByRole('heading', { name: '后来恢复的新记录', exact: true })).toBeVisible();
  expect((await call<{ runs: unknown[] }>(page, 'app.snapshot')).runs).toHaveLength(2);
});

test('the local library pages beyond twenty records without changing the execution queue', async ({
  page,
}) => {
  await openCenter(page);
  await page.evaluate(
    async (contents) => {
      const harness = (window as unknown as HarnessWindow).runtimeHarness;
      for (const content of contents) {
        const result = (await harness.call('copilot.preview', {
          content,
          name: '分页合成作业.json',
        })) as { id: string };
        await harness.call('copilot.import', { previewId: result.id });
      }
    },
    Array.from({ length: 21 }, (_, index) => json(`分页作业 ${index + 1}`)),
  );
  await library(page).getByRole('button', { name: '刷新作业库', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(20);
  await expect(library(page)).toContainText('共 21 份');
  await library(page).getByRole('button', { name: '本地作业下一页', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(1);
  await expect(library(page)).toContainText('第 2 页');
  await expect(
    library(page).getByRole('button', { name: '本地作业下一页', exact: true }),
  ).toBeDisabled();
  await library(page).getByRole('button', { name: '本地作业上一页', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(20);
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(0);
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
    json('保留的保全作业', {
      type: 'SSS',
      stages: [
        { stage_name: 'main_01-07', draw_as_possible: true, actions: [{ type: 'SpeedUp' }] },
      ],
    }),
  );
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  await expect(queue(page).locator('.cp-save-state')).not.toContainText('普通作业草稿暂时保存失败');
  await page.getByRole('button', { name: '开始作业', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('尚未迁移到 MaaFramework');
  expect((await call<{ runs: unknown[] }>(page, 'app.snapshot')).runs).toHaveLength(0);
  await page.getByRole('tab', { name: '普通作业', exact: true }).click();
  await expect(queue(page)).toContainText('保留的普通作业草稿');
  await expect(queue(page).locator('.cp-save-state')).toContainText('普通作业草稿暂时保存失败');
});
