import type { DeviceConnectionProfile, Settings } from './types';

/** ADB emulator serials use a fixed prefix; physical device serials remain case-sensitive. */
export function normalizeDeviceAddress(address: string): string {
  const emulator = /^emulator-(\d{1,5})$/i.exec(address);
  return emulator ? `emulator-${emulator[1]}` : address;
}

/** Shared by profile validation, UI association and the native device lease. */
export function deviceAddressIdentity(address: string): string {
  address = normalizeDeviceAddress(address);
  if (/^emulator-\d{1,5}$/.test(address)) return `127.0.0.1:${Number(address.slice(9)) + 1}`;
  const local = /^(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})$/.exec(address);
  if (!local || Number(local[1]) < 1 || Number(local[1]) > 65535) return address;
  return `127.0.0.1:${Number(local[1])}`;
}

/** MuMu's default is an address hint; running-instance metadata can override it. */
export function mumuDefaultAdbAddress(index: number): string | undefined {
  // The published formula repeats after this range. A manager-reported address
  // is required for larger indices rather than treating a collision as identity.
  if (!Number.isInteger(index) || index < 0 || index >= 256) return;
  return `127.0.0.1:${16384 + (index % 32) * 32 + Math.floor(index / 32) * 4}`;
}

function mumuSdkIdentity(profile: DeviceConnectionProfile): string {
  let root = profile.capture.emulatorPath.replaceAll('\\', '/').replace(/\/+$/, '');
  if (/^(?:[A-Za-z]:\/|\/\/)/.test(root)) root = root.toLowerCase();
  return `mumu:${root}:instance:${profile.capture.instanceIndex}`;
}

export function deviceProfileIdentity(profile: DeviceConnectionProfile): string {
  return profile.capture.method === 'mumu' && profile.capture.mumuBridge
    ? mumuSdkIdentity(profile)
    : deviceAddressIdentity(profile.address);
}

function profileAddressIdentities(profile: DeviceConnectionProfile): Set<string> {
  const identities = new Set([deviceAddressIdentity(profile.address)]);
  // A directory and SDK index identify a configured local capture instance.
  // Its actual ADB endpoints are established only from running-instance metadata.
  if (profile.capture.method === 'mumu') identities.add(mumuSdkIdentity(profile));
  return identities;
}

export function matchingDeviceProfile(
  settings: Pick<Settings, 'deviceProfiles'>,
  address: string,
): DeviceConnectionProfile | undefined {
  const exact = settings.deviceProfiles?.find((profile) => profile.address === address);
  if (exact) return exact;
  const identity = deviceAddressIdentity(address);
  return settings.deviceProfiles?.find(
    (profile) => deviceAddressIdentity(profile.address) === identity,
  );
}

export function deviceProfileListError(profiles: DeviceConnectionProfile[]): string | undefined {
  const ids = new Set<string>(),
    addresses = new Set<string>();
  for (const profile of profiles) {
    if (!/^[A-Za-z0-9_.:\[\]-]{1,128}$/.test(profile.address) || profile.address.startsWith('-'))
      return '多开实例连接地址无效';
    if (!profile.name.trim()) return '多开实例名称不能为空';
    if (ids.has(profile.id)) return '多开实例 ID 不能重复';
    const identities = profileAddressIdentities(profile);
    if ([...identities].some((identity) => addresses.has(identity)))
      return '多开实例地址或设备别名重复，同一设备只能配置一个控制实例';
    identities.forEach((identity) => addresses.add(identity));
    ids.add(profile.id);
    if (
      (profile.capture.mumuTouch || profile.capture.mumuBridge) &&
      profile.capture.method !== 'mumu'
    )
      return '多开实例的 MuMu 触控增强和网络桥接需要 MuMu 截图增强';
    if (
      profile.capture.method !== 'adb' &&
      !['General', profile.capture.method === 'mumu' ? 'MuMuEmulator12' : 'LDPlayer'].includes(
        profile.connection.config,
      )
    )
      return '多开实例的连接配置与增强截图类型不一致';
  }
}
