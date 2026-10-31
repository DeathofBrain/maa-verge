import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

type LinkWindow = HarnessWindow & {
  __TAURI_INTERNALS__: {
    invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
  openedLinks: string[];
  failExternal: boolean;
};

async function openSettings(page: Page, category: string) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: category, exact: true })
    .click();
  await page.evaluate(() => {
    const target = window as unknown as LinkWindow;
    target.openedLinks = [];
    target.failExternal = false;
    const originalInvoke = target.__TAURI_INTERNALS__.invoke.bind(target.__TAURI_INTERNALS__);
    target.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'open_external_url') {
        target.openedLinks.push(String(args?.url));
        if (target.failExternal) throw new Error('合成浏览器打开失败');
        return;
      }
      return originalInvoke(command, args);
    };
  });
}

test('ExternalLink supports mouse, keyboard, middle click and recovery through the desktop bridge', async ({
  page,
  context,
}) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1(?::|\/))/, (route) => route.abort());
  await openSettings(page, '外部服务');
  const link = page.getByRole('link', { name: 'PRTS Plus', exact: true });
  const appUrl = page.url();
  const externalUrl = 'https://prts.plus/';
  await expect(link).toHaveAttribute('href', externalUrl);

  await link.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as LinkWindow).openedLinks))
    .toEqual([externalUrl]);

  await link.focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as LinkWindow).openedLinks))
    .toEqual([externalUrl, externalUrl]);

  await link.click({ button: 'middle' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as LinkWindow).openedLinks))
    .toEqual([externalUrl, externalUrl, externalUrl]);
  expect(page.url()).toBe(appUrl);
  expect(context.pages()).toHaveLength(1);

  await page.evaluate(() => {
    (window as unknown as LinkWindow).failExternal = true;
  });
  await link.click();
  const error = page.getByRole('alert').filter({ hasText: '合成浏览器打开失败' });
  await expect(error).toBeVisible();
  await expect(error).toContainText('无法打开系统浏览器');
  await expect(link).toBeVisible();
  expect(page.url()).toBe(appUrl);
  expect(context.pages()).toHaveLength(1);

  await page.evaluate(() => {
    (window as unknown as LinkWindow).failExternal = false;
  });
  await link.click();
  await expect(error).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as LinkWindow).openedLinks.length))
    .toBe(5);
  expect(page.url()).toBe(appUrl);
  expect(context.pages()).toHaveLength(1);
});

test('MirrorChyan settings bind their official URL to the desktop browser bridge', async ({
  page,
  context,
}) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1(?::|\/))/, (route) => route.abort());
  await openSettings(page, '更新');
  const link = page.getByRole('link', { name: 'Mirror酱官网与 CDK', exact: true });
  const href = 'https://mirrorchyan.com?source=maa_verge_settings';
  const appUrl = page.url();
  await expect(link).toHaveAttribute('href', href);
  await link.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as LinkWindow).openedLinks))
    .toEqual([new URL(href).href]);
  expect(page.url()).toBe(appUrl);
  expect(context.pages()).toHaveLength(1);
});
