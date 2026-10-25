import type { CopilotRecord, RpcResult } from '@maaverge/contracts';

export type OperatorRequirement = CopilotRecord['operators'][number];
export type OperatorRoster = RpcResult<'recognition.get'>;
export type OperatorAssessment = { status: 'unknown' | 'owned' | 'missing' | 'insufficient'; label: string; detail: string; eligible: boolean };
const eliteNames = ['精零', '精一', '精二'];
const moduleNames = ['不使用模组', 'X模', 'Y模', 'A模', 'D模', 'B模'];
const numerals = ['零', '一', '二', '三'];
const numericRequirements = (requirements: OperatorRequirement['requirements']): Record<string, number> => {
  const result: Record<string, number> = Object.create(null);
  for (const [key, value] of Object.entries(requirements ?? {})) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const field = key === 'potentiality' ? 'potential' : key;
    // Keep the stricter requirement if an older file also declares the alias.
    result[field] = Math.max(result[field] ?? -Infinity, value);
  }
  return result;
};

/** MAA copilot requirements encode mastery as skill levels 8–10 and module type separately from module level. */
export function requirementLabels(requirements: OperatorRequirement['requirements']): string[] {
  return Object.entries(numericRequirements(requirements)).flatMap(([key, value]) => {
    if (value < 0) return [];
    switch (key) {
      case 'elite': return [eliteNames[value] ?? `精英化 ${value}`];
      case 'level': return [`等级 ${value}`];
      case 'skill_level': return [Number.isInteger(value) && value >= 8 && value <= 10 ? `专${numerals[value - 7]}` : `技能 ${value} 级`];
      case 'module': return [moduleNames[value] ?? `模组类型 ${value}`];
      case 'module_level': return [`模组 ${value} 级`];
      case 'potential': return [`潜能 ${value}`];
      default: return [`${key} ${value}`];
    }
  });
}

export function assessOperator(operator: OperatorRequirement, roster?: OperatorRoster, operatorId?: string | null): OperatorAssessment {
  const unknown = (detail: string): OperatorAssessment => ({ status: 'unknown', label: '未核验', detail, eligible: false });
  if (!roster?.collectedAt || !roster.operators.length) return unknown('尚无干员识别数据，请在工具箱执行干员识别');
  const matches = roster.operators.filter(item => operatorId ? item.id === operatorId : item.name === operator.name);
  if (matches.length !== 1) return unknown(matches.length ? '本地存在同名或多形态记录，持有与练度待核对' : '本地名单未识别到此干员，持有未核验；可重新执行干员识别');
  const local = matches[0];
  if (!local.own) return { status: 'missing', label: '未拥有', detail: '本地识别结果：未拥有', eligible: false };
  const requirements = numericRequirements(operator.requirements);
  const missing: string[] = [], unverified: string[] = [];
  const elite = requirements.elite;
  if (elite !== undefined && elite >= 0) {
    if (local.elite < 0) unverified.push('精英化');
    else if (local.elite < elite) missing.push(`${eliteNames[elite] ?? `精英化 ${elite}`}（本地${eliteNames[local.elite] ?? local.elite}）`);
  }
  if (requirements.level !== undefined && requirements.level >= 0 && !(elite !== undefined && elite >= 0 && local.elite > elite)) {
    // Promotion resets level: E2 Lv1 is beyond an E1 Lv80 requirement.
    if (local.level < 0 || elite !== undefined && elite >= 0 && local.elite < 0) unverified.push('等级');
    else if (local.level < requirements.level) missing.push(`等级 ${requirements.level}（本地 ${local.level}）`);
  }
  if (requirements.potential !== undefined && requirements.potential >= 1) {
    if (local.potential < 1) unverified.push('潜能');
    else if (local.potential < requirements.potential) missing.push(`潜能 ${requirements.potential}（本地 ${local.potential}）`);
  }
  for (const [key, value] of Object.entries(requirements)) {
    if (value < 0 || ['elite', 'level', 'potential'].includes(key)) continue;
    unverified.push(key === 'skill_level' ? '技能／专精' : ['module', 'module_level'].includes(key) ? '模组' : key);
  }
  const unchecked = unverified.length ? `；${[...new Set(unverified)].join('、')}未核验` : '';
  return missing.length
    ? { status: 'insufficient', label: '缺少练度', detail: `缺少练度：${missing.join('；')}${unchecked}`, eligible: false }
    : { status: 'owned', label: unverified.length ? '已拥有 · 待核验' : '已拥有', detail: `已拥有${unchecked}`, eligible: !unverified.length };
}
