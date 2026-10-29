import type { Page } from '@playwright/test';
import type { CopilotPreview, CopilotDifficulty } from '../../packages/contracts/src/index';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
async function openCenter(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  await expect(
    page.getByRole('region', { name: '作业执行队列', exact: true }).locator('.cp-save-state'),
  ).toContainText('已保存');
}

test('community difficulty badges preserve ordinary, raid, both and unknown declarations', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (method === 'copilot.search' && params.target === 'copilot')
        return {
          items: ([1, 2, 3, 0, undefined] satisfies (CopilotDifficulty | undefined)[]).map(
            (difficulty, index) => ({
              id: String(101 + index),
              title: ['普通声明', '突袭声明', '双难度声明', '未设置难度', '未声明难度'][index],
              description: '',
              author: '',
              uploader: '合成作者',
              url: `https://prts.plus/copilot/${101 + index}`,
              kind: 'Copilot',
              difficulty,
            }),
          ),
          page: 1,
          hasNext: false,
          total: 5,
        };
      return original(method, params);
    };
  });
  await openCenter(page);
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  const cards = library(page).locator('article.cp-record');
  await expect(cards).toHaveCount(5);
  await expect(cards.nth(0).locator('.cp-difficulty-badge')).toHaveText(['普通']);
  await expect(cards.nth(1).locator('.cp-difficulty-badge')).toHaveText(['突袭']);
  await expect(cards.nth(2).locator('.cp-difficulty-badge')).toHaveText(['普通', '突袭']);
  for (const index of [3, 4])
    await expect(cards.nth(index).locator('.cp-difficulty-badges')).toHaveCount(0);
  await cards.nth(2).screenshot({ path: testInfo.outputPath('difficulty-both-light.png') });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await cards.nth(2).screenshot({ path: testInfo.outputPath('difficulty-both-dark.png') });
});

test('local cards retain declared difficulty without guessing one for ordinary scripts', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    for (const [title, difficulty] of [
      ['本地突袭', 2],
      ['本地未设置', 0],
      ['本地未声明', undefined],
    ] as const) {
      const content = JSON.stringify({
        stage_name: 'main_01-07',
        doc: { title },
        actions: [],
        ...(difficulty !== undefined ? { difficulty } : {}),
      });
      const preview = (await harness.call('copilot.preview', { content })) as CopilotPreview;
      await harness.call('copilot.import', { previewId: preview.id });
    }
  });
  await openCenter(page);
  const raid = library(page).locator('article.cp-record').filter({ hasText: '本地突袭' });
  await expect(raid.locator('.cp-difficulty-badge')).toHaveText(['突袭']);
  for (const name of ['本地未设置', '本地未声明'])
    await expect(
      library(page)
        .locator('article.cp-record')
        .filter({ hasText: name })
        .locator('.cp-difficulty-badges'),
    ).toHaveCount(0);
});
