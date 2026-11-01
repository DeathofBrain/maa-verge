import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createMcpHandler,
  fromJsonSchema,
  McpServer,
  type InputRequiredResult,
} from '@modelcontextprotocol/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';
import { Store } from '../src/infrastructure/storage/storage';
import { AgentSkills } from '../src/modules/agent/extensions/skills';
import {
  AgentMcpClient,
  AgentMcpInputRequired,
  mcpModelToolName,
  validateMcpInputResponses,
  type AgentMcpHost,
  type AgentMcpInputRequest,
} from '../src/modules/agent/extensions/mcp-client';
import { AgentMcpServer } from '../src/modules/agent/extensions/mcp-server';
import type { AgentMcpConfig } from '../../../packages/contracts/src/agent-types';

const cleanup: Array<() => unknown | Promise<unknown>> = [];
afterEach(async () => {
  for (const clean of cleanup.splice(0).reverse()) await clean();
});
function storeFixture() {
  const directory = makeTemporaryDirectorySync(
    path.join(os.tmpdir(), 'maaverge-agent-extensions-'),
  );
  const store = new Store(path.join(directory, 'data'));
  cleanup.push(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { store, directory };
}
const skillText = (name = 'test-skill', fields = '') =>
  `---\nname: ${name}\ndescription: A test skill\n${fields}---\nFollow the named workflow.\n`;

describe('text-only Agent skills', () => {
  test('keeps immutable versions while active permission can only shrink', () => {
    const { store } = storeFixture(),
      skills = new AgentSkills(store);
    const first = skills.save({
      content: skillText('test-skill', 'allowed-tools: maa_list_plans maa_list_devices\n'),
      enabled: true,
      references: [{ name: 'references/example.md', text: 'original' }],
    });
    expect(skills.restrictTools(['maa_start_plan', 'maa_list_plans'], [first.id])).toEqual([
      'maa_list_plans',
    ]);
    const second = skills.save({
      id: first.id,
      content: skillText('test-skill', 'allowed-tools: ""\n'),
      references: [],
    });
    expect(second.version).not.toBe(first.version);
    expect(skills.load(first.id, first.version).references[0].text).toBe('original');
    expect(skills.restrictTools(['maa_list_plans'], [first.id])).toEqual([]);
    skills.enable({ id: first.id, enabled: false });
    expect(() => skills.load(first.id, first.version)).toThrow('已禁用');
    skills.delete({ id: first.id });
    expect(store.get('agent_skill_version', `${first.id}:${first.version}`)).toBeDefined();
    expect(() => skills.load(first.id, first.version)).toThrow('不存在');
  });
  test('omitted permissions do not mistake body text for metadata', () => {
    const { store } = storeFixture(),
      skills = new AgentSkills(store);
    const skill = skills.save({
      content: `${skillText()}\nallowed-tools: maa_start_plan\n`,
      enabled: true,
    });
    expect(skills.restrictTools(['maa_list_plans'], [skill.id])).toEqual(['maa_list_plans']);
  });
  test('rejects YAML duplicate keys, aliases, invalid tool grants and reference traversal', () => {
    const { store } = storeFixture(),
      skills = new AgentSkills(store);
    expect(() => skills.save({ content: skillText('test-skill', 'name: duplicate\n') })).toThrow(
      'YAML',
    );
    expect(() =>
      skills.save({ content: skillText('test-skill', 'compatibility: &a test\nmetadata: *a\n') }),
    ).toThrow('别名');
    expect(() =>
      skills.save({ content: skillText('test-skill', 'allowed-tools: "maa_*"\n') }),
    ).toThrow('精确名称');
    expect(() =>
      skills.save({
        content: skillText(),
        references: [{ name: 'references/../secret.md', text: 'x' }],
      }),
    ).toThrow('相对文本');
    expect(() =>
      skills.save({
        content: skillText(),
        references: [
          { name: 'references/a.md', text: 'x' },
          { name: 'references/A.md', text: 'x' },
        ],
      }),
    ).toThrow('冲突');
  });
  test('directory import copies only bounded text and rejects reference symlinks', () => {
    const { store, directory } = storeFixture(),
      skills = new AgentSkills(store);
    const source = path.join(directory, 'test-skill');
    mkdirSync(path.join(source, 'references'), { recursive: true });
    mkdirSync(path.join(source, 'scripts'));
    writeFileSync(path.join(source, 'SKILL.md'), skillText());
    writeFileSync(path.join(source, 'references/context.md'), 'read this');
    writeFileSync(path.join(source, 'scripts/never-run.sh'), 'exit 9');
    const result = skills.import({ path: source });
    expect(result.enabled).toBe(false);
    expect(result.references).toEqual([{ name: 'references/context.md', text: 'read this' }]);
    expect(JSON.stringify(result)).not.toContain('never-run');
    expect(readFileSync(path.join(source, 'scripts/never-run.sh'), 'utf8')).toBe('exit 9');
    symlinkSync(path.join(source, 'SKILL.md'), path.join(source, 'references/linked.md'));
    expect(() => skills.import({ path: source })).toThrow('符号链接');
  });
});

const emptySchema = { type: 'object' as const, properties: {}, additionalProperties: false };
async function remoteFixture(hostOverrides: Partial<AgentMcpHost> = {}) {
  const { store } = storeFixture();
  const calls: string[] = [];
  const inputRequests: NonNullable<InputRequiredResult['inputRequests']> = {
    form: {
      method: 'elicitation/create',
      params: {
        mode: 'form',
        message: 'Choose a value',
        requestedSchema: {
          type: 'object',
          properties: { value: { type: 'string', enum: ['yes'] } },
          required: ['value'],
          additionalProperties: false,
        },
      },
    },
  };
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: 'synthetic-fixture', version: '1.0.0' });
      server.registerTool(
        'echo',
        {
          inputSchema: fromJsonSchema({
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          }),
        },
        async (args) => {
          calls.push('echo');
          return {
            content: [
              { type: 'text', text: String((args as { text: string }).text) },
              { type: 'image', mimeType: 'image/png', data: 'c3ludGhldGljLWJpbmFyeQ==' },
            ],
          };
        },
      );
      server.registerTool(
        'needs_input',
        { inputSchema: fromJsonSchema(emptySchema) },
        async (_args, ctx) => {
          calls.push(ctx.mcpReq.requestState() ? 'continued' : 'initial');
          if (ctx.mcpReq.requestState())
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    state: ctx.mcpReq.requestState(),
                    responses: ctx.mcpReq.inputResponses,
                  }),
                },
              ],
            };
          return {
            resultType: 'input_required',
            requestState: 'opaque-fixture-state',
            inputRequests,
          };
        },
      );
      server.registerTool(
        'run_shell',
        {
          inputSchema: fromJsonSchema({
            type: 'object',
            properties: { command: { type: 'string' } },
          }),
        },
        async () => {
          calls.push('unsafe');
          return { content: [] };
        },
      );
      server.registerTool('overwire', { inputSchema: fromJsonSchema(emptySchema) }, async () => {
        calls.push('overwire');
        return { content: [{ type: 'text', text: 'x'.repeat(2 * 1024 * 1024) }] };
      });
      server.registerTool('huge', { inputSchema: fromJsonSchema(emptySchema) }, async () => ({
        content: [{ type: 'text', text: 'x'.repeat(100000) }],
      }));
      return server;
    },
    { legacy: 'stateless', responseMode: 'json' },
  );
  let transportRequests = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) => {
      transportRequests++;
      if (request.headers.get('authorization') !== 'Bearer fixture-secret')
        return new Response('auth required', { status: 401 });
      return handler.fetch(request);
    },
  });
  cleanup.push(async () => {
    server.stop(true);
    await handler.close();
  });
  let pending: AgentMcpInputRequest | undefined;
  const persisted: unknown[] = [];
  const host: AgentMcpHost = {
    authorize: async () => true,
    execute: async (_request, dispatch) => {
      const result = await dispatch();
      persisted.push(result);
      return result;
    },
    elicitation: async (request) => {
      pending = request;
    },
    credential: async () => 'fixture-secret',
    ...hostOverrides,
  };
  const client = new AgentMcpClient(store, host);
  cleanup.push(() => client.close());
  const config: AgentMcpConfig = {
    id: 'fixture',
    name: 'Synthetic',
    transport: 'streamable-http',
    enabled: true,
    url: `${server.url.origin}/mcp`,
    credentialRef: 'fixture-ref',
    enabledTools: ['echo', 'needs_input', 'huge', 'overwire', 'run_shell'],
    timeoutMs: 3000,
  };
  client.save({ server: config });
  const invoke = (
    toolName: string,
    args: Record<string, unknown> = {},
    extra: Record<string, unknown> = {},
  ) =>
    client.invoke({
      serverId: config.id,
      toolName,
      args,
      callId: `call-${toolName}`,
      sessionId: 'session',
      turnId: 'turn',
      mode: 'goal',
      ...extra,
    });
  return {
    client,
    config,
    invoke,
    calls,
    persisted,
    inputRequests,
    pending: () => pending,
    transportRequests: () => transportRequests,
  };
}

describe('official MCP client boundaries', () => {
  test('discovers tools, sends runtime credentials and stores only text projections', async () => {
    const { client, invoke, persisted } = await remoteFixture();
    const tools = await client.tools({ id: 'fixture' });
    expect(tools.tools.map((tool) => tool.name)).toContain('echo');
    expect(tools.tools[0].modelName).toBe(mcpModelToolName('fixture', tools.tools[0].name));
    const result = await invoke('echo', { text: 'hello' });
    expect(result).toEqual({
      untrusted: true,
      isError: false,
      content: [{ type: 'text', text: 'hello' }],
    });
    expect(JSON.stringify(persisted)).not.toContain('c3ludGhldGlj');
    expect(JSON.stringify(client.list())).not.toContain('fixture-secret');
  });
  test('unavailable credential references fail closed before the first network request', async () => {
    const fixture = await remoteFixture({ credential: async () => undefined });
    expect(await fixture.client.check({ id: 'fixture' })).toEqual({
      ok: false,
      error: 'MCP 凭据引用不可用，请先配置对应的独立凭据；已阻止匿名连接',
    });
    await expect(fixture.client.tools({ id: 'fixture' })).rejects.toThrow('凭据引用不可用');
    expect(fixture.transportRequests()).toBe(0);
  });
  test('a credential revoked after connection prevents later calls and hides provider exceptions', async () => {
    let available = true;
    const fixture = await remoteFixture({
      credential: async () => {
        if (!available) throw new Error('private-provider-secret');
        return 'fixture-secret';
      },
    });
    expect((await fixture.client.check({ id: 'fixture' })).ok).toBe(true);
    const before = fixture.transportRequests();
    available = false;
    await expect(fixture.invoke('echo', { text: 'never dispatch' })).rejects.toThrow(
      '凭据引用不可用',
    );
    const status = await fixture.client.check({ id: 'fixture' });
    expect(status.ok).toBe(false);
    expect(JSON.stringify(status)).not.toContain('private-provider-secret');
    expect(fixture.transportRequests()).toBe(before);
    expect(fixture.calls).toEqual([]);
  });
  test('denies plan mode, disabled tools, invalid inputs and rejected authorization before dispatch', async () => {
    const { client, config, invoke, calls } = await remoteFixture({ authorize: async () => false });
    await expect(invoke('echo', { text: 'hi' }, { mode: 'plan' })).rejects.toThrow('计划模式');
    await expect(invoke('echo', {})).rejects.toThrow('参数');
    await expect(invoke('echo', { text: 'hi' })).rejects.toThrow('未获批准');
    client.save({ server: { ...config, enabledTools: [] } });
    await expect(invoke('echo', { text: 'hi' })).rejects.toThrow('未启用');
    expect(calls).toEqual([]);
  });
  test('a config change during approval prevents dispatch', async () => {
    let change = () => {};
    const fixture = await remoteFixture({
      authorize: async () => {
        change();
        return true;
      },
    });
    change = () => fixture.client.save({ server: { ...fixture.config, enabled: false } });
    await expect(fixture.invoke('echo', { text: 'x' })).rejects.toThrow('已变化');
    expect(fixture.calls).toEqual([]);
  });
  test('input_required pauses after one call and resumes only with opaque state plus validated replies', async () => {
    const fixture = await remoteFixture();
    await expect(fixture.invoke('needs_input')).rejects.toBeInstanceOf(AgentMcpInputRequired);
    expect(fixture.calls).toEqual(['initial']);
    expect(fixture.pending()?.resumable).toBe(true);
    const inputResponses = validateMcpInputResponses(fixture.inputRequests, {
      form: { action: 'accept', content: { value: 'yes' } },
    });
    const result = await fixture.invoke(
      'needs_input',
      {},
      { continuation: { requestState: fixture.pending()!.requestState!, inputResponses } },
    );
    expect(fixture.calls).toEqual(['initial', 'continued']);
    expect(JSON.stringify(result)).toContain('opaque-fixture-state');
  });
  test('caps projected results before the host persists them', async () => {
    const { invoke, persisted } = await remoteFixture();
    const result = (await invoke('huge')) as { truncated: boolean };
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(persisted))).toBeLessThan(64 * 1024);
  });
  test('bounds HTTP wire data and never retries an oversized tool response', async () => {
    const { invoke, calls } = await remoteFixture();
    await expect(invoke('overwire')).rejects.toThrow();
    expect(calls).toEqual(['overwire']);
  });
  test('does not expose arbitrary shell interfaces even when listed in configuration', async () => {
    const { client, invoke, calls } = await remoteFixture();
    const catalog = await client.tools({ id: 'fixture' });
    expect(catalog.tools.find((tool) => tool.name === 'run_shell')?.enabled).toBe(false);
    await expect(invoke('run_shell', { command: 'never execute' })).rejects.toThrow('任意 shell');
    expect(calls).toEqual([]);
  });
  test('stdio uses the selected executable with an isolated environment and protocol-only stdout', async () => {
    const { store } = storeFixture();
    const previous = process.env.MAAVERGE_SHOULD_NOT_INHERIT;
    process.env.MAAVERGE_SHOULD_NOT_INHERIT = 'synthetic-private-value';
    cleanup.push(() => {
      if (previous === undefined) delete process.env.MAAVERGE_SHOULD_NOT_INHERIT;
      else process.env.MAAVERGE_SHOULD_NOT_INHERIT = previous;
    });
    const client = new AgentMcpClient(store, {
      authorize: async () => true,
      execute: async (_request, dispatch) => dispatch(),
      elicitation: async () => {},
    });
    cleanup.push(() => client.close());
    client.save({
      server: {
        id: 'stdio',
        name: 'Synthetic stdio',
        transport: 'stdio',
        enabled: true,
        command: process.execPath,
        args: [path.join(import.meta.dir, 'fixtures/agent-mcp.ts')],
        env: { MCP_FIXTURE_LABEL: 'explicit' },
        enabledTools: ['fixture_env'],
        timeoutMs: 3000,
      },
    });
    expect(await client.check({ id: 'stdio' })).toEqual({ ok: true, toolCount: 1 });
    const result = await client.invoke({
      serverId: 'stdio',
      toolName: 'fixture_env',
      args: {},
      callId: 'stdio-call',
      sessionId: 'session',
      turnId: 'turn',
      mode: 'goal',
    });
    expect(JSON.stringify(result)).toContain('explicit');
    expect(JSON.stringify(result)).toContain('absent');
    expect(JSON.stringify(result)).not.toContain('synthetic-private-value');
  });
  test('validates form actions and rejects unsupported input requests', () => {
    const requests = {
      x: {
        method: 'elicitation/create',
        params: {
          requestedSchema: {
            type: 'object',
            properties: { count: { type: 'integer', minimum: 1 } },
            required: ['count'],
          },
        },
      },
    };
    expect(() =>
      validateMcpInputResponses(requests, { x: { action: 'accept', content: { count: 0 } } }),
    ).toThrow('表单');
    expect(() => validateMcpInputResponses(requests, { other: { action: 'cancel' } })).toThrow(
      '对应',
    );
    expect(() =>
      validateMcpInputResponses(
        { x: { method: 'sampling/createMessage' } },
        { x: { action: 'cancel' } },
      ),
    ).toThrow('elicitation');
    expect(validateMcpInputResponses(requests, { x: { action: 'cancel' } })).toEqual({
      x: { action: 'cancel' },
    });
  });
});

describe('optional loopback MCP server', () => {
  test('is disabled by default; token and origin gate fixed read and request ports', async () => {
    const operations: unknown[] = [];
    const server = new AgentMcpServer({
      status: () => ({ healthy: true }),
      listPlans: () => [{ id: 'plan' }],
      getOperation: (id) => ({ id, status: 'awaiting_approval' }),
      requestOperation: (input) => {
        operations.push(input);
        return { operationId: 'operation', status: 'awaiting_approval' };
      },
    });
    cleanup.push(() => server.close());
    expect(server.status()).toEqual({ enabled: false, tokenConfigured: false });
    const publicStatus = await server.setEnabled(true),
      details = server.connectionDetails();
    expect(publicStatus.token).toBeUndefined();
    expect(details.token).toBeDefined();
    const unauthorized = await fetch(details.url!, { method: 'POST' });
    expect(unauthorized.status).toBe(401);
    const foreign = await fetch(details.url!, {
      method: 'POST',
      headers: { Authorization: `Bearer ${details.token}`, Origin: 'https://foreign.invalid' },
    });
    expect(foreign.status).toBe(403);
    const client = new Client(
      { name: 'synthetic-consumer', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    );
    cleanup.push(() => client.close());
    await client.connect(
      new StreamableHTTPClientTransport(new URL(details.url!), {
        authProvider: { token: async () => details.token! },
      }),
    );
    const tools = await client.listTools();
    expect(tools.tools.map(({ name }) => name).sort()).toEqual([
      'maa_get_operation',
      'maa_list_plans',
      'maa_request_operation',
      'maa_status',
    ]);
    await client.callTool({
      name: 'maa_request_operation',
      arguments: {
        requestId: 'stable-operation-request',
        kind: 'plan',
        deviceId: 'device',
        planId: 'plan',
      },
    });
    expect(operations).toEqual([
      { requestId: 'stable-operation-request', kind: 'plan', deviceId: 'device', planId: 'plan' },
    ]);
    await server.setEnabled(false);
    expect(server.connectionDetails()).toEqual({ enabled: false, tokenConfigured: false });
  });
});
