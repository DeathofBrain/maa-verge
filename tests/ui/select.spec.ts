import type { Locator, Page } from '@playwright/test';
import type { RpcResult } from '../../packages/contracts/src/index';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

const menu = (page: Page) => page.locator('[data-select-menu]:visible');
const option = (page: Page, value: string) =>
  menu(page).locator(`[role="option"][data-value=${JSON.stringify(value)}]`);

async function navigate(page: Page, name: string) {
  const navigation = page.getByRole('button', { name: '打开导航', exact: true });
  if (await navigation.isVisible()) await navigation.click();
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
}

async function openMenu(page: Page, control: Locator) {
  await control.click();
  await expect(menu(page)).toBeVisible();
  await expect(control).toHaveAttribute('aria-expanded', 'true');
}

async function openCopilot(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await navigate(page, '作业中心');
  return page.getByRole('combobox', { name: '查看作业设备', exact: true });
}

test('shared select supports pointer and keyboard selection and dismissal', async ({ page }) => {
  const control = await openCopilot(page);
  await openMenu(page, control);
  await expect(option(page, '')).toHaveText('全部设备');
  await expect(option(page, '')).toHaveAttribute('aria-selected', 'true');
  await option(page, 'mock-device-1').click();
  await expect(control).toHaveValue('mock-device-1');
  await expect(menu(page)).toHaveCount(0);
  await expect(control).toBeFocused();

  await control.press('ArrowDown');
  await expect(menu(page)).toBeVisible();
  await control.press('Home');
  await control.press('Enter');
  await expect(control).toHaveValue('');
  await expect(menu(page)).toHaveCount(0);

  await control.press('Enter');
  await expect(menu(page)).toBeVisible();
  await control.press('End');
  await control.press('Enter');
  await expect(control).toHaveValue('mock-device-1');

  await openMenu(page, control);
  await control.press('Home');
  await control.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(control).toHaveValue('mock-device-1');
  await expect(control).toBeFocused();

  await openMenu(page, control);
  await control.press('Tab');
  await expect(menu(page)).toHaveCount(0);
  await expect(control).not.toBeFocused();

  await openMenu(page, control);
  await page.getByRole('heading', { name: '作业中心', exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(control).toHaveValue('mock-device-1');
});

test('closed selects support F4, Home and End, and buffered typeahead', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  const devices = await page.evaluate(async () => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const berry = (await harness.call('device.connect', {
      address: '127.0.0.1:15580',
      name: 'Berry device',
    })) as { id: string };
    const bravo = (await harness.call('device.connect', {
      address: '127.0.0.1:15581',
      name: 'Bravo device',
    })) as { id: string };
    return { berry: berry.id, bravo: bravo.id };
  });
  await navigate(page, '作业中心');
  const control = page.getByRole('combobox', { name: '查看作业设备', exact: true });
  await expect(control.locator(`option[value=${JSON.stringify(devices.bravo)}]`)).toHaveCount(1);
  await control.focus();
  await control.press('F4');
  await expect(menu(page)).toBeVisible();
  await control.press('F4');
  await expect(menu(page)).toHaveCount(0);
  await expect(control).toBeFocused();

  await control.press('End');
  await expect(menu(page)).toBeVisible();
  await expect(control).toHaveAttribute(
    'aria-activedescendant',
    (await option(page, devices.bravo).getAttribute('id')) as string,
  );
  await control.press('Enter');
  await expect(control).toHaveValue(devices.bravo);
  await control.press('Home');
  await expect(menu(page)).toBeVisible();
  await expect(control).toHaveAttribute(
    'aria-activedescendant',
    (await option(page, '').getAttribute('id')) as string,
  );
  await control.press('Enter');
  await expect(control).toHaveValue('');

  await control.press('b');
  await expect(menu(page)).toBeVisible();
  await expect(control).toHaveAttribute(
    'aria-activedescendant',
    (await option(page, devices.berry).getAttribute('id')) as string,
  );
  await control.press('r');
  await expect(control).toHaveAttribute(
    'aria-activedescendant',
    (await option(page, devices.bravo).getAttribute('id')) as string,
  );
  await control.press('Enter');
  await expect(control).toHaveValue(devices.bravo);
  await expect(menu(page)).toHaveCount(0);
});

test('stage groups preserve unavailable options and Escape dismisses the menu before its drawer', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      const result = await original(method, params);
      if (method === 'stages.list') {
        (result as RpcResult<'stages.list'>).stages.push({
          value: 'TEST-CLOSED',
          label: 'TEST-CLOSED · 未开放活动关卡',
          category: 'activity',
          available: false,
          tip: '活动尚未开放',
        });
      }
      return result;
    };
  });
  await navigate(page, '任务');
  await page
    .locator('.tc-heading')
    .getByRole('button', { name: '新建任务表', exact: true })
    .click();
  const drawer = page.getByRole('dialog', { name: '任务表详情', exact: true });
  // The first save replaces the new-table editor with its persisted instance.
  await expect(drawer.locator('.wb-save-state')).toHaveText('已保存');
  const control = drawer.getByRole('combobox', { name: '作战关卡', exact: true });
  await expect(control.locator('option[value="TEST-CLOSED"]')).toHaveCount(1);
  await openMenu(page, control);
  await expect(menu(page).getByText('资源活动关卡', { exact: true })).toBeVisible();
  await expect(menu(page).getByText('常驻关卡', { exact: true })).toBeVisible();
  await expect(option(page, 'TEST-CLOSED')).toHaveAttribute('aria-disabled', 'true');
  await expect(option(page, 'TEST-CLOSED')).toContainText('活动尚未开放');
  await option(page, 'TEST-1').click();
  await expect(control).toHaveValue('TEST-1');

  await openMenu(page, control);
  await control.press('ArrowDown');
  await control.press('Enter');
  await expect(control).toHaveValue('1-7');

  await openMenu(page, control);
  await control.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await expect(control).toBeFocused();
  await control.press('Escape');
  await expect(drawer).toBeHidden();
});
