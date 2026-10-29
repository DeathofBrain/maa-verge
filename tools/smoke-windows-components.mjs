/** Exercise the full Windows payload with the actual compiled service, without devices or GUI. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fail, root, terminate } from './project.mjs';
import { cleanRuntimeEnvironment, ensureBun } from './setup-bun.mjs';

const startupDeadline = 120_000;
const pathKey = (value) => value.toLowerCase();
const temporaryPrefix = 'maaverge-windows-components-';

async function plainDirectory(directory) {
  const info = await lstat(directory);
  assert(info.isDirectory() && !info.isSymbolicLink(), `Expected a plain directory: ${directory}`);
  assert.equal(pathKey(await realpath(directory)), pathKey(directory));
}

function isolatedEnvironment(temporary, staging, proxy) {
  const env = cleanRuntimeEnvironment();
  for (const key of Object.keys(env))
    if (
      key.toUpperCase() === 'PATH' ||
      /^(?:MAAVERGE_|LANGCHAIN_|LANGSMITH_|OPENAI_|ANTHROPIC_|GOOGLE_|GEMINI_|AZURE_OPENAI_|OPENROUTER_|DEEPSEEK_|DASHSCOPE_|MOONSHOT_|MISTRAL_|GROQ_)/iu.test(
        key,
      ) ||
      /^(?:ALL|HTTP|HTTPS|NO)_PROXY$/iu.test(key)
    )
      delete env[key];
  return {
    ...env,
    PATH: '',
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    ALL_PROXY: proxy,
    NO_PROXY: '',
    MAAVERGE_APP_DIR: staging,
    MAAVERGE_DATA_DIR: temporary,
    MAAVERGE_DEVICE_LOCK_DIR: path.join(temporary, 'device-locks'),
    MAAVERGE_LOG_DIR: path.join(temporary, 'exports'),
    MAAVERGE_MODE: 'native',
  };
}

function command(executable, args, options, children, timeout = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      ...options,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.add(child);
    let stdout = '',
      stderr = '',
      expired = false;
    const timer = setTimeout(() => {
      expired = true;
      terminate(child);
    }, timeout);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-8000);
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      children.delete(child);
      if (code !== 0 || expired)
        reject(
          new Error(
            `Offline data helper ${expired ? 'timed out' : `exited ${code ?? signal}`}: ${stderr}`,
          ),
        );
      else resolve(stdout);
    });
  });
}

function startSession(executable, options, children) {
  const started = performance.now();
  const child = spawn(executable, ['--data-dir', options.cwd], {
    ...options,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.add(child);
  child.stdin.on('error', () => {});
  const pending = new Map();
  let next = 0,
    stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-8000);
  });
  const rejectPending = (error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  };
  const exited = new Promise((resolve, reject) => {
    child.once('error', (error) => {
      rejectPending(error);
      reject(error);
    });
    child.once('close', (code, signal) => {
      children.delete(child);
      const error = new Error(`Full Windows runtime exited ${code ?? signal}: ${stderr}`);
      rejectPending(error);
      if (code === 0) resolve();
      else reject(error);
    });
  });
  // The owner consumes exit errors through requests or close(), including a
  // process that fails before the first request can be written.
  void exited.catch(() => {});
  createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      const value = JSON.parse(line);
      const request = pending.get(value.id);
      if (request) {
        pending.delete(value.id);
        clearTimeout(request.timer);
        if (value.error) request.reject(new Error(JSON.stringify(value.error)));
        else request.resolve(value.result);
      }
    } catch (error) {
      rejectPending(error);
      terminate(child);
    }
  });
  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            `Full Windows runtime exceeded the 120s host RPC deadline: ${method}: ${stderr}`,
          ),
        );
      }, startupDeadline);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  return {
    request,
    elapsed: () => Math.round(performance.now() - started),
    async close() {
      child.stdin.end();
      let timer;
      try {
        await Promise.race([
          exited,
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              terminate(child);
              reject(new Error(`Full Windows runtime did not close after EOF: ${stderr}`));
            }, 15_000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function assertSnapshot(snapshot, lock, componentPaths) {
  assert.equal(snapshot.mode, 'native');
  for (const collection of ['devices', 'plans', 'runs', 'toolJobs'])
    assert.deepEqual(snapshot[collection], [], `The smoke must leave ${collection} empty`);
  for (const key of ['autoConnect', 'autoUpdateApp', 'autoUpdateCore', 'autoUpdateResource'])
    assert.equal(snapshot.settings[key], false);
  assert.deepEqual(snapshot.settings.componentPaths, componentPaths);
  for (const channel of ['core', 'resource']) {
    const update = snapshot.updates.find((value) => value.id === channel);
    assert.equal(update?.currentVersion, lock[channel].version);
    assert.equal(update?.status, 'active');
    assert.equal(update?.progress, 100);
  }
  for (const event of snapshot.events)
    assert(
      !/^(?:device\.|run\.|tool\.|calendar\.)/u.test(event.type),
      `Unexpected automatic activity: ${event.type}`,
    );
}

export async function smokeWindowsComponents({ staging } = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('The full component startup smoke requires Windows x64');
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  staging = path.resolve(staging ?? path.join(root, 'dist', `windows-portable-${pkg.version}`));
  await plainDirectory(staging);
  const executable = path.join(staging, 'runtime/maaverge-runtime.exe');
  assert(existsSync(executable), 'Build the full Windows portable package first');
  assert(existsSync(path.join(staging, 'runtime/maaverge-core-worker.exe')));
  assert.equal(
    (await readFile(path.join(staging, 'MaaVerge.portable'), 'utf8')).trim(),
    pkg.version,
  );
  const lock = JSON.parse(
    await readFile(path.join(root, 'tools/windows-components.lock.json'), 'utf8'),
  );
  const manifest = {};
  for (const channel of ['core', 'resource']) {
    const parent = path.join(
      staging,
      channel === 'core' ? 'MaaCore' : 'MaaResource',
      'generations',
    );
    const generations = await readdir(parent);
    assert.equal(generations.length, 1);
    manifest[channel] = JSON.parse(
      await readFile(path.join(parent, generations[0], 'manifest.json'), 'utf8'),
    );
    assert.equal(manifest[channel]?.version, lock[channel].version);
    assert.match(manifest[channel]?.installedHash ?? '', /^[a-f0-9]{64}$/u);
    assert.equal(generations[0], `${channel}-${manifest[channel].installedHash.slice(0, 32)}`);
  }
  assert.equal(manifest.resource.coreVersion, lock.core.version);
  const sourceEntries = await readdir(staging);
  for (const name of ['config', 'log', 'cache'])
    assert(
      !sourceEntries.includes(name),
      `Portable staging contains unexpected user data: ${name}`,
    );

  const temporaryParent = await realpath(tmpdir());
  const temporary = await realpath(await mkdtemp(path.join(temporaryParent, temporaryPrefix)));
  const children = new Set();
  let networkAttempts = 0;
  // Never forward traffic. Any unexpected use of inherited proxy networking is
  // rejected locally and fails this smoke, instead of reaching a remote source.
  const guard = createServer((_, response) => {
    networkAttempts++;
    response.writeHead(502, { connection: 'close' }).end();
  });
  guard.on('connect', (_, socket) => {
    networkAttempts++;
    socket.end('HTTP/1.1 502 Offline smoke forbids networking\r\nConnection: close\r\n\r\n');
  });
  try {
    await new Promise((resolve, reject) => {
      guard.once('error', reject);
      guard.listen(0, '127.0.0.1', resolve);
    });
    const environment = isolatedEnvironment(
      temporary,
      staging,
      `http://127.0.0.1:${guard.address().port}`,
    );
    const bun = await ensureBun({ download: false });
    const componentPaths = {
      core: path.join(temporary, 'MaaCore'),
      resource: path.join(temporary, 'MaaResource'),
    };
    const helper = async (seed) => {
      const source = [
        `import { Store } from ${JSON.stringify(pathToFileURL(path.join(root, 'services/backend/src/storage.ts')).href)};`,
        `import { parseSettings } from ${JSON.stringify(pathToFileURL(path.join(root, 'services/backend/src/models.ts')).href)};`,
        `const store = new Store(${JSON.stringify(path.join(temporary, 'native'))});`,
        'try {',
        ...(seed
          ? [
              `store.put('settings', 'main', parseSettings(${JSON.stringify({ autoConnect: false, autoUpdateApp: false, autoUpdateCore: false, autoUpdateResource: false, componentPaths })}));`,
              "store.put('meta', 'initialized', true);",
            ]
          : [
              "for (const kind of ['device', 'plan', 'run', 'tool_job', 'update_metadata']) if (store.all(kind).length) throw new Error('Unexpected persisted activity: ' + kind);",
              "if (store.get('staged', 'core') || store.get('staged', 'resource')) throw new Error('Offline payload was left staged');",
              "process.stdout.write(JSON.stringify(store.get('active', 'combo')));",
            ]),
        '} finally { store.close(); }',
      ].join('\n');
      return command(
        bun,
        ['--no-env-file', '-e', source],
        { cwd: temporary, env: environment },
        children,
      );
    };
    await helper(true);
    const calendar = path.join(temporary, 'native/cache/gui');
    await mkdir(calendar, { recursive: true });
    const checkedAt = new Date().toISOString();
    await writeFile(
      path.join(calendar, 'StageActivityV2.cache.json'),
      JSON.stringify({
        formatVersion: 1,
        url: 'https://api.maa.plus/MaaAssistantArknights/api/gui/StageActivityV2.json',
        fetchedAt: checkedAt,
        checkedAt,
        etag: null,
        lastModified: null,
        document: { Official: { sideStoryStage: {} } },
      }),
    );

    const first = startSession(executable, { cwd: temporary, env: environment }, children);
    const snapshot = await first.request('app.snapshot');
    const firstStartupMs = first.elapsed();
    assert(
      firstStartupMs < 10_000,
      `First UI snapshot must not wait for component preparation: ${firstStartupMs}ms`,
    );
    assert.equal(snapshot.mode, 'native');
    let prepared = snapshot;
    while (
      !['core', 'resource'].every((channel) =>
        prepared.updates.some(
          (value) =>
            value.id === channel &&
            value.status === 'active' &&
            value.currentVersion === lock[channel].version,
        ),
      )
    ) {
      const failure = prepared.updates.find(
        (value) => value.id !== 'app' && value.status === 'failed',
      );
      assert(!failure, `Offline component preparation failed: ${failure?.message}`);
      assert(first.elapsed() < startupDeadline, 'Offline component preparation exceeded deadline');
      await new Promise((resolve) => setTimeout(resolve, 200));
      const requested = performance.now();
      prepared = await first.request('app.snapshot');
      assert(performance.now() - requested < 5000, 'Component preparation blocked a UI snapshot');
    }
    const componentReadyMs = first.elapsed();
    assertSnapshot(prepared, lock, componentPaths);
    // Let both one-second automatic-work timers run with the saved opt-outs.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assertSnapshot(await first.request('app.snapshot'), lock, componentPaths);
    await first.close();
    const original = JSON.parse(await helper(false));
    for (const channel of ['core', 'resource']) {
      assert.equal(original[channel].version, lock[channel].version);
      assert.equal(original[channel].installedHash, manifest[channel].installedHash);
      assert.equal(path.dirname(path.dirname(original[channel].path)), componentPaths[channel]);
    }
    const second = startSession(executable, { cwd: temporary, env: environment }, children);
    const recovered = await second.request('app.snapshot');
    const restartMs = second.elapsed();
    assert(restartMs < startupDeadline, `Offline restart took ${restartMs}ms`);
    assertSnapshot(recovered, lock, componentPaths);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assertSnapshot(await second.request('app.snapshot'), lock, componentPaths);
    await second.close();
    assert.deepEqual(
      JSON.parse(await helper(false)),
      original,
      'Restart must preserve both immutable generations',
    );
    for (const directory of Object.values(componentPaths))
      assert(
        !existsSync(path.join(directory, 'downloads')),
        'No component download cache may be created',
      );
    assert.equal(networkAttempts, 0, 'The full offline startup must never attempt an HTTP request');
    assert.deepEqual(
      await readdir(staging),
      sourceEntries,
      'Smoke data must stay outside the portable package',
    );
    console.log(
      `Full Windows offline components smoke passed: first snapshot ${firstStartupMs}ms, components ready ${componentReadyMs}ms, restart ${restartMs}ms, locked core/resource active, zero devices and HTTP requests.`,
    );
    return { firstStartupMs, componentReadyMs, restartMs };
  } finally {
    for (const child of children) terminate(child);
    if (guard.listening) {
      guard.closeAllConnections();
      await new Promise((resolve) => guard.close(resolve));
    }
    assert.equal(path.dirname(temporary), temporaryParent);
    assert(path.basename(temporary).startsWith(temporaryPrefix));
    await plainDirectory(temporary);
    await rm(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--staging'))
    throw new Error(
      'Usage: node tools/smoke-windows-components.mjs [--staging <full-portable-directory>]',
    );
  smokeWindowsComponents({ staging: args[1] }).catch(fail);
}
