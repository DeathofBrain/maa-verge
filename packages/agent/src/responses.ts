import { ResponseEventStream } from './responses-sse';

/** 原样保留 Responses 输出项及不透明推理数据，以完整输入续接。
 * 不转成 Chat Completions 消息，也不使用 previous_response_id。 */
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
function completedItem(item: ResponseItem): void {
  if (item.status !== undefined && item.status !== 'completed')
    throw new ResponsesError('invalid_output', 'Responses 输出项尚未完成');
}
export function responseCalls(items: ResponseItem[]) {
  return items
    .filter((item) => item.type === 'function_call')
    .map((item) => {
      completedItem(item);
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

export type ResponseProgress = {
  text: string;
  status: 'waiting' | 'generating' | 'tool_call';
};
export type ResponseTimeouts = {
  /** Until the first nonempty body chunk; HTTP headers alone do not reset this deadline. */
  firstResponseMs?: number;
  /** Between nonempty body chunks, including SSE comments/heartbeats. */
  idleMs?: number;
  /** Across the complete request, regardless of heartbeats or output progress. */
  totalMs?: number;
};
const outputLimit = 8 * 1024 * 1024;
const previewLimit = 64000;
const index = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function containsCredential(value: unknown, credential: string): boolean {
  if (typeof value === 'string') return value.includes(credential);
  if (Array.isArray(value)) return value.some((child) => containsCredential(child, credential));
  return (
    object(value) &&
    Object.entries(value).some(
      ([key, child]) => key.includes(credential) || containsCredential(child, credential),
    )
  );
}
function sensitiveOutput(): ResponsesError {
  return new ResponsesError('credential_output', '模型服务返回了敏感凭据，已阻止保存本轮输出');
}
function usageFrom(raw: unknown): ResponseUsage {
  // 用量缺失时保留 incomplete 标记，数值填零只为累计，不能据此认定调用没有成本。
  const usage = emptyUsage();
  usage.modelCalls = 1;
  usage.incomplete =
    !object(raw) ||
    !['input_tokens', 'output_tokens', 'total_tokens'].every((key) => index(raw[key]));
  if (object(raw)) {
    usage.inputTokens = index(raw.input_tokens) ? raw.input_tokens : 0;
    usage.outputTokens = index(raw.output_tokens) ? raw.output_tokens : 0;
    usage.totalTokens = index(raw.total_tokens) ? raw.total_tokens : 0;
    usage.cachedInputTokens = index(raw.input_tokens_details?.cached_tokens)
      ? raw.input_tokens_details.cached_tokens
      : 0;
    usage.reasoningTokens = index(raw.output_tokens_details?.reasoning_tokens)
      ? raw.output_tokens_details.reasoning_tokens
      : 0;
  }
  return usage;
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
  onProgress?: (progress: ResponseProgress) => void;
  timeouts?: ResponseTimeouts;
}): Promise<{ output: ResponseItem[]; usage: ResponseUsage }> {
  const endpoint = responsesEndpoint(options.baseUrl);
  if (!options.model.trim() || !options.credential)
    throw new ResponsesError('configuration', '请先设置模型名称及 API 密钥');
  const deadlines = {
    firstResponseMs: options.timeouts?.firstResponseMs ?? 120000,
    idleMs: options.timeouts?.idleMs ?? 120000,
    totalMs: options.timeouts?.totalMs ?? 600000,
  };
  if (
    Object.values(deadlines).some(
      (value) => !Number.isSafeInteger(value) || value < 1 || value > 2147483647,
    )
  )
    throw new ResponsesError('configuration', '模型请求超时须为正整数毫秒');
  const input = structuredClone(options.input);
  serializable(input);
  // Local round-trip checks also reject undefined, NaN and provider extensions
  // that our JSON persistence cannot faithfully retain.
  const encoded = JSON.stringify(input);
  if (JSON.stringify(JSON.parse(encoded)) !== encoded)
    throw new ResponsesError('serialization', '模型上下文无法完整序列化');
  if (options.signal.aborted) throw new ResponsesError('cancelled', '模型请求已取消；未自动重试');
  options.onAttempt?.();
  if (options.signal.aborted) throw new ResponsesError('cancelled', '模型请求已取消；未自动重试');
  const controller = new AbortController();
  let rejectAbort!: (error: ResponsesError) => void;
  const interrupted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  let interruption: ResponsesError | undefined;
  const interrupt = (error: ResponsesError) => {
    if (interruption) return;
    interruption = error;
    rejectAbort(error);
    controller.abort();
  };
  const cancel = () => interrupt(new ResponsesError('cancelled', '模型请求已取消；未自动重试'));
  options.signal.addEventListener('abort', cancel, { once: true });
  let firstResponseTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const totalTimer = setTimeout(
    () => interrupt(new ResponsesError('timeout_total', '模型请求超过总时限；未自动重试')),
    deadlines.totalMs,
  );
  firstResponseTimer = setTimeout(
    () =>
      interrupt(new ResponsesError('timeout_first_response', '等待模型首个响应超时；未自动重试')),
    deadlines.firstResponseMs,
  );
  let streaming = false;
  try {
    options.onProgress?.({ text: '', status: 'waiting' });
    const response = await Promise.race([
      (options.fetcher ?? fetch)(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          authorization: `Bearer ${options.credential}`,
        },
        body: JSON.stringify({
          model: options.model,
          store: false,
          stream: true,
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
      }),
      interrupted,
    ]);
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new ResponsesError(
        `http_${response.status}`,
        `Responses 请求失败（HTTP ${response.status}）；请核对服务兼容性、地址、模型与密钥`,
      );
    }
    if (!response.body) throw new ResponsesError('invalid_output', 'Responses 服务返回空响应');
    if (
      response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'text/event-stream'
    ) {
      void response.body.cancel().catch(() => {});
      throw new ResponsesError(
        'invalid_output',
        '服务未返回 Responses SSE；不支持自动切换其他接口',
      );
    }
    reader = response.body.getReader();
    streaming = true;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let length = 0;
    let completed: { output: ResponseItem[]; usage: ResponseUsage } | undefined;
    const doneItems = new Map<number, ResponseItem>();
    const parts = new Map<string, { output: number; content: number; text: string }>();
    let status: ResponseProgress['status'] = 'waiting';
    let previous: ResponseProgress = { text: '', status };
    const progress = (finalText?: string) => {
      let text =
        finalText ??
        [...parts.values()]
          .sort((a, b) => a.output - b.output || a.content - b.content)
          .map((part) => part.text)
          .join('\n');
      if (text.includes(options.credential)) throw sensitiveOutput();
      // A credential may span arbitrary delta events. Retain only suffixes that
      // could still become the configured credential before exposing a snapshot.
      if (finalText === undefined) {
        for (let held = Math.min(text.length, options.credential.length - 1); held > 0; held--) {
          if (text.endsWith(options.credential.slice(0, held))) {
            text = text.slice(0, -held);
            break;
          }
        }
      }
      text = text.slice(0, previewLimit);
      if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
      if (text !== previous.text || status !== previous.status) {
        previous = { text, status };
        options.onProgress?.({ ...previous });
      }
    };
    const itemProgress = (output: number, item: ResponseItem) => {
      if (item.type === 'function_call') status = 'tool_call';
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const [key, part] of parts) if (part.output === output) parts.delete(key);
        item.content.forEach((part: unknown, content: number) => {
          if (!object(part)) return;
          const text =
            part.type === 'output_text'
              ? part.text
              : part.type === 'refusal'
                ? part.refusal
                : undefined;
          if (typeof text === 'string') {
            parts.set(`${output}:${content}`, { output, content, text });
            status = 'generating';
          }
        });
      }
      progress();
    };
    const events = new ResponseEventStream((event, raw) => {
      if (completed || raw === '[DONE]') return;
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new ResponsesError('invalid_output', 'Responses SSE 事件不是有效 JSON');
      }
      if (!object(data) || typeof data.type !== 'string' || (event && event !== data.type))
        throw new ResponsesError('invalid_output', 'Responses SSE 事件类型无效');
      if (['error', 'response.failed'].includes(data.type))
        throw new ResponsesError('stream_error', '模型响应流报告失败；未自动重试，请检查模型服务');
      if (data.type === 'response.incomplete')
        throw new ResponsesError(
          'incomplete_output',
          'Responses 输出未完成；请检查输出上限或服务状态',
        );
      if (containsCredential(data, options.credential)) throw sensitiveOutput();
      if (data.type === 'response.completed') {
        const result = data.response;
        if (
          !object(result) ||
          result.status !== 'completed' ||
          !Array.isArray(result.output) ||
          result.output.some((item: unknown) => !object(item))
        )
          throw new ResponsesError('invalid_output', 'Responses 完成事件缺少完整输出');
        const output: ResponseItem[] = result.output.map((item: ResponseItem, position: number) => {
          completedItem(item);
          const done = doneItems.get(position);
          if (done && (done.type !== item.type || (done.id && item.id && done.id !== item.id)))
            throw new ResponsesError('invalid_output', 'Responses 完成事件与已完成输出项不一致');
          const stableFields =
            item.type === 'function_call'
              ? ['call_id', 'name', 'arguments', 'status']
              : ['encrypted_content'];
          if (
            done &&
            stableFields.some(
              (field) => field in done && field in item && done[field] !== item[field],
            )
          )
            throw new ResponsesError('invalid_output', 'Responses 完成事件与已完成输出项内容冲突');
          return done ? { ...done, ...item } : item;
        });
        if ([...doneItems.keys()].some((position) => position >= output.length))
          throw new ResponsesError('invalid_output', 'Responses 完成事件丢失已完成输出项');
        responseCalls(output);
        serializable(output);
        if (containsCredential(output, options.credential)) throw sensitiveOutput();
        status = output.some((item) => item.type === 'function_call') ? 'tool_call' : 'generating';
        progress(responseText(output));
        completed = { output: structuredClone(output), usage: usageFrom(result.usage) };
        return;
      }
      if (data.type === 'response.output_item.done') {
        if (!index(data.output_index) || !object(data.item))
          throw new ResponsesError('invalid_output', 'Responses 已完成输出项格式无效');
        serializable(data.item);
        completedItem(data.item);
        doneItems.set(data.output_index, data.item);
        itemProgress(data.output_index, data.item);
      } else if (data.type === 'response.output_item.added') {
        if (object(data.item) && data.item.type === 'function_call') {
          status = 'tool_call';
          progress();
        }
      } else if (
        [
          'response.function_call_arguments.delta',
          'response.function_call_arguments.done',
        ].includes(data.type)
      ) {
        status = 'tool_call';
        progress();
      } else if (
        [
          'response.output_text.delta',
          'response.output_text.done',
          'response.refusal.delta',
          'response.refusal.done',
        ].includes(data.type)
      ) {
        const value = data.type.endsWith('.delta')
          ? data.delta
          : data.type === 'response.refusal.done'
            ? data.refusal
            : data.text;
        if (!index(data.output_index) || !index(data.content_index) || typeof value !== 'string')
          throw new ResponsesError('invalid_output', 'Responses 文本事件格式无效');
        const key = `${data.output_index}:${data.content_index}`;
        const text = data.type.endsWith('.delta') ? (parts.get(key)?.text ?? '') + value : value;
        parts.set(key, { output: data.output_index, content: data.content_index, text });
        status = 'generating';
        progress();
      }
    });
    while (!completed) {
      const chunk = await Promise.race([reader.read(), interrupted]);
      if (chunk.done) {
        try {
          events.push(decoder.decode());
        } catch (error) {
          if (error instanceof ResponsesError) throw error;
          throw new ResponsesError('invalid_output', 'Responses SSE 包含无效 UTF-8');
        }
        if (!completed)
          throw new ResponsesError(
            'incomplete_output',
            'Responses 响应流中断，未收到完成事件；未自动重试',
          );
        break;
      }
      if (!chunk.value.length) continue;
      clearTimeout(firstResponseTimer);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => interrupt(new ResponsesError('timeout_idle', '模型响应流停滞超时；未自动重试')),
        deadlines.idleMs,
      );
      length += chunk.value.length;
      if (length > outputLimit)
        throw new ResponsesError('output_limit', '模型响应超过本机接收上限');
      let text: string;
      try {
        text = decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new ResponsesError('invalid_output', 'Responses SSE 包含无效 UTF-8');
      }
      events.push(text);
    }
    return completed!;
  } catch (error) {
    if (interruption) throw interruption;
    if (error instanceof ResponsesError) throw error;
    throw new ResponsesError(
      streaming ? 'stream_interrupted' : 'transport',
      streaming
        ? 'Responses 响应流连接中断；未自动重试'
        : 'Responses 连接失败；未自动重试，请检查模型服务',
    );
  } finally {
    clearTimeout(firstResponseTimer);
    clearTimeout(idleTimer);
    clearTimeout(totalTimer);
    options.signal.removeEventListener('abort', cancel);
    void reader?.cancel().catch(() => {});
  }
}
