import type { Plan, Settings, Task, Snapshot } from '@contracts/types';
import { validatePlan, validateSettings, validateSnapshot } from '@contracts/validators.js';
import { normalizeDeviceAddress } from '@contracts/device-profiles';
import { RpcError } from '@backend/shared/errors';
import { validateDeviceProfiles } from '@backend/modules/devices/device-profiles';
import { validateInfrastructureProfiles } from '@backend/modules/home/home-info';
import { normalizeComponentPath } from '@backend/infrastructure/config';
import {
  normalizeManualProxy,
  ProxyConfigurationError,
} from '@backend/infrastructure/network/network-proxy';
export type { Plan, Settings, Task, Snapshot };
export type { DeviceConnectionProfile } from '@contracts/types';
export const defaultBudgets = () => ({ originium: 0, medicine: 0, expedited: 0 });
export const defaultMirrorChyan = () => ({ enabled: true, cdk: '' });
export const defaultNotifications = () => ({
  enabled: true,
  runResults: true,
  deviceErrors: true,
  updates: true,
  schedules: true,
});
export const defaultCapture = () => ({
  method: 'adb' as const,
  emulatorPath: '',
  instanceIndex: 0,
});
export const defaultConnection = () => ({
  adbPath: '',
  address: '',
  config: 'General' as const,
  touchMode: 'maatouch' as const,
  adbLite: false,
  clientType: 'Official' as const,
});
function record(value: any): value is Record<string, any> {
  return (
    value !== null &&
    typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  );
}
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
  const text = value.replace(
    /^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu,
    '',
  );
  return /^[+-]?[0-9]+(?:_[0-9]+)*(?:\.0+)?$/.test(text) ? Number(text.replaceAll('_', '')) : value;
}
function budgets(value: any): any {
  if (!record(value)) return value;
  const result = { ...defaultBudgets(), ...value };
  for (const key of ['originium', 'medicine', 'expedited'] as const)
    result[key] = integer(result[key]);
  return result;
}
export function parsePlan(input: any): Plan {
  if (!record(input)) throw new RpcError(-32602, '请求参数无效');
  const value = {
    id: '',
    description: '',
    deviceId: null,
    group: 'daily',
    budgets: null,
    schedule: null,
    enabled: true,
    ...input,
    tasks: Array.isArray(input.tasks)
      ? input.tasks.map((task: any) => {
          if (!record(task)) return task;
          const result = { params: {}, enabled: true, ...task };
          if (!record(result.params)) throw new RpcError(-32602, '请求参数无效');
          result.enabled = boolean(result.enabled);
          return result;
        })
      : input.tasks,
  };
  value.enabled = boolean(value.enabled);
  value.budgets = budgets(value.budgets);
  if (!validatePlan(value)) throw new RpcError(-32602, '请求参数无效', validatePlan.errors);
  const deviceIds = input.deviceIds ?? (value.deviceId ? [value.deviceId] : []);
  // Plan-level enablement is retired; keep the wire field for older clients.
  // Task and schedule enablement remain independent controls.
  return {
    ...value,
    enabled: true,
    deviceIds: [...deviceIds],
    deviceId: deviceIds[0] ?? null,
  } as Plan;
}
export function parseSettings(input: any = {}): Settings {
  if (!record(input)) throw new RpcError(-32602, '请求参数无效');
  const value = {
    autoConnect: true,
    autoUpdateApp: true,
    appUpdateChannel: 'preview',
    coreUpdateChannel: 'stable',
    autoUpdateCore: true,
    autoUpdateResource: true,
    minimizeToTray: true,
    rememberCloseAction: false,
    theme: 'system',
    logRetentionDays: 7,
    ...input,
    mirrorChyan: Object.hasOwn(input, 'mirrorChyan')
      ? record(input.mirrorChyan)
        ? { ...defaultMirrorChyan(), ...input.mirrorChyan }
        : input.mirrorChyan
      : defaultMirrorChyan(),
    notifications: Object.hasOwn(input, 'notifications')
      ? record(input.notifications)
        ? { ...defaultNotifications(), ...input.notifications }
        : input.notifications
      : defaultNotifications(),
    ...(Object.hasOwn(input, 'capture')
      ? {
          capture: record(input.capture)
            ? { ...defaultCapture(), ...input.capture }
            : input.capture,
        }
      : {}),
    ...(Object.hasOwn(input, 'connection')
      ? {
          connection: record(input.connection)
            ? {
                ...defaultConnection(),
                ...input.connection,
                ...(typeof input.connection.address === 'string'
                  ? { address: normalizeDeviceAddress(input.connection.address) }
                  : {}),
              }
            : input.connection,
        }
      : {}),
    ...(Object.hasOwn(input, 'deviceProfiles')
      ? {
          deviceProfiles: Array.isArray(input.deviceProfiles)
            ? input.deviceProfiles.map((profile: any) =>
                record(profile)
                  ? {
                      ...profile,
                      name: typeof profile.name === 'string' ? profile.name.trim() : profile.name,
                      address:
                        typeof profile.address === 'string'
                          ? normalizeDeviceAddress(profile.address.trim())
                          : profile.address,
                      connection: record(profile.connection)
                        ? {
                            ...defaultConnection(),
                            ...profile.connection,
                            address:
                              typeof profile.address === 'string'
                                ? normalizeDeviceAddress(profile.address.trim())
                                : profile.address,
                          }
                        : profile.connection,
                      capture: record(profile.capture)
                        ? { ...defaultCapture(), ...profile.capture }
                        : profile.capture,
                    }
                  : profile,
              )
            : input.deviceProfiles,
        }
      : {}),
    budgets: Object.hasOwn(input, 'budgets') ? budgets(input.budgets) : defaultBudgets(),
    model: Object.hasOwn(input, 'model')
      ? record(input.model)
        ? { provider: 'none', baseUrl: '', model: '', ...input.model }
        : input.model
      : { provider: 'none', baseUrl: '', model: '' },
  };
  for (const key of [
    'autoConnect',
    'autoUpdateApp',
    'autoUpdateCore',
    'autoUpdateResource',
    'minimizeToTray',
    'rememberCloseAction',
  ] as const)
    value[key] = boolean(value[key]);
  if (!validateSettings(value)) throw new RpcError(-32602, '请求参数无效', validateSettings.errors);
  value.mirrorChyan.cdk = value.mirrorChyan.cdk.trim();
  if (value.downloadProxy) {
    const proxy = { ...value.downloadProxy, url: value.downloadProxy.url.trim() };
    if (proxy.mode === 'manual') {
      try {
        proxy.url = normalizeManualProxy(proxy.url);
      } catch (error) {
        // Only the shared validator's static diagnostic may cross the RPC boundary.
        throw new RpcError(
          -32602,
          error instanceof ProxyConfigurationError
            ? error.message
            : '手动下载代理地址无效，请检查代理地址和端口',
        );
      }
    } else proxy.url = '';
    value.downloadProxy = proxy;
  }
  if (value.copilotStorage)
    try {
      value.copilotStorage = {
        ...value.copilotStorage,
        directory: normalizeComponentPath(value.copilotStorage.directory),
      };
    } catch {
      throw new RpcError(-32602, '作业 JSON 目录必须使用完整的绝对路径，留空恢复默认位置');
    }
  if (value.componentPaths) {
    try {
      value.componentPaths = {
        core: normalizeComponentPath(value.componentPaths.core),
        resource: normalizeComponentPath(value.componentPaths.resource),
      };
    } catch (error) {
      throw new RpcError(-32602, error instanceof Error ? error.message : String(error));
    }
  }
  validateInfrastructureProfiles(value.infrastructureEstimates);
  if ((value.capture?.mumuTouch || value.capture?.mumuBridge) && value.capture.method !== 'mumu')
    throw new RpcError(-32602, 'MuMu 触控增强和网络桥接需要启用 MuMu 截图增强');
  validateDeviceProfiles(value.deviceProfiles);
  return value as Settings;
}
export function parseSnapshot(value: unknown): Snapshot {
  if (!validateSnapshot(value))
    throw new Error('本地状态不符合通信契约: ' + JSON.stringify(validateSnapshot.errors));
  return value as Snapshot;
}
