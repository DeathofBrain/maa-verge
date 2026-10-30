import type { Plan } from '@maaverge/contracts';

export type Field = {
  key: string;
  label: string;
  kind?:
    | 'number'
    | 'check'
    | 'list'
    | 'numbers'
    | 'select'
    | 'stage'
    | 'drops'
    | 'facilities'
    | 'stars'
    | 'recruit-confirm'
    | 'limit'
    | 'account'
    | 'threshold';
  options?: (string | [string, string])[];
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  numeric?: boolean;
  disabled?: boolean;
};

type Task = Plan['tasks'][number];

export const clients: [string, string][] = [
  ['Official', '官服'],
  ['Bilibili', 'B 服'],
  ['YoStarEN', '国际服'],
  ['YoStarJP', '日服'],
  ['YoStarKR', '韩服'],
  ['txwy', '繁中服'],
];
export const fields: Record<string, Field[]> = {
  StartUp: [
    { key: 'client_type', label: '游戏客户端', kind: 'select', options: clients },
    {
      key: 'start_game_enabled',
      label: '自动启动游戏',
      kind: 'check',
      hint: '在已连接设备中启动所选客户端；不会启动模拟器。',
    },
    {
      key: 'account_name',
      label: '切换账号标识',
      kind: 'account',
      hint: '填写已在游戏登录的账号显示名的唯一片段；留空不切换。',
    },
  ],
  CloseDown: [{ key: 'client_type', label: '游戏客户端', kind: 'select', options: clients }],
  Fight: [
    {
      key: 'stage',
      label: '作战关卡',
      kind: 'stage',
      hint: '预设与原版关卡对应；也可直接输入活动关卡代码。关卡开放与可代理状态由游戏和当前资源决定。',
    },
    { key: 'times', label: '作战次数', kind: 'limit', min: 1, max: 2147483647 },
    { key: 'drops', label: '指定材料', kind: 'drops' },
    {
      key: 'medicine',
      label: '理智药上限',
      kind: 'limit',
      min: 0,
      max: 100,
      hint: '取消勾选为 0；本项上限与其他启用的自动作战任务累计，作为本次执行的消耗上限。',
    },
    { key: 'stone', label: '源石上限', kind: 'limit', min: 0, max: 100 },
    {
      key: 'series',
      label: '代理倍率',
      kind: 'select',
      numeric: true,
      options: [
        ['0', 'AUTO · 自动识别最大倍率'],
        ['-1', '不切换 · 保留游戏内设置'],
        ...Array.from({ length: 10 }, (_, index): [string, string] => [
          String(index + 1),
          `${index + 1} 倍`,
        ]),
      ],
      hint: 'AUTO 保持可用最大倍率；固定倍率需要足够的理智和剩余次数。不切换时保留游戏内设置。',
    },
    { key: 'DrGrandet', label: '源石使用前等待理智恢复', kind: 'check' },
    { key: 'report_to_penguin', label: '上传掉落至企鹅物流', kind: 'check' },
    { key: 'report_to_yituliu', label: '上传掉落至一图流', kind: 'check' },
  ],
  Recruit: [
    {
      key: 'times',
      label: '招募次数',
      kind: 'number',
      min: 0,
      max: 2147483647,
      hint: '每次执行时最大招募次数；0 表示只识别标签，不开始招募。',
    },
    { key: 'select', label: '选择星级', kind: 'stars' },
    { key: 'confirm', label: '自动确认星级与招募时长', kind: 'recruit-confirm' },
    { key: 'set_time', label: '自动设置招募时长', kind: 'check' },
    { key: 'refresh', label: '自动刷新标签', kind: 'check' },
    {
      key: 'expedite',
      label: '自动使用加急许可',
      kind: 'check',
      disabled: true,
      hint: '尚未开放：当前核心忽略加急次数限制，需要补齐可靠消耗控制。',
    },
    { key: 'skip_robot', label: '跳过支援机械', kind: 'check' },
    {
      key: 'extra_tags_mode',
      label: '额外标签策略',
      kind: 'select',
      numeric: true,
      options: [
        ['0', '默认'],
        ['1', '选择更多标签'],
        ['2', '选择稀有标签'],
      ],
    },
  ],
  Infrast: [
    {
      key: 'facility',
      label: '换班设施与顺序',
      kind: 'facilities',
      hint: '勾选需要处理的设施；既有执行顺序保留，新勾选的设施添加到末尾。',
    },
    {
      key: 'drones',
      label: '无人机用途',
      kind: 'select',
      options: [
        ['_NotUse', '不使用'],
        ['Money', '贸易站 · 龙门币'],
        ['SyntheticJade', '贸易站 · 合成玉'],
        ['CombatRecord', '制造站 · 作战记录'],
        ['PureGold', '制造站 · 赤金'],
        ['OriginStone', '制造站 · 源石碎片'],
        ['Chip', '制造站 · 芯片'],
      ],
    },
    {
      key: 'threshold',
      label: '换班心情阈值',
      kind: 'threshold',
      min: 0,
      max: 1,
      step: 0.05,
      hint: '低于此心情比例时替换干员。',
    },
    {
      key: 'mode',
      label: '换班模式',
      kind: 'select',
      options: [
        ['0', '常规模式'],
        ['10000', '自定义排班'],
        ['20000', '一键轮换'],
      ],
    },
    { key: 'filename', label: '自定义排班文件路径' },
    { key: 'plan_index', label: '排班方案序号', kind: 'number', min: 0 },
    { key: 'dorm_notstationed_enabled', label: '宿舍优先未进驻干员', kind: 'check' },
    { key: 'reception_message_board', label: '会客室信息板收取信用', kind: 'check' },
    { key: 'reception_clue_exchange', label: '进行线索交流', kind: 'check' },
    { key: 'reception_send_clue', label: '赠送线索', kind: 'check' },
  ],
  Mall: [
    { key: 'visit_friends', label: '访问好友收取信用', kind: 'check' },
    { key: 'visit_friends_once_a_day', label: '访问好友一日只执行一次', kind: 'check' },
    { key: 'credit_fight', label: '借助战打 OF-1 赚信用', kind: 'check' },
    {
      key: 'formation_index',
      label: '借助战使用编队',
      kind: 'select',
      numeric: true,
      options: [
        ['0', '当前编队'],
        ['1', '编队 1'],
        ['2', '编队 2'],
        ['3', '编队 3'],
        ['4', '编队 4'],
      ],
    },
    { key: 'shopping', label: '信用交易所自动购物', kind: 'check' },
    { key: 'buy_first', label: '优先购买', kind: 'list' },
    { key: 'blacklist', label: '购买黑名单', kind: 'list' },
    { key: 'force_shopping_if_credit_full', label: '信用溢出时忽略黑名单', kind: 'check' },
    { key: 'only_buy_discount', label: '只购买打折商品', kind: 'check' },
  ],
  Award: [
    'award:领取每日 / 每周任务奖励',
    'mail:领取所有邮件奖励',
    'recruit:进行限定池赠送的每日免费单抽',
    'orundum:领取幸运墙的每日合成玉奖励',
    'mining:领取限时开采许可的每日合成玉奖励',
    'specialaccess:领取周年赠送月卡奖励',
    'signinevent:领取限时签到活动奖励',
  ].map((entry) => {
    const [key, label] = entry.split(':');
    return { key, label, kind: 'check' };
  }),
  UserDataUpdate: [
    { key: 'operators', label: '干员识别', kind: 'check' },
    { key: 'depot', label: '仓库识别', kind: 'check' },
    {
      key: 'interval',
      label: '触发间隔',
      kind: 'select',
      options: [
        ['always', '每次'],
        ['daily', '每日'],
        ['weekly', '每周'],
      ],
    },
  ],
  SwitchTheme: [
    {
      key: 'themes',
      label: '候选主题名称',
      kind: 'list',
      hint: '填写游戏内的完整名称，逗号分隔；留空跳过。',
    },
  ],
  Roguelike: [
    {
      key: 'theme',
      label: '集成战略主题',
      kind: 'select',
      options: [
        ['Phantom', '傀影与猩红孤钻'],
        ['Mizuki', '水月与深蓝之树'],
        ['Sami', '探索者的银凇止境'],
        ['Sarkaz', '萨卡兹的无终奇语'],
        ['JieGarden', '岁的界园志异'],
        ['BlackFlow', '黑流'],
      ],
    },
    {
      key: 'mode',
      label: '运行模式',
      kind: 'number',
      min: 0,
      hint: '0 刷分、1 刷源石锭；其他模式按所选主题填写。',
    },
    { key: 'starts_count', label: '开始探索次数', kind: 'number', min: 1 },
    { key: 'investment_enabled', label: '投资源石锭', kind: 'check' },
    { key: 'stop_when_investment_full', label: '投资满额后停止', kind: 'check' },
    { key: 'squad', label: '分队名称' },
    { key: 'roles', label: '开局招募组合' },
    { key: 'core_char', label: '核心干员' },
    { key: 'use_support', label: '使用助战', kind: 'check' },
  ],
  Reclamation: [
    {
      key: 'theme',
      label: '生息演算主题',
      kind: 'select',
      options: [
        ['Tales', '沙洲遗闻'],
        ['RelaunchAnchor', '重启锚点'],
      ],
    },
    {
      key: 'mode',
      label: '运行模式',
      kind: 'number',
      min: 0,
      hint: '沙洲遗闻：0 无存档、1 有存档；重启锚点：16 / 32 / 48。',
    },
    { key: 'tools_to_craft', label: '制造物品', kind: 'list' },
    { key: 'num_craft_batches', label: '最大制造轮数', kind: 'number', min: 1 },
    { key: 'clear_store', label: '完成后清空商店', kind: 'check' },
  ],
  Copilot: [
    {
      key: 'filename',
      label: '作业文件路径',
      hint: '使用本机作业 JSON 文件；作业列表可在高级参数中配置；使用列表时移除 filename。',
    },
    { key: 'loop_times', label: '循环次数', kind: 'number', min: 1 },
    { key: 'formation', label: '自动编队', kind: 'check' },
    { key: 'formation_index', label: '编队序号', kind: 'number', min: 1, max: 4 },
    { key: 'add_trust', label: '补充信赖干员', kind: 'check' },
    { key: 'ignore_requirements', label: '忽略练度要求', kind: 'check' },
  ],
  SSSCopilot: [
    { key: 'filename', label: '保全作业文件路径' },
    { key: 'loop_times', label: '循环次数', kind: 'number', min: 1 },
  ],
  ParadoxCopilot: [
    {
      key: 'filename',
      label: '悖论作业文件路径',
      hint: '多份作业可在高级参数的 list 中配置；使用列表时移除 filename。',
    },
  ],
  VideoRecognition: [{ key: 'filename', label: '视频文件路径' }],
  Custom: [
    {
      key: 'task_names',
      label: '资源任务入口',
      kind: 'list',
      hint: '当前仅接受已审核的入口；未审核任务会被策略拒绝。',
    },
  ],
  SingleStep: [
    { key: 'type', label: '任务协议', kind: 'select', options: ['copilot'] },
    {
      key: 'subtype',
      label: '步骤类型',
      kind: 'select',
      options: [
        ['stage', '设置关卡'],
        ['start', '开始作战'],
        ['action', '战斗动作'],
      ],
    },
  ],
};
export const taskFieldSearch = Object.entries(fields).flatMap(([type, entries]) =>
  entries.map(({ key, label }) => ({ type: type as Task['type'], key, label })),
);

export const taskCategories: Record<string, string> = {
  StartUp: '日常',
  Fight: '日常',
  Recruit: '日常',
  Infrast: '日常',
  Mall: '日常',
  Award: '日常',
  CloseDown: '日常',
  SwitchTheme: '日常',
  Roguelike: '专项',
  Reclamation: '专项',
  OperProgress: '专项',
  Copilot: '作业',
  SSSCopilot: '作业',
  ParadoxCopilot: '作业',
  VideoRecognition: '作业',
  Depot: '工具',
  OperBox: '工具',
  UserDataUpdate: '日常',
  Custom: '高级',
  SingleStep: '高级',
};
export type FieldGroup = { title: string; fields: Field[]; expanded: boolean };
export function fieldGroups(type: Task['type']): FieldGroup[] {
  const available = fields[type] || [];
  const definitions: [string, string[], boolean][] =
    type === 'Fight'
      ? [
          ['关卡与目标', ['stage', 'times', 'drops'], true],
          ['消耗上限', ['medicine', 'stone', 'DrGrandet'], true],
          ['执行方式', ['series'], true],
          ['掉落与数据汇报', ['report_to_penguin', 'report_to_yituliu'], false],
        ]
      : type === 'Infrast'
        ? [
            ['排班方案', ['mode', 'filename', 'plan_index'], true],
            ['设施与换班', ['facility', 'threshold'], true],
            ['无人机策略', ['drones'], true],
            [
              '信用与线索',
              ['reception_message_board', 'reception_clue_exchange', 'reception_send_clue'],
              true,
            ],
            ['其他设置', ['dorm_notstationed_enabled'], false],
          ]
        : type === 'Recruit'
          ? [
              ['招募与标签', ['times', 'confirm', 'set_time'], true],
              ['招募策略', ['select', 'refresh', 'skip_robot', 'extra_tags_mode'], false],
              ['加急设置', ['expedite'], true],
            ]
          : type === 'Roguelike'
            ? [
                ['主题与目标', ['theme', 'mode', 'starts_count'], true],
                ['开局编队', ['squad', 'roles', 'core_char', 'use_support'], true],
                ['投资策略', ['investment_enabled', 'stop_when_investment_full'], false],
              ]
            : type === 'Mall'
              ? [
                  [
                    '信用获取',
                    [
                      'visit_friends',
                      'visit_friends_once_a_day',
                      'credit_fight',
                      'formation_index',
                    ],
                    true,
                  ],
                  ['信用购物', ['shopping', 'buy_first', 'blacklist'], true],
                  ['购买策略', ['force_shopping_if_credit_full', 'only_buy_discount'], false],
                ]
              : [['任务设置', available.map((field) => field.key), true]];
  return definitions
    .map(([title, keys, expanded]) => ({
      title,
      fields: keys.flatMap((key) => available.filter((field) => field.key === key)),
      expanded,
    }))
    .filter((group) => group.fields.length);
}
