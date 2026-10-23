import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fail, root } from './project.mjs';
import { seedNativeData } from './test-support/seed-native.mjs';

// This exercises packaged backend processes in an OS container. Desktop,
// installer and clean-VM acceptance remain separate platform checks.
const image = 'ubuntu:22.04';
const platform = 'linux/amd64';
const runtime = path.join(root, 'dist/runtime/maaverge-runtime');
const containers = new Set();

function docker(arguments_, { timeout = 120_000, quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', arguments_, { windowsHide: true, stdio: quiet ? 'ignore' : 'inherit' });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Docker command timed out: ${arguments_[0]}`)); }, timeout);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Docker ${arguments_[0]} exited ${code}`)); });
  });
}

function assertLinuxBinary(name) {
  const file = path.join(runtime, name);
  assert(existsSync(file), `Missing Linux package binary: ${file}; build the Linux package first`);
  const descriptor = openSync(file, 'r'), header = Buffer.alloc(20);
  try { readSync(descriptor, header); } finally { closeSync(descriptor); }
  assert(header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) && header[4] === 2 && header[5] === 1 && header.readUInt16LE(18) === 62,
    `${file} must be a Linux x64 ELF binary`);
}

function bind(source, target, readonly = false) {
  return ['type=bind', `source=${source}`, `target=${target}`, ...(readonly ? ['readonly'] : [])]
    .map(field => /[",]/u.test(field) ? `"${field.replaceAll('"', '""')}"` : field).join(',');
}

function session(data) {
  const name = `maaverge-clean-linux-${randomUUID()}`;
  containers.add(name);
  const command = String.raw`
    for runtime in python python3 node bun aria2c; do
      if command -v "$runtime" >/dev/null 2>&1; then
        printf 'Unexpected runtime in clean image: %s\n' "$runtime" >&2
        exit 1
      fi
    done
    printf '%s\n' 'Clean image has no Python, Node, Bun or aria2c commands.' >&2
    aria2_features=$(/opt/maaverge/aria2c --version)
    case "$aria2_features" in
      *'aria2 version '*) ;;
      *) printf '%s\n' 'Bundled aria2c did not report its version.' >&2; exit 1 ;;
    esac
    case "$aria2_features" in
      *'Enabled Features:'*'HTTPS'*) ;;
      *) printf '%s\n' 'Bundled aria2c has no HTTPS support.' >&2; exit 1 ;;
    esac
    printf '%s\n' "$aria2_features" 'Bundled aria2c loads with HTTPS support.' >&2
    PATH=''; export PATH
    exec /opt/maaverge/maaverge-runtime --data-dir /data
  `;
  const child = spawn('docker', [
    'run', '--rm', '--interactive', '--name', name, '--platform', platform,
    '--user', `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
    '--network=none', '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m',
    '--mount', bind(runtime, '/opt/maaverge', true), '--mount', bind(data, '/data'),
    '--workdir', '/data', '--env', 'MAAVERGE_MODE=native',
    '--env', 'MAAVERGE_DEVICE_LOCK_DIR=/data/device-locks',
    '--env', 'MAAVERGE_CORE_WORKER_PATH=/opt/maaverge/maaverge-core-worker',
    image, '/bin/sh', '-ec', command,
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let diagnostics = '', next = 0, ended = false;
  const pending = new Map();
  const rejectPending = error => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  };
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-8000); });
  child.stdin.on('error', error => rejectPending(error));
  const exit = new Promise((resolve, reject) => {
    child.once('error', error => { rejectPending(error); reject(error); });
    child.once('close', code => {
      ended = true;
      const error = new Error(`Container backend exited ${code}: ${diagnostics}`);
      rejectPending(error);
      if (code === 0) { containers.delete(name); resolve(); } else reject(error);
    });
  });
  exit.catch(() => {});
  createInterface({ input: child.stdout }).on('line', line => {
    try {
      const message = JSON.parse(line);
      assert.equal(message.jsonrpc, '2.0', 'Backend stdout must contain JSON-RPC only');
      const request = pending.get(message.id);
      if (request) {
        pending.delete(message.id); clearTimeout(request.timer);
        message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
      }
    } catch (error) { rejectPending(error); child.kill(); }
  });
  return {
    request(method, params = {}) {
      if (ended) return Promise.reject(new Error(`Container backend already exited: ${diagnostics}`));
      return new Promise((resolve, reject) => {
        const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timed out: ${method}: ${diagnostics}`)); }, 30_000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    },
    async end() {
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 15_000);
      try { await exit; } finally { clearTimeout(timer); }
      assert(diagnostics.includes('Clean image has no Python, Node, Bun or aria2c commands.'), 'Missing clean-image runtime check');
      assert(diagnostics.includes('Bundled aria2c loads with HTTPS support.'), 'Missing bundled aria2c dependency/HTTPS check');
    },
  };
}

async function main() {
  assertLinuxBinary('maaverge-runtime');
  assertLinuxBinary('maaverge-core-worker');
  assertLinuxBinary('aria2c');
  // Pull while networking is available. Every backend run itself is offline.
  await docker(['pull', '--platform', platform, image], { timeout: 300_000 });
  const data = mkdtempSync(path.join(tmpdir(), 'maaverge-clean-linux-'));
  try {
    await seedNativeData(data);
    const first = session(data);
    const snapshot = await first.request('app.snapshot');
    assert.equal(snapshot.mode, 'native'); assert.deepEqual(snapshot.devices, []); assert.deepEqual(snapshot.plans, []); assert.deepEqual(snapshot.runs, []);
    assert(snapshot.updates.filter(update => update.id !== 'app').every(update => update.currentVersion === '未安装'));
    const settings = { ...snapshot.settings, theme: 'dark', autoConnect: false, autoUpdateCore: false, autoUpdateResource: false };
    assert.deepEqual(await first.request('settings.save', { settings }), settings);
    const proposal = await first.request('agent.message', { message: '刷1-7材料3次' });
    assert.equal(proposal.requiresConfirmation, true); assert.equal(proposal.mode, 'mock');
    assert.equal(proposal.plan.tasks[0].params.stage, '1-7');
    const plan = await first.request('plan.save', { plan: { ...proposal.plan, id: 'clean-linux-smoke' } });
    const request = { planId: plan.id, deviceId: 'missing-device', requestId: 'clean-linux-once' };
    await assert.rejects(first.request('run.start', request), /"code":-32004/u);
    await assert.rejects(first.request('device.frame', { deviceId: request.deviceId }), /"code":-32004/u);
    assert.deepEqual((await first.request('app.snapshot')).runs, []);
    await first.end();

    const second = session(data);
    const recovered = await second.request('app.snapshot');
    assert.equal(recovered.mode, 'native'); assert.deepEqual(recovered.devices, []); assert.deepEqual(recovered.runs, []);
    assert.deepEqual(recovered.settings, settings);
    assert.deepEqual(recovered.plans.find(item => item.id === plan.id), plan);
    await assert.rejects(second.request('run.start', request), /"code":-32004/u);
    await second.end();
    assert(existsSync(path.join(data, 'native/maaverge.sqlite3'))); assert(!existsSync(path.join(data, 'mock')));
    console.log('Ubuntu 22.04 container native backend smoke passed: no Python/Node/Bun/global aria2c, bundled aria2c dependencies and HTTPS support, empty PATH, empty devices, local Agent proposals, settings/plans persistence, missing-device rejection and EOF restart.');
  } finally {
    for (const name of containers) await docker(['rm', '--force', name], { quiet: true, timeout: 15_000 }).catch(() => {});
    assert.equal(path.dirname(path.resolve(data)), path.resolve(tmpdir()));
    assert(path.basename(data).startsWith('maaverge-clean-linux-'));
    rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch(fail);
