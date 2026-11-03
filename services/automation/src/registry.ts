/** 维护者的全局注册入口；新增功能在 automation.components 中登记一次即可参与组装。 */
import type { AtomicExecutionPort } from '#automation/core/types';
import { atomicInputValidators } from '@contracts/validators.js';
import { createPrimitiveCapabilities } from '#automation/primitives/capabilities';
import { registerAutomationComponents } from '#automation/registry/components';
import {
  createCompositeCapabilities,
  type CompositeProfiles,
} from '#automation/composites/capabilities';
import {
  createInfrastCapabilities,
  infrastPipeline,
  loadAtomicResourceProfile,
  parseCustomInfrastPlan,
  checkCustomInfrastPlanResources,
  atomicFacilities,
  type AtomicResourceProfile,
} from '#components/infrast';
import {
  createStartupCapabilities,
  loadStartupResourceProfile,
  startupPipeline,
} from '#components/startup';
import {
  createFightCapabilities,
  loadFightResourceProfile,
  fightPipeline,
  legacyStageRoute,
  checkFightInputs,
} from '#components/fight';
import {
  createRecruitCapabilities,
  loadRecruitResourceProfile,
  recruitPipeline,
} from '#components/recruit';
import { createMallCapabilities, loadMallResourceProfile, mallPipeline } from '#components/mall';
import {
  createAwardCapabilities,
  loadAwardResourceProfile,
  awardPipeline,
} from '#components/award';
import {
  createInventoryCapabilities,
  loadInventoryResourceProfile,
  inventoryPipeline,
} from '#components/inventory';
import type { ReviewedResourceProfile, ReviewedProfileOptions } from './resources/maacore-adapter';
import type { AtomicResourceSource } from './resources/source';

export type DailyFeature = 'startup' | 'fight' | 'recruit' | 'mall' | 'award' | 'inventory';
export type DailyProfiles = Record<DailyFeature, ReviewedResourceProfile>;

export type AutomationOptions = {
  profile: AtomicResourceProfile;
  compositeProfiles?: CompositeProfiles;
  defaultCompositeProfile?: string;
  dailyProfiles?: Partial<DailyProfiles>;
};

/** 没有选定资源时仍返回完整可诊断目录，不能把缺配置误标为可执行。 */
function unavailableProfile(feature: DailyFeature): ReviewedResourceProfile {
  return {
    id: `unavailable-${feature}`,
    clientType: 'Official',
    available: false,
    diagnostics: ['请先安装并启用已适配游戏资源'],
    rules: {},
    actions: {},
    sources: [],
    alternatives: {},
    adapterBaseline: {
      repository: 'https://github.com/MaaAssistantArknights/MaaAssistantArknights',
      ref: 'v6.20.0',
      commit: '71bce1cc85bce55d3b20e19066b2dd33252072fc',
    },
  };
}

/** 所有适配器读取同一批不可变字节，避免各功能重复枚举/读取大文件并出现版本差异。 */
export async function loadAutomationResourceProfiles(
  source: AtomicResourceSource | null,
  clientType = 'Official',
  options: ReviewedProfileOptions = {},
): Promise<AutomationOptions> {
  const reads = new Map<string, Promise<Uint8Array | undefined>>();
  let templates: ReturnType<AtomicResourceSource['listTemplates']> | undefined;
  const shared: AtomicResourceSource | null = source
    ? {
        read(relative, maxBytes) {
          const key = `${relative}:${maxBytes}`;
          let value = reads.get(key);
          if (!value) {
            value = source.read(relative, maxBytes);
            reads.set(key, value);
          }
          return value;
        },
        listTemplates() {
          return (templates ??= source.listTemplates());
        },
      }
    : null;
  const [profile, startup, fight, recruit, mall, award, inventory] = await Promise.all([
    loadAtomicResourceProfile(shared, clientType, options),
    loadStartupResourceProfile(shared, clientType, options),
    loadFightResourceProfile(shared, clientType, options),
    loadRecruitResourceProfile(shared, clientType, options),
    loadMallResourceProfile(shared, clientType, options),
    loadAwardResourceProfile(shared, clientType, options),
    loadInventoryResourceProfile(shared, clientType, options),
  ]);
  return { profile, dailyProfiles: { startup, fight, recruit, mall, award, inventory } };
}

// 组件 key 是类型安全的访问缩写，例如 automation.components.infrast.pipeline。
// 功能自己的 definitions.ts 登记 JSON 文件，这里只组合完整功能，不重复列出节点或处理器。
export const automation = registerAutomationComponents<AutomationOptions>()({
  primitives: { capabilities: createPrimitiveCapabilities },
  composites: {
    capabilities: (port, options) =>
      createCompositeCapabilities(
        port,
        options.compositeProfiles ?? {
          infrast: {
            profile: options.profile,
            options: { referenceSize: [1280, 720], settleMs: 300 },
          },
          ...Object.fromEntries(
            Object.entries(options.dailyProfiles ?? {}).map(([name, profile]) => [
              name,
              { profile, options: { referenceSize: [1280, 720] as [number, number] } },
            ]),
          ),
        },
        options.defaultCompositeProfile ?? 'infrast',
      ),
  },
  infrast: {
    pipeline: infrastPipeline,
    capabilities: (port, { profile }) => createInfrastCapabilities(port, profile),
  },
  startup: {
    pipeline: startupPipeline,
    capabilities: (port, options) =>
      createStartupCapabilities(
        port,
        options.dailyProfiles?.startup ?? unavailableProfile('startup'),
      ),
  },
  fight: {
    pipeline: fightPipeline,
    capabilities: (port, options) =>
      createFightCapabilities(port, options.dailyProfiles?.fight ?? unavailableProfile('fight')),
  },
  recruit: {
    pipeline: recruitPipeline,
    capabilities: (port, options) =>
      createRecruitCapabilities(
        port,
        options.dailyProfiles?.recruit ?? unavailableProfile('recruit'),
      ),
  },
  mall: {
    pipeline: mallPipeline,
    capabilities: (port, options) =>
      createMallCapabilities(port, options.dailyProfiles?.mall ?? unavailableProfile('mall')),
  },
  award: {
    pipeline: awardPipeline,
    capabilities: (port, options) =>
      createAwardCapabilities(port, options.dailyProfiles?.award ?? unavailableProfile('award')),
  },
  inventory: {
    pipeline: inventoryPipeline,
    capabilities: (port, options) =>
      createInventoryCapabilities(
        port,
        options.dailyProfiles?.inventory ?? unavailableProfile('inventory'),
      ),
  },
});

/** 现有宿主的静态组装入口；通用目录和各功能模块独立维护。 */
export function createAtomicCapabilityRegistry(
  port: AtomicExecutionPort,
  options: AutomationOptions,
) {
  return automation.createRegistry(port, options);
}

/** 旧任务语义在唯一组装入口连接各功能；纯预检不读取设备或修改业务配置。 */
import {
  compileLegacyTaskWithFeatures,
  type LegacyTask,
  type LegacyTaskOptions,
} from '#components/legacy';
export function compileLegacyTask(task: LegacyTask, options: LegacyTaskOptions = {}) {
  return compileLegacyTaskWithFeatures(task, options, {
    supportsStage: (stage) => legacyStageRoute(stage) !== undefined,
    compileInfrast: (task, options) => {
      const issues: import('#components/legacy').LegacyCompatibilityIssue[] = [];
      if ((task.params.mode ?? 0) === 0) {
        const allowed = ['Mfg', 'Trade', 'Power', 'Control', 'Reception', 'Office', 'Dorm'];
        const facilities = task.params.facility ?? allowed;
        if (
          !Array.isArray(facilities) ||
          !facilities.every((value) => typeof value === 'string' && allowed.includes(value))
        )
          issues.push({
            field: 'facility',
            code: 'unsupported_parameter',
            message:
              '自动换班当前只支持制造、贸易、发电、控制、会客、办公室和宿舍，其他设施配置已保留',
          });
        const threshold = task.params.threshold ?? 0.3;
        if (
          typeof threshold !== 'number' ||
          !Number.isFinite(threshold) ||
          threshold < 0 ||
          threshold > 1
        )
          issues.push({
            field: 'threshold',
            code: 'invalid_parameter',
            message: '心情阈值必须是0到1的数值',
          });
        for (const [field, value] of Object.entries(task.params)) {
          // 切回自动模式后自定义文件/班次仍留在旧配置，但它们不会参与自动换班。
          if (
            [
              'mode',
              'facility',
              'threshold',
              'enable',
              'client_type',
              'filename',
              'plan_index',
            ].includes(field)
          )
            continue;
          if (field === 'drones' && ['_NotUse', 'NotUse', 'None', 'none'].includes(String(value)))
            continue;
          if (
            value !== undefined &&
            value !== false &&
            value !== 0 &&
            value !== '' &&
            value !== null
          )
            issues.push({
              field,
              code: 'unsupported_parameter',
              message: `自动基建的主动参数 ${field} 尚未等价迁移，未开始换班`,
            });
        }
        return {
          issues,
          // 官方空设施列表表示本项无换班，不把空值替换为全设施默认值。
          steps:
            issues.length || (Array.isArray(facilities) && facilities.length === 0)
              ? []
              : [
                  { capabilityId: 'game.startup.return_home', input: {} },
                  { capabilityId: 'workflow.infrast.daily', input: { facilities, threshold } },
                ],
        };
      }
      if (task.params.mode !== 10000)
        return {
          steps: [],
          issues: [
            {
              field: 'mode',
              code: 'unsupported_parameter',
              message: '该基建轮换模式尚未迁移，原配置已保留',
            },
          ],
        };
      const snapshot = options.customInfrastPlan;
      if (!snapshot)
        return {
          steps: [],
          issues: [
            {
              field: 'filename',
              code: 'unavailable_resource',
              message: '执行前须读取自定义基建文件的不可变快照，原路径已保留',
            },
          ],
        };
      const inactive = (value: unknown) =>
        value === undefined || value === false || value === 0 || value === '' || value === null;
      for (const [field, value] of Object.entries(task.params)) {
        if (
          [
            'mode',
            'filename',
            'plan_index',
            'enable',
            'client_type',
            'facility',
            'threshold',
          ].includes(field)
        )
          continue;
        if (field === 'drones' && ['_NotUse', 'NotUse', 'None', 'none'].includes(String(value)))
          continue;
        if (!inactive(value))
          issues.push({
            field,
            code: 'unsupported_parameter',
            message: `自定义基建的主动参数 ${field} 尚未等价迁移，未开始换班`,
          });
      }
      const planIndex = task.params.plan_index ?? 0;
      if (!Number.isSafeInteger(planIndex) || Number(planIndex) < 0)
        issues.push({
          field: 'plan_index',
          code: 'invalid_parameter',
          message: '自定义计划序号必须为非负整数',
        });
      const facilities = task.params.facility;
      const threshold = task.params.threshold ?? 0.3;
      if (
        typeof threshold !== 'number' ||
        !Number.isFinite(threshold) ||
        threshold < 0 ||
        threshold > 1
      )
        issues.push({
          field: 'threshold',
          code: 'invalid_parameter',
          message: '心情阈值必须是0到1的数值',
        });
      if (
        facilities !== undefined &&
        (!Array.isArray(facilities) ||
          !facilities.every(
            (value) =>
              typeof value === 'string' && (atomicFacilities as readonly string[]).includes(value),
          ))
      )
        issues.push({
          field: 'facility',
          code: 'invalid_parameter',
          message: '设施必须为已适配类型名称列表',
        });
      let hasIntent = false;
      try {
        hasIntent =
          parseCustomInfrastPlan(
            snapshot.document,
            Number(planIndex),
            facilities as import('#components/infrast').AtomicFacility[] | undefined,
          ).rooms.length > 0;
      } catch (error) {
        issues.push({
          field: 'filename',
          code: 'unsupported_parameter',
          message: error instanceof Error ? error.message : '自定义基建文档无效',
        });
      }
      return {
        issues,
        // 官方 skip／空意图保持原房；无需先返回主页再调用一个无动作流程。
        steps:
          issues.length || !hasIntent
            ? []
            : [
                { capabilityId: 'game.startup.return_home', input: {} },
                {
                  capabilityId: 'workflow.infrast.custom_shift',
                  input: {
                    plan: snapshot.document,
                    planIndex,
                    sourceSha256: snapshot.sha256,
                    threshold,
                    ...(facilities === undefined ? {} : { facilities }),
                  },
                },
              ],
      };
    },
  });
}
export const getLegacyTaskCompatibility = compileLegacyTask;

/** 输入相关资源检查在取得控制权前运行，目录可用不能代替目标图标及动态章节门禁。 */
export function validateCompiledLegacyTaskInputs(
  compilation: import('#components/legacy').CompiledLegacyTask,
  profiles: AutomationOptions,
): import('#components/legacy').LegacyCompatibilityIssue[] {
  if (!compilation.supported) return [...compilation.issues];
  const issues: import('#components/legacy').LegacyCompatibilityIssue[] = [];
  for (const step of compilation.steps) {
    // 编译输出也复用权威输入校验，避免名单重复／数组限额等静态错误拖到首个导航后才发现。
    const validate = atomicInputValidators[step.capabilityId as keyof typeof atomicInputValidators];
    if (!validate || !validate(step.input)) {
      issues.push({
        field: '',
        code: 'invalid_parameter',
        message: `编译步骤 ${step.capabilityId} 的参数不符合已登记输入契约`,
      });
      continue;
    }
    if (step.capabilityId === 'workflow.infrast.custom_shift') {
      try {
        const plan = parseCustomInfrastPlan(
          step.input.plan,
          Number(step.input.planIndex ?? 0),
          step.input.facilities as import('#components/infrast').AtomicFacility[] | undefined,
        );
        for (const message of checkCustomInfrastPlanResources(profiles.profile, plan))
          issues.push({ field: 'filename', code: 'unavailable_resource', message });
      } catch (error) {
        issues.push({
          field: 'filename',
          code: 'invalid_parameter',
          message: error instanceof Error ? error.message : '自定义基建计划输入无效',
        });
      }
    }
    if (step.capabilityId === 'workflow.fight.legacy_batch') {
      const profile = profiles.dailyProfiles?.fight ?? unavailableProfile('fight');
      for (const message of checkFightInputs(profile, step.input))
        issues.push({ field: 'drops', code: 'unavailable_resource', message });
    }
    if (step.capabilityId === 'workflow.fight.navigate') {
      const profile = profiles.dailyProfiles?.fight,
        route = legacyStageRoute(String(step.input.stage));
      const key = route
        ? `navigation.${route.kind === 'episode' ? 'episode' : 'supply'}.${route.key}`
        : undefined;
      if (!key || !profile?.rules[key])
        issues.push({
          field: 'stage',
          code: 'unavailable_resource',
          message: '当前不可变资源缺少已选关卡的章节或资源入口',
        });
    }
  }
  return issues;
}
