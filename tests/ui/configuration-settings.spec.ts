import { type Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

async function configurationPage(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '数据与诊断', exact: true })
    .click();
  return page.getByRole('form', { name: '配置目录设置' });
}

async function selectConfigurationDirectory(page: Page, directory: string | null) {
  await page.evaluate((directory) => {
    (window as HarnessWindow).runtimeHarness.directorySelection = directory;
  }, directory);
  await page.getByRole('button', { name: '选择配置目录', exact: true }).click();
}

test('configuration directory saves for restart and can be restored without switching live data', async ({
  page,
}) => {
  await page.goto('/');
  const form = await configurationPage(page);
  await expect(form).toContainText('/fixture/app/config/native/maaverge.sqlite3');
  await expect(form.getByLabel('配置目录', { exact: true })).toHaveValue('');
  await form.getByRole('button', { name: '打开当前配置目录' }).click();
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.commands)).toContain(
    'open_configuration_directory',
  );
  await selectConfigurationDirectory(page, null);
  expect(
    await page.evaluate(() => (window as HarnessWindow).runtimeHarness.configurationWrites),
  ).toBe(0);
  await selectConfigurationDirectory(page, '/fixture/second-config');
  await expect(form.getByRole('status')).toContainText('完全退出 Maa Verge 后重新打开');
  expect(
    await page.evaluate(() => (window as HarnessWindow).runtimeHarness.configuration),
  ).toMatchObject({
    directory: '/fixture/app/config',
    configuredDirectory: '/fixture/second-config',
    restartRequired: true,
  });
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await configurationPage(page);
  await expect(form.getByLabel('配置目录', { exact: true })).toHaveValue('/fixture/second-config');
  await form.getByRole('button', { name: '恢复默认配置目录' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as HarnessWindow).runtimeHarness.configuration))
    .toMatchObject({
      directory: '/fixture/app/config',
      configuredDirectory: null,
      restartRequired: false,
    });
  await expect(form.getByLabel('配置目录', { exact: true })).toHaveValue('');
});

test('failed automatic directory saves retain the selection and allow retry', async ({ page }) => {
  await page.goto('/');
  const form = await configurationPage(page);
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failConfiguration = true;
  });
  await selectConfigurationDirectory(page, '/fixture/retry');
  await expect(form.getByRole('alert')).toContainText('合成配置目录不可写');
  await expect(form.getByLabel('配置目录', { exact: true })).toHaveValue('/fixture/retry');
  expect(
    await page.evaluate(
      () => (window as HarnessWindow).runtimeHarness.configuration.configuredDirectory,
    ),
  ).toBeNull();
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failConfiguration = false;
  });
  await form.getByRole('button', { name: '重试保存配置目录', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as HarnessWindow).runtimeHarness.configuration.configuredDirectory,
      ),
    )
    .toBe('/fixture/retry');
});

test('an explicit startup override disables directory changes while allowing the current folder to open', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const configuration = (window as HarnessWindow).runtimeHarness.configuration;
    configuration.overridden = true;
    configuration.source = 'environment';
  });
  const form = await configurationPage(page);
  await expect(form.getByLabel('配置目录', { exact: true })).toBeDisabled();
  await expect(form.getByRole('button', { name: '选择配置目录', exact: true })).toBeDisabled();
  await expect(form.getByRole('button', { name: '恢复默认配置目录' })).toBeDisabled();
  await expect(form.getByRole('status')).toContainText('MAAVERGE_DATA_DIR');
  await form.getByRole('button', { name: '打开当前配置目录' }).click();
  expect(
    await page.evaluate(() => (window as HarnessWindow).runtimeHarness.configurationWrites),
  ).toBe(0);
});
