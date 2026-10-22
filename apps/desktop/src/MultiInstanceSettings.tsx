import { useState } from 'react';
import { deviceAddressIdentity, deviceProfileIdentity, deviceProfileListError, type Device, type DeviceConnectionProfile, type Event, type Settings } from '@maaverge/contracts';
import { ConnectionFields, defaultConnectionSettings } from './TaskConnectionSettings';
import { CaptureFields } from './CaptureSettingsForm';
import { useSettingsDraft } from './settings-draft';

export function MultiInstanceSettings({ settings, devices, events, busy, onSaveSettings, onConnect, onSelectDevice }: {
  settings: Settings;
  devices: Device[];
  events: Event[];
  busy: boolean;
  onSaveSettings: (settings: Settings) => Promise<boolean>;
  onConnect: (address: string) => Promise<unknown>;
  onSelectDevice: (id: string) => void;
}) {
  const profiles = settings.deviceProfiles ?? [];
  const [editing, setEditing] = useState<DeviceConnectionProfile>();
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const associated = (profile: DeviceConnectionProfile) => devices.find(device => device.connectionProfileId === profile.id || deviceAddressIdentity(device.address) === deviceProfileIdentity(profile));
  const connect = async (profile: DeviceConnectionProfile) => {
    setPending(profile.id); setError('');
    try { await onConnect(profile.address); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setPending(''); }
  };
  return <section className="sp-section sp-multi-instance" aria-label="模拟器多开实例">
    <div className="sp-section-title"><h2>模拟器多开</h2><p>每个实例保存独立的地址、ADB、触控和增强截图编号。保存实例清单后，自动连接按清单逐项连接。</p></div>
    <div className="sp-instance-list">{profiles.map(profile => {
      const device = associated(profile);
      const latest = [...events].reverse().find(event => event.data.profileId === profile.id || (device && ['device.connecting', 'device.connected', 'device.failed', 'device.disconnected'].includes(event.type) && ((event.data.device as Device | undefined)?.id === device.id || event.data.deviceId === device.id)));
      const nativeError = device?.connectionError || (latest?.type === 'device.connection_failed' ? String(latest.data.error) : '');
      const status = device?.state === 'running' ? '执行中' : device?.state === 'idle' ? '已连接' : pending === profile.id || latest?.type === 'device.connecting' ? '正在连接' : nativeError ? '连接失败' : '未连接';
      return <article className="sp-instance-card" key={profile.id} aria-label={`多开实例：${profile.name}`}>
        <div className="sp-instance-heading"><div><h3>{profile.name}</h3><p className="sp-help">{profile.address} · {profile.capture.method === 'adb' ? 'ADB 截图' : `${profile.capture.method === 'mumu' ? 'MuMu' : '雷电'} 增强截图 · 实例 ${profile.capture.instanceIndex}`}</p></div><span className="sp-value">{status}</span></div>
        {device && device.address !== profile.address && <p className="sp-help">当前设备地址：{device.address}；配置改动将在断开后重新连接时生效。</p>}
        {nativeError && <p className="sp-instance-error" role="alert">{nativeError}</p>}
        <div className="sp-instance-actions"><button className="button secondary" disabled={busy || !!pending} onClick={() => void connect(profile)}>{pending === profile.id ? '正在连接…' : '连接实例'}</button>{device && <button className="button secondary" onClick={() => onSelectDevice(device.id)}>选择设备</button>}<button className="button secondary" disabled={busy || !!pending} onClick={() => { setError(''); setEditing(profile); }}>编辑实例</button><button className="button secondary" disabled={busy || !!pending || (!!device && device.state !== 'offline')} title={device && device.state !== 'offline' ? '请先断开该实例再删除配置' : undefined} onClick={() => void onSaveSettings({ ...settings, deviceProfiles: profiles.filter(item => item.id !== profile.id) })}>删除实例</button></div>
      </article>;
    })}</div>
    {!profiles.length && <p className="sp-help">添加每个多开实例，分别选择其 ADB 地址和模拟器实例编号。</p>}
    {error && <p role="alert" className="sp-instance-error">{error}</p>}
    {!editing && <button className="button secondary" disabled={busy || profiles.length >= 32} onClick={() => setEditing({ id: `instance-${crypto.randomUUID()}`, name: `模拟器实例 ${profiles.length + 1}`, address: '', connection: { ...defaultConnectionSettings }, capture: { method: 'adb', emulatorPath: '', instanceIndex: 0 } })}>添加多开实例</button>}
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
    const normalized = { ...draft, name: draft.name.trim(), address: draft.connection.address.trim(), connection: { ...draft.connection, address: draft.connection.address.trim(), adbPath: draft.connection.adbPath.trim() }, capture: { ...draft.capture, emulatorPath: draft.capture.emulatorPath.trim() } };
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
