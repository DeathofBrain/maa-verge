import { expect, test } from 'bun:test';
import { parsePlan, parseSettings } from '@backend/modules/settings/models';
import { nativeTask, validatePlan } from '@backend/modules/plans/task-policy';

type Fixture = {
  name: string;
  operation: 'policy' | 'parsePlan' | 'settings' | 'native';
  value: any;
  code?: number;
  expected?: unknown;
};
const taskParams: Record<string, Record<string, any>> = {
  StartUp: {},
  CloseDown: {},
  Fight: {},
  Recruit: {},
  Infrast: {},
  Mall: {},
  Award: {},
  SwitchTheme: { themes: [] },
  Roguelike: {},
  Copilot: { filename: 'local.json' },
  SSSCopilot: { filename: 'local.json' },
  ParadoxCopilot: { list: ['local.json'] },
  Depot: {},
  OperBox: {},
  Reclamation: {},
  Custom: { task_names: ['MiniGame@PixelPaint@Begin'] },
  SingleStep: { type: 'copilot', subtype: 'start' },
  VideoRecognition: { filename: 'local.mp4' },
  OperProgress: { plans: [] },
};
// Independent expected wire parameters for every registered native task.
// Keep input fixtures separate so a lost default cannot redefine its own expectation.
const nativeParams: Record<string, Record<string, unknown>> = {
  StartUp: { client_type: 'Official', start_game_enabled: true },
  CloseDown: { client_type: 'Official' },
  Fight: {
    medicine: 0,
    stone: 0,
    expiring_medicine: 0,
    medicine_expire_days: 0,
    times: 1,
    report_to_penguin: false,
    report_to_yituliu: false,
  },
  Recruit: {
    report_to_penguin: false,
    report_to_yituliu: false,
    expedite: false,
    expedite_times: 0,
    select: [3, 4, 5],
    confirm: [3, 4],
  },
  Infrast: {
    facility: ['Mfg', 'Trade', 'Power', 'Control', 'Reception', 'Office', 'Dorm'],
    drones: '_NotUse',
    threshold: 0.3,
  },
  Mall: {},
  Award: {},
  SwitchTheme: { themes: [] },
  Roguelike: { report_to_penguin: false, report_to_yituliu: false },
  Copilot: { filename: 'local.json', use_sanity_potion: false },
  SSSCopilot: { filename: 'local.json' },
  ParadoxCopilot: { list: ['local.json'] },
  Depot: {},
  OperBox: {},
  Reclamation: {},
  Custom: { task_names: ['MiniGame@PixelPaint@Begin'] },
  SingleStep: { type: 'copilot', subtype: 'start' },
  VideoRecognition: { filename: 'local.mp4' },
  OperProgress: { plans: [] },
};
const plan = (type = 'Fight', params: any = {}, enabled: any = true) => ({
  name: '策略对照',
  tasks: [{ type, params, enabled }],
});
const fixtures: Fixture[] = [];
function policy(name: string, type: string, params: any, code?: number, enabled: any = true) {
  fixtures.push({ name, operation: 'policy', value: plan(type, params, enabled), code });
}
for (const [type, params] of Object.entries(taskParams)) {
  policy(`${type} valid minimal parameters`, type, params);
  fixtures.push({
    name: `${type} explicit native defaults`,
    operation: 'native',
    value: plan(type, { ...params, extension: { keep: true } }),
    expected: { type, params: { ...nativeParams[type], extension: { keep: true } }, enabled: true },
  });
}
// Shared validation does not branch on task type; retain two representative tasks.
for (const type of ['Fight', 'Copilot']) {
  policy(
    `${type} null spend is not a default`,
    type,
    { ...taskParams[type], medicine: null },
    -32010,
  );
  policy(
    `${type} disabled task still rejects invalid generic booleans`,
    type,
    { ...taskParams[type], enable: 0 },
    -32010,
    false,
  );
  policy(`${type} disabled task still rejects malformed parameters`, type, [], -32602, false);
}
for (const enabled of [true, false]) {
  fixtures.push({
    name: `Fight material targets ${enabled ? 'enabled' : 'disabled'}`,
    operation: 'native',
    value: plan('Fight', { drops_enabled: enabled, drops: { '30013': 7 } }),
    expected: {
      type: 'Fight',
      params: { ...nativeParams.Fight, drops: enabled ? { '30013': 7 } : {} },
      enabled: true,
    },
  });
  policy(`Fight material target switch ${enabled} accepted`, 'Fight', {
    drops_enabled: enabled,
    drops: { '30013': 7 },
  });
}
for (const override of [null, '', '1-7'])
  fixtures.push({
    name: `Copilot native navigation override ${JSON.stringify(override)}`,
    operation: 'native',
    value: plan('Copilot', {
      copilot_list: [{ filename: 'task.json', id: 1, nav_name_override: override }],
    }),
    expected: {
      type: 'Copilot',
      params: {
        copilot_list: [
          {
            filename: 'task.json',
            id: 1,
            ...(override === null ? {} : { nav_name_override: override }),
          },
        ],
        use_sanity_potion: false,
      },
      enabled: true,
    },
  });
const defaulted: Array<[string, string]> = [
  ['Fight', 'times'],
  ['Fight', 'stage'],
  ['Fight', 'series'],
  ['Recruit', 'times'],
  ['Recruit', 'extra_tags_mode'],
  ['Infrast', 'mode'],
  ['Infrast', 'drones'],
  ['Infrast', 'threshold'],
  ['Roguelike', 'theme'],
  ['Roguelike', 'mode'],
  ['Reclamation', 'theme'],
  ['Reclamation', 'mode'],
  ['SingleStep', 'details'],
];
for (const [type, key] of defaulted) {
  policy(
    `${type}.${key} explicit null rejected`,
    type,
    { ...taskParams[type], [key]: null },
    -32010,
  );
  policy(
    `${type}.${key} disabled specific check remains skipped`,
    type,
    { ...taskParams[type], [key]: null },
    undefined,
    false,
  );
}
for (const key of [
  'stone',
  'medicine',
  'expiring_medicine',
  'medicine_expire_days',
  'expedite_times',
]) {
  for (const value of [null, false, true, '', '0', -1, 0.5, 2147483648])
    policy(`strict integer ${key}=${JSON.stringify(value)}`, 'Fight', { [key]: value }, -32010);
}
for (const key of ['Shell', 'ſhell', 'CoMmAnD', 'ſcript', 'AdB']) {
  policy(`nested command ${key} blocked`, 'Fight', { extension: [{ [key]: 'ignored' }] }, -32010);
}
for (const key of 'enable drops_enabled start_game_enabled refresh set_time expedite skip_robot report_to_penguin report_to_yituliu DrGrandet replenish dorm_notstationed_enabled dorm_trust_enabled fiammetta_recovery_enabled use_pinus_sylvestris use_perception_information use_worldly_plight use_abyssal_hunter reception_message_board reception_clue_exchange reception_send_clue continue_training visit_friends shopping force_shopping_if_credit_full only_buy_discount reserve_max_credit credit_fight award mail recruit orundum mining specialaccess signinevent formation use_sanity_potion add_trust ignore_requirements clear_store'.split(
  ' ',
)) {
  policy(`all generic booleans stay strict: ${key}`, 'Fight', { [key]: 'false' }, -32010, false);
}
for (const key of 'first_tags preserve_tags buy_first blacklist fiammetta_targets themes task_names tools_to_craft'.split(
  ' ',
)) {
  policy(
    `all generic text lists stay strict: ${key}`,
    'Fight',
    { [key]: ['valid', 1] },
    -32010,
    false,
  );
}
const invalidSpecific: Array<[string, any]> = [
  ['Fight', { times: 0 }],
  ['Fight', { series: 11 }],
  ['Fight', { drops: [] }],
  ['Fight', { drops: { '': 1 } }],
  ['Fight', { drops: { item: 0 } }],
  ['Recruit', { select: '3' }],
  ['Recruit', { confirm: [true] }],
  ['Recruit', { select: [7] }],
  ['Recruit', { extra_tags_mode: 3 }],
  ['Recruit', { recruitment_time: [] }],
  ['Recruit', { recruitment_time: { '2': 60 } }],
  ['Recruit', { recruitment_time: { '3': 59 } }],
  ['Recruit', { recruitment_time: { '6': 541 } }],
  ['Infrast', { mode: 1 }],
  ['Infrast', { facility: ['Factory'] }],
  ['Infrast', { facility: [1] }],
  ['Infrast', { drones: 'unknown' }],
  ['Infrast', { threshold: true }],
  ['Infrast', { threshold: 1.01 }],
  ['Infrast', { mode: 10000, filename: 'plan.json' }],
  ['Infrast', { mode: 10000, filename: 'plan.json', plan_index: true }],
  ['SwitchTheme', {}],
  ['Roguelike', { theme: 'removed' }],
  ['Roguelike', { mode: 2 }],
  ['Copilot', { filename: '', copilot_list: [{ filename: 'valid.json' }] }],
  ['Copilot', { copilot_list: [{ filename: 'task.json', id: true }] }],
  ['Copilot', { copilot_list: [{ filename: 'task.json', is_raid: 1 }] }],
  ['Copilot', { copilot_list: [{ filename: 'task.json', nav_name_override: 1 }] }],
  ['ParadoxCopilot', { list: ['task.json', { filename: 'task.json', id: 1 }] }],
  ['ParadoxCopilot', { list: [{ filename: 'task.json' }] }],
  ['SSSCopilot', { list: ['task.json'] }],
  ['VideoRecognition', { filename: null }],
  ['Reclamation', { theme: 'Tales', mode: 16 }],
  ['Reclamation', { theme: 'RelaunchAnchor', mode: 0 }],
  ['Custom', { task_names: ['FightBegin'] }],
  ['Custom', { task_names: [] }],
  ['SingleStep', { type: 'other', subtype: 'start' }],
  ['SingleStep', { type: 'copilot', subtype: 'other' }],
  ['SingleStep', { type: 'copilot', subtype: 'stage', details: { stage_name: '' } }],
  ['SingleStep', { type: 'copilot', subtype: 'action', details: { actions: [] } }],
  ['SingleStep', { type: 'copilot', subtype: 'action', details: { actions: [null] } }],
  ['OperProgress', { plans: [null] }],
  ['OperProgress', { plans: [{}] }],
  ['OperProgress', { plans: [{ name: '阿米娅', elite: 0 }] }],
  ['OperProgress', { plans: [{ name: '阿米娅', skill_level: 8 }] }],
  ['OperProgress', { plans: [{ name: '阿米娅', skill_mastery: [0, 0] }] }],
  ['OperProgress', { plans: [{ name: '阿米娅', skill_mastery: [0, 0, true] }] }],
  ['Award', { formation_index: 5 }],
];
for (const [index, [type, params]] of invalidSpecific.entries())
  policy(`specific upstream field rejection ${index}: ${type}`, type, params, -32010);
const validSpecific: Array<[string, any]> = [
  ['Fight', { times: 1, series: -1, drops: { item: 1 } }],
  ['Fight', { times: 2147483647, series: 10 }],
  [
    'Recruit',
    {
      times: 0,
      select: [1, 6],
      confirm: [],
      extra_tags_mode: 2,
      recruitment_time: { '3': 60, '6': 540 },
    },
  ],
  ['Infrast', { mode: 20000, facility: ['Mfg', 'Training', 'AssistantChange'], threshold: 0 }],
  ['Infrast', { mode: 10000, filename: 'plan.json', plan_index: 0, threshold: 1 }],
  ['Roguelike', { theme: 'BlackFlow', mode: 30003 }],
  [
    'Copilot',
    {
      copilot_list: [
        { filename: 'task.json', id: -2147483648, is_raid: false, nav_name_override: null },
      ],
    },
  ],
  ['ParadoxCopilot', { list: [{ filename: 'task.json', id: 2147483647 }] }],
  ['Reclamation', { theme: 'RelaunchAnchor', mode: 48 }],
  ['SingleStep', { type: 'copilot', subtype: 'stage', details: { stage_name: '1-7' } }],
  ['SingleStep', { type: 'copilot', subtype: 'action', details: { actions: [{}] } }],
  [
    'OperProgress',
    { plans: [{ name: '阿米娅', elite: 2, skill_level: 7, skill_mastery: [0, 1, 3] }] },
  ],
  ['Award', { formation_index: 4 }],
];
for (const [index, [type, params]] of validSpecific.entries())
  policy(`specific upstream field boundary ${index}: ${type}`, type, params);
for (const value of [null, [], false, true, 0, 1, '', '0']) {
  fixtures.push({
    name: `settings budgets ${JSON.stringify(value)} rejected`,
    operation: 'settings',
    value: { budgets: value },
    code: -32602,
  });
  fixtures.push({
    name: `settings model ${JSON.stringify(value)} rejected`,
    operation: 'settings',
    value: { model: value },
    code: -32602,
  });
  if (value !== null)
    fixtures.push({
      name: `plan budgets ${JSON.stringify(value)} rejected`,
      operation: 'parsePlan',
      value: { ...plan(), budgets: value },
      code: -32602,
    });
}
for (const value of [null, '1e0', '1.1', 1.1, '1__0', '\ufeff1', '\u001c1', 101, -1]) {
  fixtures.push({
    name: `invalid budget scalar ${JSON.stringify(value).slice(0, 40)}`,
    operation: 'settings',
    value: { budgets: { medicine: value } },
    code: -32602,
  });
}
for (const value of [null, 2, -1, '', ' true ', [], {}])
  fixtures.push({
    name: `invalid model bool ${JSON.stringify(value)}`,
    operation: 'settings',
    value: { autoConnect: value },
    code: -32602,
  });
fixtures.push({
  name: 'unknown model field rejected',
  operation: 'settings',
  value: { model: { command: 'ignored' } },
  code: -32602,
});
fixtures.push({
  name: 'unknown budget field rejected',
  operation: 'parsePlan',
  value: { ...plan(), budgets: { stone: 0 } },
  code: -32602,
});
fixtures.push({
  name: 'unknown task type rejected even when disabled',
  operation: 'policy',
  value: plan('Unregistered', {}, false),
  code: -32602,
});
policy('disabled bool still checks client', 'Fight', { client_type: null }, -32010, false);
policy(
  'disabled string list still checks all element text',
  'Fight',
  { themes: [null] },
  -32010,
  false,
);
policy('invalid Unicode key rejected', 'Fight', { ['\ud800']: 'text' }, -32010);
policy('invalid Unicode value rejected', 'Fight', { extension: '\udfff' }, -32010);
policy('valid supplementary Unicode at text length bound', 'Fight', { stage: '😀'.repeat(4096) });
policy(
  'supplementary Unicode beyond text length bound rejected',
  'Fight',
  { stage: '😀'.repeat(4097) },
  -32010,
);
policy(
  'information separator whitespace filenames rejected',
  'Copilot',
  { filename: '\u001c' },
  -32010,
);
policy('NEL whitespace filenames rejected', 'Copilot', { filename: '\u0085' }, -32010);
policy('BOM remains a nonempty filename', 'Copilot', { filename: '\ufeff' });
policy(
  'custom suffix newline outside resource entry rejected',
  'Custom',
  { task_names: ['MiniGame@SecretFront@Begin@EndingA\n'] },
  -32010,
);
policy('custom suffix supplementary code points accepted at bound', 'Custom', {
  task_names: ['MiniGame@SecretFront@Begin@EndingA@' + '😀'.repeat(80)],
});
policy(
  'custom suffix supplementary code points beyond bound rejected',
  'Custom',
  { task_names: ['MiniGame@SecretFront@Begin@EndingA@' + '😀'.repeat(81)] },
  -32010,
);
policy('ASCII parameters at exact 512 KiB accepted', 'Fight', {
  blob: 'x'.repeat(512 * 1024 - 12),
});
policy(
  'ASCII parameters above 512 KiB rejected',
  'Fight',
  { blob: 'x'.repeat(512 * 1024 - 11) },
  -32010,
);
policy('UTF-8 parameters at exact 512 KiB accepted', 'Fight', {
  blob: '😀'.repeat((512 * 1024 - 12) / 4),
});
policy(
  'UTF-8 parameters above 512 KiB rejected',
  'Fight',
  { blob: '😀'.repeat((512 * 1024 - 12) / 4) + 'a' },
  -32010,
);
const numericOverhead = Buffer.byteLength('{"numbers": [1e-05, 1e-07], "padding": ""}');
policy('canonical float serialization exact byte bound accepted', 'Fight', {
  numbers: [1e-5, 1e-7],
  padding: 'x'.repeat(512 * 1024 - numericOverhead),
});
policy(
  'canonical float serialization above byte bound rejected',
  'Fight',
  { numbers: [1e-5, 1e-7], padding: 'x'.repeat(512 * 1024 - numericOverhead + 1) },
  -32010,
);
let nested: any = 'leaf';
for (let index = 0; index < 33; index++) nested = [nested];
policy('nested JSON exceeds depth bound', 'Fight', { nested }, -32010);
let acceptedDepth: any = 'leaf';
for (let index = 0; index < 31; index++) acceptedDepth = [acceptedDepth];
policy('nested JSON at depth bound accepted', 'Fight', { nested: acceptedDepth });

function evaluate(fixture: Fixture): any {
  try {
    if (fixture.operation === 'settings') return { ok: true, value: parseSettings(fixture.value) };
    const parsed = parsePlan(fixture.value);
    if (fixture.operation === 'parsePlan') return { ok: true, value: parsed };
    if (fixture.operation === 'native') return { ok: true, value: nativeTask(parsed.tasks[0]) };
    validatePlan(parsed, parseSettings());
    return { ok: true };
  } catch (error: any) {
    return { ok: false, code: error.code };
  }
}
for (const fixture of fixtures)
  test(fixture.name, () => {
    const result = evaluate(fixture);
    expect(result.ok).toBe(fixture.code === undefined);
    if (fixture.code !== undefined) expect(result.code).toBe(fixture.code);
    if (fixture.operation === 'native')
      expect(result).toEqual({ ok: true, value: fixture.expected });
  });
test('model scalar coercions retain fixed normalized values', () => {
  for (const [input, expected] of [
    [true, true],
    [false, false],
    [0, false],
    [1, true],
    ['0', false],
    ['1', true],
    ['False', false],
    ['ON', true],
    ['n', false],
    ['yes', true],
  ] as const) {
    expect(parseSettings({ autoConnect: input }).autoConnect).toBe(expected);
    expect(parsePlan(plan('Fight', {}, input)).tasks[0].enabled).toBe(expected);
  }
  for (const [input, expected] of [
    [true, 1],
    [false, 0],
    [0, 0],
    [1, 1],
    ['1', 1],
    ['1.0', 1],
    [' 1 ', 1],
    ['+01', 1],
    ['1_0', 10],
    ['1_0.00', 10],
    ['\u00851', 1],
    ['0'.repeat(4301), 0],
  ] as const) {
    expect(parseSettings({ budgets: { medicine: input } }).budgets).toEqual({
      medicine: expected,
      originium: 0,
      expedited: 0,
    });
  }
});

test('native defaults retain explicit values and never mutate a saved task', () => {
  const task = parsePlan(plan('Fight', { times: null, report_to_penguin: true })).tasks[0];
  const before = structuredClone(task),
    copied = nativeTask(task);
  expect(copied.params.times).toBeNull();
  expect(copied.params.report_to_penguin).toBe(true);
  expect(copied.params.medicine).toBe(0);
  expect(task).toEqual(before);
});
test('material target switches affect native parameters without changing saved targets', () => {
  for (const enabled of [undefined, true, false]) {
    const task = parsePlan(
      plan('Fight', {
        drops: { '30013': 7 },
        ...(enabled === undefined ? {} : { drops_enabled: enabled }),
      }),
    ).tasks[0];
    const before = structuredClone(task);
    const copied = nativeTask(task);
    expect(copied.params.drops).toEqual(enabled === false ? {} : { '30013': 7 });
    expect(copied.params).not.toHaveProperty('drops_enabled');
    expect(task).toEqual(before);
  }
});

test('native copilot navigation normalizes only legacy null overrides without mutating saved parameters', () => {
  const task = parsePlan(
    plan('Copilot', {
      copilot_list: [
        { filename: 'default.json', id: 1, nav_name_override: null, extension: { keep: null } },
        { filename: 'override.json', id: 2, is_raid: true, nav_name_override: '1-7' },
        { filename: 'absent.json', id: 3 },
        { filename: 'empty.json', id: 4, nav_name_override: '' },
      ],
      extension: { nav_name_override: null },
    }),
  ).tasks[0];
  const before = structuredClone(task),
    copied = nativeTask(task);
  expect(copied.params.copilot_list).toEqual([
    { filename: 'default.json', id: 1, extension: { keep: null } },
    { filename: 'override.json', id: 2, is_raid: true, nav_name_override: '1-7' },
    { filename: 'absent.json', id: 3 },
    { filename: 'empty.json', id: 4, nav_name_override: '' },
  ]);
  expect(copied.params.extension).toEqual({ nav_name_override: null });
  expect(task).toEqual(before);
});
test('non-JSON direct parameters are rejected deterministically', () => {
  for (const value of [NaN, Infinity, -Infinity, undefined, 1n, new Date(), new Map(), () => {}]) {
    expect(
      evaluate({
        name: 'non-json',
        operation: 'policy',
        value: plan('Fight', { extension: value }),
      }),
    ).toEqual({ ok: false, code: -32010 });
  }
});
