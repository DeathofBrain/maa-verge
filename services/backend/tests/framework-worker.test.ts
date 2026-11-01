import { expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  FrameworkWorker,
  validateFrameworkResources,
  type FrameworkConfiguration,
} from '@backend/infrastructure/native/framework-worker';
import { CoreWorker } from '@backend/infrastructure/native/worker';
import { mockPreviewImage } from '../../../tests/fixtures/preview-image';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const repository = path.resolve(import.meta.dir, '../../..');
const workerName =
  process.platform === 'win32' ? 'maaverge-core-worker.exe' : 'maaverge-core-worker';
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
const accepted = { accepted: true, nativeSuccess: true };

/** Only CTest's synthetic ABI library is loaded. No SDK, ADB or account is used. */
async function withFixture(
  work: (fixture: {
    config: FrameworkConfiguration;
    lockPath: string;
    image: { data: string; width: number; height: number };
    trace: () => string[];
    workers: (FrameworkWorker | CoreWorker)[];
  }) => Promise<void>,
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
  const workers: (FrameworkWorker | CoreWorker)[] = [];
  const environment = {
    MAAVERGE_CORE_WORKER_PATH: workerPath!,
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
    writeFileSync(imagePath, Buffer.from(mockPreviewImage.data, 'base64'));
    writeFileSync(
      path.join(resource, 'image/template.png'),
      Buffer.from(mockPreviewImage.data, 'base64'),
    );
    Object.assign(process.env, environment);
    await work({
      config: { framework, resource, userDir: path.join(root, 'worker'), mode: 'recognition' },
      lockPath,
      image: {
        data: mockPreviewImage.data,
        width: mockPreviewImage.width,
        height: mockPreviewImage.height,
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
        CoreWorker.start({ lockPath, lockTimeoutMs: 20 }, { leaseOnly: true }),
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
      const released = await CoreWorker.start({ lockPath, lockTimeoutMs: 20 }, { leaseOnly: true });
      workers.push(released);
      await released.close();
    }),
);
