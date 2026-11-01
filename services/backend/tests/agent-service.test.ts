import { afterEach, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { AgentMission, AgentSession, AgentTurn } from '@contracts/agent-types';
import type { Device, Plan, Run } from '@contracts/types';
import type { MaaToolAuthorization, MaaToolHost, MaaToolJob } from '@maaverge/agent/tools';
import { Store } from '@backend/infrastructure/storage/storage';
import { ContextRepository, emptyAgentUsage } from '@backend/modules/agent/context';
import { AgentExecutionPolicy } from '@backend/modules/agent/execution-policy';
import { AgentLedger } from '@backend/modules/agent/ledger';
import { AgentService, type AgentServiceHost } from '@backend/modules/agent/service';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const model = {
  provider: 'openai-compatible',
  baseUrl: 'https://synthetic.invalid/v1',
  model: 'synthetic-responses',
};
const credential = 'synthetic-private-key-never-persist';
const deviceId = 'synthetic-device';
const at = '2026-11-01T00:00:00.000Z';
const plan = (): Plan => ({
  id: 'saved-plan',
  name: '合成任务表',
  description: '',
  deviceId: null,
  group: 'daily',
  budgets: null,
  schedule: null,
  enabled: true,
  tasks: [{ type: 'Fight', enabled: true, params: { stage: '1-7', times: 1 } }],
});
const run = (): Run => ({
  id: 'synthetic-run',
  planId: 'saved-plan',
  deviceId,
  status: 'running',
  progress: 0,
  message: '已提交，未证明动作成功',
  startedAt: at,
  finishedAt: null,
});
const message = (text: string) => ({ type: 'message', content: [{ type: 'output_text', text }] });
const call = (name: string, args: unknown, id = 'stable-call') => ({
  type: 'function_call',
  name,
  call_id: id,
  arguments: JSON.stringify(args),
});
const result = (output: unknown[], includeUsage = true) => ({
  output,
  ...(includeUsage ? { usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } : {}),
});
type Reply = ReturnType<typeof result> | ((init: RequestInit | undefined) => Promise<Response>);
const roots: string[] = [];
const databases: Store[] = [];
const services: AgentService[] = [];
const clients: Client[] = [];
function fixture(replies: Reply[] = [], directory?: string) {
  const root =
    directory ?? makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-agent-service-'));
  if (!directory) roots.push(root);
  const store = new Store(root);
  databases.push(store);
  const posted: any[] = [];
  const events: unknown[] = [];
  const starts: unknown[] = [];
  const reconciliations: string[] = [];
  const state = { plan: plan(), run: run(), unknownStart: false, recovered: undefined as unknown };
  const forbidden = async (): Promise<never> => {
    throw new Error('Unexpected native fixture operation');
  };
  const maa: MaaToolHost = {
    listDevices: async () => [
      {
        id: deviceId,
        name: '合成设备',
        address: '127.0.0.1:0',
        state: 'idle',
        coreVersion: 'synthetic-core',
        resourceVersion: 'synthetic-resource',
      } as Device,
    ],
    listPlans: async () => [structuredClone(state.plan)],
    preparePlan: (draft) => structuredClone({ ...state.plan, ...(draft as object) }),
    deviceStatus: async () => ({
      deviceId,
      available: true,
      connected: true,
      reason: '',
      owner: 'none',
      ownerId: null,
    }),
    startPlan: async (params) => {
      starts.push(structuredClone(params));
      if (state.unknownStart) throw new Error('Synthetic submitted outcome lost');
      return structuredClone(state.run);
    },
    getRun: async () => structuredClone(state.run),
    stopRun: async () => ({ ...state.run, status: 'stopped' }),
    getFrame: forbidden,
    click: forbidden,
    startTool: forbidden,
    getTool: forbidden,
    stopTool: forbidden,
    getRecognition: async () => ({
      deviceId,
      clientType: 'Official',
      kind: 'depot',
      collectedAt: null,
      runId: null,
      items: [],
      operators: [],
    }),
    getCopilotWorkspace: forbidden,
    startCopilot: forbidden,
  };
  const host: AgentServiceHost = {
    maa,
    model: () => model,
    deviceClient: () => 'Official',
    deviceExists: (id) => id === deviceId,
    emit: (...args) => events.push(args),
    reconcile: async (requestId) => {
      reconciliations.push(requestId);
      return state.recovered;
    },
    fetcher: (async (_url, init) => {
      posted.push(JSON.parse(String(init?.body)));
      const next = replies.shift();
      if (!next) throw new Error('Synthetic model response queue exhausted');
      return typeof next === 'function' ? next(init) : Response.json(next);
    }) as typeof fetch,
  };
  const service = new AgentService(store, host);
  services.push(service);
  const internal = (method: string, params: unknown, secret: string | null = credential) =>
    service.hostRequest({ method, params, model, credential: secret });
  const create = (mode: AgentSession['mode'] = 'plan') =>
    service.handle('agent.session.create', { deviceId, mode }) as Promise<AgentSession>;
  const start = (sessionId: string, text = '继续', requestId: string = crypto.randomUUID()) =>
    internal('agent.turn.start', { sessionId, message: text, requestId }) as Promise<AgentTurn>;
  return {
    store,
    service,
    host,
    root,
    posted,
    events,
    starts,
    reconciliations,
    state,
    internal,
    create,
    start,
  };
}
async function until(
  check: () => boolean | Promise<boolean>,
  messageText = 'synthetic operation did not settle',
) {
  for (let i = 0; i < 400; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(messageText);
}
async function turnStatus(service: AgentService, turnId: string, status: string) {
  try {
    await until(async () => (await service.handle('agent.turn.get', { turnId })).status === status);
  } catch {
    throw new Error(
      `Expected ${status}, received ${JSON.stringify(await service.handle('agent.turn.get', { turnId }))}`,
    );
  }
  return service.handle('agent.turn.get', { turnId }) as Promise<AgentTurn>;
}
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  for (const service of services.splice(0)) await service.close();
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('ordinary Responses answer persists opaque reasoning and usage while plan mode grants no execution capability', async () => {
  const f = fixture([
    result([
      { type: 'reasoning', id: 'opaque', encrypted_content: 'opaque-encrypted-context' },
      message('可以先整理目标'),
    ]),
  ]);
  const session = await f.create();
  const turn = await f.start(session.id);
  const completed = await turnStatus(f.service, turn.id, 'completed');
  expect(completed.reply).toBe('可以先整理目标');
  expect(completed.usage).toMatchObject({
    modelCalls: 1,
    inputTokens: 10,
    outputTokens: 2,
    totalTokens: 12,
    incomplete: false,
  });
  expect(f.posted[0].store).toBe(false);
  expect(f.posted[0].previous_response_id).toBeUndefined();
  expect(f.posted[0].tools.some((tool: any) => tool.name === 'maa_start_plan')).toBe(false);
  expect(f.starts).toHaveLength(0);
  const detail = await f.service.handle('agent.session.get', { sessionId: session.id });
  expect(
    detail.messages.some((row: any) =>
      row.items?.some((item: any) => item.encrypted_content === 'opaque-encrypted-context'),
    ),
  ).toBe(true);
  expect(JSON.stringify(detail)).not.toContain(credential);
  expect(JSON.stringify(f.events)).not.toContain(credential);
  expect(Buffer.from(f.store.db.serialize()).includes(Buffer.from(credential))).toBe(false);
});

test('ask_user persists across restart; its ordinary answer cannot approve an execution; duplicate approval does not execute twice', async () => {
  const f = fixture([
    result([
      call(
        'ask_user',
        {
          title: '目标选择',
          prompt: '请选择目标',
          inputType: 'single',
          options: [{ id: 'farm', label: '刷材料' }],
          required: true,
        },
        'ask-call',
      ),
    ]),
  ]);
  const session = await f.create('goal');
  const turn = await f.start(session.id, '帮我准备任务', 'persisted-request');
  await turnStatus(f.service, turn.id, 'waiting');
  const question = (
    await f.service.handle('agent.interaction.list', { sessionId: session.id, status: 'pending' })
  )[0];
  expect(question.kind).toBe('question');
  expect(f.starts).toHaveLength(0);
  await f.service.close();
  f.store.close();
  const second = fixture(
    [
      result([call('maa_start_plan', { planId: 'saved-plan' }, 'execute-call')]),
      result([message('已提交，请查看实际执行结果')]),
    ],
    f.root,
  );
  const duplicate = await second.internal('agent.turn.start', {
    sessionId: session.id,
    message: '帮我准备任务',
    requestId: 'persisted-request',
  });
  expect(duplicate.id).toBe(turn.id);
  await second.internal('agent.interaction.respond', {
    interactionId: question.id,
    answer: { choices: ['farm'] },
  });
  await until(async () =>
    (
      await second.service.handle('agent.interaction.list', {
        sessionId: session.id,
        status: 'pending',
      })
    ).some((item: any) => item.kind === 'approval'),
  );
  await turnStatus(second.service, turn.id, 'waiting');
  const approval = (
    await second.service.handle('agent.interaction.list', {
      sessionId: session.id,
      status: 'pending',
    })
  )[0];
  expect(approval.kind).toBe('approval');
  expect(second.starts).toHaveLength(0);
  await expect(
    second.internal('agent.interaction.respond', {
      interactionId: approval.id,
      answer: { text: '同意' },
    }),
  ).rejects.toThrow('明确批准');
  const decision = { interactionId: approval.id, answer: { decision: 'approve' } };
  await second.internal('agent.interaction.respond', decision);
  await turnStatus(second.service, turn.id, 'completed');
  expect(second.starts).toHaveLength(1);
  await second.internal('agent.interaction.respond', decision);
  expect(second.starts).toHaveLength(1);
  await expect(
    second.internal('agent.interaction.respond', {
      interactionId: approval.id,
      answer: { decision: 'reject' },
    }),
  ).rejects.toThrow('不同答案');
  expect(second.posted).toHaveLength(2);
});

test('plan mode refuses an invented execution call even if the provider ignores the supplied tool list', async () => {
  const f = fixture([result([call('maa_start_plan', { planId: 'saved-plan' })])]);
  const session = await f.create();
  const turn = await f.start(session.id);
  const failed = await turnStatus(f.service, turn.id, 'failed');
  expect(failed.error).toContain('当前模式');
  expect(f.starts).toHaveLength(0);
  expect(await f.service.handle('agent.interaction.list', { sessionId: session.id })).toHaveLength(
    0,
  );
});

test('a modified saved plan invalidates an already approved immutable snapshot', async () => {
  const f = fixture([result([call('maa_start_plan', { planId: 'saved-plan' })])]);
  const session = await f.create('goal');
  const turn = await f.start(session.id);
  await turnStatus(f.service, turn.id, 'waiting');
  const approval = (
    await f.service.handle('agent.interaction.list', { sessionId: session.id, status: 'pending' })
  )[0];
  f.state.plan.tasks[0].params.times = 2;
  await f.internal('agent.interaction.respond', {
    interactionId: approval.id,
    answer: { decision: 'approve' },
  });
  const failed = await turnStatus(f.service, turn.id, 'failed');
  expect(failed.error).toMatch(/变更|变化|审批/);
  expect(f.starts).toHaveLength(0);
});

test('model cancellation is durable and missing provider usage remains explicitly incomplete without persisting credentials', async () => {
  const f = fixture([
    (init) =>
      new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener(
          'abort',
          () => reject(new Error('synthetic aborted ' + credential)),
          { once: true },
        ),
      ),
  ]);
  const session = await f.create();
  const turn = await f.start(session.id);
  await until(() => f.posted.length === 1);
  await f.service.handle('agent.turn.cancel', { turnId: turn.id });
  const cancelled = await turnStatus(f.service, turn.id, 'cancelled');
  await until(
    async () =>
      (await f.service.handle('agent.session.get', { sessionId: session.id })).session.status ===
      'idle',
  );
  expect(cancelled.status).toBe('cancelled');
  expect(JSON.stringify(f.store.all('agent_turn'))).not.toContain(credential);
  const missing = fixture([result([message('回答')], false)]);
  const nextSession = await missing.create();
  const nextTurn = await missing.start(nextSession.id);
  expect((await turnStatus(missing.service, nextTurn.id, 'completed')).usage).toMatchObject({
    modelCalls: 1,
    incomplete: true,
  });
  expect(missing.starts).toHaveLength(0);
});

test('account switching hides previous turns, questions and account memories from service APIs', async () => {
  const f = fixture([
    result([call('ask_user', { title: '目标', prompt: '你的目标是什么', inputType: 'text' })]),
  ]);
  const session = await f.create();
  const turn = await f.start(session.id);
  await turnStatus(f.service, turn.id, 'waiting');
  await f.service.handle('agent.memory.save', {
    sessionId: session.id,
    key: 'goal',
    content: '账号A',
    scope: 'account',
  });
  f.store.put('device_account', deviceId, 'account-b');
  await expect(f.service.handle('agent.turn.get', { turnId: turn.id })).rejects.toThrow('账号配置');
  expect(await f.service.handle('agent.interaction.list', {})).toHaveLength(0);
  expect((await f.service.handle('agent.session.list', {})).sessions).toHaveLength(0);
  const next = await f.create();
  expect(
    (await f.service.handle('agent.memory.list', { sessionId: next.id })).memories,
  ).toHaveLength(0);
});

test('unknown execution outcomes are reconciled through the persisted request ID before any possible resubmission', async () => {
  const f = fixture([
    result([call('maa_start_plan', { planId: 'saved-plan' })]),
    result([message('已核对提交结果')]),
  ]);
  f.state.unknownStart = true;
  const session = await f.create('goal');
  const turn = await f.start(session.id);
  await turnStatus(f.service, turn.id, 'waiting');
  const approval = (
    await f.service.handle('agent.interaction.list', { sessionId: session.id, status: 'pending' })
  )[0];
  await f.internal('agent.interaction.respond', {
    interactionId: approval.id,
    answer: { decision: 'approve' },
  });
  await until(async () =>
    ['failed', 'interrupted'].includes(
      (await f.service.handle('agent.turn.get', { turnId: turn.id })).status,
    ),
  );
  expect(f.starts).toHaveLength(1);
  const action = f.store.all('agent_action').find((row) => row.name === 'maa_start_plan');
  expect(action.status).toBe('unknown');
  f.state.recovered = run();
  await f.internal('agent.turn.resume', { turnId: turn.id });
  await turnStatus(f.service, turn.id, 'completed');
  expect(f.reconciliations).toEqual([action.requestId]);
  expect(f.starts).toHaveLength(1);
});

test('replaying a prior mission approval cannot reactivate a revoked mission', async () => {
  const f = fixture();
  const session = await f.create('goal');
  const mission = await f.service.handle('agent.mission.create', {
    sessionId: session.id,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    maxExecutions: 1,
    medicine: 0,
    stone: 0,
    targets: [{ kind: 'plan', planId: 'saved-plan' }],
    wakeAt: new Date(Date.now() + 30000).toISOString(),
  });
  const approval = (
    await f.service.handle('agent.interaction.list', { sessionId: session.id, status: 'pending' })
  )[0];
  const decision = { interactionId: approval.id, answer: { decision: 'approve' } };
  await f.internal('agent.interaction.respond', decision);
  await f.service.handle('agent.mission.revoke', { missionId: mission.id });
  await f.internal('agent.interaction.respond', decision);
  expect((await f.service.handle('agent.mission.list', { sessionId: session.id }))[0].status).toBe(
    'revoked',
  );
  expect(f.starts).toHaveLength(0);
});

test('unknown outcomes without authoritative evidence remain interrupted and cannot be replaced with a fresh model turn', async () => {
  const f = fixture([result([call('maa_start_plan', { planId: 'saved-plan' })])]);
  f.state.unknownStart = true;
  const session = await f.create('goal');
  const turn = await f.start(session.id);
  await turnStatus(f.service, turn.id, 'waiting');
  const approval = (
    await f.service.handle('agent.interaction.list', { sessionId: session.id, status: 'pending' })
  )[0];
  await f.internal('agent.interaction.respond', {
    interactionId: approval.id,
    answer: { decision: 'approve' },
  });
  await turnStatus(f.service, turn.id, 'interrupted');
  await f.internal('agent.turn.resume', { turnId: turn.id });
  const interrupted = await turnStatus(f.service, turn.id, 'interrupted');
  expect(interrupted.error).toContain('不明');
  expect(f.reconciliations).toHaveLength(1);
  expect(f.starts).toHaveLength(1);
  expect(f.posted).toHaveLength(1);
  await expect(f.start(session.id, '换个ID再执行')).rejects.toThrow('恢复或取消');
});

test('multiple-choice questions enforce valid distinct options and required answer counts before resuming the model', async () => {
  const f = fixture([
    result([
      call(
        'ask_user',
        {
          title: '资源选择',
          prompt: '请选择两个目标',
          inputType: 'multiple',
          options: [
            { id: 'a', label: '目标甲' },
            { id: 'b', label: '目标乙' },
            { id: 'c', label: '目标丙' },
          ],
          minChoices: 2,
          maxChoices: 2,
        },
        'multiple-choice',
      ),
    ]),
    result([message('已记录两个目标')]),
  ]);
  const session = await f.create();
  const turn = await f.start(session.id);
  await turnStatus(f.service, turn.id, 'waiting');
  const question = (
    await f.service.handle('agent.interaction.list', { sessionId: session.id, status: 'pending' })
  )[0];
  for (const choices of [['a'], ['a', 'a'], ['a', 'missing'], ['a', 'b', 'c']])
    await expect(
      f.internal('agent.interaction.respond', { interactionId: question.id, answer: { choices } }),
    ).rejects.toThrow('有效选项');
  expect(f.posted).toHaveLength(1);
  await f.internal('agent.interaction.respond', {
    interactionId: question.id,
    answer: { choices: ['a', 'b'] },
  });
  expect((await turnStatus(f.service, turn.id, 'completed')).reply).toBe('已记录两个目标');
  expect(f.starts).toHaveLength(0);
});

test('mission medicine limits are reserved from the approved snapshot and later completion cannot spend beyond the total', async () => {
  const f = fixture();
  f.state.plan.tasks[0].params.medicine = 1;
  const session = await f.create('goal');
  const mission = await f.service.handle('agent.mission.create', {
    sessionId: session.id,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    maxExecutions: 2,
    medicine: 1,
    stone: 0,
    targets: [{ kind: 'plan', planId: 'saved-plan' }],
  });
  const approval = (
    await f.service.handle('agent.interaction.list', { sessionId: session.id, status: 'pending' })
  )[0];
  await f.internal('agent.interaction.respond', {
    interactionId: approval.id,
    answer: { decision: 'approve' },
  });
  await until(() => f.starts.length === 1);
  await until(() =>
    f.store
      .all<AgentTurn>('agent_turn')
      .some(
        (turn) =>
          turn.missionId === mission.id &&
          turn.id !== 'mission-' + mission.id &&
          turn.status === 'completed',
      ),
  );
  const first = (await f.service.handle('agent.mission.list', { sessionId: session.id }))[0];
  expect(first.reservedMedicine).toBe(1);
  expect(first.remainingExecutions).toBe(1);
  f.service.onBusinessEvent('run.completed', { run: { id: 'synthetic-run' } });
  await until(
    async () =>
      (await f.service.handle('agent.mission.list', { sessionId: session.id }))[0].status ===
      'paused',
  );
  expect(f.starts).toHaveLength(1);
  const stopped = (await f.service.handle('agent.mission.list', { sessionId: session.id }))[0];
  expect(stopped.reservedMedicine).toBe(1);
  expect(stopped.remainingExecutions).toBe(1);
  expect(f.posted).toHaveLength(0);
});

async function missionPolicyFixture(maxExecutions = 2, medicine = 2) {
  const f = fixture();
  f.state.plan.tasks[0].params.medicine = 1;
  const context = new ContextRepository(f.store);
  const session = await f.create('goal');
  const ledger = new AgentLedger(f.store, (id) => context.get(id));
  const policy = new AgentExecutionPolicy(f.store, context, ledger, f.host.maa, () => 'fixture-v1');
  const mission = await policy.create({
    sessionId: session.id,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    maxExecutions,
    medicine,
    stone: 0,
    targets: [{ kind: 'plan', planId: 'saved-plan' }],
  });
  const approval = ledger.interactions(session.id, undefined, 'pending')[0];
  ledger.respond(approval.id, { decision: 'approve' });
  policy.approval(approval.id);
  const action = (callId: string) => {
    const turnId = 'reserve-' + callId;
    ledger.putTurn({
      id: turnId,
      sessionId: session.id,
      missionId: mission.id,
      status: 'running',
      usage: emptyAgentUsage(),
      createdAt: at,
      updatedAt: at,
    });
    const record = ledger.action(session.id, turnId, callId, 'maa_start_plan', {
      planId: 'saved-plan',
    });
    const request: MaaToolAuthorization = {
      toolName: 'maa_start_plan',
      effect: 'execute',
      deviceId,
      clientType: 'Official',
      requestId: 'request-' + callId,
      action: { plan: structuredClone(f.state.plan) },
    };
    return { record, request, turnId };
  };
  return { ...f, session, ledger, policy, mission, action, approval };
}

test('concurrent independent reservations atomically enforce the approved execution and medicine totals', async () => {
  const f = await missionPolicyFixture();
  const attempts = Array.from({ length: 12 }, (_, index) => f.action('independent-' + index));
  const outcomes = await Promise.allSettled(
    attempts.map(({ record, request, turnId }) =>
      f.policy.authorize(f.session.id, turnId, record, request),
    ),
  );
  expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(2);
  expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(10);
  expect(f.policy.get(f.mission.id)).toMatchObject({
    remainingExecutions: 0,
    reservedMedicine: 2,
    reservedStone: 0,
  });
  expect(
    f.ledger.actions(f.session.id).filter((action) => action.status === 'submitted'),
  ).toHaveLength(2);
  expect(f.starts).toHaveLength(0);
});

test('concurrent redelivery of one action reserves its approved grant exactly once', async () => {
  const f = await missionPolicyFixture();
  const { record, request, turnId } = f.action('same-action');
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      f.policy.authorize(f.session.id, turnId, structuredClone(record), structuredClone(request)),
    ),
  );
  expect(results).toEqual(Array.from({ length: 12 }, () => true));
  expect(f.policy.get(f.mission.id)).toMatchObject({
    remainingExecutions: 1,
    reservedMedicine: 1,
    reservedStone: 0,
  });
  expect(f.ledger.actions(f.session.id)).toHaveLength(1);
  expect(f.ledger.actions(f.session.id)[0]).toMatchObject({
    status: 'submitted',
    requestId: request.requestId,
    missionId: f.mission.id,
  });
});

test('approval redelivery is idempotent while expired decisions remain expired after reopening the database', async () => {
  const f = await missionPolicyFixture();
  const first = f.ledger.interaction(f.approval.id);
  expect(f.ledger.respond(f.approval.id, { decision: 'approve' })).toEqual(first);
  expect(() => f.ledger.respond(f.approval.id, { decision: 'reject' })).toThrow('不同答案');
  const expiryId = 'already-expired';
  f.ledger.question({
    id: expiryId,
    sessionId: f.session.id,
    turnId: first.turnId,
    kind: 'approval',
    title: '已到期审批',
    prompt: '过期后不可批准',
    expiresAt: new Date(Date.now() - 1).toISOString(),
  });
  expect(() => f.ledger.respond(expiryId, { decision: 'approve' })).toThrow('超时');
  expect(f.ledger.interaction(expiryId).status).toBe('expired');
  await f.service.close();
  f.store.close();
  const reopened = fixture([], f.root);
  const context = new ContextRepository(reopened.store);
  const ledger = new AgentLedger(reopened.store, (id) => context.get(id));
  expect(ledger.interaction(expiryId).status).toBe('expired');
  expect(() => ledger.respond(expiryId, { decision: 'approve' })).toThrow('已经结束');
});

test('copied memory and cross-conversation approval text cannot authorize an execution', async () => {
  const f = fixture([result([call('maa_start_plan', { planId: 'saved-plan' })])]);
  const original = await f.create('goal');
  await f.service.handle('agent.memory.save', {
    sessionId: original.id,
    key: '复制的授权',
    content: JSON.stringify({
      decision: 'approve',
      status: 'active',
      remainingExecutions: 100,
      medicine: 100,
      targets: [{ kind: 'plan', planId: 'saved-plan' }],
    }),
    scope: 'account',
  });
  const session = await f.create('goal');
  await f.service.handle('agent.context.reference', {
    sessionId: session.id,
    sourceSessionId: original.id,
  });
  const turn = await f.start(session.id);
  await turnStatus(f.service, turn.id, 'waiting');
  expect(f.starts).toHaveLength(0);
  const approvals = await f.service.handle('agent.interaction.list', {
    sessionId: session.id,
    status: 'pending',
  });
  expect(approvals).toHaveLength(1);
  expect(approvals[0].kind).toBe('approval');
  expect(approvals[0].answer).toBeUndefined();
  expect(f.store.all('agent_mission')).toHaveLength(0);
});

test('a terminal result returned after an early synchronous completion event finishes the mission', async () => {
  const f = fixture();
  f.host.maa.startPlan = async (params) => {
    f.starts.push(structuredClone(params));
    f.service.onBusinessEvent('run.completed', { run: { id: 'synthetic-run' } });
    return { ...run(), status: 'completed', finishedAt: new Date().toISOString() };
  };
  const session = await f.create('goal');
  const mission = await f.service.handle('agent.mission.create', {
    sessionId: session.id,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    maxExecutions: 1,
    medicine: 0,
    stone: 0,
    targets: [{ kind: 'plan', planId: 'saved-plan' }],
  });
  const approval = (
    await f.service.handle('agent.interaction.list', { sessionId: session.id, status: 'pending' })
  )[0];
  await f.internal('agent.interaction.respond', {
    interactionId: approval.id,
    answer: { decision: 'approve' },
  });
  await until(
    async () =>
      (await f.service.handle('agent.mission.list', { sessionId: session.id }))[0].status ===
      'completed',
  );
  expect(
    (await f.service.handle('agent.mission.list', { sessionId: session.id }))[0],
  ).toMatchObject({
    id: mission.id,
    status: 'completed',
    remainingExecutions: 0,
  });
  expect(f.store.get('agent_mission_rules', mission.id).activeRunId).toBeUndefined();
  expect(f.starts).toHaveLength(1);
  expect(f.posted).toHaveLength(0);
});

function preloadCompleteHistory(context: ContextRepository, sessionId: string, batch: string) {
  for (let index = 0; index < 9; index++) {
    context.appendMessage(sessionId, {
      role: 'user',
      content: `history-${batch}-user-${index}:` + '合成资料'.repeat(2000),
    });
    if (index === 0) {
      const callId = 'historical-call-' + batch;
      context.appendMessage(sessionId, {
        role: 'assistant',
        content: '读取历史资料',
        items: [call('maa_get_device_status', {}, callId)],
      });
      const output = `historical-tool-${batch}:` + '完整工具原文'.repeat(2000) + ':original-tail';
      context.appendMessage(sessionId, {
        role: 'tool',
        content: output,
        items: [{ type: 'function_call_output', call_id: callId, output }],
      });
    }
    context.appendMessage(sessionId, {
      role: 'assistant',
      content: `history-${batch}-assistant-${index}:` + '已知事实'.repeat(2000),
    });
  }
  return context.transcript(sessionId);
}

test('failed service compression retains original history and normal input while accounting for its incomplete summary attempt', async () => {
  const failureSentinel = 'synthetic-summary-failure-must-not-become-memory';
  const f = fixture([
    async () => {
      throw new Error(failureSentinel);
    },
    result([message('摘要失败后仍可正常回答')]),
  ]);
  const session = await f.create();
  const originals = preloadCompleteHistory(f.service.context, session.id, 'failure');
  expect(JSON.stringify(originals).length).toBeGreaterThan(100000);
  expect(f.service.context.getProjection(session.id)).toBeNull();
  const turn = await f.start(session.id, '继续处理历史资料');
  const completed = await turnStatus(f.service, turn.id, 'completed');
  expect(completed.reply).toBe('摘要失败后仍可正常回答');
  expect(completed.usage).toMatchObject({
    modelCalls: 2,
    inputTokens: 10,
    outputTokens: 2,
    totalTokens: 12,
    incomplete: true,
  });
  expect(completed.summaryUsage).toMatchObject({
    modelCalls: 1,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    incomplete: true,
  });
  expect(f.posted).toHaveLength(2);
  expect(f.posted[0].instructions).toContain('摘要资料');
  expect(f.posted[0].tools).toHaveLength(0);
  for (const row of originals.filter((row) => !row.items?.length))
    expect(f.posted[1].input.some((item: any) => item.content === row.content)).toBe(true);
  const projectedTool = f.posted[1].input.find(
    (item: any) =>
      item.type === 'function_call_output' && item.call_id === 'historical-call-failure',
  );
  const originalTool = originals.find((row) => row.role === 'tool')!;
  expect(JSON.parse(projectedTool.output)).toMatchObject({
    truncated: true,
    callId: 'historical-call-failure',
    excerpt: originalTool.content.slice(0, 3000),
  });
  expect(f.service.context.transcript(session.id).slice(0, originals.length)).toEqual(originals);
  expect(f.service.context.getProjection(session.id)).toBeNull();
  const detail = await f.service.handle('agent.session.get', { sessionId: session.id });
  expect(detail.session.summaryUsage).toEqual(completed.summaryUsage);
  expect(detail.session.usage).toEqual(completed.usage);
  expect(JSON.stringify(f.store.all('agent_memory'))).not.toContain(failureSentinel);
  expect(JSON.stringify(f.store.all('agent_projection'))).not.toContain(
    'Error generating summary:',
  );
});

test('repeated successful service compression updates the same summary memory and preserves every original message', async () => {
  const firstSummary = '首轮压缩资料：保留材料目标和来源编号。';
  const secondSummary = '第二轮压缩资料：合并首轮资料与新增目标，来源编号仍可追踪。';
  const f = fixture([
    result([message(firstSummary)]),
    result([message('第一轮回答')]),
    result([message(secondSummary)]),
    result([message('第二轮回答')]),
  ]);
  const session = (await f.service.handle('agent.session.create', {
    deviceId,
    title: '摘要会话'.repeat(50),
  })) as AgentSession;
  const originals = preloadCompleteHistory(f.service.context, session.id, 'first');
  const firstTurn = await f.start(session.id, '处理第一批资料');
  const firstCompleted = await turnStatus(f.service, firstTurn.id, 'completed');
  const firstProjection = f.service.context.getProjection(session.id)!;
  const firstMemory = f.service.context
    .listMemory({ sessionId: session.id, limit: 100 })
    .memories.find(
      (memory) => memory.sourceSessionId === session.id && memory.content === firstSummary,
    )!;
  expect(firstProjection).toMatchObject({ revision: 1, summary: firstSummary });
  expect(firstMemory).toMatchObject({ revision: 1, content: firstSummary, source: 'summary' });
  expect(firstCompleted.usage).toMatchObject({ modelCalls: 2, incomplete: false });
  expect(firstCompleted.summaryUsage).toMatchObject({ modelCalls: 1, incomplete: false });
  const beforeSecond = preloadCompleteHistory(f.service.context, session.id, 'second');
  const secondTurn = await f.start(session.id, '处理第二批资料');
  const secondCompleted = await turnStatus(f.service, secondTurn.id, 'completed');
  const projection = f.service.context.getProjection(session.id)!;
  expect(projection).toMatchObject({ revision: 2, summary: secondSummary });
  const summaryMemories = f.service.context
    .listMemory({ sessionId: session.id, limit: 100 })
    .memories.filter((memory) => memory.key === firstMemory.key);
  expect(summaryMemories).toHaveLength(1);
  expect(summaryMemories[0]).toMatchObject({
    id: firstMemory.id,
    revision: 2,
    content: secondSummary,
    sourceMessageId: projection.throughMessageId,
  });
  expect(f.service.context.transcript(session.id).slice(0, originals.length)).toEqual(originals);
  expect(f.service.context.transcript(session.id).slice(0, beforeSecond.length)).toEqual(
    beforeSecond,
  );
  expect(f.posted).toHaveLength(4);
  expect(f.posted[1].input[0].content).toContain(firstSummary);
  expect(f.posted[2].input[0].content).toContain(firstSummary);
  expect(f.posted[3].input[0].content).toContain(secondSummary);
  expect(secondCompleted.usage).toMatchObject({ modelCalls: 2, incomplete: false });
  expect(secondCompleted.summaryUsage).toMatchObject({ modelCalls: 1, incomplete: false });
  expect(f.service.context.get(session.id).usage).toMatchObject({
    modelCalls: 4,
    incomplete: false,
  });
  expect(f.service.context.get(session.id).summaryUsage).toMatchObject({
    modelCalls: 2,
    incomplete: false,
  });
});

test('short conversation summaries are recalled by relevance within the current account only', async () => {
  const f = fixture([
    result([message('d32steel-planning：本账号材料目标 same-account-summary-evidence')]),
    result([message('家具安排 unrelated-summary-evidence')]),
    result([message('d32steel-planning：另一个账号 private-account-summary-evidence')]),
    result([message('已结合本账号材料目标继续整理')]),
  ]);
  f.store.put('device_account', deviceId, 'account-a');
  const original = await f.create();
  const originalTurn = await f.start(original.id, 'd32steel-planning：记录材料目标');
  await turnStatus(f.service, originalTurn.id, 'completed');
  expect(f.service.context.get(original.id).summary).toContain('same-account-summary-evidence');
  const unrelated = await f.create();
  await turnStatus(f.service, (await f.start(unrelated.id, '家具安排')).id, 'completed');
  f.store.put('device_account', deviceId, 'account-b');
  const foreign = await f.create();
  await turnStatus(
    f.service,
    (await f.start(foreign.id, 'd32steel-planning：记录账号B材料')).id,
    'completed',
  );
  f.store.put('device_account', deviceId, 'account-a');
  const session = await f.create();
  const turn = await f.start(session.id, '继续 d32steel-planning');
  await turnStatus(f.service, turn.id, 'completed');
  expect(f.posted).toHaveLength(4);
  const instructions: string = f.posted[3].instructions;
  const relatedLine = instructions.split('\n').find((line) => line.startsWith('相关会话摘要：'))!;
  const related = JSON.parse(relatedLine.slice('相关会话摘要：'.length));
  expect(related).toHaveLength(1);
  expect(related[0]).toMatchObject({ id: original.id });
  expect(related[0].summary).toContain('same-account-summary-evidence');
  expect(instructions).not.toContain('unrelated-summary-evidence');
  expect(instructions).not.toContain('private-account-summary-evidence');
  expect(instructions).not.toContain(foreign.id);
  expect(f.service.context.references(session.id)).toHaveLength(0);
  expect(f.starts).toHaveLength(0);
});

async function connectExportedServer(service: AgentService) {
  await service.server.setEnabled(true);
  const details = service.server.connectionDetails();
  const client = new Client(
    { name: 'synthetic-service-test-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(details.url!), {
      authProvider: { token: async () => details.token! },
    }),
  );
  return client;
}
const operation = (result: Awaited<ReturnType<Client['callTool']>>) =>
  JSON.parse((result.content[0] as { text: string }).text) as {
    operationId: string;
    status: string;
  };

test('an external direct operation executes once for one stable request ID and remains deduplicated after restart', async () => {
  const f = fixture();
  const client = await connectExportedServer(f.service);
  const args = {
    requestId: 'durable-direct-operation',
    kind: 'plan',
    deviceId,
    planId: 'saved-plan',
  };
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      client.callTool({ name: 'maa_request_operation', arguments: args }),
    ),
  );
  const id = operation(results[0]).operationId;
  expect(results.every((result) => operation(result).operationId === id)).toBe(true);
  const turn = await turnStatus(f.service, id, 'waiting');
  const approval = f.service.ledger.interactions(turn.sessionId, turn.id, 'pending')[0];
  expect(f.starts).toHaveLength(0);
  await f.internal('agent.interaction.respond', {
    interactionId: approval.id,
    answer: { decision: 'approve' },
  });
  await turnStatus(f.service, id, 'completed');
  const duplicate = await client.callTool({ name: 'maa_request_operation', arguments: args });
  expect(operation(duplicate)).toEqual({ operationId: id, status: 'completed' });
  expect(f.starts).toHaveLength(1);
  expect(f.service.context.list().sessions).toHaveLength(1);
  expect(f.posted).toHaveLength(0);
  await client.close();
  await f.service.close();
  f.store.close();
  const reopened = fixture([], f.root);
  const nextClient = await connectExportedServer(reopened.service);
  expect(
    operation(await nextClient.callTool({ name: 'maa_request_operation', arguments: args })),
  ).toEqual({ operationId: id, status: 'completed' });
  const changed = await nextClient.callTool({
    name: 'maa_request_operation',
    arguments: { ...args, planId: 'another-plan' },
  });
  expect(changed.isError).toBe(true);
  expect(reopened.service.context.list().sessions).toHaveLength(1);
  expect(reopened.starts).toHaveLength(0);
  expect(reopened.posted).toHaveLength(0);
});

test('a cancelled direct operation stays cancelled when the submitted host action returns later', async () => {
  const f = fixture();
  let release!: (value: Run) => void;
  const delayed = new Promise<Run>((resolve) => {
    release = resolve;
  });
  f.host.maa.startPlan = async (params) => {
    f.starts.push(structuredClone(params));
    return delayed;
  };
  const client = await connectExportedServer(f.service);
  const args = {
    requestId: 'cancelled-direct-operation',
    kind: 'plan',
    deviceId,
    planId: 'saved-plan',
  };
  const id = operation(
    await client.callTool({ name: 'maa_request_operation', arguments: args }),
  ).operationId;
  const turn = await turnStatus(f.service, id, 'waiting');
  const approval = f.service.ledger.interactions(turn.sessionId, turn.id, 'pending')[0];
  await f.internal('agent.interaction.respond', {
    interactionId: approval.id,
    answer: { decision: 'approve' },
  });
  await until(() => f.starts.length === 1);
  expect((await f.service.handle('agent.turn.cancel', { turnId: id })).status).toBe('cancelled');
  expect(
    operation(await client.callTool({ name: 'maa_request_operation', arguments: args })),
  ).toEqual({ operationId: id, status: 'cancelled' });
  release(run());
  await f.service.close();
  expect(f.service.ledger.turn(id).status).toBe('cancelled');
  expect(f.service.context.get(turn.sessionId).status).toBe('idle');
  expect(f.service.ledger.actions(turn.sessionId)).toHaveLength(1);
  expect(f.service.ledger.actions(turn.sessionId)[0].status).toBe('completed');
  expect(f.starts).toHaveLength(1);
  expect(f.posted).toHaveLength(0);
});

test('cancelling a pending user question closes its Responses call before a new turn in the same conversation', async () => {
  const callId = 'question-cancelled-before-answer';
  const f = fixture([
    result([
      call('ask_user', { title: '目标选择', prompt: '请补充你的目标', inputType: 'text' }, callId),
    ]),
    result([message('新一轮已正常回答')]),
  ]);
  const session = await f.create();
  const first = await f.start(session.id, '先询问我的目标');
  await turnStatus(f.service, first.id, 'waiting');
  await f.service.handle('agent.turn.cancel', { turnId: first.id });
  let next: AgentTurn | undefined;
  await until(async () => {
    try {
      next = await f.start(session.id, '取消旧问题，继续新一轮', 'stable-after-question-cancel');
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('仍在结束')) return false;
      throw error;
    }
  });
  expect((await turnStatus(f.service, next!.id, 'completed')).reply).toBe('新一轮已正常回答');
  expect(f.posted).toHaveLength(2);
  const input: any[] = f.posted[1].input;
  const oldCallIndex = input.findIndex(
    (item) => item.type === 'function_call' && item.call_id === callId,
  );
  const outputs = input.filter(
    (item) => item.type === 'function_call_output' && item.call_id === callId,
  );
  expect(oldCallIndex).toBeGreaterThanOrEqual(0);
  expect(outputs).toHaveLength(1);
  expect(JSON.parse(outputs[0].output).status).toBe('cancelled');
  expect(input.indexOf(outputs[0])).toBeGreaterThan(oldCallIndex);
  expect(input.indexOf(outputs[0])).toBeLessThan(
    input.findIndex((item) => item.content === '取消旧问题，继续新一轮'),
  );
  expect(f.service.ledger.turn(first.id).status).toBe('cancelled');
  expect(f.service.ledger.interactions(session.id, first.id)[0].status).toBe('cancelled');
  expect(f.service.context.get(session.id).status).toBe('idle');
  expect(f.starts).toHaveLength(0);
});

type MissionTarget = 'plan' | 'tool';
const syntheticTool = (id: string, status: MaaToolJob['status'] = 'running'): MaaToolJob => ({
  id,
  kind: 'recruit',
  deviceId,
  clientType: 'Official',
  status,
  progress: status === 'completed' ? 100 : 0,
  message: '合成工具状态，未证明动作成功',
  startedAt: at,
  finishedAt: status === 'completed' ? new Date().toISOString() : null,
});
async function beginOfflineMission(target: MissionTarget, maxExecutions = 2, expire = false) {
  const first = fixture();
  const initialId = target === 'plan' ? 'offline-run' : 'offline-tool';
  first.state.run.id = initialId;
  first.host.maa.startTool = async (params) => {
    first.starts.push(structuredClone(params));
    return syntheticTool(initialId);
  };
  const session = await first.create('goal');
  const mission = await first.service.handle('agent.mission.create', {
    sessionId: session.id,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    maxExecutions,
    medicine: 0,
    stone: 0,
    targets:
      target === 'plan'
        ? [{ kind: 'plan', planId: 'saved-plan' }]
        : [{ kind: 'tool', toolKind: 'recruit', config: {} }],
  });
  const approval = first.service.ledger.interactions(session.id, undefined, 'pending')[0];
  await first.internal('agent.interaction.respond', {
    interactionId: approval.id,
    answer: { decision: 'approve' },
  });
  await until(
    () =>
      first.store.get('agent_mission_rules', mission.id).activeRunId === initialId &&
      first.service.ledger
        .turns(session.id)
        .some(
          (turn) =>
            turn.missionId === mission.id &&
            turn.id !== 'mission-' + mission.id &&
            turn.status === 'completed',
        ),
  );
  expect(first.starts).toHaveLength(1);
  await first.service.close();
  if (expire)
    first.store.put('agent_mission', mission.id, {
      ...first.store.get<AgentMission>('agent_mission', mission.id),
      expiresAt: new Date(Date.now() - 1).toISOString(),
    });
  first.store.close();
  const second = fixture([], first.root);
  const order: string[] = [];
  const reads: string[] = [];
  const nextId = 'next-' + initialId;
  second.host.maa.getRun = async (id) => {
    reads.push(id);
    order.push('read');
    return {
      ...run(),
      id,
      status: 'completed',
      progress: 100,
      finishedAt: new Date().toISOString(),
    };
  };
  second.host.maa.getTool = async (id) => {
    reads.push(id);
    order.push('read');
    return syntheticTool(id, 'completed');
  };
  second.host.maa.startPlan = async (params) => {
    order.push('start');
    second.starts.push(structuredClone(params));
    return { ...run(), id: nextId };
  };
  second.host.maa.startTool = async (params) => {
    order.push('start');
    second.starts.push(structuredClone(params));
    return syntheticTool(nextId);
  };
  expect(second.service.policy.get(mission.id).status).toBe('paused');
  expect(second.starts).toHaveLength(0);
  expect(reads).toHaveLength(0);
  return { ...second, session, mission, initialId, nextId, reads, order };
}

for (const target of ['plan', 'tool'] as const) {
  test(`manual ${target} mission recovery reads an offline completion before using its remaining finite execution`, async () => {
    const f = await beginOfflineMission(target);
    await f.service.handle('agent.mission.resume', { missionId: f.mission.id });
    await until(
      () =>
        f.starts.length === 1 &&
        f.store.get('agent_mission_rules', f.mission.id).activeRunId === f.nextId,
    );
    expect(f.reads).toEqual([f.initialId]);
    expect(f.order).toEqual(['read', 'start']);
    expect(f.service.policy.get(f.mission.id)).toMatchObject({
      status: 'active',
      remainingExecutions: 0,
      reservedMedicine: 0,
      reservedStone: 0,
    });
    f.service.onBusinessEvent(target === 'tool' ? 'tool.completed' : 'run.completed', {
      runId: f.nextId,
    });
    await until(() => f.service.policy.get(f.mission.id).status === 'completed');
    expect(f.starts).toHaveLength(1);
    expect(f.service.policy.get(f.mission.id).remainingExecutions).toBe(0);
    expect(f.posted).toHaveLength(0);
  });

  test(`unknown ${target} mission recovery remains paused without starting a replacement execution`, async () => {
    const f = await beginOfflineMission(target);
    const unknown = async (id: string): Promise<never> => {
      f.reads.push(id);
      throw new Error('Synthetic business outcome cannot be read');
    };
    if (target === 'plan') f.host.maa.getRun = unknown;
    else f.host.maa.getTool = unknown;
    await expect(
      f.service.handle('agent.mission.resume', { missionId: f.mission.id }),
    ).rejects.toThrow('保持暂停');
    expect(f.reads).toEqual([f.initialId]);
    expect(f.service.policy.get(f.mission.id)).toMatchObject({
      status: 'paused',
      remainingExecutions: 1,
    });
    expect(f.store.get('agent_mission_rules', f.mission.id).activeRunId).toBe(f.initialId);
    expect(f.starts).toHaveLength(0);
    expect(f.posted).toHaveLength(0);
  });

  for (const end of ['exhausted', 'expired'] as const)
    test(`manual ${target} recovery reconciles an ${end} mission without granting another execution`, async () => {
      const f = await beginOfflineMission(target, end === 'exhausted' ? 1 : 2, end === 'expired');
      await f.service.handle('agent.mission.resume', { missionId: f.mission.id });
      await until(() => f.service.policy.get(f.mission.id).status === 'completed');
      expect(f.reads).toEqual([f.initialId]);
      expect(f.order).toEqual(['read']);
      expect(f.store.get('agent_mission_rules', f.mission.id).activeRunId).toBeUndefined();
      expect(f.service.policy.get(f.mission.id).remainingExecutions).toBe(
        end === 'exhausted' ? 0 : 1,
      );
      expect(f.starts).toHaveLength(0);
      expect(f.posted).toHaveLength(0);
    });
}
