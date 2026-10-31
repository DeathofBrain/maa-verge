import assert from 'node:assert/strict';
import test from 'node:test';
import { getDesktopUninstallInfo, uninstallDesktopApplication } from '../src/desktop-uninstall.ts';

const info = {
  available: true,
  reason: '',
  application: '/Applications/Maa Verge.app',
  componentDirectories: [
    '/Users/fixture/Library/Application Support/Maa Verge/MaaCore',
    '/Users/fixture/Library/Application Support/Maa Verge/MaaResource',
  ],
  configurationDirectory: '/Applications/config',
};

test('desktop uninstall transport uses fixed host commands without caller-provided paths', async () => {
  const calls = [];
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (command, args) => {
        calls.push([command, args]);
        return command === 'get_desktop_uninstall_info' ? info : undefined;
      },
    },
  };
  try {
    assert.deepEqual(await getDesktopUninstallInfo(), info);
    await uninstallDesktopApplication();
    assert.deepEqual(calls, [
      ['get_desktop_uninstall_info', {}],
      ['uninstall_desktop_application', {}],
    ]);
  } finally {
    delete globalThis.window;
  }
});

test('desktop uninstall transport rejects unavailable bridges, invalid information and host failures', async () => {
  await assert.rejects(getDesktopUninstallInfo(), /仅在桌面应用中可用/);
  await assert.rejects(uninstallDesktopApplication(), /仅在桌面应用中可用/);
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async () => ({ ...info, componentDirectories: ['/arbitrary'] }),
    },
  };
  try {
    await assert.rejects(getDesktopUninstallInfo(), /卸载信息无效/);
    window.__TAURI_INTERNALS__.invoke = async () => {
      throw new Error('组件仍被另一实例占用');
    };
    await assert.rejects(uninstallDesktopApplication(), /组件仍被另一实例占用/);
  } finally {
    delete globalThis.window;
  }
});
