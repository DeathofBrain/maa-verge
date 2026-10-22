import { expect, test } from 'bun:test';
import { deviceAddressIdentity, deviceProfileIdentity, deviceProfileListError, matchingDeviceProfile, mumuDefaultAdbAddress } from '../../../packages/contracts/src/device-profiles';
import { defaultConnection, type DeviceConnectionProfile } from '../src/models';

function profile(index: number, address: string, method: 'adb' | 'mumu' = 'adb'): DeviceConnectionProfile {
  return { id: `instance-${index}`, name: `实例 ${index}`, address, connection: defaultConnection(),
    capture: { method, emulatorPath: method === 'mumu' ? 'C:/MuMu' : '', instanceIndex: index } };
}

test('plain ADB port identities remain separate until emulator metadata proves an alias', () => {
  expect(deviceAddressIdentity('localhost:016384')).toBe('localhost:016384');
  expect(deviceAddressIdentity('localhost:16384')).toBe('127.0.0.1:16384');
  expect(deviceAddressIdentity('127.0.0.1:16384')).not.toBe(deviceAddressIdentity('emulator-5554'));
  expect(deviceProfileListError([profile(0, '127.0.0.1:5555'), profile(1, '127.0.0.1:16384')])).toBeUndefined();
  expect(deviceProfileListError([profile(0, '[::1]:5555'), profile(1, 'emulator-5554')])).toContain('重复');
});

test('explicit MuMu SDK selection associates default endpoints and serials with the selected index', () => {
  const bridge = { ...profile(32, '192.168.1.2:5555', 'mumu'), capture: { ...profile(32, '', 'mumu').capture, mumuBridge: true } };
  expect(mumuDefaultAdbAddress(0)).toBe('127.0.0.1:16384');
  expect(mumuDefaultAdbAddress(31)).toBe('127.0.0.1:17376');
  expect(mumuDefaultAdbAddress(32)).toBe('127.0.0.1:16388');
  expect(mumuDefaultAdbAddress(33)).toBe('127.0.0.1:16420');
  expect(deviceProfileIdentity(bridge)).toBe('127.0.0.1:16388');
  for (const address of [bridge.address, 'localhost:16388', 'emulator-5618']) expect(matchingDeviceProfile({ deviceProfiles: [bridge] }, address)?.id).toBe(bridge.id);
  expect(deviceProfileListError([bridge, profile(1, 'localhost:16388')])).toContain('重复');
  expect(deviceProfileListError([bridge, profile(2, 'emulator-5618')])).toContain('重复');
  expect(deviceProfileListError([bridge, profile(3, 'localhost:16416')])).toBeUndefined();
});

test('indices outside the unique default-port range retain a root and index identity', () => {
  for (const index of [-1, 0.5, 256, 65535, Number.NaN]) expect(mumuDefaultAdbAddress(index)).toBeUndefined();
  const large = profile(256, '192.168.1.2:5555', 'mumu');
  expect(deviceProfileIdentity(large)).not.toBe(deviceProfileIdentity(profile(1, '127.0.0.1:16416', 'mumu')));
  const duplicate = { ...large, id: 'duplicate', address: '192.168.1.3:5555', capture: { ...large.capture, emulatorPath: 'c:\\MUMU\\' } };
  expect(deviceProfileListError([large, duplicate])).toContain('重复');
  const separate = { ...duplicate, capture: { ...duplicate.capture, emulatorPath: 'D:/MuMu' } };
  expect(deviceProfileListError([large, separate])).toBeUndefined();
});
