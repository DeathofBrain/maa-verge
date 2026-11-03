import { expect, test } from 'bun:test';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultComponentPaths } from '@backend/infrastructure/config';
import { UpdateService } from '@backend/modules/updates/updates';
import { UpdateMemoryStore, updateFixture } from './resource-update-fixture';

test('component defaults expose independent resources and framework without a core directory', () => {
  const root = path.resolve('checkout/config'),
    program = path.resolve('program'),
    home = path.resolve('isolated');
  expect(defaultComponentPaths(root, program, { platform: 'linux' })).toEqual({
    resource: path.join(program, 'MaaResource'),
    framework: path.join(program, 'MaaFramework'),
  });
  expect(defaultComponentPaths(root)).toEqual({
    resource: path.join(root, 'components/resource'),
    framework: path.join(root, 'components/framework'),
  });
  const mac = defaultComponentPaths(root, program, { platform: 'darwin', homeDirectory: home });
  expect(mac.resource).toBe(path.join(home, 'Library/Application Support/Maa Verge/MaaResource'));
  expect(mac.framework).toBe(path.join(home, 'Library/Application Support/Maa Verge/MaaFramework'));
});
test('resource path changes check writable ordinary directories and preserve framework preference', () =>
  updateFixture(async ({ root, service }) => {
    const resource = path.join(root, 'custom-resource'),
      framework = path.join(root, 'framework');
    let saved: any;
    await service.saveDirectories({ resource, framework }, (value) => {
      saved = value;
    });
    expect(saved).toEqual({ resource, framework });
    const file = path.join(root, 'file');
    await writeFile(file, 'not a directory');
    await expect(service.saveDirectories({ resource: file }, () => {})).rejects.toThrow();
  }));
test('resource configuration refuses a symlink ancestor before creating descendants', () =>
  updateFixture(async ({ root, service }) => {
    if (process.platform === 'win32') return;
    const outside = path.join(root, 'outside'),
      alias = path.join(root, 'alias');
    await mkdir(outside);
    await symlink(outside, alias, 'dir');
    await expect(
      service.saveDirectories({ resource: path.join(alias, 'new') }, () => {}),
    ).rejects.toThrow('链接');
  }));
