import { expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installResource, updateFixture } from './resource-update-fixture';

test('activation waits for the device owner and rollback restores only resource pointers', () =>
  updateFixture(async ({ store, source, service, setBusy }) => {
    await installResource(service);
    const first = store.get('active', 'combo').resource;
    source.version = 'b'.repeat(40);
    source.timestamp = '2026-11-02 00:00:00.000';
    await service.check('resource');
    await service.prepare('resource');
    setBusy(true);
    expect((await service.activate('resource')).status).toBe('waiting_idle');
    expect(store.get('active', 'combo').resource.path).toBe(first.path);
    setBusy(false);
    await service.activatePending();
    expect(store.get('active', 'combo').resource.version).toBe(source.version);
    await service.rollback('resource');
    expect(store.get('active', 'combo').resource.path).toBe(first.path);
    expect(store.get('active', 'combo').core).toBeUndefined();
  }));
test('a corrupt candidate cannot replace the active resource', () =>
  updateFixture(async ({ store, source, service }) => {
    await installResource(service);
    const first = store.get('active', 'combo').resource;
    source.version = 'b'.repeat(40);
    source.timestamp = '2026-11-02 00:00:00.000';
    await service.check('resource');
    await service.prepare('resource');
    await writeFile(path.join(store.get('staged', 'resource').path, 'resource/tasks.json'), '{}');
    await expect(service.activate('resource')).rejects.toThrow('资源切换失败');
    expect(store.get('active', 'combo').resource.path).toBe(first.path);
  }));
