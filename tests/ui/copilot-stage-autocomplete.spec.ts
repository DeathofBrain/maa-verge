import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

type SearchRequest = { target?: string; stage?: string; page?: number };
type StageHarnessWindow = HarnessWindow & {
  stageSearchRequests: SearchRequest[];
  stageCatalogReads: number;
  failStageCatalog: boolean;
  releaseStageCatalog: () => void;
};

const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const input = (page: Page) => page.getByRole('combobox', { name: '社区关卡筛选', exact: true });
const candidates = (page: Page) => page.getByRole('listbox', { name: '关卡候选', exact: true });
const requests = (page: Page) =>
  page.evaluate(() => (window as unknown as StageHarnessWindow).stageSearchRequests);

async function openCommunity(page: Page, catalogMode?: 'failure' | 'pending') {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate((catalogMode) => {
    const target = window as unknown as StageHarnessWindow;
    target.stageSearchRequests = [];
    target.stageCatalogReads = 0;
    target.failStageCatalog = catalogMode === 'failure';
    let holdCatalog = catalogMode === 'pending';
    const waiting: (() => void)[] = [];
    target.releaseStageCatalog = () => {
      holdCatalog = false;
      waiting.splice(0).forEach((resolve) => resolve());
    };
    const harness = target.runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (method === 'copilot.search') target.stageSearchRequests.push(structuredClone(params));
      if (method === 'copilot.stages') {
        target.stageCatalogReads++;
        if (target.failStageCatalog) throw new Error('合成关卡目录读取失败');
        if (holdCatalog) await new Promise<void>((resolve) => waiting.push(resolve));
      }
      return original(method, params);
    };
  }, catalogMode);
  const menu = page.getByRole('button', { name: '打开导航', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await expect(
    library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true }),
  ).toBeVisible();
}

test('stage prefixes suggest resource codes and mouse selection sends their canonical spelling', async ({
  page,
}) => {
  await openCommunity(page);
  await input(page).fill('1-');
  await expect(candidates(page).getByRole('option')).toHaveText([
    '1-1 · 君临',
    '1-7 · 暴君',
    '1-12 · 代价',
  ]);
  await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
  await candidates(page).getByRole('option', { name: '1-7 · 暴君', exact: true }).click();
  await expect(input(page)).toHaveValue('1-7');
  await expect(candidates(page)).toHaveCount(0);
  await expect
    .poll(async () => (await requests(page)).at(-1))
    .toMatchObject({ target: 'copilot', stage: '1-7', page: 1 });

  await page.clock.install();
  const committedRequests = await requests(page);
  await input(page).fill('r8');
  await expect(input(page)).toHaveValue('r8');
  await expect(candidates(page).getByRole('option')).toHaveText(['R8-11 · 渴求']);
  await page.clock.runFor(500);
  expect(await requests(page)).toEqual(committedRequests);
  await expect(
    library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true }),
  ).toBeVisible();
  await candidates(page).getByRole('option', { name: 'R8-11 · 渴求', exact: true }).click();
  await page.clock.runFor(500);
  await expect(input(page)).toHaveValue('R8-11');
  await expect
    .poll(async () => (await requests(page)).at(-1))
    .toMatchObject({ stage: 'R8-11', page: 1 });
});

test('keyboard selection, dismissal and unmatched input preserve the typed stage', async ({
  page,
}) => {
  await openCommunity(page);
  await input(page).fill('pr-a');
  await expect(input(page)).toHaveValue('pr-a');
  await expect(candidates(page).getByRole('option')).toHaveCount(2);
  await input(page).press('ArrowDown');
  const firstActive = await input(page).getAttribute('aria-activedescendant');
  expect(firstActive).toBeTruthy();
  await expect(candidates(page).getByRole('option', { selected: true })).toHaveCount(1);
  await input(page).press('ArrowDown');
  const secondActive = await input(page).getAttribute('aria-activedescendant');
  expect(secondActive).toBeTruthy();
  expect(secondActive).not.toBe(firstActive);
  await input(page).press('ArrowUp');
  await expect(input(page)).toHaveAttribute('aria-activedescendant', firstActive!);
  const selectedText = await candidates(page).getByRole('option', { selected: true }).innerText();
  const selectedCode = selectedText.match(/PR-A-[12]/u)![0];
  await input(page).press('Enter');
  await expect(input(page)).toHaveValue(selectedCode);
  await expect(candidates(page)).toHaveCount(0);
  await expect
    .poll(async () => (await requests(page)).at(-1))
    .toMatchObject({ stage: selectedCode });

  await input(page).fill('pr-a');
  await expect(candidates(page)).toBeVisible();
  await input(page).press('Escape');
  await expect(input(page)).toHaveValue('pr-a');
  await expect(input(page)).toBeFocused();
  await expect(candidates(page)).toHaveCount(0);
  await input(page).press('ArrowDown');
  await expect(candidates(page)).toBeVisible();
  await library(page).getByLabel('社区搜索关键词', { exact: true }).click();
  await expect(candidates(page)).toHaveCount(0);
  await expect(input(page)).toHaveValue('pr-a');

  await input(page).fill('future-99');
  await expect(input(page)).toHaveValue('future-99');
  await expect(candidates(page).getByRole('option')).toHaveCount(0);
  await input(page).press('Tab');
  await expect(input(page)).toHaveValue('future-99');
  await expect
    .poll(async () => (await requests(page)).at(-1))
    .toMatchObject({ stage: 'future-99' });
});

test('choosing or clearing a stage resets pagination and set browsing retains the filter', async ({
  page,
}) => {
  await openCommunity(page);
  await input(page).fill('r8-11');
  await expect(input(page)).toHaveValue('r8-11');
  await expect
    .poll(async () => (await requests(page)).at(-1))
    .toMatchObject({ stage: 'R8-11', page: 1 });
  await library(page).getByRole('button', { name: '下一页', exact: true }).click();
  await expect(
    library(page).getByRole('button', { name: '查看详情 合成社区作业 2', exact: true }),
  ).toBeVisible();
  await page.clock.install();
  const pageTwoRequests = await requests(page);
  await input(page).click();
  await library(page).getByLabel('社区搜索关键词', { exact: true }).click();
  await page.clock.runFor(500);
  expect(await requests(page)).toEqual(pageTwoRequests);
  await expect(
    library(page).getByRole('button', { name: '查看详情 合成社区作业 2', exact: true }),
  ).toBeVisible();
  await input(page).click();
  await candidates(page).getByRole('option', { name: 'R8-11 · 渴求', exact: true }).click();
  await expect(
    library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true }),
  ).toBeVisible();
  await expect(library(page).getByRole('button', { name: '上一页', exact: true })).toBeDisabled();

  await library(page).getByRole('tab', { name: '社区作业集', exact: true }).click();
  await page.clock.runFor(500);
  await expect(input(page)).toHaveCount(0);
  await expect(
    library(page).getByRole('button', { name: '查看详情 合成有序作业集', exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await requests(page)).at(-1)).toMatchObject({ target: 'set' });
  expect((await requests(page)).at(-1)).not.toHaveProperty('stage');
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await expect(input(page)).toHaveValue('R8-11');
  await library(page).getByRole('button', { name: '下一页', exact: true }).click();
  await expect(
    library(page).getByRole('button', { name: '查看详情 合成社区作业 2', exact: true }),
  ).toBeVisible();
  await input(page).fill('');
  await page.clock.runFor(500);
  await expect(
    library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true }),
  ).toBeVisible();
  await expect(library(page).getByRole('button', { name: '上一页', exact: true })).toBeDisabled();
  await expect(input(page)).toHaveValue('');
});

test('a failed stage catalog allows manual filtering and retries when the input regains focus', async ({
  page,
}) => {
  await openCommunity(page, 'failure');
  await input(page).fill('future-99');
  await expect(page.getByText('关卡目录暂不可用，可继续手动输入', { exact: true })).toBeVisible();
  await library(page).getByLabel('社区搜索关键词', { exact: true }).click();
  await expect
    .poll(async () => (await requests(page)).at(-1))
    .toMatchObject({ stage: 'future-99' });
  await expect(input(page)).toHaveValue('future-99');
  const previousReads = await page.evaluate(() => {
    const target = window as unknown as StageHarnessWindow;
    target.failStageCatalog = false;
    return target.stageCatalogReads;
  });
  await input(page).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as StageHarnessWindow).stageCatalogReads))
    .toBeGreaterThan(previousReads);
  await input(page).fill('r8');
  await expect(candidates(page).getByRole('option')).toHaveText(['R8-11 · 渴求']);
  await expect(input(page)).toHaveValue('r8');
});

test('a pending stage catalog does not submit an unfinished prefix on blur', async ({ page }) => {
  await openCommunity(page, 'pending');
  await page.clock.install();
  const committedRequests = await requests(page);
  await input(page).fill('r8');
  await expect(page.getByText('正在读取关卡…', { exact: true })).toBeVisible();
  await library(page).getByLabel('社区搜索关键词', { exact: true }).click();
  await page.clock.runFor(500);
  expect(await requests(page)).toEqual(committedRequests);
  await expect(input(page)).toHaveValue('r8');
  await page.evaluate(() => (window as unknown as StageHarnessWindow).releaseStageCatalog());
  await input(page).click();
  await expect(candidates(page).getByRole('option')).toHaveText(['R8-11 · 渴求']);
  expect(await requests(page)).toEqual(committedRequests);
});

test('stage suggestions fit desktop and narrow windows in light and dark themes', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCommunity(page);
  for (const scene of [
    { name: 'desktop-light', width: 1440, height: 900, colorScheme: 'light' },
    { name: 'desktop-dark', width: 1280, height: 800, colorScheme: 'dark' },
    { name: 'narrow-light', width: 390, height: 844, colorScheme: 'light' },
    { name: 'narrow-dark', width: 390, height: 844, colorScheme: 'dark' },
  ] as const) {
    await page.setViewportSize({ width: scene.width, height: scene.height });
    await page.emulateMedia({ colorScheme: scene.colorScheme });
    await input(page).fill('1-');
    await expect(candidates(page).getByRole('option')).toHaveCount(3);
    await input(page).scrollIntoViewIfNeeded();
    await expect(candidates(page)).toBeVisible();
    await expect
      .poll(async () => {
        const anchor = await input(page).boundingBox();
        const popup = await page.locator('.cp-stage-candidates').boundingBox();
        return (
          !!anchor &&
          !!popup &&
          Math.abs(anchor.x - popup.x) <= 1 &&
          Math.abs(anchor.width - popup.width) <= 1
        );
      })
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const bounds = await candidates(page).boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(scene.width);
    const viewport = await page.locator('.sp-page').boundingBox();
    expect(viewport).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(Math.max(0, viewport!.y));
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
      Math.min(scene.height, viewport!.y + viewport!.height),
    );
    await expect(candidates(page).getByRole('option').nth(2)).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath(`stage-candidates-${scene.name}.png`),
      fullPage: true,
    });
  }
});
