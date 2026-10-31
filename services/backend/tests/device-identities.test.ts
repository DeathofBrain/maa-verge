import { expect, test } from 'bun:test';
import {
  deviceAddressIdentity,
  deviceProfileIdentity,
  deviceProfileListError,
  matchingDeviceProfile,
  mumuDefaultAdbAddress,
  normalizeDeviceAddress,
} from '@contracts/device-profiles';
import { defaultConnection, type DeviceConnectionProfile } from '@backend/modules/settings/models';

function profile(
  index: number,
  address: string,
  method: 'adb' | 'mumu' = 'adb',
): DeviceConnectionProfile {
  return {
    id: `instance-${index}`,
    name: `实例 ${index}`,
    address,
    connection: defaultConnection(),
    capture: { method, emulatorPath: method === 'mumu' ? 'C:/MuMu' : '', instanceIndex: index },
  };
}

test('plain ADB port identities remain separate until emulator metadata proves an alias', () => {
  expect(deviceAddressIdentity('localhost:016384')).toBe('localhost:016384');
  expect(deviceAddressIdentity('localhost:16384')).toBe('127.0.0.1:16384');
  expect(deviceAddressIdentity('127.0.0.1:16384')).not.toBe(deviceAddressIdentity('emulator-5554'));
  expect(
    deviceProfileListError([profile(0, '127.0.0.1:5555'), profile(1, '127.0.0.1:16384')]),
  ).toBeUndefined();
  expect(deviceProfileListError([profile(0, '[::1]:5555'), profile(1, 'emulator-5554')])).toContain(
    '重复',
  );
});

test('emulator prefix normalization shares aliases while preserving physical device serials', () => {
  const emulator = profile(0, 'EMULATOR-5554');
  expect(normalizeDeviceAddress(emulator.address)).toBe('emulator-5554');
  expect(deviceAddressIdentity(emulator.address)).toBe('127.0.0.1:5555');
  expect(matchingDeviceProfile({ deviceProfiles: [emulator] }, 'emulator-5554')?.id).toBe(
    emulator.id,
  );
  expect(deviceProfileListError([emulator, profile(1, 'localhost:5555')])).toContain('重复');
  for (const serial of ['UsbSerialABC', 'EMULATOR-custom', 'EMULATOR-123456']) {
    expect(normalizeDeviceAddress(serial)).toBe(serial);
    expect(deviceAddressIdentity(serial)).toBe(serial);
  }
  expect(
    deviceProfileListError([profile(0, 'UsbSerialABC'), profile(1, 'usbserialabc')]),
  ).toBeUndefined();
});

test('MuMu defaults remain hints and do not associate a profile with unverified endpoints', () => {
  const bridge = {
    ...profile(32, '192.168.1.2:5555', 'mumu'),
    capture: { ...profile(32, '', 'mumu').capture, mumuBridge: true },
  };
  expect(mumuDefaultAdbAddress(0)).toBe('127.0.0.1:16384');
  expect(mumuDefaultAdbAddress(31)).toBe('127.0.0.1:17376');
  expect(mumuDefaultAdbAddress(32)).toBe('127.0.0.1:16388');
  expect(mumuDefaultAdbAddress(33)).toBe('127.0.0.1:16420');
  expect(deviceProfileIdentity(bridge)).toBe('mumu:c:/mumu:instance:32');
  expect(matchingDeviceProfile({ deviceProfiles: [bridge] }, bridge.address)?.id).toBe(bridge.id);
  for (const address of ['localhost:16388', 'emulator-5618'])
    expect(matchingDeviceProfile({ deviceProfiles: [bridge] }, address)).toBeUndefined();
  expect(deviceProfileListError([bridge, profile(1, 'localhost:16388')])).toBeUndefined();
  expect(deviceProfileListError([bridge, profile(2, 'emulator-5618')])).toBeUndefined();
  expect(deviceProfileListError([bridge, profile(3, 'localhost:16416')])).toBeUndefined();
});

test('MuMu SDK roots and indices distinguish installations and reject duplicate capture instances', () => {
  for (const index of [-1, 0.5, 256, 65535, Number.NaN])
    expect(mumuDefaultAdbAddress(index)).toBeUndefined();
  for (const index of [0, 32, 256]) {
    const selected = profile(index, '192.168.1.2:5555', 'mumu');
    expect(deviceProfileIdentity(selected)).toBe(selected.address);
    const duplicate = {
      ...selected,
      id: 'duplicate',
      address: '192.168.1.3:5555',
      capture: { ...selected.capture, emulatorPath: 'c:\\MUMU\\' },
    };
    expect(deviceProfileListError([selected, duplicate])).toContain('重复');
    const separate = { ...duplicate, capture: { ...duplicate.capture, emulatorPath: 'D:/MuMu' } };
    expect(deviceProfileListError([selected, separate])).toBeUndefined();
    const bridge = { ...selected, capture: { ...selected.capture, mumuBridge: true } };
    expect(deviceProfileIdentity(bridge)).not.toBe(deviceProfileIdentity(separate));
    expect(deviceProfileListError([bridge, separate])).toBeUndefined();
  }
});
