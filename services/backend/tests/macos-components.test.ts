import { afterEach, expect, test } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  acquireMacosComponentLease,
  assertNoMacosComponentProcesses,
  macosComponentLocations,
  MacosUninstallError,
  parseMacosUninstallArguments,
  uninstallMacosApplication,
} from '@backend/infrastructure/macos-components';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [];
const leases: { close(): void }[] = [];
const temporary = () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-macos-uninstall-'));
  roots.push(root);
  return root;
};
afterEach(async () => {
  leases.splice(0).forEach((lease) => lease.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = temporary();
  const home = path.join(root, 'home');
  const locations = macosComponentLocations(home);
  const bundle = path.join(root, 'Applications', 'Maa Verge.app');
  const executable = path.join(bundle, 'Contents', 'Resources', 'runtime', 'maaverge-runtime');
  const data = path.join(root, 'config');
  const custom = path.join(root, 'custom-components');
  const trash = path.join(root, 'synthetic-trash');
  for (const directory of [
    locations.core,
    locations.resource,
    path.dirname(executable),
    data,
    custom,
    trash,
  ])
    await mkdir(directory, { recursive: true });
  await writeFile(executable, 'synthetic runtime, never executed');
  await writeFile(
    path.join(bundle, 'Contents', 'Info.plist'),
    'synthetic identity, verified by fixture',
  );
  await writeFile(path.join(locations.core, 'core.txt'), 'core');
  await writeFile(path.join(locations.resource, 'resource.txt'), 'resource');
  await writeFile(path.join(data, 'settings.txt'), 'saved settings');
  await writeFile(path.join(custom, 'keep.txt'), 'custom');
  const moved: string[] = [];
  const environment = {
    platform: 'darwin' as const,
    standalone: true,
    executable,
    pid: 55,
    homeDirectory: home,
    verifyBundle: async (candidate: string) => {
      expect(candidate).toBe(bundle);
    },
    processes: async () => `55 ${executable}\n23 /usr/bin/unrelated-app\n`,
    trash: async (target: string) => {
      await rename(target, path.join(trash, `${moved.length}-${path.basename(target)}`));
      moved.push(target);
    },
  };
  return {
    root,
    home,
    locations,
    bundle,
    executable,
    data,
    custom,
    trash,
    moved,
    environment,
    request: { bundle, dataRoots: [data] },
  };
}

test('component roots and stable lease stay outside the app and separate from device leases', () => {
  const home = temporary();
  const result = macosComponentLocations(home);
  expect(result.core).toBe(
    path.join(home, 'Library', 'Application Support', 'Maa Verge', 'MaaCore'),
  );
  expect(result.resource).toBe(
    path.join(home, 'Library', 'Application Support', 'Maa Verge', 'MaaResource'),
  );
  expect(result.lock).toBe(
    path.join(home, 'Library', 'Application Support', '.maaverge-components-lock.sqlite3'),
  );
  expect(() => macosComponentLocations('relative')).toThrow('完整绝对路径');
});

test('shared services coexist and block exclusive cleanup until every service releases its lease', () => {
  const home = temporary();
  const first = acquireMacosComponentLease('shared', home);
  const second = acquireMacosComponentLease('shared', home);
  leases.push(first, second);
  const lock = macosComponentLocations(home).lock;
  const inode = statSync(lock).ino;
  expect(() => acquireMacosComponentLease('exclusive', home)).toThrow('其他 Maa Verge 服务');
  first.close();
  expect(() => acquireMacosComponentLease('exclusive', home)).toThrow('其他 Maa Verge 服务');
  second.close();
  const cleanup = acquireMacosComponentLease('exclusive', home);
  leases.push(cleanup);
  expect(() => acquireMacosComponentLease('shared', home)).toThrow('其他 Maa Verge 服务');
  cleanup.close();
  cleanup.close();
  expect(existsSync(lock)).toBe(true);
  expect(statSync(lock).ino).toBe(inode);
  const resumed = acquireMacosComponentLease('shared', home);
  leases.push(resumed);
});

test('component lease excludes cleanup in another process and releases after that process exits', async () => {
  const home = temporary();
  const module = new URL('../src/infrastructure/macos-components.ts', import.meta.url).href;
  const source = `const { acquireMacosComponentLease } = await import(${JSON.stringify(module)});
const lease = acquireMacosComponentLease('shared', ${JSON.stringify(home)});
process.stdout.write('ready\\n');
await new Response(Bun.stdin.stream()).text();
lease.close();`;
  const child = Bun.spawn([process.execPath, '--eval', source], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    const reader = child.stdout.getReader();
    const ready = await reader.read();
    reader.releaseLock();
    expect(new TextDecoder().decode(ready.value)).toBe('ready\n');
    expect(() => acquireMacosComponentLease('exclusive', home)).toThrow('其他 Maa Verge 服务');
  } finally {
    child.stdin.end();
    expect(await child.exited).toBe(0);
  }
  const cleanup = acquireMacosComponentLease('exclusive', home);
  leases.push(cleanup);
});

test('CLI accepts only the fixed bundle and bounded preserved data roots', () => {
  const root = temporary(),
    bundle = path.join(root, 'Maa Verge.app'),
    data = path.join(root, 'config');
  expect(
    parseMacosUninstallArguments([
      '--uninstall-macos',
      '--bundle',
      bundle,
      '--data-root',
      data,
      '--data-root',
      data,
    ]),
  ).toEqual({ bundle, dataRoots: [data] });
  for (const args of [
    ['--uninstall-macos', '--bundle', bundle],
    ['--uninstall-macos', '--bundle', 'relative', '--data-root', data],
    ['--uninstall-macos', '--bundle', bundle, '--bundle', bundle, '--data-root', data],
    ['--uninstall-macos', '--bundle', bundle, '--delete', data],
    ['--uninstall-macos', '--bundle', bundle, '--data-root'],
    [
      '--uninstall-macos',
      '--bundle',
      bundle,
      ...Array.from({ length: 9 }, (_, i) => ['--data-root', path.join(root, String(i))]).flat(),
    ],
  ])
    expect(() => parseMacosUninstallArguments(args)).toThrow();
});

test('uninstall moves only fixed component roots and the bound app while preserving data, custom components and the lease file', async () => {
  const f = await fixture();
  const result = await uninstallMacosApplication(f.request, f.environment);
  expect(result.movedPaths).toEqual([f.locations.core, f.locations.resource, f.bundle]);
  expect(f.moved).toEqual(result.movedPaths);
  for (const target of result.movedPaths) expect(existsSync(target)).toBe(false);
  expect(await readFile(path.join(f.data, 'settings.txt'), 'utf8')).toBe('saved settings');
  expect(await readFile(path.join(f.custom, 'keep.txt'), 'utf8')).toBe('custom');
  expect(await readFile(path.join(f.trash, '0-MaaCore', 'core.txt'), 'utf8')).toBe('core');
  expect(existsSync(f.locations.lock)).toBe(true);
  leases.push(acquireMacosComponentLease('shared', f.home));
});

test('exclusive lease refuses cleanup while another data root has a shared component lease', async () => {
  const f = await fixture();
  leases.push(acquireMacosComponentLease('shared', f.home));
  await expect(uninstallMacosApplication(f.request, f.environment)).rejects.toThrow(
    '其他 Maa Verge 服务',
  );
  expect(f.moved).toEqual([]);
  expect(existsSync(f.bundle)).toBe(true);
});

test('new service startup remains blocked throughout each trash operation', async () => {
  const f = await fixture();
  const trash = f.environment.trash;
  await uninstallMacosApplication(f.request, {
    ...f.environment,
    trash: async (target) => {
      expect(() => acquireMacosComponentLease('shared', f.home)).toThrow('其他 Maa Verge 服务');
      await trash(target);
    },
  });
  expect(f.moved).toHaveLength(3);
});

test('surviving native worker or another packaged runtime prevents all deletion', async () => {
  for (const name of ['maaverge-core-worker', 'maaverge-runtime']) {
    const f = await fixture();
    await expect(
      uninstallMacosApplication(f.request, {
        ...f.environment,
        processes: async () =>
          `55 ${f.executable}\n77 /Other Maa Verge.app/Contents/Resources/runtime/${name}\n`,
      }),
    ).rejects.toThrow('核心进程在运行');
    expect(f.moved).toEqual([]);
    leases.push(acquireMacosComponentLease('shared', f.home));
  }
});

test('process scan excludes itself and does not confuse similar process names', () => {
  expect(() =>
    assertNoMacosComponentProcesses(
      '55 /some path/maaverge-runtime\n23 /usr/bin/not-maaverge-runtime\n',
      55,
    ),
  ).not.toThrow();
  expect(() => assertNoMacosComponentProcesses('99 /some path/maaverge-core-worker\n', 55)).toThrow(
    '核心进程在运行',
  );
});

test('data roots inside either component tree or the app reject uninstall before any trash operation', async () => {
  for (const target of ['core', 'resource', 'bundle'] as const) {
    const f = await fixture();
    const root = target === 'bundle' ? f.bundle : f.locations[target];
    await expect(
      uninstallMacosApplication(
        { ...f.request, dataRoots: [f.data, path.join(root, 'nested', 'config')] },
        f.environment,
      ),
    ).rejects.toThrow('请先迁出数据');
    expect(f.moved).toEqual([]);
  }
});

test('case variants of preserved paths are conservatively protected on macOS', async () => {
  const f = await fixture();
  const variant = path.join(f.locations.root, 'maacore', 'not-created-config');
  await expect(
    uninstallMacosApplication({ ...f.request, dataRoots: [variant] }, f.environment),
  ).rejects.toThrow('请先迁出数据');
  expect(f.moved).toEqual([]);
});

test('an app nested inside a component tree is rejected before moving either tree', async () => {
  const f = await fixture();
  const bundle = path.join(f.locations.core, 'Nested.app');
  await rename(f.bundle, bundle);
  await expect(
    uninstallMacosApplication(
      { ...f.request, bundle },
      {
        ...f.environment,
        executable: path.join(bundle, 'Contents', 'Resources', 'runtime', 'maaverge-runtime'),
      },
    ),
  ).rejects.toThrow('不能互相包含');
  expect(f.moved).toEqual([]);
  expect(existsSync(bundle)).toBe(true);
  expect(existsSync(f.locations.lock)).toBe(false);
});

test('component roots nested inside the app are rejected before creating the lease inside its signature seal', async () => {
  const f = await fixture();
  const home = path.join(f.bundle, 'ComponentsHome');
  const locations = macosComponentLocations(home);
  await mkdir(locations.core, { recursive: true });
  await mkdir(locations.resource, { recursive: true });
  await expect(
    uninstallMacosApplication(f.request, { ...f.environment, homeDirectory: home }),
  ).rejects.toThrow('不能互相包含');
  expect(f.moved).toEqual([]);
  expect(existsSync(locations.lock)).toBe(false);
});

test.skipIf(process.platform === 'win32')(
  'preserved data aliases resolving into components are protected',
  async () => {
    const f = await fixture();
    const alias = path.join(f.root, 'data-alias');
    await symlink(f.locations.core, alias, 'dir');
    await expect(
      uninstallMacosApplication(
        { ...f.request, dataRoots: [path.join(alias, 'config')] },
        f.environment,
      ),
    ).rejects.toThrow('请先迁出数据');
    expect(f.moved).toEqual([]);
  },
);

test.skipIf(process.platform === 'win32')(
  'linked component roots and linked ancestors refuse cleanup without following them',
  async () => {
    const target = await fixture();
    await rm(target.locations.resource, { recursive: true });
    await symlink(target.custom, target.locations.resource, 'dir');
    await expect(uninstallMacosApplication(target.request, target.environment)).rejects.toThrow(
      '符号链接',
    );
    expect(target.moved).toEqual([]);
    const ancestor = await fixture();
    await rm(ancestor.locations.root, { recursive: true });
    await symlink(ancestor.custom, ancestor.locations.root, 'dir');
    await expect(uninstallMacosApplication(ancestor.request, ancestor.environment)).rejects.toThrow(
      '符号链接',
    );
    expect(ancestor.moved).toEqual([]);
    expect(await readFile(path.join(ancestor.custom, 'keep.txt'), 'utf8')).toBe('custom');
  },
);

test.skipIf(process.platform === 'win32')(
  'a linked lock file or lock ancestor is never followed or replaced',
  async () => {
    const f = await fixture();
    await mkdir(path.dirname(f.locations.lock), { recursive: true });
    const preserved = path.join(f.root, 'unrelated.sqlite3');
    await writeFile(preserved, 'keep');
    await symlink(preserved, f.locations.lock);
    expect(() => acquireMacosComponentLease('exclusive', f.home)).toThrow('符号链接');
    expect(await readFile(preserved, 'utf8')).toBe('keep');
    const root = temporary(),
      home = path.join(root, 'linked-home');
    await symlink(f.home, home, 'dir');
    expect(() => acquireMacosComponentLease('shared', home)).toThrow('符号链接');
  },
);

test('invalid app binding, unsupported host, development runtime and invalid identity preserve all paths', async () => {
  const f = await fixture();
  for (const override of [
    { executable: path.join(f.root, 'different-runtime') },
    { standalone: false },
    { platform: 'linux' as const },
    {
      verifyBundle: async () => {
        throw new Error('wrong application identity');
      },
    },
  ])
    await expect(
      uninstallMacosApplication(f.request, { ...f.environment, ...override }),
    ).rejects.toThrow();
  expect(f.moved).toEqual([]);
  expect(existsSync(f.bundle)).toBe(true);
});

test('all targets are preflighted before deleting an earlier valid component tree', async () => {
  const f = await fixture();
  await rm(f.locations.resource, { recursive: true });
  await writeFile(f.locations.resource, 'not a directory');
  await expect(uninstallMacosApplication(f.request, f.environment)).rejects.toThrow('不是文件夹');
  expect(f.moved).toEqual([]);
});

test('partial trash failure reports the moved paths and leaves the app plus user data recoverable', async () => {
  const f = await fixture();
  const trash = f.environment.trash;
  let failure: unknown;
  try {
    await uninstallMacosApplication(f.request, {
      ...f.environment,
      trash: async (target) => {
        if (target === f.locations.resource) throw new Error('synthetic Trash failure');
        await trash(target);
      },
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(MacosUninstallError);
  expect((failure as MacosUninstallError).movedPaths).toEqual([f.locations.core]);
  expect((failure as Error).message).toContain('可从废纸篓恢复');
  expect(existsSync(f.bundle)).toBe(true);
  expect(existsSync(f.locations.resource)).toBe(true);
  expect(existsSync(path.join(f.data, 'settings.txt'))).toBe(true);
  leases.push(acquireMacosComponentLease('shared', f.home));
});

test('uninstalled component folders are optional and only the app is moved when both are missing', async () => {
  const f = await fixture();
  await rm(f.locations.root, { recursive: true });
  expect((await uninstallMacosApplication(f.request, f.environment)).movedPaths).toEqual([
    f.bundle,
  ]);
});
