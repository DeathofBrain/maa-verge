import { expect, test } from './fixtures/desktop';

test('resource activity stages and manual input share the saved stage without losing unknown names', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page
    .locator('.tc-heading')
    .getByRole('button', { name: '新建任务表', exact: true })
    .click();
  const wb = page.getByRole('region', { name: '任务表工作台', exact: true });
  const manual = wb.getByRole('checkbox', { name: '手动输入关卡', exact: true });
  await expect(manual).not.toBeChecked();
  await expect(
    wb.getByRole('combobox', { name: '作战关卡', exact: true }).locator('option[value="TEST-1"]'),
  ).toHaveCount(1);
  await wb.getByRole('combobox', { name: '作战关卡', exact: true }).selectOption('TEST-1');
  await manual.check();
  await expect(wb.getByRole('textbox', { name: '作战关卡', exact: true })).toHaveValue('TEST-1');
  await wb.getByRole('textbox', { name: '作战关卡', exact: true }).fill('FUTURE-99');
  await page.keyboard.press('Control+s');
  await expect(wb.locator('.wb-save-state')).toHaveText('已保存');
  await page.reload();
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '查看任务表详情日常表1', exact: true }).click();
  await expect(manual).toBeChecked();
  await expect(wb.getByRole('textbox', { name: '作战关卡', exact: true })).toHaveValue('FUTURE-99');
  await manual.uncheck();
  await expect(wb.getByRole('combobox', { name: '作战关卡', exact: true })).toHaveValue('');
  await wb.getByRole('button', { name: '设置第 1 条启动游戏', exact: true }).click();
  await wb.getByRole('combobox', { name: '游戏客户端', exact: true }).selectOption('YoStarJP');
  await wb.getByRole('button', { name: '设置第 2 条自动作战', exact: true }).click();
  await expect(
    wb.getByRole('combobox', { name: '作战关卡', exact: true }).locator('option[value="JP-1"]'),
  ).toHaveCount(1);
  await expect(
    wb.getByRole('combobox', { name: '作战关卡', exact: true }).locator('option[value="TEST-1"]'),
  ).toHaveCount(0);
});
