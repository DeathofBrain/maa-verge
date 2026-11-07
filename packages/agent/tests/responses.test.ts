import { afterEach, expect, test } from 'bun:test';
import {
  callResponses,
  responseCalls,
  responseText,
  ResponsesError,
  type ResponseItem,
  type ResponseProgress,
} from '../src/responses';

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});
const secret = 'synthetic-secret-do-not-persist';
function endpoint(handler: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: handler });
  servers.push(server);
  return server.url.toString();
}
function options(baseUrl: string, input: ResponseItem[] = []) {
  return {
    baseUrl,
    model: 'synthetic',
    credential: secret,
    input,
    tools: [],
    instructions: '合成测试',
    signal: AbortSignal.timeout(5000),
  };
}
function event(type: string, fields: Record<string, unknown> = {}): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
}
function completed(output: ResponseItem[] = [], usage?: Record<string, unknown>): string {
  return event('response.completed', { response: { status: 'completed', output, usage } });
}
function sse(text: string): Response {
  return new Response(text, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}
function chunks(values: (string | Uint8Array)[], close = true): typeof fetch {
  return (() =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const value of values)
            controller.enqueue(typeof value === 'string' ? new TextEncoder().encode(value) : value);
          if (close) controller.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    )) as unknown as typeof fetch;
}
const message = (text: string): ResponseItem => ({
  type: 'message',
  role: 'assistant',
  content: [{ type: 'output_text', text }],
});
async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ResponsesError);
    expect(String(error)).not.toContain(secret);
    expect(JSON.stringify(error)).not.toContain(secret);
    return (error as ResponsesError).code;
  }
  throw new Error('Expected a Responses failure');
}
test('Responses preserves opaque reasoning, phase, call IDs and all output fields on local round trips', async () => {
  const output = [
    {
      type: 'reasoning',
      id: 'rs-1',
      encrypted_content: 'opaque-provider-context',
      summary: [{ type: 'summary_text', text: '摘要' }],
    },
    {
      type: 'message',
      id: 'msg-1',
      role: 'assistant',
      phase: 'commentary',
      content: [{ type: 'output_text', text: '核对任务' }],
      extra: { vendor: true },
    },
    {
      type: 'function_call',
      id: 'fc-1',
      call_id: 'stable-call-1',
      name: 'read',
      arguments: '{"id":"a"}',
    },
  ];
  const requests: any[] = [];
  const baseUrl = endpoint(async (request) => {
    expect(new URL(request.url).pathname).toBe('/responses');
    expect(request.headers.get('authorization')).toBe('Bearer ' + secret);
    const body = await request.json();
    requests.push(body);
    return sse(
      completed(output, {
        input_tokens: 10,
        output_tokens: 4,
        total_tokens: 14,
        input_tokens_details: { cached_tokens: 3 },
        output_tokens_details: { reasoning_tokens: 2 },
      }),
    );
  });
  const first = await callResponses(options(baseUrl, [{ role: 'user', content: '查询' }]));
  expect(first.output).toEqual(output);
  const secondInput = [
    ...first.output,
    { type: 'function_call_output', call_id: 'stable-call-1', output: '{"ok":true}' },
  ];
  await callResponses(options(baseUrl, secondInput));
  expect(requests[1].input).toEqual(secondInput);
  expect(
    requests.every(
      (request) =>
        request.store === false && request.stream === true && !('previous_response_id' in request),
    ),
  ).toBe(true);
  expect(JSON.stringify(requests)).not.toContain(secret);
  expect(responseCalls(first.output)).toEqual([
    { id: 'stable-call-1', name: 'read', input: { id: 'a' } },
  ]);
  expect(responseText(first.output)).toBe('核对任务');
  expect(first.usage).toMatchObject({
    modelCalls: 1,
    totalTokens: 14,
    incomplete: false,
    cachedInputTokens: 3,
    reasoningTokens: 2,
  });
});
test('missing usage is incomplete, compatible services never fall back to another API', async () => {
  let count = 0;
  const baseUrl = endpoint(() => {
    count++;
    return sse(completed([message('回答')]));
  });
  const result = await callResponses(options(baseUrl));
  expect(result.usage).toMatchObject({ modelCalls: 1, incomplete: true, totalTokens: 0 });
  expect(count).toBe(1);
});
test('provider errors and network causes cannot expose credentials, and are not retried', async () => {
  let count = 0;
  const baseUrl = endpoint(() => {
    count++;
    return new Response(secret, { status: 401 });
  });
  let error: unknown;
  try {
    await callResponses(options(baseUrl));
  } catch (value) {
    error = value;
  }
  expect(error).toBeInstanceOf(ResponsesError);
  expect(String(error)).toContain('HTTP 401');
  expect(JSON.stringify(error)).not.toContain(secret);
  expect((error as Error).stack).not.toContain(secret);
  expect(count).toBe(1);
  await expect(
    callResponses({
      ...options(baseUrl),
      fetcher: (() => {
        throw new Error('authorization=' + secret);
      }) as any,
    }),
  ).rejects.toThrow('连接失败');
});
test('cancellation aborts the one request, invalid JSON-compatible state fails before dispatch', async () => {
  const controller = new AbortController();
  controller.abort();
  let count = 0;
  const fetcher = (() => {
    count++;
    return Response.json({ output: [] });
  }) as any;
  await expect(
    callResponses({ ...options('http://127.0.0.1'), signal: controller.signal, fetcher }),
  ).rejects.toThrow();
  await expect(
    callResponses({
      ...options('http://127.0.0.1', [{ type: 'reasoning', invalid: undefined }]),
      fetcher,
    }),
  ).rejects.toThrow('不能完整保存');
  expect(count).toBe(0);
});

test('SSE handles every UTF-8 byte boundary, CR/LF/CRLF, comments and multiline data', async () => {
  const output = [message('回答😀中文')];
  const body =
    ': heartbeat\r\n\r\n' +
    'event: response.output_text.delta\r' +
    'data: {"type":"response.output_text.delta",\r' +
    'data: "output_index":0,"content_index":0,"delta":"回答😀中文"}\r\r' +
    completed(output).replaceAll('\n', '\r\n');
  const bytes = new TextEncoder().encode(body);
  const progress: ResponseProgress[] = [];
  const result = await callResponses({
    ...options('https://synthetic.invalid/v1'),
    fetcher: chunks([...bytes].map((byte) => new Uint8Array([byte]))),
    onProgress: (value) => progress.push(value),
  });
  expect(result.output).toEqual(output);
  expect(progress).toContainEqual({ text: '回答😀中文', status: 'generating' });
});

test('final opaque item fields come from done/completed events, never partial added items', async () => {
  const reasoning = {
    type: 'reasoning',
    id: 'rs-final',
    encrypted_content: 'opaque-final',
    summary: [],
  };
  const finalMessage = { ...message('答案'), phase: 'final_answer', extra: { preserved: true } };
  const output = [{ type: 'reasoning', id: 'rs-final', summary: [] }, finalMessage];
  const body =
    event('response.output_item.added', {
      output_index: 0,
      item: { type: 'reasoning', id: 'rs-final', encrypted_content: 'partial-added' },
    }) +
    event('response.output_item.done', { output_index: 0, item: reasoning }) +
    completed(output);
  const result = await callResponses({
    ...options('https://synthetic.invalid'),
    fetcher: chunks([body]),
  });
  expect(result.output).toEqual([reasoning, finalMessage]);
});

test('tools remain unavailable until response.completed and progress excludes arguments and reasoning', async () => {
  const call = {
    type: 'function_call',
    id: 'fc',
    call_id: 'stable',
    name: 'read',
    status: 'completed',
    arguments: '{"sensitive_parameter":"private-value"}',
  };
  const progress: ResponseProgress[] = [];
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let returned = false;
  const fetcher = (() =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    )) as unknown as typeof fetch;
  const promise = callResponses({
    ...options('https://synthetic.invalid'),
    fetcher,
    onProgress: (value) => progress.push(value),
  }).then((result) => {
    returned = true;
    return result;
  });
  await Promise.resolve();
  controller.enqueue(
    new TextEncoder().encode(
      event('response.output_item.added', {
        output_index: 0,
        item: { ...call, status: 'in_progress', arguments: '' },
      }) +
        event('response.function_call_arguments.delta', {
          output_index: 0,
          delta: call.arguments,
        }) +
        event('response.reasoning_summary_text.delta', { delta: 'private-reasoning' }) +
        event('response.output_item.done', { output_index: 0, item: call }),
    ),
  );
  await Bun.sleep(10);
  expect(returned).toBe(false);
  expect(progress).toContainEqual({ text: '', status: 'tool_call' });
  expect(JSON.stringify(progress)).not.toContain('private');
  expect(JSON.stringify(progress)).not.toContain('sensitive_parameter');
  controller.enqueue(new TextEncoder().encode(completed([call])));
  const result = await promise;
  expect(responseCalls(result.output)).toEqual([
    { id: 'stable', name: 'read', input: { sensitive_parameter: 'private-value' } },
  ]);
});

test('progress protects credentials split across events and byte chunks', async () => {
  const progress: ResponseProgress[] = [];
  const prefix = secret.slice(0, 12);
  const body =
    event('response.output_text.delta', {
      output_index: 0,
      content_index: 0,
      delta: '安全文本' + prefix,
    }) +
    event('response.output_text.delta', {
      output_index: 0,
      content_index: 0,
      delta: secret.slice(12),
    }) +
    completed([message('安全文本' + secret)]);
  expect(
    await errorCode(
      callResponses({
        ...options('https://synthetic.invalid'),
        fetcher: chunks([...new TextEncoder().encode(body)].map((byte) => new Uint8Array([byte]))),
        onProgress: (value) => progress.push(value),
      }),
    ),
  ).toBe('credential_output');
  expect(progress).toContainEqual({ text: '安全文本', status: 'generating' });
  expect(JSON.stringify(progress)).not.toContain(prefix);
  expect(JSON.stringify(progress)).not.toContain(secret);
});

test('safe credential-like suffix is released at completion and preview respects the transport limit', async () => {
  const text = '普通回答' + secret.slice(0, 5);
  const progress: ResponseProgress[] = [];
  await callResponses({
    ...options('https://synthetic.invalid'),
    fetcher: chunks([
      event('response.output_text.delta', { output_index: 0, content_index: 0, delta: text }),
      completed([message(text)]),
    ]),
    onProgress: (value) => progress.push(value),
  });
  expect(progress.at(-1)?.text).toBe(text);
  const longText = 'a'.repeat(63999) + '😀' + 'tail';
  const previews: ResponseProgress[] = [];
  const result = await callResponses({
    ...options('https://synthetic.invalid'),
    fetcher: chunks([completed([message(longText)])]),
    onProgress: (value) => previews.push(value),
  });
  expect(responseText(result.output)).toBe(longText);
  expect(previews.at(-1)?.text).toBe('a'.repeat(63999));
});

test('refusal deltas are visible, unknown events remain private, and done snapshots are not duplicated', async () => {
  const output = [{ type: 'message', content: [{ type: 'refusal', refusal: '无法处理' }] }];
  const body =
    event('response.unknown_vendor_event', { text: 'not-visible' }) +
    event('response.refusal.delta', { output_index: 0, content_index: 0, delta: '无法' }) +
    event('response.refusal.done', { output_index: 0, content_index: 0, refusal: '无法处理' }) +
    event('response.output_item.done', { output_index: 0, item: output[0] }) +
    completed(output);
  const progress: ResponseProgress[] = [];
  await callResponses({
    ...options('https://synthetic.invalid'),
    fetcher: chunks([body]),
    onProgress: (value) => progress.push(value),
  });
  expect(progress.map((value) => value.text)).toEqual(['', '无法', '无法处理']);
});

test('completed event finishes even if the provider keeps its stream open', async () => {
  const result = await callResponses({
    ...options('https://synthetic.invalid'),
    fetcher: chunks([completed([message('完成')])], false),
    timeouts: { idleMs: 10 },
  });
  expect(responseText(result.output)).toBe('完成');
});

test('partial tools and EOF or DONE alone cannot pass the explicit completion gate', async () => {
  const call = { type: 'function_call', call_id: 'call', name: 'read', arguments: '{}' };
  for (const body of [
    event('response.output_item.done', { output_index: 0, item: call }),
    'data: [DONE]\n\n',
    event('response.output_text.delta', { output_index: 0, content_index: 0, delta: 'partial' }),
  ]) {
    expect(
      await errorCode(
        callResponses({ ...options('https://synthetic.invalid'), fetcher: chunks([body]) }),
      ),
    ).toBe('incomplete_output');
  }
  expect(
    await errorCode(
      callResponses({
        ...options('https://synthetic.invalid'),
        fetcher: chunks([completed([{ ...call, status: 'in_progress' }])]),
      }),
    ),
  ).toBe('invalid_output');
});

test('typed stream failures, malformed events and incompatible JSON never retry or expose provider details', async () => {
  const cases: [string, string][] = [
    [event('error', { message: secret, code: 'provider-internal' }), 'stream_error'],
    [event('response.failed', { response: { error: { message: secret } } }), 'stream_error'],
    [
      event('response.incomplete', { response: { incomplete_details: { reason: secret } } }),
      'incomplete_output',
    ],
    ['data: {invalid}\n\n', 'invalid_output'],
    ['event: response.completed\ndata: {"type":"response.created"}\n\n', 'invalid_output'],
    [
      event('response.completed', { response: { status: 'in_progress', output: [] } }),
      'invalid_output',
    ],
  ];
  for (const [body, code] of cases) {
    let count = 0;
    const fetcher = (() => {
      count++;
      return sse(body);
    }) as unknown as typeof fetch;
    expect(
      await errorCode(callResponses({ ...options('https://synthetic.invalid'), fetcher })),
    ).toBe(code);
    expect(count).toBe(1);
  }
  expect(
    await errorCode(
      callResponses({
        ...options('https://synthetic.invalid'),
        fetcher: (() =>
          Response.json({ status: 'completed', output: [] })) as unknown as typeof fetch,
      }),
    ),
  ).toBe('invalid_output');
});

test('malformed UTF-8, byte limit and stream transport errors are safe failures', async () => {
  expect(
    await errorCode(
      callResponses({
        ...options('https://synthetic.invalid'),
        fetcher: chunks([new Uint8Array([0xff])]),
      }),
    ),
  ).toBe('invalid_output');
  expect(
    await errorCode(
      callResponses({
        ...options('https://synthetic.invalid'),
        fetcher: chunks([new Uint8Array(8 * 1024 * 1024 + 1)]),
      }),
    ),
  ).toBe('output_limit');
  expect(
    await errorCode(
      callResponses({
        ...options('https://synthetic.invalid'),
        fetcher: (() =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error(secret));
              },
            }),
            { headers: { 'content-type': 'text/event-stream' } },
          )) as unknown as typeof fetch,
      }),
    ),
  ).toBe('stream_interrupted');
});

test('first response timeout includes headers without body, and aborts the one fetch', async () => {
  let count = 0;
  let receivedSignal: AbortSignal | undefined;
  const fetcher = ((_url: unknown, init?: RequestInit) => {
    count++;
    receivedSignal = init?.signal ?? undefined;
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } });
  }) as unknown as typeof fetch;
  expect(
    await errorCode(
      callResponses({
        ...options('https://synthetic.invalid'),
        fetcher,
        timeouts: { firstResponseMs: 25, idleMs: 1000, totalMs: 1000 },
      }),
    ),
  ).toBe('timeout_first_response');
  expect(receivedSignal?.aborted).toBe(true);
  expect(count).toBe(1);
});

test('idle timeout starts after first bytes, while heartbeat activity cannot extend the total deadline', async () => {
  expect(
    await errorCode(
      callResponses({
        ...options('https://synthetic.invalid'),
        fetcher: chunks([': keepalive\n\n'], false),
        timeouts: { firstResponseMs: 1000, idleMs: 25, totalMs: 1000 },
      }),
    ),
  ).toBe('timeout_idle');
  const fetcher = (() => {
    let heartbeat: ReturnType<typeof setInterval>;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          heartbeat = setInterval(
            () => controller.enqueue(new TextEncoder().encode(': keepalive\n\n')),
            5,
          );
        },
        cancel() {
          clearInterval(heartbeat);
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  }) as unknown as typeof fetch;
  expect(
    await errorCode(
      callResponses({
        ...options('https://synthetic.invalid'),
        fetcher,
        timeouts: { firstResponseMs: 1000, idleMs: 100, totalMs: 45 },
      }),
    ),
  ).toBe('timeout_total');
});

test('user cancellation during streaming and HTTP 504 are distinct from local deadlines', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const timer = setTimeout(() => controller.abort(), 20);
  try {
    expect(
      await errorCode(
        callResponses({
          ...options('https://synthetic.invalid'),
          signal: controller.signal,
          fetcher: chunks([': waiting\n\n'], false),
          onAttempt: () => attempts++,
        }),
      ),
    ).toBe('cancelled');
  } finally {
    clearTimeout(timer);
  }
  expect(attempts).toBe(1);
  expect(
    await errorCode(
      callResponses({
        ...options('https://synthetic.invalid'),
        fetcher: (() => new Response(secret, { status: 504 })) as unknown as typeof fetch,
      }),
    ),
  ).toBe('http_504');
});

test('contradictory completed tool arguments or opaque reasoning cannot overwrite done items', async () => {
  const call = {
    type: 'function_call',
    id: 'fc',
    call_id: 'stable',
    name: 'read',
    arguments: '{"complete":true}',
    status: 'completed',
  };
  const reasoning = { type: 'reasoning', id: 'rs', encrypted_content: 'final-opaque', summary: [] };
  for (const [done, final] of [
    [call, { ...call, arguments: '{}' }],
    [call, { ...call, call_id: 'different-call' }],
    [reasoning, { ...reasoning, encrypted_content: null }],
    [reasoning, { ...reasoning, encrypted_content: '' }],
  ]) {
    expect(
      await errorCode(
        callResponses({
          ...options('https://synthetic.invalid'),
          fetcher: chunks([
            event('response.output_item.done', { output_index: 0, item: done }),
            completed([final]),
          ]),
        }),
      ),
    ).toBe('invalid_output');
  }
});

test('cancellation from the attempt observer prevents a network dispatch', async () => {
  const controller = new AbortController();
  let dispatched = false;
  expect(
    await errorCode(
      callResponses({
        ...options('https://synthetic.invalid'),
        signal: controller.signal,
        onAttempt: () => controller.abort(),
        fetcher: (() => {
          dispatched = true;
          return sse(completed());
        }) as unknown as typeof fetch,
      }),
    ),
  ).toBe('cancelled');
  expect(dispatched).toBe(false);
});

test('completed response cannot legitimize incomplete message, reasoning or tool items', async () => {
  const items = [
    message('尚未完成的回答'),
    { type: 'reasoning', id: 'rs', encrypted_content: 'partial-opaque', summary: [] },
    { type: 'function_call', call_id: 'call', name: 'read', arguments: '{}' },
  ];
  for (const item of items) {
    for (const status of ['in_progress', 'incomplete']) {
      const partial = { ...item, status };
      // Cover status returned by response.completed and a status retained from
      // output_item.done when the completed event omits or replaces that field.
      for (const body of [
        completed([partial]),
        event('response.output_item.done', { output_index: 0, item: partial }) + completed([item]),
        event('response.output_item.done', { output_index: 0, item: partial }) +
          completed([{ ...item, status: 'completed' }]),
      ]) {
        expect(
          await errorCode(
            callResponses({ ...options('https://synthetic.invalid'), fetcher: chunks([body]) }),
          ),
        ).toBe('invalid_output');
      }
    }
  }
});

test('SSE MIME type matching ignores case and optional whitespace', async () => {
  const result = await callResponses({
    ...options('https://synthetic.invalid'),
    fetcher: (() =>
      new Response(completed([message('完成')]), {
        headers: { 'content-type': 'Text/Event-Stream ; charset=utf-8' },
      })) as unknown as typeof fetch,
  });
  expect(responseText(result.output)).toBe('完成');
});
