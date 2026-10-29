import type { Page } from '@playwright/test';
import type { CopilotPreview, RpcResult } from '../../packages/contracts/src/index';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

type SetProbeWindow = HarnessWindow & {
  setOperatorProbe: {
    reads: string[];
    finished: string[];
    active: number;
    maximum: number;
    hold: boolean;
    fail: boolean;
    revision: number;
    writes: string[];
    release: () => void;
  };
};
const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const setRequirements = (page: Page, id = '12') =>
  library(page).getByLabel(`作业集 #${id} 干员要求`, { exact: true });

async function installSetProbe(
  page: Page,
  sets = ['12'],
  hold = false,
  setup?: () => Promise<void>,
) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await setup?.();
  await page.evaluate(
    ({ sets, hold }) => {
      const target = window as unknown as SetProbeWindow;
      const harness = target.runtimeHarness;
      const original = harness.call.bind(harness);
      const waiters: (() => void)[] = [];
      const probe = (target.setOperatorProbe = {
        reads: [],
        finished: [],
        active: 0,
        maximum: 0,
        hold,
        fail: false,
        revision: 0,
        writes: [],
        release: () => {
          probe.hold = false;
          waiters.splice(0).forEach((resolve) => resolve());
        },
      } as SetProbeWindow['setOperatorProbe']);
      harness.call = async (method, params) => {
        if (['copilot.import', 'copilot.start', 'tool.start', 'run.start'].includes(method))
          probe.writes.push(method);
        if (method === 'recognition.get' && params.kind === 'operators') {
          return {
            deviceId: String(params.deviceId),
            kind: 'operators',
            clientType: 'Official',
            collectedAt: '2026-10-25T03:00:00Z',
            runId: 'set-probe',
            items: [],
            operators: ['刚需甲', '刚需乙', '备选甲', '备选乙'].map((name, index) => ({
              id: `char_set_${index}`,
              name,
              own: index !== 3,
              elite: 2,
              level: 90,
              potential: 1,
              rarity: 6,
            })),
          } satisfies RpcResult<'recognition.get'>;
        }
        if (method === 'copilot.search' && params.target === 'set')
          return {
            items: sets.map((id) => ({
              id,
              title: `合成作业集${id}`,
              description: '保留的作业集摘要',
              author: '',
              uploader: '合成上传者',
              url: `https://prts.plus/set/${id}`,
            })),
            page: Number(params.page || 1),
            hasNext: false,
            total: sets.length,
          };
        if (method !== 'copilot.preview' || !/^s\d+$/u.test(String(params.code)))
          return original(method, params);
        const code = String(params.code);
        probe.reads.push(code);
        probe.active++;
        probe.maximum = Math.max(probe.maximum, probe.active);
        try {
          if (probe.hold) await new Promise<void>((resolve) => waiters.push(resolve));
          if (probe.fail) throw new Error('合成作业集读取失败');
          const result = (await original(method, params)) as CopilotPreview;
          for (const [index, entry] of result.entries.entries())
            if (entry.record) {
              entry.record.title = `${code.slice(1)}${probe.revision ? '更新' : ''}关卡${index + 1}`;
              entry.record.stageName = index ? '2-1' : '1-7';
              entry.record.difficulty = probe.revision || index ? 2 : 1;
              entry.record.operators = [
                { name: index ? '刚需乙' : '刚需甲' },
                { name: index ? '备选乙' : '备选甲', group: '医疗' },
              ];
            }
          const extra = result.entries[0];
          for (const index of [4, 5]) {
            const additional = { ...structuredClone(extra), id: `${code}-extra-${index}` };
            if (index === 5 && additional.record) additional.record.difficulty = 0;
            result.entries.push(additional);
          }
          return result;
        } finally {
          probe.active--;
          probe.finished.push(code);
        }
      };
    },
    { sets, hold },
  );
  await page.locator('.sidebar').getByRole('button', { name: '作业中心', exact: true }).click();
  await expect(
    page.getByRole('region', { name: '作业执行队列', exact: true }).locator('.cp-save-state'),
  ).toContainText('已保存');
  await library(page).getByRole('tab', { name: '社区作业集', exact: true }).click();
  await expect(
    library(page).getByRole('button', { name: `查看详情 合成作业集${sets[0]}`, exact: true }),
  ).toBeVisible();
}

test('visible sets load difficulty once, preserve member requirements and share the detail preview cache', async ({
  page,
}) => {
  await installSetProbe(page);
  const card = library(page).locator('article.cp-record').first();
  const difficulty = card.locator('.cp-difficulty-badges');
  await expect(difficulty).toContainText('普通');
  await expect(difficulty).toContainText('突袭');
  await expect(difficulty).toHaveAttribute(
    'title',
    /普通：2 项；突袭：1 项；难度未声明：1 项；无效：1 项/u,
  );
  const requirements = setRequirements(page);
  await expect(requirements).not.toHaveAttribute('open', '');
  await requirements.locator(':scope > summary').click();
  const members = requirements.locator('.cp-set-operator-member');
  await expect(members).toHaveCount(3);
  await expect(members.nth(0)).toContainText('12关卡1');
  await expect(members.nth(0)).toContainText('1-7');
  await expect(members.nth(1)).toContainText('12关卡2');
  await expect(members.nth(1)).toContainText('2-1');
  await expect(members.nth(0).getByRole('button', { name: '医疗', exact: true })).toHaveAttribute(
    'data-status',
    'owned',
  );
  await expect(members.nth(1).getByRole('button', { name: '医疗', exact: true })).toHaveAttribute(
    'data-status',
    'missing',
  );
  await members.nth(0).getByRole('button', { name: '医疗', exact: true }).click();
  await expect(
    members.nth(0).getByRole('region', { name: '医疗备选干员', exact: true }),
  ).toContainText('备选甲');
  await expect(
    members.nth(1).getByRole('region', { name: '医疗备选干员', exact: true }),
  ).not.toBeVisible();
  await expect(members.nth(2)).toContainText('作业 404 已删除');
  const more = requirements.getByRole('button', { name: '显示其余 2 项作业', exact: true });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(members).toHaveCount(5);
  expect(
    await page.evaluate(() => (window as unknown as SetProbeWindow).setOperatorProbe.reads),
  ).toEqual(['s12']);
  const less = requirements.getByRole('button', { name: '收起更多作业', exact: true });
  await expect(less).toHaveAttribute('aria-expanded', 'true');
  await less.click();
  await expect(members).toHaveCount(3);
  expect(
    await page.evaluate(() => (window as unknown as SetProbeWindow).setOperatorProbe.reads),
  ).toEqual(['s12']);
  await library(page).getByRole('button', { name: '查看详情 合成作业集12', exact: true }).click();
  await expect(page.getByRole('region', { name: '导入预览', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as SetProbeWindow).setOperatorProbe.reads),
  ).toEqual(['s12']);
  expect(
    await page.evaluate(() => (window as unknown as SetProbeWindow).setOperatorProbe.writes),
  ).toEqual([]);
});

test('failed set requirements preserve the summary and allow an explicit retry', async ({
  page,
}) => {
  await installSetProbe(page, ['12'], true);
  await page.evaluate(() => {
    (window as unknown as SetProbeWindow).setOperatorProbe.fail = true;
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as SetProbeWindow).setOperatorProbe.reads.length),
    )
    .toBe(1);
  await page.evaluate(() => (window as unknown as SetProbeWindow).setOperatorProbe.release());
  const requirements = setRequirements(page);
  await requirements.locator(':scope > summary').click();
  await expect(requirements).toContainText('干员要求读取失败');
  await expect(library(page)).toContainText('保留的作业集摘要');
  await expect(
    library(page).getByRole('button', { name: '查看详情 合成作业集12', exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as SetProbeWindow).setOperatorProbe.fail = false;
  });
  await requirements.getByRole('button', { name: '重试读取干员要求', exact: true }).click();
  await expect(requirements.locator('.cp-set-operator-member')).toHaveCount(3);
  expect(
    await page.evaluate(() => (window as unknown as SetProbeWindow).setOperatorProbe.reads),
  ).toEqual(['s12', 's12']);
});
