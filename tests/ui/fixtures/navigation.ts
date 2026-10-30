import { expect, type Page } from '@playwright/test';
import type { Snapshot } from '../../../packages/contracts/src/types';
import type { HarnessWindow } from './desktop';

export const readSnapshot = (page: Page) =>
  page.evaluate(
    async () =>
      (await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot,
  );

export async function closeTaskDetail(page: Page) {
  const close = page.getByRole('button', { name: '关闭任务表详情', exact: true });
  if (await close.isVisible()) await close.click();
}

export async function navigate(page: Page, name: string) {
  const closeSettings = page.getByRole('button', { name: '关闭设备连接设置', exact: true });
  if (await closeSettings.isVisible()) await closeSettings.click();
  await closeTaskDetail(page);
  const menu = page.getByRole('button', { name: '打开导航', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name, exact: name !== 'Agent 助手' })
    .click();
}

export async function expectHome(page: Page) {
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
}
