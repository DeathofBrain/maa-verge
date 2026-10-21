import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root, windows, fail } from './project.mjs';
import { cleanRuntimeEnvironment } from './setup-bun.mjs';
import { zipBytes } from '../services/backend/tests/archive-fixture.ts';

async function main() {
  const temporary = mkdtempSync(path.join(tmpdir(), 'maaverge-package-smoke-'));
  const executable = path.join(root, 'dist/runtime/maaverge-runtime', windows ? 'maaverge-runtime.exe' : 'maaverge-runtime');
  const children = new Set();
  const environment = { ...cleanRuntimeEnvironment(), PATH: '', MAAVERGE_MODE: 'mock', MAAVERGE_DEVICE_LOCK_DIR: path.join(temporary, 'locks') };
  const spawnOwned = (arguments_) => {
    const child = spawn(executable, arguments_, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: environment, cwd: temporary });
    children.add(child); child.once('close', () => children.delete(child)); child.stdin.on('error', () => {});
    return child;
  };
  async function session() {
    const child = spawnOwned(['--mode', 'mock', '--data-dir', temporary]);
    let stderr = '', next = 0; const pending = new Map();
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
    const exit = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => { for (const request of pending.values()) request.reject(new Error(`Runtime exited ${code}: ${stderr}`)); code === 0 ? resolve() : reject(new Error(`Runtime exited ${code}: ${stderr}`)); }); });
    exit.catch(() => {});
    createInterface({ input: child.stdout }).on('line', line => {
      try { const value = JSON.parse(line), request = pending.get(value.id); if (request) { pending.delete(value.id); clearTimeout(request.timer); value.error ? request.reject(new Error(JSON.stringify(value.error))) : request.resolve(value.result); } }
      catch (error) { child.kill(); for (const request of pending.values()) request.reject(error); }
    });
    const request = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timed out: ${method}: ${stderr}`)); }, 15000);
      pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    return { request, end: async () => { child.stdin.end(); await exit; } };
  }
  try {
    writeFileSync(path.join(temporary, '.env'), 'BUN_BE_BUN=1\nNODE_OPTIONS=--invalid-option\n');
    writeFileSync(path.join(temporary, 'bunfig.toml'), '[broken\n');
    const first = await session();
    assert.equal((await first.request('app.snapshot')).mode, 'mock');
    const proposal = await first.request('agent.message', { message: '刷1-7材料3次' }); assert.equal(proposal.requiresConfirmation, true);
    await first.request('plan.save', { plan: { ...proposal.plan, id: 'package-smoke' } });
    const run = await first.request('run.start', { planId: 'package-smoke', deviceId: 'mock-device-1', requestId: 'packaged-once' });
    assert.equal(run.status, 'running');
    assert.equal((await first.request('run.start', { planId: 'package-smoke', deviceId: 'mock-device-1', requestId: 'packaged-once' })).id, run.id);
    await first.request('updates.check', { channel: 'resource' }); await first.request('updates.prepare', { channel: 'resource' });
    assert.equal((await first.request('updates.activate', { channel: 'resource' })).status, 'waiting_idle');
    assert.equal((await first.request('run.stop', { id: run.id })).status, 'stopped');
    await first.end();
    const second = await session();
    assert((await second.request('app.snapshot')).plans.some(plan => plan.id === 'package-smoke'));
    assert.equal((await second.request('run.start', { planId: 'package-smoke', deviceId: 'mock-device-1', requestId: 'packaged-once' })).id, run.id);
    await second.end();
    const coreName = windows ? 'MaaCore.dll' : process.platform === 'darwin' ? 'libMaaCore.dylib' : 'libMaaCore.so';
    const fixture = [path.join(root, 'build/native/fixtures/normal/Release', coreName), path.join(root, 'build/native/fixtures/normal', coreName)].find(existsSync);
    if (fixture) {
      const archive = path.join(temporary, 'synthetic.zip'), target = path.join(temporary, 'candidate'); mkdirSync(target);
      writeFileSync(archive, zipBytes([{ name: coreName, content: readFileSync(fixture) }, { name: 'resource/version.json', content: '{}' }, { name: 'MAA.exe', content: 'excluded' }]));
      const job = spawnOwned(['--update-job']); let output = '', errors = '';
      job.stdout.on('data', chunk => { output += chunk; }); job.stderr.on('data', chunk => { errors += chunk; });
      job.stdin.end(JSON.stringify({ channel: 'core', archive, target, version: 'vsynthetic' }) + '\n');
      const timer = setTimeout(() => job.kill(), 15000);
      const code = await new Promise((resolve, reject) => { job.once('error', reject); job.once('close', resolve); }).finally(() => clearTimeout(timer));
      assert.equal(code, 0, errors); assert.deepEqual(JSON.parse(output), {}); assert(!existsSync(path.join(target, 'MAA.exe')));
      console.log('Packaged update-job -> selective extraction -> synthetic C++ MaaCore validation passed.');
    }
    console.log('Self-contained package smoke passed: empty PATH, RPC, C++ device lease, persistence, deduplication, updates and EOF cleanup.');
  } finally {
    for (const child of children) child.kill();
    if (!path.resolve(temporary).startsWith(path.join(tmpdir(), 'maaverge-package-smoke-'))) throw new Error('Unexpected smoke temporary path');
    rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch(fail);
