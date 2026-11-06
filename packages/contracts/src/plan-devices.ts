import type { Plan } from './types';

/** 多设备字段优先；显式空数组表示不绑定设备，只有缺省时才兼容旧单设备字段。 */
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
