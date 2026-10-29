import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { Store, now } from './storage';
import { RpcError } from './errors';
import { connectionError, errorDetail, nativeConnectionError } from './connection-errors';
import {
  defaultConnection,
  parsePlan,
  parseSettings,
  parseSnapshot,
  type Plan,
  type Settings,
} from './models';
import { automaticCapture } from './auto-capture';
import { nativeTask, validatePlan } from './task-policy';
import { propose } from './agent';
import { defaultComponentPaths, defaultCopilotDirectory, deviceLockPath } from './config';
import { CoreWorker } from './worker';
import { captureAdbPath, connectionCapture } from './capture';
import { Preview } from './preview';
import { UpdateService } from './updates';
import { AppUpdateHttp } from './app-update-http';
import {
  configuredAdbPath,
  resolveAdbPath,
  adbServerIdentity,
  autoDiscover,
  deviceLockAddress,
  emulatorCanonicalAddress,
  emulatorInstanceForAddress,
  isLocalEmulator,
  validateAddress,
} from './adb';
import {
  emptyEmulatorInventory,
  runningWindowsEmulatorInventory,
  type EmulatorInventory,
} from './windows-emulators';
import { syncDue, userDataSteps, type SyncStep } from './user-data-sync';
import { findDeviceProfile } from './device-profiles';
import { stageCatalog } from './stages';
import { validateStageListParams } from '../../../packages/contracts/src/validators.js';
import { homeInfo } from './home-info';
import { ActivityCalendar, type ActivityCalendarOptions } from './activity-calendar';
import { localizeExecutionMessage } from '../../../packages/contracts/src/execution';
import { taskLabels } from '../../../packages/contracts/src/tasks';
import type { RunTask } from '../../../packages/contracts/src/types';
import { recordDrops, recordInfrastructure, RunArtifacts } from './execution-evidence';
import { validateRunArtifactParams } from '../../../packages/contracts/src/validators.js';
import type { RpcContract } from '../../../packages/contracts/src/rpc-types';
import {
  validateRecognitionParams,
  validateItemResourceParams,
  validateOperatorResourceParams,
  validateLogDeleteParams,
} from '../../../packages/contracts/src/validators.js';
import {
  clearDeviceRecognition,
  parseRecognition,
  recognitionKey,
  recognitionSnapshot,
} from './recognition';
import { itemResource, itemResourceNames } from './item-resources';
import { operatorResource } from './operator-resources';
import { Logs } from './logs';
import { Toolbox, toolJob, toolCatalog } from './toolbox';
import { Scheduler } from './scheduler';
import { CopilotLibrary, copilotWorkspaceIdentity } from './copilot';
import { AccountKnowledge } from './account-knowledge';
import { Knowledge } from './knowledge';
import {
  validateKnowledgeClientParams,
  validateKnowledgeSearchParams,
  validateAccountSnapshotParams,
  validateAccountSnapshotListParams,
} from '../../../packages/contracts/src/validators.js';
import {
  validateCopilotListParams,
  validateCopilotIdentityParams,
  validateCopilotExportParams,
  validateCopilotPreviewParams,
  validateCopilotImportParams,
  validateCopilotWorkspaceParams,
  validateCopilotWorkspaceSaveParams,
  validateCopilotSearchParams,
  validateCopilotStartParams,
  validateCopilotRatingParams,
  validateCopilotRatingSetParams,
} from '../../../packages/contracts/src/validators.js';
import {
  validateDeviceAvailabilityParams,
  validateToolIdentity,
  validateToolConfigParams,
  validateScheduleHostParams,
  validateIdParams,
  validateEmptyParams,
  validateToolCatalogParams,
} from '../../../packages/contracts/src/validators.js';

const ident = (prefix: string) => prefix + '-' + randomUUID().replaceAll('-', '').slice(0, 12);
type Worker = Pick<
  CoreWorker,
  'events' | 'connected' | 'safeIdle' | 'task' | 'stop' | 'connect' | 'waitConnected' | 'close'
> &
  Partial<Pick<CoreWorker, 'frame' | 'click'>>;
export interface RuntimeOptions {
  copilotHttp?: typeof fetch;
  copilotDirectory?: string;
  now?: () => Date;
  importFrom?: string;
  applicationDirectory?: string;
  logExportDirectory?: string;
  notify?: (message: any) => void;
  tickSeconds?: number;
  source?: any;
  validator?: any;
  calendar?: ActivityCalendarOptions;
  adbExecutable?: () => string;
  emulatorInventory?: () => Promise<EmulatorInventory>;
  discoverDevices?: typeof autoDiscover;
  workerFactory?: (config: any, options?: { signal?: AbortSignal }) => Promise<Worker>;
}
export class Runtime {
  readonly mode = 'native' as const;
  readonly store: Store;
  readonly accounts: AccountKnowledge;
  readonly knowledge: Knowledge;
  readonly toolbox: Toolbox;
  readonly copilot: CopilotLibrary;
  readonly scheduler: Scheduler;
  readonly logs: Logs;
  // Keep session-used directories protected through disconnect/client-switch shutdown.
  private protectedWorkerLogs = new Set<string>();
  readonly updates: UpdateService;
  readonly appUpdateHttp: AppUpdateHttp;
  readonly preview: Preview;
  readonly calendar: ActivityCalendar;
  readonly artifacts: RunArtifacts;
  readonly workers = new Map<string, Worker>();
  private workerConfigurations = new Map<string, any>();
  private connectionErrors = new WeakMap<Worker, string>();
  private clientSwitches = new Map<string, AbortController>();
  private submissions = new Set<Promise<void>>();
  private artifactCaptures = new Map<string, Promise<void>>();
  private starts = new Map<
    string,
    { source: 'plan' | 'copilot'; identity: string; deviceId: string; promise: Promise<any> }
  >();
  private connecting = new Set<string>();
  private connectingAddresses = new Set<string>();
  private suppressed = new Set<string>();
  private reconnect: any[] = [];
  private switching = false;
  private autoConnecting = false;
  private lastDiagnostics: string[] = [];
  private nextAutoConnect = Date.now() + 2000;
  private emulatorInventory = emptyEmulatorInventory();
  private nextChecks: Record<string, number> = {
    core: Date.now() + 3000,
    resource: Date.now() + 6000,
  };
  private lastTick = Date.now();
  private ticking = false;
  private closing?: Promise<void>;
  private appUpdatePreparation?: symbol;
  private bundledInitialization?: Promise<void>;
  initializingComponents = false;
  get appUpdatePreparing() {
    return this.appUpdatePreparation !== undefined;
  }
  running = true;
  appUpdating = false;
  constructor(
    readonly root: string,
    private options: RuntimeOptions = {},
  ) {
    this.store = new Store(root, options.importFrom);
    this.accounts = new AccountKnowledge(this.store);
    this.knowledge = new Knowledge(this.store, () => this.store.get('active', 'combo', {}));
    this.logs = new Logs(root, {
      applicationDirectory: options.applicationDirectory,
      exportDirectory: options.logExportDirectory,
      activeWorkers: () =>
        new Set([...this.protectedWorkerLogs, ...this.workers.keys(), ...this.connecting]),
      summary: () => this.diagnosticSummary(),
      events: () => this.store.events(1000).map((event) => this.diagnosticEvent(event)),
    });
    this.logs.diagnostics.write('info', 'runtime.started', { protocolVersion: 1, dataRoot: root });
    this.artifacts = new RunArtifacts(root);
    this.calendar = new ActivityCalendar(path.join(root, 'cache'), {
      ...options.calendar,
      changed: () => {
        if (this.running) this.emit('calendar.changed', '活动日历缓存已更新');
      },
    });
    if (!this.store.get('meta', 'initialized')) {
      this.store.put('settings', 'main', parseSettings());
      this.store.put('meta', 'initialized', true);
    }
    const defaults = defaultComponentPaths(root, options.applicationDirectory);
    const storedSettings = this.store.get('settings', 'main', {});
    // Removed downloader preferences may contain a custom executable path. Ignore
    // them only when migrating persisted settings; new RPC requests remain strict.
    const removedDownloadPreference = Object.hasOwn(storedSettings, 'componentDownload');
    if (removedDownloadPreference) delete storedSettings.componentDownload;
    const settings = parseSettings(storedSettings);
    if (!settings.componentPaths || removedDownloadPreference)
      this.store.put('settings', 'main', {
        ...settings,
        componentPaths: settings.componentPaths ?? defaults,
      });
    for (const device of this.store.all('device')) {
      device.state = 'offline';
      this.store.put('device', device.id, device);
    }
    for (const run of this.executions())
      if (run.status === 'running') {
        for (const task of run.tasks ?? [])
          if (task.status === 'running')
            Object.assign(task, {
              status: 'failed',
              finishedAt: now(),
              message: '上次运行被中断，结果未知',
            });
        for (const entry of run.copilotEntries ?? [])
          if (['waiting', 'running'].includes(entry.status))
            Object.assign(entry, {
              status: 'failed',
              verdict: 'unknown',
              message: '上次运行被中断，结果未知；不会自动重放',
            });
        Object.assign(run, {
          status: 'failed',
          finishedAt: now(),
          message: '上次运行被中断；请核对设备后重新执行',
        });
        this.putExecution(run.id, run);
        this.emit('run.interrupted', run.message, { runId: run.id });
      }
    this.appUpdateHttp = new AppUpdateHttp(
      path.resolve(root, '../updates/app/downloads'),
      () => this.store.get('settings', 'main', {}).downloadProxy,
      (operationId, progress) =>
        options.notify?.({
          jsonrpc: '2.0',
          method: 'runtime.hostEvent',
          params: { operationId, progress },
        }),
    );
    this.updates = new UpdateService(
      path.join(root, 'components'),
      this.store,
      this.emit.bind(this),
      this.busy.bind(this),
      {
        source: options.source,
        validator: options.validator,
        directories: defaults,
        beforeActivate: () => this.beforeSwitch(),
        afterActivate: () => this.afterSwitch(),
        finishActivate: (error?: string) => this.finishSwitch(error),
        protectedPaths: () =>
          [...this.workerConfigurations.values()].flatMap((config) => [
            config.core,
            config.resource,
          ]),
      },
    );
    this.copilot = new CopilotLibrary(root, this.store, {
      coreVersion: () => this.store.get('active', 'combo', {}).core?.version,
      resourceDirectory: () => this.store.get('active', 'combo', {}).resource?.path,
      http: options.copilotHttp,
      changed: (message: string) => this.emit('copilot.changed', message),
      defaultDirectory:
        options.copilotDirectory || defaultCopilotDirectory(root, options.applicationDirectory),
      storage: () =>
        parseSettings(this.store.get('settings', 'main')).copilotStorage ?? {
          directory: '',
          deleteJsonFiles: false,
        },
    });
    this.preview = new Preview({
      available: () => this.running && !this.switching,
      device: (id) => this.store.get('device', id),
      worker: (id) => this.workers.get(id),
      hasRun: (id) =>
        this.hasExecution(id) ||
        !!this.scheduler?.owner(id) ||
        [...this.starts.values()].some((start) => start.deviceId === id),
      clicked: (data) => {
        this.emit('device.clicked', '点击指令已获核心确认', data);
      },
    });
    this.toolbox = new Toolbox({
      store: this.store,
      availability: (id) => this.availability(id),
      emit: this.emit.bind(this),
      begin: (job) => this.submitNativeTask(job, 0),
      stages: (client) => this.stages(client),
    });
    this.scheduler = new Scheduler(
      {
        store: this.store,
        emit: this.emit.bind(this),
        availability: (id, occurrence) => this.availability(id, occurrence),
        stopDevice: async (id) => {
          for (const job of this.executions().filter(
            (item) => item.deviceId === id && item.status === 'running',
          ))
            await this.stopRun(job.id);
        },
        prepareDevice: (id) => this.prepareScheduledDevice(id),
        start: (plan, deviceId, requestId, occurrence) =>
          this.startRun({ planId: plan.id, deviceId, requestId }, plan, occurrence),
      },
      this.options.now,
    );
    this.logs.automatic(settings.logRetentionDays ?? 7);
  }
  private executionSnapshot(id: string): any {
    return this.store.get('run_snapshot', id) ?? this.store.get('run_plan', id);
  }
  private executions(): any[] {
    return [...this.store.all('run'), ...this.store.all('tool_job')];
  }
  private execution(id: string): any {
    return this.store.get('run', id) ?? this.store.get('tool_job', id);
  }
  private putExecution(id: string, value: any) {
    this.store.put(value.toolKind ? 'tool_job' : 'run', id, value);
  }
  private hasExecution(deviceId?: string) {
    return this.executions().some(
      (item) => item.status === 'running' && (!deviceId || item.deviceId === deviceId),
    );
  }
  availability(
    deviceId: string,
    ignoreOccurrence?: string,
  ): RpcContract['results']['device.availability'] {
    const device = this.store.get('device', deviceId),
      worker = this.workers.get(deviceId);
    if (!device) throw new RpcError(-32004, '设备不存在');
    const connected = !!worker?.connected;
    const result = (
      owner: RpcContract['results']['device.availability']['owner'],
      reason: string,
      ownerId: string | null = null,
    ) => ({
      deviceId,
      connected,
      available: owner === 'none' && connected && device.state === 'idle' && !!worker?.safeIdle,
      owner,
      ownerId,
      reason,
    });
    if (!this.running || this.appUpdating || this.appUpdatePreparing)
      return result('runtime', '应用正在退出或安装更新');
    if (this.initializingComponents) return result('updates', '正在后台准备随附组件，请稍后再执行');
    if (this.switching || this.updates?.channels().some((item) => item.status === 'waiting_idle'))
      return result('updates', '正在准备切换核心与资源');
    const owner = this.executions().find(
      (item) => item.deviceId === deviceId && item.status === 'running',
    );
    if (owner)
      return result(
        owner.toolKind ? 'tool' : 'run',
        '设备正在执行' + owner.planName + '，请等待整个操作结束',
        owner.id,
      );
    const pending = [...this.starts.values()].find((item) => item.deviceId === deviceId);
    if (pending)
      return result(
        'run',
        pending.source === 'copilot' ? '设备正在启动作业' : '设备正在启动任务表',
      );
    const occurrence = this.scheduler?.owner(deviceId);
    if (occurrence && occurrence.id !== ignoreOccurrence)
      return result('run', '设备正在准备定时执行', occurrence.id);
    if (this.connecting.has(deviceId) || this.clientSwitches.has(deviceId))
      return result('connecting', '设备正在连接或切换客户端');
    if (this.preview?.isClicking(deviceId)) return result('manual', '人工控制指令尚未结束');
    if (worker && !worker.safeIdle) return result('manual', '核心或异步操作尚未结束');
    return result(
      'none',
      connected && device.state === 'idle'
        ? '设备空闲，可以使用工具'
        : '设备尚未连接，请先在设备页连接',
    );
  }
  private async prepareScheduledDevice(id: string) {
    const device = this.store.get('device', id);
    if (!device) throw new RpcError(-32004, '定时设备不存在');
    if (this.hasExecution(id)) throw new RpcError(-32011, '设备仍有未结束的执行');
    let worker = this.workers.get(id);
    if (worker?.connected && worker.safeIdle) return;
    if (!worker?.connected) {
      await this.connectDevice({ address: device.address, name: device.name });
      worker = this.workers.get(id);
    }
    if (!worker || !(await worker.waitConnected(30_000, () => !this.running)))
      throw new RpcError(-32011, '定时设备连接失败');
    const current = this.store.get('device', id);
    current.state = 'idle';
    this.store.put('device', id, current);
  }
  private diagnosticEvent(event: any) {
    const { id, type, message, createdAt } = event,
      data = event.data ?? {};
    return {
      id,
      type,
      message,
      createdAt,
      runId: data.runId ?? data.run?.id,
      deviceId: data.deviceId ?? data.device?.id ?? data.run?.deviceId,
      taskId: data.taskId,
      index: data.index,
      reason: data.reason,
    };
  }
  private diagnosticSummary() {
    const settings = parseSettings(this.store.get('settings', 'main')),
      combo = this.store.get('active', 'combo', {});
    return {
      protocolVersion: 1,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      uptimeSeconds: Math.round(process.uptime()),
      components: this.updates.channels(),
      generations: Object.fromEntries(
        ['core', 'resource'].map((key) => [
          key,
          combo[key] ? { version: combo[key].version, path: combo[key].path } : null,
        ]),
      ),
      settings: {
        autoConnect: settings.autoConnect,
        autoUpdateCore: settings.autoUpdateCore,
        autoUpdateResource: settings.autoUpdateResource,
        logRetentionDays: settings.logRetentionDays,
        capture: settings.capture,
        connection: settings.connection,
      },
      devices: this.store.all('device').map(({ id, state, captureMethod, connectionError }) => ({
        id,
        state,
        captureMethod,
        connectionError,
      })),
      workers: [...this.workerConfigurations].map(
        ([deviceId, { core, resource, adb, address, capture, connection }]) => ({
          deviceId,
          core,
          resource,
          adb,
          address,
          capture,
          connection,
          connected: this.workers.get(deviceId)?.connected,
          safeIdle: this.workers.get(deviceId)?.safeIdle,
        }),
      ),
      deviceProfiles: settings.deviceProfiles?.map(({ id, address, connection, capture }) => ({
        id,
        address,
        connection,
        capture,
      })),
      runs: this.store
        .recent('run', 50)
        .map(({ id, deviceId, status, startedAt, finishedAt, message, tasks }) => ({
          id,
          deviceId,
          status,
          startedAt,
          finishedAt,
          message,
          tasks: tasks?.map(({ index, type, status, message, startedAt, finishedAt }: RunTask) => ({
            index,
            type,
            status,
            message,
            startedAt,
            finishedAt,
          })),
        })),
      connectionDiagnostics: this.lastDiagnostics,
    };
  }
  emit(type: string, message: string, data: any = {}) {
    const execution = data.run ?? (data.runId ? this.execution(data.runId) : undefined);
    if (execution?.toolKind && type.startsWith('run.')) {
      type = type.replace('run.', 'tool.');
      const { run: _, runId: __, ...rest } = data;
      data = {
        ...rest,
        toolId: execution.id,
        ...(data.run ? { job: toolJob(execution, false) } : {}),
      };
    }
    // Execution details are fetched explicitly; repeated events must not copy
    // every material, facility and image reference into transport or history.
    if (data.run?.tasks || data.run?.copilotEntries) {
      const { tasks: _tasks, copilotEntries: _entries, ...run } = data.run;
      data = { ...data, run };
    }
    const event = this.store.event(type, message, data);
    this.logs.diagnostics.write('info', type, this.diagnosticEvent(event));
    this.options.notify?.({ jsonrpc: '2.0', method: 'runtime.event', params: event });
    return event;
  }
  busy() {
    return (
      !!this.preview?.busy ||
      this.connecting.size > 0 ||
      this.executions().some(
        (run) =>
          run.status === 'running' && !this.store.get('execution', run.id, {}).boundaryWaiting,
      ) ||
      [...this.workers.values()].some((worker) => !worker.safeIdle)
    );
  }
  private assertAppUpdateIdle() {
    const reasons: string[] = [];
    if (this.executions().some((run) => run.status === 'running'))
      reasons.push('任务或工具仍在执行');
    if (this.preview.busy) reasons.push('人工点击尚未结束');
    if (this.connecting.size || this.connectingAddresses.size || this.autoConnecting)
      reasons.push('设备连接或自动发现尚未结束');
    if (this.switching) reasons.push('核心与资源正在切换');
    if (this.starts.size) reasons.push('任务正在启动');
    if (this.clientSwitches.size) reasons.push('正在切换客户端');
    if (this.artifactCaptures.size) reasons.push('正在保存执行反馈画面');
    if ([...this.workers.values()].some((worker) => !worker.safeIdle))
      reasons.push('核心或异步操作尚未结束');
    if (reasons.length)
      throw new RpcError(-32021, '请空闲后安装应用更新：' + reasons.join('；'), { reasons });
  }
  private async prepareAppUpdate() {
    // Pause new work synchronously, but allow an existing component operation
    // to finish its internal reconnect before taking the final installation gate.
    this.assertAppUpdateIdle();
    const preparation = Symbol('app-update');
    this.appUpdatePreparation = preparation;
    try {
      await this.updates.drain();
      if (this.appUpdatePreparation !== preparation)
        throw new RpcError(-32011, '应用更新安装准备已取消');
      if (!this.running) throw new RpcError(-32011, '应用运行时正在退出');
      this.assertAppUpdateIdle();
      this.appUpdating = true;
      return {
        ...this.updates.channel('app'),
        status: 'staged',
        message: '已暂停新操作，准备退出安装应用更新',
      };
    } finally {
      if (this.appUpdatePreparation === preparation) this.appUpdatePreparation = undefined;
    }
  }
  devices(): any[] {
    return this.store.all('device').map((device) => {
      const synced = this.syncHistory(
        device.id,
        this.store.get('device_client', device.id, 'Official'),
      );
      return {
        ...device,
        dataSync: { operatorsAt: synced.operatorsAt ?? null, depotAt: synced.depotAt ?? null },
      };
    });
  }
  snapshot() {
    let endedCount = 0;
    // Retain creation order while keeping long-running executions visible even
    // when other devices have produced more than 100 finished executions.
    const runs = this.store
      .all('run')
      .reverse()
      .filter((run) => run.status === 'running' || endedCount++ < 100)
      .map((run) => {
        const { tasks, copilotEntries, ...summary } = run;
        return { finishedAt: null, ...summary };
      });
    let endedTools = 0;
    const toolJobs = this.store
      .all('tool_job')
      .reverse()
      .filter((item) => item.status === 'running' || endedTools++ < 200)
      .map((item) => toolJob(item, false));
    return parseSnapshot({
      toolJobs,
      mode: this.mode,
      devices: this.devices(),
      plans: this.store.all('plan').map(parsePlan),
      runs,
      updates: this.updates.channels(),
      settings: parseSettings(this.store.get('settings', 'main')),
      events: this.store.events().map((event) => {
        if (!event.data.run?.tasks && !event.data.run?.copilotEntries) return event;
        const { tasks: _tasks, copilotEntries: _entries, ...run } = event.data.run;
        return { ...event, data: { ...event.data, run } };
      }),
    });
  }
  async handle(method: string, params: any = {}) {
    if (params === null) params = {};
    if (typeof params !== 'object' || Array.isArray(params))
      throw new RpcError(-32602, 'params 必须是对象');
    if (!this.running) throw new RpcError(-32011, '应用运行时正在退出');
    if (
      this.initializingComponents &&
      ([
        'device.connect',
        'device.auto_connect',
        'run.start',
        'copilot.start',
        'tool.start',
      ].includes(method) ||
        (method.startsWith('updates.') && params.channel !== 'app'))
    )
      throw new RpcError(-32021, '正在后台准备随附组件，请稍后再连接或执行');
    if (
      (this.appUpdating || this.appUpdatePreparing) &&
      method !== 'app.snapshot' &&
      !(method === 'updates.rollback' && params.channel === 'app')
    )
      throw new RpcError(-32011, '应用正在准备安装更新，请稍后重试');
    const required = (...keys: string[]) => {
      if (keys.some((key) => !(key in params))) throw new RpcError(-32602, '请求参数无效');
    };
    switch (method) {
      case 'host.updates':
        return this.appUpdateHttp.handle(params);
      case 'app.snapshot':
        return this.snapshot();
      case 'knowledge.status':
        if (!validateKnowledgeClientParams(params)) throw new RpcError(-32602, '知识索引请求无效');
        return this.knowledge.status(params.clientType);
      case 'knowledge.search':
        if (!validateKnowledgeSearchParams(params)) throw new RpcError(-32602, '知识检索请求无效');
        return this.knowledge.search(params);
      case 'account.snapshot.get':
      case 'account.snapshot.list': {
        if (
          !(method === 'account.snapshot.get'
            ? validateAccountSnapshotParams(params)
            : validateAccountSnapshotListParams(params))
        )
          throw new RpcError(-32602, '账号快照请求无效');
        if (!this.store.get('device', params.deviceId)) throw new RpcError(-32004, '设备不存在');
        const client = params.clientType ?? this.deviceClient(params.deviceId);
        return method === 'account.snapshot.get'
          ? this.accounts.get(params.deviceId, client, params.kind, params.snapshotId)
          : this.accounts.list(params.deviceId, client, params.kind, params.offset, params.limit);
      }
      case 'device.availability':
        if (!validateDeviceAvailabilityParams(params))
          throw new RpcError(-32602, '设备状态请求无效');
        return this.availability(params.deviceId);
      case 'copilot.list':
        if (!validateCopilotListParams(params)) throw new RpcError(-32602, '作业列表请求无效');
        return this.copilot.list(params);
      case 'copilot.category.list':
        return this.copilot.categoryList(params);
      case 'copilot.category.save':
        return this.copilot.categorySave(params);
      case 'copilot.category.delete':
        return this.copilot.categoryDelete(params);
      case 'copilot.category.assign':
        return this.copilot.categoryAssign(params);
      case 'copilot.get':
        if (!validateCopilotIdentityParams(params)) throw new RpcError(-32602, '作业详情请求无效');
        return this.copilot.get(params);
      case 'copilot.export':
        if (!validateCopilotExportParams(params)) throw new RpcError(-32602, '作业导出请求无效');
        return this.copilot.export(params);
      case 'copilot.preview':
        if (!validateCopilotPreviewParams(params)) throw new RpcError(-32602, '作业预览请求无效');
        return this.copilot.preview(params);
      case 'copilot.import':
        if (!validateCopilotImportParams(params)) throw new RpcError(-32602, '作业导入请求无效');
        return this.copilot.import(params);
      case 'copilot.delete':
        return this.copilot.delete(params);
      case 'copilot.storage.info':
        return this.copilot.storageInfo(params);
      case 'copilot.workspace.get':
        if (!validateCopilotWorkspaceParams(params))
          throw new RpcError(-32602, '作业工作区请求无效');
        return this.copilot.workspaceGet(params);
      case 'copilot.workspace.save':
        if (!validateCopilotWorkspaceSaveParams(params))
          throw new RpcError(-32602, '作业工作区保存请求无效');
        return this.copilot.workspaceSave(params);
      case 'copilot.search':
        if (!validateCopilotSearchParams(params)) throw new RpcError(-32602, '社区搜索请求无效');
        return this.copilot.search(params);
      case 'copilot.stages':
        return this.copilot.stages(params);
      case 'copilot.rating.get':
        if (!validateCopilotRatingParams(params)) throw new RpcError(-32602, '社区评价请求无效');
        return this.copilot.ratingGet(params);
      case 'copilot.rating.set':
        if (!validateCopilotRatingSetParams(params)) throw new RpcError(-32602, '社区评价请求无效');
        return this.copilot.ratingSet(params);
      case 'copilot.start':
        return this.startCopilot(params);
      case 'tool.start':
        return this.toolbox.start(params);
      case 'tool.get':
      case 'tool.stop': {
        if (!validateIdParams(params)) throw new RpcError(-32602, '工具标识请求无效');
        const job = this.store.get('tool_job', params.id);
        if (!job) throw new RpcError(-32004, '工具操作不存在');
        if (method === 'tool.stop') await this.stopRun(params.id);
        return toolJob(this.store.get('tool_job', params.id));
      }
      case 'tool.catalog':
        if (!validateToolCatalogParams(params)) throw new RpcError(-32602, '工具目录请求无效');
        return toolCatalog(this.store.get('active', 'combo', {}), params.clientType);
      case 'tool.config.get':
      case 'tool.config.save': {
        if (
          !(method === 'tool.config.get'
            ? validateToolIdentity(params)
            : validateToolConfigParams(params))
        )
          throw new RpcError(-32602, '工具配置请求无效');
        if (!this.store.get('device', params.deviceId)) throw new RpcError(-32004, '设备不存在');
        return method === 'tool.config.get'
          ? this.toolbox.config(params.deviceId, params.clientType ?? 'Official', params.kind)
          : this.toolbox.saveConfig(
              params.deviceId,
              params.clientType ?? 'Official',
              params.kind,
              params.config,
            );
      }
      case 'schedule.list':
        if (!validateEmptyParams(params)) throw new RpcError(-32602, '定时列表请求无效');
        return this.scheduler.list();
      case 'schedule.save':
        return this.scheduler.save(params);
      case 'schedule.delete':
        if (!validateIdParams(params)) throw new RpcError(-32602, '定时标识请求无效');
        return this.scheduler.delete(params.id);
      case 'schedule.override':
        return this.scheduler.override(params);
      case 'schedule.cancel':
        if (!validateIdParams(params)) throw new RpcError(-32602, '定时标识请求无效');
        return this.scheduler.cancel(params.id);
      case 'schedule.host':
        if (!validateScheduleHostParams(params)) throw new RpcError(-32602, '桌面唤醒状态无效');
        this.store.put('scheduler_host', 'wake', params.wake);
        return { accepted: true };
      case 'logs.info':
      case 'logs.export':
      case 'logs.clean': {
        if (Object.keys(params).length)
          throw new RpcError(-32602, '日志操作不接受自定义文件路径或参数');
        if (method === 'logs.info')
          return {
            directory: this.logs.directory,
            retentionDays: parseSettings(this.store.get('settings', 'main')).logRetentionDays ?? 7,
          };
        try {
          if (method === 'logs.export') return this.logs.export();
          const result = this.logs.clean();
          this.logs.diagnostics.write('info', 'logs.manual_cleanup', result);
          return result;
        } catch (error) {
          throw new RpcError(
            -32050,
            method === 'logs.export' ? '日志导出失败' : '日志清理失败',
            `${this.logs.directory}：${String(error)}`,
          );
        }
      }
      case 'logs.delete': {
        if (!validateLogDeleteParams(params)) throw new RpcError(-32602, '日志删除请求参数无效');
        const result = { deleted: this.store.deleteEvents(params.ids) };
        if (result.deleted) this.logs.diagnostics.write('info', 'logs.events_deleted', result);
        return result;
      }
      case 'stages.list':
        if (!validateStageListParams(params)) throw new RpcError(-32602, '关卡目录请求参数无效');
        return this.stages(params.clientType, params.refresh);
      case 'recognition.get': {
        if (!validateRecognitionParams(params)) throw new RpcError(-32602, '识别结果请求参数无效');
        const device = this.store.get('device', params.deviceId);
        if (!device) throw new RpcError(-32004, '设备不存在');
        const settings = parseSettings(this.store.get('settings', 'main'));
        const profile =
          settings.deviceProfiles?.find((item) => item.id === device.connectionProfileId) ||
          findDeviceProfile(settings, device.address);
        const clientType =
          params.clientType ??
          this.store.get('device_client', device.id) ??
          profile?.connection.clientType ??
          settings.connection?.clientType ??
          'Official';
        let result = recognitionSnapshot(this.store, device.id, params.kind, clientType);
        const estimated = this.store.get(
          'inventory',
          recognitionKey(device.id, clientType, 'depot'),
        );
        if (
          params.kind === 'depot' &&
          estimated?.collectedAt === result.collectedAt &&
          result.collectedAt
        ) {
          const counts = new Map<string, number>(
            estimated.items.map((item: any) => [item.id, item.quantity]),
          );
          result = {
            ...result,
            estimatedAt: estimated.estimatedAt,
            items: result.items.map((item) => ({
              ...item,
              estimatedQuantity: counts.get(item.id) ?? item.quantity,
            })),
          };
        }
        if (!result.items.length) return result;
        const names = await itemResourceNames(this.store.get('active', 'combo', {}), clientType);
        let size = Buffer.byteLength(JSON.stringify(result));
        return {
          ...result,
          items: result.items.map((item) => {
            const name = names[item.id];
            if (!name) return item;
            const increase =
              Buffer.byteLength(JSON.stringify(name)) -
              Buffer.byteLength(JSON.stringify(item.name));
            if (size + increase > 3 * 1024 * 1024) return item;
            size += increase;
            return { ...item, name };
          }),
        };
      }
      case 'resources.item':
        if (!validateItemResourceParams(params)) throw new RpcError(-32602, '材料资源请求参数无效');
        return itemResource(
          this.store.get('active', 'combo', {}),
          params.itemId,
          params.clientType,
        );
      case 'resources.operator':
        if (!validateOperatorResourceParams(params))
          throw new RpcError(-32602, '干员资源请求参数无效');
        return operatorResource(
          this.store.get('active', 'combo', {}),
          params.name,
          params.clientType,
          params.operatorId,
        );
      case 'home.info': {
        if (
          Object.keys(params).some((key) => !['deviceId', 'clientType', 'refresh'].includes(key)) ||
          (params.deviceId !== undefined &&
            (typeof params.deviceId !== 'string' ||
              !params.deviceId ||
              params.deviceId.length > 200)) ||
          (params.refresh !== undefined && typeof params.refresh !== 'boolean')
        )
          throw new RpcError(-32602, '主页信息请求参数无效');
        if (
          params.clientType !== undefined &&
          !['Official', 'Bilibili', 'YoStarEN', 'YoStarJP', 'YoStarKR', 'txwy'].includes(
            params.clientType,
          )
        )
          throw new RpcError(-32602, '游戏客户端无效');
        if (params.deviceId && !this.store.get('device', params.deviceId))
          throw new RpcError(-32004, '设备不存在');
        const settings = parseSettings(this.store.get('settings', 'main'));
        const device = params.deviceId ? this.store.get('device', params.deviceId) : undefined;
        const profile =
          device &&
          (settings.deviceProfiles?.find((item) => item.id === device.connectionProfileId) ||
            findDeviceProfile(settings, device.address));
        const clientType =
          params.clientType ??
          (params.deviceId ? this.store.get('device_client', params.deviceId) : null) ??
          profile?.connection.clientType ??
          settings.connection?.clientType ??
          'Official';
        const activityCatalog = await this.stages(clientType, params.refresh === true);
        return {
          ...homeInfo(settings, params.deviceId, clientType, new Date(activityCatalog.generatedAt)),
          activityCatalog,
        };
      }
      case 'device.discover':
        try {
          const result = await (this.options.discoverDevices ?? autoDiscover)(
            await this.adbExecutable(),
            { inventory: () => this.readEmulatorInventory() },
          );
          this.emulatorInventory = result.inventory;
          return result.devices;
        } catch (error) {
          throw new RpcError(
            -32040,
            'ADB 设备发现失败：' + connectionError(error, 'adb'),
            String(error),
          );
        }
      case 'device.connect':
        return this.connectDevice(params);
      case 'device.auto_connect':
        return this.autoConnectDevices();
      case 'device.disconnect':
        required('id');
        return this.disconnectDevice(params.id);
      case 'device.frame':
        return this.preview.frame(params);
      case 'device.click':
        return this.preview.click(params);
      case 'plan.save': {
        required('plan');
        const plan = parsePlan(params.plan);
        if (plan.schedule)
          throw new RpcError(-32030, '旧 schedule 字符串不受支持，请使用定时计划页签配置');
        this.validatePolicy(plan);
        if (!plan.id) plan.id = ident('plan');
        this.store.put('plan', plan.id, plan);
        this.emit('plan.saved', '计划已保存', { planId: plan.id });
        return plan;
      }
      case 'plan.delete':
        required('id');
        if (this.executions().some((r) => r.planId === params.id && r.status === 'running'))
          throw new RpcError(-32011, '运行中的计划不能删除');
        this.store.delete('plan', params.id);
        this.scheduler.invalidate();
        this.emit('plan.deleted', '计划已删除', { planId: params.id });
        return { deleted: true };
      case 'run.start':
        required('requestId', 'planId', 'deviceId');
        return this.startRun(params);
      case 'run.stop':
        required('id');
        return this.stopRun(params.id);
      case 'run.detail': {
        if (
          Object.keys(params).some((key) => key !== 'id') ||
          typeof params.id !== 'string' ||
          !params.id ||
          params.id.length > 200
        )
          throw new RpcError(-32602, '执行详情请求参数无效');
        const run = this.execution(params.id);
        if (!run) throw new RpcError(-32004, '执行记录不存在');
        return { finishedAt: null, ...run };
      }
      case 'run.artifact': {
        if (!validateRunArtifactParams(params)) throw new RpcError(-32602, '执行截图请求参数无效');
        const run = this.execution(params.runId);
        if (
          !run?.tasks?.some((task: RunTask) =>
            task.artifacts.some((artifact) => artifact.id === params.artifactId),
          )
        )
          throw new RpcError(-32004, '执行截图不存在');
        return this.artifacts.read(params.runId, params.artifactId);
      }
      case 'settings.save': {
        required('settings');
        const settings = parseSettings(params.settings),
          previous = parseSettings(this.store.get('settings', 'main'));
        if (!Object.hasOwn(params.settings, 'copilotStorage') && previous.copilotStorage)
          settings.copilotStorage = previous.copilotStorage;
        if (!Object.hasOwn(params.settings, 'downloadProxy') && previous.downloadProxy)
          settings.downloadProxy = previous.downloadProxy;
        this.copilot.validateStorageDirectory(settings.copilotStorage?.directory ?? '');
        if (
          settings.coreUpdateChannel !== previous.coreUpdateChannel &&
          this.updates.pendingOperations
        )
          throw new RpcError(-32021, '组件检查、下载或切换正在进行，请完成后再切换核心更新通道');
        await this.updates.saveDirectories(
          settings.componentPaths ?? previous.componentPaths!,
          (componentPaths) => {
            settings.componentPaths = componentPaths;
            this.store.put('settings', 'main', settings);
            if (settings.coreUpdateChannel !== previous.coreUpdateChannel)
              this.updates.coreChannelChanged();
          },
        );
        if (settings.autoConnect && !previous.autoConnect) {
          this.suppressed.clear();
          this.nextAutoConnect = 0;
        }
        if (settings.logRetentionDays !== previous.logRetentionDays) {
          this.logs.resetCleanup();
          this.logs.automatic(settings.logRetentionDays ?? 7);
        }
        this.scheduler.invalidate();
        this.emit('settings.saved', '设置已保存');
        return settings;
      }
      case 'agent.message': {
        required('message');
        const result = propose(params.message, (p) => this.validatePolicy(p));
        this.emit('agent.plan_proposed', '本地演示已生成待确认计划，尚未执行');
        return result;
      }
      case 'updates.check':
      case 'updates.prepare':
      case 'updates.activate':
      case 'updates.rollback': {
        if (!('channel' in params)) throw new RpcError(-32602, '缺少更新通道');
        const operation = method.slice(8) as 'check' | 'prepare' | 'activate' | 'rollback';
        if (params.channel === 'app' && operation === 'activate') {
          return this.prepareAppUpdate();
        }
        if (params.channel === 'app' && operation === 'rollback') {
          this.appUpdatePreparation = undefined;
          this.appUpdating = false;
          return { ...this.updates.channel('app'), message: '已取消安装准备，可以继续使用' };
        }
        const result = await this.updates[operation](params.channel);
        if (operation === 'activate' && params.channel === 'core')
          this.nextChecks.resource = Date.now();
        return result;
      }
      default:
        throw new RpcError(-32601, '未知方法', { method });
    }
  }
  validatePolicy(plan: Plan) {
    validatePlan(plan, parseSettings(this.store.get('settings', 'main')));
  }
  async stages(
    clientType: RpcContract['results']['stages.list']['clientType'] = 'Official',
    refresh = false,
  ) {
    const calendar = await this.calendar.get(refresh);
    return stageCatalog(
      this.store.get('active', 'combo', {}),
      clientType,
      this.options.calendar?.now?.() ?? new Date(),
      calendar,
    );
  }
  async startRun(params: any, scheduledPlan?: any, occurrence?: any) {
    const token = params.requestId;
    if (typeof token !== 'string' || !token || [...token].length > 200)
      throw new RpcError(-32602, 'requestId 必须是非空字符串');
    const pending = this.starts.get(token);
    if (pending) {
      if (
        pending.source !== 'plan' ||
        pending.identity !== params.planId ||
        pending.deviceId !== params.deviceId
      )
        throw new RpcError(-32011, '同一请求标识不能用于不同执行');
      return pending.promise;
    }
    const promise = this.startRunInner(params, scheduledPlan, occurrence);
    this.starts.set(token, {
      source: 'plan',
      identity: params.planId,
      deviceId: params.deviceId,
      promise,
    });
    try {
      return await promise;
    } finally {
      this.starts.delete(token);
    }
  }
  private async startRunInner(params: any, scheduledPlan?: any, occurrence?: any) {
    const existing = this.store.get('request', params.requestId);
    if (existing) {
      if (
        (existing.source ?? 'plan') !== 'plan' ||
        existing.planId !== params.planId ||
        existing.deviceId !== params.deviceId
      )
        throw new RpcError(-32011, '同一请求标识不能用于不同执行');
      return this.execution(existing.runId);
    }
    const saved = scheduledPlan ?? this.store.get('plan', params.planId);
    if (!saved) throw new RpcError(-32004, '计划不存在');
    const plan = parsePlan(saved);
    this.validatePolicy(plan);
    if (plan.deviceId !== null && plan.deviceId !== params.deviceId)
      throw new RpcError(-32011, '任务表已绑定其他设备，请使用绑定设备执行');
    if (!plan.enabled) throw new RpcError(-32011, '计划已禁用');
    plan.tasks = plan.tasks.filter(
      (task) => task.enabled && task.params.enable !== false,
    ) as Plan['tasks'];
    if (!plan.tasks.length) throw new RpcError(-32010, '任务表至少需要启用一条任务才能执行');
    if (occurrence?.force)
      plan.tasks.unshift({
        type: 'CloseDown',
        params: { client_type: this.store.get('device_client', params.deviceId, 'Official') },
        enabled: true,
      });
    return this.beginExecution(
      params,
      { ...plan, source: 'plan', identity: params.planId },
      occurrence,
    );
  }
  async startCopilot(params: any) {
    if (!validateCopilotStartParams(params)) throw new RpcError(-32602, '作业启动请求无效');
    // Idempotent lookup must remain available after disconnect, restart or component removal.
    const workspace = this.copilot.workspaceGet({ kind: params.kind });
    const identity = copilotWorkspaceIdentity(workspace);
    const existing = this.store.get('request', params.requestId);
    if (existing) {
      // Before canonical identities, the request hash retained JSON field order.
      // Verify that old hash against its immutable snapshot before comparing semantics.
      const snapshot =
        existing.identity === identity ? undefined : this.store.get('run_snapshot', existing.runId);
      const legacyMatch =
        snapshot?.workspace &&
        snapshot.source === 'copilot' &&
        existing.identity ===
          createHash('sha256').update(JSON.stringify(snapshot.workspace)).digest('hex') &&
        copilotWorkspaceIdentity(snapshot.workspace) === identity;
      if (
        existing.source !== 'copilot' ||
        (existing.identity !== identity && !legacyMatch) ||
        existing.kind !== params.kind ||
        existing.deviceId !== params.deviceId
      )
        throw new RpcError(-32011, '同一请求标识不能用于不同来源、设备或作业配置');
      return this.execution(existing.runId);
    }
    const pending = this.starts.get(params.requestId);
    if (pending) {
      if (
        pending.source !== 'copilot' ||
        pending.identity !== identity ||
        pending.deviceId !== params.deviceId
      )
        throw new RpcError(-32011, '同一请求标识不能用于不同执行');
      return pending.promise;
    }
    const clientType = this.deviceClient(params.deviceId);
    const prepared = this.copilot.prepare(params.kind, clientType);
    this.validatePolicy(parsePlan({ name: prepared.name, tasks: prepared.tasks }));
    const promise = this.beginExecution(params, {
      ...prepared,
      source: 'copilot',
      kind: params.kind,
      clientType,
    });
    this.starts.set(params.requestId, {
      source: 'copilot',
      identity,
      deviceId: params.deviceId,
      promise,
    });
    try {
      return await promise;
    } finally {
      this.starts.delete(params.requestId);
    }
  }
  /** No await before occupancy validation and durable registration: every source shares this gate. */
  private async beginExecution(params: any, snapshot: any, occurrence?: any) {
    const device = this.devices().find((d) => d.id === params.deviceId);
    if (!device) throw new RpcError(-32004, '设备不存在');
    const availability = this.availability(device.id, occurrence?.id);
    if (!availability.available) throw new RpcError(-32011, availability.reason);
    this.preview.invalidate(device.id);
    const worker = this.workers.get(device.id);
    if (!worker?.connected || !worker.safeIdle)
      throw new RpcError(-32011, '核心尚未连接或异步操作未结束');
    if (!this.running || this.appUpdating || this.appUpdatePreparing || this.switching)
      throw new RpcError(-32011, '应用运行时正在退出、安装更新或切换');
    const isCopilot = snapshot.source === 'copilot',
      id = ident('run');
    const run: any = {
      ...(occurrence
        ? { scheduleId: occurrence.scheduleId, scheduledFor: occurrence.scheduledFor }
        : {}),
      id,
      source: snapshot.source,
      sourceName: snapshot.name,
      planId: isCopilot ? null : params.planId,
      planName: snapshot.name,
      deviceId: device.id,
      status: 'running',
      progress: 0,
      message: '正在提交首个任务',
      startedAt: now(),
      finishedAt: null,
      ...(isCopilot
        ? { copilotKind: snapshot.kind, copilotEntries: structuredClone(snapshot.entries) }
        : {}),
      tasks: snapshot.tasks.map((task: any, index: number) => ({
        index,
        type: task.type,
        status: 'waiting',
        message: '等待执行',
        startedAt: null,
        finishedAt: null,
        drops: [],
        infrastructure: [],
        artifacts: [],
      })),
    };
    // Persist deduplication and immutable execution inputs before any native effect.
    this.store.transaction(() => {
      this.putExecution(id, run);
      if (isCopilot) this.store.put('run_snapshot', id, structuredClone(snapshot));
      else this.store.put('run_plan', id, snapshot);
      this.store.put('request', params.requestId, {
        runId: id,
        source: snapshot.source,
        planId: run.planId,
        kind: snapshot.kind,
        identity: snapshot.identity,
        deviceId: device.id,
      });
    });
    this.emit('run.started', run.message, { run });
    device.state = 'running';
    this.store.put('device', device.id, device);
    await this.submitNativeTask(run, 0);
    return this.execution(id);
  }
  async stopRun(id: string) {
    const run = this.execution(id);
    if (!run) throw new RpcError(-32004, '执行记录不存在');
    if (run.status === 'running') {
      if (run.toolKind && !this.store.get('execution', id)) {
        this.finishNativeRun(run, 'stopped', '工具操作已取消，尚未向设备提交任务');
        return this.execution(id);
      }
      this.clientSwitches.get(run.deviceId)?.abort();
      const worker = this.workers.get(run.deviceId);
      if (worker) {
        const execution = this.store.get('execution', id, {});
        execution.stopRequested = Date.now();
        this.store.put('execution', id, execution);
        run.message = '正在停止并等待核心与异步调用结束，保存的配置保留';
        this.putExecution(id, run);
        try {
          await worker.stop();
          return this.execution(id);
        } catch {
          await worker.close();
          this.workers.delete(run.deviceId);
          this.workerConfigurations.delete(run.deviceId);
        }
      }
      this.finishNativeRun(run, 'stopped', '工作进程已结束，请核对设备现场，保存的配置保留');
    }
    return run;
  }
  private validateAutomatic(address: string) {
    if (!parseSettings(this.store.get('settings', 'main')).autoConnect)
      throw new RpcError(-32011, '自动连接已关闭');
    if (this.suppressed.has(this.lockAddress(address)))
      throw new RpcError(-32011, '该设备已手动断开，自动连接已跳过');
  }
  private lockAddress(address: string) {
    return emulatorCanonicalAddress(
      this.store.get('device-alias', address, deviceLockAddress(address)),
      this.emulatorInventory,
    );
  }
  private sdkInstance(capture: Settings['capture']) {
    if (capture?.method !== 'mumu') return;
    try {
      const root = realpathSync(capture.emulatorPath).toLowerCase();
      const matches = this.emulatorInventory.instances.filter(
        (instance) =>
          instance.kind !== 'ldplayer' &&
          instance.index === capture.instanceIndex &&
          realpathSync(instance.emulatorPath).toLowerCase() === root,
      );
      return matches.length === 1 ? matches[0] : undefined;
    } catch {
      return;
    }
  }
  private profileLockAddress(profile: NonNullable<Settings['deviceProfiles']>[number]) {
    const instance = this.sdkInstance(profile.capture);
    return this.lockAddress(instance?.address ?? profile.address);
  }
  private readEmulatorInventory() {
    // Test adapters must never enumerate or operate real host emulators.
    return (
      this.options.emulatorInventory ??
      (this.options.workerFactory || this.options.adbExecutable
        ? async () => emptyEmulatorInventory()
        : runningWindowsEmulatorInventory)
    )();
  }
  private async adbExecutable(
    selected?: Pick<Settings, 'connection' | 'capture'>,
  ): Promise<string> {
    if (this.options.adbExecutable) return this.options.adbExecutable();
    const { capture, connection } = selected ?? parseSettings(this.store.get('settings', 'main'));
    if (connection?.adbPath.trim())
      return connection.adbPath.trim() === 'adb'
        ? resolveAdbPath({ ...process.env, MAAVERGE_ADB_PATH: undefined })
        : configuredAdbPath(connection.adbPath);
    if (process.env.MAAVERGE_ADB_PATH) return resolveAdbPath();
    return captureAdbPath(capture) || resolveAdbPath();
  }
  async connectDevice(
    params: any,
    internal = false,
    automatic = false,
    inventory?: EmulatorInventory,
  ): Promise<any> {
    let id: string | undefined,
      reservedAddress: string | undefined,
      profileId: string | undefined,
      attemptedAddress: string | undefined,
      reserved = false,
      worker: Worker | undefined;
    try {
      if (this.switching && !internal)
        throw new RpcError(-32011, '正在切换核心与资源，暂不能连接设备');
      if (this.initializingComponents && !internal)
        throw new RpcError(-32021, '正在后台准备随附组件，请稍后再连接设备');
      if (!this.running || this.appUpdating || (this.appUpdatePreparing && !internal))
        throw new RpcError(-32011, '应用运行时正在退出或安装更新');
      const address = validateAddress(params.address);
      attemptedAddress = address;
      if (automatic) this.validateAutomatic(address);
      const active = this.store
        .all('device')
        .find((device) => device.address === address && this.workers.has(device.id));
      if (active) return active;
      if (this.connectingAddresses.has(address)) throw new RpcError(-32011, '该设备正在建立连接');
      this.connectingAddresses.add(address);
      reservedAddress = address;
      this.emulatorInventory = inventory ?? (await this.readEmulatorInventory());
      if (
        !this.running ||
        this.appUpdating ||
        ((this.appUpdatePreparing || this.switching) && !internal)
      )
        throw new RpcError(-32011, '正在退出、安装应用更新或切换核心，连接已取消');
      const settings = parseSettings(this.store.get('settings', 'main'));
      let profile =
        findDeviceProfile(settings, address) ??
        settings.deviceProfiles?.find(
          (profile) => this.profileLockAddress(profile) === this.lockAddress(address),
        );
      profileId = profile?.id;
      let selected = profile
        ? { capture: profile.capture, connection: profile.connection }
        : settings;
      const detected = automaticCapture(selected.capture, address, this.emulatorInventory);
      if (detected)
        selected = {
          ...selected,
          capture: detected.capture,
          ...(detected.config
            ? {
                connection: {
                  ...defaultConnection(),
                  ...selected.connection,
                  config: detected.config,
                },
              }
            : {}),
        };
      const knownInstance =
        emulatorInstanceForAddress(address, this.emulatorInventory) ??
        (selected.capture?.mumuBridge ? this.sdkInstance(selected.capture) : undefined);
      const capture = await connectionCapture(
        selected.capture,
        address,
        process.platform,
        knownInstance,
      );
      if (
        !this.running ||
        this.appUpdating ||
        ((this.appUpdatePreparing || this.switching) && !internal)
      )
        throw new RpcError(-32011, '正在退出、安装应用更新或切换核心，连接已取消');
      if (detected?.instance && detected.capture.method !== 'adb') {
        const current = parseSettings(this.store.get('settings', 'main'));
        const profiles = current.deviceProfiles ?? [];
        const profileKey =
          profile?.id ??
          `detected-${createHash('sha256').update(`${detected.capture.method}|${capture.emulatorPath.toLowerCase()}|${capture.instanceIndex}`).digest('hex').slice(0, 16)}`;
        const existing = profiles.find((item) => item.id === profileKey);
        const unchangedDefaults =
          JSON.stringify([current.capture, current.connection]) ===
          JSON.stringify([settings.capture, settings.connection]);
        const currentProfile = profiles.find(
          (item) => this.profileLockAddress(item) === this.lockAddress(address),
        );
        if (
          profile
            ? existing && JSON.stringify(existing) === JSON.stringify(profile)
            : !existing && !currentProfile && unchangedDefaults
        ) {
          const automaticProfile = {
            ...existing,
            id: profileKey,
            name:
              existing?.name ??
              `${detected.instance.name}（实例 ${detected.instance.index}）`.slice(0, 80),
            address: existing && !existing.autoDetected ? existing.address : address,
            connection: {
              ...defaultConnection(),
              ...selected.connection,
              address: existing && !existing.autoDetected ? existing.address : address,
            },
            capture: {
              method: capture.method,
              emulatorPath: capture.emulatorPath,
              instanceIndex: capture.instanceIndex,
              autoDetect: true,
            },
            ...(!existing ? { autoDetected: true } : {}),
          };
          if (!existing && profiles.length >= 32)
            throw new Error('自动截图配置最多保存 32 个实例，请清理不用的实例配置');
          const next = parseSettings({
            ...current,
            deviceProfiles: existing
              ? profiles.map((item) => (item.id === profileKey ? automaticProfile : item))
              : [...profiles, automaticProfile],
          });
          this.store.put('settings', 'main', next);
          profile = next.deviceProfiles!.find((item) => item.id === profileKey);
          profileId = profileKey;
          if (!existing || JSON.stringify(existing) !== JSON.stringify(profile))
            this.emit('settings.changed', '已自动配置实例增强截图', {
              profileId: profileKey,
              method: capture.method,
              instanceIndex: capture.instanceIndex,
            });
        }
      }
      // A bridged ADB address still controls the selected local MuMu SDK instance.
      // Keep its alias after settings changes so reconnect/disconnect uses the same lease.
      const sdkInstance = this.sdkInstance(capture);
      if (
        sdkInstance &&
        (capture.mumuBridge ||
          emulatorInstanceForAddress(address, this.emulatorInventory) === sdkInstance)
      )
        this.store.put('device-alias', address, sdkInstance.address);
      else if (capture.method === 'mumu' && capture.mumuBridge)
        throw new Error('未能确认 MuMu 桥接实例，请启动对应实例并检查多开管理器');
      else this.store.delete('device-alias', address);
      if (automatic) this.validateAutomatic(address);
      else if (!internal) this.suppressed.delete(this.lockAddress(address));
      const combo = this.store.get('active', 'combo', {});
      if (!combo.core) throw new Error('请先在更新中心安装并启用核心');
      const canonical = this.lockAddress(address),
        aliases = this.store.all('device').filter((d) => this.lockAddress(d.address) === canonical);
      const previous = aliases.find((d) => this.workers.has(d.id)) || aliases[0];
      id =
        previous?.id ||
        'device-' + createHash('sha256').update(canonical).digest('hex').slice(0, 12);
      if (this.connecting.has(id!)) throw new RpcError(-32011, '该设备正在建立连接');
      if (this.workers.has(id!)) return this.store.get('device', id!);
      this.connecting.add(id!);
      reserved = true;
      const adb = await this.adbExecutable(selected);
      if (!this.running || (this.switching && !internal))
        throw new RpcError(-32011, '正在退出或切换核心，连接已取消');
      if (automatic) this.validateAutomatic(address);
      const connection = (({ config, touchMode, adbLite, clientType }) => ({
        config,
        touchMode,
        adbLite,
        clientType,
      }))(selected.connection ?? defaultConnection());
      const { mumuTouch, mumuBridge, autoDetect: _autoDetect, ...plainCapture } = capture;
      const workerCapture =
        capture.method === 'adb'
          ? { method: 'adb' }
          : capture.method === 'mumu'
            ? {
                ...plainCapture,
                ...(mumuTouch !== undefined ? { mumuTouch } : {}),
                ...(mumuBridge !== undefined ? { mumuBridge } : {}),
              }
            : plainCapture;
      const config = {
        core: combo.core.path,
        resource: combo.resource.path,
        adb,
        address,
        capture: workerCapture,
        ...(connection ? { connection } : {}),
        userDir: path.join(this.root, 'workers', id!),
        lockPath: deviceLockPath(adbServerIdentity() + '|' + canonical),
      };
      worker = await this.startWorker(config);
      await worker.connect();
      if (!this.running || this.appUpdating)
        throw new RpcError(-32011, '应用运行时正在退出或安装更新');
      if (automatic) this.validateAutomatic(address);
      this.workers.set(id!, worker);
      this.workerConfigurations.set(id!, structuredClone(config));
      const device = {
        id,
        name: String(params.name || profile?.name || address).slice(0, 80),
        address,
        state: 'offline',
        ...(profile ? { connectionProfileId: profile.id } : {}),
        coreVersion: combo.core.version,
        resourceVersion: combo.resource.version,
      };
      this.store.put('device', id!, device);
      this.emit('device.connecting', '正在异步连接设备', { device });
      return device;
    } catch (error) {
      if (worker && !this.workers.has(id!)) await worker.close();
      const reason = connectionError(error);
      if (profileId)
        this.emit('device.connection_failed', '多开实例连接失败：' + reason, {
          profileId,
          address: attemptedAddress,
          error: reason,
          detail: String(error),
        });
      if (error instanceof RpcError) throw error;
      throw new RpcError(-32040, '设备连接失败：' + reason, String(error));
    } finally {
      if (reserved) this.connecting.delete(id!);
      if (reservedAddress) this.connectingAddresses.delete(reservedAddress);
    }
  }
  async autoConnectDevices(automatic = false): Promise<any> {
    if (this.autoConnecting) throw new RpcError(-32011, '模拟器自动连接正在进行');
    this.autoConnecting = true;
    try {
      if (!this.running || this.appUpdating || this.appUpdatePreparing || this.switching)
        throw new RpcError(-32011, '正在退出、安装应用更新或切换核心，请稍后重试');
      if (!automatic) this.suppressed.clear();
      if (!this.store.get('active', 'combo', {}).core)
        throw new RpcError(-32040, '请先在更新中心安装并启用核心，再自动连接模拟器');
      const profiles = parseSettings(this.store.get('settings', 'main')).deviceProfiles ?? [];
      const configuredOnly = profiles.some((profile) => !profile.autoDetected);
      let discovered: { address: string; name: string; adbState: string }[] = [],
        diagnostics: string[] = [];
      let inventory: EmulatorInventory;
      if (!configuredOnly) {
        try {
          const result = await (this.options.discoverDevices ?? autoDiscover)(
            await this.adbExecutable(),
            { inventory: () => this.readEmulatorInventory() },
          );
          discovered = result.devices;
          diagnostics = result.diagnostics;
          inventory = result.inventory;
        } catch (error) {
          throw new RpcError(
            -32040,
            '模拟器自动发现失败：' + connectionError(error, 'adb'),
            String(error),
          );
        }
      } else {
        inventory = await this.readEmulatorInventory();
        diagnostics = [...inventory.diagnostics];
      }
      this.emulatorInventory = inventory;
      // Explicit multi-instance profiles use their own ADB executables and SDK
      // indices. A global enhanced-capture index must never be applied to all.
      const candidates = configuredOnly
        ? profiles.map((profile) => ({
            address: profile.address,
            name: profile.name,
            adbState: 'configured',
          }))
        : discovered;
      const devices: any[] = [],
        seen = new Set<string>();
      for (const candidate of candidates) {
        const configured = findDeviceProfile({ deviceProfiles: profiles }, candidate.address);
        const key = configured
          ? this.profileLockAddress(configured)
          : this.lockAddress(candidate.address);
        if (
          (!configured &&
            (candidate.adbState !== 'device' || !isLocalEmulator(candidate.address))) ||
          seen.has(key) ||
          (automatic && this.suppressed.has(key))
        )
          continue;
        seen.add(key);
        try {
          if (this.switching || !this.running)
            throw new RpcError(-32011, '正在退出或切换核心，请稍后重试');
          const previous = [...this.workers.keys()]
            .map((id) => this.store.get('device', id))
            .find((d) => this.lockAddress(d.address) === key);
          if (previous) {
            const worker = this.workers.get(previous.id)!;
            if (worker.connected || !worker.safeIdle) {
              devices.push(previous);
              continue;
            }
            await this.disconnectDevice(previous.id, true);
          }
          devices.push(await this.connectDevice(candidate, false, automatic, inventory));
        } catch (error) {
          diagnostics.push(candidate.address + '：' + connectionError(error));
        }
      }
      if (!devices.length)
        diagnostics.push('未连接到可用模拟器；请启动模拟器并开启 ADB 调试，或手动填写地址');
      if (!automatic || JSON.stringify(diagnostics) !== JSON.stringify(this.lastDiagnostics))
        this.emit('device.auto_connect', '模拟器自动连接检查完成', {
          requested: devices.length,
          diagnostics,
        });
      this.lastDiagnostics = diagnostics;
      return { devices, discovered, diagnostics };
    } finally {
      this.autoConnecting = false;
    }
  }
  async automaticConnections() {
    if (
      !this.running ||
      this.initializingComponents ||
      this.appUpdating ||
      this.appUpdatePreparing ||
      !parseSettings(this.store.get('settings', 'main')).autoConnect ||
      Date.now() < this.nextAutoConnect ||
      this.switching ||
      this.busy()
    )
      return;
    this.nextAutoConnect = Date.now() + 30_000;
    if (!this.store.get('active', 'combo', {}).core) return;
    try {
      await this.autoConnectDevices(true);
    } catch (error) {
      const reason = connectionError(error),
        diagnostics = [reason];
      if (this.running && JSON.stringify(diagnostics) !== JSON.stringify(this.lastDiagnostics))
        this.emit('device.auto_connect_failed', '模拟器自动发现失败：' + reason, {
          detail: String(error),
        });
      this.lastDiagnostics = diagnostics;
    }
  }
  async disconnectDevice(id: string, internal = false) {
    if (this.switching && !internal)
      throw new RpcError(-32011, '正在切换核心与资源，暂不能断开设备');
    if (this.preview.isClicking(id)) throw new RpcError(-32011, '点击尚未完成，请稍后断开设备');
    this.preview.invalidate(id);
    if (
      !this.switching &&
      this.executions().some((r) => r.deviceId === id && r.status === 'running')
    )
      throw new RpcError(-32011, '请先停止该设备的执行');
    const worker = this.workers.get(id);
    this.workers.delete(id);
    this.workerConfigurations.delete(id);
    await worker?.close();
    const device = this.store.get('device', id);
    if (device) {
      if (!internal) this.suppressed.add(this.lockAddress(device.address));
      device.state = 'offline';
      this.store.put('device', id, device);
    }
    this.emit('device.disconnected', '设备控制权已释放', { deviceId: id });
    return { disconnected: true };
  }
  async beforeSwitch() {
    if (!this.switching && this.busy()) throw new Error('核心或异步操作仍在运行');
    this.switching = true;
    this.preview.invalidate();
    const reconnect = new Map(this.reconnect.map((d) => [d.id, d]));
    const workers = [...this.workers.entries()];
    this.workers.clear();
    this.workerConfigurations.clear();
    for (const [id, worker] of workers) {
      const d = this.store.get('device', id);
      // Only a device that was actually connected needs to come back after the
      // switch. Registered offline workers must not block an idle component
      // update, and their next connection will pick up the new combo.
      if (worker.connected) reconnect.set(id, d);
      d.state = 'offline';
      this.store.put('device', id, d);
      this.emit('device.disconnected', '正在安全切换核心工作进程', { deviceId: id });
    }
    this.reconnect = [...reconnect.values()];
    const results = await Promise.allSettled(workers.map(([, w]) => w.close()));
    if (results.some((r) => r.status === 'rejected')) throw new Error('旧核心工作进程退出失败');
  }
  async afterSwitch() {
    for (const device of this.reconnect) {
      try {
        const connected = await this.connectDevice(
          { address: device.address, name: device.name },
          true,
        );
        if (!(await this.workers.get(connected.id)?.waitConnected()))
          throw new Error('新版核心设备重连失败或超时: ' + device.name);
      } catch (error) {
        // The new files were validated before the switch. A device that cannot
        // come back is reported as offline; it must not roll back a valid idle
        // update or terminate waiting plans.
        await this.abandonReconnect(device.id, error);
      }
    }
  }
  private async abandonReconnect(id: string, error: unknown) {
    const reason = connectionError(error),
      worker = this.workers.get(id);
    this.workers.delete(id);
    this.workerConfigurations.delete(id);
    if (worker) await worker.close().catch(() => {});
    const device = this.store.get('device', id);
    if (!device) return;
    device.state = 'offline';
    device.connectionError = reason.slice(0, 4096);
    this.store.put('device', id, device);
    this.emit('device.failed', '更新已生效，但设备重连失败：' + reason, {
      device,
      detail: String(error),
    });
  }
  async finishSwitch(error?: string) {
    if (!this.switching) return;
    if (error) {
      await Promise.all([...this.workers.values()].map((w) => w.close()));
      this.workers.clear();
      this.workerConfigurations.clear();
      for (const device of this.store.all('device')) {
        device.state = 'offline';
        this.store.put('device', device.id, device);
      }
      for (const run of this.executions())
        if (run.status === 'running')
          this.finishNativeRun(run, 'failed', '核心切换及旧版重连失败；请人工核对设备: ' + error);
      this.emit('update.recovery_failed', '设备重连失败，已终止等待中的计划', { error });
    }
    this.reconnect = [];
    this.switching = false;
  }
  private taskClient(run: any, index: number): string {
    const snapshot = this.executionSnapshot(run.id),
      tasks = snapshot.tasks;
    if (snapshot.source === 'copilot' && snapshot.clientType) return snapshot.clientType;
    if (typeof tasks[index].params.client_type === 'string' && tasks[index].params.client_type)
      return tasks[index].params.client_type;
    if (
      ['StartUp', 'CloseDown'].includes(tasks[index].type) &&
      !('client_type' in tasks[index].params)
    )
      return 'Official';
    for (let previous = index - 1; previous >= 0; previous--)
      if (tasks[previous].type === 'StartUp')
        return tasks[previous].params.client_type || 'Official';
    return this.deviceClient(run.deviceId);
  }
  deviceClient(deviceId: string): NonNullable<RpcContract['params']['stages.list']['clientType']> {
    const settings = parseSettings(this.store.get('settings', 'main')),
      device = this.store.get('device', deviceId);
    const profile =
      device &&
      (settings.deviceProfiles?.find((item) => item.id === device.connectionProfileId) ||
        findDeviceProfile(settings, device.address));
    return (
      this.store.get('device_client', deviceId) ??
      profile?.connection.clientType ??
      settings.connection?.clientType ??
      'Official'
    );
  }
  private syncHistory(
    deviceId: string,
    clientType: string,
  ): { operatorsAt?: string | null; depotAt?: string | null } {
    const synced = this.store.get('user_data_sync', deviceId, {});
    return (synced.clientType ?? this.store.get('device_client', deviceId, 'Official')) ===
      clientType
      ? synced
      : {};
  }
  private rememberClient(run: any, params: any) {
    const clientType = params.client_type || 'Official',
      accountName = typeof params.account_name === 'string' ? params.account_name : '';
    let estimatesInvalidated = false,
      accountChanged = false;
    this.store.transaction(() => {
      if (
        clientType !== this.store.get('device_client', run.deviceId, 'Official') ||
        accountName !== this.store.get('device_account', run.deviceId, '')
      ) {
        accountChanged = true;
        this.store.delete('user_data_sync', run.deviceId);
        this.store.delete('mall_visit', run.deviceId);
        clearDeviceRecognition(this.store, run.deviceId);
        this.accounts.invalidate(run.deviceId);
        const settings = this.store.get('settings', 'main');
        if (
          settings.infrastructureEstimates?.some(
            (profile: any) => profile.deviceId === run.deviceId,
          )
        ) {
          this.store.put('settings', 'main', {
            ...settings,
            infrastructureEstimates: settings.infrastructureEstimates.filter(
              (profile: any) => profile.deviceId !== run.deviceId,
            ),
          });
          estimatesInvalidated = true;
        }
      }
      this.store.put('device_client', run.deviceId, clientType);
      this.store.put('device_account', run.deviceId, accountName);
    });
    if (accountChanged)
      this.emit('device.account_changed', '客户端或账号已切换，已隔离工具配置并清理旧识别结果', {
        deviceId: run.deviceId,
      });
    if (estimatesInvalidated)
      this.emit(
        'device.infrastructure_estimate_invalidated',
        '账号或客户端已切换，请重新校准此设备的基建估算',
        { deviceId: run.deviceId, runId: run.id },
      );
  }
  private startWorker(config: any, signal?: AbortSignal) {
    this.protectedWorkerLogs.add(path.basename(config.userDir));
    return this.options.workerFactory
      ? this.options.workerFactory(structuredClone(config), { signal })
      : CoreWorker.start(config, { signal });
  }
  private canSubmit(runId: string) {
    return (
      this.running &&
      !this.switching &&
      this.execution(runId)?.status === 'running' &&
      !this.store.get('execution', runId, {}).stopRequested
    );
  }
  private updateRunTask(
    run: any,
    index: number,
    change: (task: RunTask) => void,
    limitResults = false,
  ) {
    const current = this.execution(run.id),
      task = current?.tasks?.[index];
    if (!task) return false;
    change(task);
    // Reserve 128 KiB for later status/diagnostic strings and bounded artifact
    // metadata. A single run's task metadata must remain below 1 MiB, well
    // within the host's 4 MiB NDJSON limit even for multi-byte Chinese text.
    if (
      limitResults &&
      Buffer.byteLength(JSON.stringify(current.tasks)) > 1024 * 1024 - 128 * 1024
    ) {
      if (!this.store.get('run_result_limit', run.id)) {
        this.store.put('run_result_limit', run.id, true);
        this.emit(
          'run.results_limited',
          '本次执行已达到结果记录上限，后续新结果不再保存；任务状态继续更新',
          { runId: run.id },
        );
      }
      return false;
    }
    this.putExecution(run.id, current);
    Object.assign(run, current);
    return true;
  }
  private captureRunArtifact(run: any, state: any, worker: Worker, label: string) {
    const key = run.id + ':' + state.index;
    const current = this.execution(run.id),
      task = current?.tasks?.[state.index];
    if (
      !worker.frame ||
      !task ||
      task.artifacts.length >= 3 ||
      current.tasks.reduce((total: number, task: RunTask) => total + task.artifacts.length, 0) >=
        12 ||
      this.artifactCaptures.has(key)
    )
      return;
    let capture!: Promise<void>;
    capture = (async () => {
      try {
        // Preview validates protocol, PNG dimensions, size and worker identity.
        // Running workers return their latest cached image without a new ADB action.
        const frame = await this.preview.frame({ deviceId: run.deviceId });
        const execution = this.running ? this.store.get('execution', run.id) : undefined;
        if (
          !this.running ||
          this.artifactCaptures.get(key) !== capture ||
          this.workers.get(run.deviceId) !== worker ||
          execution?.taskId !== state.taskId ||
          execution?.index !== state.index ||
          this.execution(run.id)?.status !== 'running'
        )
          return;
        const latest = this.execution(run.id),
          latestTask = latest?.tasks?.[state.index];
        if (
          !latestTask ||
          latestTask.artifacts.length >= 3 ||
          latest.tasks.reduce((total: number, task: RunTask) => total + task.artifacts.length, 0) >=
            12
        )
          return;
        const artifact = this.artifacts.save(run.id, latestTask, frame, label);
        this.putExecution(run.id, latest);
        this.emit('run.artifact', label + '已保存', {
          runId: run.id,
          index: state.index,
          taskId: state.taskId,
          artifact,
        });
      } catch (error) {
        if (this.running)
          this.emit('run.artifact_unavailable', '反馈画面获取失败，已保留核心结果信息', {
            runId: run.id,
            index: state.index,
            reason: String(error).slice(0, 500),
          });
      }
    })();
    this.artifactCaptures.set(key, capture);
    void capture.finally(() => {
      if (this.artifactCaptures.get(key) === capture) this.artifactCaptures.delete(key);
    });
  }
  private async finishRunArtifact(runId: string, index: number) {
    const key = runId + ':' + index,
      capture = this.artifactCaptures.get(key);
    if (!capture) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        capture,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 750);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      // A timed-out read may still complete; revoke its permission to persist.
      if (this.artifactCaptures.get(key) === capture) this.artifactCaptures.delete(key);
    }
  }
  private async workerForClient(run: any, clientType: string): Promise<Worker | undefined> {
    const id = run.deviceId,
      previous = this.workers.get(id),
      saved = this.workerConfigurations.get(id);
    if (!previous?.connected || !previous.safeIdle)
      throw new Error('核心尚未连接或未到达安全空闲边界');
    if ((saved?.connection?.clientType ?? 'Official') === clientType) return previous;
    if (!saved) throw new Error('缺少已连接核心的配置快照，无法安全切换客户端资源');
    if (this.clientSwitches.has(id)) throw new Error('该设备正在切换客户端资源');
    const controller = new AbortController(),
      cancelled = () => controller.signal.aborted || !this.canSubmit(run.id);
    this.clientSwitches.set(id, controller);
    this.connecting.add(id);
    this.preview.invalidate(id);
    let replacement: Worker | undefined,
      ready = false;
    const abort = () => {
      void replacement?.close().catch(() => {});
    };
    controller.signal.addEventListener('abort', abort, { once: true });
    try {
      const config = {
        ...structuredClone(saved),
        connection: {
          config: 'General',
          touchMode: 'maatouch',
          adbLite: false,
          ...saved.connection,
          clientType,
        },
      };
      this.workers.delete(id);
      this.workerConfigurations.delete(id);
      await previous.close();
      if (cancelled()) return;
      this.emit('device.client_switching', '正在切换客户端资源并重新连接当前设备', {
        deviceId: id,
        runId: run.id,
        clientType,
      });
      replacement = await this.startWorker(config, controller.signal);
      if (cancelled()) {
        await replacement.close();
        return;
      }
      this.workers.set(id, replacement);
      this.workerConfigurations.set(id, structuredClone(config));
      await replacement.connect();
      if (!(await replacement.waitConnected(30_000, cancelled))) {
        if (cancelled()) return;
        throw new Error('客户端资源切换后的设备连接失败或超时');
      }
      if (cancelled()) return;
      ready = true;
      return replacement;
    } catch (error) {
      if (!cancelled())
        throw new Error('客户端资源切换失败，本次执行已结束且不会重放：' + String(error));
    } finally {
      if (!ready) {
        await replacement?.close();
        if (this.workers.get(id) === replacement) {
          this.workers.delete(id);
          this.workerConfigurations.delete(id);
        }
      }
      controller.signal.removeEventListener('abort', abort);
      this.clientSwitches.delete(id);
      this.connecting.delete(id);
    }
  }
  submitNativeTask(run: any, index: number, syncSteps?: SyncStep[], syncIndex = 0): Promise<void> {
    const pending = this.submitNativeTaskInner(run, index, syncSteps, syncIndex);
    this.submissions.add(pending);
    return pending.finally(() => {
      this.submissions.delete(pending);
    });
  }
  private async submitNativeTaskInner(
    run: any,
    index: number,
    syncSteps?: SyncStep[],
    syncIndex = 0,
  ) {
    const current = this.execution(run.id);
    if (
      !this.running ||
      this.switching ||
      current?.status !== 'running' ||
      this.store.get('execution', run.id, {}).stopRequested
    )
      return;
    if (run.toolKind && !this.toolbox.beforeTask(run, index)) {
      this.updateRunTask(run, index, (task) => {
        Object.assign(task, {
          status: 'skipped',
          finishedAt: now(),
          message: '库存已达标或仅执行首个不足项',
        });
      });
      await this.advanceNativeTask(run, index + 1);
      return;
    }
    const plan = this.executionSnapshot(run.id),
      configuredTask = plan.tasks[index],
      clientType = this.taskClient(run, index);
    if (configuredTask.type === 'UserDataUpdate') {
      syncSteps ??= userDataSteps(
        configuredTask.params,
        this.syncHistory(run.deviceId, clientType),
        new Date(),
        clientType,
      );
      if (!syncSteps.length) {
        this.updateRunTask(run, index, (task) => {
          Object.assign(task, {
            status: 'skipped',
            finishedAt: now(),
            message: '当前周期已完成或未选择识别项目',
          });
        });
        this.emit('run.task_skipped', '更新数据已在当前周期完成或未选择识别项目，已跳过', {
          runId: run.id,
          index,
        });
        await this.advanceNativeTask(run, index + 1);
        return;
      }
    }
    const state: any = {
      index,
      syncSteps,
      syncIndex,
      clientType,
      completed: false,
      failed: false,
      queueEnded: false,
      idleAfterEnd: false,
      taskId: null,
      stopRequested: null,
      submitting: true,
    };
    const task = nativeTask(
      syncSteps ? { type: syncSteps[syncIndex]!.type, params: {}, enabled: true } : configuredTask,
    );
    if (task.type === 'Fight') {
      if (!('client_type' in task.params)) task.params.client_type = clientType;
      if (!('server' in task.params))
        task.params.server =
          ({ YoStarEN: 'US', YoStarJP: 'JP', YoStarKR: 'KR' } as Record<string, string>)[
            clientType
          ] ?? 'CN';
    }
    if (['OperBox', 'Depot'].includes(task.type)) state.recognitionType = task.type;
    if (task.type === 'Mall') {
      const visited = this.store.get('mall_visit', run.deviceId);
      if (
        configuredTask.params.visit_friends_once_a_day &&
        visited?.clientType === clientType &&
        !syncDue(visited.visitedAt, 'daily', new Date(), clientType)
      )
        task.params.visit_friends = false;
      state.mallVisitEnabled = task.params.visit_friends !== false;
    }
    if (run.source === 'copilot' && run.copilotEntries?.length === 1) {
      state.currentCopilotIndex = 0;
      Object.assign(run.copilotEntries[0], {
        status: 'running',
        message: '正在执行；通关结果未确认',
      });
      this.putExecution(run.id, run);
    }
    this.store.put('execution', run.id, state);
    this.updateRunTask(run, index, (item) => {
      Object.assign(item, {
        status: 'running',
        startedAt: item.startedAt ?? now(),
        message: '正在准备' + (taskLabels[configuredTask.type] ?? configuredTask.type),
      });
    });
    try {
      const worker = await this.workerForClient(run, clientType);
      if (!worker || !this.canSubmit(run.id)) {
        Object.assign(state, this.store.get('execution', run.id, {}), { submitting: false });
        this.store.put('execution', run.id, state);
        if (this.execution(run.id)?.status === 'running' && (state.stopRequested || !this.running))
          this.finishNativeRun(run, 'stopped', '执行已停止，保存的配置及未执行项保留');
        return;
      }
      if (this.updates.channels().some((channel) => channel.status === 'waiting_idle')) {
        Object.assign(state, {
          submitting: false,
          boundaryWaiting: true,
          nextIndex: index,
          nextSyncSteps: syncSteps,
          nextSyncIndex: syncIndex,
        });
        this.store.put('execution', run.id, state);
        run.message = '已到达安全边界，等待核心与资源更新后继续执行';
        this.putExecution(run.id, run);
        this.emit('run.progress', run.message, { run });
        return;
      }
      const result = await worker.task(task);
      if (run.toolKind === 'inventory' && run.inventoryTargets?.[index]) {
        run.executedInventory = index;
        this.putExecution(run.id, run);
      }
      Object.assign(state, this.store.get('execution', run.id, {}), {
        taskId: result.taskId,
        submitting: false,
      });
      this.store.put('execution', run.id, state);
      if (state.stopRequested || this.execution(run.id).status !== 'running') return;
      this.updateRunTask(run, index, (item) => {
        item.message = '正在执行' + (taskLabels[task.type] ?? task.type);
      });
      Object.assign(run, {
        message: '正在执行' + (taskLabels[task.type] ?? task.type),
        progress: Math.floor((index * 100) / plan.tasks.length),
      });
      this.putExecution(run.id, run);
      const device = this.store.get('device', run.deviceId);
      device.state = 'running';
      this.store.put('device', device.id, device);
      this.emit('run.progress', run.message, { run });
    } catch (error) {
      Object.assign(state, this.store.get('execution', run.id, {}), { submitting: false });
      this.store.put('execution', run.id, state);
      if (this.execution(run.id)?.status === 'running')
        this.finishNativeRun(
          run,
          state.stopRequested ? 'stopped' : 'failed',
          state.stopRequested
            ? '执行已停止，保存的配置及未执行项保留'
            : '任务提交失败或结果未知: ' + String(error),
        );
    }
  }
  private async advanceNativeTask(run: any, index: number, syncSteps?: SyncStep[], syncIndex = 0) {
    const plan = this.executionSnapshot(run.id);
    if (index >= plan.tasks.length)
      this.finishNativeRun(run, 'completed', '所有任务链均报告成功且核心已空闲');
    else if (this.updates.channels().some((c) => c.status === 'waiting_idle')) {
      const state = this.store.get('execution', run.id, {});
      Object.assign(state, {
        boundaryWaiting: true,
        nextIndex: index,
        nextSyncSteps: syncSteps,
        nextSyncIndex: syncIndex,
      });
      this.store.put('execution', run.id, state);
      Object.assign(run, {
        progress: Math.floor((index * 100) / plan.tasks.length),
        message: '当前任务完成，等待核心与资源热切换后继续剩余计划',
      });
      this.putExecution(run.id, run);
      this.emit('run.progress', run.message, { run });
    } else await this.continueNativeTask(run, index, syncSteps, syncIndex);
  }
  private async continueNativeTask(run: any, index: number, syncSteps?: SyncStep[], syncIndex = 0) {
    const changesClient =
      (this.workerConfigurations.get(run.deviceId)?.connection?.clientType ?? 'Official') !==
      this.taskClient(run, index);
    const pending = this.submitNativeTask(run, index, syncSteps, syncIndex);
    // Reconnection can take tens of seconds. Keep this run occupied while the
    // polling loop continues to process completion and stop events on others.
    if (changesClient)
      void pending.catch((error) => {
        if (this.running && this.execution(run.id)?.status === 'running')
          this.finishNativeRun(run, 'failed', '客户端任务准备失败，不会重放：' + String(error));
      });
    else await pending;
  }
  /** List IDs are local queue occurrence IDs, never community document IDs. */
  private recordCopilotCallback(run: any, state: any, message: number, details: any): boolean {
    if (
      run.source !== 'copilot' ||
      !Array.isArray(run.copilotEntries) ||
      details.taskid !== state.taskId ||
      state.stopRequested ||
      state.failed ||
      state.completed ||
      state.queueEnded
    )
      return false;
    const entries = run.copilotEntries;
    if (message === 20003 && details.what === 'CopilotListLoadTaskFileSuccess') {
      const loaded = details.details;
      if (!loaded || !Number.isInteger(loaded.id) || typeof loaded.file_name !== 'string')
        return false;
      const index = entries.findIndex((item: any) => item.nativeId === loaded.id);
      if (index < 0 || index < (state.currentCopilotIndex ?? -1)) return false;
      const snapshot = this.executionSnapshot(run.id),
        params = snapshot.tasks[0].params;
      const files = params.copilot_list ?? params.list;
      const expected = Array.isArray(files)
        ? files.find((item: any) => item.id === loaded.id)?.filename
        : params.filename;
      if (typeof expected !== 'string' || path.resolve(loaded.file_name) !== path.resolve(expected))
        return false;
      if (state.currentCopilotIndex !== undefined && state.currentCopilotIndex !== index) {
        const previous = entries[state.currentCopilotIndex];
        if (previous?.status === 'running')
          Object.assign(previous, {
            status: 'completed',
            message:
              previous.verdict === 'success'
                ? '已收到三星结算识别，开始下一项'
                : '核心已开始下一项；本项通关结果未确认',
          });
      }
      if (state.currentCopilotIndex !== index) state.copilotBattleStarted = false;
      state.currentCopilotIndex = index;
      Object.assign(entries[index], {
        status: 'running',
        message: '作业文件已加载；通关结果未确认',
      });
      run.progress = Math.floor((index * 100) / entries.length);
      run.message = `正在执行 ${index + 1}/${entries.length}：${entries[index].title}`;
      this.putExecution(run.id, run);
      this.emit('run.copilot_entry', run.message, {
        runId: run.id,
        entryId: entries[index].id,
        nativeId: loaded.id,
      });
      return false;
    }
    const entry = entries[state.currentCopilotIndex ?? -1];
    // Fixed-core ProcessTask errors identify their configured root, not an invented
    // sanity/non-three-star result. Both roots are fatal in native CopilotTask.
    if (
      entry &&
      message === 20000 &&
      details.subtask === 'ProcessTask' &&
      Array.isArray(details.first)
    ) {
      const settlement = details.first.includes('Copilot@WaitUntilEndOfAction');
      const starting = details.first.includes('BattleStartAll');
      if (settlement || starting) {
        state.failed = true;
        state.copilotFailureMessage = settlement
          ? '核心未通过三星结算检查，停止后续队列；通关结果未确认'
          : '未能进入战斗，请检查理智及游戏界面；停止后续队列';
        Object.assign(entry, { verdict: 'unknown', message: state.copilotFailureMessage });
        this.putExecution(run.id, run);
        this.emit('run.copilot_result', entry.message, {
          runId: run.id,
          entryId: entry.id,
          verdict: entry.verdict,
        });
        return true;
      }
    }
    if (entry && message === 20001 && details.subtask === 'BattleProcessTask')
      state.copilotBattleStarted = true;
    const action = details.details?.task;
    if (
      !entry ||
      typeof action !== 'string' ||
      message !== 20002 ||
      details.subtask !== 'ProcessTask'
    )
      return false;
    const victory =
      state.copilotBattleStarted &&
      run.copilotKind !== 'SSSCopilot' &&
      ['Copilot@StageDrops-Stars-3', 'Copilot@StageDrops-Stars-Adverse'].includes(action);
    const failure = ['Copilot@FightMissionFailed', 'Copilot@FightMissionFailed-Bypass'].includes(
      action,
    );
    if (!victory && !failure) return false;
    const confirmsAll = (this.executionSnapshot(run.id).workspace?.options.loopTimes ?? 1) === 1;
    Object.assign(entry, {
      verdict: failure ? 'failure' : confirmsAll ? 'success' : 'unknown',
      message: failure
        ? '已识别战斗失败，停止后续队列'
        : confirmsAll
          ? '已识别三星结算'
          : '已识别单次三星结算；整个循环结果未确认',
    });
    state.copilotBattleStarted = false;
    if (failure) {
      state.failed = true;
      state.copilotFailureMessage = entry.message;
    }
    this.putExecution(run.id, run);
    this.emit('run.copilot_result', entry.message, {
      runId: run.id,
      entryId: entry.id,
      verdict: entry.verdict,
    });
    return failure;
  }
  finishNativeRun(run: any, status: string, message: string) {
    Object.assign(run, this.execution(run.id));
    if (run.source === 'copilot') {
      for (const entry of run.copilotEntries ?? []) {
        if (entry.status === 'running')
          Object.assign(entry, {
            status,
            message:
              status === 'completed'
                ? entry.verdict === 'success'
                  ? '已识别三星结算，核心已空闲'
                  : '核心流程结束且已空闲；通关结果未确认'
                : message.slice(0, 1000),
          });
        else if (entry.status === 'waiting')
          Object.assign(entry, {
            status: 'skipped',
            message:
              status === 'completed'
                ? '核心未报告该条目执行；通关结果未确认'
                : '本项尚未执行，队列配置保留',
          });
      }
      if (
        status === 'completed' &&
        run.copilotEntries?.some((entry: any) => entry.verdict === 'unknown')
      )
        message = '核心流程已结束并确认空闲；部分作业通关结果未确认';
    }
    for (const task of run.tasks ?? [])
      if (task.status === 'running' && status !== 'completed')
        Object.assign(task, { status, message: message.slice(0, 1000), finishedAt: now() });
    Object.assign(run, { status, message, finishedAt: now() });
    if (run.toolKind) this.toolbox.finish(run, status);
    if (status === 'completed') run.progress = 100;
    this.putExecution(run.id, run);
    this.scheduler.runFinished(run);
    const device = this.store.get('device', run.deviceId),
      worker = this.workers.get(run.deviceId);
    if (device) {
      device.state = worker?.connected && worker.safeIdle ? 'idle' : 'offline';
      this.store.put('device', device.id, device);
    }
    this.emit('run.' + status, run.message, { run });
    if (status === 'completed' && run.source === 'copilot')
      this.copilot.autoLikeConfirmed(
        run.id,
        this.executionSnapshot(run.id),
        run.copilotEntries ?? [],
      );
  }
  async pollNativeWorkers() {
    for (const [id, worker] of [...this.workers.entries()]) {
      if (this.workers.get(id) !== worker) continue;
      let run = this.executions().find((r) => r.deviceId === id && r.status === 'running');
      if (run && this.store.get('execution', run.id, {}).submitting) continue;
      while (worker.events.length) {
        const event = worker.events.shift(),
          state = run ? this.store.get('execution', run.id, {}) : {};
        if (['exit', 'protocol_error'].includes(event.type)) {
          worker.connected = false;
          if (run)
            this.finishNativeRun(run, 'failed', '核心工作进程异常，执行结果未知；不会自动重放');
          run = undefined;
          const d = this.store.get('device', id);
          d.state = 'offline';
          d.connectionError = event.error
            ? String(event.error).slice(0, 4096)
            : '核心工作进程异常退出，请重新连接；若仍失败可在设置中导出诊断日志';
          this.store.put('device', id, d);
          await worker.close();
          this.workers.delete(id);
          this.workerConfigurations.delete(id);
          break;
        }
        if (event.type === 'callback') {
          const { message, details } = event;
          if (
            message === 2 &&
            details.what === 'FastestWayToScreencap' &&
            typeof details.details?.method === 'string'
          ) {
            const d = this.store.get('device', id);
            d.captureMethod = details.details.method;
            this.store.put('device', id, d);
            this.emit('device.capture', '核心实际截图方式：' + d.captureMethod, {
              deviceId: id,
              method: d.captureMethod,
              cost: details.details.cost,
            });
          }
          if (message === 2) {
            const reason = nativeConnectionError(details);
            if (reason) {
              this.connectionErrors.set(worker, reason);
              this.emit('device.connection_diagnostic', reason, {
                deviceId: id,
                what: details.what,
                why: String(details.why ?? '').slice(0, 4096),
                rawOutput: String(details.details?.raw_output ?? '').slice(0, 4096),
              });
            }
          }
          if (message === 4 && details.what === 'Connect') {
            worker.connected = !!details.details?.ret;
            const d = this.store.get('device', id);
            d.state = worker.connected ? (this.hasExecution(id) ? 'running' : 'idle') : 'offline';
            const reported = details.details?.error,
              translated = reported ? connectionError(reported) : undefined;
            if (worker.connected) delete d.connectionError;
            else
              d.connectionError =
                (reported && translated !== errorDetail(reported).slice(0, 4096)
                  ? translated
                  : undefined) ||
                this.connectionErrors.get(worker) ||
                translated ||
                '设备连接失败，核心未返回具体原因；请确认模拟器已启动、ADB 调试已开启，并核对连接地址';
            this.connectionErrors.delete(worker);
            this.store.put('device', id, d);
            this.emit(
              worker.connected ? 'device.connected' : 'device.failed',
              worker.connected ? '设备已连接' : '核心设备连接失败：' + d.connectionError,
              {
                device: d,
                ...(details.details?.error
                  ? { detail: String(details.details.error).slice(0, 4096) }
                  : {}),
              },
            );
          }
          if (message === 2 && ['Disconnect', 'ResolutionChanged'].includes(details.what)) {
            worker.connected = false;
            const d = this.store.get('device', id);
            d.state = 'offline';
            delete d.captureMethod;
            this.store.put('device', id, d);
            const reason =
              details.why === 'RequiredCaptureProtocolUnavailable'
                ? '增强截图不可用，已停止执行并断开：' +
                  (details.details?.error || '未确认要求的截图协议')
                : '设备连接中断，请核对现场后重试';
            d.connectionError = reason.slice(0, 4096);
            this.store.put('device', id, d);
            this.emit('device.failed', reason, { device: d });
            if (run) this.finishNativeRun(run, 'failed', reason);
            run = undefined;
          }
          if (run) {
            const matches = details.taskid === state.taskId;
            const stopCopilot = this.recordCopilotCallback(run, state, message, details);
            if (stopCopilot) {
              state.copilotStopRequested = Date.now();
              this.store.put('execution', run.id, state);
              this.captureRunArtifact(run, state, worker, '作业异常反馈画面');
              try {
                await worker.stop();
              } catch {
                await worker.close();
                worker.connected = false;
                this.workers.delete(id);
                this.workerConfigurations.delete(id);
                this.finishNativeRun(
                  run,
                  'failed',
                  '作业异常且停止未获确认，已结束工作进程；请核对设备现场',
                );
              }
            } else if (
              matches &&
              message === 20002 &&
              details.subtask === 'ProcessTask' &&
              ['Copilot@StageDrops-Stars-3', 'Copilot@StageDrops-Stars-Adverse'].includes(
                details.details?.task,
              )
            )
              this.captureRunArtifact(run, state, worker, '作业结算反馈画面');
            if (
              [0, 1].includes(message) ||
              (message === 10000 && matches) ||
              (message === 10004 && matches)
            )
              state.failed = true;
            if (message === 10002 && matches) state.completed = true;
            if (
              message === 3 &&
              (matches ||
                (!('taskid' in details) &&
                  (!Array.isArray(details.finished_tasks) ||
                    details.finished_tasks.includes(state.taskId))))
            )
              state.queueEnded = true;
            if (
              message === 20003 &&
              matches &&
              !state.stopRequested &&
              !state.failed &&
              !state.completed &&
              !state.queueEnded &&
              run.toolKind === 'recruit' &&
              details.what === 'RecruitResult'
            ) {
              const result = this.toolbox.recruitResult(run, details.details);
              if (result) state.toolResult = result;
            }
            if (
              message === 20003 &&
              matches &&
              !state.stopRequested &&
              !state.failed &&
              !state.completed &&
              !state.queueEnded &&
              details.what === 'StageDrops'
            )
              this.toolbox.drops(run, state, details.details);
            if (
              message === 20003 &&
              matches &&
              state.recognitionType &&
              !state.completed &&
              !state.failed &&
              !state.queueEnded &&
              !state.stopRequested
            ) {
              const recognized = parseRecognition(state.recognitionType, details);
              if (recognized) {
                state.recognitionResult = recognized;
                state.recognitionResultAt = now();
              }
            }
            if (
              message === 20002 &&
              matches &&
              state.mallVisitEnabled &&
              details.subtask === 'ProcessTask' &&
              details.taskchain === 'Mall' &&
              ['VisitLimited', 'VisitNextBlack'].includes(details.details?.task)
            )
              state.mallVisitedAt = now();
            if (matches && !state.stopRequested && !state.failed && !state.queueEnded) {
              // SubTaskCompleted ends one internal step, never the configured task.
              // After TaskChainCompleted, late step callbacks must not undo the idle wait.
              if (message === 10002 || (!state.completed && [10001, 20001].includes(message))) {
                const action =
                  details.details?.task ??
                  details.subtask ??
                  details.taskchain ??
                  this.executionSnapshot(run.id)?.tasks[state.index]?.type ??
                  '';
                const taskType =
                  state.syncSteps?.[state.syncIndex]?.type ??
                  this.executionSnapshot(run.id)?.tasks[state.index]?.type;
                const taskLabel = taskLabels[taskType] ?? '当前任务',
                  localized = localizeExecutionMessage(String(action));
                const namedStep =
                  typeof details.details?.task === 'string' &&
                  localized !== action &&
                  !/[A-Za-z]/.test(localized) &&
                  !taskLabels[action] &&
                  !['Start', 'ProcessTask'].includes(action);
                const messageText =
                  message === 10002
                    ? taskLabel + '流程结束，正在确认核心空闲'
                    : message === 10001
                      ? taskLabel + '执行中'
                      : namedStep
                        ? localized.startsWith(taskLabel + ' · ')
                          ? localized
                          : taskLabel + ' · ' + localized
                        : null;
                if (messageText && messageText !== run.message) {
                  this.updateRunTask(run, state.index, (item) => {
                    item.message = messageText.slice(0, 1000);
                  });
                  run.message = messageText;
                  this.putExecution(run.id, run);
                  this.emit('run.task_progress', messageText, {
                    runId: run.id,
                    index: state.index,
                    taskId: state.taskId,
                    action,
                  });
                }
              }
              if (message === 20003) {
                let changed = false;
                const recorded = this.updateRunTask(
                  run,
                  state.index,
                  (item) => {
                    if (details.what === 'StageDrops' && details.taskchain === 'Fight')
                      changed = recordDrops(item, details.details, now());
                    else if (details.taskchain === 'Infrast')
                      changed = recordInfrastructure(item, details.what, details.details, now());
                  },
                  true,
                );
                if (changed && recorded) {
                  this.emit(
                    'run.result',
                    details.taskchain === 'Fight' ? '作战掉落已更新' : '基建反馈已更新',
                    { runId: run.id, index: state.index, taskId: state.taskId, what: details.what },
                  );
                  if (
                    details.what === 'StageDrops' ||
                    details.what === 'InfrastConfirmButton' ||
                    (details.what === 'ProductOfFacility' &&
                      !run.tasks[state.index].artifacts.length)
                  )
                    this.captureRunArtifact(
                      run,
                      state,
                      worker,
                      details.taskchain === 'Fight' ? '自动作战反馈画面' : '基建反馈画面',
                    );
                }
              }
            }
            this.store.put('execution', run.id, state);
          }
          if (details.what === 'UnsupportedLevel')
            this.nextChecks.resource = Math.min(this.nextChecks.resource!, Date.now() + 60_000);
        } else if (
          event.type === 'status' &&
          run &&
          !event.running &&
          !event.pendingAsync.length &&
          (state.queueEnded || state.failed || state.stopRequested)
        ) {
          state.idleAfterEnd = true;
          this.store.put('execution', run.id, state);
        }
      }
      if (!run) continue;
      const state = this.store.get('execution', run.id, {});
      if (state.boundaryWaiting && !state.stopRequested) {
        if (
          worker.connected &&
          worker.safeIdle &&
          !this.updates.channels().some((c) => c.status === 'waiting_idle') &&
          !this.switching
        )
          await this.continueNativeTask(
            run,
            state.nextIndex,
            state.nextSyncSteps,
            state.nextSyncIndex,
          );
      } else if (
        (state.stopRequested || state.copilotStopRequested) &&
        Date.now() - (state.stopRequested || state.copilotStopRequested) > 15_000
      ) {
        await worker.close();
        this.workers.delete(id);
        this.workerConfigurations.delete(id);
        this.finishNativeRun(
          run,
          state.stopRequested ? 'stopped' : 'failed',
          '核心停止超时，已结束工作进程；请核对设备现场',
        );
      } else if (state.idleAfterEnd && worker.safeIdle) {
        await this.finishRunArtifact(run.id, state.index);
        // Stop can arrive while the final feedback image is being read.
        Object.assign(state, this.store.get('execution', run.id, {}));
        if (state.mallVisitedAt) {
          this.store.put('mall_visit', run.deviceId, {
            visitedAt: state.mallVisitedAt,
            clientType: state.clientType,
          });
          this.emit('device.friends_visited', '好友访问已获专用成功回调确认', {
            deviceId: run.deviceId,
            runId: run.id,
            visitedAt: state.mallVisitedAt,
          });
        }
        if (state.stopRequested)
          this.finishNativeRun(run, 'stopped', '执行已停止，保存的配置及未执行项保留');
        else if (state.failed || !state.completed)
          this.finishNativeRun(
            run,
            'failed',
            state.copilotFailureMessage || '核心任务失败或缺少成功证据；不会继续后续任务',
          );
        else if (run.toolKind === 'recruit' && !state.toolResult)
          this.finishNativeRun(run, 'failed', '缺少有效公招计算结果，未报告计算成功');
        else if (state.recognitionType && !state.recognitionResultAt)
          this.finishNativeRun(
            run,
            'failed',
            '识别任务已结束但缺少有效的最终识别结果，结果未知；未记录同步成功',
          );
        else {
          if (run.toolKind === 'recruit') {
            run.result = state.toolResult;
            this.putExecution(run.id, run);
          }
          const configured = this.executionSnapshot(run.id).tasks[state.index];
          if (configured.type === 'StartUp') this.rememberClient(run, configured.params);
          const step: SyncStep | undefined =
            state.syncSteps?.[state.syncIndex] ??
            (configured.type === 'OperBox'
              ? { type: 'OperBox', key: 'operatorsAt' }
              : configured.type === 'Depot'
                ? { type: 'Depot', key: 'depotAt' }
                : undefined);
          if (step) {
            const synced = {
              operatorsAt: null,
              depotAt: null,
              ...this.syncHistory(run.deviceId, state.clientType),
              clientType: state.clientType,
            };
            synced[step.key] = state.recognitionResultAt;
            const kind = step.type === 'OperBox' ? ('operators' as const) : ('depot' as const);
            const result = {
              deviceId: run.deviceId,
              kind,
              clientType: state.clientType,
              collectedAt: state.recognitionResultAt,
              runId: run.id,
              ...state.recognitionResult,
            };
            this.store.transaction(() => {
              this.store.put(
                'recognition',
                recognitionKey(run.deviceId, state.clientType, kind),
                result,
              );
              this.store.put('user_data_sync', run.deviceId, synced);
              const device = this.store.get('device', run.deviceId, {});
              this.accounts.capture(result, {
                source: 'maacore-recognition',
                coreVersion: device.coreVersion ?? null,
                resourceVersion: device.resourceVersion ?? null,
                taskIndex: state.index,
              });
            });
            this.emit(
              'device.data_synced',
              step.type === 'OperBox' ? '干员识别已成功同步' : '仓库识别已成功同步',
              {
                deviceId: run.deviceId,
                runId: run.id,
                type: step.type,
                syncedAt: synced[step.key],
              },
            );
            if (state.syncSteps && state.syncIndex + 1 < state.syncSteps.length) {
              await this.advanceNativeTask(run, state.index, state.syncSteps, state.syncIndex + 1);
              continue;
            }
          }
          this.updateRunTask(run, state.index, (task) => {
            Object.assign(task, {
              status: 'completed',
              finishedAt: now(),
              message: '任务成功且核心已空闲',
            });
          });
          await this.advanceNativeTask(run, state.index + 1);
        }
      }
    }
  }
  async tick(force = false) {
    if (
      !this.running ||
      this.ticking ||
      (!force && Date.now() - this.lastTick < (this.options.tickSeconds ?? 0.6) * 1000)
    )
      return;
    this.ticking = true;
    this.lastTick = Date.now();
    try {
      if (this.logs.maintenanceDue)
        this.logs.automatic(
          parseSettings(this.store.get('settings', 'main')).logRetentionDays ?? 7,
        );
      await this.pollNativeWorkers();
      if (!this.initializingComponents) this.scheduler.tick();
    } finally {
      this.ticking = false;
    }
  }
  initializeBundledComponents(): Promise<void> {
    if (!this.options.applicationDirectory) return Promise.resolve();
    if (this.bundledInitialization) return this.bundledInitialization;
    this.initializingComponents = true;
    return (this.bundledInitialization = (async () => {
      try {
        await this.updates.bootstrapBundled(
          path.join(this.options.applicationDirectory!, 'runtime', 'bundled-components'),
        );
      } catch (error) {
        this.emit('update.bootstrap_failed', '随附组件初始化失败，可在更新中心查看原因并重试', {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.initializingComponents = false;
      }
    })());
  }
  async automaticUpdates() {
    if (!this.running || this.initializingComponents || this.appUpdating || this.appUpdatePreparing)
      return;
    const settings = parseSettings(this.store.get('settings', 'main'));
    for (const [channel, interval] of [
      ['core', 86400],
      ['resource', 21600],
    ] as const) {
      if (!this.running || this.appUpdating || this.appUpdatePreparing) return;
      if (
        !(channel === 'core' ? settings.autoUpdateCore : settings.autoUpdateResource) ||
        Date.now() < this.nextChecks[channel]!
      )
        continue;
      this.nextChecks[channel] = Date.now() + interval * 1000;
      try {
        const state = await this.updates.check(channel);
        if (!this.running || this.appUpdating || this.appUpdatePreparing) return;
        if (
          (this.updates.channel('core').currentVersion !== '未安装' || channel === 'core') &&
          state.status === 'available'
        ) {
          await this.updates.prepare(channel);
          if (this.running && !this.appUpdating && !this.appUpdatePreparing)
            await this.updates.activate(channel);
        }
      } catch {
        this.nextChecks[channel] = Date.now() + 300_000;
      }
    }
  }
  close(): Promise<void> {
    return (this.closing ||= this.closeInner());
  }
  cancelPendingClientSwitches() {
    for (const controller of this.clientSwitches.values()) controller.abort();
  }
  private async closeInner() {
    this.running = false;
    this.appUpdateHttp.close();
    this.copilot.beginClose();
    this.scheduler.close();
    this.toolbox.close();
    this.cancelPendingClientSwitches();
    this.preview.invalidate();
    await this.knowledge.close();
    await this.calendar.close();
    await this.updates.close();
    for (const run of this.executions()) if (run.status === 'running') await this.stopRun(run.id);
    await Promise.all([...this.workers.values()].map((worker) => worker.close()));
    this.workers.clear();
    this.workerConfigurations.clear();
    await Promise.allSettled([
      ...this.submissions,
      ...[...this.starts.values()].map((start) => start.promise),
    ]);
    await Promise.allSettled([...this.artifactCaptures.values()]);
    await this.copilot.drainFeedback(1000);
    this.logs.diagnostics.write('info', 'runtime.stopped');
    this.store.close();
  }
}
