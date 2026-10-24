import { readFile } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const detail = (page: Page) => page.getByRole('complementary', { name: '作业详情', exact: true });
const preview = (page: Page) => page.getByRole('region', { name: '导入预览', exact: true });
async function openCenter(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  await expect(page.getByRole('heading', { name: '作业中心', exact: true })).toBeVisible();
}
async function importCode(page: Page, code: string) {
  await page.getByRole('button', { name: '导入作业', exact: true }).click();
  await page.getByLabel('社区作业代码', { exact: true }).fill(code);
  await page.getByRole('button', { name: '解析代码', exact: true }).click();
  await expect(preview(page)).toBeVisible();
  await preview(page).getByRole('button', { name: '导入到作业库', exact: true }).click();
  await expect(preview(page)).toHaveCount(0);
}
async function contents(download: Download) {
  const path = await download.path();
  if (!path) throw new Error('下载文件不可读取');
  return readFile(path);
}
async function exportFiles(page: Page) {
  const [original, attribution] = await Promise.all([
    page.waitForEvent('download', { predicate: value => !value.suggestedFilename().endsWith('.attribution.json') }),
    page.waitForEvent('download', { predicate: value => value.suggestedFilename().endsWith('.attribution.json') }),
    detail(page).getByRole('button', { name: '导出 JSON', exact: true }).click(),
  ]);
  return { original, attribution };
}

test('community results distinguish the uploader and preserve source links and attribution when exported', async ({ page }, testInfo) => {
  await openCenter(page);
  const disclosure = page.getByLabel('社区服务与内容归属', { exact: true });
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toContainText('作业、说明和视频权利归各权利人');
  await expect(disclosure).toContainText('不因导入而改用本项目 AGPL');
  await expect(disclosure.getByRole('link', { name: 'PRTS Plus', exact: true })).toHaveAttribute('href', 'https://prts.plus/');
  await page.getByRole('tab', { name: '社区搜索', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toContainText('上传者：合成上传者 · 作者：未标注');
  await library(page).screenshot({ path: testInfo.outputPath('community-attribution.png') });
  await library(page).getByRole('button', { name: '预览 合成社区作业 1', exact: true }).click();
  await expect(preview(page)).toContainText('作者：合成作者');
  await expect(preview(page)).toContainText('上传者：合成上传者');
  await preview(page).getByRole('button', { name: '导入到作业库', exact: true }).click();
  await expect(detail(page).locator('.cp-detail-heading')).toContainText('作者：合成作者');
  await expect(detail(page).locator('.cp-meta')).toContainText('上传者合成上传者');
  const source = detail(page).getByRole('link', { name: '查看原站', exact: true });
  await expect(source).toHaveAttribute('href', 'https://prts.plus/copilot/101');
  await expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (method === 'copilot.export' && params.id !== 'community-101') throw new Error('导出必须保留当前作业来源');
      return original(method, params);
    };
  });
  const files = await exportFiles(page);
  expect(files.original.suggestedFilename()).toBe('合成社区作业 101.json');
  expect(files.attribution.suggestedFilename()).toBe('合成社区作业 101.attribution.json');
  const metadata = JSON.parse((await contents(files.attribution)).toString('utf8'));
  expect(metadata).toMatchObject({ author: '合成作者', uploader: '合成上传者', source: { kind: 'community', url: 'https://prts.plus/copilot/101', communityId: '101' }, licenseStatus: 'unverified' });
  expect(JSON.parse((await contents(files.original)).toString('utf8')).doc.author).toBe('合成作者');
  await detail(page).screenshot({ path: testInfo.outputPath('detail-attribution.png') });
});

test('a community upload without a content signature keeps its author unmarked', async ({ page }) => {
  await openCenter(page); await importCode(page, '103');
  await expect(detail(page).locator('.cp-detail-heading')).toContainText('作者：未标注');
  await expect(detail(page).locator('.cp-detail-heading')).not.toContainText('合成上传者');
  await expect(detail(page).locator('.cp-meta')).toContainText('上传者合成上传者');
  await expect(library(page).locator('.cp-record')).toContainText('作者：未标注 · 上传者：合成上传者');
});

test('local file export preserves the original BOM and formatting beside a separate source explanation', async ({ page }) => {
  await openCenter(page);
  const original = '\uFEFF{\r\n  "stage_name": "main_01-07",\r\n  "author": "原始署名",\r\n  "doc": {"title": "原始字节作业", "details": "保留原作者声明：仅用于合成测试"},\r\n  "actions": []\r\n}\r\n';
  await page.getByRole('button', { name: '导入作业', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'original.json', mimeType: 'application/json', buffer: Buffer.from(original) });
  await expect(preview(page)).toContainText('原始字节作业');
  await preview(page).getByRole('button', { name: '导入到作业库', exact: true }).click();
  const files = await exportFiles(page);
  expect(await contents(files.original)).toEqual(Buffer.from(original));
  expect(files.original.suggestedFilename()).not.toBe(files.attribution.suggestedFilename());
  const metadata = JSON.parse((await contents(files.attribution)).toString('utf8'));
  expect(metadata).toMatchObject({ formatVersion: 1, contentFile: '原始字节作业.json', author: '原始署名', source: { kind: 'local', name: 'original.json' }, licenseStatus: 'unverified' });
  expect(metadata.uploader).toBeUndefined();
  expect(metadata.licenseNotice).toContain('不代表已经获得转载或再分发许可');
});
