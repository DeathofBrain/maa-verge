import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CopilotLibrary } from '../src/copilot';
import { Runtime } from '../src/runtime';
import { Store } from '../src/storage';
import { validateCopilotStagesResult } from '../../../packages/contracts/src/validators.js';

const roots: string[] = [];
const stores: Store[] = [];
const runtimes: Runtime[] = [];
type Entry = { stageId: string; code: string; name: string; filename: string; levelId?: string };
const entry = (stageId: string, code: string, name = '合成关卡'): Entry => ({
  stageId,
  code,
  name,
  filename: `${stageId.replaceAll('#', '-')}.json`,
  levelId: `levels/${stageId}`,
});
function generation(root: string, name: string, entries: Entry[]) {
  const directory = path.join(root, name, 'resource', 'Arknights-Tile-Pos');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, 'overview.json'),
    JSON.stringify(Object.fromEntries(entries.map((item, index) => [String(index), item]))),
  );
  for (const item of entries)
    if (item.filename !== 'missing.json') writeFileSync(path.join(directory, item.filename), '{}');
  return path.join(root, name);
}
function fixture(entries: Entry[]) {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-copilot-stages-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  const state = { resource: generation(root, 'first', entries) as string | undefined };
  const requests: string[] = [];
  const library = new CopilotLibrary(root, store, {
    coreVersion: () => 'v6.20.0',
    resourceDirectory: () => state.resource,
    http: (async (url: string | URL | Request) => {
      requests.push(String(url));
      return Response.json({ status_code: 200, data: { data: [], has_next: false, total: 0 } });
    }) as typeof fetch,
  });
  return { root, state, requests, library };
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('community stage catalog uses installed map codes, deduplicates raid maps and sorts naturally', () => {
  const { library } = fixture([
    entry('act_test_ex10', 'TEST-EX-10'),
    entry('act_test_ex2', 'TEST-EX-2'),
    entry('act_test_ex2#f#', 'TEST-EX-2'),
    entry('main_01-07', '1-7', '暴君'),
    { ...entry('missing', 'MISSING-1'), filename: 'missing.json' },
    entry('no_code', ''),
    entry('ambiguous_one', 'AMB-1'),
    entry('ambiguous_two', 'amb-1'),
  ]);
  const result = library.stages();
  expect(validateCopilotStagesResult(result)).toBe(true);
  expect(result.stages).toEqual([
    { value: '1-7', label: '1-7 · 暴君' },
    { value: 'TEST-EX-2', label: 'TEST-EX-2 · 合成关卡' },
    { value: 'TEST-EX-10', label: 'TEST-EX-10 · 合成关卡' },
  ]);
  expect(() => library.stages({ extra: true } as never)).toThrow();
});

test('community search ignores code and internal alias casing while standard codes take precedence', async () => {
  const { library, requests } = fixture([
    entry('main_r8-11', 'R8-11', '乌萨斯'),
    entry('act_test_ex2', 'TEST-EX-2', 'r8-11'),
    entry('act_test_ex2#f#', 'TEST-EX-2', '合成突袭'),
  ]);
  for (const stage of ['r8-11', ' R8-11 ', 'MAIN_R8-11', 'LEVELS/MAIN_R8-11', '乌萨斯']) {
    await library.search({ target: 'copilot', stage });
    expect(new URL(requests.at(-1)!).searchParams.get('levelKeyword')).toBe('main_r8-11');
  }
  await library.search({ target: 'copilot', stage: 'test-ex-2' });
  expect(new URL(requests.at(-1)!).searchParams.get('levelKeyword')).toBe('act_test_ex2');
});

test('community search rejects partial codes and ambiguous aliases without a network request', async () => {
  const { library, requests } = fixture([
    entry('first', 'TEST-1'),
    entry('second', 'TEST-2'),
    entry('ambiguous_one', 'AMB-1'),
    entry('ambiguous_two', 'amb-1'),
  ]);
  for (const stage of ['test-', 'amb-1', '合成关卡', 'unknown'])
    await expect(library.search({ target: 'copilot', stage })).rejects.toThrow(
      '无法将关卡编号映射',
    );
  expect(requests).toEqual([]);
});

test('community catalog and case-insensitive search follow the active immutable resource generation', async () => {
  const { root, state, library, requests } = fixture([entry('old_stage', 'OLD-1')]);
  expect(library.stages().stages[0]?.value).toBe('OLD-1');
  state.resource = generation(root, 'second', [entry('new_stage', 'NEW-1')]);
  expect(library.stages().stages.map((stage) => stage.value)).toEqual(['NEW-1']);
  await expect(library.search({ target: 'copilot', stage: 'old-1' })).rejects.toThrow();
  await library.search({ target: 'copilot', stage: 'new-1' });
  expect(new URL(requests.at(-1)!).searchParams.get('levelKeyword')).toBe('new_stage');
  state.resource = undefined;
  expect(library.stages()).toEqual({ stages: [] });
});

test('runtime exposes the read-only catalog with empty params validation and no device connection', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-copilot-stages-rpc-'));
  roots.push(root);
  const runtime = new Runtime(root, {
    calendar: { fetcher: null },
    workerFactory: async () => {
      throw new Error('目录读取不得连接设备');
    },
  });
  runtimes.push(runtime);
  runtime.store.put('active', 'combo', {
    resource: {
      path: generation(root, 'maps', [entry('test_stage', 'TEST-1')]),
      version: 'synthetic',
    },
  });
  expect(await runtime.handle('copilot.stages', {})).toEqual({
    stages: [{ value: 'TEST-1', label: 'TEST-1 · 合成关卡' }],
  });
  await expect(runtime.handle('copilot.stages', { stage: 'TEST' })).rejects.toThrow();
  expect(runtime.devices()).toEqual([]);
});
