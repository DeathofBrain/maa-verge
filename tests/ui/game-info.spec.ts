import { selectDevice } from './fixtures/device-picker';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import type { Snapshot } from '../../packages/contracts/src/types';

test('manual infrastructure estimates persist and stay bound to the selected device', async ({
  page,
}) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: '基建产出估算', exact: true });
  await expect(panel).toContainText('尚未配置产线');
  await expect(panel.getByRole('progressbar')).toHaveCount(0);
  await panel.getByText('配置此设备的产线估算', { exact: true }).click();
  await panel.getByRole('button', { name: '添加产线', exact: true }).click();
  await panel.getByRole('button', { name: '保存估算配置', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('请填写');
  await panel.getByLabel('产线 1 名称', { exact: true }).fill('赤金制造站');
  await panel.getByLabel('产线 1 每小时产量', { exact: true }).fill('20');
  await panel.getByLabel('产线 1 容量', { exact: true }).fill('100');
  await panel.getByLabel('产线 1 单位', { exact: true }).fill('块');
  await panel.getByLabel('产线 1 上次收取时间', { exact: true }).fill('2020-01-01T00:00');
  await panel.getByRole('button', { name: '保存估算配置', exact: true }).click();
  await expect(panel).toContainText('约 100 / 100 块');
  await expect(panel).toContainText('预计已满');
  await page.reload();
  await expect(panel).toContainText('约 100 / 100 块');
  const second = (await page.evaluate(async () =>
    (window as HarnessWindow).runtimeHarness.call('device.connect', {
      address: '127.0.0.1:5557',
      name: '第二个模拟器',
    }),
  )) as { id: string };
  await selectDevice(page, second.id);
  await expect(panel).toContainText('第二个模拟器');
  await expect(panel).toContainText('尚未配置产线');
  await expect(panel.getByRole('progressbar')).toHaveCount(0);
});

test('saved estimate changes reset only the selected device draft and cannot restore an invalidated baseline', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await harness.call('app.snapshot', {})) as Snapshot;
    await harness.call('settings.save', {
      settings: {
        ...snapshot.settings,
        infrastructureEstimates: [
          {
            deviceId: snapshot.devices[0].id,
            lines: [
              {
                id: 'gold',
                name: '旧账号赤金',
                unit: '块',
                hourlyRate: 20,
                capacity: 100,
                lastCollectedAt: '2020-01-01T00:00:00Z',
              },
            ],
          },
        ],
      },
    });
  });
  const panel = page.getByRole('region', { name: '基建产出估算', exact: true });
  await expect(panel).toContainText('旧账号赤金');
  await panel.getByText('配置此设备的产线估算', { exact: true }).click();
  await panel.getByLabel('产线 1 名称', { exact: true }).fill('尚未保存的草稿');
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await harness.call('app.snapshot', {})) as Snapshot;
    await harness.call('settings.save', {
      settings: {
        ...snapshot.settings,
        infrastructureEstimates: [
          ...snapshot.settings.infrastructureEstimates!,
          { deviceId: 'other-device', lines: [] },
        ],
      },
    });
  });
  await expect(panel.getByLabel('产线 1 名称', { exact: true })).toHaveValue('尚未保存的草稿');
  await page.evaluate(async () => {
    const harness = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await harness.call('app.snapshot', {})) as Snapshot;
    await harness.call('settings.save', {
      settings: {
        ...snapshot.settings,
        infrastructureEstimates: snapshot.settings.infrastructureEstimates!.filter(
          (profile) => profile.deviceId !== snapshot.devices[0].id,
        ),
      },
    });
  });
  await expect(panel).toContainText('尚未配置产线');
  await expect(panel.getByLabel('产线 1 名称', { exact: true })).toHaveCount(0);
  await panel.getByText('配置此设备的产线估算', { exact: true }).click();
  await panel.getByRole('button', { name: '保存估算配置', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const snapshot = (await (window as HarnessWindow).runtimeHarness.call(
          'app.snapshot',
          {},
        )) as Snapshot;
        return snapshot.settings.infrastructureEstimates?.find(
          (profile) => profile.deviceId === snapshot.devices[0].id,
        )?.lines;
      }),
    )
    .toEqual([]);
});
