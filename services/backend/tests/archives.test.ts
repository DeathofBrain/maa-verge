import { afterEach, describe, expect, test } from 'bun:test';
import { lstat, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  extractArchive,
  extractResourceArchive,
} from '@backend/infrastructure/filesystem/archives.ts';
import safetyCases from '../../../tests/fixtures/archive-safety.json';
import { writeArchive, type FixtureMember } from './archive-fixture.ts';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [];
async function temp() {
  const root = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-archive-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const baseline = [{ name: 'resource/version.json', content: '{}' }];
for (const kind of ['zip', 'tar'])
  describe(kind, () => {
    test('full mirror snapshots reject incremental markers before writing even excluded files', async () => {
      const root = await temp(),
        archive = path.join(root, 'fixture.archive'),
        output = path.join(root, 'full');
      await writeArchive(archive, kind, [...baseline, { name: 'changes.json', content: '{}' }]);
      await expect(
        extractResourceArchive(archive, output, { rejectIncremental: true }),
      ).rejects.toThrow('增量包');
      expect(await readdir(output)).toEqual([]);
    });
    for (const fixture of safetyCases.map((fixture) =>
      fixture.name === 'excluded-target'
        ? { ...fixture, links: { 'resource/alias': '../ignored/GUI.dll' } }
        : fixture,
    ))
      test(`validates excluded ${fixture.name} before writing`, async () => {
        const root = await temp(),
          archive = path.join(root, 'fixture.archive'),
          output = path.join(root, 'out');
        const members: FixtureMember[] = [
          ...baseline,
          ...Object.entries(fixture.files ?? {}).map(([name, content]) => ({
            name,
            content: content as string,
          })),
          ...Object.entries(fixture.links ?? {}).map(([name, link]) => ({
            name,
            link: link as string,
          })),
        ];
        await writeArchive(archive, kind, members);
        await expect(extractResourceArchive(archive, output)).rejects.toThrow();
        expect(await readdir(output)).toEqual([]);
      });
    test('selects only complete resource trees and source licenses', async () => {
      const root = await temp(),
        archive = path.join(root, 'fixture.archive'),
        output = path.join(root, 'out');
      await writeArchive(archive, kind, [
        ...baseline,
        { name: 'resource/models/model', content: 'model' },
        { name: 'LICENSE', content: 'license' },
        { name: 'source.cpp', content: 'excluded' },
        { name: 'native.dll', content: 'excluded' },
      ]);
      await extractResourceArchive(archive, output);
      expect(await readFile(path.join(output, 'resource/models/model'), 'utf8')).toBe('model');
      expect(await readFile(path.join(output, 'LICENSE'), 'utf8')).toBe('license');
      expect(await Bun.file(path.join(output, 'native.dll')).exists()).toBe(false);
      expect(await Bun.file(path.join(output, 'source.cpp')).exists()).toBe(false);
    });
    test('validates excluded special files and expanded bytes', async () => {
      const root = await temp(),
        archive = path.join(root, 'fixture.archive');
      await writeArchive(archive, kind, [...baseline, { name: 'ignored-device', type: 'special' }]);
      await expect(extractResourceArchive(archive, path.join(root, 'special'))).rejects.toThrow(
        '特殊文件',
      );
      await writeArchive(archive, kind, [
        ...baseline,
        { name: 'MAA.exe', content: 'x'.repeat(30) },
      ]);
      await expect(
        extractResourceArchive(archive, path.join(root, 'size'), { maxExpandedBytes: 20 }),
      ).rejects.toThrow('大小');
    });
    test('materializes forward file aliases, relative parents and chains', async () => {
      const root = await temp(),
        archive = path.join(root, 'fixture.archive'),
        output = path.join(root, 'out');
      await writeArchive(archive, kind, [
        { name: 'alias', link: 'libs/library' },
        { name: 'libs/library', link: '../library.1' },
        { name: 'library.1', content: 'runtime', mode: 0o755 },
      ]);
      await extractArchive(archive, output);
      expect(await readFile(path.join(output, 'alias'), 'utf8')).toBe('runtime');
      expect((await lstat(path.join(output, 'alias'))).isSymbolicLink()).toBe(false);
      await expect(
        extractArchive(archive, path.join(root, 'limit'), { maxExpandedBytes: 20 }),
      ).rejects.toThrow('大小');
    });
    test('requires exactly one shallow resource root', async () => {
      const root = await temp(),
        archive = path.join(root, 'fixture.archive');
      for (const [index, members] of [
        [{ name: 'source.cpp', content: 'source' }],
        [...baseline, { name: 'second/resource/version.json', content: '{}' }],
        baseline.map((member) => ({ ...member, name: 'deep/wrapper/' + member.name })),
      ].entries()) {
        await writeArchive(archive, kind, members);
        await expect(
          extractResourceArchive(archive, path.join(root, `out${index}`)),
        ).rejects.toThrow('唯一');
      }
    });
  });
test('tar hard links are relative to the archive root', async () => {
  const root = await temp(),
    archive = path.join(root, 'hard.tar.gz'),
    output = path.join(root, 'out');
  await writeArchive(archive, 'tar', [
    { name: 'alias/file', link: 'libs/file', hard: true },
    { name: 'libs/file', content: 'native' },
  ]);
  await extractArchive(archive, output);
  expect(await readFile(path.join(output, 'alias/file'), 'utf8')).toBe('native');
});
test('deep generation roots and long resource paths work beyond Windows MAX_PATH', async () => {
  const root = await temp(),
    archive = path.join(root, 'long.zip');
  const output = path.join(root, 'generation-'.repeat(9), 'candidate-'.repeat(8));
  const relative = 'resource/Arknights-Tile-Pos/' + 'stage-'.repeat(20) + '.json';
  await writeArchive(archive, 'zip', [{ name: relative, content: 'long-resource' }]);
  await extractArchive(archive, output);
  expect(path.join(output, relative).length).toBeGreaterThan(260);
  expect(await readFile(path.join(output, relative), 'utf8')).toBe('long-resource');
});
