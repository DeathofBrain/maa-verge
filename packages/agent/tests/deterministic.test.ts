import { expect, test } from 'bun:test';
import { AgentInputError, proposeDeterministic, validateAgentMessage } from '../src';

type ParsingFixture = {
  name: string;
  message: string;
  expected: 'daily' | { stage: string; times: number };
};
const parsingFixtures: ParsingFixture[] = [
  { name: 'daily proposal', message: '做日常', expected: 'daily' },
  {
    name: 'Chinese word boundaries preserve legacy fallback',
    message: '刷2-8材料3次',
    expected: { stage: '1-7', times: 3 },
  },
  { name: 'zero count clamps to one', message: '刷 2-8 0次', expected: { stage: '2-8', times: 1 } },
  { name: 'three-digit count', message: '刷 2-8 999次', expected: { stage: '2-8', times: 999 } },
  {
    name: 'four-digit count retains legacy suffix matching',
    message: '刷 2-8 1000次',
    expected: { stage: '2-8', times: 1 },
  },
  {
    name: 'Chinese number retains default count',
    message: '刷 2-8 六次',
    expected: { stage: '2-8', times: 6 },
  },
  {
    name: 'fullwidth stage and count',
    message: '刷 ２-８ ３次',
    expected: { stage: '２-８', times: 3 },
  },
  { name: 'Arabic-Indic count', message: '刷 2-8 ٣次', expected: { stage: '2-8', times: 3 } },
  {
    name: 'NEL between count and unit',
    message: '刷 2-8 3\u0085次',
    expected: { stage: '2-8', times: 3 },
  },
  { name: 'BOM alone remains nonempty', message: '\ufeff', expected: 'daily' },
  {
    name: '4000 supplementary code points accepted',
    message: '😀'.repeat(4000),
    expected: 'daily',
  },
  {
    name: 'adjacent mathematical digit blocks',
    message: '刷 𝟚-𝟠 𝟛次',
    expected: { stage: '𝟚-𝟠', times: 3 },
  },
  {
    name: 'mixed Unicode decimal blocks',
    message: '刷 2-8 1٢３次',
    expected: { stage: '2-8', times: 123 },
  },
  {
    name: 'BOM is not count whitespace',
    message: '刷 2-8 3\ufeff次',
    expected: { stage: '2-8', times: 6 },
  },
  {
    name: 'underscore is a word boundary blocker',
    message: '刷 _2-8_ 3次',
    expected: { stage: '1-7', times: 3 },
  },
];

for (const fixture of parsingFixtures)
  test(fixture.name, () => {
    let preparations = 0;
    const proposal = proposeDeterministic(fixture.message, (draft) => {
      preparations++;
      return draft;
    });
    expect(preparations).toBe(1);
    expect(proposal.plan).toEqual({
      id: '',
      name: fixture.expected === 'daily' ? 'Agent 日常计划' : fixture.expected.stage + ' 材料补给',
      tasks:
        fixture.expected === 'daily'
          ? ['StartUp', 'Recruit', 'Infrast', 'Mall', 'Award'].map((type) => ({ type, params: {} }))
          : [{ type: 'Fight', params: fixture.expected }],
    });
  });

test('standalone proposals return only the host-prepared plan and require review', () => {
  const prepared = Object.freeze({ reviewedBy: 'synthetic-host', tasksAccepted: 1 });
  let preparations = 0;
  const proposal = proposeDeterministic('刷 2-8 材料 3次', (draft) => {
    preparations++;
    expect(draft).toEqual({
      id: '',
      name: '2-8 材料补给',
      tasks: [{ type: 'Fight', params: { stage: '2-8', times: 3 } }],
    });
    return prepared;
  });
  expect(preparations).toBe(1);
  expect(proposal.plan).toBe(prepared);
  expect(proposal.requiresConfirmation).toBe(true);
  expect(proposal.mode).toBe('mock');
  expect(proposal.reply).toContain('未调用云端模型');
});

test('invalid input is rejected before any host capability is called', () => {
  let preparations = 0;
  for (const message of [null, '  ', '\u001c', '\u001c\u0085 ', '😀'.repeat(4001)]) {
    expect(() =>
      proposeDeterministic(message, () => {
        preparations++;
      }),
    ).toThrow(AgentInputError);
  }
  expect(preparations).toBe(0);
});

test('shared input validation preserves supplementary code points and legacy whitespace', () => {
  const maximum = '😀'.repeat(4000);
  expect(validateAgentMessage(maximum)).toBe(maximum);
  expect(validateAgentMessage('\ufeff')).toBe('\ufeff');
  expect(() => validateAgentMessage('\u001c')).toThrow(AgentInputError);
  const proposal = proposeDeterministic('刷 𝟚-𝟠 1٢３次', (draft) => draft);
  expect(proposal.plan).toMatchObject({ tasks: [{ params: { stage: '𝟚-𝟠', times: 123 } }] });
});

test('host rejection is preserved and no unvalidated proposal escapes', () => {
  const rejection = Object.assign(new Error('synthetic policy rejected the draft'), {
    reason: 'quota',
  });
  let received: unknown;
  try {
    proposeDeterministic('做日常', () => {
      throw rejection;
    });
  } catch (error) {
    received = error;
  }
  expect(received).toBe(rejection);
});
