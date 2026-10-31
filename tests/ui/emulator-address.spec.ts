import type { Settings, Snapshot } from '@maaverge/contracts';
import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { navigate, readSnapshot } from './fixtures/navigation';

test.use({ runtimePlatform: 'macos' });

type AddressWindow = HarnessWindow & {
  addressRequests: { connections: string[]; settings: Settings[] };
};

async function observeAddressRequests(page: Page) {
  await page.evaluate(() => {
    const target = window as AddressWindow;
    const harness = target.runtimeHarness;
    const call = harness.call;
    target.addressRequests = { connections: [], settings: [] };
    harness.call = async (method, params) => {
      // Record the transport input before the fixture applies backend normalization.
      if (method === 'device.connect')
        target.addressRequests.connections.push(String(params.address));
      if (method === 'settings.save')
        target.addressRequests.settings.push(structuredClone(params.settings) as Settings);
      return call(method, params);
    };
  });
}

const requests = (page: Page) => page.evaluate(() => (window as AddressWindow).addressRequests);

async function openConnectionSettings(page: Page) {
  await page
    .locator('.sp-heading-actions')
    .getByRole('button', { name: '连接设置', exact: true })
    .click();
  return page.getByRole('dialog', { name: '设备连接设置', exact: true });
}

for (const [label, entered, expected] of [
  ['AVD emulator serial', 'EmUlAtOr-20000', 'emulator-20000'],
  ['case-sensitive USB serial', 'UsbSerialAbC123', 'UsbSerialAbC123'],
]) {
  test(`manual connection submits the correct ${label}`, async ({ page }) => {
    await page.goto('/');
    await navigate(page, '设备');
    await observeAddressRequests(page);
    await page.getByLabel('手动连接 ADB 地址', { exact: true }).fill(entered);
    await page.getByRole('button', { name: '连接设备', exact: true }).click();
    await expect.poll(async () => (await requests(page)).connections).toEqual([expected]);
    await expect(page.getByLabel('设备操作结果', { exact: true })).toHaveText(
      '连接完成：1 台设备已就绪。',
    );
  });
}

test('connection settings save and connect with a lowercase emulator prefix after reload', async ({
  page,
}) => {
  await page.goto('/');
  await navigate(page, '设备');
  await observeAddressRequests(page);
  const dialog = await openConnectionSettings(page);
  await dialog.getByLabel('连接地址', { exact: true }).fill('EMULATOR-20000');
  await dialog.getByRole('button', { name: '保存连接配置', exact: true }).click();
  await expect
    .poll(async () => (await requests(page)).settings.at(-1)?.connection?.address)
    .toBe('emulator-20000');
  expect((await readSnapshot(page)).settings.connection?.address).toBe('emulator-20000');
  await dialog.getByRole('button', { name: '连接此地址', exact: true }).click();
  await expect.poll(async () => (await requests(page)).connections).toEqual(['emulator-20000']);
  await expect(dialog.getByRole('status')).toContainText('已提交连接：');

  await page.reload();
  await navigate(page, '设备');
  const restored = await openConnectionSettings(page);
  await expect(restored.getByLabel('连接地址', { exact: true })).toHaveValue('emulator-20000');
});

test('multi-instance settings persist both normalized addresses and use the saved serial to connect', async ({
  page,
}) => {
  await page.goto('/');
  await navigate(page, '设备');
  await observeAddressRequests(page);
  await page.getByRole('tab', { name: /^多开管理/ }).click();
  await page.getByRole('button', { name: '添加多开实例', exact: true }).click();
  const editor = page.getByRole('form', { name: '多开实例配置', exact: true });
  await editor.getByLabel('实例名称', { exact: true }).fill('AVD 大小写回归');
  await editor.getByLabel('连接地址', { exact: true }).fill('eMuLaToR-20010');
  await editor.getByRole('button', { name: '保存实例配置', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const expected = {
    address: 'emulator-20010',
    connection: { address: 'emulator-20010' },
  };
  expect((await requests(page)).settings.at(-1)?.deviceProfiles?.[0]).toMatchObject(expected);
  expect((await readSnapshot(page)).settings.deviceProfiles?.[0]).toMatchObject(expected);

  await page.reload();
  await navigate(page, '设备');
  await observeAddressRequests(page);
  await page.getByRole('tab', { name: /^多开管理/ }).click();
  const instance = page.getByRole('article', { name: '多开实例：AVD 大小写回归', exact: true });
  await instance.getByRole('button', { name: '连接实例', exact: true }).click();
  await expect.poll(async () => (await requests(page)).connections).toEqual(['emulator-20010']);
  await expect(instance.getByRole('button', { name: '断开实例', exact: true })).toBeEnabled();
});

test('reconnecting an existing mixed-case emulator history record submits the canonical serial', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await harness.call('app.snapshot', {})) as Snapshot;
    snapshot.settings.autoConnect = false;
    await harness.call('settings.save', { settings: snapshot.settings });
    snapshot.devices = [
      {
        ...snapshot.devices[0],
        name: '旧版 AVD 设备',
        address: 'EmUlAtOr-20000',
        state: 'offline',
      },
    ];
    const storageKey = Object.keys(localStorage).find((key) =>
      key.startsWith('maaverge:test-runtime:v1:'),
    )!;
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  });
  await page.reload();
  await navigate(page, '设备');
  await observeAddressRequests(page);
  await page.locator('.dp-history > summary').click();
  const history = page.getByRole('article', { name: '设备：旧版 AVD 设备', exact: true });
  await history.getByRole('button', { name: '重新连接', exact: true }).click();
  await expect.poll(async () => (await requests(page)).connections).toEqual(['emulator-20000']);
  await expect(page.getByLabel('设备操作结果', { exact: true })).toHaveText(
    '连接完成：1 台设备已就绪。',
  );
});
