import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CopilotLibrary, defaultCopilotOptions, parseCopilotCode } from '../src/copilot';
import { Store } from '../src/storage';
import type { CopilotKind, CopilotWorkspace } from '../../../packages/contracts/src/rpc-types';

const roots: string[] = [], stores: Store[] = [];
function setup(http?: typeof fetch) {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-copilot-library-')); roots.push(root);
  const directory = path.join(root, 'resources', 'resource', 'Arknights-Tile-Pos'); mkdirSync(directory, { recursive: true });
  const entries = [
    { stageId: 'main_01-07', code: '1-7', levelId: 'obt/main/level_main_01-07', name: '暴君', filename: '1-7.json' },
    { stageId: 'mem_char_test_1', code: '', levelId: 'mem_char_test_1', name: '合成悖论', filename: 'paradox.json' },
    { stageId: 'sss_test', code: 'LT-1', levelId: 'sss_test', name: '合成保全第一层', filename: 'sss.json' },
    { stageId: 'main_01-07#f#', code: '1-7', levelId: 'obt/main/level_main_01-07_f', name: '暴君', filename: '1-7-f.json' },
  ];
  writeFileSync(path.join(directory, 'overview.json'), JSON.stringify(Object.fromEntries(entries.map(entry => [entry.stageId, entry]))));
  for (const entry of entries) writeFileSync(path.join(directory, entry.filename), '{}');
  writeFileSync(path.join(root, 'resources', 'resource', 'tasks.json'), JSON.stringify({ Episode1: {}, 'Fixture-Navigation': {} }));
  const store = new Store(root); stores.push(store);
  const state = { core: 'v6.20.0', resource: path.join(root, 'resources') as string | undefined };
  const library = new CopilotLibrary(root, store, { coreVersion: () => state.core, resourceDirectory: () => state.resource, http });
  return { root, store, library, state, directory };
}
const ordinary = (extra: Record<string, unknown> = {}) => JSON.stringify({ stage_name: 'main_01-07', minimum_required: 'v6.20.0', doc: { title: '合成作业', details: '作者说明 https://www.bilibili.com/video/synthetic' }, opers: [{ name: '合成干员', skill: 2, requirements: { elite: 2, level: 80 } }], actions: [{ type: 'SpeedUp' }], ...extra });
const paradox = () => ordinary({ stage_name: 'mem_char_test_1' });
const sss = () => JSON.stringify({ type: 'SSS', stage_name: '保全地图', tool_men: {}, minimum_required: 'v6.20.0', stages: [{ stage_name: 'sss_test', strategies: [], draw_as_possible: true, actions: [] }] });
async function imported(library: CopilotLibrary, content = ordinary()) {
  const preview = await library.preview({ content, name: '合成.json' });
  const result = library.import({ previewId: preview.id }); expect(result.errors).toEqual([]); return result.items[0]!;
}
async function workspace(library: CopilotLibrary, contents = [ordinary()], kind: CopilotKind = 'Copilot'): Promise<CopilotWorkspace> {
  const records = await Promise.all(contents.map(content => imported(library, content)));
  return { kind, options: defaultCopilotOptions(), queue: records.map((record, index) => ({ id: `queue-${index}`, versionId: record.versionId, enabled: true, isRaid: false, navName: '' })) };
}
function response(data: unknown, status = 200) { return Response.json({ status_code: 200, data }, { status }); }
afterEach(() => { for (const store of stores.splice(0)) store.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('immutable local copilot library', () => {
  test('preview never creates plans, library entries or queue; explicit import stores exact immutable bytes', async () => {
    const { library, store, root } = setup(), raw = ' \n' + ordinary() + '\n';
    const preview = await library.preview({ content: raw, name: '原始.json' });
    expect(preview.entries[0]!.record?.compatibility.status).toBe('ready');
    expect(library.list().items).toHaveLength(0); expect(store.all('plan')).toEqual([]); expect(library.workspaceGet({ kind: 'Copilot' }).queue).toEqual([]);
    const record = library.import({ previewId: preview.id }).items[0]!;
    expect(record.versionId).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(library.export({ versionId: record.versionId }).content).toBe(raw);
    expect(readFileSync(path.join(root, 'copilot', 'versions', record.versionId + '.json'), 'utf8')).toBe(raw);
    expect(record.operators[0]).toMatchObject({ name: '合成干员', skill: 2, requirements: { elite: 2, level: 80 } });
  });
  test('UTF-8 BOM and original whitespace survive byte hashing, export and prepare', async () => {
    const { library } = setup(), raw = '\ufeff' + ordinary() + '\r\n';
    const record = await imported(library, raw);
    expect(library.export({ versionId: record.versionId }).content).toBe(raw);
    library.workspaceSave({ workspace: { kind: 'Copilot', options: defaultCopilotOptions(), queue: [{ id: 'bom', versionId: record.versionId, enabled: true, isRaid: false, navName: '' }] } });
    expect(library.prepare('Copilot').entries).toHaveLength(1);
  });
  test('reimport never substitutes selected versions and deleted records retain files and historical detail', async () => {
    const { library, store, root } = setup(), record = await imported(library);
    const draft = { kind: 'Copilot' as const, options: defaultCopilotOptions(), queue: [{ id: 'duplicate-a', versionId: record.versionId, enabled: true, isRaid: false, navName: '' }, { id: 'duplicate-b', versionId: record.versionId, enabled: true, isRaid: true, navName: '1-7' }] };
    library.workspaceSave({ workspace: draft });
    const newRecord = await imported(library, ordinary({ actions: [{ type: 'Output', doc: '另一个不可变版本' }] }));
    expect(newRecord.versionId).not.toBe(record.versionId); expect(library.workspaceGet({ kind: 'Copilot' })).toEqual(draft);
    library.delete({ id: record.id }); expect(library.list().items.map(item => item.id)).toEqual([newRecord.id]);
    expect(existsSync(path.join(root, 'copilot', 'versions', record.versionId + '.json'))).toBe(true);
    expect(library.get({ versionId: record.versionId }).title).toBe(record.title);
    expect(store.all('plan')).toEqual([]);
  });
  test('library pagination returns all records without truncating or overloading responses', async () => {
    const { library } = setup();
    for (let index = 0; index < 23; index++) await imported(library, ordinary({ doc: { title: `作业 ${index}` } }));
    const first = library.list(), second = library.list({ page: 2 }), third = library.list({ page: 3 });
    expect(first).toMatchObject({ page: 1, total: 23, hasNext: true }); expect(first.items).toHaveLength(20);
    expect(second).toMatchObject({ page: 2, total: 23, hasNext: false }); expect(second.items).toHaveLength(3);
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(23);
    expect(third.items).toEqual([]); expect(third.page).toBe(3);
    expect(() => library.list({ page: 0 })).toThrow('参数无效');
  });
  test('oversized metadata page fails clearly rather than silently dropping records', async () => {
    const { library, store } = setup(), record = await imported(library);
    for (let index = 0; index < 20; index++) store.put('copilot', `huge-${index}`, { ...record, id: `huge-${index}`, description: 'x'.repeat(200000) });
    expect(() => library.list()).toThrow('通信限制');
  });
  test('workspace survives a lease-preserving store restart', async () => {
    const { library, store, root, state } = setup(), draft = await workspace(library);
    library.workspaceSave({ workspace: draft }); store.close(); stores.splice(stores.indexOf(store), 1);
    const reopened = new Store(root); stores.push(reopened);
    const replacement = new CopilotLibrary(root, reopened, { coreVersion: () => state.core, resourceDirectory: () => state.resource });
    expect(replacement.workspaceGet({ kind: 'Copilot' })).toEqual(draft); expect(replacement.list().items).toHaveLength(1);
  });
  test('corrupt immutable content cannot execute or be overwritten by reimport', async () => {
    const { library, root } = setup(), draft = await workspace(library), id = draft.queue[0]!.versionId;
    library.workspaceSave({ workspace: draft }); writeFileSync(path.join(root, 'copilot', 'versions', id + '.json'), '{"changed":true}');
    expect(() => library.prepare('Copilot')).toThrow('已损坏');
    const preview = await library.preview({ content: ordinary() }); expect(preview.entries[0]!.error).toContain('不会覆盖');
  });
  test('same version repeated in a queue keeps independent native IDs and native list navigation', async () => {
    const { library } = setup(), draft = await workspace(library);
    draft.queue.push({ ...draft.queue[0]!, id: 'second-entry', isRaid: true, navName: '1-7' }); library.workspaceSave({ workspace: draft });
    const execution = library.prepare('Copilot');
    expect(execution.tasks).toHaveLength(1); expect(execution.tasks[0]!.params.filename).toBeUndefined();
    expect(execution.tasks[0]!.params.copilot_list).toMatchObject([{ id: 1, is_raid: false, nav_name_override: null }, { id: 2, is_raid: true, nav_name_override: '1-7' }]);
    expect(execution.entries.map(entry => [entry.id, entry.nativeId])).toEqual([['queue-0', 1], ['second-entry', 2]]);
  });
  test('navigation overrides require activated navigation tasks with split-layout support', async () => {
    const { library, state, root } = setup(), draft = await workspace(library);
    draft.queue.push({ ...draft.queue[0]!, id: 'second', navName: 'Unknown-Stage' }); library.workspaceSave({ workspace: draft });
    expect(() => library.prepare('Copilot')).toThrow('不支持导航关卡');
    draft.queue[1]!.navName = 'Fixture-Navigation'; library.workspaceSave({ workspace: draft }); expect(library.prepare('Copilot').entries).toHaveLength(2);
    const changed = path.join(root, 'changed-resources'), maps = path.join(changed, 'resource', 'Arknights-Tile-Pos'); mkdirSync(maps, { recursive: true });
    writeFileSync(path.join(maps, 'overview.json'), JSON.stringify({ stage: { stageId: 'main_01-07', code: '1-7', levelId: 'same', name: '暴君', filename: 'map.json' } })); writeFileSync(path.join(maps, 'map.json'), '{}');
    const navigation = path.join(changed, 'resource', 'tasks', 'Stages'); mkdirSync(navigation, { recursive: true }); writeFileSync(path.join(navigation, 'main.json'), JSON.stringify({ 'Split-Stage': {} }));
    state.resource = changed; draft.queue[1]!.navName = 'Split-Stage'; library.workspaceSave({ workspace: draft }); expect(library.prepare('Copilot').entries).toHaveLength(2);
  });
  test('three source formats map to their native task types', async () => {
    const { library } = setup();
    for (const [kind, raw] of [['Copilot', ordinary()], ['ParadoxCopilot', paradox()], ['SSSCopilot', sss()]] as const) {
      const draft = await workspace(library, [raw], kind); library.workspaceSave({ workspace: draft });
      const execution = library.prepare(kind); expect(execution.tasks[0]!.type).toBe(kind); expect(execution.tasks[0]!.params.filename).toMatch(/\.json$/);
      expect(execution.entries[0]!.verdict).toBe('unknown');
    }
  });
  test('paradox uses integer native list IDs and SSS rejects multiple enabled files', async () => {
    const { library } = setup(), p = await workspace(library, [paradox(), paradox()], 'ParadoxCopilot');
    library.workspaceSave({ workspace: p }); expect(library.prepare('ParadoxCopilot').tasks[0]!.params.list).toMatchObject([{ id: 1 }, { id: 2 }]);
    const s = await workspace(library, [sss(), sss()], 'SSSCopilot'); expect(() => library.workspaceSave({ workspace: s })).toThrow('仅支持一份');
  });
  test('SSS stages follow fixed core required draw/action fields and strategy coordinates', async () => {
    const { library } = setup(), document = JSON.parse(sss());
    delete document.stages[0].draw_as_possible;
    expect((await library.preview({ content: JSON.stringify(document) })).entries[0]!.error).toContain('draw_as_possible');
    document.stages[0].draw_as_possible = true; delete document.stages[0].actions;
    expect((await library.preview({ content: JSON.stringify(document) })).entries[0]!.error).toContain('actions');
    document.stages[0].actions = []; document.stages[0].strategies = [{ core: '合成干员', tool_men: { Pioneer: 1 }, location: [0] }];
    expect((await library.preview({ content: JSON.stringify(document) })).entries[0]!.error).toContain('location');
    document.stages[0].strategies[0].location = [0, 0];
    expect((await library.preview({ content: JSON.stringify(document) })).entries[0]!.error).toBeNull();
  });
  test('minimum version, unknown stages and missing map files have concrete compatibility reasons', async () => {
    const { library, state, directory } = setup();
    const future = await imported(library, ordinary({ minimum_required: 'v99.0.0' })); expect(future.compatibility).toMatchObject({ status: 'unsupported' });
    expect(future.compatibility.reasons.join('')).toContain('v99.0.0');
    const unknown = await imported(library, ordinary({ stage_name: 'absent_stage' })); expect(unknown.compatibility.reasons.join('')).toContain('absent_stage');
    state.resource = undefined; expect(library.get({ id: future.id }).compatibility.reasons.join('')).toContain('关卡索引');
    const fresh = new CopilotLibrary(library.root, library.store, { coreVersion: () => 'v6.20.0', resourceDirectory: () => path.dirname(path.dirname(directory)) });
    rmSync(path.join(directory, '1-7.json')); rmSync(path.join(directory, '1-7-f.json'));
    const absent = await imported(fresh); expect(absent.compatibility.status).toBe('unsupported');
  });
  test('invalid and oversized JSON report failures without silent import', async () => {
    const { library } = setup();
    for (const raw of ['not json', '[]', '{}', ordinary({ actions: 'invalid' }), ordinary({ type: 'VideoRecognition' }), ' '.repeat(700001)]) {
      const preview = await library.preview({ content: raw }).catch(error => error);
      if (preview instanceof Error) continue;
      expect(preview.entries[0]!.error).toBeTruthy(); expect(library.import({ previewId: preview.id }).items).toEqual([]);
    }
    expect(library.list().items).toEqual([]);
    await expect(library.preview({ content: ordinary(), code: '123' })).rejects.toThrow('一种来源');
    expect(() => library.export({ versionId: '../../arbitrary' })).toThrow('参数无效');
  });
  test('invalid click/swipe/unit-location and unknown action types are rejected before native effects', async () => {
    const { library } = setup();
    for (const action of [{ type: 'Click' }, { type: 'Click', rect: [1, 2, 0, 4] }, { type: 'Swipe', begin: [1, 2, 3, 4] }, { type: 'SetUnitLocation', name: '干员', location: [1.5, 2] }, { type: 'MoveCamera' }, { type: 'UnknownFutureAction' }, { type: 'Deploy', name: '干员' }]) {
      const preview = await library.preview({ content: ordinary({ actions: [action] }) });
      expect(preview.entries[0]!.error).toBeTruthy();
    }
    const valid = await library.preview({ content: ordinary({ actions: [{ type: 'Click', rect: [0, 0, 30, 20] }, { type: 'Swipe', begin: [1, 2, 3, 4], end: [2, 3, 4, 5] }, { type: 'SetUnitLocation', name: '装置', location: [0, 0] }] }) });
    expect(valid.entries[0]!.error).toBeNull();
  });
  test('zero defaults and source-specific settings reject unsupported combinations', async () => {
    const { library } = setup(), draft = await workspace(library);
    library.workspaceSave({ workspace: draft }); expect(library.prepare('Copilot').tasks[0]!.params).toMatchObject({ loop_times: 1, formation: false, support_unit_usage: 0, use_sanity_potion: false });
    draft.options.supportUnitName = '助战'; expect(() => library.workspaceSave({ workspace: draft })).toThrow('自动编队');
    draft.options.formation = true; draft.options.additionalOperators.push({ name: '追加干员', skill: 3 }); library.workspaceSave({ workspace: draft });
    expect(library.prepare('Copilot').tasks[0]!.params).toMatchObject({ support_unit_usage: 2, support_unit_name: '助战', user_additional: [{ name: '追加干员', skill: 3 }] });
    draft.queue.push({ ...draft.queue[0]!, id: 'second' }); draft.options.supportUnitName = ''; draft.options.loopTimes = 2; expect(() => library.workspaceSave({ workspace: draft })).toThrow('整体循环');
    draft.options.loopTimes = 1; draft.queue[1]!.id = draft.queue[0]!.id; expect(() => library.workspaceSave({ workspace: draft })).toThrow('重复');
  });
  test('explicit legacy copy preserves original task and filename precedence, reports each missing file', async () => {
    const { library, store, root } = setup(), filename = path.join(root, 'legacy.json'); writeFileSync(filename, ordinary());
    const plan = { id: 'legacy', name: '旧表', tasks: [{ type: 'Copilot', params: { filename, copilot_list: [{ filename: 'missing.json' }] }, enabled: true }, { type: 'ParadoxCopilot', params: { list: [filename, 'missing.json'] }, enabled: true }] };
    store.put('plan', plan.id, plan);
    const single = await library.preview({ planId: plan.id, taskIndex: 0 }); expect(single.entries).toHaveLength(1); expect(single.entries[0]!.error).toBeNull();
    const list = await library.preview({ planId: plan.id, taskIndex: 1 }); expect(list.entries).toHaveLength(2); expect(list.entries[0]!.record?.kind).toBe('ParadoxCopilot'); expect(list.entries[1]!.error).toBeTruthy();
    expect(store.get('plan', plan.id)).toEqual(plan); expect(store.all('plan')).toHaveLength(1);
  });
});

describe('fixed-origin community adapter', () => {
  test.each(['123', 'maa://123', 'prts://123', 'https://prts.plus/copilot/123'])('%s parses to a copilot identity', code => { expect(parseCopilotCode(code)).toEqual({ target: 'copilot', id: '123' }); });
  test.each(['s123', 'prts://s123', 'https://prts.plus/set/123'])('%s parses to a set identity', code => { expect(parseCopilotCode(code)).toEqual({ target: 'set', id: '123' }); });
  test.each(['https://evil.test/copilot/123', 'https://prts.plus.evil.test/copilot/123', 'https://user@prts.plus/copilot/123', 'https://prts.plus:123/copilot/123', 'http://prts.plus/copilot/123', 'https://prts.plus/copilot/123?target=x', 'maa://../../x'])('rejects arbitrary URL %s', code => { expect(() => parseCopilotCode(code)).toThrow(); });
  test('search maps display stage to internal ID and uses requested set page, never imports a summary', async () => {
    const requests: [string, RequestInit | undefined][] = [];
    const { library } = setup((async (url: any, init?: RequestInit) => {
      requests.push([String(url), init]);
      return response({ page: 99, total: 100, has_next: true, data: [{ id: 42, name: '作业集', creator: '作者', content: JSON.stringify({ stage_name: 'main_01-07', doc: { title: '仅摘要' } }) }] });
    }) as typeof fetch);
    const search = await library.search({ target: 'copilot', stage: '1-7', page: 2 }); expect(search.page).toBe(2); expect(new URL(requests[0]![0]).searchParams.get('levelKeyword')).toBe('main_01-07');
    expect(library.list().items).toEqual([]);
    const set = await library.search({ target: 'set', keyword: '合成', page: 3 }); expect(set.page).toBe(3); expect(JSON.parse(String(requests[1]![1]!.body)).page).toBe(3);
  });
  test('set preview keeps upstream order, duplicate members and partial failures', async () => {
    const requests: string[] = [];
    const { library, store } = setup((async (url: any) => {
      requests.push(String(url));
      if (String(url).includes('/set/get')) return response({ name: '有序作业集', copilot_ids: [3, 2, 3, 1] });
      if (String(url).endsWith('/2')) return response({ available: false, content: '' });
      if (String(url).endsWith('/1')) return Response.json({ status_code: 404, message: '已删除' });
      return response({ id: 3, uploader: '作者', available: true, content: ordinary({ doc: { title: '作业三' } }) });
    }) as typeof fetch);
    const preview = await library.preview({ code: 'prts://s9' });
    expect(preview.entries.map(entry => entry.record?.title ?? null)).toEqual(['作业三', null, '作业三', null]);
    expect(preview.entries[0]!.id).not.toBe(preview.entries[2]!.id);
    const result = library.import({ previewId: preview.id }); expect(result.items).toHaveLength(2); expect(result.errors).toHaveLength(2); expect(result.items[0]!.author).toBe('作者');
    expect(store.get('copilot_set', '9').members).toHaveLength(4);
    expect(requests.every(url => url.startsWith('https://prts.maa.plus/'))).toBe(true);
  });
  test('HTTP, business status and malformed/large content never become importable entries', async () => {
    for (const reply of [new Response('bad', { status: 500 }), new Response('not JSON'), Response.json({ status_code: 403, message: 'denied' }), response({ content: 'invalid JSON' }), response({ content: 'x'.repeat(700001) })]) {
      const { library } = setup((async () => reply) as unknown as typeof fetch), preview = await library.preview({ code: '1' });
      expect(preview.entries[0]!.error).toBeTruthy(); expect(library.import({ previewId: preview.id }).items).toHaveLength(0);
    }
  });
  test('request timeout aborts HTTP and reports a retryable preview failure', async () => {
    const timer = globalThis.setTimeout;
    const { library } = setup((async (_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })) as typeof fetch);
    try {
      globalThis.setTimeout = ((callback: (...arguments_: any[]) => void, milliseconds?: number, ...arguments_: any[]) => timer(callback, milliseconds === 12000 ? 1 : milliseconds, ...arguments_)) as typeof setTimeout;
      const preview = await library.preview({ code: '123' });
      expect(preview.entries[0]!.error).toContain('超时');
      expect(library.list().items).toEqual([]);
    } finally { globalThis.setTimeout = timer; }
  });
  test('offline community failure does not affect local immutable execution', async () => {
    const { library } = setup((async () => { throw new Error('offline'); }) as unknown as typeof fetch), draft = await workspace(library);
    library.workspaceSave({ workspace: draft }); expect((await library.preview({ code: '3' })).entries[0]!.error).toContain('offline');
    expect(library.prepare('Copilot').tasks).toHaveLength(1);
  });
});
