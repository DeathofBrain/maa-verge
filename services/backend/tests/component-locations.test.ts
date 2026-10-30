import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultComponentPaths } from '../src/infrastructure/config';
import { parseSettings } from '../src/modules/settings/models';
import { Runtime } from '../src/app/runtime';
import {
  resourceVersionDetail,
  resourceVersionLabel,
} from '../../../apps/desktop/src/shared/lib/update-display';
import type { UpdateChannel } from '../../../packages/contracts/src/types';

const instances: Runtime[] = [],
  roots: string[] = [];
const temporary = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-component-locations-'));
  roots.push(root);
  return root;
};
afterEach(async () => {
  await Promise.all(instances.splice(0).map((runtime) => runtime.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('installed defaults use the host application directory while development remains isolated', () => {
  const first = temporary(),
    second = temporary(),
    app = path.join(first, 'program');
  const installed = new Runtime(path.join(first, 'data'), { applicationDirectory: app });
  instances.push(installed);
  expect(installed.snapshot().settings.componentPaths).toEqual({
    core: path.join(app, 'MaaCore'),
    resource: path.join(app, 'MaaResource'),
  });
  const development = new Runtime(second);
  instances.push(development);
  expect(development.snapshot().settings.componentPaths).toEqual(defaultComponentPaths(second));
  expect(installed.updates.channel('resource').installDirectory).toBe(
    path.join(app, 'MaaResource'),
  );
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
