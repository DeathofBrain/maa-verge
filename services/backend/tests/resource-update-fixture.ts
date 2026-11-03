/** Isolated resource archives and store used by update lifecycle tests. */
import { createHash } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';
import {
  runUpdateJob,
  UpdateService,
  type UpdateMetadata,
  type UpdateSource,
} from '@backend/modules/updates/updates';
import { zipBytes } from './archive-fixture';
export class UpdateMemoryStore {
  private readonly values = new Map<string, any>();
  get(kind: string, id: string, fallback?: any): any {
    return this.values.get(kind + ':' + id) ?? fallback;
  }
  put(kind: string, id: string, value: any): void {
    this.values.set(kind + ':' + id, structuredClone(value));
  }
  delete(kind: string, id: string): void {
    this.values.delete(kind + ':' + id);
  }
  all(kind: string): any[] {
    return [...this.values]
      .filter(([key]) => key.startsWith(kind + ':'))
      .map(([, value]) => structuredClone(value));
  }
}
export const baseResourceFiles = [
  { name: 'source/resource/version.json', content: '{}' },
  { name: 'source/resource/tasks.json', content: '{"Ready":{"roi":[0,0,1,1]}}' },
  { name: 'source/resource/PaddleOCR/det/inference.onnx', content: 'synthetic detector' },
  { name: 'source/resource/PaddleOCR/rec/inference.onnx', content: 'synthetic recognizer' },
  { name: 'source/resource/PaddleOCR/rec/keys.txt', content: 'synthetic keys' },
  { name: 'source/resource/template/Ready.png', content: 'synthetic template' },
  { name: 'source/LICENSE', content: 'upstream resource license' },
  { name: 'source/native.dll', content: 'never extracted' },
];
export class ResourceSource implements UpdateSource {
  version = 'a'.repeat(40);
  timestamp = '2026-11-01 00:00:00.000';
  requests: string[] = [];
  check(): UpdateMetadata {
    return {
      version: this.version,
      source: 'GitHub',
      base: { version: 'base', source: 'GitHub' },
      resourceVersion: { last_updated: this.timestamp },
    };
  }
  async download(
    metadata: UpdateMetadata,
    destination: string,
    progress: (value: number, speed?: number) => void,
  ): Promise<string> {
    this.requests.push(metadata.version);
    const archive = zipBytes(
      metadata.version === 'base'
        ? baseResourceFiles
        : [
            {
              name: 'overlay/resource/version.json',
              content: JSON.stringify({ last_updated: this.timestamp }),
            },
            {
              name: 'overlay/resource/tasks.json',
              content: JSON.stringify({ [metadata.version]: {} }),
            },
          ],
    );
    progress(50, 4096);
    await writeFile(destination, archive);
    progress(100);
    return createHash('sha256').update(archive).digest('hex');
  }
}
export async function updateFixture(
  run: (fixture: {
    root: string;
    store: UpdateMemoryStore;
    source: ResourceSource;
    service: UpdateService;
    setBusy(value: boolean): void;
  }) => Promise<void>,
): Promise<void> {
  const root = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-resource-update-'));
  const store = new UpdateMemoryStore(),
    source = new ResourceSource();
  let busy = false;
  const service = new UpdateService(
    root,
    store,
    () => {},
    () => busy,
    { source, jobRunner: (config) => runUpdateJob(config), directories: { resource: root } },
  );
  try {
    await run({
      root,
      store,
      source,
      service,
      setBusy: (value) => {
        busy = value;
      },
    });
  } finally {
    await service.close();
    await rm(root, { recursive: true, force: true });
  }
}
export async function installResource(service: UpdateService): Promise<void> {
  await service.check('resource');
  await service.prepare('resource');
  await service.activate('resource');
}
