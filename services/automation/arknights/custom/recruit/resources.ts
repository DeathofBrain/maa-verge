/** recruit 只登记经过审阅的单节点规则；不解释原 MAA 高层任务或 next 链。 */
import { createHash } from 'node:crypto';
import type { RecruitmentData } from './calculator';
import {
  loadReviewedResourceProfile,
  type ReviewedProfileOptions,
  type ReviewedRule,
  type ReviewedResourceProfile,
} from '#automation/resources/maacore-adapter';
import type { AtomicResourceSource } from '#automation/resources/source';

export type RecruitResourceProfile = ReviewedResourceProfile & { recruitment?: RecruitmentData };
export const recruitReviewedRules = [
  { id: 'start', node: 'StartRecruit' },
  { id: 'running', node: 'RecruitNow' },
  { id: 'confirm', node: 'RecruitConfirm' },
  { id: 'timer.buttons', node: 'RecruitTimerDecrement' },
  { id: 'timer.hour', node: 'RecruitTimerH' },
  { id: 'timer.minute', node: 'RecruitTimerM' },
  { id: 'refresh', node: 'RecruitRefresh' },
  { id: 'refresh.confirm', node: 'RecruitRefreshConfirm' },
  { id: 'no_permit', node: 'RecruitNoPermit' },
  { id: 'permits', node: 'RecruitPermitCount' },
  { id: 'no_refresh', node: 'RecruitNoRefresh' },
  { id: 'back', node: 'ReturnButton' },
  {
    id: 'home',
    node: 'Recruit',
  },
  {
    id: 'entry',
    node: 'RecruitDefault',
  },
  {
    id: 'page',
    node: 'RecruitFlag',
  },
  {
    id: 'finished',
    node: 'RecruitFinish',
  },
  {
    id: 'skip',
    node: 'RecruitSkip',
  },
  {
    id: 'result',
    node: 'GachaLastOnceResult',
  },
  {
    id: 'tags',
    node: 'RecruitTags',
  },
] as const satisfies readonly ReviewedRule[];

/** 宿主注入当前不可变资源代；缺失节点分别保留不可用诊断。 */
export async function loadRecruitResourceProfile(
  source: AtomicResourceSource | null,
  clientType = 'Official',
  options: ReviewedProfileOptions = {},
) {
  const profile: RecruitResourceProfile = await loadReviewedResourceProfile(
    source,
    'recruit',
    recruitReviewedRules,
    ['tasks/hotfix/ocr_replace.json', 'tasks/UiTheme/Recruit.json'],
    clientType,
    options,
  );
  if (!source || !['Official', 'Bilibili'].includes(clientType)) return profile;
  const bytes = await source.read('recruitment.json', 2 * 1024 * 1024);
  if (!bytes) {
    profile.diagnostics.push('缺少公招干员与标签数据');
    return profile;
  }
  try {
    const value = JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>;
    if (
      !Array.isArray(value.operators) ||
      !value.operators.length ||
      !value.tags ||
      typeof value.tags !== 'object'
    )
      throw new Error();
    const operators = value.operators as RecruitmentData['operators'];
    if (
      !operators.every(
        (op) =>
          typeof op.id === 'string' &&
          typeof op.name === 'string' &&
          Number.isInteger(op.rarity) &&
          op.rarity >= 1 &&
          op.rarity <= 6 &&
          Array.isArray(op.tags) &&
          op.tags.every((tag) => typeof tag === 'string'),
      )
    )
      throw new Error();
    // 上游 tags 可为展示名数组或 ID→展示名映射；候选词以干员数据实际标签全集为准。
    profile.recruitment = {
      operators: structuredClone(operators),
      tags: [...new Set(operators.flatMap((op) => op.tags))],
    };
    profile.sources.push({
      repository: profile.adapterBaseline.repository,
      ref: options.resourceVersion ?? 'local-immutable-resource',
      path: 'resource/recruitment.json',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  } catch {
    profile.diagnostics.push('公招数据格式无效，禁止新建招募');
  }
  return profile;
}
