/** CTest-only synthetic protocol checks. Never load a real core or use ADB. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import test from 'node:test';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const { values: args } = parseArgs({
  options: Object.fromEntries(
    ['worker', 'core', 'missing', 'legacy', 'lock-probe', 'launcher', 'suite', 'filter'].map(
      (key) => [key, { type: 'string' }],
    ),
  ),
});
for (const key of ['worker', 'core', 'missing', 'lock-probe', 'suite']) assert.ok(args[key], key);
assert.ok(['validation', 'worker', 'lease', 'protocol'].includes(args.suite));
if (process.platform === 'win32') assert.ok(args.launcher, 'Windows CRT-safe launcher is required');

const workerCommand = (mode) =>
  args.launcher ? [args.launcher, [args.worker, mode]] : [args.worker, [mode]];

function environment(config, scenario = '') {
  return {
    ...process.env,
    MAAVERGE_SYNTHETIC_CASE: scenario,
    ...(config.trace ? { MAAVERGE_SYNTHETIC_TRACE: config.trace } : {}),
  };
}

class Session {
  constructor(config, { mode = '--worker', scenario = '' } = {}) {
    // Use an ordinary descriptor for native CRT diagnostics on Windows.
    this.stderrFile = config.trace + '.stderr-' + randomUUID();
    const stderr = openSync(this.stderrFile, 'wx');
    this.child = spawn(...workerCommand(mode), {
      env: environment(config, scenario),
      stdio: ['pipe', 'pipe', stderr],
      windowsHide: true,
    });
    closeSync(stderr);
    this.queue = [];
    this.seen = [];
    this.errors = [];
    this.waiters = new Set();
    this.ended = false;
    this.exit = new Promise((resolve) =>
      this.child.once('close', (code, signal) => {
        this.exited = true;
        resolve({ code, signal });
      }),
    );
    this.child.on('error', (error) => this.errors.push(error.message));
    this.child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED')
        this.errors.push(error.message);
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', (line) => {
      try {
        const value = JSON.parse(line);
        assert.equal(value.protocolVersion, 1);
        assert.ok(Buffer.byteLength(line + '\n') <= 4 * 1024 ** 2, 'oversized NDJSON output');
        this.queue.push(value);
      } catch (error) {
        this.errors.push(error.message + ': ' + line);
      }
      this.wake();
    });
    lines.on('close', () => {
      this.ended = true;
      this.wake();
    });
    this.send(config);
  }
  wake() {
    for (const waiter of this.waiters) waiter();
  }
  get stderr() {
    return readFileSync(this.stderrFile, 'utf8');
  }
  send(value) {
    this.child.stdin.write(JSON.stringify(value) + '\n');
  }
  async wait(predicate, timeout = 5000) {
    const deadline = performance.now() + timeout;
    while (true) {
      while (this.queue.length) {
        const value = this.queue.shift();
        this.seen.push(value);
        if (predicate(value)) return value;
      }
      assert.ok(!this.ended, 'unexpected EOF: ' + this.stderr);
      assert.ok(performance.now() < deadline, 'missing protocol message');
      await new Promise((resolve, reject) => {
        const done = () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(
          () => {
            this.waiters.delete(done);
            reject(
              new Error(
                'missing protocol message: ' + this.stderr + '\nseen: ' + JSON.stringify(this.seen),
              ),
            );
          },
          Math.max(1, deadline - performance.now()),
        );
        this.waiters.add(done);
      });
    }
  }
  response(id) {
    return this.wait((value) => value.type === 'response' && value.id === id);
  }
  async waitExit(timeout = 6000) {
    let timer;
    try {
      return await Promise.race([
        this.exit,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('synthetic worker failed to exit')), timeout);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async close() {
    if (!this.child.stdin.destroyed) this.child.stdin.end();
    let result;
    try {
      result = await this.waitExit();
    } catch (error) {
      this.child.kill();
      await this.exit;
      throw error;
    }
    assert.deepEqual(this.errors, []);
    return { ...result, stderr: this.stderr };
  }
}

function fixture(t) {
  const temporary = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-native-synthetic-'));
  const root = path.join(temporary, '中文 runtime');
  const core = path.join(root, 'core');
  const resource = path.join(root, 'resources');
  mkdirSync(core, { recursive: true });
  copyFileSync(args.core, path.join(core, path.basename(args.core)));
  mkdirSync(path.join(resource, 'resource'), { recursive: true });
  writeFileSync(path.join(resource, 'resource/version.json'), '{}');
  const config = {
    protocolVersion: 1,
    core,
    resource,
    userDir: path.join(root, 'user'),
    adb: 'synthetic-never-executed',
    address: 'synthetic://no-device',
    lockPath: path.join(root, 'device.lock'),
    trace: path.join(root, 'trace.txt'),
    version: 'vsynthetic',
  };
  const sessions = [];
  t.after(async () => {
    try {
      for (const session of sessions) if (!session.exited) await session.close();
    } finally {
      rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
  const f = {
    root,
    core,
    resource,
    config,
    trace: () => readFileSync(config.trace, 'utf8').trim().split(/\r?\n/u),
    clearTrace: () => rmSync(config.trace, { force: true }),
    session(selected = config, options) {
      const session = new Session(selected, options);
      sessions.push(session);
      return session;
    },
    async connected(scenario = '', selected = config) {
      const session = f.session(selected, { scenario });
      await session.wait((value) => value.type === 'ready');
      session.send({ id: 'connect', operation: 'connect' });
      assert.deepEqual((await session.response('connect')).result, { asyncId: 7 });
      const callback = await session.wait((value) => value.message === 4);
      assert.equal(callback.details.details.ret, true);
      await session.wait((value) => value.type === 'status' && value.pendingAsync.length === 0);
      return session;
    },
    capture(method = 'mumu', extras = {}) {
      const emulatorPath = path.join(root, '模拟器');
      mkdirSync(emulatorPath, { recursive: true });
      return { ...config, capture: { method, emulatorPath, instanceIndex: 3, ...extras } };
    },
    async preview(session, id = 'preview') {
      session.send({ id, operation: 'frame' });
      const response = await session.response(id);
      assert.ok('result' in response, JSON.stringify(response));
      return response.result;
    },
    validate(selected = config, scenario = '') {
      const stderrFile = path.join(root, 'validation.stderr');
      const stderr = openSync(stderrFile, 'w');
      const result = spawnSync(...workerCommand('--validate'), {
        input: JSON.stringify(selected),
        encoding: 'utf8',
        timeout: 6000,
        env: environment(selected, scenario),
        stdio: ['pipe', 'pipe', stderr],
        windowsHide: true,
      });
      closeSync(stderr);
      assert.ifError(result.error);
      const messages = result.stdout
        .trim()
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      for (const value of messages) assert.equal(value.protocolVersion, 1);
      return { ...result, stderr: readFileSync(stderrFile, 'utf8'), messages };
    },
  };
  return f;
}

function check(suite, name, run) {
  if (args.suite === suite && name.includes(args.filter ?? ''))
    test(name, { timeout: 15000 }, async (t) => run(fixture(t)));
}
const connection = (clientType) => ({
  config: 'General',
  touchMode: 'minitouch',
  adbLite: false,
  clientType,
});
const task = (session) =>
  session.send({ id: 'task', operation: 'task', task: { type: 'Fight', params: {} } });
const samePath = (a, b) => assert.equal(realpathSync.native(a), realpathSync.native(b));
const has = (value, text) => assert.ok(value.includes(text), `missing ${text}`);
const lacks = (value, text) => assert.ok(!value.includes(text), `unexpected ${text}`);

check('validation', 'success uses isolated directory and clean stdout', (f) => {
  const result = f.validate();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.messages, [
    { version: 'vsynthetic', resourceLoaded: true, protocolVersion: 1 },
  ]);
  has(result.stderr, 'synthetic native stdout');
  assert.equal(existsSync(f.config.userDir), false);
});
check('validation', 'validation only loads base even with a client connection', (f) => {
  const result = f.validate({ ...f.config, connection: connection('YoStarEN') });
  assert.equal(result.status, 0, result.stderr);
  const trace = f.trace(),
    loads = trace.filter((line) => line.startsWith('resource:'));
  assert.equal(loads.length, 1);
  samePath(loads[0].slice(9), f.resource);
  lacks(trace, 'create-instance');
});
check('validation', 'version mismatch', (f) => {
  const result = f.validate({ ...f.config, version: 'vwrong' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.messages, []);
  has(result.stderr, 'version mismatch');
});
check('validation', 'missing symbol', (f) => {
  copyFileSync(args.missing, path.join(f.core, path.basename(args.core)));
  const result = f.validate();
  assert.notEqual(result.status, 0);
  has(result.stderr, 'AsstRunning');
});
check('validation', 'missing library', (f) => {
  rmSync(path.join(f.core, path.basename(args.core)));
  const result = f.validate();
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.messages, []);
  has(result.stderr, 'missing MaaCore library');
});
check('validation', 'missing resource', (f) => {
  rmSync(path.join(f.resource, 'resource/version.json'));
  const result = f.validate();
  assert.notEqual(result.status, 0);
  has(result.stderr, 'resource/version.json');
});
check('validation', 'failed resource contains bounded last errors', (f) => {
  const result = f.validate(f.config, 'resource-failure');
  assert.notEqual(result.status, 0);
  has(result.stderr, 'synthetic missing resource 99');
  lacks(result.stderr, 'synthetic missing resource 1\n');
  assert.ok(result.stderr.length < 2000);
});

check(
  'worker',
  'client resources load base then only selected overlay before creation',
  async (f) => {
    for (const client of [
      undefined,
      'Official',
      'Bilibili',
      'YoStarEN',
      'YoStarJP',
      'YoStarKR',
      'txwy',
    ]) {
      const selected = { ...f.config, ...(client ? { connection: connection(client) } : {}) };
      const expected = [f.resource];
      if (client && !['Official', 'Bilibili'].includes(client)) {
        const overlay = path.join(f.resource, 'resource/global', client);
        mkdirSync(path.join(overlay, 'resource'), { recursive: true });
        writeFileSync(path.join(overlay, 'resource/version.json'), '{}');
        expected.push(overlay);
      }
      f.clearTrace();
      const session = await f.connected('', selected);
      assert.equal((await session.close()).code, 0);
      const trace = f.trace(),
        loads = trace.filter((line) => line.startsWith('resource:'));
      assert.equal(loads.length, expected.length);
      loads.forEach((line, index) => {
        samePath(line.slice(9), expected[index]);
        assert.ok(trace.indexOf(line) < trace.indexOf('create-instance'));
      });
      assert.ok(trace.indexOf('create-instance') < trace.indexOf('connect:General'));
      if (client) assert.ok(trace.indexOf(loads.at(-1)) < trace.indexOf('option:6:' + client));
    }
  },
);
check(
  'worker',
  'missing or rejected client overlay fails before ready or instance creation',
  async (f) => {
    for (const client of ['YoStarEN', 'YoStarJP', 'YoStarKR', 'txwy']) {
      for (const failure of ['missing-directory', 'missing-version', 'overlay-failure']) {
        const overlay = path.join(f.resource, 'resource/global', client);
        rmSync(overlay, { force: true, recursive: true });
        if (failure !== 'missing-directory')
          mkdirSync(path.join(overlay, 'resource'), { recursive: true });
        if (failure === 'overlay-failure')
          writeFileSync(path.join(overlay, 'resource/version.json'), '{}');
        f.clearTrace();
        const session = f.session(
          { ...f.config, connection: connection(client) },
          { scenario: failure },
        );
        const result = await session.close();
        assert.notEqual(result.code, 0);
        has(result.stderr, client);
        has(
          result.stderr,
          {
            'missing-directory': 'client resource directory missing',
            'missing-version': 'missing resource/version.json',
            'overlay-failure': 'cannot load client resource snapshot',
          }[failure],
        );
        assert.equal(session.queue.length, 0);
        const trace = f.trace(),
          loads = trace.filter((line) => line.startsWith('resource:'));
        assert.equal(loads.length, failure === 'overlay-failure' ? 2 : 1);
        samePath(loads[0].slice(9), f.resource);
        if (failure === 'overlay-failure') samePath(loads[1].slice(9), overlay);
        lacks(trace, 'create-instance');
        assert.ok(!trace.some((line) => /^(connect:|append-task)/u.test(line)));
      }
    }
  },
);
check('worker', 'preview and click confirm native callbacks in preview pixels', async (f) => {
  const session = await f.connected(),
    frame = await f.preview(session);
  assert.deepEqual(
    Object.fromEntries(
      ['width', 'height', 'mimeType', 'canControl'].map((key) => [key, frame[key]]),
    ),
    { width: 2, height: 2, mimeType: 'image/png', canControl: true },
  );
  const image = Buffer.from(frame.data, 'base64');
  assert.equal(image.toString('base64'), frame.data);
  assert.deepEqual(image.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(image.readUInt32BE(16), frame.width);
  assert.equal(image.readUInt32BE(20), frame.height);
  session.send({ id: 'click', operation: 'click', x: 1, y: 1 });
  assert.deepEqual((await session.response('click')).result, { accepted: true });
  for (const [id, what] of [
    [17, 'Screencap'],
    [27, 'Click'],
  ]) {
    const callback = session.seen.find(
      (value) => value.message === 4 && value.details?.async_call_id === id,
    );
    assert.equal(callback.details.what, what);
    assert.equal(callback.details.details.ret, true);
  }
  const trace = f.trace();
  has(trace, 'screencap-blocking');
  has(trace, 'click:1:1:block');
  assert.ok(trace.indexOf('screencap-blocking') < trace.indexOf('get-image'));
});
check('worker', 'preview and click require connection and frame', async (f) => {
  let session = f.session();
  await session.wait((value) => value.type === 'ready');
  for (const operation of ['frame', 'click']) {
    session.send({ id: operation, operation, x: 0, y: 0 });
    has((await session.response(operation)).error, 'must be connected');
  }
  assert.equal((await session.close()).code, 0);
  session = await f.connected();
  session.send({ id: 'click', operation: 'click', x: 0, y: 0 });
  has((await session.response('click')).error, 'frame is required');
  lacks(f.trace().join('\n'), 'click:');
});
check('worker', 'preview click rejects noninteger and out of frame coordinates', async (f) => {
  const session = await f.connected();
  await f.preview(session);
  const cases = [
    {},
    { x: true, y: 0 },
    { x: 0, y: false },
    { x: 1.5, y: 0 },
    { x: '1', y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 2, y: 0 },
    { x: 0, y: 2 },
    { x: 2 ** 64, y: 0 },
  ];
  for (const [id, coordinates] of cases.entries()) {
    session.send({ id, operation: 'click', ...coordinates });
    has((await session.response(id)).error, 'integers inside');
  }
  lacks(f.trace().join('\n'), 'click:');
});
check('worker', 'running preview only reads cached image and blocks click', async (f) => {
  const session = await f.connected('task-hold');
  await f.preview(session);
  task(session);
  assert.deepEqual((await session.response('task')).result, { taskId: 11 });
  assert.equal((await f.preview(session, 'running-preview')).canControl, false);
  session.send({ id: 'click', operation: 'click', x: 0, y: 0 });
  has((await session.response('click')).error, 'not idle');
  const trace = f.trace();
  assert.equal(trace.filter((line) => line === 'screencap').length, 1);
  assert.equal(trace.filter((line) => line === 'get-image').length, 2);
  assert.ok(!trace.some((line) => line.startsWith('click:')));
});
check('worker', 'delayed native callback is awaited without event pump', async (f) => {
  for (const [scenario, operation, id] of [
    ['screencap-callback-delay', 'frame', 17],
    ['click-callback-delay', 'click', 27],
  ]) {
    const session = await f.connected(scenario);
    if (operation === 'click') await f.preview(session);
    session.send({ id: 'command', operation, x: 0, y: 0 });
    assert.ok('result' in (await session.response('command')));
    assert.ok(session.seen.some((value) => value.details?.async_call_id === id));
    assert.equal((await session.close()).code, 0);
  }
});
check('worker', 'preview refuses failed or mismatched screencap results', async (f) => {
  for (const scenario of ['screencap-reject', 'screencap-failure', 'screencap-wrong-what']) {
    const session = await f.connected(scenario);
    session.send({ id: 'frame', operation: 'frame' });
    assert.ok('error' in (await session.response('frame')));
    lacks(f.trace(), 'get-image');
    assert.equal((await session.close()).code, 0);
  }
});
check('worker', 'click requires successful exact callback and is never replayed', async (f) => {
  for (const scenario of [
    'click-reject',
    'click-failure',
    'click-invalid-ret',
    'click-wrong-what',
    'click-disconnect',
  ]) {
    f.clearTrace();
    const session = await f.connected(scenario);
    await f.preview(session);
    session.send({ id: 'click', operation: 'click', x: 1, y: 0 });
    assert.ok('error' in (await session.response('click')));
    assert.equal(f.trace().filter((line) => line.startsWith('click:')).length, 1);
    assert.equal((await session.close()).code, 0);
  }
});
check('worker', 'preview size sentinel PNG header and dimensions are bounded', async (f) => {
  for (const scenario of [
    'image-null-size',
    'image-oversize',
    'image-empty',
    'image-truncated',
    'image-invalid-png',
    'image-invalid-ihdr',
    'image-wide',
    'image-too-many-pixels',
    'image-zero-dimension',
  ]) {
    const session = await f.connected(scenario);
    session.send({ id: 'frame', operation: 'frame' });
    assert.ok('error' in (await session.response('frame')));
    session.send({ id: 'click', operation: 'click', x: 0, y: 0 });
    has((await session.response('click')).error, 'frame is required');
    assert.equal((await session.close()).code, 0);
  }
});
check('worker', 'largest preview fits one NDJSON message', async (f) => {
  const session = await f.connected('image-limit'),
    frame = await f.preview(session);
  assert.equal(Buffer.from(frame.data, 'base64').length, 3 * 1024 ** 2 - 8192);
  assert.ok(Buffer.byteLength(JSON.stringify(frame)) < 4 * 1024 ** 2 - 8192);
});
check('worker', 'optional preview symbols preserve legacy core tasks', async (f) => {
  assert.ok(args.legacy, 'legacy fixture must be supplied');
  copyFileSync(args.legacy, path.join(f.core, path.basename(args.core)));
  const session = await f.connected();
  for (const [operation, symbol] of [
    ['frame', 'AsstGetImage'],
    ['click', 'AsstAsyncClick'],
  ]) {
    session.send({ id: operation, operation, x: 0, y: 0 });
    has((await session.response(operation)).error, symbol);
  }
  task(session);
  assert.deepEqual((await session.response('task')).result, { taskId: 11 });
  await session.wait((value) => value.message === 10002);
  assert.equal((await session.close()).code, 0);
});
check('worker', 'missing exact async callback exits unknown without replaying', async (f) => {
  for (const [scenario, operation] of [
    ['screencap-wrong-id', 'frame'],
    ['click-wrong-id', 'click'],
  ]) {
    f.clearTrace();
    const session = await f.connected(scenario, { ...f.config, asyncTimeoutMs: 1000 });
    if (operation === 'click') await f.preview(session);
    session.send({ id: 'command', operation, x: 0, y: 0 });
    assert.equal((await session.waitExit(3000)).code, 124);
    const result = await session.close();
    assert.equal(result.code, 124);
    has(result.stderr, 'result unknown, do not replay');
    if (operation === 'click')
      assert.equal(f.trace().filter((line) => line.startsWith('click:')).length, 1);
  }
});
check('worker', 'enhanced preview failure preserves protocol stop', async (f) => {
  const session = await f.connected('capture-late-fallback', f.capture());
  session.send({ id: 'frame', operation: 'frame' });
  assert.ok('error' in (await session.response('frame')));
  assert.ok(
    session.seen.some((value) => value.details?.why === 'RequiredCaptureProtocolUnavailable'),
  );
  const trace = f.trace();
  has(trace, 'stop-cleared-queue');
  lacks(trace, 'get-image');
});
check('worker', 'enhanced extras precede connection and new screencap', async (f) => {
  for (const [method, name, expected, extras] of [
    ['mumu', 'MuMuEmulator12', 'MumuExtras', {}],
    ['ldplayer', 'LDPlayer', 'LDExtras', { pid: 4242 }],
  ]) {
    const selected = f.capture(method, extras),
      session = await f.connected('', selected);
    assert.equal(
      session.seen.find((value) => value.details?.what === 'FastestWayToScreencap').details.details
        .method,
      expected,
    );
    session.send({ id: 'frame', operation: 'screencap' });
    assert.deepEqual((await session.response('frame')).result, { asyncId: 17 });
    const frame = await session.wait((value) => value.details?.what === 'Screencap');
    assert.equal(frame.details.details.ret, true);
    await session.wait((value) => value.type === 'status' && value.pendingAsync.length === 0);
    task(session);
    assert.deepEqual((await session.response('task')).result, { taskId: 11 });
    await session.wait((value) => value.message === 10002);
    assert.equal((await session.close()).code, 0);
    const trace = f.trace(),
      extraLine = trace.find((line) => line.startsWith('extras:' + name + ':'));
    const applied = JSON.parse(extraLine.slice(extraLine.indexOf(':', 7) + 1));
    samePath(applied.path, selected.capture.emulatorPath);
    if (process.platform === 'win32') assert.ok(!applied.path.startsWith('\\\\?\\'));
    assert.equal(applied.index, 3);
    if (method === 'mumu') assert.equal(applied.touch, false);
    else assert.equal(applied.pid, 4242);
    assert.ok(trace.indexOf(extraLine) < trace.indexOf('connect:' + name));
    has(trace, 'screencap');
  }
});
check('worker', 'connection profile and touch options precede async connect', async (f) => {
  const session = await f.connected('', {
    ...f.config,
    connection: {
      config: 'BlueStacks',
      touchMode: 'maatouch',
      adbLite: true,
      clientType: 'Bilibili',
    },
  });
  assert.equal((await session.close()).code, 0);
  const trace = f.trace();
  for (const option of ['option:2:maatouch', 'option:4:1', 'option:5:0', 'option:6:Bilibili']) {
    has(trace, option);
    assert.ok(trace.indexOf(option) < trace.indexOf('connect:BlueStacks'));
  }
});
check(
  'worker',
  'mumu touch enhancement reaches both instance and connection options',
  async (f) => {
    const session = await f.connected('', f.capture('mumu', { mumuTouch: true, mumuBridge: true }));
    assert.equal((await session.close()).code, 0);
    const trace = f.trace();
    has(trace, 'option:2:MumuExtras');
    const applied = JSON.parse(
      trace
        .find((line) => line.startsWith('extras:MuMuEmulator12:'))
        .slice('extras:MuMuEmulator12:'.length),
    );
    assert.equal(applied.touch, true);
    assert.equal(applied.index, 3);
  },
);
check('worker', 'rejected instance option destroys instance before startup fails', async (f) => {
  const session = f.session(
    { ...f.config, connection: connection('Official') },
    { scenario: 'option-reject' },
  );
  const result = await session.close();
  assert.notEqual(result.code, 0);
  has(result.stderr, 'rejected');
  const trace = f.trace().join('\n');
  has(trace, 'destroy-done');
  lacks(trace, 'connect:');
});
check('worker', 'enhanced task requires verified connection', async (f) => {
  const session = f.session(f.capture());
  await session.wait((value) => value.type === 'ready');
  task(session);
  has((await session.response('task')).error, 'protocol has not been verified');
  session.send({ id: 'frame', operation: 'screencap' });
  has((await session.response('frame')).error, 'must be connected');
  assert.equal((await session.close()).code, 0);
  lacks(f.trace(), 'append-task');
});
check('worker', 'enhanced fallback missing evidence and connect failure block tasks', async (f) => {
  for (const scenario of ['capture-fallback', 'capture-no-evidence', 'capture-connect-failure']) {
    const session = f.session(f.capture(), { scenario });
    await session.wait((value) => value.type === 'ready');
    session.send({ id: 'connect', operation: 'connect' });
    await session.response('connect');
    const result = await session.wait(
      (value) => value.message === 4 && value.details?.what === 'Connect',
    );
    const details = result.details.details;
    assert.equal(details.ret, false);
    assert.equal(details.expectedMethod, 'MumuExtras');
    assert.ok(details.error);
    await session.wait((value) => value.type === 'status' && value.pendingAsync.length === 0);
    task(session);
    has((await session.response('task')).error, 'protocol has not been verified');
    assert.equal((await session.close()).code, 0);
    lacks(f.trace(), 'append-task');
  }
});
check(
  'worker',
  'enhanced reprobe fallback and screencap failure stop and disconnect',
  async (f) => {
    for (const scenario of ['capture-late-fallback', 'screencap-failure']) {
      const session = await f.connected(scenario, f.capture());
      session.send({ id: 'frame', operation: 'screencap' });
      await session.response('frame');
      const failure = await session.wait(
        (value) => value.message === 2 && value.details?.what === 'Disconnect',
      );
      assert.equal(failure.details.why, 'RequiredCaptureProtocolUnavailable');
      assert.ok(failure.details.details.error);
      const frame = await session.wait((value) => value.details?.what === 'Screencap');
      assert.equal(frame.details.details.ret, false);
      assert.ok(frame.details.details.error);
      await session.wait((value) => value.type === 'status' && value.pendingAsync.length === 0);
      task(session);
      has((await session.response('task')).error, 'protocol has not been verified');
      assert.equal((await session.close()).code, 0);
      const trace = f.trace();
      has(trace, 'stop-cleared-queue');
      lacks(trace, 'append-task');
    }
  },
);
check('worker', 'invalid capture configuration is rejected', async (f) => {
  const cases = [
    f.capture('mumu', { instanceIndex: -1 }),
    f.capture('mumu', { instanceIndex: true }),
    f.capture('mumu', { instanceIndex: 1.5 }),
    f.capture('mumu', { pid: 22 }),
    f.capture('ldplayer', { pid: 0 }),
    f.capture('ldplayer', { pid: 2147483648 }),
    f.capture('unsupported'),
    f.capture('mumu', { emulatorPath: path.join(f.root, 'missing') }),
  ];
  for (const selected of cases) {
    const result = await f.session(selected).close();
    assert.notEqual(result.code, 0);
    assert.ok(result.stderr);
  }
});
check('worker', 'connect task callbacks and EOF destroy', async (f) => {
  const session = await f.connected();
  task(session);
  assert.deepEqual((await session.response('task')).result, { taskId: 11 });
  const event = await session.wait((value) => value.message === 10002);
  assert.equal(event.details.taskchain, 'Fight');
  await session.wait((value) => value.type === 'status' && !value.running);
  const result = await session.close();
  assert.equal(result.code, 0, result.stderr);
  has(f.trace(), 'destroy-done');
  has(result.stderr, 'synthetic native stdout: destroyed');
});
check('worker', 'pending connection blocks task', async (f) => {
  const session = f.session(f.config, { scenario: 'async-hang' });
  await session.wait((value) => value.type === 'ready');
  session.send({ id: 'connect', operation: 'connect' });
  await session.response('connect');
  task(session);
  has((await session.response('task')).error, 'not idle');
});
check('worker', 'stop clears queue', async (f) => {
  const session = await f.connected();
  task(session);
  await session.response('task');
  session.send({ id: 'stop', operation: 'stop' });
  assert.deepEqual((await session.response('stop')).result, { stopping: true });
  await session.wait((value) => value.type === 'status' && !value.running);
  assert.ok(!session.seen.some((value) => value.message === 10002));
});
check('worker', 'malformed callback is copied as error', async (f) => {
  const session = await f.connected('malformed-callback');
  task(session);
  await session.response('task');
  assert.deepEqual((await session.wait((value) => value.message === 9001)).details, {
    decodeError: true,
  });
});
check('worker', 'rejected native task', async (f) => {
  const session = await f.connected('task-reject');
  task(session);
  has((await session.response('task')).error, 'rejected appended task');
});
check('worker', 'rejected start clears native queue', async (f) => {
  const session = await f.connected('start-reject');
  task(session);
  has((await session.response('task')).error, 'rejected task start');
  has(f.trace(), 'stop-cleared-queue');
});
check('worker', 'native call and async deadlines exit unknown', async (f) => {
  for (const [scenario, key] of [
    ['call-hang', 'nativeCallTimeoutMs'],
    ['async-hang', 'asyncTimeoutMs'],
  ]) {
    const session = f.session({ ...f.config, [key]: 80 }, { scenario });
    await session.wait((value) => value.type === 'ready');
    session.send({ id: 'connect', operation: 'connect' });
    assert.equal((await session.waitExit(3000)).code, 124);
    const result = await session.close();
    assert.equal(result.code, 124);
    has(result.stderr, 'result unknown');
  }
});
check('worker', 'destroy timeout is bounded', async (f) => {
  const session = f.session({ ...f.config, shutdownTimeoutMs: 80 }, { scenario: 'destroy-hang' });
  await session.wait((value) => value.type === 'ready');
  assert.equal((await session.close()).code, 124);
});

async function holdLock(f) {
  const child = spawn(args['lock-probe'], [f.config.lockPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const closed = new Promise((resolve) => child.once('close', (code) => resolve(code)));
  const line = createInterface({ input: child.stdout });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('lock probe failed to acquire'));
    }, 3000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', () => {
      clearTimeout(timer);
      reject(new Error('lock probe exited before acquiring'));
    });
    line.once('line', (text) => {
      clearTimeout(timer);
      assert.equal(text, 'locked');
      resolve();
    });
  });
  return async () => {
    child.stdin.end();
    assert.equal(await closed, 0);
    line.close();
  };
}
function assertLockBusy(f) {
  const result = spawnSync(args['lock-probe'], [f.config.lockPath], {
    input: '',
    encoding: 'utf8',
    timeout: 3000,
    windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
}
check('lease', 'worker excludes external OS lock and releases on EOF', async (f) => {
  const session = f.session(f.config, { mode: '--lease-only' });
  await session.wait((value) => value.type === 'ready');
  assertLockBusy(f);
  assert.equal((await session.close()).code, 0);
  const release = await holdLock(f);
  await release();
  assert.equal(existsSync(f.config.userDir), false);
  assert.equal(existsSync(f.config.lockPath), true);
});
check('lease', 'external OS lock excludes worker', async (f) => {
  const release = await holdLock(f);
  try {
    const result = await f
      .session({ ...f.config, lockTimeoutMs: 50 }, { mode: '--lease-only' })
      .close();
    assert.notEqual(result.code, 0);
    has(result.stderr, 'device lock busy');
  } finally {
    await release();
  }
});
check('lease', 'worker keeps lock through destroy', async (f) => {
  const session = f.session(f.config, { scenario: 'destroy-delay' });
  await session.wait((value) => value.type === 'ready');
  session.child.stdin.end();
  const deadline = performance.now() + 3000;
  while (!existsSync(f.config.trace) || !f.trace().includes('destroy-start')) {
    assert.ok(performance.now() < deadline, 'destroy did not start');
    await delay(10);
  }
  assertLockBusy(f);
  assert.equal((await session.close()).code, 0);
  const release = await holdLock(f);
  await release();
  assert.equal(existsSync(f.config.lockPath), true);
});
check('lease', 'worker competitor and crash release', async (f) => {
  const session = f.session(f.config, { mode: '--lease-only' });
  await session.wait((value) => value.type === 'ready');
  const rival = f.session({ ...f.config, lockTimeoutMs: 20 }, { mode: '--lease-only' });
  assert.notEqual((await rival.close()).code, 0);
  session.child.kill();
  await session.close();
  const replacement = f.session(f.config, { mode: '--lease-only' });
  await replacement.wait((value) => value.type === 'ready');
  assert.equal(existsSync(f.config.lockPath), true);
});

check('protocol', 'old configuration and commands remain compatible', async (f) => {
  const { protocolVersion: _version, ...selected } = f.config;
  const session = f.session(selected);
  await session.wait((value) => value.type === 'ready');
  session.send({ id: 42, operation: 'stop' });
  assert.ok('result' in (await session.response(42)));
});
check('protocol', 'unsupported configuration version is rejected', async (f) => {
  const session = f.session({ ...f.config, protocolVersion: 2 }, { mode: '--lease-only' });
  assert.notEqual((await session.close()).code, 0);
});
check('protocol', 'invalid command does not kill worker', async (f) => {
  const session = f.session();
  await session.wait((value) => value.type === 'ready');
  session.send({ id: 'bad', operation: 'shell', command: 'must-never-run' });
  has((await session.response('bad')).error, 'unknown');
  session.send({ id: 'version', protocolVersion: 2, operation: 'stop' });
  has((await session.response('version')).error, 'protocolVersion');
  session.send({ id: 'ok', operation: 'stop' });
  assert.ok('result' in (await session.response('ok')));
});
check('protocol', 'malformed JSON is rejected then worker continues', async (f) => {
  const session = f.session();
  await session.wait((value) => value.type === 'ready');
  session.child.stdin.write('{invalid-json\n');
  assert.ok('error' in (await session.response(null)));
  session.send({ id: 'ok', operation: 'stop' });
  assert.ok('result' in (await session.response('ok')));
});
check('protocol', 'oversized configuration fails before loading', () => {
  const result = spawnSync(...workerCommand('--worker'), {
    input: 'x'.repeat(4 * 1024 ** 2 + 1) + '\n',
    encoding: 'utf8',
    timeout: 6000,
    windowsHide: true,
  });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  has(result.stderr, 'exceeds 4 MiB');
});
