import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  MirrorChyanClient,
  MirrorChyanError,
  mirrorChyanFull,
  mirrorChyanSource,
  type MirrorChyanIdentity,
} from '@backend/modules/updates/mirrorchyan';
import {
  OfficialSource,
  runUpdateJob,
  UpdateService,
  type UpdateStore,
} from '@backend/modules/updates/updates';
import { parseSettings } from '@backend/modules/settings/models';
import { zipBytes } from './archive-fixture';
import { baseResourceFiles } from './resource-update-fixture';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';

const secret = 'synthetic+cdk&private=value';
const signed = 'https://mirrorchyan.com/resources/download/fixture?token=private-download-token';
const timestamp = '2026-10-29 11:10:43.000';
const older = '2026-10-28 11:10:43.000';
const settings = () => ({ enabled: true, cdk: secret });
const roots: string[] = [];
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function temp() {
  const root = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-mirror-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
function latest(version = timestamp, payload?: Buffer, extra: Record<string, unknown> = {}) {
  return Response.json({
    code: 0,
    data: {
      version_name: version,
      version_number: 12,
      os: '',
      arch: '',
      channel: 'stable',
      ...(payload
        ? { url: signed, sha256: digest(payload), filesize: payload.length, update_type: 'full' }
        : {}),
      ...extra,
    },
  });
}
class MemoryStore implements UpdateStore {
  rows = new Map<string, any>();
  get(kind: string, id: string, fallback?: any) {
    return structuredClone(
      this.rows.has(kind + '|' + id) ? this.rows.get(kind + '|' + id) : fallback,
    );
  }
  put(kind: string, id: string, value: any) {
    this.rows.set(kind + '|' + id, structuredClone(value));
  }
  delete(kind: string, id: string) {
    this.rows.delete(kind + '|' + id);
  }
  all(kind: string) {
    return [...this.rows]
      .filter(([key]) => key.startsWith(kind + '|'))
      .map(([, value]) => structuredClone(value));
  }
}

test('settings persist a shared trimmed CDK, keep defaults and reject multiline input', () => {
  expect(parseSettings().mirrorChyan).toEqual({ enabled: true, cdk: '' });
  expect(
    parseSettings({ mirrorChyan: { cdk: '  fixture  ', enabled: false } }).mirrorChyan,
  ).toEqual({ enabled: false, cdk: 'fixture' });
  expect(() => parseSettings({ mirrorChyan: { enabled: true, cdk: 'private\nvalue' } })).toThrow();
});

test('full API queries encode credentials, omit resource platforms and prevent redirects', async () => {
  let requested!: URL;
  const client = new MirrorChyanClient(settings, (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    requested = new URL(String(input));
    expect(init?.redirect).toBe('manual');
    return latest();
  }) as unknown as typeof fetch);
  const release = await client.latest('MaaResource');
  expect(requested.pathname).toBe('/api/resources/MaaResource/latest');
  expect(requested.searchParams.get('cdk')).toBe(secret);
  expect(requested.searchParams.get('current_version')).toBe('0');
  expect(requested.searchParams.get('user_agent')).toBe('MaaVerge');
  expect(requested.searchParams.has('os')).toBe(false);
  expect(requested.searchParams.has('arch')).toBe(false);
  expect(release.version).toBe(timestamp);
  expect(mirrorChyanFull(release)).toBe(false);
});

test('checking without a CDK returns metadata and never sends an empty credential', async () => {
  const client = new MirrorChyanClient(() => ({ enabled: true, cdk: '' }), (async (
    input: Parameters<typeof fetch>[0],
  ) => {
    expect(new URL(String(input)).searchParams.has('cdk')).toBe(false);
    return latest();
  }) as unknown as typeof fetch);
  expect((await client.latest('MaaResource')).url).toBeUndefined();
});

test.each([7001, 7002, 7003, 7004, 7005, 8001, 8002, 8003, 8004, 8009, 1, -1])(
  'API error %s uses a static diagnostic without server messages or credential URLs',
  async (code) => {
    const client = new MirrorChyanClient(settings, (async () =>
      Response.json({ code, msg: secret + signed }, { status: 403 })) as unknown as typeof fetch);
    try {
      await client.latest('MaaResource');
      throw new Error('expected error');
    } catch (error) {
      expect(error).toBeInstanceOf(MirrorChyanError);
      expect((error as MirrorChyanError).code).toBe(code);
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain('token=');
      expect((error as Error).cause).toBeUndefined();
    }
  },
);

test.each([
  'redirect',
  'invalid JSON',
  'oversize',
  'wrong platform',
  'untrusted download',
  'network',
])('API rejects %s without exposing secrets', async (kind) => {
  const client = new MirrorChyanClient(settings, (async () => {
    if (kind === 'network') throw new Error(secret + signed);
    if (kind === 'redirect')
      return new Response('', { status: 302, headers: { location: 'https://other.example/' } });
    if (kind === 'invalid JSON') return new Response(secret);
    if (kind === 'oversize') return new Response('x'.repeat(256 * 1024 + 1));
    if (kind === 'wrong platform')
      return latest(timestamp, undefined, { os: 'windows', arch: 'amd64' });
    return latest(timestamp, Buffer.from('fixture'), { url: 'https://untrusted.example/file' });
  }) as unknown as typeof fetch);
  await expect(client.latest('MaaResource')).rejects.toThrow('Mirror酱');
});

test('API timeout is bounded and disabled settings make no requests', async () => {
  const transport = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) =>
    new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error(secret)), { once: true });
    })) as unknown as typeof fetch;
  const client = new MirrorChyanClient(settings, transport, undefined, 10);
  await expect(client.latest('MaaResource')).rejects.toThrow('Mirror酱');
  const disabled = new MirrorChyanClient(() => ({ enabled: false, cdk: secret }), (() => {
    throw new Error('must not request');
  }) as unknown as typeof fetch);
  await expect(disabled.latest('MaaResource')).rejects.toThrow('Mirror酱');
});

test('download business errors retain safe codes without network retries', async () => {
  const root = await temp();
  const payload = Buffer.from('full snapshot');
  let calls = 0;
  const client = new MirrorChyanClient(settings, (async () => {
    calls++;
    return Response.json({ code: 8009, msg: secret + signed }, { status: 503 });
  }) as unknown as typeof fetch);
  const identity: MirrorChyanIdentity = {
    rid: 'MaaResource',
    channel: 'stable',
    version: timestamp,
  };
  const release = {
    ...identity,
    url: signed,
    full: true,
    size: payload.length,
    digest: 'sha256:' + digest(payload),
  };
  try {
    await client.download(
      release,
      {
        version: timestamp,
        url: mirrorChyanSource(identity),
        size: payload.length,
        digest: release.digest,
      },
      path.join(root, 'resource.zip'),
      () => {},
      { retryDelaysMs: [0, 0] },
    );
    throw new Error('expected error');
  } catch (error) {
    expect(error).toBeInstanceOf(MirrorChyanError);
    expect((error as MirrorChyanError).code).toBe(8009);
    expect(String(error)).toContain('正式 CDK');
    expect(String(error)).not.toContain(secret);
    expect(calls).toBe(1);
  }
});

test('interrupted mirror downloads persist stable resume identities without signed URLs', async () => {
  const root = await temp();
  const payload = Buffer.from('full snapshot fixture');
  const client = new MirrorChyanClient(settings, (async () => {
    let sent = false;
    return new Response(
      new ReadableStream(
        {
          pull(controller) {
            if (!sent) {
              sent = true;
              controller.enqueue(payload.subarray(0, 5));
            } else controller.error(new Error(secret + signed));
          },
        },
        { highWaterMark: 0 },
      ),
      { headers: { 'content-length': String(payload.length), etag: '"fixture"' } },
    );
  }) as unknown as typeof fetch);
  const identity: MirrorChyanIdentity = {
    rid: 'MaaResource',
    channel: 'stable',
    version: timestamp,
  };
  const release = {
    ...identity,
    url: signed,
    full: true,
    size: payload.length,
    digest: 'sha256:' + digest(payload),
  };
  const destination = path.join(root, 'resource.zip');
  await expect(
    client.download(
      release,
      {
        version: 'mirrorchyan:' + timestamp,
        url: mirrorChyanSource(identity),
        size: payload.length,
        digest: release.digest,
      },
      destination,
      () => {},
      { retryDelaysMs: [] },
    ),
  ).rejects.toThrow('Mirror酱');
  const sidecar = await readFile(destination + '.partial.json', 'utf8');
  expect(sidecar).toContain('MaaResource');
  expect(sidecar).not.toContain('private-download-token');
  expect(sidecar).not.toContain(secret);
});

/** Resource acceleration selects only the existing official MaaResource RID. */
test('resource checks omit platform and pin the independent source model baseline', async () => {
  const urls: string[] = [];
  const payload = zipBytes([{ name: 'resource/version.json', content: '{}' }]);
  const source = new OfficialSource(
    (async (input) => {
      const url = new URL(String(input));
      urls.push(url.href);
      expect(url.pathname).toBe('/api/resources/MaaResource/latest');
      expect(url.searchParams.has('os')).toBe(false);
      expect(url.searchParams.has('arch')).toBe(false);
      return latest(timestamp, payload);
    }) as typeof fetch,
    () => ({ mode: 'direct', url: '' }),
    settings,
  );
  const metadata = await source.check('resource');
  expect(metadata.source).toBe('MirrorChyan');
  expect(metadata.mirrorChyan.rid).toBe('MaaResource');
  expect(metadata.base.url).toContain('/MaaAssistantArknights/zip/');
  expect(JSON.stringify(metadata)).not.toContain(secret);
  expect(urls).toHaveLength(1);
  source.close();
});

test.each(['changed candidate', 'damaged archive', 'wrong resource timestamp'])(
  'resource preparation falls back from a %s and preserves the independent model baseline',
  async (failure) => {
    const root = await temp(),
      store = new MemoryStore(),
      version = 'c'.repeat(40),
      base = zipBytes(baseResourceFiles),
      overlay = zipBytes([
        { name: 'resource/version.json', content: JSON.stringify({ last_updated: timestamp }) },
      ]),
      mirrorPayload = zipBytes([
        {
          name: 'resource/version.json',
          content: JSON.stringify({
            last_updated: failure === 'wrong resource timestamp' ? older : timestamp,
          }),
        },
      ]);
    let mirrorChecks = 0;
    const requests: string[] = [];
    const source = new OfficialSource(
      (async (input) => {
        const url = new URL(String(input));
        requests.push(url.hostname + url.pathname);
        if (url.pathname === '/api/resources/MaaResource/latest') {
          mirrorChecks++;
          return latest(
            failure === 'changed candidate' && mirrorChecks > 1 ? older : timestamp,
            mirrorPayload,
          );
        }
        if (url.hostname === 'mirrorchyan.com')
          return new Response(
            Uint8Array.from(
              failure === 'damaged archive' ? Buffer.alloc(mirrorPayload.length) : mirrorPayload,
            ),
          );
        if (url.hostname === 'api.github.com') return Response.json({ sha: version });
        if (url.hostname === 'raw.githubusercontent.com')
          return Response.json({ last_updated: timestamp });
        if (url.hostname === 'codeload.github.com')
          return new Response(
            Uint8Array.from(url.pathname.includes('/MaaResource/') ? overlay : base),
          );
        throw new Error('network forbidden');
      }) as typeof fetch,
      () => ({ mode: 'direct', url: '' }),
      settings,
    );
    const updates = new UpdateService(
      root,
      store,
      () => {},
      () => false,
      {
        source,
        jobRunner: (config) => runUpdateJob(config),
        directories: { resource: root },
      },
    );
    try {
      await updates.check('resource');
      expect(store.get('update_metadata', 'resource').source).toBe('MirrorChyan');
      expect((await updates.prepare('resource')).latestVersion).toBe(version);
      const staged = store.get('staged', 'resource');
      expect(staged.source).toBe('GitHub');
      expect(staged.baseArchiveSha256).toBe(digest(base));
      expect(
        await readFile(path.join(staged.path, 'resource/PaddleOCR/rec/keys.txt'), 'utf8'),
      ).toBe('synthetic keys');
      expect(requests.filter((url) => url.startsWith('api.github.com/'))).toHaveLength(1);
      expect(JSON.stringify([...store.rows])).not.toContain(secret);
      expect(JSON.stringify(staged)).not.toContain('private-download-token');
      expect(await readdir(path.join(root, 'downloads'))).toEqual([]);
    } finally {
      await updates.close();
    }
  },
);

test.each(['resolved', 'rejected'])(
  'a changed Mirror preference discards an old check that %s',
  async (outcome) => {
    const root = await temp(),
      store = new MemoryStore();
    let started!: () => void, resolveOld!: (value: any) => void, rejectOld!: (error: Error) => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const old = new Promise<any>((resolve, reject) => {
      resolveOld = resolve;
      rejectOld = reject;
    });
    let checks = 0;
    const updates = new UpdateService(
      root,
      store,
      () => {},
      () => false,
      {
        source: {
          check() {
            if (++checks === 1) {
              started();
              return old;
            }
            return { version: 'b'.repeat(40), source: 'GitHub' };
          },
          download() {
            throw new Error('download forbidden');
          },
        },
      },
    );
    try {
      const pending = updates.check('resource');
      await ready;
      updates.mirrorSettingsChanged();
      if (outcome === 'resolved') resolveOld({ version: 'a'.repeat(40) });
      else rejectOld(new Error('old failure'));
      expect((await pending).latestVersion).toBe('b'.repeat(40));
      expect(checks).toBe(2);
    } finally {
      await updates.close();
    }
  },
);
