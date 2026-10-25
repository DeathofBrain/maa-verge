import type { Page } from '@playwright/test';
import type { CopilotPreview, CopilotRecord, RpcResult, Snapshot } from '../../packages/contracts/src/index';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

type Recognition = RpcResult<'recognition.get'>;
type Operator = Recognition['operators'][number];
type Requirements = CopilotRecord['operators'];
type ProbeWindow = HarnessWindow & { operatorProbe: {
  rosters: Record<string, Recognition>;
  requirements?: Requirements;
  reads: { deviceId: string; clientType: unknown }[];
  finished: string[];
  hold: Record<string, boolean>;
  fail: boolean;
  events: Snapshot['events'];
  release: (deviceId: string) => void;
  notify: (type: string, deviceId?: string) => void;
} };

const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const detail = (page: Page) => page.getByRole('complementary', { name: '作业详情', exact: true });
const card = (page: Page) => library(page).locator('article.cp-record').first();
const tag = (page: Page, name: string) => card(page).locator('.cp-operator-tag').filter({ hasText: name });
const requirement = (page: Page, name: string) => detail(page).locator('.cp-operator-grid > li').filter({ hasText: name });
const recognized = (name: string, values: Partial<Operator> = {}): Operator => ({
  id: `char_test_${name}`, name, own: true, elite: 2, level: 90, potential: 1, rarity: 6, ...values,
});
const roster = (operators: Operator[], collectedAt: string | null = '2026-10-25T03:00:00Z'): Recognition => ({
  deviceId: 'mock-device-1', kind: 'operators', clientType: 'Official', collectedAt,
  runId: collectedAt ? 'synthetic-recognition' : null, items: [], operators,
});

async function installProbe(page: Page, value: Recognition, requirements?: Requirements) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(({ value, requirements }) => {
    const target = window as ProbeWindow;
    const harness = target.runtimeHarness;
    const original = harness.call.bind(harness);
    const waiters = new Map<string, (() => void)[]>();
    const probe = target.operatorProbe = {
      rosters: { [value.deviceId]: value }, requirements, reads: [], finished: [], hold: {}, fail: false, events: [],
      release: (deviceId: string) => { probe.hold[deviceId] = false; waiters.get(deviceId)?.splice(0).forEach(resolve => resolve()); },
      notify: (type: string, deviceId = 'mock-device-1') => {
        probe.events.push({ id: 100_000 + probe.events.length, type, message: '合成干员数据事件', createdAt: new Date().toISOString(), data: { deviceId, type: 'OperBox' } });
        harness.emitEvent(type, { deviceId, type: 'OperBox' });
      },
    } as ProbeWindow['operatorProbe'];
    harness.call = async (method, params) => {
      if (method === 'recognition.get' && params.kind === 'operators') {
        const deviceId = String(params.deviceId);
        probe.reads.push({ deviceId, clientType: params.clientType });
        // Capture the reply before waiting, so a delayed request really can be stale.
        const result = structuredClone(probe.rosters[deviceId] ?? { deviceId, kind: 'operators', clientType: 'Official', collectedAt: null, runId: null, items: [], operators: [] });
        if (probe.hold[deviceId]) await new Promise<void>(resolve => { waiters.set(deviceId, [...(waiters.get(deviceId) ?? []), resolve]); });
        probe.finished.push(deviceId);
        if (probe.fail) throw new Error('合成干员读取失败');
        return result;
      }
      const result = await original(method, params);
      if (method === 'app.snapshot') {
        const snapshot = result as Snapshot;
        snapshot.events = [...snapshot.events, ...probe.events];
        snapshot.devices = snapshot.devices.map(device => ({ ...device, dataSync: { ...device.dataSync, operatorsAt: probe.rosters[device.id]?.collectedAt ?? null } }));
      }
      if (probe.requirements && method === 'copilot.preview') {
        for (const entry of (result as CopilotPreview).entries) if (entry.record) entry.record.operators = structuredClone(probe.requirements);
      }
      if (probe.requirements && method === 'copilot.search') {
        for (const item of (result as { items: { operators?: Requirements }[] }).items) item.operators = structuredClone(probe.requirements);
      }
      return result;
    };
  }, { value, requirements });
}

async function openCommunity(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  await expect(page.getByRole('region', { name: '作业执行队列', exact: true }).locator('.cp-save-state')).toContainText('已保存');
  await page.getByRole('tab', { name: '社区搜索', exact: true }).click();
  await expect(card(page)).toBeVisible();
}

async function openDetail(page: Page) {
  await card(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true }).click();
  await expect(detail(page)).toBeVisible();
}

test('community cards and details distinguish owned, missing and insufficient operators without importing', async ({ page }, testInfo) => {
  await installProbe(page, roster([
    recognized('阿米娅', { level: 60 }), recognized('能天使'), recognized('合成六星干员', { own: false, elite: -1, level: -1, potential: -1 }), recognized('合成未拥有干员', { own: false }),
  ]), [
    { name: '阿米娅', skill: 1, requirements: { elite: 2, level: 80 } },
    { name: '合成未拥有干员', skill: 2 },
    { name: '能天使', skill: 3, group: '输出备选' },
    { name: '合成六星干员', skill: 2, group: '输出备选' },
  ]);
  await openCommunity(page);
  for (const [name, status, text] of [['阿米娅', 'insufficient', '缺少练度'], ['能天使', 'owned', '已拥有'], ['合成未拥有干员', 'missing', '未拥有']]) {
    await expect(tag(page, name)).toHaveAttribute('data-status', status);
    await expect(tag(page, name)).toContainText(text);
  }
  await card(page).screenshot({ path: testInfo.outputPath('community-operator-statuses.png') });
  await openDetail(page);
  for (const [name, status] of [['阿米娅', 'insufficient'], ['能天使', 'owned'], ['合成六星干员', 'missing']]) await expect(requirement(page, name)).toHaveAttribute('data-status', status);
  await expect(detail(page).locator('.cp-operator-groups')).toContainText('输出备选组内任选一位');
  await expect(detail(page).getByRole('button', { name: '导入到作业库', exact: true })).toBeVisible();
  const reads = await page.evaluate(() => (window as ProbeWindow).operatorProbe.reads);
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.every(read => read.deviceId === 'mock-device-1' && read.clientType === undefined)).toBe(true);
  await detail(page).locator('.cp-requirements').screenshot({ path: testInfo.outputPath('operator-details-light.png') });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await detail(page).locator('.cp-requirements').screenshot({ path: testInfo.outputPath('operator-details-dark.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.copilot-page')!.scrollWidth <= document.querySelector('.copilot-page')!.clientWidth)).toBe(true);
  await detail(page).locator('.cp-requirements').screenshot({ path: testInfo.outputPath('operator-details-narrow.png') });
});

test('no successful scan and operators absent from a partial scan keep their original status', async ({ page }) => {
  await installProbe(page, roster([recognized('阿米娅')], null));
  await openCommunity(page);
  await expect(card(page).locator('.cp-operator-tag')).toHaveCount(1);
  await expect(card(page).locator('.cp-operator-tag[data-status="unknown"]')).toHaveCount(1);
  await expect(card(page).locator('.cp-group-unverified')).toContainText('尚未确认可用干员');
  await page.evaluate(() => {
    const probe = (window as ProbeWindow).operatorProbe;
    probe.rosters['mock-device-1'].collectedAt = '2026-10-25T03:10:00Z';
    probe.rosters['mock-device-1'].runId = 'completed-partial-scan';
    probe.notify('device.data_synced');
  });
  await expect(tag(page, '阿米娅')).toHaveAttribute('data-status', 'owned');
  for (const name of ['能天使', '合成六星干员']) await expect(tag(page, name)).toHaveCount(0);
  await expect(card(page).locator('[data-status="missing"]')).toHaveCount(0);
  await openDetail(page);
  await expect(requirement(page, '能天使')).toHaveAttribute('data-status', 'unknown');
});

test('higher promotion satisfies earlier levels and unobserved skill or module data never invents insufficient progress', async ({ page }) => {
  await installProbe(page, roster([
    recognized('阿米娅', { elite: 2, level: 1 }), recognized('能天使'), recognized('合成六星干员', { level: -1 }),
  ]), [
    { name: '阿米娅', skill: 1, requirements: { elite: 1, level: 70 } },
    { name: '能天使', skill: 3, requirements: { elite: 2, level: 80, skill_level: 10, module: 2, module_level: 3 } },
    { name: '合成六星干员', skill: 2, requirements: { elite: 2, level: 80 } },
  ]);
  await openCommunity(page);
  await expect(tag(page, '阿米娅')).toHaveAttribute('data-status', 'owned');
  await expect(tag(page, '能天使')).toHaveAttribute('data-status', 'owned');
  await expect(tag(page, '合成六星干员')).not.toHaveAttribute('data-status', 'insufficient');
  await openDetail(page);
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'owned');
  await expect(requirement(page, '能天使')).toContainText('专三');
  await expect(requirement(page, '能天使')).toContainText(/Y\s*模/);
  await expect(requirement(page, '能天使')).toContainText(/未核验|未识别/);
  await expect(requirement(page, '合成六星干员')).not.toHaveAttribute('data-status', 'insufficient');
});

test('changing devices clears previous account colors and ignores its delayed recognition response', async ({ page }) => {
  await installProbe(page, roster([recognized('阿米娅'), recognized('能天使'), recognized('合成六星干员')]));
  await openCommunity(page);
  await expect(tag(page, '阿米娅')).toHaveAttribute('data-status', 'owned');
  const pendingRead = await page.evaluate(() => {
    const probe = (window as ProbeWindow).operatorProbe;
    probe.hold['mock-device-1'] = true;
    const count = probe.reads.length;
    probe.notify('device.data_synced');
    return count;
  });
  await expect.poll(() => page.evaluate(() => (window as ProbeWindow).operatorProbe.reads.length)).toBeGreaterThan(pendingRead);
  const second = await page.evaluate(async () => (window as ProbeWindow).runtimeHarness.call('device.connect', { address: '127.0.0.1:5557', name: '无干员数据设备' })) as { id: string };
  await page.getByLabel('作业目标设备', { exact: true }).selectOption(second.id);
  await expect(card(page).locator('.cp-operator-tag[data-status="unknown"]')).toHaveCount(1);
  const finishedBefore = await page.evaluate(() => {
    const probe = (window as ProbeWindow).operatorProbe;
    const count = probe.finished.filter(id => id === 'mock-device-1').length;
    probe.release('mock-device-1');
    return count;
  });
  await expect.poll(() => page.evaluate(() => (window as ProbeWindow).operatorProbe.finished.filter(id => id === 'mock-device-1').length)).toBeGreaterThan(finishedBefore);
  await expect(card(page).locator('.cp-operator-tag[data-status="unknown"]')).toHaveCount(1);
  await openDetail(page);
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'unknown');
  await page.getByLabel('作业目标设备', { exact: true }).selectOption('mock-device-1');
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'owned');
});

test('account changes discard old colors while a read is pending and later scans update the same details', async ({ page }) => {
  await installProbe(page, roster([recognized('阿米娅')]));
  await openCommunity(page);
  await openDetail(page);
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'owned');
  const pendingRead = await page.evaluate(() => {
    const probe = (window as ProbeWindow).operatorProbe;
    probe.rosters['mock-device-1'] = { ...probe.rosters['mock-device-1'], operators: [], collectedAt: null, runId: null };
    probe.hold['mock-device-1'] = true;
    const count = probe.reads.length;
    probe.notify('device.account_changed');
    return count;
  });
  await expect.poll(() => page.evaluate(() => (window as ProbeWindow).operatorProbe.reads.length)).toBeGreaterThan(pendingRead);
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'unknown');
  await page.evaluate(() => (window as ProbeWindow).operatorProbe.release('mock-device-1'));
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'unknown');
  await page.evaluate(() => {
    const probe = (window as ProbeWindow).operatorProbe;
    probe.rosters['mock-device-1'] = { ...probe.rosters['mock-device-1'], operators: [{ id: 'char_002_amiya', name: '阿米娅', own: true, elite: 1, level: 70, potential: 1, rarity: 5 }], collectedAt: '2026-10-25T03:20:00Z', runId: 'new-account-scan' };
    probe.notify('device.data_synced');
  });
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'insufficient');
});

test('detail terms distinguish skill mastery, module type and module level including unrestricted requirements', async ({ page }) => {
  await installProbe(page, roster([], null), [
    { name: '术语甲', skill: 1, requirements: { elite: 2, level: 80, skill_level: 8, module: 1, module_level: 3 } },
    { name: '术语乙', skill: 2, requirements: { skill_level: 9, module: 2 } },
    { name: '术语丙', skill: 3, requirements: { skill_level: 10, module: 3 } },
    { name: '术语丁', requirements: { module: 4 } },
    { name: '术语戊', requirements: { module: 5 } },
    { name: '术语己', requirements: { elite: 0, skill_level: 7, module: 0 } },
    { name: '不作要求', requirements: { elite: -1, level: -1, skill_level: -1, module: -1, module_level: -1, potential: -1 } },
  ]);
  await openCommunity(page);
  await openDetail(page);
  await expect(requirement(page, '术语甲')).toContainText('精二');
  await expect(requirement(page, '术语甲')).toContainText('专一');
  await expect(requirement(page, '术语甲')).toContainText(/X\s*模/);
  await expect(requirement(page, '术语甲')).toContainText(/模组\s*(?:3|三)\s*级|(?:3|三)\s*级模组/);
  await expect(requirement(page, '术语乙')).toContainText('专二');
  await expect(requirement(page, '术语乙')).toContainText(/Y\s*模/);
  await expect(requirement(page, '术语丙')).toContainText('专三');
  for (const [name, type] of [['术语丙', 'A'], ['术语丁', 'D'], ['术语戊', 'B']]) await expect(requirement(page, name)).toContainText(new RegExp(`${type}\\s*模`));
  await expect(requirement(page, '术语己')).toContainText(/精零|未精英化/);
  await expect(requirement(page, '术语己')).toContainText(/技能\s*7\s*级|7\s*级/);
  await expect(requirement(page, '术语己')).toContainText(/不使用模组|无模组/);
  await expect(requirement(page, '不作要求')).not.toContainText('-1');
});

test('an unavailable local recognition read leaves community badges neutral', async ({ page }) => {
  await installProbe(page, roster([recognized('阿米娅')]));
  await page.evaluate(() => { (window as ProbeWindow).operatorProbe.fail = true; });
  await openCommunity(page);
  await expect(card(page).locator('.cp-operator-tag[data-status="unknown"]')).toHaveCount(1);
  await openDetail(page);
  await expect(requirement(page, '阿米娅')).toHaveAttribute('data-status', 'unknown');
  await expect(detail(page).locator('[data-status="missing"], [data-status="insufficient"]')).toHaveCount(0);
});

test('community names match foreign client rosters by unique resource identity and keep ambiguous names neutral', async ({ page }) => {
  const value = roster([recognized('Foreign Name', { id: 'char_alias', own: false })]);
  value.clientType = 'YoStarJP';
  await installProbe(page, value, [{ name: '中文别名' }, { name: '歧义名称' }]);
  await page.evaluate(() => {
    const harness = (window as ProbeWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (method === 'resources.operator') {
        harness.commands.push(`operator-client:${params.clientType}`);
        return { name: params.name, id: params.name === '中文别名' ? 'char_alias' : null, rarity: null, mimeType: null, data: null, resourceVersion: 'synthetic-resource' };
      }
      return original(method, params);
    };
  });
  await openCommunity(page);
  await expect(tag(page, '中文别名')).toHaveAttribute('data-status', 'missing');
  await expect(tag(page, '歧义名称')).toHaveAttribute('data-status', 'unknown');
  await openDetail(page);
  await requirement(page, '中文别名').scrollIntoViewIfNeeded();
  await expect(requirement(page, '中文别名')).toHaveAttribute('data-status', 'missing');
  await expect(requirement(page, '歧义名称')).toHaveAttribute('data-status', 'unknown');
  expect(await page.evaluate(() => (window as ProbeWindow).runtimeHarness.commands.filter(command => command.startsWith('operator-client:')))).toEqual(['operator-client:YoStarJP', 'operator-client:YoStarJP']);
});

test('optional groups show only one locally suitable operator in summaries and all alternatives in details', async ({ page }, testInfo) => {
  await installProbe(page, roster([
    recognized('备选未拥有', { own: false }), recognized('备选练度不足', { level: 1 }), recognized('备选合规甲'), recognized('备选合规乙'),
  ]), ['备选未拥有', '备选练度不足', '备选合规甲', '备选合规乙'].map(name => ({ name, group: '输出备选', skill: 3, requirements: { elite: 2, level: 80 } })));
  await openCommunity(page);
  await expect(card(page).locator('.cp-operator-tag')).toHaveCount(1);
  await expect(tag(page, '备选合规甲')).toHaveAttribute('data-status', 'owned');
  await card(page).screenshot({ path: testInfo.outputPath('optional-group-summary.png') });
  await openDetail(page);
  await expect(detail(page).locator('.cp-operator-grid > li')).toHaveCount(4);
  for (const [name, status] of [['备选未拥有', 'missing'], ['备选练度不足', 'insufficient'], ['备选合规甲', 'owned'], ['备选合规乙', 'owned']]) await expect(requirement(page, name)).toHaveAttribute('data-status', status);
  await detail(page).getByRole('button', { name: '返回作业列表', exact: true }).click();
  await page.evaluate(() => {
    const probe = (window as ProbeWindow).operatorProbe;
    probe.rosters['mock-device-1'].operators.find(operator => operator.name === '备选合规甲')!.level = 1;
    probe.notify('device.data_synced');
  });
  await expect(card(page).locator('.cp-operator-tag')).toHaveCount(1);
  await expect(tag(page, '备选合规乙')).toHaveAttribute('data-status', 'owned');
  await page.evaluate(() => {
    const probe = (window as ProbeWindow).operatorProbe;
    probe.rosters['mock-device-1'].operators.find(operator => operator.name === '备选合规乙')!.level = 1;
    probe.notify('device.data_synced');
  });
  await expect(card(page).locator('.cp-operator-tag')).toHaveCount(0);
  await expect(card(page).locator('.cp-group-unverified')).toContainText('暂无符合已知要求的干员');
});

test('optional groups prefer verified progress and never treat unknown training as compliant', async ({ page }) => {
  await installProbe(page, roster([
    recognized('等级未知', { level: -1 }), recognized('练度符合', { elite: 2, level: -1 }), recognized('专精未知'),
  ]), [
    { name: '等级未知', group: '输出备选', requirements: { elite: 2, level: 80 } },
    { name: '练度符合', group: '输出备选', requirements: { elite: 1, level: 70 } },
    { name: '专精未知', group: '专精备选', skill: 3, requirements: { skill_level: 10, module: 1 } },
  ]);
  await openCommunity(page);
  await expect(card(page).locator('.cp-operator-tag')).toHaveCount(1);
  await expect(tag(page, '练度符合')).toHaveAttribute('data-status', 'owned');
  await expect(tag(page, '等级未知')).toHaveCount(0);
  await expect(tag(page, '专精未知')).toHaveCount(0);
  await expect(card(page).locator('.cp-group-unverified')).toContainText('尚未确认可用干员');
  await openDetail(page);
  await expect(detail(page).locator('.cp-operator-grid > li')).toHaveCount(3);
  await expect(requirement(page, '等级未知')).toContainText('等级未核验');
  await expect(requirement(page, '专精未知')).toContainText('技能／专精、模组未核验');
});
