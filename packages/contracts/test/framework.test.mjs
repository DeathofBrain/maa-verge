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

test('MaaFramework native protocol is explicit, bounded and isolated from MaaCore task commands', () => {
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
