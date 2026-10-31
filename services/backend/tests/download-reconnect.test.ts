import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { createServer, request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Socket } from 'node:net';
import { createComponentFetch, downloadArchive } from '@backend/infrastructure/network/download.ts';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  servers: Server[] = [];
const sockets = new Set<Socket>();
const payload = Buffer.from('proxy switch archive\n'.repeat(4096));
const digest = createHash('sha256').update(payload).digest('hex');
const metadata = (url = 'https://example.test/archive') => ({
  version: 'immutable-commit',
  url,
  size: payload.length,
  digest: 'sha256:' + digest,
});
const response = () =>
  new Response(payload, {
    headers: { etag: '"v1"', 'content-length': String(payload.length) },
  });
async function destination() {
  const root = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-reconnect-'));
  roots.push(root);
  return path.join(root, 'archive.zip');
}
async function listen(server: Server) {
  servers.push(server);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('transient HTTP errors reconnect a bounded number of times', async () => {
  const file = await destination();
  let attempts = 0;
  const fetcher = (() =>
    ++attempts < 3 ? new Response(null, { status: 503 }) : response()) as unknown as typeof fetch;
  expect(await downloadArchive(metadata(), file, () => {}, { fetcher })).toBe(digest);
  expect(attempts).toBe(3);
  attempts = 0;
  await expect(
    downloadArchive(metadata(), file, () => {}, {
      fetcher: (() => {
        attempts++;
        return new Response(null, { status: 502 });
      }) as unknown as typeof fetch,
      retryDelaysMs: [0, 0],
    }),
  ).rejects.toThrow('HTTP 502');
  expect(attempts).toBe(3);
});

for (const status of [400, 401, 403, 404, 407]) {
  test(`HTTP ${status} does not repeatedly reconnect`, async () => {
    let attempts = 0;
    await expect(
      downloadArchive(metadata(), await destination(), () => {}, {
        fetcher: (() => {
          attempts++;
          return new Response(null, { status });
        }) as unknown as typeof fetch,
        retryDelaysMs: [0, 0],
      }),
    ).rejects.toThrow(`HTTP ${status}`);
    expect(attempts).toBe(1);
  });
}

test('corrupt content never retries or replaces a previously published archive', async () => {
  const file = await destination();
  await downloadArchive(metadata(), file, () => {}, {
    fetcher: response as unknown as typeof fetch,
  });
  let attempts = 0;
  await expect(
    downloadArchive({ ...metadata(), digest: 'sha256:' + '0'.repeat(64) }, file, () => {}, {
      fetcher: (() => {
        attempts++;
        return response();
      }) as unknown as typeof fetch,
      retryDelaysMs: [0, 0],
    }),
  ).rejects.toThrow('SHA-256');
  expect(attempts).toBe(1);
  expect(await readFile(file)).toEqual(payload);
  expect(await Bun.file(file + '.partial').exists()).toBe(false);
});

test('cancellation during reconnect delay is immediate and preserves verified partial identity', async () => {
  const file = await destination(),
    controller = new AbortController();
  let attempts = 0;
  const pending = downloadArchive(metadata(), file, () => {}, {
    signal: controller.signal,
    retryDelaysMs: [10_000],
    fetcher: (() => {
      attempts++;
      return new Response(
        new ReadableStream({
          start(stream) {
            stream.enqueue(payload.subarray(0, 100));
            setTimeout(() => stream.error(new Error('connection lost')), 20);
          },
        }),
        { headers: { etag: '"v1"', 'content-length': String(payload.length) } },
      );
    }) as unknown as typeof fetch,
  });
  const caught = pending.catch(() => {});
  await Bun.sleep(100);
  const started = performance.now();
  controller.abort(new Error('user cancelled'));
  await expect(pending).rejects.toThrow('user cancelled');
  await caught;
  expect(performance.now() - started).toBeLessThan(1000);
  expect(attempts).toBe(1);
  expect((await stat(file + '.partial')).size).toBe(100);
});

// A real forwarding HTTP proxy, equivalent to the HTTP side of Clash's mixed
// port. Forwarding is restricted to this fixture's origin; no public traffic.
async function proxy(origin: string) {
  let connections = 0;
  const url = await listen(
    createServer((incoming, outgoing) => {
      connections++;
      const target = new URL(incoming.url!);
      if (target.origin !== origin) {
        outgoing.writeHead(403).end();
        return;
      }
      const upstream = request(
        target,
        {
          method: incoming.method,
          headers: { ...incoming.headers, connection: 'close' },
        },
        (res) => {
          outgoing.writeHead(res.statusCode!, res.headers);
          res.on('aborted', () => outgoing.destroy());
          res.on('error', () => outgoing.destroy());
          res.pipe(outgoing);
        },
      );
      upstream.on('error', () => outgoing.destroy());
      outgoing.on('close', () => upstream.destroy());
      incoming.pipe(upstream);
    }),
  );
  return { url, connections: () => connections };
}

for (const change of ['direct-to-proxy', 'proxy-to-direct', 'proxy-to-new-proxy'] as const) {
  test(`a broken connection automatically resumes after ${change}`, async () => {
    const file = await destination();
    let selected = '',
      next = '',
      resolutions = 0;
    const requests: { range?: string; ifRange?: string | string[] }[] = [];
    const origin = await listen(
      createServer((req, res) => {
        requests.push({ range: req.headers.range, ifRange: req.headers['if-range'] });
        if (requests.length === 1) {
          res.writeHead(200, { etag: '"v1"', 'content-length': payload.length });
          res.write(payload.subarray(0, 16_000));
          setTimeout(() => {
            selected = next;
            res.destroy();
          }, 40);
        } else {
          res.writeHead(206, {
            etag: '"v1"',
            'content-length': payload.length - 16_000,
            'content-range': `bytes 16000-${payload.length - 1}/${payload.length}`,
          });
          res.end(payload.subarray(16_000));
        }
      }),
    );
    const first = await proxy(origin),
      second = await proxy(origin);
    selected = change === 'direct-to-proxy' ? '' : first.url;
    next =
      change === 'proxy-to-direct' ? '' : change === 'direct-to-proxy' ? first.url : second.url;
    const fetcher = createComponentFetch(async () => {
      resolutions++;
      return selected;
    });
    expect(
      await downloadArchive(metadata(origin + '/archive'), file, () => {}, {
        fetcher,
        retryDelaysMs: [0, 0],
      }),
    ).toBe(digest);
    expect(resolutions).toBe(2);
    expect(requests).toEqual([
      { range: undefined, ifRange: undefined },
      { range: 'bytes=16000-', ifRange: '"v1"' },
    ]);
    expect(first.connections()).toBe(1);
    expect(second.connections()).toBe(change === 'proxy-to-new-proxy' ? 1 : 0);
    expect(await readFile(file)).toEqual(payload);
  });
}

test('reconnect starts from the original URL and resolves the current proxy at every redirect', async () => {
  const file = await destination();
  let signed = 0,
    selected = '';
  const seen: string[] = [],
    ranges: (string | undefined)[] = [];
  const origin = await listen(
    createServer((req, res) => {
      if (req.url === '/archive') {
        res.writeHead(302, { location: `/signed?token=${++signed}` }).end();
        return;
      }
      seen.push(req.url!);
      ranges.push(req.headers.range);
      if (seen.length === 1) {
        res.writeHead(200, { etag: '"v1"', 'content-length': payload.length });
        res.write(payload.subarray(0, 16_000));
        setTimeout(() => res.destroy(), 40);
      } else {
        res.writeHead(206, {
          etag: '"v1"',
          'content-range': `bytes 16000-${payload.length - 1}/${payload.length}`,
        });
        res.end(payload.subarray(16_000));
      }
    }),
  );
  const gateway = await proxy(origin);
  const decisions: string[] = [];
  const fetcher = createComponentFetch(async (url) => {
    decisions.push(url);
    selected = new URL(url).pathname === '/archive' ? '' : gateway.url;
    return selected;
  });
  await downloadArchive(metadata(origin + '/archive'), file, () => {}, {
    fetcher,
    retryDelaysMs: [0],
  });
  expect(seen).toEqual(['/signed?token=1', '/signed?token=2']);
  expect(ranges).toEqual([undefined, 'bytes=16000-']);
  expect(decisions.map((url) => new URL(url).pathname)).toEqual([
    '/archive',
    '/signed',
    '/archive',
    '/signed',
  ]);
  // The signed URL refreshes, and the failed proxy is bypassed on the retry.
  expect(gateway.connections()).toBe(1);
  expect(await readFile(file)).toEqual(payload);
});

test('route changes cannot reuse bytes from a changed remote object', async () => {
  const file = await destination();
  let attempts = 0;
  await expect(
    downloadArchive(metadata(), file, () => {}, {
      retryDelaysMs: [0, 0],
      fetcher: ((_url: string, options: RequestInit) => {
        if (++attempts === 1)
          return new Response(
            new ReadableStream({
              start(stream) {
                stream.enqueue(payload.subarray(0, 100));
                setTimeout(() => stream.error(new Error('route changed')), 20);
              },
            }),
            { headers: { etag: '"v1"', 'content-length': String(payload.length) } },
          );
        expect(new Headers(options.headers).get('if-range')).toBe('"v1"');
        return new Response(payload.subarray(100), {
          status: 206,
          headers: {
            etag: '"v2"',
            'content-range': `bytes 100-${payload.length - 1}/${payload.length}`,
          },
        });
      }) as unknown as typeof fetch,
    }),
  ).rejects.toThrow('续传版本或大小已变化');
  expect(attempts).toBe(2);
  expect(await Bun.file(file + '.partial').exists()).toBe(false);
  expect(await Bun.file(file).exists()).toBe(false);
});

test('exhausted reconnects preserve every verified prefix for a later user retry', async () => {
  const file = await destination();
  const offsets: number[] = [];
  const origin = await listen(
    createServer((req, res) => {
      const offset = req.headers.range ? Number(/^bytes=(\d+)-$/.exec(req.headers.range)![1]) : 0;
      offsets.push(offset);
      res.writeHead(offset ? 206 : 200, {
        etag: '"v1"',
        'content-length': payload.length - offset,
        ...(offset
          ? { 'content-range': `bytes ${offset}-${payload.length - 1}/${payload.length}` }
          : {}),
      });
      if (offsets.length <= 3) {
        res.write(payload.subarray(offset, offset + 16_000));
        setTimeout(() => res.destroy(), 40);
      } else res.end(payload.subarray(offset));
    }),
  );
  const options = { fetcher: createComponentFetch(async () => ''), retryDelaysMs: [0, 0] };
  await expect(
    downloadArchive(metadata(origin + '/archive'), file, () => {}, options),
  ).rejects.toThrow();
  expect(offsets).toEqual([0, 16_000, 32_000]);
  expect((await stat(file + '.partial')).size).toBe(48_000);
  expect(await Bun.file(file).exists()).toBe(false);
  expect(await downloadArchive(metadata(origin + '/archive'), file, () => {}, options)).toBe(
    digest,
  );
  expect(offsets).toEqual([0, 16_000, 32_000, 48_000]);
  expect(await readFile(file)).toEqual(payload);
});

test('automatic reconnection restarts from zero when no safe remote validator exists', async () => {
  const file = await destination();
  let attempts = 0;
  const fetcher = ((_url: string, options: RequestInit) => {
    expect(new Headers(options.headers).has('range')).toBe(false);
    if (++attempts === 1)
      return new Response(
        new ReadableStream({
          start(stream) {
            stream.enqueue(payload.subarray(0, 100));
            setTimeout(() => stream.error(new Error('connection interrupted')), 20);
          },
        }),
        { headers: { 'content-length': String(payload.length) } },
      );
    return response();
  }) as unknown as typeof fetch;
  expect(await downloadArchive(metadata(), file, () => {}, { fetcher, retryDelaysMs: [0] })).toBe(
    digest,
  );
  expect(attempts).toBe(2);
  expect(await readFile(file)).toEqual(payload);
});

test('manual proxy stream failures report an error and resume later through that proxy', async () => {
  const file = await destination(),
    offsets: number[] = [];
  const origin = await listen(
    createServer((req, res) => {
      const offset = req.headers.range ? Number(/^bytes=(\d+)-$/.exec(req.headers.range)![1]) : 0;
      offsets.push(offset);
      res.writeHead(offset ? 206 : 200, {
        etag: '"v1"',
        'content-length': payload.length - offset,
        ...(offset
          ? { 'content-range': `bytes ${offset}-${payload.length - 1}/${payload.length}` }
          : {}),
      });
      if (offsets.length <= 3) {
        res.write(payload.subarray(offset, offset + 16_000));
        setTimeout(() => res.destroy(), 40);
      } else res.end(payload.subarray(offset));
    }),
  );
  const gateway = await proxy(origin);
  const proxySettings = { mode: 'manual', url: gateway.url } as const;
  const options = { proxy: proxySettings, retryDelaysMs: [0, 0] };
  await expect(
    downloadArchive(metadata(origin + '/archive'), file, () => {}, options),
  ).rejects.toThrow('手动代理下载中断');
  expect(gateway.connections()).toBe(3);
  expect(offsets).toEqual([0, 16_000, 32_000]);
  expect((await stat(file + '.partial')).size).toBe(48_000);
  expect(await downloadArchive(metadata(origin + '/archive'), file, () => {}, options)).toBe(
    digest,
  );
  expect(gateway.connections()).toBe(4);
  expect(offsets).toEqual([0, 16_000, 32_000, 48_000]);
  expect(await readFile(file)).toEqual(payload);
});

test('a disk preparation failure never starts an automatic network retry', async () => {
  const directory = await destination();
  await mkdir(directory);
  let attempts = 0;
  await expect(
    downloadArchive(metadata(), directory, () => {}, {
      fetcher: (() => {
        attempts++;
        return response();
      }) as unknown as typeof fetch,
      retryDelaysMs: [0, 0],
    }),
  ).rejects.toThrow();
  expect(attempts).toBe(1);
});

test('network diagnostics strip proxy credentials from both message and error chain', async () => {
  const file = await destination();
  let caught: Error | undefined;
  try {
    await downloadArchive(metadata(), file, () => {}, {
      retryDelaysMs: [],
      fetcher: (async () => {
        throw new Error('connection failed at http://account:secret@private@127.0.0.1:17890');
      }) as unknown as typeof fetch,
    });
  } catch (error) {
    caught = error as Error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(caught!.message).not.toContain('account');
  expect(caught!.message).not.toContain('secret');
  expect(caught!.message).not.toContain('private');
  expect(caught!.cause).toBeUndefined();
});
