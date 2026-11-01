import { afterEach, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, fromJsonSchema, McpServer } from '@modelcontextprotocol/server';
import type { AgentInteraction, AgentSession, AgentTurn } from '@contracts/agent-types';
import type { MaaToolHost } from '@maaverge/agent/tools';
import { Store } from '@backend/infrastructure/storage/storage';
import { AgentService, type AgentServiceHost } from '@backend/modules/agent/service';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action();
});
const model = {
  provider: 'openai-compatible',
  baseUrl: 'https://synthetic.invalid/v1',
  model: 'synthetic-mcp-model',
};
const key = 'synthetic-model-key';
const inputRequests = {
  choice: {
    method: 'elicitation/create' as const,
    params: {
      mode: 'form' as const,
      message: 'Pick one',
      requestedSchema: {
        type: 'object' as const,
        properties: { choice: { type: 'string' as const, enum: ['confirmed'] } },
        required: ['choice'],
        additionalProperties: false,
      },
    },
  },
};
async function remoteFixture(options: { resumable?: boolean } = {}) {
  const state = { calls: [] as Array<{ state: unknown; responses: unknown }>, revision: 1 };
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: 'synthetic-durable-server', version: '1.0.0' });
      server.registerTool(
        'confirm_fixture',
        {
          description: `Revision ${state.revision}`,
          inputSchema: fromJsonSchema({
            type: 'object',
            properties: {},
            additionalProperties: false,
          }),
        },
        async (_input, ctx) => {
          const opaque = ctx.mcpReq.requestState();
          state.calls.push({ state: opaque, responses: ctx.mcpReq.inputResponses });
          if (opaque) return { content: [{ type: 'text', text: 'continued successfully' }] };
          return {
            resultType: 'input_required',
            inputRequests,
            ...(options.resumable === false
              ? {}
              : { requestState: 'opaque-durable-fixture-state' }),
          };
        },
      );
      return server;
    },
    { legacy: 'stateless', responseMode: 'json' },
  );
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) => handler.fetch(request),
  });
  cleanup.push(async () => {
    server.stop(true);
    await handler.close();
  });
  return { state, url: `${server.url.origin}/mcp` };
}
function serviceFixture(directory?: string) {
  const root =
    directory ?? makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-agent-mcp-service-'));
  if (!directory) cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const store = new Store(root);
  cleanup.push(() => store.close());
  const posted: Array<Record<string, any>> = [];
  let beforeModelReturn: () => void = () => {};
  let outputOverride: ((body: Record<string, any>) => unknown[]) | undefined;
  const forbidden = async (): Promise<never> => {
    throw new Error('Unexpected native operation');
  };
  const maa: MaaToolHost = {
    listDevices: async () => [],
    listPlans: async () => [],
    preparePlan: () => {
      throw new Error('Unexpected native operation');
    },
    deviceStatus: forbidden,
    startPlan: forbidden,
    getRun: forbidden,
    stopRun: forbidden,
    getFrame: forbidden,
    click: forbidden,
    startTool: forbidden,
    getTool: forbidden,
    stopTool: forbidden,
    getRecognition: forbidden,
    getCopilotWorkspace: forbidden,
    startCopilot: forbidden,
  };
  const host: AgentServiceHost = {
    maa,
    model: () => model,
    deviceClient: () => 'Official',
    deviceExists: (id) => id === 'fixture-device',
    emit: () => {},
    reconcile: async () => undefined,
    fetcher: (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      posted.push(body);
      const tool = body.tools.find((tool: { name: string }) => tool.name.startsWith('mcp_'));
      if (!tool && !outputOverride) throw new Error('MCP tool was not exposed');
      const output = outputOverride
        ? outputOverride(body)
        : body.input.some((item: { type?: string }) => item.type === 'function_call_output')
          ? [{ type: 'message', content: [{ type: 'output_text', text: '已完成合成调用' }] }]
          : [
              {
                type: 'function_call',
                name: tool.name,
                call_id: 'stable-mcp-call',
                arguments: '{}',
              },
            ];
      beforeModelReturn();
      return Response.json({
        output,
        usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
      });
    }) as typeof fetch,
  };
  const service = new AgentService(store, host);
  cleanup.push(() => service.close());
  const internal = (method: string, params: unknown) =>
    service.hostRequest({ method, params, model, credential: key });
  const answer = (interactionId: string, answer: unknown) =>
    internal('agent.interaction.respond', { interactionId, answer });
  return {
    root,
    store,
    service,
    posted,
    internal,
    answer,
    maa,
    setOutput: (callback: (body: Record<string, any>) => unknown[]) => {
      outputOverride = callback;
    },
    beforeModelReturn: (callback: () => void) => {
      beforeModelReturn = callback;
    },
  };
}
async function settle(service: AgentService, id: string, status: AgentTurn['status']) {
  for (let i = 0; i < 400; i++) {
    const turn = (await service.handle('agent.turn.get', { turnId: id })) as AgentTurn;
    if (turn.status === status) return turn;
    if (
      ['failed', 'cancelled', 'completed', 'interrupted'].includes(turn.status) &&
      turn.status !== status
    )
      throw new Error(`Expected ${status}, received ${JSON.stringify(turn)}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`MCP service turn did not reach ${status}`);
}
async function begin(fixture: ReturnType<typeof serviceFixture>, url: string) {
  await fixture.service.handle('agent.mcp.save', {
    server: {
      id: 'durable-fixture',
      name: 'Durable synthetic fixture',
      transport: 'streamable-http',
      enabled: true,
      url,
      enabledTools: ['confirm_fixture'],
      timeoutMs: 3000,
    },
  });
  const session = (await fixture.service.handle('agent.session.create', {
    deviceId: 'fixture-device',
    mode: 'goal',
    mcpServerIds: ['durable-fixture'],
  })) as AgentSession;
  const turn = (await fixture.internal('agent.turn.start', {
    sessionId: session.id,
    message: '调用合成服务器',
    requestId: crypto.randomUUID(),
  })) as AgentTurn;
  const waiting = await settle(fixture.service, turn.id, 'waiting');
  const approval = fixture.service.ledger.interaction(waiting.pendingInteractionId!);
  expect(approval.kind).toBe('approval');
  return { session, turn, approval };
}
async function question(
  fixture: ReturnType<typeof serviceFixture>,
  turn: AgentTurn,
): Promise<AgentInteraction> {
  for (let i = 0; i < 400; i++) {
    const value = fixture.service.ledger
      .interactions(turn.sessionId, turn.id, 'pending')
      .find((item) => item.kind === 'mcp');
    if (value) {
      await settle(fixture.service, turn.id, 'waiting');
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('MCP question was not persisted');
}

test('MCP approval and form continuation persist through restart without replaying the initial operation', async () => {
  const remote = await remoteFixture(),
    first = serviceFixture();
  const { turn, approval } = await begin(first, remote.url);
  expect(remote.state.calls).toEqual([]);
  await first.answer(approval.id, { decision: 'approve' });
  const pending = await question(first, turn);
  expect(remote.state.calls).toHaveLength(1);
  expect(first.service.ledger.actions(turn.sessionId)[0].status).toBe('awaiting_input');
  await first.service.close();
  first.store.close();
  const resumed = serviceFixture(first.root);
  expect(resumed.service.ledger.interaction(pending.id).status).toBe('pending');
  await resumed.answer(pending.id, {
    text: JSON.stringify({ choice: { action: 'accept', content: { choice: 'confirmed' } } }),
  });
  await settle(resumed.service, turn.id, 'completed');
  expect(remote.state.calls).toEqual([
    { state: undefined, responses: undefined },
    {
      state: 'opaque-durable-fixture-state',
      responses: { choice: { action: 'accept', content: { choice: 'confirmed' } } },
    },
  ]);
  expect(resumed.service.ledger.actions(turn.sessionId)[0].status).toBe('completed');
  expect(JSON.stringify(resumed.posted)).not.toContain('opaque-durable-fixture-state');
  expect(JSON.stringify(resumed.posted)).not.toContain('inputResponses');
});

test('a server tool definition change invalidates the approved snapshot before dispatch', async () => {
  const remote = await remoteFixture(),
    fixture = serviceFixture();
  const { turn, approval } = await begin(fixture, remote.url);
  remote.state.revision = 2;
  await fixture.answer(approval.id, { decision: 'approve' });
  await settle(fixture.service, turn.id, 'failed');
  expect(remote.state.calls).toEqual([]);
});

test('a missing server continuation state remains unknown and cannot replay on manual resume', async () => {
  const remote = await remoteFixture({ resumable: false }),
    fixture = serviceFixture();
  const { turn, approval } = await begin(fixture, remote.url);
  await fixture.answer(approval.id, { decision: 'approve' });
  await settle(fixture.service, turn.id, 'interrupted');
  expect(fixture.service.ledger.actions(turn.sessionId)[0].status).toBe('unknown');
  expect(remote.state.calls).toHaveLength(1);
  await fixture.internal('agent.turn.resume', { turnId: turn.id });
  await settle(fixture.service, turn.id, 'interrupted');
  expect(remote.state.calls).toHaveLength(1);
});

test('exported MCP requests deduplicate the stable requestId and reject a changed operation scope', async () => {
  const fixture = serviceFixture();
  await fixture.service.server.setEnabled(true);
  const connection = fixture.service.server.connectionDetails();
  const client = new Client(
    { name: 'synthetic-external-consumer', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  cleanup.push(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(connection.url!), {
      authProvider: { token: async () => connection.token! },
    }),
  );
  const args = {
    requestId: 'persistent-external-request',
    kind: 'plan',
    deviceId: 'fixture-device',
    planId: 'saved-plan',
  };
  const first = await client.callTool({ name: 'maa_request_operation', arguments: args });
  const second = await client.callTool({ name: 'maa_request_operation', arguments: args });
  const decode = (result: typeof first) => JSON.parse((result.content[0] as { text: string }).text);
  expect(decode(first).operationId).toBe(decode(second).operationId);
  expect(fixture.service.context.list().sessions).toHaveLength(1);
  const changed = await client.callTool({
    name: 'maa_request_operation',
    arguments: { ...args, planId: 'another-plan' },
  });
  expect(changed.isError).toBe(true);
  expect(fixture.service.context.list().sessions).toHaveLength(1);
});

test('the exported operation reader cannot inspect an internal conversation turn', async () => {
  const remote = await remoteFixture(),
    fixture = serviceFixture();
  const { turn } = await begin(fixture, remote.url);
  await fixture.service.server.setEnabled(true);
  const connection = fixture.service.server.connectionDetails();
  const client = new Client(
    { name: 'synthetic-external-reader', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  cleanup.push(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(connection.url!), {
      authProvider: { token: async () => connection.token! },
    }),
  );
  const result = await client.callTool({
    name: 'maa_get_operation',
    arguments: { operationId: turn.id },
  });
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result)).not.toContain('stable-mcp-call');
});

test('a Skill change while the model responds prevents the returned tool call from dispatching', async () => {
  const remote = await remoteFixture(),
    fixture = serviceFixture();
  await fixture.service.handle('agent.mcp.save', {
    server: {
      id: 'durable-fixture',
      name: 'Durable synthetic fixture',
      transport: 'streamable-http',
      enabled: true,
      url: remote.url,
      enabledTools: ['confirm_fixture'],
      timeoutMs: 3000,
    },
  });
  const content =
    '---\nname: review-skill\ndescription: Before model response\n---\nInspect existing state.\n';
  const skill = fixture.service.skills.save({ content, enabled: true });
  const session = (await fixture.service.handle('agent.session.create', {
    deviceId: 'fixture-device',
    mode: 'goal',
    mcpServerIds: ['durable-fixture'],
    skillIds: [skill.id],
  })) as AgentSession;
  fixture.beforeModelReturn(() => {
    fixture.service.skills.save({
      id: skill.id,
      content: content.replace('Before model response', 'Changed before tool dispatch'),
    });
  });
  const turn = (await fixture.internal('agent.turn.start', {
    sessionId: session.id,
    message: '调用服务器',
    requestId: crypto.randomUUID(),
  })) as AgentTurn;
  await settle(fixture.service, turn.id, 'failed');
  expect(remote.state.calls).toEqual([]);
  expect(fixture.service.ledger.interactions(session.id, turn.id)).toEqual([]);
});

test('concurrent stop requests deduplicate after lookup and still approve after progress changes', async () => {
  const fixture = serviceFixture();
  let lookups = 0;
  let progress = 20;
  const stopped: string[] = [];
  let release!: () => void;
  const lookupGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  fixture.maa.getRun = async () => {
    lookups++;
    await lookupGate;
    return {
      id: 'fixture-run',
      deviceId: 'fixture-device',
      planId: 'saved-plan',
      status: 'running',
      progress,
      message: '合成进行中',
      startedAt: '2026-11-01T00:00:00.000Z',
      finishedAt: null,
    };
  };
  await fixture.service.server.setEnabled(true);
  const connection = fixture.service.server.connectionDetails();
  const client = new Client(
    { name: 'synthetic-concurrent-stopper', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  cleanup.push(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(connection.url!), {
      authProvider: { token: async () => connection.token! },
    }),
  );
  const args = {
    requestId: 'concurrent-stop-request',
    kind: 'stop',
    deviceId: 'fixture-device',
    runId: 'fixture-run',
  };
  const first = client.callTool({ name: 'maa_request_operation', arguments: args });
  const second = client.callTool({ name: 'maa_request_operation', arguments: args });
  for (let i = 0; i < 400 && lookups < 2; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  const beforeRelease = lookups;
  release();
  expect(beforeRelease).toBe(2);
  const results = await Promise.all([first, second]);
  const decode = (result: (typeof results)[number]) =>
    JSON.parse((result.content[0] as { text: string }).text);
  expect(decode(results[0]).operationId).toBe(decode(results[1]).operationId);
  expect(fixture.service.context.list().sessions).toHaveLength(1);
  expect(fixture.store.all('agent_external_request')).toHaveLength(1);
  const turn = await settle(fixture.service, decode(results[0]).operationId, 'waiting');
  expect(fixture.service.ledger.interaction(turn.pendingInteractionId!).kind).toBe('approval');
  progress = 80;
  fixture.maa.stopRun = async (id) => {
    stopped.push(id);
    return {
      id,
      deviceId: 'fixture-device',
      planId: 'saved-plan',
      status: 'stopped',
      progress,
      message: '合成停止',
      startedAt: '2026-11-01T00:00:00.000Z',
      finishedAt: '2026-11-01T00:01:00.000Z',
    };
  };
  await fixture.answer(turn.pendingInteractionId!, { decision: 'approve' });
  await settle(fixture.service, turn.id, 'completed');
  expect(stopped).toEqual(['fixture-run']);
});

test('an exported stop request can attach an existing tool job using the tool lookup fallback', async () => {
  const fixture = serviceFixture();
  fixture.maa.getRun = async () => {
    throw new Error('Synthetic run does not exist');
  };
  fixture.maa.getTool = async () => ({
    id: 'fixture-tool-job',
    deviceId: 'fixture-device',
    clientType: 'Official',
    kind: 'depot',
    status: 'running',
    progress: 0,
    message: '合成识别中',
    startedAt: '2026-11-01T00:00:00.000Z',
    finishedAt: null,
  });
  await fixture.service.server.setEnabled(true);
  const connection = fixture.service.server.connectionDetails();
  const client = new Client(
    { name: 'synthetic-tool-stopper', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  cleanup.push(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(connection.url!), {
      authProvider: { token: async () => connection.token! },
    }),
  );
  const result = await client.callTool({
    name: 'maa_request_operation',
    arguments: {
      requestId: 'tool-stop-request',
      kind: 'stop',
      deviceId: 'fixture-device',
      runId: 'fixture-tool-job',
    },
  });
  const operation = JSON.parse((result.content[0] as { text: string }).text);
  const turn = await settle(fixture.service, operation.operationId, 'waiting');
  expect(fixture.service.ledger.actions(turn.sessionId)[0].name).toBe('maa_stop_tool');
  expect(fixture.service.ledger.interaction(turn.pendingInteractionId!).kind).toBe('approval');
});

test('an explicitly empty Skill tool allowlist hides all tools and rejects a forged ask_user call', async () => {
  const fixture = serviceFixture();
  const skill = fixture.service.skills.save({
    content:
      '---\nname: no-tools\ndescription: Read and answer without tools\nallowed-tools: ""\n---\nOnly explain the existing context.\n',
    enabled: true,
  });
  const session = (await fixture.service.handle('agent.session.create', {
    deviceId: 'fixture-device',
    mode: 'goal',
    skillIds: [skill.id],
  })) as AgentSession;
  fixture.setOutput(() => [
    {
      type: 'function_call',
      name: 'ask_user',
      call_id: 'forged-question',
      arguments: JSON.stringify({
        title: 'Blocked',
        prompt: 'Must not be asked',
        inputType: 'text',
      }),
    },
  ]);
  const turn = (await fixture.internal('agent.turn.start', {
    sessionId: session.id,
    message: '解释当前状态',
    requestId: crypto.randomUUID(),
  })) as AgentTurn;
  await settle(fixture.service, turn.id, 'failed');
  expect(fixture.posted[0].tools).toEqual([]);
  expect(fixture.service.ledger.interactions(session.id, turn.id)).toEqual([]);
  expect(fixture.service.ledger.actions(session.id)).toEqual([]);
});
