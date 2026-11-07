import type { CopilotQueueEntry, CopilotWorkspace, Event, Snapshot } from '@maaverge/contracts';
import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { importJson, openCenter, queue } from './fixtures/copilot-page';
import { navigate } from './fixtures/navigation';

type SelectionWindow = HarnessWindow & {
  publishSelection: (verdict: string, override?: Partial<CopilotQueueEntry>) => Promise<void>;
  heldSelectionSave: boolean;
  releaseSelectionSave: () => void;
};
async function prepare(page: Page) {
  await openCenter(page);
  await importJson(
    page,
    JSON.stringify({
      stage_name: 'main_01-07',
      minimum_required: 'v6.0.0',
      doc: { title: '结算选择合成作业' },
      difficulty: 3,
      opers: [],
      actions: [{ type: 'SpeedUp' }],
    }),
  );
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(2);
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  await page.evaluate(async () => {
    const target = window as unknown as SelectionWindow;
    const harness = target.runtimeHarness;
    const original = harness.call.bind(harness);
    const initial = (await original('app.snapshot', {})) as Snapshot;
    let eventId = Math.max(0, ...initial.events.map((event) => event.id)) + 1000;
    const events: Event[] = [];
    harness.call = async (method, params) => {
      const result = await original(method, params);
      if (method === 'app.snapshot') {
        const snapshot = result as Snapshot;
        return { ...snapshot, events: [...snapshot.events, ...events] };
      }
      return result;
    };
    target.publishSelection = async (verdict, override = {}) => {
      const workspace = (await original('copilot.workspace.get', {
        kind: 'Copilot',
      })) as CopilotWorkspace;
      const entry = { ...workspace.queue[0], ...override };
      // Emulate the backend's exact-occurrence persistence before its event.
      if (
        verdict === 'success' &&
        workspace.queue[0].id === entry.id &&
        workspace.queue[0].versionId === entry.versionId &&
        workspace.queue[0].isRaid === entry.isRaid &&
        workspace.queue[0].navName === entry.navName
      ) {
        workspace.queue[0].enabled = false;
        await original('copilot.workspace.save', { workspace });
      }
      events.push({
        id: ++eventId,
        type: 'run.copilot_result',
        message: '合成结算事件',
        createdAt: new Date().toISOString(),
        data: {
          runId: 'synthetic-selection-run',
          entryId: entry.id,
          verdict,
          workspaceSelection: { kind: 'Copilot', entry },
        },
      });
      harness.emitEvent('run.copilot_result');
    };
  });
}
async function saved(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as SelectionWindow).runtimeHarness.call('copilot.workspace.get', {
        kind: 'Copilot',
      }) as Promise<CopilotWorkspace>,
  );
}

test('only a confirmed matching occurrence is deselected and later reselection is retained', async ({
  page,
}) => {
  await prepare(page);
  for (const [verdict, override] of [
    ['unknown', {}],
    ['failure', {}],
    ['success', { id: 'different-occurrence' }],
    ['success', { versionId: '0'.repeat(64) }],
    ['success', { isRaid: true }],
    ['success', { navName: 'changed-stage' }],
  ] as const) {
    await page.evaluate(
      ({ verdict, override }) =>
        (window as unknown as SelectionWindow).publishSelection(verdict, override),
      { verdict, override },
    );
  }
  await expect(queue(page).getByLabel('执行队列 1', { exact: true })).toBeChecked();
  await expect(queue(page).getByLabel('执行队列 2', { exact: true })).toBeChecked();
  await page.evaluate(() => (window as unknown as SelectionWindow).publishSelection('success'));
  await expect(queue(page).getByLabel('执行队列 1', { exact: true })).not.toBeChecked();
  await expect(queue(page).getByLabel('执行队列 2', { exact: true })).toBeChecked();
  await expect
    .poll(async () => (await saved(page)).queue.map((entry) => entry.enabled))
    .toEqual([false, true]);
  await queue(page).getByLabel('执行队列 1', { exact: true }).check();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  await navigate(page, '主页');
  await navigate(page, '作业中心');
  await expect(queue(page).getByLabel('执行队列 1', { exact: true })).toBeChecked();
  expect((await saved(page)).queue.map((entry) => entry.enabled)).toEqual([true, true]);
});

test('victory merges with current edits and repairs an older save already in flight', async ({
  page,
}) => {
  await prepare(page);
  await page.evaluate(() => {
    const target = window as unknown as SelectionWindow;
    const harness = target.runtimeHarness;
    const original = harness.call.bind(harness);
    let hold = true;
    harness.call = async (method, params) => {
      if (method === 'copilot.workspace.save' && hold) {
        hold = false;
        target.heldSelectionSave = true;
        await new Promise<void>((resolve) => {
          target.releaseSelectionSave = resolve;
        });
      }
      return original(method, params);
    };
  });
  await queue(page).locator('.cp-settings > summary').click();
  await queue(page).getByLabel('自动编队', { exact: true }).check();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as SelectionWindow).heldSelectionSave))
    .toBe(true);
  await queue(page).getByLabel('忽略练度要求', { exact: true }).check();
  await page.evaluate(() => (window as unknown as SelectionWindow).publishSelection('success'));
  await expect(queue(page).getByLabel('执行队列 1', { exact: true })).not.toBeChecked();
  await expect(queue(page).getByLabel('执行队列 2', { exact: true })).toBeChecked();
  await expect(queue(page).getByLabel('忽略练度要求', { exact: true })).toBeChecked();
  await page.evaluate(() => (window as unknown as SelectionWindow).releaseSelectionSave());
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  await expect
    .poll(async () => {
      const workspace = await saved(page);
      return {
        enabled: workspace.queue.map((entry) => entry.enabled),
        formation: workspace.options.formation,
        ignoreRequirements: workspace.options.ignoreRequirements,
      };
    })
    .toEqual({ enabled: [false, true], formation: true, ignoreRequirements: true });
});

test('a result updates the cached workspace while another queue type is visible', async ({
  page,
}) => {
  await prepare(page);
  await queue(page).getByRole('tab', { name: '悖论模拟', exact: true }).click();
  await page.evaluate(() => (window as unknown as SelectionWindow).publishSelection('success'));
  await expect.poll(async () => (await saved(page)).queue[0].enabled).toBe(false);
  await queue(page).getByRole('tab', { name: '普通作业', exact: true }).click();
  await expect(queue(page).getByLabel('执行队列 1', { exact: true })).not.toBeChecked();
  await expect(queue(page).getByLabel('执行队列 2', { exact: true })).toBeChecked();
});

test('leaving the page keeps victory reconciliation ordered after pending workspace saves', async ({
  page,
}) => {
  await prepare(page);
  await page.evaluate(() => {
    const target = window as unknown as SelectionWindow;
    const harness = target.runtimeHarness;
    const original = harness.call.bind(harness);
    let hold = true;
    harness.call = async (method, params) => {
      if (method === 'copilot.workspace.save' && hold) {
        hold = false;
        target.heldSelectionSave = true;
        await new Promise<void>((resolve) => {
          target.releaseSelectionSave = resolve;
        });
      }
      return original(method, params);
    };
  });
  await queue(page).locator('.cp-settings > summary').click();
  await queue(page).getByLabel('自动编队', { exact: true }).check();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as SelectionWindow).heldSelectionSave))
    .toBe(true);
  await queue(page).getByLabel('忽略练度要求', { exact: true }).check();
  await navigate(page, '主页');
  await page.evaluate(() => (window as unknown as SelectionWindow).publishSelection('success'));
  // Wait for the app's snapshot refresh to consume the result while the page is absent.
  await page.evaluate(() => (window as unknown as SelectionWindow).releaseSelectionSave());
  await expect
    .poll(async () => {
      const workspace = await saved(page);
      return {
        enabled: workspace.queue.map((entry) => entry.enabled),
        formation: workspace.options.formation,
        ignoreRequirements: workspace.options.ignoreRequirements,
      };
    })
    .toEqual({ enabled: [false, true], formation: true, ignoreRequirements: true });
  await navigate(page, '作业中心');
  await expect(queue(page).getByLabel('执行队列 1', { exact: true })).not.toBeChecked();
  await expect(queue(page).getByLabel('执行队列 2', { exact: true })).toBeChecked();
  await queue(page).locator('.cp-settings > summary').click();
  await expect(queue(page).getByLabel('忽略练度要求', { exact: true })).toBeChecked();
});
