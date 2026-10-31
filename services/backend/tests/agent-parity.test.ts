import { expect, test } from 'bun:test';
import { propose } from '@backend/modules/agent/agent';
import { RpcError } from '@backend/shared/errors';
import { parseSettings } from '@backend/modules/settings/models';
import { validatePlan } from '@backend/modules/plans/task-policy';

type Expected = 'daily' | { stage: string; times: number } | { error: number };
type Fixture = { name: string; message: unknown; expected: Expected };
const fixtures: Fixture[] = [
  { name: 'daily proposal', message: '做日常', expected: 'daily' },
  { name: 'spaced stage', message: '刷 2-8 材料 3次', expected: { stage: '2-8', times: 3 } },
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
  { name: 'information separator alone is empty', message: '\u001c', expected: { error: -32602 } },
  { name: 'BOM alone remains nonempty', message: '\ufeff', expected: 'daily' },
  { name: 'spaces alone rejected', message: '  ', expected: { error: -32602 } },
  { name: 'null message rejected', message: null, expected: { error: -32602 } },
  {
    name: '4000 supplementary code points accepted',
    message: '😀'.repeat(4000),
    expected: 'daily',
  },
  {
    name: '4001 supplementary code points rejected',
    message: '😀'.repeat(4001),
    expected: { error: -32602 },
  },
  {
    name: 'local proposal remains available without a device',
    message: '做日常',
    expected: 'daily',
  },
  { name: 'text validation remains required', message: '  ', expected: { error: -32602 } },
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

for (const fixture of fixtures)
  test(fixture.name, () => {
    let validations = 0;
    try {
      const value = propose(fixture.message, (plan) => {
        validations++;
        validatePlan(plan, parseSettings());
      });
      expect(fixture.expected).not.toHaveProperty('error');
      expect(validations).toBe(1);
      expect(value).toMatchObject({ requiresConfirmation: true, mode: 'mock', plan: { id: '' } });
      expect(value.reply).toContain('未调用云端模型');
      if (fixture.expected === 'daily') {
        expect(value.plan.name).toBe('Agent 日常计划');
        expect(value.plan.tasks).toEqual(
          (['StartUp', 'Recruit', 'Infrast', 'Mall', 'Award'] as const).map((type) => ({
            type,
            params: {},
            enabled: true,
          })),
        );
        expect(value.plan.budgets).toBeNull();
      } else if ('stage' in fixture.expected) {
        expect(value.plan.name).toBe(fixture.expected.stage + ' 材料补给');
        expect(value.plan.tasks).toEqual([
          { type: 'Fight', params: fixture.expected, enabled: true },
        ]);
      }
    } catch (error) {
      expect(fixture.expected).toHaveProperty('error');
      expect(error).toBeInstanceOf(RpcError);
      expect((error as RpcError).code).toBe((fixture.expected as { error: number }).error);
      expect(validations).toBe(0);
    }
  });
