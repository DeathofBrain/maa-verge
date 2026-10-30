import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';

async function updatesPage(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '更新', exact: true })
    .click();
  return page.getByRole('form', { name: '下载代理设置' });
}
async function savedProxy(page: Page) {
  return page.evaluate(
    async () =>
      ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
        .settings.downloadProxy,
  );
}

test('download proxy modes automatically save and persist across reloads', async ({ page }) => {
  await page.goto('/');
  const form = await updatesPage(page);
  await form.getByLabel('下载代理模式').selectOption('manual');
  await form.getByLabel('手动下载代理地址').fill('127.0.0.1:17890');
  await expect
    .poll(() => savedProxy(page))
    .toEqual({ mode: 'manual', url: 'http://127.0.0.1:17890/' });
  await expect(form.getByLabel('手动下载代理地址')).toHaveValue('http://127.0.0.1:17890/');
  await page.reload();
  await updatesPage(page);
  await expect(form.getByLabel('下载代理模式')).toHaveValue('manual');
  await form.getByLabel('下载代理模式').selectOption('direct');
  await expect.poll(() => savedProxy(page)).toEqual({ mode: 'direct', url: '' });
  await page.reload();
  await updatesPage(page);
  await expect(form.getByLabel('下载代理模式')).toHaveValue('direct');
  await form.getByLabel('下载代理模式').selectOption('auto');
  await expect.poll(() => savedProxy(page)).toEqual({ mode: 'auto', url: '' });
});

test('leaving settings flushes a pending proxy edit without losing another preference', async ({
  page,
}) => {
  await page.goto('/');
  const form = await updatesPage(page);
  await form.getByLabel('下载代理模式').selectOption('manual');
  await form.getByLabel('手动下载代理地址').fill('https://proxy.example.test:8443');
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '通用与外观', exact: true })
    .click();
  await page.getByLabel('关闭窗口时', { exact: true }).selectOption('tray');
  await expect
    .poll(() => savedProxy(page))
    .toEqual({ mode: 'manual', url: 'https://proxy.example.test:8443/' });
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
            .settings.rememberCloseAction,
      ),
    )
    .toBe(true);
  await updatesPage(page);
  await expect(form.getByLabel('手动下载代理地址')).toHaveValue('https://proxy.example.test:8443/');
});

test('a failed automatic proxy save keeps the input and allows retry', async ({ page }) => {
  await page.goto('/');
  const form = await updatesPage(page);
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = true;
  });
  await form.getByLabel('下载代理模式').selectOption('manual');
  await form.getByLabel('手动下载代理地址').fill('http://127.0.0.1:17890');
  await expect(page.locator('.toast.error')).toContainText('合成设置保存失败');
  await expect(form.getByLabel('手动下载代理地址')).toHaveValue('http://127.0.0.1:17890');
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = false;
  });
  await form.getByRole('button', { name: '重试', exact: true }).click();
  await expect
    .poll(() => savedProxy(page))
    .toEqual({ mode: 'manual', url: 'http://127.0.0.1:17890/' });
});

test('an invalid automatic proxy save reports the error without exposing its password', async ({
  page,
}) => {
  await page.goto('/');
  const form = await updatesPage(page);
  await form.getByLabel('下载代理模式').selectOption('manual');
  const address = 'socks5://user:fixture-private-password@localhost:1080';
  await form.getByLabel('手动下载代理地址').fill(address);
  await expect(page.locator('.toast.error')).toContainText('手动下载代理地址无效');
  await expect(page.locator('.toast.error')).not.toContainText('fixture-private-password');
  await expect(form.getByLabel('手动下载代理地址')).toHaveValue(address);
  expect(await savedProxy(page)).toBeUndefined();
});

test('a successful automatic save recovers from readback failure without writing again', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  const form = await updatesPage(page);
  await page.evaluate(() => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const original = harness.call;
    let saved = false;
    (window as any).proxyReadbackFailure = true;
    harness.call = async (method, params) => {
      if (method === 'app.snapshot' && saved && (window as any).proxyReadbackFailure)
        throw new Error('synthetic snapshot readback failed');
      const result = await original(method, params);
      if (method === 'settings.save') saved = true;
      return result;
    };
  });
  await form.getByLabel('下载代理模式').selectOption('manual');
  await form.getByLabel('手动下载代理地址').fill('127.0.0.1:17890');
  await expect(form.getByRole('alert')).toContainText('下载代理已保存，但读取当前设置失败');
  await page.evaluate(() => {
    (window as any).proxyReadbackFailure = false;
  });
  await form.getByRole('button', { name: '重新读取下载代理' }).click();
  await expect(form.getByRole('alert')).toHaveCount(0);
  await expect(form.getByLabel('手动下载代理地址')).toHaveValue('http://127.0.0.1:17890/');
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.settingsWrites)).toBe(
    1,
  );
  expect(pageErrors).toEqual([]);
});
