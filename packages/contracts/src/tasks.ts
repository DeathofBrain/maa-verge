import type { Task } from './types';

/** 保留既有任务配置格式；执行能力由独立预检决定，目录登记不代表已经迁移。 */
export const taskLabels: Record<string, string> = {
  StartUp: '启动游戏',
  Fight: '自动作战',
  Recruit: '公开招募',
  Infrast: '基建换班',
  Mall: '信用商店',
  Award: '领取奖励',
  CloseDown: '关闭游戏',
  SwitchTheme: '切换主题',
  Roguelike: '集成战略',
  Reclamation: '生息演算',
  Copilot: '自动作业',
  SSSCopilot: '保全派驻',
  ParadoxCopilot: '悖论模拟',
  Depot: '仓库识别',
  OperBox: '干员识别',
  OperProgress: '干员养成',
  Custom: '自定义任务',
  SingleStep: '单步战斗',
  VideoRecognition: '视频识别',
  UserDataUpdate: '更新数据',
};

export const taskDefaults: Record<string, Record<string, unknown>> = {
  StartUp: { client_type: 'Official', start_game_enabled: true, account_name: '' },
  Fight: {
    stage: '',
    times: 1,
    medicine: 0,
    stone: 0,
    series: 1,
    DrGrandet: false,
    report_to_penguin: false,
    report_to_yituliu: false,
  },
  Recruit: {
    refresh: true,
    force_refresh: true,
    select: [4],
    confirm: [3, 4],
    times: 4,
    expedite: false,
    expedite_times: 0,
    set_time: true,
    recruitment_time: { '3': 540, '4': 540, '5': 540, '6': 540 },
    extra_tags_mode: 0,
    preserve_tags: [],
    first_tags: [],
    level3_recruitment_permit_reserve: 0,
  },
  Infrast: {
    mode: 0,
    facility: [
      'Mfg',
      'Trade',
      'Control',
      'Power',
      'Reception',
      'Office',
      'Recycle',
      'Dorm',
      'Processing',
      'Training',
      'AssistantChange',
    ],
    drones: 'Money',
    threshold: 0.3,
    dorm_notstationed_enabled: true,
    dorm_trust_enabled: true,
    replenish: true,
    reception_message_board: true,
    reception_clue_exchange: true,
    reception_send_clue: true,
  },
  Mall: {
    visit_friends: false,
    visit_friends_once_a_day: false,
    credit_fight: false,
    formation_index: 0,
    shopping: false,
    credit_budget: 0,
    buy_first: ['招聘许可'],
    blacklist: ['碳', '家具', '加急许可'],
    force_shopping_if_credit_full: false,
    only_buy_discount: false,
  },
  Award: {
    award: true,
    mail: false,
    recruit: false,
    orundum: false,
    mining: false,
    specialaccess: false,
    signinevent: false,
  },
  CloseDown: { client_type: 'Official' },
  SwitchTheme: { themes: [] },
  Roguelike: {
    theme: 'Phantom',
    mode: 0,
    starts_count: 999999,
    investment_enabled: true,
    stop_when_investment_full: false,
    squad: '',
    roles: '',
    core_char: '',
    use_support: false,
  },
  Reclamation: {
    theme: 'Tales',
    mode: 1,
    clear_store: true,
    num_craft_batches: 16,
    tools_to_craft: ['荧光棒'],
  },
  Copilot: { filename: '', formation: false, loop_times: 1, use_sanity_potion: false },
  SSSCopilot: { filename: '', loop_times: 1 },
  ParadoxCopilot: { filename: '' },
  Depot: {},
  OperBox: {},
  OperProgress: { plans: [] },
  Custom: { task_names: [] },
  SingleStep: { type: 'copilot', subtype: 'stage', details: { stage_name: '1-7' } },
  VideoRecognition: { filename: '' },
  UserDataUpdate: { operators: true, depot: true, interval: 'always' },
};

/** 新日常表保留熟悉的目录顺序，仅启用已有安全默认的流程；不修改存量配置。 */
export const defaultDailyTaskTypes: readonly Task['type'][] = [
  'StartUp',
  'Fight',
  'Infrast',
  'Recruit',
  'Mall',
  'Award',
  'Roguelike',
  'Reclamation',
  'UserDataUpdate',
];

export function createDefaultDailyTasks(): Task[] {
  const enabled = new Set<Task['type']>(['StartUp', 'Fight', 'Mall', 'Award']);
  return defaultDailyTaskTypes.map((type) => ({
    type,
    params: structuredClone(taskDefaults[type]),
    enabled: enabled.has(type),
  }));
}

/** Choose a usable name without changing existing plans or a recovered draft. */
export function nextPlanName(
  names: Iterable<string>,
  group: 'daily' | 'specialized' = 'daily',
): string {
  const existing = new Set([...names].map((name) => name.trim()));
  const prefix = group === 'daily' ? '日常表' : '专项表';
  let number = 1;
  while (existing.has(`${prefix}${number}`)) number++;
  return `${prefix}${number}`;
}
