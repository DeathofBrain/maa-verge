import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { navigate, readSnapshot } from './fixtures/navigation';

const framework = (page: Page) =>
  page
    .locator('.update-channel')
    .filter({ has: page.getByRole('heading', { name: 'MaaFramework', exact: true }) });

async function openUpdates(page: Page) {
  await navigate(page, '设置');
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '更新', exact: true })
    .click();
}

async function recordUpdateCalls(page: Page) {
  await page.evaluate(() => {
    const target = window as HarnessWindow & { frameworkUpdateCalls: string[] };
    const original = target.runtimeHarness.call;
    target.frameworkUpdateCalls = [];
    target.runtimeHarness.call = async (method, params) => {
      if (method.startsWith('updates.'))
        target.frameworkUpdateCalls.push(`${method}:${params.channel}`);
      return original(method, params);
    };
  });
}

const updateCalls = (page: Page) =>
  page.evaluate(
    () => (window as HarnessWindow & { frameworkUpdateCalls: string[] }).frameworkUpdateCalls,
  );

test('MaaFramework has independent stable compatibility preferences and a preserved component directory', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '组件版本', exact: true })).toContainText(
    'MaaFramework',
  );
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await harness.call('app.snapshot', {})) as Snapshot;
    await harness.call('settings.save', {
      settings: {
        ...snapshot.settings,
        componentPaths: { resource: '/fixture/resource' },
      },
    });
    harness.directorySelection = '/fixture/framework';
  });
  await recordUpdateCalls(page);
  const initial = (await readSnapshot(page)).settings;
  await openUpdates(page);
  await expect(framework(page)).toContainText('未安装');
  await expect(framework(page)).toContainText('v5.14.3');
  await expect(framework(page)).toContainText('稳定兼容版');
  await expect(framework(page).getByRole('combobox')).toHaveCount(0);
  await expect(
    framework(page).getByRole('button', { name: '下载安装', exact: true }),
  ).toBeEnabled();
  expect(await updateCalls(page)).toEqual([]);
  await framework(page)
    .getByRole('switch', { name: '自动检查 MaaFramework 更新', exact: true })
    .uncheck();
  await expect
    .poll(async () => (await readSnapshot(page)).settings.autoUpdateFramework)
    .toBe(false);
  await framework(page).getByText('下载与安装目录', { exact: true }).first().click();
  await framework(page).getByRole('button', { name: '选择文件夹', exact: true }).click();
  await expect
    .poll(async () => (await readSnapshot(page)).settings.componentPaths)
    .toEqual({
      resource: '/fixture/resource',
      framework: '/fixture/framework',
    });
  const saved = (await readSnapshot(page)).settings;
  expect(saved.autoUpdateResource).toBe(initial.autoUpdateResource);
  expect(saved.appUpdateChannel).toBe(initial.appUpdateChannel);
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await openUpdates(page);
  await expect(
    framework(page).getByRole('switch', { name: '自动检查 MaaFramework 更新', exact: true }),
  ).not.toBeChecked();
  await expect(framework(page).getByLabel('MaaFramework下载目录', { exact: true })).toHaveValue(
    '/fixture/framework',
  );
});

test('MaaFramework install, activation, and rollback use only its own channel', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  const initial = await readSnapshot(page);
  await recordUpdateCalls(page);
  await openUpdates(page);
  await framework(page).getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(
    framework(page).getByRole('button', { name: '下载安装', exact: true }),
  ).toBeEnabled();
  await framework(page).getByRole('button', { name: '下载安装', exact: true }).click();
  await expect(
    framework(page).getByRole('button', { name: '应用更新', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('status', { name: 'MaaFramework下载通知', exact: true }),
  ).toContainText('组件已准备');
  await framework(page).getByRole('button', { name: '应用更新', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await readSnapshot(page)).updates.find((item) => item.id === 'framework')?.currentVersion,
    )
    .toBe('v5.14.3');
  await framework(page).getByRole('button', { name: '回滚上一版本', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await readSnapshot(page)).updates.find((item) => item.id === 'framework')?.currentVersion,
    )
    .toBe('v5.14.2');
  expect(await updateCalls(page)).toEqual([
    'updates.check:framework',
    'updates.prepare:framework',
    'updates.activate:framework',
    'updates.rollback:framework',
  ]);
  const current = await readSnapshot(page);
  expect(current.updates.filter((item) => item.id !== 'framework')).toEqual(
    initial.updates.filter((item) => item.id !== 'framework'),
  );
  expect(current.runs).toEqual(initial.runs);
});

test('MaaFramework can retry a failed repair of the installed compatibility version', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await harness.call('app.snapshot', {})) as Snapshot;
    await harness.call('settings.save', { settings: snapshot.settings });
    Object.assign(
      snapshot.updates.find((channel) => channel.id === 'framework')!,
      {
        currentVersion: 'v5.14.3',
        latestVersion: 'v5.14.3',
        status: 'failed',
        message: '合成同版本组件校验失败，需重新准备',
      },
    );
    const key = Object.keys(localStorage).find((value) =>
      value.startsWith('maaverge:test-runtime:v1:'),
    )!;
    localStorage.setItem(key, JSON.stringify(snapshot));
  });
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await recordUpdateCalls(page);
  await openUpdates(page);
  await expect(
    framework(page).getByRole('button', { name: '重试下载', exact: true }),
  ).toBeEnabled();
  await framework(page).getByRole('button', { name: '重试下载', exact: true }).click();
  await expect(
    framework(page).getByRole('button', { name: '应用更新', exact: true }),
  ).toBeEnabled();
  expect(await updateCalls(page)).toEqual(['updates.prepare:framework']);
});
