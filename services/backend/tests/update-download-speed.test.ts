import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { UpdateService, type UpdateStore } from '@backend/modules/updates/updates.ts';

class MemoryStore implements UpdateStore {
  rows = new Map<string, any>();
  get(kind: string, id: string, fallback?: any) {
    return structuredClone(this.rows.get(`${kind}|${id}`) ?? fallback);
  }
  put(kind: string, id: string, value: any) {
    this.rows.set(`${kind}|${id}`, structuredClone(value));
  }
  all(kind: string) {
    return [...this.rows.entries()]
      .filter(([key]) => key.startsWith(`${kind}|`))
      .map(([, value]) => structuredClone(value));
  }
  delete(kind: string, id: string) {
    this.rows.delete(`${kind}|${id}`);
  }
}

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('component updates propagate same-percentage speed changes and clear rates before extraction or failure', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-update-speed-')),
    store = new MemoryStore(),
    events: any[] = [];
  roots.push(root);
  const updates = new UpdateService(
    root,
    store,
    (_type, _message, data) => events.push(data.update),
    () => false,
    {
      source: {
        check: () => ({ version: 'v1.0.0', name: 'core.zip' }),
        download: async (_metadata, file, progress) => {
          progress(25, 1_024);
          expect(updates.channel('core').downloadSpeedBytesPerSecond).toBe(1_024);
          expect(updates.channel('core').downloadSource).toBe('GitHub');
          expect(updates.channel('core').message).toBe('正在通过官方源下载组件');
          await Bun.sleep(300);
          progress(25, 2_048);
          expect(updates.channel('core').downloadSpeedBytesPerSecond).toBe(2_048);
          progress(25);
          expect(updates.channel('core').downloadSpeedBytesPerSecond).toBeUndefined();
          await writeFile(file, 'synthetic archive');
          return 'a'.repeat(64);
        },
      },
      jobRunner: async () => {
        expect(updates.channel('core').message).toBe('正在解压并校验组件');
        expect(updates.channel('core').downloadSpeedBytesPerSecond).toBeUndefined();
        throw new Error('synthetic extraction failure');
      },
    },
  );
  try {
    await updates.check('core');
    await expect(updates.prepare('core')).rejects.toThrow('准备更新失败');
    expect(
      events
        .filter((event) => event.progress === 25)
        .map((event) => event.downloadSpeedBytesPerSecond),
    ).toEqual([1_024, 2_048, undefined]);
    expect(updates.channel('core').status).toBe('failed');
    expect(updates.channel('core').downloadSpeedBytesPerSecond).toBeUndefined();
  } finally {
    await updates.close();
  }
});
