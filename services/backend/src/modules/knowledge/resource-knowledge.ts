import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import {
  ResourceReader,
  type ClientType,
  type Combo,
} from '@backend/modules/resources/item-resources';
import type {
  KnowledgeKind,
  KnowledgeRecord,
  KnowledgeSource,
  KnowledgeValue,
  ResourceKnowledgePack,
} from './knowledge-types';
import { validateKnowledgeRecord, validateKnowledgeSource } from '@contracts/validators.js';

export const resourceKnowledgeParserVersion = 1;
const maximumBytes = 4 * 1024 * 1024;
const maximumRecords = 10_000;
const nameKeys: Record<ClientType, string> = {
  Official: 'name',
  Bilibili: 'name',
  YoStarEN: 'name_en',
  YoStarJP: 'name_jp',
  YoStarKR: 'name_kr',
  txwy: 'name_tw',
};
const rooms = [
  'Control',
  'Dorm',
  'Mfg',
  'Office',
  'Power',
  'Processing',
  'Reception',
  'Recycle',
  'Trade',
  'Training',
];
type ObjectValue = Record<string, unknown>;
type Parse = (value: unknown, context: Context) => void;
const object = (value: unknown): value is ObjectValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, maximum = 300, multiline = false): string | undefined =>
  typeof value === 'string' &&
  value.trim() &&
  value.length <= maximum &&
  !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(
    value,
  )
    ? value.trim()
    : undefined;
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_#@.:-]{0,199}$/.test(value);
const operatorId = (value: unknown): value is string =>
  typeof value === 'string' && /^char_[A-Za-z0-9_]{1,195}$/.test(value);
const pointer = (value: string | number) => String(value).replace(/~/g, '~0').replace(/\//g, '~1');
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000;
const integer = (value: unknown, minimum: number, maximum: number): value is number =>
  number(value) && Number.isInteger(value) && value >= minimum && value <= maximum;
const strings = (value: unknown, maximum = 32, length = 300): string[] =>
  Array.isArray(value)
    ? [...new Set(value.slice(0, maximum).flatMap((value) => text(value, length) ?? []))]
    : [];
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

/** Persisted derived data is disposable: malformed or incompatible caches are rebuilt from source. */
export function validResourceKnowledgePack(value: unknown): value is ResourceKnowledgePack {
  if (
    !object(value) ||
    value.parserVersion !== resourceKnowledgeParserVersion ||
    typeof value.clientType !== 'string' ||
    !Object.hasOwn(nameKeys, value.clientType) ||
    ![value.coreVersion, value.resourceVersion].every(
      (part) => part === null || !!text(part, 200),
    ) ||
    !Array.isArray(value.sources) ||
    value.sources.length !== 5 ||
    !value.sources.every(validateKnowledgeSource) ||
    !Array.isArray(value.records) ||
    value.records.length > maximumRecords * 5 ||
    !value.records.every(validateKnowledgeRecord) ||
    !Array.isArray(value.diagnostics) ||
    value.diagnostics.length > 100 ||
    !value.diagnostics.every((part) => !!text(part, 1000, true))
  )
    return false;
  const sources = value.sources as KnowledgeSource[],
    records = value.records as KnowledgeRecord[];
  if (
    new Set(sources.map((source) => source.file)).size !== sources.length ||
    new Set(records.map((record) => record.key)).size !== records.length
  )
    return false;
  const counts = new Map<string, number>();
  for (const record of records) {
    if (
      !sources.some(
        (source) =>
          source.file === record.source.file &&
          source.status === 'available' &&
          source.sha256 === record.source.sha256,
      )
    )
      return false;
    counts.set(record.source.file, (counts.get(record.source.file) ?? 0) + 1);
  }
  if (sources.some((source) => source.records !== (counts.get(source.file) ?? 0))) return false;
  return (
    value.fingerprint ===
    sha256(
      JSON.stringify({
        parserVersion: value.parserVersion,
        clientType: value.clientType,
        coreVersion: value.coreVersion,
        resourceVersion: value.resourceVersion,
        sources,
      }),
    )
  );
}

class Context {
  readonly records: KnowledgeRecord[] = [];
  private keys = new Set<string>();
  private issues = new Set<string>();
  constructor(
    readonly file: string,
    readonly hash: string,
    readonly clientType: ClientType,
    private diagnostics: string[],
  ) {}
  issue(message = '部分条目无效、重复或超出字段限制，已跳过'): void {
    this.issues.add(message);
  }
  add(
    kind: KnowledgeKind,
    recordId: string,
    name: string,
    sourcePointer: string,
    data: KnowledgeRecord['data'],
    aliases: string[] = [],
    relations: KnowledgeRecord['relations'] = [],
    description: string[] = [],
  ): void {
    const key = `${kind}:${recordId}`;
    if (this.keys.has(key) || this.records.length >= maximumRecords) {
      this.issue();
      return;
    }
    const record: KnowledgeRecord = {
      key,
      kind,
      id: recordId,
      name,
      aliases: [...new Set([recordId, ...aliases].filter((value) => value !== name))].slice(0, 32),
      text: [name, ...description].join('\n').slice(0, 4096),
      data,
      relations: relations.slice(0, 128),
      source: { file: this.file, pointer: sourcePointer, sha256: this.hash },
    };
    if (Buffer.byteLength(JSON.stringify(record)) > 64 * 1024) {
      this.issue();
      return;
    }
    this.keys.add(key);
    this.records.push(record);
  }
  finish(): void {
    for (const message of this.issues) this.diagnostics.push(`${this.file}：${message}`);
  }
}

function entries(value: unknown): [string, unknown][] {
  if (!object(value) || Object.keys(value).length > maximumRecords)
    throw new Error('对象格式无效或条目过多');
  return Object.entries(value);
}

const parseItems: Parse = (value, context) => {
  for (const [itemId, entry] of entries(value)) {
    if (!id(itemId) || !object(entry)) {
      context.issue();
      continue;
    }
    const name = text(entry.name),
      description = text(entry.description, 2000, true),
      usage = text(entry.usage, 2000, true);
    if (!name) {
      context.issue();
      continue;
    }
    const data: KnowledgeRecord['data'] = { itemId };
    if (description) data.description = description;
    if (usage) data.usage = usage;
    for (const field of ['classifyType', 'icon']) {
      const fieldValue = text(entry[field]);
      if (fieldValue) data[field] = fieldValue;
    }
    if (number(entry.sortId)) data.sortId = entry.sortId;
    context.add(
      'item',
      itemId,
      name,
      `/${pointer(itemId)}`,
      data,
      [],
      [],
      [description, usage].filter((part): part is string => !!part),
    );
  }
};

const parseOperators: Parse = (value, context) => {
  if (!object(value)) throw new Error('干员文件格式无效');
  for (const [charId, entry] of entries(value.chars)) {
    // The shared battle index also contains traps and summons, not account operators.
    if (!operatorId(charId)) continue;
    if (!object(entry)) {
      context.issue();
      continue;
    }
    const field = nameKeys[context.clientType],
      name = text(entry[field]);
    if (!name || entry[`${field}_unavailable`] === true) continue;
    const data: KnowledgeRecord['data'] = { operatorId: charId };
    for (const field of ['position', 'profession', 'subProfessionId']) {
      const fieldValue = text(entry[field], 100);
      if (fieldValue) data[field] = fieldValue;
    }
    if (integer(entry.rarity, 1, 6)) data.rarity = entry.rarity;
    data.rangeIds = strings(entry.rangeId, 8, 100);
    const aliases = [
      ...new Set(
        Object.values(nameKeys).flatMap((field) =>
          entry[`${field}_unavailable`] === true ? [] : (text(entry[field]) ?? []),
        ),
      ),
    ];
    context.add(
      'operator',
      charId,
      name,
      `/chars/${pointer(charId)}`,
      data,
      aliases,
      [],
      [text(entry.profession, 100), text(entry.subProfessionId, 100)].filter(
        (part): part is string => !!part,
      ),
    );
  }
  context.issue('仅包含干员基础索引；未提供完整技能数值及升级、精英化、专精、模组费用');
};

const parseStages: Parse = (value, context) => {
  if (!Array.isArray(value) || value.length > maximumRecords)
    throw new Error('关卡列表格式无效或条目过多');
  value.forEach((entry, index) => {
    if (!object(entry) || !id(entry.stageId)) {
      context.issue();
      return;
    }
    const code = text(entry.code, 200),
      data: KnowledgeRecord['data'] = { stageId: entry.stageId };
    if (code) data.code = code;
    if (integer(entry.apCost, 0, 100_000)) data.apCost = entry.apCost;
    const drops: KnowledgeValue[] = [],
      relations: KnowledgeRecord['relations'] = [],
      seen = new Set<string>();
    if (Array.isArray(entry.dropInfos))
      for (const drop of entry.dropInfos.slice(0, 128)) {
        if (!object(drop) || !id(drop.itemId)) {
          context.issue();
          continue;
        }
        const dropType = text(drop.dropType, 100);
        if (!dropType) {
          context.issue();
          continue;
        }
        drops.push({ itemId: drop.itemId, dropType });
        if (!seen.has(drop.itemId)) {
          seen.add(drop.itemId);
          relations.push({ predicate: 'mayDrop', targetKind: 'item', targetId: drop.itemId });
        }
      }
    data.dropInfos = drops;
    context.add(
      'stage',
      entry.stageId,
      code ?? entry.stageId,
      `/${index}`,
      data,
      code ? [code] : [],
      relations,
      ['仅记录掉落种类，不代表掉落概率或期望收益'],
    );
  });
  context.issue(
    '掉落种类没有概率、样本数或统计时间窗，不能据此计算刷图效率；开放时间应查询活动日历',
  );
};

const parseRecruitment: Parse = (value, context) => {
  if (
    !object(value) ||
    !Array.isArray(value.operators) ||
    value.operators.length > 2000 ||
    !object(value.tags) ||
    Object.keys(value.tags).length > 100
  )
    throw new Error('公招文件格式无效或条目过多');
  const tags = new Map<string, string>();
  for (const [tagId, tagValue] of Object.entries(value.tags)) {
    const key = text(tagId, 100),
      name = text(tagValue, 100);
    if (!key || !name) {
      context.issue();
      continue;
    }
    tags.set(key, name);
    context.add(
      'recruitment',
      `tag:${key}`,
      name,
      `/tags/${pointer(key)}`,
      { type: 'tag', tagId: key },
      [key],
    );
  }
  value.operators.forEach((entry, index) => {
    if (
      !object(entry) ||
      !operatorId(entry.id) ||
      !text(entry.name) ||
      !integer(entry.rarity, 1, 6) ||
      !Array.isArray(entry.tags) ||
      entry.tags.length > 32
    ) {
      context.issue();
      return;
    }
    const tagIds = strings(entry.tags, 32, 100),
      names = tagIds.flatMap((tagId) => tags.get(tagId) ?? []);
    if (names.length !== tagIds.length)
      context.issue('部分公招标签缺少当前客户端名称，未使用其他客户端补齐');
    context.add(
      'recruitment',
      entry.id,
      text(entry.name)!,
      `/operators/${index}`,
      { type: 'operator', operatorId: entry.id, rarity: entry.rarity, tagIds, tags: names },
      [],
      [
        { predicate: 'recruits', targetKind: 'operator', targetId: entry.id },
        ...tagIds
          .filter((tagId) => tags.has(tagId))
          .map((tagId) => ({
            predicate: 'hasTag',
            targetKind: 'recruitment' as const,
            targetId: `tag:${tagId}`,
          })),
      ],
      names,
    );
  });
};

function scalarMap(value: unknown): { [key: string]: KnowledgeValue } {
  const result: { [key: string]: KnowledgeValue } = {};
  if (!object(value)) return result;
  for (const [key, field] of Object.entries(value).slice(0, 32)) {
    if (!text(key, 100) || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    if (number(field)) result[key] = field;
    else {
      const fieldValue = text(field, 300);
      if (fieldValue) result[key] = fieldValue;
    }
  }
  return result;
}

const parseInfrastructure: Parse = (value, context) => {
  if (!object(value) || Object.keys(value).length > 100)
    throw new Error('基建文件格式无效或条目过多');
  for (const room of rooms) {
    const facility = value[room];
    if (facility === undefined) continue;
    if (!object(facility)) {
      context.issue();
      continue;
    }
    const facilityData: KnowledgeRecord['data'] = {
      type: 'facility',
      roomType: room,
      products: strings(facility.products, 32, 100),
    };
    if (integer(facility.maxNumOfOpers, 0, 100))
      facilityData.maxNumOfOpers = facility.maxNumOfOpers;
    context.add('infrastructure', room, room, `/${room}`, facilityData);
    if (facility.skills === undefined) continue;
    if (!object(facility.skills) || Object.keys(facility.skills).length > 4000) {
      context.issue();
      continue;
    }
    for (const [skillId, skill] of Object.entries(facility.skills)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_#@.:&-]{0,199}$/.test(skillId) || !object(skill)) {
        context.issue();
        continue;
      }
      const names = strings(skill.name, 32),
        descriptions = Array.isArray(skill.desc)
          ? skill.desc.slice(0, 8).flatMap((part) => text(part, 2000, true) ?? [])
          : [];
      if (Array.isArray(skill.name) && skill.name.length > 32)
        context.issue('部分技能名称超过数量限制，已截断');
      const operators = strings(skill.operatorIds, 64, 200).filter(operatorId);
      if (!names.length) {
        context.issue();
        continue;
      }
      const data: KnowledgeRecord['data'] = {
        type: 'skill',
        roomType: room,
        skillId,
        names,
        descriptions,
        operatorIds: operators,
        efficient: scalarMap(skill.efficient),
        additional: scalarMap(skill.additional),
        conditionsEvaluated: false,
      };
      if (integer(skill.maxNum, 0, 100)) data.maxNum = skill.maxNum;
      context.add(
        'infrastructure',
        `${room}:skill:${skillId}`,
        names[0],
        `/${room}/skills/${pointer(skillId)}`,
        data,
        names,
        [
          { predicate: 'belongsTo', targetKind: 'infrastructure', targetId: room },
          ...operators.map((operator) => ({
            predicate: 'providedBy',
            targetKind: 'operator' as const,
            targetId: operator,
          })),
        ],
        descriptions,
      );
    }
  }
  context.issue(
    '技能效率与附加值仅保留原始字段；条件、跨设施联动和技能组合未计算，不能直接相加得到最优排班',
  );
};

/** Inspect only fixed path segments to distinguish absence from rejected links/oversized files. */
async function unavailableStatus(
  generation: string,
  relative: string,
): Promise<KnowledgeSource['status']> {
  let current = path.join(generation, 'resource');
  try {
    const segments = relative.split('/');
    for (let index = -1; index < segments.length; index++) {
      if (index >= 0) current = path.join(current, segments[index]);
      const info = await lstat(current);
      if (
        info.isSymbolicLink() ||
        (index === segments.length - 1 ? !info.isFile() : !info.isDirectory())
      )
        return 'invalid';
    }
    return 'invalid';
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid';
  }
}

/** Callers pass the service-owned active combo, never a model-supplied filename or resource path. */
export async function buildResourceKnowledge(
  combo: Combo,
  clientType: ClientType,
  previous?: ResourceKnowledgePack,
): Promise<ResourceKnowledgePack> {
  if (previous && !validResourceKnowledgePack(previous)) previous = undefined;
  const selected = ['Official', 'Bilibili'].includes(clientType)
    ? ''
    : `global/${clientType}/resource/`;
  const pack: ResourceKnowledgePack = {
    parserVersion: resourceKnowledgeParserVersion,
    clientType,
    coreVersion: text(combo.core?.version, 200) ?? null,
    resourceVersion: text(combo.resource?.version, 200) ?? null,
    fingerprint: '',
    sources: [],
    records: [],
    diagnostics: [],
  };
  if (!Object.hasOwn(nameKeys, clientType)) throw new Error('不支持的客户端');
  const reader = combo.resource?.path
    ? await ResourceReader.create(combo.resource.path)
    : undefined;
  const parsers: [string, Parse][] = [
    [`${selected}item_index.json`, parseItems],
    ['battle_data.json', parseOperators],
    [`${selected}stages.json`, parseStages],
    [`${selected}recruitment.json`, parseRecruitment],
    [`${selected}infrast.json`, parseInfrastructure],
  ];
  for (const [file, parse] of parsers) {
    const buffer = await reader?.read(file, maximumBytes);
    const hash = buffer ? sha256(buffer) : null;
    const source: KnowledgeSource = {
      file,
      sha256: hash,
      status: buffer
        ? 'available'
        : reader && combo.resource?.path
          ? await unavailableStatus(combo.resource.path, file)
          : combo.resource?.path
            ? 'invalid'
            : 'missing',
      records: 0,
    };
    pack.sources.push(source);
    if (!buffer) {
      pack.diagnostics.push(
        `${file}：${source.status === 'missing' ? '当前客户端资源缺失' : '资源路径不安全、文件不可读或超出大小限制'}，未使用其他客户端数据补齐`,
      );
      continue;
    }
    const priorSource =
      previous?.parserVersion === pack.parserVersion && previous.clientType === clientType
        ? previous.sources.find(
            (prior) => prior.file === file && prior.status === 'available' && prior.sha256 === hash,
          )
        : undefined;
    if (priorSource && priorSource.records <= maximumRecords) {
      const records = previous!.records.filter(
        (record) => record.source.file === file && record.source.sha256 === hash,
      );
      if (records.length === priorSource.records) {
        source.records = records.length;
        pack.records.push(...records);
        pack.diagnostics.push(
          ...previous!.diagnostics.filter((message) => message.startsWith(`${file}：`)).slice(0, 8),
        );
        continue;
      }
    }
    const context = new Context(file, hash!, clientType, pack.diagnostics);
    try {
      parse(JSON.parse(buffer.toString('utf8')), context);
      context.finish();
      source.records = context.records.length;
      pack.records.push(...context.records);
    } catch {
      source.status = 'invalid';
      pack.diagnostics.push(`${file}：JSON 格式或数据结构无效，未使用旧数据或其他客户端数据补齐`);
    }
  }
  pack.fingerprint = sha256(
    JSON.stringify({
      parserVersion: pack.parserVersion,
      clientType,
      coreVersion: pack.coreVersion,
      resourceVersion: pack.resourceVersion,
      sources: pack.sources,
    }),
  );
  return pack;
}
