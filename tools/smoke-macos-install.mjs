// Install the final DMG into a temporary directory and launch its real app.
// Removing quarantine on this copy represents the user's explicit approval;
// this smoke does not certify Gatekeeper acceptance of an unnotarized download.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { root } from './project.mjs';
import { cleanRuntimeEnvironment } from './setup-bun.mjs';
import { seedNativeData } from './test-support/seed-native.mjs';
import { verifyMacosBundle } from './verify-macos-bundle.mjs';

if (process.platform !== 'darwin')
  throw new Error('The macOS installation smoke requires a macOS desktop host.');
const bundle = path.join(root, 'apps/desktop/src-tauri/target/release/bundle');
const config = JSON.parse(
  readFileSync(path.join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
);
const original = path.join(bundle, 'macos', `${config.productName}.app`);
const dmgs = readdirSync(path.join(bundle, 'dmg')).filter((name) => name.endsWith('.dmg'));
assert.equal(dmgs.length, 1, 'Expected exactly one final macOS installer');
const archives = readdirSync(path.join(bundle, 'macos')).filter((name) =>
  name.endsWith('.app.tar.gz'),
);
assert.ok(archives.length <= 1, 'Duplicate macOS updater archives');
if (process.argv.includes('--require-updater'))
  assert.equal(archives.length, 1, 'A signed release must contain its macOS updater archive');

const command = (executable, args, options = {}) =>
  execFileSync(executable, args, {
    encoding: 'utf8',
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
function processes() {
  return command('/bin/ps', ['-axo', 'pid=,ppid=,comm='])
    .trim()
    .split('\n')
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      return match
        ? [{ pid: Number(match[1]), parent: Number(match[2]), executable: match[3] }]
        : [];
    });
}
assert.ok(
  !processes().some((item) => path.basename(item.executable) === 'maaverge'),
  'Close existing Maa Verge instances first; this test will not control them.',
);

// macOS /var -> /private/var aliases are rejected by Tauri's executable resolver.
const temporary = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'maa-verge-install-smoke-')));
const mount = path.join(temporary, 'volume');
const installed = path.join(temporary, 'Applications', `${config.productName}.app`);
const data = path.join(temporary, 'data');
const profile = path.join(temporary, 'profile');
const probe = path.join(temporary, 'app-probe');
const reportDirectory = path.join(root, 'build/macos-install-smoke');
const report = {
  platform: process.platform,
  arch: process.arch,
  startedAt: new Date().toISOString(),
  phases: [],
  ok: false,
};
const tracked = new Map();
let child,
  mounted = false,
  output = '';
function ownTree() {
  const all = processes(),
    ids = new Set(child?.pid ? [child.pid] : []);
  for (let changed = true; changed;) {
    changed = false;
    for (const item of all)
      if (ids.has(item.parent) && !ids.has(item.pid)) {
        ids.add(item.pid);
        changed = true;
      }
  }
  const owned = all.filter((item) => ids.has(item.pid));
  for (const item of owned) tracked.set(item.pid, item.executable);
  return owned;
}
function liveTracked() {
  return processes().filter((item) => tracked.get(item.pid) === item.executable);
}
function logs() {
  const directory = path.join(data, 'native/logs');
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => /^runtime-.*\.log$/.test(name))
    .flatMap((name) =>
      readFileSync(path.join(directory, name), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        }),
    );
}
async function waitUntil(predicate, message, timeout = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await delay(200);
  }
  throw new Error(`${message}\n${output}`);
}
function sameBundle(copy) {
  for (const relative of [
    'Contents/MacOS/maaverge',
    'Contents/_CodeSignature/CodeResources',
    ...['maaverge-runtime', 'maaverge-core-worker'].map(
      (name) => `Contents/Resources/runtime/${name}`,
    ),
  ]) {
    assert.deepEqual(
      readFileSync(path.join(copy, relative)),
      readFileSync(path.join(original, relative)),
      `Final artifact differs from the verified app: ${relative}`,
    );
  }
}

try {
  mkdirSync(mount);
  mkdirSync(path.dirname(installed));
  mkdirSync(profile);
  await verifyMacosBundle(original);
  const dmg = path.join(bundle, 'dmg', dmgs[0]);
  command('/usr/bin/hdiutil', ['verify', dmg]);
  command('/usr/bin/hdiutil', [
    'attach',
    '-readonly',
    '-nobrowse',
    '-noautoopen',
    '-mountpoint',
    mount,
    dmg,
  ]);
  mounted = true;
  await verifyMacosBundle(path.join(mount, `${config.productName}.app`));
  command('/usr/bin/ditto', [path.join(mount, `${config.productName}.app`), installed]);
  command('/usr/bin/hdiutil', ['detach', mount]);
  mounted = false;
  await verifyMacosBundle(installed);
  sameBundle(installed);
  report.phases.push('DMG-integrity-install-and-signatures');
  if (archives.length) {
    const extracted = path.join(temporary, 'updater');
    mkdirSync(extracted);
    command('/usr/bin/tar', ['-xzf', path.join(bundle, 'macos', archives[0]), '-C', extracted]);
    const updated = path.join(extracted, `${config.productName}.app`);
    await verifyMacosBundle(updated);
    sameBundle(updated);
    report.phases.push('updater-archive-signatures-and-bundle-equality');
  }
  // Never change a global Gatekeeper setting or the source/downloaded app.
  command('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', installed]);
  await seedNativeData(data);
  command('/usr/bin/swiftc', [
    path.join(root, 'tools/test-support/macos-app-probe.swift'),
    '-o',
    probe,
  ]);
  const executable = path.join(installed, 'Contents/MacOS/maaverge');
  const env = {
    ...cleanRuntimeEnvironment(),
    MAAVERGE_MODE: 'native',
    MAAVERGE_DATA_DIR: data,
    MAAVERGE_DEVICE_LOCK_DIR: path.join(temporary, 'locks'),
    MAAVERGE_LOG_DIR: path.join(temporary, 'logs'),
    CFFIXED_USER_HOME: profile,
  };
  for (const key of [
    'MAAVERGE_BACKEND',
    'MAAVERGE_APP_DIR',
    'MAAVERGE_CORE_WORKER_PATH',
    'PYTHONPATH',
  ])
    delete env[key];
  child = spawn(executable, [], {
    cwd: temporary,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let spawnError;
  child.on('error', (error) => {
    spawnError = error;
  });
  child.stdout.on('data', (chunk) => {
    output = (output + chunk).slice(-16000);
  });
  child.stderr.on('data', (chunk) => {
    output = (output + chunk).slice(-16000);
  });
  await waitUntil(() => {
    if (spawnError) throw spawnError;
    assert.ok(
      child.exitCode === null && child.signalCode === null,
      `Installed desktop exited before startup: ${output}`,
    );
    const owned = ownTree();
    if (!logs().some((item) => item.message === 'runtime.started')) return false;
    if (
      !owned.some(
        (item) =>
          item.executable === path.join(installed, 'Contents/Resources/runtime/maaverge-runtime'),
      )
    )
      return false;
    const status = JSON.parse(command(probe, ['status', String(child.pid), executable]));
    return (
      status.finishedLaunching && status.hasWindow && status.bundleIdentifier === config.identifier
    );
  }, 'Installed desktop, window and packaged runtime did not become ready');
  await delay(1000);
  assert.ok(
    child.exitCode === null && child.signalCode === null,
    `Installed desktop crashed after startup: ${output}`,
  );
  assert.ok(
    !ownTree().some((item) =>
      /\/(maaverge-core-worker|adb|python[\d.]*|node|bun)$/.test(item.executable),
    ),
    'An isolated empty desktop must not start devices or external runtimes',
  );
  report.phases.push('installed-app-window-and-packaged-service-started');
  command(probe, ['quit', String(child.pid), executable]);
  await waitUntil(
    () => child.exitCode !== null || child.signalCode !== null,
    'Installed desktop did not quit',
  );
  await waitUntil(
    () => liveTracked().length === 0,
    'Installed desktop left owned processes running',
  );
  assert.equal(child.exitCode, 0, output);
  assert.ok(
    logs().some((item) => item.message === 'runtime.stopped'),
    'The installed service must close normally',
  );
  report.phases.push('native-quit-and-service-cleanup');
  report.ok = true;
} catch (error) {
  report.error = error.stack ?? String(error);
  throw error;
} finally {
  if (child?.pid && (!report.ok || liveTracked().length)) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
    await delay(300);
  }
  const cleanupErrors = [];
  if (mounted) {
    try {
      command('/usr/bin/hdiutil', ['detach', mount]);
      mounted = false;
    } catch (error) {
      cleanupErrors.push(`Could not detach owned image at ${mount}: ${error.message}`);
    }
  }
  if (!mounted) {
    try {
      rmSync(temporary, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(`Could not remove owned smoke directory: ${error.message}`);
    }
  }
  if (cleanupErrors.length) {
    report.ok = false;
    report.cleanupErrors = cleanupErrors;
    process.exitCode = 1;
  }
  mkdirSync(reportDirectory, { recursive: true });
  writeFileSync(
    path.join(reportDirectory, 'report.json'),
    JSON.stringify({ ...report, output }, null, 2) + '\n',
  );
}
assert.ok(
  report.ok,
  'macOS installation cleanup failed; see build/macos-install-smoke/report.json',
);
console.log(`macOS installation smoke passed: ${report.phases.join(', ')}`);
