import { expect, test } from 'bun:test';
import { recognitionExport } from '../../../apps/desktop/src/features/tools/tool-exports';
import type { RpcContract } from '../../../packages/contracts/src/rpc-types';

const result: RpcContract['results']['recognition.get'] = {
  deviceId: 'fixture',
  kind: 'depot',
  clientType: 'Official',
  runId: 'tool-fixture',
  collectedAt: '2026-10-24T00:00:00Z',
  items: [{ id: '30012', name: '固源岩', quantity: 12 }],
  operators: [],
};
test('warehouse exports preserve authoritative quantities in every supported format', () => {
  expect(JSON.parse(recognitionExport(result, 'json').text)).toEqual(result);
  expect(JSON.parse(recognitionExport(result, 'arkplanner').text)).toEqual({
    '@type': '@penguin-statistics/depot',
    items: [{ id: '30012', have: 12, name: '固源岩' }],
  });
  expect(JSON.parse(recognitionExport(result, 'lolicon').text)).toEqual({ '30012': 12 });
  expect(recognitionExport(result, 'markdown').text).toContain('| 30012 | 固源岩 | 12 |');
  expect(recognitionExport(result, 'csv').text).toContain('"30012","固源岩","12"');
});
test('operator exports escape delimiters and keep unowned progression unknown', () => {
  const operators = {
    ...result,
    kind: 'operators' as const,
    items: [],
    operators: [
      {
        id: 'char_fixture',
        name: '合成|干员,"',
        own: false,
        rarity: 6,
        elite: -1,
        level: -1,
        potential: -1,
      },
    ],
  };
  expect(recognitionExport(operators, 'markdown').text).toContain('合成\\|干员,"');
  expect(recognitionExport(operators, 'csv').text).toContain('"合成|干员,"""');
  expect(JSON.parse(recognitionExport(operators, 'json').text).operators[0]).toMatchObject({
    own: false,
    elite: -1,
    level: -1,
    potential: -1,
  });
});
