import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/runtime';
import { buildKnowledgeFiles } from '../src/knowledge-build';
import { validResourceKnowledgePack } from '../src/resource-knowledge';
import { validateKnowledgeRecord, validateKnowledgeSearchResult, validateKnowledgeStatus } from '../../../packages/contracts/src/validators.js';

const roots: string[] = [], runtimes: Runtime[] = [];
const temporary = () => { const root = mkdtempSync(path.join(tmpdir(), 'maaverge-knowledge-')); roots.push(root); return root; };
function generation(root: string, name = '合成材料', infrastructure: any = {}) {
  const directory = path.join(root, 'generation-' + crypto.randomUUID()), resource = path.join(directory, 'resource');
  mkdirSync(resource, { recursive: true });
  for (const [file, data] of Object.entries({
    'item_index.json': { '30012': { name, usage: '用于合成测试' } },
    'battle_data.json': { chars: { char_a: { name: '合成干员', name_en: 'Synthetic Operator', rarity: 4 } } },
    'stages.json': [{ stageId: 'synthetic_01', code: 'SYN-1', apCost: 9, dropInfos: [{ itemId: '30012', dropType: 'NORMAL_DROP' }] }],
    'recruitment.json': { tags: { 治疗: '治疗' }, operators: [{ id: 'char_a', name: '合成干员', rarity: 4, tags: ['治疗'] }] },
    'infrast.json': infrastructure,
  })) writeFileSync(path.join(resource, file), JSON.stringify(data));
  return { resource: { path: directory, version: name }, core: { version: 'synthetic-core-1' } };
}
function fixture() {
  const root = temporary(), runtime = new Runtime(root, { calendar: { fetcher: null } }); runtimes.push(runtime);
  const combo = generation(root); runtime.store.put('active', 'combo', combo);
  return { root, runtime, combo };
}
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test('typed knowledge queries combine attributed public records and product documentation without execution', async () => {
  const { runtime } = fixture();
  const status = await runtime.handle('knowledge.status'); expect(validateKnowledgeStatus(status)).toBe(true);
  expect(status.sources.every((source: any) => source.status === 'available')).toBe(true);
  expect(status.counts.capability).toBeGreaterThan(50);
  const result = await runtime.handle('knowledge.search', { kind: 'item', id: '30012' });
  expect(validateKnowledgeSearchResult(result)).toBe(true); expect(result.total).toBe(1);
  expect(result.records[0]).toMatchObject({ name: '合成材料', source: { file: 'item_index.json', pointer: '/30012' } });
  expect((await runtime.handle('knowledge.search', { query: 'Synthetic Operator', kind: 'operator' })).records[0].id).toBe('char_a');
  const docs = await runtime.handle('knowledge.search', { query: '库存保持', kind: 'document', limit: 10 });
  expect(docs.records.some((row: any) => row.source.file === 'docs/toolbox-schedules.md')).toBe(true);
  expect(runtime.store.all('run')).toHaveLength(0); expect(runtime.store.all('tool_job')).toHaveLength(0);
  expect(runtime.store.all('device')).toHaveLength(0); expect(runtime.store.all('plan')).toHaveLength(0);
  for (const params of [{ path: 'private' }, { query: 'x', limit: 51 }, { query: 'x', offset: -1 }, { clientType: 'unknown' }]) {
    await expect(runtime.handle('knowledge.search', params)).rejects.toMatchObject({ code: -32602 });
  }
});

test('active generation changes and removal rebuild persisted indexes without stale or cross-client fallback', async () => {
  const { root, runtime } = fixture(), first = await runtime.handle('knowledge.status');
  runtime.store.put('active', 'combo', generation(root, '新版材料'));
  const next = await runtime.handle('knowledge.search', { kind: 'item', id: '30012' });
  expect(next.records[0].name).toBe('新版材料'); expect(next.fingerprint).not.toBe(first.fingerprint);
  expect((await runtime.handle('knowledge.search', { kind: 'item', clientType: 'YoStarEN' })).total).toBe(0);
  runtime.store.put('active', 'combo', {});
  expect((await runtime.handle('knowledge.search', { kind: 'item' })).records).toEqual([]);
  expect((await runtime.handle('knowledge.status')).counts.capability).toBeGreaterThan(0);
});

test('long normalized infrastructure IDs remain addressable through the typed RPC', async () => {
  const { root, runtime } = fixture(), skill = 's'.repeat(200), id = 'Mfg:skill:' + skill;
  runtime.store.put('active', 'combo', generation(root, '合成材料', { Mfg: { skills: { [skill]: { name: ['长标识技能'], efficient: { all: 0 } } } } }));
  const result = await runtime.handle('knowledge.search', { kind: 'infrastructure', id });
  expect(validateKnowledgeSearchResult(result)).toBe(true);
  expect(result.total).toBe(1); expect(result.records[0].id).toBe(id);
  await expect(runtime.handle('knowledge.search', { id: 's'.repeat(501) })).rejects.toMatchObject({ code: -32602 });
});

test('corrupt cached envelopes and malformed records are discarded and overwritten even at the same fingerprint', async () => {
  const { runtime } = fixture(); await runtime.handle('knowledge.status');
  const original = runtime.store.get('knowledge_resources', 'Official');
  for (const damaged of [{ parserVersion: 1, clientType: 'Official' }, { ...original, sources: null }, { ...original, records: original.records.map((row: any, index: number) => index ? row : { ...row, aliases: null }) }]) {
    runtime.store.put('knowledge_resources', 'Official', damaged);
    expect((await runtime.handle('knowledge.search', { kind: 'item' })).records[0].name).toBe('合成材料');
    expect(validResourceKnowledgePack(runtime.store.get('knowledge_resources', 'Official'))).toBe(true);
  }
});

test('multibyte records stay within the response budget and retain complete pagination', async () => {
  const root = temporary();
  const skills = Object.fromEntries(Array.from({ length: 70 }, (_, i) => ['skill_' + i, {
    name: Array.from({ length: 15 }, (_, j) => '名'.repeat(200) + i + '_' + j),
    desc: Array.from({ length: 6 }, () => '字'.repeat(1800)), efficient: { all: 0, note: '值'.repeat(250) },
  }]));
  const runtime = new Runtime(root, { calendar: { fetcher: null } }); runtimes.push(runtime);
  runtime.store.put('active', 'combo', generation(root, '合成材料', { Control: { skills } }));
  const page = await runtime.handle('knowledge.search', { kind: 'infrastructure', limit: 50 });
  expect(page.total).toBe(71); expect(page.records.length).toBeGreaterThan(0); expect(page.records.length).toBeLessThan(50);
  expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(3 * 1024 * 1024);
  expect(page.records.every(validateKnowledgeRecord)).toBe(true);
  const next = await runtime.handle('knowledge.search', { kind: 'infrastructure', limit: 50, offset: page.records.length });
  expect(new Set([...page.records, ...next.records].map((row: any) => row.key)).size).toBe(page.total);
});

test('offline builds publish immutable public files, reuse unchanged sources and reject resource output paths', async () => {
  const root = temporary(), combo = generation(root), output = path.join(root, 'dataset');
  const first = await buildKnowledgeFiles(combo, 'Official', output);
  const bytes = readFileSync(first.manifest, 'utf8'), resources = path.join(path.dirname(first.manifest), first.resources);
  expect(validResourceKnowledgePack(JSON.parse(readFileSync(resources, 'utf8')))).toBe(true);
  expect((await buildKnowledgeFiles(combo, 'Official', output)).resourceFingerprint).toBe(first.resourceFingerprint);
  expect(readFileSync(first.manifest, 'utf8')).toBe(bytes);
  expect(bytes).not.toContain(combo.resource.path);
  writeFileSync(path.join(combo.resource.path, 'resource/item_index.json'), JSON.stringify({ '30012': { name: '更新后的材料' } }));
  const next = await buildKnowledgeFiles(combo, 'Official', output);
  expect(next.resourceFingerprint).not.toBe(first.resourceFingerprint);
  expect(readFileSync(resources, 'utf8')).toContain('合成材料');
  await expect(buildKnowledgeFiles(combo, 'Official', path.join(combo.resource.path, 'resource/output'))).rejects.toThrow('不能位于');
  await expect(buildKnowledgeFiles({ resource: { path: temporary() } }, 'Official', output)).rejects.toThrow('没有可解析');
});

test('linked output paths are rejected before creating anything in the source generation', async () => {
  const root = temporary(), combo = generation(root), linked = path.join(root, 'linked');
  symlinkSync(combo.resource.path, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(buildKnowledgeFiles(combo, 'Official', path.join(linked, 'new-dataset'))).rejects.toThrow('不能链接');
  expect(existsSync(path.join(combo.resource.path, 'new-dataset'))).toBe(false);
  const dangling = path.join(root, 'dangling'), missing = path.join(combo.resource.path, 'missing');
  symlinkSync(missing, dangling, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(buildKnowledgeFiles(combo, 'Official', path.join(dangling, 'new-dataset'))).rejects.toThrow('无法解析');
  expect(existsSync(missing)).toBe(false);
});
