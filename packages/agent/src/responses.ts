/** Responses wire items are retained verbatim, including opaque reasoning data.
 * Never turn them into Chat Completions messages or use previous_response_id. */
export type ResponseItem = Record<string, unknown>;
export type ResponseTool = { name: string; description: string; schema: Record<string, unknown> };
export type ResponseUsage = {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  incomplete: boolean;
  cachedInputTokens: number;
  reasoningTokens: number;
};
export const emptyUsage = (): ResponseUsage => ({
  modelCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  incomplete: false,
  cachedInputTokens: 0,
  reasoningTokens: 0,
});
export class ResponsesError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ResponsesError';
  }
}
const object = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function serializable(value: unknown, depth = 0): void {
  if (depth > 64) throw new ResponsesError('serialization', '模型上下文嵌套超过上限');
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return;
  if (Array.isArray(value)) {
    value.forEach((child) => serializable(child, depth + 1));
    return;
  }
  if (
    object(value) &&
    [null, Object.prototype].includes(Object.getPrototypeOf(value)) &&
    !Object.getOwnPropertySymbols(value).length
  ) {
    Object.values(value).forEach((child) => serializable(child, depth + 1));
    return;
  }
  throw new ResponsesError('serialization', '模型上下文包含不能完整保存的值');
}
export function responsesEndpoint(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ResponsesError('configuration', '模型 API 地址无效');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ResponsesError('configuration', '模型地址须为不含凭据、查询或片段的 HTTP(S) 地址');
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/responses$/, '') + '/responses';
  return url.toString();
}
export function responseText(items: ResponseItem[]): string {
  return items
    .filter((item) => item.type === 'message')
    .flatMap((item) =>
      Array.isArray(item.content)
        ? item.content
            .filter((part) => object(part) && ['output_text', 'refusal'].includes(part.type))
            .map((part) => String(part.text ?? part.refusal ?? ''))
        : [],
    )
    .join('\n');
}
export function responseCalls(items: ResponseItem[]) {
  return items
    .filter((item) => item.type === 'function_call')
    .map((item) => {
      if (
        typeof item.call_id !== 'string' ||
        !item.call_id ||
        typeof item.name !== 'string' ||
        typeof item.arguments !== 'string'
      )
        throw new ResponsesError('invalid_output', 'Responses 函数调用缺少稳定 ID 或参数');
      let input: unknown;
      try {
        input = JSON.parse(item.arguments);
      } catch {
        throw new ResponsesError('invalid_output', '模型工具参数不是有效 JSON');
      }
      return { id: item.call_id, name: item.name, input };
    });
}

/** No SDK retries, telemetry, raw provider errors, or persisted client configuration. */
export async function callResponses(options: {
  baseUrl: string;
  model: string;
  credential: string;
  input: ResponseItem[];
  instructions: string;
  tools: ResponseTool[];
  signal: AbortSignal;
  fetcher?: typeof fetch;
  maxOutputTokens?: number;
  onAttempt?: () => void;
}): Promise<{ output: ResponseItem[]; usage: ResponseUsage }> {
  const endpoint = responsesEndpoint(options.baseUrl);
  if (!options.model.trim() || !options.credential)
    throw new ResponsesError('configuration', '请先设置模型名称及 API 密钥');
  const input = structuredClone(options.input);
  serializable(input);
  // Local round-trip checks also reject undefined, NaN and provider extensions
  // that our JSON persistence cannot faithfully retain.
  const encoded = JSON.stringify(input);
  if (JSON.stringify(JSON.parse(encoded)) !== encoded)
    throw new ResponsesError('serialization', '模型上下文无法完整序列化');
  options.signal.throwIfAborted();
  options.onAttempt?.();
  try {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: options.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.credential}`,
      },
      body: JSON.stringify({
        model: options.model,
        store: false,
        input: JSON.parse(encoded),
        instructions: options.instructions,
        include: ['reasoning.encrypted_content'],
        max_output_tokens: options.maxOutputTokens ?? 8192,
        tools: options.tools.map((tool) => ({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.schema,
          strict: false,
        })),
        parallel_tool_calls: false,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ResponsesError(
        `http_${response.status}`,
        `Responses 请求失败（HTTP ${response.status}）；请核对服务兼容性、地址、模型与密钥`,
      );
    }
    if (!response.body) throw new ResponsesError('invalid_output', 'Responses 服务返回空响应');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new ResponsesError('output_limit', '模型响应超过本机接收上限');
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new ResponsesError(
        'invalid_output',
        '服务未返回有效 Responses JSON；不支持自动切换其他接口',
      );
    }
    if (
      !object(data) ||
      !Array.isArray(data.output) ||
      data.output.some((item: unknown) => !object(item))
    )
      throw new ResponsesError('invalid_output', '服务不兼容 Responses 输出项格式');
    if (data.status && data.status !== 'completed')
      throw new ResponsesError(
        'incomplete_output',
        'Responses 输出未完成；本轮已停止，请检查输出上限或服务状态',
      );
    responseCalls(data.output);
    serializable(data.output);
    if (JSON.stringify(data.output).includes(options.credential))
      throw new ResponsesError('credential_output', '模型服务返回了敏感凭据，已阻止保存本轮输出');
    const usage = emptyUsage();
    usage.modelCalls = 1;
    const raw = data.usage;
    const count = (value: unknown) =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    usage.incomplete =
      !object(raw) ||
      !['input_tokens', 'output_tokens', 'total_tokens'].every((key) => count(raw[key]));
    if (object(raw)) {
      usage.inputTokens = count(raw.input_tokens) ? raw.input_tokens : 0;
      usage.outputTokens = count(raw.output_tokens) ? raw.output_tokens : 0;
      usage.totalTokens = count(raw.total_tokens) ? raw.total_tokens : 0;
      usage.cachedInputTokens = count(raw.input_tokens_details?.cached_tokens)
        ? raw.input_tokens_details.cached_tokens
        : 0;
      usage.reasoningTokens = count(raw.output_tokens_details?.reasoning_tokens)
        ? raw.output_tokens_details.reasoning_tokens
        : 0;
    }
    return { output: structuredClone(data.output), usage };
  } catch (error) {
    if (error instanceof ResponsesError) throw error;
    if (options.signal.aborted)
      throw new ResponsesError('cancelled', '模型请求已取消或超时；未自动重试');
    throw new ResponsesError('transport', 'Responses 连接失败；未自动重试，请检查模型服务');
  }
}
