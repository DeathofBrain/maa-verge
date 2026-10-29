import type { Page } from '@playwright/test';
import type {
  CopilotPreview,
  CopilotRecord,
  RpcResult,
  Snapshot,
} from '../../packages/contracts/src/index';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

type Recognition = RpcResult<'recognition.get'>;
type Operator = Recognition['operators'][number];
type Requirements = CopilotRecord['operators'];
type ProbeWindow = HarnessWindow & {
  operatorProbe: {
    rosters: Record<string, Recognition>;
    requirements?: Requirements;
    reads: { deviceId: string; clientType: unknown }[];
    finished: string[];
    hold: Record<string, boolean>;
    fail: boolean;
    events: Snapshot['events'];
    release: (deviceId: string) => void;
    notify: (type: string, deviceId?: string) => void;
  };
};

const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const detail = (page: Page) => page.getByRole('complementary', { name: '作业详情', exact: true });
const card = (page: Page) => library(page).locator('article.cp-record').first();
const tag = (page: Page, name: string) =>
  card(page).locator('li.cp-operator-tag').filter({ hasText: name });
const requirement = (page: Page, name: string) =>
  detail(page).locator('.cp-operator-grid > li').filter({ hasText: name });
const recognized = (name: string, values: Partial<Operator> = {}): Operator => ({
  id: `char_test_${name}`,
  name,
  own: true,
  elite: 2,
  level: 90,
  potential: 1,
  rarity: 6,
  ...values,
});
const roster = (
  operators: Operator[],
  collectedAt: string | null = '2026-10-25T03:00:00Z',
): Recognition => ({
  deviceId: 'mock-device-1',
  kind: 'operators',
  clientType: 'Official',
  collectedAt,
  runId: collectedAt ? 'synthetic-recognition' : null,
  items: [],
  operators,
});

async function installProbe(page: Page, value: Recognition, requirements?: Requirements) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(
    ({ value, requirements }) => {
      const target = window as ProbeWindow;
      const harness = target.runtimeHarness;
      const original = harness.call.bind(harness);
      const waiters = new Map<string, (() => void)[]>();
      const probe = (target.operatorProbe = {
        rosters: { [value.deviceId]: value },
        requirements,
        reads: [],
        finished: [],
        hold: {},
        fail: false,
        events: [],
        release: (deviceId: string) => {
          probe.hold[deviceId] = false;
          waiters
            .get(deviceId)
            ?.splice(0)
            .forEach((resolve) => resolve());
        },
        notify: (type: string, deviceId = 'mock-device-1') => {
          probe.events.push({
            id: 100_000 + probe.events.length,
            type,
            message: '合成干员数据事件',
            createdAt: new Date().toISOString(),
            data: { deviceId, type: 'OperBox' },
          });
          harness.emitEvent(type, { deviceId, type: 'OperBox' });
        },
      } as ProbeWindow['operatorProbe']);
      harness.call = async (method, params) => {
        if (method === 'recognition.get' && params.kind === 'operators') {
          const deviceId = String(params.deviceId);
          probe.reads.push({ deviceId, clientType: params.clientType });
          // Capture the reply before waiting, so a delayed request really can be stale.
          const result = structuredClone(
            probe.rosters[deviceId] ?? {
              deviceId,
              kind: 'operators',
              clientType: 'Official',
              collectedAt: null,
              runId: null,
              items: [],
              operators: [],
            },
          );
          if (probe.hold[deviceId])
            await new Promise<void>((resolve) => {
              waiters.set(deviceId, [...(waiters.get(deviceId) ?? []), resolve]);
            });
          probe.finished.push(deviceId);
          if (probe.fail) throw new Error('合成干员读取失败');
          return result;
        }
        const result = await original(method, params);
        if (method === 'app.snapshot') {
          const snapshot = result as Snapshot;
          snapshot.events = [...snapshot.events, ...probe.events];
          snapshot.devices = snapshot.devices.map((device) => ({
            ...device,
            dataSync: {
              ...device.dataSync,
              operatorsAt: probe.rosters[device.id]?.collectedAt ?? null,
            },
          }));
        }
        if (probe.requirements && method === 'copilot.preview') {
          for (const entry of (result as CopilotPreview).entries)
            if (entry.record) entry.record.operators = structuredClone(probe.requirements);
        }
        if (probe.requirements && method === 'copilot.search') {
          for (const item of (result as { items: { operators?: Requirements }[] }).items)
            item.operators = structuredClone(probe.requirements);
        }
        return result;
      };
    },
    { value, requirements },
  );
}

async function openCommunity(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  await expect(
    page.getByRole('region', { name: '作业执行队列', exact: true }).locator('.cp-save-state'),
  ).toContainText('已保存');
  await page.getByRole('tab', { name: '社区搜索', exact: true }).click();
  await expect(card(page)).toBeVisible();
}

async function openDetail(page: Page) {
  await card(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true }).click();
  await expect(detail(page)).toBeVisible();
}

test('community cards and details distinguish owned, missing and insufficient operators without importing', async ({
  page,
}) => {
  await installProbe(
    page,
    roster([
      recognized('阿米娅', { level: 60 }),
      recognized('能天使'),
      recognized('合成六星干员', { own: false, elite: -1, level: -1, potential: -1 }),
      recognized('合成未拥有干员', { own: false }),
    ]),
    [
      { name: '阿米娅', skill: 1, requirements: { elite: 2, level: 80 } },
      { name: '合成未拥有干员', skill: 2 },
      { name: '能天使', skill: 3, group: '输出备选' },
      { name: '合成六星干员', skill: 2, group: '输出备选' },
    ],
  );
  await openCommunity(page);
  for (const [name, status] of [
    ['阿米娅', 'insufficient'],
    ['能天使', 'owned'],
    ['合成未拥有干员', 'missing'],
  ]) {
    await expect(tag(page, name)).toHaveAttribute('data-status', status);
    await expect(tag(page, name)).toHaveText(name);
  }
  await openDetail(page);
  for (const [name, status] of [
    ['阿米娅', 'insufficient'],
    ['能天使', 'owned'],
    ['合成六星干员', 'missing'],
  ])
    await expect(requirement(page, name)).toHaveAttribute('data-status', status);
  await expect(detail(page).locator('.cp-operator-groups')).toContainText('输出备选组内任选一位');
  await expect(
    detail(page).getByRole('button', { name: '导入到作业库', exact: true }),
  ).toBeVisible();
  const reads = await page.evaluate(() => (window as ProbeWindow).operatorProbe.reads);
  expect(reads.length).toBeGreaterThan(0);
  expect(
    reads.every((read) => read.deviceId === 'mock-device-1' && read.clientType === undefined),
  ).toBe(true);
});

test('changing devices clears previous account assessments and ignores its delayed recognition response', async ({
  page,
}) => {
  await installProbe(
    page,
    roster([recognized('阿米娅'), recognized('能天使'), recognized('合成六星干员')]),
  );
  await openCommunity(page);
  await expect(tag(page, '阿米娅')).toHaveAttribute('data-status', 'owned');
  const pendingRead = await page.evaluate(() => {
    const probe = (window as ProbeWindow).operatorProbe;
    probe.hold['mock-device-1'] = true;
    const count = probe.reads.length;
    probe.notify('device.data_synced');
    return count;
  });
  await expect
    .poll(() => page.evaluate(() => (window as ProbeWindow).operatorProbe.reads.length))
    .toBeGreaterThan(pendingRead);
  const second = (await page.evaluate(async () =>
    (window as ProbeWindow).runtimeHarness.call('device.connect', {
      address: '127.0.0.1:5557',
      name: '无干员数据设备',
    }),
  )) as { id: string };
  await page.getByLabel('作业目标设备', { exact: true }).selectOption(second.id);
  await expect(card(page).locator('li.cp-operator-tag[data-status="unknown"]')).toHaveCount(1);
  const finishedBefore = await page.evaluate(() => {
    const probe = (window as ProbeWindow).operatorProbe;
    const count = probe.finished.filter((id) => id === 'mock-device-1').length;
    probe.release('mock-device-1');
    return count;
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as ProbeWindow).operatorProbe.finished.filter((id) => id === 'mock-device-1')
            .length,
      ),
    )
    .toBeGreaterThan(finishedBefore);
  await expect(card(page).locator('li.cp-operator-tag[data-status="unknown"]')).toHaveCount(1);
  await openDetail(page);
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'unknown');
  await page.getByLabel('作业目标设备', { exact: true }).selectOption('mock-device-1');
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'owned');
});

test('account changes discard old assessments while a read is pending and later scans update the same details', async ({
  page,
}) => {
  await installProbe(page, roster([recognized('阿米娅')]));
  await openCommunity(page);
  await openDetail(page);
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'owned');
  const pendingRead = await page.evaluate(() => {
    const probe = (window as ProbeWindow).operatorProbe;
    probe.rosters['mock-device-1'] = {
      ...probe.rosters['mock-device-1'],
      operators: [],
      collectedAt: null,
      runId: null,
    };
    probe.hold['mock-device-1'] = true;
    const count = probe.reads.length;
    probe.notify('device.account_changed');
    return count;
  });
  await expect
    .poll(() => page.evaluate(() => (window as ProbeWindow).operatorProbe.reads.length))
    .toBeGreaterThan(pendingRead);
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'unknown');
  await page.evaluate(() => (window as ProbeWindow).operatorProbe.release('mock-device-1'));
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'unknown');
  await page.evaluate(() => {
    const probe = (window as ProbeWindow).operatorProbe;
    probe.rosters['mock-device-1'] = {
      ...probe.rosters['mock-device-1'],
      operators: [
        {
          id: 'char_002_amiya',
          name: '阿米娅',
          own: true,
          elite: 1,
          level: 70,
          potential: 1,
          rarity: 5,
        },
      ],
      collectedAt: '2026-10-25T03:20:00Z',
      runId: 'new-account-scan',
    };
    probe.notify('device.data_synced');
  });
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'insufficient');
});

test('an unavailable local recognition read leaves community badges neutral', async ({ page }) => {
  await installProbe(page, roster([recognized('阿米娅')]));
  await page.evaluate(() => {
    (window as ProbeWindow).operatorProbe.fail = true;
  });
  await openCommunity(page);
  await expect(card(page).locator('li.cp-operator-tag[data-status="unknown"]')).toHaveCount(1);
  await openDetail(page);
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'unknown');
  await expect(
    detail(page).locator('[data-status="missing"], [data-status="insufficient"]'),
  ).toHaveCount(0);
});

test('alternative group labels share the required row and expand without opening the record', async ({
  page,
}) => {
  await installProbe(
    page,
    roster([
      recognized('刚需干员'),
      recognized('候选甲'),
      recognized('候选乙'),
      recognized('候选丙'),
      recognized('候选丁'),
      recognized('缺少干员', { own: false }),
      recognized('低练干员', { level: 1 }),
    ]),
    [
      { name: '刚需干员' },
      ...['候选甲', '候选乙', '候选丙', '候选丁'].map((name) => ({
        name,
        group: '拦人先锋',
        requirements: { potentiality: 1 },
      })),
      { name: '缺少干员', group: '医疗备选' },
      { name: '低练干员', group: '近卫备选', requirements: { level: 80 } },
      { name: '未知干员', group: '待识别备选' },
    ],
  );
  await openCommunity(page);
  const row = card(page).locator('.cp-requirement-tags');
  await expect(row.locator('li.cp-operator-tag')).toHaveText('刚需干员');
  const group = row.getByRole('button', { name: '拦人先锋', exact: true });
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  for (const [name, status] of [
    ['拦人先锋', 'owned'],
    ['医疗备选', 'missing'],
    ['近卫备选', 'insufficient'],
    ['待识别备选', 'unknown'],
  ]) {
    await expect(row.getByRole('button', { name, exact: true })).toHaveAttribute(
      'data-status',
      status,
    );
  }
  const panel = card(page).getByRole('region', { name: '拦人先锋备选干员', exact: true });
  await expect(panel).toBeHidden();
  await group.click();
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel.locator('li.cp-operator-tag')).toHaveText(['候选甲', '候选乙', '候选丙']);
  await expect(detail(page)).toHaveCount(0);
  await group.press('Enter');
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await row.getByRole('button', { name: '医疗备选', exact: true }).click();
  await expect(
    card(page).getByRole('region', { name: '医疗备选备选干员', exact: true }),
  ).toContainText('未拥有');
});
