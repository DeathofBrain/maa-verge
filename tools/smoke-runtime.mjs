import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root, windows, fail } from './project.mjs';
import { cleanRuntimeEnvironment } from './setup-bun.mjs';
import { seedNativeData } from './test-support/seed-native.mjs';
import { zipBytes } from '../services/backend/tests/archive-fixture.ts';

async function main() {
  const temporary = mkdtempSync(path.join(tmpdir(), 'maaverge-package-smoke-'));
  const executable = path.join(root, 'dist/runtime/maaverge-runtime', windows ? 'maaverge-runtime.exe' : 'maaverge-runtime');
  const children = new Set();
  const environment = { ...cleanRuntimeEnvironment(), PATH: '', MAAVERGE_MODE: 'native', MAAVERGE_DEVICE_LOCK_DIR: path.join(temporary, 'locks') };
  const spawnOwned = (arguments_) => {
    const child = spawn(executable, arguments_, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: environment, cwd: temporary });
    children.add(child); child.once('close', () => children.delete(child)); child.stdin.on('error', () => {});
    return child;
  };
  async function session() {
    const child = spawnOwned(['--data-dir', temporary]);
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
    await seedNativeData(temporary);
    writeFileSync(path.join(temporary, '.env'), 'BUN_BE_BUN=1\nNODE_OPTIONS=--invalid-option\n');
    writeFileSync(path.join(temporary, 'bunfig.toml'), '[broken\n');
    const first = await session();
    const snapshot = await first.request('app.snapshot');
    assert.equal(snapshot.mode, 'native'); assert.deepEqual(snapshot.devices, []); assert.deepEqual(snapshot.plans, []); assert.deepEqual(snapshot.runs, []);
    assert(snapshot.updates.filter(update => update.id !== 'app').every(update => update.currentVersion === '未安装'));
    const settings = { ...snapshot.settings, theme: 'dark' };
    assert.deepEqual(await first.request('settings.save', { settings }), settings);
    const proposal = await first.request('agent.message', { message: '刷1-7材料3次' });
    assert.equal(proposal.requiresConfirmation, true); assert.equal(proposal.mode, 'mock');
    assert.equal(proposal.plan.tasks[0].params.stage, '1-7');
    const plan = await first.request('plan.save', { plan: { ...proposal.plan, id: 'package-smoke' } });
    const request = { planId: plan.id, deviceId: 'missing-device', requestId: 'packaged-once' };
    await assert.rejects(first.request('run.start', request), /"code":-32004/u);
    await assert.rejects(first.request('device.frame', { deviceId: request.deviceId }), /"code":-32004/u);
    assert.deepEqual((await first.request('app.snapshot')).runs, []);
    await first.end();
    const second = await session();
    const recovered = await second.request('app.snapshot');
    assert.equal(recovered.mode, 'native'); assert.deepEqual(recovered.devices, []); assert.deepEqual(recovered.runs, []);
    assert.deepEqual(recovered.settings, settings); assert.deepEqual(recovered.plans.find(item => item.id === plan.id), plan);
    await assert.rejects(second.request('run.start', request), /"code":-32004/u);
    await second.end();
    assert(existsSync(path.join(temporary, 'native/maaverge.sqlite3')));
    assert(!existsSync(path.join(temporary, 'mock')));
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
    console.log('Self-contained native package smoke passed: empty PATH, RPC, empty devices, local Agent proposals, settings/plans persistence, missing-device rejection and EOF restart.');
  } finally {
    for (const child of children) child.kill();
    if (!path.resolve(temporary).startsWith(path.join(tmpdir(), 'maaverge-package-smoke-'))) throw new Error('Unexpected smoke temporary path');
    rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch(fail);
