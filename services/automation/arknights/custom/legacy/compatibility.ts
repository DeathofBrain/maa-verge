/**
 * 旧 MAA 任务参数的执行兼容边界：只生成应用维护的能力调用，不修改原任务或解释上游任务图。
 * 保存与执行分别校验；未知字段保持在业务数据中，但不能被新引擎静默忽略。
 */
import type {
  AtomicCapabilityDescriptor,
  AtomicCapabilityResult,
  AtomicExecutionContext,
} from '#automation/core/types';
import { checkCancelled } from '#automation/core/errors';

export type LegacyTask = { type: string; params: Record<string, unknown>; enabled?: boolean };
export type LegacyCompatibilityIssue = { field: string; code: string; message: string };
export type LegacyTaskStep = {
  capabilityId: string;
  input: Record<string, unknown>;
  repeat?: number;
};
export type CompiledLegacyTask = {
  supported: boolean;
  taskType: string;
  clientType: string;
  steps: LegacyTaskStep[];
  issues: LegacyCompatibilityIssue[];
};
export type LegacyTaskOptions = {
  clientType?: string;
  customInfrastPlan?: { document: unknown; sha256: string };
};
/** 功能编译能力由顶层组装；游戏功能之间不互相导入，也不依赖运行时目录。 */
export type LegacyFeatureCompilers = {
  supportsStage?: (stage: string) => boolean;
  compileInfrast?: (
    task: LegacyTask,
    options: LegacyTaskOptions,
  ) => { steps: LegacyTaskStep[]; issues: LegacyCompatibilityIssue[] };
};
export type LegacyTaskExecutor = {
  execute(
    id: string,
    input: Record<string, unknown>,
    context?: AtomicExecutionContext,
  ): Promise<AtomicCapabilityResult>;
};

const own = (value: object, key: string) => Object.hasOwn(value, key);
const empty = (value: unknown) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);

/** 兼容编译完全无副作用；调用方须对整张表预检完成后才连接或输入设备。 */
export function compileLegacyTaskWithFeatures(
  task: LegacyTask,
  options: LegacyTaskOptions = {},
  features: LegacyFeatureCompilers = {},
): CompiledLegacyTask {
  const params = task.params;
  const clientType =
    typeof params.client_type === 'string' && params.client_type
      ? params.client_type
      : ['StartUp', 'CloseDown'].includes(task.type)
        ? 'Official'
        : (options.clientType ?? 'Official');
  const result: CompiledLegacyTask = {
    supported: true,
    taskType: task.type,
    clientType,
    steps: [],
    issues: [],
  };
  const issue = (field: string, message: string, code = 'unsupported_parameter') =>
    result.issues.push({ field, code, message });
  const step = (capabilityId: string, input: Record<string, unknown> = {}, repeat?: number) =>
    result.steps.push({ capabilityId, input, ...(repeat === undefined ? {} : { repeat }) });
  const integer = (field: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) => {
    const value = own(params, field) ? params[field] : fallback;
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
      issue(field, `${field} 必须是 ${min} 到 ${max} 的整数`, 'invalid_parameter');
      return fallback;
    }
    return Number(value);
  };
  const inactive = (fields: readonly string[]) => {
    for (const field of fields)
      if (
        params[field] !== undefined &&
        params[field] !== false &&
        params[field] !== 0 &&
        !empty(params[field])
      )
        issue(field, `当前流程尚不支持 ${field}，原配置已保留`);
  };
  const known = new Set(['enable', 'client_type']);
  const allow = (...fields: string[]) => fields.forEach((field) => known.add(field));
  // 被关闭的任务不授予动作，无需要求其暂存参数已能由当前引擎执行。
  if (task.enabled === false || params.enable === false) return result;
  if (!['Official', 'Bilibili'].includes(clientType))
    issue('client_type', '当前日常流程仅适配官服和哔哩哔哩客户端', 'unsupported_client');
  switch (task.type) {
    case 'StartUp':
      allow('start_game_enabled', 'account_name');
      if (!empty(params.account_name)) issue('account_name', '账号切换尚未迁移，原账号配置已保留');
      if (params.start_game_enabled !== undefined && typeof params.start_game_enabled !== 'boolean')
        issue('start_game_enabled', '启动游戏开关必须为布尔值', 'invalid_parameter');
      step('workflow.startup.start', {
        clientType,
        startGame: params.start_game_enabled !== false,
      });
      break;
    case 'CloseDown':
      step('workflow.startup.close', { clientType });
      break;
    case 'Fight': {
      allow(
        'stage',
        'times',
        'series',
        'medicine',
        'stone',
        'expiring_medicine',
        'medicine_expire_days',
        'drops',
        'drops_enabled',
        'DrGrandet',
        'report_to_penguin',
        'report_to_yituliu',
        'penguin_id',
        'server',
      );
      const times = integer('times', 1, 1, 2147483647);
      const series = integer('series', 1, 1, 6);
      const medicine = integer('medicine', 0, 0, 2147483647);
      const stone = integer('stone', 0, 0, 2147483647);
      inactive([
        'expiring_medicine',
        'medicine_expire_days',
        'DrGrandet',
        'report_to_penguin',
        'report_to_yituliu',
      ]);
      if (typeof params.stage !== 'string' && params.stage !== undefined)
        issue('stage', '关卡必须为文本', 'invalid_parameter');
      const stage = typeof params.stage === 'string' ? params.stage : '';
      if (stage && !features.supportsStage?.(stage))
        issue('stage', '此关卡路由尚未适配；活动、剿灭及难度配置已保留');

      let drops: Record<string, number> | undefined;
      if (params.drops_enabled !== false && params.drops !== undefined) {
        if (
          !params.drops ||
          typeof params.drops !== 'object' ||
          Array.isArray(params.drops) ||
          Object.keys(params.drops).length > 50 ||
          Object.entries(params.drops).some(
            ([id, value]) =>
              !/^[A-Za-z0-9_-]{1,100}$/.test(id) ||
              !Number.isSafeInteger(value) ||
              Number(value) < 1,
          )
        )
          issue('drops', '材料目标必须是资源物品 ID 到正整数数量的映射', 'invalid_parameter');
        else if (Object.keys(params.drops).length) drops = params.drops as Record<string, number>;
      }
      // 每场独立根图，保留旧次数上限；不把旧无限近似次数截断为 Debug 的二十场。
      if (stage) {
        step('game.startup.return_home');
        step('workflow.fight.navigate', { stage });
      }
      step('workflow.fight.legacy_batch', {
        times,
        medicine,
        stone,
        series,
        ...(drops ? { drops } : {}),
      });
      break;
    }
    case 'Award':
      allow('award', 'mail', 'recruit', 'orundum', 'mining', 'specialaccess', 'signinevent');
      inactive(['recruit', 'orundum', 'mining', 'specialaccess', 'signinevent']);
      if (params.award !== false) {
        step('game.startup.return_home');
        step('workflow.award.daily_weekly');
      }
      if (params.mail === true) {
        step('game.startup.return_home');
        step('workflow.award.mail');
      }
      break;
    case 'Mall':
      allow(
        'visit_friends',
        'visit_friends_once_a_day',
        'credit_fight',
        'formation_index',
        'shopping',
        'buy_first',
        'blacklist',
        'force_shopping_if_credit_full',
        'only_buy_discount',
        'reserve_max_credit',
        'credit_budget',
      );
      inactive(['credit_fight']);
      const creditBudget = integer('credit_budget', 0, 0, 2147483647);
      for (const field of [
        'visit_friends',
        'visit_friends_once_a_day',
        'shopping',
        'force_shopping_if_credit_full',
        'only_buy_discount',
        'reserve_max_credit',
      ])
        if (params[field] !== undefined && typeof params[field] !== 'boolean')
          issue(field, `${field} 必须为布尔值`, 'invalid_parameter');
      const list = (field: string) => {
        const value = params[field] ?? [];
        if (
          !Array.isArray(value) ||
          value.length > 50 ||
          !value.every((word) => typeof word === 'string' && word.length <= 200)
        ) {
          issue(field, `${field} 必须是文本列表`, 'invalid_parameter');
          return [];
        }
        return value;
      };
      const buyFirst = list('buy_first'),
        blacklist = list('blacklist');
      if (params.visit_friends === true) {
        step('game.startup.return_home');
        step('workflow.mall.visit_friends', {
          oncePerDay: params.visit_friends_once_a_day === true,
        });
      }
      step('game.startup.return_home');
      step('workflow.mall.collect_credit');
      step('game.mall.close_reward');
      if (params.shopping === true) {
        if (creditBudget <= 0)
          issue(
            'credit_budget',
            '自动购物需要明确正整数总信用额度，默认零额度不会消费',
            'consumable_budget_required',
          );
        step('workflow.mall.shopping', {
          maxCredit: creditBudget,
          buyFirst,
          blacklist,
          onlyDiscount: params.only_buy_discount === true,
          reserveMaxCredit: params.reserve_max_credit === true,
          forceShoppingIfCreditFull: params.force_shopping_if_credit_full === true,
        });
      }
      break;
    case 'Recruit': {
      allow(
        'refresh',
        'force_refresh',
        'select',
        'confirm',
        'times',
        'expedite',
        'expedite_times',
        'set_time',
        'recruitment_time',
        'extra_tags_mode',
        'preserve_tags',
        'first_tags',
        'level3_recruitment_permit_reserve',
        'skip_robot',
        'report_to_penguin',
        'report_to_yituliu',
        'penguin_id',
        'yituliu_id',
        'server',
      );
      inactive(['expedite', 'report_to_penguin', 'report_to_yituliu']);
      const times = integer('times', 0, 0, 2147483647),
        reservePermits = integer('level3_recruitment_permit_reserve', 0, 0, 2147483647),
        extraTagsMode = integer('extra_tags_mode', 0, 0, 2);
      const arrays = (field: string, fallback: unknown[], valid: (value: unknown) => boolean) => {
        const value = params[field] ?? fallback;
        if (!Array.isArray(value) || value.length > 50 || !value.every(valid)) {
          issue(field, `${field} 列表格式无效`, 'invalid_parameter');
          return fallback;
        }
        return value;
      };
      const levels = (value: unknown) =>
        Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6;
      const strings = (value: unknown) => typeof value === 'string' && value.length <= 200;
      const select = arrays('select', [4], levels),
        confirm = arrays('confirm', [3, 4], levels),
        preserveTags = arrays('preserve_tags', [], strings),
        firstTags = arrays('first_tags', [], strings);
      const recruitmentTime = params.recruitment_time ?? { '3': 540, '4': 540, '5': 540, '6': 540 };
      if (
        !recruitmentTime ||
        typeof recruitmentTime !== 'object' ||
        Array.isArray(recruitmentTime) ||
        Object.entries(recruitmentTime).some(
          ([key, value]) =>
            !['3', '4', '5', '6'].includes(key) ||
            !Number.isInteger(value) ||
            Number(value) < 60 ||
            Number(value) > 540 ||
            Number(value) % 10 !== 0,
        )
      )
        issue('recruitment_time', '公招时间必须是 60 到 540 分钟的十分整数', 'invalid_parameter');
      for (const field of ['refresh', 'force_refresh', 'set_time', 'skip_robot'])
        if (params[field] !== undefined && typeof params[field] !== 'boolean')
          issue(field, `${field} 必须为布尔值`, 'invalid_parameter');
      step('game.startup.return_home');
      step('workflow.recruit.daily', {
        times: Math.min(times, 4),
        maxPermits: times,
        reservePermits,
        select,
        confirm,
        preserveTags,
        firstTags,
        recruitmentTime,
        extraTagsMode,
        refresh: params.refresh === true,
        forceRefresh: params.force_refresh !== false,
        setTime: params.set_time !== false,
        skipRobot: params.skip_robot !== false,
      });
      break;
    }
    case 'Infrast': {
      for (const field of Object.keys(params)) known.add(field);
      const compilation = features.compileInfrast?.(task, options);
      if (compilation) {
        result.steps.push(...compilation.steps);
        result.issues.push(...compilation.issues);
      } else issue('', '基建流程尚未完成语义适配，原配置已保留', 'unsupported_task');
      break;
    }
    case 'Depot':
    case 'OperBox':
    case 'UserDataUpdate':
      issue(
        '',
        `${task.type} 的完整业务语义尚未迁移；现有单事件或当前屏观察不能替代完整任务`,
        'unsupported_task',
      );
      for (const field of Object.keys(params)) known.add(field);
      break;
    default:
      issue(
        '',
        `${task.type} 尚未迁移到 MaaFramework；配置、作业和历史继续保留`,
        'unsupported_task',
      );
      for (const field of Object.keys(params)) known.add(field);
  }
  for (const field of Object.keys(params))
    if (!known.has(field))
      issue(field, `未适配参数 ${field}；执行前需明确其语义`, 'unknown_parameter');
  result.supported = result.issues.length === 0;
  if (!result.supported) result.steps = [];
  return result;
}

/** 结合已选不可变资源代的目录检查全部步骤；不存在的能力和缺资源均在输入前暴露。 */
export function validateCompiledLegacyTaskResources(
  compilation: CompiledLegacyTask,
  capabilities: readonly AtomicCapabilityDescriptor[],
): LegacyCompatibilityIssue[] {
  if (!compilation.supported) return [...compilation.issues];
  const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
  return compilation.steps.flatMap((step) => {
    const capability = byId.get(step.capabilityId);
    return capability?.available
      ? []
      : [
          {
            field: '',
            code: capability ? 'unavailable_resource' : 'unsupported_capability',
            message: capability?.unavailableReason ?? `当前执行器未登记能力：${step.capabilityId}`,
          },
        ];
  });
}

/** 正式队列协调器只调用已登记根入口；任何未验证结果立即停止，绝不重放提交。 */
export async function executeCompiledLegacyTask(
  compilation: CompiledLegacyTask,
  executor: LegacyTaskExecutor,
  context: AtomicExecutionContext = {},
): Promise<AtomicCapabilityResult> {
  if (!compilation.supported)
    return {
      status: 'unavailable',
      verified: false,
      data: { issues: compilation.issues },
      message: compilation.issues.map((item) => item.message).join('；'),
    };
  const results: AtomicCapabilityResult[] = [];
  let completedSteps = 0;
  for (const step of compilation.steps) {
    for (let index = 0; index < (step.repeat ?? 1); index++) {
      checkCancelled(context);
      const result = await executor.execute(
        step.capabilityId,
        structuredClone(step.input),
        context,
      );
      // 不累计无限批次的全部结果；宿主逐次持久化进度，当前返回保留最近的证据。
      results.push(result);
      if (results.length > 20) results.shift();
      if (result.status !== 'completed' || !result.verified)
        return {
          ...result,
          data: { completedSteps, results },
          message: result.message ?? '任务停止，已执行步骤不自动重放',
        };
      completedSteps++;
      context.onProgress?.({
        capabilityId: step.capabilityId,
        message: '已完成一个已验证步骤',
        data: { completedSteps, repetition: index + 1, repetitions: step.repeat ?? 1 },
      });
    }
  }
  return { status: 'completed', verified: true, data: { completedSteps, results } };
}
