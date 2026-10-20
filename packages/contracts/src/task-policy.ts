import type { Plan, Settings } from './types';
import { taskLabels } from './tasks';

export const taskEnabled = (task: Plan['tasks'][number]) => task.enabled !== false && task.params.enable !== false;
const reject = (message: string): never => { throw new Error(message); };
const integer = (value: unknown, label: string, min = 0, max = 2_147_483_647): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return reject(`${label}必须是 ${min} 到 ${max} 之间的整数`);
  return value;
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function jsonTree(value: unknown, depth = 0) {
  if (depth > 32) reject('任务参数嵌套过深');
  if (object(value)) for (const [key, item] of Object.entries(value)) {
    if (['shell', 'command', 'script', 'adb'].includes(key.toLowerCase())) reject('任务不得包含任意命令');
    jsonTree(item, depth + 1);
  }
  else if (Array.isArray(value)) value.forEach((item) => jsonTree(item, depth + 1));
  else if (typeof value === 'number' && !Number.isFinite(value)) reject('任务参数不得包含非有限数值');
}

/** Mirrors the native policy for browser development; Python remains authoritative. */
export function validatePlan(plan: Plan, settings: Settings) {
  if (!plan || !plan.name?.trim() || plan.name.length > 80 || !Array.isArray(plan.tasks) || !plan.tasks.length || plan.tasks.length > 30) reject('任务表需要名称和 1–30 个任务');
  if (plan.schedule) reject('定时调度尚未实现，请使用手动执行');
  const totals = { originium: 0, medicine: 0, expedited: 0 };
  for (const task of plan.tasks) {
    if (!(task.type in taskLabels)) reject('包含不支持的任务类型');
    const p = task.params;
    if (!object(p)) reject('任务参数必须是对象');
    jsonTree(p);
    if (new TextEncoder().encode(JSON.stringify(p)).length > 512 * 1024) reject('单项任务参数不得超过 512 KiB');
    if ('client_type' in p && !['', 'Official', 'Bilibili', 'YoStarEN', 'YoStarJP', 'YoStarKR', 'txwy'].includes(String(p.client_type))) reject('客户端必须是官方支持的渠道');
    if (typeof task.enabled !== 'boolean') reject('任务启用状态必须是布尔值');
    if (!taskEnabled(task)) continue;
    totals.originium += integer(p.stone ?? 0, '源石额度');
    totals.medicine += integer(p.medicine ?? 0, '理智药额度');
    if (integer(p.expiring_medicine ?? 0, '临期理智药设置') || integer(p.medicine_expire_days ?? 0, '临期理智药设置')) reject('当前核心的临期理智药不受数量限制，暂不能在有限预算下启用');
    if (p.use_sanity_potion) reject('当前核心的作业理智药不受数量限制，暂不能在有限预算下启用');
    integer(p.expedite_times ?? 0, '加急额度');
    if (p.expedite) reject('当前核心不执行加急次数上限，暂不能在有限预算下启用加急');
    if (task.type === 'Fight') {
      integer(p.times ?? 1, '作战次数', 1); integer(p.series ?? 1, '代理倍率', -1, 10);
      if (typeof (p.stage ?? '') !== 'string') reject('关卡参数无效');
      if ('drops' in p) {
        if (!object(p.drops)) reject('掉落目标必须是对象');
        for (const count of Object.values(p.drops as Record<string, unknown>)) integer(count, '掉落数量', 1);
      }
    }
    if (task.type === 'Recruit') {
      integer(p.times ?? 0, '招募次数');
      for (const key of ['select', 'confirm']) if (key in p) {
        if (!Array.isArray(p[key])) reject('招募星级必须是数组');
        (p[key] as unknown[]).forEach((value) => integer(value, '招募星级', 1, 6));
      }
    }
    if (task.type === 'Infrast') {
      if (![0, 10000, 20000].includes(Number(p.mode ?? 0))) reject('基建模式无效');
      if (p.mode === 10000) { if (typeof p.filename !== 'string' || !p.filename.trim()) reject('请选择自定义排班文件'); integer(p.plan_index, '排班方案序号'); }
      if (typeof (p.threshold ?? 0.3) !== 'number' || Number(p.threshold ?? 0.3) < 0 || Number(p.threshold ?? 0.3) > 1) reject('心情阈值必须在 0 到 1 之间');
    }
    if (task.type === 'SwitchTheme' && !Array.isArray(p.themes)) reject('请选择候选游戏主题');
    if (task.type === 'Roguelike') {
      if (!['Phantom', 'Mizuki', 'Sami', 'Sarkaz', 'JieGarden', 'BlackFlow'].includes(String(p.theme ?? 'Phantom'))) reject('集成战略主题无效');
      if (![0, 1, 4, 5, 6, 7, 10001, 20001, 30001, 30003].includes(Number(p.mode ?? 0))) reject('集成战略模式无效或已被上游移除');
    }
    if (task.type === 'Reclamation') {
      const theme = p.theme ?? 'Tales'; const mode = p.mode ?? 0;
      if (!(theme === 'Tales' && [0, 1].includes(Number(mode))) && !(theme === 'RelaunchAnchor' && [16, 32, 48].includes(Number(mode)))) reject('生息演算主题与模式组合无效');
    }
    if (['Copilot', 'SSSCopilot', 'ParadoxCopilot', 'VideoRecognition'].includes(task.type)) {
      const entries = task.type === 'Copilot' ? p.copilot_list : task.type === 'ParadoxCopilot' ? p.list : undefined;
      if (!(typeof p.filename === 'string' && p.filename.trim())) {
        if (!Array.isArray(entries) || !entries.length) reject('请选择本地文件，或填写非空作业列表');
        for (const entry of entries as unknown[]) if (!(task.type === 'ParadoxCopilot' && typeof entry === 'string' && entry.trim()) && !(object(entry) && typeof entry.filename === 'string' && entry.filename.trim())) reject('作业列表格式无效');
      }
      if ('loop_times' in p) integer(p.loop_times, '循环次数', 1);
    }
    if (task.type === 'Custom') {
      if (!Array.isArray(p.task_names) || !p.task_names.length) reject('自定义任务需要非空 task_names 数组');
      for (const name of p.task_names as unknown[]) if (typeof name !== 'string' || !(name === 'MiniGame@PixelPaint@Begin' || /^MiniGame@SecretFront@Begin@Ending[A-E](?:@[^@\x00]{1,80})?$/.test(name))) reject('此自定义任务链尚未通过消耗策略审核，请使用对应的标准任务');
    }
    if (task.type === 'SingleStep') {
      if (p.type !== 'copilot' || !['stage', 'start', 'action'].includes(String(p.subtype))) reject('单步任务类型无效');
      const details = p.details ?? {};
      if (!object(details)) reject('单步任务 details 必须是对象');
      if (p.subtype === 'stage' && !(typeof (details as Record<string, unknown>).stage_name === 'string' && String((details as Record<string, unknown>).stage_name).trim())) reject('单步任务关卡不可为空');
      if (p.subtype === 'action' && !(Array.isArray((details as Record<string, unknown>).actions) && ((details as Record<string, unknown>).actions as unknown[]).length && ((details as Record<string, unknown>).actions as unknown[]).every(object))) reject('当前核心要求 details.actions 为非空操作数组');
    }
    if (task.type === 'OperProgress' && !Array.isArray(p.plans)) reject('干员养成需要 plans 数组');
  }
  if (Object.entries(totals).some(([key, value]) => value > settings.budgets[key as keyof typeof totals])) reject('计划消耗超出已授权额度');
}
