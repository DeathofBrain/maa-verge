import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const preview = (page: Page) => page.getByRole('region', { name: '设备画面预览', exact: true });
const image = (page: Page) => preview(page).locator('img[data-frame-id]');
const dock = (page: Page) => page.getByRole('contentinfo', { name: '执行状态栏', exact: true });

async function openPreview(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await dock(page).getByRole('button', { name: '画面', exact: true }).click();
  await expect(preview(page)).toBeVisible();
}

async function pointOnImage(page: Page, xFraction: number, yFraction: number) {
  return preview(page).getByLabel('设备画面区域', { exact: true }).evaluate((stage, fraction) => {
    const img = stage.querySelector('img')!;
    const rect = stage.getBoundingClientRect();
    const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
    const left = (rect.width - img.naturalWidth * scale) / 2;
    const top = (rect.height - img.naturalHeight * scale) / 2;
    const x = Math.floor(img.naturalWidth * fraction.x);
    const y = Math.floor(img.naturalHeight * fraction.y);
    // MouseEvent click coordinates use integer CSS pixels in the browser. Account
    // for that quantization when projecting a small preview onto device pixels.
    const clientX = Math.floor(rect.left + left + (x + .5) * scale);
    const clientY = Math.floor(rect.top + top + (y + .5) * scale);
    return { clientX, clientY, x: Math.floor((clientX - rect.left - left) / scale), y: Math.floor((clientY - rect.top - top) / scale), blankX: rect.left + 2, blankY: rect.top + rect.height / 2, left };
  }, { x: xFraction, y: yFraction });
}

test('preview displays decoded fixture frames, updates automatically and can pause', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openPreview(page);
  await expect(image(page)).toBeVisible();
  await expect(preview(page)).not.toContainText('模拟画面');
  const first = await image(page).getAttribute('data-frame-id');
  await expect.poll(() => image(page).getAttribute('data-frame-id')).not.toBe(first);
  await expect(preview(page).getByLabel('画面性能')).toHaveText(/往返延迟 \d+ ms · 显示帧率 \d+\.\d FPS/);
  await expect(preview(page).getByRole('checkbox', { name: '允许点击操作' })).not.toBeChecked();
  expect(await image(page).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBeTruthy();
  await preview(page).getByRole('button', { name: '暂停刷新', exact: true }).click();
  const paused = await image(page).getAttribute('data-frame-id');
  await page.waitForTimeout(350);
  await expect(image(page)).toHaveAttribute('data-frame-id', paused!);
  await expect(preview(page).getByLabel('画面性能')).toContainText('0.0 FPS');
  await preview(page).getByRole('button', { name: '恢复刷新', exact: true }).click();
  await expect.poll(() => image(page).getAttribute('data-frame-id')).not.toBe(paused);
  expect(errors).toEqual([]);
});

test('refresh frequency defaults to 60 Hz, persists and handles invalid preferences', async ({ page }) => {
  await openPreview(page);
  await expect(image(page)).toBeVisible();
  const frequency = preview(page).getByLabel('刷新频率', { exact: true });
  await expect(frequency).toHaveValue('60');
  await expect(frequency.locator('option')).toHaveText(['5 Hz', '10 Hz', '15 Hz', '30 Hz', '60 Hz', '90 Hz', '120 Hz']);
  const firstFrame = await image(page).getAttribute('data-frame-id');
  await frequency.selectOption('15');
  await expect(frequency).toHaveValue('15');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('maaverge:ui:preview-fps'))).toBe('15');
  await expect.poll(() => image(page).getAttribute('data-frame-id')).not.toBe(firstFrame);
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await dock(page).getByRole('button', { name: '画面', exact: true }).click();
  await expect(frequency).toHaveValue('15');
  await frequency.selectOption('120');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('maaverge:ui:preview-fps'))).toBe('120');
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(frequency).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.evaluate(() => localStorage.setItem('maaverge:ui:preview-fps', 'invalid-rate'));
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await dock(page).getByRole('button', { name: '画面', exact: true }).click();
  await expect(frequency).toHaveValue('60');
});

test('clicks require explicit opt-in, map the displayed frame and reject letterboxing', async ({ page }) => {
  await openPreview(page);
  await expect(image(page)).toBeVisible();
  await page.addStyleTag({ content: '.device-preview-stage { flex: none; height: 170px; }' });
  let point = await pointOnImage(page, .25, .75);
  await page.mouse.click(point.clientX, point.clientY);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.clicks)).toHaveLength(0);
  await preview(page).getByRole('button', { name: '暂停刷新', exact: true }).click();
  await preview(page).getByRole('checkbox', { name: '允许点击操作' }).check();
  const frameId = await image(page).getAttribute('data-frame-id');
  point = await pointOnImage(page, .25, .75);
  expect(point.left).toBeGreaterThan(3);
  await page.mouse.click(point.blankX, point.blankY);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.clicks)).toHaveLength(0);
  await page.mouse.click(point.clientX, point.clientY);
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.clicks.length)).toBe(1);
  const first = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.clicks[0]);
  expect(first).toMatchObject({ deviceId: 'mock-device-1', frameId, x: point.x, y: point.y });
  expect(first.requestId).toMatch(/^[a-f\d-]{36}$/);
  await expect(preview(page).getByRole('status')).toContainText('已发送点击');
  await expect.poll(() => image(page).getAttribute('data-frame-id')).not.toBe(frameId);
  // A slow capture must not queue the user's input behind that capture.
  await page.evaluate(() => { (window as HarnessWindow).runtimeHarness.holdFrames = true; });
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.activeFrames)).toBe(1);
  point = await pointOnImage(page, .7, .3);
  await page.mouse.click(point.clientX, point.clientY);
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.clicks.length), { timeout: 1000 }).toBe(2);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.activeFrames)).toBe(1);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.clicks[1].requestId)).not.toBe(first.requestId);
  await page.evaluate(() => (window as HarnessWindow).runtimeHarness.releaseFrames());
});

test('running tasks keep frames visible and block manual input', async ({ page }) => {
  await openPreview(page);
  await expect(image(page)).toBeVisible();
  await preview(page).getByRole('checkbox', { name: '允许点击操作' }).check();
  const frame = await image(page).getAttribute('data-frame-id');
  await page.evaluate(() => (window as HarnessWindow).runtimeHarness.call('run.start', { planId: 'daily', deviceId: 'mock-device-1', requestId: crypto.randomUUID() }));
  await expect(preview(page)).toContainText('任务执行中，显示核心最近画面，仅查看');
  await expect(preview(page).getByRole('checkbox', { name: '允许点击操作' })).toBeDisabled();
  await expect(page.getByLabel('查看哪次执行', { exact: true })).toHaveCount(0);
  const point = await pointOnImage(page, .5, .5);
  await page.mouse.click(point.clientX, point.clientY);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.clicks)).toHaveLength(0);
  await expect.poll(() => image(page).getAttribute('data-frame-id')).not.toBe(frame);
});

test('polling does not accumulate and stops when hidden, switched or collapsed', async ({ page }) => {
  await openPreview(page);
  await expect(image(page)).toBeVisible();
  await page.evaluate(() => { (window as HarnessWindow).runtimeHarness.holdFrames = true; });
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.activeFrames)).toBe(1);
  const heldCount = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.length);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.length)).toBe(heldCount);
  await page.evaluate(() => (window as HarnessWindow).runtimeHarness.visibility(true));
  await page.evaluate(() => (window as HarnessWindow).runtimeHarness.releaseFrames());
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.activeFrames)).toBe(0);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.length)).toBe(heldCount);
  await page.evaluate(() => (window as HarnessWindow).runtimeHarness.visibility(false));
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.length)).toBeGreaterThan(heldCount);
  await page.evaluate(() => (window as HarnessWindow).runtimeHarness.call('device.connect', { address: '127.0.0.1:5557', name: '第二台模拟设备' }));
  await page.getByLabel('选择设备', { exact: true }).selectOption({ label: '第二台模拟设备 · 已连接' });
  await expect(preview(page).getByRole('img', { name: '第二台模拟设备实时画面' })).toBeVisible();
  await expect(preview(page).getByRole('checkbox', { name: '允许点击操作' })).not.toBeChecked();
  const switchedCount = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.filter((id) => id === 'mock-device-1').length);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.filter((id) => id === 'mock-device-1').length)).toBe(switchedCount);
  await page.getByRole('button', { name: '收起运行详情', exact: true }).click();
  await expect(preview(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.activeFrames)).toBe(0);
  const closedCount = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.length);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.length)).toBe(closedCount);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.maxPerDevice)).toBe(1);
});

test('frame failures stop polling until retry and uncertain clicks are never replayed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(() => { (window as HarnessWindow).runtimeHarness.failFrames = true; });
  await dock(page).getByRole('button', { name: '画面', exact: true }).click();
  await expect(preview(page).getByRole('alert')).toContainText('合成截图故障');
  const failedCount = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.length);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.length)).toBe(failedCount);
  await page.evaluate(() => { (window as HarnessWindow).runtimeHarness.failFrames = false; (window as HarnessWindow).runtimeHarness.failClicks = true; });
  await preview(page).getByRole('button', { name: '重试画面', exact: true }).click();
  await expect(image(page)).toBeVisible();
  await expect(preview(page).getByRole('alert')).toHaveCount(0);
  await preview(page).getByRole('checkbox', { name: '允许点击操作' }).check();
  const point = await pointOnImage(page, .5, .5);
  await page.mouse.click(point.clientX, point.clientY);
  await expect(preview(page).getByRole('alert')).toContainText('点击未确认');
  const count = await page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.length);
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.frames.length)).toBeGreaterThan(count + 2);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.clicks)).toHaveLength(1);
  await page.evaluate(() => (window as HarnessWindow).runtimeHarness.call('device.disconnect', { id: 'mock-device-1' }));
  await expect(preview(page)).toContainText('设备已离线');
  await expect(image(page)).toHaveCount(0);
  await expect(preview(page).getByRole('checkbox', { name: '允许点击操作' })).toBeDisabled();
});
