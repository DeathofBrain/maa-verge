/** Synthetic protocol and OS-lease checks; no installed SDK, ADB or real device is used. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import test from 'node:test';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const { values: args } = parseArgs({
  options: Object.fromEntries(
    ['worker', 'framework', 'lock-probe', 'launcher', 'suite'].map((name) => [
      name,
      { type: 'string' },
    ]),
  ),
});
for (const name of ['worker', 'framework', 'lock-probe']) assert.ok(args[name], name);
const command = (mode) =>
  args.launcher ? [args.launcher, [args.worker, mode]] : [args.worker, [mode]];

/** Each fixture owns canonical temporary paths and closes every child before cleanup. */
function fixture(t) {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-protocol-'));
  const framework = path.join(root, 'framework');
  const resource = path.join(root, 'resource');
  mkdirSync(path.join(framework, 'bin'), { recursive: true });
  mkdirSync(path.join(framework, 'share/MaaAgentBinary'), { recursive: true });
  mkdirSync(resource);
  copyFileSync(args.framework, path.join(framework, 'bin', path.basename(args.framework)));
  const lockPath = path.join(root, 'shared-device.lock');
  const trace = path.join(root, 'trace.txt');
  const config = {
    protocolVersion: 1,
    framework,
    resource,
    userDir: path.join(root, 'user'),
    mode: 'control',
    adb: 'synthetic-never-executed',
    address: 'synthetic://no-device',
    lockPath,
  };
  const children = [];
  function session(selected = config, mode = '--framework-worker', scenario = '') {
    const [program, argv] = command(mode);
    const child = spawn(program, argv, {
      env: { ...process.env, MAAVERGE_FRAMEWORK_TRACE: trace, MAAVERGE_FRAMEWORK_CASE: scenario },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    children.push(child);
    let stderr = '';
    const messages = [];
    const errors = [];
    let exited = false;
    child.stderr.on('data', (bytes) => (stderr += bytes.toString('utf8')));
    child.on('error', (error) => errors.push(error));
    child.stdin.on('error', (error) => {
      if (!['EPIPE', 'ERR_STREAM_DESTROYED'].includes(error.code)) errors.push(error);
    });
    const finished = new Promise((resolve) =>
      child.once('close', (code, signal) => {
        exited = true;
        resolve({ code, signal, stderr });
      }),
    );
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const value = JSON.parse(line);
        assert.equal(value.protocolVersion, 1);
        messages.push(value);
      } catch (error) {
        errors.push(error);
      }
    });
    const send = (value) => child.stdin.write(JSON.stringify(value) + '\n');
    send(selected);
    return {
      child,
      messages,
      send,
      async wait(predicate) {
        const deadline = performance.now() + 5000;
        while (true) {
          const index = messages.findIndex(predicate);
          if (index >= 0) return messages.splice(index, 1)[0];
          assert.ok(!exited && performance.now() < deadline, `missing message: ${stderr}`);
          await delay(5);
        }
      },
      async close() {
        child.stdin.end();
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        try {
          const result = await finished;
          assert.deepEqual(errors, []);
          return result;
        } finally {
          clearTimeout(timer);
        }
      },
    };
  }
  t.after(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await new Promise((resolve) => child.once('close', resolve));
      }
    }
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  return { root, config, lockPath, trace, session };
}
function check(suite, name, run) {
  test(name, { skip: args.suite && args.suite !== suite }, run);
}
function probe(f) {
  const result = spawnSync(args['lock-probe'], [f.lockPath], {
    input: '',
    encoding: 'utf8',
    windowsHide: true,
    timeout: 3000,
  });
  assert.ifError(result.error);
  return result;
}
async function externalLease(f) {
  const child = spawn(args['lock-probe'], [f.lockPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const finished = new Promise((resolve) => child.once('close', resolve));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('lock probe timed out'));
    }, 3000);
    child.once('error', reject);
    createInterface({ input: child.stdout }).once('line', (line) => {
      clearTimeout(timeout);
      assert.equal(line, 'locked');
      resolve();
    });
  });
  return async () => {
    child.stdin.end();
    assert.equal(await finished, 0);
  };
}

check(
  'lease',
  'lease-only excludes external OS locks and retains its stable file after EOF',
  async (t) => {
    const f = fixture(t),
      holder = f.session({ protocolVersion: 1, lockPath: f.lockPath }, '--lease-only');
    await holder.wait((value) => value.type === 'ready');
    assert.equal(probe(f).status, 1);
    assert.equal((await holder.close()).code, 0);
    assert.equal(existsSync(f.config.userDir), false);
    assert.equal(existsSync(f.lockPath), true);
    assert.equal(probe(f).status, 0);
  },
);
check('lease', 'external OS lease excludes framework before loading its library', async (t) => {
  const f = fixture(t),
    release = await externalLease(f);
  try {
    const contender = f.session({ ...f.config, lockTimeoutMs: 20 });
    const result = await contender.close();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /device lock busy/);
    assert.equal(existsSync(f.trace), false);
  } finally {
    await release();
  }
});
check('lease', 'framework retains lease until native destruction completes', async (t) => {
  const f = fixture(t),
    holder = f.session(f.config, '--framework-worker', 'destroy-delay');
  await holder.wait((value) => value.type === 'ready');
  holder.child.stdin.end();
  const deadline = performance.now() + 3000;
  while (!existsSync(f.trace) || !readFileSync(f.trace, 'utf8').includes('tasker-destroy-start')) {
    assert.ok(performance.now() < deadline);
    await delay(5);
  }
  assert.equal(probe(f).status, 1);
  assert.equal((await holder.close()).code, 0);
  assert.equal(probe(f).status, 0);
  assert.equal(existsSync(f.lockPath), true);
});
check('lease', 'competitors remain excluded and crash releases the OS lease', async (t) => {
  const f = fixture(t),
    holder = f.session({ lockPath: f.lockPath }, '--lease-only');
  await holder.wait((value) => value.type === 'ready');
  const rival = f.session({ lockPath: f.lockPath, lockTimeoutMs: 20 }, '--lease-only');
  assert.equal((await rival.close()).code, 1);
  holder.child.kill('SIGKILL');
  await holder.close();
  assert.equal(probe(f).status, 0);
  assert.equal(existsSync(f.lockPath), true);
});

check(
  'protocol',
  'removed engine modes and unsupported protocol fail before native load',
  async (t) => {
    const f = fixture(t);
    for (const mode of ['--worker', '--validate']) {
      const result = await f.session(f.config, mode).close();
      assert.equal(result.code, 1);
      assert.match(result.stderr, /usage: maaverge-native-worker/);
    }
    const incompatible = await f.session({ ...f.config, protocolVersion: 2 }).close();
    assert.equal(incompatible.code, 1);
    assert.match(incompatible.stderr, /protocolVersion/);
    assert.equal(existsSync(f.trace), false);
  },
);
check(
  'protocol',
  'malformed commands return bounded errors without killing the framework worker',
  async (t) => {
    const f = fixture(t),
      session = f.session();
    await session.wait((value) => value.type === 'ready');
    session.child.stdin.write('{invalid-json\n');
    assert.ok((await session.wait((value) => value.id === null)).error);
    for (const [id, operation, extra] of [
      ['shell', 'shell', { command: 'must-never-run' }],
      ['task', 'task', { task: { type: 'Fight', params: {} } }],
      ['version', 'stop', { protocolVersion: 2 }],
    ]) {
      session.send({ protocolVersion: 1, id, operation, ...extra });
      assert.ok((await session.wait((value) => value.id === id)).error);
    }
    session.send({ protocolVersion: 1, id: 42, operation: 'stop' });
    assert.deepEqual((await session.wait((value) => value.id === 42)).result, {
      accepted: true,
      nativeSuccess: true,
    });
    assert.equal((await session.close()).code, 0);
  },
);
check(
  'protocol',
  'native stdout is redirected while wire output remains NDJSON only',
  async (t) => {
    const f = fixture(t),
      session = f.session(f.config, '--framework-worker', 'native-stdout');
    await session.wait((value) => value.type === 'ready');
    const result = await session.close();
    assert.equal(result.code, 0);
    assert.match(result.stderr, /synthetic native stdout/);
  },
);
check('protocol', 'oversized configuration fails before library load', () => {
  const [program, argv] = command('--framework-worker');
  const result = spawnSync(program, argv, {
    input: 'x'.repeat(4 * 1024 ** 2 + 1) + '\n',
    encoding: 'utf8',
    windowsHide: true,
    timeout: 6000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /exceeds 4 MiB/);
});
