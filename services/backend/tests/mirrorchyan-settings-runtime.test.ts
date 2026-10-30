import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/app/runtime';

test('MirrorChyan credentials survive legacy settings saves and restart, but stay out of diagnostics', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-mirror-settings-'));
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
