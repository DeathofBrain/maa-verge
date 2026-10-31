import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { DesktopUninstallInfo } from '../../packages/contracts/src/types';

type UninstallWindow = HarnessWindow & {
  __TAURI_INTERNALS__: {
    invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
  uninstallCommands: { command: string; args?: Record<string, unknown> }[];
  uninstallInfo: DesktopUninstallInfo;
  holdUninstall: boolean;
  failUninstall: boolean;
  releaseUninstall?: () => void;
};

const info: DesktopUninstallInfo = {
  available: true,
  reason: '',
  application: '/Applications/Maa Verge.app',
  componentDirectories: [
    '/Users/fixture/Library/Application Support/Maa Verge/MaaCore',
    '/Users/fixture/Library/Application Support/Maa Verge/MaaResource',
  ],
  configurationDirectory: '/Applications/config',
};

async function openAbout(page: Page, available = true) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.evaluate(
    ({ info, available }) => {
      const target = window as unknown as UninstallWindow;
      target.uninstallCommands = [];
      target.uninstallInfo = {
        ...info,
        available,
        reason: available ? '' : '开发模式不提供卸载，请安装 DMG 后使用。',
      };
      target.holdUninstall = false;
      target.failUninstall = false;
      const invoke = target.__TAURI_INTERNALS__.invoke.bind(target.__TAURI_INTERNALS__);
      target.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (!['get_desktop_uninstall_info', 'uninstall_desktop_application'].includes(command))
          return invoke(command, args);
        target.uninstallCommands.push({ command, args });
        if (command === 'get_desktop_uninstall_info') return target.uninstallInfo;
        if (target.holdUninstall)
          await new Promise<void>((resolve) => {
            target.releaseUninstall = resolve;
          });
        if (target.failUninstall) throw new Error('组件仍被另一实例占用');
      };
    },
    { info, available },
  );
  await page.getByRole('button', { name: '关于', exact: true }).click();
}

const uninstallCalls = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as UninstallWindow).uninstallCommands.filter(
      ({ command }) => command === 'uninstall_desktop_application',
    ),
  );

test.describe('macOS application uninstall', () => {
  test.use({ runtimePlatform: 'macos' });

  test('confirmation lists fixed cleanup directories and cancel never requests uninstall', async ({
    page,
  }) => {
    await openAbout(page);
    const trigger = page.getByRole('button', { name: '卸载 Maa Verge', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '卸载 Maa Verge', exact: true });
    await expect(dialog).toContainText(info.application);
    for (const directory of info.componentDirectories)
      await expect(dialog).toContainText(directory);
    await expect(dialog).toContainText('自定义组件目录也会保留');
    await expect(dialog).toContainText(info.configurationDirectory);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await uninstallCalls(page)).toEqual([]);
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await uninstallCalls(page)).toEqual([]);
  });

  test('confirmation prevents duplicate requests, blocks closing during cleanup and reports host failures', async ({
    page,
  }) => {
    await openAbout(page);
    await page.evaluate(() => {
      const target = window as unknown as UninstallWindow;
      target.holdUninstall = true;
      target.failUninstall = true;
    });
    await page.getByRole('button', { name: '卸载 Maa Verge', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '卸载 Maa Verge', exact: true });
    await dialog.getByRole('button', { name: '确认卸载', exact: true }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect
      .poll(() => uninstallCalls(page))
      .toEqual([{ command: 'uninstall_desktop_application', args: {} }]);
    await expect(dialog.getByRole('button', { name: '正在卸载…', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as UninstallWindow).releaseUninstall?.();
    });
    await expect(dialog.getByRole('alert')).toContainText('组件仍被另一实例占用');
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeEnabled();
    await page.evaluate(() => {
      const target = window as unknown as UninstallWindow;
      target.holdUninstall = false;
      target.failUninstall = false;
    });
    await dialog.getByRole('button', { name: '确认卸载', exact: true }).click();
    await expect.poll(async () => (await uninstallCalls(page)).length).toBe(2);
    await expect(dialog.getByRole('button', { name: '正在卸载…', exact: true })).toBeDisabled();
  });

  test('unavailable installations explain why uninstall is disabled', async ({ page }) => {
    await openAbout(page, false);
    await expect(page.getByRole('button', { name: '卸载 Maa Verge', exact: true })).toBeDisabled();
    await expect(page.getByText('开发模式不提供卸载，请安装 DMG 后使用。')).toBeVisible();
    expect(await uninstallCalls(page)).toEqual([]);
  });
});

for (const platform of ['windows', 'linux'] as const) {
  test.describe(`${platform} has no macOS uninstall entry`, () => {
    test.use({ runtimePlatform: platform });
    test('does not request uninstall information or show the entry', async ({ page }) => {
      await openAbout(page);
      await expect(page.getByRole('button', { name: '卸载 Maa Verge', exact: true })).toHaveCount(
        0,
      );
      expect(
        await page.evaluate(() => (window as unknown as UninstallWindow).uninstallCommands),
      ).toEqual([]);
    });
  });
}
