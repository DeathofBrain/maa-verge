import { afterEach, describe, expect, test } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Store } from '@backend/infrastructure/storage/storage';
import { parseSettings } from '@backend/modules/settings/models';
import { baseResourceFiles } from './resource-update-fixture';
import { snapshotIntegrity } from '@backend/infrastructure/filesystem/snapshot-integrity';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const repo = fileURLToPath(new URL('../../..', import.meta.url));
const entry = path.join(repo, 'services/backend/src/entry.ts');
const storeModule = pathToFileURL(
  path.join(repo, 'services/backend/src/infrastructure/storage/storage.ts'),
).href;
const runtimeModule = pathToFileURL(path.join(repo, 'services/backend/src/app/runtime.ts')).href;
const workerModule = pathToFileURL(
  path.join(repo, 'services/backend/src/infrastructure/native/worker.ts'),
).href;
const roots: string[] = [];
const children: ManagedChild[] = [];
const nativeChildren = new Set<number>();
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function temp() {
  // macOS temp roots use /var aliases; Windows may use short path names.
  // Bun's non-native sync resolver retains Windows 8.3 aliases, while the
  // asynchronous integrity checks expand them. Use the same native spelling.
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-lifecycle-'));
  roots.push(root);
  return root;
}

function environment(root: string) {
  const env = {
    ...process.env,
    MAAVERGE_MODE: 'native',
    MAAVERGE_DATA_DIR: root,
    MAAVERGE_DEVICE_LOCK_DIR: path.join(root, 'device-locks'),
  };
  for (const key of Object.keys(env))
    if (
      [
        'NODE_OPTIONS',
        'NODE_PATH',
        'BUN_OPTIONS',
        'BUN_BE_BUN',
        'BUN_INSTALL',
        'BUN_RUNTIME_TRANSPILER_CACHE_PATH',
      ].includes(key.toUpperCase())
    )
      delete env[key as keyof typeof env];
  return env;
}

async function bounded<T>(
  promise: Promise<T>,
  description: string,
  milliseconds = 8000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(description)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

class ManagedChild {
  readonly child: ChildProcessWithoutNullStreams;
  readonly closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  stdout = '';
  stderr = '';
  constructor(command: string[], root: string, overrides: NodeJS.ProcessEnv = {}) {
    this.child = spawn(command[0]!, command.slice(1), {
      cwd: repo,
      env: { ...environment(root), ...overrides },
      windowsHide: true,
      stdio: 'pipe',
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (bytes) => {
      this.stdout += bytes.toString('utf8');
    });
    this.child.stderr.on('data', (bytes) => {
      this.stderr += bytes.toString('utf8');
    });
    this.child.stdin.on('error', () => {
      /* The lifecycle tests deliberately close transports. */
    });
    this.closed = new Promise((resolve, reject) => {
      this.child.once('error', reject);
      this.child.once('close', (code, signal) => resolve({ code, signal }));
    });
    children.push(this);
  }
  async waitFor(predicate: () => boolean) {
    await bounded(
      (async () => {
        while (!predicate()) {
          if (this.child.exitCode !== null || this.child.signalCode !== null)
            throw new Error('服务提前退出: ' + this.stderr);
          await delay(10);
        }
      })(),
      '等待服务消息超时: ' + this.stderr,
    );
  }
  async exit() {
    return bounded(this.closed, '服务未退出: ' + this.stderr);
  }
  async crash() {
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGKILL');
    await this.exit();
  }
}

afterEach(async () => {
  for (const child of children.splice(0)) await child.crash();
  // Also clean up the native child if this regression test fails before the
  // service reaches its shutdown code. Only PIDs from our wrapper are recorded.
  for (const pid of nativeChildren) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already exited */
    }
  }
  nativeChildren.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function initializeServiceData(root: string) {
  const store = new Store(path.join(root, 'native'));
  try {
    store.put(
      'settings',
      'main',
      parseSettings({
        autoConnect: false,
        autoUpdateCore: false,
        autoUpdateResource: false,
        autoUpdateFramework: false,
      }),
    );
    store.put('meta', 'initialized', true);
  } finally {
    store.close();
  }
}

async function service(root: string) {
  initializeServiceData(root);
  const process = new ManagedChild(
    [globalThis.process.execPath, entry, '--mode', 'native', '--data-dir', root],
    root,
  );
  process.child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', id: 'ready', method: 'app.snapshot' }) + '\n',
  );
  const messages = () =>
    process.stdout
      .split('\n')
      .slice(0, -1)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  await process.waitFor(() => messages().some((value) => value.id === 'ready'));
  const ready = messages().find((value) => value.id === 'ready');
  expect(ready.error, process.stderr).toBeUndefined();
  expect(ready.result.mode).toBe('native');
  expect(() => new Store(path.join(root, 'native'))).toThrow('其他本地服务');
  return process;
}

function assertLeaseReleased(root: string) {
  const reopened = new Store(path.join(root, 'native'));
  try {
    expect(reopened.get('meta', 'initialized')).toBe(true);
  } finally {
    reopened.close();
  }
}

describe('stdio service lifecycle', () => {
  test('stdio snapshots and editing do not wait for first component preparation', async () => {
    const root = temp(),
      preparing = path.join(root, 'preparing.txt'),
      resume = path.join(root, 'resume.txt');
    const wrapper = path.join(root, 'background-components.mjs');
    const application = path.join(root, 'application');
    const bundle = path.join(application, 'runtime/bundled-components');
    const resource = path.join(bundle, 'resource');
    for (const file of baseResourceFiles.filter(
      (file) => file.name.startsWith('source/resource/') || file.name === 'source/LICENSE',
    )) {
      const filename = path.join(resource, file.name.replace(/^source\//, ''));
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, file.content);
    }
    writeFileSync(
      path.join(bundle, 'manifest.json'),
      JSON.stringify({
        formatVersion: 2,
        resource: {
          directory: 'resource',
          version: 'a'.repeat(40),
          installedHash: (await snapshotIntegrity(resource)).installedHash,
        },
      }),
    );
    writeFileSync(
      wrapper,
      `
import { existsSync, writeFileSync } from 'node:fs';
import { Runtime } from ${JSON.stringify(runtimeModule)};
import { main } from ${JSON.stringify(pathToFileURL(entry).href)};
const initialize = Runtime.prototype.initializeBundledComponents;
Runtime.prototype.initializeBundledComponents = function() {
  this.options.applicationDirectory = ${JSON.stringify(application)};
  this.updates.validator = async () => {
    writeFileSync(${JSON.stringify(preparing)}, 'preparing');
    while (!existsSync(${JSON.stringify(resume)})) await new Promise(resolve => setTimeout(resolve, 10));
  };
  return initialize.call(this);
};
await main();
`,
    );
    initializeServiceData(root);
    const child = new ManagedChild(
      [process.execPath, wrapper, '--mode', 'native', '--data-dir', root],
      root,
    );
    const messages = () =>
      child.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    await child.waitFor(() => existsSync(preparing));
    child.child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 'snapshot', method: 'app.snapshot' }) + '\n',
    );
    child.child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'save',
        method: 'plan.save',
        params: { plan: { name: '无需等待组件', tasks: [{ type: 'Award' }] } },
      }) + '\n',
    );
    await child.waitFor(() => messages().some((value) => value.id === 'save'));
    expect(messages().find((value) => value.id === 'snapshot').result.mode).toBe('native');
    expect(
      messages()
        .find((value) => value.id === 'snapshot')
        .result.updates.find((value: any) => value.id === 'resource'),
    ).toMatchObject({ status: 'idle' });
    expect(messages().find((value) => value.id === 'save').result.name).toBe('无需等待组件');
    expect(existsSync(resume)).toBe(false);
    writeFileSync(resume, 'ready');
    let active = false;
    while (!active) {
      const id = 'prepared-' + messages().length;
      child.child.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', id, method: 'app.snapshot' }) + '\n',
      );
      await child.waitFor(() => messages().some((value) => value.id === id));
      active = messages()
        .find((value) => value.id === id)
        .result.updates.some((value: any) => value.id === 'resource' && value.status === 'active');
      if (!active) await delay(10);
    }
    child.child.stdin.end();
    expect(await child.exit(), child.stderr).toEqual({ code: 0, signal: null });
    assertLeaseReleased(root);
  }, 15000);

  test('legacy mock arguments and environment fail before opening business data', async () => {
    for (const command of [
      [globalThis.process.execPath, entry, '--mode', 'mock'],
      [globalThis.process.execPath, entry],
    ]) {
      const root = temp(),
        child = new ManagedChild(command, root, { MAAVERGE_MODE: 'mock' });
      child.child.stdin.end();
      expect((await child.exit()).code).not.toBe(0);
      expect(child.stdout).toBe('');
      expect(child.stderr).toContain('仅支持 native 运行模式');
      expect(existsSync(path.join(root, 'mock', 'maaverge.sqlite3'))).toBe(false);
      expect(existsSync(path.join(root, 'native', 'maaverge.sqlite3'))).toBe(false);
    }
  }, 15000);

  test('startup without a mode selects native and preserves empty business collections', async () => {
    const root = temp();
    initializeServiceData(root);
    const child = new ManagedChild([globalThis.process.execPath, entry], root, {
      MAAVERGE_MODE: undefined,
    });
    child.child.stdin.end(
      JSON.stringify({ jsonrpc: '2.0', id: 'snapshot', method: 'app.snapshot' }) + '\n',
    );
    expect(await child.exit(), child.stderr).toEqual({ code: 0, signal: null });
    const response = child.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((value) => value.id === 'snapshot');
    expect(response.result).toMatchObject({ mode: 'native', devices: [], plans: [], runs: [] });
    assertLeaseReleased(root);
  }, 15000);

  test('normal EOF processes the last frame and releases the data root lease', async () => {
    const root = temp(),
      process = await service(root);
    process.child.stdin.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'last',
        method: 'plan.save',
        params: { plan: { id: 'last-frame', name: '末帧保存', tasks: [{ type: 'Award' }] } },
      }),
    );
    expect(await process.exit(), process.stderr).toEqual({ code: 0, signal: null });
    expect(
      process.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .find((value) => value.id === 'last')?.result.id,
    ).toBe('last-frame');
    assertLeaseReleased(root);
    const reopened = new Store(path.join(root, 'native'));
    try {
      expect(reopened.get('plan', 'last-frame').name).toBe('末帧保存');
    } finally {
      reopened.close();
    }
  }, 15000);

  test('EOF cancels a Framework controller launch before it enters the worker map', async () => {
    const root = temp(),
      ready = path.join(root, 'starting.txt'),
      cancelled = path.join(root, 'cancelled.txt');
    const wrapper = path.join(root, 'framework-start-service.mjs');
    writeFileSync(
      wrapper,
      `
import {writeFileSync} from 'node:fs';
import {Runtime} from ${JSON.stringify(runtimeModule)};
import {main} from ${JSON.stringify(pathToFileURL(entry).href)};
const original=Runtime.prototype.handle;
Runtime.prototype.handle=async function(method,params){
  if(method!=='synthetic.connect') return original.call(this,method,params);
  this.options.adbExecutable=()=> 'synthetic-adb';
  this.options.frameworkResources=async()=>({path:'synthetic-view',generation:'synthetic',sourcePaths:[],ocrAvailable:false,templates:{}});
  this.options.frameworkWorkerFactory=async(_config,signal)=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>{writeFileSync(${JSON.stringify(cancelled)},'cancelled');reject(new Error('launch cancelled'));},{once:true});
    writeFileSync(${JSON.stringify(ready)},'waiting');
  });
  this.store.put('active','combo',{resource:{path:'synthetic-resource',version:'r1'}});
  return this.connectDevice({address:'127.0.0.1:5555'});
};await main();`,
    );
    initializeServiceData(root);
    const child = new ManagedChild(
      [process.execPath, wrapper, '--mode', 'native', '--data-dir', root],
      root,
    );
    child.child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 'connect', method: 'synthetic.connect' }) + '\n',
    );
    await child.waitFor(() => existsSync(ready));
    child.child.stdin.end();
    expect(await child.exit(), child.stderr).toEqual({ code: 0, signal: null });
    expect(existsSync(cancelled)).toBe(true);
    assertLeaseReleased(root);
  }, 15000);

  test('a broken stdout pipe unwinds the premature stdin close and releases the lease', async () => {
    const root = temp(),
      process = await service(root);
    const closedOutput = new Promise<void>((resolve) =>
      process.child.stdout.once('close', resolve),
    );
    process.child.stdout.destroy();
    await bounded(closedOutput, 'stdout 读取端未关闭');
    // Keep stdin open: the service must destroy it after this response hits EPIPE.
    process.child.stdin.write('{\n');
    expect(await process.exit(), process.stderr).toEqual({ code: 0, signal: null });
    expect(process.stderr).not.toContain('ERR_STREAM_PREMATURE_CLOSE');
    assertLeaseReleased(root);
  }, 15000);

  test.skipIf(process.platform === 'win32')(
    'SIGTERM performs graceful cleanup (Windows has no portable graceful SIGTERM)',
    async () => {
      const root = temp(),
        process = await service(root);
      expect(process.child.kill('SIGTERM')).toBe(true);
      expect(await process.exit(), process.stderr).toEqual({ code: 0, signal: null });
      assertLeaseReleased(root);
    },
    15000,
  );
});

function seed(root: string) {
  const store = new Store(root);
  try {
    store.put('plan', 'z', { id: 'z', value: 'first' });
    store.put('plan', 'a', { id: 'a', value: 'second' });
    store.put('plan', 'z', { id: 'z', value: 'updated' });
    store.put('request', 'lease-request', { runId: 'seed-run' });
    store.event('seed', '保留原始事件序号');
  } finally {
    store.close();
  }
}

const databaseImage = (root: string) =>
  ['maaverge.sqlite3', 'maaverge.sqlite3-wal'].map((name) => {
    const file = path.join(root, name);
    return existsSync(file) ? readFileSync(file) : null;
  });

describe('cross-process SQLite data root leases', () => {
  test('an independent SQLite owner rejects Store before backup or writes and recovers after a crash', async () => {
    const root = temp();
    seed(root);
    const lock = path.join(root, '.runtime-lock.sqlite3');
    const hold = `import { Database } from 'bun:sqlite'; const lease = new Database(${JSON.stringify(lock)}, { create: true }); lease.exec('PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE'); console.log('{"ready":true}'); process.stdin.resume(); process.stdin.on('end', () => lease.close());`;
    const owner = new ManagedChild([process.execPath, '--eval', hold], root);
    await owner.waitFor(() => owner.stdout.includes('"ready":true'));
    const original = databaseImage(root);
    expect(() => new Store(root)).toThrow('其他本地服务');
    expect(databaseImage(root)).toEqual(original);
    expect(existsSync(path.join(root, 'pre-typescript.sqlite3'))).toBe(false);
    expect(owner.child.exitCode).toBeNull();
    await owner.crash();
    const recovered = new Store(root);
    try {
      expect(recovered.all('plan')).toEqual([
        { id: 'z', value: 'updated' },
        { id: 'a', value: 'second' },
      ]);
      expect(recovered.event('recovered', '已重获锁').id).toBe(2);
      expect(recovered.get('request', 'lease-request')).toEqual({ runId: 'seed-run' });
      expect(
        recovered.db.query("SELECT rowid,id FROM objects WHERE kind='plan' ORDER BY rowid").all(),
      ).toEqual([
        { rowid: 1, id: 'z' },
        { rowid: 2, id: 'a' },
      ]);
    } finally {
      recovered.close();
    }
    expect(existsSync(lock)).toBe(true);
  }, 15000);

  test('Store ownership rejects an independent SQLite contender and another process recovers after a crash', async () => {
    const root = temp();
    seed(root);
    const code = `import { Store } from ${JSON.stringify(storeModule)}; const store = new Store(${JSON.stringify(root)}); console.log('{"ready":true}'); process.stdin.resume(); process.stdin.on('end', () => store.close());`;
    const owner = new ManagedChild([process.execPath, '--eval', code], root);
    await owner.waitFor(() => owner.stdout.includes('"ready":true'));
    const original = databaseImage(root);
    const lock = path.join(root, '.runtime-lock.sqlite3');
    const contenderCode = `import { Database } from 'bun:sqlite'; const lease = new Database(${JSON.stringify(lock)}); lease.exec('PRAGMA busy_timeout=0'); let locked = false; try { lease.exec('BEGIN EXCLUSIVE'); } catch { locked = true; } finally { lease.close(); } if (!locked) throw new Error('unexpected concurrent ownership'); console.log(JSON.stringify({ locked }));`;
    const contender = new ManagedChild([process.execPath, '--eval', contenderCode], root);
    contender.child.stdin.end();
    expect((await contender.exit()).code, contender.stderr).toBe(0);
    expect(JSON.parse(contender.stdout)).toEqual({ locked: true });
    expect(databaseImage(root)).toEqual(original);
    expect(owner.child.exitCode).toBeNull();
    await owner.crash();
    const inspect = `import { Store } from ${JSON.stringify(storeModule)}; const store = new Store(${JSON.stringify(root)}); console.log(JSON.stringify({ rows: store.all('plan'), request: store.get('request', 'lease-request'), eventId: store.event('recovered', 'recovered').id })); store.close();`;
    const recovered = new ManagedChild([process.execPath, '--eval', inspect], root);
    recovered.child.stdin.end();
    expect((await recovered.exit()).code, recovered.stderr).toBe(0);
    expect(JSON.parse(recovered.stdout)).toEqual({
      rows: [
        { id: 'z', value: 'updated' },
        { id: 'a', value: 'second' },
      ],
      eventId: 2,
      request: { runId: 'seed-run' },
    });
    expect(existsSync(lock)).toBe(true);
  }, 15000);
});
