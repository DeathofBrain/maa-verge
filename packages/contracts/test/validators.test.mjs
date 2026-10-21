import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validatePlan, validateSettings, validateSnapshot } from '../src/validators.js';

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
  assert.equal(validateSnapshot({ mode: 'mock', devices: [], plans: [value], runs: [], updates: [], settings: settings(), events: [] }), true);
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
