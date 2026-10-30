import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

async function openUpdates(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '更新', exact: true })
    .click();
}

const channelSection = (page: Page, name: string) =>
  page.locator('.update-channel').filter({ has: page.getByRole('heading', { name, exact: true }) });

const savedPaths = (page: Page) =>
  page.evaluate(
    async () =>
      ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
        .settings.componentPaths,
  );

test('cancelling the component directory picker preserves settings and selected paths', async ({
  page,
}) => {
  await openUpdates(page);
  const core = channelSection(page, 'MaaCore 核心');
  await core.locator('summary').filter({ hasText: '下载与安装目录' }).click();
  const directory = core.getByLabel('MaaCore 核心下载目录', { exact: true });
  const initialPath = await directory.inputValue();
  const before = await savedPaths(page);
  const writes = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.settingsWrites);
  const choose = core.getByRole('button', { name: '选择文件夹', exact: true });

  await choose.click();
  await expect(choose).toBeEnabled();
  await expect(directory).toHaveValue(initialPath);
  expect(await savedPaths(page)).toEqual(before);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.settingsWrites)).toBe(
    writes,
  );
  expect(
    await page.evaluate(() => (window as HarnessWindow).runtimeHarness.directoryPickerDefaults),
  ).toEqual([initialPath || null]);
});

test('chosen component directories save automatically and failed selections can be retried', async ({
  page,
}) => {
  await openUpdates(page);
  const core = channelSection(page, 'MaaCore 核心');
  await core.locator('summary').filter({ hasText: '下载与安装目录' }).click();
  const directory = core.getByLabel('MaaCore 核心下载目录', { exact: true });
  const choose = core.getByRole('button', { name: '选择文件夹', exact: true });
  const selected = '/fixture/自定义组件/MaaCore';
  await page.evaluate((selection) => {
    (window as HarnessWindow).runtimeHarness.directorySelection = selection;
  }, selected);
  await choose.click();
  await expect.poll(async () => (await savedPaths(page))?.core).toBe(selected);
  await expect(directory).toHaveValue(selected);

  const retryPath = '/fixture/组件 重试/MaaCore';
  await page.evaluate((selection) => {
    const harness = (window as HarnessWindow).runtimeHarness;
    harness.directorySelection = selection;
    harness.failSettings = true;
  }, retryPath);
  await choose.click();
  await expect(core.locator('.sp-component-path .settings-save-state')).toContainText('保存失败');
  await expect(directory).toHaveValue(retryPath);
  expect((await savedPaths(page))?.core).toBe(selected);
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = false;
  });
  await core.getByRole('button', { name: '重试', exact: true }).click();
  await expect.poll(async () => (await savedPaths(page))?.core).toBe(retryPath);

  const resource = channelSection(page, '游戏资源');
  await resource.locator('summary').filter({ hasText: '下载与安装目录' }).click();
  const resourcePath = '/fixture/独立资源/MaaResource';
  await page.evaluate((selection) => {
    (window as HarnessWindow).runtimeHarness.directorySelection = selection;
  }, resourcePath);
  await resource.getByRole('button', { name: '选择文件夹', exact: true }).click();
  await expect.poll(async () => (await savedPaths(page))?.resource).toBe(resourcePath);
  expect((await savedPaths(page))?.core).toBe(retryPath);

  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '更新', exact: true })
    .click();
  await core.locator('summary').filter({ hasText: '下载与安装目录' }).click();
  await resource.locator('summary').filter({ hasText: '下载与安装目录' }).click();
  await expect(directory).toHaveValue(retryPath);
  await expect(resource.getByLabel('游戏资源下载目录', { exact: true })).toHaveValue(resourcePath);
});
