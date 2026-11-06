import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  Client,
  StreamableHTTPClientTransport,
  isInputRequiredResult,
  type Tool,
} from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/client/validators/cf-worker';
import type { AgentJsonObject, AgentMcpConfig } from '@contracts/agent-types';
import { validateAgentMcpConfig } from '@contracts/validators.js';
import type { Store } from '@backend/infrastructure/storage/storage';
import { RpcError } from '@backend/shared/errors';

export interface AgentMcpContinuation {
  requestState: string;
  inputResponses: Record<string, unknown>;
}
export interface AgentMcpInvocation {
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
  callId: string;
  sessionId: string;
  turnId: string;
  mode: 'goal' | 'plan';
  /** Host-only durable continuation. Never supplied by the model. */
  continuation?: AgentMcpContinuation;
}
export interface AgentMcpAuthorization extends AgentMcpInvocation {
  configHash: string;
  definitionHash: string;
  serverName: string;
}
export interface AgentMcpInputRequest {
  invocation: AgentMcpAuthorization;
  inputRequests: Record<string, unknown>;
  requestState?: string;
  resumable: boolean;
}
export interface AgentMcpHost {
  authorize(request: AgentMcpAuthorization, signal?: AbortSignal): Promise<boolean>;
  /** The application ledger records dispatch/unknown outcomes and deduplicates callId. */
  execute(request: AgentMcpAuthorization, dispatch: () => Promise<unknown>): Promise<unknown>;
  /** Persist the input request and throw the application's durable wait signal. */
  elicitation(request: AgentMcpInputRequest, signal?: AbortSignal): Promise<unknown>;
  credential?(ref: string): Promise<string | undefined>;
}
export class AgentMcpInputRequired extends Error {
  constructor(readonly request: AgentMcpInputRequest) {
    super('外部工具等待用户输入');
  }
}
export interface AgentMcpTool {
  serverId: string;
  name: string;
  modelName: string;
  description: string;
  inputSchema: AgentJsonObject;
  enabled: boolean;
}
const validator = new CfWorkerJsonSchemaValidator();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid = (message: string): never => {
  throw new RpcError(-32602, message);
};
const MAX_SCHEMA_BYTES = 64 * 1024;
const MAX_ARGUMENT_BYTES = 128 * 1024;
const MAX_RESULT_BYTES = 64 * 1024;
const MAX_WIRE_BYTES = 1024 * 1024;
const loopback = new Set(['127.0.0.1', '[::1]']);
const blockedCommands =
  /^(?:npx|pnpx|bunx|sh|bash|zsh|fish|cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh(?:\.exe)?)$/iu;

async function boundedMcpFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (Number(response.headers.get('content-length')) > MAX_WIRE_BYTES) {
    await response.body?.cancel();
    throw new RpcError(-32012, 'MCP 传输响应超过 1 MiB');
  }
  if (!response.body) return response;
  let received = 0;
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > MAX_WIRE_BYTES)
          controller.error(new RpcError(-32012, 'MCP 传输响应超过 1 MiB'));
        else controller.enqueue(chunk);
      },
    }),
  );
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** Exact model-visible names cannot collide with built-in tools or other server namespaces. */
export function mcpModelToolName(serverId: string, toolName: string): string {
  return `mcp_${hash(serverId).slice(0, 16)}_${hash(toolName).slice(0, 24)}`;
}
function arbitraryExecutionTool(tool: Tool): boolean {
  const normalized = tool.name
    .replace(/([a-z])([A-Z])/gu, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/gu, '_')
    .toLowerCase();
  if (
    /(?:^|_)(?:shell|terminal|exec|bash|powershell|cmd|python|javascript|run_code|execute_command|eval)(?:_|$)/u.test(
      normalized,
    )
  )
    return true;
  const walk = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    for (const [key, child] of Object.entries(value)) {
      if (
        key === 'properties' &&
        child &&
        typeof child === 'object' &&
        Object.keys(child).some((name) =>
          ['command', 'commandline', 'shell', 'script', 'javascript', 'python'].includes(
            name.replace(/[_-]/gu, '').toLowerCase(),
          ),
        )
      )
        return true;
      if (walk(child)) return true;
    }
    return false;
  };
  return walk(tool.inputSchema);
}

function checkSchema(schema: Tool['inputSchema']) {
  if (Buffer.byteLength(JSON.stringify(schema)) > MAX_SCHEMA_BYTES)
    invalid('MCP 工具参数结构超过 64 KiB');
  const walk = (value: unknown, depth: number) => {
    if (depth > 30) invalid('MCP 工具参数结构嵌套过深');
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref' && (typeof child !== 'string' || !child.startsWith('#')))
        invalid('MCP 参数结构不支持外部引用');
      walk(child, depth + 1);
    }
  };
  walk(schema, 0);
  try {
    return validator.getValidator(schema as Parameters<typeof validator.getValidator>[0]);
  } catch {
    return invalid('MCP 工具参数结构无效或不支持');
  }
}
function checkCatalog(tools: Tool[]) {
  if (tools.length > 100) invalid('MCP 服务工具超过 100 项');
  const names = new Set<string>();
  for (const tool of tools) {
    if (tool.name.length > 200 || names.has(tool.name)) invalid('MCP 服务工具名称无效或重复');
    names.add(tool.name);
    checkSchema(tool.inputSchema);
    if (tool.outputSchema) checkSchema(tool.outputSchema as Tool['inputSchema']);
  }
  return tools;
}
/** Validate human supplied protocol replies before echoing any opaque server state. */
export function validateMcpInputResponses(
  requests: Record<string, unknown>,
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Buffer.byteLength(JSON.stringify(value)) > MAX_ARGUMENT_BYTES
  )
    return invalid('MCP 回答必须是有界 JSON 对象');
  const responses = value as Record<string, unknown>;
  if (
    Object.keys(responses).length !== Object.keys(requests).length ||
    Object.keys(responses).some((key) => !Object.hasOwn(requests, key))
  )
    return invalid('MCP 回答必须逐项对应当前 inputRequests');
  for (const [key, raw] of Object.entries(requests)) {
    const request = raw as {
      method?: string;
      params?: { mode?: string; requestedSchema?: Tool['inputSchema']; url?: string };
    };
    const response = responses[key];
    if (
      !request ||
      request.method !== 'elicitation/create' ||
      !request.params ||
      !response ||
      typeof response !== 'object' ||
      Array.isArray(response)
    )
      return invalid('MCP 仅支持 elicitation 回答');
    const answer = response as Record<string, unknown>;
    if (
      !['accept', 'decline', 'cancel'].includes(String(answer.action)) ||
      Object.keys(answer).some((name) => !['action', 'content'].includes(name))
    )
      return invalid('MCP 回答 action 无效');
    if (answer.action !== 'accept') {
      if (answer.content !== undefined) return invalid('取消或拒绝不能附带回答内容');
    } else if (request.params.mode === 'url') {
      if (answer.content !== undefined) return invalid('URL elicitation 不能附带表单内容');
    } else {
      if (
        !request.params.requestedSchema ||
        !checkSchema(request.params.requestedSchema)(answer.content).valid
      )
        return invalid('MCP 回答内容不符合当前表单结构');
    }
  }
  return structuredClone(responses);
}
/** 仅把有界文本与结构化结果交给模型，并显式标为不可信，舍弃图像等其他内容块。 */
function projectResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return { untrusted: true, value: result };
  const value = result as {
    isError?: boolean;
    content?: Array<{ type?: string; text?: unknown }>;
    structuredContent?: unknown;
  };
  const projected: Record<string, unknown> = {
    untrusted: true,
    isError: !!value.isError,
    content: (value.content ?? [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => ({ type: 'text', text: block.text })),
  };
  if (value.structuredContent !== undefined) projected.structuredContent = value.structuredContent;
  const serialized = JSON.stringify(projected);
  if (Buffer.byteLength(serialized) > MAX_RESULT_BYTES)
    return { truncated: true, untrusted: true, text: serialized.slice(0, 16 * 1024) };
  return projected;
}

function configCheck(config: AgentMcpConfig): AgentMcpConfig {
  if (!validateAgentMcpConfig(config)) invalid('MCP 配置不符合契约');
  if (config.transport === 'stdio') {
    if (
      !config.command ||
      !path.isAbsolute(config.command) ||
      blockedCommands.test(path.basename(config.command))
    )
      invalid('MCP stdio 需要可信服务器可执行文件的绝对路径；不支持 shell 或包安装器');
    if (config.url || config.credentialRef) invalid('stdio 不能设置 HTTP 地址或 bearer 凭据');
    if (
      Object.keys(config.env ?? {}).some((key) =>
        /(?:TOKEN|SECRET|PASSWORD|API_KEY|AUTH)/iu.test(key),
      )
    )
      invalid('请勿把秘密保存在 MCP 环境配置中');
  } else {
    let url: URL;
    try {
      url = new URL(config.url ?? '');
    } catch {
      return invalid('MCP HTTP 地址无效');
    }
    if (
      url.username ||
      url.password ||
      url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback.has(url.hostname)))
    )
      invalid('MCP 远程地址需要 HTTPS；HTTP 只允许本机回环地址且不能包含凭据');
    if (config.command || config.args?.length || Object.keys(config.env ?? {}).length)
      invalid('HTTP MCP 不能设置进程参数');
  }
  return structuredClone(config);
}

/** 管理外部 MCP 连接与工具发现；保存配置不会启动进程，调用前仍须宿主审批和账本去重。 */
export class AgentMcpClient {
  private closing = false;
  private readonly connections = new Map<
    string,
    { fingerprint: string; client: Client; tools: Tool[] }
  >();
  private readonly connecting = new Map<
    string,
    Promise<{ fingerprint: string; client: Client; tools: Tool[] }>
  >();
  constructor(
    private readonly store: Store,
    private readonly host: AgentMcpHost,
  ) {}
  list(): { servers: AgentMcpConfig[] } {
    return { servers: this.store.all<AgentMcpConfig>('agent_mcp') };
  }
  save({ server }: { server: AgentMcpConfig }): AgentMcpConfig {
    const config = configCheck(server);
    if (!this.store.get('agent_mcp', config.id) && this.list().servers.length >= 50)
      invalid('最多保存 50 个 MCP 服务');
    this.store.put('agent_mcp', config.id, config);
    void this.disconnect(config.id);
    return config;
  }
  delete({ id }: { id: string }): { deleted: boolean } {
    const exists = !!this.store.get('agent_mcp', id);
    this.store.delete('agent_mcp', id);
    void this.disconnect(id);
    return { deleted: exists };
  }
  private config(id: string) {
    return this.store.get<AgentMcpConfig | undefined>('agent_mcp', id) ?? invalid('MCP 服务不存在');
  }
  async check({ id }: { id: string }, signal?: AbortSignal) {
    try {
      const connection = await this.connect(id, signal);
      return { ok: true, toolCount: connection.tools.length };
    } catch (error) {
      if (error instanceof RpcError && error.code === -32013)
        return { ok: false, error: error.message };
      return { ok: false, error: 'MCP 连接或工具发现失败，请检查服务地址、凭据和进程配置' };
    }
  }
  async tools({ id }: { id: string }, signal?: AbortSignal): Promise<{ tools: AgentMcpTool[] }> {
    const config = this.config(id),
      connection = await this.connect(id, signal);
    return {
      tools: connection.tools.map((tool) => ({
        serverId: id,
        name: tool.name,
        modelName: mcpModelToolName(id, tool.name),
        description: (tool.description ?? '').slice(0, 4000),
        inputSchema: structuredClone(tool.inputSchema) as AgentJsonObject,
        enabled:
          config.enabled &&
          config.enabledTools.includes(tool.name) &&
          !arbitraryExecutionTool(tool),
      })),
    };
  }
  async invoke(input: AgentMcpInvocation, signal?: AbortSignal): Promise<unknown> {
    if (input.mode !== 'goal') throw new RpcError(-32010, '计划模式不调用外部 MCP 工具');
    if (Buffer.byteLength(JSON.stringify(input.args)) > MAX_ARGUMENT_BYTES)
      invalid('MCP 工具参数超过 128 KiB');
    const config = this.config(input.serverId);
    if (!config.enabled || !config.enabledTools.includes(input.toolName))
      throw new RpcError(-32011, 'MCP 服务或工具未启用');
    const connection = await this.connect(input.serverId, signal);
    // 每次调用刷新工具声明，审批指纹同时覆盖配置和声明，避免沿用旧目录中的权限判断。
    const catalog = await connection.client.listTools(undefined, {
      signal,
      timeout: config.timeoutMs,
      cacheMode: 'refresh',
    });
    connection.tools = checkCatalog(catalog.tools);
    const tool = connection.tools.find((tool) => tool.name === input.toolName);
    if (!tool) invalid('MCP 工具不存在');
    if (arbitraryExecutionTool(tool!))
      throw new RpcError(-32010, '本版不向模型开放任意 shell 或代码执行 MCP 工具');
    const validate = checkSchema(tool!.inputSchema);
    try {
      if (!validate(input.args).valid) invalid('MCP 工具参数不符合服务声明');
    } catch (error) {
      if (error instanceof RpcError) throw error;
      invalid('MCP 工具参数验证失败');
    }
    const request: AgentMcpAuthorization = {
      ...structuredClone(input),
      configHash: hash(config),
      definitionHash: hash(tool),
      serverName: config.name,
    };
    if (!(await this.host.authorize(request, signal)))
      throw new RpcError(-32010, '外部 MCP 工具调用未获批准');
    signal?.throwIfAborted();
    if (hash(this.config(config.id)) !== request.configHash)
      throw new RpcError(-32011, 'MCP 配置已变化，请重新审阅');
    if (
      input.continuation &&
      (!input.continuation.requestState ||
        Object.keys(input.continuation.inputResponses).length > 20)
    )
      invalid('MCP continuation 无效，不能重放原操作');
    const result = await this.host.execute(request, async () => {
      // 使用单次协议请求，绕过 callTool() 对 HEADER_MISMATCH 的自动重放，防止副作用重复。
      const params = { name: input.toolName, arguments: input.args, ...input.continuation };
      const result = await connection.client.request(
        { method: 'tools/call', params },
        {
          signal,
          timeout: config.timeoutMs,
          maxTotalTimeout: config.timeoutMs,
          allowInputRequired: true,
        },
      );
      if (isInputRequiredResult(result)) {
        const requests = result.inputRequests ?? {};
        if (
          Object.keys(requests).length > 20 ||
          Buffer.byteLength(JSON.stringify(result)) > MAX_RESULT_BYTES
        )
          throw new RpcError(-32012, 'MCP 询问内容超过限制');
        for (const value of Object.values(requests)) {
          if (
            !value ||
            typeof value !== 'object' ||
            (value as { method?: string }).method !== 'elicitation/create'
          )
            throw new RpcError(-32012, 'MCP 请求了未开放的 sampling、roots 或其他输入类型');
        }
        const pending: AgentMcpInputRequest = {
          invocation: request,
          inputRequests: requests,
          requestState: result.requestState,
          resumable: !!result.requestState,
        };
        await this.host.elicitation(pending, signal);
        throw new AgentMcpInputRequired(pending);
      }
      if (tool!.outputSchema && !result.isError) {
        try {
          if (!validator.getValidator(tool!.outputSchema)(result.structuredContent).valid)
            throw new Error();
        } catch {
          throw new RpcError(-32012, 'MCP 工具响应不符合声明');
        }
      }
      return projectResult(result);
    });
    return result;
  }

  private async connect(id: string, signal?: AbortSignal) {
    if (this.closing) throw new RpcError(-32011, 'MCP 客户端已关闭');
    const config = this.config(id),
      fingerprint = hash(config);
    if (config.credentialRef) await this.requireCredential(config.credentialRef);
    const existing = this.connections.get(id);
    if (existing?.fingerprint === fingerprint) return existing;
    const pending = this.connecting.get(id);
    if (pending) {
      const result = await pending;
      if (result.fingerprint === fingerprint) return result;
    }
    const work = this.open(config, fingerprint, signal);
    this.connecting.set(id, work);
    try {
      return await work;
    } finally {
      if (this.connecting.get(id) === work) this.connecting.delete(id);
    }
  }
  private async open(config: AgentMcpConfig, fingerprint: string, signal?: AbortSignal) {
    await this.disconnect(config.id);
    const client = new Client(
      { name: 'maa-verge', version: '0.1.3' },
      {
        capabilities: { elicitation: { form: {}, url: {} } },
        versionNegotiation: { mode: 'auto' },
        inputRequired: { autoFulfill: false },
        listMaxPages: 4,
      },
    );
    // 旧式交互没有持久恢复状态，直接返回取消；不得自动重试原工具来补交答案。
    client.setRequestHandler('elicitation/create', async () => ({ action: 'cancel' }));
    const transport =
      config.transport === 'stdio'
        ? new StdioClientTransport({
            command: config.command!,
            args: config.args,
            env: { ...getDefaultEnvironment(), ...config.env },
            stderr: 'ignore',
            maxBufferSize: 1024 * 1024,
          })
        : new StreamableHTTPClientTransport(new URL(config.url!), {
            fetch: boundedMcpFetch,
            authProvider: config.credentialRef
              ? {
                  token: () => this.requireCredential(config.credentialRef!),
                }
              : undefined,
            requestInit: { redirect: 'error' },
            reconnectionOptions: {
              maxRetries: 0,
              initialReconnectionDelay: 1000,
              maxReconnectionDelay: 1000,
              reconnectionDelayGrowFactor: 1,
            },
          });
    try {
      await client.connect(transport, {
        signal,
        timeout: config.timeoutMs,
        maxTotalTimeout: config.timeoutMs,
      });
      const { tools } = await client.listTools(undefined, {
        signal,
        timeout: config.timeoutMs,
        cacheMode: 'refresh',
      });
      checkCatalog(tools);
      if (this.closing || hash(this.config(config.id)) !== fingerprint)
        throw new RpcError(-32011, 'MCP 配置在连接期间已变化');
      const result = { fingerprint, client, tools };
      this.connections.set(config.id, result);
      return result;
    } catch (error) {
      await client.close().catch(() => {});
      throw error;
    }
  }
  private async disconnect(id: string) {
    const connection = this.connections.get(id);
    this.connections.delete(id);
    await connection?.client.close().catch(() => {});
  }
  private async requireCredential(ref: string): Promise<string> {
    let value: string | undefined;
    try {
      value = await this.host.credential?.(ref);
    } catch {
      // A provider's exception may contain secrets; only expose the local diagnosis.
    }
    if (!value || value.length > 16384 || /\s/u.test(value))
      throw new RpcError(-32013, 'MCP 凭据引用不可用，请先配置对应的独立凭据；已阻止匿名连接');
    return value;
  }
  async close() {
    this.closing = true;
    await Promise.allSettled([...this.connecting.values()]);
    await Promise.allSettled([...this.connections.keys()].map((id) => this.disconnect(id)));
  }
}
