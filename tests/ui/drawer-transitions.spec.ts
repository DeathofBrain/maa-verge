import type { Locator, Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const detail = (page: Page) => page.getByRole('dialog', { name: '任务表详情', exact: true });
const connection = (page: Page) => page.getByRole('dialog', { name: '设备连接设置', exact: true });
const logs = (page: Page) => page.getByRole('dialog', { name: '设备日志', exact: true });

async function openTasks(page: Page) {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await expect(page.getByRole('region', { name: '任务表列表', exact: true })).toBeVisible();
  await page.locator('.page-transition').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
}

async function expectVisibleFirstFrame(panel: Locator, reducedMotion: boolean) {
  await expect(panel).toBeVisible();
  const state = await panel.evaluate((element) => ({
    opacity: Number(getComputedStyle(element).opacity),
    animations: element.getAnimations().length,
  }));
  // Pause the actual entry animation before it can hide the panel behind its backdrop.
  expect(state.opacity).toBeGreaterThanOrEqual(0.6);
  expect(state.animations).toBe(reducedMotion ? 0 : 1);
}

for (const reducedMotion of [false, true]) {
  test(`task drawers keep their first frame visible and preserve the background (${reducedMotion ? 'reduced' : 'normal'} motion)`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
    await openTasks(page);
    await page.evaluate(async () => {
      const api = (window as HarnessWindow).runtimeHarness;
      const state = (await api.call('app.snapshot', {})) as Snapshot;
      for (let index = 0; index < 12; index++) {
        await api.call('plan.save', {
          plan: { ...state.plans[0], id: `drawer-${index}`, name: `抽屉验证 ${index}` },
        });
      }
    });
    await page.reload();
    await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '查看任务表详情抽屉验证 11', exact: true }),
    ).toBeVisible();
    await page.addStyleTag({
      content:
        '.tc-drawer-panel,.side-drawer-panel,.monitor-log-panel { animation-play-state: paused !important; }',
    });
    const trigger = page.getByRole('button', { name: '查看任务表详情抽屉验证 11', exact: true });
    await trigger.scrollIntoViewIfNeeded();
    const background = await page.locator('.tc-page').elementHandle();
    const before = await page.locator('.tc-plans-scroll').evaluate((element) => ({
      top: element.scrollTop,
      rect: element.getBoundingClientRect().toJSON(),
    }));
    expect(before.top).toBeGreaterThan(0);
    await trigger.click();
    await expectVisibleFirstFrame(detail(page), reducedMotion);
    expect(
      await background!.evaluate((element) => element === document.querySelector('.tc-page')),
    ).toBe(true);
    expect(
      await page.locator('.tc-plans-scroll').evaluate((element) => ({
        top: element.scrollTop,
        rect: element.getBoundingClientRect().toJSON(),
      })),
    ).toEqual(before);
    await expect(page.locator('.page-transition')).toHaveCSS('opacity', '1');
    const manageConnection = detail(page).getByRole('button', {
      name: '管理设备连接',
      exact: true,
    });
    await manageConnection.click();
    await expectVisibleFirstFrame(connection(page), reducedMotion);
    await page.keyboard.press('Escape');
    await expect(connection(page)).toHaveCount(0);
    await expect(detail(page)).toBeVisible();
    await expect(manageConnection).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(detail(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.locator('.tc-plans-scroll').evaluate((element) => element.scrollTop)).toBe(
      before.top,
    );

    await page.getByRole('tab', { name: '执行监控', exact: true }).click();
    const logTrigger = page.getByRole('button', { name: '查看设备日志本地模拟设备', exact: true });
    await logTrigger.click();
    await expectVisibleFirstFrame(logs(page), reducedMotion);
    await page.keyboard.press('Escape');
    await expect(logs(page)).toHaveCount(0);
    await expect(logTrigger).toBeFocused();
    await page.getByRole('button', { name: '日志', exact: true }).click();
    await expect(page.locator('.monitor-log-embedded > .monitor-log-panel')).toHaveCSS(
      'animation-name',
      'none',
    );
  });
}

for (const scenario of [
  { width: 1440, height: 900, colorScheme: 'light' as const },
  { width: 1280, height: 800, colorScheme: 'dark' as const },
  { width: 390, height: 844, colorScheme: 'light' as const },
  { width: 390, height: 844, colorScheme: 'dark' as const },
]) {
  test(`task drawer layout ${scenario.width} ${scenario.colorScheme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: scenario.colorScheme, reducedMotion: 'reduce' });
    // Navigate before narrowing the window so the collapsed sidebar needs no special handling.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTasks(page);
    await page.setViewportSize(scenario);
    await page.getByRole('button', { name: '查看任务表详情每日长草计划', exact: true }).click();
    await expect(detail(page)).toBeVisible();
    await detail(page).getByRole('button', { name: '设置第 1 条启动游戏', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('task-detail.png'), fullPage: true });
    await detail(page).getByRole('button', { name: '管理设备连接', exact: true }).click();
    await expect(connection(page)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('connection.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: '执行监控', exact: true }).click();
    await page.getByRole('button', { name: '查看设备日志本地模拟设备', exact: true }).click();
    await expect(logs(page)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('logs.png'), fullPage: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}
