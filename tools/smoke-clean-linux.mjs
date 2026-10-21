import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fail, root } from './project.mjs';

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
    for runtime in python python3 node bun; do
      if command -v "$runtime" >/dev/null 2>&1; then
        printf 'Unexpected interpreter in clean image: %s\n' "$runtime" >&2
        exit 1
      fi
    done
    printf '%s\n' 'Clean image has no Python, Node or Bun commands.' >&2
    exec /opt/maaverge/maaverge-runtime --mode mock --data-dir /data
  `;
  const child = spawn('docker', [
    'run', '--rm', '--interactive', '--name', name, '--platform', platform,
    '--user', `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
    '--network=none', '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m',
    '--mount', bind(runtime, '/opt/maaverge', true), '--mount', bind(data, '/data'),
    '--workdir', '/data', '--env', 'MAAVERGE_MODE=mock',
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
      assert(diagnostics.includes('Clean image has no Python, Node or Bun commands.'), 'Missing clean-image interpreter check');
    },
  };
}

async function main() {
  assertLinuxBinary('maaverge-runtime');
  assertLinuxBinary('maaverge-core-worker');
  // Pull while networking is available. Every backend run itself is offline.
  await docker(['pull', '--platform', platform, image], { timeout: 300_000 });
  const data = mkdtempSync(path.join(tmpdir(), 'maaverge-clean-linux-'));
  try {
    const first = session(data);
    const snapshot = await first.request('app.snapshot');
    assert.equal(snapshot.mode, 'mock');
    const settings = { ...snapshot.settings, theme: 'dark', autoConnect: false, autoUpdateCore: false, autoUpdateResource: false };
    assert.deepEqual(await first.request('settings.save', { settings }), settings);
    const proposal = await first.request('agent.message', { message: '刷1-7材料3次' });
    assert.equal(proposal.requiresConfirmation, true);
    assert.equal(proposal.plan.tasks[0].params.stage, '1-7');
    const plan = await first.request('plan.save', { plan: { ...proposal.plan, id: 'clean-linux-smoke' } });
    const request = { planId: plan.id, deviceId: 'mock-device-1', requestId: 'clean-linux-once' };
    const run = await first.request('run.start', request);
    assert.equal(run.status, 'running');
    assert.equal((await first.request('run.start', request)).id, run.id);
    // Starting a mock run waits for the packaged C++ lease worker to be ready.
    assert(existsSync(path.join(data, 'mock/workers/mock-lease/worker.stderr.log')));
    assert(readdirSync(path.join(data, 'device-locks')).some(file => /^[a-f0-9]{64}\.lock$/u.test(file)));
    assert.equal((await first.request('run.stop', { id: run.id })).status, 'stopped');
    await first.end();

    const second = session(data);
    const recovered = await second.request('app.snapshot');
    assert.deepEqual(recovered.settings, settings);
    assert.deepEqual(recovered.plans.find(item => item.id === plan.id), plan);
    assert.equal(recovered.runs.find(item => item.id === run.id)?.status, 'stopped');
    const duplicate = await second.request('run.start', request);
    assert.equal(duplicate.id, run.id); assert.equal(duplicate.status, 'stopped');
    assert.equal((await second.request('app.snapshot')).runs.filter(item => item.id === run.id).length, 1);
    // A new request must reacquire the same packaged worker's device lock.
    const next = await second.request('run.start', { ...request, requestId: 'clean-linux-after-restart' });
    assert.notEqual(next.id, run.id);
    assert.equal((await second.request('run.stop', { id: next.id })).status, 'stopped');
    await second.end();
    console.log('Ubuntu 22.04 container backend smoke passed: no Python/Node/Bun, packaged C++ device lease, settings/plans, persistent deduplication, stop and EOF restart.');
  } finally {
    for (const name of containers) await docker(['rm', '--force', name], { quiet: true, timeout: 15_000 }).catch(() => {});
    assert.equal(path.dirname(path.resolve(data)), path.resolve(tmpdir()));
    assert(path.basename(data).startsWith('maaverge-clean-linux-'));
    rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch(fail);
