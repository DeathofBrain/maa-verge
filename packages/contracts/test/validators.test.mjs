import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  validatePlan, validateSettings, validateSnapshot, validateRpcRequest, validateRpcEvent,
  validateWorkerCommand, validateWorkerConfiguration, validateWorkerLeaseConfiguration,
  validateWorkerValidationConfiguration, validateWorkerEvent, validateWorkerValidation,
  validateDeviceFrameParams, validateDeviceClickParams, validateScreenFrame, validateWorkerFrame,
} from '../src/validators.js';

const settings = () => ({
  autoConnect: true, autoUpdateCore: true, autoUpdateResource: true, minimizeToTray: true, theme: 'system',
  budgets: { originium: 0, medicine: 0, expedited: 0 }, model: { provider: 'none', baseUrl: '', model: '' },
});
const plan = () => ({
  id: 'legacy', name: '旧版任务表', description: '', deviceId: null, group: 'daily', budgets: null,
  tasks: [{ type: 'Award', params: { future_option: { nested: [1, '保留'] } }, enabled: true }], schedule: null, enabled: true,
});

test('standalone validators preserve normalized data and arbitrary task parameters', () => {
  const value = plan(), original = structuredClone(value);
  assert.equal(validatePlan(value), true);
  assert.deepEqual(value, original);
  assert.equal(validateSettings(settings()), true);
  const snapshot = { mode: 'native', devices: [], plans: [value], runs: [], updates: [], settings: settings(), events: [] };
  assert.equal(validateSnapshot(snapshot), true);
  assert.equal(validateSnapshot({ ...snapshot, mode: 'mock' }), false);
});

test('missing defaults, invalid metadata and unknown model keys are rejected without coercion', () => {
  const missing = { name: '未规范化', tasks: [{ type: 'Award' }] };
  const original = structuredClone(missing);
  assert.equal(validatePlan(missing), false);
  assert.deepEqual(missing, original);
  for (const fields of [{ tasks: [] }, { deviceId: '' }, { group: 'unknown' }, { budgets: { medicine: -1 } }, { unexpected: true }]) {
    assert.equal(validatePlan({ ...plan(), ...fields }), false, JSON.stringify(fields));
    assert.ok(validatePlan.errors.length > 0);
  }
  assert.equal(validateSettings({ ...settings(), autoConnect: 'true' }), false);
  assert.equal(validateSettings({ ...settings(), budgets: { originium: true, medicine: 0, expedited: 0 } }), false);
});

test('explicit zero budgets and all registered task variants remain supported', () => {
  const schema = JSON.parse(readFileSync(new URL('../schemas/runtime.schema.json', import.meta.url), 'utf8'));
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

test('JSON-RPC envelopes preserve notifications and reject malformed protocol data', () => {
  assert.equal(validateRpcRequest({ jsonrpc: '2.0', id: 1, method: 'app.snapshot', params: {} }), true);
  assert.equal(validateRpcRequest({ jsonrpc: '2.0', method: 'future.method' }), true);
  for (const change of [{ jsonrpc: '1.0' }, { method: 1 }, { id: true }, { params: [] }, { shell: 'arbitrary' }]) {
    assert.equal(validateRpcRequest({ jsonrpc: '2.0', method: 'app.snapshot', ...change }), false);
  }
  const event = { jsonrpc: '2.0', method: 'runtime.event', params: { id: 1, type: 'test', message: '事件', createdAt: '2026-10-22T00:00:00Z', data: {} } };
  assert.equal(validateRpcEvent(event), true);
  assert.equal(validateRpcEvent({ ...event, method: 'unknown.event' }), false);
  assert.equal(validateRpcEvent({ ...event, params: { ...event.params, id: '1' } }), false);
});

test('native v1 commands require task payloads and bounded integer timeouts', () => {
  const configuration = { protocolVersion: 1, core: '/core', resource: '/resource', adb: '/adb', address: '127.0.0.1:5555', userDir: '/user', lockPath: '/locks/device.lock' };
  assert.equal(validateWorkerConfiguration(configuration), true);
  for (const change of [{ protocolVersion: 2 }, { lockTimeoutMs: -1 }, { startupTimeoutMs: 0 }, { nativeCallTimeoutMs: 120001 }, { asyncTimeoutMs: 1.5 }]) {
    assert.equal(validateWorkerConfiguration({ ...configuration, ...change }), false);
  }
  assert.equal(validateWorkerCommand({ protocolVersion: 1, id: 'connect', operation: 'connect' }), true);
  const command = { protocolVersion: 1, id: 2, operation: 'task', task: { type: 'Fight', params: { future: [1, { nested: true }] } } };
  const original = structuredClone(command);
  assert.equal(validateWorkerCommand(command), true);
  assert.deepEqual(command, original);
  assert.equal(validateWorkerCommand({ protocolVersion: 1, id: 2, operation: 'task' }), false);
  assert.equal(validateWorkerCommand({ ...command, operation: 'stop' }), false);
  assert.equal(validateWorkerCommand({ ...command, protocolVersion: 0 }), false);
  assert.equal(validateWorkerLeaseConfiguration({ protocolVersion: 1, lockPath: '/locks/device.lock', lockTimeoutMs: 0 }), true);
  assert.equal(validateWorkerLeaseConfiguration({ protocolVersion: 1, lockPath: '/locks/device.lock', address: 'unexpected' }), false);
  assert.equal(validateWorkerValidationConfiguration({ protocolVersion: 1, core: '/core', resource: '/resource', version: 'v6.20.0' }), true);
  assert.equal(validateWorkerValidationConfiguration({ protocolVersion: 1, core: '/core', resource: '/resource' }), false);
});

test('native responses contain exactly one result or error and reject unknown versions', () => {
  const response = { protocolVersion: 1, type: 'response', id: 1 };
  assert.equal(validateWorkerEvent({ ...response, result: { taskId: 1 } }), true);
  assert.equal(validateWorkerEvent({ ...response, id: null, error: 'invalid command' }), true);
  assert.equal(validateWorkerEvent(response), false);
  assert.equal(validateWorkerEvent({ ...response, result: {}, error: 'ambiguous' }), false);
  assert.equal(validateWorkerEvent({ protocolVersion: 1, type: 'callback', message: 20002, details: { taskid: 1 } }), true);
  assert.equal(validateWorkerEvent({ protocolVersion: 1, type: 'status', running: false, pendingAsync: [1, 1] }), false);
  assert.equal(validateWorkerEvent({ protocolVersion: 2, type: 'ready' }), false);
  assert.equal(validateWorkerValidation({ protocolVersion: 1, version: 'v6.20.0', resourceLoaded: true }), true);
  assert.equal(validateWorkerValidation({ protocolVersion: 1, version: 'v6.20.0', resourceLoaded: false }), false);
});

test('screen preview contracts bound image payloads and restrict input to integer coordinates', () => {
  const params = { deviceId: 'device-1' };
  const click = { ...params, frameId: 'frame-1', requestId: 'click-1', x: 0, y: 8191 };
  assert.equal(validateDeviceFrameParams(params), true);
  assert.equal(validateDeviceFrameParams({ ...params, command: 'shell' }), false);
  assert.equal(validateDeviceClickParams(click), true);
  for (const fields of [{ x: -1 }, { x: 8192 }, { y: 0.5 }, { requestId: '' }, { frameId: '' }, { shell: 'tap' }]) {
    assert.equal(validateDeviceClickParams({ ...click, ...fields }), false);
  }
  const image = { width: 1280, height: 720, mimeType: 'image/png', data: 'iVBORw==', canControl: false };
  const frame = { ...image, ...params, frameId: 'frame-1', capturedAt: '2026-10-22T00:00:00Z', latencyMs: 12.5 };
  assert.equal(validateWorkerFrame(image), true);
  assert.equal(validateScreenFrame(frame), true);
  for (const fields of [{ width: 0 }, { height: 8193 }, { data: '' }, { data: 'A'.repeat(4183385) }, { mimeType: 'image/jpeg' }, { canControl: 1 }]) {
    assert.equal(validateWorkerFrame({ ...image, ...fields }), false);
    assert.equal(validateScreenFrame({ ...frame, ...fields }), false);
  }
  assert.equal(validateScreenFrame({ ...frame, latencyMs: -1 }), false);
  assert.equal(validateScreenFrame({ ...frame, command: 'shell' }), false);
  assert.equal(validateWorkerCommand({ protocolVersion: 1, id: 'frame', operation: 'frame' }), true);
  assert.equal(validateWorkerCommand({ protocolVersion: 1, id: 'tap', operation: 'click', x: 1279, y: 719 }), true);
  assert.equal(validateWorkerCommand({ protocolVersion: 1, id: 'tap', operation: 'click', x: 0.5, y: 0 }), false);
});
