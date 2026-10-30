import { afterEach, describe, expect, test } from 'bun:test';
import { lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  extractArchive,
  extractCoreArchive,
  normalizeRuntimeRoot,
} from '../src/infrastructure/filesystem/archives.ts';
import safetyCases from '../../../tests/fixtures/archive-safety.json';
import { writeArchive, type FixtureMember } from './archive-fixture.ts';

const roots: string[] = [];
async function temp() {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-archive-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const baseline = [
  { name: 'MaaCore.dll', content: 'core' },
  { name: 'resource/version.json', content: '{}' },
];
for (const kind of ['zip', 'tar'])
  describe(kind, () => {
    test('full mirror snapshots reject incremental markers before writing even excluded core files', async () => {
      const root = await temp(),
        archive = path.join(root, 'fixture.archive'),
        output = path.join(root, 'full');
      await writeArchive(archive, kind, [...baseline, { name: 'changes.json', content: '{}' }]);
      await expect(
        extractCoreArchive(archive, output, { rejectIncremental: true }),
      ).rejects.toThrow('增量包');
      expect(await readdir(output)).toEqual([]);
    });
    for (const fixture of safetyCases)
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
        await expect(extractCoreArchive(archive, output)).rejects.toThrow();
        expect(await readdir(output)).toEqual([]);
      });
    test('retains runtime libraries, complete resources and licenses', async () => {
      const root = await temp(),
        archive = path.join(root, 'fixture.archive'),
        output = path.join(root, 'out');
      const retained = [
        'MaaUtils.dll',
        'MaaAdbControlUnit.dll',
        'resource/models/model',
        'resource/minitouch/arm64/tool',
        'LICENSE',
        'THIRD_PARTY_NOTICES.txt',
        'licenses/opencv/COPYING',
      ];
      const skipped = [
        'MAA.dll',
        'hostfxr.dll',
        'hostpolicy.dll',
        'MAA.exe',
        'externals/GUI.dll',
        'runtimes/native/Native.dll',
        'libunused.so',
        'README.md',
      ];
      await writeArchive(archive, kind, [
        ...baseline,
        ...retained.concat(skipped).map((name) => ({ name, content: name })),
      ]);
      await extractCoreArchive(archive, output);
      for (const name of retained)
        expect(await readFile(path.join(output, name), 'utf8')).toBe(name);
      for (const name of skipped)
        expect(await Bun.file(path.join(output, name)).exists()).toBe(false);
    });
    test('validates excluded special files and expanded bytes', async () => {
      const root = await temp(),
        archive = path.join(root, 'fixture.archive');
      await writeArchive(archive, kind, [...baseline, { name: 'ignored-device', type: 'special' }]);
      await expect(extractCoreArchive(archive, path.join(root, 'special'))).rejects.toThrow(
        '特殊文件',
      );
      await writeArchive(archive, kind, [
        ...baseline,
        { name: 'MAA.exe', content: 'x'.repeat(30) },
      ]);
      await expect(
        extractCoreArchive(archive, path.join(root, 'size'), { maxExpandedBytes: 20 }),
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
    test('requires exactly one complete shallow runtime root', async () => {
      const root = await temp(),
        archive = path.join(root, 'fixture.archive');
      for (const [index, members] of [
        [{ name: 'MaaCore.dll', content: 'core' }],
        [...baseline, { name: 'libMaaCore.so', content: 'core' }],
        baseline.map((member) => ({ ...member, name: 'deep/wrapper/' + member.name })),
      ].entries()) {
        await writeArchive(archive, kind, members);
        await expect(extractCoreArchive(archive, path.join(root, `out${index}`))).rejects.toThrow(
          '唯一',
        );
      }
    });
  });
test('wrapped macOS aliases flatten and retain executable tools', async () => {
  const root = await temp(),
    archive = path.join(root, 'mac.zip'),
    output = path.join(root, 'out');
  await writeArchive(archive, 'zip', [
    { name: 'mac/libMaaCore.dylib', content: 'core' },
    { name: 'mac/libonnxruntime.dylib', link: 'libonnxruntime.1.dylib' },
    { name: 'mac/libonnxruntime.1.dylib', content: 'native' },
    { name: 'mac/resource/version.json', content: '{}' },
    { name: 'mac/resource/tools/maatouch', content: 'tool', mode: 0o755 },
    { name: 'mac/GUI.app/file', content: 'skip' },
  ]);
  await extractCoreArchive(archive, output);
  await normalizeRuntimeRoot(output);
  expect(await readFile(path.join(output, 'libonnxruntime.dylib'), 'utf8')).toBe('native');
  expect(await Bun.file(path.join(output, 'GUI.app/file')).exists()).toBe(false);
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
