import type { Plan, Settings, Task, Snapshot } from '../../../packages/contracts/src/types';
import { validatePlan, validateSettings, validateSnapshot } from '../../../packages/contracts/src/validators.js';
import { RpcError } from './errors';
import { validateInfrastructureProfiles } from './home-info';
export type { Plan, Settings, Task, Snapshot };
export const defaultBudgets = () => ({ originium: 0, medicine: 0, expedited: 0 });
export const defaultCapture = () => ({ method: 'adb' as const, emulatorPath: '', instanceIndex: 0 });
export const defaultConnection = () => ({ adbPath: '', address: '', config: 'General' as const, touchMode: 'minitouch' as const, adbLite: false, clientType: 'Official' as const });
function record(value: any): value is Record<string, any> { return value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
// Preserve the Python model's documented scalar coercions at the RPC boundary;
// task params remain untouched and are checked strictly by task-policy.ts.
function boolean(value: any): any {
  if (value === 0 || value === 1) return Boolean(value);
  if (typeof value !== 'string') return value;
  const text = value.toLowerCase();
  if (['0', 'off', 'f', 'false', 'n', 'no'].includes(text)) return false;
  if (['1', 'on', 't', 'true', 'y', 'yes'].includes(text)) return true;
  return value;
}
function integer(value: any): any {
  if (typeof value === 'boolean') return Number(value);
  if (typeof value !== 'string') return value;
  const text = value.replace(/^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu, '');
  return /^[+-]?[0-9]+(?:_[0-9]+)*(?:\.0+)?$/.test(text) ? Number(text.replaceAll('_', '')) : value;
}
function budgets(value: any): any {
  if (!record(value)) return value;
  const result = { ...defaultBudgets(), ...value };
  for (const key of ['originium', 'medicine', 'expedited'] as const) result[key] = integer(result[key]);
  return result;
}
export function parsePlan(input: any): Plan {
  if (!record(input)) throw new RpcError(-32602, '请求参数无效');
  const value = { id: '', description: '', deviceId: null, group: 'daily', budgets: null, schedule: null, enabled: true, ...input,
    tasks: Array.isArray(input.tasks) ? input.tasks.map((task: any) => {
      if (!record(task)) return task;
      const result = { params: {}, enabled: true, ...task };
      if (!record(result.params)) throw new RpcError(-32602, '请求参数无效');
      result.enabled = boolean(result.enabled);
      return result;
    }) : input.tasks };
  value.enabled = boolean(value.enabled);
  value.budgets = budgets(value.budgets);
  if (!validatePlan(value)) throw new RpcError(-32602, '请求参数无效', validatePlan.errors);
  return value as Plan;
}
export function parseSettings(input: any = {}): Settings {
  if (!record(input)) throw new RpcError(-32602, '请求参数无效');
  const value = { autoConnect: true, autoUpdateCore: true, autoUpdateResource: true, minimizeToTray: true, theme: 'system', ...input,
    ...(Object.hasOwn(input, 'capture') ? { capture: record(input.capture) ? { ...defaultCapture(), ...input.capture } : input.capture } : {}),
    ...(Object.hasOwn(input, 'connection') ? { connection: record(input.connection) ? { ...defaultConnection(), ...input.connection } : input.connection } : {}),
    budgets: Object.hasOwn(input, 'budgets') ? budgets(input.budgets) : defaultBudgets(),
    model: Object.hasOwn(input, 'model') ? record(input.model) ? { provider: 'none', baseUrl: '', model: '', ...input.model } : input.model : { provider: 'none', baseUrl: '', model: '' } };
  for (const key of ['autoConnect', 'autoUpdateCore', 'autoUpdateResource', 'minimizeToTray'] as const) value[key] = boolean(value[key]);
  if (!validateSettings(value)) throw new RpcError(-32602, '请求参数无效', validateSettings.errors);
  validateInfrastructureProfiles(value.infrastructureEstimates);
  if ((value.capture?.mumuTouch || value.capture?.mumuBridge) && value.capture.method !== 'mumu') throw new RpcError(-32602, 'MuMu 触控增强和网络桥接需要启用 MuMu 截图增强');
  return value as Settings;
}
export function parseSnapshot(value: unknown): Snapshot {
  if (!validateSnapshot(value)) throw new Error('本地状态不符合通信契约: ' + JSON.stringify(validateSnapshot.errors));
  return value as Snapshot;
}
