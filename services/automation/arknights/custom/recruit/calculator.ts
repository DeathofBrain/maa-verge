/** 只依赖当前不可变 recruitment.json 的公招组合计算；不请求模型、不上传标签。 */
export type RecruitOperator = { id: string; name: string; rarity: number; tags: string[] };
export type RecruitmentData = { operators: RecruitOperator[]; tags: string[] };
export type RecruitmentCombination = {
  tags: string[];
  minimum: number;
  maximum: number;
  average: number;
  operators: { id: string; name: string; rarity: number }[];
};

/** 九小时排除一二星；没有高级资深标签时六星不进入候选，避免普通标签虚报六星。 */
export function calculateRecruitment(
  tags: readonly string[],
  data: RecruitmentData,
  minutes = 540,
): RecruitmentCombination[] {
  if (tags.length !== 5 || new Set(tags).size !== 5 || tags.some((tag) => !data.tags.includes(tag)))
    return [];
  const result: RecruitmentCombination[] = [];
  for (let mask = 1; mask < 1 << tags.length; mask++) {
    const selected = tags.filter((_tag, index) => mask & (1 << index));
    if (selected.length > 3) continue;
    const operators = data.operators.filter(
      (operator) =>
        (operator.rarity < 6 || selected.includes('高级资深干员')) &&
        (minutes < 540 || operator.rarity >= 3) &&
        selected.every((tag) => operator.tags.includes(tag)),
    );
    if (!operators.length) continue;
    const levels = operators.map((operator) => operator.rarity);
    result.push({
      tags: [...selected],
      minimum: Math.min(...levels),
      maximum: Math.max(...levels),
      average: levels.reduce((sum, level) => sum + level, 0) / levels.length,
      operators: operators.map(({ id, name, rarity }) => ({ id, name, rarity })),
    });
  }
  // 与原 MAA 优先级一致：保底、最高、平均星级，最后减少必要标签；同分保持输入顺序。
  return result.sort(
    (left, right) =>
      right.minimum - left.minimum ||
      right.maximum - left.maximum ||
      right.average - left.average ||
      left.tags.length - right.tags.length,
  );
}
