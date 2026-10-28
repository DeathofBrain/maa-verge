import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/runtime';
import { parseSettings } from '../src/models';
import { CoreWorker } from '../src/worker';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function until(condition: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!condition() && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 1));
  expect(condition()).toBe(true);
}
class Worker {
  events: any[] = [];
  connected = false;
  safeIdle = true;
  closed = false;
  stopped = false;
  submitted: any[] = [];
  wait?: (cancelled?: () => boolean) => Promise<boolean>;
  taskWait?: () => Promise<void>;
  async connect() {
    this.connected = true;
    this.events.push({
      type: 'callback',
      message: 4,
      details: { what: 'Connect', details: { ret: true } },
    });
  }
  async waitConnected(_timeout?: number, cancelled?: () => boolean) {
    return this.wait ? this.wait(cancelled) : this.connected && this.safeIdle;
  }
  async task(task: any) {
    if (this.closed) throw new Error('closed synthetic worker');
    this.submitted.push(task);
    this.safeIdle = false;
    await this.taskWait?.();
    return { taskId: this.submitted.length };
  }
  async stop() {
    this.stopped = true;
  }
  async close() {
    this.closed = true;
    this.connected = false;
  }
  complete(pendingAsync: number[] = []) {
    const taskid = this.submitted.length;
    this.events.push(
      { type: 'callback', message: 10002, details: { taskid } },
      { type: 'callback', message: 3, details: { taskid } },
      { type: 'status', running: false, pendingAsync },
    );
    this.safeIdle = !pendingAsync.length;
  }
}
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-client-resources-'));
  roots.push(root);
  const configs: any[] = [],
    workers: Worker[] = [];
  let factory: ((config: any, signal?: AbortSignal) => Promise<Worker>) | undefined;
  const runtime = new Runtime(root, {
    adbExecutable: () => 'synthetic-adb',
    workerFactory: async (config, options) => {
      configs.push(structuredClone(config));
      const worker = factory ? await factory(config, options?.signal) : new Worker();
      workers.push(worker);
      return worker;
    },
  });
  runtimes.push(runtime);
  runtime.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource', version: 'r1' },
  });
  const connect = async (port = 5555) => {
    const device = await runtime.connectDevice({ address: `127.0.0.1:${port}` });
    await runtime.pollNativeWorkers();
    return device;
  };
  const save = (tasks: any[], id = 'client') =>
    runtime.handle('plan.save', { plan: { id, name: '客户端资源', tasks } });
  const start = (device: any, requestId = 'client', planId = 'client') =>
    runtime.startRun({ planId, deviceId: device.id, requestId });
  return {
    runtime,
    configs,
    workers,
    connect,
    save,
    start,
    factory: (next: typeof factory) => {
      factory = next;
    },
  };
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('client changes rebuild only the target worker with its original connection snapshot', async () => {
  const f = fixture(),
    r = f.runtime;
  await r.handle('settings.save', {
    settings: parseSettings({
      connection: { config: 'AVD', touchMode: 'MaaFwAdb', adbLite: true, clientType: 'Official' },
    }),
  });
  const device = await f.connect(),
    other = await f.connect(5557),
    original = structuredClone(f.configs[0]);
  await f.save([{ type: 'Award' }], 'other');
  const otherRun = await f.start(other, 'other', 'other');
  await r.handle('settings.save', {
    settings: parseSettings({
      connection: { config: 'Nox', touchMode: 'adb', clientType: 'txwy' },
    }),
  });
  await f.save([
    { type: 'StartUp', params: { client_type: 'YoStarJP' } },
    { type: 'Fight' },
    { type: 'Fight', params: { client_type: 'YoStarEN' } },
    { type: 'Fight', params: { client_type: 'Official' } },
  ]);
  const run = await f.start(device);
  expect(f.workers[0].closed).toBe(true);
  expect(f.workers[1].closed).toBe(false);
  expect(f.workers[1].stopped).toBe(false);
  expect(f.configs[2]).toEqual({
    ...original,
    connection: { ...original.connection, clientType: 'YoStarJP' },
  });
  expect(f.workers[2].submitted.map((task) => task.type)).toEqual(['StartUp']);
  await r.tick(true);
  expect(r.store.get('device', device.id).state).toBe('running');
  f.workers[2].complete();
  await r.tick(true);
  expect(f.workers).toHaveLength(3);
  expect(f.workers[2].submitted[1].params).toMatchObject({ client_type: 'YoStarJP', server: 'JP' });
  f.workers[2].complete();
  await r.tick(true);
  await until(() => !!f.workers[3]?.submitted.length);
  expect(f.workers[2].closed).toBe(true);
  expect(f.configs[3].connection.clientType).toBe('YoStarEN');
  expect(f.workers[3].submitted[0].params).toMatchObject({ client_type: 'YoStarEN', server: 'US' });
  f.workers[3].complete();
  await r.tick(true);
  await until(() => !!f.workers[4]?.submitted.length);
  expect(f.workers[3].closed).toBe(true);
  expect(f.configs[4]).toEqual(original);
  expect(f.workers[4].submitted[0].params.client_type).toBe('Official');
  expect(r.store.get('run', otherRun.id).status).toBe('running');
  expect(f.workers[1].submitted).toHaveLength(1);
  f.workers[4].complete();
  await r.tick(true);
  expect(r.store.get('run', run.id).status).toBe('completed');
});

test('a switch waits for native idle and reconnection, and a late Connect cannot release the running device', async () => {
  const f = fixture(),
    r = f.runtime,
    device = await f.connect(),
    gate = deferred<boolean>(),
    waiting = deferred<void>();
  await f.save([{ type: 'Award' }, { type: 'StartUp', params: { client_type: 'YoStarKR' } }]);
  const run = await f.start(device);
  f.factory(async () => {
    const worker = new Worker();
    worker.wait = async () => {
      waiting.resolve();
      return gate.promise;
    };
    return worker;
  });
  f.workers[0].complete([9]);
  await r.tick(true);
  expect(f.workers).toHaveLength(1);
  f.workers[0].safeIdle = true;
  f.workers[0].events.push({ type: 'status', running: false, pendingAsync: [] });
  const tick = r.tick(true);
  await waiting.promise;
  expect(r.store.get('execution', run.id).submitting).toBe(true);
  expect(r.busy()).toBe(true);
  expect(f.workers[1].submitted).toHaveLength(0);
  expect(r.store.get('device', device.id).state).toBe('running');
  await expect(r.beforeSwitch()).rejects.toThrow('核心或异步操作仍在运行');
  gate.resolve(true);
  await tick;
  await until(() => !!f.workers[1].submitted.length);
  await r.tick(true);
  expect(f.workers[1].submitted).toHaveLength(1);
  expect(r.store.get('device', device.id).state).toBe('running');
});

test('a component switch ignores registered offline workers instead of reconnecting them', async () => {
  const f = fixture(),
    r = f.runtime,
    device = await f.connect();
  f.workers[0].connected = false;
  const saved = r.store.get('device', device.id);
  saved.state = 'offline';
  r.store.put('device', device.id, saved);
  await r.beforeSwitch();
  await r.afterSwitch();
  await r.finishSwitch();
  expect(f.workers).toHaveLength(1);
  expect(r.workers.has(device.id)).toBe(false);
  expect(r.store.get('device', device.id).state).toBe('offline');
});

test('a live device that cannot reconnect is left offline without failing the switch', async () => {
  const f = fixture(),
    r = f.runtime,
    device = await f.connect();
  f.factory(async () => {
    const worker = new Worker();
    worker.wait = async () => false;
    return worker;
  });
  await r.beforeSwitch();
  await expect(r.afterSwitch()).resolves.toBeUndefined();
  await r.finishSwitch();
  expect(f.workers).toHaveLength(2);
  expect(f.workers[1].closed).toBe(true);
  expect(r.workers.has(device.id)).toBe(false);
  expect(r.store.get('device', device.id).state).toBe('offline');
  expect(r.store.get('device', device.id).connectionError).toContain('重连失败');
});

test('legacy StartUp and CloseDown defaults load the same client they submit', async () => {
  const f = fixture(),
    r = f.runtime,
    device = await f.connect();
  await f.save([
    { type: 'StartUp', params: { client_type: 'YoStarJP' } },
    { type: 'StartUp' },
    { type: 'CloseDown' },
  ]);
  await f.start(device);
  f.workers[1].complete();
  await r.tick(true);
  await until(() => !!f.workers[2]?.submitted.length);
  expect(f.configs[2].connection.clientType).toBe('Official');
  expect(f.workers[2].submitted[0].params.client_type).toBe('Official');
  f.workers[2].complete();
  await r.tick(true);
  expect(f.workers).toHaveLength(3);
  expect(f.workers[2].submitted[1].params.client_type).toBe('Official');
});

test('an update arriving during reconnection holds the task at a safe boundary', async () => {
  const f = fixture(),
    r = f.runtime,
    device = await f.connect(),
    gate = deferred<boolean>(),
    waiting = deferred<void>();
  f.factory(async () => {
    const worker = new Worker();
    worker.wait = async () => {
      waiting.resolve();
      return gate.promise;
    };
    return worker;
  });
  await f.save([{ type: 'StartUp', params: { client_type: 'YoStarEN' } }]);
  const pending = f.start(device);
  await waiting.promise;
  const channel = r.updates.channel('resource');
  r.store.put('update', 'resource', { ...channel, status: 'waiting_idle' });
  gate.resolve(true);
  const run = await pending;
  expect(f.workers[1].submitted).toHaveLength(0);
  expect(r.store.get('execution', run.id).boundaryWaiting).toBe(true);
  expect(r.busy()).toBe(false);
  r.store.put('update', 'resource', { ...channel, status: 'active' });
  await r.tick(true);
  expect(f.workers[1].submitted).toHaveLength(1);
});

test('one pending client reconnect does not block another device completing, advancing or stopping', async () => {
  const f = fixture(),
    r = f.runtime,
    device = await f.connect(),
    other = await f.connect(5557),
    waiting = deferred<void>(),
    gate = deferred<boolean>();
  await f.save([{ type: 'Award' }, { type: 'StartUp', params: { client_type: 'YoStarJP' } }]);
  await f.save([{ type: 'Award' }, { type: 'Mall' }], 'other');
  const run = await f.start(device),
    otherRun = await f.start(other, 'other', 'other');
  f.factory(async () => {
    const worker = new Worker();
    worker.wait = async () => {
      waiting.resolve();
      return gate.promise;
    };
    return worker;
  });
  f.workers[0].complete();
  f.workers[1].complete();
  await r.tick(true);
  await waiting.promise;
  expect(r.store.get('execution', run.id).submitting).toBe(true);
  expect(f.workers[2].submitted).toHaveLength(0);
  expect(f.workers[1].submitted.map((task) => task.type)).toEqual(['Award', 'Mall']);
  await r.stopRun(otherRun.id);
  f.workers[1].safeIdle = true;
  f.workers[1].events.push({ type: 'status', running: false, pendingAsync: [] });
  await r.tick(true);
  expect(r.store.get('run', otherRun.id).status).toBe('stopped');
  expect(r.store.get('run', run.id).status).toBe('running');
  expect(f.workers[2].closed).toBe(false);
  expect(f.workers[2].stopped).toBe(false);
  gate.resolve(true);
  // The resumed preparation is asynchronous to the polling loop.
  await until(() => !!f.workers[2].submitted.length);
  expect(f.workers[2].submitted.map((task) => task.type)).toEqual(['StartUp']);
});

test('a polling snapshot cannot consume callbacks from a worker replaced while another device awaited submission', async () => {
  const f = fixture(),
    r = f.runtime,
    first = await f.connect(),
    second = await f.connect(5557),
    gate = deferred<void>();
  await f.save([{ type: 'Award' }, { type: 'Mall' }], 'first');
  await f.save([{ type: 'StartUp', params: { client_type: 'YoStarJP' } }]);
  await f.start(first, 'first', 'first');
  f.workers[0].taskWait = () => gate.promise;
  f.workers[0].complete();
  const tick = r.tick(true);
  await until(() => f.workers[0].submitted.length === 2);
  const secondRun = await f.start(second);
  f.workers[1].events.push({ type: 'exit' });
  gate.resolve();
  await tick;
  expect(r.store.get('run', secondRun.id).status).toBe('running');
  expect(r.workers.get(second.id)).toBe(f.workers[2]);
  expect(f.workers[2].closed).toBe(false);
  expect(f.workers[2].submitted).toHaveLength(1);
});

test('stopping during worker startup cancels the replacement and never replays a task', async () => {
  const f = fixture(),
    r = f.runtime,
    device = await f.connect(),
    creating = deferred<void>(),
    created = deferred<Worker>();
  let signal: AbortSignal | undefined;
  f.factory(async (_config, nextSignal) => {
    signal = nextSignal;
    creating.resolve();
    return created.promise;
  });
  await f.save([{ type: 'StartUp', params: { client_type: 'YoStarJP' } }, { type: 'Award' }]);
  const pending = f.start(device);
  await creating.promise;
  const run = r.snapshot().runs[0];
  await r.stopRun(run.id);
  expect(signal?.aborted).toBe(true);
  const late = new Worker();
  created.resolve(late);
  await pending;
  expect(late.closed).toBe(true);
  expect(late.submitted).toHaveLength(0);
  expect(r.workers.has(device.id)).toBe(false);
  expect(r.store.get('run', run.id).status).toBe('stopped');
  expect(r.store.get('device', device.id).state).toBe('offline');
  expect((await f.start(device)).id).toBe(run.id);
  expect(f.configs).toHaveLength(2);
});

test('stopping while connection is pending closes the new worker before submission', async () => {
  const f = fixture(),
    r = f.runtime,
    device = await f.connect(),
    waiting = deferred<void>(),
    gate = deferred<boolean>();
  f.factory(async () => {
    const worker = new Worker();
    worker.wait = async () => {
      waiting.resolve();
      return gate.promise;
    };
    return worker;
  });
  await f.save([{ type: 'StartUp', params: { client_type: 'YoStarJP' } }]);
  const pending = f.start(device);
  await waiting.promise;
  const run = r.snapshot().runs[0];
  await r.stopRun(run.id);
  expect(f.workers[1].closed).toBe(true);
  gate.resolve(false);
  await pending;
  expect(f.workers[1].submitted).toHaveLength(0);
  expect(r.store.get('run', run.id).status).toBe('stopped');
  expect(r.workers.has(device.id)).toBe(false);
});

test('failed resource loading or reconnect ends the run without replaying the old worker', async () => {
  for (const failure of ['resource', 'connect']) {
    const f = fixture(),
      r = f.runtime,
      device = await f.connect();
    f.factory(async () => {
      if (failure === 'resource') throw new Error('missing client resource overlay');
      const worker = new Worker();
      worker.wait = async () => false;
      return worker;
    });
    await f.save([{ type: 'StartUp', params: { client_type: 'txwy' } }, { type: 'Award' }]);
    const run = await f.start(device);
    expect(run.status).toBe('failed');
    expect(run.message).toContain('客户端资源切换失败');
    expect(f.workers[0].closed).toBe(true);
    expect(f.workers.flatMap((worker) => worker.submitted)).toHaveLength(0);
    expect(r.workers.has(device.id)).toBe(false);
    expect(r.store.get('device', device.id).state).toBe('offline');
  }
});

test('shutdown cancels an in-progress client reload before closing the business store', async () => {
  const f = fixture(),
    r = f.runtime,
    device = await f.connect(),
    creating = deferred<void>();
  f.factory(
    async (_config, signal) =>
      new Promise<Worker>((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(new Error('cancelled synthetic startup')), {
          once: true,
        });
        creating.resolve();
      }),
  );
  await f.save([{ type: 'StartUp', params: { client_type: 'YoStarJP' } }]);
  const pending = f.start(device);
  await creating.promise;
  await r.close();
  const run = await pending;
  expect(run.status).toBe('stopped');
  expect(f.workers[0].closed).toBe(true);
  expect(r.workers.size).toBe(0);
});

test('aborting the actual worker bridge closes a child that has not sent ready', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-worker-start-abort-'));
  roots.push(root);
  const script = path.join(root, 'startup.mjs'),
    launched = path.join(root, 'launched.txt'),
    exited = path.join(root, 'exited.txt');
  writeFileSync(
    script,
    `import { writeFileSync } from 'node:fs';
process.stdin.once('data', () => writeFileSync(${JSON.stringify(launched)}, String(process.pid)));
process.stdin.once('end', () => { writeFileSync(${JSON.stringify(exited)}, 'closed'); process.exit(0); });
process.stdin.resume();
`,
  );
  const controller = new AbortController();
  const starting = CoreWorker.start(
    { userDir: path.join(root, 'user'), lockPath: path.join(root, 'synthetic.lock') },
    { command: [process.execPath, script], signal: controller.signal },
  );
  await until(() => existsSync(launched));
  controller.abort();
  await expect(starting).rejects.toThrow('启动已取消');
  expect(readFileSync(exited, 'utf8')).toBe('closed');
});

test('worker initialization errors retain the native cause from stderr without promoting unrelated output', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-worker-start-error-'));
  roots.push(root);
  for (const [name, diagnostic, expected] of [
    ['resource', 'maaverge-core-worker: cannot load resource snapshot', '核心资源缺失或加载失败'],
    [
      'unknown',
      'maaverge-core-worker: synthetic specific initialization failure',
      'synthetic specific initialization failure',
    ],
    [
      'timeout',
      'native timeout in load and initialize; result unknown, do not replay',
      '核心原生调用超时',
    ],
    ['unrelated', 'unrelated diagnostic about unauthorized device', '退出码 7'],
  ]) {
    const script = path.join(root, name + '.mjs');
    writeFileSync(
      script,
      `process.stdin.once('data', () => { process.stderr.write('x'.repeat(32768) + '\\n' + ${JSON.stringify(diagnostic)} + '\\n', () => process.exit(7)); });`,
    );
    const userDir = path.join(root, name);
    await expect(
      CoreWorker.start(
        { userDir, lockPath: path.join(root, 'synthetic.lock') },
        { command: [process.execPath, script] },
      ),
    ).rejects.toThrow(expected);
    expect(readFileSync(path.join(userDir, 'worker.stderr.log'), 'utf8')).toContain(diagnostic);
  }
  await expect(
    CoreWorker.start(
      { userDir: path.join(root, 'missing'), lockPath: path.join(root, 'synthetic.lock') },
      { command: [path.join(root, 'missing-synthetic-worker')] },
    ),
  ).rejects.toThrow('核心工作进程文件不存在');
});

test('the worker bridge finishes an explicit failed connection promptly and permits a fresh retry', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-worker-connect-result-'));
  roots.push(root);
  const script = path.join(root, 'connection.mjs');
  writeFileSync(
    script,
    `import { createInterface } from 'node:readline';
let initialized = false, attempts = 0;
const send = value => process.stdout.write(JSON.stringify({ protocolVersion: 1, ...value }) + '\\n');
createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (!initialized) { initialized = true; send({ type: 'ready' }); return; }
  attempts++;
  send({ type: 'response', id: request.id, result: { asyncId: attempts } });
  send({ type: 'callback', message: 4, details: { what: 'Connect', details: { ret: attempts > 1 } } });
  send({ type: 'status', running: false, pendingAsync: [] });
});
`,
  );
  const worker = await CoreWorker.start(
    { userDir: path.join(root, 'user'), lockPath: path.join(root, 'synthetic.lock') },
    { command: [process.execPath, script] },
  );
  try {
    await worker.connect();
    const started = Date.now();
    expect(await worker.waitConnected(5000)).toBe(false);
    expect(Date.now() - started).toBeLessThan(3000);
    await worker.connect();
    expect(await worker.waitConnected(2000)).toBe(true);
  } finally {
    await worker.close();
  }
});
