import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getConfigurationLocations,
  saveConfigurationDirectory,
  openConfigurationDirectory,
} from '../src/configuration.ts';

test('configuration transport uses fixed commands and never accepts a path for the opener', async () => {
  const calls = [];
  const locations = { directory: '/app/config', nextDirectory: '/data', restartRequired: true };
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (command, params) => {
        calls.push([command, params]);
        return locations;
      },
    },
  };
  try {
    assert.deepEqual(await getConfigurationLocations(), locations);
    assert.deepEqual(await saveConfigurationDirectory('/data'), locations);
    await openConfigurationDirectory();
    await saveConfigurationDirectory('');
    assert.deepEqual(calls, [
      ['get_configuration_locations', {}],
      ['save_configuration_directory', { directory: '/data' }],
      ['open_configuration_directory', {}],
      ['save_configuration_directory', { directory: '' }],
    ]);
  } finally {
    delete globalThis.window;
  }
});

test('configuration transport surfaces host failures and requires the desktop bridge', async () => {
  await assert.rejects(getConfigurationLocations(), /仅在桌面应用中可用/);
  await assert.rejects(saveConfigurationDirectory('/data'), /仅在桌面应用中可用/);
  await assert.rejects(openConfigurationDirectory(), /仅在桌面应用中可用/);
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async () => {
        throw new Error('配置目录不可写');
      },
    },
  };
  try {
    await assert.rejects(saveConfigurationDirectory('/data'), /配置目录不可写/);
    await assert.rejects(openConfigurationDirectory(), /配置目录不可写/);
  } finally {
    delete globalThis.window;
  }
});
