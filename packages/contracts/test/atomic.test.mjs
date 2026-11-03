import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateDebugPrimitiveInvokeParams,
  validateDebugSessionStartParams,
  validateDebugSessionEndParams,
  validatePrimitiveCatalogParams,
  validateDeviceLongPressParams,
  validateDeviceDragParams,
  validateFrameworkWorkerCommand,
} from '../src/validators.js';
const base = { deviceId: 'd', controlToken: 'server-secret', frameId: 'f', requestId: 'r' };
test('Debug accepts opaque identities and rejects leaked controller authority and malformed inputs', () => {
  assert.equal(validatePrimitiveCatalogParams({}), true);
  assert.equal(validateDebugSessionStartParams({ deviceId: 'd', requestId: 'r' }), true);
  const request = {
    debugSessionId: 'opaque',
    primitiveId: 'operation.click',
    input: { x: 1, y: 2 },
    requestId: 'r',
  };
  assert.equal(validateDebugPrimitiveInvokeParams(request), true);
  assert.equal(validateDebugPrimitiveInvokeParams({ ...request, controlToken: 'secret' }), false);
  assert.equal(validateDebugPrimitiveInvokeParams({ ...request, input: [] }), false);
  assert.equal(validateDebugSessionEndParams({ debugSessionId: 'opaque', requestId: 'r' }), true);
});
test('complete gestures require a bounded duration and frame authority', () => {
  const press = { ...base, x: 0, y: 10, durationMs: 1000 },
    drag = { ...base, x1: 0, y1: 0, x2: 20, y2: 30, durationMs: 800 };
  assert.equal(validateDeviceLongPressParams(press), true);
  assert.equal(validateDeviceDragParams(drag), true);
  for (const durationMs of [0, 10001, 1.1]) {
    assert.equal(validateDeviceLongPressParams({ ...press, durationMs }), false);
    assert.equal(validateDeviceDragParams({ ...drag, durationMs }), false);
  }
  assert.equal(validateDeviceDragParams({ ...drag, profile: 'navigation' }), false);
  assert.equal(validateDeviceLongPressParams({ ...press, controlToken: undefined }), false);
  assert.equal(
    validateFrameworkWorkerCommand({
      protocolVersion: 1,
      id: 'x',
      operation: 'long_press',
      x: 0,
      y: 0,
      durationMs: 1,
    }),
    true,
  );
  assert.equal(
    validateFrameworkWorkerCommand({
      protocolVersion: 1,
      id: 'x',
      operation: 'touch_down',
      x: 0,
      y: 0,
    }),
    false,
  );
});

test('framed composites accept current or bounded references while frame results retain complete PNG data', async () => {
  const { atomicInputValidators, validateAtomicFrameData } = await import('../src/validators.js');
  const reference = { frameId: 'frame', width: 1280, height: 720 };
  const full = { ...reference, data: 'png' };
  const inputs = {
    'composite.match': { rule: 'registered-rule' },
    'composite.texts': {},
    'composite.click_box': { box: [0, 0, 20, 20] },
    'composite.swipe': { from: [0, 0], to: [20, 20], durationMs: 100 },
  };
  for (const [id, input] of Object.entries(inputs)) {
    const validate = atomicInputValidators[id];
    for (const frame of ['current', reference, full])
      assert.equal(validate({ ...input, frame }), true, `${id}: ${JSON.stringify(frame)}`);
    for (const frame of [
      'latest',
      { frameId: 'frame', width: 1280 },
      { frameId: 'frame', width: 1280, height: 0 },
      { ...reference, extra: true },
      { ...reference, data: '' },
    ])
      assert.equal(validate({ ...input, frame }), false, `${id}: ${JSON.stringify(frame)}`);
    assert.equal(validate(input), !['composite.click_box', 'composite.swipe'].includes(id));
  }
  assert.equal(validateAtomicFrameData(reference), false);
  assert.equal(validateAtomicFrameData(full), true);
});

test('recognition validates kind-specific authority and preserves the complete bounded OCR correction map', async () => {
  const { atomicInputValidators } = await import('../src/validators.js');
  const validate = atomicInputValidators['operation.recognize'];
  const base = { frameId: 'frame', kind: 'ocr' };
  assert.equal(
    validate({ ...base, replace: Array.from({ length: 85 }, () => ['源', '目标']) }),
    true,
  );
  assert.equal(
    validate({ ...base, replace: Array.from({ length: 257 }, () => ['源', '目标']) }),
    false,
  );
  assert.equal(validate({ ...base, onlyRec: true }), false);
  assert.equal(validate({ ...base, onlyRec: true, roi: [0, 0, 20, 20] }), true);
  assert.equal(validate({ ...base, method: 5 }), false);
  assert.equal(
    validate({ ...base, kind: 'template', templateId: 'registered.png', maskRange: [100, 255] }),
    true,
  );
  assert.equal(
    validate({ ...base, kind: 'template', templateId: 'registered.png', maskRange: [0, 255] }),
    false,
  );
  assert.equal(
    validate({
      ...base,
      kind: 'template',
      templateId: 'registered.png',
      maskRange: [1, 255],
      greenMask: false,
    }),
    false,
  );
  assert.equal(
    validate({
      ...base,
      kind: 'color',
      method: 40,
      lower: [0, 0, 0],
      upper: [179, 255, 255],
      count: 1,
    }),
    true,
  );
  assert.equal(
    validate({ ...base, kind: 'color', method: 40, lower: [0, 0, 0], upper: [255, 255, 255] }),
    false,
  );
});

test('RGBCount accepts only bounded pure RGB ranges for both catalog inputs and native commands', async () => {
  const { atomicInputValidators } = await import('../src/validators.js');
  const validate = atomicInputValidators['operation.recognize'];
  const input = {
    frameId: 'frame',
    kind: 'template',
    templateId: 'InfrastMfg.png',
    method: 'RGBCount',
    pureColor: true,
    colorScales: [
      [
        [200, 100, 0],
        [255, 255, 100],
      ],
    ],
    colorWithClose: true,
    nmsDistance: 50,
  };
  const native = (value) => {
    const { frameId, templateId, ...options } = value;
    return {
      protocolVersion: 1,
      id: 'rgb',
      operation: 'recognize',
      image: { data: 'registered-png', width: 1280, height: 720 },
      template: templateId,
      ...options,
    };
  };
  assert.equal(validate(input), true);
  assert.equal(validateFrameworkWorkerCommand(native(input)), true);
  for (const change of [
    { pureColor: false },
    { pureColor: undefined },
    { colorScales: [] },
    {
      colorScales: Array.from({ length: 17 }, () => [
        [0, 0, 0],
        [255, 255, 255],
      ]),
    },
    {
      colorScales: [
        [
          [0, 0, 0],
          [256, 255, 255],
        ],
      ],
    },
    {
      colorScales: [
        [
          [0, 0],
          [255, 255],
        ],
      ],
    },
    { nmsDistance: 16385 },
    { greenMask: false },
    { maskRange: [1, 255] },
    { method: 5 },
    { kind: 'ocr' },
  ]) {
    assert.equal(validate({ ...input, ...change }), false, JSON.stringify(change));
    assert.equal(
      validateFrameworkWorkerCommand(native({ ...input, ...change })),
      false,
      JSON.stringify(change),
    );
  }
});
