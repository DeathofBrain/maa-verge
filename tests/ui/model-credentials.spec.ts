import type { Page } from '@playwright/test';
import type { AgentCredentialStatus } from '../../packages/contracts/src/agent-types';
import type { Settings, Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

type CredentialCall = {
  method: string;
  target: string;
  secret?: string;
  storage?: string;
};
type CredentialHarness = {
  calls: CredentialCall[];
  saveOrder: string[];
  failSave: boolean;
  holdStatuses: boolean;
  heldStatuses: number;
  releaseStatuses: () => void;
};
type CredentialWindow = HarnessWindow & { modelCredentials: CredentialHarness };

const initialModel = {
  provider: 'openai-compatible',
  baseUrl: 'https://synthetic.example/v1',
  model: 'synthetic-model',
};

async function modelPage(
  page: Page,
  options: { initiallyConfigured?: boolean; holdStatuses?: boolean } = {},
) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(
    async ({ model, initiallyConfigured, holdStatuses }) => {
      const target = window as CredentialWindow;
      const api = target.runtimeHarness;
      const snapshot = (await api.call('app.snapshot', {})) as Snapshot;
      await api.call('settings.save', { settings: { ...snapshot.settings, model } });
      const original = api.call;
      const credentials = new Map<string, { secret: string; storage: 'keychain' | 'session' }>();
      if (initiallyConfigured)
        credentials.set(JSON.stringify([model.provider, model.baseUrl]), {
          secret: 'synthetic-previously-saved-credential',
          storage: 'session',
        });
      const pendingStatuses: (() => void)[] = [];
      const harness: CredentialHarness = {
        calls: [],
        saveOrder: [],
        failSave: false,
        holdStatuses: !!holdStatuses,
        heldStatuses: 0,
        releaseStatuses: () => {
          harness.holdStatuses = false;
          pendingStatuses.splice(0).forEach((release) => release());
          harness.heldStatuses = 0;
        },
      };
      target.modelCredentials = harness;
      api.call = async (method, params) => {
        if (method === 'settings.save') harness.saveOrder.push(method);
        if (!method.startsWith('model.credential.')) return original(method, params);
        // Like the desktop bridge, credential commands scope themselves to saved settings.
        const current = (await original('app.snapshot', {})) as Snapshot;
        const model = current.settings.model;
        const scope = JSON.stringify([
          model.provider.trim().toLowerCase(),
          new URL(model.baseUrl.trim()).toString().replace(/\/+$/, ''),
        ]);
        harness.calls.push({
          method,
          target: scope,
          ...(method === 'model.credential.set'
            ? { secret: String(params.secret), storage: String(params.storage) }
            : {}),
        });
        if (method === 'model.credential.set') {
          harness.saveOrder.push(method);
          if (harness.failSave) throw new Error('合成凭据保存失败');
          credentials.set(scope, {
            secret: String(params.secret),
            storage: params.storage as 'keychain' | 'session',
          });
        } else if (method === 'model.credential.delete') credentials.delete(scope);
        const stored = credentials.get(scope);
        const status: AgentCredentialStatus = {
          configured: !!stored,
          available: true,
          storage: stored?.storage ?? 'none',
        };
        if (method === 'model.credential.status' && harness.holdStatuses) {
          harness.heldStatuses++;
          await new Promise<void>((resolve) => pendingStatuses.push(resolve));
        }
        return status;
      };
      api.emitEvent('settings.saved');
    },
    { model: initialModel, ...options },
  );
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '模型与 Agent', exact: true })
    .click();
  return page.getByRole('region', { name: '模型配置', exact: true });
}

async function savedModel(page: Page): Promise<Settings['model']> {
  return page.evaluate(
    async () =>
      ((await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {})) as Snapshot)
        .settings.model,
  );
}

async function credentialCalls(page: Page, method: string) {
  return page.evaluate(
    (method) =>
      (window as CredentialWindow).modelCredentials.calls.filter((call) => call.method === method),
    method,
  );
}

test('model connection and credential drafts save together only after explicit configuration save', async ({
  page,
}) => {
  const panel = await modelPage(page);
  await page.clock.install();
  const secret = panel.getByLabel('模型 API 密钥', { exact: true });
  const sentinel = 'synthetic-unsaved-credential-sentinel';
  await secret.fill(sentinel);
  await panel.getByLabel('密钥保存方式', { exact: true }).selectOption('session');

  const address = 'https://second.synthetic.example/v1';
  await panel.getByLabel('模型 API 地址', { exact: true }).fill(address);
  await expect(secret).toHaveValue(sentinel);

  await panel.getByLabel('模型提供商', { exact: true }).fill('synthetic-provider');
  await expect(secret).toHaveValue(sentinel);

  const model = panel.getByLabel('模型名称', { exact: true });
  await model.fill('synthetic-model-two');
  await expect(secret).toHaveValue(sentinel);
  await expect(model).toBeEnabled();
  await model.focus();
  await model.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.setSelectionRange(input.value.length, input.value.length);
  });
  await model.pressSequentially('-extended');
  await secret.focus();
  await page.clock.fastForward(1000);
  expect(await savedModel(page)).toEqual(initialModel);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.settingsWrites)).toBe(
    0,
  );
  await expect(secret).toHaveValue(sentinel);
  expect(await credentialCalls(page, 'model.credential.set')).toEqual([]);

  const persisted = await page.evaluate(async () => ({
    snapshot: await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
  }));
  expect(JSON.stringify(persisted)).not.toContain(sentinel);
  await panel.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(secret).toHaveValue('');
  await expect(panel.getByText('已配置凭据', { exact: true })).toBeVisible();
  expect(await savedModel(page)).toEqual({
    provider: 'synthetic-provider',
    baseUrl: address,
    model: 'synthetic-model-two-extended',
  });
  expect(
    await page.evaluate(() => (window as CredentialWindow).modelCredentials.saveOrder),
  ).toEqual(['settings.save', 'model.credential.set']);
  expect(await credentialCalls(page, 'model.credential.set')).toEqual([
    {
      method: 'model.credential.set',
      target: JSON.stringify(['synthetic-provider', address]),
      secret: sentinel,
      storage: 'session',
    },
  ]);
});

test('invalid or failed model configuration saves retain drafts without touching previous credentials', async ({
  page,
}) => {
  const panel = await modelPage(page, { initiallyConfigured: true });
  const secret = panel.getByLabel('模型 API 密钥', { exact: true });
  const save = panel.getByRole('button', { name: '保存配置', exact: true });
  const remove = panel.getByRole('button', { name: '删除密钥', exact: true });
  await expect(panel.getByText('已配置凭据', { exact: true })).toBeVisible();
  await secret.fill('synthetic-retained-draft');
  await panel.getByLabel('模型 API 地址', { exact: true }).fill('https://');
  await secret.focus();
  await expect(save).toBeDisabled();
  await expect(remove).toBeDisabled();
  expect(await savedModel(page)).toEqual(initialModel);
  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = true;
  });
  const nextAddress = 'https://unsaved.synthetic.example/v1';
  await panel.getByLabel('模型 API 地址', { exact: true }).fill(nextAddress);
  await save.click();
  await expect(page.locator('.toast.error')).toContainText('合成设置保存失败');
  await expect(remove).toBeDisabled();
  await expect(panel.getByText('已配置凭据', { exact: true })).toHaveCount(0);
  await expect(secret).toHaveValue('synthetic-retained-draft');
  await expect(panel.getByLabel('模型 API 地址', { exact: true })).toHaveValue(nextAddress);
  expect((await savedModel(page)).baseUrl).toBe(initialModel.baseUrl);
  expect(await credentialCalls(page, 'model.credential.set')).toEqual([]);
  expect(await credentialCalls(page, 'model.credential.delete')).toEqual([]);

  await page.evaluate(() => {
    (window as HarnessWindow).runtimeHarness.failSettings = false;
  });
  await save.click();
  await expect(secret).toHaveValue('');
  expect((await savedModel(page)).baseUrl).toBe(nextAddress);
  expect(await credentialCalls(page, 'model.credential.set')).toEqual([
    {
      method: 'model.credential.set',
      target: JSON.stringify([initialModel.provider, nextAddress]),
      secret: 'synthetic-retained-draft',
      storage: 'keychain',
    },
  ]);
});

test('failed combined credential saves keep model and secret drafts available for retry', async ({
  page,
}) => {
  const panel = await modelPage(page);
  const secret = panel.getByLabel('模型 API 密钥', { exact: true });
  const nextAddress = 'https://retry.synthetic.example/v1';
  await panel.getByLabel('模型 API 地址', { exact: true }).fill(nextAddress);
  await panel.getByLabel('模型名称', { exact: true }).fill('synthetic-retry-model');
  await secret.fill('synthetic-retry-credential-sentinel');
  await panel.getByLabel('密钥保存方式', { exact: true }).selectOption('session');
  await page.evaluate(() => {
    (window as CredentialWindow).modelCredentials.failSave = true;
  });
  await panel.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.locator('.toast.error')).toContainText('合成凭据保存失败');
  await expect(secret).toHaveValue('synthetic-retry-credential-sentinel');
  await expect(panel.getByLabel('模型 API 地址', { exact: true })).toHaveValue(nextAddress);
  await expect(panel.getByLabel('模型名称', { exact: true })).toHaveValue('synthetic-retry-model');
  await expect(panel.getByText('待配置凭据', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => (window as CredentialWindow).modelCredentials.saveOrder),
  ).toEqual(['settings.save', 'model.credential.set']);
  await page.evaluate(() => {
    (window as CredentialWindow).modelCredentials.failSave = false;
  });
  await panel.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(secret).toHaveValue('');
  await expect(panel.getByText('已配置凭据', { exact: true })).toBeVisible();
  const calls = await credentialCalls(page, 'model.credential.set');
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  expect(calls[0].target).toBe(JSON.stringify([initialModel.provider, nextAddress]));
});

test('manual model saves do not migrate stored credentials between providers or API addresses', async ({
  page,
}) => {
  const panel = await modelPage(page, { initiallyConfigured: true });
  const configured = panel.getByText('已配置凭据', { exact: true });
  const unconfigured = panel.getByText('待配置凭据', { exact: true });
  const address = panel.getByLabel('模型 API 地址', { exact: true });
  const provider = panel.getByLabel('模型提供商', { exact: true });
  const save = panel.getByRole('button', { name: '保存配置', exact: true });
  const nextAddress = 'https://isolated.synthetic.example/v1';
  await expect(configured).toBeVisible();
  await address.fill(nextAddress);
  await expect(panel.getByRole('button', { name: '删除密钥', exact: true })).toBeDisabled();
  expect((await savedModel(page)).baseUrl).toBe(initialModel.baseUrl);
  await save.click();
  await expect(unconfigured).toBeVisible();
  expect((await savedModel(page)).baseUrl).toBe(nextAddress);
  expect(await credentialCalls(page, 'model.credential.set')).toEqual([]);
  await expect(panel.getByRole('button', { name: '删除密钥', exact: true })).toBeDisabled();
  await panel.getByLabel('模型 API 密钥', { exact: true }).fill('synthetic-second-credential');
  await panel.getByLabel('密钥保存方式', { exact: true }).selectOption('session');
  await save.click();
  await expect(configured).toBeVisible();

  await panel.getByLabel('模型名称', { exact: true }).fill('another-synthetic-model');
  await save.click();
  await expect(configured).toBeVisible();
  await provider.fill('other-provider');
  await save.click();
  await expect(unconfigured).toBeVisible();
  await expect(panel.getByRole('button', { name: '删除密钥', exact: true })).toBeDisabled();
  await provider.fill(initialModel.provider);
  await save.click();
  await expect(configured).toBeVisible();

  await address.fill(initialModel.baseUrl);
  await save.click();
  await expect(configured).toBeVisible();
  await panel.getByRole('button', { name: '删除密钥', exact: true }).click();
  await expect(unconfigured).toBeVisible();
  await address.fill(nextAddress);
  await save.click();
  await expect(configured).toBeVisible();
  expect(await credentialCalls(page, 'model.credential.set')).toHaveLength(1);
  expect(await credentialCalls(page, 'model.credential.delete')).toEqual([
    {
      method: 'model.credential.delete',
      target: JSON.stringify([initialModel.provider, initialModel.baseUrl]),
    },
  ]);
});

test('a delayed credential status cannot replace the status after saving a new model address', async ({
  page,
}) => {
  const panel = await modelPage(page, { initiallyConfigured: true, holdStatuses: true });
  await expect
    .poll(() => page.evaluate(() => (window as CredentialWindow).modelCredentials.heldStatuses))
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    (window as CredentialWindow).modelCredentials.holdStatuses = false;
  });
  const nextAddress = 'https://late-status.synthetic.example/v1';
  await panel.getByLabel('模型 API 地址', { exact: true }).fill(nextAddress);
  await panel.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect.poll(async () => (await savedModel(page)).baseUrl).toBe(nextAddress);
  await expect
    .poll(async () =>
      (await credentialCalls(page, 'model.credential.status')).some(
        (call) => call.target === JSON.stringify([initialModel.provider, nextAddress]),
      ),
    )
    .toBe(true);
  await page.evaluate(async () => {
    (window as CredentialWindow).modelCredentials.releaseStatuses();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  await expect(panel.getByText('待配置凭据', { exact: true })).toBeVisible();
  await expect(panel.getByText('已配置凭据', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '删除密钥', exact: true })).toBeDisabled();
});

test('model reminders and token prices require manual save without rewriting credentials', async ({
  page,
}) => {
  const panel = await modelPage(page, { initiallyConfigured: true });
  await page.clock.install();
  await panel.getByLabel('模型调用提醒（次）', { exact: true }).fill('42');
  await panel.getByLabel('Token 用量提醒', { exact: true }).fill('2048');
  await panel.getByLabel('每百万输入 Token 单价', { exact: true }).fill('1.25');
  await panel.getByLabel('每百万输出 Token 单价', { exact: true }).fill('2.5');
  await panel.getByLabel('费用估算提醒', { exact: true }).fill('10');
  await panel.getByLabel('模型名称', { exact: true }).focus();
  await page.clock.fastForward(1000);
  expect(await savedModel(page)).toEqual(initialModel);
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.settingsWrites)).toBe(
    0,
  );
  await panel.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect
    .poll(() => savedModel(page))
    .toEqual({
      ...initialModel,
      softCallReminder: 42,
      softTokenReminder: 2048,
      inputPricePerMillion: 1.25,
      outputPricePerMillion: 2.5,
      softCostReminder: 10,
    });
  expect(await page.evaluate(() => (window as HarnessWindow).runtimeHarness.settingsWrites)).toBe(
    1,
  );
  expect(await credentialCalls(page, 'model.credential.set')).toEqual([]);
  expect(await credentialCalls(page, 'model.credential.delete')).toEqual([]);
});
