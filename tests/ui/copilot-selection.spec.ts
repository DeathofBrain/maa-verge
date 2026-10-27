import type { Page } from '@playwright/test';
import type {
  CopilotKind,
  CopilotPreview,
  CopilotRecord,
  CopilotWorkspace,
} from '../../packages/contracts/src/index';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const queue = (page: Page) => page.getByRole('region', { name: '作业执行队列', exact: true });
const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const preview = (page: Page) => page.getByRole('region', { name: '导入预览', exact: true });
const allQueue = (page: Page) =>
  queue(page).getByRole('checkbox', { name: '全选执行队列', exact: true });
const allPreview = (page: Page) =>
  preview(page).getByRole('checkbox', { name: '全选可用作业', exact: true });

async function call<T>(
  page: Page,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return page.evaluate(
    ({ method, params }) =>
      (window as unknown as HarnessWindow).runtimeHarness.call(method, params),
    { method, params },
  ) as Promise<T>;
}

async function enter(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
}

async function seed(page: Page, title: string, extra: Record<string, unknown> = {}) {
  const value = await call<CopilotPreview>(page, 'copilot.preview', {
    content: JSON.stringify({ stage_name: 'main_01-07', doc: { title }, actions: [], ...extra }),
  });
  return (await call<{ items: CopilotRecord[] }>(page, 'copilot.import', { previewId: value.id }))
    .items[0];
}

async function saveQueue(page: Page, kind: CopilotKind, entries: CopilotWorkspace['queue']) {
  const workspace = await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind });
  const next = { ...workspace, queue: entries };
  await call(page, 'copilot.workspace.save', { workspace: next });
  return next;
}

async function previewJson(page: Page, content: string) {
  await page.getByRole('button', { name: '导入作业', exact: true }).click();
  const input = page.getByLabel('作业 JSON', { exact: true });
  if (!(await input.isVisible())) await page.getByText('粘贴 JSON', { exact: true }).click();
  await input.fill(content);
  await page.getByRole('button', { name: '预览 JSON', exact: true }).click();
  await expect(preview(page)).toBeVisible();
}

test('preview select-all skips unavailable members, reflects partial selection and imports in set order', async ({
  page,
}) => {
  await page.goto('/');
  await enter(page);
  await library(page).getByRole('tab', { name: '社区作业集', exact: true }).click();
  await library(page).getByRole('button', { name: '查看详情 合成有序作业集', exact: true }).click();
  const first = preview(page).getByRole('checkbox', { name: '选择导入 1', exact: true });
  const second = preview(page).getByRole('checkbox', { name: '选择导入 2', exact: true });
  const invalid = preview(page).getByRole('checkbox', { name: '选择导入 3', exact: true });
  await expect(allPreview(page)).toBeChecked();
  await expect(allPreview(page)).toHaveJSProperty('indeterminate', false);
  await expect(invalid).toBeDisabled();
  await expect(invalid).not.toBeChecked();

  await allPreview(page).uncheck();
  await expect(first).not.toBeChecked();
  await expect(second).not.toBeChecked();
  await expect(allPreview(page)).toHaveJSProperty('indeterminate', false);
  await expect(
    preview(page).getByRole('button', { name: '导入到作业库', exact: true }),
  ).toBeDisabled();
  await expect(
    preview(page).getByRole('button', { name: '所选导入并加入队列', exact: true }),
  ).toBeDisabled();

  await second.check();
  await expect(allPreview(page)).toHaveJSProperty('indeterminate', true);
  await allPreview(page).click();
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
  await expect(allPreview(page)).toBeChecked();
  await expect(allPreview(page)).toHaveJSProperty('indeterminate', false);
  await expect(invalid).not.toBeChecked();
  await preview(page).getByRole('button', { name: '所选导入并加入队列', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-title strong')).toHaveText([
    '合成社区作业 101',
    '合成社区作业 102',
  ]);
});

test('single-item and wholly invalid previews expose accurate select-all states', async ({
  page,
}) => {
  await page.goto('/');
  await enter(page);
  await previewJson(
    page,
    JSON.stringify({ stage_name: 'main_01-07', doc: { title: '单项全选' }, actions: [] }),
  );
  await expect(allPreview(page)).toBeChecked();
  await allPreview(page).uncheck();
  await expect(
    preview(page).getByRole('checkbox', { name: '选择导入 1', exact: true }),
  ).not.toBeChecked();
  await allPreview(page).focus();
  await page.keyboard.press('Space');
  await expect(
    preview(page).getByRole('checkbox', { name: '选择导入 1', exact: true }),
  ).toBeChecked();
  await expect(allPreview(page)).toHaveJSProperty('indeterminate', false);
  await preview(page).getByRole('button', { name: '关闭导入预览', exact: true }).click();

  await previewJson(page, JSON.stringify({ doc: { title: '无效作业' } }));
  await expect(allPreview(page)).toBeDisabled();
  await expect(allPreview(page)).not.toBeChecked();
  await expect(allPreview(page)).toHaveJSProperty('indeterminate', false);
  await expect(
    preview(page).getByRole('checkbox', { name: '选择导入 1', exact: true }),
  ).toBeDisabled();
});

test('queue select-all persists enabled flags while preserving duplicate entries and their settings', async ({
  page,
}) => {
  await page.goto('/');
  const record = await seed(page, '批量勾选重复作业');
  const seeded = await saveQueue(page, 'Copilot', [
    {
      id: 'select-first',
      versionId: record.versionId,
      enabled: true,
      isRaid: true,
      navName: '1-7',
    },
    {
      id: 'select-second',
      versionId: record.versionId,
      enabled: false,
      isRaid: false,
      navName: '保留导航',
    },
  ]);
  const original = {
    ...seeded,
    options: {
      ...seeded.options,
      loopTimes: 3,
      formation: true,
      formationIndex: 2,
      autoLikeOnSuccess: true,
    },
  };
  await call(page, 'copilot.workspace.save', { workspace: original });
  await enter(page);
  await expect(allQueue(page)).toHaveJSProperty('indeterminate', true);
  await allQueue(page).click();
  await expect(
    queue(page).getByRole('checkbox', { name: '执行队列 1', exact: true }),
  ).toBeChecked();
  await expect(
    queue(page).getByRole('checkbox', { name: '执行队列 2', exact: true }),
  ).toBeChecked();
  await expect(allQueue(page)).toHaveJSProperty('indeterminate', false);
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  expect(await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind: 'Copilot' })).toEqual({
    ...original,
    options: { ...original.options, loopTimes: 1 },
    queue: original.queue.map((entry) => ({ ...entry, enabled: true })),
  });

  await allQueue(page).uncheck();
  await expect(
    queue(page).getByRole('checkbox', { name: '执行队列 1', exact: true }),
  ).not.toBeChecked();
  await expect(
    queue(page).getByRole('checkbox', { name: '执行队列 2', exact: true }),
  ).not.toBeChecked();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  expect(await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind: 'Copilot' })).toEqual({
    ...original,
    options: { ...original.options, loopTimes: 1 },
    queue: original.queue.map((entry) => ({ ...entry, enabled: false })),
  });
  await page.reload();
  await enter(page);
  await expect(allQueue(page)).not.toBeChecked();
  await expect(allQueue(page)).toHaveJSProperty('indeterminate', false);
  await expect(
    queue(page).getByRole('checkbox', { name: '执行队列 1', exact: true }),
  ).not.toBeChecked();
  await expect(
    queue(page).getByRole('checkbox', { name: '执行队列 2', exact: true }),
  ).not.toBeChecked();

  await queue(page).getByRole('checkbox', { name: '执行队列 1', exact: true }).check();
  await expect(allQueue(page)).toHaveJSProperty('indeterminate', true);
  await allQueue(page).focus();
  await page.keyboard.press('Space');
  await expect(allQueue(page)).toBeChecked();
  await expect(
    queue(page).getByRole('checkbox', { name: '执行队列 2', exact: true }),
  ).toBeChecked();
  await allQueue(page).uncheck();
  await queue(page).getByRole('button', { name: '清除未勾选项', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(0);
  await expect(allQueue(page)).toBeDisabled();
  await expect(allQueue(page)).not.toBeChecked();
  await expect(allQueue(page)).toHaveJSProperty('indeterminate', false);
});

test('select-all state and saved choices remain independent across all three queue kinds', async ({
  page,
}) => {
  await page.goto('/');
  const normal = await seed(page, '独立普通全选');
  const sss = await seed(page, '独立保全全选', { type: 'SSS', stages: [] });
  const paradox = await seed(page, '独立悖论全选', { type: 'Paradox', stage_name: 'mem_amiya_1' });
  for (const record of [normal, sss, paradox]) {
    await saveQueue(page, record.kind, [
      {
        id: `selection-${record.kind}`,
        versionId: record.versionId,
        enabled: true,
        isRaid: false,
        navName: '',
      },
    ]);
  }
  await enter(page);
  await allQueue(page).uncheck();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  await queue(page).getByRole('tab', { name: '保全派驻', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-title strong')).toHaveText(['独立保全全选']);
  await expect(allQueue(page)).toBeChecked();
  await allQueue(page).uncheck();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  await queue(page).getByRole('tab', { name: '悖论模拟', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-title strong')).toHaveText(['独立悖论全选']);
  await expect(allQueue(page)).toBeChecked();
  for (const label of ['普通作业', '保全派驻']) {
    await queue(page).getByRole('tab', { name: label, exact: true }).click();
    await expect(allQueue(page)).not.toBeChecked();
    await expect(allQueue(page)).toHaveJSProperty('indeterminate', false);
  }
  expect(
    (await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind: 'Copilot' })).queue[0]
      .enabled,
  ).toBe(false);
  expect(
    (await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind: 'SSSCopilot' })).queue[0]
      .enabled,
  ).toBe(false);
  expect(
    (await call<CopilotWorkspace>(page, 'copilot.workspace.get', { kind: 'ParadoxCopilot' }))
      .queue[0].enabled,
  ).toBe(true);
});
