import { expect, test } from 'bun:test';
import { propose } from '../src/modules/agent/agent';
import { RpcError } from '../src/shared/errors';
import { parseSettings } from '../src/modules/settings/models';
import { nativeTask, validatePlan } from '../src/modules/plans/task-policy';
import { taskConsumableLimits } from '../../../packages/contracts/src/task-policy';

test('backend prepares the domain plan before policy checks and keeps zero default consumption', () => {
  const settings = parseSettings();
  expect(settings.budgets).toEqual({ originium: 0, medicine: 0, expedited: 0 });
  let validations = 0;
  const proposal = propose('刷 2-8 3次', (plan) => {
    validations++;
    expect(plan).toMatchObject({
      id: '',
      description: '',
      deviceId: null,
      group: 'daily',
      budgets: null,
      schedule: null,
      enabled: true,
    });
    expect(plan.tasks[0].enabled).toBe(true);
    validatePlan(plan, settings);
  });
  expect(validations).toBe(1);
  expect(taskConsumableLimits(proposal.plan)).toEqual({ originium: 0, medicine: 0, expedited: 0 });
  expect(nativeTask(proposal.plan.tasks[0]).params).toMatchObject({
    stone: 0,
    medicine: 0,
    expiring_medicine: 0,
  });
  expect(proposal.requiresConfirmation).toBe(true);
});

test('the adapter preserves policy failures from the real validator', () => {
  let received: unknown;
  try {
    propose('刷 2-8 3次', (plan) => {
      plan.tasks[0].params.expiring_medicine = 1;
      validatePlan(plan, parseSettings());
    });
  } catch (error) {
    received = error;
  }
  expect(received).toBeInstanceOf(RpcError);
  expect(received).toMatchObject({
    code: -32010,
    message: '当前核心的临期理智药不受数量限制，暂不能在有限预算下启用',
  });
});

test('package input errors map to the existing invalid-params response', () => {
  let validations = 0;
  let received: unknown;
  try {
    propose('\u001c', () => {
      validations++;
    });
  } catch (error) {
    received = error;
  }
  expect(validations).toBe(0);
  expect(received).toBeInstanceOf(RpcError);
  expect((received as RpcError).asDict()).toEqual({
    code: -32602,
    message: '请输入 1 到 4000 字的目标',
  });
});

test('application errors retain their identity, code and diagnostic data', () => {
  const rejection = new RpcError(-32010, 'synthetic authorization rejection', {
    rule: 'read-only',
  });
  let received: unknown;
  try {
    propose('做日常', () => {
      throw rejection;
    });
  } catch (error) {
    received = error;
  }
  expect(received).toBe(rejection);
  expect((received as RpcError).asDict()).toEqual({
    code: -32010,
    message: rejection.message,
    data: { rule: 'read-only' },
  });
});
