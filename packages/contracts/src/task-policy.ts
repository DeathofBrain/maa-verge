import type { Plan, Settings } from './types';
import { taskLabels } from './tasks';

export const taskEnabled = (task: Plan['tasks'][number]) =>
  task.enabled !== false && task.params.enable !== false;
const reject = (message: string): never => {
  throw new Error(message);
};
const integer = (value: unknown, label: string, min = 0, max = 2_147_483_647): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    return reject(`${label}必须是 ${min} 到 ${max} 之间的整数`);
  return value;
};
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Per-run limits come from enabled Fight tasks. Legacy budget fields are data compatibility only. */
export function taskConsumableLimits(plan: {
  tasks: ReadonlyArray<Plan['tasks'][number]>;
}): Settings['budgets'] {
  const limits = { medicine: 0, originium: 0, expedited: 0 };
  for (const task of plan.tasks) {
    if (!taskEnabled(task)) continue;
    const medicine = integer(
      Object.hasOwn(task.params, 'medicine') ? task.params.medicine : 0,
      '理智药上限',
    );
    const stone = integer(Object.hasOwn(task.params, 'stone') ? task.params.stone : 0, '源石上限');
    if (task.type !== 'Fight' && (medicine || stone))
      reject('理智药与源石上限只能在自动作战任务中设置');
    if (task.type === 'Fight') {
      limits.medicine += medicine;
      limits.originium += stone;
    }
  }
  return limits;
}
const facilities = new Set([
  'Mfg',
  'Trade',
  'Power',
  'Control',
  'Reception',
  'Office',
  'Recycle',
  'Dorm',
  'Processing',
  'Training',
  'AssistantChange',
]);
const drones = new Set([
  '_NotUse',
  'Money',
  'SyntheticJade',
  'CombatRecord',
  'PureGold',
  'OriginStone',
  'Chip',
]);
const booleanKeys = new Set(
  'enable drops_enabled start_game_enabled refresh set_time expedite skip_robot report_to_penguin report_to_yituliu DrGrandet replenish dorm_notstationed_enabled dorm_trust_enabled fiammetta_recovery_enabled use_pinus_sylvestris use_perception_information use_worldly_plight use_abyssal_hunter reception_message_board reception_clue_exchange reception_send_clue continue_training visit_friends visit_friends_once_a_day shopping force_shopping_if_credit_full only_buy_discount reserve_max_credit credit_fight award mail recruit orundum mining specialaccess signinevent formation use_sanity_potion add_trust ignore_requirements clear_store'.split(
    ' ',
  ),
);
const stringLists = new Set(
  'first_tags preserve_tags buy_first blacklist fiammetta_targets themes task_names tools_to_craft'.split(
    ' ',
  ),
);
function jsonTree(value: unknown, depth = 0) {
  if (depth > 32) reject('任务参数嵌套过深');
  if (object(value))
    for (const [key, item] of Object.entries(value)) {
      if (['shell', 'command', 'script', 'adb'].includes(key.toLowerCase()))
        reject('任务不得包含任意命令');
      jsonTree(item, depth + 1);
    }
  else if (Array.isArray(value)) value.forEach((item) => jsonTree(item, depth + 1));
  else if (typeof value === 'number' && !Number.isFinite(value))
    reject('任务参数不得包含非有限数值');
}

/** Validates editable plans before they reach the application service. */
export function validatePlan(plan: Plan, _settings: Settings) {
  if (
    !plan ||
    !plan.name?.trim() ||
    plan.name.length > 80 ||
    !Array.isArray(plan.tasks) ||
    !plan.tasks.length ||
    plan.tasks.length > 30
  )
    reject('任务表需要名称和 1–30 个任务');
  if (plan.schedule) reject('定时调度尚未实现，请使用手动执行');
  if (
    plan.description !== undefined &&
    (typeof plan.description !== 'string' || plan.description.length > 500)
  )
    reject('任务表说明不得超过 500 个字符');
  if (
    plan.deviceId != null &&
    (typeof plan.deviceId !== 'string' || !plan.deviceId.length || plan.deviceId.length > 200)
  )
    reject('绑定设备标识无效');
  if (
    plan.deviceIds !== undefined &&
    (!Array.isArray(plan.deviceIds) ||
      plan.deviceIds.length > 100 ||
      plan.deviceIds.some((id) => typeof id !== 'string' || !id.length || id.length > 200) ||
      new Set(plan.deviceIds).size !== plan.deviceIds.length)
  )
    reject('绑定设备列表无效');
  if (!['daily', 'specialized'].includes(plan.group === undefined ? 'daily' : plan.group))
    reject('任务表分组无效');
  if (plan.budgets != null) {
    if (
      !object(plan.budgets) ||
      Object.keys(plan.budgets).some((key) => !['originium', 'medicine', 'expedited'].includes(key))
    )
      reject('任务表预算格式无效');
    for (const key of ['originium', 'medicine', 'expedited'] as const) {
      integer(plan.budgets[key], '旧版任务表消耗上限', 0, 100);
    }
  }
  for (const task of plan.tasks) {
    if (!(task.type in taskLabels)) reject('包含不支持的任务类型');
    const p = task.params;
    if (!object(p)) reject('任务参数必须是对象');
    jsonTree(p);
    for (const [key, value] of Object.entries(p)) {
      if (booleanKeys.has(key) && typeof value !== 'boolean') reject(`${key} 必须是布尔值`);
      if (
        stringLists.has(key) &&
        !(Array.isArray(value) && value.every((item) => typeof item === 'string'))
      )
        reject(`${key} 必须是文本数组`);
    }
    if (new TextEncoder().encode(JSON.stringify(p)).length > 512 * 1024)
      reject('单项任务参数不得超过 512 KiB');
    if (
      'client_type' in p &&
      !(
        typeof p.client_type === 'string' &&
        ['', 'Official', 'Bilibili', 'YoStarEN', 'YoStarJP', 'YoStarKR', 'txwy'].includes(
          p.client_type,
        )
      )
    )
      reject('客户端必须是官方支持的渠道');
    if (typeof task.enabled !== 'boolean') reject('任务启用状态必须是布尔值');
    if (!taskEnabled(task)) continue;
    if (task.type === 'UserDataUpdate') {
      for (const key of ['operators', 'depot'])
        if (key in p && typeof p[key] !== 'boolean') reject(`${key} 必须是布尔值`);
      if (!['always', 'daily', 'weekly'].includes(String('interval' in p ? p.interval : 'always')))
        reject('数据同步触发间隔无效');
    }
    if ('mode' in p && ['Infrast', 'Roguelike', 'Reclamation'].includes(task.type))
      integer(p.mode, '运行模式');
    if ('theme' in p && typeof p.theme !== 'string') reject('主题必须是文本');
    if (
      integer(p.expiring_medicine ?? 0, '临期理智药设置') ||
      integer(p.medicine_expire_days ?? 0, '临期理智药设置')
    )
      reject('当前核心的临期理智药不受数量限制，暂不能在有限预算下启用');
    if (p.use_sanity_potion) reject('当前核心的作业理智药不受数量限制，暂不能在有限预算下启用');
    integer(p.expedite_times ?? 0, '加急额度');
    if (p.expedite) reject('当前核心不执行加急次数上限，暂不能在有限预算下启用加急');
    if (task.type === 'Fight') {
      integer(p.times ?? 1, '作战次数', 1);
      integer(p.series ?? 1, '代理倍率', -1, 10);
      if (typeof (p.stage ?? '') !== 'string') reject('关卡参数无效');
      if ('drops' in p) {
        if (!object(p.drops)) reject('掉落目标必须是对象');
        for (const count of Object.values(p.drops as Record<string, unknown>))
          integer(count, '掉落数量', 1);
      }
    }
    if (task.type === 'Recruit') {
      integer(p.times ?? 0, '招募次数');
      for (const key of ['select', 'confirm'])
        if (key in p) {
          if (!Array.isArray(p[key])) reject('招募星级必须是数组');
          (p[key] as unknown[]).forEach((value) => integer(value, '招募星级', 1, 6));
        }
      if ('extra_tags_mode' in p) integer(p.extra_tags_mode, '额外标签模式', 0, 2);
      if ('recruitment_time' in p) {
        if (!object(p.recruitment_time)) reject('招募时限必须是对象');
        for (const [level, minutes] of Object.entries(
          p.recruitment_time as Record<string, unknown>,
        )) {
          if (!['3', '4', '5', '6'].includes(level)) reject('招募时限星级必须在 3 到 6 之间');
          integer(minutes, '招募时限（分钟）', 60, 540);
        }
      }
    }
    if (task.type === 'Infrast') {
      if (![0, 10000, 20000].includes(Number(p.mode ?? 0))) reject('基建模式无效');
      if (p.mode === 10000) {
        if (typeof p.filename !== 'string' || !p.filename.trim()) reject('请选择自定义排班文件');
        integer(p.plan_index, '排班方案序号');
      }
      if (
        typeof (p.threshold ?? 0.3) !== 'number' ||
        Number(p.threshold ?? 0.3) < 0 ||
        Number(p.threshold ?? 0.3) > 1
      )
        reject('心情阈值必须在 0 到 1 之间');
      if (
        'facility' in p &&
        !(
          Array.isArray(p.facility) &&
          p.facility.every((value) => typeof value === 'string' && facilities.has(value))
        )
      )
        reject('基建设施无效');
      if ('drones' in p && !(typeof p.drones === 'string' && drones.has(p.drones)))
        reject('无人机用途无效');
    }
    if (task.type === 'SwitchTheme' && !Array.isArray(p.themes)) reject('请选择候选游戏主题');
    if (task.type === 'Roguelike') {
      if (
        !['Phantom', 'Mizuki', 'Sami', 'Sarkaz', 'JieGarden', 'BlackFlow'].includes(
          String(p.theme ?? 'Phantom'),
        )
      )
        reject('集成战略主题无效');
      if (![0, 1, 4, 5, 6, 7, 10001, 20001, 30001, 30003].includes(Number(p.mode ?? 0)))
        reject('集成战略模式无效或已被上游移除');
    }
    if (task.type === 'Reclamation') {
      const theme = p.theme ?? 'Tales';
      const mode = p.mode ?? 0;
      if (
        !(theme === 'Tales' && [0, 1].includes(Number(mode))) &&
        !(theme === 'RelaunchAnchor' && [16, 32, 48].includes(Number(mode)))
      )
        reject('生息演算主题与模式组合无效');
    }
    if (['Copilot', 'SSSCopilot', 'ParadoxCopilot', 'VideoRecognition'].includes(task.type)) {
      const entries =
        task.type === 'Copilot'
          ? p.copilot_list
          : task.type === 'ParadoxCopilot'
            ? p.list
            : undefined;
      if ('filename' in p) {
        if (typeof p.filename !== 'string' || !p.filename.trim()) reject('文件路径不可为空');
      } else {
        if (!Array.isArray(entries) || !entries.length)
          reject('请选择本地文件，或填写非空作业列表');
        if (
          task.type === 'ParadoxCopilot' &&
          !(entries as unknown[]).every((entry) => typeof entry === 'string') &&
          !(entries as unknown[]).every(object)
        )
          reject('悖论作业列表必须全部是文件路径，或全部是带整数 ID 的对象');
        for (const entry of entries as unknown[]) {
          if (task.type === 'ParadoxCopilot' && typeof entry === 'string' && entry.trim()) continue;
          if (!object(entry) || typeof entry.filename !== 'string' || !entry.filename.trim())
            reject('作业列表格式无效');
          const item = entry as Record<string, unknown>;
          if (task.type === 'ParadoxCopilot' || 'id' in item)
            integer(item.id, '作业 ID', -2_147_483_648);
          if ('is_raid' in item && typeof item.is_raid !== 'boolean')
            reject('作业突袭选项必须是布尔值');
        }
      }
      if ('loop_times' in p) integer(p.loop_times, '循环次数', 1);
    }
    if (task.type === 'Custom') {
      if (!Array.isArray(p.task_names) || !p.task_names.length)
        reject('自定义任务需要非空 task_names 数组');
      for (const name of p.task_names as unknown[])
        if (
          typeof name !== 'string' ||
          !(
            name === 'MiniGame@PixelPaint@Begin' ||
            /^MiniGame@SecretFront@Begin@Ending[A-E](?:@[^@\x00]{1,80})?$/.test(name)
          )
        )
          reject('此自定义任务链尚未通过消耗策略审核，请使用对应的标准任务');
    }
    if (task.type === 'SingleStep') {
      if (p.type !== 'copilot' || !['stage', 'start', 'action'].includes(String(p.subtype)))
        reject('单步任务类型无效');
      const details = p.details ?? {};
      if (!object(details)) reject('单步任务 details 必须是对象');
      if (
        p.subtype === 'stage' &&
        !(
          typeof (details as Record<string, unknown>).stage_name === 'string' &&
          String((details as Record<string, unknown>).stage_name).trim()
        )
      )
        reject('单步任务关卡不可为空');
      if (
        p.subtype === 'action' &&
        !(
          Array.isArray((details as Record<string, unknown>).actions) &&
          ((details as Record<string, unknown>).actions as unknown[]).length &&
          ((details as Record<string, unknown>).actions as unknown[]).every(object)
        )
      )
        reject('当前核心要求 details.actions 为非空操作数组');
    }
    if (task.type === 'OperProgress' && !Array.isArray(p.plans)) reject('干员养成需要 plans 数组');
  }
  taskConsumableLimits(plan);
}
