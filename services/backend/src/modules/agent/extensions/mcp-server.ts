import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createMcpHandler,
  fromJsonSchema,
  McpServer,
  type JsonSchemaType,
} from '@modelcontextprotocol/server';
import type { AgentMcpOperationRequest, AgentMcpServerResult } from '@contracts/agent-types';
import { validateAgentMcpOperationRequest } from '@contracts/validators.js';
import agentSchema from '../../../../../../packages/contracts/schemas/agent.schema.json';

export type { AgentMcpOperationRequest } from '@contracts/agent-types';
export interface AgentMcpServerHost {
  /** Return only deliberate public fields; never credentials, tokens or hidden memory. */
  status(): unknown | Promise<unknown>;
  listPlans(): unknown | Promise<unknown>;
  getOperation(id: string): unknown | Promise<unknown>;
  /** Queue a durable application approval. Never execute the action in this callback. */
  requestOperation(
    input: AgentMcpOperationRequest,
  ): { operationId: string; status?: string } | Promise<{ operationId: string; status?: string }>;
}
const noArguments = { type: 'object' as const, properties: {}, additionalProperties: false };
const operationSchema = agentSchema.$defs.AgentMcpOperationRequest as unknown as JsonSchemaType;

/** 可选的本机回环 MCP 入口；从关闭状态启用时生成临时令牌，外部操作仍交由应用内审批。 */
export class AgentMcpServer {
  private http?: ReturnType<typeof Bun.serve>;
  private handler?: ReturnType<typeof createMcpHandler>;
  private token?: string;
  constructor(private readonly host: AgentMcpServerHost) {}
  status(): AgentMcpServerResult {
    return {
      enabled: !!this.http,
      ...(this.http ? { url: `${this.http.url.origin}/mcp` } : {}),
      tokenConfigured: !!this.token,
    };
  }
  /** Trusted settings/UI only. Do not put this result in Agent tools, events or logs. */
  connectionDetails(): AgentMcpServerResult {
    return { ...this.status(), ...(this.token ? { token: this.token } : {}) };
  }
  async setEnabled(enabled: boolean): Promise<AgentMcpServerResult> {
    if (!enabled) {
      await this.close();
      return this.status();
    }
    if (this.http) return this.status();
    this.token = randomBytes(32).toString('base64url');
    const wrap = async (callback: () => unknown | Promise<unknown>) => {
      try {
        const result = await callback();
        const text = JSON.stringify(result ?? null);
        if (Buffer.byteLength(text) > 64 * 1024)
          return {
            isError: true,
            content: [{ type: 'text' as const, text: '响应超过本地 MCP 大小限制，请缩小请求范围' }],
          };
        return { content: [{ type: 'text' as const, text }] };
      } catch {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '请求失败，请在 Maa Verge 中查看操作状态' }],
        };
      }
    };
    const handler = createMcpHandler(
      () => {
        const server = new McpServer({ name: 'maa-verge', version: '0.1.3' });
        server.registerTool(
          'maa_status',
          {
            description: '读取 Maa Verge 当前运行状态。',
            inputSchema: fromJsonSchema(noArguments),
            annotations: { readOnlyHint: true },
          },
          async () => wrap(() => this.host.status()),
        );
        server.registerTool(
          'maa_list_plans',
          {
            description: '读取可请求执行的计划摘要。',
            inputSchema: fromJsonSchema(noArguments),
            annotations: { readOnlyHint: true },
          },
          async () => wrap(() => this.host.listPlans()),
        );
        server.registerTool(
          'maa_get_operation',
          {
            description: '查询已提交请求的审批或执行状态。',
            inputSchema: fromJsonSchema({
              type: 'object',
              properties: { operationId: { type: 'string', minLength: 1, maxLength: 160 } },
              required: ['operationId'],
              additionalProperties: false,
            }),
            annotations: { readOnlyHint: true },
          },
          async (args) =>
            wrap(() =>
              this.host.getOperation(String((args as { operationId: string }).operationId)),
            ),
        );
        server.registerTool(
          'maa_request_operation',
          {
            description:
              '请求执行已有计划、单项工具、已配置作业或停止运行，返回 operationId。必须由用户在 Maa Verge 内审批；本调用不会直接操作设备。',
            inputSchema: fromJsonSchema<AgentMcpOperationRequest>(operationSchema),
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
          },
          async (args) =>
            wrap(() => {
              if (!validateAgentMcpOperationRequest(args)) throw new Error('操作请求不符合契约');
              return this.host.requestOperation(args);
            }),
        );
        return server;
      },
      {
        legacy: 'stateless',
        responseMode: 'json',
        maxRequestBodySize: 128 * 1024,
        maxSubscriptions: 0,
      },
    );
    this.handler = handler;
    try {
      this.http = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        maxRequestBodySize: 128 * 1024,
        fetch: async (request) => {
          const expected = this.http?.url;
          const url = new URL(request.url);
          if (
            !expected ||
            request.headers.get('host') !== expected.host ||
            url.pathname !== '/mcp' ||
            url.search
          )
            return new Response('Not found', { status: 404 });
          // 回环监听之外还核对 Host、路径和 Origin；令牌认证不能替代这些请求来源限制。
          const origin = request.headers.get('origin');
          if (origin && origin !== expected.origin)
            return new Response('Forbidden origin', { status: 403 });
          const value = request.headers.get('authorization') ?? '';
          const actual = Buffer.from(value),
            desired = Buffer.from(`Bearer ${this.token ?? ''}`);
          if (actual.length !== desired.length || !timingSafeEqual(actual, desired))
            return new Response('Unauthorized', {
              status: 401,
              headers: { 'WWW-Authenticate': 'Bearer' },
            });
          if (request.method !== 'POST')
            return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
          return handler.fetch(request);
        },
      });
    } catch (error) {
      this.token = undefined;
      this.handler = undefined;
      await handler.close();
      throw error;
    }
    return this.status();
  }
  async close() {
    const http = this.http,
      handler = this.handler;
    this.http = undefined;
    this.handler = undefined;
    this.token = undefined;
    http?.stop(true);
    await handler?.close();
  }
}
