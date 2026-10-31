import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRpcDispatcher } from '@backend/app/rpc-dispatch';
import { defaultConnection, parseSettings } from '@backend/modules/settings/models';
import {
  OfficialSource,
  platformAsset,
  UpdateService,
  type UpdateStore,
} from '@backend/modules/updates/updates';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';

class MemoryStore implements UpdateStore {
  private readonly rows = new Map<string, any>();
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

const coreLibrary =
  process.platform === 'win32'
    ? 'MaaCore.dll'
    : process.platform === 'darwin'
      ? 'libMaaCore.dylib'
      : 'libMaaCore.so';
const controlLibrary =
  process.platform === 'win32'
    ? 'MaaAdbControlUnit.dll'
    : process.platform === 'darwin'
      ? 'libMaaAdbControlUnit.dylib'
      : 'libMaaAdbControlUnit.so';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture() {
  const root = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-maafw-adb-'));
  const store = new MemoryStore();
  const calls = {
    mirrorChecks: 0,
    officialChecks: 0,
    downloads: [] as string[],
    validates: 0,
    switches: 0,
  };
  const state = {
    busy: false,
    control: 'file' as 'file' | 'missing' | 'empty' | 'symlink',
    officialVersion: 'v6.20.1',
    onOfficial: async () => {},
    onDownload: async () => {},
  };
  store.put('settings', 'main', parseSettings({ connection: defaultConnection() }));
  const updates = new UpdateService(
    root,
    store,
    () => {},
    () => state.busy,
    {
      source: {
        check: () => {
          calls.mirrorChecks++;
          return { version: 'v6.20.1', name: 'mirror.zip', source: 'MirrorChyan' };
        },
        fallback: async () => {
          calls.officialChecks++;
          await state.onOfficial();
          return { version: state.officialVersion, name: 'official-runtime.zip', source: 'GitHub' };
        },
        download: async (metadata, destination) => {
          calls.downloads.push(metadata.source);
          await state.onDownload();
          await writeFile(destination, 'synthetic archive, never executed');
          return 'a'.repeat(64);
        },
      },
      validator: () => {
        calls.validates++;
      },
      beforeActivate: () => {
        calls.switches++;
      },
      jobRunner: async (config) => {
        await mkdir(path.join(config.target, 'resource'), { recursive: true });
        await writeFile(path.join(config.target, 'resource/version.json'), '{}');
        await writeFile(path.join(config.target, coreLibrary), 'synthetic core, never loaded');
        if (calls.downloads.at(-1) === 'GitHub') {
          const library = path.join(config.target, controlLibrary);
          if (state.control === 'file')
            await writeFile(library, 'synthetic control unit, never loaded');
          if (state.control === 'empty') await writeFile(library, '');
          if (state.control === 'symlink') {
            const external = path.join(root, 'external-control-unit');
            await writeFile(external, 'synthetic external library');
            await symlink(external, library);
          }
        }
        return {};
      },
    },
  );
  cleanups.push(async () => {
    await updates.close();
    await rm(root, { recursive: true, force: true });
  });
  await updates.check('core');
  await updates.prepare('core');
  await updates.activate('core');
  calls.mirrorChecks = calls.officialChecks = calls.validates = calls.switches = 0;
  calls.downloads.length = 0;
  return { root, store, calls, state, updates };
}

test('MaaFwAdb capability reads active files independently of saved mode and performs no update work', async () => {
  const f = await fixture();
  expect(f.store.get('settings', 'main').connection.touchMode).toBe('maatouch');
  expect(f.updates.maaFwAdbStatus()).toEqual({ available: false, coreInstalled: true });
  expect(f.calls.officialChecks + f.calls.mirrorChecks).toBe(0);
  expect(f.calls.downloads).toEqual([]);
  const active = f.store.get('active', 'combo');
  f.store.delete('active', 'combo');
  expect(f.updates.maaFwAdbStatus()).toEqual({ available: false, coreInstalled: false });
  await expect(f.updates.prepareMaaFwAdb()).rejects.toThrow('请先安装');
  expect(f.calls.officialChecks).toBe(0);
  f.store.put('active', 'combo', active);
});

test('confirmed MaaFwAdb repair downloads only the official runtime and applies a same-version immutable generation', async () => {
  const f = await fixture();
  const original = f.store.get('active', 'combo').core;
  const originalBytes = readFileSync(path.join(original.path, coreLibrary));
  f.state.onDownload = async () => {
    f.updates.mirrorSettingsChanged();
  };
  const result = await f.updates.prepareMaaFwAdb();
  expect(result.status).toBe('active');
  expect(result.currentVersion).toBe('v6.20.1');
  expect(result.downloadSource).toBe('GitHub');
  expect(f.calls.mirrorChecks).toBe(0);
  expect(f.calls.officialChecks).toBe(1);
  expect(f.calls.downloads).toEqual(['GitHub']);
  expect(f.calls.validates).toBeGreaterThan(0);
  expect(f.calls.switches).toBe(1);
  const active = f.store.get('active', 'combo').core;
  expect(active.path).not.toBe(original.path);
  expect(active.requiresMaaFwAdb).toBe(true);
  expect(existsSync(path.join(original.path, controlLibrary))).toBe(false);
  expect(readFileSync(path.join(original.path, coreLibrary))).toEqual(originalBytes);
  expect(f.store.get('settings', 'main').connection.touchMode).toBe('maatouch');
  expect(f.updates.maaFwAdbStatus()).toEqual({ available: true, coreInstalled: true });
  expect((await f.updates.prepareMaaFwAdb()).status).toBe('active');
  expect(f.calls.officialChecks).toBe(1);
});

test.each(['missing', 'empty', 'symlink'] as const)(
  'an official runtime with %s MaaFwAdb library cannot replace the active core',
  async (control) => {
    const f = await fixture();
    const active = f.store.get('active', 'combo');
    f.state.control = control;
    await expect(f.updates.prepareMaaFwAdb()).rejects.toMatchObject({
      data: '官方完整运行时缺少可用的 MaaFwAdb 控制单元',
    });
    expect(f.store.get('active', 'combo')).toEqual(active);
    expect(f.store.get('staged', 'core')).toBeUndefined();
    expect(f.updates.channel('core').status).toBe('failed');
    expect(f.calls.downloads).toEqual(['GitHub']);
    expect(f.calls.switches).toBe(0);
  },
);

test('an existing staged update is preserved and concurrent MaaFwAdb repair is rejected before another source request', async () => {
  const f = await fixture();
  const candidate = { ...f.store.get('active', 'combo').core, source: 'MirrorChyan' };
  f.store.put('staged', 'core', candidate);
  f.store.put('update', 'core', { ...f.updates.channel('core'), status: 'staged' });
  await expect(f.updates.prepareMaaFwAdb()).rejects.toThrow('已有组件更新');
  expect(f.store.get('staged', 'core')).toEqual(candidate);
  expect(f.calls.officialChecks).toBe(0);
  f.store.delete('staged', 'core');
  f.store.put('update', 'core', { ...f.updates.channel('core'), status: 'active' });
  let release!: () => void;
  f.state.onOfficial = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const pending = f.updates.prepareMaaFwAdb();
  await expect(f.updates.prepareMaaFwAdb()).rejects.toThrow('已有组件更新');
  // The serial action enters on the next microtask, before the rejected request resumes.
  release();
  expect((await pending).status).toBe('active');
  expect(f.calls.officialChecks).toBe(1);
});

test('MaaFwAdb preparation waits for the execution boundary and activates later without saving the draft mode', async () => {
  const f = await fixture();
  const original = f.store.get('active', 'combo').core.path;
  f.state.busy = true;
  expect((await f.updates.prepareMaaFwAdb()).status).toBe('waiting_idle');
  expect(f.store.get('active', 'combo').core.path).toBe(original);
  expect(f.store.get('staged', 'core').requiresMaaFwAdb).toBe(true);
  expect(f.calls.switches).toBe(0);
  f.state.busy = false;
  await f.updates.activatePending();
  expect(f.updates.maaFwAdbStatus().available).toBe(true);
  expect(f.store.get('settings', 'main').connection.touchMode).toBe('maatouch');
  expect(f.calls.switches).toBe(1);
});

test('MaaFwAdb repair refuses an older official core without downloading', async () => {
  const f = await fixture();
  const active = f.store.get('active', 'combo');
  f.state.officialVersion = 'v6.20.0';
  await expect(f.updates.prepareMaaFwAdb()).rejects.toThrow('拒绝自动降级');
  expect(f.calls.downloads).toEqual([]);
  expect(f.calls.mirrorChecks).toBe(0);
  expect(f.store.get('active', 'combo')).toEqual(active);
});

test('a changed core channel cancels the confirmed official preparation without checking MirrorChyan', async () => {
  const f = await fixture();
  const active = f.store.get('active', 'combo');
  f.state.onOfficial = async () => {
    const settings = f.store.get('settings', 'main');
    settings.coreUpdateChannel = 'preview';
    f.store.put('settings', 'main', settings);
  };
  await expect(f.updates.prepareMaaFwAdb()).rejects.toThrow('核心更新通道已改变');
  expect(f.calls.downloads).toEqual([]);
  expect(f.calls.mirrorChecks).toBe(0);
  expect(f.store.get('active', 'combo')).toEqual(active);
  expect(f.store.get('staged', 'core')).toBeUndefined();
});

test('an already available MaaFwAdb controller succeeds without replacing an unrelated update state', async () => {
  const f = await fixture();
  await f.updates.prepareMaaFwAdb();
  for (const status of ['idle', 'failed', 'available', 'staged']) {
    const channel = { ...f.updates.channel('core'), status, message: 'unrelated update state' };
    f.store.put('update', 'core', channel);
    expect((await f.updates.prepareMaaFwAdb()).status).toBe('active');
    expect(f.updates.channel('core')).toEqual(channel);
  }
  expect(f.calls.officialChecks).toBe(1);
  expect(f.calls.downloads).toEqual(['GitHub']);
});

test('capability status rejects a symlink or empty controller in the active runtime', async () => {
  const f = await fixture();
  const library = path.join(f.store.get('active', 'combo').core.path, controlLibrary);
  await writeFile(library, '');
  expect(f.updates.maaFwAdbStatus().available).toBe(false);
  await rm(library);
  const target = path.join(f.root, 'synthetic-control');
  await writeFile(target, 'synthetic control library');
  await symlink(target, library);
  expect(f.updates.maaFwAdbStatus().available).toBe(false);
  expect(f.calls.officialChecks).toBe(0);
  expect(f.calls.downloads).toEqual([]);
});

test('typed MaaFwAdb RPC rejects extra parameters and keeps status separate from preparation', async () => {
  const f = await fixture();
  const dispatch = createRpcDispatcher({
    maaFwAdb: {
      status: () => f.updates.maaFwAdbStatus(),
      prepare: () => f.updates.prepareMaaFwAdb(),
    },
  } as any);
  expect(await dispatch('updates.maafwAdb.status', {})).toEqual({
    available: false,
    coreInstalled: true,
  });
  await expect(dispatch('updates.maafwAdb.status', { channel: 'core' })).rejects.toThrow(
    '请求参数无效',
  );
  await expect(dispatch('updates.maafwAdb.prepare', { mode: 'MaaFwAdb' })).rejects.toThrow(
    '请求参数无效',
  );
  expect(f.calls.officialChecks).toBe(0);
  expect((await dispatch('updates.maafwAdb.prepare', {})).status).toBe('active');
});

test('the production official source bypasses MirrorChyan metadata and downloads even with MirrorChyan enabled', async () => {
  const root = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-maafw-official-'));
  const archive = Buffer.from('synthetic official runtime archive');
  const version = 'v6.20.1';
  const name = `MAA-${version}-${platformAsset()}`;
  const assetUrl = `https://github.com/MaaAssistantArknights/MaaAssistantArknights/releases/download/${version}/${name}`;
  const urls: string[] = [];
  const source = new OfficialSource(
    (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (
        url ===
        'https://api.github.com/repos/MaaAssistantArknights/MaaAssistantArknights/releases/latest'
      )
        return Response.json({
          tag_name: version,
          draft: false,
          assets: [
            {
              name,
              size: archive.length,
              digest: `sha256:${createHash('sha256').update(archive).digest('hex')}`,
              browser_download_url: assetUrl,
            },
          ],
        });
      if (url === assetUrl)
        return new Response(archive, { headers: { 'Content-Length': String(archive.length) } });
      throw new Error(`unexpected source request: ${url}`);
    }) as typeof fetch,
    () => undefined,
    () => ({ enabled: true, cdk: 'synthetic-test-cdk' }),
  );
  cleanups.push(async () => {
    source.close();
    await rm(root, { recursive: true, force: true });
  });
  const metadata = await source.fallback('core', 'stable');
  await source.download(metadata, path.join(root, 'runtime.zip'), () => {});
  expect(urls).toEqual([
    'https://api.github.com/repos/MaaAssistantArknights/MaaAssistantArknights/releases/latest',
    assetUrl,
  ]);
});
