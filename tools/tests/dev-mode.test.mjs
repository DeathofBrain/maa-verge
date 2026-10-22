import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { root } from '../project.mjs';

async function availablePort() {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function launch(t, { browserMock = false, mode } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'maa verge dev mode-'));
  const entry = path.join(directory, '.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs');
  const log = path.join(directory, 'children.jsonl');
  const write = (relative, content) => {
    const file = path.join(directory, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  write('.node-version', process.versions.node);
  write('apps/desktop/src-tauri/Cargo.lock', 'fixture');
  write('tools/environment.mjs', 'export function assertWorkspaceDependencies() {}\n');
  for (const file of ['setup-bun', 'doctor', 'build-core-worker', 'prepare-native-check']) write(`tools/${file}.mjs`, '');
  for (const file of ['dev.mjs', 'project.mjs']) copyFileSync(path.join(root, 'tools', file), path.join(directory, 'tools', file));
  write('.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs', `
    const { appendFileSync } = require('node:fs');
    const args = process.argv.slice(2);
    const role = args.includes('--filter') ? 'vite' : 'tauri';
    const report = () => appendFileSync(process.env.MAAVERGE_TEST_DEV_LOG, JSON.stringify({
      role, mode: process.env.MAAVERGE_MODE, browserMock: process.env.VITE_MAAVERGE_MOCK,
      data: process.env.MAAVERGE_DATA_DIR,
    }) + '\\n');
    if (role === 'vite') {
      const server = require('node:http').createServer((request, response) => response.end('fixture'));
      server.listen(Number(args[args.indexOf('--port') + 1]), '127.0.0.1', () => {
        report();
        if (process.env.VITE_MAAVERGE_MOCK === '1') server.close();
      });
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
    } else report();
  `);
  const environment = {
    ...process.env, PATH: [path.dirname(process.execPath), process.env.PATH || ''].join(path.delimiter),
    npm_execpath: entry, MAAVERGE_BACKEND: 'typescript', MAAVERGE_DEV_PORT: String(await availablePort()),
    MAAVERGE_DATA_DIR: path.join(directory, 'data'), MAAVERGE_TEST_DEV_LOG: log,
  };
  if (mode === undefined) delete environment.MAAVERGE_MODE;
  else environment.MAAVERGE_MODE = mode;
  const child = spawn(process.execPath, [path.join(directory, 'tools/dev.mjs'), ...(browserMock ? ['--mock'] : [])], {
    cwd: directory, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  const finished = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await finished;
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  const result = await finished;
  assert.equal(result.code, 0, output);
  return { calls: readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)), data: environment.MAAVERGE_DATA_DIR };
}

test('desktop dev passes native mode to both Vite and Tauri without running real tools', { timeout: 10000 }, async t => {
  const { calls, data } = await launch(t);
  assert.deepEqual(calls.map(call => [call.role, call.mode]), [['vite', 'native'], ['tauri', 'native']]);
  assert.equal(calls[0].browserMock, '0');
  assert.ok(calls.every(call => call.data === data));
});

test('desktop dev retains an explicit mock selection for isolated smoke tests', { timeout: 10000 }, async t => {
  const { calls } = await launch(t, { mode: 'mock' });
  assert.deepEqual(calls.map(call => [call.role, call.mode]), [['vite', 'mock'], ['tauri', 'mock']]);
  assert.equal(calls[0].browserMock, '0');
});

test('browser dev:mock forces mock even with an inherited native mode and never launches Tauri', { timeout: 10000 }, async t => {
  const { calls } = await launch(t, { browserMock: true, mode: 'native' });
  assert.deepEqual(calls.map(call => [call.role, call.mode, call.browserMock]), [['vite', 'mock', '1']]);
});
