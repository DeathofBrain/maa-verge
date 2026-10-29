import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const detail = (page: Page) => page.getByRole('complementary', { name: '作业详情', exact: true });
const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const queue = (page: Page) => page.getByRole('region', { name: '作业执行队列', exact: true });
async function openCenter(page: Page) {
  await page.goto('/');
  const menu = page.getByRole('button', { name: '打开导航', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
}
async function communityDetail(page: Page) {
  await page.getByRole('tab', { name: '社区搜索', exact: true }).click();
  await library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true }).click();
  await expect(detail(page)).toBeVisible();
}

test('community works open full details with portraits and grouped requirements before importing', async ({
  page,
}) => {
  await openCenter(page);
  await communityDetail(page);
  await expect(page.locator('.cp-browser')).toBeVisible();
  await expect(page.getByRole('dialog', { name: '作业详情弹窗', exact: true })).toBeVisible();
  expect(await page.locator('#root').evaluate((value) => (value as HTMLElement).inert)).toBe(true);
  await expect(
    detail(page).getByRole('heading', { name: '合成社区作业 101', exact: true }),
  ).toBeFocused();
  await detail(page)
    .locator('.operator-badge')
    .filter({ hasText: '阿米娅' })
    .scrollIntoViewIfNeeded();
  await expect(detail(page).getByRole('img', { name: '阿米娅头像', exact: true })).toBeVisible();
  await detail(page)
    .locator('.operator-badge')
    .filter({ hasText: '能天使' })
    .scrollIntoViewIfNeeded();
  await expect(detail(page).getByRole('img', { name: '能天使头像', exact: true })).toBeVisible();
  await expect(detail(page).locator('.cp-operator-grid').first()).toContainText('精二 · 等级 80');
  await expect(detail(page).locator('.cp-operator-groups')).toContainText('输出备选组内任选一位');
  await expect(detail(page).getByRole('button', { name: '加入执行队列', exact: true })).toHaveCount(
    0,
  );
  const count = await page.evaluate(async () => {
    const result = (await (window as unknown as HarnessWindow).runtimeHarness.call(
      'copilot.list',
      {},
    )) as { total: number };
    return result.total;
  });
  expect(count).toBe(0);
  await detail(page).getByRole('button', { name: '返回作业列表', exact: true }).click();
  await expect(library(page)).toBeVisible();
  await expect(
    library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true }),
  ).toBeFocused();
  await expect(library(page).getByLabel('社区搜索关键词')).toHaveValue('');
});

test('community ratings submit only explicit gestures and a failed write preserves the previous vote', async ({
  page,
}) => {
  await openCenter(page);
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (method === 'copilot.rating.set') {
        harness.commands.push(`rating:${params.rating}`);
        if (
          harness.commands.filter((command) => command === 'rating:dislike').length === 1 &&
          params.rating === 'dislike'
        )
          throw new Error('合成评价提交失败');
      }
      return original(method, params);
    };
  });
  await communityDetail(page);
  const like = detail(page).getByRole('button', { name: '点赞作业', exact: true });
  const dislike = detail(page).getByRole('button', { name: '点踩作业', exact: true });
  await expect(like).toBeEnabled();
  expect(
    await page.evaluate(() => (window as unknown as HarnessWindow).runtimeHarness.commands),
  ).toEqual([]);
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toContainText('13');
  await dislike.click();
  await expect(detail(page).getByRole('alert')).toContainText('合成评价提交失败');
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(dislike).toHaveAttribute('aria-pressed', 'false');
  await dislike.click();
  await expect(dislike).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await dislike.click();
  await expect(dislike).toHaveAttribute('aria-pressed', 'false');
  expect(
    await page.evaluate(() => (window as unknown as HarnessWindow).runtimeHarness.commands),
  ).toEqual(['rating:like', 'rating:dislike', 'rating:dislike', 'rating:none']);
});

test('automatic liking defaults off and persists separately for each kind without posting a vote', async ({
  page,
}) => {
  await openCenter(page);
  await queue(page).locator('.cp-settings > summary').click();
  const checkbox = queue(page).getByLabel('通关成功后自动点赞', { exact: true });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
  await page.getByRole('tab', { name: '保全派驻', exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await page.getByRole('tab', { name: '普通作业', exact: true }).click();
  await expect(checkbox).toBeChecked();
  await page.reload();
  const menu = page.getByRole('button', { name: '打开导航', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  await queue(page).locator('.cp-settings > summary').click();
  await expect(checkbox).toBeChecked();
});

test('returning to search discards an older detail request', async ({ page }) => {
  await openCenter(page);
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (method === 'copilot.preview')
        await new Promise<void>((resolve) => {
          (window as unknown as { releasePreview: () => void }).releasePreview = resolve;
        });
      const result = await original(method, params);
      if (method === 'copilot.preview') harness.commands.push('preview-finished');
      return result;
    };
  });
  await page.getByRole('tab', { name: '社区搜索', exact: true }).click();
  await library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true }).click();
  await expect(page.getByText('正在读取作业…', { exact: true })).toBeVisible();
  await queue(page).getByRole('button', { name: '去社区找作业', exact: true }).click();
  await page.evaluate(() => (window as unknown as { releasePreview: () => void }).releasePreview());
  await expect
    .poll(() => page.evaluate(() => (window as unknown as HarnessWindow).runtimeHarness.commands))
    .toContain('preview-finished');
  await expect(detail(page)).toHaveCount(0);
  await expect(library(page)).toBeVisible();
});

test('a run refresh does not swallow a pending manual rating failure', async ({ page }) => {
  await openCenter(page);
  await communityDetail(page);
  await detail(page).getByRole('button', { name: '导入到作业库', exact: true }).click();
  await detail(page).getByRole('button', { name: '加入执行队列', exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (
            (await (window as unknown as HarnessWindow).runtimeHarness.call(
              'copilot.workspace.get',
              { kind: 'Copilot' },
            )) as { queue: unknown[] }
          ).queue.length,
      ),
    )
    .toBe(1);
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (method === 'copilot.rating.set') {
        harness.commands.push('rating-pending');
        return new Promise((_resolve, reject) => {
          (window as unknown as { rejectRating: () => void }).rejectRating = () =>
            reject(new Error('运行刷新期间评价失败'));
        });
      }
      return original(method, params);
    };
  });
  const like = detail(page).getByRole('button', { name: '点赞作业', exact: true });
  await expect(like).toBeEnabled();
  await like.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as HarnessWindow).runtimeHarness.commands))
    .toContain('rating-pending');
  await page.evaluate(() =>
    (window as unknown as HarnessWindow).runtimeHarness.call('copilot.start', {
      kind: 'Copilot',
      deviceId: 'mock-device-1',
      requestId: 'drawer-rating-refresh',
    }),
  );
  await page.evaluate(() => (window as unknown as { rejectRating: () => void }).rejectRating());
  await expect(detail(page).getByRole('alert')).toContainText('运行刷新期间评价失败');
  await expect(like).toBeEnabled();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
});

test('set members return to the same preview selection and never require importing to inspect operators', async ({
  page,
}) => {
  await openCenter(page);
  await page.getByRole('tab', { name: '社区搜索', exact: true }).click();
  await library(page).getByRole('tab', { name: '社区作业集', exact: true }).click();
  await library(page).getByRole('button', { name: '查看详情 合成有序作业集', exact: true }).click();
  const preview = page.getByRole('region', { name: '导入预览', exact: true });
  await preview.getByLabel('选择导入 2', { exact: true }).uncheck();
  await preview.getByRole('button', { name: '查看干员与作业详情', exact: true }).first().click();
  await detail(page)
    .locator('.operator-badge')
    .filter({ hasText: '阿米娅' })
    .scrollIntoViewIfNeeded();
  await expect(detail(page).getByRole('img', { name: '阿米娅头像', exact: true })).toBeVisible();
  await detail(page).getByRole('button', { name: '返回导入预览', exact: true }).click();
  await expect(preview.getByLabel('选择导入 1', { exact: true })).toBeChecked();
  await expect(
    preview.getByRole('button', { name: '查看干员与作业详情', exact: true }).first(),
  ).toBeFocused();
  await expect(preview.getByLabel('选择导入 2', { exact: true })).not.toBeChecked();
  await expect(preview.getByLabel('选择导入 3', { exact: true })).toBeDisabled();
});

test('sets have a direct entry, allow selecting members, and retain a path back from imported work', async ({
  page,
}) => {
  await openCenter(page);
  await library(page).getByRole('tab', { name: '社区作业集', exact: true }).click();
  await library(page).getByRole('button', { name: '查看详情 合成有序作业集', exact: true }).click();
  const preview = page.getByRole('region', { name: '导入预览', exact: true });
  await expect(preview).toContainText('按作业集原顺序排列');
  await preview.getByRole('checkbox', { name: '全选可用作业', exact: true }).uncheck();
  await expect(
    preview.getByRole('button', { name: '所选导入并加入队列', exact: true }),
  ).toBeDisabled();
  await preview.getByLabel('选择导入 2', { exact: true }).check();
  await preview.getByRole('button', { name: '所选导入并加入队列', exact: true }).click();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
  await expect(queue(page).locator('.cp-queue-title')).toContainText('合成社区作业 102');
  await expect(library(page)).toContainText('作业集 #12');
  await library(page).locator('.cp-record-main').click();
  await detail(page).getByRole('button', { name: '查看所属作业集 #12', exact: true }).click();
  await preview.getByRole('checkbox', { name: '全选可用作业', exact: true }).check();
  await expect(preview.getByLabel('选择导入 1', { exact: true })).toBeChecked();
  await expect(preview.getByLabel('选择导入 2', { exact: true })).toBeChecked();
  await expect(preview.getByLabel('选择导入 3', { exact: true })).toBeDisabled();
  await expect(queue(page).locator('.cp-queue-list > li')).toHaveCount(1);
});

test('a single queued work uses map navigation while an explicit loop explains its formation starting point', async ({
  page,
}) => {
  await openCenter(page);
  await communityDetail(page);
  await detail(page).getByRole('button', { name: '导入并加入当前队列', exact: true }).click();
  await expect(queue(page).locator('.cp-start-hint')).toContainText('无需先进入干员选择页');
  await queue(page).getByLabel('导航关卡 1', { exact: true }).fill('1-7');
  await queue(page).locator('.cp-settings > summary').click();
  await queue(page).getByLabel('作业循环次数', { exact: true }).fill('2');
  await expect(queue(page).getByLabel('导航关卡 1', { exact: true })).toHaveCount(0);
  await expect(queue(page).locator('.cp-start-hint')).toContainText('单份循环');
  await expect(queue(page).locator('.cp-start-hint')).toContainText('编队界面');
  await queue(page).getByLabel('作业循环次数', { exact: true }).fill('1');
  await expect(queue(page).getByLabel('导航关卡 1', { exact: true })).toHaveValue('1-7');
  await expect(queue(page).locator('.cp-start-hint')).toContainText('队列会自动导航');
});

test('the workspace keeps its two areas beneath a side drawer at desktop and narrow widths', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1360, height: 900 });
  await openCenter(page);
  await expect(library(page)).toBeVisible();
  await expect(queue(page).getByRole('tablist', { name: '队列类型', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('copilot-empty-desktop.png') });
  await communityDetail(page);
  for (const viewport of [
    { width: 1360, height: 900 },
    { width: 1050, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      await expect(detail(page)).toBeVisible();
      await expect(page.locator('.cp-browser')).toBeVisible();
      await expect(page.getByRole('dialog', { name: '作业详情弹窗', exact: true })).toBeVisible();
      await page.locator('.copilot-page').evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.screenshot({
        path: testInfo.outputPath(`copilot-detail-${viewport.width}-${theme}.png`),
      });
      await detail(page)
        .locator('.cp-requirements')
        .screenshot({
          path: testInfo.outputPath(`copilot-operators-${viewport.width}-${theme}.png`),
        });
    }
  }
});
