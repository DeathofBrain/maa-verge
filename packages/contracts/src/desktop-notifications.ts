export type NotificationPermission = 'granted' | 'denied' | 'prompt';
export type DesktopNotificationStatus = { permission: NotificationPermission };

function requireDesktop() {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window))
    throw new Error('系统通知仅在桌面应用中可用');
}

export async function desktopNotificationStatus(
  requestPermission = false,
): Promise<DesktopNotificationStatus> {
  requireDesktop();
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<DesktopNotificationStatus>('desktop_notification_status', { requestPermission });
}

/** The host owns the fixed test message; callers cannot send arbitrary system notices. */
export async function sendTestNotification(): Promise<void> {
  requireDesktop();
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('desktop_test_notification');
}
