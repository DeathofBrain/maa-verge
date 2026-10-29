import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Page } from '@playwright/test';
import type { Snapshot, UpdateChannel } from '../../packages/contracts/src/types';

type AppUpdateWindow = HarnessWindow & {
  appUpdateControl: {
    checks: number;
    prepared: number;
    downloads: number;
    componentChecks: number;
    installed: number;
    finish: () => void;
    setRunning: (value: boolean) => void;
    finishInstallation: () => void;
    finishComponentCheck: () => void;
  };
};

const appSection = (page: Page) =>
  page
    .locator('.update-channel')
    .filter({ has: page.getByRole('heading', { name: 'Maa Verge 应用', exact: true }) });
const coreSection = (page: Page) =>
  page
    .locator('.update-channel')
    .filter({ has: page.getByRole('heading', { name: 'MaaCore 核心', exact: true }) });
const home = (page: Page) => page.getByRole('region', { name: '主页仪表盘' });
async function settingsCategory(page: Page, name: string) {
  const menu = page.getByRole('button', { name: '打开导航', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name, exact: true })
    .click();
}

// All installer responses remain inside this browser bridge. No network,
// filesystem installer, platform updater or real device is used by these tests.
async function controlAppUpdate(
  page: Page,
  options: {
    supported?: boolean;
    staged?: boolean;
    currentVersion?: string;
    noUpdate?: boolean;
    componentDownloading?: boolean;
    holdInstallation?: boolean;
    attempted?: boolean;
    holdComponentCheck?: boolean;
  } = {},
) {
  await page.evaluate(async (options) => {
    const target = window as AppUpdateWindow;
    const original = target.runtimeHarness.call;
    const initial = (await original('app.snapshot', {})) as Snapshot;
    const channel: UpdateChannel = {
      ...initial.updates.find((item) => item.id === 'app')!,
      currentVersion: options.currentVersion ?? '0.1.0',
      latestVersion: '0.1.1',
      status: options.noUpdate ? 'idle' : options.staged ? 'staged' : 'available',
      progress: options.staged ? 100 : 0,
      appCanInstall: options.supported ?? true,
      appInstallOnStartup: !options.attempted,
      checkedAt: '2026-10-23T03:00:00.000Z',
      message:
        options.supported === false
          ? '此软件包请使用系统软件包管理器更新'
          : '合成签名更新，不访问网络',
      appRelease: {
        url: 'javascript:alert(1)',
        notes: '<img src=x onerror=alert(1)>\n[外部链接](javascript:alert(1))\n合成发布说明',
        publishedAt: '2026-10-23T02:00:00.000Z',
        prerelease: false,
      },
    };
    let complete: ((channel: UpdateChannel) => void) | undefined;
    let finishInstallation: (() => void) | undefined;
    let finishComponentCheck: (() => void) | undefined;
    let running = false;
    const notify = () => target.runtimeHarness.emitEvent('update.changed', { channel: 'app' });
    target.appUpdateControl = {
      checks: 0,
      prepared: 0,
      downloads: 0,
      componentChecks: 0,
      installed: 0,
      finish: () => {
        channel.status = 'staged';
        channel.appInstallOnStartup = true;
        channel.progress = 100;
        channel.message = '合成签名已验证，尚未安装';
        complete?.(structuredClone(channel));
        notify();
      },
      setRunning: (value) => {
        running = value;
        notify();
      },
      finishInstallation: () => finishInstallation?.(),
      finishComponentCheck: () => finishComponentCheck?.(),
    };
    target.runtimeHarness.call = async (method, params) => {
      if (params.channel === 'app') {
        if (method === 'updates.check') {
          target.appUpdateControl.checks++;
          return structuredClone(channel);
        }
        if (method === 'updates.prepare') {
          target.appUpdateControl.prepared++;
          if (channel.status === 'staged') {
            channel.appInstallOnStartup = true;
            notify();
            return structuredClone(channel);
          }
          target.appUpdateControl.downloads++;
          channel.status = 'downloading';
          channel.progress = 37;
          channel.downloadSpeedBytesPerSecond = 1572864;
          notify();
          return new Promise<UpdateChannel>((resolve) => {
            complete = resolve;
          });
        }
        if (method === 'updates.activate') {
          if (channel.appCanInstall !== true || channel.status !== 'staged')
            throw new Error('合成安装前置条件不满足');
          target.appUpdateControl.installed++;
          if (options.holdInstallation)
            await new Promise<void>((resolve) => {
              finishInstallation = resolve;
            });
          running = false;
          channel.status = 'active';
          channel.currentVersion = channel.latestVersion;
          notify();
          return structuredClone(channel);
        }
      }
      if (method === 'updates.check' && params.channel === 'core' && options.holdComponentCheck) {
        target.appUpdateControl.componentChecks++;
        await new Promise<void>((resolve) => {
          finishComponentCheck = resolve;
        });
      }
      const result = await original(method, params);
      if (method === 'app.snapshot') {
        const snapshot = result as Snapshot;
        snapshot.updates = snapshot.updates.map((item) =>
          item.id === 'app' ? structuredClone(channel) : item,
        );
        if (options.componentDownloading)
          snapshot.updates = snapshot.updates.map((item) =>
            item.id === 'core' ? { ...item, status: 'downloading', progress: 12 } : item,
          );
        if (running)
          snapshot.runs.push({
            id: 'synthetic-active',
            planId: 'daily',
            deviceId: 'mock-device-1',
            status: 'running',
            progress: 25,
            message: '合成运行中任务',
            startedAt: new Date().toISOString(),
            finishedAt: null,
          });
      }
      return result;
    };
    notify();
  }, options);
}

test('app and core update channels persist independently with startup checks', async ({ page }) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await settingsCategory(page, '更新');
  await expect(page.getByLabel('应用更新频道', { exact: true })).toHaveValue('preview');
  await expect(page.getByLabel('MaaCore 更新频道', { exact: true })).toHaveValue('stable');
  await page.getByLabel('应用更新频道', { exact: true }).selectOption('stable');
  await expect(page.getByLabel('应用更新频道', { exact: true })).toBeEnabled();
  await page.getByLabel('MaaCore 更新频道', { exact: true }).selectOption('preview');
  await expect(page.getByLabel('MaaCore 更新频道', { exact: true })).toBeEnabled();
  await page.getByRole('switch', { name: '启动时检查应用更新', exact: true }).click();
  await expect(
    page.getByRole('switch', { name: '启动时检查应用更新', exact: true }),
  ).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(home(page)).toBeVisible();
  await settingsCategory(page, '更新');
  await expect(page.getByLabel('应用更新频道', { exact: true })).toHaveValue('stable');
  await expect(page.getByLabel('MaaCore 更新频道', { exact: true })).toHaveValue('preview');
  await expect(
    page.getByRole('switch', { name: '启动时检查应用更新', exact: true }),
  ).toHaveAttribute('aria-checked', 'false');
  await appSection(page).getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(appSection(page)).toContainText('0.1.1');
  await coreSection(page).getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(coreSection(page)).toContainText('v6.21.0-beta.1');
  await page.getByLabel('应用更新频道', { exact: true }).selectOption('preview');
  await expect(page.getByLabel('应用更新频道', { exact: true })).toBeEnabled();
  await appSection(page).getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(appSection(page)).toContainText('0.2.0-beta.1');
  await expect(page.getByLabel('MaaCore 更新频道', { exact: true })).toHaveValue('preview');
});

test('app download survives navigation and installation requires explicit confirmation', async ({
  page,
}) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await controlAppUpdate(page);
  await settingsCategory(page, '更新');
  const app = appSection(page);
  await app.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.checks))
    .toBe(1);
  await expect(app).toContainText('上次检查：');
  await expect(app).not.toContainText('尚未检查');
  await app.locator('summary').click();
  await expect(app.locator('.sp-release-notes pre')).toContainText('<img src=x onerror=alert(1)>');
  await expect(app.locator('.sp-release-notes img, .sp-release-notes a')).toHaveCount(0);
  await app.getByRole('button', { name: '下载更新', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.prepared))
    .toBe(1);
  await expect(app.getByLabel('Maa Verge 应用下载速度', { exact: true })).toHaveText(
    '下载速度：1.5 MB/s',
  );
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  const notice = page.getByRole('status', { name: 'Maa Verge 应用下载通知', exact: true });
  await expect(notice.getByRole('progressbar')).toHaveAttribute('value', '37');
  await expect(notice.getByLabel('Maa Verge 应用下载速度', { exact: true })).toHaveText('1.5 MB/s');
  await page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.finish());
  await expect(notice).toContainText('签名已验证，等待确认重启');
  await expect(notice.getByLabel('Maa Verge 应用下载速度', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.installed)).toBe(0);
  await settingsCategory(page, '更新');
  await expect(app.getByLabel('Maa Verge 应用下载速度', { exact: true })).toHaveCount(0);
  await app.getByRole('button', { name: '安装并重启', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '安装应用更新', exact: true });
  await expect(confirmation).toContainText('请先保存未保存的更改');
  await expect(confirmation).toContainText('更新包已保存');
  await expect(confirmation).toContainText('下次启动时将自动安装');
  await confirmation.getByRole('button', { name: '下次启动时更新', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  expect(await page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.installed)).toBe(0);
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await expect(notice).toContainText('下次启动时自动安装');
  await settingsCategory(page, '更新');
  await app.getByRole('button', { name: '安装并重启', exact: true }).click();
  await confirmation.getByRole('button', { name: '立即更新并重启', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.installed))
    .toBe(1);
  await expect(confirmation).toHaveCount(0);
});

test('an interrupted installation can be rescheduled without downloading or installing again', async ({
  page,
}) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await controlAppUpdate(page, { staged: true, attempted: true });
  const notice = page.getByRole('status', { name: 'Maa Verge 应用下载通知', exact: true });
  await expect(notice).toContainText('上次安装未完成，更新包已保留');
  await expect(notice).not.toContainText('也会在下次启动时自动安装');
  await settingsCategory(page, '更新');
  const app = appSection(page);
  await expect(app.locator('.sp-update-state')).toHaveText('上次安装未完成，可重试');
  await app.getByRole('button', { name: '安装并重启', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '安装应用更新', exact: true });
  await confirmation.getByRole('button', { name: '关闭安装确认', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  expect(await page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.prepared)).toBe(0);
  await app.getByRole('button', { name: '安装并重启', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(notice).toContainText('上次安装未完成，更新包已保留');
  await app.getByRole('button', { name: '安装并重启', exact: true }).click();
  await confirmation.getByRole('button', { name: '下次启动时更新', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(notice).toContainText('也会在下次启动时自动安装');
  await expect(app.locator('.sp-update-state')).toHaveText('签名已验证，待安装');
  expect(
    await page.evaluate(() => {
      const { prepared, downloads, installed } = (window as AppUpdateWindow).appUpdateControl;
      return { prepared, downloads, installed };
    }),
  ).toEqual({ prepared: 1, downloads: 0, installed: 0 });
});

test('active tasks require confirmation to stop execution and install the application', async ({
  page,
}) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await controlAppUpdate(page, { staged: true });
  await settingsCategory(page, '更新');
  await page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.setRunning(true));
  await expect(
    appSection(page).getByRole('button', { name: '安装并重启', exact: true }),
  ).toBeEnabled();
  await expect(appSection(page)).toContainText('立即更新将停止当前执行，未执行的计划会保留');
  await appSection(page).getByRole('button', { name: '安装并重启', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '安装应用更新', exact: true });
  await expect(confirmation.getByRole('status')).toHaveText(
    '立即更新将停止当前执行，未执行的计划会保留。',
  );
  await expect(
    confirmation.getByRole('button', { name: '立即更新并重启', exact: true }),
  ).toBeEnabled();
  await confirmation.getByRole('button', { name: '下次启动时更新', exact: true }).click();
  expect(await page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.installed)).toBe(0);
  await appSection(page).getByRole('button', { name: '安装并重启', exact: true }).click();
  await confirmation.getByRole('button', { name: '立即更新并重启', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.installed))
    .toBe(1);
});

test('component downloads do not block application installation and pending installation cannot repeat', async ({
  page,
}) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await controlAppUpdate(page, {
    staged: true,
    componentDownloading: true,
    holdInstallation: true,
  });
  await settingsCategory(page, '更新');
  await expect(
    coreSection(page).getByRole('button', { name: '检查更新', exact: true }),
  ).toHaveCount(0);
  await appSection(page).getByRole('button', { name: '安装并重启', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '安装应用更新', exact: true });
  const install = confirmation.getByRole('button', { name: '立即更新并重启', exact: true });
  await install.click();
  await expect
    .poll(() => page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.installed))
    .toBe(1);
  await expect(install).toBeDisabled();
  await expect(
    confirmation.getByRole('button', { name: '下次启动时更新', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeVisible();
  await page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.finishInstallation());
  await expect(confirmation).toHaveCount(0);
  expect(await page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.installed)).toBe(1);
});

test('an unresolved component request does not block the application installation confirmation', async ({
  page,
}) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await controlAppUpdate(page, { staged: true, holdComponentCheck: true, holdInstallation: true });
  await settingsCategory(page, '更新');
  const coreCheck = coreSection(page).getByRole('button', { name: '检查更新', exact: true });
  await coreCheck.click();
  await expect
    .poll(() => page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.componentChecks))
    .toBe(1);
  await expect(coreCheck).toBeDisabled();
  await appSection(page).getByRole('button', { name: '安装并重启', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '安装应用更新', exact: true });
  const install = confirmation.getByRole('button', { name: '立即更新并重启', exact: true });
  await expect(install).toBeEnabled();
  await install.click();
  await expect
    .poll(() => page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.installed))
    .toBe(1);
  await expect(install).toBeDisabled();
  await page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.finishInstallation());
  await expect(confirmation).toHaveCount(0);
  await expect(coreCheck).toBeDisabled();
  await page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.finishComponentCheck());
  await expect(coreCheck).toBeEnabled();
});

test('unsupported installers show platform guidance without download or install actions', async ({
  page,
}) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await controlAppUpdate(page, { supported: false });
  await settingsCategory(page, '更新');
  await expect(appSection(page)).toContainText('当前安装方式不支持自动安装');
  await expect(appSection(page)).toContainText('系统软件包管理器更新');
  await expect(appSection(page).getByRole('button', { name: '下载更新', exact: true })).toHaveCount(
    0,
  );
  await expect(
    appSection(page).getByRole('button', { name: '安装并重启', exact: true }),
  ).toHaveCount(0);
  await expect(
    appSection(page).getByRole('button', { name: '检查更新', exact: true }),
  ).toBeEnabled();
});

test('switching a staged preview core to stable cancels the old candidate and notification', async ({
  page,
}) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await settingsCategory(page, '更新');
  await page.getByLabel('MaaCore 更新频道', { exact: true }).selectOption('preview');
  await expect(page.getByLabel('MaaCore 更新频道', { exact: true })).toBeEnabled();
  await coreSection(page).getByRole('button', { name: '检查更新', exact: true }).click();
  await coreSection(page).getByRole('button', { name: '准备更新', exact: true }).click();
  await expect(
    coreSection(page).getByRole('button', { name: '应用更新', exact: true }),
  ).toBeEnabled();
  await expect(coreSection(page)).toContainText('切换频道会取消已准备的版本，下次检查使用新频道');
  await expect(coreSection(page)).toContainText('v6.21.0-beta.1');
  await page.getByLabel('MaaCore 更新频道', { exact: true }).selectOption('stable');
  await expect(
    coreSection(page).getByRole('button', { name: '应用更新', exact: true }),
  ).toHaveCount(0);
  await expect(
    coreSection(page).getByRole('button', { name: '准备更新', exact: true }),
  ).toHaveCount(0);
  await expect(coreSection(page)).not.toContainText('v6.21.0-beta.1');
  await expect(page.getByRole('status', { name: 'MaaCore 核心下载通知', exact: true })).toHaveCount(
    0,
  );
  await coreSection(page).getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(coreSection(page)).toContainText('v6.20.0');
});

test('changing the app channel invalidates its staged installation confirmation', async ({
  page,
}) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await settingsCategory(page, '更新');
  await appSection(page).getByRole('button', { name: '检查更新', exact: true }).click();
  await appSection(page).getByRole('button', { name: '下载更新', exact: true }).click();
  await expect(
    appSection(page).getByRole('button', { name: '安装并重启', exact: true }),
  ).toBeEnabled();
  await expect(appSection(page)).toContainText('切换频道会取消已准备的版本并重新检查');
  await appSection(page).getByRole('button', { name: '安装并重启', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '安装应用更新', exact: true });
  await expect(confirmation).toBeVisible();
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await harness.call('app.snapshot', {})) as Snapshot;
    await harness.call('settings.save', {
      settings: { ...snapshot.settings, appUpdateChannel: 'stable' },
    });
  });
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByLabel('应用更新频道', { exact: true })).toHaveValue('stable');
  await expect(
    appSection(page).getByRole('button', { name: '安装并重启', exact: true }),
  ).toHaveCount(0);
  await expect(appSection(page).locator('.channel-version')).toHaveText('0.1.0');
  await expect(
    page.getByRole('status', { name: 'Maa Verge 应用下载通知', exact: true }),
  ).toHaveCount(0);
});

test('a preview newer than stable stays installed without a downgrade candidate', async ({
  page,
}) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await controlAppUpdate(page, { currentVersion: '0.2.0-beta.1', noUpdate: true });
  await settingsCategory(page, '更新');
  await page.getByLabel('应用更新频道', { exact: true }).selectOption('stable');
  await appSection(page).getByRole('button', { name: '检查更新', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as AppUpdateWindow).appUpdateControl.checks))
    .toBe(1);
  await expect(appSection(page).locator('.sp-update-state')).toHaveText('暂无新版本');
  await expect(appSection(page).locator('.channel-version')).toHaveText('0.2.0-beta.1');
  await expect(appSection(page).locator('.channel-version svg')).toHaveCount(0);
  await expect(appSection(page).getByRole('button', { name: '下载更新', exact: true })).toHaveCount(
    0,
  );
  await expect(
    appSection(page).getByRole('button', { name: '安装并重启', exact: true }),
  ).toHaveCount(0);
});

test('check all continues after failures and reports the failed channel', async ({ page }) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await page.evaluate(() => {
    const target = window as HarnessWindow & { checkedChannels: string[] };
    const original = target.runtimeHarness.call;
    target.checkedChannels = [];
    target.runtimeHarness.call = async (method, params) => {
      if (method === 'updates.check') {
        target.checkedChannels.push(String(params.channel));
        if (params.channel === 'app') throw new Error('合成发布源不可达');
      }
      return original(method, params);
    };
  });
  await settingsCategory(page, '更新');
  await page.getByRole('button', { name: '检查全部更新', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as HarnessWindow & { checkedChannels: string[] }).checkedChannels,
      ),
    )
    .toEqual(['app', 'core', 'resource']);
  await expect(page.locator('.toast')).toContainText('Maa Verge 应用：合成发布源不可达');
  await expect(coreSection(page)).toContainText('v6.20.0');
  await expect(
    page
      .locator('.update-channel')
      .filter({ has: page.getByRole('heading', { name: '游戏资源', exact: true }) }),
  ).toContainText('2026-10-20');
});

test('about and sidebar use the runtime application version and narrow updates can be cancelled', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await controlAppUpdate(page, { currentVersion: '0.9.3', staged: true });
  await settingsCategory(page, '关于');
  await expect(page.locator('.sp-description-list').filter({ hasText: '应用版本' })).toContainText(
    '0.9.3',
  );
  await expect(page.locator('.sp-settings-content')).not.toContainText('开发预览');
  await expect(page.locator('.sidebar-footer')).toContainText('0.9.3');
  await page.setViewportSize({ width: 390, height: 844 });
  await settingsCategory(page, '更新');
  await appSection(page).locator('summary').click();
  await page.screenshot({ path: testInfo.outputPath('app-updates-narrow.png') });
  await appSection(page).getByRole('button', { name: '安装并重启', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '安装应用更新', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('app-install-confirmation-narrow.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '安装应用更新', exact: true })).toHaveCount(0);
});
