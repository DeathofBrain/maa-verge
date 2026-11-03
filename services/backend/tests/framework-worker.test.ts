import { expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  createCapabilityRegistry,
  createCompositeCapabilities,
  createPrimitiveCapabilities,
  type AtomicExecutionPort,
  type CapabilityRegistration,
  type PipelineDefinitions,
} from '@maaverge/automation';
import {
  FrameworkWorker,
  validateFrameworkResources,
  type FrameworkConfiguration,
} from '@backend/infrastructure/native/framework-worker';
import { NativeWorkerTransport } from '@backend/infrastructure/native/worker';
import { Preview } from '@backend/modules/devices/preview';
import { mockPreviewImage } from '../../../tests/fixtures/preview-image';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const repository = path.resolve(import.meta.dir, '../../..');
const workerName =
  process.platform === 'win32' ? 'maaverge-native-worker.exe' : 'maaverge-native-worker';
const libraryName =
  process.platform === 'win32'
    ? 'MaaFramework.dll'
    : process.platform === 'darwin'
      ? 'libMaaFramework.dylib'
      : 'libMaaFramework.so';
const workerPath =
  process.env.MAAVERGE_TEST_NATIVE_WORKER ??
  [
    path.join(repository, 'build/native/Release', workerName),
    path.join(repository, 'build/native', workerName),
  ].find(existsSync);
const fixtureLibrary =
  process.env.MAAVERGE_TEST_FRAMEWORK_LIBRARY ??
  (workerPath
    ? [path.dirname(workerPath), path.dirname(path.dirname(workerPath))]
        .flatMap((directory) => [
          path.join(directory, 'fixtures/framework-normal/Release', libraryName),
          path.join(directory, 'fixtures/framework-normal', libraryName),
        ])
        .find(existsSync)
    : undefined);
const required = Boolean(process.env.MAAVERGE_TEST_NATIVE_WORKER);
const missing =
  !workerPath || !existsSync(workerPath) || !fixtureLibrary || !existsSync(fixtureLibrary);
const accepted = { accepted: true, nativeSuccess: true } as const;
const customPipeline = {
  Begin: { action: 'DoNothing', next: ['Policy'] },
  Policy: {
    action: 'Custom',
    custom_action: 'MaaVerge.Custom',
    custom_action_param: { handler: 'verify' },
    next: ['End'],
  },
  End: { action: 'DoNothing' },
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

/** 创建有效的纯色 PNG；仅用于验证原生缩放与坐标边界，不含游戏或账号图像。 */
function syntheticImage(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const contents = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of contents) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const output = Buffer.alloc(data.length + 12);
    output.writeUInt32BE(data.length);
    contents.copy(output, 4);
    output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
    return output;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc(height * (width * 3 + 1)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { width, height, data: bytes.toString('base64') };
}

/** Only CTest's synthetic ABI library is loaded. No SDK, ADB or account is used. */
async function withFixture(
  work: (fixture: {
    config: FrameworkConfiguration;
    lockPath: string;
    image: { data: string; width: number; height: number };
    trace: () => string[];
    workers: (FrameworkWorker | NativeWorkerTransport)[];
  }) => Promise<void>,
  fixtureImage: { data: string; width: number; height: number } = mockPreviewImage,
) {
  if (missing)
    throw new Error(
      'Native runtime tests require the framework-normal CTest fixture next to MAAVERGE_TEST_NATIVE_WORKER.',
    );
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-framework-bridge-'));
  const framework = path.join(root, '合成 SDK');
  const resource = path.join(root, '合成资源');
  const lockPath = path.join(root, 'device.lock');
  const imagePath = path.join(root, 'synthetic.png');
  const tracePath = path.join(root, 'trace.txt');
  const workers: (FrameworkWorker | NativeWorkerTransport)[] = [];
  const environment = {
    MAAVERGE_NATIVE_WORKER_PATH: workerPath!,
    MAAVERGE_FRAMEWORK_CASE: '',
    MAAVERGE_FRAMEWORK_IMAGE: imagePath,
    MAAVERGE_FRAMEWORK_TRACE: tracePath,
  };
  const saved = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  try {
    mkdirSync(path.join(framework, 'bin'), { recursive: true });
    mkdirSync(path.join(framework, 'share/MaaAgentBinary'), { recursive: true });
    mkdirSync(path.join(resource, 'image'), { recursive: true });
    mkdirSync(path.join(resource, 'model/ocr'), { recursive: true });
    copyFileSync(fixtureLibrary!, path.join(framework, 'bin', libraryName));
    for (const name of ['det.onnx', 'rec.onnx', 'keys.txt'])
      writeFileSync(path.join(resource, 'model/ocr', name), 'synthetic-only');
    writeFileSync(imagePath, Buffer.from(fixtureImage.data, 'base64'));
    writeFileSync(
      path.join(resource, 'image/template.png'),
      Buffer.from(mockPreviewImage.data, 'base64'),
    );
    Object.assign(process.env, environment);
    await work({
      config: { framework, resource, userDir: path.join(root, 'worker'), mode: 'recognition' },
      lockPath,
      image: {
        data: fixtureImage.data,
        width: fixtureImage.width,
        height: fixtureImage.height,
      },
      trace: () =>
        existsSync(tracePath) ? readFileSync(tracePath, 'utf8').trim().split(/\r?\n/u) : [],
      workers,
    });
  } finally {
    try {
      await Promise.all(workers.map((worker) => worker.close()));
    } finally {
      for (const [key, value] of Object.entries(saved))
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      rmSync(root, { recursive: true, force: true });
    }
  }
}

test.skipIf(!required && missing)(
  'the real NDJSON MaaFW bridge recognizes and validates without a Controller or device lease',
  () =>
    withFixture(async ({ config, lockPath, image, trace, workers }) => {
      const worker = await FrameworkWorker.start(config);
      workers.push(worker);
      expect(worker.connected).toBe(false);
      expect(worker.safeIdle).toBe(true);
      expect(
        await worker.request('recognize', { kind: 'ocr', image, roi: [0, 0, 200, 100] }),
      ).toEqual({
        engine: 'maafw',
        hit: true,
        matches: [{ text: 'MAA', box: [10, 20, 80, 30], score: 0.95 }],
      });
      expect(
        await worker.request('recognize', { kind: 'template', image, template: 'template.png' }),
      ).toEqual({
        engine: 'maafw',
        hit: true,
        matches: [{ box: [10, 20, 80, 30], score: 0.95 }],
      });
      await worker.close();
      expect(
        await validateFrameworkResources({
          ...config,
          userDir: path.join(config.userDir, 'probe'),
        }),
      ).toEqual({ ocrAvailable: true });
      expect(existsSync(lockPath)).toBe(false);
      expect(trace().some((line) => line.startsWith('controller-'))).toBe(false);
      expect(readFileSync(path.join(config.userDir, 'worker.stderr.log'), 'utf8')).toContain(
        'synthetic framework stdout: loaded',
      );
      expect(readFileSync(path.join(config.userDir, 'worker.stderr.log'), 'utf8')).toContain(
        'synthetic framework stdout: destroyed',
      );
    }),
);

test.skipIf(!required && missing)(
  'Pipeline Custom preserves preview frame gates, blocks outside calls and expires callback context',
  () =>
    withFixture(async ({ config, lockPath, trace, workers }) => {
      const worker = await FrameworkWorker.start({
        ...config,
        mode: 'control',
        adb: 'synthetic-never-executed',
        address: 'synthetic://pipeline',
        lockPath,
      });
      workers.push(worker);
      await worker.connect();
      const preview = new Preview({
        available: () => true,
        device: () => ({ state: 'idle' }),
        worker: () => worker,
        hasRun: () => false,
        clicked: () => {},
        context: () => ({ engine: 'maafw' }),
      });
      const entered = deferred(),
        resume = deferred(),
        releaseLate = deferred();
      let late: Promise<unknown> | undefined;
      const calls: string[] = [];
      const running = worker.runPipeline('Begin', customPipeline, async (node, params) => {
        calls.push(node);
        expect(params).toEqual({ handler: 'verify' });
        expect(worker.safeIdle).toBe(true);
        entered.resolve();
        await resume.promise;
        const frame = await preview.frame({ deviceId: 'synthetic-device' });
        expect(frame.canControl).toBe(true);
        expect(
          await preview.click({
            deviceId: frame.deviceId,
            frameId: frame.frameId,
            x: 100,
            y: 100,
            requestId: 'pipeline-custom-click',
          }),
        ).toEqual(accepted);
        // Retained asynchronous work must lose the native Context when its node returns.
        late = releaseLate.promise.then(() => worker.frame());
        void late.catch(() => {});
      });
      await entered.promise;
      expect(worker.safeIdle).toBe(false);
      await expect(worker.frame()).rejects.toThrow('Pipeline 正在执行');
      expect(worker.connected).toBe(true);
      await expect(
        NativeWorkerTransport.start(
          { lockPath, lockTimeoutMs: 20 },
          { command: [workerPath!, '--lease-only'] },
        ),
      ).rejects.toThrow();
      resume.resolve();
      await running;
      expect(calls).toEqual(['Policy']);
      expect(worker.safeIdle).toBe(true);
      releaseLate.resolve();
      await expect(late).rejects.toThrow('Custom 上下文已结束');
      expect(trace().filter((line) => line.startsWith('context-action:Click:'))).toHaveLength(1);
    }),
);

test.skipIf(!required && missing)(
  'native recognition preserves generic reference canvases and rejects mismatched frame proportions',
  () =>
    withFixture(async ({ config, workers, trace }) => {
      const worker = await FrameworkWorker.start(config);
      workers.push(worker);
      const request = {
        kind: 'ocr',
        image: syntheticImage(800, 600),
        referenceSize: [640, 480],
        roi: [0, 0, 200, 100],
      };
      expect(await worker.request('recognize', request)).toMatchObject({
        coordinateSize: [640, 480],
        hit: true,
        matches: [{ text: 'MAA', box: [10, 20, 80, 30], score: 0.95 }],
      });
      expect(trace()).toContain('image-resize:640:480');
      await expect(
        worker.request('recognize', { ...request, image: syntheticImage(1280, 720) }),
      ).rejects.toThrow('preserve the source frame aspect ratio');
      expect(trace().filter((line) => line.startsWith('recognition:OCR:'))).toHaveLength(1);
    }),
);

/** 只读嵌套保留显式帧；真正输入及标准原生节点改变输入代际。 */
test.skipIf(!required && missing)(
  'Context Pipeline composes frame recognition and click across nested Custom callbacks',
  () =>
    withFixture(async ({ config, lockPath, workers, trace }) => {
      const worker = await FrameworkWorker.start({
        ...config,
        mode: 'control',
        adb: 'synthetic-never-executed',
        address: 'synthetic://nested',
        lockPath,
      });
      workers.push(worker);
      await worker.connect();
      const preview = new Preview({
        available: () => true,
        device: () => ({ state: 'idle' }),
        worker: () => worker,
        hasRun: () => false,
        clicked: () => {},
        context: () => ({ engine: 'maafw' }),
      });
      const graph = (name: string) => ({
        [name]: {
          action: 'Custom',
          custom_action: 'MaaVerge.Custom',
          custom_action_param: { handler: name },
        },
      });
      let epoch = 0;
      const epochs: number[] = [];
      const observe = (value: number) => {
        epochs.push(value);
        if (value > epoch) preview.invalidate('device');
        epoch = value;
      };
      let late: Promise<unknown> | undefined;
      const releaseLate = deferred();
      await worker.runPipeline(
        'Root',
        graph('Root'),
        async () => {
          await worker.runContextPipeline('L2', graph('L2'), async () => {
            let frame!: Awaited<ReturnType<Preview['frame']>>;
            await worker.runContextPipeline(
              'Frame',
              graph('Frame'),
              async (_node, _params, metadata) => {
                expect(metadata.inputEpoch).toBe(0);
                expect(worker.safeIdle).toBe(true);
                frame = await preview.frame({ deviceId: 'device' });
                expect(frame.canControl).toBe(true);
                late = releaseLate.promise.then(() => worker.frame());
                void late.catch(() => {});
              },
            );
            await worker.runContextPipeline('Recognize', graph('Recognize'), async () => {
              expect(preview.reference('device', frame.frameId).frameId).toBe(frame.frameId);
              const result = await worker.request('recognize', {
                kind: 'ocr',
                image: {
                  data: frame.data,
                  width: frame.width,
                  height: frame.height,
                },
              });
              expect(result.hit).toBe(true);
            });
            await worker.runContextPipeline('Click', graph('Click'), async () => {
              expect(
                await preview.click({
                  deviceId: 'device',
                  frameId: frame.frameId,
                  x: 10,
                  y: 20,
                  requestId: 'nested-click',
                }),
              ).toEqual(accepted);
            });
            expect(() => preview.reference('device', frame.frameId)).toThrow('画面已失效');
          });
          const beforeStandard = await preview.frame({ deviceId: 'device' });
          await worker.runContextPipeline(
            'Back',
            { Back: { action: 'ClickKey', key: 4 } },
            async () => {},
          );
          expect(epoch).toBe(1);
          expect(() => preview.reference('device', beforeStandard.frameId)).toThrow('画面已失效');
        },
        undefined,
        observe,
      );
      releaseLate.resolve();
      await expect(late).rejects.toThrow('Custom 上下文已结束');
      expect(epochs).toContain(1);
      expect(trace().filter((line) => line.startsWith('pipeline:'))).toHaveLength(1);
      expect(trace().filter((line) => line.startsWith('context-pipeline:'))).toHaveLength(5);
      await expect(
        worker.runContextPipeline('Outside', graph('Outside'), async () => {}),
      ).rejects.toThrow('当前有效 Custom');
    }),
);

test.skipIf(!required && missing)(
  'Context Pipeline failure preserves its original error and bounds recursive depth',
  () =>
    withFixture(async ({ config, lockPath, workers }) => {
      const worker = await FrameworkWorker.start({
        ...config,
        mode: 'control',
        adb: 'synthetic-never-executed',
        address: 'synthetic://nested-failure',
        lockPath,
      });
      workers.push(worker);
      await worker.connect();
      const failure = new Error('子流程名单证据不足');
      await expect(
        worker.runPipeline('Begin', customPipeline, async () => {
          // 即使维护者捕获了子错误，也不能将父动作回执为成功。
          try {
            await worker.runContextPipeline('Begin', customPipeline, async () => {
              throw failure;
            });
          } catch (error) {
            expect(error).toBe(failure);
          }
          expect(await worker.frame()).toHaveProperty('width');
          await expect(worker.click(10, 20)).rejects.toThrow('禁止后续输入');
          expect(worker.connected).toBe(true);
        }),
      ).rejects.toBe(failure);
      expect(worker.connected).toBe(true);
      let depth = 1;
      const descend = async (): Promise<void> => {
        depth++;
        await worker.runContextPipeline('Begin', customPipeline, descend);
      };
      await expect(worker.runPipeline('Begin', customPipeline, descend)).rejects.toThrow(
        '超过 8 层',
      );
      expect(depth).toBe(9);
      expect(worker.safeIdle).toBe(true);
    }),
);

/** 使用产品登记器、JSON Pointer 和 L2/L1 wrapper，只有 SDK 与设备画面来自隔离夹具。 */
test.skipIf(!required && missing)(
  'registered L3 events compose repeated L2 and L1 Pipelines through the real native Context bridge',
  () =>
    withFixture(
      async ({ config, lockPath, workers, trace }) => {
        const worker = await FrameworkWorker.start({
          ...config,
          mode: 'control',
          adb: 'synthetic-never-executed',
          address: 'synthetic://registered-pipeline',
          lockPath,
        });
        workers.push(worker);
        await worker.connect();
        const preview = new Preview({
          available: () => true,
          device: () => ({ state: 'idle' }),
          worker: () => worker,
          hasRun: () => false,
          clicked: () => {},
          context: () => ({ engine: 'maafw' }),
        });
        const operations: string[] = [];
        const frameIds: string[] = [];
        let request = 0;
        let epoch = 0;
        const observe = (value: number) => {
          if (value > epoch) preview.invalidate('registered-device');
          epoch = value;
        };
        const port: AtomicExecutionPort = {
          // 输入继续经过产品 Preview 的帧身份及消费门禁，绝不绕过到裸原生点击。
          async execute(operation, input) {
            operations.push(operation);
            if (operation === 'frame') {
              const frame = await preview.frame({ deviceId: 'registered-device' });
              frameIds.push(frame.frameId);
              return frame;
            }
            if (operation === 'recognize') {
              const { frameId, ...params } = input;
              const frame = preview.reference('registered-device', frameId as string);
              const result = await worker.request('recognize', {
                ...params,
                image: { data: frame.data, width: frame.width, height: frame.height },
              });
              expect(result.coordinateSize).toEqual([640, 480]);
              return result;
            }
            if (operation === 'click')
              return preview.click({
                deviceId: 'registered-device',
                frameId: input.frameId as string,
                x: input.x as number,
                y: input.y as number,
                requestId: `registered-click-${++request}`,
              });
            throw new Error(`Unexpected fixture operation: ${operation}`);
          },
          runPipeline: (entry, graph, custom, context) =>
            worker.runPipeline(entry, graph, custom, context.signal, observe),
          runContextPipeline: (entry, graph, custom, context) =>
            worker.runContextPipeline(entry, graph, custom, context.signal, observe),
        };
        const node = (params: Record<string, unknown>, next: string[] = []) => ({
          recognition: 'DirectHit',
          action: 'Custom',
          custom_action: 'MaaVerge.Custom',
          custom_action_param: params,
          max_hit: 1,
          pre_delay: 0,
          post_delay: 0,
          rate_limit: 0,
          next,
        });
        const definitions: PipelineDefinitions = {
          'Event@First': node(
            {
              handler: 'call',
              primitive: 'composite.click_rule',
              input: { rule: { $ref: '#/input/route/confirm~1name' } },
              saveAs: 'first',
            },
            ['Event@Second'],
          ),
          'Event@Second': node(
            {
              handler: 'call',
              primitive: 'composite.click_rule',
              input: { rule: { $ref: '#/input/route/confirm~1name' } },
              saveAs: 'second',
            },
            ['Event@Return'],
          ),
          'Event@Return': node({
            handler: 'return',
            value: {
              status: 'completed',
              verified: false,
              nativeSuccess: true,
              data: {
                first: { $ref: '#/steps/first/data/clicked' },
                second: { $ref: '#/steps/second/data/clicked' },
              },
            },
          }),
        };
        const event: CapabilityRegistration = {
          descriptor: {
            id: 'game.fixture.confirm',
            label: '合成确认事件',
            description: '隔离桥接夹具：L3 JSON 重复组合产品 L2/L1。',
            layer: 'game',
            primitiveLevel: 3,
            effect: 'input',
            inputSchema: {},
            resultSchema: {},
            available: true,
          },
          validate: () => true,
          pipeline: { entry: 'Event@First', definitions },
          handler: async () => {
            throw new Error('The L3 fixture must execute its JSON, not a replacement handler.');
          },
        };
        const registrations = [
          ...createPrimitiveCapabilities(port),
          ...createCompositeCapabilities(
            port,
            {
              fixture: {
                options: { referenceSize: [640, 480], settleMs: 0 },
                profile: {
                  rules: {
                    confirm: {
                      id: 'confirm',
                      kind: 'ocr',
                      roi: [0, 0, 200, 100],
                      expected: ['^MAA$'],
                      source: { repository: 'synthetic', ref: 'fixture', path: 'confirm' },
                    },
                  },
                  actions: {},
                },
              },
            },
            'fixture',
          ),
          event,
        ];
        const registry = createCapabilityRegistry(registrations, { port });
        const progress: string[] = [];
        const result = await registry.execute(
          'game.fixture.confirm',
          { route: { 'confirm/name': 'confirm' } },
          { onProgress: ({ message }) => progress.push(message) },
        );
        expect(result).toEqual({
          status: 'completed',
          verified: false,
          nativeSuccess: true,
          data: { first: true, second: true },
        });
        expect(operations).toEqual(['frame', 'recognize', 'click', 'frame', 'recognize', 'click']);
        expect(frameIds).toHaveLength(2);
        expect(frameIds[0]).not.toBe(frameIds[1]);
        for (const frameId of frameIds)
          expect(() => preview.reference('registered-device', frameId)).toThrow('画面已失效');
        expect(progress).toContain('执行流程节点：Event@First');
        expect(
          progress.filter((message) => message === '执行流程节点：Composite@click_rule'),
        ).toHaveLength(2);
        expect(
          progress.filter((message) => message === '执行流程节点：Primitive@recognize'),
        ).toHaveLength(2);
        expect(trace().filter((line) => line.startsWith('pipeline:'))).toHaveLength(1);
        expect(trace().filter((line) => line.startsWith('context-pipeline:'))).toHaveLength(8);
        expect(trace().filter((line) => line.startsWith('context-action:Click:'))).toHaveLength(2);
        expect(
          trace().filter((line) => line === 'context-action:Click:{"target":[100,70]}'),
        ).toHaveLength(2);
        expect(trace().filter((line) => line === 'image-resize:640:480')).toHaveLength(2);
        expect(worker.safeIdle).toBe(true);

        // 模拟正式宿主的根图前后清帧：外部引用失效，current 必须在新根 Context 内捕获。
        const boundedPort: AtomicExecutionPort = {
          ...port,
          async runPipeline(...args) {
            preview.invalidate('registered-device');
            try {
              await port.runPipeline(...args);
            } finally {
              preview.invalidate('registered-device');
            }
          },
        };
        const referenceEvent: CapabilityRegistration = {
          ...event,
          descriptor: { ...event.descriptor, id: 'game.fixture.frame_reference' },
          pipeline: {
            entry: 'Reference@Read',
            definitions: {
              'Reference@Read': node(
                { handler: 'call', primitive: 'operation.frame', input: {}, saveAs: 'read' },
                ['Reference@Click'],
              ),
              'Reference@Click': node(
                {
                  handler: 'call',
                  primitive: 'composite.click_box',
                  input: {
                    frame: {
                      frameId: { $ref: '#/steps/read/data/frameId' },
                      width: { $ref: '#/steps/read/data/width' },
                      height: { $ref: '#/steps/read/data/height' },
                    },
                    box: [50, 60, 100, 40],
                  },
                  saveAs: 'click',
                },
                ['Reference@Return'],
              ),
              'Reference@Return': node({ handler: 'return', value: { $ref: '#/steps/click' } }),
            },
          },
        };
        const bounded = createCapabilityRegistry([...registrations, referenceEvent], {
          port: boundedPort,
        });
        const outside = (await bounded.execute('operation.frame', {})).data as {
          frameId: string;
          width: number;
          height: number;
        };
        const stale = await bounded.execute('composite.click_box', {
          frame: { frameId: outside.frameId, width: outside.width, height: outside.height },
          box: [50, 60, 100, 40],
        });
        expect(stale.status).toBe('unknown');
        expect(JSON.stringify(stale)).toContain('画面已失效');
        expect(trace().filter((line) => line.startsWith('context-action:Click:'))).toHaveLength(2);
        expect(
          await bounded.execute('composite.click_box', {
            frame: 'current',
            box: [50, 60, 100, 40],
          }),
        ).toMatchObject({ status: 'completed', nativeSuccess: true, verified: false });
        expect(await bounded.execute(referenceEvent.descriptor.id, {})).toMatchObject({
          status: 'completed',
          nativeSuccess: true,
          verified: false,
        });
        expect(trace().filter((line) => line.startsWith('pipeline:'))).toHaveLength(4);
        expect(trace().filter((line) => line.startsWith('context-action:Click:'))).toHaveLength(4);
        expect(
          trace().filter((line) => line === 'context-action:Click:{"target":[200,160]}'),
        ).toHaveLength(2);
        expect(worker.safeIdle).toBe(true);
      },
      syntheticImage(1280, 960),
    ),
);

test.skipIf(!required && missing)(
  'Pipeline propagates the original Custom failure and does not replay its action',
  () =>
    withFixture(async ({ config, lockPath, workers }) => {
      const worker = await FrameworkWorker.start({
        ...config,
        mode: 'control',
        adb: 'synthetic-never-executed',
        address: 'synthetic://pipeline-failure',
        lockPath,
      });
      workers.push(worker);
      await worker.connect();
      const failure = new Error('名单证据不足');
      let attempts = 0;
      await expect(
        worker.runPipeline('Begin', customPipeline, async () => {
          attempts++;
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(attempts).toBe(1);
      expect(worker.connected).toBe(true);
      expect(worker.safeIdle).toBe(true);
      await worker.runPipeline('Begin', customPipeline, async () => {
        attempts++;
      });
      expect(attempts).toBe(2);
    }),
);

test.skipIf(!required && missing)(
  'Pipeline cancellation stops a waiting Custom and releases the shared lease on close',
  () =>
    withFixture(async ({ config, lockPath, workers }) => {
      const worker = await FrameworkWorker.start({
        ...config,
        mode: 'control',
        adb: 'synthetic-never-executed',
        address: 'synthetic://pipeline-cancel',
        lockPath,
      });
      workers.push(worker);
      await worker.connect();
      const entered = deferred();
      const abort = new AbortController();
      const running = worker.runPipeline(
        'Begin',
        customPipeline,
        async () => {
          entered.resolve();
          await new Promise<void>((_, reject) => {
            abort.signal.addEventListener('abort', () => reject(abort.signal.reason), {
              once: true,
            });
          });
        },
        abort.signal,
      );
      const settled = running.then(
        () => null,
        (error: unknown) => error,
      );
      await entered.promise;
      abort.abort(new Error('取消合成流程'));
      expect(await settled).toMatchObject({ message: '取消合成流程' });
      await worker.close();
      const released = await NativeWorkerTransport.start(
        { lockPath, lockTimeoutMs: 20 },
        { command: [workerPath!, '--lease-only'] },
      );
      workers.push(released);
    }),
);

test.skipIf(!required && missing)(
  'the real NDJSON MaaFW control bridge holds the shared lease through frame, click and shutdown',
  () =>
    withFixture(async ({ config, lockPath, image, trace, workers }) => {
      const worker = await FrameworkWorker.start({
        ...config,
        mode: 'control',
        adb: 'synthetic-never-executed',
        address: 'synthetic://no-device',
        lockPath,
      });
      workers.push(worker);
      expect(worker.connected).toBe(false);
      expect(await worker.connect()).toEqual(accepted);
      expect(worker.connected).toBe(true);
      await expect(
        NativeWorkerTransport.start(
          { lockPath, lockTimeoutMs: 20 },
          { command: [workerPath!, '--lease-only'] },
        ),
      ).rejects.toThrow();
      expect(await worker.frame()).toMatchObject({
        ...image,
        mimeType: 'image/png',
        canControl: true,
      });
      expect(await worker.click(123, 234)).toEqual(accepted);
      expect(worker.safeIdle).toBe(true);
      await worker.close();
      expect(worker.connected).toBe(false);
      expect(existsSync(lockPath)).toBe(true);
      expect(trace()).toContain('controller-destroy');
      const released = await NativeWorkerTransport.start(
        { lockPath, lockTimeoutMs: 20 },
        { command: [workerPath!, '--lease-only'] },
      );
      workers.push(released);
      await released.close();
    }),
);
