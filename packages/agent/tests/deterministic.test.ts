import { expect, test } from 'bun:test';
import { AgentInputError, proposeDeterministic, validateAgentMessage } from '../src';

test('standalone proposals return only the host-prepared plan and require review', () => {
  const prepared = Object.freeze({ reviewedBy: 'synthetic-host', tasksAccepted: 1 });
  let preparations = 0;
  const proposal = proposeDeterministic('刷 2-8 3次', draft => {
    preparations++;
    expect(draft).toEqual({ id: '', name: '2-8 材料补给', tasks: [{ type: 'Fight', params: { stage: '2-8', times: 3 } }] });
    return prepared;
  });
  expect(preparations).toBe(1);
  expect(proposal.plan).toBe(prepared);
  expect(proposal.requiresConfirmation).toBe(true);
  expect(proposal.mode).toBe('mock');
});

test('invalid input is rejected before any host capability is called', () => {
  let preparations = 0;
  for (const message of [null, '\u001c\u0085 ', '😀'.repeat(4001)]) {
    expect(() => proposeDeterministic(message, () => { preparations++; })).toThrow(AgentInputError);
  }
  expect(preparations).toBe(0);
});

test('shared input validation preserves supplementary code points and legacy whitespace', () => {
  const maximum = '😀'.repeat(4000);
  expect(validateAgentMessage(maximum)).toBe(maximum);
  expect(validateAgentMessage('\ufeff')).toBe('\ufeff');
  expect(() => validateAgentMessage('\u001c')).toThrow(AgentInputError);
  const proposal = proposeDeterministic('刷 𝟚-𝟠 1٢３次', draft => draft);
  expect(proposal.plan).toMatchObject({ tasks: [{ params: { stage: '𝟚-𝟠', times: 123 } }] });
});

test('host rejection is preserved and no unvalidated proposal escapes', () => {
  const rejection = Object.assign(new Error('synthetic policy rejected the draft'), { reason: 'quota' });
  let received: unknown;
  try {
    proposeDeterministic('做日常', () => { throw rejection; });
  } catch (error) { received = error; }
  expect(received).toBe(rejection);
});
