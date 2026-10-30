import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { expectHome, navigate } from './fixtures/navigation';

type SearchRequest = {
  target?: string;
  keyword?: string;
  stage?: string;
  page?: number;
  orderBy?: 'hot' | 'id' | 'views';
};
type SortingHarnessWindow = HarnessWindow & {
  sortingRequests: SearchRequest[];
  sortingFinished: string[];
  holdLatestSort: boolean;
  failNextSort: boolean;
  releaseSortSearch: () => void;
};

const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const sorting = (page: Page) => page.getByRole('group', { name: '社区作业排序', exact: true });
const choice = (page: Page, name: string) =>
  sorting(page).getByRole('button', { name, exact: true });
const requests = (page: Page) =>
  page.evaluate(() => (window as unknown as SortingHarnessWindow).sortingRequests);
const result = (page: Page, orderBy: string, pageNumber = 1) =>
  library(page).getByRole('button', {
    name: `查看详情 排序 ${orderBy} 第 ${pageNumber} 页`,
    exact: true,
  });

async function openCommunity(page: Page) {
  await page.goto('/');
  await expectHome(page);
  await page.evaluate(() => {
    const target = window as unknown as SortingHarnessWindow;
    target.sortingRequests = [];
    target.sortingFinished = [];
    target.holdLatestSort = false;
    target.failNextSort = false;
    const original = target.runtimeHarness.call.bind(target.runtimeHarness);
    target.runtimeHarness.call = async (method, params) => {
      if (method !== 'copilot.search') return original(method, params);
      target.sortingRequests.push(structuredClone(params));
      if (target.failNextSort) {
        target.failNextSort = false;
        throw new Error('合成排序刷新失败');
      }
      if (target.holdLatestSort && params.orderBy === 'id') {
        await new Promise<void>((resolve) => {
          target.releaseSortSearch = resolve;
        });
      }
      const value = (await original(method, params)) as { items: { title: string }[] };
      if (params.target === 'copilot') {
        value.items[0].title = `排序 ${params.orderBy} 第 ${params.page} 页`;
      }
      target.sortingFinished.push(`${params.target}:${params.orderBy}:${params.page}`);
      return value;
    };
  });
  await navigate(page, '作业中心');
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await expect(result(page, 'hot')).toBeVisible();
}

test('sorts use separate cached pages and preserve filters and navigation state', async ({
  page,
}) => {
  await openCommunity(page);
  await expect(choice(page, '热度')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(page, '最新')).toHaveAttribute('aria-pressed', 'false');
  await expect(choice(page, '访问量')).toHaveAttribute('aria-pressed', 'false');
  expect((await requests(page))[0]).toMatchObject({ target: 'copilot', orderBy: 'hot', page: 1 });

  await library(page).getByLabel('社区搜索关键词', { exact: true }).fill('低配');
  await library(page).getByRole('combobox', { name: '社区关卡筛选', exact: true }).fill('R8-11');
  await expect
    .poll(async () => (await requests(page)).at(-1))
    .toMatchObject({ keyword: '低配', stage: 'R8-11', orderBy: 'hot', page: 1 });
  await library(page).getByRole('button', { name: '下一页', exact: true }).click();
  await expect(result(page, 'hot', 2)).toBeVisible();

  await choice(page, '最新').click();
  await expect(result(page, 'id')).toBeVisible();
  await expect(library(page).getByRole('button', { name: '上一页', exact: true })).toBeDisabled();
  expect((await requests(page)).at(-1)).toMatchObject({
    keyword: '低配',
    stage: 'R8-11',
    orderBy: 'id',
    page: 1,
  });
  await library(page).getByRole('button', { name: '下一页', exact: true }).click();
  await expect(result(page, 'id', 2)).toBeVisible();

  await choice(page, '访问量').click();
  await expect(result(page, 'views')).toBeVisible();
  await expect(choice(page, '访问量')).toHaveAttribute('aria-pressed', 'true');
  expect((await requests(page)).at(-1)).toMatchObject({
    keyword: '低配',
    stage: 'R8-11',
    orderBy: 'views',
    page: 1,
  });

  const beforeCacheReads = await requests(page);
  await choice(page, '热度').click();
  await expect(result(page, 'hot')).toBeVisible();
  await library(page).getByRole('button', { name: '下一页', exact: true }).click();
  await expect(result(page, 'hot', 2)).toBeVisible();
  await navigate(page, '主页');
  await navigate(page, '作业中心');
  await expect(result(page, 'hot', 2)).toBeVisible();
  await expect(choice(page, '热度')).toHaveAttribute('aria-pressed', 'true');
  await expect(library(page).getByLabel('社区搜索关键词', { exact: true })).toHaveValue('低配');
  await expect(
    library(page).getByRole('combobox', { name: '社区关卡筛选', exact: true }),
  ).toHaveValue('R8-11');
  expect(await requests(page)).toEqual(beforeCacheReads);
});

test('an older sort response cannot replace the newly selected sort', async ({ page }) => {
  await openCommunity(page);
  await page.evaluate(() => {
    (window as unknown as SortingHarnessWindow).holdLatestSort = true;
  });
  await choice(page, '最新').click();
  await expect.poll(async () => (await requests(page)).at(-1)).toMatchObject({ orderBy: 'id' });
  await choice(page, '访问量').click();
  await expect(result(page, 'views')).toBeVisible();
  await page.evaluate(() => (window as unknown as SortingHarnessWindow).releaseSortSearch());
  await expect
    .poll(() => page.evaluate(() => (window as unknown as SortingHarnessWindow).sortingFinished))
    .toContain('copilot:id:1');
  await expect(result(page, 'views')).toBeVisible();
  await expect(choice(page, '访问量')).toHaveAttribute('aria-pressed', 'true');
  await choice(page, '最新').click();
  await expect(result(page, 'id')).toBeVisible();
  expect((await requests(page)).filter((value) => value.orderBy === 'id')).toHaveLength(1);
});

test('refresh retries the selected sort while preserving its cached results', async ({ page }) => {
  await openCommunity(page);
  await choice(page, '访问量').click();
  await expect(result(page, 'views')).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as SortingHarnessWindow).failNextSort = true;
  });
  await library(page).getByRole('button', { name: '刷新社区搜索', exact: true }).click();
  await expect(library(page).getByRole('alert')).toContainText('合成排序刷新失败');
  await expect(result(page, 'views')).toBeVisible();
  await expect(choice(page, '访问量')).toHaveAttribute('aria-pressed', 'true');
  await library(page).getByRole('button', { name: '刷新社区搜索', exact: true }).click();
  await expect(library(page).getByRole('alert')).toHaveCount(0);
  await expect(library(page).locator('.cp-community-results')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(result(page, 'views')).toBeVisible();
  expect((await requests(page)).filter((value) => value.orderBy === 'views')).toHaveLength(3);
});

test('set browsing omits sorting and restores the chosen operation sort', async ({ page }) => {
  await openCommunity(page);
  await choice(page, '最新').focus();
  await page.keyboard.press('Enter');
  await expect(result(page, 'id')).toBeVisible();
  await library(page).getByRole('tab', { name: '社区作业集', exact: true }).click();
  await expect(
    library(page).getByRole('button', { name: '查看详情 合成有序作业集', exact: true }),
  ).toBeVisible();
  await expect(sorting(page)).toHaveCount(0);
  expect((await requests(page)).at(-1)).toMatchObject({ target: 'set', page: 1 });
  expect((await requests(page)).at(-1)).not.toHaveProperty('orderBy');
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await expect(choice(page, '最新')).toHaveAttribute('aria-pressed', 'true');
  await expect(result(page, 'id')).toBeVisible();
  expect((await requests(page)).filter((value) => value.orderBy === 'id')).toHaveLength(1);
});
