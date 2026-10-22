import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, CalendarClock, Check, ChevronDown, Copy, FileText, GripVertical, Info, ListChecks, LoaderCircle, Play, Plus, RotateCcw, Search, Settings2, ShieldCheck, Trash2, X } from 'lucide-react';
import { taskDefaults, defaultDailyTaskTypes, taskEnabled, taskLabels, type Device, type Plan, type Settings, type RpcParams } from '@maaverge/contracts';
import TaskParameterField, { type Field } from './TaskParameterField';
import { TaskConnectionSettings } from './TaskConnectionSettings';
import './plan-workbench.css';

type Task = Plan['tasks'][number];
type Step = { key: string; task: Task; json: string };
const clients: [string, string][] = [['Official', '官服'], ['Bilibili', 'B 服'], ['YoStarEN', '国际服'], ['YoStarJP', '日服'], ['YoStarKR', '韩服'], ['txwy', '繁中服']];
const fields: Record<string, Field[]> = {
  StartUp: [{ key: 'client_type', label: '游戏客户端', kind: 'select', options: clients }, { key: 'start_game_enabled', label: '自动启动游戏', kind: 'check' }, { key: 'account_name', label: '切换账号标识', kind: 'account', hint: '填写已在游戏登录的账号显示名的唯一片段；留空不切换。' }],
  CloseDown: [{ key: 'client_type', label: '游戏客户端', kind: 'select', options: clients }],
  Fight: [{ key: 'stage', label: '作战关卡', kind: 'stage', hint: '预设与原版关卡对应；也可直接输入活动关卡代码。关卡开放与可代理状态由游戏和当前资源决定。' }, { key: 'times', label: '作战次数', kind: 'limit', min: 1, max: 2147483647 }, { key: 'drops', label: '指定材料', kind: 'drops' }, { key: 'medicine', label: '理智药上限', kind: 'limit', min: 0, max: 100, hint: '取消勾选为 0；用药量仍受任务表和应用授权上限约束。' }, { key: 'stone', label: '源石上限', kind: 'limit', min: 0, max: 100 }, { key: 'series', label: '代理倍率', kind: 'select', numeric: true, options: [['0', 'AUTO · 自动识别最大倍率'], ['-1', '不切换 · 保留游戏内设置'], ...Array.from({ length: 10 }, (_, index): [string, string] => [String(index + 1), `${index + 1} 倍`])], hint: 'AUTO 保持可用最大倍率；固定倍率需要足够的理智和剩余次数。不切换时保留游戏内设置。' }, { key: 'DrGrandet', label: '源石使用前等待理智恢复', kind: 'check' }, { key: 'report_to_penguin', label: '上传掉落至企鹅物流', kind: 'check' }, { key: 'report_to_yituliu', label: '上传掉落至一图流', kind: 'check' }],
  Recruit: [{ key: 'times', label: '招募次数', kind: 'number', min: 0, max: 2147483647, hint: '每次执行时最大招募次数；0 表示只识别标签，不开始招募。' }, { key: 'select', label: '选择星级', kind: 'stars' }, { key: 'confirm', label: '自动确认星级与招募时长', kind: 'recruit-confirm' }, { key: 'set_time', label: '自动设置招募时长', kind: 'check' }, { key: 'refresh', label: '自动刷新标签', kind: 'check' }, { key: 'expedite', label: '自动使用加急许可', kind: 'check', disabled: true, hint: '尚未开放：当前核心忽略加急次数限制，需要补齐可靠消耗控制。' }, { key: 'skip_robot', label: '跳过支援机械', kind: 'check' }, { key: 'extra_tags_mode', label: '额外标签策略', kind: 'select', numeric: true, options: [['0', '默认'], ['1', '选择更多标签'], ['2', '选择稀有标签']] }],
  Infrast: [{ key: 'facility', label: '换班设施与顺序', kind: 'facilities', hint: '勾选需要处理的设施；既有执行顺序保留，新勾选的设施添加到末尾。' }, { key: 'drones', label: '无人机用途', kind: 'select', options: [['_NotUse', '不使用'], ['Money', '贸易站 · 龙门币'], ['SyntheticJade', '贸易站 · 合成玉'], ['CombatRecord', '制造站 · 作战记录'], ['PureGold', '制造站 · 赤金'], ['OriginStone', '制造站 · 源石碎片'], ['Chip', '制造站 · 芯片']] }, { key: 'threshold', label: '换班心情阈值', kind: 'threshold', min: 0, max: 1, step: 0.05, hint: '低于此心情比例时替换干员。' }, { key: 'mode', label: '换班模式', kind: 'select', options: [['0', '常规模式'], ['10000', '自定义排班'], ['20000', '一键轮换']] }, { key: 'filename', label: '自定义排班文件路径' }, { key: 'plan_index', label: '排班方案序号', kind: 'number', min: 0 }, { key: 'dorm_notstationed_enabled', label: '宿舍优先未进驻干员', kind: 'check' }, { key: 'reception_message_board', label: '会客室信息板收取信用', kind: 'check' }, { key: 'reception_clue_exchange', label: '进行线索交流', kind: 'check' }, { key: 'reception_send_clue', label: '赠送线索', kind: 'check' }],
  Mall: [{ key: 'visit_friends', label: '访问好友收取信用', kind: 'check' }, { key: 'visit_friends_once_a_day', label: '访问好友一日只执行一次', kind: 'check' }, { key: 'credit_fight', label: '借助战打 OF-1 赚信用', kind: 'check' }, { key: 'formation_index', label: '借助战使用编队', kind: 'select', numeric: true, options: [['0', '当前编队'], ['1', '编队 1'], ['2', '编队 2'], ['3', '编队 3'], ['4', '编队 4']] }, { key: 'shopping', label: '信用交易所自动购物', kind: 'check' }, { key: 'buy_first', label: '优先购买', kind: 'list' }, { key: 'blacklist', label: '购买黑名单', kind: 'list' }, { key: 'force_shopping_if_credit_full', label: '信用溢出时忽略黑名单', kind: 'check' }, { key: 'only_buy_discount', label: '只购买打折商品', kind: 'check' }],
  Award: ['award:领取每日 / 每周任务奖励', 'mail:领取所有邮件奖励', 'recruit:进行限定池赠送的每日免费单抽', 'orundum:领取幸运墙的每日合成玉奖励', 'mining:领取限时开采许可的每日合成玉奖励', 'specialaccess:领取周年赠送月卡奖励', 'signinevent:领取限时签到活动奖励'].map((entry) => { const [key, label] = entry.split(':'); return { key, label, kind: 'check' }; }),
  UserDataUpdate: [{ key: 'operators', label: '干员识别', kind: 'check' }, { key: 'depot', label: '仓库识别', kind: 'check' }, { key: 'interval', label: '触发间隔', kind: 'select', options: [['always', '每次'], ['daily', '每日'], ['weekly', '每周']] }],
  SwitchTheme: [{ key: 'themes', label: '候选主题名称', kind: 'list', hint: '填写游戏内的完整名称，逗号分隔；留空跳过。' }],
  Roguelike: [{ key: 'theme', label: '集成战略主题', kind: 'select', options: [['Phantom', '傀影与猩红孤钻'], ['Mizuki', '水月与深蓝之树'], ['Sami', '探索者的银凇止境'], ['Sarkaz', '萨卡兹的无终奇语'], ['JieGarden', '岁的界园志异'], ['BlackFlow', '黑流']] }, { key: 'mode', label: '运行模式', kind: 'number', min: 0, hint: '0 刷分、1 刷源石锭；其他模式按所选主题填写。' }, { key: 'starts_count', label: '开始探索次数', kind: 'number', min: 1 }, { key: 'investment_enabled', label: '投资源石锭', kind: 'check' }, { key: 'stop_when_investment_full', label: '投资满额后停止', kind: 'check' }, { key: 'squad', label: '分队名称' }, { key: 'roles', label: '开局招募组合' }, { key: 'core_char', label: '核心干员' }, { key: 'use_support', label: '使用助战', kind: 'check' }],
  Reclamation: [{ key: 'theme', label: '生息演算主题', kind: 'select', options: [['Tales', '沙洲遗闻'], ['RelaunchAnchor', '重启锚点']] }, { key: 'mode', label: '运行模式', kind: 'number', min: 0, hint: '沙洲遗闻：0 无存档、1 有存档；重启锚点：16 / 32 / 48。' }, { key: 'tools_to_craft', label: '制造物品', kind: 'list' }, { key: 'num_craft_batches', label: '最大制造轮数', kind: 'number', min: 1 }, { key: 'clear_store', label: '完成后清空商店', kind: 'check' }],
  Copilot: [{ key: 'filename', label: '作业文件路径', hint: '使用本机作业 JSON 文件；作业列表可在高级参数中配置；使用列表时移除 filename。' }, { key: 'loop_times', label: '循环次数', kind: 'number', min: 1 }, { key: 'formation', label: '自动编队', kind: 'check' }, { key: 'formation_index', label: '编队序号', kind: 'number', min: 1, max: 4 }, { key: 'add_trust', label: '补充信赖干员', kind: 'check' }, { key: 'ignore_requirements', label: '忽略练度要求', kind: 'check' }],
  SSSCopilot: [{ key: 'filename', label: '保全作业文件路径' }, { key: 'loop_times', label: '循环次数', kind: 'number', min: 1 }],
  ParadoxCopilot: [{ key: 'filename', label: '悖论作业文件路径', hint: '多份作业可在高级参数的 list 中配置；使用列表时移除 filename。' }],
  VideoRecognition: [{ key: 'filename', label: '视频文件路径' }],
  Custom: [{ key: 'task_names', label: '资源任务入口', kind: 'list', hint: '当前仅接受已审核的入口；未审核任务会被策略拒绝。' }],
  SingleStep: [{ key: 'type', label: '任务协议', kind: 'select', options: ['copilot'] }, { key: 'subtype', label: '步骤类型', kind: 'select', options: [['stage', '设置关卡'], ['start', '开始作战'], ['action', '战斗动作']] }],
};
export const taskFieldSearch = Object.entries(fields).flatMap(([type, entries]) => entries.map(({ key, label }) => ({ type: type as Task['type'], key, label })));

const createStep = (type: string, initialParams?: Task['params']): Step => {
  const params = { ...structuredClone(taskDefaults[type] || {}), ...structuredClone(initialParams || {}) };
  return { key: crypto.randomUUID(), task: { type: type as Task['type'], params, enabled: true }, json: JSON.stringify(params, null, 2) };
};

type Budgets = Settings['budgets'];
type Group = 'daily' | 'specialized';
type Metadata = { description?: string; deviceId?: string | null; group?: Group; budgets?: Budgets | null };
type WorkbenchPlan = Plan & Metadata;
type Tab = 'tasks' | 'settings' | 'schedule';
type Draft = {
  id: string; name: string; description: string; deviceId: string | null; group: Group;
  budgets: Budgets | null; enabled: boolean; steps: Step[]; selected: number;
  tab: Tab; base: string;
};
type Props = {
  plan: Plan | 'new'; devices?: Device[]; settings?: Settings; running?: boolean; unsaved?: boolean;
  selectedDeviceId?: string;
  busyDeviceIds?: string[];
  onSaveSettings?: (settings: Settings) => Promise<boolean>;
  onSave: (plan: Plan) => Promise<boolean>; onStart?: (plan: Plan) => Promise<boolean>;
  onDelete?: (plan: Plan) => void; onClose?: () => void; onSaved?: (plan: Plan) => void;
  initialGroup?: Group; defaultName?: string; focusTaskType?: Task['type']; focusTaskIndex?: number; initialParams?: Task['params']; searchQuery?: string;
};
const zeroBudgets: Budgets = { medicine: 0, originium: 0, expedited: 0 };
const budgetNames = [['medicine', '理智药'], ['originium', '源石'], ['expedited', '加急许可']] as const;
const taskCategories: Record<string, string> = {
  StartUp: '日常', Fight: '日常', Recruit: '日常', Infrast: '日常', Mall: '日常', Award: '日常', CloseDown: '日常', SwitchTheme: '日常',
  Roguelike: '专项', Reclamation: '专项', OperProgress: '专项', Copilot: '作业', SSSCopilot: '作业', ParadoxCopilot: '作业', VideoRecognition: '作业',
  Depot: '工具', OperBox: '工具', UserDataUpdate: '日常', Custom: '高级', SingleStep: '高级',
};
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function fingerprint(plan: WorkbenchPlan): string {
  return stable({ name: plan.name, description: plan.description || '', deviceId: plan.deviceId || null, group: plan.group || 'daily', budgets: plan.budgets || null, enabled: plan.enabled, tasks: plan.tasks });
}
function focusedTaskIndex(steps: Step[], type?: Task['type'], index?: number): number {
  if (index !== undefined) return Number.isInteger(index) && index >= 0 && index < steps.length && (!type || steps[index].task.type === type) ? index : -1;
  return type ? steps.findIndex((entry) => entry.task.type === type) : -1;
}
function createDraft(plan: Plan | 'new', group: Group, focus?: Task['type'], initialParams?: Task['params'], focusTaskIndex?: number, defaultName = group === 'daily' ? '日常表1' : '专项表1'): Draft {
  const current = plan === 'new' ? null : plan as WorkbenchPlan;
  const types = focus ? [focus] : group === 'specialized' ? ['Roguelike'] : defaultDailyTaskTypes;
  const steps = current ? current.tasks.map((task) => ({ key: crypto.randomUUID(), task: structuredClone(task), json: JSON.stringify(task.params, null, 2) })) : types.map((type) => createStep(type, focus ? initialParams : undefined));
  const requestedIndex = focusedTaskIndex(steps, focus, focusTaskIndex);
  return { id: current?.id || crypto.randomUUID(), name: current?.name || defaultName, description: current?.description || '', deviceId: current?.deviceId || null, group: current?.group || group, budgets: current?.budgets ? structuredClone(current.budgets) : null, enabled: current?.enabled ?? true, steps, selected: requestedIndex >= 0 ? requestedIndex : Math.max(0, steps.findIndex((entry) => entry.task.type === 'Fight')), tab: 'tasks', base: current ? fingerprint(current) : '' };
}
function loadDraft(cacheKey: string, plan: Plan | 'new', group: Group, focus?: Task['type'], initialParams?: Task['params'], focusTaskIndex?: number, defaultName?: string): Draft {
  try {
    const value = JSON.parse(sessionStorage.getItem(cacheKey) || 'null') as Draft | null;
    if (value && typeof value.id === 'string' && typeof value.name === 'string' && Array.isArray(value.steps) && value.steps.length <= 30 && value.steps.every((entry) => typeof entry.json === 'string' && entry.task && taskLabels[entry.task.type]) && ['tasks', 'settings', 'schedule'].includes(value.tab)) return value;
  } catch { /* Session recovery is optional; saved plans remain in the runtime. */ }
  return createDraft(plan, group, focus, initialParams, focusTaskIndex, defaultName);
}
function draftPlan(draft: Draft, source: Plan | 'new', tasks = draft.steps.map((entry) => entry.task)): WorkbenchPlan {
  return { ...(source === 'new' ? {} : source), id: draft.id, name: draft.name.trim(), tasks: tasks as Plan['tasks'], enabled: draft.enabled, schedule: source === 'new' ? null : source.schedule, description: draft.description, deviceId: draft.deviceId, group: draft.group, budgets: draft.budgets };
}
export function taskSummary(task: Task): string {
  const p = task.params;
  const filename = String(p.filename || '').split(/[\\/]/).pop();
  switch (task.type) {
    case 'StartUp': return `${clients.find(([id]) => id === p.client_type)?.[1] || '当前客户端'} · ${p.start_game_enabled === false ? '仅唤醒' : '启动游戏'}`;
    case 'CloseDown': return '关闭当前游戏客户端';
    case 'Fight': return `${String(p.stage || '当前关卡')} · ${p.times === 2147483647 ? '不限次数' : p.times === undefined ? '次数用核心默认' : `${String(p.times)} 次`} · ${Number(p.medicine) > 0 ? `理智药 ${p.medicine}` : '零用药'}${Number(p.stone) > 0 ? ` · 源石 ${p.stone}` : ''}`;
    case 'Recruit': return `${Number(p.times) === 0 ? '仅计算标签' : `${p.times === undefined ? '次数用核心默认' : `${String(p.times)} 次招募`}`} · ${p.expedite ? '使用加急' : '不加急'}`;
    case 'Infrast': return `${Number(p.mode) === 10000 ? '自定义排班' : Number(p.mode) === 20000 ? '轮换排班' : '默认排班'} · ${Array.isArray(p.facility) ? `${p.facility.length} 个设施` : '设施用核心默认'}`;
    case 'Mall': return `${p.shopping === false ? '仅领取信用' : '信用购物'} · ${p.only_buy_discount ? '仅折扣商品' : '按优先级购买'}`;
    case 'Award': return [p.award && '任务', p.mail && '邮件', p.signinevent && '签到', p.recruit && '免费招募'].filter(Boolean).join(' · ') || '按奖励开关领取';
    case 'SwitchTheme': return Array.isArray(p.themes) && p.themes.length ? p.themes.join(' / ') : '未设置候选主题';
    case 'Roguelike': return `${String(p.theme || '未选主题')} · ${p.mode === undefined ? '模式用核心默认' : `模式 ${String(p.mode)}`} · ${p.starts_count === undefined ? '次数用核心默认' : `${String(p.starts_count)} 次`}`;
    case 'Reclamation': return `${p.theme === 'RelaunchAnchor' ? '重启锚点' : '沙洲遗闻'} · 模式 ${String(p.mode ?? 0)}`;
    case 'Copilot': case 'SSSCopilot': case 'ParadoxCopilot': return filename || (Array.isArray(p.copilot_list) ? `${p.copilot_list.length} 份作业` : '未选择作业文件');
    case 'VideoRecognition': return filename || '未选择视频文件';
    case 'Depot': return '仓库物品与数量';
    case 'OperBox': return '干员与练度信息';
    case 'UserDataUpdate': return `${[p.operators !== false && '干员', p.depot !== false && '仓库'].filter(Boolean).join(' / ') || '未选择识别项目'} · ${p.interval === 'daily' ? '每日' : p.interval === 'weekly' ? '每周' : '每次'}`;
    case 'OperProgress': return `${Array.isArray(p.plans) ? p.plans.length : 0} 项养成目标 · 消耗材料`;
    case 'Custom': return Array.isArray(p.task_names) ? p.task_names.join(' · ') || '未设置流程入口' : '未设置流程入口';
    case 'SingleStep': return `单步操作 · ${String(p.subtype || '未设置')}`;
    default: return '独立任务设置';
  }
}
type FieldGroup = { title: string; fields: Field[]; expanded: boolean };
function fieldGroups(type: Task['type']): FieldGroup[] {
  const available = fields[type] || [];
  const definitions: [string, string[], boolean][] = type === 'Fight' ? [
    ['关卡与目标', ['stage', 'times', 'drops'], true], ['消耗上限', ['medicine', 'stone', 'DrGrandet'], true], ['执行方式', ['series'], true], ['掉落与数据汇报', ['report_to_penguin', 'report_to_yituliu'], false],
  ] : type === 'Infrast' ? [
    ['排班方案', ['mode', 'filename', 'plan_index'], true], ['设施与换班', ['facility', 'threshold'], true], ['无人机策略', ['drones'], true], ['信用与线索', ['reception_message_board', 'reception_clue_exchange', 'reception_send_clue'], true], ['其他设置', ['dorm_notstationed_enabled'], false],
  ] : type === 'Recruit' ? [
    ['招募与标签', ['times', 'confirm', 'set_time'], true], ['招募策略', ['select', 'refresh', 'skip_robot', 'extra_tags_mode'], false], ['加急设置', ['expedite'], true],
  ] : type === 'Roguelike' ? [
    ['主题与目标', ['theme', 'mode', 'starts_count'], true], ['开局编队', ['squad', 'roles', 'core_char', 'use_support'], true], ['投资策略', ['investment_enabled', 'stop_when_investment_full'], false],
  ] : type === 'Mall' ? [
    ['信用获取', ['visit_friends', 'visit_friends_once_a_day', 'credit_fight', 'formation_index'], true], ['信用购物', ['shopping', 'buy_first', 'blacklist'], true], ['购买策略', ['force_shopping_if_credit_full', 'only_buy_discount'], false],
  ] : [['任务设置', available.map((field) => field.key), true]];
  return definitions.map(([title, keys, expanded]) => ({ title, fields: keys.flatMap((key) => available.filter((field) => field.key === key)), expanded })).filter((group) => group.fields.length);
}

export default function PlanEditor({ plan, devices = [], settings, selectedDeviceId, busyDeviceIds = [], onSaveSettings, running = false, unsaved = false, onSave, onStart, onDelete, onClose, onSaved, initialGroup = 'daily', defaultName, focusTaskType, focusTaskIndex, initialParams, searchQuery = '' }: Props) {
  const cacheKey = `maaverge.ui.draft.${plan === 'new' ? `new:${initialGroup}:${focusTaskType || 'default'}:${stable(initialParams || {})}` : plan.id}`;
  const [draft, setDraft] = useState<Draft>(() => loadDraft(cacheKey, plan, initialGroup, focusTaskType, initialParams, focusTaskIndex, defaultName));
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [addType, setAddType] = useState<Task['type']>('Fight');
  const [typeSearch, setTypeSearch] = useState('');
  const [fieldSearch, setFieldSearch] = useState(searchQuery);
  const [advanced, setAdvanced] = useState<Record<string, boolean>>({});
  const [mobileDetail, setMobileDetail] = useState(false);
  const [startMenu, setStartMenu] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const callbacks = useRef({ onSave, onSaved, onStart });
  callbacks.current = { onSave, onSaved, onStart };
  const selected = Math.min(draft.selected, Math.max(0, draft.steps.length - 1));
  const step = draft.steps[selected];
  const validJson = (() => { try { const value = JSON.parse(step?.json || '{}'); return !!value && typeof value === 'object' && !Array.isArray(value); } catch { return false; } })();
  const dirty = unsaved || plan === 'new' || draft.steps.some((entry) => { try { return stable(JSON.parse(entry.json)) !== stable(entry.task.params); } catch { return true; } }) || fingerprint(draftPlan(draft, plan)) !== draft.base;
  const sourceVersion = plan === 'new' ? '' : fingerprint(plan as WorkbenchPlan);
  const globalBudgets = settings?.budgets || zeroBudgets;
  const effectiveBudgets = draft.budgets || globalBudgets;
  const syncDevice = devices.find((device) => device.id === (draft.deviceId || selectedDeviceId));
  const precedingClient = [...draft.steps.slice(0, selected)].reverse().find((entry) => entry.task.type === 'StartUp' && taskEnabled(entry.task))?.task.params.client_type;
  const connectionClient = settings?.deviceProfiles?.find((profile) => profile.id === syncDevice?.connectionProfileId)?.connection.clientType || settings?.connection?.clientType;
  const requestedClient = step?.task.params.client_type || precedingClient || connectionClient || 'Official';
  const taskClient = (clients.some(([id]) => id === requestedClient) ? requestedClient : 'Official') as NonNullable<RpcParams<'stages.list'>['clientType']>;
  const draftTargetBusy = busyDeviceIds.includes(draft.deviceId || selectedDeviceId || '');
  const hasSavedPlan = plan !== 'new' && !unsaved;
  const savedTargetBusy = hasSavedPlan && busyDeviceIds.includes(plan.deviceId || selectedDeviceId || '');
  const startUnavailable = dirty ? draftTargetBusy && (!hasSavedPlan || savedTargetBusy) : savedTargetBusy;
  const filteredTypes = Object.entries(taskLabels).filter(([type, label]) => `${label} ${type} ${taskCategories[type]}`.toLowerCase().includes(typeSearch.toLowerCase()));
  const tab = draft.tab;
  const patch = (value: Partial<Draft>) => setDraft((previous) => ({ ...previous, ...value }));

  useEffect(() => {
    try { sessionStorage.setItem(cacheKey, JSON.stringify(draft)); } catch { /* A full/unavailable session store must not block editing. */ }
  }, [cacheKey, draft]);
  useEffect(() => {
    if (plan === 'new' || unsaved || saving) return;
    setDraft((previous) => {
      if (previous.base === sourceVersion) return previous;
      const changed = previous.steps.some((entry) => { try { return stable(JSON.parse(entry.json)) !== stable(entry.task.params); } catch { return true; } }) || fingerprint(draftPlan(previous, plan)) !== previous.base;
      if (changed) return previous;
      const next = createDraft(plan, initialGroup, focusTaskType, initialParams, focusTaskIndex);
      return { ...next, selected: Math.min(previous.selected, Math.max(0, next.steps.length - 1)), tab: previous.tab };
    });
  // The stable fingerprint, rather than each snapshot object, controls refreshes.
  }, [sourceVersion, saving, unsaved]);
  useEffect(() => { setFieldSearch(searchQuery); }, [searchQuery]);
  useEffect(() => {
    if (!focusTaskType && focusTaskIndex === undefined) return;
    const index = focusedTaskIndex(draftRef.current.steps, focusTaskType, focusTaskIndex);
    if (index >= 0) { setDraft((previous) => ({ ...previous, selected: index, tab: 'tasks' })); setMobileDetail(true); }
    else setFormError('任务顺序已变化，请从任务列表选择要编辑的任务。');
  }, [focusTaskType, focusTaskIndex]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && root.current?.getClientRects().length) { event.preventDefault(); root.current.querySelector<HTMLButtonElement>('[data-save-plan]')?.click(); }
      if (event.key === 'Escape') setStartMenu(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const setTask = (index: number, transform: (entry: Step) => Step) => setDraft((previous) => ({ ...previous, steps: previous.steps.map((entry, i) => i === index ? transform(entry) : entry) }));
  const setEnabled = (index: number, enabled: boolean) => setTask(index, (entry) => {
    let params = entry.task.params;
    let json = entry.json;
    try { const parsed = JSON.parse(json); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'enable' in parsed) { params = { ...parsed, enable: enabled }; json = JSON.stringify(params, null, 2); } } catch { /* Keep invalid expert drafts intact. */ }
    return { ...entry, task: { ...entry.task, params, enabled }, json };
  });
  const setParams = (updates: Record<string, unknown>) => setTask(selected, (entry) => {
    const params = { ...entry.task.params, ...updates };
    for (const [key, value] of Object.entries(updates)) if (value === undefined) delete params[key];
    return { ...entry, task: { ...entry.task, params }, json: JSON.stringify(params, null, 2) };
  });
  const setJson = (json: string) => setTask(selected, (entry) => {
    try { const params = JSON.parse(json); if (params && typeof params === 'object' && !Array.isArray(params)) return { ...entry, json, task: { ...entry.task, params } }; } catch { /* Preserve incomplete JSON until it can be corrected. */ }
    return { ...entry, json };
  });
  const selectTask = (index: number) => { patch({ selected: index }); setFieldSearch(''); setMobileDetail(true); };
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= draft.steps.length) return;
    const next = [...draft.steps]; const [entry] = next.splice(from, 1); next.splice(to, 0, entry);
    patch({ steps: next, selected: to }); setNotice(`已将${taskLabels[entry.task.type]}移到第 ${to + 1} 条`);
  };
  const addTask = () => {
    if (draft.steps.length >= 30) return;
    const type = filteredTypes.some(([type]) => type === addType) ? addType : filteredTypes[0]?.[0] as Task['type'] | undefined;
    if (!type) return;
    patch({ steps: [...draft.steps, createStep(type)], selected: draft.steps.length, tab: 'tasks' }); setMobileDetail(true); setFieldSearch(''); setNotice('已添加任务，保存后生效');
  };
  const buildPlan = (): WorkbenchPlan | null => {
    if (!draft.name.trim()) { setFormError('请给任务表起一个名字'); patch({ tab: 'settings' }); return null; }
    if (!draft.steps.length) { setFormError('请至少添加一个任务'); patch({ tab: 'tasks' }); return null; }
    const tasks: Task[] = [];
    for (let i = 0; i < draft.steps.length; i++) {
      try {
        const params = JSON.parse(draft.steps[i].json);
        if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error();
        tasks.push({ ...draft.steps[i].task, params });
      } catch { patch({ selected: i, tab: 'tasks' }); setMobileDetail(true); setAdvanced((previous) => ({ ...previous, [draft.steps[i].key]: true })); setFormError(`第 ${i + 1} 条任务的高级参数必须是有效 JSON 对象`); return null; }
    }
    return draftPlan(draft, plan, tasks);
  };
  const save = async (andStart = false) => {
    if (saving || starting || (andStart && draftTargetBusy)) return;
    const value = buildPlan();
    if (!value) return;
    setSaving(true); setFormError(''); setStartMenu(false);
    try {
      const saved = await callbacks.current.onSave(value);
      if (!saved) { setFormError('保存失败，请根据提示检查参数与消耗预算。'); return; }
      setDraft((previous) => ({ ...previous, name: value.name, base: fingerprint(value) }));
      try { sessionStorage.removeItem(cacheKey); } catch { /* Optional draft cache. */ }
      setNotice('任务表已保存');
      callbacks.current.onSaved?.(value);
      if (andStart && callbacks.current.onStart) { setStarting(true); await callbacks.current.onStart(value); }
    } finally { setSaving(false); setStarting(false); }
  };
  const startSaved = async () => {
    if (plan === 'new' || unsaved || !onStart || saving || starting || savedTargetBusy) return;
    setStartMenu(false); setStarting(true);
    try { await onStart(plan); } finally { setStarting(false); }
  };
  const revert = () => { setDraft(createDraft(plan, initialGroup, focusTaskType, initialParams, focusTaskIndex, defaultName)); setFormError(''); setNotice('已恢复为保存的配置'); };
  const exportPlan = () => {
    const value = buildPlan(); if (!value) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${value.name}.json`; link.click(); URL.revokeObjectURL(url);
  };

  return <section ref={root} className={`wb-workbench ${mobileDetail ? 'wb-show-detail' : ''}`} aria-label="任务表工作台" aria-busy={saving}>
    <header className="wb-page-header"><div className="wb-page-title"><h1>{draft.name || '新建任务表'}</h1><span className={`wb-save-state ${dirty ? 'is-dirty' : ''}`}><i />{dirty ? '未保存' : '已保存'}</span><p>{draft.description || `${draft.steps.filter((entry) => taskEnabled(entry.task)).length} 项已启用 · 按顺序执行，每条任务独立设置`}</p></div><div className="wb-header-actions" inert={saving}>
      {plan === 'new' && onClose && <button className="button secondary" onClick={onClose}>取消新建</button>}
      <button className="button secondary" data-save-plan disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}保存任务表</button>
      {onStart && <div className="wb-start-wrap"><button className="button primary" disabled={startUnavailable || saving || starting} aria-expanded={startMenu} onClick={() => dirty ? setStartMenu(!startMenu) : void startSaved()}><Play size={15} fill="currentColor" />{starting ? '正在开始…' : initialGroup === 'specialized' ? '开始执行' : '开始日常'}{dirty && <ChevronDown size={14} />}</button>{startMenu && <div className="wb-start-menu"><strong>任务表有未保存的改动</strong><button disabled={draftTargetBusy || saving || starting} onClick={() => void save(true)}>保存并开始</button>{hasSavedPlan && <button disabled={savedTargetBusy || saving || starting} onClick={() => void startSaved()}>使用已保存配置</button>}<small>当前草稿会保留</small></div>}</div>}
    </div></header>
    <div className="wb-tabs" inert={saving} role="tablist" aria-label="任务表页面">{([['tasks', '任务编排', ListChecks], ['settings', '任务表设置', Settings2], ['schedule', '定时计划', CalendarClock]] as const).map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={tab === id} aria-controls={`wb-panel-${id}`} id={`wb-tab-${id}`} onClick={() => patch({ tab: id })}><Icon size={16} />{label}</button>)}</div>
    {saving && <div className="wb-running-note" role="status"><LoaderCircle size={15} className="spin" />正在保存任务表，保存完成后可继续编辑。</div>}
    {running && <div className="wb-running-note"><Info size={15} />当前执行使用启动时配置。这里的修改用于下次执行。</div>}
    {dirty && !unsaved && plan !== 'new' && draft.base !== sourceVersion && <div className="wb-running-note"><Info size={15} />已保存配置有更新，当前草稿已保留。保存将以这份草稿替换已保存配置。</div>}
    {formError && <div className="wb-form-error" role="alert"><Info size={16} /><span>{formError}</span><button className="icon-button" aria-label="关闭参数错误" onClick={() => setFormError('')}><X size={15} /></button></div>}
    <span className="wb-sr-only" role="status">{notice}</span>
    {tab === 'tasks' && <div className="wb-task-layout" inert={saving} id="wb-panel-tasks" role="tabpanel" aria-labelledby="wb-tab-tasks"><aside className="wb-queue" aria-label="任务顺序"><div className="wb-queue-heading"><h2>任务顺序</h2><span>{draft.steps.length} / 30</span></div>
      <ol className="wb-step-list editor-steps">{draft.steps.map((entry, index) => <li key={entry.key} draggable onDragStart={() => setDragKey(entry.key)} onDragEnd={() => setDragKey(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = draft.steps.findIndex((item) => item.key === dragKey); if (from >= 0) reorder(from, index); setDragKey(null); }} className={`${index === selected ? 'selected' : ''} ${!taskEnabled(entry.task) ? 'wb-disabled-step' : ''} ${dragKey === entry.key ? 'wb-dragging' : ''}`}>
        <GripVertical className="wb-grip" size={14} aria-hidden="true" /><input type="checkbox" aria-label={`启用第 ${index + 1} 条任务`} checked={taskEnabled(entry.task)} onChange={(event) => setEnabled(index, event.target.checked)} /><button className="wb-step-select" aria-label={`设置第 ${index + 1} 条${taskLabels[entry.task.type] || entry.task.type}`} aria-current={index === selected ? 'step' : undefined} onClick={() => selectTask(index)} onKeyDown={(event) => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); reorder(index, index + (event.key === 'ArrowUp' ? -1 : 1)); } }}><span className="wb-step-number">{index + 1}</span><span className="wb-step-copy"><strong>{taskLabels[entry.task.type] || entry.task.type}</strong><small>{taskSummary(entry.task)}</small></span></button>
      </li>)}</ol>
      <div className="wb-add-task"><div className="wb-type-search"><Search size={14} /><input aria-label="搜索任务类型" placeholder="搜索任务类型" value={typeSearch} onChange={(event) => setTypeSearch(event.target.value)} /></div><label className="wb-sr-only" htmlFor="task-type">添加任务类型</label><select id="task-type" className="text-input" value={filteredTypes.some(([type]) => type === addType) ? addType : filteredTypes[0]?.[0] || ''} onChange={(event) => setAddType(event.target.value as Task['type'])}>{filteredTypes.map(([type, label]) => <option key={type} value={type}>{taskCategories[type]} · {label}</option>)}</select><button className="button secondary" disabled={draft.steps.length >= 30 || !filteredTypes.length} onClick={addTask}><Plus size={15} />添加任务</button><small>{draft.steps.filter((entry) => taskEnabled(entry.task)).length} 项已启用 · 拖动或使用排序按钮调整</small></div>
    </aside><section className="wb-inspector" aria-label="单项任务设置">{step ? <><div className="wb-inspector-header"><div><button className="wb-mobile-back" onClick={() => setMobileDetail(false)}><ArrowLeft size={15} />任务列表</button><h2>{taskLabels[step.task.type] || step.task.type}</h2><p>第 {selected + 1} 条任务 · 独立设置</p></div><div className="wb-step-tools"><button className="icon-button" aria-label="上移任务" title="上移任务（Alt ↑）" disabled={selected === 0} onClick={() => reorder(selected, selected - 1)}><ArrowUp size={16} /></button><button className="icon-button" aria-label="下移任务" title="下移任务（Alt ↓）" disabled={selected === draft.steps.length - 1} onClick={() => reorder(selected, selected + 1)}><ArrowDown size={16} /></button><button className="icon-button" aria-label="复制任务" title="复制任务" disabled={draft.steps.length >= 30} onClick={() => { const next = [...draft.steps]; next.splice(selected + 1, 0, { ...structuredClone(step), key: crypto.randomUUID() }); patch({ steps: next, selected: selected + 1 }); setNotice('已复制任务'); }}><Copy size={16} /></button><button className="icon-button danger-hover" aria-label="删除任务" title="删除任务" onClick={() => { patch({ steps: draft.steps.filter((_, i) => i !== selected), selected: Math.max(0, selected - 1) }); setNotice('任务已从草稿移除，保存后生效'); }}><Trash2 size={16} /></button></div></div>
      <div className="wb-field-search"><Search size={15} /><input aria-label="搜索当前任务设置" placeholder="查找当前任务设置" value={fieldSearch} onChange={(event) => setFieldSearch(event.target.value)} />{fieldSearch && <button className="icon-button" aria-label="清除任务设置搜索" onClick={() => setFieldSearch('')}><X size={14} /></button>}</div>
      <fieldset className="wb-fieldset task-fields" disabled={!validJson}>{fieldGroups(step.task.type).map((group) => { const visible = group.fields.filter((field) => (step.task.type !== 'Infrast' || !['filename', 'plan_index'].includes(field.key) || Number(step.task.params.mode) === 10000) && (!fieldSearch || `${field.label} ${field.key} ${field.hint || ''}`.toLowerCase().includes(fieldSearch.toLowerCase()))); return !!visible.length && <FieldSection key={`${step.key}-${group.title}`} title={group.title} expanded={group.expanded || !!fieldSearch} summary={`${group.fields.length} 项设置`}><div className="wb-fields">{visible.map((field) => <TaskParameterField key={step.key + field.key} field={field} params={step.task.params} onChange={setParams} clientType={taskClient} />)}</div>{group.title === '消耗上限' && <p className="wb-helper"><ShieldCheck size={14} />本表有效上限：理智药 {effectiveBudgets.medicine} · 源石 {effectiveBudgets.originium}</p>}</FieldSection>; })}</fieldset>
      {fieldSearch && !fields[step.task.type]?.some((field) => `${field.label} ${field.key} ${field.hint || ''}`.toLowerCase().includes(fieldSearch.toLowerCase())) && <p className="wb-helper">没有匹配的表单项，可清除搜索或检查高级参数。</p>}
      {!validJson && <p role="alert" className="wb-inline-error">请先修正高级参数中的 JSON，再使用表单。</p>}
      {step.task.type === 'OperProgress' && <div className="wb-task-help"><Info size={17} /><p>干员养成会执行精英化、技能升级与专精并消耗材料。在高级参数的 plans 数组填写目标，执行前逐项核对。</p></div>}
      {!fields[step.task.type]?.length && step.task.type !== 'OperProgress' && <div className="wb-task-help"><FileText size={17} /><p>识别使用核心默认参数。结果可在运行事件中查看；专用结果与导出仍待接入。</p></div>}
      {step.task.type === 'Recruit' && <p className="wb-helper">次数为 0 时仅识别标签。当前核心无法保证加急次数上限，加急请求会被策略拒绝。</p>}
      {step.task.type === 'StartUp' && settings && <FieldSection key={`${step.key}-connection`} title="多任务共用连接" expanded={!fieldSearch} summary="连接、触控与截图设置"><TaskConnectionSettings settings={settings} onSaveSettings={onSaveSettings} selectedDeviceId={draft.deviceId || selectedDeviceId} deviceProfileId={syncDevice?.connectionProfileId} busy={saving || starting} /></FieldSection>}
      {step.task.type === 'Mall' && <p className="wb-helper">会客室信息板收取信用、线索交流与赠送线索，请在「基建换班 → 信用与线索」中设置。</p>}
      {step.task.type === 'UserDataUpdate' && <div className="wb-sync-times" aria-label="数据同步状态"><span>设备：{syncDevice?.name || '请绑定或选择设备'}</span><span>干员上次同步：{syncDevice?.dataSync?.operatorsAt ? new Date(syncDevice.dataSync.operatorsAt).toLocaleString('zh-CN') : '暂无成功记录'}</span><span>仓库上次同步：{syncDevice?.dataSync?.depotAt ? new Date(syncDevice.dataSync.depotAt).toLocaleString('zh-CN') : '暂无成功记录'}</span><span>按游戏客户端时区在凌晨 4 点换日，周一换周；已成功同步的项目在本周期内跳过。</span></div>}
      {step.task.type === 'SingleStep' && <p className="wb-helper">在高级参数的 details 配置动作；战斗动作使用 details.actions 数组，完成后仍需观察验证。</p>}
      <details className="wb-advanced advanced-params" open={advanced[step.key] || !validJson} onToggle={(event) => { const open = event.currentTarget.open; setAdvanced((previous) => previous[step.key] === open ? previous : { ...previous, [step.key]: open }); }}><summary>高级参数 <span>完整 MaaCore JSON</span></summary><p>补充未列出的上游字段；保存时完整保留，并校验参数和消耗。</p><label className="field-label" htmlFor="task-json">任务参数 JSON</label><textarea id="task-json" spellCheck={false} value={step.json} onChange={(event) => setJson(event.target.value)} /></details>
      <p className="wb-inspector-footnote">修改后保存，用于下次执行。</p>
    </> : <div className="wb-empty"><ListChecks size={30} /><h2>添加第一条任务</h2><p>从任务目录选择要执行的能力。</p></div>}</section></div>}
    {tab === 'settings' && <div className="wb-table-settings" inert={saving} id="wb-panel-settings" role="tabpanel" aria-labelledby="wb-tab-settings"><div className="wb-settings-index"><a href="#wb-basic">基本信息</a><a href="#wb-device">设备绑定</a><a href="#wb-budget">消耗上限</a><a href="#wb-manage">任务表管理</a></div><div className="wb-settings-form">
      <section id="wb-basic"><h2>基本信息</h2><div className="wb-fields"><label className="param-field"><span className="field-label">任务表名称</span><input className="text-input" aria-label="任务表名称" maxLength={80} placeholder="例如：晚间日常" value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></label><label className="param-field"><span className="field-label">任务分组</span><select className="text-input" aria-label="任务分组" value={draft.group} onChange={(event) => patch({ group: event.target.value as Group })}><option value="daily">日常</option><option value="specialized">专项任务</option></select></label><label className="param-field wide"><span className="field-label">说明</span><textarea className="text-input wb-description" aria-label="任务表说明" maxLength={500} placeholder="记录这张表的用途" value={draft.description} onChange={(event) => patch({ description: event.target.value })} /></label></div><label className="wb-checkbox-row"><input type="checkbox" checked={draft.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />启用任务表<small>停用后仍保留全部任务和参数</small></label></section>
      <section id="wb-device"><h2>设备绑定</h2><label className="param-field"><span className="field-label">绑定设备</span><select className="text-input" aria-label="绑定设备" value={draft.deviceId || ''} onChange={(event) => patch({ deviceId: event.target.value || null })}><option value="">执行时使用顶部选中的设备</option>{draft.deviceId && !devices.some((device) => device.id === draft.deviceId) && <option value={draft.deviceId}>已绑定设备（当前未发现）</option>}{devices.map((device) => <option key={device.id} value={device.id}>{device.name}{device.state === 'offline' ? ' · 离线' : ''}</option>)}</select></label><p className="wb-helper">绑定只影响这张任务表。游戏客户端在启动／关闭游戏任务中设置，切换顶部设备不会改写绑定。</p></section>
      <section id="wb-budget"><h2>消耗上限</h2><label className="wb-checkbox-row"><input type="checkbox" checked={draft.budgets === null} onChange={(event) => patch({ budgets: event.target.checked ? null : structuredClone(globalBudgets) })} />使用全局授权上限</label><p className="wb-helper">来源：应用设置。全局授权为理智药 {globalBudgets.medicine} · 源石 {globalBudgets.originium} · 加急许可 {globalBudgets.expedited}。本表可设置更低的限制。</p><div className="wb-budget-inputs">{budgetNames.map(([key, label]) => <label key={key}><span>{label}</span><input className="text-input" type="number" min={0} max={globalBudgets[key]} step={1} disabled={draft.budgets === null} aria-label={`任务表${label}上限`} value={effectiveBudgets[key]} onChange={(event) => patch({ budgets: { ...(draft.budgets || globalBudgets), [key]: Number(event.target.value) } })} /></label>)}</div><p className="wb-helper"><ShieldCheck size={14} />启用任务的累计消耗不得超过本表限制与全局授权。</p></section>
      <section id="wb-manage"><h2>任务表管理</h2><div className="wb-management-actions"><button className="button secondary" onClick={exportPlan}><FileText size={15} />导出任务表</button><button className="button secondary" disabled={!dirty} onClick={revert}><RotateCcw size={15} />{plan === 'new' ? '恢复初始配置' : '恢复已保存配置'}</button>{plan !== 'new' && onDelete && <button className="button secondary wb-danger" onClick={() => onDelete(plan)}><Trash2 size={15} />删除任务表</button>}</div></section>
    </div></div>}
    {tab === 'schedule' && <div className="wb-schedule" inert={saving} id="wb-panel-schedule" role="tabpanel" aria-labelledby="wb-tab-schedule"><CalendarClock size={38} strokeWidth={1.4} /><h2>定时执行尚未接入</h2><p>当前任务表可手动执行。定时规则、设备冲突与休眠恢复将在调度服务接入后启用。</p><button className="button secondary" onClick={() => patch({ tab: 'tasks' })}><ArrowLeft size={15} />返回任务编排</button></div>}
    {plan === 'new' && tab === 'tasks' && <div className="wb-new-name" inert={saving}><label htmlFor="wb-new-name">任务表名称</label><input id="wb-new-name" className="text-input" value={draft.name} placeholder="先给任务表起一个名字" maxLength={80} onChange={(event) => patch({ name: event.target.value })} /></div>}
  </section>;
}

function FieldSection({ title, expanded, summary, children }: { title: string; expanded: boolean; summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(expanded);
  useEffect(() => { if (expanded) setOpen(true); }, [expanded]);
  return <details className="wb-field-section" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary><span>{title}</span><small>{!open && summary}</small></summary>{children}</details>;
}
