import type { Page } from '@playwright/test';
import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { navigate } from './fixtures/navigation';

const library = (page: Page) => page.getByRole('region', { name: '作业库', exact: true });
const detail = (page: Page) => page.getByRole('complementary', { name: '作业详情', exact: true });
const queue = (page: Page) => page.getByRole('region', { name: '作业执行队列', exact: true });
const commands = (page: Page) =>
  page.evaluate(() => (window as unknown as HarnessWindow).runtimeHarness.commands);
async function openCenter(page: Page) {
  await page.goto('/');
  await navigate(page, '作业中心');
  await expect(queue(page).locator('.cp-save-state')).toContainText('已保存');
}
async function countReads(page: Page) {
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (['copilot.search', 'copilot.preview', 'copilot.rating.get'].includes(method))
        harness.commands.push(method);
      return original(method, params);
    };
  });
}

test('searches and details are cached across source changes, pagination and leaving the page', async ({
  page,
}) => {
  await openCenter(page);
  await countReads(page);
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(1);
  await library(page).getByLabel('社区搜索关键词').fill('低配');
  await library(page).getByLabel('社区关卡筛选').fill('1-7');
  await expect
    .poll(async () => (await commands(page)).filter((value) => value === 'copilot.search').length)
    .toBe(2);
  await expect(library(page).getByRole('button', { name: '下一页', exact: true })).toBeEnabled();
  await library(page).getByRole('button', { name: '下一页', exact: true }).click();
  const work = library(page).getByRole('button', { name: '查看详情 合成社区作业 2', exact: true });
  await expect(work).toBeVisible();
  await library(page).getByRole('button', { name: '上一页', exact: true }).click();
  await expect(
    library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true }),
  ).toBeVisible();
  await library(page).getByRole('button', { name: '下一页', exact: true }).click();
  await work.click();
  await expect(detail(page).getByRole('button', { name: '点赞作业', exact: true })).toBeEnabled();
  await detail(page).getByRole('button', { name: '返回作业列表', exact: true }).click();
  await library(page)
    .getByRole('tab', { name: /^本地作业/ })
    .click();
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await expect(work).toBeVisible();
  await work.click();
  await expect(detail(page).getByRole('button', { name: '点赞作业', exact: true })).toBeEnabled();
  await detail(page).getByRole('button', { name: '返回作业列表', exact: true }).click();
  await navigate(page, '主页');
  await navigate(page, '作业中心');
  await expect(work).toBeVisible();
  await expect(library(page).getByLabel('社区搜索关键词')).toHaveValue('低配');
  await expect(library(page).getByLabel('社区关卡筛选')).toHaveValue('1-7');
  await work.click();
  await expect(detail(page).getByRole('button', { name: '点赞作业', exact: true })).toBeEnabled();
  const reads = await commands(page);
  expect(reads.filter((value) => value === 'copilot.search')).toHaveLength(3);
  expect(reads.filter((value) => value === 'copilot.preview')).toHaveLength(1);
  expect(reads.filter((value) => value === 'copilot.rating.get').length).toBeGreaterThanOrEqual(3);
});

test('refresh keeps the same visible results and a failed refresh can be retried', async ({
  page,
}) => {
  await openCenter(page);
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(1);
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    let first = true;
    harness.call = async (method, params) => {
      if (method === 'copilot.search' && first) {
        first = false;
        harness.commands.push('refresh-pending');
        await new Promise((_resolve, reject) => {
          (window as unknown as { failSearch: () => void }).failSearch = () =>
            reject(new Error('合成搜索刷新失败'));
        });
      }
      return original(method, params);
    };
  });
  const work = library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true });
  await library(page).getByRole('button', { name: '刷新社区搜索', exact: true }).click();
  await expect.poll(() => commands(page)).toContain('refresh-pending');
  await expect(library(page).locator('.cp-community-results')).toHaveAttribute('aria-busy', 'true');
  await expect(work).toBeVisible();
  await page.evaluate(() => (window as unknown as { failSearch: () => void }).failSearch());
  await expect(library(page).getByRole('alert')).toContainText('合成搜索刷新失败');
  await expect(work).toBeVisible();
  await library(page).getByRole('button', { name: '刷新社区搜索', exact: true }).click();
  await expect(library(page).locator('.cp-community-results')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(library(page).getByRole('alert')).toHaveCount(0);
  await expect(work).toBeVisible();
});

test('in-flight searches are shared and an older query cannot replace a newer result', async ({
  page,
}) => {
  await openCenter(page);
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (method !== 'copilot.search') return original(method, params);
      harness.commands.push(`search:${params.keyword}`);
      if (!params.keyword)
        await new Promise<void>((resolve) => {
          (window as unknown as { releaseSearch: () => void }).releaseSearch = resolve;
        });
      const result = (await original(method, params)) as { items: { title: string }[] };
      result.items[0].title = params.keyword ? '新的搜索结果' : '旧的搜索结果';
      harness.commands.push(`finished:${params.keyword}`);
      return result;
    };
  });
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await expect.poll(() => commands(page)).toContain('search:');
  await library(page)
    .getByRole('tab', { name: /^本地作业/ })
    .click();
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await library(page).getByLabel('社区搜索关键词').fill('新的');
  await expect(
    library(page).getByRole('button', { name: '查看详情 新的搜索结果', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => (window as unknown as { releaseSearch: () => void }).releaseSearch());
  await expect.poll(() => commands(page)).toContain('finished:');
  await expect(
    library(page).getByRole('button', { name: '查看详情 新的搜索结果', exact: true }),
  ).toBeVisible();
  await library(page).getByLabel('社区搜索关键词').fill('');
  await expect(
    library(page).getByRole('button', { name: '查看详情 旧的搜索结果', exact: true }),
  ).toBeVisible();
  expect((await commands(page)).filter((value) => value.startsWith('search:'))).toEqual([
    'search:',
    'search:新的',
  ]);
});

test('reading a detail preserves visible search results and duplicate requests share one read', async ({
  page,
}) => {
  await openCenter(page);
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await expect(library(page).locator('.cp-record')).toHaveCount(1);
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (method === 'copilot.preview') {
        harness.commands.push('preview-pending');
        await new Promise<void>((resolve) => {
          (window as unknown as { releasePreview: () => void }).releasePreview = resolve;
        });
      }
      return original(method, params);
    };
  });
  const work = library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true });
  await work.scrollIntoViewIfNeeded();
  await work.click();
  await expect(page.getByText('正在读取作业…', { exact: true })).toBeVisible();
  await expect(work).toBeVisible();
  await work.click();
  await page.evaluate(() => (window as unknown as { releasePreview: () => void }).releasePreview());
  await expect(detail(page)).toBeVisible();
  expect((await commands(page)).filter((value) => value === 'preview-pending')).toHaveLength(1);
});

for (const changed of [false, true]) {
  test(`expired preview ${changed ? 'requires review when content changes' : 'recovers with the same immutable work'}`, async ({
    page,
  }) => {
    await openCenter(page);
    await page.evaluate((changed) => {
      const harness = (window as unknown as HarnessWindow).runtimeHarness;
      const original = harness.call.bind(harness);
      let previews = 0,
        imports = 0;
      harness.call = async (method, params) => {
        if (method === 'copilot.import') {
          harness.commands.push(`import:${++imports}`);
          if (imports === 1) throw { code: -32004, message: '导入预览已过期，请重新预览' };
        }
        const result = await original(method, params);
        if (method === 'copilot.preview') {
          harness.commands.push(`preview:${++previews}`);
          if (changed && previews === 2) {
            const entry = (
              result as { entries: { record: { versionId: string; title: string } }[] }
            ).entries[0];
            entry.record.versionId = 'f'.repeat(64);
            entry.record.title = '已更新的社区作业';
          }
        }
        return result;
      };
    }, changed);
    await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
    await library(page)
      .getByRole('button', { name: '查看详情 合成社区作业 1', exact: true })
      .click();
    await detail(page).getByRole('button', { name: '导入到作业库', exact: true }).click();
    if (changed) {
      await expect(page.getByRole('alert')).toContainText('社区作业内容已更新或不可用');
      await expect(page.getByRole('region', { name: '导入预览', exact: true })).toContainText(
        '已更新的社区作业',
      );
      expect((await commands(page)).filter((value) => value.startsWith('import:'))).toEqual([
        'import:1',
      ]);
    } else {
      await expect(detail(page)).toContainText('已保存到本地');
      expect((await commands(page)).filter((value) => value.startsWith('import:'))).toEqual([
        'import:1',
        'import:2',
      ]);
    }
    expect((await commands(page)).filter((value) => value.startsWith('preview:'))).toEqual([
      'preview:1',
      'preview:2',
    ]);
  });
}

test('unrelated runtime events refresh ownership without disabling a ready queue', async ({
  page,
}) => {
  await openCenter(page);
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  await library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true }).click();
  await detail(page).getByRole('button', { name: '导入并加入当前队列', exact: true }).click();
  const start = page.getByRole('button', { name: '开始作业', exact: true });
  await expect(start).toBeEnabled();
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    harness.call = async (method, params) => {
      if (method === 'device.availability') {
        harness.commands.push('availability-pending');
        await new Promise<void>((resolve) => {
          (window as unknown as { releaseAvailability: () => void }).releaseAvailability = resolve;
        });
      }
      const result = await original(method, params);
      if (method === 'app.snapshot')
        (result as { events: unknown[] }).events.push({
          id: 999999,
          type: 'diagnostic.changed',
          message: '合成诊断事件',
          data: {},
          createdAt: new Date().toISOString(),
        });
      return result;
    };
    harness.emitEvent('diagnostic.changed');
  });
  await expect.poll(() => commands(page)).toContain('availability-pending');
  await expect(start).toBeEnabled();
  await expect(queue(page).getByText('正在检查设备占用', { exact: true })).toHaveCount(0);
  await page.evaluate(() =>
    (window as unknown as { releaseAvailability: () => void }).releaseAvailability(),
  );
  await expect(start).toBeEnabled();
});

test('partially available sets are cached and expired member imports preserve the remaining selection', async ({
  page,
}) => {
  await openCenter(page);
  await countReads(page);
  await library(page).getByRole('tab', { name: '社区作业集', exact: true }).click();
  const work = library(page).getByRole('button', { name: '查看详情 合成有序作业集', exact: true });
  await work.click();
  const preview = page.getByRole('region', { name: '导入预览', exact: true });
  await expect(preview.getByLabel('选择导入 3', { exact: true })).toBeDisabled();
  await preview.getByRole('button', { name: '关闭导入预览', exact: true }).click();
  await work.click();
  await expect(preview).toBeVisible();
  expect((await commands(page)).filter((value) => value === 'copilot.preview')).toHaveLength(1);
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    let first = true;
    harness.call = async (method, params) => {
      if (method === 'copilot.import' && first) {
        first = false;
        throw { code: -32004, message: '导入预览已过期，请重新预览' };
      }
      return original(method, params);
    };
  });
  await preview.getByRole('button', { name: '查看干员与作业详情', exact: true }).first().click();
  await detail(page).getByRole('button', { name: '导入到作业库', exact: true }).click();
  await expect(detail(page)).toContainText('已保存到本地');
  await detail(page).getByRole('button', { name: '返回导入预览', exact: true }).click();
  await expect(preview.getByLabel('选择导入 1', { exact: true })).not.toBeChecked();
  await expect(preview.getByLabel('选择导入 2', { exact: true })).toBeChecked();
  expect((await commands(page)).filter((value) => value === 'copilot.preview')).toHaveLength(2);
});

test('an expired rating source invalidates the detail cache without replaying any vote', async ({
  page,
}) => {
  await openCenter(page);
  await countReads(page);
  await library(page).getByRole('tab', { name: '社区搜索', exact: true }).click();
  const work = library(page).getByRole('button', { name: '查看详情 合成社区作业 1', exact: true });
  await work.click();
  await expect(detail(page).getByRole('button', { name: '点赞作业', exact: true })).toBeEnabled();
  await detail(page).getByRole('button', { name: '返回作业列表', exact: true }).click();
  await page.evaluate(() => {
    const harness = (window as unknown as HarnessWindow).runtimeHarness;
    const original = harness.call.bind(harness);
    let restored = false;
    harness.call = async (method, params) => {
      if (method === 'copilot.preview') restored = true;
      if (method === 'copilot.rating.get' && !restored)
        throw { code: -32602, message: '作业来源已过期或与版本不匹配，请重新打开详情' };
      if (method === 'copilot.rating.set') harness.commands.push('vote');
      return original(method, params);
    };
  });
  await work.click();
  await expect(detail(page).getByRole('alert')).toContainText('作业来源已过期');
  await detail(page).getByRole('button', { name: '刷新作业详情', exact: true }).click();
  await expect(detail(page).getByRole('button', { name: '点赞作业', exact: true })).toBeEnabled();
  await expect(detail(page).getByRole('alert')).toHaveCount(0);
  expect((await commands(page)).filter((value) => value === 'copilot.preview')).toHaveLength(2);
  expect((await commands(page)).filter((value) => value === 'vote')).toHaveLength(0);
  await detail(page).getByRole('button', { name: '返回作业列表', exact: true }).click();
  await expect(work).toBeFocused();
});
