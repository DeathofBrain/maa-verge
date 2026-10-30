import Select from '@/kit/Select';
import { useState } from 'react';
import { matchingDeviceProfile, type Settings, type Snapshot } from '@maaverge/contracts';
import { deviceForProfile } from './device-association';
import SideDrawer from '@/shared/ui/SideDrawer';
import { TaskConnectionSettings } from '@/features/plans/TaskConnectionSettings';

export default function DeviceConnectionDrawer({
  snapshot,
  deviceId,
  busy,
  onSave,
  onClose,
}: {
  snapshot: Snapshot;
  deviceId: string;
  busy: boolean;
  onSave: (settings: Settings) => Promise<boolean>;
  onClose: () => void;
}) {
  const profiles = snapshot.settings.deviceProfiles ?? [];
  const requested = snapshot.devices.find((device) => device.id === deviceId);
  const [target, setTarget] = useState(
    () =>
      requested?.connectionProfileId ||
      matchingDeviceProfile(snapshot.settings, requested?.address || '')?.id ||
      'default',
  );
  const profile = profiles.find((item) => item.id === target);
  const requestedProfile =
    requested &&
    (profiles.find((item) => item.id === requested.connectionProfileId) ||
      matchingDeviceProfile(snapshot.settings, requested.address));
  const device = profile
    ? deviceForProfile(snapshot.devices, profile)
    : requestedProfile
      ? undefined
      : requested;
  return (
    <SideDrawer title="设备连接设置" onClose={onClose}>
      <section className="sp-section">
        <div className="sp-section-title">
          <h2>{device?.name || '默认连接配置'}</h2>
          <p>连接配置在下次连接时生效。关闭后返回当前页面。</p>
        </div>
        <label className="sp-field">
          编辑配置
          <Select
            className="text-input"
            aria-label="编辑设备连接配置"
            value={profile?.id || 'default'}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="default">默认配置（未单独配置的设备）</option>
            {profiles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.address}
              </option>
            ))}
          </Select>
        </label>
      </section>
      <TaskConnectionSettings
        settings={snapshot.settings}
        selectedDeviceId={device?.id || ''}
        deviceProfileId={profile?.id}
        busy={busy}
        onSaveSettings={onSave}
      />
    </SideDrawer>
  );
}
