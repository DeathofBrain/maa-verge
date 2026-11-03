import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateControlSessionStartParams,
  validateControlSessionGetParams,
  validateControlSessionEndParams,
  validateDeviceFrameParams,
  validateDeviceClickParams,
  validateDeviceSwipeParams,
  validateDevicePressKeyParams,
  validateVisionRecognizeParams,
  validateVisionRecognitionResult,
  validateFrameworkWorkerConfiguration,
  validateFrameworkWorkerCommand,
  validateFrameworkWorkerEvent,
  validateFrameworkWorkerValidation,
} from '../src/validators.js';

const scope = { deviceId: 'device', controlToken: 'host-token' };
const action = { ...scope, frameId: 'frame', requestId: 'stable-request' };

test('framework connections select bounded screenshot and input methods independently', () => {
  const config = {
    protocolVersion: 1,
    framework: 'sdk',
    resource: 'resource',
    userDir: 'logs',
    mode: 'control',
    adb: 'adb',
    address: 'serial',
    lockPath: 'lease',
    capture: { method: 'auto', emulatorPath: '', instanceIndex: 0 },
    touchMode: 'maatouch',
  };
  for (const touchMode of ['maatouch', 'minitouch', 'adb', 'emulator-extras'])
    assert.equal(validateFrameworkWorkerConfiguration({ ...config, touchMode }), true);
  for (const method of ['auto', 'adb', 'mumu', 'ldplayer', 'avd'])
    assert.equal(
      validateFrameworkWorkerConfiguration({ ...config, capture: { ...config.capture, method } }),
      true,
    );
  assert.equal(
    validateFrameworkWorkerConfiguration({ ...config, avdSerial: 'emulator-20000' }),
    true,
  );
  for (const invalid of [
    { ...config, touchMode: 'MaaFwAdb' },
    { ...config, touchMode: 15 },
    { ...config, capture: { ...config.capture, method: 'shell' } },
    { ...config, capture: { ...config.capture, pid: 0 } },
    { ...config, capture: { ...config.capture, instanceIndex: -1 } },
    { ...config, touchExtras: { emulatorPath: 'sdk', instanceIndex: 65536 } },
    { ...config, extras: { shell: 'arbitrary-command' } },
    { ...config, avdSerial: '127.0.0.1:20001' },
    { ...config, avdSerial: 'emulator-65535' },
    { ...config, avdSerial: 'emulator-0' },
  ])
    assert.equal(validateFrameworkWorkerConfiguration(invalid), false);
});

test('control sessions have bounded host-owned identities and preserve existing frame/click callers', () => {
  assert.equal(validateControlSessionStartParams({ deviceId: 'device', requestId: 'start' }), true);
  assert.equal(validateControlSessionGetParams({ deviceId: 'device' }), true);
  assert.equal(validateControlSessionEndParams({ ...scope, requestId: 'end' }), true);
  assert.equal(validateControlSessionStartParams({ ...scope, requestId: 'start' }), false);
  assert.equal(validateControlSessionEndParams({ deviceId: 'device', requestId: 'end' }), false);
  assert.equal(validateControlSessionEndParams({ ...scope, requestId: 'a'.repeat(201) }), false);
  for (const controlToken of [undefined, 'host-token']) {
    const token = controlToken === undefined ? {} : { controlToken };
    assert.equal(validateDeviceFrameParams({ deviceId: 'device', ...token }), true);
    assert.equal(
      validateDeviceClickParams({
        deviceId: 'device',
        frameId: 'f',
        requestId: 'r',
        x: 0,
        y: 0,
        ...token,
      }),
      true,
    );
  }
});

test('atomic gestures require controller authority and reject arbitrary keys, coordinates and timing', () => {
  const swipe = { ...action, x1: 0, y1: 0, x2: 100, y2: 200 };
  assert.equal(validateDeviceSwipeParams(swipe), true);
  assert.equal(
    validateDeviceSwipeParams({
      ...swipe,
      profile: 'navigation',
      compensationDirection: 'up',
      durationMs: 100,
    }),
    true,
  );
  for (const invalid of [
    { ...swipe, controlToken: '' },
    { ...swipe, x2: 8192 },
    { ...swipe, y1: -1 },
    { ...swipe, durationMs: 99 },
    { ...swipe, durationMs: 2001 },
    { ...swipe, profile: 'raw-touch' },
    { ...swipe, compensationDirection: [0, 1] },
  ])
    assert.equal(validateDeviceSwipeParams(invalid), false, JSON.stringify(invalid));
  for (const key of ['back', 'escape'])
    assert.equal(validateDevicePressKeyParams({ ...action, key }), true);
  for (const key of ['home', 'shell input keyevent 4', 4])
    assert.equal(validateDevicePressKeyParams({ ...action, key }), false);
});

test('recognition exposes bounded regions and registered template IDs without file authority', () => {
  const params = { deviceId: 'device', frameId: 'frame', kind: 'ocr' };
  assert.equal(validateVisionRecognizeParams({ ...params, roi: [0, 0, 1280, 720] }), true);
  assert.equal(
    validateVisionRecognizeParams({ ...params, kind: 'template', templateId: 'home.button' }),
    true,
  );
  for (const templateId of ['items/item.png', '基建/Ready@2.png'])
    assert.equal(validateVisionRecognizeParams({ ...params, kind: 'template', templateId }), true);
  for (const invalid of [
    { ...params, roi: [0, 0, 1] },
    { ...params, roi: [0, 0, 0, 1] },
    { ...params, roi: [-1, 0, 1, 1] },
    { ...params, templateId: '../secret.png' },
    { ...params, templateId: '/tmp/template.png' },
    ...['./item.png', 'items/../item.png', 'items//item.png', 'C:/item.png', 'item\u0000.png'].map(
      (templateId) => ({ ...params, templateId }),
    ),
    { ...params, image: 'base64' },
    { ...params, pipeline: {} },
  ])
    assert.equal(validateVisionRecognizeParams(invalid), false, JSON.stringify(invalid));
  const result = {
    frameId: 'frame',
    engine: 'maafw',
    resourceGeneration: 'generation',
    hit: false,
    matches: [],
    fresh: false,
  };
  assert.equal(validateVisionRecognitionResult(result), true);
  assert.equal(
    validateVisionRecognitionResult({
      ...result,
      hit: true,
      matches: [{ text: '合成', box: [1, 2, 3, 4], score: 0.8 }],
    }),
    true,
  );
  assert.equal(validateVisionRecognitionResult({ ...result, controlToken: 'secret' }), false);
});

test('MaaFramework native protocol is explicit, bounded and rejects removed high-level task commands', () => {
  assert.equal(
    validateFrameworkWorkerConfiguration({
      protocolVersion: 1,
      framework: 'lib',
      resource: 'resource',
      userDir: 'logs',
      mode: 'recognition',
    }),
    true,
  );
  assert.equal(
    validateFrameworkWorkerConfiguration({
      protocolVersion: 1,
      framework: 'lib',
      resource: 'resource',
      userDir: 'logs',
      mode: 'control',
      adb: 'adb',
      address: 'serial',
      lockPath: 'lease',
      avd: true,
    }),
    true,
  );
  const command = { protocolVersion: 1, id: 1 };
  assert.equal(
    validateFrameworkWorkerCommand({
      ...command,
      operation: 'recognize',
      kind: 'ocr',
      image: { data: 'png', width: 1280, height: 720 },
      roi: [0, 0, 1280, 720],
    }),
    true,
  );
  assert.equal(
    validateFrameworkWorkerCommand({
      ...command,
      operation: 'swipe',
      x1: 1,
      y1: 1,
      x2: 2,
      y2: 2,
      profile: 'navigation',
      compensationDirection: 'left',
    }),
    true,
  );
  assert.equal(
    validateFrameworkWorkerCommand({
      ...command,
      operation: 'task',
      task: { type: 'Fight', params: {} },
    }),
    false,
  );
  assert.equal(
    validateFrameworkWorkerCommand({ ...command, operation: 'shell', command: 'anything' }),
    false,
  );
  assert.equal(
    validateFrameworkWorkerEvent({
      protocolVersion: 1,
      type: 'ready',
      engine: 'maafw',
      mode: 'recognition',
      version: 'v5.14.3',
    }),
    true,
  );
  assert.equal(
    validateFrameworkWorkerEvent({
      type: 'ready',
      engine: 'maafw',
      mode: 'recognition',
      version: 'v5.14.3',
    }),
    false,
  );
  assert.equal(
    validateFrameworkWorkerValidation({
      protocolVersion: 1,
      engine: 'maafw',
      version: 'v5.14.3',
      resourceLoaded: true,
      ocrAvailable: false,
      diagnostic: 'not compatible',
    }),
    true,
  );
});

test('recognition reference canvases and result coordinates support bounded non-game sizes', () => {
  const command = {
    protocolVersion: 1,
    id: 'generic-canvas',
    operation: 'recognize',
    kind: 'ocr',
    image: { data: 'synthetic-png', width: 800, height: 600 },
  };
  const result = {
    frameId: 'frame',
    engine: 'maafw',
    resourceGeneration: 'generation',
    hit: false,
    matches: [],
    fresh: false,
  };
  for (const size of [
    [640, 480],
    [320, 240],
    [1280, 720],
    [1, 8192],
  ]) {
    assert.equal(validateFrameworkWorkerCommand({ ...command, referenceSize: size }), true);
    assert.equal(validateVisionRecognitionResult({ ...result, coordinateSize: size }), true);
  }
  for (const size of [
    [],
    [640],
    [640, 480, 1],
    [0, 480],
    [640, -1],
    [8193, 1],
    [1, 8193],
    [640.5, 480],
    ['640', 480],
  ]) {
    assert.equal(validateFrameworkWorkerCommand({ ...command, referenceSize: size }), false);
    assert.equal(validateVisionRecognitionResult({ ...result, coordinateSize: size }), false);
  }
});

test('host-owned Pipelines accept Custom nodes and reject malformed or oversized graphs', () => {
  const command = {
    protocolVersion: 1,
    id: 'pipeline-request',
    operation: 'pipeline',
    entry: '打开房间',
    pipeline: {
      打开房间: {
        recognition: 'DirectHit',
        action: 'Custom',
        custom_action: 'MaaVerge.Custom',
        custom_action_param: { handler: 'openRoom' },
        next: ['核对名单'],
      },
      核对名单: {
        recognition: 'DirectHit',
        action: 'Custom',
        custom_action: 'MaaVerge.Custom',
        custom_action_param: { handler: 'verifyRoster' },
      },
    },
  };
  assert.equal(validateFrameworkWorkerCommand(command), true);
  assert.equal(
    validateFrameworkWorkerCommand({
      ...command,
      pipeline: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`node${i}`, {}])),
    }),
    true,
  );
  for (const invalid of [
    { ...command, entry: '' },
    { ...command, entry: 'a'.repeat(129) },
    { ...command, entry: 'node\nnext' },
    { ...command, pipeline: {} },
    { ...command, pipeline: { '': {} } },
    { ...command, pipeline: { ['a'.repeat(129)]: {} } },
    { ...command, pipeline: { 'node\u0000': {} } },
    { ...command, pipeline: { node: [] } },
    { ...command, pipeline: { node: 'Custom' } },
    {
      ...command,
      pipeline: Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`node${i}`, {}])),
    },
    {
      ...command,
      pipeline: { node: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`p${i}`, 0])) },
    },
    { ...command, callbackId: 'nested-pipeline' },
    { ...command, shell: 'arbitrary-command' },
  ])
    assert.equal(validateFrameworkWorkerCommand(invalid), false);
  // Pipeline graphs remain internal native commands, outside public device/vision parameters.
  assert.equal(validateDeviceFrameParams({ ...scope, pipeline: command.pipeline }), false);
  assert.equal(
    validateVisionRecognizeParams({
      deviceId: 'device',
      frameId: 'f',
      kind: 'ocr',
      pipeline: command.pipeline,
    }),
    false,
  );
});

test('Custom callbacks carry bounded identities and explicit success acknowledgements', () => {
  const event = {
    protocolVersion: 1,
    type: 'framework_custom',
    callbackId: 'callback-1',
    contextId: 'root-context',
    parentCallbackId: null,
    depth: 1,
    inputEpoch: 0,
    node: '核对名单',
    params: { handler: 'verifyRoster' },
  };
  assert.equal(validateFrameworkWorkerEvent(event), true);
  for (const invalid of [
    { ...event, callbackId: '' },
    { ...event, callbackId: 'c'.repeat(129) },
    { ...event, node: 'bad\rnode' },
    { ...event, node: '' },
    { ...event, params: [] },
    { ...event, params: null },
    { ...event, params: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`p${i}`, 0])) },
    { ...event, controlToken: 'host-secret' },
    { ...event, protocolVersion: 2 },
  ])
    assert.equal(validateFrameworkWorkerEvent(invalid), false);
  const reply = {
    protocolVersion: 1,
    id: 'callback-result',
    operation: 'custom_result',
    callbackId: event.callbackId,
    success: true,
  };
  assert.equal(validateFrameworkWorkerCommand(reply), true);
  assert.equal(validateFrameworkWorkerCommand({ ...reply, success: false }), true);
  for (const invalid of [
    { ...reply, callbackId: '' },
    { ...reply, success: 'true' },
    { ...reply, success: undefined },
    { ...reply, verified: true },
    { ...reply, result: {} },
  ])
    assert.equal(validateFrameworkWorkerCommand(invalid), false);
});

test('Custom context commands preserve primitive restrictions and forbid lifecycle reentry', () => {
  const command = { protocolVersion: 1, id: 1, callbackId: 'callback-1' };
  const operations = [
    { operation: 'frame' },
    { operation: 'click', x: 1, y: 2 },
    { operation: 'swipe', x1: 1, y1: 2, x2: 3, y2: 4 },
    { operation: 'press_key', key: 'back' },
    { operation: 'recognize', kind: 'ocr', image: { data: 'png', width: 1, height: 1 } },
    { operation: 'long_press', x: 1, y: 2, durationMs: 100 },
    { operation: 'drag', x1: 1, y1: 2, x2: 3, y2: 4, durationMs: 100 },
  ];
  for (const operation of operations) {
    assert.equal(validateFrameworkWorkerCommand({ ...command, ...operation }), true);
    assert.equal(
      validateFrameworkWorkerCommand({ ...command, ...operation, callbackId: '' }),
      false,
    );
  }
  for (const operation of ['connect', 'stop', 'shell'])
    assert.equal(validateFrameworkWorkerCommand({ ...command, operation }), false);
  assert.equal(
    validateFrameworkWorkerCommand({ ...command, operation: 'press_key', key: 'home' }),
    false,
  );
  assert.equal(
    validateFrameworkWorkerCommand({ ...command, operation: 'click', x: -1, y: 0 }),
    false,
  );
});

// 上下文子任务只有当前回调可提交；身份和输入代际仍沿同一内部协议传递。
test('context Pipeline carries bounded child identity and epoch observations', () => {
  const child = {
    protocolVersion: 1,
    id: 'child',
    operation: 'context_pipeline',
    callbackId: 'parent',
    contextId: 'child-context',
    entry: 'Start',
    pipeline: { Start: {} },
  };
  assert.equal(validateFrameworkWorkerCommand(child), true);
  for (const invalid of [
    { ...child, callbackId: undefined },
    { ...child, contextId: '' },
    { ...child, pipeline: {} },
    { ...child, depth: 9 },
  ])
    assert.equal(validateFrameworkWorkerCommand(invalid), false);
  const epoch = { protocolVersion: 1, type: 'framework_input_epoch', inputEpoch: 3 };
  assert.equal(validateFrameworkWorkerEvent(epoch), true);
  for (const inputEpoch of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(validateFrameworkWorkerEvent({ ...epoch, inputEpoch }), false);
});
