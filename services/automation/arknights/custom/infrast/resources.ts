/** 读取不可变 MaaCore 资源并生成基建语义配置；宿主负责文件边界，本模块不执行上游任务图。 */
import { createHash } from 'node:crypto';
import { atomicFacilities, type AtomicResourceProfile } from './types';
import type { AtomicRule } from '#automation/resources/types';
import type { AtomicBox } from '#automation/core/types';
import type { AtomicResourceSource } from '#automation/resources/source';
import { resolveReviewedTemplateId } from '#automation/resources/maacore-adapter';

// 固定审阅基线描述适配依据；本次实际资源版本及文件摘要在加载时独立记录。
const repository = 'https://github.com/MaaAssistantArknights/MaaAssistantArknights';
const ref = 'v6.20.0';
// 解析前只承认普通对象、整数矩形及字符串列表，后续分支再核对各算法专用字段。
type Node = Record<string, unknown>;
const object = (value: unknown): value is Node =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const rect = (value: unknown): value is AtomicBox =>
  Array.isArray(value) && value.length === 4 && value.every(Number.isInteger);
const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? value
      : [];
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** source 只读当前资源代际；输出规则、来源摘要和不可用诊断，缺失或不支持时不猜测参数。 */
export async function loadAtomicResourceProfile(
  source: AtomicResourceSource | null,
  clientType = 'Official',
  options: { availableTemplates?: readonly string[]; resourceVersion?: string } = {},
): Promise<AtomicResourceProfile> {
  // 默认不可用，按实际读取的规则、卡片参数和动作入口逐步建立能力证据。
  const profile: AtomicResourceProfile = {
    id: `maacore-${ref}-infrast-cn:${options.resourceVersion ?? ''}`,
    adapterBaseline: { repository, ref, commit: '71bce1cc85bce55d3b20e19066b2dd33252072fc' },
    ...(options.resourceVersion ? { resourceVersion: options.resourceVersion } : {}),
    clientType,
    available: false,
    diagnostics: [],
    rules: {},
    card: null,
    actions: {},
    sources: [],
  };
  // 客户端语义适配和目录可读性是前置门槛；失败仍返回带原因的不可用配置。
  if (!['Official', 'Bilibili'].includes(clientType)) {
    profile.diagnostics.push('当前基建语义适配仅核对了简体中文客户端资源；此客户端尚未适配');
    return profile;
  }
  if (!source) {
    profile.diagnostics.push('当前不可变资源目录不可读');
    return profile;
  }
  // 姓名必须与当前实际资源同代，不能用另一份下载或其他语言的表补齐 OCR。
  const dictionaryBytes = await source.read('battle_data.json', 4 * 1024 * 1024);
  if (dictionaryBytes) {
    try {
      const data: unknown = JSON.parse(Buffer.from(dictionaryBytes).toString('utf8'));
      if (!object(data) || !object(data.chars)) throw new Error();
      const entries = Object.entries(data.chars).filter(([id]) => /^char_[A-Za-z0-9_]+$/.test(id));
      if (
        entries.length === 0 ||
        entries.length > 5000 ||
        entries.some(
          ([, value]) =>
            !object(value) ||
            typeof value.name !== 'string' ||
            !value.name.trim() ||
            value.name.length > 100,
        )
      )
        throw new Error();
      const names = [...new Set(entries.map(([, value]) => (value as Node).name as string))];
      const dictionarySource = {
        repository,
        ref: options.resourceVersion ?? 'local-immutable-resource',
        path: 'resource/battle_data.json',
        sha256: hash(dictionaryBytes),
      };
      profile.operatorNames = { names, source: dictionarySource };
      profile.sources.push(dictionarySource);
    } catch {
      profile.diagnostics.push('同代 battle_data.json 官方干员姓名表无效，禁用姓名相关能力');
    }
  } else profile.diagnostics.push('缺少同代 battle_data.json 官方干员姓名表，禁用姓名相关能力');
  // 先选择一种受支持的主任务文件，并为每个节点记录真实来源与摘要。
  let nodes: Record<string, Node> = {},
    filename = '';
  const locations = new Map<string, { path: string; sha256: string }>();
  for (const candidate of ['tasks/tasks.json', 'tasks.json']) {
    const bytes = await source.read(candidate, 8 * 1024 * 1024);
    if (!bytes) continue;
    try {
      const parsed: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
      if (!object(parsed) || !Object.values(parsed).every(object)) throw new Error();
      nodes = parsed as Record<string, Node>;
      filename = candidate;
      profile.sources.push({
        repository,
        ref: options.resourceVersion ?? 'local-immutable-resource',
        path: `resource/${candidate}`,
        sha256: hash(bytes),
      });
      for (const name of Object.keys(nodes))
        locations.set(name, { path: `resource/${candidate}`, sha256: hash(bytes) });
      break;
    } catch {
      profile.diagnostics.push(`无法解析基建资源 ${candidate}`);
    }
  }
  if (!filename) {
    profile.diagnostics.push('缺少受支持的 MaaCore 基建任务资源');
    return profile;
  }
  // 仅叠加明确登记的编队与 OCR 纠错文件，不递归加载上游任务目录。
  for (const candidate of ['tasks/Copilot/formation.json', 'tasks/hotfix/ocr_replace.json']) {
    const bytes = await source.read(candidate, 4 * 1024 * 1024);
    if (!bytes) continue;
    try {
      const parsed: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
      if (!object(parsed) || !Object.values(parsed).every(object)) throw new Error();
      const location = { path: `resource/${candidate}`, sha256: hash(bytes) };
      profile.sources.push({
        repository,
        ref: options.resourceVersion ?? 'local-immutable-resource',
        ...location,
      });
      // 后读的已登记文件覆盖同名规则，同时更新来源位置，便于定位热修复的实际内容。
      for (const [name, node] of Object.entries(parsed)) {
        nodes[name] = node as Node;
        locations.set(name, location);
      }
    } catch {
      profile.diagnostics.push(`无法解析已登记资源 ${candidate}`);
    }
  }
  // 活跃视图提供的模板集合优先；未提供时才通过宿主枚举，保留不完整诊断。
  const available = new Set(options.availableTemplates);
  if (!options.availableTemplates) {
    const templates = await source.listTemplates();
    for (const id of templates.ids) available.add(id);
    if (!templates.complete) profile.diagnostics.push('部分模板目录不可读或不符合普通文件限制');
  }
  // 仅解析有限深度的显式继承，循环或缺失节点不提供可用规则。
  const resolve = (name: string, seen = new Set<string>()): Node | undefined => {
    const node = nodes[name];
    if (!node || seen.has(name) || seen.size > 16) return;
    seen.add(name);
    if (node.baseTask === '#none' || node.baseTask === undefined) return { ...node };
    if (typeof node.baseTask !== 'string') return;
    const base = resolve(node.baseTask, seen);
    if (!base) return;
    // 只合并已审阅节点需要的 baseTask，不展开 @/# 表达式。
    const merged = { ...base, ...node };
    if (
      !('template' in node) &&
      merged.algorithm !== 'OcrDetect' &&
      merged.algorithm !== 'JustReturn'
    )
      merged.template = `${name}.png`;
    return merged;
  };
  // 来源既保留审阅仓库，也保留当前不可变资源版本和实际文件摘要。
  const provenance = (name: string) => ({
    repository,
    ref: options.resourceVersion ?? 'local-immutable-resource',
    ...locations.get(name),
    path: locations.get(name)?.path ?? `resource/${filename}`,
    node: name,
  });
  // 将已支持的 OCR、模板或纯色参数转为显式规则；未知算法和字段组合保留诊断。
  const add = (id: string, name: string, override: Partial<AtomicRule> = {}) => {
    const node = resolve(name);
    if (!node) {
      profile.diagnostics.push(`缺少基建规则 ${name}`);
      return;
    }
    const rule: AtomicRule = { id, kind: 'template', source: provenance(name), ...override };
    if (rect(node.roi)) rule.roi = node.roi;
    // OCR 的文本期望转为正则前先转义；整段替换语义尚未适配，不能当普通纠错表使用。
    if (node.algorithm === 'OcrDetect') {
      rule.kind = 'ocr';
      rule.expected = strings(node.text).map(escapeRegex);
      if (node.fullMatch === true) rule.expected = rule.expected.map((item) => `^${item}$`);
      rule.onlyRec = node.withoutDet === true;
      if (
        Array.isArray(node.ocrReplace) &&
        node.ocrReplace.every(
          (item) =>
            Array.isArray(item) &&
            item.length === 2 &&
            item.every((part) => typeof part === 'string'),
        )
      )
        rule.replace = node.ocrReplace as [string, string][];
      if (node.replaceFull === true) {
        profile.diagnostics.push(`规则 ${name} 使用整段替换，需独立适配`);
        return;
      }
    } else {
      // 模板名必须存在于当前活跃模板集；多模板阈值按选定模板的索引读取。
      const templates = strings(node.template ?? `${name}.png`);
      const requested = override.templateId ?? templates[0];
      // 活跃视图可能以主题子目录保存模板；精确命中优先，只有唯一后缀候选才可绑定真实 ID。
      rule.templateId = requested ? resolveReviewedTemplateId(available, requested) : undefined;
      if (!rule.templateId) {
        profile.diagnostics.push(`缺少或无法唯一定位基建模板 ${requested ?? name}`);
        return;
      }
      const thresholds = node.templThreshold;
      const index = Math.max(0, templates.indexOf(requested!));
      rule.threshold =
        typeof thresholds === 'number'
          ? thresholds
          : Array.isArray(thresholds) && typeof thresholds[index] === 'number'
            ? thresholds[index]
            : 0.8;
      rule.method = 5;
      if (
        Array.isArray(node.maskRange) &&
        node.maskRange.length === 2 &&
        node.maskRange.every(Number.isInteger)
      )
        rule.maskRange = node.maskRange as [number, number];
      if (rule.maskRange && !([1, 100].includes(rule.maskRange[0]) && rule.maskRange[1] === 255)) {
        profile.diagnostics.push(`规则 ${name} 的灰度掩码尚未适配`);
        return;
      }
      if (rule.threshold! < 0 || rule.threshold! > 1 || !Number.isFinite(rule.threshold)) {
        profile.diagnostics.push(`规则 ${name} 的模板阈值无效`);
        return;
      }
      // RGBCount 仅覆盖已审阅的制造／贸易／发电色条，校验颜色范围和形态学参数后才登记。
      const pureColor =
        /^Infrast(?:Mfg|Trade|Power)(?:Mini)?$/.test(name) &&
        node.method === 'RGBCount' &&
        node.pureColor === true;
      if (pureColor) {
        const colors = node.colorScales;
        if (
          !Array.isArray(colors) ||
          !colors.length ||
          colors.length > 16 ||
          !colors.every(
            (range) =>
              Array.isArray(range) &&
              range.length === 2 &&
              range.every(
                (bound) =>
                  Array.isArray(bound) &&
                  bound.length === 3 &&
                  bound.every((value) => Number.isInteger(value) && value >= 0 && value <= 255),
              ) &&
              range[0].every((value: number, index: number) => value <= range[1][index]),
          )
        ) {
          profile.diagnostics.push(`规则 ${name} 的纯色 RGB 范围无效`);
          return;
        }
        if (node.maskRange !== undefined) {
          profile.diagnostics.push(`纯色规则 ${name} 不支持混合灰度掩码`);
          return;
        }
        if (
          (node.colorWithClose !== undefined && typeof node.colorWithClose !== 'boolean') ||
          (node.nmsDistance !== undefined &&
            (!Number.isInteger(node.nmsDistance) ||
              Number(node.nmsDistance) < 0 ||
              Number(node.nmsDistance) > 16384))
        ) {
          profile.diagnostics.push(`规则 ${name} 的闭运算或去重参数无效`);
          return;
        }
        rule.method = 'RGBCount';
        rule.pureColor = true;
        rule.colorScales = colors as [number[], number[]][];
        rule.colorWithClose = node.colorWithClose !== false;
        if (
          Number.isInteger(node.nmsDistance) &&
          Number(node.nmsDistance) >= 0 &&
          Number(node.nmsDistance) <= 16384
        )
          rule.nmsDistance = Number(node.nmsDistance);
      } else if (
        (node.method !== undefined && node.method !== 'Ccoeff') ||
        node.pureColor === true
      ) {
        // 未适配的 RGBCount 分支不能静默降为普通模板匹配。
        profile.diagnostics.push(`规则 ${name} 的 ${String(node.method)} 需专门适配`);
        return;
      }
    }
    // override 里的模板仍是上游请求名；输出必须保留刚解析的活跃视图真实 ID。
    profile.rules[id] = {
      ...rule,
      ...override,
      ...(rule.kind === 'template' ? { templateId: rule.templateId } : {}),
    };
  };
  // 资源节点与原语规则 ID 的映射需逐项审阅，不沿 next/onErrorNext 执行任务链。
  for (const [id, name] of [
    ['base.entered', 'InfrastEnteredFlag'],
    ['queue.rotate', 'InfrastRotationClick'],
    ['trim.enter', 'InfrastEnterTrim'],
    ['trim.apply', 'InfrastTrimClick'],
    ['room.list', 'InfrastEnterOperList'],
    ['room.stationed', 'InfrastStationedInfo'],
    ['operators.clear', 'InfrastClearButton'],
    ['operators.sort', 'InfrastOperListTabWorkStatusUnClicked'],
    ['operators.all', 'InfrastFilterMenuAllButton'],
    ['operators.filter', 'InfrastFilterMenuCancelNotStationed'],
    ['operators.conflict', 'InfrastDormDoubleConfirmButton'],
    ['operators.onShift', 'InfrastOperOnShift'],
    ['training.idle', 'InfrastTrainingIdle'],
    ['training.page', 'InfrastTrainingMasteryPage'],
    ['training.processing', 'InfrastTrainingTime'],
    ['training.operator', 'InfrastTrainingOperatorAndSkill'],
    ['training.confirm', 'BattleQuickFormationConfirm'],
    ['training.expandRole', 'BattleQuickFormationExpandRole'],
    ['training.all', 'BattleQuickFormationRole-All'],
    ['training.allOcr', 'BattleQuickFormationRole-All-OCR'],
    ['training.collapseRole', 'InfrastCloseQuickFormationExpandRole'],
  ])
    add(id!, name!);
  // 筛选入口存在第二种模板形态时单独登记，供 JSON 的有序候选复用。
  const filterTemplates = strings(resolve('InfrastFilterMenuCancelNotStationed')?.template);
  if (filterTemplates[1])
    add('operators.filter.1', 'InfrastFilterMenuCancelNotStationed', {
      templateId: filterTemplates[1],
    });
  // 上游总览入口使用 RGBCount；此处独立读取简体中文标签，不声称等价转换该算法。
  profile.rules['overview.enter'] = {
    id: 'overview.enter',
    kind: 'ocr',
    roi: [0, 50, 300, 250],
    expected: ['总览'],
    source: provenance('InfrastEnterRotation'),
  };
  for (const facility of atomicFacilities) {
    // 房间和总览共用设施文字规则；实际容量必须另从当前画面读取。
    const labels: Record<string, string> = {
      Mfg: '制造站',
      Trade: '贸易站',
      Power: '发电站',
      Control: '控制中枢',
      Reception: '会客室',
      Office: '办公室|人力办公室',
      Dorm: '宿舍',
      Processing: '加工站',
      Training: '训练室',
      Recycle: '回收站',
    };
    profile.rules[`facility.label.${facility}`] = {
      id: `facility.label.${facility}`,
      kind: 'ocr',
      expected: [labels[facility]!],
      source: {
        repository,
        ref,
        path: 'src/MaaCore/Vision/Infrast/InfrastFacilityImageAnalyzer.cpp',
      },
    };
    add(`facility.icon.${facility}`, `Infrast${facility}`);
    add(`facility.icon.${facility}.mini`, `Infrast${facility}Mini`);
  }
  // 干员卡片使用上游锚点、相对区域和选中条参数，不猜测缺失的布局信息。
  const smiley = resolve('InfrastSmiley');
  strings(smiley?.template).forEach((templateId, index) =>
    add(`operators.anchor.${index}`, 'InfrastSmiley', { templateId }),
  );
  const upper = resolve('InfrastSkillsUpper'),
    lower = resolve('InfrastSkillsLower');
  const name = resolve('InfrastOperNameOcr'),
    stationed = resolve('InfrastOperFacilityOcr');
  const selected = resolve('InfrastOperSelected');
  const color = Array.isArray(selected?.colorScales) ? selected.colorScales[0] : undefined;
  if (
    rect(upper?.roi) &&
    rect(lower?.roi) &&
    rect(name?.rectMove) &&
    rect(stationed?.rectMove) &&
    rect(selected?.specificRect) &&
    rect(selected?.rectMove) &&
    Array.isArray(selected?.specialParams) &&
    typeof selected.specialParams[0] === 'number' &&
    Array.isArray(color) &&
    color.length === 2 &&
    color.every((item) => Array.isArray(item) && item.length === 3 && item.every(Number.isInteger))
  ) {
    profile.card = {
      regions: [upper.roi, lower.roi],
      nameOffset: name.rectMove,
      facilityOffset: stationed.rectMove,
      selectedOffset: selected.specificRect,
      clickOffset: selected.rectMove,
      selectedCount: selected.specialParams[0],
      selectedLower: color[0] as number[],
      selectedUpper: color[1] as number[],
    };
  } else profile.diagnostics.push('干员卡片位置／选中状态参数不完整');
  // 心情与亮起技能来自相同卡片几何；只识别已审阅的无跨房依赖技能，不解释上游公式字符串。
  const mood = resolve('InfrastOperMoodProgressBar'),
    skills = resolve('InfrastSkills');
  if (
    profile.card &&
    rect(mood?.rectMove) &&
    typeof mood?.templThreshold === 'number' &&
    mood.templThreshold >= 0 &&
    mood.templThreshold <= 255 &&
    Array.isArray(mood.specialParams) &&
    typeof mood.specialParams[0] === 'number' &&
    mood.specialParams[0] > 0 &&
    mood.specialParams[0] <= 255
  ) {
    profile.card.moodOffset = mood.rectMove;
    profile.card.moodLower = mood.templThreshold;
    profile.card.moodDifference = mood.specialParams[0];
  }
  if (
    profile.card &&
    rect(skills?.rectMove) &&
    typeof skills?.templThreshold === 'number' &&
    skills.templThreshold >= 0 &&
    skills.templThreshold <= 1 &&
    Array.isArray(skills.specialParams) &&
    typeof skills.specialParams[0] === 'number' &&
    skills.specialParams[0] >= 0 &&
    skills.specialParams[0] <= 255 &&
    Array.isArray(skills.maskRange) &&
    skills.maskRange[0] === 1 &&
    skills.maskRange[1] === 255
  ) {
    profile.card.skillOffset = skills.rectMove;
    profile.card.skillBrightness = skills.specialParams[0];
    profile.card.skillThreshold = skills.templThreshold;
    profile.card.skillMaskRange = [1, 255];
    const bytes = await source.read('infrast.json', 4 * 1024 * 1024);
    if (bytes)
      try {
        const data: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
        if (!object(data)) throw new Error('invalid infrastructure skills');
        const skillSource = {
          repository,
          ref: options.resourceVersion ?? 'local-immutable-resource',
          path: 'resource/infrast.json',
          sha256: hash(bytes),
        };
        profile.sources.push(skillSource);
        profile.skills = {};
        const simple =
          /^(?:bskill_(?:man|tra|pow|meet)_spd[1-3]|bskill_hire_spd[1-5]|bskill_man_spd&(?:cost[1-3]|limit[1356]|limit&cost[1-4])|bskill_tra_spd&(?:cost|limit[1-7])|bskill_hire_spd&cost[12456])$/u;
        for (const facility of atomicFacilities) {
          const definition = data[facility];
          if (!object(definition) || !object(definition.skills)) continue;
          const entries = Object.entries(definition.skills);
          if (entries.length > 2000) throw new Error('too many infrastructure skills');
          for (const [id, entry] of entries) {
            if (
              !simple.test(id) ||
              !object(entry) ||
              typeof entry.template !== 'string' ||
              !object(entry.efficient)
            )
              continue;
            const templateId = resolveReviewedTemplateId(available, entry.template);
            const efficiency = Object.fromEntries(
              Object.entries(entry.efficient).filter(
                ([, value]) =>
                  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10000,
              ),
            ) as Record<string, number>;
            if (!templateId || !Object.keys(efficiency).length) continue;
            (profile.skills[facility] ??= []).push({
              id,
              efficiency,
              simple: true,
              rule: {
                id: `skill.${id}`,
                kind: 'template',
                templateId,
                threshold: skills.templThreshold,
                method: 5,
                maskRange: [1, 255],
                source: { ...skillSource, node: `${facility}.skills.${id}` },
              },
            });
          }
        }
      } catch {
        delete profile.skills;
        profile.diagnostics.push('同代 infrast.json 简单技能表无效，禁用自动技能排序');
      }
  }
  // 普通干员名与训练组合文本共享上游姓名纠错，避免同一姓名被两套规则读成不同值。
  const replace = resolve('CharsNameOcrReplace');
  profile.rules['operators.name'] = {
    id: 'operators.name',
    kind: 'ocr',
    onlyRec: true,
    replace: Array.isArray(replace?.ocrReplace) ? (replace.ocrReplace as [string, string][]) : [],
    source: provenance('CharsNameOcrReplace'),
  };
  if (profile.rules['training.operator']) {
    profile.rules['training.operator'].replace = [
      ...(profile.rules['training.operator'].replace ?? []),
      ...(profile.rules['operators.name'].replace ?? []),
    ];
  }
  // 只登记经过审阅的固定动作区域，后续仍由执行端口校验帧并发送输入。
  for (const [id, name] of [
    ['operators.confirm', 'InfrastDormConfirmButton'],
    ['room.bottomTab', 'InfrastBottomLeftTab'],
    ['processing.list', 'InfrastProcessingEnterOperList'],
    ['training.trainee', 'InfrastTrainingSelectTrainee'],
    ['training.assistant', 'OperProgress@MasterySelectTrainer'],
  ]) {
    const node = resolve(name!);
    if (rect(node?.specificRect))
      profile.actions[id!] = {
        box: node.specificRect,
        delayMs: typeof node.postDelay === 'number' ? node.postDelay : 500,
      };
  }
  // 源码语义依据与本次读取的资源文件来源共同保留，便于定位适配变化。
  profile.sources.push(
    { repository, ref, path: 'src/MaaCore/Vision/Infrast/InfrastOperImageAnalyzer.cpp' },
    { repository, ref, path: 'src/MaaCore/Task/Infrast/InfrastAbstractTask.cpp' },
    { repository, ref, path: 'src/MaaCore/Task/Infrast/InfrastTrainingTask.cpp' },
  );
  // 可用性要求基础识别与确认入口齐备；单项能力还会由注册表检查自身依赖。
  profile.available = Boolean(
    profile.card &&
    profile.rules['base.entered'] &&
    profile.rules['operators.anchor.0'] &&
    profile.rules['operators.anchor.1'] &&
    profile.rules['operators.anchor.2'] &&
    profile.actions['operators.confirm'],
  );
  return profile;
}

// 上游 text 是字面文本；只有适配器显式构造的标签模式可以含正则语义。
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
