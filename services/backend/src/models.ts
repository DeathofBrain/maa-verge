import type { Plan, Settings, Task, Snapshot } from '../../../packages/contracts/src/types';
import { validatePlan, validateSettings, validateSnapshot } from '../../../packages/contracts/src/validators.js';
import { RpcError } from './errors';
export type { Plan, Settings, Task, Snapshot };
export const defaultBudgets = () => ({ originium: 0, medicine: 0, expedited: 0 });
export function parsePlan(input: any): Plan {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RpcError(-32602, '请求参数无效');
  const value = { id: '', description: '', deviceId: null, group: 'daily', budgets: null, schedule: null, enabled: true, ...input,
    tasks: Array.isArray(input.tasks) ? input.tasks.map((t: any) => ({ params: {}, enabled: true, ...t })) : input.tasks };
  if (value.budgets && typeof value.budgets === 'object') value.budgets = { ...defaultBudgets(), ...value.budgets };
  if (!validatePlan(value)) throw new RpcError(-32602, '请求参数无效', validatePlan.errors);
  return value as Plan;
}
export function parseSettings(input: any = {}): Settings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RpcError(-32602, '请求参数无效');
  const value = { autoConnect: true, autoUpdateCore: true, autoUpdateResource: true, minimizeToTray: true, theme: 'system', ...input,
    budgets: input.budgets === null ? null : { ...defaultBudgets(), ...input.budgets },
    model: input.model === null ? null : { provider: 'none', baseUrl: '', model: '', ...input.model } };
  if (!validateSettings(value)) throw new RpcError(-32602, '请求参数无效', validateSettings.errors);
  return value as Settings;
}
export function parseSnapshot(value: unknown): Snapshot {
  if (!validateSnapshot(value)) throw new Error('本地状态不符合通信契约: ' + JSON.stringify(validateSnapshot.errors));
  return value as Snapshot;
}
