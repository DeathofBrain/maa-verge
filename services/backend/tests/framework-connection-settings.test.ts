import { afterEach, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { defaultFrameworkConnection, parseSettings } from '@backend/modules/settings/models';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';

const runtimes: Runtime[] = [];
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('framework partial settings use MaaTouch and automatic capture while preserving migrated input preferences', () => {
  const settings = parseSettings({ connection: { touchMode: 'adb', framework: {} } });
  expect(settings.connection?.touchMode).toBe('adb');
  expect(settings.connection?.framework).toEqual(defaultFrameworkConnection());
  const framework = parseSettings({
    connection: {
      framework: {
        capture: { method: 'avd' },
        touchExtras: { emulatorPath: '  /synthetic-mumu  ' },
      },
    },
  }).connection?.framework;
  expect(framework).toEqual({
    touchMode: 'maatouch',
    capture: { method: 'avd', emulatorPath: '', instanceIndex: 0 },
    touchExtras: { emulatorPath: '/synthetic-mumu', instanceIndex: 0 },
  });
  for (const framework of [
    null,
    { touchMode: 'MaaFwAdb' },
    { capture: null },
    { capture: { method: 'shell' } },
    { touchExtras: { instanceIndex: -1 } },
  ])
    expect(() => parseSettings({ connection: { framework } })).toThrow('请求参数无效');
});

test('framework default and per-device preferences survive persistence and restart independently', async () => {
  const root = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-framework-connection-'));
  roots.push(root);
  const runtime = new Runtime(root, { calendar: { fetcher: null } });
  runtimes.push(runtime);
  const settings = parseSettings({
    ...runtime.snapshot().settings,
    autoConnect: false,
    autoUpdateApp: false,
    autoUpdateCore: false,
    autoUpdateResource: false,
    autoUpdateFramework: false,
    connection: { touchMode: 'minitouch', framework: { touchMode: 'adb' } },
    deviceProfiles: [
      {
        id: 'emulator-profile',
        name: '独立模拟器',
        address: '127.0.0.1:5555',
        connection: {
          framework: {
            touchMode: 'minitouch',
            capture: { method: 'mumu', emulatorPath: '  /synthetic-sdk  ', instanceIndex: 3 },
          },
        },
        capture: {},
      },
    ],
  });
  const saved = await runtime.handle('settings.save', { settings });
  expect(saved.connection?.framework?.capture.method).toBe('auto');
  expect(saved.deviceProfiles?.[0]?.connection.framework?.capture.emulatorPath).toBe(
    '/synthetic-sdk',
  );
  await runtime.close();
  runtimes.splice(runtimes.indexOf(runtime), 1);
  const reopened = new Runtime(root, { calendar: { fetcher: null } });
  runtimes.push(reopened);
  expect(reopened.snapshot().settings.connection).toEqual(saved.connection);
  expect(reopened.snapshot().settings.deviceProfiles).toEqual(saved.deviceProfiles);
});
