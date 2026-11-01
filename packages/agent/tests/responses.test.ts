import { afterEach, expect, test } from 'bun:test';
import {
  callResponses,
  responseCalls,
  responseText,
  ResponsesError,
  type ResponseItem,
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
    return Response.json({
      status: 'completed',
      output,
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        total_tokens: 14,
        input_tokens_details: { cached_tokens: 3 },
        output_tokens_details: { reasoning_tokens: 2 },
      },
    });
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
    requests.every((request) => request.store === false && !('previous_response_id' in request)),
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
    return Response.json({
      output: [{ type: 'message', content: [{ type: 'output_text', text: '回答' }] }],
    });
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
