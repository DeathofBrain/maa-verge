import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCopilotPreviewParams, validateCopilotStartParams, validateCopilotWorkspaceSaveParams, validateSnapshot } from '../src/validators.js';

const options = () => ({ loopTimes: 1, formation: false, formationIndex: 1, addTrust: false, ignoreRequirements: false, supportUnitName: '', additionalOperators: [] });
test('copilot workspace bounds queues and prevents extra consumable switches', () => {
  const workspace = { kind: 'Copilot', queue: [{ id: 'unique-occurrence', versionId: 'a'.repeat(64), enabled: true, isRaid: false, navName: '' }], options: options() };
  assert.equal(validateCopilotWorkspaceSaveParams({ workspace }), true);
  assert.equal(validateCopilotWorkspaceSaveParams({ workspace: { ...workspace, options: { ...workspace.options, use_sanity_potion: true } } }), false);
  assert.equal(validateCopilotWorkspaceSaveParams({ workspace: { ...workspace, queue: Array.from({ length: 101 }, () => workspace.queue[0]) } }), false);
  assert.equal(validateCopilotWorkspaceSaveParams({ workspace: { ...workspace, kind: 'VideoRecognition' } }), false);
  assert.equal(validateCopilotWorkspaceSaveParams({ workspace: { ...workspace, queue: [{ ...workspace.queue[0], versionId: '../../arbitrary' }] } }), false);
});

test('preview accepts bounded content or source identity and start never accepts native parameters', () => {
  assert.equal(validateCopilotPreviewParams({ content: '{}', name: '本地作业' }), true);
  assert.equal(validateCopilotPreviewParams({ code: 'prts://s123' }), true);
  assert.equal(validateCopilotPreviewParams({ planId: 'legacy', taskIndex: 1 }), true);
  assert.equal(validateCopilotPreviewParams({ content: 'a'.repeat(800_001) }), false);
  assert.equal(validateCopilotPreviewParams({ url: 'https://arbitrary.invalid/data' }), false);
  assert.equal(validateCopilotStartParams({ kind: 'Copilot', deviceId: 'synthetic', requestId: 'stable' }), true);
  assert.equal(validateCopilotStartParams({ kind: 'Copilot', deviceId: 'synthetic', requestId: 'stable', params: { filename: '/arbitrary' } }), false);
});

test('new copilot summaries and historical plan records share a backward compatible snapshot', () => {
  const base = { id: 'old', planId: 'legacy', deviceId: 'd', status: 'completed', progress: 100, message: '', startedAt: '2026-10-24T00:00:00Z', finishedAt: '2026-10-24T00:01:00Z' };
  const value = { mode: 'native', devices: [], plans: [], runs: [base, { ...base, id: 'new', source: 'copilot', sourceName: '作业启动快照', planId: null, copilotKind: 'Copilot' }], updates: [], settings: { autoConnect: false, autoUpdateCore: false, autoUpdateResource: false, minimizeToTray: true, theme: 'system', budgets: { originium: 0, medicine: 0, expedited: 0 }, model: { provider: 'none', baseUrl: '', model: '' } }, events: [] };
  assert.equal(validateSnapshot(value), true);
  assert.equal(validateSnapshot({ ...value, runs: [{ ...base, source: 'arbitrary' }] }), false);
});
