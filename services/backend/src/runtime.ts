import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Store, now } from './storage';
import { RpcError } from './errors';
import { parsePlan, parseSettings, parseSnapshot, type Plan } from './models';
import { nativeTask, validatePlan } from './task-policy';
import { propose } from './agent';
import { deviceLockPath } from './config';
import { CoreWorker } from './worker';
import { captureAdbPath, connectionCapture } from './capture';
import { Preview } from './preview';
import { UpdateService } from './updates';
import { adbPath, adbServerIdentity, autoDiscover, deviceLockAddress, discover, isLocalEmulator, validateAddress } from './adb';

const ident = (prefix: string) => prefix + '-' + randomUUID().replaceAll('-', '').slice(0, 12);
type Worker = Pick<CoreWorker, 'events' | 'connected' | 'safeIdle' | 'task' | 'stop' | 'connect' | 'waitConnected' | 'close'> & Partial<Pick<CoreWorker, 'frame' | 'click'>>;
export interface RuntimeOptions { notify?: (message: any) => void; tickSeconds?: number; source?: any; validator?: any; adbExecutable?: () => string; workerFactory?: (config: any) => Promise<Worker>; leaseFactory?: (config: any) => Promise<Worker> }
export class Runtime {
  readonly store: Store;
  readonly updates: UpdateService;
  readonly preview: Preview;
  readonly workers = new Map<string, Worker>();
  private leases = new Map<string, Worker>();
  private starts = new Map<string, { planId: string; deviceId: string; promise: Promise<any> }>();
  private connecting = new Set<string>();
  private suppressed = new Set<string>();
  private reconnect: any[] = [];
  private switching = false;
  private autoConnecting = false;
  private lastDiagnostics: string[] = [];
  private nextAutoConnect = Date.now() + 2000;
  private nextChecks: Record<string, number> = { core: Date.now() + 3000, resource: Date.now() + 6000 };
  private lastTick = Date.now();
  private ticking = false;
  private closing?: Promise<void>;
  running = true;
  constructor(readonly root: string, readonly mode: 'mock' | 'native' = 'mock', private options: RuntimeOptions = {}) {
    this.store = new Store(root);
    if (!this.store.get('meta', 'initialized')) {
      this.store.put('settings', 'main', parseSettings());
      if (mode === 'mock') for (const value of [
        { id: 'daily', name: '日常收菜', tasks: ['StartUp', 'Recruit', 'Infrast', 'Mall', 'Award'].map(type => ({ type, params: {} })) },
        { id: 'farm-1-7', name: '1-7 材料补给', tasks: [{ type: 'Fight', params: { stage: '1-7', times: 6 } }] },
      ]) this.store.put('plan', value.id, parsePlan(value));
      this.store.put('meta', 'initialized', true);
    }
    for (const device of this.store.all('device')) { device.state = 'offline'; this.store.put('device', device.id, device); }
    for (const run of this.store.all('run')) if (run.status === 'running') {
      Object.assign(run, { status: 'failed', finishedAt: now(), message: '上次运行被中断；请核对设备后重新执行' }); this.store.put('run', run.id, run); this.emit('run.interrupted', run.message, { runId: run.id });
    }
    this.updates = new UpdateService(path.join(root, 'components'), this.store, this.emit.bind(this), this.busy.bind(this), {
      mode, source: options.source, validator: options.validator,
      beforeActivate: () => this.beforeSwitch(), afterActivate: () => this.afterSwitch(), finishActivate: (error?: string) => this.finishSwitch(error),
    });
    this.preview = new Preview({
      mode, available: () => this.running && !this.switching,
      device: id => this.mode === 'native' ? this.store.get('device', id) : this.devices().find(device => device.id === id), worker: id => this.workers.get(id),
      hasRun: id => this.store.hasRunningRun(id) || [...this.starts.values()].some(start => start.deviceId === id),
      clicked: data => { this.emit('device.clicked', this.mode === 'mock' ? '模拟点击已接收，未操作真实设备' : '点击指令已获核心确认', data); },
    });
  }
  emit(type: string, message: string, data: any = {}) { const event = this.store.event(type, message, data); this.options.notify?.({ jsonrpc: '2.0', method: 'runtime.event', params: event }); return event; }
  busy() { return !!this.preview?.busy || this.connecting.size > 0 || this.store.all('run').some(run => run.status === 'running' && !(this.mode === 'native' && this.store.get('execution', run.id, {}).boundaryWaiting)) || [...this.workers.values()].some(worker => !worker.safeIdle); }
  devices(): any[] {
    return this.mode === 'mock' ? [{ id: 'mock-device-1', name: '本地演示设备', address: 'mock://local', state: this.store.hasRunningRun() ? 'running' : 'idle', coreVersion: this.updates.channel('core').currentVersion, resourceVersion: this.updates.channel('resource').currentVersion }] : this.store.all('device');
  }
  snapshot() { return parseSnapshot({ mode: this.mode, devices: this.devices(), plans: this.store.all('plan').map(parsePlan), runs: this.store.all('run').reverse().slice(0, 100).map(run => ({ finishedAt: null, ...run })), updates: this.updates.channels(), settings: parseSettings(this.store.get('settings', 'main')), events: this.store.events() }); }
  async handle(method: string, params: any = {}) {
    if (params === null) params = {};
    if (typeof params !== 'object' || Array.isArray(params)) throw new RpcError(-32602, 'params 必须是对象');
    if (!this.running) throw new RpcError(-32011, '应用运行时正在退出');
    const required = (...keys: string[]) => { if (keys.some(key => !(key in params))) throw new RpcError(-32602, '请求参数无效'); };
    switch (method) {
      case 'app.snapshot': return this.snapshot();
      case 'device.discover':
        if (this.mode === 'mock') return [{ address: 'mock://local', name: '演示设备', adbState: 'device' }];
        try { return await discover(this.adbExecutable()); } catch (error) { throw new RpcError(-32040, 'ADB 设备发现失败', String(error)); }
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
        if (settings.autoConnect && !previous.autoConnect) { this.suppressed.clear(); this.nextAutoConnect = 0; }
        this.store.put('settings', 'main', settings); this.emit('settings.saved', '设置已保存'); return settings;
      }
      case 'agent.message': { required('message'); const result = propose(params.message, this.mode, p => this.validatePolicy(p)); this.emit('agent.plan_proposed', '本地演示已生成待确认计划，尚未执行'); return result; }
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
    const worker = this.workers.get(device.id); let lease: Worker | undefined;
    if (this.mode === 'native') { if (!worker?.connected || !worker.safeIdle) throw new RpcError(-32011, '核心尚未连接或异步操作未结束'); }
    else {
      try { lease = await (this.options.leaseFactory || (config => CoreWorker.start(config, { leaseOnly: true })))({ lockPath: deviceLockPath(device.address), userDir: path.join(this.root, 'workers', 'mock-lease') }); }
      catch (error) { throw new RpcError(-32011, '其他本地实例正在控制此设备', String(error)); }
    }
    if (!this.running || this.switching) { await lease?.close(); throw new RpcError(-32011, '应用运行时正在退出或切换'); }
    const id = ident('run'), run = { id, planId: params.planId, deviceId: device.id, status: 'running', progress: 0, message: this.mode === 'mock' ? '模拟执行：正在初始化' : '正在提交首个任务', startedAt: now(), finishedAt: null };
    if (lease) this.leases.set(id, lease);
    // Persist deduplication and the execution snapshot before any native effect.
    this.store.transaction(() => { this.store.put('run', id, run); this.store.put('run_plan', id, plan); this.store.put('request', token, { runId: id, planId: params.planId, deviceId: device.id }); });
    this.emit('run.started', run.message, { run });
    if (this.mode === 'native') { device.state = 'running'; this.store.put('device', device.id, device); await this.submitNativeTask(run, 0); return this.store.get('run', id); }
    return run;
  }
  async release(id: string) { const lease = this.leases.get(id); this.leases.delete(id); await lease?.close(); }
  async stopRun(id: string) {
    const run = this.store.get('run', id); if (!run) throw new RpcError(-32004, '执行记录不存在');
    if (run.status === 'running') {
      const worker = this.workers.get(run.deviceId);
      if (this.mode === 'native' && worker) {
        const execution = this.store.get('execution', id, {}); execution.stopRequested = Date.now(); this.store.put('execution', id, execution);
        run.message = '正在停止并等待核心与异步调用结束，原计划保留'; this.store.put('run', id, run);
        try { await worker.stop(); return this.store.get('run', id); }
        catch { await worker.close(); this.workers.delete(run.deviceId); }
      }
      Object.assign(run, { status: 'stopped', finishedAt: now(), message: this.mode === 'mock' ? '模拟执行已停止，原计划保留' : '工作进程已结束，请核对设备现场，原计划保留' }); this.store.put('run', id, run); await this.release(id); this.emit('run.stopped', run.message, { run });
    }
    return run;
  }
  private validateAutomatic(address: string) {
    if (!parseSettings(this.store.get('settings', 'main')).autoConnect) throw new RpcError(-32011, '自动连接已关闭');
    if (this.suppressed.has(this.lockAddress(address))) throw new RpcError(-32011, '该设备已手动断开，自动连接已跳过');
  }
  private lockAddress(address: string) { return deviceLockAddress(address); }
  private adbExecutable(): string {
    if (this.options.adbExecutable) return this.options.adbExecutable();
    if (process.env.MAAVERGE_ADB_PATH) return adbPath();
    const capture = parseSettings(this.store.get('settings', 'main')).capture;
    return captureAdbPath(capture) || adbPath();
  }
  async connectDevice(params: any, internal = false, automatic = false): Promise<any> {
    if (this.mode === 'mock') return this.devices()[0];
    let id: string | undefined, reserved = false, worker: Worker | undefined;
    try {
      if (this.switching && !internal) throw new RpcError(-32011, '正在切换核心与资源，暂不能连接设备');
      if (!this.running) throw new RpcError(-32011, '应用运行时正在退出');
      const address = validateAddress(params.address);
      if (automatic) this.validateAutomatic(address); else if (!internal) this.suppressed.delete(this.lockAddress(address));
      const combo = this.store.get('active', 'combo', {}); if (!combo.core) throw new Error('请先在更新中心安装并启用核心');
      const canonical = this.lockAddress(address), aliases = this.store.all('device').filter(d => this.lockAddress(d.address) === canonical);
      const previous = aliases.find(d => this.workers.has(d.id)) || aliases[0];
      id = previous?.id || 'device-' + createHash('sha256').update(canonical).digest('hex').slice(0, 12);
      if (this.connecting.has(id!)) throw new RpcError(-32011, '该设备正在建立连接');
      if (this.workers.has(id!)) return this.store.get('device', id!);
      this.connecting.add(id!); reserved = true;
      const capture = await connectionCapture(parseSettings(this.store.get('settings', 'main')).capture, address);
      const adb = this.adbExecutable();
      const config = { core: combo.core.path, resource: combo.resource.path, adb, address, capture, userDir: path.join(this.root, 'workers', id!), lockPath: deviceLockPath(adbServerIdentity() + '|' + canonical) };
      worker = await (this.options.workerFactory || (c => CoreWorker.start(c)))(config); await worker.connect();
      if (!this.running) throw new RpcError(-32011, '应用运行时正在退出');
      if (automatic) this.validateAutomatic(address);
      this.workers.set(id!, worker);
      const device = { id, name: String(params.name || address).slice(0, 80), address, state: 'offline', coreVersion: combo.core.version, resourceVersion: combo.resource.version };
      this.store.put('device', id!, device); this.emit('device.connecting', '正在异步连接设备', { device }); return device;
    } catch (error) { if (worker && !this.workers.has(id!)) await worker.close(); if (error instanceof RpcError) throw error; throw new RpcError(-32040, '设备连接失败', String(error)); }
    finally { if (reserved) this.connecting.delete(id!); }
  }
  async autoConnectDevices(automatic = false): Promise<any> {
    if (this.mode === 'mock') return { devices: this.devices(), discovered: [{ address: 'mock://local', name: '演示设备', adbState: 'device' }], diagnostics: ['模拟模式：未扫描端口、调用 ADB 或连接真实设备'] };
    if (this.autoConnecting) throw new RpcError(-32011, '模拟器自动连接正在进行');
    this.autoConnecting = true;
    try {
      if (!this.running || this.switching) throw new RpcError(-32011, '正在退出或切换核心，请稍后重试');
      if (!automatic) this.suppressed.clear();
      if (!this.store.get('active', 'combo', {}).core) throw new RpcError(-32040, '请先在更新中心安装并启用核心，再自动连接模拟器');
      const result = await autoDiscover(this.adbExecutable());
      const { devices: discovered, diagnostics } = result;
      const devices: any[] = [], seen = new Set<string>();
      for (const candidate of discovered) {
        const key = this.lockAddress(candidate.address);
        if (candidate.adbState !== 'device' || !isLocalEmulator(candidate.address) || seen.has(key) || (automatic && this.suppressed.has(key))) continue;
        seen.add(key);
        try {
          if (this.switching || !this.running) throw new RpcError(-32011, '正在退出或切换核心，请稍后重试');
          const previous = [...this.workers.keys()].map(id => this.store.get('device', id)).find(d => this.lockAddress(d.address) === key);
          if (previous) { const worker = this.workers.get(previous.id)!; if (worker.connected || !worker.safeIdle) { devices.push(previous); continue; } await this.disconnectDevice(previous.id, true); }
          devices.push(await this.connectDevice(candidate, false, automatic));
        } catch (error) { diagnostics.push(candidate.address + '：' + (error instanceof Error ? error.message : String(error))); }
      }
      if (!devices.length) diagnostics.push('未连接到可用模拟器；请启动模拟器并开启 ADB 调试，或手动填写地址');
      if (!automatic || JSON.stringify(diagnostics) !== JSON.stringify(this.lastDiagnostics)) this.emit('device.auto_connect', '模拟器自动连接检查完成', { requested: devices.length, diagnostics });
      this.lastDiagnostics = diagnostics; return { devices, discovered, diagnostics };
    } finally { this.autoConnecting = false; }
  }
  async automaticConnections() {
    if (this.mode !== 'native' || !this.running || !parseSettings(this.store.get('settings', 'main')).autoConnect || Date.now() < this.nextAutoConnect || this.switching || this.busy()) return;
    this.nextAutoConnect = Date.now() + 30_000; if (!this.store.get('active', 'combo', {}).core) return;
    try { await this.autoConnectDevices(true); } catch (error) { const diagnostics = [String(error)]; if (this.running && JSON.stringify(diagnostics) !== JSON.stringify(this.lastDiagnostics)) this.emit('device.auto_connect_failed', '模拟器自动发现失败', { detail: String(error) }); this.lastDiagnostics = diagnostics; }
  }
  async disconnectDevice(id: string, internal = false) {
    if (this.switching && !internal) throw new RpcError(-32011, '正在切换核心与资源，暂不能断开设备');
    if (this.preview.isClicking(id)) throw new RpcError(-32011, '点击尚未完成，请稍后断开设备');
    this.preview.invalidate(id);
    if (!this.switching && this.store.all('run').some(r => r.deviceId === id && r.status === 'running')) throw new RpcError(-32011, '请先停止该设备的执行');
    const worker = this.workers.get(id); this.workers.delete(id); await worker?.close();
    const device = this.store.get('device', id); if (device) { if (!internal) this.suppressed.add(this.lockAddress(device.address)); device.state = 'offline'; this.store.put('device', id, device); }
    this.emit('device.disconnected', '设备控制权已释放', { deviceId: id }); return { disconnected: true };
  }
  async beforeSwitch() {
    if (!this.switching && this.busy()) throw new Error('核心或异步操作仍在运行'); this.switching = true;
    this.preview.invalidate();
    const reconnect = new Map(this.reconnect.map(d => [d.id, d]));
    const workers = [...this.workers.entries()]; this.workers.clear();
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
      await Promise.all([...this.workers.values()].map(w => w.close())); this.workers.clear();
      for (const device of this.store.all('device')) { device.state = 'offline'; this.store.put('device', device.id, device); }
      for (const run of this.store.all('run')) if (run.status === 'running') this.finishNativeRun(run, 'failed', '核心切换及旧版重连失败；请人工核对设备: ' + error);
      this.emit('update.recovery_failed', '设备重连失败，已终止等待中的计划', { error });
    }
    this.reconnect = []; this.switching = false;
  }
  async submitNativeTask(run: any, index: number) {
    const current = this.store.get('run', run.id);
    if (!this.running || this.switching || current?.status !== 'running' || this.store.get('execution', run.id, {}).stopRequested) return;
    const plan = this.store.get('run_plan', run.id), state: any = { index, completed: false, failed: false, queueEnded: false, idleAfterEnd: false, taskId: null, stopRequested: null, submitting: true };
    this.store.put('execution', run.id, state); const task = nativeTask(plan.tasks[index]);
    try {
      const result = await this.workers.get(run.deviceId)!.task(task);
      Object.assign(state, this.store.get('execution', run.id, {}), { taskId: result.taskId, submitting: false }); this.store.put('execution', run.id, state);
      if (state.stopRequested || this.store.get('run', run.id).status !== 'running') return;
      Object.assign(run, { message: '正在执行 ' + task.type, progress: Math.floor(index * 100 / plan.tasks.length) }); this.store.put('run', run.id, run);
      const device = this.store.get('device', run.deviceId); device.state = 'running'; this.store.put('device', device.id, device); this.emit('run.progress', run.message, { run });
    } catch (error) { state.submitting = false; this.store.put('execution', run.id, state); this.finishNativeRun(run, 'failed', '任务提交失败或结果未知: ' + String(error)); }
  }
  finishNativeRun(run: any, status: string, message: string) {
    Object.assign(run, { status, message, finishedAt: now() }); if (status === 'completed') run.progress = 100; this.store.put('run', run.id, run);
    const device = this.store.get('device', run.deviceId), worker = this.workers.get(run.deviceId);
    if (device) { device.state = worker?.connected && worker.safeIdle ? 'idle' : 'offline'; this.store.put('device', device.id, device); }
    this.emit('run.' + status, message, { run });
  }
  async pollNativeWorkers() {
    for (const [id, worker] of [...this.workers.entries()]) {
      let run = this.store.all('run').find(r => r.deviceId === id && r.status === 'running');
      if (run && this.store.get('execution', run.id, {}).submitting) continue;
      while (worker.events.length) {
        const event = worker.events.shift(), state = run ? this.store.get('execution', run.id, {}) : {};
        if (['exit', 'protocol_error'].includes(event.type)) {
          worker.connected = false; if (run) this.finishNativeRun(run, 'failed', '核心工作进程异常，执行结果未知；不会自动重放'); run = undefined;
          const d = this.store.get('device', id); d.state = 'offline'; this.store.put('device', id, d); await worker.close(); this.workers.delete(id); break;
        }
        if (event.type === 'callback') {
          const { message, details } = event;
          if (message === 2 && details.what === 'FastestWayToScreencap' && typeof details.details?.method === 'string') {
            const d = this.store.get('device', id); d.captureMethod = details.details.method; this.store.put('device', id, d);
            this.emit('device.capture', '核心实际截图方式：' + d.captureMethod, { deviceId: id, method: d.captureMethod, cost: details.details.cost });
          }
          if (message === 4 && details.what === 'Connect') { worker.connected = !!details.details?.ret; const d = this.store.get('device', id); d.state = worker.connected ? 'idle' : 'offline'; this.store.put('device', id, d); this.emit(worker.connected ? 'device.connected' : 'device.failed', worker.connected ? '设备已连接' : '核心设备连接失败：' + (details.details?.error || '请查看本地核心日志'), { device: d }); }
          if (message === 2 && ['Disconnect', 'ResolutionChanged'].includes(details.what)) {
            worker.connected = false;
            const d = this.store.get('device', id); d.state = 'offline'; delete d.captureMethod; this.store.put('device', id, d);
            const reason = details.why === 'RequiredCaptureProtocolUnavailable' ? '增强截图不可用，已停止执行并断开：' + (details.details?.error || '未确认要求的截图协议') : '设备连接中断，请核对现场后重试';
            this.emit('device.failed', reason, { device: d });
            if (run) this.finishNativeRun(run, 'failed', reason); run = undefined;
          }
          if (run) {
            const matches = details.taskid === state.taskId;
            if ([0, 1].includes(message) || (message === 10000 && matches) || (message === 10004 && matches)) state.failed = true;
            if (message === 10002 && matches) state.completed = true;
            if (message === 3 && (!('taskid' in details) || matches)) state.queueEnded = true;
            this.store.put('execution', run.id, state);
          }
          if (details.what === 'UnsupportedLevel') this.nextChecks.resource = Math.min(this.nextChecks.resource!, Date.now() + 60_000);
        } else if (event.type === 'status' && run && !event.running && !event.pendingAsync.length && (state.queueEnded || state.failed || state.stopRequested)) { state.idleAfterEnd = true; this.store.put('execution', run.id, state); }
      }
      if (!run) continue;
      const state = this.store.get('execution', run.id, {});
      if (state.boundaryWaiting && !state.stopRequested) { if (worker.connected && worker.safeIdle && !this.updates.channels().some(c => c.status === 'waiting_idle') && !this.switching) await this.submitNativeTask(run, state.nextIndex); }
      else if (state.stopRequested && Date.now() - state.stopRequested > 15_000) { await worker.close(); this.workers.delete(id); this.finishNativeRun(run, 'stopped', '核心停止超时，已结束工作进程；请核对设备现场'); }
      else if (state.idleAfterEnd) {
        if (state.stopRequested) this.finishNativeRun(run, 'stopped', '执行已停止，未执行计划保留');
        else if (state.failed || !state.completed) this.finishNativeRun(run, 'failed', '核心任务失败或缺少成功证据；不会继续后续任务');
        else {
          const index = state.index + 1, plan = this.store.get('run_plan', run.id);
          if (index >= plan.tasks.length) this.finishNativeRun(run, 'completed', '所有任务链均报告成功且核心已空闲');
          else if (this.updates.channels().some(c => c.status === 'waiting_idle')) { Object.assign(state, { boundaryWaiting: true, nextIndex: index }); this.store.put('execution', run.id, state); Object.assign(run, { progress: Math.floor(index * 100 / plan.tasks.length), message: '当前任务完成，等待核心与资源热切换后继续剩余计划' }); this.store.put('run', run.id, run); this.emit('run.progress', run.message, { run }); }
          else await this.submitNativeTask(run, index);
        }
      }
    }
  }
  async tick(force = false) {
    if (!this.running || this.ticking || (!force && Date.now() - this.lastTick < (this.options.tickSeconds ?? 0.6) * 1000)) return;
    this.ticking = true; this.lastTick = Date.now();
    try {
      if (this.mode === 'native') await this.pollNativeWorkers();
      else for (const run of this.store.all('run')) if (run.status === 'running') {
        run.progress = Math.min(100, run.progress + 10); const plan = this.store.get('run_plan', run.id);
        run.message = '模拟执行：' + plan.tasks[Math.min(plan.tasks.length - 1, Math.floor(run.progress * plan.tasks.length / 100))].type;
        if (run.progress === 100) { Object.assign(run, { status: 'completed', finishedAt: now(), message: '模拟完成，未操作真实游戏' }); await this.release(run.id); }
        this.store.put('run', run.id, run); this.emit('run.progress', run.message, { run });
      }
      if (this.mode === 'mock') await this.updates.activatePending();
    } finally { this.ticking = false; }
  }
  async automaticUpdates() {
    if (this.mode !== 'native' || !this.running) return;
    const settings = parseSettings(this.store.get('settings', 'main'));
    for (const [channel, interval] of [['core', 86400], ['resource', 21600]] as const) {
      if (!(channel === 'core' ? settings.autoUpdateCore : settings.autoUpdateResource) || Date.now() < this.nextChecks[channel]!) continue;
      this.nextChecks[channel] = Date.now() + interval * 1000;
      try { const state = await this.updates.check(channel); if (!this.running) return; if ((this.updates.channel('core').currentVersion !== '未安装' || channel === 'core') && state.status === 'available') { await this.updates.prepare(channel); if (this.running) await this.updates.activate(channel); } }
      catch { this.nextChecks[channel] = Date.now() + 300_000; }
    }
  }
  close(): Promise<void> { return this.closing ||= this.closeInner(); }
  private async closeInner() {
    this.running = false;
    this.preview.invalidate();
    await this.updates.close();
    for (const run of this.store.all('run')) if (run.status === 'running') await this.stopRun(run.id);
    await Promise.all([...this.leases.keys()].map(id => this.release(id)));
    await Promise.all([...this.workers.values()].map(worker => worker.close())); this.workers.clear();
    this.store.close();
  }
}
