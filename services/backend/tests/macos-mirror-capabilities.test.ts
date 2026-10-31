import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultConnection, parseSettings } from '@backend/modules/settings/models';
import {
  UpdateService,
  type UpdateMetadata,
  type UpdateStore,
} from '@backend/modules/updates/updates';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';

class MemoryStore implements UpdateStore {
  private readonly rows = new Map<string, any>();
  get(kind: string, id: string, fallback?: any) {
    const value = this.rows.get(`${kind}|${id}`);
    return structuredClone(value === undefined ? fallback : value);
  }
  put(kind: string, id: string, value: any) {
    this.rows.set(`${kind}|${id}`, structuredClone(value));
  }
  delete(kind: string, id: string) {
    this.rows.delete(`${kind}|${id}`);
  }
  all(kind: string) {
    return [...this.rows.entries()]
      .filter(([key]) => key.startsWith(`${kind}|`))
      .map(([, value]) => structuredClone(value));
  }
}

async function fixture() {
  const root = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-macos-capabilities-'));
  const store = new MemoryStore(),
    downloads: string[] = [],
    fallbackReasons: string[] = [],
    jobs: boolean[] = [];
  const version = 'v6.20.1';
  store.put('settings', 'main', parseSettings({ connection: defaultConnection() }));
  const updates = new UpdateService(
    root,
    store,
    () => {},
    () => false,
    {
      source: {
        check: () => ({
          version,
          name: 'macos-mirror.zip',
          source: 'MirrorChyan',
          mirrorChyan: { rid: 'MAA', version, channel: 'stable', os: 'darwin', arch: 'arm64' },
        }),
        download: async (metadata: UpdateMetadata, destination, progress) => {
          downloads.push(metadata.source);
          await writeFile(destination, 'synthetic archive');
          progress(90);
          return 'a'.repeat(64);
        },
        fallback: async (_channel, _releaseChannel, reason) => {
          fallbackReasons.push(reason instanceof Error ? reason.message : String(reason));
          return { version, name: 'macos-runtime-universal.zip', source: 'GitHub' };
        },
      },
      validator: async () => {},
      jobRunner: async (config) => {
        const mirror = config.macosMirrorCore === true;
        jobs.push(mirror);
        await mkdir(path.join(config.target, 'resource'), { recursive: true });
        await writeFile(path.join(config.target, 'resource/version.json'), '{}');
        await writeFile(path.join(config.target, 'libMaaCore.dylib'), 'synthetic MaaCore');
        if (!mirror)
          await writeFile(
            path.join(config.target, 'libMaaAdbControlUnit.dylib'),
            'synthetic control unit',
          );
        return {};
      },
    },
  );
  return {
    store,
    updates,
    downloads,
    jobs,
    fallbackReasons,
    version,
    requireControlUnit: (scope: 'global' | 'profile') => {
      const settings = store.get('settings', 'main');
      if (scope === 'global') settings.connection.touchMode = 'MaaFwAdb';
      else
        settings.deviceProfiles = [
          {
            id: 'synthetic-profile',
            name: '合成设备配置',
            address: '127.0.0.1:5555',
            connection: { ...settings.connection, touchMode: 'MaaFwAdb' },
          },
        ];
      store.put('settings', 'main', settings);
    },
    close: async () => {
      await updates.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

for (const scope of ['global', 'profile'] as const) {
  test(`macOS Mirror core falls back to the complete official runtime when ${scope} settings require MaaFwAdb`, async () => {
    const context = await fixture();
    try {
      context.requireControlUnit(scope);
      await context.updates.check('core');
      expect((await context.updates.prepare('core')).status).toBe('staged');
      expect(context.downloads).toEqual(['MirrorChyan', 'GitHub']);
      expect(context.jobs).toEqual([true, false]);
      expect(context.fallbackReasons).toHaveLength(1);
      expect(context.fallbackReasons[0]).toContain('MaaFwAdb');
      const candidate = context.store.get('staged', 'core');
      expect(candidate.source).toBe('GitHub');
      expect(existsSync(path.join(candidate.path, 'libMaaAdbControlUnit.dylib'))).toBe(true);
    } finally {
      await context.close();
    }
  });
}

test('enabling MaaFwAdb rejects an incompatible staged Mirror core and prepares the official runtime', async () => {
  const context = await fixture();
  try {
    await context.updates.check('core');
    expect((await context.updates.prepare('core')).status).toBe('staged');
    const previous = context.store.get('staged', 'core');
    expect(previous.source).toBe('MirrorChyan');
    expect(existsSync(path.join(previous.path, 'libMaaAdbControlUnit.dylib'))).toBe(false);
    context.requireControlUnit('global');
    await expect(context.updates.activate('core')).rejects.toThrow('MaaFwAdb');
    expect(context.store.get('staged', 'core')).toBeUndefined();
    expect(context.store.get('active', 'combo')).toBeUndefined();
    expect(context.updates.channel('core').status).toBe('failed');
    expect(context.updates.channel('core').message).toContain('重新检查');
    expect((await context.updates.prepare('core')).status).toBe('staged');
    const candidate = context.store.get('staged', 'core');
    expect(candidate.source).toBe('GitHub');
    expect(candidate.path).not.toBe(previous.path);
    expect(context.downloads).toEqual(['MirrorChyan', 'MirrorChyan', 'GitHub']);
    expect(context.jobs).toEqual([true, true, false]);
  } finally {
    await context.close();
  }
});

test('enabling MaaFwAdb after activating a Mirror core prepares a same-version official repair', async () => {
  const context = await fixture();
  try {
    await context.updates.check('core');
    await context.updates.prepare('core');
    expect((await context.updates.activate('core')).currentVersion).toBe(context.version);
    const active = context.store.get('active', 'combo').core;
    expect(active.source).toBe('MirrorChyan');
    expect((await context.updates.check('core')).status).toBe('idle');
    context.requireControlUnit('profile');
    const checked = await context.updates.check('core');
    expect(checked.status).toBe('available');
    expect(checked.currentVersion).toBe(context.version);
    expect(checked.latestVersion).toBe(context.version);
    expect((await context.updates.prepare('core')).status).toBe('staged');
    const candidate = context.store.get('staged', 'core');
    expect(candidate.version).toBe(active.version);
    expect(candidate.source).toBe('GitHub');
    expect(candidate.path).not.toBe(active.path);
    expect(context.store.get('active', 'combo').core.path).toBe(active.path);
    expect(context.downloads).toEqual(['MirrorChyan', 'MirrorChyan', 'GitHub']);
    expect((await context.updates.activate('core')).currentVersion).toBe(context.version);
    const repaired = context.store.get('active', 'combo').core;
    expect(repaired.source).toBe('GitHub');
    expect(existsSync(path.join(repaired.path, 'libMaaAdbControlUnit.dylib'))).toBe(true);
  } finally {
    await context.close();
  }
});
