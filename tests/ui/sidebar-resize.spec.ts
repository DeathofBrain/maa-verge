import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/desktop';

const widthKey = 'maaverge:ui:sidebar-width';
const separator = (page: Page) =>
  page.getByRole('separator', { name: '调整侧栏宽度', exact: true });
const savedWidth = (page: Page) => page.evaluate((key) => localStorage.getItem(key), widthKey);

async function startDrag(page: Page) {
  const bounds = await separator(page).boundingBox();
  if (!bounds) throw new Error('侧栏调宽手柄不可操作');
  const position = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(position.x, position.y);
  await page.mouse.down();
  return position;
}

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(separator(page)).toHaveAttribute('aria-valuenow', '224');
});

test('keyboard resizing respects limits, persists and resets to the default', async ({ page }) => {
  const handle = separator(page);
  await expect(handle).toHaveAttribute('aria-valuemin', '72');
  await expect(handle).toHaveAttribute('aria-valuemax', '320');
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '216');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '248');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '72');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '320');
  await page.keyboard.press('Enter');
  await expect(handle).toHaveAttribute('aria-valuenow', '224');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => savedWidth(page)).toBe('232');
  await page.reload();
  await expect(handle).toHaveAttribute('aria-valuenow', '232');
  await handle.dblclick();
  await expect(handle).toHaveAttribute('aria-valuenow', '224');
  await expect.poll(() => savedWidth(page)).toBe('224');
});

test('dragging keeps control beyond the handle and Escape restores its starting width', async ({
  page,
}) => {
  const handle = separator(page);
  const position = await startDrag(page);
  await page.mouse.move(0, position.y, { steps: 5 });
  await expect(handle).toHaveAttribute('aria-valuenow', '72');
  await page.mouse.move(900, position.y, { steps: 5 });
  await expect(handle).toHaveAttribute('aria-valuenow', '320');
  await page.mouse.up();
  await expect.poll(() => savedWidth(page)).toBe('320');

  const next = await startDrag(page);
  await page.mouse.move(0, next.y, { steps: 5 });
  await expect(handle).toHaveAttribute('aria-valuenow', '72');
  await page.keyboard.press('Escape');
  await expect(handle).toHaveAttribute('aria-valuenow', '320');
  await page.mouse.up();
  await expect.poll(() => savedWidth(page)).toBe('320');
});

test('every navigation entry remains usable at the minimum width', async ({ page }) => {
  const handle = separator(page);
  await handle.focus();
  await page.keyboard.press('Home');
  for (const name of [
    '任务',
    '作业中心',
    '工具箱',
    'Agent 助手',
    '执行记录',
    '设备',
    '设置',
    '主页',
  ]) {
    const entry = page.locator('.sidebar').getByRole('button', { name, exact: true });
    await entry.click();
    await expect(entry).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('main')).toHaveAttribute('aria-label', name);
  }
  await expect(handle).toHaveAttribute('aria-valuenow', '72');
  await expect.poll(() => savedWidth(page)).toBe('72');
});

test('narrow-window navigation preserves the preferred desktop width', async ({ page }) => {
  await separator(page).focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => savedWidth(page)).toBe('216');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['设备', '设置']) {
    await page.getByRole('button', { name: '打开导航', exact: true }).click();
    const entry = page.locator('.sidebar').getByRole('button', { name, exact: true });
    await entry.click();
    await expect(entry).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('main')).toHaveAttribute('aria-label', name);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(separator(page)).toHaveAttribute('aria-valuenow', '216');
  await expect.poll(() => savedWidth(page)).toBe('216');
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await expect(page.getByRole('main')).toHaveAttribute('aria-label', '主页');
});
