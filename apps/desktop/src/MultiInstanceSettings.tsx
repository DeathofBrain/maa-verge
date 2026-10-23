import { useEffect, useState } from 'react';
import { deviceProfileListError, type Device, type DeviceConnectionProfile, type Event, type Settings } from '@maaverge/contracts';
import { ConnectionFields, defaultConnectionSettings } from './TaskConnectionSettings';
import { CaptureFields } from './CaptureSettingsForm';
import { useSettingsDraft } from './settings-draft';
import { deviceForProfile } from './device-association';

type InstanceCandidate = { name: string; address: string };
const connectionEventTypes = ['device.connecting', 'device.connected', 'device.failed', 'device.connection_failed', 'device.disconnected'];
const connectionPendingMs = 30_000;
const newInstanceProfile = (count: number, candidate?: InstanceCandidate): DeviceConnectionProfile => ({
  id: `instance-${crypto.randomUUID()}`,
  name: candidate?.name || `模拟器实例 ${count + 1}`,
  address: candidate?.address ?? '',
  connection: { ...defaultConnectionSettings, address: candidate?.address ?? '' },
  capture: { method: 'adb', autoDetect: true, emulatorPath: '', instanceIndex: 0 },
});

export function MultiInstanceSettings({ settings, devices, events, busy, candidate, onSaveSettings, onConnect, onDisconnect, onSelectDevice, onConfigure }: {
  settings: Settings;
  devices: Device[];
  events: Event[];
  busy: boolean;
  candidate?: InstanceCandidate;
  onSaveSettings: (settings: Settings) => Promise<boolean>;
  onConnect: (address: string) => Promise<unknown>;
  onDisconnect: (device: Device) => Promise<unknown>;
  onSelectDevice: (id: string) => void;
  onConfigure?: (device: Device) => void;
}) {
  const profiles = settings.deviceProfiles ?? [];
  const [editing, setEditing] = useState<DeviceConnectionProfile | undefined>(() => candidate ? newInstanceProfile(profiles.length, candidate) : undefined);
  const [pending, setPending] = useState<{ profileId: string; action: 'connect' | 'disconnect' }>();
  const [error, setError] = useState('');
  const [connectionTick, setConnectionTick] = useState(0);
  useEffect(() => {
    // Native connection completion is asynchronous. Expire a missing completion
    // event even when no new snapshot arrives, so old history cannot stay busy.
    const now = Date.now();
    const deadlines = events.filter(event => event.type === 'device.connecting').map(event => Date.parse(event.createdAt) + connectionPendingMs).filter(deadline => deadline > now);
    if (!deadlines.length) return;
    const timer = setTimeout(() => setConnectionTick(value => value + 1), Math.min(...deadlines) - now + 1);
    return () => clearTimeout(timer);
  }, [events, connectionTick]);
  const associated = (profile: DeviceConnectionProfile) => deviceForProfile(devices, profile);
  const operate = async (profile: DeviceConnectionProfile, device?: Device) => {
    const disconnecting = device && device.state !== 'offline';
    if (device?.state === 'running') return;
    setPending({ profileId: profile.id, action: disconnecting ? 'disconnect' : 'connect' }); setError('');
    try { if (disconnecting) await onDisconnect(device); else await onConnect(profile.address); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setPending(undefined); }
  };
  return <section className="sp-section sp-multi-instance" aria-label="模拟器多开实例">
    <div className="sp-section-title"><div className="sp-instance-heading"><h2>多开管理</h2><button className="button primary" disabled={busy || !!pending || !!editing || profiles.length >= 32} onClick={() => { setError(''); setEditing(newInstanceProfile(profiles.length)); }}>添加多开实例</button></div><p>先在模拟器的多开管理器中启动实例，再到“当前设备”发现并保存，或手动添加连接地址。每个实例独立保存连接与截图设置，可分别连接和断开。</p></div>
    <div className="sp-instance-list">{profiles.map(profile => {
      const device = associated(profile);
      const latest = events.filter(event => connectionEventTypes.includes(event.type) && (event.data.profileId === profile.id || (event.data.device as Device | undefined)?.connectionProfileId === profile.id || (device && ((event.data.device as Device | undefined)?.id === device.id || event.data.deviceId === device.id)))).reduce<Event | undefined>((latest, event) => !latest || event.id > latest.id ? event : latest, undefined);
      const online = !!device && device.state !== 'offline';
      const recentConnection = latest?.type === 'device.connecting' && Date.parse(latest.createdAt) + connectionPendingMs > Date.now();
      const connecting = !online && (pending?.profileId === profile.id && pending.action === 'connect' || recentConnection);
      const disconnecting = pending?.profileId === profile.id && pending.action === 'disconnect';
      const latestFailure = latest && ['device.failed', 'device.connection_failed'].includes(latest.type) ? String(latest.data.error ?? (latest.data.device as Device | undefined)?.connectionError ?? latest.message) : '';
      const nativeError = !online && !connecting && latest?.type !== 'device.disconnected' ? device?.connectionError || latestFailure : '';
      const status = disconnecting ? '正在断开' : device?.state === 'running' ? '执行中' : online ? '已连接' : connecting ? '正在连接' : nativeError ? '连接失败' : '未连接';
      return <article className="sp-instance-card" key={profile.id} aria-label={`多开实例：${profile.name}`}>
        <div className="sp-instance-heading"><div><h3>{profile.name}</h3><p className="sp-help">{profile.autoDetected && '自动发现 · '}{profile.address} · {(profile.capture.autoDetect ?? (profile.capture.method === 'adb')) && '自动 · '}{profile.capture.method === 'adb' ? 'ADB 截图' : `${profile.capture.method === 'mumu' ? 'MuMu' : '雷电'} 增强截图 · 实例 ${profile.capture.instanceIndex}`}</p></div><span className="sp-value">{status}</span></div>
        {device && device.address !== profile.address && <p className="sp-help">当前设备地址：{device.address}；配置改动将在断开后重新连接时生效。</p>}
        {nativeError && <p className="sp-instance-error" role="alert">{nativeError}</p>}
        {device?.state === 'running' && <p className="sp-help">请先停止当前执行，再断开此实例。</p>}
        <div className="sp-instance-actions"><button className="button secondary" disabled={busy || !!pending || !!connecting || device?.state === 'running'} title={device?.state === 'running' ? '请先停止当前执行，再断开此实例' : undefined} onClick={() => void operate(profile, device)}>{disconnecting ? '正在断开…' : connecting ? '正在连接…' : online ? '断开实例' : '连接实例'}</button>{device && <button className="button secondary" onClick={() => onSelectDevice(device.id)}>选择设备</button>}{device && onConfigure && <button className="button secondary" onClick={() => onConfigure(device)}>连接设置</button>}<button className="button secondary" disabled={busy || !!pending} onClick={() => { setError(''); setEditing(profile); }}>编辑实例</button><button className="button secondary" disabled={busy || !!pending || !!connecting || online} title={online ? '请先断开该实例再删除配置' : connecting ? '请等待连接结束后再删除配置' : undefined} onClick={() => void onSaveSettings({ ...settings, deviceProfiles: profiles.filter(item => item.id !== profile.id) })}>删除实例</button></div>
      </article>;
    })}</div>
    {!profiles.length && <p className="sp-help">尚未保存多开实例。点击上方“添加多开实例”，或在“当前设备”中将发现的设备保存为实例。</p>}
    {error && <p role="alert" className="sp-instance-error">{error}</p>}
    {editing && <InstanceProfileEditor key={editing.id} profile={editing} profiles={profiles} busy={busy} onCancel={() => setEditing(undefined)} onSave={async profile => {
      const next = profiles.some(item => item.id === profile.id) ? profiles.map(item => item.id === profile.id ? profile : item) : [...profiles, profile];
      const ok = await onSaveSettings({ ...settings, deviceProfiles: next });
      if (ok) setEditing(undefined);
      return ok;
    }} />}
  </section>;
}

function InstanceProfileEditor({ profile, profiles, busy, onSave, onCancel }: { profile: DeviceConnectionProfile; profiles: DeviceConnectionProfile[]; busy: boolean; onSave: (profile: DeviceConnectionProfile) => Promise<boolean>; onCancel: () => void }) {
  const [draft, setDraft, reset] = useSettingsDraft(`device-profile:${profile.id}`, profile);
  const [error, setError] = useState('');
  const submit = async () => {
    const normalized = { ...draft, autoDetected: false, name: draft.name.trim(), address: draft.connection.address.trim(), connection: { ...draft.connection, address: draft.connection.address.trim(), adbPath: draft.connection.adbPath.trim() }, capture: { ...draft.capture, emulatorPath: draft.capture.emulatorPath.trim() } };
    const next = [...profiles.filter(item => item.id !== normalized.id), normalized];
    const invalid = deviceProfileListError(next);
    if (invalid) { setError(invalid); return; }
    setError('');
    try { if (await onSave(normalized)) sessionStorage.removeItem(`maaverge:settings-draft:device-profile:${profile.id}`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  };
  return <form className="sp-instance-editor sp-connection-form" aria-label="多开实例配置" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <h3>实例独立配置</h3>
    <label className="sp-field">实例名称<input className="text-input" aria-label="实例名称" value={draft.name} maxLength={80} required pattern=".*\S.*" disabled={busy} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
    <ConnectionFields connection={draft.connection} disabled={busy} addressRequired onChange={patch => setDraft(current => ({ ...current, address: patch.address ?? current.address, connection: { ...current.connection, ...patch } }))} />
    <CaptureFields capture={draft.capture} busy={busy} onChange={update => setDraft(current => ({ ...current, capture: typeof update === 'function' ? update(current.capture) : update }))} />
    <p className="sp-help">只修改此实例；已连接设备继续使用当前配置，重新连接后生效。</p>
    {error && <p role="alert" className="sp-instance-error">{error}</p>}
    <div className="sp-form-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => { reset(); sessionStorage.removeItem(`maaverge:settings-draft:device-profile:${profile.id}`); onCancel(); }}>取消编辑</button><button className="button primary" type="submit" disabled={busy}>保存实例配置</button></div>
  </form>;
}
