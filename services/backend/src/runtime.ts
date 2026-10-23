import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { Store, now } from './storage';
import { RpcError } from './errors';
import { defaultConnection, parsePlan, parseSettings, parseSnapshot, type Plan, type Settings } from './models';
import { automaticCapture } from './auto-capture';
import { nativeTask, validatePlan } from './task-policy';
import { propose } from './agent';
import { defaultComponentPaths, deviceLockPath } from './config';
import { CoreWorker } from './worker';
import { captureAdbPath, connectionCapture } from './capture';
import { Preview } from './preview';
import { UpdateService } from './updates';
import { configuredAdbPath, resolveAdbPath, adbServerIdentity, autoDiscover, deviceLockAddress, emulatorCanonicalAddress, emulatorInstanceForAddress, isLocalEmulator, validateAddress } from './adb';
import { emptyEmulatorInventory, runningWindowsEmulatorInventory, type EmulatorInventory } from './windows-emulators';
import { syncDue, userDataSteps, type SyncStep } from './user-data-sync';
import { findDeviceProfile } from './device-profiles';
import { stageCatalog } from './stages';
import { validateStageListParams } from '../../../packages/contracts/src/validators.js';
import { homeInfo } from './home-info';
import { ActivityCalendar, type ActivityCalendarOptions } from './activity-calendar';
import type { RpcContract } from '../../../packages/contracts/src/rpc-types';

const ident = (prefix: string) => prefix + '-' + randomUUID().replaceAll('-', '').slice(0, 12);
function recognitionResult(type: 'OperBox' | 'Depot', details: any): boolean {
  const result = details.details;
  if (details.taskchain !== type || details.what !== (type === 'OperBox' ? 'OperBoxInfo' : 'DepotInfo') || result?.done !== true) return false;
  const object = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'OperBox') return Array.isArray(result.own_opers) && result.own_opers.length > 0 && result.own_opers.every((oper: any) => object(oper)
    && typeof oper.id === 'string' && oper.id.length > 0 && typeof oper.name === 'string' && oper.name.length > 0 && typeof oper.own === 'boolean'
    && ['elite', 'level', 'potential', 'rarity'].every(key => Number.isInteger(oper[key]) && oper[key] >= -2_147_483_648 && oper[key] <= 2_147_483_647));
  if (typeof result.data !== 'string') return false;
  try {
    const items = JSON.parse(result.data);
    return object(items) && Object.keys(items).length > 0 && Object.entries(items).every(([id, quantity]) => id.length > 0 && Number.isInteger(quantity) && Number(quantity) > 0 && Number(quantity) <= 2_147_483_647);
  } catch { return false; }
}
type Worker = Pick<CoreWorker, 'events' | 'connected' | 'safeIdle' | 'task' | 'stop' | 'connect' | 'waitConnected' | 'close'> & Partial<Pick<CoreWorker, 'frame' | 'click'>>;
export interface RuntimeOptions { applicationDirectory?: string; notify?: (message: any) => void; tickSeconds?: number; source?: any; validator?: any; calendar?: ActivityCalendarOptions; adbExecutable?: () => string; emulatorInventory?: () => Promise<EmulatorInventory>; discoverDevices?: typeof autoDiscover; workerFactory?: (config: any, options?: { signal?: AbortSignal }) => Promise<Worker> }
export class Runtime {
  readonly mode = 'native' as const;
  readonly store: Store;
  readonly updates: UpdateService;
  readonly preview: Preview;
  readonly calendar: ActivityCalendar;
  readonly workers = new Map<string, Worker>();
  private workerConfigurations = new Map<string, any>();
  private clientSwitches = new Map<string, AbortController>();
  private submissions = new Set<Promise<void>>();
  private starts = new Map<string, { planId: string; deviceId: string; promise: Promise<any> }>();
  private connecting = new Set<string>();
  private connectingAddresses = new Set<string>();
  private suppressed = new Set<string>();
  private reconnect: any[] = [];
  private switching = false;
  private autoConnecting = false;
  private lastDiagnostics: string[] = [];
  private nextAutoConnect = Date.now() + 2000;
  private emulatorInventory = emptyEmulatorInventory();
  private nextChecks: Record<string, number> = { core: Date.now() + 3000, resource: Date.now() + 6000 };
  private lastTick = Date.now();
  private ticking = false;
  private closing?: Promise<void>;
  running = true;
  constructor(readonly root: string, private options: RuntimeOptions = {}) {
    this.store = new Store(root);
    this.calendar = new ActivityCalendar(path.join(root, 'cache'), { ...options.calendar, changed: () => { if (this.running) this.emit('calendar.changed', '活动日历缓存已更新'); } });
    if (!this.store.get('meta', 'initialized')) {
      this.store.put('settings', 'main', parseSettings());
      this.store.put('meta', 'initialized', true);
    }
    const defaults = defaultComponentPaths(root, options.applicationDirectory);
    const settings = parseSettings(this.store.get('settings', 'main'));
    if (!settings.componentPaths) this.store.put('settings', 'main', { ...settings, componentPaths: defaults });
    for (const device of this.store.all('device')) { device.state = 'offline'; this.store.put('device', device.id, device); }
    for (const run of this.store.all('run')) if (run.status === 'running') {
      Object.assign(run, { status: 'failed', finishedAt: now(), message: '上次运行被中断；请核对设备后重新执行' }); this.store.put('run', run.id, run); this.emit('run.interrupted', run.message, { runId: run.id });
    }
    this.updates = new UpdateService(path.join(root, 'components'), this.store, this.emit.bind(this), this.busy.bind(this), {
      source: options.source, validator: options.validator, directories: defaults,
      beforeActivate: () => this.beforeSwitch(), afterActivate: () => this.afterSwitch(), finishActivate: (error?: string) => this.finishSwitch(error),
    });
    this.preview = new Preview({
      available: () => this.running && !this.switching,
      device: id => this.store.get('device', id), worker: id => this.workers.get(id),
      hasRun: id => this.store.hasRunningRun(id) || [...this.starts.values()].some(start => start.deviceId === id),
      clicked: data => { this.emit('device.clicked', '点击指令已获核心确认', data); },
    });
  }
  emit(type: string, message: string, data: any = {}) { const event = this.store.event(type, message, data); this.options.notify?.({ jsonrpc: '2.0', method: 'runtime.event', params: event }); return event; }
  busy() { return !!this.preview?.busy || this.connecting.size > 0 || this.store.all('run').some(run => run.status === 'running' && !this.store.get('execution', run.id, {}).boundaryWaiting) || [...this.workers.values()].some(worker => !worker.safeIdle); }
  devices(): any[] {
    return this.store.all('device').map(device => {
      const synced = this.syncHistory(device.id, this.store.get('device_client', device.id, 'Official'));
      return { ...device, dataSync: { operatorsAt: synced.operatorsAt ?? null, depotAt: synced.depotAt ?? null } };
    });
  }
  snapshot() { return parseSnapshot({ mode: this.mode, devices: this.devices(), plans: this.store.all('plan').map(parsePlan), runs: this.store.all('run').reverse().slice(0, 100).map(run => ({ finishedAt: null, ...run })), updates: this.updates.channels(), settings: parseSettings(this.store.get('settings', 'main')), events: this.store.events() }); }
  async handle(method: string, params: any = {}) {
    if (params === null) params = {};
    if (typeof params !== 'object' || Array.isArray(params)) throw new RpcError(-32602, 'params 必须是对象');
    if (!this.running) throw new RpcError(-32011, '应用运行时正在退出');
    const required = (...keys: string[]) => { if (keys.some(key => !(key in params))) throw new RpcError(-32602, '请求参数无效'); };
    switch (method) {
      case 'app.snapshot': return this.snapshot();
      case 'stages.list':
        if (!validateStageListParams(params)) throw new RpcError(-32602, '关卡目录请求参数无效');
        return this.stages(params.clientType, params.refresh);
      case 'home.info': {
        if (Object.keys(params).some(key => !['deviceId', 'clientType', 'refresh'].includes(key)) || (params.deviceId !== undefined && (typeof params.deviceId !== 'string' || !params.deviceId || params.deviceId.length > 200)) || (params.refresh !== undefined && typeof params.refresh !== 'boolean')) throw new RpcError(-32602, '主页信息请求参数无效');
        if (params.clientType !== undefined && !['Official', 'Bilibili', 'YoStarEN', 'YoStarJP', 'YoStarKR', 'txwy'].includes(params.clientType)) throw new RpcError(-32602, '游戏客户端无效');
        if (params.deviceId && !this.store.get('device', params.deviceId)) throw new RpcError(-32004, '设备不存在');
        const settings = parseSettings(this.store.get('settings', 'main'));
        const device = params.deviceId ? this.store.get('device', params.deviceId) : undefined;
        const profile = device && (settings.deviceProfiles?.find(item => item.id === device.connectionProfileId) || findDeviceProfile(settings, device.address));
        const clientType = params.clientType ?? (params.deviceId ? this.store.get('device_client', params.deviceId) : null) ?? profile?.connection.clientType ?? settings.connection?.clientType ?? 'Official';
        const activityCatalog = await this.stages(clientType, params.refresh === true);
        return { ...homeInfo(settings, params.deviceId, clientType, new Date(activityCatalog.generatedAt)), activityCatalog };
      }
      case 'device.discover':
        try { const result = await (this.options.discoverDevices ?? autoDiscover)(await this.adbExecutable(), { inventory: () => this.readEmulatorInventory() }); this.emulatorInventory = result.inventory; return result.devices; } catch (error) { throw new RpcError(-32040, 'ADB 设备发现失败', String(error)); }
      case 'device.connect': return this.connectDevice(params);
      case 'device.auto_connect': return this.autoConnectDevices();
      case 'device.disconnect': required('id'); return this.disconnectDevice(params.id);
      case 'device.frame': return this.preview.frame(params);
      case 'device.click': return this.preview.click(params);
      case 'plan.save': {
        required('plan'); const plan = parsePlan(params.plan); if (plan.schedule) throw new RpcError(-32030, '定时调度尚未实现，请使用手动执行');
        this.validatePolicy(plan); if (!plan.id) plan.id = ident('plan'); this.store.put('plan', plan.id, plan); this.emit('plan.saved', '计划已保存', { planId: plan.id }); return plan;
      }
      case 'plan.delete':
        required('id'); if (this.store.all('run').some(r => r.planId === params.id && r.status === 'running')) throw new RpcError(-32011, '运行中的计划不能删除');
        this.store.delete('plan', params.id); this.emit('plan.deleted', '计划已删除', { planId: params.id }); return { deleted: true };
      case 'run.start': required('requestId', 'planId', 'deviceId'); return this.startRun(params);
      case 'run.stop': required('id'); return this.stopRun(params.id);
      case 'settings.save': {
        required('settings'); const settings = parseSettings(params.settings), previous = parseSettings(this.store.get('settings', 'main'));
        await this.updates.saveDirectories(settings.componentPaths ?? previous.componentPaths!, (componentPaths) => {
          settings.componentPaths = componentPaths; this.store.put('settings', 'main', settings);
        });
        if (settings.autoConnect && !previous.autoConnect) { this.suppressed.clear(); this.nextAutoConnect = 0; }
        this.emit('settings.saved', '设置已保存'); return settings;
      }
      case 'agent.message': { required('message'); const result = propose(params.message, p => this.validatePolicy(p)); this.emit('agent.plan_proposed', '本地演示已生成待确认计划，尚未执行'); return result; }
      case 'updates.check': case 'updates.prepare': case 'updates.activate': case 'updates.rollback': {
        if (!('channel' in params)) throw new RpcError(-32602, '缺少更新通道');
        const operation = method.slice(8) as 'check' | 'prepare' | 'activate' | 'rollback';
        const result = await this.updates[operation](params.channel);
        if (operation === 'activate' && params.channel === 'core') this.nextChecks.resource = Date.now(); return result;
      }
      default: throw new RpcError(-32601, '未知方法', { method });
    }
  }
  validatePolicy(plan: Plan) { validatePlan(plan, parseSettings(this.store.get('settings', 'main'))); }
  async stages(clientType: RpcContract['results']['stages.list']['clientType'] = 'Official', refresh = false) {
    const calendar = await this.calendar.get(refresh);
    return stageCatalog(this.store.get('active', 'combo', {}), clientType, this.options.calendar?.now?.() ?? new Date(), calendar);
  }
  async startRun(params: any) {
    const token = params.requestId;
    if (typeof token !== 'string' || !token || [...token].length > 200) throw new RpcError(-32602, 'requestId 必须是非空字符串');
    const pending = this.starts.get(token);
    if (pending) { if (pending.planId !== params.planId || pending.deviceId !== params.deviceId) throw new RpcError(-32011, '同一请求标识不能用于不同执行'); return pending.promise; }
    const promise = this.startRunInner(params);
    this.starts.set(token, { planId: params.planId, deviceId: params.deviceId, promise });
    try { return await promise; } finally { this.starts.delete(token); }
  }
  private async startRunInner(params: any) {
    if (this.switching) throw new RpcError(-32011, '正在切换核心与资源，请稍候');
    const token = params.requestId;
    if (typeof token !== 'string' || !token || [...token].length > 200) throw new RpcError(-32602, 'requestId 必须是非空字符串');
    const existing = this.store.get('request', token);
    if (existing) { if (existing.planId !== params.planId || existing.deviceId !== params.deviceId) throw new RpcError(-32011, '同一请求标识不能用于不同执行'); return this.store.get('run', existing.runId); }
    const saved = this.store.get('plan', params.planId); if (!saved) throw new RpcError(-32004, '计划不存在');
    const plan = parsePlan(saved); this.validatePolicy(plan);
    if (plan.deviceId !== null && plan.deviceId !== params.deviceId) throw new RpcError(-32011, '任务表已绑定其他设备，请使用绑定设备执行');
    if (!plan.enabled) throw new RpcError(-32011, '计划已禁用');
    plan.tasks = plan.tasks.filter(task => task.enabled && task.params.enable !== false) as Plan['tasks'];
    if (!plan.tasks.length) throw new RpcError(-32010, '任务表至少需要启用一条任务才能执行');
    const device = this.devices().find(d => d.id === params.deviceId); if (!device) throw new RpcError(-32004, '设备不存在');
    if (this.preview.isClicking(device.id)) throw new RpcError(-32011, '正在发送手动点击，请稍后启动计划');
    if (device.state !== 'idle') throw new RpcError(-32011, '设备已有控制者');
    if (this.store.all('run').some(r => r.deviceId === device.id && r.status === 'running')) throw new RpcError(-32011, '该设备已有尚未结束的计划');
    this.preview.invalidate(device.id);
    const worker = this.workers.get(device.id);
    if (!worker?.connected || !worker.safeIdle) throw new RpcError(-32011, '核心尚未连接或异步操作未结束');
    if (!this.running || this.switching) throw new RpcError(-32011, '应用运行时正在退出或切换');
    const id = ident('run'), run = { id, planId: params.planId, deviceId: device.id, status: 'running', progress: 0, message: '正在提交首个任务', startedAt: now(), finishedAt: null };
    // Persist deduplication and the execution snapshot before any native effect.
    this.store.transaction(() => { this.store.put('run', id, run); this.store.put('run_plan', id, plan); this.store.put('request', token, { runId: id, planId: params.planId, deviceId: device.id }); });
    this.emit('run.started', run.message, { run });
    device.state = 'running'; this.store.put('device', device.id, device); await this.submitNativeTask(run, 0); return this.store.get('run', id);
  }
  async stopRun(id: string) {
    const run = this.store.get('run', id); if (!run) throw new RpcError(-32004, '执行记录不存在');
    if (run.status === 'running') {
      this.clientSwitches.get(run.deviceId)?.abort();
      const worker = this.workers.get(run.deviceId);
      if (worker) {
        const execution = this.store.get('execution', id, {}); execution.stopRequested = Date.now(); this.store.put('execution', id, execution);
        run.message = '正在停止并等待核心与异步调用结束，原计划保留'; this.store.put('run', id, run);
        try { await worker.stop(); return this.store.get('run', id); }
        catch { await worker.close(); this.workers.delete(run.deviceId); this.workerConfigurations.delete(run.deviceId); }
      }
      this.finishNativeRun(run, 'stopped', '工作进程已结束，请核对设备现场，原计划保留');
    }
    return run;
  }
  private validateAutomatic(address: string) {
    if (!parseSettings(this.store.get('settings', 'main')).autoConnect) throw new RpcError(-32011, '自动连接已关闭');
    if (this.suppressed.has(this.lockAddress(address))) throw new RpcError(-32011, '该设备已手动断开，自动连接已跳过');
  }
  private lockAddress(address: string) { return emulatorCanonicalAddress(this.store.get('device-alias', address, deviceLockAddress(address)), this.emulatorInventory); }
  private sdkInstance(capture: Settings['capture']) {
    if (capture?.method !== 'mumu') return;
    try {
      const root = realpathSync(capture.emulatorPath).toLowerCase();
      const matches = this.emulatorInventory.instances.filter(instance => instance.kind !== 'ldplayer' && instance.index === capture.instanceIndex && realpathSync(instance.emulatorPath).toLowerCase() === root);
      return matches.length === 1 ? matches[0] : undefined;
    } catch { return; }
  }
  private profileLockAddress(profile: NonNullable<Settings['deviceProfiles']>[number]) {
    const instance = this.sdkInstance(profile.capture);
    return this.lockAddress(instance?.address ?? profile.address);
  }
  private readEmulatorInventory() {
    // Test adapters must never enumerate or operate real host emulators.
    return (this.options.emulatorInventory ?? (this.options.workerFactory || this.options.adbExecutable ? async () => emptyEmulatorInventory() : runningWindowsEmulatorInventory))();
  }
  private async adbExecutable(selected?: Pick<Settings, 'connection' | 'capture'>): Promise<string> {
    if (this.options.adbExecutable) return this.options.adbExecutable();
    const { capture, connection } = selected ?? parseSettings(this.store.get('settings', 'main'));
    if (connection?.adbPath.trim()) return connection.adbPath.trim() === 'adb' ? resolveAdbPath({ ...process.env, MAAVERGE_ADB_PATH: undefined }) : configuredAdbPath(connection.adbPath);
    if (process.env.MAAVERGE_ADB_PATH) return resolveAdbPath();
    return captureAdbPath(capture) || resolveAdbPath();
  }
  async connectDevice(params: any, internal = false, automatic = false, inventory?: EmulatorInventory): Promise<any> {
    let id: string | undefined, reservedAddress: string | undefined, profileId: string | undefined, attemptedAddress: string | undefined, reserved = false, worker: Worker | undefined;
    try {
      if (this.switching && !internal) throw new RpcError(-32011, '正在切换核心与资源，暂不能连接设备');
      if (!this.running) throw new RpcError(-32011, '应用运行时正在退出');
      const address = validateAddress(params.address);
      attemptedAddress = address;
      if (automatic) this.validateAutomatic(address);
      const active = this.store.all('device').find(device => device.address === address && this.workers.has(device.id));
      if (active) return active;
      if (this.connectingAddresses.has(address)) throw new RpcError(-32011, '该设备正在建立连接');
      this.connectingAddresses.add(address); reservedAddress = address;
      this.emulatorInventory = inventory ?? await this.readEmulatorInventory();
      if (!this.running || this.switching && !internal) throw new RpcError(-32011, '正在退出或切换核心，连接已取消');
      const settings = parseSettings(this.store.get('settings', 'main'));
      let profile = findDeviceProfile(settings, address) ?? settings.deviceProfiles?.find(profile => this.profileLockAddress(profile) === this.lockAddress(address)); profileId = profile?.id;
      let selected = profile ? { capture: profile.capture, connection: profile.connection } : settings;
      const detected = automaticCapture(selected.capture, address, this.emulatorInventory);
      if (detected) selected = { ...selected, capture: detected.capture, ...(detected.config ? { connection: { ...defaultConnection(), ...selected.connection, config: detected.config } } : {}) };
      const knownInstance = emulatorInstanceForAddress(address, this.emulatorInventory) ?? (selected.capture?.mumuBridge ? this.sdkInstance(selected.capture) : undefined);
      const capture = await connectionCapture(selected.capture, address, process.platform, knownInstance);
      if (!this.running || this.switching && !internal) throw new RpcError(-32011, '正在退出或切换核心，连接已取消');
      if (detected?.instance && detected.capture.method !== 'adb') {
        const current = parseSettings(this.store.get('settings', 'main'));
        const profiles = current.deviceProfiles ?? [];
        const profileKey = profile?.id ?? `detected-${createHash('sha256').update(`${detected.capture.method}|${capture.emulatorPath.toLowerCase()}|${capture.instanceIndex}`).digest('hex').slice(0, 16)}`;
        const existing = profiles.find(item => item.id === profileKey);
        const unchangedDefaults = JSON.stringify([current.capture, current.connection]) === JSON.stringify([settings.capture, settings.connection]);
        const currentProfile = profiles.find(item => this.profileLockAddress(item) === this.lockAddress(address));
        if (profile ? existing && JSON.stringify(existing) === JSON.stringify(profile) : !existing && !currentProfile && unchangedDefaults) {
          const automaticProfile = { ...existing, id: profileKey, name: existing?.name ?? `${detected.instance.name}（实例 ${detected.instance.index}）`.slice(0, 80),
            address: existing && !existing.autoDetected ? existing.address : address,
            connection: { ...defaultConnection(), ...selected.connection, address: existing && !existing.autoDetected ? existing.address : address },
            capture: { method: capture.method, emulatorPath: capture.emulatorPath, instanceIndex: capture.instanceIndex, autoDetect: true }, ...(!existing ? { autoDetected: true } : {}) };
          if (!existing && profiles.length >= 32) throw new Error('自动截图配置最多保存 32 个实例，请清理不用的实例配置');
          const next = parseSettings({ ...current, deviceProfiles: existing ? profiles.map(item => item.id === profileKey ? automaticProfile : item) : [...profiles, automaticProfile] });
          this.store.put('settings', 'main', next); profile = next.deviceProfiles!.find(item => item.id === profileKey); profileId = profileKey;
          if (!existing || JSON.stringify(existing) !== JSON.stringify(profile)) this.emit('settings.changed', '已自动配置实例增强截图', { profileId: profileKey, method: capture.method, instanceIndex: capture.instanceIndex });
        }
      }
      // A bridged ADB address still controls the selected local MuMu SDK instance.
      // Keep its alias after settings changes so reconnect/disconnect uses the same lease.
      const sdkInstance = this.sdkInstance(capture);
      if (sdkInstance && (capture.mumuBridge || emulatorInstanceForAddress(address, this.emulatorInventory) === sdkInstance)) this.store.put('device-alias', address, sdkInstance.address);
      else if (capture.method === 'mumu' && capture.mumuBridge) throw new Error('未能确认 MuMu 桥接实例，请启动对应实例并检查多开管理器');
      else this.store.delete('device-alias', address);
      if (automatic) this.validateAutomatic(address); else if (!internal) this.suppressed.delete(this.lockAddress(address));
      const combo = this.store.get('active', 'combo', {}); if (!combo.core) throw new Error('请先在更新中心安装并启用核心');
      const canonical = this.lockAddress(address), aliases = this.store.all('device').filter(d => this.lockAddress(d.address) === canonical);
      const previous = aliases.find(d => this.workers.has(d.id)) || aliases[0];
      id = previous?.id || 'device-' + createHash('sha256').update(canonical).digest('hex').slice(0, 12);
      if (this.connecting.has(id!)) throw new RpcError(-32011, '该设备正在建立连接');
      if (this.workers.has(id!)) return this.store.get('device', id!);
      this.connecting.add(id!); reserved = true;
      const adb = await this.adbExecutable(selected);
      if (!this.running || this.switching && !internal) throw new RpcError(-32011, '正在退出或切换核心，连接已取消');
      if (automatic) this.validateAutomatic(address);
      const connection = selected.connection ? (({ config, touchMode, adbLite, clientType }) => ({ config, touchMode, adbLite, clientType }))(selected.connection) : undefined;
      const { mumuTouch, mumuBridge, autoDetect: _autoDetect, ...plainCapture } = capture;
      const workerCapture = capture.method === 'adb' ? { method: 'adb' } : capture.method === 'mumu' ? { ...plainCapture, ...(mumuTouch !== undefined ? { mumuTouch } : {}), ...(mumuBridge !== undefined ? { mumuBridge } : {}) } : plainCapture;
      const config = { core: combo.core.path, resource: combo.resource.path, adb, address, capture: workerCapture, ...(connection ? { connection } : {}), userDir: path.join(this.root, 'workers', id!), lockPath: deviceLockPath(adbServerIdentity() + '|' + canonical) };
      worker = await this.startWorker(config); await worker.connect();
      if (!this.running) throw new RpcError(-32011, '应用运行时正在退出');
      if (automatic) this.validateAutomatic(address);
      this.workers.set(id!, worker);
      this.workerConfigurations.set(id!, structuredClone(config));
      const device = { id, name: String(params.name || profile?.name || address).slice(0, 80), address, state: 'offline', ...(profile ? { connectionProfileId: profile.id } : {}), coreVersion: combo.core.version, resourceVersion: combo.resource.version };
      this.store.put('device', id!, device); this.emit('device.connecting', '正在异步连接设备', { device }); return device;
    } catch (error) { if (worker && !this.workers.has(id!)) await worker.close(); if (profileId) this.emit('device.connection_failed', '多开实例连接失败', { profileId, address: attemptedAddress, error: String(error) }); if (error instanceof RpcError) throw error; throw new RpcError(-32040, '设备连接失败', String(error)); }
    finally { if (reserved) this.connecting.delete(id!); if (reservedAddress) this.connectingAddresses.delete(reservedAddress); }
  }
  async autoConnectDevices(automatic = false): Promise<any> {
    if (this.autoConnecting) throw new RpcError(-32011, '模拟器自动连接正在进行');
    this.autoConnecting = true;
    try {
      if (!this.running || this.switching) throw new RpcError(-32011, '正在退出或切换核心，请稍后重试');
      if (!automatic) this.suppressed.clear();
      if (!this.store.get('active', 'combo', {}).core) throw new RpcError(-32040, '请先在更新中心安装并启用核心，再自动连接模拟器');
      const profiles = parseSettings(this.store.get('settings', 'main')).deviceProfiles ?? [];
      const configuredOnly = profiles.some(profile => !profile.autoDetected);
      let discovered: { address: string; name: string; adbState: string }[] = [], diagnostics: string[] = [];
      let inventory: EmulatorInventory;
      if (!configuredOnly) {
        try { const result = await (this.options.discoverDevices ?? autoDiscover)(await this.adbExecutable(), { inventory: () => this.readEmulatorInventory() }); discovered = result.devices; diagnostics = result.diagnostics; inventory = result.inventory; }
        catch (error) { throw new RpcError(-32040, '模拟器自动发现失败', String(error)); }
      } else inventory = await this.readEmulatorInventory();
      this.emulatorInventory = inventory;
      // Explicit multi-instance profiles use their own ADB executables and SDK
      // indices. A global enhanced-capture index must never be applied to all.
      const candidates = configuredOnly ? profiles.map(profile => ({ address: profile.address, name: profile.name, adbState: 'configured' })) : discovered;
      const devices: any[] = [], seen = new Set<string>();
      for (const candidate of candidates) {
        const configured = findDeviceProfile({ deviceProfiles: profiles }, candidate.address);
        const key = configured ? this.profileLockAddress(configured) : this.lockAddress(candidate.address);
        if ((!configured && (candidate.adbState !== 'device' || !isLocalEmulator(candidate.address))) || seen.has(key) || (automatic && this.suppressed.has(key))) continue;
        seen.add(key);
        try {
          if (this.switching || !this.running) throw new RpcError(-32011, '正在退出或切换核心，请稍后重试');
          const previous = [...this.workers.keys()].map(id => this.store.get('device', id)).find(d => this.lockAddress(d.address) === key);
          if (previous) { const worker = this.workers.get(previous.id)!; if (worker.connected || !worker.safeIdle) { devices.push(previous); continue; } await this.disconnectDevice(previous.id, true); }
          devices.push(await this.connectDevice(candidate, false, automatic, inventory));
        } catch (error) { diagnostics.push(candidate.address + '：' + (error instanceof RpcError && error.data !== undefined ? `${error.message}：${String(error.data)}` : error instanceof Error ? error.message : String(error))); }
      }
      if (!devices.length) diagnostics.push('未连接到可用模拟器；请启动模拟器并开启 ADB 调试，或手动填写地址');
      if (!automatic || JSON.stringify(diagnostics) !== JSON.stringify(this.lastDiagnostics)) this.emit('device.auto_connect', '模拟器自动连接检查完成', { requested: devices.length, diagnostics });
      this.lastDiagnostics = diagnostics; return { devices, discovered, diagnostics };
    } finally { this.autoConnecting = false; }
  }
  async automaticConnections() {
    if (!this.running || !parseSettings(this.store.get('settings', 'main')).autoConnect || Date.now() < this.nextAutoConnect || this.switching || this.busy()) return;
    this.nextAutoConnect = Date.now() + 30_000; if (!this.store.get('active', 'combo', {}).core) return;
    try { await this.autoConnectDevices(true); } catch (error) { const diagnostics = [String(error)]; if (this.running && JSON.stringify(diagnostics) !== JSON.stringify(this.lastDiagnostics)) this.emit('device.auto_connect_failed', '模拟器自动发现失败', { detail: String(error) }); this.lastDiagnostics = diagnostics; }
  }
  async disconnectDevice(id: string, internal = false) {
    if (this.switching && !internal) throw new RpcError(-32011, '正在切换核心与资源，暂不能断开设备');
    if (this.preview.isClicking(id)) throw new RpcError(-32011, '点击尚未完成，请稍后断开设备');
    this.preview.invalidate(id);
    if (!this.switching && this.store.all('run').some(r => r.deviceId === id && r.status === 'running')) throw new RpcError(-32011, '请先停止该设备的执行');
    const worker = this.workers.get(id); this.workers.delete(id); this.workerConfigurations.delete(id); await worker?.close();
    const device = this.store.get('device', id); if (device) { if (!internal) this.suppressed.add(this.lockAddress(device.address)); device.state = 'offline'; this.store.put('device', id, device); }
    this.emit('device.disconnected', '设备控制权已释放', { deviceId: id }); return { disconnected: true };
  }
  async beforeSwitch() {
    if (!this.switching && this.busy()) throw new Error('核心或异步操作仍在运行'); this.switching = true;
    this.preview.invalidate();
    const reconnect = new Map(this.reconnect.map(d => [d.id, d]));
    const workers = [...this.workers.entries()]; this.workers.clear(); this.workerConfigurations.clear();
    for (const [id] of workers) { const d = this.store.get('device', id); reconnect.set(id, d); d.state = 'offline'; this.store.put('device', id, d); this.emit('device.disconnected', '正在安全切换核心工作进程', { deviceId: id }); }
    this.reconnect = [...reconnect.values()];
    const results = await Promise.allSettled(workers.map(([, w]) => w.close()));
    if (results.some(r => r.status === 'rejected')) throw new Error('旧核心工作进程退出失败');
  }
  async afterSwitch() {
    for (const device of this.reconnect) { await this.connectDevice({ address: device.address, name: device.name }, true); if (!await this.workers.get(device.id)!.waitConnected()) throw new Error('新版核心设备重连失败或超时: ' + device.name); }
  }
  async finishSwitch(error?: string) {
    if (!this.switching) return;
    if (error) {
      await Promise.all([...this.workers.values()].map(w => w.close())); this.workers.clear(); this.workerConfigurations.clear();
      for (const device of this.store.all('device')) { device.state = 'offline'; this.store.put('device', device.id, device); }
      for (const run of this.store.all('run')) if (run.status === 'running') this.finishNativeRun(run, 'failed', '核心切换及旧版重连失败；请人工核对设备: ' + error);
      this.emit('update.recovery_failed', '设备重连失败，已终止等待中的计划', { error });
    }
    this.reconnect = []; this.switching = false;
  }
  private taskClient(run: any, index: number): string {
    const tasks = this.store.get('run_plan', run.id).tasks;
    if (typeof tasks[index].params.client_type === 'string' && tasks[index].params.client_type) return tasks[index].params.client_type;
    if (['StartUp', 'CloseDown'].includes(tasks[index].type) && !('client_type' in tasks[index].params)) return 'Official';
    for (let previous = index - 1; previous >= 0; previous--) if (tasks[previous].type === 'StartUp') return tasks[previous].params.client_type || 'Official';
    const settings = parseSettings(this.store.get('settings', 'main')), device = this.store.get('device', run.deviceId);
    const profile = device && (settings.deviceProfiles?.find(item => item.id === device.connectionProfileId) || findDeviceProfile(settings, device.address));
    return this.store.get('device_client', run.deviceId) ?? profile?.connection.clientType ?? settings.connection?.clientType ?? 'Official';
  }
  private syncHistory(deviceId: string, clientType: string): { operatorsAt?: string | null; depotAt?: string | null } {
    const synced = this.store.get('user_data_sync', deviceId, {});
    return (synced.clientType ?? this.store.get('device_client', deviceId, 'Official')) === clientType ? synced : {};
  }
  private rememberClient(run: any, params: any) {
    const clientType = params.client_type || 'Official', accountName = typeof params.account_name === 'string' ? params.account_name : '';
    let estimatesInvalidated = false;
    this.store.transaction(() => {
      if (clientType !== this.store.get('device_client', run.deviceId, 'Official') || accountName !== this.store.get('device_account', run.deviceId, '')) {
        this.store.delete('user_data_sync', run.deviceId); this.store.delete('mall_visit', run.deviceId);
        const settings = this.store.get('settings', 'main');
        if (settings.infrastructureEstimates?.some((profile: any) => profile.deviceId === run.deviceId)) {
          this.store.put('settings', 'main', { ...settings, infrastructureEstimates: settings.infrastructureEstimates.filter((profile: any) => profile.deviceId !== run.deviceId) });
          estimatesInvalidated = true;
        }
      }
      this.store.put('device_client', run.deviceId, clientType); this.store.put('device_account', run.deviceId, accountName);
    });
    if (estimatesInvalidated) this.emit('device.infrastructure_estimate_invalidated', '账号或客户端已切换，请重新校准此设备的基建估算', { deviceId: run.deviceId, runId: run.id });
  }
  private startWorker(config: any, signal?: AbortSignal) {
    return this.options.workerFactory ? this.options.workerFactory(structuredClone(config), { signal }) : CoreWorker.start(config, { signal });
  }
  private canSubmit(runId: string) {
    return this.running && !this.switching && this.store.get('run', runId)?.status === 'running' && !this.store.get('execution', runId, {}).stopRequested;
  }
  private async workerForClient(run: any, clientType: string): Promise<Worker | undefined> {
    const id = run.deviceId, previous = this.workers.get(id), saved = this.workerConfigurations.get(id);
    if (!previous?.connected || !previous.safeIdle) throw new Error('核心尚未连接或未到达安全空闲边界');
    if ((saved?.connection?.clientType ?? 'Official') === clientType) return previous;
    if (!saved) throw new Error('缺少已连接核心的配置快照，无法安全切换客户端资源');
    if (this.clientSwitches.has(id)) throw new Error('该设备正在切换客户端资源');
    const controller = new AbortController(), cancelled = () => controller.signal.aborted || !this.canSubmit(run.id);
    this.clientSwitches.set(id, controller); this.connecting.add(id); this.preview.invalidate(id);
    let replacement: Worker | undefined, ready = false;
    const abort = () => { void replacement?.close().catch(() => {}); };
    controller.signal.addEventListener('abort', abort, { once: true });
    try {
      const config = { ...structuredClone(saved), connection: { config: 'General', touchMode: 'minitouch', adbLite: false, ...saved.connection, clientType } };
      this.workers.delete(id); this.workerConfigurations.delete(id);
      await previous.close();
      if (cancelled()) return;
      this.emit('device.client_switching', '正在切换客户端资源并重新连接当前设备', { deviceId: id, runId: run.id, clientType });
      replacement = await this.startWorker(config, controller.signal);
      if (cancelled()) { await replacement.close(); return; }
      this.workers.set(id, replacement); this.workerConfigurations.set(id, structuredClone(config));
      await replacement.connect();
      if (!await replacement.waitConnected(30_000, cancelled)) {
        if (cancelled()) return;
        throw new Error('客户端资源切换后的设备连接失败或超时');
      }
      if (cancelled()) return;
      ready = true;
      return replacement;
    } catch (error) {
      if (!cancelled()) throw new Error('客户端资源切换失败，本次执行已结束且不会重放：' + String(error));
    } finally {
      if (!ready) {
        await replacement?.close();
        if (this.workers.get(id) === replacement) { this.workers.delete(id); this.workerConfigurations.delete(id); }
      }
      controller.signal.removeEventListener('abort', abort); this.clientSwitches.delete(id); this.connecting.delete(id);
    }
  }
  submitNativeTask(run: any, index: number, syncSteps?: SyncStep[], syncIndex = 0): Promise<void> {
    const pending = this.submitNativeTaskInner(run, index, syncSteps, syncIndex);
    this.submissions.add(pending);
    return pending.finally(() => { this.submissions.delete(pending); });
  }
  private async submitNativeTaskInner(run: any, index: number, syncSteps?: SyncStep[], syncIndex = 0) {
    const current = this.store.get('run', run.id);
    if (!this.running || this.switching || current?.status !== 'running' || this.store.get('execution', run.id, {}).stopRequested) return;
    const plan = this.store.get('run_plan', run.id), configuredTask = plan.tasks[index], clientType = this.taskClient(run, index);
    if (configuredTask.type === 'UserDataUpdate') {
      syncSteps ??= userDataSteps(configuredTask.params, this.syncHistory(run.deviceId, clientType), new Date(), clientType);
      if (!syncSteps.length) {
        this.emit('run.task_skipped', '更新数据已在当前周期完成或未选择识别项目，已跳过', { runId: run.id, index });
        await this.advanceNativeTask(run, index + 1); return;
      }
    }
    const state: any = { index, syncSteps, syncIndex, clientType, completed: false, failed: false, queueEnded: false, idleAfterEnd: false, taskId: null, stopRequested: null, submitting: true };
    const task = nativeTask(syncSteps ? { type: syncSteps[syncIndex]!.type, params: {}, enabled: true } : configuredTask);
    if (task.type === 'Fight') {
      if (!('client_type' in task.params)) task.params.client_type = clientType;
      if (!('server' in task.params)) task.params.server = ({ YoStarEN: 'US', YoStarJP: 'JP', YoStarKR: 'KR' } as Record<string, string>)[clientType] ?? 'CN';
    }
    if (['OperBox', 'Depot'].includes(task.type)) state.recognitionType = task.type;
    if (task.type === 'Mall') {
      const visited = this.store.get('mall_visit', run.deviceId);
      if (configuredTask.params.visit_friends_once_a_day && visited?.clientType === clientType && !syncDue(visited.visitedAt, 'daily', new Date(), clientType)) task.params.visit_friends = false;
      state.mallVisitEnabled = task.params.visit_friends !== false;
    }
    this.store.put('execution', run.id, state);
    try {
      const worker = await this.workerForClient(run, clientType);
      if (!worker || !this.canSubmit(run.id)) {
        Object.assign(state, this.store.get('execution', run.id, {}), { submitting: false }); this.store.put('execution', run.id, state);
        if (this.store.get('run', run.id)?.status === 'running' && (state.stopRequested || !this.running)) this.finishNativeRun(run, 'stopped', '执行已停止，未执行计划保留');
        return;
      }
      if (this.updates.channels().some(channel => channel.status === 'waiting_idle')) {
        Object.assign(state, { submitting: false, boundaryWaiting: true, nextIndex: index, nextSyncSteps: syncSteps, nextSyncIndex: syncIndex }); this.store.put('execution', run.id, state);
        run.message = '已到达安全边界，等待核心与资源更新后继续执行'; this.store.put('run', run.id, run); this.emit('run.progress', run.message, { run }); return;
      }
      const result = await worker.task(task);
      Object.assign(state, this.store.get('execution', run.id, {}), { taskId: result.taskId, submitting: false }); this.store.put('execution', run.id, state);
      if (state.stopRequested || this.store.get('run', run.id).status !== 'running') return;
      Object.assign(run, { message: '正在执行 ' + task.type, progress: Math.floor(index * 100 / plan.tasks.length) }); this.store.put('run', run.id, run);
      const device = this.store.get('device', run.deviceId); device.state = 'running'; this.store.put('device', device.id, device); this.emit('run.progress', run.message, { run });
    } catch (error) {
      Object.assign(state, this.store.get('execution', run.id, {}), { submitting: false }); this.store.put('execution', run.id, state);
      if (this.store.get('run', run.id)?.status === 'running') this.finishNativeRun(run, state.stopRequested ? 'stopped' : 'failed', state.stopRequested ? '执行已停止，未执行计划保留' : '任务提交失败或结果未知: ' + String(error));
    }
  }
  private async advanceNativeTask(run: any, index: number, syncSteps?: SyncStep[], syncIndex = 0) {
    const plan = this.store.get('run_plan', run.id);
    if (index >= plan.tasks.length) this.finishNativeRun(run, 'completed', '所有任务链均报告成功且核心已空闲');
    else if (this.updates.channels().some(c => c.status === 'waiting_idle')) {
      const state = this.store.get('execution', run.id, {});
      Object.assign(state, { boundaryWaiting: true, nextIndex: index, nextSyncSteps: syncSteps, nextSyncIndex: syncIndex }); this.store.put('execution', run.id, state);
      Object.assign(run, { progress: Math.floor(index * 100 / plan.tasks.length), message: '当前任务完成，等待核心与资源热切换后继续剩余计划' }); this.store.put('run', run.id, run); this.emit('run.progress', run.message, { run });
    } else await this.continueNativeTask(run, index, syncSteps, syncIndex);
  }
  private async continueNativeTask(run: any, index: number, syncSteps?: SyncStep[], syncIndex = 0) {
    const changesClient = (this.workerConfigurations.get(run.deviceId)?.connection?.clientType ?? 'Official') !== this.taskClient(run, index);
    const pending = this.submitNativeTask(run, index, syncSteps, syncIndex);
    // Reconnection can take tens of seconds. Keep this run occupied while the
    // polling loop continues to process completion and stop events on others.
    if (changesClient) void pending.catch(error => {
      if (this.running && this.store.get('run', run.id)?.status === 'running') this.finishNativeRun(run, 'failed', '客户端任务准备失败，不会重放：' + String(error));
    });
    else await pending;
  }
  finishNativeRun(run: any, status: string, message: string) {
    Object.assign(run, { status, message, finishedAt: now() }); if (status === 'completed') run.progress = 100; this.store.put('run', run.id, run);
    const device = this.store.get('device', run.deviceId), worker = this.workers.get(run.deviceId);
    if (device) { device.state = worker?.connected && worker.safeIdle ? 'idle' : 'offline'; this.store.put('device', device.id, device); }
    this.emit('run.' + status, message, { run });
  }
  async pollNativeWorkers() {
    for (const [id, worker] of [...this.workers.entries()]) {
      if (this.workers.get(id) !== worker) continue;
      let run = this.store.all('run').find(r => r.deviceId === id && r.status === 'running');
      if (run && this.store.get('execution', run.id, {}).submitting) continue;
      while (worker.events.length) {
        const event = worker.events.shift(), state = run ? this.store.get('execution', run.id, {}) : {};
        if (['exit', 'protocol_error'].includes(event.type)) {
          worker.connected = false; if (run) this.finishNativeRun(run, 'failed', '核心工作进程异常，执行结果未知；不会自动重放'); run = undefined;
          const d = this.store.get('device', id); d.state = 'offline'; d.connectionError = '核心工作进程异常退出，请查看本地日志后重连'; this.store.put('device', id, d); await worker.close(); this.workers.delete(id); this.workerConfigurations.delete(id); break;
        }
        if (event.type === 'callback') {
          const { message, details } = event;
          if (message === 2 && details.what === 'FastestWayToScreencap' && typeof details.details?.method === 'string') {
            const d = this.store.get('device', id); d.captureMethod = details.details.method; this.store.put('device', id, d);
            this.emit('device.capture', '核心实际截图方式：' + d.captureMethod, { deviceId: id, method: d.captureMethod, cost: details.details.cost });
          }
          if (message === 4 && details.what === 'Connect') { worker.connected = !!details.details?.ret; const d = this.store.get('device', id); d.state = worker.connected ? (this.store.hasRunningRun(id) ? 'running' : 'idle') : 'offline'; if (worker.connected) delete d.connectionError; else d.connectionError = String(details.details?.error || '请查看本地核心日志').slice(0, 4096); this.store.put('device', id, d); this.emit(worker.connected ? 'device.connected' : 'device.failed', worker.connected ? '设备已连接' : '核心设备连接失败：' + d.connectionError, { device: d }); }
          if (message === 2 && ['Disconnect', 'ResolutionChanged'].includes(details.what)) {
            worker.connected = false;
            const d = this.store.get('device', id); d.state = 'offline'; delete d.captureMethod; this.store.put('device', id, d);
            const reason = details.why === 'RequiredCaptureProtocolUnavailable' ? '增强截图不可用，已停止执行并断开：' + (details.details?.error || '未确认要求的截图协议') : '设备连接中断，请核对现场后重试';
            d.connectionError = reason.slice(0, 4096); this.store.put('device', id, d);
            this.emit('device.failed', reason, { device: d });
            if (run) this.finishNativeRun(run, 'failed', reason); run = undefined;
          }
          if (run) {
            const matches = details.taskid === state.taskId;
            if ([0, 1].includes(message) || (message === 10000 && matches) || (message === 10004 && matches)) state.failed = true;
            if (message === 10002 && matches) state.completed = true;
            if (message === 3 && (!('taskid' in details) || matches)) state.queueEnded = true;
            if (message === 20003 && matches && state.recognitionType && !state.completed && !state.failed && !state.queueEnded && !state.stopRequested && recognitionResult(state.recognitionType, details)) state.recognitionResultAt = now();
            if (message === 20002 && matches && state.mallVisitEnabled && details.subtask === 'ProcessTask' && details.taskchain === 'Mall' && ['VisitLimited', 'VisitNextBlack'].includes(details.details?.task)) state.mallVisitedAt = now();
            this.store.put('execution', run.id, state);
          }
          if (details.what === 'UnsupportedLevel') this.nextChecks.resource = Math.min(this.nextChecks.resource!, Date.now() + 60_000);
        } else if (event.type === 'status' && run && !event.running && !event.pendingAsync.length && (state.queueEnded || state.failed || state.stopRequested)) { state.idleAfterEnd = true; this.store.put('execution', run.id, state); }
      }
      if (!run) continue;
      const state = this.store.get('execution', run.id, {});
      if (state.boundaryWaiting && !state.stopRequested) { if (worker.connected && worker.safeIdle && !this.updates.channels().some(c => c.status === 'waiting_idle') && !this.switching) await this.continueNativeTask(run, state.nextIndex, state.nextSyncSteps, state.nextSyncIndex); }
      else if (state.stopRequested && Date.now() - state.stopRequested > 15_000) { await worker.close(); this.workers.delete(id); this.workerConfigurations.delete(id); this.finishNativeRun(run, 'stopped', '核心停止超时，已结束工作进程；请核对设备现场'); }
      else if (state.idleAfterEnd && worker.safeIdle) {
        if (state.mallVisitedAt) {
          this.store.put('mall_visit', run.deviceId, { visitedAt: state.mallVisitedAt, clientType: state.clientType });
          this.emit('device.friends_visited', '好友访问已获专用成功回调确认', { deviceId: run.deviceId, runId: run.id, visitedAt: state.mallVisitedAt });
        }
        if (state.stopRequested) this.finishNativeRun(run, 'stopped', '执行已停止，未执行计划保留');
        else if (state.failed || !state.completed) this.finishNativeRun(run, 'failed', '核心任务失败或缺少成功证据；不会继续后续任务');
        else if (state.recognitionType && !state.recognitionResultAt) this.finishNativeRun(run, 'failed', '识别任务已结束但缺少有效的最终识别结果，结果未知；未记录同步成功');
        else {
          const configured = this.store.get('run_plan', run.id).tasks[state.index];
          if (configured.type === 'StartUp') this.rememberClient(run, configured.params);
          const step: SyncStep | undefined = state.syncSteps?.[state.syncIndex] ?? (configured.type === 'OperBox' ? { type: 'OperBox', key: 'operatorsAt' } : configured.type === 'Depot' ? { type: 'Depot', key: 'depotAt' } : undefined);
          if (step) {
            const synced = { operatorsAt: null, depotAt: null, ...this.syncHistory(run.deviceId, state.clientType), clientType: state.clientType }; synced[step.key] = state.recognitionResultAt;
            this.store.put('user_data_sync', run.deviceId, synced);
            this.emit('device.data_synced', step.type === 'OperBox' ? '干员识别已成功同步' : '仓库识别已成功同步', { deviceId: run.deviceId, runId: run.id, type: step.type, syncedAt: synced[step.key] });
            if (state.syncSteps && state.syncIndex + 1 < state.syncSteps.length) { await this.advanceNativeTask(run, state.index, state.syncSteps, state.syncIndex + 1); continue; }
          }
          await this.advanceNativeTask(run, state.index + 1);
        }
      }
    }
  }
  async tick(force = false) {
    if (!this.running || this.ticking || (!force && Date.now() - this.lastTick < (this.options.tickSeconds ?? 0.6) * 1000)) return;
    this.ticking = true; this.lastTick = Date.now();
    try {
      await this.pollNativeWorkers();
    } finally { this.ticking = false; }
  }
  async automaticUpdates() {
    if (!this.running) return;
    const settings = parseSettings(this.store.get('settings', 'main'));
    for (const [channel, interval] of [['core', 86400], ['resource', 21600]] as const) {
      if (!(channel === 'core' ? settings.autoUpdateCore : settings.autoUpdateResource) || Date.now() < this.nextChecks[channel]!) continue;
      this.nextChecks[channel] = Date.now() + interval * 1000;
      try { const state = await this.updates.check(channel); if (!this.running) return; if ((this.updates.channel('core').currentVersion !== '未安装' || channel === 'core') && state.status === 'available') { await this.updates.prepare(channel); if (this.running) await this.updates.activate(channel); } }
      catch { this.nextChecks[channel] = Date.now() + 300_000; }
    }
  }
  close(): Promise<void> { return this.closing ||= this.closeInner(); }
  cancelPendingClientSwitches() { for (const controller of this.clientSwitches.values()) controller.abort(); }
  private async closeInner() {
    this.running = false;
    this.cancelPendingClientSwitches();
    this.preview.invalidate();
    await this.calendar.close();
    await this.updates.close();
    for (const run of this.store.all('run')) if (run.status === 'running') await this.stopRun(run.id);
    await Promise.all([...this.workers.values()].map(worker => worker.close())); this.workers.clear(); this.workerConfigurations.clear();
    await Promise.allSettled([...this.submissions, ...[...this.starts.values()].map(start => start.promise)]);
    this.store.close();
  }
}
