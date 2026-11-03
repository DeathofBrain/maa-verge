/** fight 只登记经过审阅的单节点规则；不解释原 MAA 高层任务或 next 链。 */
import { createHash } from 'node:crypto';
import {
  loadReviewedResourceProfile,
  type ReviewedProfileOptions,
  type ReviewedRule,
  type ReviewedResourceProfile,
  resolveReviewedTemplateId,
} from '#automation/resources/maacore-adapter';
import type { AtomicResourceSource } from '#automation/resources/source';
import type { AtomicBox } from '#automation/core/types';

export const fightDropTypes = [
  'ExpAndLMB',
  'Normal',
  'Extra',
  'Furniture',
  'Special',
  'Sanity',
  'Reward',
] as const;

export const fightReviewedRules = [
  { id: 'navigation.home', node: 'Home' },
  { id: 'navigation.terminal', node: 'TerminalDefault' },
  { id: 'navigation.theme', node: 'StageTheme' },
  { id: 'navigation.resource', node: 'StageResource' },
  { id: 'navigation.back', node: 'ReturnButton' },
  { id: 'navigation.chapter', node: 'ClickChapterNew' },
  { id: 'navigation.chapter_overview', node: 'ClickChapterNewOverview' },
  { id: 'navigation.open_time', node: 'ClickChapterNewOpenTime' },
  { id: 'navigation.default_progress', node: 'ClickChapterNewDefaultProgress' },
  { id: 'navigation.enter_episode', node: 'EnterEpisodeNew-Click' },
  { id: 'navigation.names', node: 'ClickStageName' },
  { id: 'navigation.selected', node: 'ClickedCorrectStage' },
  ...Array.from({ length: 18 }, (_, chapter) => ({
    id: `navigation.episode.${chapter}`,
    node: 'EnterEpisodeNew',
    template: `${String(chapter).padStart(2, '0')}@EnterEpisodeNew.png`,
  })),
  ...['CE', 'LS', 'CA', 'AP', 'SK', 'PR-A', 'PR-B', 'PR-C', 'PR-D'].map((supply) => ({
    id: `navigation.supply.${supply}`,
    node: 'StageEntries',
    template: `Stage${supply}.png`,
  })),
  {
    id: 'stage',
    node: 'StartButton1',
  },
  {
    id: 'agent',
    node: 'UsePrts',
  },
  {
    id: 'agent.active',
    node: 'UsePrtsSuccessCheck',
  },
  {
    id: 'confirm',
    node: 'StartButton2',
  },
  {
    id: 'running',
    node: 'BattleOfficiallyBegin',
  },
  {
    id: 'result',
    node: 'EndOfAction',
  },
  {
    id: 'failed',
    node: 'FightMissionFailed',
  },
  {
    id: 'medicine',
    node: 'UseMedicine',
  },
  { id: 'medicine.confirm', node: 'MedicineConfirm' },
  { id: 'medicine.selected', node: 'MedicineReduceIcon' },
  {
    id: 'medicine.count',
    node: 'UsingMedicineCount',
    roi: [0, 0, 1280, 720],
    expectedMove: [-95, 28, 105, 60],
  },
  {
    id: 'stone',
    node: 'UseStone',
  },
  { id: 'stone.confirm', node: 'StoneConfirm' },
  { id: 'sanity', node: 'SanityMatch' },
  {
    id: 'series',
    node: 'FightSeries-Icon',
    ocrRegionOnly: true,
  },
  { id: 'series.list', node: 'FightSeries-List-Multiply' },
  { id: 'series.opened', node: 'FightSeries-Opened' },
  { id: 'series.number', node: 'NumberOcrReplace', roi: [0, 0, 1280, 720] },
  { id: 'drops.quantity', node: 'NumberOcrReplace', roi: [0, 0, 1280, 720] },
  { id: 'result.times', node: 'StageDrops-TimesRec' },
  ...fightDropTypes.map((type) => ({
    id: `drops.type.${type}`,
    node: `StageDrops-DropType-${type}`,
    roi: [0, 0, 1280, 720] as AtomicBox,
  })),
  {
    id: 'dismiss',
    node: 'ClickCorner',
    actionOnly: true,
  },
] as const satisfies readonly ReviewedRule[];

/** 宿主注入当前不可变资源代；缺失节点分别保留不可用诊断。 */
export type FightResourceProfile = ReviewedResourceProfile & {
  dropLayout?: {
    roi: AtomicBox;
    range: [number, number];
    minWidth: number;
    maxSpacing: number;
    itemOffset: AtomicBox;
    quantityOffset: AtomicBox;
    items: Record<string, string>;
    threshold: number;
  };
};

/** 目标材料和基线布局在任何输入之前验明；不以执行时缺资源充当成功空掉落。 */
export function checkFightInputs(profile: ReviewedResourceProfile, input: Record<string, unknown>) {
  const errors: string[] = [];
  const targets = Object.keys((input.drops ?? {}) as Record<string, unknown>);
  const fight = profile as FightResourceProfile;
  if (targets.length && !fight.dropLayout) errors.push('当前资源缺少已审阅掉落基线和数量布局');
  for (const id of targets)
    if (!fight.dropLayout || !Object.hasOwn(fight.dropLayout.items, id))
      errors.push(`当前资源缺少目标材料模板：${id}`);
  if (
    Number(input.series ?? 1) > 1 &&
    (!profile.rules['series.opened'] ||
      !profile.rules['series.list'] ||
      !profile.rules['series.number'])
  )
    errors.push('当前资源缺少连战倍率列表证据');
  return errors;
}

export async function loadFightResourceProfile(
  source: AtomicResourceSource | null,
  clientType = 'Official',
  options: ReviewedProfileOptions = {},
): Promise<FightResourceProfile> {
  const profile: FightResourceProfile = await loadReviewedResourceProfile(
    source,
    'fight',
    fightReviewedRules,
    ['tasks/hotfix/ocr_replace.json', 'tasks/UiTheme/Terminal.json'],
    clientType,
    options,
  );
  if (!source || !['Official', 'Bilibili'].includes(clientType)) return profile;
  // 这里只读取明确节点的数据；上游 next/sub 从未进入执行图。
  const bytes =
    (await source.read('tasks/tasks.json', 8 * 1024 * 1024)) ??
    (await source.read('tasks.json', 8 * 1024 * 1024));
  let nodes: Record<string, Record<string, unknown>>;
  try {
    nodes = JSON.parse(Buffer.from(bytes ?? []).toString('utf8'));
  } catch {
    return profile;
  }
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const templates = new Set(options.availableTemplates ?? (await source.listTemplates()).ids);
  const opened = nodes['FightSeries-Opened'];
  const indicator = resolveReviewedTemplateId(templates, 'FightSeries-Indicator.png');
  // v6.20.0 Matcher::preproc_and_match 对 RGBCount 的得分为 Ccoeff×F1。
  // 仅完整灰度范围[0,255]使图与模板全部激活、F1恒为1；此精确分支才等价Ccoeff。
  if (
    opened &&
    indicator &&
    profile.sources[0] &&
    opened.method === 'RGBCount' &&
    opened.template === 'FightSeries-Indicator.png' &&
    opened.baseTask === undefined &&
    (opened.pureColor === undefined || opened.pureColor === false) &&
    same(opened.colorScales, [[0, 255]]) &&
    same(opened.roi, [900, 370, 70, 40]) &&
    opened.maskRange === undefined &&
    opened.specialParams === undefined &&
    opened.algorithm === undefined &&
    opened.replaceFull === undefined &&
    opened.templThreshold === undefined &&
    opened.colorWithClose === undefined
  ) {
    profile.rules['series.opened'] = {
      id: 'series.opened',
      kind: 'template',
      templateId: indicator,
      roi: [900, 370, 70, 40],
      method: 5,
      threshold: 0.8,
      source: { ...profile.sources[0]!, node: 'FightSeries-Opened' },
    };
    profile.alternatives['series.opened'] = ['series.opened'];
    // 通用适配器的特殊算法诊断由上述完整证明替代，其他诊断继续保留。
    profile.diagnostics = profile.diagnostics.filter(
      (value) => value !== '规则 FightSeries-Opened 的算法需要独立适配',
    );
  } else profile.diagnostics.push('FightSeries-Opened 的完整灰度等价分支不成立');
  const baseline = nodes['StageDrops-BaseLine'],
    item = nodes['StageDrops-Item'],
    quantity = nodes['StageDrops-Quantity'];
  if (
    baseline &&
    item &&
    quantity &&
    same(baseline.roi, [0, 636, 1280, 2]) &&
    same(baseline.specialParams, [100]) &&
    baseline.templThreshold === 17 &&
    same(baseline.colorScales, [[30, 255]]) &&
    same(item.rectMove, [0, -130, 138, 130]) &&
    item.templThreshold === 0.65 &&
    same(item.maskRange, [1, 255]) &&
    same(quantity.roi, [62, 90, 43, 22]) &&
    quantity.templThreshold === 3 &&
    same(quantity.colorScales, [[110, 255]]) &&
    [baseline, item, quantity].every(
      (node) =>
        node.method === undefined && node.baseTask === undefined && node.algorithm === undefined,
    ) &&
    fightDropTypes.every((type) => same(nodes[`StageDrops-DropType-${type}`]?.roi, [0, 2, 0, 25]))
  ) {
    const indexBytes = await source.read('item_index.json', 8 * 1024 * 1024);
    try {
      const index: unknown = JSON.parse(Buffer.from(indexBytes ?? []).toString('utf8'));
      if (index && typeof index === 'object' && !Array.isArray(index)) {
        profile.sources.push({
          repository: profile.adapterBaseline.repository,
          ref: options.resourceVersion ?? 'local-immutable-resource',
          path: 'resource/item_index.json',
          sha256: createHash('sha256').update(indexBytes!).digest('hex'),
        });
        const items: Record<string, string> = Object.create(null);
        for (const id of Object.keys(index)) {
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) continue;
          const template = resolveReviewedTemplateId(templates, `items/${id}.png`);
          if (template) items[id] = template;
        }
        profile.dropLayout = {
          roi: [0, 636, 1280, 2],
          range: [30, 255],
          minWidth: 100,
          maxSpacing: 17,
          itemOffset: [0, -130, 138, 130],
          quantityOffset: [62, 90, 43, 22],
          items,
          threshold: 0.65,
        };
      }
    } catch {
      profile.diagnostics.push('掉落材料索引不可读');
    }
  } else profile.diagnostics.push('StageDrops 基线或数量布局已经变化，未启用掉落目标');
  return profile;
}
