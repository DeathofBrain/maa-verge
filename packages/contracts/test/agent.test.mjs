import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateAgentMcpOperationRequest } from '../src/validators.js';

const request = { requestId: 'stable-external-request', deviceId: 'configured-device' };
const rpc = JSON.parse(
  readFileSync(new URL('../schemas/rpc.schema.json', import.meta.url), 'utf8'),
);

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
