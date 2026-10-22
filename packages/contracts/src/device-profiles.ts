import type { DeviceConnectionProfile, Settings } from './types';

/** Shared by profile validation, UI association and the native device lease. */
export function deviceAddressIdentity(address: string): string {
  if (/^emulator-\d{1,5}$/.test(address)) return `127.0.0.1:${Number(address.slice(9)) + 1}`;
  const local = /^(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})$/.exec(address);
  if (!local || Number(local[1]) < 1 || Number(local[1]) > 65535) return address;
  let port = Number(local[1]);
  if (port >= 16384 && (port - 16384) % 32 === 0) port = 5555 + (port - 16384) / 16;
  return `127.0.0.1:${port}`;
}

export function deviceProfileIdentity(profile: DeviceConnectionProfile): string {
  return profile.capture.method === 'mumu' && profile.capture.mumuBridge
    ? deviceAddressIdentity(`emulator-${5554 + profile.capture.instanceIndex * 2}`)
    : deviceAddressIdentity(profile.address);
}

export function matchingDeviceProfile(settings: Pick<Settings, 'deviceProfiles'>, address: string): DeviceConnectionProfile | undefined {
  const identity = deviceAddressIdentity(address);
  return settings.deviceProfiles?.find(profile => profile.address === address || deviceAddressIdentity(profile.address) === identity || deviceProfileIdentity(profile) === identity);
}

export function deviceProfileListError(profiles: DeviceConnectionProfile[]): string | undefined {
  const ids = new Set<string>(), addresses = new Set<string>();
  for (const profile of profiles) {
    if (!/^[A-Za-z0-9_.:\[\]-]{1,128}$/.test(profile.address) || profile.address.startsWith('-')) return '多开实例连接地址无效';
    if (!profile.name.trim()) return '多开实例名称不能为空';
    if (ids.has(profile.id)) return '多开实例 ID 不能重复';
    const identities = new Set([deviceAddressIdentity(profile.address), deviceProfileIdentity(profile)]);
    if ([...identities].some(identity => addresses.has(identity))) return '多开实例地址或设备别名重复，同一设备只能配置一个控制实例';
    identities.forEach(identity => addresses.add(identity)); ids.add(profile.id);
    if ((profile.capture.mumuTouch || profile.capture.mumuBridge) && profile.capture.method !== 'mumu') return '多开实例的 MuMu 触控增强和网络桥接需要 MuMu 截图增强';
    if (profile.capture.method !== 'adb' && !['General', profile.capture.method === 'mumu' ? 'MuMuEmulator12' : 'LDPlayer'].includes(profile.connection.config)) return '多开实例的连接配置与增强截图类型不一致';
  }
}
