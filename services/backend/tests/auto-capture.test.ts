import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { automaticCapture } from '@backend/modules/devices/auto-capture';
import { connectionCapture } from '@backend/modules/devices/capture';
import { Runtime } from '@backend/app/runtime';
import { defaultConnection, parseSettings } from '@backend/modules/settings/models';
import type { EmulatorInventory } from '@backend/infrastructure/native/windows-emulators';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const temporary = () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-auto-capture-'));
  roots.push(root);
  return root;
};
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function inventory(root = 'D:\\MuMu'): EmulatorInventory {
  return {
    instances: [
      {
        kind: 'mumu',
        address: '127.0.0.1:16384',
        name: 'MuMu 主实例',
        index: 0,
        emulatorPath: root,
        aliases: ['127.0.0.1:7555'],
      },
      {
        kind: 'mumu',
        address: '127.0.0.1:18432',
        name: 'MuMu 多开',
        index: 32,
        emulatorPath: root,
        aliases: [],
      },
    ],
    diagnostics: [],
  };
}
test('automatic capture selects only a verified instance with an available SDK and preserves explicit manual ADB', () => {
  const metadata = inventory();
  for (const [index, address] of [
    [0, '127.0.0.1:7555'],
    [32, '127.0.0.1:18432'],
  ] as const) {
    const selected = automaticCapture(undefined, address, metadata, 'win32', () => true)!;
    expect(selected.capture).toEqual({
      method: 'mumu',
      emulatorPath: 'D:\\MuMu',
      instanceIndex: index,
      autoDetect: true,
    });
    expect(selected.config).toBe('MuMuEmulator12');
  }
  expect(
    automaticCapture(
      { method: 'adb', emulatorPath: '', instanceIndex: 0, autoDetect: false },
      '127.0.0.1:16384',
      metadata,
      'win32',
      () => true,
    ),
  ).toBeUndefined();
  for (const platform of ['darwin', 'linux'] as const)
    expect(
      automaticCapture(undefined, '127.0.0.1:16384', metadata, platform, () => true)?.capture
        .method,
    ).toBe('adb');
  expect(
    automaticCapture(undefined, '127.0.0.1:16384', metadata, 'win32', () => false)?.capture.method,
  ).toBe('adb');
  expect(
    automaticCapture(undefined, '127.0.0.1:62001', metadata, 'win32', () => true)?.capture.method,
  ).toBe('adb');
  expect(() =>
    automaticCapture(
      { method: 'mumu', emulatorPath: 'D:\\MuMu', instanceIndex: 0, autoDetect: true },
      '127.0.0.1:16384',
      metadata,
      'win32',
      () => false,
    ),
  ).toThrow('无法确认');
});
