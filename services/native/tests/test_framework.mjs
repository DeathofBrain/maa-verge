/** CTest-only framework ABI checks. No SDK download, ADB, device or model is used. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { deflateSync } from 'node:zlib';
import test from 'node:test';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const { values: args } = parseArgs({
  options: Object.fromEntries(
    ['worker', 'framework', 'missing', 'launcher'].map((key) => [key, { type: 'string' }]),
  ),
});
for (const key of ['worker', 'framework', 'missing']) assert.ok(args[key], key);
if (process.platform === 'win32') assert.ok(args.launcher);
const accepted = { accepted: true, nativeSuccess: true };

function png(width, height, color) {
  function chunk(type, bytes) {
    const content = Buffer.concat([Buffer.from(type), bytes]);
    let crc = 0xffffffff;
    for (const byte of content) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const result = Buffer.alloc(bytes.length + 12);
    result.writeUInt32BE(bytes.length);
    content.copy(result, 4);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc(height * (width * 3 + 1));
  const bgr = color ? Buffer.alloc(width * height * 3) : undefined;
  if (color)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const rgb = color(x, y);
        rows.set(rgb, y * (width * 3 + 1) + 1 + x * 3);
        bgr.set([...rgb].reverse(), (y * width + x) * 3);
      }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    // The synthetic ABI reads raw pixels from this private ancillary chunk;
    // the real SDK decodes the same RGB pixels from the ordinary PNG IDAT.
    ...(bgr ? [chunk('maVr', bgr)] : []),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

class Session {
  constructor(f, config, scenario = '', mode = '--framework-worker') {
    this.stderrPath = path.join(f.root, `stderr-${randomUUID()}.txt`);
    const stderr = openSync(this.stderrPath, 'wx');
    this.child = spawn(args.launcher ?? args.worker, args.launcher ? [args.worker, mode] : [mode], {
      env: {
        ...process.env,
        MAAVERGE_FRAMEWORK_CASE: scenario,
        MAAVERGE_FRAMEWORK_TRACE: f.tracePath,
        MAAVERGE_FRAMEWORK_IMAGE: f.imagePath,
      },
      stdio: ['pipe', 'pipe', stderr],
      windowsHide: true,
    });
    closeSync(stderr);
    this.messages = [];
    this.errors = [];
    this.exit = new Promise((resolve) =>
      this.child.once('close', (code, signal) => {
        this.exited = true;
        resolve({ code, signal });
      }),
    );
    this.child.on('error', (error) => this.errors.push(error.message));
    this.child.stdin.on('error', (error) => {
      if (!['EPIPE', 'ERR_STREAM_DESTROYED'].includes(error.code)) this.errors.push(error.message);
    });
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      try {
        const message = JSON.parse(line);
        assert.equal(message.protocolVersion, 1);
        assert.ok(Buffer.byteLength(line) < 4 * 1024 ** 2);
        this.messages.push(message);
      } catch (error) {
        this.errors.push(`${error.message}: ${line}`);
      }
    });
    this.send(config);
  }
  get stderr() {
    return readFileSync(this.stderrPath, 'utf8');
  }
  send(value) {
    this.child.stdin.write(JSON.stringify(value) + '\n');
  }
  async wait(predicate) {
    const deadline = performance.now() + 5000;
    while (true) {
      const index = this.messages.findIndex(predicate);
      if (index >= 0) return this.messages.splice(index, 1)[0];
      assert.ok(
        !this.exited && performance.now() < deadline,
        `missing message: ${this.stderr}\n${JSON.stringify(this.messages)}`,
      );
      await delay(5);
    }
  }
  async command(command) {
    const id = randomUUID();
    this.send({ id, protocolVersion: 1, ...command });
    return this.wait((message) => message.id === id);
  }
  async close() {
    this.child.stdin.end();
    let timer;
    try {
      const result = await Promise.race([
        this.exit,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            this.child.kill();
            reject(new Error('worker did not exit'));
          }, 5000);
        }),
      ]);
      assert.deepEqual(this.errors, []);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
}

function fixture(t, source = args.framework) {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-framework-'));
  const framework = path.join(root, '中文 SDK');
  const resource = path.join(root, '中文 resources');
  mkdirSync(path.join(framework, 'bin'), { recursive: true });
  mkdirSync(path.join(framework, 'share/MaaAgentBinary'), { recursive: true });
  mkdirSync(path.join(resource, 'image'), { recursive: true });
  mkdirSync(path.join(resource, 'model/ocr'), { recursive: true });
  copyFileSync(source, path.join(framework, 'bin', path.basename(source)));
  for (const name of ['det.onnx', 'rec.onnx', 'keys.txt'])
    writeFileSync(path.join(resource, 'model/ocr', name), 'synthetic-only');
  const image = png(1280, 720);
  const imagePath = path.join(root, 'synthetic.png');
  writeFileSync(imagePath, image);
  writeFileSync(path.join(resource, 'image/template.png'), image);
  const config = {
    protocolVersion: 1,
    framework,
    resource,
    userDir: path.join(root, 'user'),
    mode: 'recognition',
  };
  const lockPath = path.join(root, 'device.lock');
  const tracePath = path.join(root, 'trace.txt');
  const sessions = [];
  const f = {
    root,
    config,
    lockPath,
    imagePath,
    tracePath,
    image: { data: image.toString('base64'), width: 1280, height: 720 },
    trace: () =>
      existsSync(tracePath) ? readFileSync(tracePath, 'utf8').trim().split(/\r?\n/u) : [],
    control: (extra) => ({
      ...config,
      mode: 'control',
      adb: 'synthetic-never-executed',
      address: 'synthetic://no-device',
      lockPath,
      ...extra,
    }),
    session(selected = config, scenario = '', mode) {
      const session = new Session(f, selected, scenario, mode);
      sessions.push(session);
      return session;
    },
    async ready(selected = config, scenario = '') {
      const session = f.session(selected, scenario);
      const ready = await session.wait((message) => message.type === 'ready');
      assert.equal(ready.engine, 'maafw');
      assert.equal(ready.mode, selected.mode);
      assert.equal(ready.version, 'v5.14.3');
      return session;
    },
    async connected(scenario = '', extra = {}) {
      const session = await f.ready(f.control(extra), scenario);
      assert.deepEqual((await session.command({ operation: 'connect' })).result, accepted);
      return session;
    },
    async traceWait(predicate) {
      const deadline = performance.now() + 5000;
      while (!f.trace().some(predicate)) {
        assert.ok(performance.now() < deadline, 'missing native trace');
        await delay(5);
      }
    },
  };
  t.after(async () => {
    try {
      for (const session of sessions) if (!session.exited) await session.close();
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
  return f;
}

test('recognition mode loads only resources, parses OCR/template, and owns no device lease', async (t) => {
  const f = fixture(t),
    s = await f.ready();
  for (const kind of ['ocr', 'template']) {
    const reply = await s.command({
      operation: 'recognize',
      kind,
      image: f.image,
      roi: [0, 0, 200, 100],
      ...(kind === 'template' ? { template: 'template.png' } : {}),
    });
    assert.deepEqual(reply.result, {
      hit: true,
      matches: [{ box: [10, 20, 80, 30], score: 0.95, ...(kind === 'ocr' ? { text: 'MAA' } : {}) }],
      engine: 'maafw',
    });
  }
  assert.match((await s.command({ operation: 'connect' })).error, /forbids device/);
  assert.equal(existsSync(f.lockPath), false);
  assert.equal(
    f.trace().some((line) => line.startsWith('controller-')),
    false,
  );
  assert.equal((await s.close()).code, 0);
  assert.match(s.stderr, /synthetic framework stdout: loaded/);
  assert.match(s.stderr, /synthetic framework stdout: destroyed/);
});

test('recognition image, ROI, template traversal and unsupported operations fail before recognition', async (t) => {
  const f = fixture(t),
    s = await f.ready();
  const base = { operation: 'recognize', kind: 'ocr', image: f.image };
  const invalid = [
    { ...base, image: { ...f.image, data: '!!!!' } },
    { ...base, image: { ...f.image, width: 1279 } },
    { ...base, roi: [1270, 0, 100, 100] },
    { ...base, kind: 'template', template: '../synthetic.png' },
    { ...base, kind: 'template', template: '/absolute.png' },
    { ...base, kind: 'template', template: 'C:\\template.png' },
    { ...base, kind: 'shell' },
  ];
  for (const command of invalid) assert.equal(typeof (await s.command(command)).error, 'string');
  assert.equal(
    f.trace().some((line) => line.startsWith('recognition:')),
    false,
  );
  assert.equal((await s.close()).code, 0);
});

test('registered OCR/template parameters and reference space reach the official ABI explicitly', async (t) => {
  const f = fixture(t),
    s = await f.ready();
  const input = { data: png(1920, 1080).toString('base64'), width: 1920, height: 1080 };
  const ocr = await s.command({
    operation: 'recognize',
    kind: 'ocr',
    image: input,
    referenceSize: [1280, 720],
    roi: [10, 20, 200, 50],
    threshold: 0.65,
    onlyRec: true,
    replace: [['0', 'O']],
  });
  assert.deepEqual(ocr.result.coordinateSize, [1280, 720]);
  assert.deepEqual(ocr.result.matches[0].box, [10, 20, 80, 30]);
  assert.equal(input.width, 1920, 'recognition resizing must not change the caller frame');
  assert.deepEqual(
    JSON.parse(
      f
        .trace()
        .find((line) => line.startsWith('recognition:OCR:'))
        .slice(16),
    ),
    { roi: [10, 20, 200, 50], threshold: 0.65, only_rec: true, replace: [['0', 'O']] },
  );
  await s.command({
    operation: 'recognize',
    kind: 'template',
    image: f.image,
    template: 'template.png',
    threshold: 0.8,
    method: 5,
    greenMask: true,
  });
  assert.deepEqual(
    JSON.parse(
      f
        .trace()
        .find((line) => line.startsWith('recognition:TemplateMatch:'))
        .slice(26),
    ),
    { template: 'template.png', threshold: 0.8, method: 5, green_mask: true },
  );
  assert.equal((await s.close()).code, 0);
});

test('OCR preserves the complete upstream replacement table and rejects excess entries', async (t) => {
  const f = fixture(t),
    s = await f.ready();
  // Official name corrections already exceed 64 entries. Preserve every mapping,
  // including the last one, instead of silently truncating to a former limit.
  const replacements = Array.from({ length: 256 }, (_, index) => [
    `^misread-${index}$`,
    `干员-${index}`,
  ]);
  const command = { operation: 'recognize', kind: 'ocr', image: f.image, replace: replacements };
  assert.equal((await s.command(command)).result.hit, true);
  const calls = () => f.trace().filter((line) => line.startsWith('recognition:OCR:'));
  assert.deepEqual(JSON.parse(calls()[0].slice(16)).replace, replacements);
  assert.equal(
    typeof (await s.command({ ...command, replace: [...replacements, ['excess', '拒绝']] })).error,
    'string',
  );
  assert.equal(calls().length, 1, 'excess replacements must not reach the recognizer');
  assert.equal((await s.close()).code, 0);
});

test('pure RGBCount uses inclusive RGB range unions and preserves every distinct facility match', async (t) => {
  const f = fixture(t),
    s = await f.ready();
  const red = [225, 174, 0],
    blue = [21, 174, 225];
  writeFileSync(
    path.join(f.config.resource, 'image/template.png'),
    png(4, 4, () => red),
  );
  const image = png(32, 16, (x, y) =>
    x >= 5 && x < 9 && y >= 4 && y < 8
      ? red
      : x >= 20 && x < 24 && y >= 8 && y < 12
        ? blue
        : [0, 0, 0],
  );
  const command = {
    operation: 'recognize',
    kind: 'template',
    template: 'template.png',
    method: 'RGBCount',
    pureColor: true,
    colorWithClose: false,
    colorScales: [
      [red, red],
      [blue, blue],
    ],
    threshold: 1,
    nmsDistance: 4,
    image: { data: image.toString('base64'), width: 32, height: 16 },
  };
  const reply = await s.command(command);
  assert.deepEqual(reply.result.matches, [
    { box: [5, 4, 4, 4], score: 1 },
    { box: [20, 8, 4, 4], score: 1 },
  ]);
  assert.equal(
    f.trace().filter((line) => line.startsWith('recognition:')).length,
    0,
    'the explicit MaaCore RGBCount port must never substitute Ccoeff',
  );
  assert.equal(existsSync(f.lockPath), false);
  assert.equal((await s.close()).code, 0);
});

test('RGBCount computes sparse-mask F1 in ROI coordinates and defaults to exact 3x3 closing', async (t) => {
  const f = fixture(t),
    s = await f.ready();
  const red = [225, 174, 0],
    off = [0, 0, 0];
  writeFileSync(
    path.join(f.config.resource, 'image/template.png'),
    png(3, 3, (x, y) => (x === 1 || y === 1 ? red : off)),
  );
  const cross = png(5, 5, (x, y) =>
    x >= 1 && x <= 3 && y >= 1 && y <= 3 && (x === 2 || y === 2 || (x === 1 && y === 1))
      ? red
      : off,
  );
  const base = {
    operation: 'recognize',
    kind: 'template',
    template: 'template.png',
    method: 'RGBCount',
    pureColor: true,
    colorScales: [[red, red]],
    roi: [1, 1, 3, 3],
    image: { data: cross.toString('base64'), width: 5, height: 5 },
  };
  const sparse = await s.command({ ...base, colorWithClose: false, threshold: 0.9 });
  assert.deepEqual(sparse.result.matches[0].box, [1, 1, 3, 3]);
  assert.ok(Math.abs(sparse.result.matches[0].score - 10 / 11) < 1e-7);
  writeFileSync(
    path.join(f.config.resource, 'image/template.png'),
    png(3, 3, () => red),
  );
  const hole = png(5, 5, (x, y) =>
    x >= 1 && x <= 3 && y >= 1 && y <= 3 && !(x === 2 && y === 2) ? red : off,
  );
  const command = {
    ...base,
    image: { data: hole.toString('base64'), width: 5, height: 5 },
    threshold: 1,
  };
  assert.equal((await s.command({ ...command, colorWithClose: false })).result.hit, false);
  assert.deepEqual((await s.command(command)).result.matches, [{ box: [1, 1, 3, 3], score: 1 }]);
  assert.equal((await s.close()).code, 0);
});

test('RGBCount follows MaaCore scan-order NMS defaults and rejects oversized results without truncation', async (t) => {
  const f = fixture(t),
    s = await f.ready();
  const red = [225, 174, 0];
  writeFileSync(
    path.join(f.config.resource, 'image/template.png'),
    png(2, 2, () => red),
  );
  const image = png(8, 4, () => red);
  const command = {
    operation: 'recognize',
    kind: 'template',
    template: 'template.png',
    method: 'RGBCount',
    pureColor: true,
    colorScales: [[red, red]],
    threshold: 1,
    image: { data: image.toString('base64'), width: 8, height: 4 },
  };
  assert.deepEqual(
    (await s.command({ ...command, nmsDistance: 3 })).result.matches.map((item) => item.box),
    [
      [0, 0, 2, 2],
      [3, 0, 2, 2],
      [6, 0, 2, 2],
    ],
  );
  assert.equal((await s.command(command)).result.matches.length, 21);
  writeFileSync(
    path.join(f.config.resource, 'image/template.png'),
    png(1, 1, () => red),
  );
  const large = png(32, 32, () => red);
  assert.match(
    (
      await s.command({
        ...command,
        image: { data: large.toString('base64'), width: 32, height: 32 },
      })
    ).error,
    /exceed 256/,
  );
  assert.equal((await s.close()).code, 0);
});

test('RGBCount rejects unsupported modes and malformed ranges before matching', async (t) => {
  const f = fixture(t),
    s = await f.ready();
  const red = [225, 174, 0];
  writeFileSync(
    path.join(f.config.resource, 'image/template.png'),
    png(3, 3, () => red),
  );
  const image = png(3, 3, () => red);
  const base = {
    operation: 'recognize',
    kind: 'template',
    template: 'template.png',
    method: 'RGBCount',
    pureColor: true,
    colorScales: [[red, red]],
    image: { data: image.toString('base64'), width: 3, height: 3 },
  };
  for (const change of [
    { pureColor: false },
    { pureColor: 1 },
    { colorScales: [] },
    { colorScales: [[0, 255]] },
    {
      colorScales: [
        [
          [-1, 0, 0],
          [255, 255, 255],
        ],
      ],
    },
    {
      colorScales: [
        [
          [200, 0, 0],
          [100, 255, 255],
        ],
      ],
    },
    { colorScales: Array.from({ length: 17 }, () => [red, red]) },
    { colorWithClose: 1 },
    { nmsDistance: -1 },
    { nmsDistance: 16385 },
    { maskRange: [1, 255] },
    { greenMask: false },
    { method: 5 },
    { kind: 'ocr' },
  ])
    assert.equal(typeof (await s.command({ ...base, ...change })).error, 'string');
  assert.equal(f.trace().filter((line) => line.startsWith('recognition:')).length, 0);
  assert.equal((await s.close()).code, 0);
});

test('HSV recognition returns bounded pixel counts separately from normalized score', async (t) => {
  const f = fixture(t),
    s = await f.ready();
  const reply = await s.command({
    operation: 'recognize',
    kind: 'color',
    image: f.image,
    roi: [0, 0, 200, 100],
    method: 40,
    lower: [90, 80, 60],
    upper: [130, 255, 255],
    count: 450,
    connected: false,
  });
  assert.deepEqual(reply.result, {
    hit: true,
    engine: 'maafw',
    matches: [{ box: [10, 20, 80, 30], score: 0.025, count: 500 }],
  });
  assert.equal((await s.close()).code, 0);
});

test('MaaCore gray masks create cached in-memory templates and preserve source files', async (t) => {
  const f = fixture(t),
    s = await f.ready();
  const filename = path.join(f.config.resource, 'image/template.png');
  const source = readFileSync(filename);
  const command = {
    operation: 'recognize',
    kind: 'template',
    image: f.image,
    template: 'template.png',
  };
  for (const maskRange of [
    [1, 255],
    [100, 255],
    [100, 255],
  ])
    assert.equal((await s.command({ ...command, maskRange })).result.hit, true);
  const overrides = f.trace().filter((line) => line.startsWith('override-image:'));
  assert.deepEqual(overrides, [
    'override-image:__maaverge_gray_mask_1/template.png:[0,255,0,99,99,99,100,100,100,255,255,255]',
    'override-image:__maaverge_gray_mask_100/template.png:[0,255,0,0,255,0,100,100,100,255,255,255]',
  ]);
  for (const line of f.trace().filter((line) => line.startsWith('recognition:TemplateMatch:'))) {
    const params = JSON.parse(line.slice(26));
    assert.equal(params.green_mask, true);
    assert.match(params.template, /^__maaverge_gray_mask_/);
  }
  assert.deepEqual(readFileSync(filename), source);
  assert.equal((await s.close()).code, 0);
});

test('unsupported recognition parameters fail closed before invoking an algorithm', async (t) => {
  const f = fixture(t),
    s = await f.ready();
  const base = { operation: 'recognize', kind: 'ocr', image: f.image };
  const template = { ...base, kind: 'template', template: 'template.png' };
  const color = { ...base, kind: 'color', method: 40, lower: [0, 0, 0], upper: [179, 255, 255] };
  for (const command of [
    { ...base, referenceSize: [1920, 1080] },
    { ...base, threshold: 2 },
    { ...base, onlyRec: true },
    { ...base, replace: [['invalid']] },
    { ...base, method: 40 },
    { ...base, maskRange: [1, 255] },
    { ...template, onlyRec: true },
    { ...template, method: 3 },
    { ...template, maskRange: [0, 220] },
    { ...template, maskRange: [100, 255], greenMask: true },
    { ...color, method: 4 },
    { ...color, lower: [180, 0, 0] },
    { ...color, lower: [100, 0, 0], upper: [90, 255, 255] },
    { ...color, count: 0 },
    { ...color, threshold: 0.5 },
  ])
    assert.equal(typeof (await s.command(command)).error, 'string');
  assert.equal(f.trace().filter((line) => line.startsWith('recognition:')).length, 0);
  assert.equal((await s.close()).code, 0);
});

test('template results preserve every match and reject oversized results without truncation', async (t) => {
  const f = fixture(t),
    s = await f.ready(f.config, 'multiple-matches');
  const command = {
    operation: 'recognize',
    kind: 'template',
    image: f.image,
    template: 'template.png',
  };
  assert.equal((await s.command(command)).result.matches.length, 2);
  assert.equal((await s.close()).code, 0);
  const excessive = await f.ready(f.config, 'many-matches');
  assert.match((await excessive.command(command)).error, /too many matches/);
  assert.equal((await excessive.close()).code, 0);
});

test('failed resizing or mask registration cannot fall back to an unadapted recognizer', async (t) => {
  const f = fixture(t);
  for (const [scenario, params, message] of [
    ['resize-fail', { kind: 'ocr', referenceSize: [1280, 720] }, /cannot resize/],
    [
      'override-fail',
      { kind: 'template', template: 'template.png', maskRange: [1, 255] },
      /cannot register/,
    ],
  ]) {
    const s = await f.ready(f.config, scenario);
    assert.match(
      (await s.command({ operation: 'recognize', image: f.image, ...params })).error,
      message,
    );
    assert.equal((await s.close()).code, 0);
  }
  assert.equal(f.trace().filter((line) => line.startsWith('recognition:')).length, 0);
});

test('offline validation loads synthetic OCR without a controller and reports unavailable OCR explicitly', async (t) => {
  const f = fixture(t);
  const s = f.session(f.config, '', '--framework-validate');
  const result = await s.wait((message) => 'ocrAvailable' in message);
  assert.equal(result.resourceLoaded, true);
  assert.equal(result.ocrAvailable, true);
  assert.equal((await s.close()).code, 0);
  rmSync(path.join(f.config.resource, 'model/ocr/rec.onnx'));
  const missing = f.session(f.config, '', '--framework-validate');
  const unavailable = await missing.wait((message) => 'ocrAvailable' in message);
  assert.equal(unavailable.ocrAvailable, false);
  assert.match(unavailable.diagnostic, /unavailable/);
  assert.equal((await missing.close()).code, 0);
  assert.equal(
    f.trace().some((line) => line.startsWith('controller-')),
    false,
  );
});

test('MaaTouch is the only input backend, AVD extras are explicit, capture is independent', async (t) => {
  const f = fixture(t),
    s = await f.connected('', { avd: true });
  assert.equal(f.trace().filter((line) => line.startsWith('controller-create:')).length, 1);
  const created = f.trace().find((line) => line.startsWith('controller-create:'));
  assert.match(created, /^controller-create:4:/);
  assert.match(created, /"avd":\{"enable":true\}/);
  assert.match(created, /share[/\\]MaaAgentBinary/);
  assert.match((await s.command({ operation: 'click', x: 50, y: 50 })).error, /fresh frame/);
  const frame = (await s.command({ operation: 'frame' })).result;
  assert.equal(frame.width, 1280);
  assert.equal(frame.height, 720);
  assert.equal(frame.canControl, true);
  assert.deepEqual((await s.command({ operation: 'click', x: 1279, y: 719 })).result, accepted);
  assert.match((await s.command({ operation: 'click', x: 1280, y: 719 })).error, /outside/);
  for (const key of ['back', 'escape'])
    assert.deepEqual((await s.command({ operation: 'press_key', key })).result, accepted);
  assert.match((await s.command({ operation: 'press_key', key: 'home' })).error, /unsupported/);
  assert.equal((await s.close()).code, 0);
  assert.ok(existsSync(f.lockPath), 'persistent OS lock file must not be removed');
});

test('navigation uses held endpoint and inertia compensation; drag remains one segment', async (t) => {
  const f = fixture(t),
    s = await f.connected();
  await s.command({ operation: 'frame' });
  const swipe = { operation: 'swipe', x1: 200, y1: 400, x2: 900, y2: 400, durationMs: 200 };
  assert.deepEqual(
    (await s.command({ ...swipe, profile: 'navigation', compensationDirection: 'left' })).result,
    accepted,
  );
  const navigation = JSON.parse(
    f
      .trace()
      .find((line) => line.startsWith('action:Swipe:'))
      .slice('action:Swipe:'.length),
  );
  assert.deepEqual(navigation, {
    begin: [200, 400],
    end: [
      [900, 400],
      [800, 400],
    ],
    duration: [200, 200],
    end_hold: [150, 0],
  });
  assert.deepEqual(
    (await s.command({ ...swipe, profile: 'drag', compensationDirection: 'none' })).result,
    accepted,
  );
  const drag = JSON.parse(
    f
      .trace()
      .filter((line) => line.startsWith('action:Swipe:'))
      .at(-1)
      .slice('action:Swipe:'.length),
  );
  assert.deepEqual(drag.end, [[900, 400]]);
  assert.deepEqual(drag.end_hold, [0]);
  assert.match(
    (await s.command({ ...swipe, profile: 'drag', compensationDirection: 'left' })).error,
    /forbids/,
  );
  assert.equal((await s.close()).code, 0);
});

test('complete long press and drag use one acknowledged action without navigation compensation', async (t) => {
  const f = fixture(t),
    s = await f.connected();
  await s.command({ operation: 'frame' });
  assert.deepEqual(
    (await s.command({ operation: 'long_press', x: 100, y: 200, durationMs: 750 })).result,
    accepted,
  );
  assert.deepEqual(
    (
      await s.command({
        operation: 'drag',
        x1: 100,
        y1: 200,
        x2: 1100,
        y2: 600,
        durationMs: 1250,
      })
    ).result,
    accepted,
  );
  const actions = f.trace().filter((line) => line.startsWith('action:'));
  assert.equal(actions.length, 2);
  assert.deepEqual(JSON.parse(actions[0].slice('action:LongPress:'.length)), {
    target: [100, 200],
    duration: 750,
  });
  assert.deepEqual(JSON.parse(actions[1].slice('action:Swipe:'.length)), {
    begin: [100, 200],
    end: [[1100, 600]],
    duration: [1250],
    end_hold: [0],
  });
  assert.equal((await s.close()).code, 0);
});

test('long press and drag reject missing frames, invalid coordinates and duration before input', async (t) => {
  const f = fixture(t),
    s = await f.connected();
  const longPress = { operation: 'long_press', x: 20, y: 30, durationMs: 100 };
  const drag = { operation: 'drag', x1: 20, y1: 30, x2: 400, y2: 500, durationMs: 100 };
  for (const command of [longPress, drag])
    assert.match((await s.command(command)).error, /fresh frame/);
  await s.command({ operation: 'frame' });
  for (const command of [
    { ...longPress, x: 1280 },
    { ...longPress, y: -1 },
    { ...longPress, durationMs: 0 },
    { ...longPress, durationMs: 10001 },
    { ...longPress, durationMs: 1.5 },
    { ...longPress, durationMs: undefined },
    { ...drag, x1: -1 },
    { ...drag, x2: 1280 },
    { ...drag, y2: 720 },
    { ...drag, durationMs: 0 },
    { ...drag, durationMs: undefined },
  ])
    assert.equal(typeof (await s.command(command)).error, 'string');
  assert.equal(f.trace().filter((line) => line.startsWith('action:')).length, 0);
  assert.equal((await s.close()).code, 0);
});

for (const operation of ['long_press', 'drag']) {
  const params =
    operation === 'long_press'
      ? { x: 20, y: 30, durationMs: 1000 }
      : { x1: 20, y1: 30, x2: 500, y2: 30, durationMs: 1000 };
  test(`${operation} rejects unsupported touch capability without input fallback`, async (t) => {
    const f = fixture(t),
      s = await f.connected('touch-unsupported');
    await s.command({ operation: 'frame' });
    assert.match((await s.command({ operation, ...params })).error, /touch capability failed/);
    assert.equal(f.trace().filter((line) => line.startsWith('action:')).length, 0);
    assert.equal((await s.close()).code, 0);
  });

  test(`${operation} cancellation releases its held contact and never replays input`, async (t) => {
    const f = fixture(t),
      s = await f.connected('delayed');
    await s.command({ operation: 'frame' });
    s.send({ id: operation, operation, ...params });
    await f.traceWait((line) => line === 'touch-down');
    assert.deepEqual((await s.command({ operation: 'stop' })).result, accepted);
    assert.match((await s.wait((message) => message.id === operation)).error, /cancelled/);
    assert.equal((await s.close()).code, 0);
    const trace = f.trace();
    assert.equal(trace.filter((line) => line.startsWith('action:')).length, 1);
    assert.ok(trace.lastIndexOf('touch-up') > trace.indexOf('touch-down'));
    assert.ok(trace.lastIndexOf('touch-up') < trace.indexOf('controller-destroy'));
  });

  test(`${operation} EOF drains its action before releasing the controller`, async (t) => {
    const f = fixture(t),
      s = await f.connected('delayed');
    await s.command({ operation: 'frame' });
    s.send({ id: operation, operation, ...params });
    await f.traceWait((line) => line === 'touch-down');
    assert.equal((await s.close()).code, 0);
    const trace = f.trace();
    assert.equal(trace.filter((line) => line.startsWith('action:')).length, 1);
    assert.ok(trace.lastIndexOf('touch-up') > trace.indexOf('touch-down'));
    assert.ok(trace.lastIndexOf('touch-up') < trace.indexOf('controller-destroy'));
  });
}

test('stop cancels a running action, releases touch, and rejects parallel work without a queue', async (t) => {
  const f = fixture(t),
    s = await f.connected('delayed');
  await s.command({ operation: 'frame' });
  s.send({
    id: 'swipe',
    operation: 'swipe',
    x1: 20,
    y1: 30,
    x2: 500,
    y2: 30,
    profile: 'navigation',
    compensationDirection: 'none',
  });
  await f.traceWait((line) => line.startsWith('action:Swipe:'));
  assert.match((await s.command({ operation: 'press_key', key: 'back' })).error, /busy/);
  assert.deepEqual((await s.command({ operation: 'stop' })).result, accepted);
  assert.match((await s.wait((message) => message.id === 'swipe')).error, /cancelled/);
  assert.ok(f.trace().includes('touch-up'));
  assert.equal(f.trace().filter((line) => line.startsWith('action:')).length, 1);
  assert.equal((await s.close()).code, 0);
});

test('EOF stops an active swipe before destroying native objects', async (t) => {
  const f = fixture(t),
    s = await f.connected('delayed');
  await s.command({ operation: 'frame' });
  s.send({ id: 'swipe', operation: 'swipe', x1: 20, y1: 30, x2: 500, y2: 30 });
  await f.traceWait((line) => line === 'touch-down');
  assert.equal((await s.close()).code, 0);
  const trace = f.trace();
  assert.ok(trace.indexOf('touch-up') < trace.indexOf('tasker-destroy-done'));
});

test('one stop id survives cancellation cleanup when native stop clears old statuses', async (t) => {
  const f = fixture(t),
    s = await f.connected('stop-race');
  await s.command({ operation: 'frame' });
  s.send({ id: 'swipe', operation: 'swipe', x1: 20, y1: 30, x2: 500, y2: 30 });
  await f.traceWait((line) => line === 'touch-down');
  assert.deepEqual((await s.command({ operation: 'stop' })).result, accepted);
  assert.match((await s.wait((message) => message.id === 'swipe')).error, /cancelled/);
  assert.deepEqual((await s.command({ operation: 'stop' })).result, accepted);
  assert.equal(f.trace().filter((line) => line === 'stop').length, 1);
  assert.equal((await s.close()).code, 0);
  assert.equal(f.trace().filter((line) => line === 'stop').length, 1);
});

test('shutdown drains the native runner when final stop task is rejected', async (t) => {
  const f = fixture(t),
    s = await f.connected('stop-invalid');
  assert.match((await s.command({ operation: 'stop' })).error, /rejected/);
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.match((await s.command({ operation: 'press_key', key: 'back' })).error, /rejected/);
  }
  assert.equal((await s.close()).code, 0);
  assert.ok(f.trace().includes('tasker-destroy-done'));
});

test('a new command waits for native runner idle after stop status succeeds', async (t) => {
  const f = fixture(t),
    s = await f.connected('stop-race');
  assert.deepEqual((await s.command({ operation: 'stop' })).result, accepted);
  assert.deepEqual((await s.command({ operation: 'press_key', key: 'back' })).result, accepted);
  assert.equal((await s.close()).code, 0);
});

for (const scenario of ['action-fail', 'action-rejected']) {
  test(`${scenario} returns an error and releases touch even when task status succeeds`, async (t) => {
    const f = fixture(t),
      s = await f.connected(scenario);
    await s.command({ operation: 'frame' });
    assert.match(
      (await s.command({ operation: 'swipe', x1: 10, y1: 20, x2: 100, y2: 20 })).error,
      /failed|acknowledgment/,
    );
    assert.ok(f.trace().includes('touch-up'));
    assert.equal(f.trace().filter((line) => line.startsWith('action:')).length, 1);
    assert.equal((await s.close()).code, 0);
  });
}

for (const scenario of ['native-hang', 'async-hang']) {
  test(`${scenario} exits 124 with bounded touch cleanup and no action replay`, async (t) => {
    const f = fixture(t),
      s = await f.connected(scenario, { nativeCallTimeoutMs: 800, asyncTimeoutMs: 100 });
    await s.command({ operation: 'frame' });
    s.send({ id: 'action', operation: 'swipe', x1: 20, y1: 30, x2: 500, y2: 30 });
    assert.equal((await s.exit).code, 124);
    assert.deepEqual(s.errors, []);
    assert.match(s.stderr, /result unknown, do not replay/);
    assert.ok(f.trace().includes('touch-up'));
    assert.equal(f.trace().filter((line) => line.startsWith('action:')).length, 1);
  });
}

test('MaaCore lease excludes framework before library load and is retained through destruction', async (t) => {
  const f = fixture(t);
  const holder = f.session({ lockPath: f.lockPath }, '', '--lease-only');
  await holder.wait((message) => message.type === 'ready');
  const blocked = f.session(f.control({ lockTimeoutMs: 20 }));
  assert.equal((await blocked.close()).code, 1);
  assert.equal(f.trace().length, 0);
  await holder.close();
  const control = await f.ready(f.control(), 'destroy-delay');
  control.child.stdin.end();
  await f.traceWait((line) => line === 'tasker-destroy-start');
  const other = f.session({ lockPath: f.lockPath, lockTimeoutMs: 20 }, '', '--lease-only');
  assert.equal((await other.close()).code, 1);
  assert.equal((await control.close()).code, 0);
  const released = f.session({ lockPath: f.lockPath, lockTimeoutMs: 20 }, '', '--lease-only');
  await released.wait((message) => message.type === 'ready');
  assert.equal((await released.close()).code, 0);
});

test('wrong version, missing symbols, failed resources and recognition/controller config fail closed', async (t) => {
  for (const scenario of ['wrong-version', 'resource-fail']) {
    const f = fixture(t),
      s = f.session(f.config, scenario);
    assert.equal((await s.close()).code, 1);
    assert.match(s.stderr, scenario === 'wrong-version' ? /version mismatch/ : /load resource/);
  }
  const f = fixture(t, args.missing),
    missing = f.session();
  assert.equal((await missing.close()).code, 1);
  assert.match(missing.stderr, /missing MaaFramework C API symbol: MaaVersion/);
  const normal = fixture(t);
  const forbidden = normal.session({ ...normal.config, adb: 'forbidden' });
  assert.equal((await forbidden.close()).code, 1);
  assert.match(forbidden.stderr, /forbids controller configuration/);
});

test('MaaTouch connection failure has no input backend fallback', async (t) => {
  const f = fixture(t),
    s = await f.ready(f.control(), 'no-touch');
  assert.match((await s.command({ operation: 'connect' })).error, /failed/);
  assert.equal(f.trace().filter((line) => line.startsWith('controller-create:')).length, 1);
  assert.match((await s.command({ operation: 'frame' })).error, /must be connected/);
  assert.equal((await s.close()).code, 0);
});

test('navigation rejects missing touch capability before submitting a swipe', async (t) => {
  const f = fixture(t),
    s = await f.connected('touch-unsupported');
  await s.command({ operation: 'frame' });
  assert.match(
    (
      await s.command({
        operation: 'swipe',
        x1: 10,
        y1: 10,
        x2: 100,
        y2: 10,
        profile: 'navigation',
        compensationDirection: 'none',
      })
    ).error,
    /navigation unavailable.*no backend fallback/,
  );
  assert.equal(
    f.trace().some((line) => line.startsWith('action:Swipe:')),
    false,
  );
  assert.equal(f.trace().filter((line) => line.startsWith('controller-create:')).length, 1);
  assert.equal((await s.close()).code, 0);
});

test('recognition misses remain structured misses', async (t) => {
  const f = fixture(t),
    s = await f.ready(f.config, 'no-hit');
  assert.deepEqual(
    (await s.command({ operation: 'recognize', kind: 'ocr', image: f.image })).result,
    { hit: false, matches: [], engine: 'maafw' },
  );
  assert.equal((await s.close()).code, 0);
});
