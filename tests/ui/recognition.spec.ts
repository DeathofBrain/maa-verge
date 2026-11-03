import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { RpcResult } from '../../packages/contracts/src/index';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { restoreHistoricalRecognition, restoreHistoricalRuns } from './fixtures/history';

const depot = (page: Page) => page.getByRole('region', { name: '仓库识别结果', exact: true });
const operators = (page: Page) => page.getByRole('region', { name: '干员识别结果', exact: true });

async function openTools(page: Page, kind: '仓库' | '干员' = '仓库') {
  await page.locator('.sidebar').getByRole('button', { name: '工具箱', exact: true }).click();
  if ((await page.getByLabel('工具箱设备', { exact: true }).inputValue()) === '')
    await page.getByLabel('工具箱设备', { exact: true }).selectOption('mock-device-1');
  await page
    .getByRole('navigation', { name: '工具分类', exact: true })
    .getByRole('button', { name: kind, exact: true })
    .click();
}

async function downloadResult(page: Page, label: string) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const path = await download.path();
  if (!path) throw new Error('The recognition export did not create a local file');
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
}

test('recognition requires completed structured results and ignores unrelated warehouse events', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘' })).toBeVisible();
  const at = '2026-10-24T08:00:00.000Z';
  await restoreHistoricalRuns(page, [
    {
      id: 'stopped-recognition',
      planId: 'old-depot-event',
      planName: '历史仓库事件：固源岩 999',
      deviceId: 'mock-device-1',
      status: 'stopped',
      progress: 0,
      message: '旧事件文字不证明结构化识别结果',
      startedAt: at,
      finishedAt: at,
      tasks: [],
    },
  ]);
  await openTools(page);
  await expect(depot(page).getByRole('listitem')).toHaveCount(0);
  await expect(depot(page)).toContainText('尚无仓库识别结果');
  await expect(depot(page).getByRole('button', { name: '导出仓库结果', exact: true })).toHaveCount(
    0,
  );
  await expect(depot(page)).not.toContainText('固源岩 999');
  await openTools(page, '干员');
  await expect(operators(page).getByRole('table')).toHaveCount(0);
  await expect(operators(page)).toContainText('尚无干员识别结果');
  await expect(
    operators(page).getByRole('button', { name: '导出干员结果', exact: true }),
  ).toHaveCount(0);
});

test('historical warehouse recognition searches and exports persistent quantities while new scans stay blocked', async ({
  page,
}) => {
  await page.goto('/');
  const historical: RpcResult<'recognition.get'> = {
    deviceId: 'mock-device-1',
    kind: 'depot',
    clientType: 'Official',
    collectedAt: '2026-10-24T08:00:00.000Z',
    runId: 'historical-depot',
    items: [
      { id: '30012', name: '固源岩', quantity: 42 },
      { id: '30013', name: '固源岩组', quantity: 7 },
      { id: 'fixture-no-icon', name: '合成无图材料', quantity: 3 },
    ],
    operators: [],
  };
  await restoreHistoricalRecognition(page, [historical]);
  await openTools(page);
  await page.getByRole('button', { name: '开始仓库识别', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('尚未迁移');
  const started = (await page.evaluate(async () =>
    (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
  )) as RpcResult<'app.snapshot'>;
  expect(started.plans).toHaveLength(2);
  expect(started.runs).toHaveLength(0);
  expect(started.toolJobs).toHaveLength(0);
  await expect(depot(page).getByRole('listitem')).toHaveCount(3);
  const rock = depot(page)
    .getByRole('listitem')
    .filter({ has: page.getByText('固源岩', { exact: true }) });
  await expect(rock).toContainText('42');
  await depot(page).getByLabel('搜索仓库物品', { exact: true }).fill('30013');
  await expect(depot(page).getByRole('listitem')).toHaveCount(1);
  await expect(depot(page).getByRole('listitem')).toContainText('固源岩组');
  await depot(page).getByLabel('搜索仓库物品', { exact: true }).fill('不存在的材料');
  await expect(depot(page).getByRole('listitem')).toHaveCount(0);
  await depot(page).getByLabel('搜索仓库物品', { exact: true }).fill('');
  expect(await downloadResult(page, '导出仓库结果')).toMatchObject({
    deviceId: 'mock-device-1',
    kind: 'depot',
    clientType: 'Official',
    runId: historical.runId,
    items: [
      { id: '30012', name: '固源岩', quantity: 42 },
      { id: '30013', name: '固源岩组', quantity: 7 },
      { id: 'fixture-no-icon', name: '合成无图材料', quantity: 3 },
    ],
    operators: [],
  });
  await page.reload();
  await openTools(page);
  await expect(depot(page).getByRole('listitem')).toHaveCount(3);
});

test('historical operator recognition exports owned progress and isolates devices and clients', async ({
  page,
}) => {
  await page.goto('/');
  await restoreHistoricalRecognition(page, [
    {
      deviceId: 'mock-device-1',
      kind: 'operators',
      clientType: 'Official',
      collectedAt: '2026-10-24T08:00:00.000Z',
      runId: 'historical-operators',
      items: [],
      operators: [
        {
          id: 'char_002_amiya',
          name: '阿米娅',
          own: true,
          elite: 2,
          level: 80,
          potential: 6,
          rarity: 5,
        },
        {
          id: 'char_103_angel',
          name: '能天使',
          own: true,
          elite: 2,
          level: 90,
          potential: 1,
          rarity: 6,
        },
      ],
    },
  ]);
  await openTools(page, '干员');
  await page.getByRole('button', { name: '开始干员识别', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('尚未迁移');
  const amiya = operators(page).getByRole('row').filter({ hasText: '阿米娅' });
  await expect(amiya).toContainText('5 星');
  await amiya.scrollIntoViewIfNeeded();
  await expect(amiya).toContainText('精英 2');
  await expect(amiya).toContainText('80');
  await expect(amiya).toContainText('6');
  await expect(operators(page).getByRole('row').filter({ hasText: '能天使' })).toContainText('90');
  await operators(page).getByLabel('搜索干员', { exact: true }).fill('阿米娅');
  await expect(operators(page).getByRole('row').filter({ hasText: '能天使' })).toHaveCount(0);
  await operators(page).getByLabel('搜索干员', { exact: true }).fill('');
  expect(await downloadResult(page, '导出干员结果')).toMatchObject({
    deviceId: 'mock-device-1',
    kind: 'operators',
    clientType: 'Official',
    items: [],
    operators: [
      {
        id: 'char_002_amiya',
        name: '阿米娅',
        own: true,
        elite: 2,
        level: 80,
        potential: 6,
        rarity: 5,
      },
      {
        id: 'char_103_angel',
        name: '能天使',
        own: true,
        elite: 2,
        level: 90,
        potential: 1,
        rarity: 6,
      },
    ],
  });
  await page.getByLabel('识别结果客户端', { exact: true }).selectOption('YoStarJP');
  await expect(operators(page).getByRole('table')).toHaveCount(0);
  await expect(operators(page)).toContainText('尚无干员识别结果');
  await expect(
    operators(page).getByRole('button', { name: '导出干员结果', exact: true }),
  ).toHaveCount(0);
  await openTools(page, '仓库');
  await expect(page.getByLabel('识别结果客户端', { exact: true })).toHaveValue('YoStarJP');
  await openTools(page, '干员');
  await expect(page.getByLabel('识别结果客户端', { exact: true })).toHaveValue('YoStarJP');
  await page.getByLabel('识别结果客户端', { exact: true }).selectOption('Official');
  await expect(amiya).toBeVisible();
  const second = (await page.evaluate(async () =>
    (window as HarnessWindow).runtimeHarness.call('device.connect', {
      address: '127.0.0.1:5557',
      name: '第二个模拟器',
    }),
  )) as { id: string };
  await page.getByLabel('工具箱设备', { exact: true }).selectOption(second.id);
  await expect(operators(page).getByRole('table')).toHaveCount(0);
  await page.getByLabel('识别结果客户端', { exact: true }).selectOption('YoStarEN');
  await page.getByLabel('工具箱设备', { exact: true }).selectOption('mock-device-1');
  await expect(page.getByLabel('识别结果客户端', { exact: true })).toHaveValue('Official');
  await expect(amiya).toBeVisible();
});

test('recognition read errors recover while unmigrated execution stops before a tool request', async ({
  page,
}) => {
  await page.goto('/');
  await openTools(page);
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness;
    const call = api.call;
    Object.assign(api, {
      restoreRecognition: () => {
        api.call = call;
      },
    });
    api.call = async (method, params) => {
      if (method === 'recognition.get') throw new Error('合成识别读取失败');
      return call(method, params);
    };
  });
  await page.getByRole('button', { name: '刷新识别结果', exact: true }).click();
  await expect(depot(page).getByRole('alert')).toContainText('合成识别读取失败');
  await expect(depot(page).getByRole('button', { name: '导出仓库结果', exact: true })).toHaveCount(
    0,
  );
  await page.evaluate(() => {
    const api = (window as HarnessWindow).runtimeHarness;
    (api as unknown as { restoreRecognition: () => void }).restoreRecognition();
    const call = api.call;
    api.call = async (method, params) => {
      if (method === 'tool.start') {
        api.commands.push('unexpected-tool-start');
        throw new Error('不应开始未迁移的工具');
      }
      return call(method, params);
    };
  });
  await depot(page).getByRole('button', { name: '重试', exact: true }).click();
  await expect(depot(page).getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '开始仓库识别', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('尚未迁移');
  expect(
    await page.evaluate(() => (window as HarnessWindow).runtimeHarness.commands),
  ).not.toContain('unexpected-tool-start');
  await expect(page.getByRole('button', { name: '开始仓库识别', exact: true })).toBeEnabled();
});
