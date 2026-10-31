import { afterEach, expect, test } from 'bun:test';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pruneGenerations } from '@backend/infrastructure/filesystem/generation-retention.ts';

const temporary: string[] = [];
async function temp() {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'maaverge-retention-')));
  temporary.push(directory);
  return directory;
}
afterEach(async () => {
  for (const directory of temporary.splice(0)) {
    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== (await realpath(tmpdir())) ||
      !path.basename(resolved).startsWith('maaverge-retention-')
    ) {
      throw new Error('临时测试目录越界');
    }
    await rm(resolved, { recursive: true, force: true });
  }
});
const name = (channel: 'core' | 'resource', index: number) =>
  `${channel}-${index.toString(16).padStart(32, '0')}`;
const present = (directory: string) =>
  lstat(directory).then(
    () => true,
    () => false,
  );
async function create(root: string, channel: 'core' | 'resource', index: number, manifest = true) {
  const directory = path.join(root, 'generations', name(channel, index));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'payload'), `fixture ${index}`);
  if (manifest)
    await writeFile(
      path.join(directory, 'manifest.json'),
      JSON.stringify({
        path: directory,
        version: `v${index}`,
        validatedAt: new Date(Date.UTC(2026, 0, index)).toISOString(),
      }),
    );
  // Deliberately disagree with validatedAt: manifests determine validated order.
  const modified = new Date(Date.UTC(2026, 0, 31 - index));
  await utimes(directory, modified, modified);
  return directory;
}
async function names(root: string) {
  return (await readdir(path.join(root, 'generations'))).sort();
}

test('keeps the newest three core and resource generations independently across old and current roots', async () => {
  const base = await temp(),
    oldRoot = path.join(base, 'old'),
    currentRoot = path.join(base, 'current');
  for (const channel of ['core', 'resource'] as const) {
    for (let index = 1; index <= 5; index++)
      await create(index <= 2 ? oldRoot : currentRoot, channel, index);
  }
  await pruneGenerations([oldRoot, currentRoot, currentRoot], []);
  expect(await names(oldRoot)).toEqual([]);
  expect(await names(currentRoot)).toEqual([
    ...[3, 4, 5].map((index) => name('core', index)),
    ...[3, 4, 5].map((index) => name('resource', index)),
  ]);
});

test('active, previous and staged references take precedence over newer unreferenced generations', async () => {
  const root = await temp(),
    core: string[] = [],
    resource: string[] = [];
  for (let index = 1; index <= 5; index++) {
    core.push(await create(root, 'core', index));
    resource.push(await create(root, 'resource', index));
  }
  await pruneGenerations([root], [core[0], core[1], path.join(core[2], 'resource'), resource[0]]);
  expect(await names(root)).toEqual([
    ...[1, 2, 3].map((index) => name('core', index)),
    ...[1, 4, 5].map((index) => name('resource', index)),
  ]);
  expect(await readFile(path.join(core[0], 'payload'), 'utf8')).toBe('fixture 1');
});

test('keeps all live references even when they exceed the limit', async () => {
  const root = await temp(),
    generations: string[] = [];
  for (let index = 1; index <= 5; index++) generations.push(await create(root, 'core', index));
  await pruneGenerations([root], generations.slice(0, 4));
  expect(await names(root)).toEqual([1, 2, 3, 4].map((index) => name('core', index)));
  await pruneGenerations([root], generations.slice(0, 4), 1);
  expect(await names(root)).toEqual([1, 2, 3, 4].map((index) => name('core', index)));
});

test('installer generations without absolute paths share normal retention and reference protection', async () => {
  const root = await temp(),
    installed: string[] = [];
  for (let index = 1; index <= 5; index++) {
    const directory = await create(root, 'core', index);
    await writeFile(
      path.join(directory, 'manifest.json'),
      JSON.stringify({
        version: `v6.20.${index}`,
        installedHash: index.toString(16).padStart(32, '0') + 'f'.repeat(32),
        installedFiles: ['payload'],
        validatedAt: new Date(Date.UTC(2026, 0, index)).toISOString(),
      }),
    );
    installed.push(directory);
  }
  await pruneGenerations([root], [installed[0]]);
  expect(await names(root)).toEqual([1, 4, 5].map((index) => name('core', index)));
});

test('interrupted preparations without manifests use mtime and remain independently bounded', async () => {
  const root = await temp();
  for (let index = 1; index <= 5; index++) await create(root, 'core', index, false);
  await pruneGenerations([root], []);
  // create() sets descending mtimes, so the newest failed preparations are 1–3.
  expect(await names(root)).toEqual([1, 2, 3].map((index) => name('core', index)));
});

test('valid manifests with no validation timestamp fall back to directory mtime', async () => {
  const root = await temp();
  for (let index = 1; index <= 4; index++) {
    const directory = await create(root, 'resource', index, false);
    await writeFile(
      path.join(directory, 'manifest.json'),
      JSON.stringify({ path: directory, version: String(index) }),
    );
    const modified = new Date(Date.UTC(2026, 0, index));
    await utimes(directory, modified, modified);
  }
  await pruneGenerations([root], []);
  expect(await names(root)).toEqual([2, 3, 4].map((index) => name('resource', index)));
});

test('resource manifests retain ownership information even with a large owned-file inventory', async () => {
  const root = await temp();
  for (let index = 1; index <= 4; index++) {
    const directory = await create(root, 'resource', index);
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    manifest.ownedFiles = Array.from(
      { length: 3000 },
      (_, file) => `template/long-resource-name-${file}.png`,
    );
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  }
  await pruneGenerations([root], []);
  expect(await names(root)).toEqual([2, 3, 4].map((index) => name('resource', index)));
});

test('leaves foreign manifests, damaged metadata and arbitrary user files untouched', async () => {
  const root = await temp(),
    parent = path.join(root, 'generations');
  for (let index = 1; index <= 3; index++) await create(root, 'core', index);
  const foreign = await create(root, 'core', 4);
  await writeFile(
    path.join(foreign, 'manifest.json'),
    JSON.stringify({ path: root, version: 'foreign' }),
  );
  const invalid = await create(root, 'core', 5);
  await writeFile(path.join(invalid, 'manifest.json'), '{');
  const oversized = await create(root, 'core', 6);
  await writeFile(path.join(oversized, 'manifest.json'), ' '.repeat(16 * 1024 * 1024 + 1));
  const missingVersion = await create(root, 'core', 7);
  await writeFile(
    path.join(missingVersion, 'manifest.json'),
    JSON.stringify({ path: missingVersion }),
  );
  const arbitrary = [
    'core-old',
    'core-' + 'a'.repeat(31),
    'core-' + 'A'.repeat(32),
    'resource-' + 'g'.repeat(32),
    'user-data',
  ];
  for (const entry of arbitrary) await mkdir(path.join(parent, entry));
  await writeFile(path.join(parent, name('resource', 1)), 'user file');
  await pruneGenerations([root], []);
  expect((await names(root)).length).toBe(13);
  expect(await readFile(path.join(parent, name('resource', 1)), 'utf8')).toBe('user file');
  for (const directory of [foreign, invalid, oversized, missingVersion])
    expect(await present(directory)).toBe(true);
});

test('refuses links at the component root, generations parent and individual generation', async () => {
  const base = await temp(),
    real = path.join(base, 'real');
  for (let index = 1; index <= 4; index++) await create(real, 'core', index);
  const rootLink = path.join(base, 'root-link'),
    parentLinkRoot = path.join(base, 'parent-link');
  await symlink(real, rootLink, process.platform === 'win32' ? 'junction' : 'dir');
  await mkdir(parentLinkRoot);
  await symlink(
    path.join(real, 'generations'),
    path.join(parentLinkRoot, 'generations'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await pruneGenerations([rootLink, parentLinkRoot], []);
  expect(await names(real)).toHaveLength(4);
  const root = path.join(base, 'normal');
  for (let index = 1; index <= 3; index++) await create(root, 'core', index);
  const linked = path.join(root, 'generations', name('core', 4));
  await symlink(
    path.join(real, 'generations', name('core', 1)),
    linked,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await pruneGenerations([root], []);
  expect((await lstat(linked)).isSymbolicLink()).toBe(true);
  expect(await names(real)).toHaveLength(4);
});

test('refuses directory links inside an unreferenced generation without touching their targets', async () => {
  const root = await temp(),
    outside = path.join(root, 'user-data');
  await mkdir(outside);
  await writeFile(path.join(outside, 'account.txt'), 'private fixture');
  const oldest = await create(root, 'core', 1);
  for (let index = 2; index <= 4; index++) await create(root, 'core', index);
  await symlink(
    outside,
    path.join(oldest, 'resource'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await pruneGenerations([root], []);
  expect(await present(oldest)).toBe(true);
  expect(await readFile(path.join(outside, 'account.txt'), 'utf8')).toBe('private fixture');
});

test('canonicalizes reference aliases so a linked worker reference still protects its generation', async () => {
  const root = await temp(),
    oldest = await create(root, 'core', 1);
  for (let index = 2; index <= 4; index++) await create(root, 'core', index);
  const alias = path.join(root, 'worker-reference');
  await symlink(oldest, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await pruneGenerations([root], [alias]);
  expect(await names(root)).toEqual([1, 3, 4].map((index) => name('core', index)));
});

test('ignores missing and relative roots and does not count missing references as installed versions', async () => {
  const root = await temp();
  for (let index = 1; index <= 4; index++) await create(root, 'resource', index);
  await pruneGenerations(
    [path.join(root, 'missing'), '.', root],
    [path.join(root, 'generations', name('resource', 10))],
  );
  expect(await names(root)).toEqual([2, 3, 4].map((index) => name('resource', index)));
});

test('rejects invalid limits before removing any generation', async () => {
  const root = await temp();
  for (let index = 1; index <= 4; index++) await create(root, 'core', index);
  for (const limit of [0, -1, 1.5, Infinity, NaN])
    await expect(pruneGenerations([root], [], limit)).rejects.toThrow('正整数');
  expect(await names(root)).toHaveLength(4);
});
