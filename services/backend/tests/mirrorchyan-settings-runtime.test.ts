import { expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function componentFixture(
  options: {
    beforeCheck?: (index: number) => Promise<void>;
    beforeDownload?: () => Promise<void>;
    officialFallback?: boolean;
  } = {},
) {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-mirror-candidate-'));
  const checks: string[] = [],
    downloads: string[] = [];
  const runtime = new Runtime(root, {
    calendar: { fetcher: null },
    validator: async () => {},
    source: {
      check: async (channel: string) => {
        const mirror = runtime.snapshot().settings.mirrorChyan;
        const source = mirror?.enabled && mirror.cdk ? 'MirrorChyan' : 'GitHub';
        checks.push(`${channel}:${source}`);
        await options.beforeCheck?.(checks.length);
        return {
          version: channel === 'core' ? 'v6.20.1' : 'synthetic-resource-version',
          name: `${channel}.zip`,
          source,
        };
      },
      download: async (metadata: { source: string }) => {
        downloads.push(metadata.source);
        await options.beforeDownload?.();
        throw new Error('synthetic transfer stopped');
      },
      ...(options.officialFallback
        ? {
            fallback: async (channel: string) => ({
              version: channel === 'core' ? 'v6.20.1' : 'synthetic-resource-version',
              name: `${channel}.zip`,
              source: 'GitHub',
            }),
          }
        : {}),
    },
  });
  return {
    runtime,
    checks,
    downloads,
    save: (mirrorChyan: { enabled: boolean; cdk: string }) =>
      runtime.handle('settings.save', {
        settings: { ...runtime.snapshot().settings, mirrorChyan },
      }),
    close: async () => {
      await runtime.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('MirrorChyan credentials survive legacy settings saves and restart, but stay out of diagnostics', async () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-mirror-settings-'));
  let runtime = new Runtime(root, { calendar: { fetcher: null } });
  try {
    const settings = runtime.snapshot().settings;
    const saved = await runtime.handle('settings.save', {
      settings: { ...settings, mirrorChyan: { enabled: true, cdk: '  synthetic-private-cdk  ' } },
    });
    expect(saved.mirrorChyan).toEqual({ enabled: true, cdk: 'synthetic-private-cdk' });
    const { mirrorChyan: omitted, ...legacy } = saved;
    await runtime.handle('settings.save', { settings: { ...legacy, theme: 'dark' } });
    await runtime.close();
    runtime = new Runtime(root, { calendar: { fetcher: null } });
    expect(runtime.snapshot().settings.mirrorChyan).toEqual(saved.mirrorChyan);
    expect(runtime.snapshot().settings.theme).toBe('dark');
    const diagnostics = await runtime.handle('logs.export', {});
    expect(readFileSync(diagnostics.path, 'utf8')).not.toContain('synthetic-private-cdk');
    await runtime.handle('settings.save', {
      settings: { ...runtime.snapshot().settings, mirrorChyan: { enabled: false, cdk: '' } },
    });
    expect(runtime.snapshot().settings.mirrorChyan).toEqual({ enabled: false, cdk: '' });
  } finally {
    await runtime.close();
    rmSync(root, { recursive: true, force: true });
  }
});

for (const channel of ['core', 'resource'] as const) {
  test(`${channel} prepare reselects an official candidate after saving Mirror credentials`, async () => {
    const fixture = componentFixture();
    try {
      await fixture.runtime.updates.check(channel);
      expect(fixture.checks).toEqual([`${channel}:GitHub`]);
      await fixture.save({ enabled: true, cdk: 'synthetic-private-cdk' });
      // Saving preferences must not perform a metadata request or download.
      expect(fixture.checks).toEqual([`${channel}:GitHub`]);
      expect(fixture.downloads).toEqual([]);
      expect(fixture.runtime.store.get('update_metadata', channel)).toBeUndefined();
      await expect(fixture.runtime.updates.prepare(channel)).rejects.toThrow('准备更新失败');
      expect(fixture.checks).toEqual([`${channel}:GitHub`, `${channel}:MirrorChyan`]);
      expect(fixture.downloads).toEqual(['MirrorChyan']);
    } finally {
      await fixture.close();
    }
  });
}

test('retry keeps the selected official fallback after both Mirror and official transfers fail', async () => {
  const fixture = componentFixture({ officialFallback: true });
  try {
    await fixture.save({ enabled: true, cdk: 'synthetic-private-cdk' });
    await fixture.runtime.updates.check('core');
    await expect(fixture.runtime.updates.prepare('core')).rejects.toThrow('准备更新失败');
    expect(fixture.downloads).toEqual(['MirrorChyan', 'GitHub']);
    const fallback = fixture.runtime.store.get('update_metadata', 'core');
    expect(fallback.source).toBe('GitHub');
    expect(fallback.mirrorSettingsRevision).toBe(
      fixture.runtime.store.get('meta', 'mirror_settings_revision'),
    );
    await expect(fixture.runtime.updates.prepare('core')).rejects.toThrow('准备更新失败');
    expect(fixture.checks).toEqual(['core:MirrorChyan']);
    expect(fixture.downloads).toEqual(['MirrorChyan', 'GitHub', 'GitHub']);
  } finally {
    await fixture.close();
  }
});

test('legacy official candidate without a revision reselects Mirror with previously saved credentials', async () => {
  const fixture = componentFixture();
  try {
    await fixture.runtime.updates.check('core');
    const { mirrorSettingsRevision: omitted, ...legacy } = fixture.runtime.store.get(
      'update_metadata',
      'core',
    );
    fixture.runtime.store.put('update_metadata', 'core', legacy);
    // Simulate settings and metadata saved before source revisions existed.
    fixture.runtime.store.put('settings', 'main', {
      ...fixture.runtime.snapshot().settings,
      mirrorChyan: { enabled: true, cdk: 'synthetic-private-cdk' },
    });
    fixture.runtime.store.put('meta', 'mirror_settings_revision', 0);
    await expect(fixture.runtime.updates.prepare('core')).rejects.toThrow('准备更新失败');
    expect(fixture.checks).toEqual(['core:GitHub', 'core:MirrorChyan']);
    expect(fixture.downloads).toEqual(['MirrorChyan']);
  } finally {
    await fixture.close();
  }
});

test('disabling Mirror invalidates a pending mirror candidate while unchanged credentials preserve it', async () => {
  const fixture = componentFixture();
  try {
    await fixture.save({ enabled: true, cdk: 'synthetic-private-cdk' });
    await fixture.runtime.updates.check('core');
    const metadata = fixture.runtime.store.get('update_metadata', 'core');
    await fixture.save({ enabled: true, cdk: '  synthetic-private-cdk  ' });
    expect(fixture.runtime.store.get('update_metadata', 'core')).toEqual(metadata);
    await fixture.save({ enabled: false, cdk: 'synthetic-private-cdk' });
    expect(fixture.checks).toEqual(['core:MirrorChyan']);
    expect(fixture.runtime.store.get('update_metadata', 'core')).toBeUndefined();
    await expect(fixture.runtime.updates.prepare('core')).rejects.toThrow('准备更新失败');
    expect(fixture.checks).toEqual(['core:MirrorChyan', 'core:GitHub']);
    expect(fixture.downloads).toEqual(['GitHub']);
  } finally {
    await fixture.close();
  }
});

test('a check already in flight reselects the source after Mirror credentials change', async () => {
  const started = deferred(),
    release = deferred();
  const fixture = componentFixture({
    beforeCheck: async (index) => {
      if (index === 1) {
        started.resolve();
        await release.promise;
      }
    },
  });
  const checking = fixture.runtime.updates.check('core');
  try {
    await started.promise;
    await fixture.save({ enabled: true, cdk: 'synthetic-private-cdk' });
    expect(fixture.checks).toEqual(['core:GitHub']);
    release.resolve();
    await checking;
    expect(fixture.checks).toEqual(['core:GitHub', 'core:MirrorChyan']);
    await expect(fixture.runtime.updates.prepare('core')).rejects.toThrow('准备更新失败');
    expect(fixture.downloads).toEqual(['MirrorChyan']);
  } finally {
    release.resolve();
    await checking.catch(() => {});
    await fixture.close();
  }
});

test('Mirror credentials save immediately, preserve the active transfer and reselect its failed retry', async () => {
  const started = deferred(),
    release = deferred();
  const fixture = componentFixture({
    beforeDownload: async () => {
      started.resolve();
      await release.promise;
    },
  });
  await fixture.runtime.updates.check('core');
  const downloading = fixture.runtime.updates.prepare('core').catch(() => {});
  try {
    await started.promise;
    const metadata = fixture.runtime.store.get('update_metadata', 'core');
    const saved = fixture.save({ enabled: true, cdk: 'synthetic-private-cdk' });
    expect(await Promise.race([saved.then(() => true), Bun.sleep(100).then(() => false)])).toBe(
      true,
    );
    expect(fixture.runtime.updates.channel('core').status).toBe('downloading');
    expect(fixture.runtime.store.get('update_metadata', 'core')).toEqual(metadata);
    expect(fixture.checks).toEqual(['core:GitHub']);
    expect(fixture.downloads).toEqual(['GitHub']);
    release.resolve();
    await downloading;
    await expect(fixture.runtime.updates.prepare('core')).rejects.toThrow('准备更新失败');
    expect(fixture.checks).toEqual(['core:GitHub', 'core:MirrorChyan']);
    expect(fixture.downloads).toEqual(['GitHub', 'MirrorChyan']);
  } finally {
    release.resolve();
    await downloading;
    await fixture.close();
  }
});

for (const status of ['staged', 'waiting_idle']) {
  test(`Mirror credentials changes preserve a ${status} component and its candidate metadata`, async () => {
    const fixture = componentFixture();
    try {
      await fixture.runtime.updates.check('core');
      const metadata = fixture.runtime.store.get('update_metadata', 'core');
      const candidate = { version: metadata.version, path: 'synthetic-immutable-generation' };
      fixture.runtime.store.put('staged', 'core', candidate);
      fixture.runtime.store.put('update', 'core', {
        ...fixture.runtime.updates.channel('core'),
        status,
      });
      await fixture.save({ enabled: true, cdk: 'synthetic-private-cdk' });
      expect(fixture.runtime.store.get('staged', 'core')).toEqual(candidate);
      expect(fixture.runtime.store.get('update_metadata', 'core')).toEqual(metadata);
      expect(fixture.runtime.updates.channel('core').status).toBe(status);
      expect(fixture.checks).toEqual(['core:GitHub']);
      expect(fixture.downloads).toEqual([]);
    } finally {
      await fixture.close();
    }
  });
}

for (const enabled of [true, false]) {
  test(`runtime forwards the actual application download source to the host (mirror=${enabled})`, async () => {
    const directory = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-host-source-'));
    const notifications: any[] = [];
    const runtime = new Runtime(path.join(directory, 'native'), {
      calendar: { fetcher: null },
      notify: (message) => notifications.push(message),
    });
    const payload = Buffer.from('synthetic signed installer');
    const sha256 = createHash('sha256').update(payload).digest('hex');
    const urls: string[] = [];
    const source = enabled ? 'MirrorChyan' : 'GitHub';
    const transport = spyOn(globalThis, 'fetch').mockImplementation((async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/api/resources/maa-verge/latest'))
        return Response.json({
          code: 0,
          data: {
            version_name: 'v0.2.0',
            channel: 'stable',
            os: 'windows',
            arch: 'amd64',
            url: 'https://mirrorchyan.com/resources/download/synthetic-installer',
            sha256,
            filesize: payload.length,
            update_type: 'full',
          },
        });
      const events = notifications.filter((message) => message.method === 'runtime.hostEvent');
      expect(events.at(-1)?.params.downloadSource).toBe(source);
      expect(url).toBe(
        enabled
          ? 'https://mirrorchyan.com/resources/download/synthetic-installer'
          : 'https://github.com/DeathofBrain/maa-verge/releases/download/v0.2.0/Maa-Verge_0.2.0_x64-setup.exe',
      );
      return new Response(payload, { headers: { 'content-length': String(payload.length) } });
    }) as typeof fetch);
    try {
      await runtime.handle('settings.save', {
        settings: {
          ...runtime.snapshot().settings,
          mirrorChyan: { enabled, cdk: 'synthetic-private-cdk' },
          downloadProxy: { mode: 'direct', url: '' },
        },
      });
      const result = await runtime.handle('host.updates', {
        operation: 'download',
        operationId: 'source-download',
        tag: 'v0.2.0',
        version: '0.2.0',
        name: 'Maa-Verge_0.2.0_x64-setup.exe',
        size: payload.length,
        digest: 'sha256:' + sha256,
      });
      expect(result.sha256).toBe(sha256);
      expect(urls).toHaveLength(enabled ? 2 : 1);
      const events = notifications.filter((message) => message.method === 'runtime.hostEvent');
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((message) => message.params.downloadSource === source)).toBe(true);
      expect(events.every((message) => message.params.operationId === 'source-download')).toBe(
        true,
      );
      expect(JSON.stringify(events)).not.toContain('synthetic-private-cdk');
    } finally {
      transport.mockRestore();
      await runtime.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
