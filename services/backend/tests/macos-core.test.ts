import { afterEach, expect, test } from 'bun:test';
import { cp, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractMacosMirrorCore, type MacosCoreCommand } from '@backend/modules/updates/macos-core';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';
import { zipBytes } from './archive-fixture';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(
  options: {
    badPlist?: boolean;
    wrongMount?: boolean;
    attachFailure?: boolean;
    detachFailure?: boolean;
    attachBeforeFailure?: boolean;
    internalLinks?: boolean;
  } = {},
) {
  const root = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-macos-mirror-'));
  roots.push(root);
  const bundle = path.join(root, 'source', 'MAA.app');
  const frameworks = path.join(bundle, 'Contents', 'Frameworks');
  const resource = path.join(bundle, 'Contents', 'Resources', 'resource');
  const target = path.join(root, 'generation');
  const archive = path.join(root, 'mirror.zip');
  await mkdir(frameworks, { recursive: true });
  await mkdir(resource, { recursive: true });
  await writeFile(path.join(frameworks, 'libMaaCore.dylib'), 'synthetic core, never loaded');
  await writeFile(path.join(frameworks, 'libMaaUtils.dylib'), 'synthetic dependency');
  await writeFile(path.join(frameworks, 'libonnxruntime.1.22.0.dylib'), 'synthetic onnx');
  if (options.internalLinks)
    await symlink('libonnxruntime.1.22.0.dylib', path.join(frameworks, 'libonnxruntime.dylib'));
  await writeFile(path.join(frameworks, 'libopencv_world412.dylib'), 'synthetic opencv');
  await mkdir(path.join(frameworks, 'Sparkle.framework'));
  await writeFile(path.join(frameworks, 'Sparkle.framework', 'excluded'), 'GUI updater');
  await writeFile(path.join(resource, 'version.json'), '{"last_updated":"synthetic"}');
  await writeFile(path.join(resource, 'empty.txt'), '');
  await writeFile(path.join(resource, 'tasks.json'), '{}');
  if (options.internalLinks) await symlink('tasks.json', path.join(resource, 'tasks-alias.json'));
  else await writeFile(path.join(resource, 'tasks-alias.json'), '{}');
  await mkdir(path.join(bundle, 'Contents', 'MacOS'));
  await writeFile(path.join(bundle, 'Contents', 'MacOS', 'MAA'), 'excluded GUI');
  const imageName = 'MAA-v6.20.1-macos-universal.dmg';
  await writeFile(
    archive,
    zipBytes([{ name: imageName, content: 'synthetic DMG, never mounted' }]),
  );
  const calls: Array<{ executable: string; args: readonly string[]; input?: string }> = [];
  let mount = '';
  let mounted = false;
  const command: MacosCoreCommand = async (executable, args, input) => {
    calls.push({ executable, args: [...args], input });
    if (executable === '/usr/bin/hdiutil' && args[0] === 'attach') {
      mount = args[args.indexOf('-mountpoint') + 1];
      if (options.attachBeforeFailure) throw new Error('synthetic attach failure before mount');
      await cp(bundle, path.join(mount, 'MAA.app'), { recursive: true, verbatimSymlinks: true });
      mounted = true;
      if (options.attachFailure) throw new Error('synthetic attach failure after mount');
      return 'synthetic plist';
    }
    if (executable === '/usr/bin/plutil') {
      if (input === 'synthetic mount inventory')
        return JSON.stringify({
          images: mounted ? [{ 'system-entities': [{ 'mount-point': mount }] }] : [],
        });
      expect(input).toBe('synthetic plist');
      return options.badPlist
        ? 'invalid plist'
        : JSON.stringify({
            'system-entities': [{ 'mount-point': options.wrongMount ? root : mount }],
          });
    }
    if (executable === '/usr/bin/hdiutil' && args[0] === 'detach') {
      expect(args).toEqual(['detach', mount]);
      if (options.detachFailure) throw new Error('synthetic detach failure');
      // A fake unmount removes its synthetic payload, never invoking a system mount.
      for (const entry of await readdir(mount))
        await rm(path.join(mount, entry), { recursive: true, force: true });
      mounted = false;
      return '';
    }
    if (executable === '/usr/bin/hdiutil' && args[0] === 'info') {
      expect(args).toEqual(['info', '-plist']);
      return 'synthetic mount inventory';
    }
    throw new Error('Unexpected synthetic system command');
  };
  const scratch = async () =>
    (await readdir(root)).filter((name) => name.startsWith('.maaverge-mirror-core-'));
  const extract = (extra = {}) =>
    extractMacosMirrorCore(archive, target, {
      runCommand: command,
      expectedVersion: 'v6.20.1',
      ...extra,
    });
  return { root, bundle, frameworks, resource, target, archive, calls, command, extract, scratch };
}

test('official macOS Mirror ZIP mounts read-only and materializes a flat runtime without the GUI', async () => {
  const f = await fixture();
  await f.extract();
  expect(await readFile(path.join(f.target, 'libMaaCore.dylib'), 'utf8')).toContain(
    'synthetic core',
  );
  expect(await readFile(path.join(f.target, 'libonnxruntime.dylib'), 'utf8')).toBe(
    'synthetic onnx',
  );
  expect(await readFile(path.join(f.target, 'libopencv_world4.dylib'), 'utf8')).toBe(
    'synthetic opencv',
  );
  expect((await lstat(path.join(f.target, 'libonnxruntime.dylib'))).isSymbolicLink()).toBe(false);
  expect((await lstat(path.join(f.target, 'resource', 'tasks-alias.json'))).isSymbolicLink()).toBe(
    false,
  );
  expect(await readFile(path.join(f.target, 'resource', 'empty.txt'), 'utf8')).toBe('');
  expect((await readdir(f.target)).sort()).toEqual(
    [
      'libMaaCore.dylib',
      'libMaaUtils.dylib',
      'libonnxruntime.1.22.0.dylib',
      'libonnxruntime.dylib',
      'libopencv_world4.dylib',
      'libopencv_world412.dylib',
      'resource',
    ].sort(),
  );
  expect(f.calls[0].executable).toBe('/usr/bin/hdiutil');
  expect(f.calls[0].args.slice(0, 6)).toEqual([
    'attach',
    '-readonly',
    '-nobrowse',
    '-noautoopen',
    '-plist',
    '-mountpoint',
  ]);
  expect(f.calls[1].args).toEqual(['-convert', 'json', '-o', '-', '-']);
  expect(f.calls.at(-1)?.args[0]).toBe('detach');
  expect(await f.scratch()).toEqual([]);
});

test('a direct DMG uses the same isolated extraction without treating it as a tar archive', async () => {
  const f = await fixture();
  await writeFile(f.archive, 'synthetic DMG, never mounted');
  await f.extract();
  expect(f.calls[0].args.at(-1)).toBe(f.archive);
  expect(await f.scratch()).toEqual([]);
});

test('optional runtime license files and notice directories are preserved without unrelated GUI resources', async () => {
  const f = await fixture();
  await writeFile(path.join(f.bundle, 'LICENSE'), 'upstream license');
  await writeFile(path.join(f.frameworks, 'THIRD-PARTY-NOTICES.txt'), 'dependency notice');
  const resources = path.dirname(f.resource);
  await mkdir(path.join(resources, 'notices'));
  await writeFile(path.join(resources, 'notices', 'dependency.txt'), 'nested notice');
  await writeFile(path.join(resources, 'unrelated.txt'), 'excluded GUI resource');
  await f.extract();
  expect(await readFile(path.join(f.target, 'licenses', 'app', 'LICENSE'), 'utf8')).toBe(
    'upstream license',
  );
  expect(
    await readFile(
      path.join(f.target, 'licenses', 'frameworks', 'THIRD-PARTY-NOTICES.txt'),
      'utf8',
    ),
  ).toBe('dependency notice');
  expect(
    await readFile(
      path.join(f.target, 'licenses', 'resources', 'notices', 'dependency.txt'),
      'utf8',
    ),
  ).toBe('nested notice');
  expect(await Bun.file(path.join(f.target, 'unrelated.txt')).exists()).toBe(false);
});

test.skipIf(process.platform === 'win32')(
  'internal library and resource file aliases become regular generation files',
  async () => {
    const f = await fixture({ internalLinks: true });
    await f.extract();
    expect((await lstat(path.join(f.target, 'libonnxruntime.dylib'))).isSymbolicLink()).toBe(false);
    expect(await readFile(path.join(f.target, 'libonnxruntime.dylib'), 'utf8')).toBe(
      'synthetic onnx',
    );
    expect(
      (await lstat(path.join(f.target, 'resource', 'tasks-alias.json'))).isSymbolicLink(),
    ).toBe(false);
    expect(await readFile(path.join(f.target, 'resource', 'tasks-alias.json'), 'utf8')).toBe('{}');
  },
);

test.each(['nested image', 'multiple images', 'wrong version', 'incremental'])(
  'macOS Mirror rejects %s before mounting',
  async (kind) => {
    const f = await fixture();
    const image = 'MAA-v6.20.1-macos-universal.dmg';
    const entries =
      kind === 'nested image'
        ? [{ name: 'wrapper/' + image, content: 'DMG' }]
        : kind === 'multiple images'
          ? [
              { name: image, content: 'DMG' },
              { name: 'MAA-v6.20.0-macos-universal.dmg', content: 'DMG' },
            ]
          : kind === 'wrong version'
            ? [{ name: 'MAA-v6.20.0-macos-universal.dmg', content: 'DMG' }]
            : [
                { name: image, content: 'DMG' },
                { name: 'changes.json', content: '{}' },
              ];
    await writeFile(f.archive, zipBytes(entries));
    await expect(f.extract()).rejects.toThrow();
    expect(f.calls).toEqual([]);
    expect(await readdir(f.target)).toEqual([]);
    expect(await f.scratch()).toEqual([]);
  },
);

test.each(['missing core', 'missing resource version', 'incremental'])(
  'macOS Mirror rejects %s and detaches before cleaning the scratch directory',
  async (kind) => {
    const f = await fixture();
    if (kind === 'missing core') await rm(path.join(f.frameworks, 'libMaaCore.dylib'));
    if (kind === 'missing resource version') await rm(path.join(f.resource, 'version.json'));
    if (kind === 'incremental') await writeFile(path.join(f.resource, 'changes.json'), '{}');
    await expect(f.extract()).rejects.toThrow();
    expect(f.calls.at(-1)?.args[0]).toBe('detach');
    expect(await readdir(f.target)).toEqual([]);
    expect(await f.scratch()).toEqual([]);
  },
);

for (const kind of ['dylib escape', 'resource escape', 'directory link']) {
  test.skipIf(process.platform === 'win32')(
    `macOS Mirror rejects ${kind} before copying and still detaches`,
    async () => {
      const f = await fixture();
      if (kind === 'directory link') {
        await mkdir(path.join(f.resource, 'inside'));
        await symlink('inside', path.join(f.resource, 'directory-alias'));
      } else {
        const outside = path.join(f.root, 'outside');
        await writeFile(outside, 'must never be copied');
        await symlink(
          outside,
          path.join(
            kind === 'dylib escape' ? f.frameworks : f.resource,
            kind === 'dylib escape' ? 'libEscape.dylib' : 'escape.json',
          ),
        );
      }
      await expect(f.extract()).rejects.toThrow();
      expect(f.calls.at(-1)?.args[0]).toBe('detach');
      expect(await readdir(f.target)).toEqual([]);
      expect(await f.scratch()).toEqual([]);
    },
  );
}

test.each(['badPlist', 'wrongMount', 'attachFailure'] as const)(
  'macOS Mirror %s still detaches a potentially mounted volume',
  async (failure) => {
    const f = await fixture({ [failure]: true });
    await expect(f.extract()).rejects.toThrow();
    expect(f.calls.at(-1)?.args[0]).toBe('detach');
    expect(await f.scratch()).toEqual([]);
  },
);

test('a failed detach preserves the scratch mount instead of recursively removing its contents', async () => {
  const f = await fixture({ detachFailure: true });
  await expect(f.extract()).rejects.toThrow('卸载失败');
  const [scratch] = await f.scratch();
  expect(scratch).toBeDefined();
  expect(
    await readFile(
      path.join(f.root, scratch, 'mount', 'MAA.app', 'Contents', 'Frameworks', 'libMaaCore.dylib'),
      'utf8',
    ),
  ).toContain('synthetic core');
});

test('attach failure without a mounted volume preserves the original error and cleans its scratch directory', async () => {
  const f = await fixture({ attachBeforeFailure: true, detachFailure: true });
  await expect(f.extract()).rejects.toThrow('attach failure before mount');
  expect(f.calls.some((call) => call.args[0] === 'info')).toBe(true);
  expect(await f.scratch()).toEqual([]);
});

test('macOS Mirror refuses an existing candidate and limits expanded runtime bytes', async () => {
  const f = await fixture();
  await mkdir(f.target);
  await writeFile(path.join(f.target, 'keep'), 'existing candidate');
  await expect(f.extract()).rejects.toThrow('新的空目录');
  expect(f.calls).toEqual([]);
  expect(await readFile(path.join(f.target, 'keep'), 'utf8')).toBe('existing candidate');
  await rm(f.target, { recursive: true });
  await writeFile(f.archive, 'DMG');
  await expect(f.extract({ maxExpandedBytes: 8 })).rejects.toThrow('展开大小');
  expect(f.calls.at(-1)?.args[0]).toBe('detach');
  expect(await f.scratch()).toEqual([]);
});
