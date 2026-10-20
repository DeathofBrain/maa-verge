/** User-facing task catalogue. Parameter names follow MaaCore v6.20.0. */
export const taskLabels: Record<string, string> = {
  StartUp: '启动游戏', Fight: '自动作战', Recruit: '公开招募', Infrast: '基建换班',
  Mall: '信用商店', Award: '领取奖励', CloseDown: '关闭游戏', SwitchTheme: '切换主题',
  Roguelike: '集成战略', Reclamation: '生息演算', Copilot: '自动作业',
  SSSCopilot: '保全派驻', ParadoxCopilot: '悖论模拟', Depot: '仓库识别',
  OperBox: '干员识别', OperProgress: '干员养成识别', Custom: '自定义任务',
  SingleStep: '单步战斗', VideoRecognition: '视频识别',
};

export const taskDefaults: Record<string, Record<string, unknown>> = {
  StartUp: { client_type: 'Official', start_game_enabled: true },
  Fight: { stage: '1-7', times: 6, medicine: 0, stone: 0 },
  Recruit: { refresh: true, select: [4], confirm: [3, 4], times: 4, expedite: false, expedite_times: 0 },
  Infrast: { facility: ['Mfg', 'Trade', 'Power', 'Control', 'Reception', 'Office', 'Dorm'], drones: '_NotUse', threshold: 0.3 },
  Mall: { shopping: true, buy_first: [], blacklist: [], force_shopping_if_credit_full: false },
  Award: { award: true, mail: false, recruit: false }, CloseDown: { client_type: 'Official' },
  SwitchTheme: { themes: [] }, Roguelike: { theme: 'Mizuki', mode: 0, starts_count: 1 },
  Reclamation: { theme: 'Tales', mode: 0 },
  Copilot: { filename: '', formation: false, loop_times: 1, use_sanity_potion: false },
  SSSCopilot: { filename: '', loop_times: 1 }, ParadoxCopilot: { filename: '' },
  Depot: {}, OperBox: {}, OperProgress: { plans: [] }, Custom: { task_names: [] },
  SingleStep: { type: 'copilot', subtype: 'stage', details: { stage_name: '1-7' } },
  VideoRecognition: { filename: '' },
};
