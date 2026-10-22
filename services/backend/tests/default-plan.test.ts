import { expect, test } from 'bun:test';
import { createDefaultDailyTasks, nextPlanName } from '../../../packages/contracts/src/tasks';
import { parsePlan, parseSettings } from '../src/models';
import { validatePlan } from '../src/task-policy';

test('the upstream daily template passes runtime policy with zero consumable budgets and independent parameters', () => {
  const first = parsePlan({ name: nextPlanName(['日常表1', '日常表2']), tasks: createDefaultDailyTasks() });
  expect(first.name).toBe('日常表3');
  expect(() => validatePlan(first, parseSettings())).not.toThrow();
  const second = createDefaultDailyTasks();
  (first.tasks.find((task) => task.type === 'Infrast')!.params.facility as string[]).pop();
  expect(second.find((task) => task.type === 'Infrast')!.params.facility).toHaveLength(11);
  expect(nextPlanName(['专项表1', '日常表1'], 'specialized')).toBe('专项表2');
});
