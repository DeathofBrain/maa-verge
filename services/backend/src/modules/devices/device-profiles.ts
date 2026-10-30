import type { DeviceConnectionProfile } from '../../../../../packages/contracts/src/types';
import { deviceProfileListError } from '../../../../../packages/contracts/src/device-profiles';
export {
  deviceProfileIdentity as profileIdentity,
  matchingDeviceProfile as findDeviceProfile,
} from '../../../../../packages/contracts/src/device-profiles';
import { RpcError } from '../../shared/errors';

export function validateDeviceProfiles(profiles: DeviceConnectionProfile[] = []): void {
  const error = deviceProfileListError(profiles);
  if (error) throw new RpcError(-32602, error);
}
