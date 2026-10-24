import { useContextMenu } from './ContextMenu';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Info, Layers, LoaderCircle, Monitor, Search, Settings2, Unplug, Wifi } from 'lucide-react';
import { deviceAddressIdentity, matchingDeviceProfile, rpc, type Device } from '@maaverge/contracts';
import type { SupportPageProps } from './SupportPages';
import { TaskConnectionSettings } from './TaskConnectionSettings';
import { MultiInstanceSettings } from './MultiInstanceSettings';
import { deviceForProfile, deviceIsConnecting } from './device-association';
import './support-pages.css';
import './devices-page.css';

type Tab = 'current' | 'instances' | 'settings';
type Candidate = { address: string; name: string; adbState: string };
type DeviceOperation = {
  kind: 'discover' | 'auto-connect' | 'connect' | 'disconnect';
  phase: 'working' | 'complete' | 'empty' | 'error';
  message: string;
};
const deviceLabels: Record<Device['state'], string> = { idle: '空闲就绪', running: '执行中', offline: '已断开' };

function actualCaptureMethod(device: Device) {
  if (device.state === 'offline') return '未确认（设备已断开）';
  if (!device.captureMethod) return '未确认';
  if (device.captureMethod === 'MumuExtras') return 'MuMu 增强截图';
  if (device.captureMethod === 'LDExtras') return '雷电增强截图';
  return `ADB（${device.captureMethod}）`;
}

export function DevicesPage({ snapshot, selectedDevice, onSelectDevice, onAction, busy, settingsDeviceId }: SupportPageProps & { settingsDeviceId?: string }) {
  const contextMenu = useContextMenu();
  const [tab, setTab] = useState<Tab>(settingsDeviceId !== undefined ? 'settings' : 'current');
  const [settingsTarget, setSettingsTarget] = useState(() => {
    const device = snapshot.devices.find(item => item.id === settingsDeviceId);
    return device?.connectionProfileId || matchingDeviceProfile(snapshot.settings, device?.address || '')?.id || 'default';
  });
  const [candidate, setCandidate] = useState<Pick<Candidate, 'name' | 'address'>>();
  const [address, setAddress] = useState('');
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [discovered, setDiscovered] = useState<Candidate[] | null>(null);
  const [operation, setOperation] = useState<DeviceOperation | null>(null);
  const [pendingDeviceIds, setPendingDeviceIds] = useState<string[]>([]);
  const [connectionTick, setConnectionTick] = useState(0);
  const operationActive = useRef(false);
  const mounted = useRef(false);
  const currentSelection = useRef(selectedDevice);
  const selectionRevision = useRef(0);
  const operationSelectionRevision = useRef(0);
  if (currentSelection.current !== selectedDevice) { currentSelection.current = selectedDevice; selectionRevision.current++; }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const deadlines = snapshot.events.filter(event => event.type === 'device.connecting').map(event => Date.parse(event.createdAt) + 35_000).filter(deadline => deadline > Date.now());
    if (!deadlines.length) return;
    const timer = window.setTimeout(() => setConnectionTick(value => value + 1), Math.max(1, Math.min(...deadlines) - Date.now() + 1));
    return () => window.clearTimeout(timer);
  }, [snapshot.events, connectionTick]);
  const working = operation?.phase === 'working';
  const disabled = busy || working;
  const connected = snapshot.devices.filter(device => device.state !== 'offline');
  const connecting = snapshot.devices.filter(device => device.state === 'offline' && !device.connectionError && (pendingDeviceIds.includes(device.id) || deviceIsConnecting(device, snapshot.events, Date.now())));
  const isConnecting = (device: Device) => connecting.some(item => item.id === device.id);
  const history = snapshot.devices.filter(device => device.state === 'offline' && !isConnecting(device));
  const selected = snapshot.devices.find(device => device.id === selectedDevice) || connected[0];
  const profiles = snapshot.settings.deviceProfiles ?? [];
  const hasManualProfiles = profiles.some(profile => !profile.autoDetected);
  const profileFor = (device: Device) => profiles.find(profile => profile.id === device.connectionProfileId) || matchingDeviceProfile(snapshot.settings, device.address);
  const settingsProfile = profiles.find(profile => profile.id === settingsTarget);
  const settingsDevice = settingsProfile
    ? deviceForProfile(snapshot.devices, settingsProfile)
    : selected && !profileFor(selected) ? selected : undefined;
  const detailDevice = tab === 'settings' ? settingsDevice : selected;
  const switchTab = (next: Tab) => { setCandidate(undefined); setTab(next); };
  const configure = (device: Device) => {
    onSelectDevice(device.id);
    setSettingsTarget(profileFor(device)?.id || 'default');
    setTab('settings');
  };
  const saveInstance = (device: Pick<Candidate, 'name' | 'address'>) => { setCandidate(device); setTab('instances'); };

  const runDeviceOperation = async (kind: DeviceOperation['kind'], message: string, call: () => Promise<void>) => {
    if (operationActive.current || busy) return false;
    operationActive.current = true;
    operationSelectionRevision.current = selectionRevision.current;
    setOperation({ kind, phase: 'working', message });
    setDiagnostics([]);
    if (kind === 'discover' || kind === 'auto-connect') setDiscovered(null);
    try {
      return await onAction('device-operation', async () => {
        try { await call(); }
        catch (cause) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          setDiagnostics(previous => [...previous, detail]);
          setOperation({ kind, phase: 'error', message: `${kind === 'discover' ? '发现设备' : kind === 'disconnect' ? '断开设备' : '连接设备'}失败，请查看下方连接诊断。` });
          throw cause;
        }
      });
    } finally { operationActive.current = false; if (mounted.current) setPendingDeviceIds([]); }
  };

  const waitForReady = async (devices: Device[], kind: 'auto-connect' | 'connect') => {
    const ids = new Set(devices.map(device => device.id));
    setPendingDeviceIds([...ids]);
    let ready = devices.filter(device => device.state !== 'offline');
    let failed = devices.filter(device => device.state === 'offline' && device.connectionError);
    // Leave room for MaaCore's 30-second asynchronous connection result.
    const deadline = Date.now() + 35_000;
    while (ready.length + failed.length < ids.size && Date.now() < deadline) {
      setOperation({ kind, phase: 'working', message: `正在等待设备连接就绪（${ready.length}/${ids.size}）…` });
      await new Promise(resolve => window.setTimeout(resolve, 250));
      if (!mounted.current) return false;
      const latest = await rpc('app.snapshot', {});
      if (!mounted.current) return false;
      ready = latest.devices.filter(device => ids.has(device.id) && device.state !== 'offline');
      failed = latest.devices.filter(device => ids.has(device.id) && device.state === 'offline' && device.connectionError);
      setPendingDeviceIds([...ids].filter(id => !ready.some(device => device.id === id) && !failed.some(device => device.id === id)));
    }
    if (!mounted.current) return false;
    if (selectionRevision.current === operationSelectionRevision.current && (ready[0] || devices[0])) onSelectDevice((ready[0] || devices[0]).id);
    const pending = ids.size - ready.length - failed.length;
    if (failed.length) setDiagnostics(previous => [...previous, ...failed.map(device => `${device.name}（${device.address}）：${device.connectionError}`)]);
    if (pending) setDiagnostics(previous => [...previous, `${pending} 台设备的连接尚未就绪。请确认模拟器已启动并开启 ADB 调试，稍后重试。`]);
    const incomplete = [failed.length ? `${failed.length} 台连接失败` : '', pending ? `${pending} 台尚未就绪` : ''].filter(Boolean);
    setOperation({ kind, phase: failed.length ? 'error' : pending ? 'empty' : 'complete', message: incomplete.length ? `连接结果：${ready.length} 台已就绪，${incomplete.join('，')}。` : `连接完成：${ready.length} 台设备已就绪。` });
    return ready.length === ids.size;
  };

  const discover = () => {
    switchTab('current');
    return runDeviceOperation('discover', '正在发现设备…', async () => {
      const result = await rpc('device.discover', {});
      setDiscovered(result);
      setOperation({ kind: 'discover', phase: result.length ? 'complete' : 'empty', message: result.length ? `发现完成：找到 ${result.length} 台设备。` : '发现完成：未发现设备。' });
      setDiagnostics([result.length ? '下方是本次 ADB 发现结果；“已连接”表示已建立核心连接，其余设备可单独连接。' : '请确认模拟器已启动并开启 ADB 调试，也可手动填写连接地址。']);
    });
  };
  const autoConnect = () => runDeviceOperation('auto-connect', hasManualProfiles ? '正在连接已保存实例…' : '正在发现并连接模拟器…', async () => {
    const result = await rpc('device.auto_connect', {});
    setDiagnostics(result.diagnostics);
    setDiscovered(result.discovered);
    if (!result.devices.length) {
      setOperation({ kind: 'auto-connect', phase: 'empty', message: '自动连接完成：没有连接到可用设备。' });
      setDiagnostics(previous => [...previous, hasManualProfiles ? '自动连接仅尝试已保存清单。新增模拟器可通过“发现设备”单独连接或保存。' : '请确认模拟器已启动并开启 ADB 调试，也可手动填写连接地址。']);
      return;
    }
    await waitForReady(result.devices, 'auto-connect');
  });
  const connect = async (value: string) => {
    if (!value.trim()) return;
    let ready = false;
    const ok = await runDeviceOperation('connect', '正在连接设备…', async () => {
      const device = await rpc('device.connect', { address: value.trim() });
      ready = await waitForReady([device], 'connect');
    });
    if (ok && ready) setAddress('');
  };
  const disconnect = (device: Device) => runDeviceOperation('disconnect', '正在断开设备…', async () => {
    await rpc('device.disconnect', { id: device.id });
    setOperation({ kind: 'disconnect', phase: 'complete', message: '设备已断开。' });
    setDiagnostics(['已释放连接，设备记录保留在历史连接中。手动断开后不会立即自动重连。']);
  });
  const renderDevice = (device: Device) => <article className={`dp-device-card ${selected?.id === device.id ? 'is-selected' : ''}`} key={device.id} {...contextMenu('设备菜单', [
    { label: '选择设备', action: () => onSelectDevice(device.id) },
    { label: '连接设置', action: () => configure(device) },
    ...(!profileFor(device) ? [{ label: '保存为多开实例', disabled: disabled || profiles.length >= 32, action: () => saveInstance(device) }] : []),
    { label: device.state === 'offline' ? '重新连接' : '断开设备', disabled: disabled || device.state === 'running' || isConnecting(device), action: () => { if (device.state === 'offline') void connect(device.address); else void disconnect(device); } },
  ])} aria-label={`设备：${device.name}`}>
    <button className="sp-device-item" aria-pressed={selected?.id === device.id} onClick={() => onSelectDevice(device.id)}><Monitor size={22} /><span><strong>{device.name}</strong><small>{device.address}</small></span><span className={`sp-state ${device.state}`}>{isConnecting(device) ? '正在连接' : deviceLabels[device.state]}</span></button>
    <div className="dp-card-footer"><span className="sp-help">{profileFor(device)?.name || '使用默认连接配置'}</span><div>
      {!profileFor(device) && <button className="text-button" disabled={disabled || profiles.length >= 32} onClick={() => saveInstance(device)}>保存为多开实例</button>}
      <button className="text-button" onClick={() => configure(device)}>连接设置</button>
      {device.state !== 'offline' && <button className="button secondary" disabled={disabled || device.state === 'running'} title={device.state === 'running' ? '请先停止此设备的任务' : undefined} onClick={() => void disconnect(device)}>断开</button>}
      {device.state === 'offline' && !isConnecting(device) && <button className="button secondary" disabled={disabled} onClick={() => void connect(device.address)}>重新连接</button>}
    </div></div>
  </article>;

  return <div className="sp-page dp-page">
    <header className="sp-page-heading"><div><h1>设备</h1><p>连接正在运行的设备，为每个模拟器实例保存独立配置。</p></div><div className="sp-heading-actions">
      <button className="button secondary" disabled={disabled} onClick={() => void discover()}>{working && operation.kind === 'discover' ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}{working && operation.kind === 'discover' ? '正在发现…' : '发现设备'}</button>
      <button className="button primary" onClick={() => switchTab('instances')}><Layers size={16} />管理多开</button>
    </div></header>
    <div className="dp-tabs" role="tablist" aria-label="设备页面">{([['current', '当前设备', Monitor, connected.length + connecting.length], ['instances', '多开管理', Layers, profiles.length], ['settings', '连接设置', Settings2, null]] as const).map(([id, label, Icon, count]) => <button key={id} role="tab" id={`dp-tab-${id}`} aria-controls={`dp-panel-${id}`} aria-selected={tab === id} onClick={() => switchTab(id)}><Icon size={16} />{label}{count !== null && <span>{count}</span>}</button>)}</div>
    {operation && <div className="sp-notice" role={operation.phase === 'error' ? 'alert' : 'status'} aria-label="设备操作结果" aria-atomic="true" aria-busy={working}>{working ? <LoaderCircle size={17} className="spin" /> : operation.phase === 'complete' ? <Check size={17} /> : <Info size={17} />}<div>{operation.message}</div></div>}
    <div role="tabpanel" id={`dp-panel-${tab}`} aria-labelledby={`dp-tab-${tab}`}>
      {tab === 'current' && <>
        <section className="sp-section" aria-label="已连接设备"><div className="dp-section-heading"><div className="sp-section-title"><h2>已连接 <span>{connected.length}</span></h2><p>已建立核心连接，可选择设备执行任务。</p></div><button className="button secondary" disabled={disabled} onClick={() => void autoConnect()}>{working && operation.kind === 'auto-connect' ? <LoaderCircle size={16} className="spin" /> : <Wifi size={16} />}{working && operation.kind === 'auto-connect' ? '正在连接…' : hasManualProfiles ? '连接已保存实例' : '自动连接模拟器'}</button></div>
          {connected.length ? <div className="dp-device-grid">{connected.map(renderDevice)}</div> : <div className="dp-empty"><Monitor size={30} /><h3>尚未连接设备</h3><p>先启动模拟器并开启 ADB 调试，再点击“发现设备”。</p></div>}
        </section>
        {!!connecting.length && <section className="sp-section" aria-label="正在连接设备"><div className="sp-section-title"><h2>正在连接</h2><p>正在等待核心确认，连接完成后才可执行任务。</p></div><div className="dp-device-grid">{connecting.map(renderDevice)}</div></section>}
        {discovered !== null && <section className="sp-section sp-discovered" aria-label="本次发现"><div className="sp-section-title"><h2>本次发现 <span>{discovered.length}</span></h2><p>来自本次 ADB 检查；连接状态以“已连接”区域为准。</p></div>{discovered.length ? discovered.map(item => {
          const device = snapshot.devices.find(device => deviceAddressIdentity(device.address) === deviceAddressIdentity(item.address));
          const online = device && device.state !== 'offline';
          const profile = device ? profileFor(device) : matchingDeviceProfile(snapshot.settings, item.address);
          return <div className="dp-discovered-row" key={item.address} tabIndex={0} {...contextMenu('发现设备菜单', [
    { label: '连接设备', disabled: disabled || !!online || item.adbState !== 'device', action: () => { void connect(item.address); } },
    ...(!profile ? [{ label: '保存为多开实例', disabled: disabled || profiles.length >= 32, action: () => saveInstance(item) }] : []),
  ])}><Monitor size={20} /><span><strong>{item.name}</strong><small>{item.address} · {online ? '已连接' : item.adbState === 'device' ? '可连接' : item.adbState === 'unauthorized' ? '等待 ADB 授权' : item.adbState === 'offline' ? 'ADB 离线' : item.adbState}</small></span><div>{!profile && <button className="button secondary" disabled={disabled || profiles.length >= 32} onClick={() => saveInstance(item)}>保存为多开实例</button>}<button className="button secondary" disabled={disabled || !!online || item.adbState !== 'device'} onClick={() => void connect(item.address)}>{online ? '已连接' : '连接'}</button></div></div>;
        }) : <p className="sp-help">未发现设备。确认模拟器已启动并开启 ADB 调试，或使用下方手动连接。</p>}</section>}
        <section className="sp-section"><div className="sp-section-title"><h2>手动连接</h2><p>适用于自定义端口、网络设备或 USB 序列号。</p></div><form className="sp-connect-form" onSubmit={event => { event.preventDefault(); void connect(address); }}><label htmlFor="manual-device-address">手动连接 ADB 地址</label><div><input id="manual-device-address" className="text-input" placeholder="127.0.0.1:5555 或 USB 序列号" value={address} disabled={disabled} onChange={event => setAddress(event.target.value)} /><button type="submit" className="button secondary" disabled={disabled || !address.trim()}><Wifi size={15} />连接设备</button></div></form></section>
        {!!history.length && <details className="dp-history"><summary><ChevronDown size={16} />历史连接（已断开）<span>{history.length}</span></summary><p className="sp-help">这里只保留曾连接的记录；是否仍在运行，请重新发现设备。</p><div className="dp-device-grid">{history.map(renderDevice)}</div></details>}
      </>}
      {tab === 'instances' && <MultiInstanceSettings key={candidate?.address || 'instances'} settings={snapshot.settings} devices={snapshot.devices} events={snapshot.events} busy={disabled} candidate={candidate} onSelectDevice={onSelectDevice} onConnect={connect} onDisconnect={disconnect} onConfigure={configure} onSaveSettings={settings => onAction('settings', () => rpc('settings.save', { settings }), '多开实例配置已保存')} />}
      {tab === 'settings' && <>
        <section className="sp-section"><div className="sp-section-title"><h2>自动连接</h2><p>{hasManualProfiles ? '已启用手动实例清单，自动连接仅尝试清单内的实例。新增设备请先发现，再保存到多开管理。' : '自动连接会发现正在运行的本机模拟器。'}</p></div><div className="sp-setting-row"><div><strong>自动连接模拟器</strong><p>应用启动后和空闲时尝试连接；手动断开后保持断开。</p></div><button type="button" className={`toggle ${snapshot.settings.autoConnect ? 'on' : ''}`} role="switch" aria-label="自动连接模拟器" aria-checked={snapshot.settings.autoConnect} disabled={disabled} onClick={() => void onAction('settings', () => rpc('settings.save', { settings: { ...snapshot.settings, autoConnect: !snapshot.settings.autoConnect } }), '连接偏好已保存')}><i /></button></div></section>
        <section className="sp-section dp-settings-scope"><label className="sp-field">编辑配置<select className="text-input" aria-label="编辑设备连接配置" value={profiles.some(profile => profile.id === settingsTarget) ? settingsTarget : 'default'} onChange={event => setSettingsTarget(event.target.value)}><option value="default">默认配置（未单独配置的设备）</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.address}</option>)}</select></label><p className="sp-help">默认配置供没有独立配置的设备使用。多开实例的地址、触控和截图配置分别保存，修改在下次连接生效。</p></section>
        <TaskConnectionSettings settings={snapshot.settings} selectedDeviceId={settingsDevice?.id || ''} deviceProfileId={settingsProfile?.id} busy={disabled} showAutomatic={false} onSaveSettings={settings => onAction('settings', () => rpc('settings.save', { settings }), '连接配置已保存，请断开设备后重新连接生效')} />
      </>}
    </div>
    {detailDevice && tab !== 'instances' && <section className="sp-section sp-device-detail" aria-label="所选设备详情">{detailDevice.state === 'offline' && !isConnecting(detailDevice) && <div className="sp-section-title"><h2>历史设备详情</h2><p>保留的连接记录，不代表设备目前仍在运行。</p></div>}<div className="sp-device-detail-heading"><Monitor size={26} /><div><h3>{detailDevice.name}</h3><span className={`sp-state ${detailDevice.state}`}>{isConnecting(detailDevice) ? '正在连接' : deviceLabels[detailDevice.state]}</span></div><button className="button secondary" disabled={disabled || detailDevice.state !== 'idle'} title={detailDevice.state === 'running' ? '请先停止此设备的任务' : undefined} onClick={() => void disconnect(detailDevice)}><Unplug size={15} />断开设备</button></div><dl className="sp-description-list"><div><dt>连接地址</dt><dd>{detailDevice.address}</dd></div><div><dt>实际截图方式</dt><dd aria-label="实际截图方式">{actualCaptureMethod(detailDevice)}</dd></div><div><dt>核心版本</dt><dd>{detailDevice.coreVersion || '尚未加载'}</dd></div><div><dt>资源版本</dt><dd>{detailDevice.resourceVersion || '尚未加载'}</dd></div></dl>{detailDevice.connectionError && <p className="sp-instance-error" role="alert">{detailDevice.connectionError}</p>}{detailDevice.state === 'running' && <p className="sp-help">请先停止执行，再断开设备。可通过底部运行栏停止。</p>}</section>}
    {!!diagnostics.length && <section className="sp-section" aria-label="连接诊断"><div className="sp-section-title"><h2>连接诊断</h2></div><div className="connection-diagnostics sp-diagnostics" role="status">{diagnostics.map((message, index) => <p key={index}>{message}</p>)}</div></section>}
  </div>;
}
