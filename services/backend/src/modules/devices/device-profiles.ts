import type { DeviceConnectionProfile } from '@contracts/types';
import { deviceProfileListError } from '@contracts/device-profiles';
export {
  deviceProfileIdentity as profileIdentity,
  matchingDeviceProfile as findDeviceProfile,
} from '@contracts/device-profiles';
import { RpcError } from '@backend/shared/errors';

export function validateDeviceProfiles(profiles: DeviceConnectionProfile[] = []): void {
  const error = deviceProfileListError(profiles);
  if (error) throw new RpcError(-32602, error);
}
