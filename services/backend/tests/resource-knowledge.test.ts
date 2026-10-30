import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildResourceKnowledge,
  resourceKnowledgeParserVersion,
} from '../src/modules/knowledge/resource-knowledge';
import type { ResourceKnowledgePack } from '../src/modules/knowledge/knowledge-types';

const roots: string[] = [];
const temporary = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-resource-knowledge-'));
  roots.push(root);
  return root;
};
const operator = {
  name: '合成干员',
  name_en: 'Synthetic Operator',
  name_jp: '合成オペレーター',
  name_kr: '합성 오퍼레이터',
  name_tw: '合成幹員',
  rarity: 5,
  position: 'RANGED',
  profession: 'MEDIC',
  subProfessionId: 'healer',
  rangeId: ['3-1'],
};
const files: Record<string, unknown> = {
  'battle_data.json': { chars: { char_synthetic: operator }, ranges: { '3-1': [[0, 0]] } },
  'item_index.json': {
    '30012': {
      name: '合成材料',
      description: '仅用于测试的描述',
      usage: '仅用于测试的用途',
      classifyType: 'MATERIAL',
      icon: '30012.png',
      sortId: 1,
    },
  },
  'stages.json': [
    {
      stageId: 'synthetic_01',
      code: 'SYN-1',
      apCost: 9,
      dropInfos: [{ itemId: '30012', dropType: 'NORMAL_DROP' }],
    },
  ],
  'recruitment.json': {
    tags: { 治疗: '治疗', 资深干员: '资深干员' },
    operators: [{ id: 'char_synthetic', name: '合成干员', rarity: 5, tags: ['治疗', '资深干员'] }],
  },
  'infrast.json': {
    roomType: ['Mfg'],
    Mfg: {
      maxNumOfOpers: 3,
      products: ['PureGold'],
      skills: {
        synthetic_skill: {
          name: ['合成基建技能'],
          desc: ['与指定干员共同进驻时，制造站效率提高'],
          efficient: { all: 0 },
          additional: { 模拟属性: '[SyntheticCondition]' },
          operatorIds: ['char_synthetic'],
        },
      },
      skillsGroup: [{ desc: '不会直接解释成数值规则' }],
    },
  },
};
function pack(overrides: Record<string, unknown> = {}, base = files) {
  const root = temporary();
  mkdirSync(path.join(root, 'resource'));
  for (const [file, value] of Object.entries({ ...base, ...overrides })) {
    if (value === undefined) continue;
    const filename = path.join(root, 'resource', file);
    mkdirSync(path.dirname(filename), { recursive: true });
    writeFileSync(filename, Buffer.isBuffer(value) ? value : JSON.stringify(value));
  }
  return {
    resource: { path: root, version: 'synthetic-resource-1' },
    core: { version: 'v6.20.0' },
  };
}
const record = (pack: ResourceKnowledgePack, key: string) =>
  pack.records.find((record) => record.key === key)!;
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('resource knowledge extraction', () => {
  test('compound infrastructure skill IDs and full bounded name lists remain addressable', async () => {
    const names = Array.from({ length: 15 }, (_, i) => '技能别名' + i);
    const result = await buildResourceKnowledge(
      pack({
        'infrast.json': {
          Control: {
            skills: { 'skill_one&two': { name: names, desc: ['条件说明'], efficient: { all: 0 } } },
          },
        },
      }),
      'Official',
    );
    const skill = record(result, 'infrastructure:Control:skill:skill_one&two');
    expect(skill.source.pointer).toBe('/Control/skills/skill_one&two');
    expect(skill.aliases).toContain(names[14]);
    expect(skill.data.names).toEqual(names);
  });

  test('keeps stable identities, typed relations and verifiable JSON pointers for the five fixed sources', async () => {
    const combo = pack(),
      result = await buildResourceKnowledge(combo, 'Official');
    expect(result.parserVersion).toBe(resourceKnowledgeParserVersion);
    expect(result.coreVersion).toBe('v6.20.0');
    expect(result.resourceVersion).toBe('synthetic-resource-1');
    expect(result.sources).toHaveLength(5);
    expect(result.sources.every((source) => source.status === 'available')).toBe(true);
    expect(new Set(result.records.map((record) => record.kind))).toEqual(
      new Set(['operator', 'item', 'stage', 'recruitment', 'infrastructure']),
    );
    const item = record(result, 'item:30012');
    expect(item).toMatchObject({
      id: '30012',
      name: '合成材料',
      data: { description: '仅用于测试的描述', usage: '仅用于测试的用途' },
      source: { file: 'item_index.json', pointer: '/30012' },
    });
    expect(item.source.sha256).toBe(
      createHash('sha256')
        .update(readFileSync(path.join(combo.resource.path, 'resource/item_index.json')))
        .digest('hex'),
    );
    expect(record(result, 'operator:char_synthetic')).toMatchObject({
      aliases: expect.arrayContaining(['Synthetic Operator', '合成幹員']),
      data: { rarity: 5, rangeIds: ['3-1'] },
      source: { pointer: '/chars/char_synthetic' },
    });
    expect(record(result, 'stage:synthetic_01')).toMatchObject({
      data: { apCost: 9, dropInfos: [{ itemId: '30012', dropType: 'NORMAL_DROP' }] },
      relations: [{ predicate: 'mayDrop', targetKind: 'item', targetId: '30012' }],
      source: { pointer: '/0' },
    });
    expect(record(result, 'recruitment:char_synthetic')).toMatchObject({
      data: { tags: ['治疗', '资深干员'] },
      relations: expect.arrayContaining([
        { predicate: 'recruits', targetKind: 'operator', targetId: 'char_synthetic' },
      ]),
    });
    expect(record(result, 'infrastructure:Mfg:skill:synthetic_skill')).toMatchObject({
      data: {
        conditionsEvaluated: false,
        efficient: { all: 0 },
        additional: { 模拟属性: '[SyntheticCondition]' },
      },
      source: { pointer: '/Mfg/skills/synthetic_skill' },
      relations: expect.arrayContaining([
        { predicate: 'providedBy', targetKind: 'operator', targetId: 'char_synthetic' },
      ]),
    });
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  test('same-name forms remain distinct and traps do not become operators', async () => {
    const result = await buildResourceKnowledge(
      pack({
        'battle_data.json': {
          chars: {
            char_first: operator,
            char_second: operator,
            trap_synthetic: operator,
            'char_../invalid': operator,
          },
        },
      }),
      'Official',
    );
    const operators = result.records.filter((record) => record.kind === 'operator');
    expect(operators.map((record) => record.id)).toEqual(['char_first', 'char_second']);
    expect(operators.map((record) => record.name)).toEqual(['合成干员', '合成干员']);
    expect(new Set(result.records.map((record) => record.key)).size).toBe(result.records.length);
  });

  test('global files never inherit CN-only items, stages, recruitment or infrastructure', async () => {
    const combo = pack({
      'battle_data.json': {
        chars: {
          char_synthetic: operator,
          char_future: { name: '国服新干员', rarity: 6 },
          char_unavailable: { ...operator, name_en: 'Unreleased', name_en_unavailable: true },
        },
      },
      'global/YoStarEN/resource/item_index.json': { '30012': { name: 'Synthetic Material' } },
      'global/YoStarEN/resource/stages.json': [
        { stageId: 'en_01', code: 'EN-1', apCost: 6, dropInfos: [] },
      ],
      'global/YoStarEN/resource/recruitment.json': {
        tags: { Healing: 'Healing' },
        operators: [
          { id: 'char_synthetic', name: 'Synthetic Operator', rarity: 5, tags: ['Healing'] },
        ],
      },
    });
    const result = await buildResourceKnowledge(combo, 'YoStarEN');
    expect(record(result, 'item:30012').name).toBe('Synthetic Material');
    expect(record(result, 'operator:char_synthetic').name).toBe('Synthetic Operator');
    expect(
      result.records.filter((record) => record.kind === 'operator').map((record) => record.id),
    ).toEqual(['char_synthetic']);
    expect(
      result.records.filter((record) => record.kind === 'stage').map((record) => record.id),
    ).toEqual(['en_01']);
    expect(record(result, 'recruitment:char_synthetic').data.tags).toEqual(['Healing']);
    expect(result.records.filter((record) => record.kind === 'infrastructure')).toEqual([]);
    expect(result.sources.find((source) => source.file.endsWith('infrast.json'))).toMatchObject({
      file: 'global/YoStarEN/resource/infrast.json',
      status: 'missing',
      records: 0,
    });
    const missingGlobal = await buildResourceKnowledge(combo, 'YoStarKR');
    expect(missingGlobal.records.every((record) => record.kind === 'operator')).toBe(true);
    expect(missingGlobal.sources.filter((source) => source.status === 'missing')).toHaveLength(4);
  });

  test('uses all selected-client operator names and the shared CN source for Bilibili', async () => {
    const combo = pack();
    for (const [clientType, name] of [
      ['Official', operator.name],
      ['Bilibili', operator.name],
      ['YoStarEN', operator.name_en],
      ['YoStarJP', operator.name_jp],
      ['YoStarKR', operator.name_kr],
      ['txwy', operator.name_tw],
    ] as const) {
      const result = await buildResourceKnowledge(combo, clientType);
      expect(record(result, 'operator:char_synthetic').name).toBe(name);
      expect(result.clientType).toBe(clientType);
    }
    expect(
      (await buildResourceKnowledge(combo, 'Bilibili')).sources.every(
        (source) => !source.file.includes('global/'),
      ),
    ).toBe(true);
  });

  test('does not manufacture or copy drop probabilities, costs or evaluated conditional skills', async () => {
    const result = await buildResourceKnowledge(
      pack({
        'battle_data.json': {
          chars: { char_synthetic: { ...operator, skillCost: { '30012': 99 }, upgradeCost: 1200 } },
        },
        'stages.json': [
          {
            stageId: 'synthetic_01',
            code: 'SYN-1',
            apCost: 9,
            dropInfos: [
              { itemId: '30012', dropType: 'NORMAL_DROP', probability: 0.9, expectedYield: 12 },
            ],
          },
        ],
      }),
      'Official',
    );
    const data = JSON.stringify(result.records.map((record) => record.data));
    for (const field of ['probability', 'expectedYield', 'skillCost', 'upgradeCost', 'skillsGroup'])
      expect(data).not.toContain(field);
    expect(result.diagnostics.some((message) => message.includes('概率、样本数'))).toBe(true);
    expect(result.diagnostics.some((message) => message.includes('模组费用'))).toBe(true);
    expect(result.diagnostics.some((message) => message.includes('不能直接相加'))).toBe(true);
  });

  test('absent generations and absent files produce explicit gaps without stale or fabricated records', async () => {
    const absent = await buildResourceKnowledge({}, 'Official');
    expect(absent.records).toEqual([]);
    expect(
      absent.sources.every((source) => source.status === 'missing' && source.sha256 === null),
    ).toBe(true);
    expect(absent.diagnostics).toHaveLength(5);
    const empty = await buildResourceKnowledge(pack({}, {}), 'Official');
    expect(empty.records).toEqual([]);
    expect(empty.sources.every((source) => source.status === 'missing')).toBe(true);
  });

  test('reuses unchanged source records by hash and parser version while changed sources are rebuilt', async () => {
    const first = await buildResourceKnowledge(pack(), 'Official');
    const same = await buildResourceKnowledge(pack(), 'Official', first);
    expect(same.fingerprint).toBe(first.fingerprint);
    expect(record(same, 'item:30012')).toBe(record(first, 'item:30012'));
    expect(same.diagnostics).toEqual(first.diagnostics);
    const changedCombo = pack({ 'item_index.json': { '30012': { name: '变更后的合成材料' } } });
    const changed = await buildResourceKnowledge(changedCombo, 'Official', first);
    expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(record(changed, 'item:30012')).not.toBe(record(first, 'item:30012'));
    expect(record(changed, 'item:30012').name).toBe('变更后的合成材料');
    expect(record(changed, 'operator:char_synthetic')).toBe(
      record(first, 'operator:char_synthetic'),
    );
    changedCombo.core.version = 'v6.21.0';
    const nextCore = await buildResourceKnowledge(changedCombo, 'Official', changed);
    expect(nextCore.fingerprint).not.toBe(changed.fingerprint);
    expect(record(nextCore, 'item:30012')).toBe(record(changed, 'item:30012'));
    changedCombo.resource.version = 'synthetic-resource-2';
    expect((await buildResourceKnowledge(changedCombo, 'Official', nextCore)).fingerprint).not.toBe(
      nextCore.fingerprint,
    );
  });

  test('parser/client changes and missing sources cannot reuse incompatible records', async () => {
    const combo = pack(),
      first = await buildResourceKnowledge(combo, 'Official');
    const otherParser = await buildResourceKnowledge(combo, 'Official', {
      ...first,
      parserVersion: first.parserVersion + 1,
    });
    expect(record(otherParser, 'item:30012')).not.toBe(record(first, 'item:30012'));
    const global = await buildResourceKnowledge(combo, 'YoStarEN', first);
    expect(record(global, 'operator:char_synthetic').name).toBe('Synthetic Operator');
    expect(record(global, 'operator:char_synthetic')).not.toBe(
      record(first, 'operator:char_synthetic'),
    );
    const missing = await buildResourceKnowledge(
      pack({ 'item_index.json': undefined }),
      'Official',
      first,
    );
    expect(record(missing, 'item:30012')).toBeUndefined();
    expect(missing.fingerprint).not.toBe(first.fingerprint);
  });

  test('malformed, oversized and invalid structures fail per source without blocking valid sources', async () => {
    for (const invalid of [
      Buffer.from('{invalid'),
      Buffer.alloc(4 * 1024 * 1024 + 1),
      [],
      null,
      Object.fromEntries(Array.from({ length: 10_001 }, (_, index) => [`item${index}`, {}])),
    ]) {
      const result = await buildResourceKnowledge(pack({ 'item_index.json': invalid }), 'Official');
      expect(result.sources.find((source) => source.file === 'item_index.json')).toMatchObject({
        status: 'invalid',
        records: 0,
      });
      expect(result.records.some((record) => record.kind === 'item')).toBe(false);
      expect(record(result, 'operator:char_synthetic').name).toBe('合成干员');
    }
  });

  test('bounds hostile field values, drops duplicate IDs and escapes source pointers', async () => {
    const result = await buildResourceKnowledge(
      pack({
        'item_index.json': {
          good: { name: '合成有效物品', description: 'x'.repeat(2001) },
          bad: { name: 'x'.repeat(301) },
          control: { name: '无效\u0000名称' },
          '../unsafe': { name: '非法标识' },
        },
        'stages.json': [
          { stageId: 'same', code: 'ONE', dropInfos: [] },
          { stageId: 'same', code: 'TWO', dropInfos: [] },
        ],
        'recruitment.json': { tags: { '治疗/~': '合成标签' }, operators: [] },
      }),
      'Official',
    );
    expect(
      result.records.filter((record) => record.kind === 'item').map((record) => record.id),
    ).toEqual(['good']);
    expect(record(result, 'item:good').data.description).toBeUndefined();
    expect(
      result.records.filter((record) => record.kind === 'stage').map((record) => record.name),
    ).toEqual(['ONE']);
    expect(record(result, 'recruitment:tag:治疗/~').source.pointer).toBe('/tags/治疗~1~0');
    expect(
      result.records.every(
        (record) =>
          record.text.length <= 4096 &&
          record.aliases.length <= 32 &&
          record.relations.length <= 128,
      ),
    ).toBe(true);
  });

  test('rejects linked generation roots and linked global directories without reading outside data', async () => {
    const outside = pack(),
      linkedRoot = temporary();
    symlinkSync(
      path.join(outside.resource.path, 'resource'),
      path.join(linkedRoot, 'resource'),
      'junction',
    );
    const invalidRoot = await buildResourceKnowledge(
      { resource: { path: linkedRoot } },
      'Official',
    );
    expect(invalidRoot.records).toEqual([]);
    expect(invalidRoot.sources.every((source) => source.status === 'invalid')).toBe(true);
    const target = pack({
      'global/YoStarEN/resource/item_index.json': { leaked: { name: '不可读取的外部数据' } },
    });
    const linkedGlobal = pack();
    symlinkSync(
      path.join(target.resource.path, 'resource/global'),
      path.join(linkedGlobal.resource.path, 'resource/global'),
      'junction',
    );
    const invalidGlobal = await buildResourceKnowledge(linkedGlobal, 'YoStarEN');
    expect(invalidGlobal.records.every((record) => record.kind === 'operator')).toBe(true);
    expect(
      invalidGlobal.sources.find((source) => source.file.endsWith('item_index.json'))?.status,
    ).toBe('invalid');
  });
});
