import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';

async function updatesPage(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '更新', exact: true })
    .click();
}

test('download proxy modes save independently and persist across reloads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await updatesPage(page);
  const form = page.getByRole('form', { name: '下载代理设置' });
  await expect(
    page.getByText('Maa Verge 应用、MaaCore 与 MaaResource 的更新检查和下载共用此设置。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(form.getByLabel('下载代理模式')).toHaveValue('auto');
  await expect(form).toContainText('代理不可用时尝试直连');
  await expect(form.getByLabel('手动下载代理地址')).toHaveCount(0);
  await expect(form.getByRole('button', { name: '保存下载代理' })).toBeDisabled();
  await form.getByLabel('下载代理模式').selectOption('manual');
  await form.getByLabel('手动下载代理地址').fill('127.0.0.1:17890');
  await expect(form).toContainText('地址无效或连接失败时显示错误');
  await form.getByRole('button', { name: '保存下载代理' }).click();
  await expect(form.getByRole('button', { name: '保存下载代理' })).toBeDisabled();
  expect(
    await page.evaluate(
      async () =>
        ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
          .settings.downloadProxy,
    ),
  ).toEqual({ mode: 'manual', url: 'http://127.0.0.1:17890/' });
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await updatesPage(page);
  await expect(form.getByLabel('下载代理模式')).toHaveValue('manual');
  await expect(form.getByLabel('手动下载代理地址')).toHaveValue('http://127.0.0.1:17890/');
  await form.getByLabel('下载代理模式').selectOption('direct');
  await expect(form).toContainText('绕过环境变量与系统代理');
  await form.getByRole('button', { name: '保存下载代理' }).click();
  await expect(form.getByRole('button', { name: '保存下载代理' })).toBeDisabled();
  expect(
    await page.evaluate(
      async () =>
        ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
          .settings.downloadProxy,
    ),
  ).toEqual({ mode: 'direct', url: '' });
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await updatesPage(page);
  await expect(form.getByLabel('下载代理模式')).toHaveValue('direct');
  await expect(form.getByLabel('手动下载代理地址')).toHaveCount(0);
  await form.getByLabel('下载代理模式').selectOption('auto');
  await form.getByRole('button', { name: '保存下载代理' }).click();
  await expect(form.getByRole('button', { name: '保存下载代理' })).toBeDisabled();
  expect(
    await page.evaluate(
      async () =>
        ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
          .settings.downloadProxy,
    ),
  ).toEqual({ mode: 'auto', url: '' });
});

test('download proxy drafts survive navigation and can be discarded', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await updatesPage(page);
  const form = page.getByRole('form', { name: '下载代理设置' });
  await form.getByLabel('下载代理模式').selectOption('manual');
  await form.getByLabel('手动下载代理地址').fill('https://proxy.example.test:8443');
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await updatesPage(page);
  await expect(form.getByLabel('下载代理模式')).toHaveValue('manual');
  await expect(form.getByLabel('手动下载代理地址')).toHaveValue('https://proxy.example.test:8443');
  await form.getByRole('button', { name: '放弃修改' }).click();
  await expect(form.getByLabel('下载代理模式')).toHaveValue('auto');
  await expect(form.getByLabel('手动下载代理地址')).toHaveCount(0);
  await expect(form.getByRole('button', { name: '保存下载代理' })).toBeDisabled();
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.settingsWrites)).toBe(
    0,
  );
});

test('a failed download proxy save keeps the draft and allows retry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await updatesPage(page);
  const form = page.getByRole('form', { name: '下载代理设置' });
  await form.getByLabel('下载代理模式').selectOption('manual');
  await form.getByLabel('手动下载代理地址').fill('http://127.0.0.1:17890');
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = true;
  });
  await form.getByRole('button', { name: '保存下载代理' }).click();
  await expect(page.locator('.toast.error')).toContainText('合成设置保存失败');
  await expect(form.getByLabel('手动下载代理地址')).toHaveValue('http://127.0.0.1:17890');
  await expect(form.getByRole('button', { name: '保存下载代理' })).toBeEnabled();
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = false;
  });
  await form.getByRole('button', { name: '保存下载代理' }).click();
  await expect(form.getByRole('button', { name: '保存下载代理' })).toBeDisabled();
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.settingsWrites)).toBe(
    2,
  );
});

test('an invalid manual proxy displays a diagnostic without exposing its password', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await updatesPage(page);
  const form = page.getByRole('form', { name: '下载代理设置' });
  await form.getByLabel('下载代理模式').selectOption('manual');
  const address = 'socks5://user:fixture-private-password@localhost:1080';
  await form.getByLabel('手动下载代理地址').fill(address);
  await form.getByRole('button', { name: '保存下载代理' }).click();
  await expect(page.locator('.toast.error')).toContainText('手动下载代理地址无效');
  await expect(page.locator('.toast.error')).not.toContainText('fixture-private-password');
  await expect(form.getByLabel('手动下载代理地址')).toHaveValue(address);
  await expect(form.getByRole('button', { name: '保存下载代理' })).toBeEnabled();
  expect(
    await page.evaluate(
      async () =>
        ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
          .settings.downloadProxy,
    ),
  ).toBeUndefined();
});

test('a successful proxy save can recover from snapshot readback failure without another write', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await updatesPage(page);
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
  const form = page.getByRole('form', { name: '下载代理设置' });
  await form.getByLabel('下载代理模式').selectOption('manual');
  await form.getByLabel('手动下载代理地址').fill('127.0.0.1:17890');
  await form.getByRole('button', { name: '保存下载代理' }).click();
  await expect(form.getByRole('alert')).toContainText('下载代理已保存，但读取当前设置失败');
  expect(pageErrors).toEqual([]);
  await page.evaluate(() => {
    (window as any).proxyReadbackFailure = false;
  });
  await form.getByRole('button', { name: '重新读取下载代理' }).click();
  await expect(form.getByRole('alert')).toHaveCount(0);
  await expect(form.getByLabel('手动下载代理地址')).toHaveValue('http://127.0.0.1:17890/');
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.settingsWrites)).toBe(
    1,
  );
  expect(
    await page.evaluate(
      async () =>
        ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
          .settings.downloadProxy,
    ),
  ).toEqual({ mode: 'manual', url: 'http://127.0.0.1:17890/' });
  await expect(form.getByLabel('下载代理模式')).toBeEnabled();
  expect(pageErrors).toEqual([]);
});
