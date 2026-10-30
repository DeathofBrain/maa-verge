import type { Plan } from './types';

/** Explicit bindings take precedence; old saved plans retain their single binding. */
export function planDeviceIds(plan: Pick<Plan, 'deviceId' | 'deviceIds'>): readonly string[] {
  return plan.deviceIds ?? (plan.deviceId ? [plan.deviceId] : []);
}

/** An unbound plan can be used on any device chosen for that execution. */
export function planAllowsDevice(
  plan: Pick<Plan, 'deviceId' | 'deviceIds'>,
  deviceId: string,
): boolean {
  const bindings = planDeviceIds(plan);
  return !bindings.length || bindings.includes(deviceId);
}
