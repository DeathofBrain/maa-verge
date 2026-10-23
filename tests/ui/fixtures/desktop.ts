import { expect, test as base, type Page } from '@playwright/test';

type ClickRequest = { deviceId: string; frameId: string; x: number; y: number; requestId: string };
export type RuntimeHarness = {
  commands: string[];
  backgrounds: { command: string; value: unknown }[];
  releaseSnapshot: () => void;
  emitResize: (maximized: boolean) => void;
  emitEvent: (type: string, data?: Record<string, unknown>) => void;
  resizeListeners: () => number;
  emitDesktopEvent: (event: 'window-close-requested' | 'app-exit-started' | 'runtime-disconnected') => void;
  failSettings: boolean;
  settingsWrites: number;
  frames: string[];
  clicks: ClickRequest[];
  activeFrames: number;
  maxPerDevice: number;
  failFrames: boolean;
  failClicks: boolean;
  holdFrames: boolean;
  releaseFrames: () => void;
  visibility: (hidden: boolean) => void;
  call: (method: string, params: Record<string, unknown>) => Promise<unknown>;
};
export type HarnessWindow = Window & { runtimeHarness: RuntimeHarness };
type RuntimeOptions = {
  runtimeBridge: boolean;
  runtimeHoldSnapshot: boolean;
  runtimePlatform: 'windows' | 'macos' | 'linux';
};

// Browser tests inject a desktop bridge explicitly. Product code has no test
// selector and never imports this bridge or its deterministic runtime fixture.
export async function installRuntimeBridge(page: Page, options: Omit<RuntimeOptions, 'runtimeBridge'>) {
  const entry = await page.request.get('/@id/@maaverge/contracts');
  expect(entry.ok()).toBeTruthy();
  const transport = (await entry.text()).match(/from\s+["']([^"']+\/transport\.ts(?:\?[^"']*)?)["']/)?.[1];
  if (!transport) throw new Error('Cannot locate the running Vite workspace');
  const runtimeModuleUrl = new URL('../../../tests/ui/fixtures/runtime.ts', new URL(transport, entry.url())).href;
  await page.addInitScript(({ runtimeModuleUrl, runtimeHoldSnapshot, runtimePlatform }) => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: runtimePlatform === 'macos' ? 'MacIntel' : runtimePlatform === 'windows' ? 'Win32' : 'Linux x86_64' });
    const callbacks = new Map<number, (event: unknown) => void>();
    const listeners = new Map<number, { event: string; handler: number }>();
    const inFlight = new Map<string, number>();
    const heldFrames: (() => void)[] = [];
    let sequence = 0;
    let subscribed = false;
    let maximized = false;
    let lifecycle: 'running' | 'close-requested' | 'exiting' = 'running';
    let releaseSnapshot!: () => void;
    const snapshotReady = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
    if (!runtimeHoldSnapshot) releaseSnapshot();
    const target = window as unknown as HarnessWindow & { __TAURI_INTERNALS__: unknown; __TAURI_EVENT_PLUGIN_INTERNALS__: unknown };
    const loadFixture = async () => {
      const fixture = await import(runtimeModuleUrl);
      if (!subscribed) {
        subscribed = true;
        fixture.onFixtureEvent((event: unknown) => {
          for (const [id, listener] of listeners) if (listener.event === 'runtime-event') callbacks.get(listener.handler)?.({ event: listener.event, id, payload: event });
        });
      }
      return fixture;
    };
    const harness: RuntimeHarness = {
      commands: [], backgrounds: [], releaseSnapshot,
      failSettings: false, settingsWrites: 0,
      frames: [], clicks: [], activeFrames: 0, maxPerDevice: 0,
      failFrames: false, failClicks: false, holdFrames: false,
      emitResize: (next) => {
        maximized = next;
        for (const [id, listener] of listeners) if (listener.event === 'tauri://resize') callbacks.get(listener.handler)?.({ event: listener.event, id, payload: { width: next ? 1600 : 1280, height: 900 } });
      },
      emitEvent: (type, data = {}) => {
        const payload = { id: ++sequence, type, data, message: '合成事件', createdAt: new Date().toISOString() };
        for (const [id, listener] of listeners) if (listener.event === 'runtime-event') callbacks.get(listener.handler)?.({ event: listener.event, id, payload });
      },
      resizeListeners: () => [...listeners.values()].filter((listener) => listener.event === 'tauri://resize').length,
      emitDesktopEvent: (event) => {
        if (event === 'app-exit-started') lifecycle = 'exiting';
        else if (event === 'window-close-requested' && lifecycle !== 'exiting') lifecycle = 'close-requested';
        for (const [id, listener] of listeners) if (listener.event === event) callbacks.get(listener.handler)?.({ event, id, payload: null });
      },
      releaseFrames: () => { harness.holdFrames = false; heldFrames.splice(0).forEach((release) => release()); },
      visibility: (hidden) => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
        document.dispatchEvent(new Event('visibilitychange'));
      },
      call: async (method, params) => (await loadFixture()).fixtureRpc(method, params),
    };
    target.runtimeHarness = harness;
    target.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: (callback: (event: unknown) => void) => { const id = ++sequence; callbacks.set(id, callback); return id; },
      unregisterCallback: (id: number) => callbacks.delete(id),
      invoke: async (command: string, args: Record<string, unknown> = {}) => {
        if (command === 'runtime_request') {
          const params = args.params as Record<string, unknown>;
          if (args.method === 'settings.save') {
            harness.settingsWrites++;
            if (harness.failSettings) throw new Error('合成设置保存失败');
          }
          if (args.method === 'app.snapshot') await snapshotReady;
          if (args.method === 'device.frame') {
            const id = String(params.deviceId);
            harness.frames.push(id); harness.activeFrames++;
            inFlight.set(id, (inFlight.get(id) || 0) + 1);
            harness.maxPerDevice = Math.max(harness.maxPerDevice, inFlight.get(id)!);
            try {
              if (harness.holdFrames) await new Promise<void>((resolve) => heldFrames.push(resolve));
              if (harness.failFrames) throw new Error('合成截图故障');
              return await harness.call('device.frame', params);
            } finally { harness.activeFrames--; inFlight.set(id, inFlight.get(id)! - 1); }
          }
          if (args.method === 'device.click') {
            harness.clicks.push(params as ClickRequest);
            if (harness.failClicks) throw new Error('合成点击超时');
          }
          return harness.call(String(args.method), params);
        }
        if (command === 'plugin:event|listen') {
          const id = ++sequence; listeners.set(id, { event: args.event as string, handler: args.handler as number }); return id;
        }
        if (command === 'plugin:event|unlisten') { listeners.delete(args.eventId as number); return; }
        if (command === 'plugin:window|is_maximized') return maximized;
        if (command === 'get_desktop_lifecycle') return lifecycle;
        if (command === 'exit_ui_ready') { harness.commands.push(command); return; }
        if (command === 'resolve_window_close') {
          harness.commands.push(`${command}:${args.action}`);
          if (args.action === 'exit') harness.emitDesktopEvent('app-exit-started');
          else if (lifecycle !== 'exiting') lifecycle = 'running';
          return;
        }
        if (['plugin:window|set_background_color', 'plugin:webview|set_webview_background_color'].includes(command)) { harness.backgrounds.push({ command, value: args.value }); return; }
        if (['plugin:window|minimize', 'plugin:window|toggle_maximize', 'plugin:window|close'].includes(command)) {
          harness.commands.push(command);
          if (command === 'plugin:window|close' && lifecycle !== 'exiting') {
            const { settings } = await harness.call('app.snapshot', {}) as { settings: { rememberCloseAction?: boolean; minimizeToTray: boolean } };
            if (!settings.rememberCloseAction) harness.emitDesktopEvent('window-close-requested');
            else if (!settings.minimizeToTray) harness.emitDesktopEvent('app-exit-started');
          }
          return;
        }
        throw new Error(`Unexpected desktop command: ${command}`);
      },
    };
    target.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_event: string, id: number) => { const listener = listeners.get(id); if (listener) callbacks.delete(listener.handler); },
    };
  }, { runtimeModuleUrl, ...options });
}

export const test = base.extend<RuntimeOptions>({
  runtimeBridge: [true, { option: true }],
  runtimeHoldSnapshot: [false, { option: true }],
  runtimePlatform: ['windows', { option: true }],
  page: async ({ page, runtimeBridge, runtimeHoldSnapshot, runtimePlatform }, use) => {
    if (runtimeBridge) await installRuntimeBridge(page, { runtimeHoldSnapshot, runtimePlatform });
    await use(page);
  },
});
export { expect };
