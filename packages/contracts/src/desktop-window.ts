export type DesktopPlatform = 'windows' | 'macos' | 'linux';

export function desktopPlatform(): DesktopPlatform | null {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return null;
  const platform = navigator.platform.toLowerCase();
  return platform.includes('mac') ? 'macos' : platform.includes('win') ? 'windows' : 'linux';
}

async function currentWindow() {
  if (!desktopPlatform()) throw new Error('窗口操作仅在桌面应用中可用');
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export async function minimizeWindow(): Promise<void> {
  await (await currentWindow()).minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  await (await currentWindow()).toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  // A normal close request preserves the host's close-to-tray preference.
  await (await currentWindow()).close();
}

export async function syncWindowTheme(theme: 'light' | 'dark'): Promise<void> {
  if (!desktopPlatform()) return;
  const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  // Match the page behind the WebView during native resize/repaint.
  await getCurrentWebviewWindow().setBackgroundColor(theme === 'dark' ? '#191d26' : '#f5f7fa');
}

export function subscribeWindowMaximized(onChange: (maximized: boolean) => void, onError: (error: unknown) => void): () => void {
  let disposed = false;
  let unlisten: (() => void) | undefined;
  let revision = 0;
  void currentWindow().then(async (host) => {
    const refresh = async () => {
      const request = ++revision;
      try {
        const maximized = await host.isMaximized();
        if (!disposed && revision === request) onChange(maximized);
      } catch (error) { if (!disposed) onError(error); }
    };
    const dispose = await host.onResized(() => { void refresh(); });
    if (disposed) { dispose(); return; }
    unlisten = dispose;
    await refresh();
  }).catch((error: unknown) => { if (!disposed) onError(error); });
  return () => { disposed = true; unlisten?.(); };
}
