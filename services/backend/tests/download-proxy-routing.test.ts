import { afterEach, expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import {
  createServer as createHttpServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type Server,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { pathToFileURL } from 'node:url';
import type { DownloadOptions } from '@backend/infrastructure/network/download.ts';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';

// Public, test-only loopback identity. Trust is confined to each child process.
const key = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgwW8kYO3B0B+5E8xk
5hssv3/7HCSouju2wwzq2I3n9y6hRANCAARIOiXa4jWMuT7UJHtz9XP84s4m38eJ
cuqEzQKOLE6ClSKYQiY8BcJlH5AKlwY3s1iX2Hfkq1m4DDWq451hB6YU
-----END PRIVATE KEY-----
`;
const certificate = `-----BEGIN CERTIFICATE-----
MIIBgDCCASWgAwIBAgIUfuaW5pMuAGpzbx5saTe0QuXHxlYwCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJMTI3LjAuMC4xMCAXDTIwMDEwMTAwMDAwMFoYDzIxMjAwMTAx
MDAwMDAwWjAUMRIwEAYDVQQDDAkxMjcuMC4wLjEwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAARIOiXa4jWMuT7UJHtz9XP84s4m38eJcuqEzQKOLE6ClSKYQiY8BcJl
H5AKlwY3s1iX2Hfkq1m4DDWq451hB6YUo1MwUTAPBgNVHRMBAf8EBTADAQH/MA8G
A1UdEQQIMAaHBH8AAAEwDgYDVR0PAQH/BAQDAgKEMB0GA1UdDgQWBBQURP7SBSgz
d8k91v6KOPIL2BLDIzAKBggqhkjOPQQDAgNJADBGAiEAoH385mVqTuRs9JpVXUTK
7SoMJpuptVkwW3vfYHe5WxECIQCVDsWdnc/qCbn9d9dNgTxUodCn5pUFx7PpatP0
z9rP7g==
-----END CERTIFICATE-----
`;
const payload = Buffer.from('production proxy routing archive\n'.repeat(1024));
const hash = createHash('sha256').update(payload).digest('hex');
const roots: string[] = [];
const servers: Server[] = [];
const sockets = new Set<Duplex>();
const timers = new Set<ReturnType<typeof setTimeout>>();

function later(action: () => void, delay: number): void {
  const timer = setTimeout(() => {
    timers.delete(timer);
    action();
  }, delay);
  timers.add(timer);
}

function track(socket: Duplex): void {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
}

async function listen(server: Server): Promise<number> {
  servers.push(server);
  server.on('connection', track);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as { port: number }).port;
}

afterEach(async () => {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  for (const socket of sockets) socket.destroy();
  sockets.clear();
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

async function fixture({
  secureOrigin = false,
  secureProxy = false,
  requireAuth = false,
  body = payload,
  proxyFailure,
}: {
  secureOrigin?: boolean;
  secureProxy?: boolean;
  requireAuth?: boolean;
  body?: Buffer;
  proxyFailure?: 'truncated-json' | 'invalid-json' | 'oversized' | 'stall';
} = {}) {
  const root = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-proxy-routing-'));
  roots.push(root);
  const ca = path.join(root, 'loopback-ca.pem');
  await writeFile(ca, certificate);
  const received: IncomingHttpHeaders[] = [];
  const originHandler = (
    request: import('node:http').IncomingMessage,
    response: import('node:http').ServerResponse,
  ) => {
    received.push(request.headers);
    const range = /^bytes=(\d+)-$/u.exec(request.headers.range || '');
    const start =
      range && request.headers['if-range'] === '"routing-fixture"' ? Number(range[1]) : 0;
    if (start >= body.length) {
      response.writeHead(416, { 'content-range': `bytes */${body.length}` });
      response.end();
      return;
    }
    response.writeHead(start ? 206 : 200, {
      etag: '"routing-fixture"',
      'content-length': body.length - start,
      ...(start ? { 'content-range': `bytes ${start}-${body.length - 1}/${body.length}` } : {}),
    });
    response.end(body.subarray(start));
  };
  const origin = secureOrigin
    ? createHttpsServer({ key, cert: certificate }, originHandler)
    : createHttpServer(originHandler);
  const originPort = await listen(origin);
  const url = `${secureOrigin ? 'https' : 'http'}://127.0.0.1:${originPort}/archive`;
  const expectedAuthorization = 'Basic ' + Buffer.from('fixture:p@ss').toString('base64');
  const proxies: { requests: number; tunnels: number; authorization: (string | undefined)[] }[] =
    [];
  let closeAfterProxyHeaders: (() => void) | undefined;

  async function makeProxy(tls = secureProxy): Promise<string> {
    const stats = { requests: 0, tunnels: 0, authorization: [] as (string | undefined)[] };
    proxies.push(stats);
    const proxy = tls ? createHttpsServer({ key, cert: certificate }) : createHttpServer();
    proxy.on('request', (request, response) => {
      stats.requests++;
      stats.authorization.push(request.headers['proxy-authorization']);
      if (requireAuth && request.headers['proxy-authorization'] !== expectedAuthorization) {
        response.writeHead(407, { 'proxy-authenticate': 'Basic realm="fixture"' });
        response.end();
        return;
      }
      // Even a malformed downloader request cannot send this fixture off loopback.
      if (request.url !== url || secureOrigin) {
        response.writeHead(502);
        response.end();
        return;
      }
      if (proxyFailure) {
        response.writeHead(200, {
          'content-type': 'application/json',
          ...(proxyFailure === 'truncated-json' ? { 'content-length': 100 } : {}),
        });
        if (proxyFailure === 'truncated-json') {
          response.write('{"interrupted":');
          later(() => response.destroy(), 25);
        } else if (proxyFailure === 'invalid-json') response.end('{broken JSON');
        else if (proxyFailure === 'oversized') {
          response.write(Buffer.alloc(4 * 1024 * 1024 + 1, 0x20));
          response.end();
        } else {
          response.flushHeaders();
          later(() => closeAfterProxyHeaders?.(), 20);
        }
        return;
      }
      const headers = { ...request.headers };
      delete headers['proxy-authorization'];
      const upstream = httpRequest(url, { headers, method: request.method }, (source) => {
        response.writeHead(source.statusCode!, source.headers);
        source.pipe(response);
      });
      upstream.on('socket', track);
      upstream.on('error', () => response.destroy());
      request.pipe(upstream);
    });
    proxy.on('connect', (request, downstream, head) => {
      stats.tunnels++;
      stats.authorization.push(request.headers['proxy-authorization']);
      if (requireAuth && request.headers['proxy-authorization'] !== expectedAuthorization) {
        downstream.end(
          'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="fixture"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
        );
        return;
      }
      if (request.url !== `127.0.0.1:${originPort}` || !secureOrigin) {
        downstream.destroy();
        return;
      }
      const upstream = connect(originPort, '127.0.0.1', () => {
        downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        downstream.pipe(upstream);
        upstream.pipe(downstream);
      });
      track(upstream);
      upstream.on('error', () => downstream.destroy());
      downstream.on('error', () => upstream.destroy());
      downstream.on('close', () => upstream.destroy());
    });
    return `${tls ? 'https' : 'http'}://127.0.0.1:${await listen(proxy)}`;
  }

  const proxy = await makeProxy();
  const destination = path.join(root, 'archive.zip');
  async function runScript(
    script: string,
    environment: Record<string, string>,
    { trust = true, closeOnHeaders = false } = {},
  ) {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) =>
          !/^(?:(?:https?|all|no)_proxy|node_extra_ca_certs|node_tls_reject_unauthorized|bun_tls_reject_unauthorized|node_options|node_path|bun_options|bun_be_bun)$/iu.test(
            name,
          ),
      ),
    );
    Object.assign(env, environment);
    if (trust) env.NODE_EXTRA_CA_CERTS = ca;
    return await new Promise<{ hash?: string; result?: unknown; error?: string }>(
      (resolve, reject) => {
        const child = execFile(
          process.execPath,
          ['-e', script],
          {
            cwd: root,
            env,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 8_000,
            killSignal: 'SIGKILL',
            maxBuffer: 64 * 1024,
          },
          (error, stdout, stderr) => {
            if (error)
              reject(new Error(`Isolated proxy downloader failed: ${error.message}\n${stderr}`));
            else {
              try {
                resolve(JSON.parse(stdout));
              } catch {
                reject(new Error(`Invalid proxy downloader result: ${stdout}\n${stderr}`));
              }
            }
          },
        );
        child.stdin?.on('error', () => {});
        if (closeOnHeaders) closeAfterProxyHeaders = () => child.stdin?.end('close\n');
        else child.stdin?.end();
      },
    );
  }
  async function download(
    environment: Record<string, string>,
    {
      trust = true,
      proxy = { mode: 'auto', url: '' },
    }: { trust?: boolean; proxy?: DownloadOptions['proxy'] } = {},
  ) {
    const module = pathToFileURL(
      path.resolve(import.meta.dir, '../src/infrastructure/network/download.ts'),
    ).href;
    const script = `
      import { downloadArchive } from ${JSON.stringify(module)};
      try {
        const hash = await downloadArchive(${JSON.stringify({ version: 'routing-v1', url, size: payload.length, digest: 'sha256:' + hash })}, ${JSON.stringify(destination)}, () => {}, { idleTimeoutMs: 300, retryDelaysMs: [], proxy: ${JSON.stringify(proxy)} });
        console.log(JSON.stringify({ hash }));
      } catch (error) {
        console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    `;
    return runScript(script, environment, { trust });
  }
  async function metadata(
    environment: Record<string, string>,
    {
      proxy = { mode: 'auto', url: '' },
      closeOnHeaders = false,
    }: { proxy?: DownloadOptions['proxy']; closeOnHeaders?: boolean } = {},
  ) {
    const module = pathToFileURL(
      path.resolve(import.meta.dir, '../src/modules/updates/updates.ts'),
    ).href;
    const script = `
      import { OfficialSource } from ${JSON.stringify(module)};
      const source = new OfficialSource(undefined, () => (${JSON.stringify(proxy)}));
      if (${closeOnHeaders}) { process.stdin.on('data', () => source.close()); process.stdin.resume(); }
      try { console.log(JSON.stringify({ result: await source.getJson(${JSON.stringify(url)}) })); }
      catch (error) { console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); }
      finally { source.close(); process.stdin.destroy(); }
    `;
    return runScript(script, environment, { closeOnHeaders });
  }
  return {
    url,
    proxy,
    proxies,
    received,
    originPort,
    destination,
    download,
    metadata,
    makeProxy,
    expectedAuthorization,
  };
}

for (const scenario of [
  { name: 'uppercase HTTP_PROXY', variable: 'HTTP_PROXY', secureOrigin: false, secureProxy: false },
  { name: 'lowercase http_proxy', variable: 'http_proxy', secureOrigin: false, secureProxy: false },
  {
    name: 'HTTPS through an HTTP/mixed-port proxy',
    variable: 'HTTPS_PROXY',
    secureOrigin: true,
    secureProxy: false,
  },
  {
    name: 'lowercase https_proxy through TLS',
    variable: 'https_proxy',
    secureOrigin: true,
    secureProxy: true,
  },
  {
    name: 'ALL_PROXY fallback for HTTP',
    variable: 'ALL_PROXY',
    secureOrigin: false,
    secureProxy: false,
  },
  {
    name: 'lowercase all_proxy fallback for HTTPS',
    variable: 'all_proxy',
    secureOrigin: true,
    secureProxy: false,
  },
]) {
  test(`production archive downloads route via ${scenario.name}`, async () => {
    const f = await fixture(scenario);
    expect(await f.download({ [scenario.variable]: f.proxy })).toEqual({ hash });
    expect(await readFile(f.destination)).toEqual(payload);
    expect(f.received).toHaveLength(1);
    expect(f.proxies[0].requests).toBe(scenario.secureOrigin ? 0 : 1);
    expect(f.proxies[0].tunnels).toBe(scenario.secureOrigin ? 1 : 0);
  });
}

test('scheme-specific proxy overrides ALL_PROXY without contacting the fallback', async () => {
  const f = await fixture({ secureOrigin: true });
  const fallback = await f.makeProxy();
  expect(await f.download({ HTTPS_PROXY: f.proxy, ALL_PROXY: fallback })).toEqual({ hash });
  expect(f.proxies[0].tunnels).toBe(1);
  expect(f.proxies[1].tunnels).toBe(0);
});

for (const scenario of ['all', 'ip', 'target-port', 'other-port'] as const) {
  test(`NO_PROXY ${scenario} applies to the archive target`, async () => {
    const f = await fixture({ secureOrigin: true });
    const bypass = scenario !== 'other-port';
    const noProxy =
      scenario === 'all'
        ? '*'
        : scenario === 'ip'
          ? '127.0.0.1'
          : `127.0.0.1:${f.originPort + (bypass ? 0 : 1)}`;
    expect(await f.download({ HTTPS_PROXY: f.proxy, NO_PROXY: noProxy })).toEqual({ hash });
    expect(f.received).toHaveLength(1);
    expect(f.proxies[0].tunnels).toBe(bypass ? 0 : 1);
  });
}

async function unreachableProxy(): Promise<string> {
  const unavailable = createHttpServer();
  await new Promise<void>((resolve) => unavailable.listen(0, '127.0.0.1', resolve));
  const port = (unavailable.address() as { port: number }).port;
  await new Promise<void>((resolve) => unavailable.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

test('an unreachable manual proxy reports failure without downloading directly', async () => {
  const f = await fixture({ secureOrigin: true });
  const result = await f.download({}, { proxy: { mode: 'manual', url: await unreachableProxy() } });
  expect(result.error).toBeDefined();
  expect(f.received).toHaveLength(0);
  expect(await Bun.file(f.destination).exists()).toBe(false);
});

for (const resume of [false, true]) {
  test(`an unavailable automatic proxy falls back to direct ${resume ? 'Range/If-Range continuation' : 'complete download'}`, async () => {
    const f = await fixture({ secureOrigin: true });
    const offset = 4096;
    if (resume) {
      await writeFile(f.destination + '.partial', payload.subarray(0, offset));
      await writeFile(
        f.destination + '.partial.json',
        JSON.stringify({
          format: 1,
          engine: 'builtin',
          identity: {
            version: 'routing-v1',
            url: f.url,
            size: payload.length,
            digest: 'sha256:' + hash,
          },
          validator: { header: 'etag', value: '"routing-fixture"' },
          total: payload.length,
        }),
      );
    }
    expect(await f.download({ HTTPS_PROXY: await unreachableProxy() })).toEqual({ hash });
    expect(await readFile(f.destination)).toEqual(payload);
    expect(f.received).toHaveLength(1);
    expect(f.received[0].range).toBe(resume ? `bytes=${offset}-` : undefined);
    expect(f.received[0]['if-range']).toBe(resume ? '"routing-fixture"' : undefined);
    expect(await Bun.file(f.destination + '.partial').exists()).toBe(false);
  });
}

test('direct mode ignores an inherited proxy environment', async () => {
  const f = await fixture({ secureOrigin: true, requireAuth: true });
  expect(
    await f.download({ HTTPS_PROXY: f.proxy }, { proxy: { mode: 'direct', url: '' } }),
  ).toEqual({ hash });
  expect(f.proxies[0].tunnels).toBe(0);
  expect(f.received).toHaveLength(1);
});

for (const secureOrigin of [false, true]) {
  test(`manual proxy 407 rejects ${secureOrigin ? 'CONNECT' : 'HTTP'} download without direct fallback`, async () => {
    const f = await fixture({ secureOrigin, requireAuth: true });
    const result = await f.download({}, { proxy: { mode: 'manual', url: f.proxy } });
    expect(result.error).toBeDefined();
    expect(f.proxies[0].authorization).toEqual([undefined]);
    expect(f.received).toHaveLength(0);
    expect(await Bun.file(f.destination).exists()).toBe(false);
  });

  test(`automatic proxy 407 falls back to direct ${secureOrigin ? 'HTTPS' : 'HTTP'} download`, async () => {
    const f = await fixture({ secureOrigin, requireAuth: true });
    expect(await f.download({ [secureOrigin ? 'HTTPS_PROXY' : 'HTTP_PROXY']: f.proxy })).toEqual({
      hash,
    });
    expect(f.proxies[0].authorization).toEqual([undefined]);
    expect(f.received).toHaveLength(1);
  });

  test(`manual URL credentials authenticate ${secureOrigin ? 'CONNECT' : 'HTTP'} proxy downloads over the environment`, async () => {
    const f = await fixture({ secureOrigin, requireAuth: true });
    const authenticated = new URL(f.proxy);
    authenticated.username = 'fixture';
    authenticated.password = 'p@ss';
    expect(
      await f.download(
        { [secureOrigin ? 'HTTPS_PROXY' : 'HTTP_PROXY']: f.proxy },
        { proxy: { mode: 'manual', url: authenticated.href } },
      ),
    ).toEqual({ hash });
    expect(f.proxies[0].authorization).toEqual([f.expectedAuthorization]);
    expect(f.received).toHaveLength(1);
    expect(f.received[0]['proxy-authorization']).toBeUndefined();
    expect(f.received[0].authorization).toBeUndefined();
  });
}

test('an untrusted manual TLS proxy is rejected before reaching the archive origin', async () => {
  const f = await fixture({ secureOrigin: true, secureProxy: true });
  expect(
    (await f.download({}, { trust: false, proxy: { mode: 'manual', url: f.proxy } })).error,
  ).toBeDefined();
  expect(f.proxies[0].tunnels).toBe(0);
  expect(f.received).toHaveLength(0);
  expect(await Bun.file(f.destination).exists()).toBe(false);
});

for (const variable of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) {
  test(`unsupported ${variable} uses direct download in automatic mode`, async () => {
    const secureOrigin = variable !== 'HTTP_PROXY';
    const f = await fixture({ secureOrigin });
    const result = await f.download({ [variable]: f.proxy.replace('http:', 'socks5:') });
    expect(result).toEqual({ hash });
    expect(f.proxies[0].requests + f.proxies[0].tunnels).toBe(0);
    expect(f.received).toHaveLength(1);
    expect(await readFile(f.destination)).toEqual(payload);
  });
}

test('an unsupported manual SOCKS proxy reports failure without downloading directly', async () => {
  const f = await fixture({ secureOrigin: true });
  const result = await f.download(
    {},
    { proxy: { mode: 'manual', url: f.proxy.replace('http:', 'socks5:') } },
  );
  expect(result.error).toMatch(/手动下载代理地址无效.*HTTP\/HTTPS/u);
  expect(f.proxies[0].requests + f.proxies[0].tunnels).toBe(0);
  expect(f.received).toHaveLength(0);
  expect(await Bun.file(f.destination).exists()).toBe(false);
});

const metadataResult = { version: 'routing-v1', ok: true };
const metadataBody = Buffer.from(JSON.stringify(metadataResult));

for (const mode of ['auto', 'direct'] as const) {
  test(`OfficialSource metadata ${mode} completes when the configured proxy truncates its body`, async () => {
    const f = await fixture({ body: metadataBody, proxyFailure: 'truncated-json' });
    expect(await f.metadata({ HTTP_PROXY: f.proxy }, { proxy: { mode, url: '' } })).toEqual({
      result: metadataResult,
    });
    expect(f.proxies[0].requests).toBe(mode === 'auto' ? 1 : 0);
    expect(f.received).toHaveLength(1);
  });
}

test('OfficialSource manual proxy errors provide a message without direct fallback', async () => {
  const f = await fixture({ body: metadataBody, requireAuth: true });
  const result = await f.metadata({}, { proxy: { mode: 'manual', url: f.proxy } });
  expect(result.error).toMatch(/手动代理.*失败.*认证/u);
  expect(f.proxies[0].requests).toBe(1);
  expect(f.received).toHaveLength(0);
});

test('closing OfficialSource during a proxy body cancels without a direct request', async () => {
  const f = await fixture({ body: metadataBody, proxyFailure: 'stall' });
  const result = await f.metadata({ HTTP_PROXY: f.proxy }, { closeOnHeaders: true });
  expect(result.error).toMatch(/应用服务正在关闭/u);
  expect(f.proxies[0].requests).toBe(1);
  expect(f.received).toHaveLength(0);
});

test('invalid metadata JSON does not trigger automatic direct fallback', async () => {
  const f = await fixture({ body: metadataBody, proxyFailure: 'invalid-json' });
  const result = await f.metadata({ HTTP_PROXY: f.proxy });
  expect(result.error).toMatch(/JSON/iu);
  expect(f.proxies[0].requests).toBe(1);
  expect(f.received).toHaveLength(0);
});

test('oversized streamed metadata does not trigger automatic direct fallback', async () => {
  const f = await fixture({ body: metadataBody, proxyFailure: 'oversized' });
  const result = await f.metadata({ HTTP_PROXY: f.proxy });
  expect(result.error).toMatch(/size limit|超出/u);
  expect(f.proxies[0].requests).toBe(1);
  expect(f.received).toHaveLength(0);
});
