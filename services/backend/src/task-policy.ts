import type { Plan, Settings, Task } from './models';
import { RpcError } from './errors';
import { casefold } from './casefold';
import { isWireFloat, parseWireJson, stringifyWireJson, wireNumberToken } from './wire-json';
const CLIENTS = new Set(['', 'Official', 'Bilibili', 'txwy', 'YoStarEN', 'YoStarJP', 'YoStarKR']);
const FACILITIES = new Set(['Mfg', 'Trade', 'Power', 'Control', 'Reception', 'Office', 'Recycle', 'Dorm', 'Processing', 'Training', 'AssistantChange']);
const DRONES = new Set(['_NotUse', 'Money', 'SyntheticJade', 'CombatRecord', 'PureGold', 'OriginStone', 'Chip']);
const COMMANDS = new Set(['shell', 'command', 'script', 'adb']);
const BOOLEANS = new Set('enable start_game_enabled refresh set_time expedite skip_robot report_to_penguin report_to_yituliu DrGrandet replenish dorm_notstationed_enabled dorm_trust_enabled fiammetta_recovery_enabled use_pinus_sylvestris use_perception_information use_worldly_plight use_abyssal_hunter reception_message_board reception_clue_exchange reception_send_clue continue_training visit_friends shopping force_shopping_if_credit_full only_buy_discount reserve_max_credit credit_fight award mail recruit orundum mining specialaccess signinevent formation use_sanity_potion add_trust ignore_requirements clear_store'.split(' '));
const STRING_LISTS = new Set('first_tags preserve_tags buy_first blacklist fiammetta_targets themes task_names tools_to_craft'.split(' '));
function reject(message: string): never { throw new RpcError(-32010, message); }
function integer(value: any, name: string, minimum = 0, maximum = 2147483647): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) reject(`${name} 必须是 ${minimum} 到 ${maximum} 之间的整数`);
  return value;
}
function string(value: any, name: string, nonempty = false): string {
  if (typeof value !== 'string' || value.includes('\0') || [...value].length > 4096) reject(`${name} 必须是有效文本`);
  // Python str.strip also considers the ASCII information separators whitespace,
  // while it does not strip ECMAScript's BOM character.
  if (nonempty && !value.replace(/^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu, '')) reject(`${name} 不可为空`);
  return value;
}
function enumeration(value: any, name: string, choices: Set<string>): string { const text = string(value, name); if (!choices.has(text)) reject(`${name}无效`); return text; }
function object(value: any): value is Record<string, any> { return value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
const has = (value: object, key: string) => Object.hasOwn(value, key);
// dict.get substitutes a default only for an absent key, never an explicit null.
const get = (value: Record<string, any>, key: string, fallback: any) => has(value, key) ? value[key] : fallback;
const integerInput = (value: any, key: string | number, fallback?: any) => isWireFloat(value, key) ? NaN : has(value, String(key)) ? value[key] : fallback;
function spacedJson(value: any, container?: object, key?: string | number): string {
  if (Array.isArray(value)) return '[' + value.map((item, index) => spacedJson(item, value, index)).join(', ') + ']';
  if (object(value)) return '{' + Object.entries(value).map(([k, v]) => JSON.stringify(k) + ': ' + spacedJson(v, value, k)).join(', ') + '}';
  // Python emits small fractional numbers in exponent form and pads one-digit
  // exponents. Preserve its byte bound for the JSON numbers our transport parses.
  if (typeof value === 'number') {
    const token = wireNumberToken(container, key);
    if (token && !token.float) return token.source === '-0' ? '0' : token.source;
    if (token?.float) {
      if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0';
      const magnitude = Math.abs(value);
      const text = magnitude < 0.0001 || magnitude >= 1e16 ? value.toExponential() : String(value);
      return (Number.isInteger(value) && magnitude >= 0.0001 && magnitude < 1e16 ? text + '.0' : text).replace(/e([+-])(\d)$/, 'e$10$2');
    }
    const text = value !== 0 && !Number.isInteger(value) && Math.abs(value) < 0.0001 ? value.toExponential() : JSON.stringify(value);
    return text.replace(/e([+-])(\d)$/, 'e$10$2');
  }
  return JSON.stringify(value);
}
function jsonTree(value: any, depth = 0): void {
  if (depth > 32) reject('任务参数嵌套过深');
  if (object(value)) {
    if (Object.getOwnPropertySymbols(value).length) reject('任务参数键必须是文本');
    for (const [key, item] of Object.entries(value)) { if (COMMANDS.has(casefold(key))) reject('任务不得包含任意命令'); jsonTree(key, depth + 1); jsonTree(item, depth + 1); }
  }
  else if (Array.isArray(value)) for (const item of value) jsonTree(item, depth + 1);
  else if (typeof value === 'number' && !Number.isFinite(value)) reject('任务参数不得包含非有限数值');
  else if (typeof value === 'string' && /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) reject('任务参数包含无效 Unicode 文本');
  else if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) reject('任务参数必须是 JSON 数据');
}
function filenames(p: any, listKey?: string, strings = false): void {
  if ('filename' in p) { string(p.filename, '文件路径', true); return; }
  const entries = listKey ? p[listKey] : undefined;
  if (!Array.isArray(entries) || !entries.length) reject('请选择本地文件，或填写非空作业列表');
  if (strings && !(entries.every(x => typeof x === 'string') || entries.every(object))) reject('悖论作业列表必须全部是文件路径，或全部是带整数 ID 的对象');
  for (const entry of entries) {
    if (strings && typeof entry === 'string') string(entry, '作业文件路径', true);
    else if (object(entry)) {
      string(entry.filename, '作业文件路径', true);
      if (strings || 'id' in entry) integer(integerInput(entry, 'id'), '作业 ID', -2147483648);
      if ('is_raid' in entry && typeof entry.is_raid !== 'boolean') reject('作业突袭选项必须是布尔值');
      if (entry.nav_name_override != null) string(entry.nav_name_override, '作业导航关卡');
    } else reject('作业列表格式无效');
  }
}
export function validateTask(task: Task): void {
  const p: any = task.params;
  jsonTree(p);
  // Python json.dumps includes a space after commas/colons; preserve its size bound.
  if (Buffer.byteLength(spacedJson(p)) > 512 * 1024) reject('单项任务参数不得超过 512 KiB');
  for (const key of BOOLEANS) if (key in p && typeof p[key] !== 'boolean') reject(`${key} 必须是布尔值`);
  for (const key of STRING_LISTS) if (key in p) { if (!Array.isArray(p[key]) || !p[key].every((v: any) => typeof v === 'string')) reject(`${key} 必须是文本数组`); for (const value of p[key]) string(value, key); }
  if ('client_type' in p) enumeration(p.client_type, '客户端渠道', CLIENTS);
  if ('server' in p) enumeration(p.server, '服务器参数', new Set(['CN', 'US', 'JP', 'KR']));
  if (!task.enabled || p.enable === false) return;
  switch (task.type) {
    case 'Fight':
      integer(integerInput(p, 'times', 1), '作战次数', 1); string(get(p, 'stage', ''), '关卡'); integer(integerInput(p, 'series', 1), '代理倍率', -1, 10);
      if ('drops' in p) { if (!object(p.drops)) reject('掉落目标必须是物品 ID 到数量的对象'); for (const item of Object.keys(p.drops)) { string(item, '掉落物品 ID', true); integer(integerInput(p.drops, item), '掉落数量', 1); } }
      break;
    case 'Recruit':
      integer(integerInput(p, 'times', 0), '招募次数');
      for (const key of ['select', 'confirm']) if (key in p) { if (!Array.isArray(p[key])) reject(`${key} 必须是星级数组`); for (let index = 0; index < p[key].length; index++) integer(integerInput(p[key], index), '招募星级', 1, 6); }
      integer(integerInput(p, 'extra_tags_mode', 0), '额外标签模式', 0, 2);
      if ('recruitment_time' in p) { if (!object(p.recruitment_time)) reject('招募时限必须是对象'); for (const level of Object.keys(p.recruitment_time)) { if (!['3', '4', '5', '6'].includes(level)) reject('招募时限星级必须在 3 到 6 之间'); integer(integerInput(p.recruitment_time, level), '招募时限（分钟）', 60, 540); } }
      break;
    case 'Infrast': {
      const mode = integer(integerInput(p, 'mode', 0), '基建模式'); if (![0, 10000, 20000].includes(mode)) reject('基建模式无效');
      if ('facility' in p && (!Array.isArray(p.facility) || !p.facility.every((v: any) => FACILITIES.has(v)))) reject('基建设施无效');
      enumeration(get(p, 'drones', '_NotUse'), '无人机用途', DRONES);
      const threshold = get(p, 'threshold', 0.3); if (typeof threshold !== 'number' || !(threshold >= 0 && threshold <= 1)) reject('心情阈值必须是 0 到 1 之间的数值');
      if (mode === 10000) { filenames(p); integer(integerInput(p, 'plan_index'), '排班方案序号'); } break;
    }
    case 'SwitchTheme': if (!('themes' in p)) reject('请选择候选游戏主题'); break;
    case 'Roguelike': enumeration(get(p, 'theme', 'Phantom'), '集成战略主题', new Set(['Phantom', 'Mizuki', 'Sami', 'Sarkaz', 'JieGarden', 'BlackFlow'])); if (![0, 1, 4, 5, 6, 7, 10001, 20001, 30001, 30003].includes(integer(integerInput(p, 'mode', 0), '集成战略模式'))) reject('集成战略模式无效或已被上游移除'); break;
    case 'Copilot': case 'ParadoxCopilot': case 'SSSCopilot': case 'VideoRecognition': filenames(p, task.type === 'Copilot' ? 'copilot_list' : task.type === 'ParadoxCopilot' ? 'list' : undefined, task.type === 'ParadoxCopilot'); if ('loop_times' in p) integer(integerInput(p, 'loop_times'), '循环次数', 1); break;
    case 'Reclamation': { const theme = enumeration(get(p, 'theme', 'Tales'), '生息演算主题', new Set(['Tales', 'RelaunchAnchor'])); const mode = integer(integerInput(p, 'mode', 0), '生息演算模式'); if (!(theme === 'Tales' ? [0, 1] : [16, 32, 48]).includes(mode)) reject('生息演算主题与模式组合无效'); break; }
    case 'Custom': if (!Array.isArray(p.task_names) || !p.task_names.length) reject('自定义任务需要非空 task_names 数组'); for (const name of p.task_names) if (name !== 'MiniGame@PixelPaint@Begin' && !/^MiniGame@SecretFront@Begin@Ending[A-E](?:@[^@\x00]{1,80})?(?![\s\S])/u.test(name)) reject('此自定义任务链尚未通过消耗策略审核，请使用对应的标准任务'); break;
    case 'SingleStep':
      enumeration(p.type, '单步任务类型', new Set(['copilot'])); enumeration(p.subtype, '单步任务子类型', new Set(['stage', 'start', 'action']));
      if (!object(get(p, 'details', {}))) reject('单步任务 details 必须是对象');
      if (p.subtype === 'stage') string(p.details?.stage_name, '单步任务关卡', true);
      if (p.subtype === 'action' && (!Array.isArray(p.details?.actions) || !p.details.actions.length || !p.details.actions.every(object))) reject('当前核心要求 details.actions 为非空操作数组'); break;
    case 'OperProgress':
      if (!Array.isArray(p.plans)) reject('干员养成需要 plans 数组');
      for (const plan of p.plans) { if (!object(plan)) reject('干员养成条目必须是对象'); string(plan.name, '干员名称', true); if ('elite' in plan) integer(integerInput(plan, 'elite'), '精英化等级', 1, 2); if ('skill_level' in plan) integer(integerInput(plan, 'skill_level'), '技能等级', 2, 7); if ('skill_mastery' in plan) { if (!Array.isArray(plan.skill_mastery) || plan.skill_mastery.length !== 3) reject('技能专精需要三个等级'); for (let index = 0; index < plan.skill_mastery.length; index++) integer(integerInput(plan.skill_mastery, index), '专精等级', 0, 3); } } break;
  }
  if ('formation_index' in p) integer(integerInput(p, 'formation_index'), '编队栏位', 0, 4);
}
export function validatePlan(plan: Plan, settings: Settings): void {
  const budgets = plan.budgets ?? settings.budgets;
  if (plan.budgets) for (const key of ['originium', 'medicine', 'expedited'] as const) if (plan.budgets[key] > settings.budgets[key]) throw new RpcError(-32010, '任务表消耗上限超出应用已授权额度', { budget: key, limit: plan.budgets[key] });
  const totals = { originium: 0, medicine: 0, expedited: 0 };
  for (const task of plan.tasks) {
    validateTask(task); const p: any = task.params; if (!task.enabled || p.enable === false) continue;
    totals.originium += integer(integerInput(p, 'stone', 0), '消耗额度'); totals.medicine += integer(integerInput(p, 'medicine', 0), '消耗额度');
    for (const key of ['expiring_medicine', 'medicine_expire_days']) if (integer(integerInput(p, key, 0), '临期理智药设置')) reject('当前核心的临期理智药不受数量限制，暂不能在有限预算下启用');
    if (p.use_sanity_potion) reject('当前核心的作业理智药不受数量限制，暂不能在有限预算下启用');
    integer(integerInput(p, 'expedite_times', 0), '加急额度'); if (p.expedite) reject('当前核心不执行加急次数上限，暂不能在有限预算下启用加急');
  }
  for (const key of ['originium', 'medicine', 'expedited'] as const) if (totals[key] > budgets[key]) throw new RpcError(-32010, '计划消耗超出已授权额度', { budget: key, requested: totals[key] });
}
export function nativeTask(task: Task): Task {
  const result = parseWireJson(stringifyWireJson(task)), p: any = result.params;
  const defaults = (values: Record<string, any>) => { for (const [key, value] of Object.entries(values)) if (!(key in p)) p[key] = value; };
  if (['StartUp', 'CloseDown'].includes(task.type)) defaults({ client_type: 'Official' });
  if (task.type === 'StartUp') defaults({ start_game_enabled: true });
  if (task.type === 'Fight') defaults({ medicine: 0, stone: 0, expiring_medicine: 0, medicine_expire_days: 0, times: 1 });
  if (['Fight', 'Recruit', 'Roguelike'].includes(task.type)) defaults({ report_to_penguin: false, report_to_yituliu: false });
  if (task.type === 'Recruit') defaults({ expedite: false, expedite_times: 0, select: [3, 4, 5], confirm: [3, 4] });
  if (task.type === 'Infrast') defaults({ facility: ['Mfg', 'Trade', 'Power', 'Control', 'Reception', 'Office', 'Dorm'], drones: '_NotUse', threshold: 0.3 });
  if (task.type === 'Copilot') defaults({ use_sanity_potion: false });
  return result;
}
