import { expect, test } from 'bun:test';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { snapshotIntegrity } from '@backend/infrastructure/filesystem/snapshot-integrity';
import { UpdateService } from '@backend/modules/updates/updates';
import { installResource, UpdateMemoryStore, updateFixture } from './resource-update-fixture';

test('complete resource-only offline payload is adopted without a download or core record', () =>
  updateFixture(async ({ root, store, service }) => {
    await installResource(service);
    const active = store.get('active', 'combo').resource;
    const payload = path.join(root, 'offline'),
      resource = path.join(payload, 'resource');
    await mkdir(payload);
    await cp(active.path, resource, { recursive: true });
    const integrity = await snapshotIntegrity(resource);
    await writeFile(
      path.join(payload, 'manifest.json'),
      JSON.stringify({
        formatVersion: 2,
        resource: {
          version: active.version,
          baseResourceVersion: active.baseResourceVersion,
          directory: 'resource',
          installedHash: integrity.installedHash,
        },
      }),
    );
    const targetStore = new UpdateMemoryStore();
    const target = new UpdateService(
      path.join(root, 'target'),
      targetStore,
      () => {},
      () => false,
      {
        source: {
          check() {
            throw new Error('network forbidden');
          },
          download() {
            throw new Error('network forbidden');
          },
        },
      },
    );
    try {
      await target.bootstrapBundled(payload);
      const installed = targetStore.get('active', 'combo').resource;
      expect(target.channel('resource').currentVersion).toBe(active.version);
      expect(
        await readFile(path.join(installed.path, 'resource/PaddleOCR/rec/keys.txt'), 'utf8'),
      ).toBe('synthetic keys');
      expect(targetStore.get('active', 'combo').core).toBeUndefined();
    } finally {
      await target.close();
    }
  }));

test('legacy core resources migrate by copying without activating or modifying the old library', () =>
  updateFixture(async ({ root, store, service }) => {
    await installResource(service);
    const old = store.get('active', 'combo').resource;
    await writeFile(path.join(old.path, 'libMaaCore.dylib'), 'legacy library remains untouched');
    const integrity = await snapshotIntegrity(old.path);
    const legacy = { ...old, ...integrity };
    const targetStore = new UpdateMemoryStore();
    targetStore.put('active', 'combo', { core: legacy, resource: legacy });
    const target = new UpdateService(
      path.join(root, 'migrated'),
      targetStore,
      () => {},
      () => false,
    );
    try {
      await target.bootstrapBundled(path.join(root, 'missing-offline'));
      const migrated = targetStore.get('active', 'combo');
      expect(migrated.core).toBeUndefined();
      expect(migrated.resource.path).not.toBe(old.path);
      expect(await readFile(path.join(old.path, 'libMaaCore.dylib'), 'utf8')).toBe(
        'legacy library remains untouched',
      );
      expect(
        await readFile(
          path.join(migrated.resource.path, 'resource/PaddleOCR/rec/keys.txt'),
          'utf8',
        ),
      ).toBe('synthetic keys');
    } finally {
      await target.close();
    }
  }));
