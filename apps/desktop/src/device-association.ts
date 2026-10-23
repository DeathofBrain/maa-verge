import { deviceAddressIdentity, type Device, type DeviceConnectionProfile, type Event } from '@maaverge/contracts';

export function deviceIsConnecting(device: Device, events: Event[], now: number): boolean {
  if (device.state !== 'offline' || device.connectionError) return false;
  const latest = events.filter(event => ['device.connecting', 'device.connected', 'device.failed', 'device.disconnected'].includes(event.type)
    && ((event.data.device as Device | undefined)?.id === device.id || event.data.deviceId === device.id))
    .reduce<Event | undefined>((latest, event) => !latest || event.id > latest.id ? event : latest, undefined);
  return latest?.type === 'device.connecting' && Date.parse(latest.createdAt) + 35_000 > now;
}

/** A profile can retain old device records after its address changes. */
export function deviceForProfile(devices: Device[], profile: DeviceConnectionProfile): Device | undefined {
  const linked = devices.filter(device => device.connectionProfileId === profile.id);
  const atAddress = devices.filter(device => deviceAddressIdentity(device.address) === deviceAddressIdentity(profile.address));
  return linked.find(device => device.state !== 'offline')
    || atAddress.find(device => device.state !== 'offline')
    || atAddress[0]
    || linked[0];
}
