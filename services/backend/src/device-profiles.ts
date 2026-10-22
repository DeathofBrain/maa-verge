import type { DeviceConnectionProfile } from './models';
import { deviceProfileListError } from '../../../packages/contracts/src/device-profiles';
export { deviceProfileIdentity as profileIdentity, matchingDeviceProfile as findDeviceProfile } from '../../../packages/contracts/src/device-profiles';
import { RpcError } from './errors';

export function validateDeviceProfiles(profiles: DeviceConnectionProfile[] = []): void {
  const error = deviceProfileListError(profiles);
  if (error) throw new RpcError(-32602, error);
}
