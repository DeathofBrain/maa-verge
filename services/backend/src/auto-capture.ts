/** Configure only verified running instances whose bundled screenshot SDK exists. */
import { statSync } from 'node:fs';
import path from 'node:path';
import type { Settings } from './models';
import { defaultCapture } from './models';
import { emulatorInstanceForAddress } from './adb';
import type { EmulatorInventory, EmulatorInstance } from './windows-emulators';

export function automaticCaptureEnabled(capture: Settings['capture']): boolean {
  return capture?.autoDetect ?? (!capture || capture.method === 'adb');
}

export function automaticCapture(capture: Settings['capture'], address: string, inventory: EmulatorInventory, platform = process.platform,
  file = (value: string) => { try { return statSync(value).isFile(); } catch { return false; } }): { capture: NonNullable<Settings['capture']>; instance?: EmulatorInstance; config?: 'MuMuEmulator12' | 'LDPlayer' } | undefined {
  if (!automaticCaptureEnabled(capture)) return;
  const instance = emulatorInstanceForAddress(address, inventory);
  if (platform === 'win32' && instance) {
    const kind = instance.kind ?? 'mumu';
    const available = kind === 'mumu'
      ? ['nx_device/15.0/shell/sdk', 'nx_device/12.0/shell/sdk', 'shell/sdk'].some(relative => file(path.join(instance.emulatorPath, relative, 'external_renderer_ipc.dll')))
      : file(path.join(instance.emulatorPath, 'ldopengl64.dll'));
    if (available) return { capture: { method: kind, emulatorPath: instance.emulatorPath, instanceIndex: instance.index, autoDetect: true }, instance,
      config: kind === 'mumu' ? 'MuMuEmulator12' : 'LDPlayer' };
  }
  // An already selected enhanced driver must not silently downgrade on a later
  // failed inspection. First-time unsupported devices keep ordinary ADB.
  if (capture && capture.method !== 'adb') throw new Error('无法确认已自动配置的增强截图实例或 SDK；请启动对应实例后重连，或手动选择 ADB 截图');
  return { capture: { ...defaultCapture(), autoDetect: true } };
}
