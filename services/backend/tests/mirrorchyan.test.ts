import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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

const secret = 'synthetic+cdk&private=value';
const signed = 'https://mirrorchyan.com/resources/download/fixture?token=private-download-token';
const timestamp = '2026-10-29 11:10:43.000';
const older = '2026-10-28 11:10:43.000';
const settings = () => ({ enabled: true, cdk: secret });
const roots: string[] = [];
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function temp() {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-mirror-'));
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

function sourceFixture(
  resourceMode: 'valid' | 'timestamp mismatch' | 'incremental' | 'download failure' = 'valid',
) {
  const core = zipBytes([
    { name: 'MaaCore.dll', content: 'v6.20.1' },
    { name: 'resource/version.json', content: JSON.stringify({ last_updated: older }) },
    { name: 'resource/config.json', content: 'base' },
    { name: 'MAA.exe', content: 'excluded GUI' },
  ]);
  const resourceFor = (version: string) =>
    zipBytes([
      {
        name: 'resource/version.json',
        content: JSON.stringify({
          last_updated: resourceMode === 'timestamp mismatch' ? older : version,
        }),
      },
      { name: 'resource/new.txt', content: 'resource update' },
      ...(resourceMode === 'incremental' ? [{ name: 'changes.json', content: '{}' }] : []),
    ]);
  let resource = resourceFor(timestamp);
  const official = zipBytes([
    {
      name: 'snapshot/resource/version.json',
      content: JSON.stringify({ last_updated: timestamp }),
    },
    { name: 'snapshot/resource/new.txt', content: 'official update' },
  ]);
  const urls: string[] = [];
  let active = core;
  let resourceVersion = timestamp;
  const transport = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/api/resources/MAA/latest')) {
      active = core;
      return latest('v6.20.1', core, { os: 'windows', arch: 'amd64' });
    }
    if (url.includes('/api/resources/MaaResource/latest')) {
      active = resource;
      return latest(resourceVersion, resource);
    }
    if (url === signed) {
      if (resourceMode === 'download failure' && active === resource)
        return new Response('', { status: 403 });
      return new Response(Uint8Array.from(active), {
        headers: { 'content-length': String(active.length) },
      });
    }
    if (url.endsWith('/commits/main')) return Response.json({ sha: 'a'.repeat(40) });
    if (url.includes('raw.githubusercontent.com'))
      return Response.json({ last_updated: timestamp });
    if (url.includes('codeload.github.com')) return new Response(Uint8Array.from(official));
    throw new Error('Unexpected fixture route');
  }) as unknown as typeof fetch;
  const source = new OfficialSource(
    transport,
    () => ({ mode: 'direct', url: '' }),
    settings,
    () => ({ os: 'windows', arch: 'amd64' }),
  );
  return {
    source,
    urls,
    setResourceTimestamp(value: string) {
      resourceVersion = value;
      resource = resourceFor(value);
    },
  };
}
async function initialized(resourceMode: Parameters<typeof sourceFixture>[0] = 'valid') {
  const root = await temp();
  const store = new MemoryStore();
  const fixture = sourceFixture(resourceMode);
  let busy = false;
  const updates = new UpdateService(
    root,
    store,
    () => {},
    () => busy,
    {
      source: fixture.source,
      validator: async () => {},
      jobRunner: (config) =>
        runUpdateJob(config, async (_core, _resource, version) => {
          expect(version).toBe('v6.20.1');
        }),
    },
  );
  await updates.check('core');
  await updates.prepare('core');
  await updates.activate('core');
  return {
    ...fixture,
    root,
    store,
    updates,
    setBusy(value: boolean) {
      busy = value;
    },
  };
}

test('core and resource select independent full mirror packages and stage immutable validated generations', async () => {
  const f = await initialized();
  try {
    const core = f.store.get('active', 'combo').core;
    expect(core.source).toBe('MirrorChyan');
    expect(await Bun.file(path.join(core.path, 'MAA.exe')).exists()).toBe(false);
    await f.updates.check('resource');
    await f.updates.prepare('resource');
    await f.updates.activate('resource');
    const resource = f.store.get('active', 'combo').resource;
    expect(resource.version).toBe('mirrorchyan:' + timestamp);
    expect(resource.commit).toBeUndefined();
    expect(resource.resourceVersion.last_updated).toBe(timestamp);
    expect(await readFile(path.join(resource.path, 'resource/config.json'), 'utf8')).toBe('base');
    expect(await readFile(path.join(resource.path, 'resource/new.txt'), 'utf8')).toBe(
      'resource update',
    );
    const manifest = await readFile(path.join(resource.path, 'manifest.json'), 'utf8');
    expect(manifest).not.toContain('private-download-token');
    expect(manifest).not.toContain(secret);
    expect(f.urls.some((url) => url.includes('github.com'))).toBe(false);
    expect((await f.updates.check('resource')).status).toBe('idle');
  } finally {
    await f.updates.close();
  }
});

test.each(['timestamp mismatch', 'incremental', 'download failure'] as const)(
  'resource %s falls back to a fresh official source without keeping partial candidates',
  async (mode) => {
    const f = await initialized(mode);
    try {
      const core = f.store.get('active', 'combo').core.path;
      await f.updates.check('resource');
      const result = await f.updates.prepare('resource');
      const staged = f.store.get('staged', 'resource');
      expect(staged.source).toBe('GitHub');
      expect(staged.version).toBe('a'.repeat(40));
      expect(staged.mirrorChyan).toBeUndefined();
      expect(result.latestVersion).toBe('a'.repeat(40));
      expect(result.message).toContain('已改用官方更新源');
      expect(await readFile(path.join(staged.path, 'resource/new.txt'), 'utf8')).toBe(
        'official update',
      );
      expect(f.store.get('active', 'combo').core.path).toBe(core);
      expect((await readdir(path.join(f.root, 'generations'))).length).toBe(2);
    } finally {
      await f.updates.close();
    }
  },
);

test('equal resource timestamps do not update again when switching between mirror and Git commit identities', async () => {
  const f = await initialized();
  try {
    await f.updates.check('resource');
    await f.updates.prepare('resource');
    await f.updates.activate('resource');
    const original = f.store.get('active', 'combo');
    original.resource.version = 'a'.repeat(40);
    original.resource.source = 'GitHub';
    f.store.put('active', 'combo', original);
    const check = await f.updates.check('resource');
    expect(check.status).toBe('idle');
    const count = f.urls.length;
    await f.updates.prepare('resource');
    expect(f.urls.length).toBe(count);
    expect(f.store.get('staged', 'resource')).toBeUndefined();
  } finally {
    await f.updates.close();
  }
});

test('a lagging mirror checks the official source and never downgrades the installed resource snapshot', async () => {
  const f = await initialized();
  try {
    await f.updates.check('resource');
    await f.updates.prepare('resource');
    await f.updates.activate('resource');
    const original = f.store.get('active', 'combo').resource.path;
    f.setResourceTimestamp(older);
    const check = await f.updates.check('resource');
    expect(check.status).toBe('idle');
    expect(check.message).toContain('早于已安装版本');
    expect(check.message).toContain('已改用官方更新源');
    const count = f.urls.length;
    await f.updates.prepare('resource');
    expect(f.urls.length).toBe(count);
    expect(f.store.get('active', 'combo').resource.path).toBe(original);
  } finally {
    await f.updates.close();
  }
});

test('downloaded mirror resources are reused after rollback without another download', async () => {
  const f = await initialized();
  try {
    await f.updates.check('resource');
    await f.updates.prepare('resource');
    await f.updates.activate('resource');
    f.setResourceTimestamp('2026-10-30 11:10:43.000');
    await f.updates.check('resource');
    await f.updates.prepare('resource');
    await f.updates.activate('resource');
    const second = f.store.get('active', 'combo').resource.path;
    await f.updates.rollback('resource');
    await f.updates.check('resource');
    const calls = f.urls.length;
    await f.updates.prepare('resource');
    expect(f.urls.length).toBe(calls);
    expect(f.store.get('staged', 'resource').path).toBe(second);
  } finally {
    await f.updates.close();
  }
});

test.each([false, true])(
  'resource activation rejects a candidate overtaken by rollback (waiting idle=%s)',
  async (waiting) => {
    const f = await initialized();
    try {
      await f.updates.check('resource');
      await f.updates.prepare('resource');
      await f.updates.activate('resource');
      f.setResourceTimestamp('2026-11-01 11:10:43.000');
      await f.updates.check('resource');
      await f.updates.prepare('resource');
      await f.updates.activate('resource');
      const newest = f.store.get('active', 'combo').resource.path;
      await f.updates.rollback('resource');
      f.setResourceTimestamp('2026-10-30 11:10:43.000');
      await f.updates.check('resource');
      await f.updates.prepare('resource');
      if (waiting) {
        f.setBusy(true);
        expect((await f.updates.activate('resource')).status).toBe('waiting_idle');
        f.setBusy(false);
      }
      await f.updates.rollback('resource');
      expect(f.store.get('active', 'combo').resource.path).toBe(newest);
      await expect(f.updates.activate('resource')).rejects.toThrow('候选资源早于当前版本');
      expect(f.store.get('active', 'combo').resource.path).toBe(newest);
      expect(f.store.get('staged', 'resource')).toBeUndefined();
    } finally {
      await f.updates.close();
    }
  },
);
