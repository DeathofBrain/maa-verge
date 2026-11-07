import { expect, type Page } from '@playwright/test';
import type {
  CopilotPreview,
  CopilotRecord,
  RpcMethod,
} from '../../../packages/contracts/src/index';
import type { HarnessWindow } from './desktop';
import { expectHome, navigate } from './navigation';

// Playwright setup stays separate from the browser-only Copilot runtime adapter.
export const queue = (page: Page) =>
  page.getByRole('region', { name: '作业执行队列', exact: true });
export const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
export const detail = (page: Page) =>
  page.getByRole('complementary', { name: '作业详情', exact: true });
export const preview = (page: Page) => page.getByRole('region', { name: '导入预览', exact: true });

export async function enter(page: Page) {
  await navigate(page, '作业中心');
  await expect(page.getByRole('heading', { name: '作业中心', exact: true })).toBeVisible();
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
}

export async function openCenter(page: Page) {
  await page.goto('/');
  await expectHome(page);
  await enter(page);
}

export function call<T = unknown>(
  page: Page,
  method: RpcMethod,
  params: Record<string, unknown> = {},
): Promise<T> {
  return page.evaluate(
    ({ method, params }) =>
      (window as unknown as HarnessWindow).runtimeHarness.call(method, params),
    { method, params },
  ) as Promise<T>;
}

export async function seed(page: Page, title: string, extra: Record<string, unknown> = {}) {
  const value = await call<CopilotPreview>(page, 'copilot.preview', {
    content: JSON.stringify({ stage_name: 'main_01-07', doc: { title }, actions: [], ...extra }),
  });
  return (await call<{ items: CopilotRecord[] }>(page, 'copilot.import', { previewId: value.id }))
    .items[0];
}

export async function importJson(page: Page, content: string, add = true, waitForClose = true) {
  const panel = page.locator('details.cp-import');
  if (!(await panel.getAttribute('open').then((value) => value !== null)))
    await page.getByRole('button', { name: '导入作业', exact: true }).click();
  const input = page.getByLabel('作业 JSON', { exact: true });
  if (!(await input.isVisible())) await page.getByText('粘贴 JSON', { exact: true }).click();
  await input.fill(content);
  await page.getByRole('button', { name: '预览 JSON', exact: true }).click();
  await expect(preview(page)).toBeVisible();
  await preview(page)
    .getByRole('button', { name: add ? '所选导入并加入队列' : '导入到作业库', exact: true })
    .click();
  if (waitForClose) await expect(preview(page)).toHaveCount(0);
}
