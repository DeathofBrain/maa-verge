import { expect, test } from 'bun:test';
import type { Device, Plan, Run, Task } from '../../contracts/src/types';
import type { CopilotWorkspace, RpcContract } from '../../contracts/src/rpc-types';
import { createMaaTools } from '../tools';
import { createLangChainMaaTools } from '../tools/langchain';
import type {
  MaaFrame,
  MaaToolAuthorization,
  MaaToolHost,
  MaaToolJob,
  MaaToolOptions,
  MaaToolSet,
} from '../tools/types';

const deviceId = 'synthetic-device';
const timestamp = '2026-10-25T00:00:00.000Z';
const task = (
  type: Task['type'] = 'Fight',
  params: Task['params'] = { stage: '1-7', times: 1 },
): Task => ({ type, params, enabled: true });
const plan = (overrides: Partial<Plan> = {}): Plan => ({
  id: 'saved-plan',
  name: '合成任务表',
  description: '',
  deviceId: null,
  group: 'daily',
  budgets: null,
  tasks: [task()],
  schedule: null,
  enabled: true,
  ...overrides,
});
const run = (overrides: Partial<Run> = {}): Run => ({
  id: 'session-run',
  planId: 'saved-plan',
  deviceId,
  status: 'running',
  progress: 0,
  message: '已提交，尚无成功证据',
  startedAt: timestamp,
  finishedAt: null,
  ...overrides,
});
const job = (overrides: Partial<MaaToolJob> = {}): MaaToolJob => ({
  id: 'session-job',
  kind: 'depot',
  deviceId,
  clientType: 'Official',
  status: 'running',
  progress: 0,
  message: '采集中',
  startedAt: timestamp,
  finishedAt: null,
  ...overrides,
});
const workspace = (overrides: Partial<CopilotWorkspace> = {}): CopilotWorkspace => ({
  kind: 'Copilot',
  queue: [
    {
      id: 'imported-entry',
      versionId: 'a'.repeat(64),
      enabled: true,
      isRaid: false,
      navName: '1-7',
    },
  ],
  options: {
    loopTimes: 1,
    formation: false,
    formationIndex: 0,
    addTrust: false,
    ignoreRequirements: false,
    supportUnitName: '',
    additionalOperators: [],
    autoLikeOnSuccess: false,
  },
  ...overrides,
});

function fixture(options: MaaToolOptions = {}) {
  const calls: { name: keyof MaaToolHost; args: unknown[] }[] = [];
  const state = {
    devices: [
      {
        id: deviceId,
        name: '合成设备',
        address: 'private-address',
        state: 'idle',
        coreVersion: 'v1',
        resourceVersion: 'r1',
      },
    ] as Device[],
    plans: [plan()],
    run: run(),
    job: job(),
    workspace: workspace(),
    frame: {
      deviceId,
      frameId: 'issued-frame',
      capturedAt: timestamp,
      width: 1280,
      height: 720,
      mimeType: 'image/png',
      data: 'private-synthetic-image',
      canControl: true,
      latencyMs: 1,
    } as MaaFrame,
    recognition: {
      deviceId,
      clientType: 'Official',
      kind: 'depot',
      collectedAt: null,
      runId: null,
      items: [],
      operators: [],
    } as RpcContract['results']['recognition.get'],
  };
  const record = (name: keyof MaaToolHost, args: unknown[]) => {
    calls.push({ name, args: structuredClone(args) });
  };
  const host: MaaToolHost = {
    async listDevices() {
      record('listDevices', []);
      return structuredClone(state.devices);
    },
    async listPlans() {
      record('listPlans', []);
      return structuredClone(state.plans);
    },
    preparePlan(draft) {
      record('preparePlan', [draft]);
      const value = draft as Pick<Plan, 'id' | 'name' | 'tasks'>;
      return plan({
        ...value,
        tasks: value.tasks.map((item) => ({ ...item, enabled: item.enabled ?? true })),
      });
    },
    async deviceStatus(params) {
      record('deviceStatus', [params]);
      return {
        deviceId: params.deviceId,
        available: true,
        connected: true,
        reason: '',
        owner: 'none',
        ownerId: null,
      };
    },
    async getFrame(params) {
      record('getFrame', [params]);
      return structuredClone(state.frame);
    },
    async click(params) {
      record('click', [params]);
      return { accepted: true };
    },
    async getRun(id) {
      record('getRun', [id]);
      return structuredClone(state.run);
    },
    async startPlan(...args) {
      record('startPlan', args);
      return structuredClone(state.run);
    },
    async stopRun(id) {
      record('stopRun', [id]);
      return { ...state.run, status: 'stopped' };
    },
    async startTool(params) {
      record('startTool', [params]);
      return structuredClone(state.job);
    },
    async getTool(id) {
      record('getTool', [id]);
      return structuredClone(state.job);
    },
    async stopTool(id) {
      record('stopTool', [id]);
      return { ...state.job, status: 'stopped' };
    },
    async getRecognition(params) {
      record('getRecognition', [params]);
      return structuredClone(state.recognition);
    },
    async getCopilotWorkspace(kind) {
      record('getCopilotWorkspace', [kind]);
      return structuredClone(state.workspace);
    },
    async startCopilot(...args) {
      record('startCopilot', args);
      return structuredClone(state.run);
    },
  };
  const tools = createMaaTools(host, { sessionId: 'synthetic-session', deviceId, ...options });
  let nextCall = 0;
  const invoke = (name: string, input: unknown = {}) =>
    tools.invoke(name, input, { callId: `call-${++nextCall}` });
  return { host, state, calls, tools, invoke };
}

const validInputs: Record<string, Record<string, unknown>> = {
  maa_task_catalog: {},
  maa_list_devices: {},
  maa_list_plans: {},
  maa_propose_tasks: { name: '待核验', tasks: [task()] },
  maa_device_status: {},
  maa_get_frame: {},
  maa_click: { frameId: 'issued-frame', x: 1, y: 1 },
  maa_start_plan: { planId: 'saved-plan' },
  maa_get_run: { id: 'session-run' },
  maa_stop_run: { id: 'session-run' },
  maa_start_tool: { kind: 'depot' },
  maa_get_tool: { id: 'session-job' },
  maa_stop_tool: { id: 'session-job' },
  maa_get_recognition: { kind: 'depot' },
  maa_get_copilot_workspace: { kind: 'Copilot' },
  maa_start_copilot: { kind: 'Copilot' },
};

test('plan tools include and execute shared plans on a secondary bound device', async () => {
  const { invoke, state, calls } = fixture({ authorize: () => true });
  state.plans[0] = plan({ deviceId: 'other-device', deviceIds: ['other-device', deviceId] });
  expect(((await invoke('maa_list_plans')).content as any).plans).toMatchObject([
    { id: 'saved-plan', deviceIds: ['other-device', deviceId] },
  ]);
  await invoke('maa_start_plan', { planId: 'saved-plan' });
  expect(calls.find((call) => call.name === 'startPlan')?.args[0]).toMatchObject({ deviceId });

  state.plans[0] = plan({ deviceId, deviceIds: ['other-device'] });
  expect(((await invoke('maa_list_plans')).content as any).plans).toEqual([]);
  await expect(invoke('maa_start_plan', { planId: 'saved-plan' })).rejects.toMatchObject({
    code: 'scope_denied',
  });
  expect(calls.filter((call) => call.name === 'startPlan')).toHaveLength(1);
});

test('all sixteen tools reject extra model arguments before consulting the host', async () => {
  const { tools, calls, host } = fixture();
  expect(tools.definitions.map((item) => item.name).sort()).toEqual(
    Object.keys(validInputs).sort(),
  );
  expect(Object.isFrozen(tools.definitions)).toBe(true);
  for (const definition of tools.definitions) {
    const isolated = createMaaTools(host);
    expect(Object.isFrozen(definition.schema)).toBe(true);
    expect(JSON.stringify(definition.schema)).not.toContain('"$ref"');
    for (const [field, value] of Object.entries({
      approved: true,
      deviceId: 'forged-device',
      clientType: 'Bilibili',
      requestId: 'forged-request',
      command: 'arbitrary',
    })) {
      await expect(
        isolated.invoke(
          definition.name,
          { ...validInputs[definition.name], [field]: value },
          { callId: `${definition.name}-${field}` },
        ),
      ).rejects.toMatchObject({ code: 'invalid_parameters' });
    }
  }
  expect(calls).toEqual([]);
});

test('read tools expose a capability catalog and scoped summaries without device addresses', async () => {
  const { invoke, state, calls } = fixture();
  state.plans.push(plan({ id: 'other-plan', deviceId: 'other-device' }));
  const catalog = (await invoke('maa_task_catalog')).content as any;
  expect(catalog.tasks).toHaveLength(20);
  expect(catalog.tasks.some((item: any) => item.availableVia === 'unavailable')).toBe(true);
  const devices = (await invoke('maa_list_devices')).content as any;
  expect(devices.devices).toEqual([
    { id: deviceId, name: '合成设备', state: 'idle', coreVersion: 'v1', resourceVersion: 'r1' },
  ]);
  expect(JSON.stringify(devices)).not.toContain('private-address');
  expect((await invoke('maa_list_plans')).content).toMatchObject({
    plans: [{ id: 'saved-plan', taskTypes: ['Fight'] }],
  });
  expect(((await invoke('maa_list_plans')).content as any).plans).toHaveLength(1);
  expect((await invoke('maa_device_status')).content).toMatchObject({ deviceId, available: true });
  expect(calls.at(-1)).toEqual({ name: 'deviceStatus', args: [{ deviceId }] });
});

test('proposals normalize bounded defaults and remain unexecuted drafts', async () => {
  const { invoke, calls } = fixture({ clientType: 'Bilibili' });
  const proposed = (
    await invoke('maa_propose_tasks', {
      name: '安全草稿',
      tasks: [task('Fight', {}), task('Roguelike', {}), task('StartUp', {})],
    })
  ).content as any;
  expect(proposed).toMatchObject({
    requiresConfirmation: true,
    executed: false,
    plan: {
      id: '',
      tasks: [
        { params: { times: 1, report_to_penguin: false, report_to_yituliu: false } },
        { params: { starts_count: 1, report_to_penguin: false, report_to_yituliu: false } },
        { params: { client_type: 'Bilibili' } },
      ],
    },
  });
  expect(calls.map((item) => item.name)).toEqual(['preparePlan']);
});

test('drafts reject spend, uploads, unbounded loops, account switching and ambient capabilities', async () => {
  const { invoke, calls } = fixture();
  const forbidden = [
    task('Fight', { stone: 1 }),
    task('Fight', { medicine: 1 }),
    task('Recruit', { expedite: true }),
    task('Fight', { times: 0 }),
    task('Fight', { times: 101 }),
    task('Roguelike', { starts_count: 999999 }),
    task('Fight', { report_to_penguin: true }),
    task('StartUp', { account_name: 'other-account' }),
    task('Fight', { nested: { shell: 'arbitrary' } }),
    task('Fight', { nested: { file_path: 'private.json' } }),
    task('Copilot', {}),
    task('SSSCopilot', {}),
    task('ParadoxCopilot', {}),
    task('VideoRecognition', {}),
    task('SingleStep', {}),
    task('OperProgress', {}),
    task('Custom', { task_names: ['arbitrary-chain'] }),
    ...['EndingA@../private', 'EndingA@bad\nbranch', 'EndingA@branch@next'].map((ending) =>
      task('Custom', { task_names: [`MiniGame@SecretFront@Begin@${ending}`] }),
    ),
  ];
  for (const unsafe of forbidden)
    await expect(
      invoke('maa_propose_tasks', { name: '拒绝危险参数', tasks: [unsafe] }),
    ).rejects.toMatchObject({ code: 'policy_denied' });
  expect(calls).toEqual([]);
});

test('every device effect is denied by default, including stop and screenshot', async () => {
  const { invoke, calls } = fixture({ runIds: ['session-run'], toolJobIds: ['session-job'] });
  for (const name of [
    'maa_get_frame',
    'maa_start_plan',
    'maa_start_tool',
    'maa_stop_run',
    'maa_stop_tool',
    'maa_start_copilot',
  ]) {
    await expect(invoke(name, validInputs[name])).rejects.toMatchObject({
      code: 'permission_denied',
    });
  }
  expect(
    calls.some((item) =>
      ['getFrame', 'startPlan', 'startTool', 'stopRun', 'stopTool', 'startCopilot'].includes(
        item.name,
      ),
    ),
  ).toBe(false);
});

test('authorization requires literal true and receives the immutable exact action', async () => {
  const requests: MaaToolAuthorization[] = [];
  const denied = fixture({ authorize: (() => 'yes') as unknown as MaaToolOptions['authorize'] });
  await expect(denied.invoke('maa_start_tool', { kind: 'depot' })).rejects.toMatchObject({
    code: 'permission_denied',
  });
  expect(denied.calls).toEqual([]);
  const approved = fixture({
    authorize: (request) => {
      requests.push(request);
      return true;
    },
  });
  const input = { kind: 'depot', config: { updateDepot: false } };
  await approved.invoke('maa_start_tool', input);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    toolName: 'maa_start_tool',
    effect: 'execute',
    deviceId,
    clientType: 'Official',
    action: { kind: 'depot', deviceId, clientType: 'Official', config: { updateDepot: false } },
  });
  expect(Object.isFrozen(requests[0])).toBe(true);
  expect(Object.isFrozen(requests[0]!.action.config)).toBe(true);
  expect(requests[0]!.requestId).toMatch(/^maa-[a-f0-9]{64}$/);
  expect(input).toEqual({ kind: 'depot', config: { updateDepot: false } });
});

test('all six standalone tool kinds pass explicit current config rather than historical defaults', async () => {
  const { invoke, calls, state } = fixture({ authorize: () => true });
  for (const kind of ['depot', 'operators', 'recruit', 'inventory', 'data', 'games'] as const) {
    state.job.kind = kind;
    await invoke('maa_start_tool', { kind });
  }
  expect(calls).toHaveLength(6);
  for (const call of calls)
    expect(call).toMatchObject({
      name: 'startTool',
      args: [{ config: {}, deviceId, clientType: 'Official' }],
    });
  const target = {
    id: 'target',
    stage: '1-7',
    itemId: '30012',
    quantity: 1,
    medicine: 0,
    stone: 0,
  };
  await invoke('maa_start_tool', { kind: 'inventory', config: { targets: [target] } });
  for (const unsafe of [
    { ...target, medicine: 1 },
    { ...target, stone: 1 },
    { ...target, quantity: 1001 },
  ]) {
    await expect(
      invoke('maa_start_tool', { kind: 'inventory', config: { targets: [unsafe] } }),
    ).rejects.toMatchObject({ code: 'policy_denied' });
  }
  expect(calls).toHaveLength(7);
});

test('screenshots keep bytes only in local artifacts and clicks require an issued bounded frame', async () => {
  const { invoke, calls, state } = fixture({ authorize: () => true });
  await expect(
    invoke('maa_click', { frameId: 'unissued-frame', x: 1, y: 1 }),
  ).rejects.toMatchObject({ code: 'invalid_frame' });
  const captured = await invoke('maa_get_frame');
  expect(captured.content).toMatchObject({
    frameId: state.frame.frameId,
    width: 1280,
    height: 720,
    imageLocation: 'local_artifact',
  });
  expect(captured.content).not.toHaveProperty('data');
  expect(captured.artifact).toEqual(state.frame);
  for (const point of [
    { x: -1, y: 0 },
    { x: 0.5, y: 0 },
  ])
    await expect(
      invoke('maa_click', { frameId: state.frame.frameId, ...point }),
    ).rejects.toMatchObject({ code: 'invalid_parameters' });
  for (const point of [
    { x: 1280, y: 0 },
    { x: 0, y: 720 },
  ])
    await expect(
      invoke('maa_click', { frameId: state.frame.frameId, ...point }),
    ).rejects.toMatchObject({ code: 'invalid_frame' });
  expect(
    (await invoke('maa_click', { frameId: state.frame.frameId, x: 1279, y: 719 })).content,
  ).toMatchObject({ accepted: true, evidenceNote: expect.stringContaining('不等于') });
  expect(calls.filter((item) => item.name === 'click')).toHaveLength(1);
  state.frame = { ...state.frame, frameId: 'read-only-frame', canControl: false };
  await invoke('maa_get_frame');
  await expect(
    invoke('maa_click', { frameId: state.frame.frameId, x: 1, y: 1 }),
  ).rejects.toMatchObject({ code: 'invalid_frame' });
});

test('effects can be canceled while waiting for authorization before reaching the host', async () => {
  const controller = new AbortController();
  const { tools, calls } = fixture({
    authorize: () => {
      controller.abort(new Error('host canceled'));
      return true;
    },
  });
  await expect(
    tools.invoke(
      'maa_start_tool',
      { kind: 'depot' },
      { callId: 'cancel-authorization', signal: controller.signal },
    ),
  ).rejects.toThrow('host canceled');
  expect(calls).toEqual([]);
});

test('execution reads the current saved plan and authorizes its snapshot', async () => {
  const requests: MaaToolAuthorization[] = [];
  const { invoke, state, calls } = fixture({
    authorize: (request) => {
      requests.push(request);
      return true;
    },
  });
  state.plans[0]!.tasks[0]!.params.times = 2;
  expect((await invoke('maa_start_plan', { planId: 'saved-plan' })).content).toMatchObject({
    id: 'session-run',
    status: 'running',
  });
  expect(requests[0]).toMatchObject({ action: { plan: { tasks: [{ params: { times: 2 } }] } } });
  expect(calls.find((item) => item.name === 'startPlan')!.args.slice(0, 2)).toEqual([
    { planId: 'saved-plan', deviceId, requestId: requests[0]!.requestId },
    state.plans[0],
  ]);
  expect(calls.find((item) => item.name === 'startPlan')!.args[2]).toBe('Official');
  expect((await invoke('maa_get_run', { id: 'session-run' })).content).toMatchObject({
    evidenceNote: expect.stringContaining('不等于'),
  });
  expect((await invoke('maa_stop_run', { id: 'session-run' })).content).toMatchObject({
    status: 'stopped',
  });
});

test('unsafe saved tasks and mismatched plan device or client never reach execution', async () => {
  const { invoke, state, calls } = fixture({ authorize: () => true });
  for (const tasks of [
    [task('Fight', { medicine: 1 })],
    [task('Roguelike', {})],
    [task('StartUp', { client_type: 'Bilibili' })],
  ]) {
    state.plans[0]!.tasks = tasks;
    await expect(invoke('maa_start_plan', { planId: 'saved-plan' })).rejects.toMatchObject({
      code: 'policy_denied',
    });
  }
  state.plans[0] = plan({ deviceId: 'other-device' });
  await expect(invoke('maa_start_plan', { planId: 'saved-plan' })).rejects.toMatchObject({
    code: 'scope_denied',
  });
  await expect(invoke('maa_start_plan', { planId: 'absent-plan' })).rejects.toMatchObject({
    code: 'not_found',
  });
  expect(calls.some((item) => item.name === 'startPlan')).toBe(false);
});

test('run and job observation is restricted to session-created or host-attached identities', async () => {
  const { invoke, calls } = fixture({ authorize: () => true });
  for (const name of ['maa_get_run', 'maa_stop_run', 'maa_get_tool', 'maa_stop_tool'])
    await expect(invoke(name, validInputs[name])).rejects.toMatchObject({ code: 'scope_denied' });
  expect(calls).toEqual([]);
  await invoke('maa_start_tool', { kind: 'depot' });
  expect((await invoke('maa_get_tool', { id: 'session-job' })).content).toMatchObject({
    id: 'session-job',
  });
  expect((await invoke('maa_stop_tool', { id: 'session-job' })).content).toMatchObject({
    status: 'stopped',
  });
  const attached = fixture({ runIds: ['session-run'], toolJobIds: ['session-job'] });
  expect((await attached.invoke('maa_get_run', { id: 'session-run' })).content).toMatchObject({
    id: 'session-run',
  });
  expect((await attached.invoke('maa_get_tool', { id: 'session-job' })).content).toMatchObject({
    id: 'session-job',
  });
  attached.state.run.deviceId = 'other-device';
  await expect(attached.invoke('maa_get_run', { id: 'session-run' })).rejects.toMatchObject({
    code: 'scope_denied',
  });
  attached.state.job.clientType = 'Bilibili';
  await expect(attached.invoke('maa_get_tool', { id: 'session-job' })).rejects.toMatchObject({
    code: 'scope_denied',
  });
});

test('invalid cross-device results cannot attach executions or screenshots to the session', async () => {
  const { invoke, state } = fixture({ authorize: () => true });
  state.run.deviceId = state.job.deviceId = state.frame.deviceId = 'other-device';
  for (const name of ['maa_start_plan', 'maa_start_tool', 'maa_get_frame'])
    await expect(invoke(name, validInputs[name])).rejects.toMatchObject({ code: 'invalid_result' });
  await expect(invoke('maa_get_run', { id: 'session-run' })).rejects.toMatchObject({
    code: 'scope_denied',
  });
  await expect(invoke('maa_get_tool', { id: 'session-job' })).rejects.toMatchObject({
    code: 'scope_denied',
  });
});

test('recognition pagination preserves unknown values, collection time and estimate labels', async () => {
  const { invoke, state, calls } = fixture();
  state.recognition.items = Array.from({ length: 65 }, (_, index) => ({
    id: `item-${index}`,
    name: `物品${index}`,
    quantity: index,
    estimatedQuantity: index + 1,
  }));
  state.recognition.operators = [
    {
      id: 'unknown-operator',
      name: '未知',
      own: false,
      elite: -1,
      level: -1,
      potential: -1,
      rarity: -1,
    },
  ];
  state.recognition.estimatedAt = timestamp;
  const first = (await invoke('maa_get_recognition', { kind: 'depot' })).content as any;
  expect(first).toMatchObject({
    collectedAt: null,
    estimatedAt: timestamp,
    totalItems: 65,
    totalOperators: 1,
    offset: 0,
    hasMore: true,
  });
  expect(first.items).toHaveLength(50);
  expect(first.operators[0].potential).toBe(-1);
  const final = (await invoke('maa_get_recognition', { kind: 'depot', offset: 50, limit: 20 }))
    .content as any;
  expect(final.items).toHaveLength(15);
  expect(final.items[0].id).toBe('item-50');
  expect(final.hasMore).toBe(false);
  expect(calls.at(-1)).toEqual({
    name: 'getRecognition',
    args: [{ deviceId, clientType: 'Official', kind: 'depot' }],
  });
  await expect(invoke('maa_get_recognition', { kind: 'depot', limit: 51 })).rejects.toMatchObject({
    code: 'invalid_parameters',
  });
});

test('copilot executes reviewed imported workspace identifiers and enforces bounded local options', async () => {
  const requests: MaaToolAuthorization[] = [];
  const { invoke, calls, state } = fixture({
    authorize: (request) => {
      requests.push(request);
      return true;
    },
  });
  expect((await invoke('maa_get_copilot_workspace', { kind: 'Copilot' })).content).toEqual(
    state.workspace,
  );
  await invoke('maa_start_copilot', { kind: 'Copilot' });
  expect(requests[0]!.action).toEqual({ workspace: state.workspace });
  expect(calls.find((item) => item.name === 'startCopilot')!.args.slice(0, 2)).toEqual([
    { kind: 'Copilot', deviceId, requestId: requests[0]!.requestId },
    state.workspace,
  ]);
  expect(calls.find((item) => item.name === 'startCopilot')!.args[2]).toBe('Official');
  for (const change of [{ loopTimes: 11 }, { autoLikeOnSuccess: true }]) {
    state.workspace = workspace({ options: { ...workspace().options, ...change } });
    await expect(invoke('maa_start_copilot', { kind: 'Copilot' })).rejects.toMatchObject({
      code: 'policy_denied',
    });
  }
  state.workspace = workspace({ queue: [] });
  await expect(invoke('maa_start_copilot', { kind: 'Copilot' })).rejects.toMatchObject({
    code: 'policy_denied',
  });
  expect(calls.filter((item) => item.name === 'startCopilot')).toHaveLength(1);
});

test('concurrent duplicate deliveries share one effect and independent cloned results', async () => {
  let authorize!: () => void;
  const pending = new Promise<void>((resolve) => {
    authorize = resolve;
  });
  const { tools, calls } = fixture({
    authorize: async () => {
      await pending;
      return true;
    },
  });
  const first = tools.invoke(
    'maa_start_tool',
    { kind: 'depot', config: { updateDepot: false } },
    { callId: 'same-delivery' },
  );
  const second = tools.invoke(
    'maa_start_tool',
    { config: { updateDepot: false }, kind: 'depot' },
    { callId: 'same-delivery' },
  );
  authorize();
  const results = await Promise.all([first, second]);
  expect(calls).toHaveLength(1);
  expect(results[0]).toEqual(results[1]);
  (results[0]!.content as any).message = 'mutated consumer result';
  expect((results[1]!.content as any).message).toBe('采集中');
  expect(
    (
      await tools.invoke(
        'maa_start_tool',
        { kind: 'depot', config: { updateDepot: false } },
        { callId: 'same-delivery' },
      )
    ).content,
  ).toMatchObject({ message: '采集中' });
  await expect(
    tools.invoke('maa_start_tool', { kind: 'operators' }, { callId: 'same-delivery' }),
  ).rejects.toMatchObject({ code: 'request_conflict' });
  expect(calls).toHaveLength(1);
});

test('uncertain native failures remain cached and never trigger an automatic replay', async () => {
  const { host } = fixture();
  let attempts = 0;
  host.startTool = async () => {
    attempts++;
    throw new Error('native result unknown');
  };
  const tools = createMaaTools(host, { deviceId, authorize: () => true });
  for (let delivery = 0; delivery < 2; delivery++)
    await expect(
      tools.invoke('maa_start_tool', { kind: 'depot' }, { callId: 'uncertain' }),
    ).rejects.toThrow('native result unknown');
  expect(attempts).toBe(1);
});

test('delivery arguments are snapshotted before asynchronous validation and authorization', async () => {
  const { tools, calls } = fixture({ authorize: () => true });
  const input = { kind: 'depot', config: { updateDepot: false } };
  const pending = tools.invoke('maa_start_tool', input, { callId: 'immutable-delivery' });
  input.kind = 'operators';
  input.config.updateDepot = true;
  await pending;
  expect(calls[0]).toMatchObject({
    name: 'startTool',
    args: [{ kind: 'depot', config: { updateDepot: false } }],
  });
  await tools.invoke(
    'maa_start_tool',
    { kind: 'depot', config: { updateDepot: false } },
    { callId: 'immutable-delivery' },
  );
  expect(calls).toHaveLength(1);
});

test('delivery identity and cancellation signal are snapshotted before yielding', async () => {
  const requestIds: string[] = [],
    signals: (AbortSignal | undefined)[] = [];
  const { host } = fixture();
  const options: MaaToolOptions = {
    sessionId: 'immutable-session',
    deviceId,
    authorize: (request, signal) => {
      requestIds.push(request.requestId);
      signals.push(signal);
      return true;
    },
  };
  const original = new AbortController(),
    replacement = new AbortController();
  const delivery = { callId: 'original-delivery', signal: original.signal };
  const first = createMaaTools(host, options).invoke('maa_start_tool', { kind: 'depot' }, delivery);
  delivery.callId = 'mutated-delivery';
  delivery.signal = replacement.signal;
  await first;
  await createMaaTools(host, options).invoke(
    'maa_start_tool',
    { kind: 'depot' },
    { callId: 'original-delivery', signal: original.signal },
  );
  expect(requestIds[0]).toBe(requestIds[1]);
  expect(signals).toEqual([original.signal, original.signal]);
});

test('persisted session identity retains request IDs while new calls and sessions differ', async () => {
  const requests: string[] = [];
  const { host } = fixture();
  for (const [sessionId, callId] of [
    ['session-one', 'first'],
    ['session-one', 'first'],
    ['session-one', 'second'],
    ['session-two', 'first'],
  ]) {
    const tools = createMaaTools(host, {
      deviceId,
      sessionId,
      authorize: (request) => {
        requests.push(request.requestId);
        return true;
      },
    });
    await tools.invoke('maa_start_tool', { kind: 'depot' }, { callId: callId! });
  }
  expect(requests[0]).toBe(requests[1]);
  expect(new Set(requests).size).toBe(3);
});

test('call budgets include failed attempts and permit delivery retry without extra budget', async () => {
  const { tools, calls } = fixture({ maxCalls: 1 });
  await expect(
    tools.invoke('maa_start_tool', { kind: 'depot' }, { callId: 'denied' }),
  ).rejects.toMatchObject({ code: 'permission_denied' });
  await expect(
    tools.invoke('maa_start_tool', { kind: 'depot' }, { callId: 'denied' }),
  ).rejects.toMatchObject({ code: 'permission_denied' });
  await expect(tools.invoke('maa_list_devices', {}, { callId: 'another' })).rejects.toMatchObject({
    code: 'call_limit',
  });
  expect(calls).toEqual([]);
});

test('pre-aborted calls and invalid JSON fail before touching a host', async () => {
  const { tools, calls } = fixture();
  const controller = new AbortController();
  controller.abort(new Error('already canceled'));
  await expect(
    tools.invoke('maa_list_devices', {}, { callId: 'aborted', signal: controller.signal }),
  ).rejects.toThrow('already canceled');
  for (const invalid of [
    { extra: Number.NaN },
    { extra: undefined },
    new Date(),
    { extra: 'a'.repeat(65536) },
  ])
    await expect(
      tools.invoke('maa_list_devices', invalid, { callId: 'invalid' }),
    ).rejects.toMatchObject({ code: 'invalid_parameters' });
  let nested: unknown = {};
  for (let depth = 0; depth < 34; depth++) nested = { nested };
  await expect(tools.invoke('maa_list_devices', nested, { callId: 'deep' })).rejects.toMatchObject({
    code: 'invalid_parameters',
  });
  await expect(tools.invoke('maa_list_devices', {}, { callId: '' })).rejects.toMatchObject({
    code: 'invalid_parameters',
  });
  await expect(tools.invoke('not-a-tool', {}, { callId: 'unknown' })).rejects.toMatchObject({
    code: 'unknown_tool',
  });
  expect(calls).toEqual([]);
});

test('device-dependent methods fail without host device binding while catalog stays available', async () => {
  const { host } = fixture();
  const tools: MaaToolSet = createMaaTools(host, { authorize: () => true });
  expect(
    (await tools.invoke('maa_task_catalog', {}, { callId: 'catalog' })).content,
  ).toHaveProperty('tasks');
  for (const name of [
    'maa_device_status',
    'maa_get_frame',
    'maa_start_plan',
    'maa_start_tool',
    'maa_start_copilot',
    'maa_get_recognition',
  ])
    await expect(tools.invoke(name, validInputs[name], { callId: name })).rejects.toMatchObject({
      code: 'device_required',
    });
});

test('large native results indicate truncation and remove nested local paths and credentials', async () => {
  const { invoke, state } = fixture({ toolJobIds: ['session-job'], runIds: ['session-run'] });
  state.job.result = {
    filePath: 'private-path',
    password: 'private-password',
    api_key: 'private-key',
    nested: {
      token: 'private-token',
      data: 'private-bytes',
      fileName: 'private-file',
      safe: 'retained',
    },
    entries: Array.from({ length: 120 }, (_, index) => ({ index, description: 'x'.repeat(2000) })),
  };
  const result = (await invoke('maa_get_tool', { id: 'session-job' })).content as any;
  expect(result.contentTruncated).toBe(true);
  expect(result.result.entries).toHaveLength(50);
  expect(result.result.nested).toEqual({ safe: 'retained' });
  expect(JSON.stringify(result)).not.toContain('private-');
  expect(result.result.entries[0].description.length).toBe(1000);
  expect(JSON.stringify(result).length).toBeLessThan(20000);
  state.job.result = {
    ['x'.repeat(200) + 'a']: 'first',
    ['x'.repeat(200) + 'b']: 'second',
    retained: true,
  };
  const longKeys = (await invoke('maa_get_tool', { id: 'session-job' })).content as any;
  expect(longKeys.contentTruncated).toBe(true);
  expect(longKeys.result).toEqual({ retained: true });
  state.run.message = 'safe result';
  const complete = (await invoke('maa_get_run', { id: 'session-run' })).content as any;
  expect(complete.contentTruncated).toBe(false);
  expect(complete.message).toBe('safe result');
});

test('real SDK tools accept the neutral frozen schemas without altering their definitions', async () => {
  const { tools, calls } = fixture();
  const before = JSON.stringify(tools.definitions);
  const sdkTools = createLangChainMaaTools(tools);
  expect(sdkTools).toHaveLength(16);
  const result = await sdkTools.find((item) => item.name === 'maa_task_catalog')!.invoke({});
  expect(JSON.parse(result as unknown as string).tasks).toHaveLength(20);
  expect(JSON.stringify(tools.definitions)).toBe(before);
  expect(calls).toEqual([]);
});
