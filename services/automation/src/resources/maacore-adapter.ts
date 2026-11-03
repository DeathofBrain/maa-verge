/** 将维护者逐项登记的 MaaCore 识别节点转为通用规则；不执行或递归解释上游任务图。 */
import { createHash } from 'node:crypto';
import type { AtomicBox } from '../core/types';
import type { AtomicResourceSource } from './source';
import type { AtomicRule, AtomicSource, VisionResourceProfile } from './types';

export type ReviewedResourceProfile = VisionResourceProfile & {
  id: string;
  clientType: string;
  available: boolean;
  resourceVersion?: string;
  diagnostics: string[];
  sources: AtomicSource[];
  alternatives: Record<string, string[]>;
  adapterBaseline: { repository: string; ref: string; commit: string };
};
export type ReviewedRule = {
  id: string;
  node: string;
  /** 仅限维护者审阅的绝对区域；不把上游相对卡片坐标误作全屏区域。 */
  roi?: AtomicBox;
  expected?: string[];
  template?: string;
  actionOnly?: boolean;
  expectedMove?: AtomicBox;
  /** 相对规则保留原始 ROI 校验，再由功能在已确认卡片上换算，不能当全屏坐标。 */
  expectedRoi?: AtomicBox;
  /** 仅维护者显式登记的 RGBCount/pureColor 分支；未选择的特殊算法仍不可用。 */
  rgbPureColor?: boolean;
  /** 只复用上游绝对区域做独立文字读取，不声称转换了上游的颜色／模板算法。 */
  ocrRegionOnly?: boolean;
};
export type ReviewedProfileOptions = {
  availableTemplates?: readonly string[];
  resourceVersion?: string;
};
const repository = 'https://github.com/MaaAssistantArknights/MaaAssistantArknights';
type Node = Record<string, unknown>;
const object = (value: unknown): value is Node =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? value
      : [];
const rect = (value: unknown): value is AtomicBox =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every(Number.isInteger) &&
  value[0] >= 0 &&
  value[1] >= 0 &&
  value[2] > 0 &&
  value[3] > 0 &&
  value[0] + value[2] <= 1280 &&
  value[1] + value[3] <= 720;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Framework 使用精确模板标识；仅在省略的目录前缀可唯一恢复时接受 MaaCore 短引用。 */
export function resolveReviewedTemplateId(
  templates: ReadonlySet<string>,
  requested: string,
): string | undefined {
  if (templates.has(requested)) return requested;
  const candidates = [...templates].filter((id) => id.endsWith(`/${requested}`));
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** 缺失、算法漂移、客户端未适配均保留不可用诊断；模板只能来自宿主选定资源代。 */
export async function loadReviewedResourceProfile(
  source: AtomicResourceSource | null,
  feature: string,
  reviewed: readonly ReviewedRule[],
  files: readonly string[],
  clientType = 'Official',
  options: ReviewedProfileOptions = {},
): Promise<ReviewedResourceProfile> {
  const profile: ReviewedResourceProfile = {
    id: `maacore-v6.20.0-${feature}:${options.resourceVersion ?? ''}`,
    clientType,
    available: false,
    ...(options.resourceVersion ? { resourceVersion: options.resourceVersion } : {}),
    diagnostics: [],
    sources: [],
    alternatives: {},
    rules: {},
    actions: {},
    adapterBaseline: {
      repository,
      ref: 'v6.20.0',
      commit: '71bce1cc85bce55d3b20e19066b2dd33252072fc',
    },
  };
  // 客户端文本与主题未经审阅时不猜测；Official/Bilibili 共用简中资源结构。
  if (!['Official', 'Bilibili'].includes(clientType) || !source) {
    profile.diagnostics.push(source ? '此客户端的日常语义尚未适配' : '当前不可变资源目录不可读');
    return profile;
  }
  const nodes: Record<string, Node> = {};
  const locations = new Map<string, AtomicSource>();
  // 只读显式列表；主任务仅选择一个位置，避免旧副本覆盖实际主文件。
  let mainLoaded = false;
  for (const file of ['tasks/tasks.json', 'tasks.json', ...files]) {
    if (mainLoaded && file === 'tasks.json') continue;
    const bytes = await source.read(file, 8 * 1024 * 1024);
    if (!bytes) continue;
    try {
      const parsed: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
      if (!object(parsed) || !Object.values(parsed).every(object)) throw new Error();
      if (file === 'tasks/tasks.json' || file === 'tasks.json') mainLoaded = true;
      const location: AtomicSource = {
        repository,
        ref: options.resourceVersion ?? 'local-immutable-resource',
        path: `resource/${file}`,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      profile.sources.push(location);
      for (const [name, node] of Object.entries(parsed)) {
        nodes[name] = node as Node;
        locations.set(name, { ...location, node: name });
      }
    } catch {
      profile.diagnostics.push(`无法解析已登记资源 ${file}`);
    }
  }
  const templates = new Set(options.availableTemplates);
  if (!options.availableTemplates) {
    const listed = await source.listTemplates();
    for (const id of listed.ids) templates.add(id);
    if (!listed.complete) profile.diagnostics.push('模板枚举不完整');
  }
  // 仅解释精确 baseTask 名称；表达式、循环继承与失踪父项均不成立。
  const resolve = (name: string, visited = new Set<string>()): Node | undefined => {
    if (visited.has(name) || visited.size >= 16 || !Object.hasOwn(nodes, name)) return;
    visited.add(name);
    const node = nodes[name];
    if (node.baseTask === undefined || node.baseTask === '#none') return { ...node };
    if (typeof node.baseTask !== 'string') return;
    const base = resolve(node.baseTask, visited);
    return base ? { ...base, ...node } : undefined;
  };
  for (const spec of reviewed) {
    const node = resolve(spec.node);
    const source = locations.get(spec.node);
    if (!node || !source) {
      profile.diagnostics.push(`缺少已审阅规则 ${spec.node}`);
      continue;
    }
    if (spec.expectedMove && JSON.stringify(node.rectMove) !== JSON.stringify(spec.expectedMove)) {
      profile.diagnostics.push(`规则 ${spec.node} 的相对目标已变化`);
      continue;
    }
    if (spec.expectedRoi && JSON.stringify(node.roi) !== JSON.stringify(spec.expectedRoi)) {
      profile.diagnostics.push(`规则 ${spec.node} 的相对识别区域已变化`);
      continue;
    }
    if (spec.actionOnly) {
      if (
        node.action === 'ClickRect' &&
        rect(node.specificRect) &&
        (node.postDelay === undefined ||
          (Number.isInteger(node.postDelay) &&
            Number(node.postDelay) >= 0 &&
            Number(node.postDelay) <= 5000))
      ) {
        profile.actions[spec.id] = { box: node.specificRect, delayMs: Number(node.postDelay ?? 0) };
      } else profile.diagnostics.push(`缺少已审阅固定动作 ${spec.node}`);
      continue;
    }
    const roi = spec.roi ?? node.roi;
    if (roi !== undefined && !rect(roi)) {
      profile.diagnostics.push(`规则 ${spec.node} 不是绝对参考区域`);
      continue;
    }
    const base: AtomicRule = { id: spec.id, kind: 'template', source, ...(roi ? { roi } : {}) };
    if (spec.rgbPureColor) {
      // 对齐已审阅的原生 RGBCount 支持范围；灰度单值范围展开成同界 RGB 三通道。
      const colors = node.colorScales;
      const names = strings(node.template ?? `${spec.node}.png`);
      const templateId =
        names.length === 1 ? resolveReviewedTemplateId(templates, names[0]!) : undefined;
      if (
        node.method !== 'RGBCount' ||
        node.pureColor !== true ||
        !templateId ||
        !Array.isArray(colors) ||
        !colors.length ||
        colors.length > 16 ||
        !colors.every(
          (range) =>
            Array.isArray(range) &&
            range.length === 2 &&
            range.every((bound) => Number.isInteger(bound) && bound >= 0 && bound <= 255) &&
            range[0] <= range[1],
        ) ||
        node.colorWithClose !== undefined ||
        node.maskRange !== undefined ||
        (node.templThreshold !== undefined &&
          (typeof node.templThreshold !== 'number' ||
            node.templThreshold < 0 ||
            node.templThreshold > 1))
      ) {
        profile.diagnostics.push(`规则 ${spec.node} 超出已审阅 RGBCount/pureColor 参数范围`);
        continue;
      }
      profile.rules[spec.id] = {
        ...base,
        templateId,
        method: 'RGBCount',
        pureColor: true,
        colorScales: colors.map((range) => [
          [range[0], range[0], range[0]],
          [range[1], range[1], range[1]],
        ]),
        threshold: Number(node.templThreshold ?? 0.8),
      };
      profile.alternatives[spec.id] = [spec.id];
      continue;
    }
    if (spec.ocrRegionOnly) {
      if (!rect(roi)) {
        profile.diagnostics.push(`缺少独立 OCR 的参考区域 ${spec.node}`);
        continue;
      }
      profile.rules[spec.id] = { ...base, kind: 'ocr', expected: spec.expected ?? [] };
      profile.alternatives[spec.id] = [spec.id];
      continue;
    }
    // 不将 RGBCount、HSVCount、色彩阈值等特殊算法静默转换为普通模板。
    if (
      (node.method !== undefined && node.method !== 'Ccoeff') ||
      node.pureColor === true ||
      node.replaceFull === true ||
      node.algorithm === 'JustReturn'
    ) {
      profile.diagnostics.push(`规则 ${spec.node} 的算法需要独立适配`);
      continue;
    }
    if (node.algorithm === 'OcrDetect') {
      base.kind = 'ocr';
      base.expected = spec.expected ?? strings(node.text).map(escape);
      if (node.fullMatch === true && spec.expected === undefined)
        base.expected = base.expected.map((text) => `^${text}$`);
      base.onlyRec = node.withoutDet === true;
      if (node.ocrReplace !== undefined) {
        const replacements = node.ocrReplace;
        if (
          !Array.isArray(replacements) ||
          !replacements.every(
            (pair) =>
              Array.isArray(pair) && pair.length === 2 && pair.every((v) => typeof v === 'string'),
          )
        ) {
          profile.diagnostics.push(`规则 ${spec.node} 的 OCR 纠错字段无效`);
          continue;
        }
        base.replace = replacements as [string, string][];
      }
      profile.rules[spec.id] = base;
      profile.alternatives[spec.id] = [spec.id];
    } else if (node.algorithm === undefined || node.algorithm === 'MatchTemplate') {
      const names = spec.template ? [spec.template] : strings(node.template ?? `${spec.node}.png`);
      const variants: string[] = [];
      for (const [index, requested] of names.entries()) {
        // MaaCore 允许任务内省略前缀；Framework 视图使用精确相对标识，仅唯一后缀才可绑定。
        const templateId = resolveReviewedTemplateId(templates, requested);
        if (!templateId) continue;
        const threshold = Array.isArray(node.templThreshold)
          ? node.templThreshold[index]
          : (node.templThreshold ?? 0.8);
        if (
          typeof threshold !== 'number' ||
          !Number.isFinite(threshold) ||
          threshold < 0 ||
          threshold > 1
        )
          continue;
        if (
          node.maskRange !== undefined &&
          (!Array.isArray(node.maskRange) ||
            node.maskRange.length !== 2 ||
            ![1, 100].includes(node.maskRange[0]) ||
            node.maskRange[1] !== 255)
        )
          continue;
        const id = variants.length ? `${spec.id}.${variants.length}` : spec.id;
        profile.rules[id] = {
          ...base,
          id,
          templateId,
          threshold,
          method: 5,
          ...(node.maskRange ? { maskRange: node.maskRange as [number, number] } : {}),
        };
        variants.push(id);
      }
      if (variants.length) profile.alternatives[spec.id] = variants;
      else profile.diagnostics.push(`缺少模板或参数不支持：${spec.node}`);
    } else profile.diagnostics.push(`不支持规则 ${spec.node} 的识别算法`);
  }
  // profile 表示至少一项证据可用；各能力另检查自己的完整依赖，避免误报整体已适配。
  profile.available = Object.keys(profile.rules).length > 0;
  return profile;
}
