import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Snapshot } from '../../packages/contracts/src/types';
import type { Page } from '@playwright/test';

type LogHarnessWindow = HarnessWindow & {
  logHarness: {
    exportCalls: number;
    cleanCalls: number;
    hold: boolean;
    fail: string;
    release: () => void;
  };
};

async function openLogSettings(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '数据与诊断', exact: true }).click();
  await expect(page.getByRole('button', { name: '导出日志', exact: true })).toBeVisible();
}

async function controlLogs(page: Page) {
  await page.evaluate(() => {
    const target = window as LogHarnessWindow;
    const original = target.runtimeHarness.call;
    const held: (() => void)[] = [];
    const control = {
      exportCalls: 0,
      cleanCalls: 0,
      hold: false,
      fail: '',
      release: () => {
        control.hold = false;
        held.splice(0).forEach((release) => release());
      },
    };
    target.logHarness = control;
    target.runtimeHarness.call = async (method, params) => {
      if (method === 'logs.export' || method === 'logs.clean') {
        if (method === 'logs.export') control.exportCalls++;
        else control.cleanCalls++;
        if (control.hold) await new Promise<void>((resolve) => held.push(resolve));
        if (control.fail === method)
          throw new Error(
            method === 'logs.export' ? '合成导出失败：目录不可写' : '合成日志清理失败',
          );
      }
      return original(method, params);
    };
  });
}

test('global log search opens the diagnostic settings category', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('搜索任务与设置').fill('日志');
  await page
    .getByRole('region', { name: '搜索结果' })
    .getByRole('button', { name: '数据与诊断', exact: false })
    .click();
  await expect(page.getByRole('button', { name: '导出日志', exact: true })).toBeVisible();
});

test('log export reports the returned directory and complete path in a persistent narrow dialog', async ({
  page,
}) => {
  await openLogSettings(page);
  const directory = 'C:\\Maa Verge\\日志导出\\' + '很长的目录名'.repeat(12);
  const path = directory + '\\maaverge-2026-10-23.log';
  await page.evaluate(
    ({ directory, path }) => {
      const harness = (window as HarnessWindow).runtimeHarness;
      const original = harness.call;
      harness.call = async (method, params) =>
        method === 'logs.export'
          ? {
              directory,
              path,
              bytes: 1234,
              warnings: ['worker.stderr.log 正在使用，仅导出当前可读内容。'],
            }
          : original(method, params);
    },
    { directory, path },
  );
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '导出日志', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '日志已导出（含提示）', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(directory, { exact: true })).toBeVisible();
  await expect(dialog.getByText(path, { exact: true })).toBeVisible();
  await expect(dialog).toContainText('worker.stderr.log 正在使用');
  await page.evaluate(async () => {
    await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {});
  });
  await expect(dialog).toBeVisible();
  expect(downloads).toBe(0);
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '导出日志', exact: true })).toBeFocused();
});

test('log retention saves automatically and survives reload', async ({ page }) => {
  await openLogSettings(page);
  const retention = page.getByLabel('自动清理日志', { exact: true });
  await expect(retention).toHaveValue('7');
  await retention.selectOption('14');
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
            .settings.logRetentionDays,
      ),
    )
    .toBe(14);
  await page.getByRole('button', { name: '通用与外观', exact: true }).click();
  await page.getByRole('button', { name: '数据与诊断', exact: true }).click();
  await expect(retention).toHaveValue('14');
  await retention.selectOption('0');
  await expect(page.locator('.log-retention-form .sp-form-actions > .sp-help')).toHaveText(
    '已自动保存',
  );
  expect(
    await page.evaluate(
      async () =>
        ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
          .settings.logRetentionDays,
    ),
  ).toBe(0);
  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '数据与诊断', exact: true }).click();
  await expect(retention).toHaveValue('0');
});

test('log cleanup requires confirmation and reports preserved active files', async ({ page }) => {
  await openLogSettings(page);
  await controlLogs(page);
  await page.getByRole('button', { name: '清理日志', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '清理日志', exact: true });
  await expect(confirmation).toContainText('数据库、事件记录和截图不受影响');
  expect(await page.evaluate(() => (window as LogHarnessWindow).logHarness.cleanCalls)).toBe(0);
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  expect(await page.evaluate(() => (window as LogHarnessWindow).logHarness.cleanCalls)).toBe(0);
  await page.getByRole('button', { name: '清理日志', exact: true }).click();
  await confirmation.getByRole('button', { name: '确认清理', exact: true }).click();
  const result = page.getByRole('dialog', { name: '日志清理完成', exact: true });
  await expect(result).toContainText('已清理 2 个文件');
  await expect(result).toContainText('已保留 1 个正在使用或不适合清理的日志文件');
  expect(await page.evaluate(() => (window as LogHarnessWindow).logHarness.cleanCalls)).toBe(1);
  await page.keyboard.press('Escape');
  await expect(result).toHaveCount(0);
});

test('log operations block overlapping actions and failures never show a success dialog', async ({
  page,
}) => {
  await openLogSettings(page);
  await controlLogs(page);
  await page.evaluate(() => {
    const control = (window as LogHarnessWindow).logHarness;
    control.hold = true;
    control.fail = 'logs.export';
  });
  await page.getByRole('button', { name: '导出日志', exact: true }).click();
  await expect(page.getByRole('button', { name: '正在导出…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '清理日志', exact: true })).toBeDisabled();
  await expect(page.getByLabel('自动清理日志', { exact: true })).toBeDisabled();
  await expect
    .poll(() => page.evaluate(() => (window as LogHarnessWindow).logHarness.exportCalls))
    .toBe(1);
  await page.evaluate(() => (window as LogHarnessWindow).logHarness.release());
  await expect(page.getByRole('alert')).toContainText('合成导出失败：目录不可写');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => {
    (window as LogHarnessWindow).logHarness.fail = 'logs.clean';
  });
  await page.getByRole('button', { name: '清理日志', exact: true }).click();
  await page.getByRole('button', { name: '确认清理', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('合成日志清理失败');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '导出日志', exact: true })).toBeEnabled();
});
