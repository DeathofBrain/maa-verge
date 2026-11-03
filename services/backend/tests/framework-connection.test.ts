import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FrameworkConnection } from '@backend/infrastructure/native/framework-worker';
import type { EmulatorInventory } from '@backend/infrastructure/native/windows-emulators';
import { frameworkConnection } from '@backend/modules/framework/connection';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function sdk(kind: 'mumu' | 'ldplayer') {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-framework-connection-'));
  roots.push(root);
  const files =
    kind === 'mumu' ? ['shell/sdk/external_renderer_ipc.dll'] : ['ldopengl64.dll', 'ldconsole.exe'];
  for (const file of files) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'synthetic SDK metadata; never executed or loaded');
  }
  const address = kind === 'mumu' ? '127.0.0.1:16480' : '127.0.0.1:5561';
  const inventory: EmulatorInventory = {
    instances: [
      {
        kind,
        address,
        aliases: [],
        name: '合成模拟器实例',
        emulatorPath: root,
        index: 3,
        ...(kind === 'ldplayer' ? { pid: 4567 } : {}),
      },
    ],
    diagnostics: [],
  };
  return { root, address, inventory };
}
const empty: EmulatorInventory = { instances: [], diagnostics: [] };

test('legacy framework connections default independently to MaaTouch and automatic AVD probing', async () => {
  expect(await frameworkConnection(undefined, 'emulator-20000', empty)).toEqual({
    touchMode: 'maatouch',
    capture: { method: 'auto', emulatorPath: '', instanceIndex: 0 },
  });
});

test.each(['mumu', 'ldplayer'] as const)(
  'automatic %s capture uses the matching verified instance without changing the input mode',
  async (kind) => {
    const f = sdk(kind);
    for (const touchMode of ['maatouch', 'minitouch', 'adb'] as const) {
      const resolved = await frameworkConnection(
        { touchMode, capture: { method: 'auto', emulatorPath: '', instanceIndex: 0 } },
        f.address,
        f.inventory,
        'win32',
      );
      expect(resolved).toEqual({
        touchMode,
        capture: {
          method: kind,
          emulatorPath: f.root,
          instanceIndex: 3,
          ...(kind === 'ldplayer' ? { pid: 4567 } : {}),
        },
      });
    }
    const other = await frameworkConnection(undefined, '127.0.0.1:62001', f.inventory, 'win32');
    expect(other.capture?.method).toBe('auto');
    expect(other.capture?.emulatorPath).toBe('');
    rmSync(
      path.join(f.root, kind === 'mumu' ? 'shell/sdk/external_renderer_ipc.dll' : 'ldopengl64.dll'),
    );
    expect(
      (await frameworkConnection(undefined, f.address, f.inventory, 'win32')).capture?.method,
    ).toBe('auto');
  },
);

test('manual ADB and AVD capture selections remain independent of each ordinary input mode', async () => {
  const f = sdk('mumu');
  for (const method of ['adb', 'avd'] as const)
    for (const touchMode of ['maatouch', 'minitouch', 'adb'] as const) {
      const capture = { method, emulatorPath: '', instanceIndex: 0 };
      expect(
        await frameworkConnection({ touchMode, capture }, f.address, f.inventory, 'win32'),
      ).toEqual({ touchMode, capture });
    }
});

test('manual enhancement validates SDK, address and instance instead of accepting a different device', async () => {
  const f = sdk('mumu');
  const selected: FrameworkConnection = {
    touchMode: 'adb',
    capture: { method: 'mumu', emulatorPath: f.root, instanceIndex: 3 },
  };
  await expect(
    frameworkConnection(selected, f.address, f.inventory, 'win32'),
  ).resolves.toMatchObject({
    touchMode: 'adb',
    capture: { method: 'mumu', instanceIndex: 3 },
  });
  await expect(
    frameworkConnection(
      { ...selected, capture: { ...selected.capture, instanceIndex: 4 } },
      f.address,
      f.inventory,
      'win32',
    ),
  ).rejects.toThrow('不匹配');
  await expect(frameworkConnection(selected, f.address, f.inventory, 'darwin')).rejects.toThrow(
    '仅支持 Windows',
  );
});

test('MuMu emulator input has separate parameters and never enables enhanced capture over explicit ADB', async () => {
  const f = sdk('mumu');
  const selected: FrameworkConnection = {
    touchMode: 'emulator-extras',
    capture: { method: 'adb', emulatorPath: '', instanceIndex: 0 },
  };
  expect(await frameworkConnection(selected, f.address, f.inventory, 'win32')).toEqual({
    ...selected,
    touchExtras: { emulatorPath: f.root, instanceIndex: 3 },
  });
  expect(
    await frameworkConnection(
      { ...selected, touchExtras: { emulatorPath: '', instanceIndex: 0 } },
      f.address,
      f.inventory,
      'win32',
    ),
  ).toEqual({ ...selected, touchExtras: { emulatorPath: f.root, instanceIndex: 3 } });
  const automatic = await frameworkConnection(
    { ...selected, capture: { ...selected.capture, method: 'auto' } },
    f.address,
    f.inventory,
    'win32',
  );
  expect(automatic).toMatchObject({
    touchMode: 'emulator-extras',
    capture: { method: 'mumu', emulatorPath: f.root, instanceIndex: 3 },
    touchExtras: { emulatorPath: f.root, instanceIndex: 3 },
  });
  await expect(
    frameworkConnection(
      { ...selected, touchExtras: { emulatorPath: f.root, instanceIndex: 4 } },
      f.address,
      f.inventory,
      'win32',
    ),
  ).rejects.toThrow('不匹配');
});

test('incompatible emulator input is rejected instead of altering independently selected capture', async () => {
  for (const method of ['auto', 'avd'] as const)
    await expect(
      frameworkConnection(
        { touchMode: 'emulator-extras', capture: { method, emulatorPath: '', instanceIndex: 0 } },
        'emulator-20000',
        empty,
      ),
    ).rejects.toThrow(method === 'auto' ? '未自动识别到 MuMu' : '不能与雷电或 AVD');
  const f = sdk('ldplayer');
  await expect(
    frameworkConnection(
      {
        touchMode: 'emulator-extras',
        capture: { method: 'auto', emulatorPath: '', instanceIndex: 0 },
      },
      f.address,
      f.inventory,
      'win32',
    ),
  ).rejects.toThrow('不能与雷电或 AVD');
});
