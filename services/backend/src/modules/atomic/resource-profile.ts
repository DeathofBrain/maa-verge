import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ResourceReader } from '@backend/modules/resources/item-resources';
import {
  atomicFacilities,
  type AtomicBox,
  type AtomicResourceProfile,
  type AtomicRule,
} from './types';

const repository = 'https://github.com/MaaAssistantArknights/MaaAssistantArknights';
const ref = 'v6.20.0';
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
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Read-only, explicit MaaCore resource adapter. It does not translate ProcessTask graphs. */
export async function loadAtomicResourceProfile(
  generation: string,
  clientType = 'Official',
  options: { availableTemplates?: readonly string[]; resourceVersion?: string } = {},
): Promise<AtomicResourceProfile> {
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
  if (!['Official', 'Bilibili'].includes(clientType)) {
    profile.diagnostics.push('当前基建语义适配仅核对了简体中文客户端资源；此客户端尚未适配');
    return profile;
  }
  let reader = await ResourceReader.create(generation);
  let resourceRoot = path.join(generation, 'resource');
  if (!reader) {
    try {
      const info = await lstat(generation),
        canonical = await realpath(generation);
      if (
        path.isAbsolute(generation) &&
        info.isDirectory() &&
        !info.isSymbolicLink() &&
        path.resolve(canonical) === path.resolve(generation)
      ) {
        reader = new ResourceReader(canonical);
        resourceRoot = canonical;
      }
    } catch {
      /* An unavailable resource is reported below. */
    }
  }
  if (!reader) {
    profile.diagnostics.push('当前不可变资源目录不可读');
    return profile;
  }
  let nodes: Record<string, Node> = {},
    filename = '';
  const locations = new Map<string, { path: string; sha256: string }>();
  for (const candidate of ['tasks/tasks.json', 'tasks.json']) {
    const bytes = await reader.read(candidate, 8 * 1024 * 1024);
    if (!bytes) continue;
    try {
      const parsed: unknown = JSON.parse(bytes.toString('utf8'));
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
  // Only these reviewed resource files are inputs. This is not the upstream recursive task loader.
  for (const candidate of ['tasks/Copilot/formation.json', 'tasks/hotfix/ocr_replace.json']) {
    const bytes = await reader.read(candidate, 4 * 1024 * 1024);
    if (!bytes) continue;
    try {
      const parsed: unknown = JSON.parse(bytes.toString('utf8'));
      if (!object(parsed) || !Object.values(parsed).every(object)) throw new Error();
      const location = { path: `resource/${candidate}`, sha256: hash(bytes) };
      profile.sources.push({
        repository,
        ref: options.resourceVersion ?? 'local-immutable-resource',
        ...location,
      });
      for (const [name, node] of Object.entries(parsed)) {
        nodes[name] = node as Node;
        locations.set(name, location);
      }
    } catch {
      profile.diagnostics.push(`无法解析已登记资源 ${candidate}`);
    }
  }
  const available = new Set(options.availableTemplates);
  if (!options.availableTemplates) {
    // Enumerate only ordinary files. ResourceReader checks every ancestor again at read time.
    let budget = 12_000;
    const visit = async (relative: string, depth: number): Promise<void> => {
      if (depth > 12 || budget <= 0) throw new Error('模板目录超出范围');
      const directory = path.join(resourceRoot, relative);
      if ((await lstat(directory)).isSymbolicLink()) throw new Error('模板目录不能含符号链接');
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (--budget <= 0) throw new Error('模板数量超出范围');
        const child = path.join(relative, entry.name);
        if (entry.isSymbolicLink()) throw new Error('模板不能含符号链接');
        if (entry.isDirectory()) await visit(child, depth + 1);
        else if (entry.isFile() && entry.name.endsWith('.png')) {
          available.add(entry.name);
          available.add(child.slice('template/'.length).replaceAll(path.sep, '/'));
        }
      }
    };
    try {
      await visit('template', 0);
    } catch {
      profile.diagnostics.push('部分模板目录不可读或不符合普通文件限制');
    }
  }
  const resolve = (name: string, seen = new Set<string>()): Node | undefined => {
    const node = nodes[name];
    if (!node || seen.has(name) || seen.size > 16) return;
    seen.add(name);
    if (node.baseTask === '#none' || node.baseTask === undefined) return { ...node };
    if (typeof node.baseTask !== 'string') return;
    const base = resolve(node.baseTask, seen);
    if (!base) return;
    // Only explicit inheritance needed by the reviewed node set. No @/# expression expansion.
    const merged = { ...base, ...node };
    if (
      !('template' in node) &&
      merged.algorithm !== 'OcrDetect' &&
      merged.algorithm !== 'JustReturn'
    )
      merged.template = `${name}.png`;
    return merged;
  };
  const source = (name: string) => ({
    repository,
    ref: options.resourceVersion ?? 'local-immutable-resource',
    ...locations.get(name),
    path: locations.get(name)?.path ?? `resource/${filename}`,
    node: name,
  });
  const add = (id: string, name: string, override: Partial<AtomicRule> = {}) => {
    const node = resolve(name);
    if (!node) {
      profile.diagnostics.push(`缺少基建规则 ${name}`);
      return;
    }
    const rule: AtomicRule = { id, kind: 'template', source: source(name), ...override };
    if (rect(node.roi)) rule.roi = node.roi;
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
      const templates = strings(node.template ?? `${name}.png`);
      rule.templateId = override.templateId ?? templates[0];
      if (!rule.templateId || !available.has(rule.templateId)) {
        profile.diagnostics.push(`缺少基建模板 ${rule.templateId ?? name}`);
        return;
      }
      const thresholds = node.templThreshold;
      const index = Math.max(0, templates.indexOf(rule.templateId));
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
        // Never silently approximate an unsupported RGBCount branch with Ccoeff.
        profile.diagnostics.push(`规则 ${name} 的 ${String(node.method)} 需专门适配`);
        return;
      }
    }
    profile.rules[id] = { ...rule, ...override };
  };
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
  const filterTemplates = strings(resolve('InfrastFilterMenuCancelNotStationed')?.template);
  if (filterTemplates[1])
    add('operators.filter.1', 'InfrastFilterMenuCancelNotStationed', {
      templateId: filterTemplates[1],
    });
  // The total-overview entry uses MaaCore RGBCount. This explicit Chinese OCR adaptation
  // reads the real label; it is not a claimed lossless lowering of the RGBCount algorithm.
  profile.rules['overview.enter'] = {
    id: 'overview.enter',
    kind: 'ocr',
    roi: [0, 50, 300, 250],
    expected: ['总览'],
    source: source('InfrastEnterRotation'),
  };
  for (const facility of atomicFacilities) {
    // Facility labels are observed in both room and total-overview pages; capacity is never copied here.
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
  const replace = resolve('CharsNameOcrReplace');
  profile.rules['operators.name'] = {
    id: 'operators.name',
    kind: 'ocr',
    onlyRec: true,
    replace: Array.isArray(replace?.ocrReplace) ? (replace.ocrReplace as [string, string][]) : [],
    source: source('CharsNameOcrReplace'),
  };
  if (profile.rules['training.operator']) {
    profile.rules['training.operator'].replace = [
      ...(profile.rules['training.operator'].replace ?? []),
      ...(profile.rules['operators.name'].replace ?? []),
    ];
  }
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
  profile.sources.push(
    { repository, ref, path: 'src/MaaCore/Vision/Infrast/InfrastOperImageAnalyzer.cpp' },
    { repository, ref, path: 'src/MaaCore/Task/Infrast/InfrastAbstractTask.cpp' },
    { repository, ref, path: 'src/MaaCore/Task/Infrast/InfrastTrainingTask.cpp' },
  );
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
