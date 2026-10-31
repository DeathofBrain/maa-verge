import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stageCatalog } from '@backend/modules/resources/stages';
import { Runtime } from '@backend/app/runtime';
import { validateStageListResult } from '@contracts/validators.js';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const temporary = () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-stage-test-'));
  roots.push(root);
  return root;
};
function pack(files: Record<string, unknown>) {
  const root = temporary();
  for (const [relative, value] of Object.entries(files)) {
    const filename = path.join(root, 'resource', relative);
    mkdirSync(path.dirname(filename), { recursive: true });
    writeFileSync(filename, JSON.stringify(value));
  }
  return { core: { version: 'v6.20.0' }, resource: { path: root, version: 'synthetic-r1' } };
}
const clock = new Date('2026-10-26T01:00:00Z');
const activity = (start = '2026/10/25 12:00:00', end = '2026/10/28 12:00:00') => ({
  StageName: '合成活动',
  UtcStartTime: start,
  UtcExpireTime: end,
  TimeZone: 8,
  Tip: '合成提示',
});
const group = (info = activity(), minimum = 'v6.20.0') => ({
  Activity: info,
  MinimumRequired: minimum,
  Stages: [{ Display: '合成材料 · AA-8', Value: 'AA-8', Drop: '材料' }],
});
const nav = (prefix: string, name: string) => ({
  [`${prefix}-OpenOcr`]: { text: [name] },
  [`${prefix}-8`]: { sub: [`${prefix}-8@${prefix}-OpenOpt`] },
  [`${prefix}-6`]: { sub: [`${prefix}-6@${prefix}-OpenOpt`] },
  [`${prefix}-5`]: { algorithm: 'JustReturn' },
  [`${prefix}-8@SideStoryStage`]: { text: [`${prefix}-8`] },
});
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('installed stage catalogs', () => {
  test('missing resources provide the original permanent presets without hidden manual stages', async () => {
    const result = await stageCatalog({}, 'Official', clock);
    expect(validateStageListResult(result)).toBe(true);
    expect(result.source).toBe('builtin');
    expect(result.activities).toEqual([]);
    expect(result.stages.map((stage) => stage.value)).toEqual([
      '',
      '1-7',
      'R8-11',
      '12-17-HARD',
      'CE-6',
      'AP-5',
      'CA-5',
      'LS-6',
      'SK-5',
      'Annihilation',
      'PR-A-1',
      'PR-A-2',
      'PR-B-1',
      'PR-B-2',
      'PR-C-1',
      'PR-C-2',
      'PR-D-1',
      'PR-D-2',
    ]);
    expect(result.stages.find((stage) => stage.value === 'CE-6')?.available).toBe(false);
  });
  test('calendar groups precede permanent stages and select Bilibili through Official metadata', async () => {
    const combo = pack({
      'gui/StageActivityV2.json': {
        Official: { sideStoryStage: { sample: group() } },
        YoStarEN: {
          sideStoryStage: { en: { ...group(), Stages: [{ Display: 'EN-7', Value: 'EN-7' }] } },
        },
      },
    });
    const result = await stageCatalog(combo, 'Bilibili', clock);
    expect(validateStageListResult(result)).toBe(true);
    expect(result.source).toBe('installed');
    expect(result.stages.slice(0, 3).map((stage) => stage.value)).toEqual(['', 'AA-8', '1-7']);
    expect(result.stages[1]).toMatchObject({ available: true, tip: '材料', activityId: 'sample' });
    expect(result.activities).toEqual([
      {
        id: 'sample',
        name: '合成活动',
        startAt: '2026-10-25T04:00:00.000Z',
        endAt: '2026-10-28T04:00:00.000Z',
        clientType: 'Bilibili',
        status: 'active',
        source: 'activity-metadata',
      },
    ]);
    expect((await stageCatalog(combo, 'YoStarEN', clock)).stages[1].value).toBe('EN-7');
  });
  test('activity periods exclude exact boundaries and never revive expired calendars from version metadata', async () => {
    const combo = pack({
      'gui/StageActivityV2.json': { Official: { sideStoryStage: { sample: group() } } },
      'version.json': { activity: { name: '合成活动', time: 1 } },
      'tasks/Stages/AA.json': nav('AA', '合成活动'),
    });
    const starts = new Date('2026-10-25T04:00:00Z'),
      ends = new Date('2026-10-28T04:00:00Z');
    const before = await stageCatalog(combo, 'Official', starts);
    expect(before.activities[0].status).toBe('upcoming');
    expect(before.stages[1].available).toBe(false);
    expect(
      (await stageCatalog(combo, 'Official', new Date(starts.getTime() + 1))).stages[1].available,
    ).toBe(true);
    const expired = await stageCatalog(combo, 'Official', ends);
    expect(expired.activities).toEqual([]);
    expect(expired.stages.some((stage) => stage.category === 'activity')).toBe(false);
  });
  test('weekly resource openings follow the client game day at 04:00', async () => {
    const available = async (iso: string, client: 'Official' | 'YoStarEN') =>
      (await stageCatalog({}, client, new Date(iso))).stages.find((stage) => stage.value === 'CE-6')
        ?.available;
    expect(await available('2026-10-25T19:59:59Z', 'Official')).toBe(true);
    expect(await available('2026-10-25T20:00:00Z', 'Official')).toBe(false);
    expect(await available('2026-10-26T10:59:59Z', 'YoStarEN')).toBe(true);
    expect(await available('2026-10-26T11:00:00Z', 'YoStarEN')).toBe(false);
  });
  test('resource-collection periods override weekly closures only while active', async () => {
    const combo = pack({
      'StageActivityV2.json': { Official: { resourceCollection: activity(), sideStoryStage: {} } },
    });
    const active = await stageCatalog(combo, 'Official', clock);
    expect(active.stages.every((stage) => stage.available)).toBe(true);
    expect(active.activities[0]).toMatchObject({ id: 'resource-collection', status: 'active' });
    const expired = await stageCatalog(combo, 'Official', new Date('2026-11-02T01:00:00Z'));
    expect(expired.stages.find((stage) => stage.value === 'CE-6')?.available).toBe(false);
  });
  test('minimum core versions handle prereleases and skip invalid requirements', async () => {
    const combo = pack({
      'gui/StageActivityV2.json': {
        Official: {
          sideStoryStage: {
            later: group(activity(), 'v6.21.0'),
            invalid: { ...group(activity(), 'not-semver'), Stages: [{ Value: 'BB-1' }] },
            pre: { ...group(activity(), 'v6.20.0-beta.1'), Stages: [{ Value: 'CC-1' }] },
          },
        },
      },
    });
    const result = await stageCatalog(combo, 'Official', clock);
    expect(result.stages.find((stage) => stage.value === 'AA-8')).toMatchObject({
      available: false,
      tip: '需要核心 v6.21.0 或更新版本',
    });
    expect(result.stages.some((stage) => stage.value === 'BB-1')).toBe(false);
    expect(result.stages.find((stage) => stage.value === 'CC-1')?.available).toBe(true);
    expect(result.diagnostics.join()).toContain('最低核心版本无效');
    combo.core.version = 'v6.20.0-beta.0';
    expect(
      (await stageCatalog(combo, 'Official', clock)).stages.find((stage) => stage.value === 'CC-1')
        ?.available,
    ).toBe(false);
  });
  test('malformed dates and stage-specific expired periods are skipped', async () => {
    const stages = [
      { Value: 'AA-8' },
      { Value: 'AA-7', Activity: activity('2026/10/01 12:00:00', '2026/10/10 12:00:00') },
    ];
    const combo = pack({
      'gui/StageActivityV2.json': {
        Official: {
          sideStoryStage: {
            sample: { ...group(), Stages: stages },
            invalid: group(activity('2026/02/30 12:00:00')),
          },
        },
      },
    });
    const result = await stageCatalog(combo, 'Official', clock);
    expect(
      result.stages.filter((stage) => stage.category === 'activity').map((stage) => stage.value),
    ).toEqual(['AA-8']);
    expect(result.diagnostics.join()).toContain('开放时间无效');
    expect(validateStageListResult(result)).toBe(true);
  });
  test('version fallback matches only advertised navigable activity and reports uncertain dates', async () => {
    const combo = pack({
      'version.json': { activity: { name: '合成当前活动', time: 1792886400 } },
      'tasks/Stages/AA.json': nav('AA', '合成当前活动'),
      'tasks/Stages/OLD.json': nav('OLD', '合成历史活动'),
    });
    const result = await stageCatalog(combo, 'Official', clock);
    expect(
      result.stages.filter((stage) => stage.category === 'activity').map((stage) => stage.value),
    ).toEqual(['AA-8', 'AA-6']);
    expect(result.activities[0]).toMatchObject({
      name: '合成当前活动',
      status: 'unknown',
      source: 'resource-version',
      endAt: null,
    });
    expect(result.stages[1].tip).toContain('未提供结束时间');
    expect(result.message).toContain('未确认');
    expect(validateStageListResult(result)).toBe(true);
  });
  test('global clients use their own resource version and merged navigation overrides', async () => {
    const combo = pack({
      'version.json': { activity: { name: '国服活动', time: 1 } },
      'tasks/Stages/AA.json': nav('AA', '国服活动'),
      'tasks/Stages/BB.json': nav('BB', '国服未译名'),
      'global/YoStarEN/resource/version.json': { activity: { name: 'Synthetic EN', time: 1 } },
      'global/YoStarEN/resource/tasks/Stages/BB.json': {
        'BB-OpenOcr': { text: ['Synthetic EN'] },
        'BB-8': { text: ['translated'] },
      },
    });
    const result = await stageCatalog(combo, 'YoStarEN', clock);
    expect(result.activities[0].name).toBe('Synthetic EN');
    expect(
      result.stages.filter((stage) => stage.category === 'activity').map((stage) => stage.value),
    ).toEqual(['BB-8', 'BB-6']);
    const missingClient = await stageCatalog(combo, 'YoStarJP', clock);
    expect(missingClient.activities).toEqual([]);
    expect(missingClient.stages.some((stage) => stage.category === 'activity')).toBe(false);
  });
  test('resource-only fallback recognizes direct OpenOcr and OpenOpt navigation variants', async () => {
    const combo = pack({
      'version.json': { activity: { name: '合成导航变体', time: 1 } },
      'tasks/Stages/AA.json': {
        'AA-OpenOcr': { text: ['合成导航变体'] },
        'AA-8': { sub: ['AA-OpenOcr'] },
        'AA-9': { sub: ['AA-OpenOpt'] },
      },
    });
    expect(
      (await stageCatalog(combo, 'Official', clock)).stages
        .filter((stage) => stage.category === 'activity')
        .map((stage) => stage.value),
    ).toEqual(['AA-9', 'AA-8']);
  });
  test('corrupt or oversized metadata is bounded and falls back without failing the catalog', async () => {
    const combo = pack({
      'version.json': { activity: { name: '合成活动', time: 1 } },
      'tasks/Stages/AA.json': nav('AA', '合成活动'),
    });
    mkdirSync(path.join(combo.resource.path, 'resource/gui'));
    writeFileSync(
      path.join(combo.resource.path, 'resource/gui/StageActivityV2.json'),
      ' '.repeat(2 * 1024 * 1024 + 1),
    );
    const result = await stageCatalog(combo, 'Official', clock);
    expect(result.stages[1].value).toBe('AA-8');
    expect(result.diagnostics.join()).toContain('超出限制');
    expect(validateStageListResult(result)).toBe(true);
  });
  test('RPC reads the active generation on every call and accepts no filesystem path parameters', async () => {
    const runtime = new Runtime(temporary(), {
      validator: async () => {},
      calendar: { fetcher: null },
    });
    runtimes.push(runtime);
    const first = pack({
      'version.json': { activity: { name: '第一活动', time: 1 } },
      'tasks/Stages/AA.json': nav('AA', '第一活动'),
    });
    const second = pack({
      'version.json': { activity: { name: '第二活动', time: 1 } },
      'tasks/Stages/BB.json': nav('BB', '第二活动'),
    });
    runtime.store.put('active', 'combo', first);
    expect((await runtime.handle('stages.list')).activities[0].name).toBe('第一活动');
    runtime.store.put('active', 'combo', second);
    expect((await runtime.handle('stages.list', { clientType: 'Official' })).stages[1].value).toBe(
      'BB-8',
    );
    await expect(
      runtime.handle('stages.list', { resourcePath: first.resource.path }),
    ).rejects.toMatchObject({ code: -32602 });
    await expect(runtime.handle('stages.list', { clientType: 'unknown' })).rejects.toMatchObject({
      code: -32602,
    });
    expect(runtime.workers.size).toBe(0);
    expect(runtime.snapshot().devices).toEqual([]);
  });
});
