import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  validatePlan,
  validateSettings,
  validateSnapshot,
  validateRpcRequest,
  validateRpcEvent,
  validateWorkerCommand,
  validateWorkerConfiguration,
  validateWorkerLeaseConfiguration,
  validateWorkerValidationConfiguration,
  validateWorkerEvent,
  validateWorkerValidation,
  validateDeviceFrameParams,
  validateDeviceClickParams,
  validateScreenFrame,
  validateWorkerFrame,
  validateStageListParams,
  validateStageListResult,
  validateHostUpdateParams,
} from '../src/validators.js';

const settings = () => ({
  autoConnect: true,
  autoUpdateCore: true,
  autoUpdateResource: true,
  minimizeToTray: true,
  theme: 'system',
  budgets: { originium: 0, medicine: 0, expedited: 0 },
  model: { provider: 'none', baseUrl: '', model: '' },
});
const plan = () => ({
  id: 'legacy',
  name: '旧版任务表',
  description: '',
  deviceId: null,
  group: 'daily',
  budgets: null,
  tasks: [{ type: 'Award', params: { future_option: { nested: [1, '保留'] } }, enabled: true }],
  schedule: null,
  enabled: true,
});

test('host update operations accept bounded release identities without entering the public method map', () => {
  const download = {
    operation: 'download',
    operationId: 'download_1-A',
    tag: 'v0.1.2',
    version: '0.1.2+build.1',
    name: 'Maa-Verge_0.1.2_x64+setup.exe',
    size: 1,
  };
  for (const value of [
    { operation: 'releases', operationId: 'a', page: 1 },
    { operation: 'releases', operationId: 'A'.repeat(100), page: 10 },
    { operation: 'manifest', operationId: 'manifest-1', tag: 'v'.repeat(100) },
    download,
    {
      ...download,
      version: '1'.repeat(100),
      name: 'A'.repeat(180),
      size: 1073741824,
      digest: 'sha256:' + 'aF'.repeat(32),
    },
    { operation: 'cancel', operationId: 'cancel_1' },
  ])
    assert.equal(validateHostUpdateParams(value), true, JSON.stringify(value));
  const schema = JSON.parse(
    readFileSync(new URL('../schemas/rpc.schema.json', import.meta.url), 'utf8'),
  );
  assert.ok(schema.$defs.HostUpdateParams);
  assert.equal(
    JSON.stringify(schema.properties.params).includes('#/$defs/HostUpdateParams'),
    false,
  );
  assert.equal(
    JSON.stringify(schema.properties.results).includes('#/$defs/HostUpdateParams'),
    false,
  );
});

test('host update operations reject extra URL or path authority, missing fields and range violations', () => {
  const releases = { operation: 'releases', operationId: 'release_1', page: 1 };
  const manifest = { operation: 'manifest', operationId: 'manifest_1', tag: 'v0.1.2' };
  const download = {
    operation: 'download',
    operationId: 'download_1',
    tag: 'v0.1.2',
    version: '0.1.2',
    name: 'maa-verge.exe',
    size: 1,
  };
  const cancel = { operation: 'cancel', operationId: 'cancel_1' };
  for (const value of [
    null,
    [],
    {},
    { ...cancel, operation: 'arbitrary' },
    ...[releases, manifest, download, cancel].flatMap((value) => [
      { ...value, operationId: '' },
      { ...value, operationId: 'x'.repeat(101) },
      { ...value, operationId: 'with/slash' },
      { ...value, operationId: 'with space' },
      { ...value, operationId: 'with-newline\n' },
      { ...value, url: 'https://untrusted.test/download' },
      { ...value, path: '../arbitrary-output' },
      ...Object.keys(value).map((field) =>
        Object.fromEntries(Object.entries(value).filter(([key]) => key !== field)),
      ),
    ]),
    ...[0, 11, 1.5, '1', null].map((page) => ({ ...releases, page })),
    ...['', 'v'.repeat(101), '../v1', '.hidden', 'v1/tag', 'v1\n', 'v1 with space'].flatMap(
      (tag) => [
        { ...manifest, tag },
        { ...download, tag },
        { ...download, version: tag },
      ],
    ),
    ...[0, -1, 1073741825, 1.5, '1', null].map((size) => ({ ...download, size })),
    ...[
      '',
      'a'.repeat(181),
      '.hidden',
      '../asset.exe',
      'folder/asset.exe',
      'folder\\asset.exe',
      'asset name.exe',
      'asset.exe\n',
      'https://example.test/asset.exe',
    ].map((name) => ({ ...download, name })),
    ...[
      'sha256:' + 'a'.repeat(63),
      'sha256:' + 'a'.repeat(65),
      'sha256:' + 'g'.repeat(64),
      'SHA256:' + 'a'.repeat(64),
      'sha256:' + 'a'.repeat(64) + '\n',
      null,
    ].map((digest) => ({ ...download, digest })),
    { ...cancel, page: 1 },
    { ...manifest, size: 1 },
  ])
    assert.equal(validateHostUpdateParams(value), false, JSON.stringify(value));
});

test('stage catalogs expose bounded local metadata and reject caller filesystem paths', () => {
  assert.equal(validateStageListParams({}), true);
  assert.equal(validateStageListParams({ clientType: 'Bilibili' }), true);
  assert.equal(validateStageListParams({ refresh: true }), true);
  assert.equal(validateStageListParams({ refresh: 'true' }), false);
  assert.equal(validateStageListParams({ clientType: 'unknown' }), false);
  assert.equal(validateStageListParams({ resourcePath: '/arbitrary' }), false);
  const result = {
    clientType: 'Official',
    resourceVersion: null,
    source: 'builtin',
    generatedAt: '2026-10-23T00:00:00Z',
    stages: [{ value: '', label: '当前 / 上次关卡', category: 'default', available: true }],
    activities: [],
    calendar: {
      source: 'unavailable',
      url: null,
      fetchedAt: null,
      checkedAt: null,
      nextRefreshAt: null,
      stale: true,
      refreshing: false,
      error: null,
    },
    message: '常驻关卡',
    diagnostics: [],
  };
  assert.equal(validateStageListResult(result), true);
  const activity = {
    id: 'sample',
    name: '活动',
    startAt: null,
    endAt: null,
    clientType: 'Official',
    status: 'unknown',
    source: 'resource-version',
  };
  assert.equal(validateStageListResult({ ...result, activities: [activity] }), true);
  assert.equal(
    validateStageListResult({
      ...result,
      activities: [{ ...activity, source: 'official-calendar', status: 'active' }],
    }),
    true,
  );
  assert.equal(validateStageListResult({ ...result, calendar: undefined }), false);
  assert.equal(
    validateStageListResult({ ...result, activities: [{ ...activity, status: 'expired' }] }),
    false,
  );
  assert.equal(
    validateStageListResult({ ...result, stages: [{ ...result.stages[0], available: 'true' }] }),
    false,
  );
});

test('standalone validators preserve normalized data and arbitrary task parameters', () => {
  const value = plan(),
    original = structuredClone(value);
  assert.equal(validatePlan(value), true);
  assert.deepEqual(value, original);
  assert.equal(validateSettings(settings()), true);
  const snapshot = {
    mode: 'native',
    devices: [],
    plans: [value],
    runs: [],
    updates: [],
    settings: settings(),
    events: [],
  };
  assert.equal(validateSnapshot(snapshot), true);
  assert.equal(validateSnapshot({ ...snapshot, mode: 'mock' }), false);
  const device = {
    id: 'device',
    name: '设备',
    address: '127.0.0.1:5555',
    state: 'idle',
    coreVersion: null,
    resourceVersion: null,
  };
  assert.equal(
    validateSnapshot({
      ...snapshot,
      devices: [
        { ...device, dataSync: { operatorsAt: '2026-10-23T00:00:00.000Z', depotAt: null } },
      ],
    }),
    true,
  );
  assert.equal(
    validateSnapshot({
      ...snapshot,
      devices: [{ ...device, dataSync: { operatorsAt: true, depotAt: null } }],
    }),
    false,
  );
  assert.equal(
    validateSnapshot({ ...snapshot, devices: [{ ...device, dataSync: { operatorsAt: null } }] }),
    false,
  );
});

test('missing defaults, invalid metadata and unknown model keys are rejected without coercion', () => {
  const missing = { name: '未规范化', tasks: [{ type: 'Award' }] };
  const original = structuredClone(missing);
  assert.equal(validatePlan(missing), false);
  assert.deepEqual(missing, original);
  for (const fields of [
    { tasks: [] },
    { deviceId: '' },
    { group: 'unknown' },
    { budgets: { medicine: -1 } },
    { unexpected: true },
  ]) {
    assert.equal(validatePlan({ ...plan(), ...fields }), false, JSON.stringify(fields));
    assert.ok(validatePlan.errors.length > 0);
  }
  assert.equal(validateSettings({ ...settings(), autoConnect: 'true' }), false);
  assert.equal(
    validateSettings({ ...settings(), budgets: { originium: true, medicine: 0, expedited: 0 } }),
    false,
  );
});

test('automatic capture metadata is optional, preserved and strictly boolean', () => {
  const capture = { method: 'adb', emulatorPath: '', instanceIndex: 0 };
  const connection = {
    adbPath: '',
    address: '127.0.0.1:16384',
    config: 'General',
    touchMode: 'minitouch',
    adbLite: false,
    clientType: 'Official',
  };
  const profile = {
    id: 'mumu-0',
    name: 'MuMu 0',
    address: connection.address,
    connection,
    capture,
  };
  const legacy = { ...settings(), capture, deviceProfiles: [profile] };
  const original = structuredClone(legacy);
  assert.equal(validateSettings(legacy), true);
  assert.deepEqual(legacy, original);
  for (const automatic of [true, false]) {
    assert.equal(
      validateSettings({
        ...legacy,
        capture: { ...capture, autoDetect: automatic },
        deviceProfiles: [{ ...profile, autoDetected: automatic }],
      }),
      true,
    );
  }
  assert.equal(validateSettings({ ...legacy, capture: { ...capture, autoDetect: 'true' } }), false);
  assert.equal(
    validateSettings({ ...legacy, deviceProfiles: [{ ...profile, autoDetected: 1 }] }),
    false,
  );
});

test('explicit zero budgets and all registered task variants remain supported', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../schemas/runtime.schema.json', import.meta.url), 'utf8'),
  );
  for (const type of schema.$defs.Task.properties.type.enum) {
    const value = plan();
    value.budgets = { originium: 0, medicine: 0, expedited: 0 };
    value.tasks = [{ type, params: {}, enabled: false }];
    assert.equal(validatePlan(value), true, type);
  }
  assert.equal(validatePlan({ ...plan(), name: '😀'.repeat(80) }), true);
  assert.equal(validatePlan({ ...plan(), name: '😀'.repeat(81) }), false);
});

test('generated validators have no external imports or runtime schema compiler', () => {
  const source = readFileSync(new URL('../src/validators.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^import\s/mu);
  assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(/u);
  assert.doesNotMatch(source, /[A-Za-z]:\\|\.\.\/typescript-cpp-runtime/u);
});

test('settings reject removed downloader preferences', () => {
  assert.equal(validateSettings(settings()), true);
  for (const componentDownload of [
    null,
    { engine: 'builtin', aria2Path: '' },
    { engine: 'aria2', aria2Path: '' },
  ]) {
    assert.equal(validateSettings({ ...settings(), componentDownload }), false);
  }
});

test('download proxy policy remains optional and limits modes and fields', () => {
  assert.equal(validateSettings(settings()), true);
  for (const mode of ['auto', 'manual', 'direct']) {
    assert.equal(validateSettings({ ...settings(), downloadProxy: { mode, url: '' } }), true);
  }
  for (const downloadProxy of [
    null,
    { mode: 'auto' },
    { mode: 'socks', url: '' },
    { mode: 'manual', url: 7890 },
    { mode: 'auto', url: '', fallbackToDirect: true },
    { mode: 'manual', url: 'x'.repeat(4097) },
  ])
    assert.equal(validateSettings({ ...settings(), downloadProxy }), false);
});

test('JSON-RPC envelopes preserve notifications and reject malformed protocol data', () => {
  assert.equal(
    validateRpcRequest({ jsonrpc: '2.0', id: 1, method: 'app.snapshot', params: {} }),
    true,
  );
  assert.equal(validateRpcRequest({ jsonrpc: '2.0', method: 'future.method' }), true);
  for (const change of [
    { jsonrpc: '1.0' },
    { method: 1 },
    { id: true },
    { params: [] },
    { shell: 'arbitrary' },
  ]) {
    assert.equal(validateRpcRequest({ jsonrpc: '2.0', method: 'app.snapshot', ...change }), false);
  }
  const event = {
    jsonrpc: '2.0',
    method: 'runtime.event',
    params: { id: 1, type: 'test', message: '事件', createdAt: '2026-10-22T00:00:00Z', data: {} },
  };
  assert.equal(validateRpcEvent(event), true);
  assert.equal(validateRpcEvent({ ...event, method: 'unknown.event' }), false);
  assert.equal(validateRpcEvent({ ...event, params: { ...event.params, id: '1' } }), false);
});

test('native v1 commands require task payloads and bounded integer timeouts', () => {
  const configuration = {
    protocolVersion: 1,
    core: '/core',
    resource: '/resource',
    adb: '/adb',
    address: '127.0.0.1:5555',
    userDir: '/user',
    lockPath: '/locks/device.lock',
  };
  assert.equal(validateWorkerConfiguration(configuration), true);
  for (const change of [
    { protocolVersion: 2 },
    { lockTimeoutMs: -1 },
    { startupTimeoutMs: 0 },
    { nativeCallTimeoutMs: 120001 },
    { asyncTimeoutMs: 1.5 },
  ]) {
    assert.equal(validateWorkerConfiguration({ ...configuration, ...change }), false);
  }
  assert.equal(
    validateWorkerCommand({ protocolVersion: 1, id: 'connect', operation: 'connect' }),
    true,
  );
  const command = {
    protocolVersion: 1,
    id: 2,
    operation: 'task',
    task: { type: 'Fight', params: { future: [1, { nested: true }] } },
  };
  const original = structuredClone(command);
  assert.equal(validateWorkerCommand(command), true);
  assert.deepEqual(command, original);
  assert.equal(validateWorkerCommand({ protocolVersion: 1, id: 2, operation: 'task' }), false);
  assert.equal(validateWorkerCommand({ ...command, operation: 'stop' }), false);
  assert.equal(validateWorkerCommand({ ...command, protocolVersion: 0 }), false);
  assert.equal(
    validateWorkerLeaseConfiguration({
      protocolVersion: 1,
      lockPath: '/locks/device.lock',
      lockTimeoutMs: 0,
    }),
    true,
  );
  assert.equal(
    validateWorkerLeaseConfiguration({
      protocolVersion: 1,
      lockPath: '/locks/device.lock',
      address: 'unexpected',
    }),
    false,
  );
  assert.equal(
    validateWorkerValidationConfiguration({
      protocolVersion: 1,
      core: '/core',
      resource: '/resource',
      version: 'v6.20.0',
    }),
    true,
  );
  assert.equal(
    validateWorkerValidationConfiguration({
      protocolVersion: 1,
      core: '/core',
      resource: '/resource',
    }),
    false,
  );
});

test('native responses contain exactly one result or error and reject unknown versions', () => {
  const response = { protocolVersion: 1, type: 'response', id: 1 };
  assert.equal(validateWorkerEvent({ ...response, result: { taskId: 1 } }), true);
  assert.equal(validateWorkerEvent({ ...response, id: null, error: 'invalid command' }), true);
  assert.equal(validateWorkerEvent(response), false);
  assert.equal(validateWorkerEvent({ ...response, result: {}, error: 'ambiguous' }), false);
  assert.equal(
    validateWorkerEvent({
      protocolVersion: 1,
      type: 'callback',
      message: 20002,
      details: { taskid: 1 },
    }),
    true,
  );
  assert.equal(
    validateWorkerEvent({
      protocolVersion: 1,
      type: 'status',
      running: false,
      pendingAsync: [1, 1],
    }),
    false,
  );
  assert.equal(validateWorkerEvent({ protocolVersion: 2, type: 'ready' }), false);
  assert.equal(
    validateWorkerValidation({ protocolVersion: 1, version: 'v6.20.0', resourceLoaded: true }),
    true,
  );
  assert.equal(
    validateWorkerValidation({ protocolVersion: 1, version: 'v6.20.0', resourceLoaded: false }),
    false,
  );
});

test('screen preview contracts bound image payloads and restrict input to integer coordinates', () => {
  const params = { deviceId: 'device-1' };
  const click = { ...params, frameId: 'frame-1', requestId: 'click-1', x: 0, y: 8191 };
  assert.equal(validateDeviceFrameParams(params), true);
  assert.equal(validateDeviceFrameParams({ ...params, command: 'shell' }), false);
  assert.equal(validateDeviceClickParams(click), true);
  for (const fields of [
    { x: -1 },
    { x: 8192 },
    { y: 0.5 },
    { requestId: '' },
    { frameId: '' },
    { shell: 'tap' },
  ]) {
    assert.equal(validateDeviceClickParams({ ...click, ...fields }), false);
  }
  const image = {
    width: 1280,
    height: 720,
    mimeType: 'image/png',
    data: 'iVBORw==',
    canControl: false,
  };
  const frame = {
    ...image,
    ...params,
    frameId: 'frame-1',
    capturedAt: '2026-10-22T00:00:00Z',
    latencyMs: 12.5,
  };
  assert.equal(validateWorkerFrame(image), true);
  assert.equal(validateScreenFrame(frame), true);
  for (const fields of [
    { width: 0 },
    { height: 8193 },
    { data: '' },
    { data: 'A'.repeat(4183385) },
    { mimeType: 'image/jpeg' },
    { canControl: 1 },
  ]) {
    assert.equal(validateWorkerFrame({ ...image, ...fields }), false);
    assert.equal(validateScreenFrame({ ...frame, ...fields }), false);
  }
  assert.equal(validateScreenFrame({ ...frame, latencyMs: -1 }), false);
  assert.equal(validateScreenFrame({ ...frame, command: 'shell' }), false);
  assert.equal(
    validateWorkerCommand({ protocolVersion: 1, id: 'frame', operation: 'frame' }),
    true,
  );
  assert.equal(
    validateWorkerCommand({ protocolVersion: 1, id: 'tap', operation: 'click', x: 1279, y: 719 }),
    true,
  );
  assert.equal(
    validateWorkerCommand({ protocolVersion: 1, id: 'tap', operation: 'click', x: 0.5, y: 0 }),
    false,
  );
});
