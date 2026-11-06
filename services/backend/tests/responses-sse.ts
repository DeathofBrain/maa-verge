/** Synthetic Responses streams; no provider, credential, or native runtime is contacted. */
export const responseEvent = (event: Record<string, unknown>) =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

export function completedEvent(response: { output: unknown[]; usage?: unknown }) {
  return {
    type: 'response.completed',
    response: { id: 'synthetic-response', status: 'completed', ...response },
  };
}

export const responsesSse = (response: { output: unknown[]; usage?: unknown }) =>
  new Response(responseEvent(completedEvent(response)), {
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });

export function controlledResponsesSse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    response: new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
    event(event: Record<string, unknown>) {
      controller.enqueue(encoder.encode(responseEvent(event)));
    },
    close() {
      controller.close();
    },
    fail() {
      controller.error(new Error('Synthetic upstream disconnected'));
    },
    get cancelled() {
      return cancelled;
    },
  };
}
