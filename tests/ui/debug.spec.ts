import { expect, test } from './fixtures/desktop';
import { navigate } from './fixtures/navigation';
import {
  debugCalls,
  installDebugFixture,
  openAbout,
  unlockDebug,
  type DebugWindow,
} from './fixtures/debug';

const debugPage = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Debug 原语调试', exact: true });

test('Debug unlock requires five version title activations, resets unfinished attempts, and persists', async ({
  page,
}) => {
  await installDebugFixture(page);
  await page.goto('/');
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Debug', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('textbox', { name: '搜索任务与设置' }).fill('debug');
  await expect(page.getByRole('region', { name: '搜索结果' })).not.toContainText('原语调试');
  await page.getByRole('textbox', { name: '搜索任务与设置' }).fill('');
  await openAbout(page);
  const version = page.getByRole('button', { name: '应用版本', exact: true });
  for (let index = 0; index < 4; index++) await version.click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '通用与外观', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '关于', exact: true })
    .click();
  await version.click();
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Debug', exact: true }),
  ).toHaveCount(0);
  await navigate(page, '主页');
  await openAbout(page);
  await version.focus();
  for (const key of ['Enter', 'Space', 'Enter', 'Space']) await page.keyboard.press(key);
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Debug', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Debug', exact: true }),
  ).toBeVisible();
  await page.reload();
  await navigate(page, 'Debug');
  await expect(debugPage(page)).toBeVisible();
  expect(await debugCalls(page, 'debug.session.start')).toHaveLength(0);
  expect(await debugCalls(page, 'debug.primitive.invoke')).toHaveLength(0);
});

test('Debug catalogs four layers, filters capabilities, and keeps unavailable items inspectable', async ({
  page,
}) => {
  await installDebugFixture(page, true);
  await page.goto('/');
  await navigate(page, 'Debug');
  for (const label of ['L1 最小原语', 'L2 通用组合', 'L3 游戏事件', '完整流程'])
    await expect(debugPage(page).getByRole('region', { name: label, exact: true })).toBeVisible();
  await debugPage(page).getByRole('textbox', { name: '搜索原语' }).fill('活动');
  await debugPage(page).getByRole('button', { name: '活动导航', exact: true }).click();
  await expect(
    debugPage(page).getByRole('heading', { name: '活动导航', exact: true }),
  ).toBeVisible();
  await expect(debugPage(page).getByRole('button', { name: '运行此能力' })).toBeDisabled();
  await expect(debugPage(page)).toContainText('当前客户端尚未登记活动入口');
  expect(await debugCalls(page, 'debug.primitive.invoke')).toHaveLength(0);
});

test('Debug explicitly starts a session and runs validated schema parameters without automatic retries', async ({
  page,
}) => {
  await installDebugFixture(page, true);
  await page.goto('/');
  await navigate(page, 'Debug');
  await debugPage(page).getByRole('button', { name: '识别主页', exact: true }).click();
  await expect(debugPage(page).getByRole('button', { name: '运行此能力' })).toBeDisabled();
  await debugPage(page).getByRole('button', { name: '建立调试会话', exact: true }).click();
  await expect(debugPage(page)).toContainText('调试会话已建立');
  await debugPage(page).getByRole('spinbutton', { name: '重试次数' }).fill('4');
  await debugPage(page).getByRole('button', { name: '运行此能力' }).click();
  await expect(debugPage(page).getByRole('alert')).toContainText('超出允许范围');
  expect(await debugCalls(page, 'debug.primitive.invoke')).toHaveLength(0);
  await debugPage(page).getByRole('spinbutton', { name: '重试次数' }).fill('2');
  await debugPage(page).getByRole('button', { name: '运行此能力' }).click();
  const result = debugPage(page).getByLabel('原语执行结果', { exact: true });
  await expect(result).toContainText('结果未知');
  await expect(result).toContainText('原生执行：成功');
  await expect(result).toContainText('目标验证：未验证');
  await expect(result).toContainText('步骤记录');
  const calls = await debugCalls(page, 'debug.primitive.invoke');
  expect(calls).toHaveLength(1);
  expect(calls[0].params.input).toEqual({ retries: 2, enabled: true, mode: 'strict' });
});

test('Debug screenshots fill point and region parameters without executing the selected action', async ({
  page,
}) => {
  await installDebugFixture(page, true);
  await page.goto('/');
  await navigate(page, 'Debug');
  await debugPage(page).getByRole('button', { name: '建立调试会话' }).click();
  await debugPage(page).getByRole('button', { name: '截图', exact: true }).click();
  await debugPage(page).getByRole('button', { name: '运行此能力' }).click();
  const image = debugPage(page).getByRole('img', { name: '当前调试设备截图' });
  await expect(image).toBeVisible();
  await debugPage(page).getByRole('button', { name: '点击', exact: true }).click();
  const bounds = await image.boundingBox();
  if (!bounds) throw new Error('Missing synthetic image bounds');
  await image.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  const x = Number(await debugPage(page).getByRole('spinbutton', { name: 'X 坐标' }).inputValue());
  const y = Number(await debugPage(page).getByRole('spinbutton', { name: 'Y 坐标' }).inputValue());
  // Browser pointer positions are rounded to display pixels before scaling.
  expect(x).toBeGreaterThanOrEqual(638);
  expect(x).toBeLessThanOrEqual(642);
  expect(y).toBeGreaterThanOrEqual(358);
  expect(y).toBeLessThanOrEqual(362);
  expect(await debugCalls(page, 'debug.primitive.invoke')).toHaveLength(1);
  await debugPage(page).getByRole('button', { name: 'OCR', exact: true }).click();
  await debugPage(page).getByRole('button', { name: '选区', exact: true }).click();
  const regionBounds = await image.boundingBox();
  if (!regionBounds) throw new Error('Missing synthetic image bounds');
  await page.mouse.move(
    regionBounds.x + regionBounds.width / 4,
    regionBounds.y + regionBounds.height / 4,
  );
  await page.mouse.down();
  await page.mouse.move(
    regionBounds.x + regionBounds.width / 2,
    regionBounds.y + regionBounds.height / 2,
  );
  await page.mouse.up();
  const roi = JSON.parse(
    await debugPage(page).getByRole('textbox', { name: '识别区域' }).inputValue(),
  ) as number[];
  expect(roi).toHaveLength(4);
  for (const [index, expected] of [320, 180, 321, 181].entries()) {
    expect(roi[index]).toBeGreaterThanOrEqual(expected - 2);
    expect(roi[index]).toBeLessThanOrEqual(expected + 2);
  }
  expect(await debugCalls(page, 'debug.primitive.invoke')).toHaveLength(1);
  // effect=observe 优先于旧 operation 分类；一次只读识别仍可继续使用同一显式帧。
  const frameId = await debugPage(page).getByRole('textbox', { name: '画面 ID' }).inputValue();
  await debugPage(page).getByRole('button', { name: '运行此能力' }).click();
  await expect.poll(async () => (await debugCalls(page, 'debug.primitive.invoke')).length).toBe(2);
  await debugPage(page).getByRole('button', { name: '点击', exact: true }).click();
  await expect(debugPage(page).getByRole('textbox', { name: '画面 ID' })).toHaveValue(frameId);
});

test('Debug stops its in-flight invocation, releases ownership, and ignores late results', async ({
  page,
}) => {
  await installDebugFixture(page, true);
  await page.goto('/');
  await navigate(page, 'Debug');
  await debugPage(page).getByRole('button', { name: '建立调试会话' }).click();
  await debugPage(page).getByRole('button', { name: '截图', exact: true }).click();
  await page.evaluate(() => {
    (window as DebugWindow).debugProbe.holdInvoke = true;
  });
  await debugPage(page).getByRole('button', { name: '运行此能力' }).click();
  await expect.poll(async () => (await debugCalls(page, 'debug.primitive.invoke')).length).toBe(1);
  await debugPage(page).getByRole('button', { name: '停止并释放会话', exact: true }).click();
  await expect(debugPage(page)).toContainText('已停止并释放调试会话');
  await expect(debugPage(page).getByLabel('原语执行结果', { exact: true })).toHaveCount(0);
  await expect(debugPage(page).getByRole('img', { name: '当前调试设备截图' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as DebugWindow).debugProbe.sessions)).toEqual([]);
  expect(await debugCalls(page, 'debug.session.end')).toHaveLength(1);
});

test('Debug releases only its own session before switching devices or leaving the page', async ({
  page,
}) => {
  await installDebugFixture(page, true);
  await page.goto('/');
  await navigate(page, 'Debug');
  await debugPage(page).getByRole('button', { name: '建立调试会话' }).click();
  await debugPage(page).getByLabel('调试设备', { exact: true }).selectOption('debug-device-2');
  await expect.poll(async () => (await debugCalls(page, 'debug.session.end')).length).toBe(1);
  await expect(debugPage(page)).toContainText('尚未建立会话');
  await debugPage(page).getByRole('button', { name: '建立调试会话' }).click();
  await expect.poll(async () => (await debugCalls(page, 'debug.session.start')).length).toBe(2);
  await navigate(page, '主页');
  await expect.poll(async () => (await debugCalls(page, 'debug.session.end')).length).toBe(2);
  expect(await page.evaluate(() => (window as DebugWindow).debugProbe.sessions)).toEqual([]);
});

test('Debug releases a session returned after navigation and keeps a failed release retryable', async ({
  page,
}) => {
  await installDebugFixture(page, true);
  await page.goto('/');
  await navigate(page, 'Debug');
  await page.evaluate(() => {
    (window as DebugWindow).debugProbe.holdStart = true;
  });
  await debugPage(page).getByRole('button', { name: '建立调试会话' }).click();
  await expect.poll(async () => (await debugCalls(page, 'debug.session.start')).length).toBe(1);
  await expect(
    debugPage(page).getByRole('button', { name: '隐藏 Debug', exact: true }),
  ).toBeDisabled();
  await navigate(page, '主页');
  await page.evaluate(() => (window as DebugWindow).debugProbe.releaseStart());
  await expect.poll(async () => (await debugCalls(page, 'debug.session.end')).length).toBe(1);
  expect(await page.evaluate(() => (window as DebugWindow).debugProbe.sessions)).toEqual([]);
  await navigate(page, 'Debug');
  await debugPage(page).getByRole('button', { name: '建立调试会话' }).click();
  await page.evaluate(() => {
    (window as DebugWindow).debugProbe.failEnd = true;
  });
  await debugPage(page).getByRole('button', { name: '释放会话', exact: true }).click();
  await expect(debugPage(page).getByRole('alert')).toContainText('合成释放失败');
  await expect(debugPage(page)).toContainText('待重试释放会话');
  await expect(debugPage(page).getByRole('button', { name: '运行此能力' })).toBeDisabled();
  await navigate(page, '主页');
  await navigate(page, 'Debug');
  expect(await debugCalls(page, 'debug.session.end')).toHaveLength(2);
  await page.evaluate(() => {
    (window as DebugWindow).debugProbe.failEnd = false;
  });
  await debugPage(page).getByRole('button', { name: '重试释放会话', exact: true }).click();
  await expect(debugPage(page)).toContainText('已停止并释放调试会话');
});

test('Debug retains a failed unmount release for explicit retry after returning to the page', async ({
  page,
}) => {
  await installDebugFixture(page, true);
  await page.goto('/');
  await navigate(page, 'Debug');
  await debugPage(page).getByRole('button', { name: '建立调试会话' }).click();
  await expect(debugPage(page)).toContainText('会话已建立');
  await page.evaluate(() => {
    (window as DebugWindow).debugProbe.failEnd = true;
  });
  await navigate(page, '主页');
  await expect.poll(async () => (await debugCalls(page, 'debug.session.end')).length).toBe(1);
  await navigate(page, 'Debug');
  await expect(debugPage(page)).toContainText('待重试释放会话');
  await expect(debugPage(page).getByRole('button', { name: '建立调试会话' })).toBeDisabled();
  await expect(debugPage(page).getByRole('button', { name: '运行此能力' })).toBeDisabled();
  await expect(debugPage(page).getByLabel('调试设备', { exact: true })).toBeDisabled();
  await navigate(page, '主页');
  await navigate(page, 'Debug');
  expect(await debugCalls(page, 'debug.session.end')).toHaveLength(1);
  expect(await debugCalls(page, 'debug.session.start')).toHaveLength(1);
  expect(await debugCalls(page, 'debug.primitive.invoke')).toHaveLength(0);
  await page.evaluate(() => {
    (window as DebugWindow).debugProbe.failEnd = false;
  });
  await debugPage(page).getByRole('button', { name: '重试释放会话', exact: true }).click();
  await expect(debugPage(page)).toContainText('已停止并释放调试会话');
  expect(await page.evaluate(() => (window as DebugWindow).debugProbe.sessions)).toEqual([]);
  const ends = await debugCalls(page, 'debug.session.end');
  expect(ends[1].params.debugSessionId).toBe(ends[0].params.debugSessionId);
  expect(ends[1].params.requestId).not.toBe(ends[0].params.requestId);
  await debugPage(page).getByRole('button', { name: '建立调试会话' }).click();
  await expect.poll(async () => (await debugCalls(page, 'debug.session.start')).length).toBe(2);
});

test('Debug blocks another start and retains a late session when its cleanup release fails', async ({
  page,
}) => {
  await installDebugFixture(page, true);
  await page.goto('/');
  await navigate(page, 'Debug');
  await page.evaluate(() => {
    (window as DebugWindow).debugProbe.holdStart = true;
  });
  await debugPage(page).getByRole('button', { name: '建立调试会话' }).click();
  await expect.poll(async () => (await debugCalls(page, 'debug.session.start')).length).toBe(1);
  await navigate(page, '主页');
  await navigate(page, 'Debug');
  await expect(debugPage(page).getByRole('button', { name: '建立调试会话' })).toBeDisabled();
  await page.evaluate(() => {
    const probe = (window as DebugWindow).debugProbe;
    probe.failEnd = true;
    probe.releaseStart();
  });
  await expect(debugPage(page)).toContainText('待重试释放会话');
  await expect(debugPage(page).getByRole('alert')).toContainText('合成释放失败');
  await expect(debugPage(page).getByRole('button', { name: '运行此能力' })).toBeDisabled();
  expect(await debugCalls(page, 'debug.session.start')).toHaveLength(1);
  expect(await debugCalls(page, 'debug.primitive.invoke')).toHaveLength(0);
  await page.evaluate(() => {
    (window as DebugWindow).debugProbe.failEnd = false;
  });
  await debugPage(page).getByRole('button', { name: '重试释放会话', exact: true }).click();
  await expect(debugPage(page)).toContainText('已停止并释放调试会话');
  expect(await page.evaluate(() => (window as DebugWindow).debugProbe.sessions)).toEqual([]);
  const ends = await debugCalls(page, 'debug.session.end');
  expect(ends).toHaveLength(2);
  expect(ends[1].params.debugSessionId).toBe(ends[0].params.debugSessionId);
  expect(await debugCalls(page, 'debug.session.start')).toHaveLength(1);
});

test('hiding idle Debug clears its preference, search result and compact navigation entry', async ({
  page,
}) => {
  await installDebugFixture(page);
  await page.goto('/');
  await unlockDebug(page);
  const resize = page.getByRole('separator', { name: '调整侧栏宽度', exact: true });
  await resize.focus();
  await resize.press('Home');
  await navigate(page, 'Debug');
  await debugPage(page).getByRole('button', { name: '隐藏 Debug', exact: true }).click();
  await expect(debugPage(page)).toHaveCount(0);
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Debug', exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('maaverge:ui:debug-enabled'))).toBe(
    'false',
  );
  expect(await debugCalls(page, 'debug.session.start')).toHaveLength(0);
  expect(await debugCalls(page, 'debug.session.end')).toHaveLength(0);
  await page.getByRole('textbox', { name: '搜索任务与设置' }).fill('debug');
  await expect(page.getByRole('region', { name: '搜索结果' })).not.toContainText('原语调试');
  await page.reload();
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Debug', exact: true }),
  ).toHaveCount(0);
});

test('hiding Debug stops an in-flight invocation before removing its entry', async ({ page }) => {
  await installDebugFixture(page, true);
  await page.goto('/');
  await navigate(page, 'Debug');
  await debugPage(page).getByRole('button', { name: '建立调试会话' }).click();
  await debugPage(page).getByRole('button', { name: '截图', exact: true }).click();
  await page.evaluate(() => {
    (window as DebugWindow).debugProbe.holdInvoke = true;
  });
  await debugPage(page).getByRole('button', { name: '运行此能力' }).click();
  await expect.poll(async () => (await debugCalls(page, 'debug.primitive.invoke')).length).toBe(1);
  await debugPage(page).getByRole('button', { name: '隐藏 Debug', exact: true }).click();
  await expect(debugPage(page)).toHaveCount(0);
  expect(await debugCalls(page, 'debug.session.end')).toHaveLength(1);
  expect(await debugCalls(page, 'debug.primitive.invoke')).toHaveLength(1);
  expect(await page.evaluate(() => (window as DebugWindow).debugProbe.sessions)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('maaverge:ui:debug-enabled'))).toBe(
    'false',
  );
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Debug', exact: true }),
  ).toHaveCount(0);
});

test('a failed release prevents hiding Debug and keeps only its release retry available', async ({
  page,
}) => {
  await installDebugFixture(page, true);
  await page.goto('/');
  await navigate(page, 'Debug');
  await debugPage(page).getByRole('button', { name: '建立调试会话' }).click();
  await expect(debugPage(page)).toContainText('会话已建立');
  await page.evaluate(() => {
    (window as DebugWindow).debugProbe.failEnd = true;
  });
  await debugPage(page).getByRole('button', { name: '隐藏 Debug', exact: true }).click();
  await expect(debugPage(page)).toContainText('待重试释放会话');
  await expect(debugPage(page).getByRole('alert')).toContainText('合成释放失败');
  await expect(debugPage(page).getByRole('button', { name: '建立调试会话' })).toBeDisabled();
  await expect(debugPage(page).getByRole('button', { name: '运行此能力' })).toBeDisabled();
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Debug', exact: true }),
  ).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('maaverge:ui:debug-enabled'))).toBe('true');
  await page.evaluate(() => {
    (window as DebugWindow).debugProbe.failEnd = false;
  });
  await debugPage(page).getByRole('button', { name: '隐藏 Debug', exact: true }).click();
  await expect(debugPage(page)).toHaveCount(0);
  expect(await debugCalls(page, 'debug.session.end')).toHaveLength(2);
  expect(await debugCalls(page, 'debug.primitive.invoke')).toHaveLength(0);
  expect(await page.evaluate(() => (window as DebugWindow).debugProbe.sessions)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('maaverge:ui:debug-enabled'))).toBe(
    'false',
  );
});
