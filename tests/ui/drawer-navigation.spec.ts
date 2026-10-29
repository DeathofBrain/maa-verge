import { expect, test } from './fixtures/desktop';

test('nested task and connection drawers return keyboard focus to their own trigger', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  const trigger = page.getByRole('button', { name: '查看任务表详情每日长草计划', exact: true });
  await trigger.click();
  const detail = page.getByRole('dialog', { name: '任务表详情', exact: true });
  const connectionTrigger = detail.getByRole('button', { name: '管理设备连接', exact: true });
  await connectionTrigger.click();
  const connection = page.getByRole('dialog', { name: '设备连接设置', exact: true });
  await expect(connection).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(connection).toHaveCount(0);
  await expect(connectionTrigger).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole('tab', { name: '执行监控', exact: true }).click();
  const logsTrigger = page.getByRole('button', { name: '查看设备日志本地模拟设备', exact: true });
  await logsTrigger.click();
  const logs = page.getByRole('dialog', { name: '设备日志', exact: true });
  await expect(logs).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(logs).toHaveCount(0);
  await expect(logsTrigger).toBeFocused();
});
