import runtimeSchema from '../../contracts/schemas/runtime.schema.json';
import rpcSchema from '../../contracts/schemas/rpc.schema.json';
import type { Plan, Task } from '../../contracts/src/types';
import type { CopilotWorkspace, RpcContract } from '../../contracts/src/rpc-types';
import {
  validatePlan,
  validateToolConfig,
  validateCopilotWorkspaceSaveParams,
} from '../../contracts/src/validators.js';
import { assertZeroConsumableProposal } from '../src/proposal-policy';
import type { MaaClientType } from './types';
import { MaaToolError } from './errors';

type ToolConfig = NonNullable<RpcContract['params']['tool.start']['config']>;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const denied = (message: string): never => {
  throw new MaaToolError('policy_denied', message);
};
const reporting = ['report_to_penguin', 'report_to_yituliu'] as const;
const forbiddenTasks = new Set(['VideoRecognition', 'SingleStep', 'OperProgress']);
const copilotTasks = new Set(['Copilot', 'SSSCopilot', 'ParadoxCopilot']);
const planDefaults = Object.fromEntries(
  Object.entries(runtimeSchema.$defs.Plan.properties)
    .filter(([, schema]) => 'default' in schema)
    .map(([key, schema]) => [key, (schema as { default: unknown }).default]),
);

function count(value: unknown, label: string, max: number, min = 1): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    denied(`${label}必须是 ${min} 到 ${max} 之间的整数`);
}

/** Validate the same bounded JSON tree that will be forwarded to the host. */
function assertNoAmbientCapabilities(value: unknown, depth = 0): void {
  if (depth > 32) denied('任务参数嵌套过深');
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoAmbientCapabilities(item, depth + 1));
    return;
  }
  if (object(value)) {
    if (Object.getOwnPropertySymbols(value).length) denied('任务参数必须使用 JSON 文本键');
    for (const [key, item] of Object.entries(value)) {
      const normalized = key.toLowerCase().replaceAll('_', '').replaceAll('-', '');
      if (
        ['shell', 'command', 'script', 'adb', '__proto__', 'constructor', 'prototype'].includes(
          key.toLowerCase(),
        )
      )
        denied('Agent 工具不接受任意命令');
      if (
        normalized.includes('filename') ||
        normalized.includes('filepath') ||
        normalized.includes('directory') ||
        normalized.endsWith('path') ||
        ['file', 'dir', 'folder', 'root'].includes(normalized)
      )
        denied('Agent 工具不接受本地文件或目录路径');
      if (normalized === 'accountname' && item !== '') denied('Agent 工具不接受切换账号');
      assertNoAmbientCapabilities(item, depth + 1);
    }
    return;
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return;
  denied('任务参数必须是有效 JSON 数据');
}

function assertClient(clientType: MaaClientType): void {
  if (!(rpcSchema.$defs.ClientType.enum as readonly string[]).includes(clientType))
    denied('宿主绑定的客户端无效');
}

function assertTask(task: Task, clientType: MaaClientType, preparing: boolean): void {
  if (forbiddenTasks.has(task.type)) denied(`${task.type} 尚未开放给 Agent 执行`);
  if (copilotTasks.has(task.type)) denied('作业必须使用已导入的作业工作区执行，不接受原始文件任务');
  const params = task.params;
  assertNoAmbientCapabilities(params);
  if (Object.hasOwn(params, 'client_type') && params.client_type !== clientType)
    denied('任务客户端必须与宿主绑定的客户端一致');
  if (
    !preparing &&
    ['StartUp', 'CloseDown'].includes(task.type) &&
    !Object.hasOwn(params, 'client_type') &&
    clientType !== 'Official'
  )
    denied('已保存的启动或关闭任务未明确绑定当前客户端');
  for (const field of reporting)
    if (Object.hasOwn(params, field) && params[field] !== false) denied('Agent 工具不允许上传统计');
  if (task.type === 'Fight')
    count(Object.hasOwn(params, 'times') ? params.times : 1, '作战次数', 100);
  if (task.type === 'Roguelike') {
    const starts = Object.hasOwn(params, 'starts_count')
      ? params.starts_count
      : preparing
        ? 1
        : undefined;
    count(starts, '肉鸽启动次数', 10);
  }
  if (task.type === 'Custom') {
    const names = params.task_names;
    if (
      !Array.isArray(names) ||
      !names.length ||
      names.some(
        (name) =>
          typeof name !== 'string' ||
          !(
            name === 'MiniGame@PixelPaint@Begin' ||
            /^MiniGame@SecretFront@Begin@Ending[A-E](?:@[A-Za-z0-9_]{1,80})?(?![\s\S])/u.test(name)
          ),
      )
    )
      denied('仅允许应用已审核的小游戏资源入口');
  }
}

function assertZero(tasks: Task[]): void {
  try {
    assertZeroConsumableProposal(tasks);
  } catch {
    denied('Agent 工具仅支持零源石、零理智药和零加急消耗');
  }
}

export function prepareAgentTaskDraft(
  input: { name: string; tasks: Task[] },
  clientType: MaaClientType,
): unknown {
  assertClient(clientType);
  if (!validatePlan({ ...planDefaults, ...input }))
    throw new MaaToolError('invalid_parameters', '任务草稿不符合任务表契约');
  assertZero(input.tasks);
  input.tasks.forEach((task) => assertTask(task, clientType, true));
  const tasks = structuredClone(input.tasks);
  for (const task of tasks) {
    if (['StartUp', 'CloseDown'].includes(task.type)) task.params.client_type = clientType;
    if (task.type === 'Fight' && !Object.hasOwn(task.params, 'times')) task.params.times = 1;
    if (task.type === 'Roguelike' && !Object.hasOwn(task.params, 'starts_count'))
      task.params.starts_count = 1;
    if (['Fight', 'Recruit', 'Roguelike'].includes(task.type))
      for (const field of reporting) task.params[field] = false;
  }
  return { id: '', name: input.name, tasks };
}

export function assertAgentExecutablePlan(plan: Plan, clientType: MaaClientType): void {
  assertClient(clientType);
  if (!validatePlan(plan)) throw new MaaToolError('invalid_parameters', '已保存任务表不符合契约');
  assertZero(plan.tasks);
  plan.tasks.forEach((task) => assertTask(task, clientType, false));
}

export function assertAgentToolConfig(config: ToolConfig): void {
  if (!validateToolConfig(config))
    throw new MaaToolError('invalid_parameters', '工具配置不符合契约');
  assertNoAmbientCapabilities(config);
  for (const target of config.targets ?? []) {
    count(target.quantity, '补货目标数量', 1000);
    if (target.medicine !== 0 || target.stone !== 0) denied('库存补货仅支持零理智药、零源石消耗');
  }
}

export function assertAgentCopilotWorkspace(workspace: CopilotWorkspace): void {
  if (!validateCopilotWorkspaceSaveParams({ workspace }))
    throw new MaaToolError('invalid_parameters', '作业工作区不符合契约');
  assertNoAmbientCapabilities(workspace);
  count(workspace.options.loopTimes, '作业循环次数', 10);
  if (workspace.options.autoLikeOnSuccess === true) denied('Agent 执行作业不允许自动发送社区评价');
  if (!workspace.queue.some((entry) => entry.enabled)) denied('作业工作区没有启用的已有作业');
}
