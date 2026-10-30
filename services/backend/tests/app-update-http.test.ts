import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DownloadProxySettings } from '../../../packages/contracts/src/types';
import { AppUpdateHttp, type AppUpdateHttpOptions } from '../src/modules/updates/app-update-http';

const roots: string[] = [];
const payload = Buffer.from('signed application transport fixture\n'.repeat(2048));
const sha256 = createHash('sha256').update(payload).digest('hex');
const archiveUrl =
  'https://github.com/DeathofBrain/maa-verge/releases/download/v0.2.0/Maa-Verge_0.2.0_x64-setup.exe';
const manifestUrl =
  'https://github.com/DeathofBrain/maa-verge/releases/download/v0.2.0/latest.json';
const proxyUrl = 'http://proxy.fixture:7890/';
const releases = (operationId = 'release-check', page = 1) => ({
  operation: 'releases',
  operationId,
  page,
});
const manifest = (operationId = 'manifest-check') => ({
  operation: 'manifest',
  operationId,
  tag: 'v0.2.0',
});
const archive = (operationId = 'archive-download') => ({
  operation: 'download',
  operationId,
  tag: 'v0.2.0',
  version: '0.2.0',
  name: 'Maa-Verge_0.2.0_x64-setup.exe',
  size: payload.length,
  digest: 'sha256:' + sha256,
});

type Route = false | { url: string; respectNoProxy: boolean };
interface Request {
  url: string;
  proxy: Route;
  headers: Headers;
  signal?: AbortSignal;
  redirect?: RequestRedirect;
}
type Handler = (request: Request, index: number) => Response | Promise<Response>;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(
  handler: Handler,
  options: AppUpdateHttpOptions = {},
  initial: DownloadProxySettings | undefined = { mode: 'auto', url: '' },
) {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-app-http-'));
  roots.push(root);
  const directory = path.join(root, 'updates', 'app', 'downloads');
  let preferences: DownloadProxySettings | undefined = initial;
  const requests: Request[] = [];
  const progress: { operationId: string; value: number; downloadSpeedBytesPerSecond?: number }[] =
    [];
  const transport = (async (input, init) => {
    const request: Request = {
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      proxy: (init as { proxy?: Route } | undefined)?.proxy as Route,
      headers: new Headers(init?.headers),
      signal: init?.signal ?? undefined,
      redirect: init?.redirect,
    };
    requests.push(request);
    return handler(request, requests.length - 1);
  }) as typeof fetch;
  const createService = () =>
    new AppUpdateHttp(
      directory,
      () => preferences,
      (operationId, value, downloadSpeedBytesPerSecond) =>
        progress.push({ operationId, value, downloadSpeedBytesPerSecond }),
      {
        resolveProxy: async () => '',
        retryDelaysMs: [0, 0],
        idleTimeoutMs: 1_000,
        ...options,
        fetcher: transport,
      },
    );
  return {
    root,
    directory,
    service: createService(),
    createService,
    requests,
    progress,
    setPreferences(value: DownloadProxySettings | undefined) {
      preferences = value;
    },
  };
}

function complete(request?: Request, etag = '"app-v1"'): Response {
  const range = /^bytes=(\d+)-$/.exec(request?.headers.get('range') ?? '');
  const offset = range ? Number(range[1]) : 0;
  return new Response(payload.subarray(offset), {
    status: offset ? 206 : 200,
    headers: {
      etag,
      'content-length': String(payload.length - offset),
      ...(offset
        ? { 'content-range': `bytes ${offset}-${payload.length - 1}/${payload.length}` }
        : {}),
    },
  });
}

function interrupted(start: number, end: number): Response {
  let sent = false;
  return new Response(
    new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (!sent) {
            sent = true;
            controller.enqueue(payload.subarray(start, end));
          } else controller.error(new Error('synthetic transport disconnected'));
        },
      },
      { highWaterMark: 0 },
    ),
    {
      status: start ? 206 : 200,
      headers: {
        etag: '"app-v1"',
        'content-length': String(payload.length - start),
        ...(start
          ? { 'content-range': `bytes ${start}-${payload.length - 1}/${payload.length}` }
          : {}),
      },
    },
  );
}

async function entries(directory: string): Promise<string[]> {
  try {
    return await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function assertNoInstallCandidate(root: string): Promise<void> {
  expect(await Bun.file(path.join(root, 'updates/app/pending.json')).exists()).toBe(false);
}

for (const name of ['Maa-Verge_0.2.0_x64-setup.exe', 'Maa-Verge_0.2.0_amd64.AppImage']) {
  test(`mirror application transport retains official digest/size binding for ${name}`, async () => {
    const notices: string[] = [];
    const f = await fixture(
      (request) => {
        if (request.url.includes('/api/resources/maa-verge/latest')) {
          const url = new URL(request.url);
          expect(url.searchParams.get('current_version')).toBe('0');
          expect(url.searchParams.get('cdk')).toBe('synthetic-secret');
          return Response.json({
            code: 0,
            data: {
              version_name: 'v0.2.0',
              version_number: 1,
              os: name.endsWith('.exe') ? 'windows' : 'linux',
              arch: 'amd64',
              channel: 'stable',
              url: 'https://mirrorchyan.com/resources/download/app?token=synthetic-signed-token',
              sha256,
              filesize: payload.length,
              update_type: 'full',
            },
          });
        }
        expect(request.url).toContain('mirrorchyan.com/resources/download/app');
        return complete(request);
      },
      {
        mirrorChyan: () => ({ enabled: true, cdk: 'synthetic-secret' }),
        mirrorChyanStatus: (text) => notices.push(text),
      },
    );
    const result: any = await f.service.handle({ ...archive(), name });
    expect(result.sha256).toBe(sha256);
    expect(notices[0]).toContain('Mirror酱下载');
    expect(await readFile(result.path)).toEqual(payload);
    expect(f.requests.some((request) => request.url.startsWith('https://github.com'))).toBe(false);
    expect(JSON.stringify(result)).not.toContain('synthetic-signed-token');
    expect(JSON.stringify(result)).not.toContain('synthetic-secret');
  });
}

for (const failure of [
  'CDK',
  'wrong version',
  'wrong hash',
  'wrong size',
  'incremental',
  'download',
  'download code',
]) {
  test(`mirror application ${failure} falls back to official bytes with a safe diagnostic`, async () => {
    const notices: string[] = [];
    const f = await fixture(
      (request) => {
        if (request.url.includes('/api/resources/maa-verge/latest')) {
          if (failure === 'CDK')
            return Response.json({ code: 7002, msg: 'synthetic-secret' }, { status: 403 });
          return Response.json({
            code: 0,
            data: {
              version_name: failure === 'wrong version' ? 'v9.9.9' : 'v0.2.0',
              os: 'windows',
              arch: 'amd64',
              channel: 'stable',
              url: 'https://mirrorchyan.com/resources/download/app?token=synthetic-signed-token',
              sha256: failure === 'wrong hash' ? 'a'.repeat(64) : sha256,
              filesize: failure === 'wrong size' ? payload.length + 1 : payload.length,
              update_type: failure === 'incremental' ? 'incremental' : 'full',
            },
          });
        }
        if (request.url.includes('mirrorchyan.com'))
          return failure === 'download code'
            ? Response.json({ code: 8009, msg: 'synthetic-secret' }, { status: 403 })
            : new Response('', { status: 403 });
        expect(request.url).toBe(archiveUrl);
        return complete(request);
      },
      {
        mirrorChyan: () => ({ enabled: true, cdk: 'synthetic-secret' }),
        mirrorChyanStatus: (text) => notices.push(text),
      },
    );
    const result: any = await f.service.handle(archive());
    expect(result.sha256).toBe(sha256);
    expect(notices[0]).toContain('已改用官方更新源');
    if (failure === 'CDK') expect(notices[0]).toContain('CDK 无效');
    if (failure === 'download code') expect(notices[0]).toContain('正式 CDK');
    expect(JSON.stringify(notices)).not.toContain('synthetic-secret');
    expect(JSON.stringify(notices)).not.toContain('synthetic-signed-token');
  });
}

test('macOS app transport keeps the signed Tauri tar archive and never substitutes the mirror DMG', async () => {
  const f = await fixture(
    (request) => {
      expect(request.url).toBe(archiveUrl.replace('x64-setup.exe', 'aarch64.app.tar.gz'));
      return complete(request);
    },
    { mirrorChyan: () => ({ enabled: true, cdk: 'synthetic-secret' }) },
  );
  const result: any = await f.service.handle({
    ...archive(),
    name: 'Maa-Verge_0.2.0_aarch64.app.tar.gz',
  });
  expect(result.sha256).toBe(sha256);
  expect(f.requests).toHaveLength(1);
});

test('host metadata constructs fixed repository URLs and forces manual redirect handling', async () => {
  const f = await fixture(() => Response.json({ ok: true }));
  expect(await f.service.handle(releases('first-page'))).toEqual({ ok: true });
  expect(await f.service.handle(releases('last-page', 10))).toEqual({ ok: true });
  expect(await f.service.handle(manifest())).toEqual({ ok: true });
  expect(f.requests.map((request) => request.url)).toEqual([
    'https://api.github.com/repos/DeathofBrain/maa-verge/releases?per_page=100&page=1',
    'https://api.github.com/repos/DeathofBrain/maa-verge/releases?per_page=100&page=10',
    manifestUrl,
  ]);
  expect(f.requests.every((request) => request.redirect === 'manual')).toBe(true);
  await assertNoInstallCandidate(f.root);
});

for (const [name, params] of [
  ['arbitrary metadata URL', { ...releases(), url: 'https://untrusted.test/private' }],
  ['arbitrary destination', { ...archive(), path: '../pending.json' }],
  ['arbitrary download URL', { ...archive(), url: 'https://untrusted.test/package' }],
  ['zero page', releases('page-zero', 0)],
  ['page beyond the limit', releases('page-eleven', 11)],
  ['fractional page', releases('fractional-page', 1.5)],
  ['string page', { ...releases(), page: '1' }],
  ['tag traversal', { ...manifest(), tag: '../another-release' }],
  ['invalid operation identity', { ...manifest(), operationId: 'unsafe/id' }],
  ['unknown operation', { operation: 'shell', operationId: 'unsafe' }],
  ['zero size', { ...archive(), size: 0 }],
  ['size beyond 1 GiB', { ...archive(), size: 1024 ** 3 + 1 }],
  ['fractional size', { ...archive(), size: 1.5 }],
  ['invalid digest', { ...archive(), digest: 'sha256:invalid' }],
  ['path in the package name', { ...archive(), name: '../installer.exe' }],
] as const) {
  test(`host transport rejects ${name} before making a request`, async () => {
    const f = await fixture(() => {
      throw new Error('transport must remain unused');
    });
    await expect(f.service.handle(params)).rejects.toMatchObject({ code: -32602 });
    expect(f.requests).toHaveLength(0);
    expect(await entries(f.directory)).toEqual([]);
  });
}

for (const patch of [
  { tag: 'v0.2.1' },
  { version: '0.2.1' },
  { name: 'Maa-Verge_0.2.1_x64-setup.exe' },
  { name: 'Maa-Verge_0.2.0_unrecognized.zip' },
]) {
  test(`host download rejects an inconsistent version or package name ${JSON.stringify(patch)}`, async () => {
    const f = await fixture(() => complete());
    await expect(f.service.handle({ ...archive(), ...patch })).rejects.toThrow('版本或文件名');
    expect(f.requests).toHaveLength(0);
  });
}

for (const destination of [
  'https://release-assets.githubusercontent.com/asset?signature=fixture',
  'https://objects.githubusercontent.com/asset?signature=fixture',
  'https://github.com/DeathofBrain/maa-verge/releases/download/v0.2.0/latest.json',
]) {
  test(`host manifest follows a trusted attachment redirect to ${new URL(destination).hostname}`, async () => {
    const f = await fixture((_request, index) =>
      index === 0
        ? new Response(null, { status: 302, headers: { location: destination } })
        : Response.json({ version: '0.2.0' }),
    );
    expect(await f.service.handle(manifest())).toEqual({ version: '0.2.0' });
    expect(f.requests.map((request) => request.url)).toEqual([manifestUrl, destination]);
  });
}

for (const destination of [
  'http://objects.githubusercontent.com/asset',
  'https://untrusted.test/asset',
  'https://github.com/another/repository/releases/download/v0.2.0/asset',
  'https://api.github.com/repos/DeathofBrain/maa-verge/releases',
  'https://127.0.0.1/private',
  'https://github.com/DeathofBrain/maa-verge/releases/download/v0.2.0/asset?override=yes',
  'https://user:fixture-password@objects.githubusercontent.com/asset',
  'https://objects.githubusercontent.com:8443/asset',
  'https://objects.githubusercontent.com/asset#fragment',
]) {
  test(`host attachment rejects an untrusted redirect ${destination}`, async () => {
    const f = await fixture(
      () => new Response(null, { status: 302, headers: { location: destination } }),
    );
    await expect(f.service.handle(manifest())).rejects.toThrow('不可信');
    expect(f.requests).toHaveLength(1);
  });
}

test('release API metadata never follows even a trusted attachment redirect', async () => {
  const f = await fixture(
    () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://objects.githubusercontent.com/release-list' },
      }),
  );
  await expect(f.service.handle(releases())).rejects.toThrow('不可信');
  expect(f.requests).toHaveLength(1);
});

for (const redirects of [5, 6]) {
  test(`host attachment ${redirects === 5 ? 'accepts five' : 'rejects six'} redirects`, async () => {
    const f = await fixture((_request, index) =>
      index < redirects
        ? new Response(null, {
            status: 302,
            headers: { location: `https://objects.githubusercontent.com/asset?hop=${index}` },
          })
        : Response.json({ ok: true }),
    );
    if (redirects === 5) expect(await f.service.handle(manifest())).toEqual({ ok: true });
    else await expect(f.service.handle(manifest())).rejects.toThrow('次数过多');
    expect(f.requests).toHaveLength(6);
  });
}

for (const failure of ['unreachable', '407', 'invalid configuration'] as const) {
  test(`automatic host metadata falls back to forced direct when its proxy is ${failure}`, async () => {
    const f = await fixture(
      (request) => {
        if (request.proxy !== false) {
          if (failure === '407') return new Response(null, { status: 407 });
          throw new Error('synthetic proxy unavailable');
        }
        return Response.json({ ok: true });
      },
      {
        resolveProxy: async () => {
          if (failure === 'invalid configuration') throw new Error('invalid proxy configuration');
          return proxyUrl;
        },
      },
    );
    expect(await f.service.handle(releases())).toEqual({ ok: true });
    expect(f.requests.map((request) => request.proxy)).toEqual(
      failure === 'invalid configuration'
        ? [false]
        : [{ url: proxyUrl, respectNoProxy: true }, false],
    );
  });
}

for (const failure of ['unreachable', '407'] as const) {
  test(`manual host metadata reports ${failure} without downloading directly or leaking credentials`, async () => {
    const f = await fixture(
      () => {
        if (failure === '407') return new Response(null, { status: 407 });
        throw new Error('cannot reach http://user:fixture-password@proxy.fixture:7890');
      },
      {},
      { mode: 'manual', url: 'http://user:fixture-password@proxy.fixture:7890' },
    );
    let failureMessage = '';
    try {
      await f.service.handle(releases());
      throw new Error('expected manual proxy failure');
    } catch (error) {
      failureMessage = String(error);
      expect(error).toMatchObject({ code: -32040 });
      expect(JSON.stringify(error)).not.toContain('fixture-password');
      expect((error as Error).cause).toBeUndefined();
    }
    expect(failureMessage).toMatch(/手动.*代理/);
    expect(failureMessage).not.toContain('fixture-password');
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0].proxy).toEqual({
      url: 'http://user:fixture-password@proxy.fixture:7890/',
      respectNoProxy: false,
    });
  });
}

test('direct host requests skip proxy resolution and force proxy:false', async () => {
  let resolutions = 0;
  const f = await fixture(
    () => Response.json({ ok: true }),
    {
      resolveProxy: async () => {
        resolutions++;
        return proxyUrl;
      },
    },
    { mode: 'direct', url: '' },
  );
  expect(await f.service.handle(releases())).toEqual({ ok: true });
  expect(resolutions).toBe(0);
  expect(f.requests.map((request) => request.proxy)).toEqual([false]);
});

test('restricted host metadata retains the automatic proxy body recovery hook', async () => {
  const f = await fixture(
    (request) =>
      request.proxy === false ? Response.json({ recovered: true }) : interrupted(0, 100),
    { resolveProxy: async () => proxyUrl },
  );
  expect(await f.service.handle(manifest())).toEqual({ recovered: true });
  expect(f.requests.map((request) => request.proxy)).toEqual([
    { url: proxyUrl, respectNoProxy: true },
    false,
  ]);
  expect(f.requests.map((request) => request.url)).toEqual([manifestUrl, manifestUrl]);
});

for (const failure of ['invalid JSON', 'declared oversize', 'streamed oversize'] as const) {
  test(`host metadata ${failure} does not trigger automatic direct fallback`, async () => {
    const f = await fixture(
      () => {
        if (failure === 'invalid JSON') return new Response('{invalid JSON');
        if (failure === 'declared oversize')
          return new Response('{}', { headers: { 'content-length': String(4 * 1024 ** 2 + 1) } });
        return new Response(' '.repeat(4 * 1024 ** 2 + 1));
      },
      { resolveProxy: async () => proxyUrl },
    );
    await expect(f.service.handle(manifest())).rejects.toThrow(
      failure === 'invalid JSON' ? 'JSON' : '大小限制',
    );
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0].proxy).toEqual({ url: proxyUrl, respectNoProxy: true });
  });
}

test('host metadata allows a JSON result of exactly 3 MiB on the wire', async () => {
  const value = 'x'.repeat(3 * 1024 ** 2 - 2);
  const f = await fixture(() => Response.json(value));
  expect(await f.service.handle(manifest())).toBe(value);
  expect(f.requests).toHaveLength(1);
});

for (const value of ['x'.repeat(3 * 1024 ** 2 - 1), '汉'.repeat(1024 ** 2)]) {
  test(`host metadata rejects a serialized result above 3 MiB (${value[0]})`, async () => {
    const f = await fixture(() => Response.json(value), { resolveProxy: async () => proxyUrl });
    await expect(f.service.handle(manifest())).rejects.toThrow('本地传输大小限制');
    expect(f.requests).toHaveLength(1);
  });
}

test('host archive downloads use a private cache and return only completed transport metadata', async () => {
  const f = await fixture((request) => complete(request));
  const result = (await f.service.handle(archive())) as {
    path: string;
    size: number;
    sha256: string;
  };
  expect(f.requests.map((request) => request.url)).toEqual([archiveUrl]);
  expect(path.dirname(result.path)).toBe(f.directory);
  expect(path.basename(result.path)).toMatch(/^[a-f0-9]{64}\.bin$/);
  expect(result.size).toBe(payload.length);
  expect(result.sha256).toBe(sha256);
  expect(await readFile(result.path)).toEqual(payload);
  expect((await entries(f.directory)).filter((name) => name.includes('.partial'))).toEqual([]);
  expect(f.progress.length).toBeGreaterThan(0);
  expect(f.progress.every((entry) => entry.operationId === 'archive-download')).toBe(true);
  await assertNoInstallCandidate(f.root);
});

test('host archives still compute a digest when the release does not supply one', async () => {
  const f = await fixture((request) => complete(request));
  const { digest: _digest, ...params } = archive();
  const result = (await f.service.handle(params)) as { path: string; sha256: string };
  expect(result.sha256).toBe(sha256);
  expect(await readFile(result.path)).toEqual(payload);
  await assertNoInstallCandidate(f.root);
});

test('host archive progress forwards measured transfer speed with its operation identity', async () => {
  let offset = 0;
  const f = await fixture(
    () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            async pull(controller) {
              if (offset === payload.length) {
                controller.close();
                return;
              }
              await Bun.sleep(280);
              const end = Math.min(offset + payload.length / 2, payload.length);
              controller.enqueue(payload.subarray(offset, end));
              offset = end;
            },
          },
          { highWaterMark: 0 },
        ),
        { headers: { 'content-length': String(payload.length), etag: '"app-v1"' } },
      ),
  );
  await f.service.handle(archive('speed-download'));
  const measured = f.progress.filter((entry) => entry.downloadSpeedBytesPerSecond !== undefined);
  expect(measured.some((entry) => entry.downloadSpeedBytesPerSecond! > 0)).toBe(true);
  expect(measured.every((entry) => Number.isFinite(entry.downloadSpeedBytesPerSecond))).toBe(true);
  expect(f.progress.every((entry) => entry.operationId === 'speed-download')).toBe(true);
  expect(f.progress[0].downloadSpeedBytesPerSecond).toBe(0);
  expect(f.progress.at(-1)?.downloadSpeedBytesPerSecond).toBeUndefined();
});

test('automatic archive body interruption resumes directly with Range and If-Range', async () => {
  const f = await fixture(
    (request) => (request.proxy === false ? complete(request) : interrupted(0, 4096)),
    { resolveProxy: async () => proxyUrl },
  );
  const result = (await f.service.handle(archive())) as { path: string; sha256: string };
  expect(result.sha256).toBe(sha256);
  expect(await readFile(result.path)).toEqual(payload);
  expect(f.requests.map((request) => request.proxy)).toEqual([
    { url: proxyUrl, respectNoProxy: true },
    false,
  ]);
  expect(f.requests[1].headers.get('range')).toBe('bytes=4096-');
  expect(f.requests[1].headers.get('if-range')).toBe('"app-v1"');
});

test('archive redirects preserve Range headers and proxy body recovery across a trusted CDN', async () => {
  const cdn = 'https://release-assets.githubusercontent.com/app?signature=fixture';
  const f = await fixture(
    (request) => {
      if (request.url === archiveUrl)
        return new Response(null, { status: 302, headers: { location: cdn } });
      return request.proxy === false ? complete(request) : interrupted(0, 4096);
    },
    { resolveProxy: async () => proxyUrl },
  );
  const result = (await f.service.handle(archive())) as { path: string };
  expect(await readFile(result.path)).toEqual(payload);
  expect(f.requests.map((request) => request.url)).toEqual([archiveUrl, cdn, archiveUrl, cdn]);
  expect(f.requests.map((request) => request.headers.get('range'))).toEqual([
    null,
    null,
    'bytes=4096-',
    'bytes=4096-',
  ]);
  expect(f.requests.map((request) => request.proxy)).toEqual([
    { url: proxyUrl, respectNoProxy: true },
    { url: proxyUrl, respectNoProxy: true },
    false,
    false,
  ]);
});

test('archive source rejection does not retry directly or leave a reusable partial', async () => {
  const f = await fixture(
    () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://untrusted.test/installer.exe' },
      }),
    { resolveProxy: async () => proxyUrl },
  );
  await expect(f.service.handle(archive())).rejects.toThrow('不可信');
  expect(f.requests).toHaveLength(1);
  expect(await entries(f.directory)).toEqual([]);
  await assertNoInstallCandidate(f.root);
});

for (const mode of ['direct', 'manual'] as const) {
  test(`${mode} archive survives three interrupted attempts and resumes on a later host request`, async () => {
    const f = await fixture(
      (request, index) => {
        const offset = Number(/^bytes=(\d+)-$/.exec(request.headers.get('range') ?? '')?.[1] ?? 0);
        return index < 3 ? interrupted(offset, offset + 16_000) : complete(request);
      },
      {},
      { mode, url: mode === 'manual' ? proxyUrl : '' },
    );
    await expect(f.service.handle(archive('first-attempt'))).rejects.toThrow(
      mode === 'manual' ? '手动代理下载中断' : 'transport disconnected',
    );
    const partial = (await entries(f.directory)).find((name) => name.endsWith('.partial'))!;
    expect(partial).toBeDefined();
    expect((await stat(path.join(f.directory, partial))).size).toBe(48_000);
    await assertNoInstallCandidate(f.root);
    f.service.close();
    const result = (await f.createService().handle(archive('user-retry'))) as { path: string };
    expect(await readFile(result.path)).toEqual(payload);
    expect(f.requests.map((request) => request.headers.get('range'))).toEqual([
      null,
      'bytes=16000-',
      'bytes=32000-',
      'bytes=48000-',
    ]);
    expect(
      f.requests.slice(1).every((request) => request.headers.get('if-range') === '"app-v1"'),
    ).toBe(true);
    expect(f.requests.map((request) => request.proxy)).toEqual(
      Array.from({ length: 4 }, () =>
        mode === 'manual' ? { url: proxyUrl, respectNoProxy: false } : false,
      ),
    );
    await assertNoInstallCandidate(f.root);
  });
}

test('changed archive validators reject and discard partial bytes before a fresh request', async () => {
  const f = await fixture((request, index) =>
    index === 0 ? interrupted(0, 16_000) : complete(request, index === 1 ? '"app-v2"' : '"app-v1"'),
  );
  await expect(f.service.handle(archive())).rejects.toThrow('续传版本或大小已变化');
  expect(f.requests).toHaveLength(2);
  expect(await entries(f.directory)).toEqual([]);
  const result = (await f.service.handle(archive('fresh-download'))) as { path: string };
  expect(f.requests[2].headers.get('range')).toBeNull();
  expect(await readFile(result.path)).toEqual(payload);
});

test('archive digest failure never creates a completed transport file or an install candidate', async () => {
  const f = await fixture((request) => complete(request), { resolveProxy: async () => proxyUrl });
  await expect(
    f.service.handle({ ...archive(), digest: 'sha256:' + '0'.repeat(64) }),
  ).rejects.toThrow('SHA-256');
  expect(f.requests).toHaveLength(1);
  expect(await entries(f.directory)).toEqual([]);
  await assertNoInstallCandidate(f.root);
});

test('a matching cancel cleans a completed transport file without producing an install candidate', async () => {
  const f = await fixture((request) => complete(request));
  const result = (await f.service.handle(archive('completed-download'))) as { path: string };
  expect(await f.service.handle({ operation: 'cancel', operationId: 'another-download' })).toEqual({
    cancelled: false,
  });
  expect(await Bun.file(result.path).exists()).toBe(true);
  expect(
    await f.service.handle({ operation: 'cancel', operationId: 'completed-download' }),
  ).toEqual({ cancelled: true });
  expect(await Bun.file(result.path).exists()).toBe(false);
  expect(
    await f.service.handle({ operation: 'cancel', operationId: 'completed-download' }),
  ).toEqual({ cancelled: false });
  await assertNoInstallCandidate(f.root);
});

for (const action of ['cancel', 'close'] as const) {
  test(`${action} aborts metadata while waiting for headers without a direct fallback`, async () => {
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const f = await fixture(
      (request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal!.addEventListener('abort', () => reject(request.signal!.reason), {
            once: true,
          });
          entered();
        }),
      { resolveProxy: async () => proxyUrl },
    );
    const pending = f.service.handle(releases('waiting-metadata'));
    void pending.catch(() => {});
    await waiting;
    await expect(f.service.handle(manifest('concurrent-request'))).rejects.toMatchObject({
      code: -32021,
    });
    const started = performance.now();
    if (action === 'cancel') {
      expect(await f.service.handle({ operation: 'cancel', operationId: 'another-job' })).toEqual({
        cancelled: false,
      });
      expect(
        await f.service.handle({ operation: 'cancel', operationId: 'waiting-metadata' }),
      ).toEqual({ cancelled: true });
    } else f.service.close();
    await expect(pending).rejects.toThrow(action === 'cancel' ? '已取消' : '正在关闭');
    expect(performance.now() - started).toBeLessThan(1000);
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0].signal!.aborted).toBe(true);
    await assertNoInstallCandidate(f.root);
    if (action === 'close')
      await expect(f.service.handle(manifest())).rejects.toMatchObject({ code: -32011 });
  });

  test(`${action} aborts archive body reads and retains only a resumable partial`, async () => {
    let reading!: () => void;
    const waiting = new Promise<void>((resolve) => {
      reading = resolve;
    });
    let cancelled = false;
    const f = await fixture(() => {
      let sent = false;
      return new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              if (!sent) {
                sent = true;
                controller.enqueue(payload.subarray(0, 4096));
              } else {
                reading();
                return new Promise<void>(() => {});
              }
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        ),
        { headers: { etag: '"app-v1"', 'content-length': String(payload.length) } },
      );
    });
    const pending = f.service.handle(archive('reading-archive'));
    void pending.catch(() => {});
    await waiting;
    const started = performance.now();
    if (action === 'cancel')
      expect(
        await f.service.handle({ operation: 'cancel', operationId: 'reading-archive' }),
      ).toEqual({ cancelled: true });
    else f.service.close();
    await expect(pending).rejects.toThrow(action === 'cancel' ? '已取消' : '正在关闭');
    expect(performance.now() - started).toBeLessThan(1000);
    expect(cancelled).toBe(true);
    expect(f.requests).toHaveLength(1);
    const files = await entries(f.directory);
    expect(files.some((name) => name.endsWith('.bin'))).toBe(false);
    const partial = files.find((name) => name.endsWith('.partial'))!;
    expect((await stat(path.join(f.directory, partial))).size).toBe(4096);
    await assertNoInstallCandidate(f.root);
  });
}

test('a settings getter changes routing on the next host operation', async () => {
  let resolutions = 0;
  const f = await fixture(
    () => Response.json({ ok: true }),
    {
      resolveProxy: async () => {
        resolutions++;
        return proxyUrl;
      },
    },
    { mode: 'manual', url: '127.0.0.1:7891' },
  );
  await f.service.handle(releases('manual-operation'));
  f.setPreferences({ mode: 'direct', url: '' });
  await f.service.handle(releases('direct-operation'));
  f.setPreferences(undefined);
  await f.service.handle(releases('automatic-operation'));
  expect(f.requests.map((request) => request.proxy)).toEqual([
    { url: 'http://127.0.0.1:7891/', respectNoProxy: false },
    false,
    { url: proxyUrl, respectNoProxy: true },
  ]);
  expect(resolutions).toBe(1);
});
