import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { defaultComponentPaths } from '@backend/infrastructure/config';
import { snapshotIntegrity } from '@backend/infrastructure/filesystem/snapshot-integrity';
import { Store } from '@backend/infrastructure/storage/storage';
import { parseSettings } from '@backend/modules/settings/models';
import { runUpdateJob, UpdateService, type UpdateSource } from '@backend/modules/updates/updates';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';
import { zipBytes } from './archive-fixture';

const roots: string[] = [],
  runtimes: Runtime[] = [],
  services: UpdateService[] = [],
  stores: Store[] = [];
const temporary = () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-component-namespace-'));
  roots.push(root);
  return root;
};
const namespace = (root: string) =>
  'data-' + createHash('sha256').update(realpathSync(root)).digest('hex').slice(0, 32);
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  for (const store of stores.splice(0)) store.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('installed macOS runtimes import the same offline seeds into separate data-root namespaces', async () => {
  const root = temporary(),
    application = path.join(root, 'application'),
    seed = path.join(application, 'runtime', 'bundled-components'),
    environment = { platform: 'darwin' as const, homeDirectory: path.join(root, 'home') };
  for (const channel of ['core', 'resource']) {
    await mkdir(path.join(seed, channel, 'resource'), { recursive: true });
    await writeFile(path.join(seed, channel, 'resource/version.json'), '{}');
  }
  await writeFile(path.join(seed, 'core', 'libMaaCore.dylib'), 'synthetic payload, never loaded');
  await writeFile(
    path.join(seed, 'manifest.json'),
    JSON.stringify({
      formatVersion: 1,
      core: {
        directory: 'core',
        version: 'v6.20.1',
        installedHash: (await snapshotIntegrity(path.join(seed, 'core'))).installedHash,
      },
      resource: {
        directory: 'resource',
        version: 'a'.repeat(40),
        coreVersion: 'v6.20.1',
        installedHash: (await snapshotIntegrity(path.join(seed, 'resource'))).installedHash,
      },
    }),
  );
  const options = {
    applicationDirectory: application,
    componentEnvironment: environment,
    validator() {},
    calendar: { fetcher: null },
  };
  const first = new Runtime(path.join(root, 'first-data'), options),
    second = new Runtime(path.join(root, 'second-data'), options);
  runtimes.push(first, second);
  await Promise.all([first.initializeBundledComponents(), second.initializeBundledComponents()]);
  const directories = defaultComponentPaths(root, application, environment);
  for (const channel of ['core', 'resource'] as const) {
    const snapshots = [first, second].map((runtime) => {
      const snapshot = runtime.store.get('active', 'combo')[channel];
      expect(path.dirname(snapshot.path)).toBe(
        path.join(directories[channel], namespace(runtime.root), 'generations'),
      );
      expect(runtime.updates.channel(channel).installDirectory).toBe(directories[channel]);
      return snapshot;
    });
    expect(snapshots[0].path).not.toBe(snapshots[1].path);
    for (const snapshot of snapshots)
      expect(await readFile(path.join(snapshot.path, 'resource/version.json'), 'utf8')).toBe('{}');
  }
});

class FixtureSource implements UpdateSource {
  coreVersion = 'v6.20.0';
  resourceVersion = 'a'.repeat(40);
  downloads: string[] = [];
  check(channel: string) {
    return {
      version: channel === 'core' ? this.coreVersion : this.resourceVersion,
      name: channel + '.zip',
      source: 'fixture',
    };
  }
  async download(metadata: any, destination: string) {
    this.downloads.push(destination);
    const files =
      metadata.name === 'core.zip'
        ? [
            { name: 'MaaCore.dll', content: metadata.version },
            { name: 'resource/version.json', content: '{}' },
          ]
        : [{ name: 'snapshot/resource/version.json', content: '{}' }];
    const bytes = zipBytes(files);
    await writeFile(destination, bytes);
    return createHash('sha256').update(bytes).digest('hex');
  }
}

test('shared component roots retain three versions per data root without pruning other namespaces or legacy generations', async () => {
  const root = temporary(),
    directories = {
      core: path.join(root, 'shared', 'MaaCore'),
      resource: path.join(root, 'shared', 'MaaResource'),
    };
  const create = (name: string) => {
    const dataRoot = path.join(root, name),
      store = new Store(dataRoot),
      source = new FixtureSource();
    stores.push(store);
    store.put('settings', 'main', parseSettings());
    const generationNamespace = namespace(dataRoot);
    const service = new UpdateService(
      path.join(dataRoot, 'components'),
      store,
      () => {},
      () => false,
      {
        directories,
        generationNamespace,
        source,
        validator() {},
        jobRunner: (config) => runUpdateJob(config, () => {}),
      },
    );
    services.push(service);
    return { store, source, service, generationNamespace };
  };
  const first = create('first-data'),
    second = create('second-data');
  const install = async (service: UpdateService, channel: 'core' | 'resource') => {
    await service.check(channel);
    await service.prepare(channel);
    await service.activate(channel);
  };
  await install(first.service, 'core');
  await install(first.service, 'resource');
  const firstCombo = first.store.get('active', 'combo');
  const legacy: string[] = [];
  for (let index = 0; index < 5; index++) {
    const directory = path.join(
      directories.core,
      'generations',
      'core-' + index.toString().repeat(32),
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'manifest.json'),
      JSON.stringify({ path: directory, version: `v6.19.${index}` }),
    );
    legacy.push(directory);
  }
  second.store.put('meta', 'component_roots', [
    directories.core,
    path.join(directories.core, first.generationNamespace),
    path.join(directories.resource, first.generationNamespace),
  ]);
  await install(second.service, 'core');
  await install(second.service, 'resource');
  expect(first.source.downloads).toHaveLength(2);
  expect(second.source.downloads).toHaveLength(2);
  expect(first.source.downloads[0]).not.toBe(second.source.downloads[0]);
  for (let index = 1; index < 5; index++) {
    second.source.coreVersion = 'v6.20.' + index;
    await install(second.service, 'core');
  }
  for (let index = 1; index < 5; index++) {
    second.source.resourceVersion = index.toString().repeat(40);
    await install(second.service, 'resource');
  }
  expect(first.store.get('active', 'combo')).toEqual(firstCombo);
  for (const snapshot of Object.values(firstCombo) as { path: string }[])
    expect(existsSync(path.join(snapshot.path, 'resource/version.json'))).toBe(true);
  for (const directory of legacy) expect(existsSync(directory)).toBe(true);
  for (const channel of ['core', 'resource'] as const) {
    expect(
      await readdir(path.join(directories[channel], second.generationNamespace, 'generations')),
    ).toHaveLength(3);
    expect(
      await readdir(path.join(directories[channel], first.generationNamespace, 'generations')),
    ).toHaveLength(1);
    expect(second.service.channel(channel).installDirectory).toBe(directories[channel]);
  }
});
