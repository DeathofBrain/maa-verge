import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import type { CopilotCompatibility, CopilotKind, CopilotOptions, CopilotPreview, CopilotRating, CopilotRatingValue, CopilotRecord, CopilotSearchResult, CopilotSource, CopilotWorkspace } from '../../../packages/contracts/src/rpc-types';
import type { CopilotRunEntry, Task } from '../../../packages/contracts/src/types';
import { Store, now } from './storage';
import { RpcError } from './errors';
import { compareReleaseVersions, releaseVersion } from './release-version';
import { supportsStageNavigation } from './stages';
import * as validators from '../../../packages/contracts/src/validators.js';
import type { RpcContract } from '../../../packages/contracts/src/rpc-types';

const MAX_CONTENT = 700_000, MAX_RESPONSE = 3_000_000, MAX_MEMBERS = 100, COMMUNITY_CONCURRENCY = 8, PREVIEW_TIMEOUT = 90_000;
const kinds = new Set(['Copilot', 'SSSCopilot', 'ParadoxCopilot']);
// MaaCore v6.20.0 CopilotConfig::parse_actions aliases; unknown types would otherwise be silently skipped.
const actionTypes = new Set(["Deploy", "DEPLOY", "deploy", "部署", "Skill", "SKILL", "skill", "技能", "Retreat", "RETREAT", "retreat", "撤退", "SpeedUp", "SPEEDUP", "Speedup", "speedup", "二倍速", "BulletTime", "BULLETTIME", "Bullettime", "bullettime", "子弹时间", "SkillUsage", "SKILLUSAGE", "Skillusage", "skillusage", "技能用法", "Output", "OUTPUT", "output", "输出", "打印", "SkillDaemon", "skilldaemon", "SKILLDAEMON", "Skilldaemon", "DoNothing", "摆完挂机", "开摆", "MoveCamera", "movecamera", "MOVECAMERA", "Movecamera", "移动镜头", "DrawCard", "drawcard", "DRAWCARD", "Drawcard", "抽卡", "抽牌", "调配", "调配干员", "CheckIfStartOver", "Checkifstartover", "CHECKIFSTARTOVER", "checkifstartover", "检查重开", "ResetStopwatch", "RESETSTOPWATCH", "resetstopwatch", "Resetstopwatch", "重置全局计时器", "Click", "click", "CLICK", "点击", "Swipe", "swipe", "SWIPE", "滑动", "SetUnitLocation", "Setunitlocation", "setunitlocation", "SETUNITLOCATION", "设置单位坐标"]);
const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit = 300) => typeof value === 'string' ? value.slice(0, limit) : '';
const identifier = (prefix: string) => `${prefix}-${randomUUID()}`;
const fail = (message: string): never => { throw new RpcError(-32602, message); };
const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)).slice(0, 1000);
const clone = <T>(value: T): T => structuredClone(value);
/** These nonstandard fields are content signatures, not the API's uploader identity. */
function contentAuthor(value: unknown): string {
  if (!object(value)) return '';
  const author = [value.author, object(value.doc) ? value.doc.author : undefined].find(item => typeof item === 'string' && item.trim());
  return text(author, 300);
}
function validate<T>(validator: (value: unknown) => value is T, input: unknown): T {
  if (!validator(input)) fail('作业请求参数无效'); return input as T;
}
function boundedJson(filename: string, maximum: number): any {
  const info = statSync(filename);
  if (!info.isFile() || info.size > maximum) fail('文件无效或超过允许的大小');
  const data = readFileSync(filename);
  if (data.byteLength > maximum) fail('文件超过允许的大小');
  try { return JSON.parse(data.toString('utf8')); } catch { return fail('JSON 文件格式无效'); }
}
function rawFile(filename: string): string {
  const info = statSync(filename);
  if (!info.isFile() || info.size > MAX_CONTENT) fail('作业文件超过 700 KB 或不是普通文件');
  const data = readFileSync(filename);
  if (data.byteLength > MAX_CONTENT) fail('作业文件在读取时超过 700 KB');
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
}
function safeUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
function normalizeId(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9]\d{0,14}$/.test(value)) return value;
  return fail('社区作业编号无效');
}
/** Parse identities only; user input is never used as a fetch URL. */
export function parseCopilotCode(input: string): { target: 'copilot' | 'set'; id: string } {
  let value = input.trim();
  if (value.length > 2048) fail('作业代码过长');
  if (/^(?:maa|prts):\/\//i.test(value)) value = value.replace(/^(?:maa|prts):\/\//i, '').replace(/\/$/, '');
  else if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try { url = new URL(value); } catch { return fail('作业链接无效'); }
    if (!['prts.plus', 'www.prts.plus'].includes(url.hostname) || url.username || url.password || url.port || url.protocol !== 'https:') fail('仅支持 PRTS Plus 原站作业链接');
    const match = /^\/(?:copilot|set)\/([1-9]\d{0,14})\/?$/.exec(url.pathname);
    if (!match || url.search || url.hash) fail('无法识别原站作业链接');
    return { target: url.pathname.startsWith('/set/') ? 'set' : 'copilot', id: match![1]! };
  }
  const match = /^(s?)([1-9]\d{0,14})$/i.exec(value);
  if (!match) fail('请输入作业编号、s作业集编号或受支持的原站链接');
  return { target: match![1] ? 'set' : 'copilot', id: match![2]! };
}

export const defaultCopilotOptions = (): CopilotOptions => ({ loopTimes: 1, formation: false, formationIndex: 0, addTrust: false, ignoreRequirements: false, supportUnitName: '', additionalOperators: [], autoLikeOnSuccess: false });
/** Object field order is transport detail; queue and operator array order remain significant. */
export function copilotWorkspaceIdentity(workspace: CopilotWorkspace): string {
  // Absence and the new opt-out default preserve historical request identities.
  const options = { ...workspace.options }; if (!options.autoLikeOnSuccess) delete options.autoLikeOnSuccess;
  const canonical = JSON.stringify({ ...workspace, options }, (_key, value: unknown) => object(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  return createHash('sha256').update(canonical).digest('hex');
}
interface Version { record: CopilotRecord; stages: string[]; file: string }
interface PreviewStored { public: CopilotPreview; createdAt: number }
interface FeedbackSource { entryId: string; versionId: string; communityId: string }
export interface CopilotContext {
  coreVersion: () => string | undefined;
  resourceDirectory: () => string | undefined;
  http?: typeof fetch;
  changed?: (message: string) => void;
}

export class CopilotLibrary {
  private readonly directory: string;
  private readonly previews = new Map<string, PreviewStored>();
  private resourceCache?: { root: string; aliases: Map<string, string> };
  private navigationCache = new Map<string, Record<string, unknown>>();
  private feedbackChains = new Map<string, Promise<unknown>>();
  private feedbackTasks = new Set<Promise<unknown>>();
  private communityControllers = new Set<AbortController>();
  private closing = false;
  constructor(readonly root: string, readonly store: Store, private context: CopilotContext) {
    this.directory = path.join(root, 'copilot', 'versions'); mkdirSync(this.directory, { recursive: true });
  }
  private aliases(): Map<string, string> {
    const generation = this.context.resourceDirectory();
    if (!generation) return new Map();
    if (this.resourceCache?.root === generation) return this.resourceCache.aliases;
    const aliases = new Map<string, string>();
    const directory = path.join(generation, 'resource', 'Arknights-Tile-Pos');
    try {
      const overview = boundedJson(path.join(directory, 'overview.json'), 16 * 1024 * 1024);
      if (!object(overview) || Object.keys(overview).length > 50_000) throw new Error('关卡索引无效');
      const realDirectory = realpathSync(directory);
      for (const entry of Object.values(overview)) {
        if (!object(entry) || typeof entry.filename !== 'string' || path.isAbsolute(entry.filename)) continue;
        try {
          const filename = realpathSync(path.join(directory, entry.filename));
          if (!filename.startsWith(realDirectory + path.sep) || !statSync(filename).isFile()) continue;
          const names = [entry.stageId, entry.levelId, entry.code, entry.name].filter(item => typeof item === 'string' && item.length > 0 && item.length <= 200) as string[];
          const baseId = text(entry.stageId, 200).split('#')[0]!;
          for (const name of names) aliases.set(name, baseId || text(entry.stageId ?? entry.levelId, 200));
        } catch { /* A summary without its map file is not an installed map. */ }
      }
    } catch { /* Missing or invalid index is reported as unverified below. */ }
    this.resourceCache = { root: generation, aliases }; return aliases;
  }
  /** Same fixed resource paths and shallow override order as stageCatalog. */
  private navigation(clientType: NonNullable<RpcContract['params']['stages.list']['clientType']>): Record<string, unknown> {
    const generation = this.context.resourceDirectory();
    if (!generation) return {};
    const cacheKey = `${generation}\n${clientType}`, cached = this.navigationCache.get(cacheKey);
    if (cached) return cached;
    const root = path.join(generation, 'resource'), tasks: Record<string, unknown> = Object.create(null);
    let remaining = 32 * 1024 * 1024;
    const read = (filename: string, maximum: number) => {
      const bytes = statSync(filename).size;
      if (bytes > remaining) throw new RpcError(-32010, '关卡导航资源超过读取限制，请更新资源');
      remaining -= bytes; return boundedJson(filename, maximum);
    };
    const merge = (value: unknown) => {
      if (!object(value)) return;
      for (const [key, item] of Object.entries(value)) tasks[key] = object(tasks[key]) && object(item) ? { ...tasks[key], ...item } : item;
    };
    const roots = ['Official', 'Bilibili'].includes(clientType) ? [''] : ['', path.join('global', clientType, 'resource')];
    for (const selected of roots) {
      for (const relative of ['tasks.json', path.join('tasks', 'tasks.json')]) {
        try { merge(read(path.join(root, selected, relative), 8 * 1024 * 1024)); } catch (cause) { if (cause instanceof RpcError) throw cause; /* Fixed resources may use the split layout. */ }
      }
      try {
        const directory = path.join(root, selected, 'tasks', 'Stages'), entries = readdirSync(directory, { withFileTypes: true });
        if (entries.length > 512) throw new RpcError(-32010, '关卡导航资源数量超过限制，请更新资源');
        for (const entry of entries.filter(item => item.isFile() && item.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) merge(read(path.join(directory, entry.name), 2 * 1024 * 1024));
      } catch (cause) { if (cause instanceof RpcError) throw cause; }
    }
    // Generations are immutable. Bound old cache retention when components switch.
    if (this.navigationCache.size >= 12) this.navigationCache.delete(this.navigationCache.keys().next().value!);
    this.navigationCache.set(cacheKey, tasks); return tasks;
  }
  private compatibility(record: Pick<CopilotRecord, 'minimumCoreVersion'>, stages: string[]): CopilotCompatibility {
    const reasons: string[] = [], current = this.context.coreVersion(); let unsupported = false;
    if (!current || !releaseVersion(current)) reasons.push('尚未启用可识别版本的 MaaCore，请先安装核心');
    if (record.minimumCoreVersion) {
      if (!releaseVersion(record.minimumCoreVersion)) { reasons.push('作业最低核心版本格式无效'); unsupported = true; }
      else if (current && releaseVersion(current) && compareReleaseVersions(current, record.minimumCoreVersion) < 0) { reasons.push(`需要 MaaCore ${record.minimumCoreVersion} 或更新版本`); unsupported = true; }
    }
    const aliases = this.aliases();
    if (!aliases.size) reasons.push('当前资源缺少可校验的关卡索引，请安装或更新资源');
    else for (const stage of stages) if (!aliases.has(stage)) { reasons.push(`当前资源不支持关卡：${stage}`); unsupported = true; }
    return { status: unsupported ? 'unsupported' : reasons.length ? 'unverified' : 'ready', reasons: reasons.slice(0, 20) };
  }
  private version(id: string): Version {
    if (!/^[a-f0-9]{64}$/.test(id)) return fail('作业版本标识无效');
    const version = this.store.get<Version | undefined>('copilot_version', id);
    if (!version) throw new RpcError(-32004, '找不到指定作业版本');
    return version;
  }
  private record(version: Version, stored = version.record): CopilotRecord {
    const record = clone(stored);
    if (record.operators.length && !record.operators.some(operator => operator.group !== undefined)) {
      // Older metadata flattened alternatives into mandatory operators. Recover
      // groups from exact immutable content without rewriting historical data.
      try {
        const value = JSON.parse(this.readVersion(version).replace(/^\ufeff/, ''));
        let index = Array.isArray(value.opers) ? value.opers.length : 0;
        for (const group of Array.isArray(value.groups) ? value.groups : []) {
          for (const operator of Array.isArray(group.opers) ? group.opers : []) {
            if (record.operators[index]?.name === operator.name && typeof group.name === 'string' && group.name.trim() && group.name.length <= 100) record.operators[index]!.group = group.name;
            index++;
          }
        }
      } catch { /* Missing or invalid content cannot substantiate group metadata. */ }
    }
    if (record.source.kind === 'community' && record.uploader === undefined) {
      // Older community records stored the API uploader in author. Recover display metadata
      // from verified immutable content without rewriting the version or business record.
      let author = '';
      try { author = contentAuthor(JSON.parse(this.readVersion(version).replace(/^\ufeff/, ''))); } catch { /* Missing content cannot substantiate an author claim. */ }
      if (record.author && record.author !== author) record.uploader = record.author;
      record.author = author;
    }
    return { ...record, compatibility: this.compatibility(version.record, version.stages) };
  }
  list(input: RpcContract['params']['copilot.list'] = {}): RpcContract['results']['copilot.list'] {
    const params = validate(validators.validateCopilotListParams, input);
    const items = this.store.all<CopilotRecord>('copilot').filter(item => !params.kind || item.kind === params.kind), page = params.page ?? 1;
    const result = { items: items.slice((page - 1) * 20, page * 20).map(item => this.record(this.version(item.versionId), item)), page, total: items.length, hasNext: page * 20 < items.length };
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESPONSE) throw new RpcError(-32010, '本页作业元数据超过通信限制，请按类型筛选或清理异常作业');
    return result;
  }
  get(input: RpcContract['params']['copilot.get']): CopilotRecord {
    const params = validate(validators.validateCopilotIdentityParams, input);
    if (!!params.id === !!params.versionId) return fail('请指定一份作业或一个作业版本');
    if (params.versionId) return this.record(this.version(params.versionId));
    const record = this.store.get<CopilotRecord | undefined>('copilot', params.id!);
    if (!record) throw new RpcError(-32004, '作业已删除或不存在');
    return this.record(this.version(record.versionId), record);
  }
  export(input: RpcContract['params']['copilot.export']): RpcContract['results']['copilot.export'] {
    const params = validate(validators.validateCopilotExportParams, input), version = this.version(params.versionId), content = this.readVersion(version);
    const record = params.id ? this.get({ id: params.id }) : this.record(version);
    if (record.versionId !== params.versionId) return fail('作业条目与导出版本不匹配');
    const filename = `${record.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 100) || 'copilot'}.json`;
    const attribution = {
      formatVersion: 1, contentFile: filename, versionId: record.versionId, title: record.title,
      source: record.source, author: contentAuthor(JSON.parse(content.replace(/^\ufeff/, ''))), ...(record.uploader !== undefined ? { uploader: record.uploader } : {}),
      licenseStatus: 'unverified',
      licenseNotice: '未发现已核实的统一内容许可；未声明的许可视为未知，不推定适用 Maa Verge 的 AGPL-3.0-only。具体版权与许可文字以原始 JSON（包括 doc.details）中的声明为准。此来源记录不代表已经获得转载或再分发许可。',
    };
    return { filename, content, attribution: { filename: filename.replace(/\.json$/, '.attribution.json'), content: JSON.stringify(attribution, null, 2) + '\n' } };
  }
  private readVersion(version: Version): string {
    let content: string;
    try { content = rawFile(path.join(this.directory, version.record.versionId + '.json')); }
    catch { throw new RpcError(-32010, '作业版本文件缺失或不可读取，请重新导入'); }
    if (createHash('sha256').update(content).digest('hex') !== version.record.versionId) throw new RpcError(-32010, '作业版本文件已损坏，请重新导入；不会覆盖正在使用的文件');
    return content;
  }
  private stage(raw: string, source: CopilotSource, expectedKind?: CopilotKind, uploader?: string): CopilotRecord {
    if (!raw.trim() || Buffer.byteLength(raw, 'utf8') > MAX_CONTENT) return fail('作业 JSON 为空或超过 700 KB，请拆分导入');
    let value: any; try { value = JSON.parse(raw.replace(/^\ufeff/, '')); } catch { return fail('作业 JSON 格式无效'); }
    if (!object(value)) return fail('作业 JSON 必须是对象');
    const stageName = typeof value.stage_name === 'string' && value.stage_name.trim() && value.stage_name.length <= 200 ? value.stage_name : fail('作业缺少有效的 stage_name');
    const declared = value.type;
    let kind: CopilotKind;
    if (declared === 'SSS' || declared === 'SSSCopilot') kind = 'SSSCopilot';
    else if (['Paradox', 'ParadoxCopilot', 'PARADOX'].includes(declared) || /^(?:mem_|mem-|paradox)/i.test(stageName)) kind = 'ParadoxCopilot';
    else if (declared === undefined || ['PRTS', 'Copilot'].includes(declared)) kind = 'Copilot';
    else return fail('无法识别的作业类型；仅支持普通、保全与悖论作业');
    if (expectedKind && expectedKind !== kind) {
      // Paradox shares the normal JSON format; the explicit legacy task is a reliable type source.
      if (expectedKind === 'ParadoxCopilot' && kind === 'Copilot') kind = expectedKind;
      else return fail('作业类型与来源任务不一致');
    }
    const versionId = createHash('sha256').update(raw).digest('hex');
    const existing = this.store.get<Version | undefined>('copilot_version', versionId);
    if (existing && existing.record.kind !== kind) return fail(`相同 JSON 已按 ${existing.record.kind} 保存，与本次 ${kind} 类型不一致，请检查来源任务类型`);
    const list = (input: unknown, label: string, required = false): any[] => {
      if (input === undefined && !required) return [];
      if (!Array.isArray(input) || input.length > 20_000 || !input.every(object)) return fail(`${label} 必须是有界对象列表`);
      return input;
    };
    const actions = (input: unknown, required = true) => {
      for (const item of list(input, 'actions', required)) {
        if (item.type !== undefined && typeof item.type !== 'string') fail('动作 type 必须是字符串');
        if (item.name !== undefined && typeof item.name !== 'string') fail('动作 name 必须是字符串');
        const type = item.type ?? 'Deploy';
        if (!actionTypes.has(type)) fail(`当前协议不支持动作类型：${String(type).slice(0, 100)}`);
        for (const field of ['location', 'distance', 'rect', 'begin', 'end']) if (item[field] !== undefined && (!Array.isArray(item[field]) || !item[field].every((n: unknown) => typeof n === 'number' && Number.isFinite(n)))) fail(`动作 ${field} 坐标无效`);
        const point = (value: unknown) => Array.isArray(value) && value.length === 2 && value.every(n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647);
        const rect = (value: unknown) => Array.isArray(value) && value.length === 4 && value.every(n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647) && value[2] > 0 && value[3] > 0;
        if (item.location !== undefined && !point(item.location)) fail('动作 location 需要两个整数坐标');
        const normalized = type.toLowerCase();
        if (['click', '点击'].includes(normalized) && (item.rect !== undefined ? !rect(item.rect) : !point(item.location))) fail('点击动作需要有效 rect 或 location');
        if (['swipe', '滑动'].includes(normalized) && (!rect(item.begin) || !rect(item.end))) fail('滑动动作需要有效的 begin 和 end 矩形');
        if (['setunitlocation', '设置单位坐标'].includes(normalized) && (!item.name || !point(item.location))) fail('设置单位坐标需要干员名称和整数 location');
        if (['movecamera', '移动镜头'].includes(normalized) && (!Array.isArray(item.distance) || item.distance.length !== 2)) fail('移动镜头动作需要两个 distance 分量');
        if (['deploy', '部署'].includes(normalized) && (!item.name || !point(item.location) || typeof item.direction !== 'string')) fail('部署动作需要干员名称、位置和方向');
        for (const field of ['kills', 'cost_changes', 'costs', 'cooling', 'pre_delay', 'post_delay', 'rear_delay', 'timeout', 'skill_usage', 'skill_times', 'duration']) if (item[field] !== undefined && (!Number.isInteger(item[field]) || item[field] < -2147483648 || item[field] > 2147483647)) fail(`动作 ${field} 必须是有效整数`);

      }
    };
    const stages: string[] = [];
    if (kind === 'SSSCopilot') {
      const levels = list(value.stages, '保全 stages', true);
      if (!levels.length || levels.length > 100 || !object(value.tool_men)) return fail('保全作业缺少 stages 或 tool_men');
      const roleCounts = (input: unknown) => {
        if (!object(input) || Object.values(input).some(count => !Number.isInteger(count) || count < 0 || count > 2147483647)) fail('保全工具人数量必须是非负整数');
      };
      roleCounts(value.tool_men);
      if (value.equipment !== undefined && (!Array.isArray(value.equipment) || value.equipment.some((item: unknown) => !['A', 'a', 'B', 'b'].includes(String(item))))) fail('保全 equipment 必须为 A/B 装备列表');
      for (const field of ['drops', 'blacklist']) if (value[field] !== undefined && (!Array.isArray(value[field]) || value[field].some((item: unknown) => typeof item !== 'string'))) fail(`保全 ${field} 必须是字符串列表`);
      for (const level of levels) {
        if (typeof level.stage_name !== 'string' || !level.stage_name || level.stage_name.length > 200) return fail('保全子关卡名称无效');
        if (typeof level.draw_as_possible !== 'boolean') fail('保全子关卡缺少 draw_as_possible 布尔值');
        stages.push(level.stage_name); actions(level.actions);
        for (const strategy of list(level.strategies, '保全 strategies', true)) {
          roleCounts(strategy.tool_men);
          if (!Array.isArray(strategy.location) || strategy.location.length !== 2 || !strategy.location.every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= -2147483648 && n <= 2147483647)) fail('保全策略 location 需要两个整数坐标');
          if (strategy.core !== undefined && typeof strategy.core !== 'string') fail('保全策略核心干员名称无效');
          if (strategy.direction !== undefined && typeof strategy.direction !== 'string') fail('保全策略方向无效');
        }
      }
    } else { actions(value.actions); stages.push(stageName); }
    const operators: CopilotRecord['operators'] = [];
    const operator = (item: any, group?: string) => {
      if (typeof item.name !== 'string' || !item.name || item.name.length > 100) return fail('干员名称无效');
      if (item.skill !== undefined && (!Number.isInteger(item.skill) || item.skill < 0 || item.skill > 3)) return fail('干员技能序号无效');
      const requirements: Record<string, number> = {};
      if (item.requirements !== undefined && !object(item.requirements)) return fail('干员练度要求无效');
      for (const [key, requirement] of Object.entries(item.requirements ?? {})) if (typeof requirement === 'number' && Number.isFinite(requirement) && key.length <= 80) requirements[key] = requirement;
      operators.push({ name: item.name, ...(group !== undefined ? { group } : {}), ...(item.skill ? { skill: item.skill } : {}), ...(Object.keys(requirements).length ? { requirements } : {}) });
    };
    for (const item of list(value.opers, 'opers')) operator(item);
    for (const group of list(value.groups, 'groups')) { if (typeof group.name !== 'string' || !group.name.trim() || group.name.length > 100) fail('干员编组名称无效'); for (const item of list(group.opers, 'groups.opers', true)) operator(item, group.name); }
    if (operators.length > 100) return fail('作业干员要求超过 100 项');
    const doc = object(value.doc) ? value.doc : {};
    const details = text(doc.details, 3000), videos = [...new Set((details.match(/https?:\/\/[^\s<>"）)]+/g) ?? []).map(safeUrl).filter(Boolean))].slice(0, 20);
    const record: CopilotRecord = { id: identifier('copilot'), versionId, kind, title: text(doc.title || source.name || stageName, 300), stageName, author: contentAuthor(value), ...(uploader !== undefined ? { uploader: text(uploader, 300) } : {}), description: details,
      minimumCoreVersion: text(value.minimum_required, 80), operators, videos, source: clone(source), createdAt: now(), compatibility: { status: 'unverified', reasons: [] } };
    record.compatibility = this.compatibility(record, stages);
    const filename = path.join(this.directory, versionId + '.json');
    if (existsSync(filename)) {
      if (rawFile(filename) !== raw) throw new RpcError(-32010, '同名作业版本内容不一致，请检查本地文件；不会覆盖');
    } else {
      const fd = openSync(filename, 'wx', 0o600);
      try { writeFileSync(fd, raw); fsyncSync(fd); } finally { closeSync(fd); }
    }
    if (!existing) this.store.put('copilot_version', versionId, { record, stages, file: filename } satisfies Version);
    if (source.kind === 'community' && source.communityId) {
      // A content hash can belong to multiple uploads. Remember ambiguity instead
      // of silently crediting whichever upload happens to be displayed later.
      const ids = this.store.get<string[]>('copilot_origins', versionId, []);
      if (!ids.includes(source.communityId) && ids.length < 2) this.store.put('copilot_origins', versionId, [...ids, source.communityId]);
    } else this.store.put('copilot_noncommunity_origin', versionId, true);
    return record;
  }
  private previewEntry(content: string, source: CopilotSource, expectedKind?: CopilotKind, uploader?: string): CopilotPreview['entries'][number] {
    try { return { id: identifier('entry'), record: this.stage(content, source, expectedKind, uploader), error: null }; }
    catch (cause) { return { id: identifier('entry'), record: null, error: message(cause) }; }
  }
  async preview(input: RpcContract['params']['copilot.preview']): Promise<CopilotPreview> {
    const params = validate(validators.validateCopilotPreviewParams, input);
    if ([params.content !== undefined, params.code !== undefined, params.planId !== undefined].filter(Boolean).length !== 1) return fail('请选择本地 JSON、社区代码或旧任务中的一种来源');
    if ((params.planId !== undefined) !== (params.taskIndex !== undefined)) return fail('复制旧任务必须同时指定任务表和任务位置');
    let title = params.name || '导入作业', entries: CopilotPreview['entries'] = [];
    if (params.content !== undefined) entries = [this.previewEntry(params.content, { kind: 'local', name: params.name || '本地 JSON', url: '' })];
    else if (params.code !== undefined) {
      const identity = parseCopilotCode(params.code), deadline = Date.now() + PREVIEW_TIMEOUT;
      if (identity.target === 'copilot') entries = [await this.communityEntry(identity.id, undefined, deadline)];
      else {
        const data = await this.request(`/set/get?id=${identity.id}`, undefined, deadline);
        if (!object(data) || !Array.isArray(data.copilot_ids)) fail('作业集响应缺少有序成员列表');
        if (data.copilot_ids.length > MAX_MEMBERS) fail('作业集超过 100 项，请拆分为较小作业集');
        title = text(data.name, 300) || `作业集 ${identity.id}`;
        // Bounded workers preserve exact upstream order, duplicates and every failure.
        entries = new Array(data.copilot_ids.length); let next = 0;
        await Promise.all(Array.from({ length: Math.min(COMMUNITY_CONCURRENCY, data.copilot_ids.length) }, async () => {
          for (;;) {
            const index = next++; if (index >= data.copilot_ids.length) return;
            try { entries[index] = await this.communityEntry(normalizeId(data.copilot_ids[index]), identity.id, deadline); }
            catch (cause) { entries[index] = { id: identifier('entry'), record: null, error: message(cause) }; }
          }
        }));
      }
    } else {
      const plan = this.store.get('plan', params.planId!);
      const task = plan?.tasks?.[params.taskIndex!];
      if (!task || !kinds.has(task.type)) fail('指定旧任务不是可复制的作业');
      const p = task.params ?? {};
      const files = Object.hasOwn(p, 'filename') ? [p.filename] : task.type === 'Copilot' ? p.copilot_list?.map((item: any) => item.filename) : task.type === 'ParadoxCopilot' ? p.list?.map((item: any) => typeof item === 'string' ? item : item.filename) : [];
      if (!Array.isArray(files) || !files.length || files.length > MAX_MEMBERS) fail('旧任务缺少有效的作业文件列表');
      title = `${text(plan.name, 200)} · 复制到作业库`;
      entries = files.map((filename: unknown) => {
        try {
          if (typeof filename !== 'string' || !filename.trim()) fail('旧任务作业文件路径无效');
          return this.previewEntry(rawFile(filename as string), { kind: 'legacy', name: path.basename(filename as string), url: '' }, task.type);
        } catch (cause) { return { id: identifier('entry'), record: null, error: message(cause) }; }
      });
    }
    const preview: CopilotPreview = { id: identifier('preview'), title, entries };
    if (Buffer.byteLength(JSON.stringify(preview)) > MAX_RESPONSE) fail('预览结果超过通信限制，请缩小作业集');
    for (const [key, item] of this.previews) if (Date.now() - item.createdAt > 3_600_000) this.previews.delete(key);
    if (this.previews.size >= 20) this.previews.delete(this.previews.keys().next().value!);
    this.previews.set(preview.id, { public: clone(preview), createdAt: Date.now() }); return preview;
  }
  import(input: RpcContract['params']['copilot.import']): RpcContract['results']['copilot.import'] {
    const params = validate(validators.validateCopilotImportParams, input), preview = this.previews.get(params.previewId);
    if (!preview || Date.now() - preview.createdAt > 3_600_000) throw new RpcError(-32004, '导入预览已过期，请重新预览');
    const selected = params.entryIds ? new Set(params.entryIds) : new Set(preview.public.entries.map(entry => entry.id));
    if ([...selected].some(id => !preview.public.entries.some(entry => entry.id === id))) fail('选择中包含不属于该预览的条目');
    const items: CopilotRecord[] = [], errors: { id: string; message: string }[] = [];
    this.store.transaction(() => {
      for (const entry of preview.public.entries) if (selected.has(entry.id)) {
        if (!entry.record || entry.error) { errors.push({ id: entry.id, message: entry.error || '作业解析失败' }); continue; }
        const record = this.record(this.version(entry.record.versionId), entry.record);
        this.store.put('copilot', record.id, record); items.push(record);
      }
    });
    const setIds = new Set(preview.public.entries.map(entry => entry.record?.source.setId).filter((id): id is string => !!id));
    for (const id of setIds) this.store.put('copilot_set', id, { id, title: preview.public.title, url: `https://prts.plus/set/${id}`, members: preview.public.entries.map(entry => ({ id: entry.id, versionId: entry.record?.versionId ?? null, imported: selected.has(entry.id) && !entry.error, error: entry.error })), importedAt: now() });
    this.context.changed?.(`已导入 ${items.length} 份作业`); return { items, errors };
  }
  delete(input: RpcContract['params']['copilot.delete']): { deleted: boolean } {
    validate(validators.validateIdParams, input); const existed = !!this.store.get('copilot', input.id);
    this.store.delete('copilot', input.id); // Retain immutable versions referenced by queues, active runs and history.
    this.context.changed?.('已移除作业库条目，执行快照保留'); return { deleted: existed };
  }
  workspaceGet(input: RpcContract['params']['copilot.workspace.get']): CopilotWorkspace {
    const params = validate(validators.validateCopilotWorkspaceParams, input);
    const workspace = clone(this.store.get<CopilotWorkspace>('copilot_workspace', params.kind, { kind: params.kind, queue: [], options: defaultCopilotOptions() }));
    workspace.options.autoLikeOnSuccess ??= false; return workspace;
  }
  workspaceSave(input: RpcContract['params']['copilot.workspace.save']): CopilotWorkspace {
    const params = validate(validators.validateCopilotWorkspaceSaveParams, input), workspace = clone(params.workspace);
    workspace.options.autoLikeOnSuccess ??= false;
    if (new Set(workspace.queue.map(entry => entry.id)).size !== workspace.queue.length) fail('重复的队列条目标识');
    for (const entry of workspace.queue) if (this.version(entry.versionId).record.kind !== workspace.kind) fail('三种作业类型不能混入同一队列');
    if (workspace.kind === 'SSSCopilot' && workspace.queue.filter(entry => entry.enabled).length > 1) fail('保全派驻仅支持一份启用作业');
    if (workspace.kind !== 'Copilot' && (workspace.options.formation || workspace.options.addTrust || workspace.options.ignoreRequirements || workspace.options.supportUnitName || workspace.options.additionalOperators.length)) fail('保全与悖论不支持普通作业编队选项');
    if (workspace.queue.filter(entry => entry.enabled).length > 1 && workspace.options.loopTimes !== 1) fail('原生多作业列表不支持整体循环，请设为单次执行');
    if (workspace.kind === 'ParadoxCopilot' && workspace.options.loopTimes !== 1) fail('悖论模拟不支持循环次数');
    if (workspace.options.supportUnitName && (!workspace.options.formation || workspace.options.loopTimes !== 1)) fail('助战需要自动编队且只能单次执行');
    this.store.put('copilot_workspace', workspace.kind, workspace); this.context.changed?.('作业队列与选项已保存'); return workspace;
  }
  prepare(kind: CopilotKind, clientType: NonNullable<RpcContract['params']['stages.list']['clientType']> = 'Official'): { name: string; tasks: Task[]; entries: CopilotRunEntry[]; identity: string; workspace: CopilotWorkspace; feedbackSources: FeedbackSource[] } {
    const workspace = this.workspaceSave({ workspace: this.workspaceGet({ kind }) });
    const selected = workspace.queue.filter(entry => entry.enabled);
    if (!selected.length) fail('请先勾选至少一份作业');
    const versions = selected.map(entry => this.version(entry.versionId));
    for (const version of versions) {
      const record = this.record(version);
      if (record.compatibility.status !== 'ready') throw new RpcError(-32010, record.compatibility.reasons.join('；'));
      this.readVersion(version);
    }
    if (kind === 'Copilot' && selected.length > 1) {
      const tasks = this.navigation(clientType);
      for (const entry of selected) if (entry.navName && !supportsStageNavigation(tasks, entry.navName)) throw new RpcError(-32010, `当前资源不支持导航关卡：${entry.navName}；请更新资源或修改导航覆盖`);
    }
    const o = workspace.options;
    const params: Record<string, unknown> = {};
    if (selected.length === 1) { params.filename = path.join(this.directory, selected[0]!.versionId + '.json'); if (kind !== 'ParadoxCopilot') params.loop_times = o.loopTimes; }
    else if (kind === 'Copilot') params.copilot_list = selected.map((entry, index) => ({ filename: path.join(this.directory, entry.versionId + '.json'), id: index + 1, is_raid: entry.isRaid, nav_name_override: entry.navName || null }));
    else if (kind === 'ParadoxCopilot') params.list = selected.map((entry, index) => ({ filename: path.join(this.directory, entry.versionId + '.json'), id: index + 1 }));
    else fail('保全派驻不支持多作业队列');
    if (kind === 'Copilot') Object.assign(params, { formation: o.formation, formation_index: o.formationIndex, add_trust: o.addTrust, ignore_requirements: o.ignoreRequirements, user_additional: o.additionalOperators,
      support_unit_usage: o.supportUnitName ? 2 : 0, support_unit_name: o.supportUnitName, use_sanity_potion: false });
    const entries: CopilotRunEntry[] = selected.map((entry, index) => ({ id: entry.id, versionId: entry.versionId, title: versions[index]!.record.title, nativeId: index + 1, status: 'waiting', verdict: 'unknown', message: '等待执行，通关未确认' }));
    const name = `${kind === 'Copilot' ? '普通作业' : kind === 'SSSCopilot' ? '保全派驻' : '悖论模拟'} · ${versions[0]!.record.title}`.slice(0, 80);
    const feedbackSources = selected.flatMap(entry => {
      const ids = this.communityIds(entry.versionId), first = this.version(entry.versionId).record.source;
      const localOrigin = first.kind !== 'community' || this.store.get('copilot_noncommunity_origin', entry.versionId, false)
        || this.store.all<CopilotRecord>('copilot').some(record => record.versionId === entry.versionId && record.source.kind !== 'community');
      return !localOrigin && ids.length === 1 ? [{ entryId: entry.id, versionId: entry.versionId, communityId: ids[0]! }] : [];
    });
    return { name, tasks: [{ type: kind, enabled: true, params }], entries, identity: copilotWorkspaceIdentity(workspace), workspace, feedbackSources };
  }
  private communityIds(versionId: string): string[] {
    const source = this.version(versionId).record.source;
    return [...new Set([...this.store.get<string[]>('copilot_origins', versionId, []),
      ...(source.kind === 'community' && source.communityId ? [source.communityId] : []),
      ...this.store.all<CopilotRecord>('copilot').filter(record => record.versionId === versionId && record.source.kind === 'community').map(record => record.source.communityId!).filter(Boolean)])];
  }
  private ratingIdentity(params: RpcContract['params']['copilot.rating.get']): string {
    this.version(params.versionId);
    if (params.recordId) {
      let record = this.store.get<CopilotRecord | undefined>('copilot', params.recordId);
      if (record?.versionId !== params.versionId) record = undefined;
      if (!record) for (const preview of this.previews.values()) {
        if (Date.now() - preview.createdAt > 3_600_000) continue;
        record = preview.public.entries.find(entry => entry.record?.id === params.recordId && entry.record?.versionId === params.versionId)?.record ?? undefined;
        if (record) break;
      }
      if (!record || record.versionId !== params.versionId) return fail('作业来源已过期或与版本不匹配，请重新打开详情');
      if (record.source.kind !== 'community' || !record.source.communityId) fail('仅社区作业支持在线评价');
      return normalizeId(record.source.communityId);
    }
    const ids = this.communityIds(params.versionId);
    if (ids.length !== 1) fail(ids.length ? '同一内容存在多个社区来源，请从指定作业详情评价' : '仅社区作业支持在线评价');
    return normalizeId(ids[0]);
  }
  private async readRating(id: string): Promise<CopilotRating> {
    const data = await this.request(`/copilot/get/${id}`);
    if (!object(data) || data.available === false || data.status === 'DELETED' || normalizeId(data.id) !== id
      || !Number.isSafeInteger(data.like) || data.like < 0 || !Number.isSafeInteger(data.dislike) || data.dislike < 0 || ![0, 1, 2].includes(data.rating_type)) throw new RpcError(-32010, '社区评价响应无效，无法确认当前评价');
    return { communityId: id, likes: data.like, dislikes: data.dislike, rating: data.rating_type === 1 ? 'like' : data.rating_type === 2 ? 'dislike' : 'none' };
  }
  private feedbackSerial<T>(id: string, action: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new RpcError(-32011, '应用正在退出，社区评价已关闭'));
    const promise = (this.feedbackChains.get(id) ?? Promise.resolve()).catch(() => {}).then(() => {
      if (this.closing) throw new RpcError(-32011, '应用正在退出，已取消排队的社区评价');
      return action();
    });
    this.feedbackChains.set(id, promise); this.feedbackTasks.add(promise);
    void promise.finally(() => { if (this.feedbackChains.get(id) === promise) this.feedbackChains.delete(id); this.feedbackTasks.delete(promise); }).catch(() => {});
    return promise;
  }
  async ratingGet(input: RpcContract['params']['copilot.rating.get']): Promise<CopilotRating> {
    if (this.closing) throw new RpcError(-32011, '应用正在退出，社区评价已关闭');
    const params = validate(validators.validateCopilotRatingParams, input), id = this.ratingIdentity(params);
    return this.feedbackSerial(id, () => this.readRating(id));
  }
  async ratingSet(input: RpcContract['params']['copilot.rating.set']): Promise<CopilotRating> {
    if (this.closing) throw new RpcError(-32011, '应用正在退出，社区评价已关闭');
    const params = validate(validators.validateCopilotRatingSetParams, input), id = this.ratingIdentity(params);
    const intent = { requestId: randomUUID(), rating: params.rating, updatedAt: now() };
    this.store.put('copilot_manual_intent', id, intent);
    // Preserve a manual negative preference even when its network request fails.
    if (params.rating === 'dislike') this.store.put('copilot_manual_rating', id, intent);
    return this.feedbackSerial(id, async () => {
      const result = await this.writeRating(id, params.rating);
      if (this.store.get('copilot_manual_intent', id, {}).requestId === intent.requestId) this.store.put('copilot_manual_rating', id, intent);
      this.context.changed?.('社区评价已更新'); return result;
    });
  }
  private async writeRating(id: string, rating: CopilotRatingValue, current?: CopilotRating): Promise<CopilotRating> {
    current ??= await this.readRating(id);
    if (current.rating !== rating) await this.request('/copilot/rating', { id: Number(id), rating: { none: 'None', like: 'Like', dislike: 'Dislike' }[rating] });
    // Re-read real upstream counts; never manufacture statistics after a write.
    return current.rating === rating ? current : this.readRating(id);
  }
  /** Called only after the runtime has finalized confirmed per-entry evidence. */
  autoLikeConfirmed(runId: string, snapshot: { workspace?: CopilotWorkspace; feedbackSources?: FeedbackSource[] }, entries: CopilotRunEntry[]) {
    if (this.closing || snapshot.workspace?.options.autoLikeOnSuccess !== true) return;
    for (const source of snapshot.feedbackSources ?? []) {
      if (!entries.some(entry => entry.id === source.entryId && entry.versionId === source.versionId && entry.status === 'completed' && entry.verdict === 'success')) continue;
      const id = normalizeId(source.communityId);
      if (this.store.get('copilot_auto_rating', id)) continue;
      // Persist before networking. A timeout or restart cannot blindly re-post.
      this.store.put('copilot_auto_rating', id, { runId, entryId: source.entryId, status: 'pending', attemptedAt: now() });
      void this.feedbackSerial(id, async () => {
        try {
          if (this.store.get('copilot_manual_rating', id, {}).rating === 'dislike') {
            this.store.put('copilot_auto_rating', id, { runId, status: 'skipped', reason: 'manual-dislike' }); return;
          }
          const current = await this.readRating(id);
          // Manual intent can arrive while this GET is in flight.
          if (current.rating !== 'none' || this.store.get('copilot_manual_rating', id, {}).rating === 'dislike') {
            this.store.put('copilot_auto_rating', id, { runId, status: 'skipped', reason: 'existing-rating' }); return;
          }
          const result = await this.writeRating(id, 'like', current);
          if (result.rating !== 'like') throw new RpcError(-32010, '评价已提交，但社区尚未确认点赞结果；不会自动重试');
          this.store.put('copilot_auto_rating', id, { runId, status: 'completed', finishedAt: now() });
          this.context.changed?.(`作业 #${id} 通关已确认，已自动点赞`);
        } catch (cause) {
          this.store.put('copilot_auto_rating', id, { runId, status: this.closing ? 'unknown' : 'failed', error: message(cause) });
          if (!this.closing) this.context.changed?.(`作业 #${id} 自动点赞失败：${message(cause)}；通关结果保持不变，可在详情中手动重试`);
        }
      }).catch(() => {});
    }
  }
  beginClose() {
    this.closing = true;
    for (const controller of this.communityControllers) controller.abort();
  }
  async drainFeedback(maximumMs?: number) {
    const pending = Promise.allSettled([...this.feedbackTasks]);
    if (maximumMs === undefined) { await pending; return; }
    let timer: ReturnType<typeof setTimeout>;
    try { await Promise.race([pending, new Promise<void>(resolve => { timer = setTimeout(resolve, maximumMs); })]); }
    finally { clearTimeout(timer!); }
  }
  private async request(relative: string, body?: unknown, deadline = Infinity): Promise<any> {
    if (this.closing) throw new RpcError(-32011, '应用正在退出，社区请求已取消');
    const remaining = Math.min(12_000, deadline - Date.now());
    if (remaining <= 0) throw new RpcError(-32010, '作业集预览已达到 90 秒时限，请缩小作业集后重试');
    const controller = new AbortController(); let timeout: ReturnType<typeof setTimeout>;
    this.communityControllers.add(controller);
    let rejectAborted!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = () => reject(new Error(this.closing ? '应用退出，社区请求已取消' : '社区请求已取消')); });
    controller.signal.addEventListener('abort', rejectAborted, { once: true });
    const expired = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('社区请求超时')); }, remaining); });
    try {
      return await Promise.race([expired, aborted, (async () => {
        const response = await (this.context.http ?? fetch)(`https://prts.maa.plus${relative}`, { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), signal: controller.signal, redirect: 'error' });
        if (controller.signal.aborted) { await response.body?.cancel().catch(() => {}); throw new Error('社区请求已取消'); }
        if (!response.ok) throw new Error(`社区服务 HTTP ${response.status}`);
        if (Number(response.headers.get('content-length') || 0) > MAX_RESPONSE) throw new Error('社区响应超过允许大小');
        if (!response.body) throw new Error('社区服务返回空响应');
        const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
        try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > MAX_RESPONSE) throw new Error('社区响应超过允许大小'); chunks.push(part.value); } }
        finally { await reader.cancel().catch(() => {}); }
        let value: any; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('社区服务返回无效 JSON'); }
        if (!object(value) || value.status_code !== 200 || !Object.hasOwn(value, 'data')) throw new Error(`社区请求失败：${text(value?.message ?? value?.msg, 500) || '响应状态或结构异常'}`);
        return value.data;
      })()]);
    } catch (cause) { throw new RpcError(this.closing ? -32011 : -32010, this.closing ? '应用正在退出，社区请求已取消；已提交评价的结果可能未知，不会自动重放' : controller.signal.aborted ? '社区请求超时，请重试；本地作业仍可使用' : message(cause)); }
    finally { clearTimeout(timeout!); controller.signal.removeEventListener('abort', rejectAborted); this.communityControllers.delete(controller); }
  }
  private async communityEntry(id: string, setId?: string, deadline?: number): Promise<CopilotPreview['entries'][number]> {
    try {
      const data = await this.request(`/copilot/get/${normalizeId(id)}`, undefined, deadline);
      if (!object(data) || data.available === false || data.status === 'DELETED' || typeof data.content !== 'string') throw new Error('作业已删除、不可用或缺少完整内容');
      const source: CopilotSource = { kind: 'community', name: `PRTS Plus #${id}`, url: `https://prts.plus/copilot/${id}`, communityId: id, ...(setId ? { setId } : {}) };
      const entry = this.previewEntry(data.content, source, undefined, text(data.uploader, 300));
      return entry;
    } catch (cause) { return { id: identifier('entry'), record: null, error: `作业 #${id}：${message(cause)}`.slice(0, 1000) }; }
  }
  async search(input: RpcContract['params']['copilot.search']): Promise<CopilotSearchResult> {
    const params = validate(validators.validateCopilotSearchParams, input), page = params.page ?? 1;
    let data: any;
    if (params.target === 'set') data = await this.request('/set/query', { page, limit: 20, keyword: params.keyword ?? '' });
    else {
      const query = new URLSearchParams({ page: String(page), limit: '20', orderBy: 'upload_time', desc: 'true', document: params.keyword ?? '' });
      if (params.stage) {
        const stage = this.aliases().get(params.stage);
        if (!stage) fail('无法将关卡编号映射为社区内部标识，请先更新资源或直接搜索关键词');
        query.set('levelKeyword', stage!);
      }
      data = await this.request(`/copilot/query?${query}`);
    }
    if (!object(data) || !Array.isArray(data.data) || data.data.length > 20 || typeof data.has_next !== 'boolean' || !Number.isSafeInteger(data.total) || data.total < 0) throw new RpcError(-32010, '社区搜索分页结构异常');
    const items: CopilotSearchResult['items'] = data.data.map((entry: unknown) => {
      if (!object(entry)) return fail('社区搜索条目结构异常');
      const id = normalizeId(entry.id); let content: Record<string, any> = {};
      if (typeof entry.content === 'string' && Buffer.byteLength(entry.content) <= MAX_CONTENT) { try { const parsed = JSON.parse(entry.content); if (object(parsed)) content = parsed; } catch { /* A malformed summary cannot be imported; detail lookup reports its error. */ } }
      const doc = object(content.doc) ? content.doc : {};
      return { id, title: text(params.target === 'set' ? entry.name : doc.title || entry.title || `作业 #${id}`, 300), description: text(params.target === 'set' ? entry.description : doc.details, 3000), author: params.target === 'set' ? '' : contentAuthor(content), uploader: text(params.target === 'set' ? entry.creator ?? entry.uploader : entry.uploader ?? entry.creator, 300), url: `https://prts.plus/${params.target === 'set' ? 'set' : 'copilot'}/${id}`,
        ...(params.target === 'set' ? {} : { kind: content.type === 'SSS' ? 'SSSCopilot' : /^(?:mem_|mem-|paradox)/i.test(String(content.stage_name)) ? 'ParadoxCopilot' : 'Copilot' as CopilotKind }) };
    });
    // data.page is total pages for sets: preserve the requested page explicitly.
    return { items, page, hasNext: data.has_next, total: data.total };
  }
}
