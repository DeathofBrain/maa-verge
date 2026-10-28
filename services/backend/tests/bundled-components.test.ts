import { afterEach, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  copyBundledPayload,
  readBundledComponents,
  type BundledComponents,
} from '../src/bundled-components';
import { snapshotIntegrity } from '../src/snapshot-integrity';
import { Runtime } from '../src/runtime';
import { UpdateService, type UpdateOptions, type UpdateStore } from '../src/updates';

class MemoryStore implements UpdateStore {
  rows = new Map<string, any>();
  get(kind: string, id: string, fallback?: any) {
    return structuredClone(this.rows.get(`${kind}|${id}`) ?? fallback);
  }
  put(kind: string, id: string, value: any) {
    this.rows.set(`${kind}|${id}`, structuredClone(value));
  }
  delete(kind: string, id: string) {
    this.rows.delete(`${kind}|${id}`);
  }
  all(kind: string) {
    return [...this.rows.entries()]
      .filter(([key]) => key.startsWith(`${kind}|`))
      .map(([, value]) => structuredClone(value));
  }
}

const roots: string[] = [];
const services: UpdateService[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(options: UpdateOptions = {}, busy = () => false) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'maaverge-bundled-')));
  roots.push(root);
  const directory = path.join(root, 'application/runtime/bundled-components');
  const library =
    process.platform === 'win32'
      ? 'MaaCore.dll'
      : process.platform === 'darwin'
        ? 'libMaaCore.dylib'
        : 'libMaaCore.so';
  for (const channel of ['core', 'resource']) {
    await mkdir(path.join(directory, channel, 'resource'), { recursive: true });
    await writeFile(
      path.join(directory, channel, 'resource/version.json'),
      JSON.stringify({ last_updated: channel }),
    );
  }
  await writeFile(path.join(directory, 'core', library), 'synthetic core, never loaded');
  await writeFile(path.join(directory, 'core/resource/base-only.json'), '{}');
  await writeFile(path.join(directory, 'resource/resource/overlay-only.json'), '{}');
  const manifest: BundledComponents = {
    formatVersion: 1,
    core: {
      version: 'v6.20.1',
      directory: 'core',
      installedHash: (await snapshotIntegrity(path.join(directory, 'core'))).installedHash,
    },
    resource: {
      version: 'a'.repeat(40),
      coreVersion: 'v6.20.1',
      directory: 'resource',
      installedHash: (await snapshotIntegrity(path.join(directory, 'resource'))).installedHash,
    },
  };
  const saveManifest = () =>
    writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  await saveManifest();
  const store = new MemoryStore();
  store.put('settings', 'main', {});
  let network = 0;
  const validations: string[][] = [];
  const service = new UpdateService(path.join(root, 'data/components'), store, () => {}, busy, {
    directories: {
      core: path.join(root, 'application/MaaCore'),
      resource: path.join(root, 'application/MaaResource'),
    },
    source: {
      check() {
        network++;
        throw new Error('bundled bootstrap must not use the network');
      },
      download() {
        network++;
        throw new Error('bundled bootstrap must not use the network');
      },
    },
    validator: (core, resource, version) => {
      validations.push([core, resource, version]);
    },
    ...options,
  });
  services.push(service);
  return {
    root,
    directory,
    manifest,
    saveManifest,
    store,
    service,
    validations,
    network: () => network,
  };
}

test('offline bootstrap copies both seeds into separate immutable generations and activates them', async () => {
  const f = await fixture();
  await f.service.bootstrapBundled(f.directory);
  const combo = f.store.get('active', 'combo');
  expect(combo.core.version).toBe('v6.20.1');
  expect(combo.resource.version).toBe('a'.repeat(40));
  expect(combo.core.path).toContain(`${path.sep}MaaCore${path.sep}generations${path.sep}core-`);
  expect(combo.resource.path).toContain(
    `${path.sep}MaaResource${path.sep}generations${path.sep}resource-`,
  );
  expect(combo.core.path).not.toBe(path.join(f.directory, 'core'));
  expect(combo.resource.coreVersion).toBe(combo.core.version);
  expect((await snapshotIntegrity(combo.core.path)).installedHash).toBe(
    f.manifest.core!.installedHash,
  );
  expect((await snapshotIntegrity(combo.resource.path)).installedHash).toBe(
    f.manifest.resource!.installedHash,
  );
  expect(f.validations).toEqual([
    [combo.core.path, combo.core.path, 'v6.20.1'],
    [combo.core.path, combo.resource.path, 'v6.20.1'],
  ]);
  expect(f.service.channel('core').status).toBe('active');
  expect(f.service.channel('resource').status).toBe('active');
  expect(f.store.get('staged', 'core')).toBeUndefined();
  expect(f.store.get('staged', 'resource')).toBeUndefined();
  expect(f.network()).toBe(0);
  await f.service.bootstrapBundled(f.directory);
  expect(f.validations).toHaveLength(2);
  expect(f.store.get('active', 'combo')).toEqual(combo);
});

test('unchecked installer payloads are skipped while selected core keeps its bundled base resources', async () => {
  const f = await fixture();
  await rm(path.join(f.directory, 'resource'), { recursive: true });
  await f.service.bootstrapBundled(f.directory);
  const combo = f.store.get('active', 'combo');
  expect(combo.resource.path).toBe(combo.core.path);
  expect(f.service.channel('resource').currentVersion).toBe('bundled@v6.20.1');
  expect(f.validations).toHaveLength(1);
  const empty = await fixture();
  await Promise.all(
    ['core', 'resource'].map((channel) =>
      rm(path.join(empty.directory, channel), { recursive: true }),
    ),
  );
  await empty.service.bootstrapBundled(empty.directory);
  expect(empty.store.get('active', 'combo')).toBeUndefined();
  expect(empty.service.channel('core').status).toBe('idle');
  expect(empty.validations).toHaveLength(0);
});

test('a resource-only selection reports its core dependency without network or activation', async () => {
  const f = await fixture();
  await rm(path.join(f.directory, 'core'), { recursive: true });
  await f.service.bootstrapBundled(f.directory);
  expect(f.service.channel('resource')).toMatchObject({
    status: 'failed',
    message: expect.stringContaining('依赖匹配的 MaaCore'),
  });
  expect(f.store.get('active', 'combo')).toBeUndefined();
  expect(f.validations).toHaveLength(0);
  expect(f.network()).toBe(0);
});

test('an incompatible resource preserves a successfully adopted core and its base resources', async () => {
  const f = await fixture();
  f.manifest.resource!.coreVersion = 'v6.20.0';
  await f.saveManifest();
  await f.service.bootstrapBundled(f.directory);
  const combo = f.store.get('active', 'combo');
  expect(combo.core.version).toBe('v6.20.1');
  expect(combo.resource.path).toBe(combo.core.path);
  expect(f.service.channel('resource').status).toBe('failed');
  expect(f.validations).toHaveLength(1);
});

test('bootstrap respects saved custom destinations', async () => {
  const f = await fixture();
  const custom = {
    core: path.join(f.root, 'custom/core'),
    resource: path.join(f.root, 'custom/resource'),
  };
  f.store.put('settings', 'main', { componentPaths: custom });
  await f.service.bootstrapBundled(f.directory);
  const combo = f.store.get('active', 'combo');
  expect(combo.core.path.startsWith(custom.core + path.sep)).toBe(true);
  expect(combo.resource.path.startsWith(custom.resource + path.sep)).toBe(true);
  expect(await Bun.file(path.join(f.root, 'application/MaaCore')).exists()).toBe(false);
});

test('existing active snapshots and staged updates are never replaced or even revalidated by seeds', async () => {
  const f = await fixture();
  await f.service.bootstrapBundled(f.directory);
  const original = f.store.get('active', 'combo');
  const previous = f.store.get('previous', 'combo');
  await f.service.close();
  const restarted = new UpdateService(
    path.join(f.root, 'data/components'),
    f.store,
    () => {},
    () => false,
    {
      directories: f.service.directories(),
      validator() {
        throw new Error('existing components must not be touched');
      },
    },
  );
  services.push(restarted);
  await writeFile(path.join(f.directory, 'manifest.json'), '{corrupt seed');
  await restarted.bootstrapBundled(f.directory);
  expect(f.store.get('active', 'combo')).toEqual(original);
  expect(f.store.get('previous', 'combo')).toEqual(previous);
  const staged = await fixture();
  const candidate = { version: 'v6.20.2', path: path.join(staged.root, 'retained-candidate') };
  staged.store.put('staged', 'core', candidate);
  await staged.service.bootstrapBundled(staged.directory);
  expect(staged.store.get('staged', 'core')).toEqual(candidate);
  expect(staged.store.get('active', 'combo')).toBeUndefined();
});

for (const channel of ['core', 'resource'] as const) {
  test(`tampered ${channel} seed is rejected and never reaches native validation`, async () => {
    const f = await fixture();
    await writeFile(path.join(f.directory, channel, 'resource/version.json'), '{changed payload}');
    await f.service.bootstrapBundled(f.directory);
    expect(f.service.channel(channel).status).toBe('failed');
    expect(f.service.channel(channel).message).toContain('完整性校验失败');
    expect(f.validations).toHaveLength(channel === 'core' ? 0 : 1);
    expect(f.store.get('staged', channel)).toBeUndefined();
    const destination = f.service.directories()[channel];
    expect(await readdir(path.join(destination, 'generations')).catch(() => [])).toEqual([]);
    expect(f.network()).toBe(0);
  });
}

test('native validation failure discards the new generation and leaves no installable candidate', async () => {
  const f = await fixture({
    validator() {
      throw new Error('synthetic native validation failed');
    },
  });
  await f.service.bootstrapBundled(f.directory);
  expect(f.store.get('active', 'combo', {}).core).toBeUndefined();
  expect(f.store.get('staged', 'core')).toBeUndefined();
  expect(f.service.channel('core').message).toContain('synthetic native validation failed');
  expect(await readdir(path.join(f.service.directories().core, 'generations'))).toEqual([]);
});

test('a later startup retries a failed core import from untouched offline payloads', async () => {
  const f = await fixture({
    validator() {
      throw new Error('synthetic first-start validation failure');
    },
  });
  await f.service.bootstrapBundled(f.directory);
  expect(f.service.channel('core').status).toBe('failed');
  await f.service.close();
  const validations: string[][] = [];
  const restarted = new UpdateService(
    path.join(f.root, 'data/components'),
    f.store,
    () => {},
    () => false,
    {
      directories: f.service.directories(),
      validator: (core, resource, version) => {
        validations.push([core, resource, version]);
      },
    },
  );
  services.push(restarted);
  await restarted.bootstrapBundled(f.directory);
  expect(restarted.channel('core').status).toBe('active');
  expect(restarted.channel('resource').status).toBe('active');
  expect(validations).toHaveLength(2);
  expect((await snapshotIntegrity(path.join(f.directory, 'core'))).installedHash).toBe(
    f.manifest.core!.installedHash,
  );
  expect((await snapshotIntegrity(path.join(f.directory, 'resource'))).installedHash).toBe(
    f.manifest.resource!.installedHash,
  );
  expect(f.network()).toBe(0);
});

test('a prepared resource survives shutdown and activates without recopying either seed', async () => {
  let busy = false;
  const f = await fixture(
    {
      validator() {
        // The core activation has passed its idle check. A new operation begins
        // before the following resource activation, which must remain staged.
        busy = true;
      },
    },
    () => busy,
  );
  await f.service.bootstrapBundled(f.directory);
  const original = f.store.get('active', 'combo');
  const candidate = f.store.get('staged', 'resource');
  expect(original.resource.path).toBe(original.core.path);
  expect(f.service.channel('resource').status).toBe('waiting_idle');
  expect(candidate.installedHash).toBe(f.manifest.resource!.installedHash);
  await f.service.close();
  await rm(f.directory, { recursive: true });
  const validations: string[][] = [];
  const restarted = new UpdateService(
    path.join(f.root, 'data/components'),
    f.store,
    () => {},
    () => false,
    {
      directories: f.service.directories(),
      validator: (core, resource, version) => {
        validations.push([core, resource, version]);
      },
    },
  );
  services.push(restarted);
  await restarted.bootstrapBundled(f.directory);
  await restarted.activatePending();
  expect(f.store.get('active', 'combo').core).toEqual(original.core);
  expect(f.store.get('active', 'combo').resource).toEqual(candidate);
  expect(f.store.get('staged', 'resource')).toBeUndefined();
  expect(validations).toEqual([[original.core.path, candidate.path, 'v6.20.1']]);
  expect(restarted.channel('resource').status).toBe('active');
});

test('bootstrap defers while execution is busy and serializes overlapping calls', async () => {
  let busy = true;
  const f = await fixture({}, () => busy);
  await f.service.bootstrapBundled(f.directory);
  expect(f.validations).toHaveLength(0);
  busy = false;
  await Promise.all([
    f.service.bootstrapBundled(f.directory),
    f.service.bootstrapBundled(f.directory),
  ]);
  expect(f.validations).toHaveLength(2);
  expect(f.network()).toBe(0);
});

for (const patch of [
  { formatVersion: 2 },
  { core: { version: 'v6.20.1', directory: '../outside', installedHash: 'a'.repeat(64) } },
  { core: { version: 'v6.20.1\n', directory: 'core', installedHash: 'a'.repeat(64) } },
  { core: { version: 'v6.20.1', directory: 'core', installedHash: 'a'.repeat(64) + '\n' } },
  {
    resource: {
      version: 'a'.repeat(40) + '\n',
      coreVersion: 'v6.20.1',
      directory: 'resource',
      installedHash: 'b'.repeat(64),
    },
  },
]) {
  test(`invalid bundled manifest cannot authorize adoption ${JSON.stringify(patch)}`, async () => {
    const f = await fixture();
    await writeFile(
      path.join(f.directory, 'manifest.json'),
      JSON.stringify({ ...f.manifest, ...patch }),
    );
    await expect(f.service.bootstrapBundled(f.directory)).rejects.toThrow('随附组件清单无效');
    expect(f.store.get('active', 'combo')).toBeUndefined();
    expect(f.validations).toHaveLength(0);
    expect(f.network()).toBe(0);
  });
}

test('linked payloads cannot authorize reads or copies outside the seed root', async () => {
  const f = await fixture();
  const original = path.join(f.root, 'outside-core');
  await mkdir(original);
  await writeFile(path.join(original, 'kept.txt'), 'keep outside data');
  await rm(path.join(f.directory, 'core'), { recursive: true });
  await symlink(
    original,
    path.join(f.directory, 'core'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await f.service.bootstrapBundled(f.directory);
  expect(f.service.channel('core').status).toBe('failed');
  expect(f.validations).toHaveLength(0);
  expect(await readFile(path.join(original, 'kept.txt'), 'utf8')).toBe('keep outside data');
});

test('nested payload directory links are rejected before native validation or copying', async () => {
  const f = await fixture();
  const outside = path.join(f.root, 'outside-resources');
  await mkdir(outside);
  await writeFile(path.join(outside, 'keep.txt'), 'outside payload');
  await symlink(
    outside,
    path.join(f.directory, 'core/resource/linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await f.service.bootstrapBundled(f.directory);
  expect(f.service.channel('core').status).toBe('failed');
  expect(f.validations).toHaveLength(0);
  expect(f.store.get('active', 'combo')).toBeUndefined();
  expect(
    await readdir(path.join(f.service.directories().core, 'generations')).catch(() => []),
  ).toEqual([]);
  expect(await readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe('outside payload');
});

test('linked destination ancestors are rejected before even creating directories outside the root', async () => {
  const f = await fixture();
  const outside = path.join(f.root, 'outside-destination');
  const linked = path.join(f.root, 'linked-destination');
  await mkdir(outside);
  await writeFile(path.join(outside, 'keep.txt'), 'outside data');
  await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(
    copyBundledPayload(
      f.directory,
      f.manifest.core!,
      path.join(linked, 'not-created/generations/core-new'),
    ),
  ).rejects.toThrow('不能经过文件系统链接');
  expect(await readdir(outside)).toEqual(['keep.txt']);
  expect(await readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe('outside data');
  expect((await snapshotIntegrity(path.join(f.directory, 'core'))).installedHash).toBe(
    f.manifest.core!.installedHash,
  );
});

test('copy rejects destinations inside a seed and never deletes an existing destination', async () => {
  const f = await fixture();
  const source = path.join(f.directory, 'core');
  await expect(
    copyBundledPayload(f.directory, f.manifest.core!, path.join(source, 'generations/new')),
  ).rejects.toThrow('载荷内');
  expect((await snapshotIntegrity(source)).installedHash).toBe(f.manifest.core!.installedHash);
  const existing = path.join(f.root, 'existing-generation');
  await mkdir(existing);
  await writeFile(path.join(existing, 'keep.txt'), 'existing data');
  await expect(copyBundledPayload(f.directory, f.manifest.core!, existing)).rejects.toThrow();
  expect(await readFile(path.join(existing, 'keep.txt'), 'utf8')).toBe('existing data');
});

test('large nested payloads copy concurrently with bounded work and unchanged complete integrity', async () => {
  const f = await fixture();
  const source = path.join(f.directory, 'core');
  await Promise.all(
    Array.from({ length: 80 }, async (_, index) => {
      const directory = path.join(source, 'resource', `group-${index % 5}`, '嵌套目录');
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, `文件-${index}.json`), JSON.stringify({ index }));
    }),
  );
  const expected = await snapshotIntegrity(source);
  f.manifest.core!.installedHash = expected.installedHash;
  const copyFile = fs.copyFile;
  let active = 0;
  let maximum = 0;
  const copying = spyOn(fs, 'copyFile').mockImplementation(async (...args) => {
    active++;
    maximum = Math.max(maximum, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2));
      await copyFile(...args);
    } finally {
      active--;
    }
  });
  try {
    const target = path.join(f.root, 'parallel-generation');
    expect(await copyBundledPayload(f.directory, f.manifest.core!, target)).toEqual(expected);
    expect(maximum).toBeGreaterThan(1);
    expect(maximum).toBeLessThanOrEqual(16);
    expect(active).toBe(0);
    expect(await snapshotIntegrity(target)).toEqual(expected);
    expect(await snapshotIntegrity(source)).toEqual(expected);
    expect(
      await readFile(path.join(target, 'resource/group-4/嵌套目录/文件-79.json'), 'utf8'),
    ).toBe('{"index":79}');
  } finally {
    copying.mockRestore();
  }
});

test('a failed concurrent copy waits for all writes before deleting its reserved generation', async () => {
  const f = await fixture();
  const target = path.join(f.root, 'failed-parallel-generation');
  const copyFile = fs.copyFile;
  let active = 0;
  let completed = false;
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const multipleStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let failed!: () => void;
  const failureObserved = new Promise<void>((resolve) => {
    failed = resolve;
  });
  const copying = spyOn(fs, 'copyFile').mockImplementation(async (...args) => {
    active++;
    if (active > 1) started();
    try {
      if (path.basename(String(args[0])) === 'base-only.json') {
        await multipleStarted;
        failed();
        throw new Error('synthetic copy failure');
      }
      await delayed;
      await copyFile(...args);
    } finally {
      active--;
    }
  });
  try {
    const copyingPayload = copyBundledPayload(f.directory, f.manifest.core!, target);
    void copyingPayload.then(
      () => {
        completed = true;
      },
      () => {
        completed = true;
      },
    );
    await failureObserved;
    await new Promise((resolve) => setImmediate(resolve));
    expect(active).toBeGreaterThan(0);
    expect(completed).toBe(false);
    release();
    await expect(copyingPayload).rejects.toThrow('synthetic copy failure');
    expect(active).toBe(0);
    expect(await fs.lstat(target).catch(() => undefined)).toBeUndefined();
    expect((await snapshotIntegrity(path.join(f.directory, 'core'))).installedHash).toBe(
      f.manifest.core!.installedHash,
    );
  } finally {
    release();
    copying.mockRestore();
  }
});

test('missing manifests mean no optional installation; malformed and oversized manifests fail clearly', async () => {
  const f = await fixture();
  await rm(path.join(f.directory, 'manifest.json'));
  expect(await readBundledComponents(f.directory)).toBeUndefined();
  for (const text of ['{', ' '.repeat(16 * 1024 + 1)]) {
    await writeFile(path.join(f.directory, 'manifest.json'), text);
    await expect(readBundledComponents(f.directory)).rejects.toThrow('随附组件清单无效');
  }
});

test('Runtime adopts optional application payloads offline even when automatic updates are disabled', async () => {
  const f = await fixture();
  const runtime = new Runtime(path.join(f.root, 'runtime-data/native'), {
    applicationDirectory: path.join(f.root, 'application'),
    validator() {},
  });
  try {
    const settings = runtime.store.get('settings', 'main');
    runtime.store.put('settings', 'main', {
      ...settings,
      autoConnect: false,
      autoUpdateCore: false,
      autoUpdateResource: false,
    });
    await runtime.initializeBundledComponents();
    expect(runtime.store.get('active', 'combo').core.version).toBe('v6.20.1');
    expect(runtime.updates.channel('resource').currentVersion).toBe('a'.repeat(40));
  } finally {
    await runtime.close();
  }
});

test('background preparation serves snapshots and editing while native work waits, with staged progress', async () => {
  const f = await fixture();
  const notifications: any[] = [];
  const runtime = new Runtime(path.join(f.root, 'background-data/native'), {
    applicationDirectory: path.join(f.root, 'application'),
    validator() {},
    calendar: { fetcher: null },
    notify: (value) => notifications.push(value),
  });
  let entered!: () => void, release!: () => void;
  const copying = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = fs.copyFile;
  const spy = spyOn(fs, 'copyFile').mockImplementation(async (...args) => {
    entered();
    await held;
    return original(...args);
  });
  try {
    const initialization = runtime.initializeBundledComponents();
    expect(runtime.initializeBundledComponents()).toBe(initialization);
    await copying;
    expect(runtime.initializingComponents).toBe(true);
    const snapshot = await runtime.handle('app.snapshot');
    expect(snapshot.updates.find((item: any) => item.id === 'core')).toMatchObject({
      status: 'downloading',
      message: expect.stringContaining('复制随附组件'),
    });
    const plan = await runtime.handle('plan.save', {
      plan: { name: '后台准备时可编辑', tasks: [{ type: 'Award' }] },
    });
    expect(plan.name).toBe('后台准备时可编辑');
    for (const method of [
      'device.connect',
      'device.auto_connect',
      'run.start',
      'copilot.start',
      'tool.start',
    ]) {
      await expect(runtime.handle(method, {})).rejects.toMatchObject({
        code: -32021,
        message: expect.stringContaining('后台准备随附组件'),
      });
    }
    let installationReady = false;
    const installation = runtime.handle('updates.activate', { channel: 'app' }).then((value) => {
      installationReady = true;
      return value;
    });
    expect(runtime.appUpdatePreparing).toBe(true);
    await Promise.resolve();
    expect(installationReady).toBe(false);
    expect(runtime.appUpdating).toBe(false);
    release();
    await initialization;
    expect(await installation).toMatchObject({ status: 'staged' });
    expect(runtime.appUpdating).toBe(true);
    expect(runtime.initializingComponents).toBe(false);
    expect(runtime.updates.channel('core').status).toBe('active');
    expect(runtime.updates.channel('resource').status).toBe('active');
    const states = notifications.map((item) => item.params?.data?.update).filter(Boolean);
    const messages = states.map((item) => item.message as string);
    expect(messages.some((text) => text.includes('校验随附组件'))).toBe(true);
    expect(messages.some((text) => text.includes('复制随附组件'))).toBe(true);
    expect(messages.some((text) => text.includes('校验组件副本'))).toBe(true);
    for (const channel of ['core', 'resource']) {
      const progress = states
        .filter((item) => item.id === channel && item.status === 'downloading')
        .map((item) => item.progress);
      expect(progress).toEqual([...progress].sort((a, b) => a - b));
      expect(progress).toContain(95);
    }
  } finally {
    release();
    spy.mockRestore();
    await runtime.close();
  }
});

test('failed background preparation releases the native gate and permits manual component repair', async () => {
  const f = await fixture();
  await writeFile(path.join(f.directory, 'manifest.json'), '{');
  let checks = 0;
  const runtime = new Runtime(path.join(f.root, 'failed-background/native'), {
    applicationDirectory: path.join(f.root, 'application'),
    validator() {},
    calendar: { fetcher: null },
    source: {
      check() {
        checks++;
        return { version: 'v6.20.2' };
      },
      download() {
        throw new Error('must not download');
      },
    },
  });
  try {
    await runtime.initializeBundledComponents();
    expect(runtime.initializingComponents).toBe(false);
    expect(
      (await runtime.handle('app.snapshot')).updates.find((item: any) => item.id === 'core').status,
    ).toBe('failed');
    const repair = await runtime.handle('updates.check', { channel: 'core' });
    expect(repair).toMatchObject({ status: 'available', latestVersion: 'v6.20.2' });
    expect(checks).toBe(1);
    await expect(
      runtime.handle('run.start', {
        planId: 'missing',
        deviceId: 'missing',
        requestId: 'after-failure',
      }),
    ).rejects.toMatchObject({ code: -32004 });
  } finally {
    await runtime.close();
  }
});
