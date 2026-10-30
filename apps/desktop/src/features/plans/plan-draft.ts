import {
  defaultDailyTaskTypes,
  planDeviceIds,
  taskDefaults,
  taskLabels,
  type Plan,
  type Settings,
} from '@maaverge/contracts';
import { clients } from './task-fields';

type Task = Plan['tasks'][number];

export type Step = { key: string; task: Task; json: string };
export const createStep = (type: string, initialParams?: Task['params']): Step => {
  const params = {
    ...structuredClone(taskDefaults[type] || {}),
    ...structuredClone(initialParams || {}),
  };
  return {
    key: crypto.randomUUID(),
    task: { type: type as Task['type'], params, enabled: true },
    json: JSON.stringify(params, null, 2),
  };
};

export type Budgets = Settings['budgets'];
export type Metadata = { description?: string; deviceId?: string | null; budgets?: Budgets | null };
export type WorkbenchPlan = Plan & Metadata;
export type Tab = 'tasks' | 'settings' | 'schedule';
export type Draft = {
  id: string;
  name: string;
  description: string;
  deviceIds: string[];
  budgets: Budgets | null;
  steps: Step[];
  selected: number;
  tab: Tab;
  base: string;
};
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function fingerprint(plan: WorkbenchPlan): string {
  return stable({
    name: plan.name,
    description: plan.description || '',
    deviceIds: planDeviceIds(plan),
    budgets: plan.budgets || null,
    tasks: plan.tasks,
  });
}
export function focusedTaskIndex(steps: Step[], type?: Task['type'], index?: number): number {
  if (index !== undefined)
    return Number.isInteger(index) &&
      index >= 0 &&
      index < steps.length &&
      (!type || steps[index].task.type === type)
      ? index
      : -1;
  return type ? steps.findIndex((entry) => entry.task.type === type) : -1;
}
export function createDraft(
  plan: Plan | 'new',
  focus?: Task['type'],
  initialParams?: Task['params'],
  focusTaskIndex?: number,
  defaultName = '日常表1',
): Draft {
  const current = plan === 'new' ? null : (plan as WorkbenchPlan);
  const types = focus ? [focus] : defaultDailyTaskTypes;
  const steps = current
    ? current.tasks.map((task) => ({
        key: crypto.randomUUID(),
        task: structuredClone(task),
        json: JSON.stringify(task.params, null, 2),
      }))
    : types.map((type) => createStep(type, focus ? initialParams : undefined));
  const requestedIndex = focusedTaskIndex(steps, focus, focusTaskIndex);
  return {
    id: current?.id || crypto.randomUUID(),
    name: current?.name || defaultName,
    description: current?.description || '',
    deviceIds: current ? [...planDeviceIds(current)] : [],
    budgets: current?.budgets ? structuredClone(current.budgets) : null,
    steps,
    selected:
      requestedIndex >= 0
        ? requestedIndex
        : Math.max(
            0,
            steps.findIndex((entry) => entry.task.type === 'Fight'),
          ),
    tab: 'tasks',
    base: current ? fingerprint(current) : '',
  };
}
export function loadDraft(
  cacheKey: string,
  plan: Plan | 'new',
  focus?: Task['type'],
  initialParams?: Task['params'],
  focusTaskIndex?: number,
  defaultName?: string,
  initialTab?: Tab,
): Draft {
  try {
    const value = JSON.parse(sessionStorage.getItem(cacheKey) || 'null') as Draft | null;
    if (
      value &&
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      Array.isArray(value.steps) &&
      value.steps.length <= 30 &&
      value.steps.every(
        (entry) => typeof entry.json === 'string' && entry.task && taskLabels[entry.task.type],
      ) &&
      ['tasks', 'settings', 'schedule'].includes(value.tab)
    )
      return {
        ...value,
        deviceIds: [...planDeviceIds(value as Draft & Plan)],
        ...(initialTab ? { tab: initialTab } : {}),
      };
  } catch {
    /* Session recovery is optional; saved plans remain in the runtime. */
  }
  return {
    ...createDraft(plan, focus, initialParams, focusTaskIndex, defaultName),
    ...(initialTab ? { tab: initialTab } : {}),
  };
}
export function discardPlanDraft(planId: string) {
  try {
    sessionStorage.removeItem(`maaverge.ui.draft.${planId}`);
  } catch {
    /* Optional draft cache. */
  }
}
export function draftPlan(
  draft: Draft,
  source: Plan | 'new',
  tasks = draft.steps.map((entry) => entry.task),
): WorkbenchPlan {
  return {
    ...(source === 'new' ? {} : source),
    id: draft.id,
    name: draft.name.trim(),
    tasks: tasks as Plan['tasks'],
    enabled: true,
    schedule: source === 'new' ? null : source.schedule,
    description: draft.description,
    deviceId: draft.deviceIds[0] ?? null,
    deviceIds: draft.deviceIds,
    group: source === 'new' ? 'daily' : source.group,
    budgets: draft.budgets,
  };
}
export function parseDraft(draft: Draft, source: Plan | 'new'): WorkbenchPlan {
  if (!draft.name.trim()) throw new Error('请给任务表起一个名字');
  if (!draft.steps.length) throw new Error('请至少添加一个任务');
  const tasks = draft.steps.map((entry, index) => {
    try {
      const params = JSON.parse(entry.json);
      if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error();
      return { ...entry.task, params };
    } catch {
      throw new Error(`第 ${index + 1} 条任务的高级参数必须是有效 JSON 对象`);
    }
  });
  return draftPlan(draft, source, tasks);
}
export function draftVersion(draft: Draft): string {
  return stable({ ...draftPlan(draft, 'new'), json: draft.steps.map((entry) => entry.json) });
}
export function cacheSavedDraft(cacheKey: string, captured: Draft, value: Plan) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null') as Draft | null;
    if (cached?.id !== captured.id || draftVersion(cached) !== draftVersion(captured)) return;
    const next = { ...cached, name: value.name, base: fingerprint(value) };
    sessionStorage.setItem(`maaverge.ui.draft.${value.id}`, JSON.stringify(next));
    if (cacheKey !== `maaverge.ui.draft.${value.id}`) sessionStorage.removeItem(cacheKey);
  } catch {
    /* Optional recovery cache. */
  }
}
export function taskSummary(task: Task): string {
  const p = task.params;
  const filename = String(p.filename || '')
    .split(/[\\/]/)
    .pop();
  switch (task.type) {
    case 'StartUp':
      return `${clients.find(([id]) => id === p.client_type)?.[1] || '当前客户端'} · ${p.start_game_enabled === false ? '仅唤醒' : '启动游戏'}`;
    case 'CloseDown':
      return '关闭当前游戏客户端';
    case 'Fight':
      return `${String(p.stage || '当前关卡')} · ${p.times === 2147483647 ? '不限次数' : p.times === undefined ? '次数用核心默认' : `${String(p.times)} 次`} · ${Number(p.medicine) > 0 ? `理智药 ${p.medicine}` : '零用药'}${Number(p.stone) > 0 ? ` · 源石 ${p.stone}` : ''}`;
    case 'Recruit':
      return `${Number(p.times) === 0 ? '仅计算标签' : `${p.times === undefined ? '次数用核心默认' : `${String(p.times)} 次招募`}`} · ${p.expedite ? '使用加急' : '不加急'}`;
    case 'Infrast':
      return `${Number(p.mode) === 10000 ? '自定义排班' : Number(p.mode) === 20000 ? '轮换排班' : '默认排班'} · ${Array.isArray(p.facility) ? `${p.facility.length} 个设施` : '设施用核心默认'}`;
    case 'Mall':
      return `${p.shopping === false ? '仅领取信用' : '信用购物'} · ${p.only_buy_discount ? '仅折扣商品' : '按优先级购买'}`;
    case 'Award':
      return (
        [p.award && '任务', p.mail && '邮件', p.signinevent && '签到', p.recruit && '免费招募']
          .filter(Boolean)
          .join(' · ') || '按奖励开关领取'
      );
    case 'SwitchTheme':
      return Array.isArray(p.themes) && p.themes.length ? p.themes.join(' / ') : '未设置候选主题';
    case 'Roguelike':
      return `${String(p.theme || '未选主题')} · ${p.mode === undefined ? '模式用核心默认' : `模式 ${String(p.mode)}`} · ${p.starts_count === undefined ? '次数用核心默认' : `${String(p.starts_count)} 次`}`;
    case 'Reclamation':
      return `${p.theme === 'RelaunchAnchor' ? '重启锚点' : '沙洲遗闻'} · 模式 ${String(p.mode ?? 0)}`;
    case 'Copilot':
    case 'SSSCopilot':
    case 'ParadoxCopilot':
      return (
        filename ||
        (Array.isArray(p.copilot_list) ? `${p.copilot_list.length} 份作业` : '未选择作业文件')
      );
    case 'VideoRecognition':
      return filename || '未选择视频文件';
    case 'Depot':
      return '仓库物品与数量';
    case 'OperBox':
      return '干员与练度信息';
    case 'UserDataUpdate':
      return `${[p.operators !== false && '干员', p.depot !== false && '仓库'].filter(Boolean).join(' / ') || '未选择识别项目'} · ${p.interval === 'daily' ? '每日' : p.interval === 'weekly' ? '每周' : '每次'}`;
    case 'OperProgress':
      return `${Array.isArray(p.plans) ? p.plans.length : 0} 项养成目标 · 消耗材料`;
    case 'Custom':
      return Array.isArray(p.task_names)
        ? p.task_names.join(' · ') || '未设置流程入口'
        : '未设置流程入口';
    case 'SingleStep':
      return `单步操作 · ${String(p.subtype || '未设置')}`;
    default:
      return '独立任务设置';
  }
}
