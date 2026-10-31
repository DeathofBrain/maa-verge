import { afterEach, describe, expect, setSystemTime, spyOn, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ScreenFrame } from '@contracts/rpc-types';
import { mockPreviewImage } from '../../../tests/fixtures/preview-image';
import { Runtime } from '@backend/app/runtime';
import { CoreWorker } from '@backend/infrastructure/native/worker';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [],
  coreWorkers: CoreWorker[] = [];
const temporary = () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-preview-'));
  roots.push(root);
  return root;
};
const image = () => ({ ...mockPreviewImage, canControl: true });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
class FakeWorker {
  events: any[] = [];
  connected = true;
  safeIdle = true;
  closed = false;
  frameCalls = 0;
  clicks: { x: number; y: number }[] = [];
  submitted: any[] = [];
  frameResult: () => Promise<unknown> = async () => image();
  clickResult: () => Promise<unknown> = async () => ({ accepted: true });
  async frame() {
    this.frameCalls++;
    return this.frameResult();
  }
  async click(x: number, y: number) {
    this.clicks.push({ x, y });
    return this.clickResult();
  }
  async connect() {
    return { asyncId: 1 };
  }
  async task(task: any) {
    this.submitted.push(task);
    this.safeIdle = false;
    return { taskId: this.submitted.length };
  }
  async stop() {
    this.safeIdle = true;
    return { stopping: true };
  }
  async close() {
    this.closed = true;
  }
  async waitConnected() {
    return this.connected && this.safeIdle;
  }
}
async function nativeRuntime() {
  const worker = new FakeWorker();
  const runtime = new Runtime(temporary(), {
    workerFactory: async () => worker,
    adbExecutable: () => 'synthetic-adb',
  });
  runtimes.push(runtime);
  runtime.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource', version: 'r1' },
  });
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  device.state = 'idle';
  runtime.store.put('device', device.id, device);
  await runtime.handle('plan.save', {
    plan: { id: 'preview-plan', name: '预览并发测试', tasks: [{ type: 'Award' }] },
  });
  return { runtime, worker, device };
}
const getFrame = (runtime: Runtime, deviceId: string): Promise<ScreenFrame> =>
  runtime.handle('device.frame', { deviceId });
const clickParams = (frame: ScreenFrame, requestId = 'preview-click') => ({
  deviceId: frame.deviceId,
  frameId: frame.frameId,
  x: 123,
  y: 234,
  requestId,
});

afterEach(async () => {
  setSystemTime();
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const worker of coreWorkers.splice(0)) await worker.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('transient screen frames', () => {
  test('native preview has fresh metadata and a tap never persists image bytes', async () => {
    const { runtime, device } = await nativeRuntime(),
      before = runtime.snapshot();
    const objects = runtime.store.db.query('SELECT * FROM objects ORDER BY rowid').all();
    const frame = await getFrame(runtime, device.id);
    expect(frame).toMatchObject({ ...mockPreviewImage, deviceId: device.id, canControl: true });
    expect(frame.latencyMs).toBeGreaterThanOrEqual(0);
    expect(frame.frameId).toBeTruthy();
    expect(Math.abs(Date.now() - Date.parse(frame.capturedAt))).toBeLessThan(1000);
    expect(runtime.snapshot()).toEqual(before);
    expect(runtime.store.db.query('SELECT * FROM objects ORDER BY rowid').all()).toEqual(objects);
    const params = clickParams(frame);
    expect(await runtime.handle('device.click', params)).toEqual({ accepted: true });
    expect(
      runtime.snapshot().events.filter((event) => event.type === 'device.clicked'),
    ).toHaveLength(1);
    expect(runtime.snapshot().events.at(-1)?.data).toMatchObject(params);
    expect(JSON.stringify(runtime.snapshot())).not.toContain(frame.data);
    const persisted = runtime.store.db
      .query('SELECT value FROM objects UNION ALL SELECT data AS value FROM events')
      .all();
    expect(JSON.stringify(persisted)).not.toContain(frame.data);
    await expect(
      runtime.handle('device.click', { ...params, requestId: 'second-tap' }),
    ).rejects.toMatchObject({ code: -32011 });
  });

  test('core capture duration passes through independently of the service round trip', async () => {
    const { runtime, worker, device } = await nativeRuntime();
    setSystemTime(new Date('2026-11-01T00:00:00.000Z'));
    for (const coreLatencyMs of [0, 7]) {
      const started = Date.now();
      worker.frameResult = async () => {
        setSystemTime(started + 245);
        return { ...image(), coreLatencyMs };
      };
      const frame = await getFrame(runtime, device.id);
      expect(frame.coreLatencyMs).toBe(coreLatencyMs);
      expect(frame.latencyMs).toBe(245);
    }
  });

  test('a frame without a native capture cost keeps that timing absent', async () => {
    const { runtime, worker, device } = await nativeRuntime();
    worker.frameResult = async () => ({ ...image(), coreLatencyMs: 7 });
    expect((await getFrame(runtime, device.id)).coreLatencyMs).toBe(7);
    setSystemTime(new Date('2026-11-01T00:00:00.000Z'));
    const started = Date.now();
    worker.frameResult = async () => {
      setSystemTime(started + 120);
      return image();
    };
    const frame = await getFrame(runtime, device.id);
    expect(frame.latencyMs).toBe(120);
    expect(frame).not.toHaveProperty('coreLatencyMs');
  });

  test('frame and tap parameters reject unknown fields and invalid coordinates', async () => {
    const { runtime, device } = await nativeRuntime(),
      frame = await getFrame(runtime, device.id);
    for (const params of [{}, { deviceId: '' }, { deviceId: frame.deviceId, shell: 'invalid' }]) {
      await expect(runtime.handle('device.frame', params)).rejects.toMatchObject({ code: -32602 });
    }
    for (const params of [
      { ...clickParams(frame), x: -1 },
      { ...clickParams(frame), y: 0.5 },
      { ...clickParams(frame), requestId: '' },
      { ...clickParams(frame), shell: 'invalid' },
    ])
      await expect(runtime.handle('device.click', params)).rejects.toMatchObject({ code: -32602 });
    await expect(
      runtime.handle('device.click', { ...clickParams(frame), x: frame.width }),
    ).rejects.toMatchObject({ code: -32602 });
  });

  test('native concurrent readers share one worker frame without queuing more screenshots', async () => {
    const { runtime, worker, device } = await nativeRuntime(),
      pending = deferred<unknown>();
    worker.frameResult = () => pending.promise;
    const first = getFrame(runtime, device.id),
      second = getFrame(runtime, device.id);
    expect(worker.frameCalls).toBe(1);
    pending.resolve(image());
    const frames = await Promise.all([first, second]);
    expect(frames[0]).toEqual(frames[1]);
    expect(frames[0].canControl).toBe(true);
    expect((await getFrame(runtime, device.id)).frameId).not.toBe(frames[0].frameId);
    expect(worker.frameCalls).toBe(2);
  });

  test('a late response from a replaced worker cannot issue a control token', async () => {
    const { runtime, worker, device } = await nativeRuntime(),
      pending = deferred<unknown>();
    worker.frameResult = () => pending.promise;
    const reading = getFrame(runtime, device.id);
    runtime.workers.set(device.id, new FakeWorker());
    pending.resolve(image());
    await expect(reading).rejects.toMatchObject({
      code: -32040,
      message: '设备连接已更换，请刷新画面',
    });
  });

  test('a frame from the previous worker cannot control its replacement', async () => {
    const { runtime, worker, device } = await nativeRuntime(),
      frame = await getFrame(runtime, device.id);
    const replacement = new FakeWorker();
    runtime.workers.set(device.id, replacement);
    await expect(runtime.handle('device.click', clickParams(frame))).rejects.toMatchObject({
      code: -32011,
    });
    expect(worker.clicks).toHaveLength(0);
    expect(replacement.clicks).toHaveLength(0);
  });

  test('offline devices and a disconnect during capture cannot produce a usable frame', async () => {
    const { runtime, worker, device } = await nativeRuntime(),
      frame = await getFrame(runtime, device.id);
    const pending = deferred<unknown>();
    worker.frameResult = () => pending.promise;
    const reading = getFrame(runtime, device.id);
    worker.connected = false;
    pending.resolve(image());
    await expect(reading).rejects.toMatchObject({ code: -32040 });
    await expect(getFrame(runtime, device.id)).rejects.toMatchObject({ code: -32040 });
    await expect(runtime.handle('device.click', clickParams(frame))).rejects.toMatchObject({
      code: -32040,
    });
    expect(worker.clicks).toHaveLength(0);
  });

  test('old frames expire without waiting for real time', async () => {
    const timestamp = new Date('2026-10-22T00:00:00.000Z');
    setSystemTime(timestamp);
    const { runtime, worker, device } = await nativeRuntime(),
      frame = await getFrame(runtime, device.id);
    setSystemTime(timestamp.getTime() + 2001);
    await expect(runtime.handle('device.click', clickParams(frame))).rejects.toMatchObject({
      code: -32011,
    });
    expect(worker.clicks).toHaveLength(0);
  });

  test('a slow frame response cannot renew the age of its control token', async () => {
    const timestamp = new Date('2026-10-22T00:00:00.000Z');
    setSystemTime(timestamp);
    const { runtime, worker, device } = await nativeRuntime(),
      pending = deferred<unknown>();
    worker.frameResult = () => pending.promise;
    const reading = getFrame(runtime, device.id);
    setSystemTime(timestamp.getTime() + 2001);
    pending.resolve(image());
    const frame = await reading;
    expect(frame.capturedAt).toBe(timestamp.toISOString());
    await expect(runtime.handle('device.click', clickParams(frame))).rejects.toMatchObject({
      code: -32011,
    });
    expect(worker.clicks).toHaveLength(0);
  });

  test('invalid PNGs, dimensions and worker data are rejected before entering the UI', async () => {
    const { runtime, worker, device } = await nativeRuntime();
    const signature = Buffer.from(mockPreviewImage.data, 'base64');
    signature[0] = 0;
    const malformed = [
      { ...image(), data: signature.toString('base64') },
      { ...image(), data: Buffer.from('not a PNG').toString('base64') },
      { ...image(), data: image().data + '\n' },
      { ...image(), width: mockPreviewImage.width - 1 },
      { ...image(), width: 8192, height: 8192 },
      { ...image(), width: 0 },
      { ...image(), mimeType: 'image/jpeg' },
      { ...image(), data: 'A'.repeat(4_183_385) },
    ];
    for (const result of malformed) {
      worker.frameResult = async () => result;
      await expect(getFrame(runtime, device.id)).rejects.toMatchObject({ code: -32040 });
    }
    worker.frameResult = async () => {
      throw new Error('synthetic capture failure');
    };
    await expect(getFrame(runtime, device.id)).rejects.toMatchObject({ code: -32040 });
    expect(worker.clicks).toHaveLength(0);
  });

  test('PNG encoding checks reject noncanonical base64 without accepting decoder aliases', async () => {
    const { runtime, worker, device } = await nativeRuntime();
    const png = Buffer.from(image().data, 'base64'),
      alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (let extra = 0; extra < 3; extra++) {
      const data = Buffer.concat([png, Buffer.alloc(extra)]).toString('base64');
      worker.frameResult = async () => ({ ...image(), data });
      expect((await getFrame(runtime, device.id)).data).toBe(data);
      const malformed = [
        data + '\n',
        data + ' ',
        data.slice(0, 32) + '=' + data.slice(33),
        data + '=',
        data.slice(0, -1),
      ];
      if (data.includes('/')) malformed.push(data.replace('/', '_'));
      if (data.includes('+')) malformed.push(data.replace('+', '-'));
      const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
      if (padding) {
        const index = data.length - padding - 1;
        // The forgiving decoder yields identical bytes despite nonzero unused bits.
        const alias =
          data.slice(0, index) +
          alphabet[alphabet.indexOf(data[index]!) + 1] +
          data.slice(index + 1);
        expect(Buffer.from(alias, 'base64')).toEqual(Buffer.from(data, 'base64'));
        malformed.push(alias, data.slice(0, -padding));
      }
      for (const invalid of malformed) {
        worker.frameResult = async () => ({ ...image(), data: invalid });
        await expect(getFrame(runtime, device.id)).rejects.toMatchObject({ code: -32040 });
      }
    }
    const badHeader = Buffer.from(png);
    badHeader.writeUInt32BE(12, 8);
    worker.frameResult = async () => ({ ...image(), data: badHeader.toString('base64') });
    await expect(getFrame(runtime, device.id)).rejects.toMatchObject({ code: -32040 });
  });

  test('maximum-size preview validates only a fixed-size decoded header', async () => {
    const { runtime, worker, device } = await nativeRuntime();
    const png = Buffer.alloc(3 * 1024 * 1024 - 8192);
    Buffer.from(image().data, 'base64').copy(png);
    const data = png.toString('base64');
    worker.frameResult = async () => ({ ...image(), data });
    const decode = spyOn(Buffer, 'from');
    try {
      for (let index = 0; index < 24; index++)
        expect((await getFrame(runtime, device.id)).data).toBe(data);
      const inputs = (decode.mock.calls as unknown[][])
        .filter((args) => args[1] === 'base64')
        .map((args) => args[0]);
      expect(inputs).toHaveLength(24);
      expect(inputs.every((value) => typeof value === 'string' && value.length === 32)).toBe(true);
    } finally {
      decode.mockRestore();
    }
    const oversized = Buffer.concat([png, Buffer.alloc(1)]).toString('base64');
    // The next byte fits the same base64 string length but exceeds the PNG cap.
    expect(oversized.length).toBe(data.length);
    worker.frameResult = async () => ({ ...image(), data: oversized });
    await expect(getFrame(runtime, device.id)).rejects.toMatchObject({ code: -32040 });
  });
});

describe('screen input ownership and acknowledgements', () => {
  test('concurrent and completed duplicates send only one native tap', async () => {
    const { runtime, worker, device } = await nativeRuntime(),
      frame = await getFrame(runtime, device.id);
    const entered = deferred<void>(),
      acknowledgement = deferred<unknown>();
    worker.clickResult = () => {
      entered.resolve();
      return acknowledgement.promise;
    };
    const params = clickParams(frame),
      first = runtime.handle('device.click', params);
    await entered.promise;
    const second = runtime.handle('device.click', params);
    expect(worker.clicks).toEqual([{ x: params.x, y: params.y }]);
    acknowledgement.resolve({ accepted: true });
    expect(await first).toEqual({ accepted: true });
    expect(await second).toEqual({ accepted: true });
    expect(await runtime.handle('device.click', params)).toEqual({ accepted: true });
    expect(worker.clicks).toHaveLength(1);
    expect(
      runtime.snapshot().events.filter((event) => event.type === 'device.clicked'),
    ).toHaveLength(1);
    await expect(
      runtime.handle('device.click', { ...params, x: params.x + 1 }),
    ).rejects.toMatchObject({ code: -32011 });
  });

  test('a lost acknowledgement is cached and never replays the non-idempotent tap', async () => {
    const { runtime, worker, device } = await nativeRuntime(),
      frame = await getFrame(runtime, device.id);
    const entered = deferred<void>(),
      acknowledgement = deferred<unknown>();
    worker.clickResult = () => {
      entered.resolve();
      return acknowledgement.promise;
    };
    const params = clickParams(frame);
    const first = runtime.handle('device.click', params);
    await entered.promise;
    const second = runtime.handle('device.click', params);
    // Bun matchers may await their promise before returning. Register ordinary
    // rejection handlers first so the deferred failure can be released below.
    const outcomes = Promise.allSettled([first, second]);
    acknowledgement.reject(new Error('synthetic acknowledgement lost'));
    for (const outcome of await outcomes) {
      expect(outcome.status).toBe('rejected');
      if (outcome.status === 'rejected') expect(outcome.reason).toMatchObject({ code: -32040 });
    }
    await expect(runtime.handle('device.click', params)).rejects.toMatchObject({ code: -32040 });
    await expect(
      runtime.handle('device.click', { ...params, y: params.y + 1 }),
    ).rejects.toMatchObject({ code: -32011 });
    expect(worker.clicks).toHaveLength(1);
    expect(
      runtime.snapshot().events.filter((event) => event.type === 'device.clicked'),
    ).toHaveLength(0);
  });

  test('a response without accepted=true cannot claim that input succeeded', async () => {
    const { runtime, worker, device } = await nativeRuntime(),
      frame = await getFrame(runtime, device.id);
    worker.clickResult = async () => ({ asyncId: 7 });
    const params = clickParams(frame);
    await expect(runtime.handle('device.click', params)).rejects.toMatchObject({ code: -32040 });
    await expect(runtime.handle('device.click', params)).rejects.toMatchObject({ code: -32040 });
    expect(worker.clicks).toHaveLength(1);
    expect(
      runtime.snapshot().events.filter((event) => event.type === 'device.clicked'),
    ).toHaveLength(0);
  });

  test('input waits for the current screenshot and blocks further refreshes', async () => {
    const { runtime, worker, device } = await nativeRuntime(),
      frame = await getFrame(runtime, device.id);
    const pending = deferred<unknown>();
    worker.frameResult = () => pending.promise;
    const reading = getFrame(runtime, device.id),
      clicking = runtime.handle('device.click', clickParams(frame));
    expect(worker.clicks).toHaveLength(0);
    await expect(getFrame(runtime, device.id)).rejects.toMatchObject({ code: -32011 });
    expect(worker.frameCalls).toBe(2);
    pending.resolve(image());
    expect((await reading).canControl).toBe(false);
    expect(await clicking).toEqual({ accepted: true });
    expect(worker.clicks).toHaveLength(1);
  });

  test('an in-flight tap excludes starting a run, disconnecting and core replacement', async () => {
    const { runtime, worker, device } = await nativeRuntime(),
      frame = await getFrame(runtime, device.id);
    const entered = deferred<void>(),
      acknowledgement = deferred<unknown>();
    worker.clickResult = () => {
      entered.resolve();
      return acknowledgement.promise;
    };
    const clicking = runtime.handle('device.click', clickParams(frame));
    await entered.promise;
    try {
      expect(runtime.busy()).toBe(true);
      await expect(
        runtime.handle('run.start', {
          requestId: 'run-during-click',
          planId: 'preview-plan',
          deviceId: device.id,
        }),
      ).rejects.toMatchObject({ code: -32011 });
      await expect(runtime.handle('device.disconnect', { id: device.id })).rejects.toMatchObject({
        code: -32011,
      });
      await expect(runtime.beforeSwitch()).rejects.toThrow('核心或异步操作仍在运行');
      await expect(
        runtime.handle('device.click', { ...clickParams(frame), requestId: 'concurrent-tap' }),
      ).rejects.toMatchObject({ code: -32011 });
      expect(worker.closed).toBe(false);
      expect(worker.submitted).toHaveLength(0);
    } finally {
      acknowledgement.resolve({ accepted: true });
      await clicking;
    }
    expect(runtime.busy()).toBe(false);
  });

  test('a frame cannot be used to click another device', async () => {
    const { runtime, worker, device } = await nativeRuntime(),
      frame = await getFrame(runtime, device.id);
    const other = new FakeWorker();
    runtime.workers.set('other-device', other);
    runtime.store.put('device', 'other-device', {
      ...device,
      id: 'other-device',
      address: '127.0.0.1:5557',
    });
    await expect(
      runtime.handle('device.click', { ...clickParams(frame), deviceId: 'other-device' }),
    ).rejects.toMatchObject({ code: -32011 });
    expect(worker.clicks).toHaveLength(0);
    expect(other.clicks).toHaveLength(0);
  });

  test('an active plan makes returned frames read-only and excludes manual input', async () => {
    const { runtime, worker, device } = await nativeRuntime(),
      previous = await getFrame(runtime, device.id);
    await runtime.handle('run.start', {
      requestId: 'preview-run',
      planId: 'preview-plan',
      deviceId: device.id,
    });
    const current = await getFrame(runtime, device.id);
    expect(current.canControl).toBe(false);
    await expect(
      runtime.handle('device.click', clickParams(previous, 'old-before-run')),
    ).rejects.toMatchObject({ code: -32011 });
    await expect(
      runtime.handle('device.click', clickParams(current, 'during-run')),
    ).rejects.toMatchObject({ code: -32011 });
    expect(worker.clicks).toHaveLength(0);
    expect(worker.submitted).toHaveLength(1);
  });

  test('a late frame after shutdown fails before reading the closed business database', async () => {
    const { runtime, worker, device } = await nativeRuntime(),
      pending = deferred<unknown>();
    worker.frameResult = () => pending.promise;
    const reading = getFrame(runtime, device.id);
    await runtime.close();
    const all = spyOn(runtime.store, 'all'),
      get = spyOn(runtime.store, 'get');
    try {
      pending.resolve(image());
      await expect(reading).rejects.toMatchObject({
        code: -32011,
        message: '正在退出或切换核心，请稍后重试',
      });
      expect(all).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    } finally {
      all.mockRestore();
      get.mockRestore();
    }
  });
});

const nativeWorker = process.env.MAAVERGE_TEST_NATIVE_WORKER,
  coreLibrary = process.env.MAAVERGE_TEST_CORE_LIBRARY;
test.skipIf(!nativeWorker || !coreLibrary || !existsSync(nativeWorker) || !existsSync(coreLibrary))(
  'synthetic C++ worker carries frame and click through the real NDJSON bridge',
  async () => {
    const root = temporary(),
      resource = path.join(root, 'resources');
    mkdirSync(path.join(resource, 'resource'), { recursive: true });
    writeFileSync(path.join(resource, 'resource/version.json'), '{}');
    // The supplied test library implements C API callbacks only. This fake ADB
    // executable and the private lock never connect to a simulator or account.
    const worker = await CoreWorker.start(
      {
        core: path.dirname(coreLibrary!),
        resource,
        adb: 'synthetic-adb',
        address: 'synthetic://no-device',
        userDir: path.join(root, 'worker'),
        lockPath: path.join(root, 'device.lock'),
      },
      { command: [nativeWorker!, '--worker'] },
    );
    coreWorkers.push(worker);
    await worker.connect();
    expect(await worker.waitConnected(2000)).toBe(true);
    const frame = await worker.frame();
    expect(frame).toMatchObject({ width: 2, height: 2, mimeType: 'image/png', canControl: true });
    expect(Buffer.from(frame.data, 'base64').subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(await worker.click(1, 1)).toEqual({ accepted: true });
  },
);
