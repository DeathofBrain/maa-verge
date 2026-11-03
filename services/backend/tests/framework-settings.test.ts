import { afterEach, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { defaultComponentPaths } from '@backend/infrastructure/config';
import { parseSettings } from '@backend/modules/settings/models';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';

const runtimes: Runtime[] = [];
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('framework update defaults are independent and legacy settings keep omitted directories', () => {
  expect(
    parseSettings({ autoUpdateApp: false, autoUpdateCore: false, autoUpdateResource: false })
      .autoUpdateFramework,
  ).toBe(true);
  expect(parseSettings({ autoUpdateFramework: 'false' }).autoUpdateFramework).toBe(false);
  expect(parseSettings({ autoUpdateFramework: 1 }).autoUpdateFramework).toBe(true);
  for (const autoUpdateFramework of [null, 'sometimes', 2, {}, []])
    expect(() => parseSettings({ autoUpdateFramework })).toThrow('请求参数无效');
  const legacy = { core: path.resolve('synthetic-core'), resource: path.resolve('synthetic-data') };
  expect(parseSettings({ componentPaths: legacy }).componentPaths).toEqual({
    resource: legacy.resource,
  });
  const framework = path.resolve('synthetic-framework');
  expect(
    parseSettings({ componentPaths: { ...legacy, framework: `  ${framework}  ` } }).componentPaths,
  ).toEqual({ resource: legacy.resource, framework });
  expect(
    parseSettings({ componentPaths: { ...legacy, framework: '' } }).componentPaths?.framework,
  ).toBe('');
  for (const framework of ['relative/sdk', '../outside', 'bad\0path'])
    expect(() => parseSettings({ componentPaths: { ...legacy, framework } })).toThrow('绝对路径');
  expect(() => parseSettings({ frameworkUpdateChannel: 'preview' })).toThrow('请求参数无效');
});

test('framework preferences survive old-client saves and restart while legacy persisted settings acquire defaults', async () => {
  const root = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-framework-settings-'));
  roots.push(root);
  let runtime = new Runtime(root, { calendar: { fetcher: null } });
  runtimes.push(runtime);
  const defaults = defaultComponentPaths(root);
  const framework = path.join(root, 'custom-framework');
  const saved = await runtime.handle('settings.save', {
    settings: {
      ...runtime.snapshot().settings,
      autoConnect: false,
      autoUpdateApp: false,
      autoUpdateCore: false,
      autoUpdateResource: false,
      autoUpdateFramework: false,
      componentPaths: { ...defaults, framework },
    },
  });
  expect(saved.autoUpdateFramework).toBe(false);
  expect(saved.componentPaths?.framework).toBe(framework);
  const { autoUpdateFramework: _omittedFlag, ...legacySettings } = saved;
  const { framework: _omittedDirectory, ...legacyPaths } = saved.componentPaths!;
  const legacySaved = await runtime.handle('settings.save', {
    settings: { ...legacySettings, theme: 'dark', componentPaths: legacyPaths },
  });
  expect(legacySaved.autoUpdateFramework).toBe(false);
  expect(legacySaved.componentPaths?.framework).toBe(framework);
  await runtime.close();
  runtimes.splice(runtimes.indexOf(runtime), 1);
  runtime = new Runtime(root, { calendar: { fetcher: null } });
  runtimes.push(runtime);
  expect(runtime.snapshot().settings.autoUpdateFramework).toBe(false);
  expect(runtime.snapshot().settings.componentPaths?.framework).toBe(framework);
  runtime.store.put('settings', 'main', { ...legacySettings, componentPaths: legacyPaths });
  await runtime.close();
  runtimes.splice(runtimes.indexOf(runtime), 1);
  const migrated = new Runtime(root, { calendar: { fetcher: null } });
  runtimes.push(migrated);
  expect(migrated.snapshot().settings.autoUpdateFramework).toBe(true);
  expect(migrated.snapshot().settings.componentPaths).toEqual(defaults);
  expect(migrated.store.get('settings', 'main').autoUpdateFramework).toBe(true);
  expect(migrated.store.get('settings', 'main').componentPaths.framework).toBe(defaults.framework);
});
