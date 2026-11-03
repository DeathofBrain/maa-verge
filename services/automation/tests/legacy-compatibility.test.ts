/** 旧数据兼容检查只运行合成执行器：覆盖字段保留、整项阻断、资源预检与未知提交不重放。 */
import { expect, test } from 'bun:test';
import {
  compileLegacyTask,
  executeCompiledLegacyTask,
  validateCompiledLegacyTaskResources,
  type AtomicCapabilityDescriptor,
} from '@maaverge/automation';

test('legacy compilation preserves stored fields and blocks unsupported requested semantics before emitting steps', () => {
  const task = {
    type: 'Fight',
    enabled: true,
    params: {
      stage: '1-7',
      times: 2147483647,
      series: 1,
      medicine: 0,
      stone: 0,
      report_to_penguin: true,
      custom_option: { future: true },
    },
  };
  const before = structuredClone(task);
  const compilation = compileLegacyTask(task);
  expect(task).toEqual(before);
  expect(compilation.supported).toBe(false);
  expect(compilation.steps).toEqual([]);
  expect(compilation.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: 'report_to_penguin' }),
      expect.objectContaining({ field: 'custom_option', code: 'unknown_parameter' }),
    ]),
  );
});

test('disabled legacy rows retain unsupported parameters without granting any device action', () => {
  for (const task of [
    { type: 'Roguelike', enabled: false, params: { future: true } },
    { type: 'Infrast', params: { enable: false, unreviewed: true } },
  ])
    expect(compileLegacyTask(task)).toMatchObject({ supported: true, steps: [], issues: [] });
});

test('legacy current-stage counts and explicit medicine/stone limits remain exact', () => {
  const task = {
    type: 'Fight',
    params: {
      stage: '',
      times: 2147483647,
      series: 1,
      medicine: 0,
      stone: 0,
      report_to_penguin: false,
      report_to_yituliu: false,
    },
  };
  const compilation = compileLegacyTask(task);
  expect(compilation.supported).toBe(true);
  expect(compilation.steps.at(-1)).toEqual({
    capabilityId: 'workflow.fight.legacy_batch',
    input: { times: 2147483647, medicine: 0, stone: 0, series: 1 },
  });
  expect(
    compileLegacyTask({ ...task, params: { ...task.params, medicine: 2, stone: 1 } }).steps.at(-1)
      ?.input,
  ).toEqual({ times: 2147483647, medicine: 2, stone: 1, series: 1 });
  expect(
    compileLegacyTask({ ...task, params: { ...task.params, series: -1 } }).issues.some(
      (item) => item.field === 'series',
    ),
  ).toBe(true);
});

test('legacy compatibility rejects unadapted clients while retaining all configuration', () => {
  expect(
    compileLegacyTask({
      type: 'StartUp',
      params: { client_type: 'YoStarEN', start_game_enabled: true },
    }),
  ).toMatchObject({
    supported: false,
    steps: [],
    issues: [expect.objectContaining({ code: 'unsupported_client' })],
  });
  expect(
    compileLegacyTask({ type: 'Copilot', params: { filename: '/local/saved.json' } }),
  ).toMatchObject({
    supported: false,
    issues: [expect.objectContaining({ code: 'unsupported_task' })],
  });
});

test('resource preflight resolves the selected capability catalog and exposes missing resources before execution', () => {
  const compilation = compileLegacyTask({ type: 'StartUp', params: { start_game_enabled: true } });
  expect(validateCompiledLegacyTaskResources(compilation, [])).toEqual([
    expect.objectContaining({ code: 'unsupported_capability' }),
  ]);
  const descriptor = {
    id: 'workflow.startup.start',
    available: false,
    unavailableReason: 'missing known template',
  } as AtomicCapabilityDescriptor;
  expect(validateCompiledLegacyTaskResources(compilation, [descriptor])).toEqual([
    { field: '', code: 'unavailable_resource', message: 'missing known template' },
  ]);
});

test('legacy coordinator stops at an unknown commit and does not replay the root', async () => {
  let calls = 0;
  const compilation = compileLegacyTask({
    type: 'Fight',
    params: { stage: '', times: 100, series: 1 },
  });
  compilation.steps[0]!.repeat = 100;
  const result = await executeCompiledLegacyTask(compilation, {
    async execute() {
      calls++;
      return calls === 1
        ? { status: 'completed', verified: true, data: { battleWon: true } }
        : { status: 'unknown', verified: false, data: { commitAttempted: true } };
    },
  });
  expect(calls).toBe(2);
  expect(result).toMatchObject({ status: 'unknown', verified: false, data: { completedSteps: 1 } });
});

test('legacy coordinator observes cancellation between repetitions and keeps result history bounded', async () => {
  const controller = new AbortController();
  const compilation = compileLegacyTask({
    type: 'Fight',
    params: { stage: '', times: 30, series: 1 },
  });
  compilation.steps[0]!.repeat = 30;
  let calls = 0;
  const executor = {
    async execute() {
      calls++;
      return { status: 'completed' as const, verified: true, data: { round: calls } };
    },
  };
  const result = await executeCompiledLegacyTask(compilation, executor);
  expect(calls).toBe(30);
  expect((result.data as { results: unknown[] }).results).toHaveLength(20);
  await expect(
    executeCompiledLegacyTask(
      compilation,
      {
        async execute() {
          controller.abort();
          return { status: 'completed', verified: true, data: {} };
        },
      },
      { signal: controller.signal },
    ),
  ).rejects.toThrow();
});

test('legacy named battles use only reviewed routes and home-required workflows explicitly return home', () => {
  for (const stage of ['1-7', 'S3-1', 'CE-6', 'PR-A-2']) {
    expect(compileLegacyTask({ type: 'Fight', params: { stage, medicine: 2 } })).toMatchObject({
      supported: true,
      steps: [
        { capabilityId: 'game.startup.return_home', input: {} },
        { capabilityId: 'workflow.fight.navigate', input: { stage } },
        {
          capabilityId: 'workflow.fight.legacy_batch',
          input: { times: 1, medicine: 2, stone: 0, series: 1 },
        },
      ],
    });
  }
  for (const stage of ['CE-7', 'PR-A-3', 'OF-1', 'Annihilation', '18-1'])
    expect(compileLegacyTask({ type: 'Fight', params: { stage } })).toMatchObject({
      supported: false,
      steps: [],
    });
  expect(
    compileLegacyTask({ type: 'Award', params: { award: true, mail: true } }).steps.map(
      (x) => x.capabilityId,
    ),
  ).toEqual([
    'game.startup.return_home',
    'workflow.award.daily_weekly',
    'game.startup.return_home',
    'workflow.award.mail',
  ]);
});

test('startup and shutdown preserve the original Official default independently of inherited client', () => {
  for (const type of ['StartUp', 'CloseDown'])
    for (const client_type of [undefined, ''])
      expect(
        compileLegacyTask({ type, params: { client_type } }, { clientType: 'Bilibili' }).clientType,
      ).toBe('Official');
  expect(
    compileLegacyTask({ type: 'Fight', params: {} }, { clientType: 'Bilibili' }).clientType,
  ).toBe('Bilibili');
});

test('legacy recruitment retains tag/time policies and converts its exact count to a persistent permit limit', () => {
  const params = {
    times: 4,
    select: [4],
    confirm: [3, 4],
    refresh: true,
    force_refresh: true,
    set_time: true,
    recruitment_time: { '3': 540, '4': 540, '5': 540, '6': 540 },
    expedite: false,
    expedite_times: 99,
    extra_tags_mode: 0,
    preserve_tags: ['资深'],
    first_tags: ['近卫'],
    level3_recruitment_permit_reserve: 10,
  };
  expect(compileLegacyTask({ type: 'Recruit', params })).toMatchObject({
    supported: true,
    steps: [
      { capabilityId: 'game.startup.return_home' },
      {
        capabilityId: 'workflow.recruit.daily',
        input: {
          times: 4,
          maxPermits: 4,
          reservePermits: 10,
          select: [4],
          confirm: [3, 4],
          refresh: true,
          preserveTags: ['资深'],
          firstTags: ['近卫'],
        },
      },
    ],
  });
  expect(
    compileLegacyTask({ type: 'Recruit', params: { ...params, expedite: true } }),
  ).toMatchObject({ supported: false, steps: [] });
});

test('legacy automatic infrastructure preserves selected facilities, mood threshold and dormant custom settings', () => {
  const params = {
    mode: 0,
    facility: ['Power', 'Control'],
    threshold: 0.4,
    drones: '_NotUse',
    filename: '/preserved/custom.json',
    plan_index: 2,
  };
  const before = structuredClone(params);
  expect(compileLegacyTask({ type: 'Infrast', params })).toMatchObject({
    supported: true,
    steps: [
      { capabilityId: 'game.startup.return_home', input: {} },
      {
        capabilityId: 'workflow.infrast.daily',
        input: { facilities: ['Power', 'Control'], threshold: 0.4 },
      },
    ],
  });
  expect(params).toEqual(before);
  expect(compileLegacyTask({ type: 'Infrast', params: { ...params, facility: [] } })).toMatchObject(
    { supported: true, steps: [] },
  );
  for (const changed of [{ drones: 'Money' }, { facility: ['Training'] }, { threshold: 1.1 }])
    expect(compileLegacyTask({ type: 'Infrast', params: { ...params, ...changed } })).toMatchObject(
      { supported: false, steps: [] },
    );
});

test('legacy custom infrastructure compiles the immutable official snapshot and retains facility filtering', () => {
  const document = {
    plans: [{ rooms: { power: [{ operators: ['甲'] }], control: [{ operators: ['乙'] }] } }],
  };
  const params = {
    mode: 10000,
    filename: '/preserved/custom.json',
    plan_index: 0,
    facility: ['Power'],
    threshold: 0.25,
    drones: '_NotUse',
  };
  const options = { customInfrastPlan: { document, sha256: 'a'.repeat(64) } };
  expect(compileLegacyTask({ type: 'Infrast', params }, options)).toMatchObject({
    supported: true,
    steps: [
      { capabilityId: 'game.startup.return_home', input: {} },
      {
        capabilityId: 'workflow.infrast.custom_shift',
        input: {
          plan: document,
          planIndex: 0,
          sourceSha256: 'a'.repeat(64),
          facilities: ['Power'],
          threshold: 0.25,
        },
      },
    ],
  });
  expect(compileLegacyTask({ type: 'Infrast', params })).toMatchObject({
    supported: false,
    steps: [],
    issues: [expect.objectContaining({ field: 'filename', code: 'unavailable_resource' })],
  });
  for (const changed of [
    { threshold: -0.1 },
    { dorm_trust_enabled: true },
    { facility: ['future-facility'] },
  ])
    expect(
      compileLegacyTask({ type: 'Infrast', params: { ...params, ...changed } }, options),
    ).toMatchObject({ supported: false, steps: [] });
});

test('legacy custom skip and empty intent compile to no steps without returning home or requiring automatic resources', () => {
  const params = {
    mode: 10000,
    filename: '/preserved/custom.json',
    plan_index: 0,
    drones: '_NotUse',
  };
  for (const rooms of [
    {},
    { power: [] },
    { power: [{}] },
    { power: [{ operators: [] }] },
    { power: [{ skip: true, operators: ['未知干员'], product: 'preserved' }] },
  ]) {
    const document = { plans: [{ rooms }] },
      before = structuredClone(document);
    expect(
      compileLegacyTask(
        { type: 'Infrast', params },
        { customInfrastPlan: { document, sha256: 'c'.repeat(64) } },
      ),
    ).toMatchObject({ supported: true, steps: [], issues: [] });
    expect(document).toEqual(before);
  }
});
