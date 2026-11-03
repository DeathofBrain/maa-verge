import { expect, test } from 'bun:test';
import {
  mergePipelineDefinitions,
  pipelineSubgraph,
  registerPipeline,
} from '#automation/pipeline/definitions';

test('merging rejects duplicate nodes and identifies both source files', () => {
  expect(() =>
    mergePipelineDefinitions({
      'navigation.json': { 'Infrast@Read': { next: [] } },
      'operators.json': { 'Infrast@Read': { next: [] } },
    }),
  ).toThrow(/navigation\.json.*operators\.json|operators\.json.*navigation\.json/u);
});

test('merged graphs reject unresolved next and on_error targets', () => {
  for (const field of ['next', 'on_error']) {
    expect(() =>
      mergePipelineDefinitions({
        'navigation.json': { 'Infrast@Start': { [field]: ['Infrast@Missing'] } },
      }),
    ).toThrow('Infrast@Missing');
  }
});

test('merged graphs reject invalid edge lists and node references', () => {
  for (const field of ['next', 'on_error'])
    for (const value of ['Infrast@End', ['Infrast@End', 1], [null], {}]) {
      expect(() =>
        mergePipelineDefinitions({
          'navigation.json': {
            'Infrast@Start': { [field]: value },
            'Infrast@End': {},
          },
        }),
      ).toThrow();
    }
});

test('subgraph selection rejects unknown entry points', () => {
  const definitions = mergePipelineDefinitions({
    'navigation.json': { 'Infrast@Start': { next: [] } },
  });
  expect(() => pipelineSubgraph(definitions, 'Infrast@Missing')).toThrow('Infrast@Missing');
});

test('cross-file cycles and error branches produce an independent reachable subgraph', () => {
  const sources = {
    'navigation.json': {
      'Infrast@Start': {
        next: ['Infrast@Read'],
        on_error: ['Infrast@Recover'],
        custom_action_param: { handler: 'fixture', nested: { value: 1 } },
      },
      'Infrast@Unused': { next: [] },
    },
    'operators.json': {
      'Infrast@Read': { next: ['Infrast@Start'] },
      'Infrast@Recover': { next: [] },
    },
  };
  const original = structuredClone(sources);
  const definitions = mergePipelineDefinitions(sources);
  const graph = pipelineSubgraph(definitions, 'Infrast@Start');
  expect(Object.keys(graph).sort()).toEqual(['Infrast@Read', 'Infrast@Recover', 'Infrast@Start']);
  expect(graph['Infrast@Unused']).toBeUndefined();
  expect(graph['Infrast@Start']).not.toBe(definitions['Infrast@Start']);
  (graph['Infrast@Start']!.next as string[]).push('Infrast@Unused');
  const params = graph['Infrast@Start']!.custom_action_param as {
    handler: string;
    nested: { value: number };
  };
  params.nested.value = 2;
  expect(sources).toEqual(original);
  expect(pipelineSubgraph(definitions, 'Infrast@Start')['Infrast@Start']).toEqual(
    original['navigation.json']['Infrast@Start'],
  );
});

test('registered Pipeline keeps cross-file references and gives each binding its own graph', () => {
  const sources = {
    'start.json': { 'Utility@Start': { next: ['Utility@Finish'] } },
    'finish.json': { 'Utility@Finish': { action: 'DoNothing', next: [] } },
  };
  const pipeline = registerPipeline(sources);
  sources['start.json']['Utility@Start'].next.push('Utility@Missing');
  sources['finish.json']['Utility@Finish'].action = 'mutated-source';
  const exposed = pipeline.definitions;
  (exposed['Utility@Start']!.next as string[]).push('Utility@Missing');
  exposed['Utility@Finish']!.action = 'mutated-exposed';
  const first = pipeline.subgraph('Utility@Start');
  first['Utility@Finish']!.action = 'mutated';
  expect(pipeline.subgraph('Utility@Start')['Utility@Finish']!.action).toBe('DoNothing');
  expect(pipeline.definitions['Utility@Finish']!.action).toBe('DoNothing');
  // 未登记节点应在维护者的类型检查中被拒绝，而运行时入口仍保留明确的失败信息。
  expect(() => {
    // @ts-expect-error 未登记入口不能通过精确节点类型。
    pipeline.subgraph('Utility@Missing');
  }).toThrow('Utility@Missing');
});
