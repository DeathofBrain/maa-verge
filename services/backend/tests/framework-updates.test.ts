import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';
import assets from '../../../3rdparty/maaframework/runtime-assets.json';
import { frameworkVersion, resolveFrameworkSdk } from '../src/modules/framework/resources';
import {
  FrameworkUpdateService,
  type FrameworkUpdateOptions,
} from '../src/modules/framework/updates';

class Store {
  private values = new Map<string, any>();
  get(kind: string, id: string, fallback?: any): any {
    return structuredClone(this.values.get(kind + '/' + id) ?? fallback);
  }
  put(kind: string, id: string, value: any) {
    this.values.set(kind + '/' + id, structuredClone(value));
  }
  delete(kind: string, id: string) {
    this.values.delete(kind + '/' + id);
  }
  all(kind: string): any[] {
    return [...this.values]
      .filter(([key]) => key.startsWith(kind + '/'))
      .map(([, value]) => structuredClone(value));
  }
}
const write = async (root: string, relative: string, contents: string) => {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), contents);
};
const synthetic: FrameworkUpdateOptions = {
  target: 'macos-arm64',
  mirror: () => ({ enabled: false, cdk: '' }),
  prepareSdk: async (directory) => {
    await write(directory, 'bin/libMaaFramework.dylib', 'synthetic SDK');
    await write(directory, 'share/MaaAgentBinary/LICENSE', 'synthetic agent');
    await write(directory, 'LICENSE.md', 'synthetic SDK license');
  },
  validate: async () => {},
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function install(service: FrameworkUpdateService) {
  await service.prepare();
  return service.activate();
}
async function fixture(
  run: (context: {
    root: string;
    store: Store;
    service: FrameworkUpdateService;
    events: any[];
    setBusy: (value: boolean) => void;
  }) => Promise<void>,
  overrides: FrameworkUpdateOptions = {},
) {
  const root = await makeTemporaryDirectory(path.join(os.tmpdir(), 'maaverge-framework-update-'));
  const store = new Store();
  const events: any[] = [];
  let busy = false;
  const service = new FrameworkUpdateService(
    root,
    store,
    (_kind, text, data) => events.push({ text, data }),
    () => busy,
    { ...synthetic, ...overrides },
  );
  try {
    await run({
      root,
      store,
      service,
      events,
      setBusy: (value) => {
        busy = value;
      },
    });
  } finally {
    await service.close();
    await rm(root, { recursive: true, force: true });
  }
}

describe('independent MaaFramework updates', () => {
  test('first install remains separate from MaaCore and verifies embedded license and immutable generation', () =>
    fixture(async ({ root, store, service, events }) => {
      expect(events).toEqual([]);
      store.put('active', 'combo', { core: { path: 'unchanged-core', version: 'v6.20.0' } });
      expect(service.channel().currentVersion).toBe('未安装');
      await expect(service.resolveInstalledSdk()).rejects.toThrow('尚未安装');
      expect((await service.prepare()).status).toBe('staged');
      expect((await service.applyIdle()).status).toBe('staged');
      expect(store.get('active', 'framework')).toBeUndefined();
      expect((await service.activate()).status).toBe('active');
      const sdk = await service.resolveInstalledSdk();
      expect(sdk.version).toBe(frameworkVersion);
      expect(sdk.path).toContain(path.join('framework', 'maafw-data-'));
      expect(store.get('active', 'combo').core.path).toBe('unchanged-core');
      expect((await readFile(path.join(sdk.path, 'licenses/maaverge/COPYING.GPL3'))).length).toBe(
        35149,
      );
      expect(
        (
          await resolveFrameworkSdk({
            installedSdkDirectory: sdk.path,
            platform: 'darwin',
            arch: 'arm64',
          })
        ).path,
      ).toBe(sdk.path);
      expect(sdk.path.startsWith(root + path.sep)).toBe(true);
    }));
  test('busy sessions retain the active SDK and delay switching until idle', () =>
    fixture(async ({ store, service, setBusy }) => {
      await install(service);
      const old = await service.resolveInstalledSdk();
      setBusy(true);
      expect((await service.prepare()).status).toBe('staged');
      expect((await service.activate()).status).toBe('waiting_idle');
      const staged = store.get('staged', 'framework');
      expect(staged.path).not.toBe(old.path);
      expect((await service.resolveInstalledSdk()).path).toBe(old.path);
      expect((await service.applyIdle()).status).toBe('waiting_idle');
      setBusy(false);
      expect((await service.applyIdle()).status).toBe('active');
      expect((await service.resolveInstalledSdk()).path).toBe(staged.path);
      expect(await readFile(path.join(old.path, 'bin/libMaaFramework.dylib'), 'utf8')).toBe(
        'synthetic SDK',
      );
    }));
  test('a native operation starting during candidate validation blocks activation', async () => {
    let validations = 0;
    let setBusy: (value: boolean) => void = () => {};
    await fixture(
      async (context) => {
        setBusy = context.setBusy;
        expect((await context.service.prepare()).status).toBe('staged');
        expect((await context.service.activate()).status).toBe('waiting_idle');
        expect(context.store.get('active', 'framework')).toBeUndefined();
        setBusy(false);
        expect((await context.service.activate()).status).toBe('active');
      },
      {
        validate: async () => {
          if (++validations === 2) setBusy(true);
        },
      },
    );
  });
  test('rollback changes only the pointer and preserves both generations', () =>
    fixture(async ({ service }) => {
      await install(service);
      const first = await service.resolveInstalledSdk();
      await install(service);
      const second = await service.resolveInstalledSdk();
      expect(first.path).not.toBe(second.path);
      expect((await service.rollback()).status).toBe('active');
      expect((await service.resolveInstalledSdk()).path).toBe(first.path);
      expect(await readFile(path.join(second.path, 'bin/libMaaFramework.dylib'), 'utf8')).toBe(
        'synthetic SDK',
      );
    }));
  test('failed activation restores the previous pointer and retains the staged candidate', async () => {
    let fail = false;
    const finished: (string | undefined)[] = [];
    await fixture(
      async ({ service, store }) => {
        await install(service);
        const original = await service.resolveInstalledSdk();
        fail = true;
        await service.prepare();
        await expect(service.activate()).rejects.toThrow('失败');
        expect((await service.resolveInstalledSdk()).path).toBe(original.path);
        expect(store.get('staged', 'framework').path).not.toBe(original.path);
        expect(finished[1]).toContain('切换失败');
        fail = false;
        await service.activate();
        expect((await service.resolveInstalledSdk()).path).not.toBe(original.path);
      },
      {
        afterActivate: async () => {
          if (fail) throw new Error('synthetic reconnect failure');
        },
        finishActivate: (failure) => {
          finished.push(failure);
        },
      },
    );
  });
  test('payload changes and rewritten self-consistent manifests cannot adopt modified SDKs', () =>
    fixture(async ({ service }) => {
      await install(service);
      const sdk = await service.resolveInstalledSdk();
      const library = path.join(sdk.path, 'bin/libMaaFramework.dylib');
      await writeFile(library, 'modified');
      await expect(service.resolveInstalledSdk()).rejects.toThrow('校验失败');
      const filename = path.join(sdk.path, 'maafw-manifest.json');
      const manifest = JSON.parse(await readFile(filename, 'utf8'));
      manifest.files['bin/libMaaFramework.dylib'] = {
        size: 8,
        sha256: createHash('sha256').update('modified').digest('hex'),
      };
      await writeFile(filename, JSON.stringify(manifest));
      await expect(service.resolveInstalledSdk()).rejects.toThrow('校验失败');
    }));
  test('cancelled staging never becomes active or remains in generations', async () => {
    const entered = deferred(),
      proceed = deferred();
    await fixture(
      async ({ service, store }) => {
        const preparing = service.prepare();
        await entered.promise;
        service.cancel();
        proceed.resolve();
        await expect(preparing).rejects.toThrow('取消');
        await service.drain();
        expect(store.get('active', 'framework')).toBeUndefined();
        expect(store.get('staged', 'framework')).toBeUndefined();
        for (const root of store.get('meta', 'framework_roots'))
          expect(await readdir(root)).toEqual([]);
        expect(service.pendingOperations).toBe(0);
      },
      {
        prepareSdk: async (directory, target, signal) => {
          entered.resolve();
          await proceed.promise;
          await synthetic.prepareSdk!(directory, target, signal);
        },
      },
    );
  });
  test('download integrity failures never stage a candidate', () =>
    fixture(
      async ({ service, store }) => {
        await expect(service.prepare()).rejects.toThrow('失败');
        expect(store.get('active', 'framework')).toBeUndefined();
        expect(store.get('staged', 'framework')).toBeUndefined();
        expect(service.channel().status).toBe('failed');
      },
      {
        prepareSdk: undefined,
        fetcher: (async () => new Response('invalid archive')) as unknown as typeof fetch,
      },
    ));
  test('incompatible Mirror latest stays pinned and never becomes an installable latest version', () =>
    fixture(
      async ({ service, events }) => {
        const state = await service.check();
        expect(state.latestVersion).toBe(frameworkVersion);
        expect(state.message).toContain('尚未通过应用兼容验证');
        expect(JSON.stringify(events)).not.toContain('private-cdk');
      },
      {
        mirror: () => ({ enabled: true, cdk: 'private-cdk' }),
        fetcher: (async () =>
          Response.json({
            code: 0,
            data: {
              version_name: 'v99.0.0',
              channel: 'stable',
              ...platformReply(),
              update_type: 'full',
            },
          })) as unknown as typeof fetch,
      },
    ));
  test('Mirror credentials and signed addresses never enter persistent events or failed errors', async () => {
    const calls: string[] = [];
    await fixture(
      async ({ service, events }) => {
        await expect(service.prepare()).rejects.toThrow('失败');
        expect(calls.some((url) => url.startsWith('https://github.com/'))).toBe(true);
        expect(JSON.stringify(events)).not.toContain('private-cdk');
        expect(JSON.stringify(events)).not.toContain('private-signature');
      },
      {
        prepareSdk: undefined,
        mirror: () => ({ enabled: true, cdk: 'private-cdk' }),
        fetcher: (async (input) => {
          const address = String(input);
          calls.push(address);
          if (address.includes('/api/resources/'))
            return Response.json({
              code: 0,
              data: {
                version_name: frameworkVersion,
                channel: 'stable',
                ...platformReply(),
                update_type: 'full',
                url: 'https://mirrorchyan.com/download?signature=private-signature',
                sha256: assets.targets['macos-arm64'].sha256,
                filesize: assets.targets['macos-arm64'].size,
              },
            });
          return new Response('invalid archive');
        }) as typeof fetch,
      },
    );
  });
  test('incorrect Mirror package metadata falls back to the pinned official archive', async () => {
    const calls: string[] = [];
    await fixture(
      async ({ service }) => {
        await expect(service.prepare()).rejects.toThrow('失败');
        expect(calls.filter((address) => address.includes('/api/resources/'))).toHaveLength(1);
        expect(
          calls.some((address) => address.includes('/releases/download/' + frameworkVersion + '/')),
        ).toBe(true);
        expect(calls.some((address) => address.includes('/untrusted-download'))).toBe(false);
      },
      {
        prepareSdk: undefined,
        mirror: () => ({ enabled: true, cdk: '' }),
        fetcher: (async (input) => {
          const address = String(input);
          calls.push(address);
          return address.includes('/api/resources/')
            ? Response.json({
                code: 0,
                data: {
                  version_name: frameworkVersion,
                  channel: 'stable',
                  ...platformReply(),
                  update_type: 'full',
                  url: 'https://mirrorchyan.com/untrusted-download',
                  sha256: 'f'.repeat(64),
                  filesize: 123,
                },
              })
            : new Response('bad archive');
        }) as typeof fetch,
      },
    );
  });
  test('directory persistence and installation use one serial queue', async () => {
    let directory = path.resolve(os.tmpdir(), 'maaverge-unused-framework-root');
    await fixture(
      async ({ root, store, service }) => {
        directory = path.join(root, 'old');
        const next = path.join(root, 'new');
        const entered = deferred(),
          release = deferred();
        const saving = service.saveDirectory(next, async () => {
          entered.resolve();
          await release.promise;
          directory = next;
        });
        await entered.promise;
        const install = service.prepare();
        expect(service.pendingOperations).toBe(2);
        release.resolve();
        await saving;
        await install;
        await service.activate();
        expect((await service.resolveInstalledSdk()).path.startsWith(next + path.sep)).toBe(true);
        expect(
          store
            .get('meta', 'framework_roots')
            .some((value: string) => value.startsWith(next + path.sep)),
        ).toBe(true);
      },
      { directory: () => directory },
    );
  });
  test('linked configured directories are rejected without changing the pointer', () =>
    fixture(async ({ root, service, store }) => {
      await install(service);
      const current = store.get('active', 'framework');
      const target = path.join(root, 'actual');
      const linked = path.join(root, 'linked');
      await mkdir(target);
      await symlink(target, linked, process.platform === 'win32' ? 'junction' : 'dir');
      await expect(
        service.saveDirectory(linked, () => {
          throw new Error('must not persist');
        }),
      ).rejects.toThrow('失败');
      expect(store.get('active', 'framework')).toEqual(current);
    }));
});

function platformReply() {
  return {
    os:
      process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'windows' : 'linux',
    arch: process.arch === 'arm64' ? 'arm64' : 'amd64',
  };
}
