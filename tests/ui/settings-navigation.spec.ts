import type { Page } from '@playwright/test';
import type { Snapshot } from '../../packages/contracts/src/types';
import { installAgentScenario } from './fixtures/agent-workspace';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { navigate, readSnapshot } from './fixtures/navigation';

const initialModel = {
  provider: 'openai-compatible',
  baseUrl: 'https://synthetic.example/v1',
  model: 'synthetic-model',
};

async function prepareNavigation(page: Page) {
  await installAgentScenario(page);
  await page.evaluate(async (model) => {
    const api = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await api.call('app.snapshot', {})) as Snapshot;
    await api.call('settings.save', { settings: { ...snapshot.settings, model } });
    const original = api.call;
    api.call = async (method, params) => {
      if (method === 'model.credential.status')
        return { configured: false, available: true, storage: 'none' };
      return original(method, params);
    };
    api.emitEvent('settings.saved');
  }, initialModel);
}

async function openAgentModelSettings(page: Page) {
  await navigate(page, 'Agent 助手');
  await page.getByRole('button', { name: '模型设置', exact: true }).click();
}

async function expectCategory(page: Page, name: string) {
  await expect(
    page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name, exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('搜索设置', { exact: true })).toHaveValue('');
}

async function searchSettings(page: Page, query: string, category: string) {
  await page.getByLabel('搜索任务与设置', { exact: true }).fill(query);
  await page
    .getByRole('region', { name: '搜索结果', exact: true })
    .getByRole('button', { name: new RegExp(category) })
    .click();
  await expectCategory(page, category);
}

test('Agent model settings opens the model category with an empty settings search', async ({
  page,
}) => {
  await prepareNavigation(page);
  await openAgentModelSettings(page);
  await expectCategory(page, '模型与 Agent');
  const panel = page.getByRole('region', { name: '模型配置', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('模型提供商', { exact: true })).toHaveValue(initialModel.provider);
  await expect(panel.getByLabel('模型 API 地址', { exact: true })).toHaveValue(
    initialModel.baseUrl,
  );
  await expect(panel.getByLabel('模型名称', { exact: true })).toHaveValue(initialModel.model);
  await expect(page.getByText('没有匹配的设置', { exact: true })).toHaveCount(0);
});

test('settings entries recover from local filters and repeated Agent, update and global search navigation', async ({
  page,
}) => {
  await prepareNavigation(page);
  await navigate(page, '设置');
  await page.getByLabel('搜索设置', { exact: true }).fill('synthetic-no-settings-match');
  await expect(page.getByText('没有匹配的设置', { exact: true })).toBeVisible();
  await navigate(page, '设置');
  await expectCategory(page, '通用与外观');

  for (let attempt = 0; attempt < 2; attempt++) {
    await page
      .getByRole('navigation', { name: '设置分类' })
      .getByRole('button', { name: '更新', exact: true })
      .click();
    await expectCategory(page, '更新');
    await openAgentModelSettings(page);
    await expectCategory(page, '模型与 Agent');
    await expect(page.getByRole('region', { name: '模型配置', exact: true })).toBeVisible();
    await navigate(page, '设置');
    await expectCategory(page, '通用与外观');
    await searchSettings(page, '资源更新', '更新');
    await expect(page.getByLabel('应用更新频道', { exact: true })).toBeVisible();
    await searchSettings(page, '打开模型与 Agent', '模型与 Agent');
    await expect(page.getByLabel('模型名称', { exact: true })).toHaveValue(initialModel.model);
    await page.getByLabel('搜索设置', { exact: true }).fill('synthetic-no-settings-match');
    await expect(page.getByText('没有匹配的设置', { exact: true })).toBeVisible();
    await searchSettings(page, '打开模型与 Agent', '模型与 Agent');
  }
});

test('unsaved model drafts survive returning through Agent without persisting secrets or settings', async ({
  page,
}) => {
  await prepareNavigation(page);
  const before = await readSnapshot(page);
  await openAgentModelSettings(page);
  const panel = page.getByRole('region', { name: '模型配置', exact: true });
  await panel.getByLabel('模型提供商', { exact: true }).fill('synthetic-draft-provider');
  await panel
    .getByLabel('模型 API 地址', { exact: true })
    .fill('https://draft.synthetic.example/v1');
  await panel.getByLabel('模型名称', { exact: true }).fill('synthetic-draft-model');
  const secret = 'synthetic-navigation-unsaved-secret-sentinel';
  await panel.getByLabel('模型 API 密钥', { exact: true }).fill(secret);
  await openAgentModelSettings(page);
  await expectCategory(page, '模型与 Agent');
  await expect(panel.getByLabel('模型提供商', { exact: true })).toHaveValue(
    'synthetic-draft-provider',
  );
  await expect(panel.getByLabel('模型 API 地址', { exact: true })).toHaveValue(
    'https://draft.synthetic.example/v1',
  );
  await expect(panel.getByLabel('模型名称', { exact: true })).toHaveValue('synthetic-draft-model');
  await expect(panel.getByLabel('模型 API 密钥', { exact: true })).toHaveValue('');
  expect(await readSnapshot(page)).toEqual(before);
  const persisted = await page.evaluate(async () => ({
    snapshot: await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
    settingsWrites: (window as HarnessWindow).runtimeHarness.settingsWrites,
  }));
  expect(persisted.settingsWrites).toBe(0);
  expect(JSON.stringify(persisted)).not.toContain(secret);
});

test('failed model saves remain editable and can retry after returning from Agent', async ({
  page,
}) => {
  await prepareNavigation(page);
  await openAgentModelSettings(page);
  const panel = page.getByRole('region', { name: '模型配置', exact: true });
  await panel.getByLabel('模型名称', { exact: true }).fill('synthetic-retry-model');
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = true;
  });
  await panel.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.locator('.toast.error')).toContainText('合成设置保存失败');
  expect((await readSnapshot(page)).settings.model).toEqual(initialModel);
  await openAgentModelSettings(page);
  await expectCategory(page, '模型与 Agent');
  await expect(panel.getByLabel('模型名称', { exact: true })).toHaveValue('synthetic-retry-model');
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = false;
  });
  await panel.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect
    .poll(async () => (await readSnapshot(page)).settings.model)
    .toEqual({ ...initialModel, model: 'synthetic-retry-model' });
  await expect(panel.getByRole('button', { name: '保存配置', exact: true })).toBeDisabled();
});
