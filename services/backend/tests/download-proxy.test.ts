import { afterEach, expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, type RequestListener, type Server } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { pathToFileURL } from 'node:url';

// Public test-only key and certificate, valid 2020–2120 for the loopback address.
// They are explicitly trusted only by each isolated downloader child process.
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
const payload = Buffer.from('verified HTTPS proxy archive\n'.repeat(4096));
const hash = createHash('sha256').update(payload).digest('hex');
const roots: string[] = [];
const servers: (Server | HttpsServer)[] = [];
const sockets = new Set<Duplex>();
const timers = new Set<ReturnType<typeof setTimeout>>();

function track(socket: Duplex): void {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
}

async function listen(server: Server | HttpsServer): Promise<number> {
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

async function fixture(handler: RequestListener) {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-download-proxy-'));
  roots.push(root);
  const certificatePath = path.join(root, 'loopback-ca.pem');
  await writeFile(certificatePath, certificate);
  const origin = createHttpsServer({ key, cert: certificate }, handler);
  const originPort = await listen(origin);
  const proxy = createHttpsServer({ key, cert: certificate });
  let connections = 0;
  proxy.on('connect', (request, downstream, head) => {
    // The fixture never forwards to a host outside its own loopback origin.
    if (request.url !== `127.0.0.1:${originPort}`) {
      downstream.destroy();
      return;
    }
    connections++;
    const upstream = connect(originPort, '127.0.0.1', () => {
      downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      downstream.pipe(upstream);
      upstream.pipe(downstream);
    });
    track(downstream);
    track(upstream);
    upstream.on('error', () => downstream.destroy());
    downstream.on('error', () => upstream.destroy());
    downstream.on('close', () => upstream.destroy());
  });
  const proxyPort = await listen(proxy);
  const destination = path.join(root, 'archive.zip');
  const metadata = {
    url: `https://127.0.0.1:${originPort}/archive`,
    version: 'v1',
    size: payload.length,
    digest: 'sha256:' + hash,
  };

  async function download({ digest = metadata.digest, trust = true } = {}) {
    // Bun reads extra CA certificates at startup. Isolating the environment also
    // prevents this proxy from changing any concurrently running runtime tests.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) =>
          !/^(?:(?:https?|all|no)_proxy|node_extra_ca_certs|node_tls_reject_unauthorized|bun_tls_reject_unauthorized|node_options|node_path|bun_options|bun_be_bun)$/i.test(
            name,
          ),
      ),
    );
    env.HTTPS_PROXY = `https://127.0.0.1:${proxyPort}`;
    if (trust) env.NODE_EXTRA_CA_CERTS = certificatePath;
    const module = pathToFileURL(path.resolve(import.meta.dir, '../src/download.ts')).href;
    const script = `
      import { downloadArchive } from ${JSON.stringify(module)};
      try {
        const hash = await downloadArchive(${JSON.stringify({ ...metadata, digest })},
          ${JSON.stringify(destination)}, () => {}, {
            engine: 'aria2', aria2Path: ${JSON.stringify(path.join(root, 'missing-aria2'))},
            idleTimeoutMs: 2_000,
          });
        process.stdout.write(JSON.stringify({ hash }));
      } catch (error) {
        process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    `;
    return await new Promise<{ hash?: string; error?: string }>((resolve, reject) => {
      execFile(
        process.execPath,
        ['-e', script],
        {
          cwd: root,
          env,
          encoding: 'utf8',
          windowsHide: true,
          shell: false,
          timeout: 5_000,
          killSignal: 'SIGKILL',
          maxBuffer: 64 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) reject(new Error(`Isolated downloader failed: ${error.message}\n${stderr}`));
          else {
            try {
              resolve(JSON.parse(stdout));
            } catch {
              reject(new Error(`Invalid downloader result: ${stdout}\n${stderr}`));
            }
          }
        },
      );
    });
  }

  return { destination, metadata, download, connections: () => connections };
}

test('aria2 selection uses the compatible downloader through a trusted HTTPS proxy', async () => {
  let requests = 0;
  const archive = await fixture((_request, response) => {
    requests++;
    response.writeHead(200, { etag: '"immutable-archive"', 'content-length': payload.length });
    response.end(payload);
  });

  expect(await archive.download()).toEqual({ hash });
  expect(await readFile(archive.destination)).toEqual(payload);
  expect(requests).toBe(1);
  expect(archive.connections()).toBe(1);
  expect(await Bun.file(archive.destination + '.partial.json').exists()).toBe(false);
  expect(await Bun.file(archive.destination + '.partial.aria2').exists()).toBe(false);
});

test('HTTPS proxy compatibility retains validated partials and resumes after a new process', async () => {
  const requests: { range?: string; ifRange?: string | string[] }[] = [];
  const archive = await fixture((request, response) => {
    requests.push({ range: request.headers.range, ifRange: request.headers['if-range'] });
    if (requests.length === 1) {
      response.writeHead(200, { etag: '"immutable-archive"', 'content-length': payload.length });
      response.write(payload.subarray(0, 16_000));
      timers.add(setTimeout(() => response.destroy(), 40));
    } else {
      response.writeHead(206, {
        etag: '"immutable-archive"',
        'content-length': payload.length - 16_000,
        'content-range': `bytes 16000-${payload.length - 1}/${payload.length}`,
      });
      response.end(payload.subarray(16_000));
    }
  });

  expect((await archive.download()).error).toBeDefined();
  expect(await Bun.file(archive.destination).exists()).toBe(false);
  expect((await stat(archive.destination + '.partial')).size).toBe(16_000);
  expect(JSON.parse(await readFile(archive.destination + '.partial.json', 'utf8'))).toMatchObject({
    engine: 'builtin',
    identity: archive.metadata,
    validator: { header: 'etag', value: '"immutable-archive"' },
    total: payload.length,
  });
  expect(await archive.download()).toEqual({ hash });
  expect(requests).toEqual([
    { range: undefined, ifRange: undefined },
    { range: 'bytes=16000-', ifRange: '"immutable-archive"' },
  ]);
  expect(archive.connections()).toBe(2);
  expect(await readFile(archive.destination)).toEqual(payload);
});

test('HTTPS proxy compatibility still rejects an incorrect archive SHA-256', async () => {
  const archive = await fixture((_request, response) => {
    response.writeHead(200, { 'content-length': payload.length });
    response.end(payload);
  });

  expect((await archive.download({ digest: 'sha256:' + '0'.repeat(64) })).error).toContain(
    'SHA-256',
  );
  expect(archive.connections()).toBe(1);
  expect(await Bun.file(archive.destination).exists()).toBe(false);
  expect(await Bun.file(archive.destination + '.partial').exists()).toBe(false);
});

test('HTTPS proxy compatibility requires explicit certificate trust', async () => {
  let requests = 0;
  const archive = await fixture((_request, response) => {
    requests++;
    response.end(payload);
  });

  expect((await archive.download({ trust: false })).error).toBeDefined();
  expect(requests).toBe(0);
  expect(await Bun.file(archive.destination).exists()).toBe(false);
});

test('HTTPS proxy compatibility rejects HTTPS redirects to an HTTP archive', async () => {
  let insecureRequests = 0;
  const insecurePort = await listen(
    createHttpServer((_request, response) => {
      insecureRequests++;
      response.end(payload);
    }),
  );
  const archive = await fixture((_request, response) => {
    response.writeHead(302, { location: `http://127.0.0.1:${insecurePort}/archive` });
    response.end();
  });

  expect((await archive.download()).error).toContain('HTTPS');
  expect(archive.connections()).toBe(1);
  expect(insecureRequests).toBe(0);
  expect(await Bun.file(archive.destination).exists()).toBe(false);
});
