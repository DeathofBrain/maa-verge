import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  validateAgentMcpOperationRequest,
  validateAgentTurn,
  validateAgentTurnProgress,
} from '../src/validators.js';

const request = { requestId: 'stable-external-request', deviceId: 'configured-device' };
const rpc = JSON.parse(
  readFileSync(new URL('../schemas/rpc.schema.json', import.meta.url), 'utf8'),
);

test('Agent turns accept optional bounded provisional progress with finite statuses', () => {
  const turn = {
    id: 'streaming-turn',
    sessionId: 'streaming-session',
    status: 'running',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
    usage: {
      modelCalls: 1,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      incomplete: true,
    },
  };
  assert.equal(validateAgentTurn(turn), true);
  for (const status of ['waiting', 'generating', 'tool_call'])
    assert.equal(
      validateAgentTurn({ ...turn, progress: { text: '未完成的模型内容', status } }),
      true,
    );
  assert.equal(validateAgentTurnProgress({ text: '', status: 'waiting' }), true);
  assert.equal(validateAgentTurnProgress({ text: 'x'.repeat(64000), status: 'generating' }), true);
  for (const progress of [
    { text: 'x'.repeat(64001), status: 'generating' },
    { text: 'partial', status: 'completed' },
    { text: 'partial' },
    { status: 'waiting' },
    { text: 'partial', status: 'generating', reply: 'untrusted final reply' },
  ])
    assert.equal(validateAgentTurn({ ...turn, progress }), false);
});

test('external Agent MCP operations accept the standard finite target kinds', () => {
  const valid = [
    { ...request, kind: 'plan', planId: 'saved-plan' },
    { ...request, kind: 'stop', runId: 'attached-run' },
    ...rpc.$defs.ToolKind.enum.map((toolKind) => ({
      ...request,
      kind: 'tool',
      toolKind,
      config: { synthetic_option: { nested: [1, true, null] } },
    })),
    ...rpc.$defs.CopilotKind.enum.map((copilotKind) => ({
      ...request,
      kind: 'copilot',
      copilotKind,
    })),
  ];
  for (const value of valid)
    assert.equal(validateAgentMcpOperationRequest(value), true, JSON.stringify(value));
});

test('external Agent MCP operations reject missing or mixed target authority and oversized configuration', () => {
  const invalid = [
    {},
    { ...request, kind: 'plan' },
    { ...request, kind: 'stop' },
    { ...request, kind: 'tool' },
    { ...request, kind: 'copilot' },
    { ...request, kind: 'plan', planId: '' },
    { ...request, kind: 'plan', planId: 'saved-plan', runId: 'foreign-run' },
    { ...request, kind: 'plan', planId: 'saved-plan', approved: true },
    { ...request, kind: 'plan', planId: 'saved-plan', requestId: 'x'.repeat(161) },
    { ...request, kind: 'tool', toolKind: 'arbitrary-shell' },
    { ...request, kind: 'copilot', copilotKind: 'arbitrary-workspace' },
    {
      ...request,
      kind: 'tool',
      toolKind: 'recruit',
      config: Object.fromEntries(Array.from({ length: 101 }, (_, index) => ['key-' + index, 1])),
    },
    { ...request, kind: 'tool', toolKind: 'recruit', config: { ['x'.repeat(161)]: 1 } },
    { ...request, kind: 'stop', runId: 'attached-run', config: {} },
  ];
  for (const value of invalid)
    assert.equal(validateAgentMcpOperationRequest(value), false, JSON.stringify(value));
});
