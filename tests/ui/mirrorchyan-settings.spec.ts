import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

async function openMirrorSettings(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await enterUpdates(page);
}

async function enterUpdates(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '更新', exact: true })
    .click();
}

const form = (page: Page) => page.getByRole('form', { name: 'Mirror酱配置' });
const credential = (page: Page) => form(page).getByLabel('Mirror酱 CDK', { exact: true });
const save = (page: Page) =>
  form(page).getByRole('button', { name: '保存 Mirror酱设置', exact: true });
const settings = (page: Page) =>
  page.evaluate(
    async () =>
      ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
        .settings,
  );

test('CDK drafts stay in memory and explicit saves normalize and persist the credential', async ({
  page,
}) => {
  await openMirrorSettings(page);
  await expect(credential(page)).toHaveAttribute('type', 'password');
  const initial = await settings(page);
  const token = 'synthetic-mirror-cdk-memory';
  await credential(page).fill(token);
  expect(await settings(page)).toEqual(initial);
  const stored = await page.evaluate(() => ({
    session: Object.values(sessionStorage).join('\n'),
    local: Object.values(localStorage).join('\n'),
  }));
  expect(stored.session).not.toContain(token);
  expect(stored.local).not.toContain(token);
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await enterUpdates(page);
  await expect(credential(page)).toHaveValue('');
  await credential(page).fill(`  ${token}  `);
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  await expect(credential(page)).toHaveValue(token);
  expect((await settings(page)).mirrorChyan).toEqual({ enabled: true, cdk: token });
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await enterUpdates(page);
  await expect(credential(page)).toHaveValue(token);
  await expect(save(page)).toBeDisabled();
});

test('failed CDK saves preserve the unsaved credential and allow a successful retry', async ({
  page,
}) => {
  await openMirrorSettings(page);
  const initial = await settings(page);
  const token = 'synthetic-mirror-cdk-retry';
  await credential(page).fill(token);
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = true;
  });
  await save(page).click();
  await expect(page.getByRole('alert')).toContainText('合成设置保存失败');
  await expect(credential(page)).toHaveValue(token);
  await expect(save(page)).toBeEnabled();
  expect(await settings(page)).toEqual(initial);
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = false;
  });
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  expect((await settings(page)).mirrorChyan).toEqual({ enabled: true, cdk: token });
});

test('disabling Mirror and clearing its CDK preserve unrelated preferences across reloads', async ({
  page,
}) => {
  await openMirrorSettings(page);
  const token = 'synthetic-mirror-cdk-clear';
  const initial = await page.evaluate(async (token) => {
    const api = (window as HarnessWindow).runtimeHarness;
    const state = (await api.call('app.snapshot', {})) as Snapshot;
    const saved = {
      ...state.settings,
      downloadProxy: { mode: 'direct' as const, url: '' },
      notifications: {
        enabled: false,
        runResults: true,
        deviceErrors: false,
        updates: false,
        schedules: true,
      },
      mirrorChyan: { enabled: true, cdk: token },
    };
    await api.call('settings.save', { settings: saved });
    return saved;
  }, token);
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await enterUpdates(page);
  const enabled = form(page).getByRole('switch', { name: '使用 Mirror酱', exact: true });
  await expect(credential(page)).toHaveValue(token);
  await enabled.click();
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  expect(await settings(page)).toEqual({
    ...initial,
    mirrorChyan: { enabled: false, cdk: token },
  });
  await credential(page).fill('');
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  expect(await settings(page)).toEqual({
    ...initial,
    mirrorChyan: { enabled: false, cdk: '' },
  });
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await enterUpdates(page);
  await expect(enabled).not.toBeChecked();
  await expect(credential(page)).toHaveValue('');
});
