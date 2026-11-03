import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { UpdateService, runUpdateJob } from '@backend/modules/updates/updates';
import {
  installResource,
  ResourceSource,
  UpdateMemoryStore,
  updateFixture,
} from './resource-update-fixture';

test('shared resource roots isolate generations and retention by data-root namespace', () =>
  updateFixture(async ({ root }) => {
    const directory = path.join(root, 'shared'),
      source = new ResourceSource();
    const firstStore = new UpdateMemoryStore(),
      secondStore = new UpdateMemoryStore();
    const create = (store: UpdateMemoryStore, namespace: string) =>
      new UpdateService(
        root,
        store,
        () => {},
        () => false,
        {
          directories: { resource: directory },
          generationNamespace: namespace,
          source,
          jobRunner: (config) => runUpdateJob(config),
        },
      );
    const first = create(firstStore, 'data-' + 'a'.repeat(32)),
      second = create(secondStore, 'data-' + 'b'.repeat(32));
    try {
      await installResource(first);
      const retained = firstStore.get('active', 'combo').resource;
      for (let index = 0; index < 5; index++) {
        source.version = String(index + 1).repeat(40);
        source.timestamp = `2026-11-0${index + 2} 00:00:00.000`;
        await installResource(second);
      }
      expect(retained.path).toContain('data-' + 'a'.repeat(32));
      expect(secondStore.get('active', 'combo').resource.path).toContain('data-' + 'b'.repeat(32));
      expect(
        await readFile(path.join(retained.path, 'resource/PaddleOCR/rec/keys.txt'), 'utf8'),
      ).toBe('synthetic keys');
    } finally {
      await first.close();
      await second.close();
    }
  }));
