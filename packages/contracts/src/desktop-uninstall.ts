import type { DesktopUninstallInfo } from './types';
import { validateDesktopUninstallInfo } from './validators.js';

async function invokeUninstall<T>(
  command: 'get_desktop_uninstall_info' | 'uninstall_desktop_application',
): Promise<T> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window))
    throw new Error('卸载操作仅在桌面应用中可用');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command);
}

export async function getDesktopUninstallInfo(): Promise<DesktopUninstallInfo> {
  const info = await invokeUninstall<unknown>('get_desktop_uninstall_info');
  if (!validateDesktopUninstallInfo(info)) throw new Error('卸载信息无效，请重新打开应用后重试');
  return info;
}

export function uninstallDesktopApplication(): Promise<void> {
  return invokeUninstall('uninstall_desktop_application');
}
