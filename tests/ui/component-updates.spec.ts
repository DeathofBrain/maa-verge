import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Page } from '@playwright/test';
import type { Snapshot, UpdateChannel } from '../../packages/contracts/src/types';

type DownloadWindow = HarnessWindow & {
  downloadControl: {
    started: number;
    checks: number;
    progress: (value: number, speed?: number) => Promise<void>;
    finish: (failed?: boolean) => void;
    notify: () => Promise<void>;
  };
};
type StartupWindow = HarnessWindow & {
  startupComponents: {
    calls: string[];
    update: (
      id: 'core' | 'resource',
      status: UpdateChannel['status'],
      progress: number,
      message: string,
    ) => void;
  };
};

// Hold only the synthetic download RPC. Snapshot/event traffic stays live, just
// as it does while the real service downloads outside the Settings component.
async function controlDownload(page: Page, id: 'core' | 'resource', startup = false) {
  await page.evaluate(
    async ({ id, startup }) => {
      const target = window as DownloadWindow;
      const original = target.runtimeHarness.call;
      const initial = (await original('app.snapshot', {})) as Snapshot;
      const channel: UpdateChannel = {
        ...initial.updates.find((item) => item.id === id)!,
        status: startup ? 'downloading' : 'available',
        latestVersion: id === 'core' ? 'v6.20.0' : '2026-10-20',
        progress: startup ? 23 : 0,
        message: '合成下载，未访问网络',
      };
      let resolve: ((channel: UpdateChannel) => void) | undefined;
      let reject: ((error: Error) => void) | undefined;
      const notify = async () => {
        const state = (await original('app.snapshot', {})) as Snapshot;
        await original('settings.save', { settings: state.settings });
      };
      const control: DownloadWindow['downloadControl'] = {
        started: 0,
        checks: 0,
        notify,
        progress: async (value, speed) => {
          channel.progress = value;
          channel.downloadSpeedBytesPerSecond = speed;
          await notify();
        },
        finish: (failed) => {
          channel.status = failed ? 'failed' : 'staged';
          channel.message = failed ? '合成网络中断，可重试续传' : '合成候选版本已验证';
          if (failed) reject?.(new Error(channel.message));
          else {
            channel.progress = 100;
            resolve?.(structuredClone(channel));
          }
          void notify();
        },
      };
      target.downloadControl = control;
      target.runtimeHarness.call = async (method, params) => {
        if (method === 'updates.check' && params.channel === id) control.checks++;
        if (method === 'updates.prepare' && params.channel === id) {
          control.started++;
          channel.status = 'downloading';
          channel.progress = 0;
          return new Promise<UpdateChannel>((accept, fail) => {
            resolve = accept;
            reject = fail;
          });
        }
        const result = await original(method, params);
        if (method === 'app.snapshot') {
          const snapshot = result as Snapshot;
          snapshot.updates = snapshot.updates.map((item) =>
            item.id === id ? structuredClone(channel) : item,
          );
        }
        return result;
      };
      await notify();
    },
    { id, startup },
  );
}

// Model local first-launch validation/import before the UI receives its first
// snapshot. No download, device operation, or manual prepare RPC is required.
async function controlStartupComponents(page: Page) {
  await page.evaluate(async () => {
    const target = window as StartupWindow;
    const original = target.runtimeHarness.call;
    const initial = (await original('app.snapshot', {})) as Snapshot;
    const components = new Map<'core' | 'resource', UpdateChannel>();
    for (const id of ['core', 'resource'] as const) {
      components.set(id, {
        ...initial.updates.find((channel) => channel.id === id)!,
        currentVersion: '未安装',
        latestVersion: null,
        status: 'downloading',
        progress: id === 'core' ? 23 : 0,
        message:
          id === 'core' ? '正在校验随附组件（1/4），无需联网' : '正在准备随附游戏资源，无需联网',
      });
    }
    const control: StartupWindow['startupComponents'] = {
      calls: [],
      update: (id, status, progress, message) => {
        Object.assign(components.get(id)!, { status, progress, message });
        target.runtimeHarness.emitEvent('update.changed', { channel: id });
      },
    };
    target.startupComponents = control;
    target.runtimeHarness.call = async (method, params) => {
      control.calls.push(method);
      const result = await original(method, params);
      if (method === 'app.snapshot') {
        const snapshot = result as Snapshot;
        snapshot.updates = snapshot.updates.map((channel) =>
          components.has(channel.id as 'core' | 'resource')
            ? structuredClone(components.get(channel.id as 'core' | 'resource')!)
            : channel,
        );
      }
      return result;
    };
  });
}

async function editPlanDuringPreparation(page: Page, description: string) {
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page
    .getByRole('region', { name: '任务表列表', exact: true })
    .getByRole('button', { name: '查看任务表详情每日长草计划', exact: true })
    .click();
  const editor = page.getByRole('region', { name: '任务表工作台', exact: true });
  await editor.getByRole('tab', { name: '任务表设置', exact: true }).click();
  await editor.getByLabel('任务表说明', { exact: true }).fill(description);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const state = (await (window as StartupWindow).runtimeHarness.call(
          'app.snapshot',
          {},
        )) as Snapshot;
        return state.plans.find((plan) => plan.name === '每日长草计划')?.description;
      }),
    )
    .toBe(description);
  // This close control overlaps the notification area at desktop widths. A
  // preparation notice must stay below the editor and leave this clickable.
  await page.getByRole('button', { name: '关闭任务表详情', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '任务表详情', exact: true })).toHaveCount(0);
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await expect(page.getByRole('heading', { name: '设备', exact: true })).toBeVisible();
}

async function updatesPage(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '更新', exact: true })
    .click();
}

test('component downloads keep progress and completion visible after leaving Settings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await controlDownload(page, 'core');
  await updatesPage(page);
  const core = page
    .locator('.update-channel')
    .filter({ has: page.getByRole('heading', { name: 'MaaCore 核心', exact: true }) });
  await core.getByRole('button', { name: '准备更新', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as DownloadWindow).downloadControl.started))
    .toBe(1);
  const notice = page.getByRole('status', { name: 'MaaCore 核心下载通知', exact: true });
  await expect(notice).toContainText('正在准备组件');
  await expect(page.getByRole('button', { name: '检查全部更新', exact: true })).toBeDisabled();
  await expect(page.getByLabel('游戏资源下载目录', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('下载代理模式', { exact: true })).toBeEnabled();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '通用与外观', exact: true })
    .click();
  await expect(page.getByLabel('界面主题', { exact: true })).toBeEnabled();
  await page.locator('.sidebar').getByRole('button', { name: '工具箱', exact: true }).click();
  await page.evaluate(() => (window as DownloadWindow).downloadControl.progress(42));
  await expect(notice.getByRole('progressbar')).toHaveAttribute('value', '42');
  await expect(notice).toContainText('可继续使用其他页面');
  await expect(notice).toBeVisible();
  await page.evaluate(() => (window as DownloadWindow).downloadControl.finish());
  await expect(notice).toContainText('组件已准备，待生效');
  await notice.getByRole('button', { name: '关闭MaaCore 核心下载通知', exact: true }).click();
  await page.evaluate(() => (window as DownloadWindow).downloadControl.notify());
  await expect(page.getByLabel('组件下载通知', { exact: true })).toHaveCount(0);
  await updatesPage(page);
  await expect(core.getByRole('button', { name: '应用更新', exact: true })).toBeEnabled();
  await expect(page.getByLabel('组件下载通知', { exact: true })).toHaveCount(0);
});

test('download failure survives navigation and retries the pinned candidate directly', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await controlDownload(page, 'resource');
  await updatesPage(page);
  const resource = page
    .locator('.update-channel')
    .filter({ has: page.getByRole('heading', { name: '游戏资源', exact: true }) });
  await resource.getByRole('button', { name: '准备更新', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as DownloadWindow).downloadControl.started))
    .toBe(1);
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await page.evaluate(() => (window as DownloadWindow).downloadControl.finish(true));
  const failure = page.getByRole('alert', { name: 'MaaResource 游戏资源下载通知', exact: true });
  await expect(failure).toContainText('合成网络中断，可重试续传');
  await updatesPage(page);
  await resource.getByRole('button', { name: '重试下载', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as DownloadWindow).downloadControl.started))
    .toBe(2);
  expect(await page.evaluate(() => (window as DownloadWindow).downloadControl.checks)).toBe(0);
  await page.evaluate(() => (window as DownloadWindow).downloadControl.finish());
  await expect(
    page.getByRole('status', { name: 'MaaResource 游戏资源下载通知', exact: true }),
  ).toContainText('组件已准备，待生效');
});

test('a preparation overtaken by an installed version does not announce a staged candidate', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await controlDownload(page, 'core');
  await page.evaluate(() => {
    const target = window as DownloadWindow,
      original = target.runtimeHarness.call;
    let installed: UpdateChannel | undefined;
    target.runtimeHarness.call = async (method, params) => {
      if (method === 'updates.prepare') {
        const state = (await original('app.snapshot', {})) as Snapshot;
        const core = state.updates.find((channel) => channel.id === 'core')!;
        installed = {
          ...core,
          currentVersion: core.latestVersion!,
          status: 'idle',
          message: '当前已是最新版本',
        };
        return installed;
      }
      const result = await original(method, params);
      if (method === 'app.snapshot' && installed)
        (result as Snapshot).updates = (result as Snapshot).updates.map((channel) =>
          channel.id === 'core' ? installed! : channel,
        );
      return result;
    };
  });
  await updatesPage(page);
  const core = page
    .locator('.update-channel')
    .filter({ has: page.getByRole('heading', { name: 'MaaCore 核心', exact: true }) });
  await core.getByRole('button', { name: '准备更新', exact: true }).click();
  await expect(core).toContainText('已是最新版本');
  await expect(core.getByRole('button', { name: '应用更新', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('组件下载通知', { exact: true })).toHaveCount(0);
});

for (const id of ['core', 'resource'] as const) {
  test(`${id} activation failure immediately refreshes the invalid candidate without a runtime event`, async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/');
    await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
    await page.evaluate(async (id) => {
      const target = window as HarnessWindow,
        original = target.runtimeHarness.call;
      const initial = (await original('app.snapshot', {})) as Snapshot;
      const channel: UpdateChannel = {
        ...initial.updates.find((item) => item.id === id)!,
        status: 'staged',
        latestVersion: id === 'core' ? 'v6.20.0' : '2026-10-20',
        progress: 100,
        message: '合成候选已校验',
      };
      target.runtimeHarness.call = async (method, params) => {
        if (method === 'updates.activate' && params.channel === id) {
          channel.status = 'available';
          channel.progress = 0;
          channel.message = '更新文件缺失或完整性校验未通过，请重新下载更新';
          // Reconciliation can invalidate a candidate without emitting an event.
          throw new Error(channel.message);
        }
        const result = await original(method, params);
        if (method === 'app.snapshot')
          (result as Snapshot).updates = (result as Snapshot).updates.map((item) =>
            item.id === id ? structuredClone(channel) : item,
          );
        return result;
      };
      target.runtimeHarness.emitEvent('update.changed');
    }, id);
    await updatesPage(page);
    const channel = page.locator('.update-channel').filter({
      has: page.getByRole('heading', {
        name: id === 'core' ? 'MaaCore 核心' : '游戏资源',
        exact: true,
      }),
    });
    await expect(channel.getByRole('button', { name: '应用更新', exact: true })).toBeVisible();
    // Freeze polling so only the failed action's refresh can remove the button.
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await channel.getByRole('button', { name: '应用更新', exact: true }).click();
    await expect(page.locator('.toast.error')).toContainText(
      '更新文件缺失或完整性校验未通过，请重新下载更新',
    );
    await expect(channel.getByRole('button', { name: '应用更新', exact: true })).toHaveCount(0);
    await expect(channel.getByRole('button', { name: '准备更新', exact: true })).toBeVisible();
  });
}

test.describe('startup component download', () => {
  test.use({ runtimeHoldSnapshot: true });
  test('automatic download status appears on Home without opening Settings', async ({ page }) => {
    await page.goto('/');
    await controlDownload(page, 'resource', true);
    await page.evaluate(() => (window as HarnessWindow).runtimeHarness.releaseSnapshot());
    await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
    const notice = page.getByRole('status', { name: 'MaaResource 游戏资源下载通知', exact: true });
    await expect(notice.getByRole('progressbar')).toHaveAttribute('value', '23');
    await page.evaluate(() => (window as DownloadWindow).downloadControl.finish());
    await expect(notice).toContainText('组件已准备，待生效');
  });
  test('a candidate that failed before the first snapshot still reports its error', async ({
    page,
  }) => {
    await page.goto('/');
    await controlDownload(page, 'core', true);
    await page.evaluate(() => {
      (window as DownloadWindow).downloadControl.finish(true);
      (window as HarnessWindow).runtimeHarness.releaseSnapshot();
    });
    await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
    await expect(
      page.getByRole('alert', { name: 'MaaCore 核心下载通知', exact: true }),
    ).toContainText('合成网络中断，可重试续传');
  });

  test('local startup preparation reports live progress while navigation and task editing stay usable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await controlStartupComponents(page);
    await page.evaluate(() => (window as StartupWindow).runtimeHarness.releaseSnapshot());
    await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
    const core = page.getByRole('status', { name: 'MaaCore 核心下载通知', exact: true });
    const resource = page.getByRole('status', {
      name: 'MaaResource 游戏资源下载通知',
      exact: true,
    });
    await expect(core).toContainText('正在准备组件');
    await expect(core).toContainText('正在校验随附组件（1/4），无需联网');
    await expect(
      core.getByRole('progressbar', { name: 'MaaCore 核心准备进度', exact: true }),
    ).toHaveAttribute('value', '23');
    await expect(core).toContainText('23%');
    await expect(resource.getByRole('progressbar')).toHaveAttribute('value', '0');
    await expect(core).toBeVisible();

    await editPlanDuringPreparation(page, '组件后台准备期间仍可编辑并保存');
    await page.evaluate(() =>
      (window as StartupWindow).startupComponents.update(
        'core',
        'downloading',
        68,
        '正在校验组件副本（3/4），无需联网',
      ),
    );
    await expect(core.getByRole('progressbar')).toHaveAttribute('value', '68');
    await expect(core).toContainText('68%');
    await expect(core).toContainText('正在校验组件副本（3/4），无需联网');

    await page.evaluate(() => {
      const control = (window as StartupWindow).startupComponents;
      control.update('core', 'active', 100, '随附核心与基础资源已启用，无需联网');
      control.update('resource', 'downloading', 95, '随附组件已复制并校验，正在验证核心并启用');
    });
    await expect(core).toContainText('已生效');
    await expect(core).toContainText('随附核心与基础资源已启用，无需联网');
    await expect(core.getByRole('progressbar')).toHaveCount(0);
    await expect(resource.getByRole('progressbar')).toHaveAttribute('value', '95');
    await page.evaluate(() =>
      (window as StartupWindow).startupComponents.update(
        'resource',
        'active',
        100,
        '随附游戏资源已启用，无需联网',
      ),
    );
    await expect(resource).toContainText('已生效');
    await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
    await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
    expect(
      await page.evaluate(() =>
        (window as StartupWindow).startupComponents.calls.filter((method) =>
          [
            'updates.prepare',
            'device.connect',
            'device.auto_connect',
            'run.start',
            'tool.start',
          ].includes(method),
        ),
      ),
    ).toEqual([]);
  });

  test('a local component failure before the first snapshot is visible without a version candidate and leaves editing usable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await controlStartupComponents(page);
    await page.evaluate(() => {
      const target = window as StartupWindow;
      target.startupComponents.update(
        'core',
        'failed',
        0,
        '随附组件摘要校验失败，可重启重试随附核心',
      );
      target.runtimeHarness.releaseSnapshot();
    });
    await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
    const failure = page.getByRole('alert', { name: 'MaaCore 核心下载通知', exact: true });
    await expect(failure).toContainText('组件准备失败');
    await expect(failure).toContainText('随附组件摘要校验失败，可重启重试随附核心');
    await editPlanDuringPreparation(page, '组件准备失败后也能编辑并保存');
    await expect(failure).toBeVisible();
    await page.evaluate(() =>
      (window as StartupWindow).startupComponents.update(
        'resource',
        'failed',
        0,
        '随附游戏资源准备失败，已启用的核心及基础资源会保留',
      ),
    );
    await expect(
      page.getByRole('alert', { name: 'MaaResource 游戏资源下载通知', exact: true }),
    ).toContainText('已启用的核心及基础资源会保留');
    await failure.getByRole('button', { name: '关闭MaaCore 核心下载通知', exact: true }).click();
    await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
    await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  });
});

test('component roots save independently and installed resource versions use each client activity', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await harness.call('app.snapshot', {})) as Snapshot;
    snapshot.settings.componentPaths = {
      core: 'C:\\Maa Verge\\MaaCore',
      resource: 'D:\\Game Data\\MaaResource',
    };
    snapshot.settings.connection = {
      adbPath: '',
      address: '',
      config: 'General',
      touchMode: 'minitouch',
      adbLite: false,
      clientType: 'Bilibili',
    };
    await harness.call('settings.save', { settings: snapshot.settings });
    const resource = snapshot.updates.find((channel) => channel.id === 'resource')!;
    resource.currentVersion = 'a'.repeat(40);
    resource.resourceActivities = [
      { clientType: 'Official', name: '合成活动 · 新篇章', lastUpdated: '2026-10-23 12:00:00' },
      { clientType: 'YoStarEN', name: 'Synthetic EN event', lastUpdated: '2026-10-20' },
    ];
    const key = Object.keys(localStorage).find((value) =>
      value.startsWith('maaverge:test-runtime:v1:'),
    )!;
    localStorage.setItem(key, JSON.stringify(snapshot));
  });
  await page.reload();
  await expect(page.locator('.home-version-list')).toContainText('合成活动 · 新篇章');
  await page.getByRole('button', { name: '打开更新设置', exact: true }).click();
  const core = page
    .locator('.update-channel')
    .filter({ has: page.getByRole('heading', { name: 'MaaCore 核心', exact: true }) });
  const resource = page
    .locator('.update-channel')
    .filter({ has: page.getByRole('heading', { name: '游戏资源', exact: true }) });
  await expect(core.getByLabel('MaaCore 核心下载目录', { exact: true })).toHaveValue(
    'C:\\Maa Verge\\MaaCore',
  );
  await expect(resource.getByLabel('游戏资源下载目录', { exact: true })).toHaveValue(
    'D:\\Game Data\\MaaResource',
  );
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.directorySelection = 'E:\\Custom Components\\Core';
  });
  await core.locator('summary').filter({ hasText: '下载与安装目录' }).click();
  await core.getByRole('button', { name: '选择文件夹', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
            .settings.componentPaths,
      ),
    )
    .toEqual({
      core: 'E:\\Custom Components\\Core',
      resource: 'D:\\Game Data\\MaaResource',
    });
  await expect(resource.locator('.channel-version')).toHaveText('合成活动 · 新篇章');
  await expect(resource.getByLabel('资源版本客户端', { exact: true })).toHaveValue('Official');
  await expect(
    resource.getByLabel('资源版本客户端', { exact: true }).locator('option[value="Official"]'),
  ).toHaveText('国服（官服 / B服）');
  await expect(
    resource.getByLabel('资源版本客户端', { exact: true }).locator('option[value="Bilibili"]'),
  ).toHaveCount(0);
  await expect(resource).toContainText('2026-10-23 12:00:00');
  await resource.getByLabel('资源版本客户端', { exact: true }).selectOption('YoStarEN');
  await expect(resource.locator('.channel-version')).toHaveText('Synthetic EN event');
  await resource.getByLabel('资源版本客户端', { exact: true }).selectOption('YoStarJP');
  await expect(resource.locator('.channel-version')).toHaveText('活动信息未提供');
  await resource.getByLabel('资源版本客户端', { exact: true }).selectOption('Official');
  await resource.scrollIntoViewIfNeeded();
});

test('stored update failures explain disk exhaustion in settings and the global notification', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const original = harness.call;
    harness.call = async (method, params) => {
      const result = await original(method, params);
      if (method === 'app.snapshot') {
        const snapshot = result as Snapshot;
        snapshot.updates = snapshot.updates.map((channel) =>
          channel.id === 'core'
            ? {
                ...channel,
                latestVersion: 'v6.20.0',
                status: 'failed',
                message: 'ENOSPC: no space left on device, write',
              }
            : channel,
        );
      }
      return result;
    };
    const state = (await original('app.snapshot', {})) as Snapshot;
    await original('settings.save', { settings: state.settings });
  });
  const failure = page.getByRole('alert', { name: 'MaaCore 核心下载通知', exact: true });
  await expect(failure).toContainText('存储空间不足，请清理目标磁盘后重试');
  await updatesPage(page);
  const core = page
    .locator('.update-channel')
    .filter({ has: page.getByRole('heading', { name: 'MaaCore 核心', exact: true }) });
  await expect(core.locator('.sp-channel-message')).toContainText('存储空间不足');
  await expect(core.locator('.sp-channel-message')).not.toContainText('ENOSPC');
  await expect(core.getByRole('button', { name: '重试下载', exact: true })).toBeEnabled();
});
