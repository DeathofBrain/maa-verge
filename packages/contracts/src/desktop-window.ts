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
  // The host asks for a close action unless the user has remembered a choice.
  await (await currentWindow()).close();
}

export type DesktopLifecycle = 'running' | 'close-requested' | 'exiting';
export type WindowCloseAction = 'tray' | 'exit' | 'cancel';

export async function resolveWindowClose(action: WindowCloseAction): Promise<void> {
  if (!desktopPlatform()) throw new Error('窗口操作仅在桌面应用中可用');
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('resolve_window_close', { action });
}

export async function acknowledgeDesktopExit(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('exit_ui_ready');
}

export function subscribeDesktopLifecycle(onChange: (state: DesktopLifecycle) => void, onError: (error: unknown) => void): () => void {
  if (!desktopPlatform()) return () => {};
  let disposed = false;
  let revision = 0;
  const listeners: (() => void)[] = [];
  void (async () => {
    const { listen } = await import('@tauri-apps/api/event');
    for (const [event, state] of [['window-close-requested', 'close-requested'], ['app-exit-started', 'exiting']] as const) {
      const unlisten = await listen(event, () => { revision++; if (!disposed) onChange(state); });
      if (disposed) { unlisten(); return; }
      listeners.push(unlisten);
    }
    const request = revision;
    const { invoke } = await import('@tauri-apps/api/core');
    const state = await invoke<DesktopLifecycle>('get_desktop_lifecycle');
    if (!disposed && request === revision) onChange(state);
  })().catch((error: unknown) => { if (!disposed) onError(error); });
  return () => { disposed = true; listeners.splice(0).forEach((unlisten) => unlisten()); };
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
