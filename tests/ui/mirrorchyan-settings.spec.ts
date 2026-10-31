import type { Page } from '@playwright/test';
import type { Snapshot, UpdateChannel } from '../../packages/contracts/src/types';
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
const settings = (page: Page) =>
  page.evaluate(
    async () =>
      ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
        .settings,
  );

test('CDK drafts stay in memory and autosave only the complete normalized credential', async ({
  page,
}) => {
  await openMirrorSettings(page);
  await expect(credential(page)).toHaveAttribute('type', 'password');
  const initial = await settings(page);
  const token = 'synthetic-mirror-cdk-memory';
  await page.clock.install({ time: new Date('2026-10-30T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-30T00:00:01Z'));
  await credential(page).fill(token.slice(0, -6));
  await page.clock.runFor(400);
  await credential(page).fill(`  ${token}  `);
  expect(await settings(page)).toEqual(initial);
  const stored = await page.evaluate(() => ({
    session: Object.values(sessionStorage).join('\n'),
    local: Object.values(localStorage).join('\n'),
  }));
  expect(stored.session).not.toContain(token);
  expect(stored.local).not.toContain(token);
  await page.clock.runFor(500);
  await expect
    .poll(async () => (await settings(page)).mirrorChyan)
    .toEqual({
      enabled: true,
      cdk: token,
    });
  await expect(credential(page)).toHaveValue(token);
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await enterUpdates(page);
  await expect(credential(page)).toHaveValue(token);
});

test('failed CDK saves preserve the credential across settings categories and allow retry', async ({
  page,
}) => {
  await openMirrorSettings(page);
  const initial = await settings(page);
  const token = 'synthetic-mirror-cdk-retry';
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = true;
  });
  await credential(page).fill(token);
  await credential(page).blur();
  await expect(page.getByRole('alert')).toContainText('合成设置保存失败');
  await expect(credential(page)).toHaveValue(token);
  await expect(form(page).getByRole('button', { name: '重试', exact: true })).toBeEnabled();
  expect(await settings(page)).toEqual(initial);
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '通用与外观', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '更新', exact: true })
    .click();
  await expect(credential(page)).toHaveValue(token);
  await expect(form(page).getByRole('button', { name: '重试', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = false;
  });
  await form(page).getByRole('button', { name: '重试', exact: true }).click();
  await expect
    .poll(async () => (await settings(page)).mirrorChyan)
    .toEqual({
      enabled: true,
      cdk: token,
    });
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
  await expect
    .poll(() => settings(page))
    .toEqual({
      ...initial,
      mirrorChyan: { enabled: false, cdk: token },
    });
  await credential(page).fill('');
  await expect
    .poll(() => settings(page))
    .toEqual({
      ...initial,
      mirrorChyan: { enabled: false, cdk: '' },
    });
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await enterUpdates(page);
  await expect(enabled).not.toBeChecked();
  await expect(credential(page)).toHaveValue('');
});

type DownloadSourceWindow = HarnessWindow & {
  downloadSourceControl: { setSource: (source?: UpdateChannel['downloadSource']) => void };
};

async function controlDownloadSource(page: Page, id: UpdateChannel['id']) {
  await page.evaluate(async (id) => {
    const target = window as DownloadSourceWindow;
    const original = target.runtimeHarness.call;
    const initial = (await original('app.snapshot', {})) as Snapshot;
    const channel: UpdateChannel = {
      ...initial.updates.find((item) => item.id === id)!,
      status: 'downloading',
      latestVersion: 'synthetic-new-version',
      progress: 37,
      message: '合成下载，未访问网络',
    };
    target.runtimeHarness.call = async (method, params) => {
      const result = await original(method, params);
      if (method === 'app.snapshot') {
        const snapshot = result as Snapshot;
        snapshot.updates = snapshot.updates.map((item) =>
          item.id === id ? structuredClone(channel) : item,
        );
      }
      return result;
    };
    target.downloadSourceControl = {
      setSource: (source) => {
        channel.downloadSource = source;
        target.runtimeHarness.emitEvent('update.changed', {
          channel: id,
          update: structuredClone(channel),
        });
      },
    };
    target.downloadSourceControl.setSource();
  }, id);
}

for (const [id, label] of [
  ['app', 'Maa Verge 应用'],
  ['core', 'MaaCore 核心'],
  ['resource', 'MaaResource 游戏资源'],
] as const) {
  test(`${id} download source follows the selected transport across navigation and fallback`, async ({
    page,
  }) => {
    await openMirrorSettings(page);
    await controlDownloadSource(page, id);
    const source = page.getByLabel(`${id === 'resource' ? '游戏资源' : label}下载来源`, {
      exact: true,
    });
    await expect(source).toHaveCount(0);
    await page.evaluate(() =>
      (window as DownloadSourceWindow).downloadSourceControl.setSource('MirrorChyan'),
    );
    await expect(source).toHaveText('下载来源：Mirror酱');
    await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
    await expect(page.getByRole('status', { name: `${label}下载通知`, exact: true })).toBeVisible();
    await enterUpdates(page);
    await expect(source).toHaveText('下载来源：Mirror酱');
    await page.evaluate(() =>
      (window as DownloadSourceWindow).downloadSourceControl.setSource('GitHub'),
    );
    await expect(source).toHaveText('下载来源：官方源');
    await page.evaluate(() => (window as DownloadSourceWindow).downloadSourceControl.setSource());
    await expect(source).toHaveCount(0);
  });
}
