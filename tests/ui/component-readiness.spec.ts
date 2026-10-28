import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';
import type { RpcResult } from '../../packages/contracts/src/transport';

type ProbeWindow = HarnessWindow & {
  gameDataProbe: {
    home: number;
    stages: number;
    hold: boolean;
    fail: boolean;
    installed: boolean;
    release: () => void;
  };
};
const fallbackMessage = '组件尚未安装完成，显示常驻关卡';

async function installProbe(page: Page, installed = false) {
  await page.addInitScript(
    ({ installed, fallbackMessage }) => {
      const target = window as ProbeWindow;
      const harness = target.runtimeHarness;
      const original = harness.call;
      const waiters: (() => void)[] = [];
      const probe = (target.gameDataProbe = {
        home: 0,
        stages: 0,
        hold: false,
        fail: false,
        installed,
        release: () => {
          probe.hold = false;
          waiters.splice(0).forEach((resolve) => resolve());
        },
      });
      const catalog = (result: RpcResult<'stages.list'>): RpcResult<'stages.list'> =>
        probe.installed
          ? result
          : {
              ...result,
              source: 'builtin',
              resourceVersion: null,
              activities: [],
              stages: result.stages.filter((stage) => stage.category !== 'activity'),
              message: fallbackMessage,
              calendar: {
                source: 'unavailable',
                url: null,
                fetchedAt: null,
                checkedAt: null,
                nextRefreshAt: null,
                stale: true,
                refreshing: false,
                error: '合成离线环境',
              },
            };
      harness.call = async (method, params) => {
        if (method === 'home.info' || method === 'stages.list') {
          if (method === 'home.info') probe.home++;
          else probe.stages++;
          if (probe.hold) await new Promise<void>((resolve) => waiters.push(resolve));
          if (probe.fail) throw new Error('合成资源读取失败');
        }
        const result = await original(method, params);
        if (method === 'app.snapshot' && !probe.installed) {
          const snapshot = result as Snapshot;
          snapshot.devices = [];
          snapshot.updates = snapshot.updates.map((channel) =>
            channel.id === 'app' ? channel : { ...channel, currentVersion: '未安装' },
          );
        }
        if (method === 'home.info') {
          const info = result as RpcResult<'home.info'>;
          return { ...info, activityCatalog: catalog(info.activityCatalog) };
        }
        return method === 'stages.list' ? catalog(result as RpcResult<'stages.list'>) : result;
      };
    },
    { installed, fallbackMessage },
  );
}

async function emitPreparationEvents(page: Page) {
  await page.evaluate(async () => {
    const harness = (window as ProbeWindow).runtimeHarness;
    for (const channel of ['core', 'resource']) {
      for (const status of [
        'checking',
        'available',
        'downloading',
        'downloading',
        'failed',
        'staged',
        'waiting_idle',
      ]) {
        harness.emitEvent('update.changed', {
          channel,
          update: { status, progress: 40, currentVersion: '未安装' },
        });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }
    harness.emitEvent('update.changed', { channel: 'app', update: { status: 'active' } });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

test('missing components and download progress keep homepage fallback content stable until activation', async ({
  page,
}) => {
  await installProbe(page);
  await page.goto('/');
  const panel = page.getByRole('region', { name: '游戏日与活动提醒', exact: true });
  await expect(panel).toContainText(fallbackMessage);
  await expect(page.locator('.home-version-list')).toContainText('未安装');
  await page.evaluate(() => {
    (window as ProbeWindow).gameDataProbe.hold = true;
  });
  const baseline = await page.evaluate(() => (window as ProbeWindow).gameDataProbe.home);
  await emitPreparationEvents(page);
  expect(await page.evaluate(() => (window as ProbeWindow).gameDataProbe.home)).toBe(baseline);
  await expect(panel.locator('.game-day')).toBeVisible();
  await expect(panel).toContainText(fallbackMessage);
  await expect(panel).not.toContainText('正在读取');

  await page.evaluate(() =>
    (window as ProbeWindow).runtimeHarness.emitEvent('update.changed', {
      channel: 'resource',
      update: { status: 'active' },
    }),
  );
  await expect
    .poll(() => page.evaluate(() => (window as ProbeWindow).gameDataProbe.home))
    .toBe(baseline + 1);
  await expect(panel.locator('.game-day')).toBeVisible();
  await expect(panel).toContainText(fallbackMessage);
  await page.evaluate(() => {
    const probe = (window as ProbeWindow).gameDataProbe;
    probe.installed = true;
    probe.release();
  });
  await expect(panel).toContainText('合成限时活动');
  await expect(panel).not.toContainText(fallbackMessage);
  await page.evaluate(() => {
    const target = window as ProbeWindow;
    target.gameDataProbe.installed = false;
    target.runtimeHarness.emitEvent('update.changed', {
      channel: 'resource',
      update: { status: 'active' },
    });
  });
  await expect(panel).toContainText(fallbackMessage);
  await expect(panel).not.toContainText('合成限时活动');
});

test('homepage background errors and retries preserve content, while changing client clears old data', async ({
  page,
}) => {
  await installProbe(page, true);
  await page.goto('/');
  const panel = page.getByRole('region', { name: '游戏日与活动提醒', exact: true });
  await expect(panel).toContainText('合成限时活动');
  await page.evaluate(() => {
    const target = window as ProbeWindow;
    target.gameDataProbe.fail = true;
    target.runtimeHarness.emitEvent('calendar.changed');
  });
  await expect(panel.getByRole('alert')).toHaveText('合成资源读取失败');
  await expect(panel).toContainText('合成限时活动');
  await page.evaluate(() => {
    const target = window as ProbeWindow;
    target.gameDataProbe.hold = true;
    target.gameDataProbe.fail = false;
    target.runtimeHarness.emitEvent('calendar.changed');
  });
  await expect(page.getByRole('button', { name: '刷新游戏提醒', exact: true })).toBeDisabled();
  await expect(panel).toContainText('合成限时活动');
  await expect(panel.getByRole('alert')).toHaveText('合成资源读取失败');
  await page.evaluate(() => (window as ProbeWindow).gameDataProbe.release());
  await expect(panel.getByRole('alert')).toHaveCount(0);

  await page.evaluate(() => {
    (window as ProbeWindow).gameDataProbe.hold = true;
  });
  await page.getByLabel('提醒使用的客户端', { exact: true }).selectOption('YoStarJP');
  await expect(panel).not.toContainText('合成限时活动');
  await expect(panel.locator('.game-day')).toHaveCount(0);
  await page.evaluate(() => (window as ProbeWindow).gameDataProbe.release());
  await expect(panel).toContainText('日服合成活动');
  await expect(panel).toContainText('日服 · 游戏日');
});

test('stage fallback stays loaded during preparation, refresh and installation', async ({
  page,
}) => {
  await installProbe(page);
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page
    .locator('.tc-heading')
    .getByRole('button', { name: '新建任务表', exact: true })
    .click();
  const selector = page.locator('.stage-selector');
  const stage = page.getByRole('combobox', { name: '作战关卡', exact: true });
  await expect(selector).toContainText(fallbackMessage);
  await stage.selectOption('1-7');
  // First save replaces the new-table editor; let its catalog finish loading
  // before holding requests meant to exercise an existing selector's refresh.
  await expect(page.locator('.wb-save-state')).toHaveText('已保存');
  await expect(page.getByRole('button', { name: '取消新建', exact: true })).toHaveCount(0);
  await expect(selector).toContainText(fallbackMessage);
  await page.evaluate(() => {
    (window as ProbeWindow).gameDataProbe.hold = true;
  });
  const baseline = await page.evaluate(() => (window as ProbeWindow).gameDataProbe.stages);
  await emitPreparationEvents(page);
  expect(await page.evaluate(() => (window as ProbeWindow).gameDataProbe.stages)).toBe(baseline);
  await expect(selector).toContainText(fallbackMessage);
  await expect(stage).toHaveValue('1-7');
  await expect(page.getByRole('checkbox', { name: '手动输入关卡', exact: true })).not.toBeChecked();

  await page.getByRole('button', { name: '刷新关卡目录', exact: true }).click();
  await expect(page.getByRole('button', { name: '刷新关卡目录', exact: true })).toBeDisabled();
  await expect(selector).toContainText(fallbackMessage);
  await expect(selector).not.toContainText('正在读取当前资源');
  await page.evaluate(() => (window as ProbeWindow).gameDataProbe.release());
  await expect(page.getByRole('button', { name: '刷新关卡目录', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const target = window as ProbeWindow;
    target.gameDataProbe.installed = true;
    target.runtimeHarness.emitEvent('update.changed', {
      channel: 'core',
      update: { status: 'active' },
    });
  });
  await expect(stage.locator('option[value="TEST-1"]')).toHaveCount(1);
  await expect(stage).toHaveValue('1-7');
});

test('failed stage refresh preserves selected activity and recovers without switching to manual input', async ({
  page,
}) => {
  await installProbe(page, true);
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page
    .locator('.tc-heading')
    .getByRole('button', { name: '新建任务表', exact: true })
    .click();
  const stage = page.getByRole('combobox', { name: '作战关卡', exact: true });
  await expect(stage.locator('option[value="TEST-1"]')).toHaveCount(1);
  await stage.selectOption('TEST-1');
  await page.evaluate(() => {
    const target = window as ProbeWindow;
    target.gameDataProbe.fail = true;
    target.runtimeHarness.emitEvent('calendar.changed');
  });
  await expect(page.locator('.stage-selector').getByRole('status').last()).toContainText(
    '合成资源读取失败',
  );
  await expect(stage).toHaveValue('TEST-1');
  await expect(page.getByRole('checkbox', { name: '手动输入关卡', exact: true })).not.toBeChecked();
  await page.evaluate(() => {
    (window as ProbeWindow).gameDataProbe.fail = false;
  });
  await page.getByRole('button', { name: '刷新关卡目录', exact: true }).click();
  await expect(page.locator('.stage-selector')).not.toContainText('合成资源读取失败');
  await expect(stage).toHaveValue('TEST-1');
});
