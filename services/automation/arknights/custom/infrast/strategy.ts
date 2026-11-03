/** 常规单房自动名单：先观察有界候选，再按心情与已审阅简单技能选满实际容量，不提交进驻。 */
import { AtomicFailure, checkCancelled } from '#automation/core/errors';
import type { AtomicExecutionContext } from '#automation/core/types';
import type {
  AtomicOperatorCard,
  AtomicResourceProfile,
  AtomicRoomTarget,
  InfrastDriver,
  InfrastRoute,
  PrepareRosterInput,
  PreparedRosterEvidence,
} from './types';
import { InfrastRoster } from './roster';
import { capacityCeilings, parseTarget, validateRoomIdentity } from './validation';

/** 决策只依赖明确心情和简单技能；不解释上游公式或估计跨房组合收益。 */
export function chooseAutomaticOperators(
  cards: AtomicOperatorCard[],
  capacity: number,
  target: AtomicRoomTarget,
  profile: AtomicResourceProfile,
  options: { threshold: number; incumbentNames: string[]; excludedNames?: string[] },
): string[] {
  if (
    !Number.isInteger(capacity) ||
    capacity < 0 ||
    capacity > 5 ||
    !Number.isFinite(options.threshold) ||
    options.threshold < 0 ||
    options.threshold > 1 ||
    new Set(cards.map((card) => card.name)).size !== cards.length
  )
    throw new AtomicFailure('自动候选容量、阈值或唯一姓名无效，未修改名单');
  if (capacity === 0) return [];
  const skills = new Map(
    (profile.skills?.[target.facility] ?? []).map((skill) => [skill.id, skill]),
  );
  const candidates = cards.flatMap((card) => {
    if (
      card.nameVerified !== true ||
      options.excludedNames?.includes(card.name) ||
      !card.mood ||
      (!card.unassigned && !options.incumbentNames.includes(card.name))
    )
      return [];
    // 近似心情条留两参考像素的裕量；笑脸的满／空心情是独立分类证据。
    const margin = card.mood.source === 'progress_bar' ? 2 / 85 : 0;
    if (
      target.facility === 'Dorm'
        ? card.mood.ratio + margin > options.threshold
        : card.mood.ratio - margin < options.threshold
    )
      return [];
    let score = 0;
    if (!['Control', 'Dorm'].includes(target.facility)) {
      const recognized = (card.skills ?? [])
        .map((id) => skills.get(id))
        .filter((skill) => skill?.simple);
      if (!recognized.length) return [];
      // 只使用与产品无关的基础效率；产品专属技能和组合技能仍由明确计划承担。
      score = recognized.reduce(
        (sum, skill) => sum + (skill!.efficiency.all ?? skill!.efficiency.General ?? 0),
        0,
      );
      if (score <= 0) return [];
    }
    return [{ card, score }];
  });
  candidates.sort((a, b) =>
    target.facility === 'Dorm'
      ? a.card.mood!.ratio - b.card.mood!.ratio || a.card.name.localeCompare(b.card.name, 'zh-CN')
      : b.score - a.score ||
        b.card.mood!.ratio - a.card.mood!.ratio ||
        a.card.name.localeCompare(b.card.name, 'zh-CN'),
  );
  if (candidates.length < capacity)
    throw new AtomicFailure(
      `仅观察到 ${candidates.length}/${capacity} 位满足心情、归属与简单技能的候选，未修改名单`,
      'unavailable',
    );
  return candidates.slice(0, capacity).map(({ card }) => card.name);
}

/** 独立 L3 准备事件：修改前收齐本次房间证据和合格候选，最后以真实容量上界复核完整已选名单。 */
export async function prepareAutomaticRoster(
  driver: InfrastDriver,
  profile: AtomicResourceProfile,
  context: AtomicExecutionContext,
  input: {
    target: AtomicRoomTarget;
    route: InfrastRoute;
    threshold: number;
    excludedNames?: string[];
    requiredNames?: string[];
  },
): Promise<{
  prepared: PreparedRosterEvidence;
  request: PrepareRosterInput;
  candidatesObserved: number;
}> {
  const target = parseTarget(input.target);
  validateRoomIdentity(target);
  if (['Training', 'Processing', 'Recycle'].includes(target.facility))
    throw new AtomicFailure('该设施暂无常规自动技能策略，请使用明确名单', 'unavailable');
  driver.preflight?.(target);
  await driver.openRoom(target, input.route);
  await driver.openRoster(target);
  const roster = new InfrastRoster(driver, context);
  const before = await roster.roster(capacityCeilings[target.facility]);
  await driver.resetFilter();
  const cards = new Map<string, AtomicOperatorCard>(),
    pages = new Set<string>();
  // 只声明已观察候选范围；翻页未动只是扫描终止条件，不作为完整库或已选名单的证明。
  for (let page = 0; page < 100; page++) {
    checkCancelled(context);
    const observation = await driver.operators();
    if (JSON.stringify(observation.room) !== JSON.stringify(before.room))
      throw new AtomicFailure('扫描自动候选期间实际房间身份改变，未修改名单');
    for (const card of observation.cards) {
      const old = cards.get(card.name);
      if (old && old.selected !== card.selected)
        throw new AtomicFailure('扫描自动候选期间选中状态改变，未修改名单');
      cards.set(card.name, card);
    }
    if (pages.has(observation.pageIdentity)) break;
    pages.add(observation.pageIdentity);
    await driver.page('right');
  }
  const requiredNames = input.requiredNames ?? [];
  if (
    requiredNames.length > before.capacity ||
    new Set(requiredNames).size !== requiredNames.length ||
    requiredNames.some(
      (name) => input.excludedNames?.includes(name) || cards.get(name)?.nameVerified !== true,
    )
  )
    throw new AtomicFailure(
      '固定名单超出实际容量、跨房冲突或没有精确观察到全部姓名，未修改名单',
      'unavailable',
    );
  const operators = [
    ...requiredNames,
    ...chooseAutomaticOperators(
      [...cards.values()],
      before.capacity - requiredNames.length,
      target,
      profile,
      {
        threshold: input.threshold,
        incumbentNames: before.operators,
        excludedNames: [...(input.excludedNames ?? []), ...requiredNames],
      },
    ),
  ];
  const selectionAttempt = {};
  const selected = await roster.selectExact(
    operators,
    capacityCeilings[target.facility],
    selectionAttempt,
  );
  const request: PrepareRosterInput = { target, route: input.route, role: 'normal', operators };
  return {
    prepared: { target, route: input.route, role: 'normal', before, selected, selectionAttempt },
    request,
    candidatesObserved: cards.size,
  };
}
