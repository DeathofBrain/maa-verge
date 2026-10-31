import { afterEach, expect, spyOn, test } from 'bun:test';
import { utimesSync, writeFileSync } from 'node:fs';
import * as filesystem from 'node:fs/promises';
import {
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  SnapshotIntegrityCache,
  snapshotIntegrity,
} from '@backend/infrastructure/filesystem/snapshot-integrity';

const roots: string[] = [];
async function temp() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'maaverge-integrity-cache-')));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('session caching reuses unchanged file digests while uncached calls still read every file', async () => {
  const root = await temp(),
    cache = new SnapshotIntegrityCache();
  await writeFile(path.join(root, 'core'), 'synthetic-core');
  await writeFile(path.join(root, 'model'), 'model');
  const opened = spyOn(filesystem, 'open');
  try {
    const first = await snapshotIntegrity(root, undefined, undefined, cache);
    expect(opened).toHaveBeenCalledTimes(2);
    const progress: number[] = [];
    expect(
      await snapshotIntegrity(
        root,
        first.installedFiles,
        (completed) => progress.push(completed),
        cache,
      ),
    ).toEqual(first);
    expect(progress).toEqual([0, 1, 2]);
    expect(opened).toHaveBeenCalledTimes(2);
    expect(await snapshotIntegrity(root, first.installedFiles)).toEqual(first);
    expect(opened).toHaveBeenCalledTimes(4);
    expect(
      await snapshotIntegrity(root, first.installedFiles, undefined, new SnapshotIntegrityCache()),
    ).toEqual(first);
    expect(opened).toHaveBeenCalledTimes(6);
  } finally {
    opened.mockRestore();
  }
});

test.each(['same-size', 'empty', 'larger', 'replaced'])(
  'cached payload verification rereads %s file changes, including restored modification times',
  async (kind) => {
    const root = await temp(),
      filename = path.join(root, 'model'),
      cache = new SnapshotIntegrityCache();
    await writeFile(filename, 'model');
    const previous = await stat(filename),
      first = await snapshotIntegrity(root, undefined, undefined, cache);
    if (kind === 'replaced') {
      const replacement = path.join(root, 'replacement');
      await writeFile(replacement, 'other');
      await rename(replacement, filename);
    } else
      await writeFile(filename, kind === 'same-size' ? 'other' : kind === 'empty' ? '' : 'larger');
    await utimes(filename, previous.atime, previous.mtime);
    const cached = await snapshotIntegrity(root, first.installedFiles, undefined, cache);
    expect(cached).toEqual(await snapshotIntegrity(root, first.installedFiles));
    expect(cached.installedHash).not.toBe(first.installedHash);
  },
);

test('a removed cached file is rejected and an added payload still changes the inventory', async () => {
  const root = await temp(),
    cache = new SnapshotIntegrityCache();
  await writeFile(path.join(root, 'core'), 'core');
  const first = await snapshotIntegrity(root, undefined, undefined, cache);
  await writeFile(path.join(root, 'model'), 'model');
  expect((await snapshotIntegrity(root, undefined, undefined, cache)).installedHash).not.toBe(
    first.installedHash,
  );
  await rm(path.join(root, 'core'));
  await expect(snapshotIntegrity(root, first.installedFiles, undefined, cache)).rejects.toThrow();
});

test('a cached file cannot be reused through a replaced intermediate directory link', async () => {
  const root = await temp(),
    directory = path.join(root, 'resource'),
    original = path.join(root, 'original'),
    cache = new SnapshotIntegrityCache();
  await mkdir(directory);
  await writeFile(path.join(directory, 'model'), 'model');
  const first = await snapshotIntegrity(root, undefined, undefined, cache);
  await rename(directory, original);
  await symlink(original, directory, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(snapshotIntegrity(root, first.installedFiles, undefined, cache)).rejects.toThrow(
    '目录不能是链接',
  );
});

test('a file changed during cache lookup is rejected before its cached digest is reused', async () => {
  const root = await temp(),
    filename = path.join(root, 'model'),
    cache = new SnapshotIntegrityCache();
  await writeFile(filename, 'model');
  const first = await snapshotIntegrity(root, undefined, undefined, cache),
    originalLookup = cache.lookup.bind(cache),
    lookup = spyOn(cache, 'lookup').mockImplementation((...args) => {
      const entry = originalLookup(...args);
      writeFileSync(filename, 'other');
      utimesSync(filename, new Date(0), new Date(0));
      return entry;
    });
  try {
    await expect(snapshotIntegrity(root, first.installedFiles, undefined, cache)).rejects.toThrow(
      '文件在读取期间发生变化',
    );
  } finally {
    lookup.mockRestore();
  }
  const repaired = await snapshotIntegrity(root, first.installedFiles, undefined, cache);
  expect(repaired).toEqual(await snapshotIntegrity(root, first.installedFiles));
  expect(repaired.installedHash).not.toBe(first.installedHash);
});

test('session cache retains at most eight generations and keeps recently used digests', async () => {
  const directories = await Promise.all(Array.from({ length: 9 }, () => temp())),
    cache = new SnapshotIntegrityCache();
  for (const directory of directories) await writeFile(path.join(directory, 'model'), 'model');
  const opened = spyOn(filesystem, 'open');
  try {
    for (const directory of directories.slice(0, 8))
      await snapshotIntegrity(directory, ['model'], undefined, cache);
    expect(opened).toHaveBeenCalledTimes(8);
    await snapshotIntegrity(directories[0]!, ['model'], undefined, cache);
    expect(opened).toHaveBeenCalledTimes(8);
    await snapshotIntegrity(directories[8]!, ['model'], undefined, cache);
    expect(opened).toHaveBeenCalledTimes(9);
    await snapshotIntegrity(directories[0]!, ['model'], undefined, cache);
    expect(opened).toHaveBeenCalledTimes(9);
    await snapshotIntegrity(directories[1]!, ['model'], undefined, cache);
    expect(opened).toHaveBeenCalledTimes(10);
  } finally {
    opened.mockRestore();
  }
});
