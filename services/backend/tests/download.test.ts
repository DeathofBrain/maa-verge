import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createComponentFetch,
  downloadArchive as downloadComponentArchive,
  MAX_DOWNLOAD_BYTES,
  type DownloadMetadata,
} from '@backend/infrastructure/network/download.ts';

const roots: string[] = [],
  servers: Server[] = [];
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const payload = Buffer.from('verified archive '.repeat(2000));
const meta = (url = 'https://example.test/archive', data = payload): DownloadMetadata => ({
  url,
  version: 'v1',
  size: data.length,
  digest: 'sha256:' + hash(data),
});
async function temp() {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-download-'));
  roots.push(root);
  return path.join(root, 'archive.zip');
}
const downloadArchive = (
  ...[metadata, destination, progress, options]: Parameters<typeof downloadComponentArchive>
) =>
  downloadComponentArchive(metadata, destination, progress, {
    fetcher: createComponentFetch(async () => ''),
    retryDelaysMs: [],
    ...options,
  });
const mocked = (callback: (url: string, options: RequestInit) => Response | Promise<Response>) =>
  callback as typeof fetch;
const full = (data: Uint8Array = payload, headers: Record<string, string> = {}) =>
  new Response(Buffer.from(data), {
    headers: { etag: '"v1"', 'content-length': String(data.length), ...headers },
  });
function interrupted(data = payload, headers: Record<string, string> = {}) {
  let sent = false;
  return new Response(
    // Demand-driven pulls keep the error from discarding an unread prefix.
    new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (sent) controller.error(new Error('synthetic network interruption'));
          else {
            sent = true;
            controller.enqueue(data.subarray(0, 100));
          }
        },
      },
      { highWaterMark: 0 },
    ),
    { headers: { etag: '"v1"', 'content-length': String(data.length), ...headers } },
  );
}
async function seed(destination: string, metadata = meta(), headers: Record<string, string> = {}) {
  await expect(
    downloadArchive(metadata, destination, () => {}, {
      fetcher: mocked(() => interrupted(payload, headers)),
    }),
  ).rejects.toThrow('interruption');
  expect((await stat(destination + '.partial')).size).toBe(100);
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('a network interruption survives a new downloader invocation and resumes HTTP Range/If-Range', async () => {
  const destination = await temp();
  let attempts = 0,
    resumed = false;
  let disconnect: (() => void) | undefined;
  const server = createServer((request, response) => {
    attempts++;
    if (attempts === 1) {
      response.writeHead(200, { etag: '"immutable-release"', 'content-length': payload.length });
      response.write(payload.subarray(0, 16_000));
      disconnect = () => response.destroy();
    } else {
      expect(request.headers.range).toBe('bytes=16000-');
      expect(request.headers['if-range']).toBe('"immutable-release"');
      resumed = true;
      response.writeHead(206, {
        etag: '"immutable-release"',
        'content-length': payload.length - 16_000,
        'content-range': `bytes 16000-${payload.length - 1}/${payload.length}`,
      });
      response.end(payload.subarray(16_000));
    }
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number },
    metadata = meta(`http://127.0.0.1:${address.port}/archive`);
  const firstAttempt = downloadArchive(metadata, destination, () => {}, {});
  const firstSettled = firstAttempt.catch(() => {});
  try {
    // Interrupt after the prefix is written, independently of disk preparation speed.
    const deadline = performance.now() + 2_000;
    while (true) {
      const partial = await stat(destination + '.partial').catch((error) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (partial?.size === 16_000) break;
      if (performance.now() >= deadline)
        throw new Error('Synthetic HTTP prefix was not persisted before interruption');
      await Bun.sleep(5);
    }
  } finally {
    disconnect?.();
    await firstSettled;
  }
  await expect(firstAttempt).rejects.toThrow();
  expect((await stat(destination + '.partial')).size).toBe(16_000);
  expect(await downloadArchive(metadata, destination, () => {}, {})).toBe(hash(payload));
  expect(resumed).toBe(true);
  expect(await readFile(destination)).toEqual(payload);
  expect(await Bun.file(destination + '.partial').exists()).toBe(false);
  expect(await Bun.file(destination + '.partial.json').exists()).toBe(false);
});

test('a server ignoring Range with 200 replaces the partial rather than appending', async () => {
  const destination = await temp();
  await seed(destination);
  expect(
    await downloadArchive(meta(), destination, () => {}, {
      fetcher: mocked((_url, options) => {
        expect(new Headers(options.headers).get('range')).toBe('bytes=100-');
        return full(payload, { etag: '"replacement"' });
      }),
    }),
  ).toBe(hash(payload));
  expect(await readFile(destination)).toEqual(payload);
});

test('a complete partial left before rename recovers from HTTP 416', async () => {
  const destination = await temp();
  await seed(destination);
  await writeFile(destination + '.partial', payload);
  let attempts = 0;
  await downloadArchive(meta(), destination, () => {}, {
    fetcher: mocked((_url, options) => {
      if (++attempts === 1) {
        expect(new Headers(options.headers).get('range')).toBe(`bytes=${payload.length}-`);
        return new Response(null, {
          status: 416,
          headers: { 'content-range': `bytes */${payload.length}` },
        });
      }
      expect(new Headers(options.headers).has('range')).toBe(false);
      return full();
    }),
  });
  expect(attempts).toBe(2);
  expect(await readFile(destination)).toEqual(payload);
});

test('official metadata with a null digest still validates its declared size', async () => {
  const destination = await temp();
  expect(
    await downloadArchive({ ...meta(), digest: null }, destination, () => {}, {
      fetcher: mocked(() => full()),
    }),
  ).toBe(hash(payload));
});

test('unknown-size resources resume using Last-Modified when no strong ETag exists', async () => {
  const destination = await temp(),
    metadata = { url: meta().url, version: 'commit' };
  const modified = 'Wed, 21 Oct 2026 07:28:00 GMT';
  await seed(destination, metadata, { etag: 'W/"weak"', 'last-modified': modified });
  await downloadArchive(metadata, destination, () => {}, {
    fetcher: mocked((_url, options) => {
      expect(new Headers(options.headers).get('if-range')).toBe(modified);
      return new Response(payload.subarray(100), {
        status: 206,
        headers: {
          'last-modified': modified,
          'content-range': `bytes 100-${payload.length - 1}/${payload.length}`,
        },
      });
    }),
  });
  expect(await readFile(destination)).toEqual(payload);
});

test('weak/no validators restart safely and identity changes discard previous bytes', async () => {
  const destination = await temp();
  await seed(destination, meta(), { etag: 'W/"weak"' });
  await downloadArchive(meta(), destination, () => {}, {
    fetcher: mocked((_url, options) => {
      expect(new Headers(options.headers).has('range')).toBe(false);
      return full();
    }),
  });
  await seed(destination);
  await downloadArchive({ ...meta(), version: 'v2' }, destination, () => {}, {
    fetcher: mocked((_url, options) => {
      expect(new Headers(options.headers).has('range')).toBe(false);
      return full();
    }),
  });
});

for (const [description, headers] of [
  [
    'wrong Content-Range offset',
    { 'content-range': `bytes 99-${payload.length - 1}/${payload.length}` },
  ],
  [
    'changed strong validator',
    { etag: '"v2"', 'content-range': `bytes 100-${payload.length - 1}/${payload.length}` },
  ],
  ['changed total', { 'content-range': `bytes 100-${payload.length - 1}/${payload.length + 1}` }],
] as [string, Record<string, string>][]) {
  test(`${description} rejects and removes untrusted bytes`, async () => {
    const destination = await temp();
    await seed(destination);
    await expect(
      downloadArchive(meta(), destination, () => {}, {
        fetcher: mocked(
          () =>
            new Response(payload.subarray(100), {
              status: 206,
              headers: { etag: '"v1"', ...headers },
            }),
        ),
      }),
    ).rejects.toThrow('下载包');
    expect(await Bun.file(destination + '.partial').exists()).toBe(false);
    expect(await Bun.file(destination).exists()).toBe(false);
  });
}

test('size, maximum size and SHA-256 checks reject corrupt bytes before publication', async () => {
  const destination = await temp();
  await expect(
    downloadArchive(meta(), destination, () => {}, {
      fetcher: mocked(() => full(payload.subarray(0, 100))),
    }),
  ).rejects.toThrow('大小不符');
  await expect(
    downloadArchive({ ...meta(), size: MAX_DOWNLOAD_BYTES + 1 }, destination, () => {}),
  ).rejects.toThrow('大小');
  await expect(
    downloadArchive({ ...meta(), digest: 'sha256:' + '0'.repeat(64) }, destination, () => {}, {
      fetcher: mocked(() => full()),
    }),
  ).rejects.toThrow('SHA-256');
  expect(await Bun.file(destination).exists()).toBe(false);
  expect(await Bun.file(destination + '.partial').exists()).toBe(false);
  await expect(
    downloadArchive({ url: meta().url, version: 'resource' }, destination, () => {}, {
      fetcher: mocked(
        () =>
          new Response(payload, { headers: { 'content-length': String(MAX_DOWNLOAD_BYTES + 1) } }),
      ),
    }),
  ).rejects.toThrow('大小限制');
});

test('each stream chunk refreshes idle timeout, and progress notifications are bounded', async () => {
  const destination = await temp(),
    data = Buffer.alloc(200, 42),
    values: number[] = [];
  let timer: ReturnType<typeof setInterval>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let count = 0;
      timer = setInterval(() => {
        controller.enqueue(data.subarray(count, (count += 20)));
        if (count === data.length) {
          clearInterval(timer);
          controller.close();
        }
      }, 25);
    },
    cancel() {
      clearInterval(timer);
    },
  });
  const started = performance.now();
  await downloadArchive(meta(meta().url, data), destination, (value) => values.push(value), {
    idleTimeoutMs: 100,
    fetcher: mocked(
      () => new Response(stream, { headers: { 'content-length': String(data.length) } }),
    ),
  });
  expect(performance.now() - started).toBeGreaterThan(200);
  expect(values.length).toBeLessThanOrEqual(4);
  expect(values.at(-1)).toBe(90);
  expect(await readFile(destination)).toEqual(data);
});

test('an idle stream and explicit cancellation preserve a resumable partial', async () => {
  const destination = await temp();
  const stream = () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(payload.subarray(0, 100));
        },
      }),
      {
        headers: { etag: '"v1"', 'content-length': String(payload.length) },
      },
    );
  await expect(
    downloadArchive(meta(), destination, () => {}, { idleTimeoutMs: 40, fetcher: mocked(stream) }),
  ).rejects.toThrow('空闲超时');
  expect((await stat(destination + '.partial')).size).toBe(100);
  const controller = new AbortController();
  const pending = downloadArchive(meta(), destination, () => {}, {
    signal: controller.signal,
    fetcher: mocked(
      () =>
        new Response(new ReadableStream(), {
          status: 206,
          headers: {
            etag: '"v1"',
            'content-range': `bytes 100-${payload.length - 1}/${payload.length}`,
          },
        }),
    ),
  });
  setTimeout(() => controller.abort(new Error('关闭服务')), 20);
  await expect(pending).rejects.toThrow('关闭服务');
  expect((await stat(destination + '.partial')).size).toBe(100);
});

test('download requests reject protocol redirects and use a fixed user agent', async () => {
  const destination = await temp();
  await expect(
    downloadArchive(meta(), destination, () => {}, {
      fetcher: mocked((_url, options) => {
        expect(new Headers(options.headers).get('user-agent')).toBe('maa-verge/0.1');
        expect(options.redirect).toBe('manual');
        return new Response(null, {
          status: 302,
          headers: { location: 'ftp://example.test/archive' },
        });
      }),
    }),
  ).rejects.toThrow('HTTPS');
});

test('cancellation before the response reader is attached cannot leave an idle stream hanging', async () => {
  const destination = await temp(),
    controller = new AbortController();
  let cancelled = false;
  await expect(
    downloadArchive(meta(), destination, () => {}, {
      signal: controller.signal,
      fetcher: mocked(() => {
        controller.abort(new Error('关闭服务'));
        return new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          {
            headers: { etag: '"v1"', 'content-length': String(payload.length) },
          },
        );
      }),
    }),
  ).rejects.toThrow('关闭服务');
  expect(cancelled).toBe(true);
});
