import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';

async function openNotifications(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toHaveCount(1);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '通知与远控', exact: true }).click();
  return page.getByRole('region', { name: '系统通知设置' });
}

async function savedNotifications(page: Page) {
  return page.evaluate(
    async () =>
      ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
        .settings.notifications,
  );
}

test('notification category and master preferences are saved explicitly and survive reloads', async ({
  page,
}) => {
  const region = await openNotifications(page);
  const save = region.getByRole('button', { name: '保存通知设置', exact: true });
  await region.getByRole('checkbox', { name: '执行结果通知', exact: false }).uncheck();
  expect(await savedNotifications(page)).toBeUndefined();
  await save.click();
  await expect(save).toBeDisabled();
  expect(await savedNotifications(page)).toEqual({
    enabled: true,
    runResults: false,
    deviceErrors: true,
    updates: true,
    schedules: true,
  });
  await region.getByRole('checkbox', { name: '启用系统通知', exact: false }).uncheck();
  await expect(region.getByRole('checkbox', { name: '定时系统通知', exact: false })).toBeDisabled();
  await expect(region.getByRole('button', { name: '发送测试通知', exact: true })).toBeDisabled();
  await save.click();
  await expect(save).toBeDisabled();
  expect((await savedNotifications(page))?.enabled).toBe(false);
  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '通知与远控', exact: true }).click();
  await expect(
    region.getByRole('checkbox', { name: '启用系统通知', exact: false }),
  ).not.toBeChecked();
  await expect(
    region.getByRole('checkbox', { name: '执行结果通知', exact: false }),
  ).not.toBeChecked();
  await expect(region.getByRole('button', { name: '发送测试通知', exact: true })).toBeDisabled();
});

test('failed notification saves retain drafts and allow retry', async ({ page }) => {
  const region = await openNotifications(page);
  await region.getByRole('checkbox', { name: '更新结果通知', exact: false }).uncheck();
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = true;
  });
  const save = region.getByRole('button', { name: '保存通知设置', exact: true });
  await save.click();
  await expect(page.locator('.toast.error')).toContainText('合成设置保存失败');
  await expect(
    region.getByRole('checkbox', { name: '更新结果通知', exact: false }),
  ).not.toBeChecked();
  await expect(save).toBeEnabled();
  expect(await savedNotifications(page)).toBeUndefined();
  await page.getByRole('button', { name: '通用与外观', exact: true }).click();
  await page.getByRole('button', { name: '通知与远控', exact: true }).click();
  await expect(
    region.getByRole('checkbox', { name: '更新结果通知', exact: false }),
  ).not.toBeChecked();
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = false;
  });
  await save.click();
  await expect(save).toBeDisabled();
  expect((await savedNotifications(page))?.updates).toBe(false);
});

test('permission checks and test notices use fixed host commands and report send failures', async ({
  page,
}) => {
  const region = await openNotifications(page);
  const send = region.getByRole('button', { name: '发送测试通知', exact: true });
  await expect(send).toBeEnabled();
  await region.getByRole('button', { name: '检查并启用通知通道', exact: true }).click();
  await send.click();
  await expect(region.getByRole('status')).toContainText('测试通知已提交给系统');
  const commands = await page.evaluate(() =>
    (window as HarnessWindow).runtimeHarness.commands.filter((command) =>
      command.startsWith('desktop_'),
    ),
  );
  expect(commands).toContain('desktop_notification_status:false');
  expect(commands.filter((command) => command !== 'desktop_notification_status:false')).toEqual([
    'desktop_notification_status:true',
    'desktop_test_notification',
  ]);
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failNotifications = true;
  });
  await send.click();
  await expect(region.getByRole('alert')).toContainText('合成系统通知发送失败');
  await expect(region.getByRole('status')).toHaveCount(0);
});

test('denied permission and unavailable desktop hosts disable test sending', async ({ page }) => {
  const region = await openNotifications(page);
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.notificationPermission = 'denied';
  });
  await region.getByRole('button', { name: '检查并启用通知通道', exact: true }).click();
  await expect(region).toContainText('通知通道未授权');
  await expect(region.getByRole('button', { name: '发送测试通知', exact: true })).toBeDisabled();
  expect(
    await page.evaluate(() =>
      (window as HarnessWindow).runtimeHarness.commands.filter(
        (command) => command === 'desktop_test_notification',
      ),
    ),
  ).toHaveLength(0);
  await page.getByRole('button', { name: '通用与外观', exact: true }).click();
  await page.evaluate(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });
  await page.getByRole('button', { name: '通知与远控', exact: true }).click();
  await expect(region).toContainText('仅桌面应用可用');
  await expect(
    region.getByRole('button', { name: '检查并启用通知通道', exact: true }),
  ).toBeDisabled();
  await expect(region.getByRole('button', { name: '发送测试通知', exact: true })).toBeDisabled();
});
