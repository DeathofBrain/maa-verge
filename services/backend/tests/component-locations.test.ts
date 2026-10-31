import { afterEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultComponentPaths, deviceLockPath } from '@backend/infrastructure/config';
import { parseSettings } from '@backend/modules/settings/models';
import { Runtime } from '@backend/app/runtime';
import {
  resourceVersionDetail,
  resourceVersionLabel,
} from '../../../apps/desktop/src/shared/lib/update-display';
import type { UpdateChannel } from '@contracts/types';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const instances: Runtime[] = [],
  roots: string[] = [];
const temporary = () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-component-locations-'));
  roots.push(root);
  return root;
};
afterEach(async () => {
  await Promise.all(instances.splice(0).map((runtime) => runtime.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('macOS installed defaults use user application support while development remains isolated', () => {
  const first = temporary(),
    second = temporary(),
    app = path.join(first, 'program'),
    home = path.join(first, 'home'),
    support = path.join(home, 'Library', 'Application Support', 'Maa Verge');
  const installed = new Runtime(path.join(first, 'data'), {
    applicationDirectory: app,
    componentEnvironment: { platform: 'darwin', homeDirectory: home },
    calendar: { fetcher: null },
  });
  instances.push(installed);
  expect(installed.snapshot().settings.componentPaths).toEqual({
    core: path.join(support, 'MaaCore'),
    resource: path.join(support, 'MaaResource'),
  });
  const development = new Runtime(second, {
    componentEnvironment: { platform: 'darwin', homeDirectory: home },
    calendar: { fetcher: null },
  });
  instances.push(development);
  expect(development.snapshot().settings.componentPaths).toEqual(defaultComponentPaths(second));
  expect(installed.updates.channel('resource').installDirectory).toBe(
    path.join(support, 'MaaResource'),
  );
});

test('Windows and Linux installed component defaults remain beside the application', () => {
  const root = temporary(),
    app = path.join(root, 'program'),
    home = path.join(root, 'home');
  for (const platform of ['win32', 'linux'] as const)
    expect(defaultComponentPaths(root, app, { platform, homeDirectory: home })).toEqual({
      core: path.join(app, 'MaaCore'),
      resource: path.join(app, 'MaaResource'),
    });
});

test('the component home override changes macOS defaults without changing shared device lease identities', () => {
  const root = temporary(),
    app = path.join(root, 'application'),
    home = path.join(root, 'home'),
    previous = process.env.MAAVERGE_COMPONENT_HOME,
    lease = deviceLockPath('synthetic-component-home');
  process.env.MAAVERGE_COMPONENT_HOME = home;
  try {
    expect(defaultComponentPaths(root, app, { platform: 'darwin' })).toEqual({
      core: path.join(home, 'Library', 'Application Support', 'Maa Verge', 'MaaCore'),
      resource: path.join(home, 'Library', 'Application Support', 'Maa Verge', 'MaaResource'),
    });
    expect(deviceLockPath('synthetic-component-home')).toBe(lease);
    expect(defaultComponentPaths(root, undefined, { platform: 'darwin' })).toEqual({
      core: path.join(root, 'components', 'core'),
      resource: path.join(root, 'components', 'resource'),
    });
  } finally {
    if (previous === undefined) delete process.env.MAAVERGE_COMPONENT_HOME;
    else process.env.MAAVERGE_COMPONENT_HOME = previous;
  }
});

test('macOS migrates old download defaults while preserving installed generation paths and maintenance roots', async () => {
  const root = temporary(),
    app = path.join(root, 'application'),
    environment = { platform: 'darwin' as const, homeDirectory: path.join(root, 'home') },
    options = {
      applicationDirectory: app,
      componentEnvironment: environment,
      calendar: { fetcher: null },
    };
  const original = new Runtime(root, {
    ...options,
    componentEnvironment: { ...environment, platform: 'linux' },
  });
  instances.push(original);
  const old = original.snapshot().settings.componentPaths!;
  const core = {
    path: path.join(old.core, 'generations', `core-${'a'.repeat(32)}`),
    version: 'v6.20.1',
  };
  const resource = {
    path: path.join(old.resource, 'generations', `resource-${'b'.repeat(32)}`),
    version: 'b'.repeat(40),
    coreVersion: core.version,
  };
  for (const snapshot of [core, resource]) {
    await mkdir(path.join(snapshot.path, 'resource'), { recursive: true });
    await writeFile(path.join(snapshot.path, 'resource/version.json'), '{}');
    await writeFile(path.join(snapshot.path, 'manifest.json'), JSON.stringify(snapshot));
  }
  await writeFile(path.join(core.path, 'libMaaCore.dylib'), 'synthetic payload, never loaded');
  const combo = { core, resource },
    remembered = path.join(root, 'previous-custom-root');
  original.store.put('active', 'combo', combo);
  original.store.put('previous', 'combo', combo);
  original.store.put('staged', 'resource', resource);
  original.store.put('meta', 'component_roots', [remembered]);
  await original.close();
  instances.splice(instances.indexOf(original), 1);

  const migrated = new Runtime(root, options);
  instances.push(migrated);
  const defaults = defaultComponentPaths(root, app, environment);
  expect(migrated.snapshot().settings.componentPaths).toEqual(defaults);
  expect(migrated.updates.channel('core').installDirectory).toBe(defaults.core);
  expect(migrated.store.get('active', 'combo')).toEqual(combo);
  expect(migrated.store.get('previous', 'combo')).toEqual(combo);
  expect(migrated.store.get('staged', 'resource')).toEqual(resource);
  for (const directory of [remembered, old.core, old.resource])
    expect(migrated.store.get('meta', 'component_roots')).toContain(directory);
  await migrated.close();
  instances.splice(instances.indexOf(migrated), 1);
  expect(await readFile(path.join(core.path, 'libMaaCore.dylib'), 'utf8')).toBe(
    'synthetic payload, never loaded',
  );
  expect(await readFile(path.join(resource.path, 'resource/version.json'), 'utf8')).toBe('{}');
  expect(existsSync(defaults.core)).toBe(false);
  expect(existsSync(defaults.resource)).toBe(false);
});

test('macOS migration and restoring defaults preserve independently configured component directories', async () => {
  const root = temporary(),
    app = path.join(root, 'application'),
    environment = { platform: 'darwin' as const, homeDirectory: path.join(root, 'home') },
    options = {
      applicationDirectory: app,
      componentEnvironment: environment,
      calendar: { fetcher: null },
    },
    customResource = path.join(root, 'custom-resource');
  const original = new Runtime(root, options);
  instances.push(original);
  original.store.put('settings', 'main', {
    ...original.snapshot().settings,
    componentPaths: { core: path.join(app, 'MaaCore'), resource: customResource },
  });
  await original.close();
  instances.splice(instances.indexOf(original), 1);
  const migrated = new Runtime(root, options);
  instances.push(migrated);
  const defaults = defaultComponentPaths(root, app, environment);
  expect(migrated.snapshot().settings.componentPaths).toEqual({
    core: defaults.core,
    resource: customResource,
  });
  const custom = { core: path.join(root, 'custom-core'), resource: customResource };
  await migrated.handle('settings.save', {
    settings: { ...migrated.snapshot().settings, componentPaths: custom },
  });
  await migrated.close();
  instances.splice(instances.indexOf(migrated), 1);
  const restarted = new Runtime(root, options);
  instances.push(restarted);
  expect(restarted.snapshot().settings.componentPaths).toEqual(custom);
  const reset = await restarted.handle('settings.save', {
    settings: {
      ...restarted.snapshot().settings,
      componentPaths: { core: '', resource: '' },
    },
  });
  expect(reset.componentPaths).toEqual(defaults);
});

test('component settings validate absolute paths, preserve preferences for old clients and restore defaults', async () => {
  const root = temporary(),
    runtime = new Runtime(root);
  instances.push(runtime);
  for (const value of ['relative/path', '../outside', 'C:relative', 'bad\0path'])
    expect(() => parseSettings({ componentPaths: { core: value, resource: root } })).toThrow(
      '绝对路径',
    );
  const custom = {
    core: path.join(root, 'custom-core'),
    resource: path.join(root, 'custom-resource'),
  };
  const saved = await runtime.handle('settings.save', {
    settings: { ...runtime.snapshot().settings, componentPaths: custom },
  });
  expect(saved.componentPaths).toEqual(custom);
  expect(
    (await runtime.handle('settings.save', { settings: parseSettings({ theme: 'dark' }) }))
      .componentPaths,
  ).toEqual(custom);
  const file = path.join(root, 'file');
  await writeFile(file, 'preserved');
  await expect(
    runtime.handle('settings.save', {
      settings: { ...saved, componentPaths: { ...custom, core: file } },
    }),
  ).rejects.toThrow('目录无法写入');
  expect(runtime.snapshot().settings.componentPaths).toEqual(custom);
  expect(await readFile(file, 'utf8')).toBe('preserved');
  const reset = await runtime.handle('settings.save', {
    settings: { ...saved, componentPaths: { core: '', resource: '' } },
  });
  expect(reset.componentPaths).toEqual(defaultComponentPaths(root));
});

test('UI resource versions show client activity and keep exact source version as detail', () => {
  const resource: UpdateChannel = {
    id: 'resource',
    currentVersion: 'a'.repeat(40),
    latestVersion: null,
    status: 'active',
    progress: 100,
    message: '',
    resourceActivities: [
      { clientType: 'Official' as const, name: '合成活动', lastUpdated: '2026-10-23' },
      { clientType: 'YoStarEN' as const, name: 'Synthetic event', lastUpdated: '2026-10-20' },
    ],
  };
  expect(resourceVersionLabel(resource)).toBe('合成活动');
  expect(resourceVersionLabel(resource, 'YoStarEN')).toBe('Synthetic event');
  expect(resourceVersionLabel(resource, 'YoStarJP')).toBe('活动信息未提供');
  expect(resourceVersionDetail(resource)).toBe(
    '国服（官服 / B服） · 更新于 2026-10-23 · aaaaaaaaaa',
  );
});

test('ordinary settings save immediately while a component download is pending', async () => {
  const root = temporary();
  let begin!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    begin = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runtime = new Runtime(root, {
    source: {
      check: () => ({ version: 'v6.20.0', name: 'core.zip' }),
      download: async () => {
        begin();
        await wait;
        throw new Error('synthetic download stopped');
      },
    },
  });
  instances.push(runtime);
  await runtime.updates.check('core');
  const downloading = runtime.updates.prepare('core').catch(() => {});
  try {
    await started;
    const saved = runtime.handle('settings.save', {
      settings: { ...runtime.snapshot().settings, theme: 'dark' },
    });
    expect(await Promise.race([saved.then(() => true), Bun.sleep(100).then(() => false)])).toBe(
      true,
    );
    expect(runtime.snapshot().settings.theme).toBe('dark');
    expect(runtime.updates.channel('core').status).toBe('downloading');
  } finally {
    release();
    await downloading;
  }
});

test('removed downloader preferences migrate without losing saved settings', async () => {
  const root = temporary(),
    runtime = new Runtime(root);
  instances.push(runtime);
  expect(runtime.snapshot().settings).not.toHaveProperty('componentDownload');
  const settings = {
    ...runtime.snapshot().settings,
    theme: 'dark' as const,
    componentDownload: { engine: 'aria2', aria2Path: 'bad\\legacy-path.cmd' },
  };
  runtime.store.put('settings', 'main', settings);
  await runtime.close();
  instances.splice(instances.indexOf(runtime), 1);
  const restarted = new Runtime(root);
  instances.push(restarted);
  expect(restarted.snapshot().settings.theme).toBe('dark');
  expect(restarted.snapshot().settings.componentPaths).toEqual(settings.componentPaths);
  expect(restarted.snapshot().settings).not.toHaveProperty('componentDownload');
  expect(restarted.store.get('settings', 'main')).not.toHaveProperty('componentDownload');
  await expect(restarted.handle('settings.save', { settings })).rejects.toThrow('请求参数无效');
  expect(restarted.snapshot().settings.theme).toBe('dark');
});
