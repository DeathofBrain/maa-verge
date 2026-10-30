import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultNotifications, parseSettings } from '../src/modules/settings/models';
import { Runtime } from '../src/app/runtime';

const runtimes: Runtime[] = [];
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('old settings get notification defaults and partial policies keep strict booleans', () => {
  expect(parseSettings().notifications).toEqual(defaultNotifications());
  expect(parseSettings({ notifications: { enabled: false } }).notifications).toEqual({
    ...defaultNotifications(),
    enabled: false,
  });
  for (const notifications of [
    null,
    [],
    false,
    { enabled: 'false' },
    { schedules: 0 },
    { command: 'notify' },
  ])
    expect(() => parseSettings({ notifications })).toThrow('请求参数无效');
});

test('notification preferences persist and older clients cannot clear them by saving other settings', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-notification-settings-'));
  roots.push(root);
  const runtime = new Runtime(root);
  runtimes.push(runtime);
  const notifications = { ...defaultNotifications(), enabled: false, updates: false };
  await runtime.handle('settings.save', {
    settings: {
      ...runtime.snapshot().settings,
      autoConnect: false,
      autoUpdateApp: false,
      autoUpdateCore: false,
      autoUpdateResource: false,
      notifications,
    },
  });
  const { notifications: _omitted, ...legacy } = runtime.snapshot().settings;
  const saved = await runtime.handle('settings.save', { settings: { ...legacy, theme: 'dark' } });
  expect(saved.notifications).toEqual(notifications);
  await expect(
    runtime.handle('settings.save', {
      settings: { ...saved, notifications: { ...notifications, updates: 'yes' } },
    }),
  ).rejects.toThrow('请求参数无效');
  expect(runtime.snapshot().settings.notifications).toEqual(notifications);
  await runtime.close();
  runtimes.splice(runtimes.indexOf(runtime), 1);
  const restarted = new Runtime(root);
  runtimes.push(restarted);
  expect(restarted.snapshot().settings.notifications).toEqual(notifications);
});
