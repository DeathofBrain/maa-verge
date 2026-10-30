import type { Page } from '@playwright/test';
import type { CopilotPreview } from '../../packages/contracts/src/index';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const queue = (page: Page) => page.getByRole('region', { name: '作业执行队列', exact: true });
const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const detail = (page: Page) => page.getByRole('complementary', { name: '作业详情', exact: true });
async function openCenter(page: Page) {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
}

test('source and queue tabs support keyboard navigation with independent panels', async ({
  page,
}) => {
  await openCenter(page);
  const sources = library(page).getByRole('tablist', { name: '作业来源', exact: true });
  await sources.getByRole('tab', { name: /^本地作业/ }).focus();
  await page.keyboard.press('End');
  await expect(sources.getByRole('tab', { name: '社区作业集', exact: true })).toBeFocused();
  await expect(
    library(page).getByRole('tabpanel', { name: '社区作业集', exact: true }),
  ).toBeVisible();

  const types = queue(page).getByRole('tablist', { name: '队列类型', exact: true });
  await types.getByRole('tab', { name: '普通作业', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(types.getByRole('tab', { name: '保全派驻', exact: true })).toBeFocused();
  await expect(queue(page).getByRole('tabpanel', { name: '保全派驻', exact: true })).toBeVisible();
  await expect(sources.getByRole('tab', { name: '社区作业集', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.keyboard.press('Home');
  await expect(types.getByRole('tab', { name: '普通作业', exact: true })).toBeFocused();
  await expect(queue(page).getByRole('tabpanel', { name: '普通作业', exact: true })).toBeVisible();
});

test('queue types preserve community search and the side drawer returns to its original result', async ({
  page,
}) => {
  await openCenter(page);
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (['copilot.search', 'copilot.list'].includes(method)) harness.commands.push(method);
      return original(method, params);
    };
  });
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await library(page).getByLabel('社区搜索关键词').fill('低配');
  await library(page).getByLabel('社区关卡筛选').fill('1-7');
  await library(page).getByRole('button', { name: '下一页', exact: true }).click();
  const work = library(page).getByRole('button', { name: '查看详情 合成社区作业 2', exact: true });
  await expect(work).toBeVisible();
  const reads = await page.evaluate(
    () => (window as unknown as HarnessWindow).runtimeHarness.commands,
  );
  await queue(page).getByRole('tab', { name: '保全派驻', exact: true }).click();
  await expect(work).toBeVisible();
  await expect(library(page).getByLabel('社区关卡筛选')).toHaveValue('1-7');
  await expect(library(page).getByLabel('社区搜索关键词')).toHaveValue('低配');
  await queue(page).getByRole('tab', { name: '悖论模拟', exact: true }).click();
  await work.click();
  await expect(detail(page)).toBeVisible();
  await expect(
    detail(page).getByRole('heading', { name: '合成社区作业 201', exact: true }),
  ).toBeVisible();
  await expect(
    detail(page).getByRole('button', { name: '导入并加入当前队列', exact: true }),
  ).toBeDisabled();
  await detail(page).getByRole('button', { name: '切换到普通作业队列', exact: true }).click();
  await expect(
    detail(page).getByRole('button', { name: '导入并加入当前队列', exact: true }),
  ).toBeEnabled();
  await detail(page)
    .getByRole('navigation', { name: '作业站导航', exact: true })
    .getByRole('button', { name: '返回作业列表', exact: true })
    .click();
  await expect(work).toBeVisible();
  await expect(work).toBeFocused();
  expect(
    await page.evaluate(() => (window as unknown as HarnessWindow).runtimeHarness.commands),
  ).toEqual(reads);
  await expect(queue(page).getByRole('tab', { name: '普通作业', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

type LinkWindow = HarnessWindow & {
  __TAURI_INTERNALS__: {
    invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
  openedLinks: string[];
  failExternal: boolean;
};
test('reference videos open through the desktop bridge and report failures without navigating the app', async ({
  page,
}) => {
  await openCenter(page);
  await page.evaluate(() => {
    const target = window as unknown as LinkWindow;
    target.openedLinks = [];
    target.failExternal = false;
    const originalInvoke = target.__TAURI_INTERNALS__.invoke.bind(target.__TAURI_INTERNALS__);
    target.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'open_external_url') {
        target.openedLinks.push(String(args?.url));
        if (target.failExternal) throw new Error('合成浏览器打开失败');
        return;
      }
      return originalInvoke(command, args);
    };
    const harness = target.runtimeHarness,
      original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      const result = await original(method, params);
      if (method === 'copilot.preview')
        for (const entry of (result as CopilotPreview).entries)
          if (entry.record) {
            entry.record.videos = [
              'https://www.bilibili.com/video/BVsynthetic/?p=2',
              'javascript:alert(1)',
              'https://user:pass@example.test/',
            ];
          }
      return result;
    };
  });
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true }).click();
  const url = page.url();
  await detail(page).getByRole('link', { name: '参考视频1', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as LinkWindow).openedLinks))
    .toEqual(['https://www.bilibili.com/video/BVsynthetic/?p=2']);
  await expect(detail(page).getByRole('link', { name: /参考视频[23]/ })).toHaveCount(0);
  expect(page.url()).toBe(url);
  await page.evaluate(() => {
    (window as unknown as LinkWindow).failExternal = true;
  });
  await detail(page).getByRole('link', { name: '查看原站', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('合成浏览器打开失败');
  await expect(detail(page)).toBeVisible();
  expect(page.url()).toBe(url);
});

test('the side drawer preserves scroll, query and keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 850 });
  await openCenter(page);
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await library(page).getByLabel('社区搜索关键词').fill('保留搜索');
  await library(page).getByRole('button', { name: '下一页', exact: true }).click();
  const trigger = library(page).getByRole('button', {
    name: '查看详情 合成社区作业 2',
    exact: true,
  });
  await trigger.scrollIntoViewIfNeeded();
  const scroll = await page.locator('.copilot-page').evaluate((value) => value.scrollTop);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '作业详情弹窗', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.cp-browser')).toBeVisible();
  expect(await page.locator('#root').evaluate((value) => (value as HTMLElement).inert)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((value) => value.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(library(page).getByLabel('社区搜索关键词')).toHaveValue('保留搜索');
  expect(await page.locator('.copilot-page').evaluate((value) => value.scrollTop)).toBe(scroll);
  await trigger.click();
  await page
    .getByRole('button', { name: '关闭作业详情', exact: true })
    .click({ position: { x: 10, y: 20 } });
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('the top result monitor switches devices and records independently from the queue target', async ({
  page,
}) => {
  await page.goto('/');
  const seeded = await page.evaluate(async () => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const second = (await harness.call('device.connect', {
      address: '127.0.0.1:15555',
      name: '第二合成设备',
    })) as { id: string };
    const empty = (await harness.call('device.connect', {
      address: '127.0.0.1:15556',
      name: '没有作业的设备',
    })) as { id: string };
    const preview = (await harness.call('copilot.preview', {
      content: JSON.stringify({
        stage_name: 'main_01-07',
        doc: { title: '多设备执行查看' },
        actions: [],
      }),
    })) as CopilotPreview;
    const records = (await harness.call('copilot.import', { previewId: preview.id })) as {
      items: { versionId: string }[];
    };
    const workspace = (await harness.call('copilot.workspace.get', { kind: 'Copilot' })) as {
      queue: unknown[];
    };
    await harness.call('copilot.workspace.save', {
      workspace: {
        ...workspace,
        queue: [
          {
            id: 'monitor-entry',
            versionId: records.items[0].versionId,
            enabled: true,
            isRaid: false,
            navName: '',
          },
        ],
      },
    });
    const firstRun = (await harness.call('copilot.start', {
      kind: 'Copilot',
      deviceId: 'mock-device-1',
      requestId: 'monitor-first',
    })) as { id: string };
    const secondRun = (await harness.call('copilot.start', {
      kind: 'Copilot',
      deviceId: second.id,
      requestId: 'monitor-second',
    })) as { id: string };
    return { second, empty, firstRun, secondRun };
  });
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  const monitor = page.getByRole('region', { name: '作业运行状态', exact: true });
  await expect(monitor).toBeVisible();
  const target = await queue(page).getByLabel('作业目标设备', { exact: true }).inputValue();
  await monitor.getByLabel('查看作业设备', { exact: true }).selectOption(seeded.second.id);
  await expect(monitor).toContainText('第二合成设备');
  await monitor.getByLabel('查看作业记录', { exact: true }).selectOption(seeded.secondRun.id);
  await expect(queue(page).getByLabel('作业目标设备', { exact: true })).toHaveValue(target);
  await monitor.getByLabel('查看作业设备', { exact: true }).selectOption(seeded.empty.id);
  await expect(monitor).toContainText('此设备还没有作业执行记录');
  await expect(monitor.locator('.cp-run-summary')).toHaveCount(0);
  await monitor.getByLabel('查看作业设备', { exact: true }).selectOption('mock-device-1');
  await expect(
    monitor
      .getByLabel('查看作业记录', { exact: true })
      .locator('option', { hasText: '多设备执行查看' }),
  ).toHaveCount(1);
  await expect(queue(page).getByLabel('作业目标设备', { exact: true })).toHaveValue(target);
});
