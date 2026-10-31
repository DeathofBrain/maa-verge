import { expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

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
