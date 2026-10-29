import assert from 'node:assert/strict';
import test from 'node:test';
import { desktopNotificationStatus, sendTestNotification } from '../src/desktop-notifications.ts';

test('notification controls call only the fixed desktop commands', async () => {
  const calls = [];
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (command, params) => {
        calls.push([command, params]);
        return command === 'desktop_notification_status' ? { permission: 'granted' } : undefined;
      },
    },
  };
  try {
    assert.deepEqual(await desktopNotificationStatus(), { permission: 'granted' });
    await desktopNotificationStatus(true);
    await sendTestNotification();
    assert.deepEqual(calls, [
      ['desktop_notification_status', { requestPermission: false }],
      ['desktop_notification_status', { requestPermission: true }],
      ['desktop_test_notification', {}],
    ]);
  } finally {
    delete globalThis.window;
  }
});

test('notification controls expose unavailable hosts and send failures', async () => {
  await assert.rejects(desktopNotificationStatus(), /仅在桌面应用中可用/);
  await assert.rejects(sendTestNotification(), /仅在桌面应用中可用/);
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async () => {
        throw new Error('合成通知发送失败');
      },
    },
  };
  try {
    await assert.rejects(sendTestNotification(), /合成通知发送失败/);
  } finally {
    delete globalThis.window;
  }
});
