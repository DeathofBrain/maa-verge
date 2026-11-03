import { expect, test } from 'bun:test';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  OfficialSource,
  RESOURCE_BASE_COMMIT,
  runUpdateJob,
} from '@backend/modules/updates/updates';
import { zipBytes } from './archive-fixture';
import { baseResourceFiles, installResource, updateFixture } from './resource-update-fixture';

test('official resource metadata pins a source model baseline without checking binary releases', async () => {
  const urls: string[] = [];
  const commit = 'b'.repeat(40);
  const source = new OfficialSource((async (url: string) => {
    urls.push(String(url));
    return Response.json(
      String(url).includes('/commits/')
        ? { sha: commit }
        : { last_updated: '2026-11-01 00:00:00.000' },
    );
  }) as typeof fetch);
  const metadata = await source.check('resource');
  expect(metadata.version).toBe(commit);
  expect(metadata.base.version).toBe(RESOURCE_BASE_COMMIT);
  expect(metadata.base.url).toContain('/MaaAssistantArknights/zip/' + RESOURCE_BASE_COMMIT);
  expect(urls.some((url) => url.includes('/releases/'))).toBe(false);
  await expect(source.check('core')).rejects.toThrow('未知更新通道');
});
test('resource install composes models and overlays into one immutable generation without a core', () =>
  updateFixture(async ({ store, source, service }) => {
    await installResource(service);
    expect(service.channels().map((channel) => channel.id)).toEqual(['app', 'resource']);
    expect(() => service.channel('core')).toThrow();
    const combo = store.get('active', 'combo');
    expect(Object.keys(combo)).toEqual(['resource']);
    expect(source.requests).toEqual([source.version, 'base']);
    expect(
      await readFile(path.join(combo.resource.path, 'resource/PaddleOCR/rec/keys.txt'), 'utf8'),
    ).toBe('synthetic keys');
    expect(
      JSON.parse(await readFile(path.join(combo.resource.path, 'resource/tasks.json'), 'utf8')),
    ).toEqual({ [source.version]: {} });
    expect(await readdir(combo.resource.path)).not.toContain('native.dll');
    expect(
      await readFile(path.join(combo.resource.path, 'licenses/official-source/LICENSE'), 'utf8'),
    ).toBe('upstream resource license');
  }));
test('every resource update rebases on the pinned source rather than a previous overlay', () =>
  updateFixture(async ({ store, source, service }) => {
    await installResource(service);
    const first = store.get('active', 'combo').resource;
    source.version = 'b'.repeat(40);
    source.timestamp = '2026-11-02 00:00:00.000';
    await installResource(service);
    const second = store.get('active', 'combo').resource;
    expect(second.path).not.toBe(first.path);
    expect(
      JSON.parse(await readFile(path.join(first.path, 'resource/tasks.json'), 'utf8')),
    ).toEqual({ ['a'.repeat(40)]: {} });
    expect(
      JSON.parse(await readFile(path.join(second.path, 'resource/tasks.json'), 'utf8')),
    ).toEqual({ ['b'.repeat(40)]: {} });
  }));
test('resource jobs reject incomplete models and executable files', () =>
  updateFixture(async ({ root }) => {
    const archive = path.join(root, 'overlay.zip'),
      baseArchive = path.join(root, 'base.zip');
    await writeFile(archive, zipBytes([{ name: 'overlay/resource/version.json', content: '{}' }]));
    await writeFile(
      baseArchive,
      zipBytes(baseResourceFiles.filter((file) => !file.name.includes('rec/inference'))),
    );
    await expect(
      runUpdateJob({
        channel: 'resource',
        archive,
        baseArchive,
        target: path.join(root, 'missing'),
        version: 'test',
      }),
    ).rejects.toThrow();
    await writeFile(
      baseArchive,
      zipBytes([
        ...baseResourceFiles,
        { name: 'source/resource/embedded.dll', content: 'forbidden' },
      ]),
    );
    await expect(
      runUpdateJob({
        channel: 'resource',
        archive,
        baseArchive,
        target: path.join(root, 'binary'),
        version: 'test',
      }),
    ).rejects.toThrow('原生运行库');
  }));
