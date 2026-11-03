import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { Store, now } from '@backend/infrastructure/storage/storage';
import { RpcError } from '@backend/shared/errors';
import { connectionError, errorDetail } from '@backend/infrastructure/native/connection-errors';
import { observeAdbDevices } from '@backend/infrastructure/native/connection-health';
import { ensureAvdTransport } from '@backend/infrastructure/native/avd-transport';
import { detectAvdSerial } from '@backend/infrastructure/native/avd-detection';
import {
  connectAdbTransport,
  localAdbServer,
  probeAdbEndpoint,
} from '@backend/infrastructure/native/adb-transport';
import {
  defaultConnection,
  parsePlan,
  parseSettings,
  parseSnapshot,
  type Plan,
  type Settings,
} from '@backend/modules/settings/models';
import { validatePlan } from '@backend/modules/plans/task-policy';
import { snapshotLegacyInputs, type LegacyInputs } from '@backend/modules/plans/legacy-inputs';
import { gameDate, syncDue } from '@backend/modules/recognition/user-data-sync';
import { propose } from '@backend/modules/agent/agent';
import {
  defaultComponentPaths,
  defaultCopilotDirectory,
  deviceLockPath,
  type ComponentPathEnvironment,
} from '@backend/infrastructure/config';
import { deviceWorker, type DeviceWorker } from '@backend/modules/framework/device-worker';
import {
  FrameworkWorker,
  validateFrameworkResources,
  type FrameworkConfiguration,
  type FrameworkPort,
} from '@backend/infrastructure/native/framework-worker';
import { ControlSessions, type FrameworkView } from '@backend/modules/framework/sessions';
import { frameworkConnection } from '@backend/modules/framework/connection';
import { DebugService } from '@backend/modules/debug/debug-service';
import {
  AtomicFailure,
  createAtomicCapabilityRegistry,
  loadAutomationResourceProfiles,
  compileLegacyTask,
  validateCompiledLegacyTaskResources,
  validateCompiledLegacyTaskInputs,
  type AtomicExecutionPort,
  type AutomationOptions,
} from '@maaverge/automation';
import { openAtomicResourceSource } from '@backend/modules/resources/atomic-resource-source';
import { prepareFrameworkResources } from '@backend/modules/framework/resources';
import { captureAdbPath, connectionCapture } from '@backend/modules/devices/capture';
import { Preview } from '@backend/modules/devices/preview';
import { UpdateService } from '@backend/modules/updates/updates';
import {
  FrameworkUpdateService,
  type FrameworkUpdateOptions,
} from '@backend/modules/framework/updates';
import { AppUpdateHttp } from '@backend/modules/updates/app-update-http';
import {
  configuredAdbPath,
  resolveAdbPath,
  adbServerIdentity,
  autoDiscover,
  type AdbDevice,
  deviceLockAddress,
  emulatorCanonicalAddress,
  emulatorInstanceForAddress,
  isLocalEmulator,
  validateAddress,
} from '@backend/infrastructure/native/adb';
import {
  emptyEmulatorInventory,
  runningWindowsEmulatorInventory,
  type EmulatorInventory,
} from '@backend/infrastructure/native/windows-emulators';
import { findDeviceProfile } from '@backend/modules/devices/device-profiles';
import { stageCatalog } from '@backend/modules/resources/stages';
import { homeInfo } from '@backend/modules/home/home-info';
import {
  ActivityCalendar,
  type ActivityCalendarOptions,
} from '@backend/modules/home/activity-calendar';
import { taskLabels } from '@contracts/tasks';
import { planAllowsDevice } from '@contracts/plan-devices';
import type { RunTask } from '@contracts/types';
import {
  boundedExecutionEvidence,
  recordFrameworkResult,
  RunArtifacts,
} from '@backend/modules/execution/execution-evidence';
import type { RpcContract } from '@contracts/rpc-types';
import {
  clearDeviceRecognition,
  parseRecognition,
  recognitionKey,
  recognitionSnapshot,
} from '@backend/modules/recognition/recognition';
import { itemResourceNames } from '@backend/modules/resources/item-resources';
import { Logs } from '@backend/infrastructure/logging/logs';
import { Toolbox, toolJob, toolCatalog } from '@backend/modules/tools/toolbox';
import { Scheduler } from '@backend/modules/schedules/scheduler';
import { CopilotLibrary, copilotWorkspaceIdentity } from '@backend/modules/copilot/copilot';
import { AccountKnowledge } from '@backend/modules/knowledge/account-knowledge';
import { Knowledge } from '@backend/modules/knowledge/knowledge';
import { createRpcDispatcher, type UpdateOperation } from './rpc-dispatch';
import {
  validateCopilotStartParams,
  validateDeviceDeleteParams,
  validateControlSessionStartParams,
  validateControlSessionGetParams,
  validateControlSessionEndParams,
  validateDeviceSwipeParams,
  validateDevicePressKeyParams,
  validateDeviceLongPressParams,
  validateDeviceDragParams,
  validatePrimitiveCatalogParams,
  validateDebugSessionStartParams,
  validateDebugPrimitiveInvokeParams,
  validateDebugSessionEndParams,
  validateFrameworkWorkerCommand,
  validateVisionRecognizeParams,
  validateVisionRecognitionResult,
  validateToolStartParams,
  validateExecutionPreflightParams,
} from '@contracts/validators.js';

const ident = (prefix: string) => prefix + '-' + randomUUID().replaceAll('-', '').slice(0, 12);
// Directory validation can yield while another settings form saves. Apply this
// request's changes to the latest value so unrelated successful saves survive.
function mergeSettingsChanges(before: any, requested: any, current: any): any {
  if (JSON.stringify(before) === JSON.stringify(requested)) return current;
  const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
  if (!object(before) || !object(requested) || !object(current)) return requested;
  const result = { ...current };
  for (const key of new Set([...Object.keys(before), ...Object.keys(requested)])) {
    if (!Object.hasOwn(requested, key)) delete result[key];
    else result[key] = mergeSettingsChanges(before[key], requested[key], current[key]);
  }
  return result;
}
type Worker = DeviceWorker;
type DeviceObservation = {
  workers: Map<string, Worker>;
  close: () => Promise<void>;
};
type AutomaticTarget = {
  key: string;
  address: string;
  name: string;
  revision: string;
};
type AutomaticConnection = {
  target: AutomaticTarget;
  failures: number;
  retryAt: number;
  ready: boolean;
  readyAt: number;
  online: boolean;
  lastOnline: boolean;
  lastError?: string;
  probing?: AbortController;
  controller?: AbortController;
  started?: Promise<any>;
  worker?: Worker;
  deviceId?: string;
};
type FrameworkReader = {
  view: FrameworkView;
  worker: Promise<FrameworkPort>;
  tail: Promise<void>;
  pending: number;
  failed?: boolean;
  idleTimer?: ReturnType<typeof setTimeout>;
  closing?: Promise<void>;
};
export interface RuntimeOptions {
  copilotHttp?: typeof fetch;
  copilotDirectory?: string;
  now?: () => Date;
  importFrom?: string;
  applicationDirectory?: string;
  componentEnvironment?: ComponentPathEnvironment;
  logExportDirectory?: string;
  notify?: (message: any) => void;
  tickSeconds?: number;
  source?: any;
  validator?: any;
  calendar?: ActivityCalendarOptions;
  adbExecutable?: () => string;
  emulatorInventory?: () => Promise<EmulatorInventory>;
  discoverDevices?: typeof autoDiscover;
  observeDeviceConnections?: typeof observeAdbDevices;
  probeDeviceEndpoint?: typeof probeAdbEndpoint;
  connectDeviceTransport?: typeof connectAdbTransport;
  ensureAvdTransport?: typeof ensureAvdTransport;
  detectAvdSerial?: typeof detectAvdSerial;
  frameworkWorkerFactory?: (
    config: FrameworkConfiguration,
    signal?: AbortSignal,
  ) => Promise<FrameworkPort>;
  frameworkResources?: (
    deviceId: string,
    source: string,
    clientType: string,
  ) => Promise<FrameworkView>;
  frameworkReaderIdleMs?: number;
  frameworkUpdates?: FrameworkUpdateOptions;
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
  readonly frameworkUpdates: FrameworkUpdateService;
  readonly appUpdateHttp: AppUpdateHttp;
  readonly preview: Preview;
  readonly controlSessions: ControlSessions;
  readonly debug: DebugService;
  private frameworkConnections = new Map<string, any>();
  private runOperations = new Map<string, Promise<void>>();
  private runControllers = new Map<string, AbortController>();
  private runControls = new Map<string, RpcContract['results']['control.session.start']>();
  private frameworkViews = new Map<string, FrameworkView>();
  private frameworkReaders = new Map<string, FrameworkReader>();
  private frameworkReaderGate: Promise<unknown> = Promise.resolve();
  private frameworkAbort = new AbortController();
  private frameworkOperations = new Set<Promise<unknown>>();
  /** 跨自动化功能累计真实输入尝试；帧有效期与根流程生命周期不充当输入证据。 */
  private frameworkInputRevisions = new Map<string, number>();
  private frameworkPreparing = 0;
  private frameworkRecognizing = 0;
  readonly calendar: ActivityCalendar;
  readonly artifacts: RunArtifacts;
  private readonly dispatchRpc: ReturnType<typeof createRpcDispatcher>;
  readonly workers = new Map<string, Worker>();
  private workerConfigurations = new Map<string, any>();
  private deviceObservation?: DeviceObservation;
  private closingDeviceObservations = new Set<Promise<void>>();
  private nextDeviceObservation = 0;
  private connectionErrors = new WeakMap<Worker, string>();
  private clientSwitches = new Map<string, AbortController>();
  private submissions = new Set<Promise<void>>();
  private artifactCaptures = new Map<string, Promise<void>>();
  private starts = new Map<
    string,
    { source: 'plan' | 'copilot'; identity: string; deviceId: string; promise: Promise<any> }
  >();
  private unavailableRunRequests = new Set<string>();
  private connecting = new Set<string>();
  private connectionOperations = new Set<Promise<any>>();
  private connectionReservations = new Map<Promise<any>, string>();
  private connectingAddresses = new Set<string>();
  private suppressed = new Set<string>();
  private suppressedAddresses = new Set<string>();
  private automaticTargets = new Map<string, AutomaticConnection>();
  private automaticOperations = new Set<Promise<unknown>>();
  private automaticActive = new Set<AutomaticConnection>();
  private adbSnapshot: AdbDevice[] = [];
  private discoveredAutomatic: AdbDevice[] = [];
  private nextEndpointProbe = 0;
  private endpointProbes?: Promise<void>;
  private reconnect: any[] = [];
  private switching = false;
  private switchOwner?: 'components' | 'framework';
  private autoConnecting = false;
  private lastDiagnostics: string[] = [];
  private nextAutoConnect = Date.now() + 2000;
  private emulatorInventory = emptyEmulatorInventory();
  private nextChecks: Record<string, number> = {
    resource: Date.now() + 6000,
    framework: Date.now() + 9000,
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
    const defaults = defaultComponentPaths(
      root,
      options.applicationDirectory,
      options.componentEnvironment,
    );
    const storedSettings = this.store.get('settings', 'main', {});
    // Removed downloader preferences may contain a custom executable path. Ignore
    // them only when migrating persisted settings; new RPC requests remain strict.
    const removedDownloadPreference = Object.hasOwn(storedSettings, 'componentDownload');
    if (removedDownloadPreference) delete storedSettings.componentDownload;
    const settings = parseSettings(storedSettings);
    const componentPaths = { ...defaults, ...settings.componentPaths };
    const previousRoots: string[] = [];
    if (
      options.applicationDirectory &&
      (options.componentEnvironment?.platform ?? process.platform) === 'darwin'
    ) {
      for (const [channel, name] of [
        ['resource', 'MaaResource'],
        ['framework', 'MaaFramework'],
      ] as const) {
        const previous = path.resolve(options.applicationDirectory, name);
        if (componentPaths[channel] && path.resolve(componentPaths[channel]) === previous) {
          previousRoots.push(previous);
          componentPaths[channel] = defaults[channel];
        }
      }
    }
    // Keep existing immutable generations and their maintenance roots in place;
    // only subsequent downloads use the new macOS default directories.
    if (previousRoots.length)
      this.store.put('meta', 'component_roots', [
        ...new Set([...this.store.get('meta', 'component_roots', []), ...previousRoots]),
      ]);
    if (
      !settings.componentPaths?.framework ||
      !Object.hasOwn(storedSettings, 'autoUpdateFramework') ||
      removedDownloadPreference ||
      previousRoots.length
    )
      this.store.put('settings', 'main', {
        ...settings,
        componentPaths,
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
      (operationId, progress, downloadSpeedBytesPerSecond, downloadSource) =>
        options.notify?.({
          jsonrpc: '2.0',
          method: 'runtime.hostEvent',
          params: {
            operationId,
            progress,
            ...(downloadSpeedBytesPerSecond === undefined ? {} : { downloadSpeedBytesPerSecond }),
            ...(downloadSource === undefined ? {} : { downloadSource }),
          },
        }),
      {
        mirrorChyan: () => parseSettings(this.store.get('settings', 'main')).mirrorChyan,
        mirrorChyanStatus: (message) => {
          if (this.running) this.emit('app.update_source', message);
        },
      },
    );
    this.updates = new UpdateService(
      path.join(root, 'components'),
      this.store,
      this.emit.bind(this),
      () => this.busy() || this.switchOwner === 'framework',
      {
        source: options.source,
        // 安装资源只依赖静态快照；启用前通过无 Controller 的官方 Framework 探针复核。
        validator:
          options.validator ??
          (async (_unused, resource) => {
            const framework = await this.frameworkSdkPath();
            for (const clientType of ['Official', 'Bilibili'])
              await prepareFrameworkResources({
                source: resource,
                destination: path.join(this.root, 'cache', 'framework-resources'),
                clientType,
                frameworkVersion: 'v5.14.3',
                validate: (view) =>
                  validateFrameworkResources({
                    framework,
                    resource: view,
                    userDir: path.join(this.root, 'workers', 'maafw-probe'),
                    mode: 'recognition',
                  }),
              });
          }),
        directories: defaults,
        generationNamespace:
          options.applicationDirectory &&
          (options.componentEnvironment?.platform ?? process.platform) === 'darwin'
            ? `data-${createHash('sha256').update(realpathSync(root)).digest('hex').slice(0, 32)}`
            : undefined,
        beforeActivate: () => this.beforeSwitch(),
        afterActivate: () => this.afterSwitch(),
        finishActivate: (error?: string) => this.finishSwitch(error),
        protectedPaths: () => [
          ...(this.controlSessions?.protectedPaths() ?? []),
          ...[...this.frameworkReaders.values()].flatMap(({ view }) => [
            view.path,
            ...view.sourcePaths,
          ]),
          ...[...this.workerConfigurations.values(), ...this.frameworkConnections.values()].flatMap(
            (config) => [config.resource],
          ),
        ],
      },
    );
    this.frameworkUpdates = new FrameworkUpdateService(
      root,
      this.store,
      this.emit.bind(this),
      () => this.busy() || this.switching,
      {
        ...options.frameworkUpdates,
        directory: () =>
          parseSettings(this.store.get('settings', 'main')).componentPaths?.framework ||
          defaults.framework!,
        mirror: () => parseSettings(this.store.get('settings', 'main')).mirrorChyan,
        proxy: () => parseSettings(this.store.get('settings', 'main')).downloadProxy,
        beforeActivate: async () => {
          if (this.switchOwner || this.busy()) throw new Error('组件或异步操作仍在运行');
          this.switching = true;
          this.switchOwner = 'framework';
          this.preview.invalidate();
          this.reconnect = this.store
            .all('device')
            .filter((device) => this.workers.get(device.id)?.connected);
          await this.closeFrameworkReaders();
          await Promise.all([...this.workers.values()].map((worker) => worker.close()));
          this.workers.clear();
          this.workerConfigurations.clear();
          this.frameworkConnections.clear();
          this.frameworkViews.clear();
        },
        finishActivate: async () => {
          if (this.switchOwner !== 'framework') return;
          this.switchOwner = undefined;
          this.switching = false;
          await this.afterSwitch();
          this.reconnect = [];
        },
      },
    );
    this.copilot = new CopilotLibrary(root, this.store, {
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
    this.controlSessions = new ControlSessions({
      worker: (id) => this.workers.get(id),
      assertStart: (id, requestId, internal) => {
        const worker = this.workers.get(id);
        if (!this.store.get('device', id)) throw new RpcError(-32004, '设备不存在');
        if (
          !this.running ||
          this.switching ||
          this.appUpdating ||
          this.appUpdatePreparing ||
          this.initializingComponents
        )
          throw new RpcError(-32011, '运行时正在退出、准备组件或更新');
        if (!worker?.connected || !worker.safeIdle || this.preview?.isReading(id))
          throw new RpcError(-32011, '设备尚未连接或异步操作未结束');
        if (!internal) {
          const status = this.availability(id, undefined, requestId);
          if (status.owner !== 'none') throw new RpcError(-32011, status.reason);
        }
      },
      prepare: (id, signal) => this.prepareFrameworkView(id, signal),
      invalidate: (id) => this.preview?.invalidate(id),
      changed: (id) =>
        this.emit('device.control_session', '设备控制会话状态已更新', {
          deviceId: id,
          engine: 'maafw',
        }),
    });
    this.preview = new Preview({
      available: () => this.running && !this.switching,
      device: (id) => {
        if (this.controlSessions.get(id).owner === 'switching')
          throw new RpcError(-32011, '正在交接设备控制权，请等待会话建立或释放');
        return this.store.get('device', id);
      },
      worker: (id) => this.controlSessions.worker(id) ?? this.workers.get(id),
      context: (id) => ({
        engine: 'maafw',
        sessionId: this.controlSessions.get(id).sessionId,
        resourceGeneration: this.controlSessions.view(id)?.generation,
      }),
      authorize: (id, token) => this.controlSessions.authorize(id, token),
      canOperate: (id) => this.controlSessions.owns(id),
      hasRun: (id) =>
        !this.controlSessions.owns(id) &&
        (this.hasExecution(id) ||
          !!this.scheduler?.owner(id) ||
          [...this.starts.values()].some((start) => start.deviceId === id)),
      clicked: (data) => {
        const { controlToken: _token, ...publicData } = data;
        this.emit('device.clicked', '点击指令已获 MaaFramework 确认', publicData);
      },
    });
    // Debug 持有自己的不透明会话；Runtime 将其接到正式控制会话及 automation 能力库。
    this.debug = new DebugService({
      catalog: async (deviceId) => {
        // 目录读取只解析资源元数据；禁止执行的端口使浏览能力不触发设备动作。
        const resourceProfiles = await this.atomicProfiles(deviceId);
        const port: AtomicExecutionPort = {
          execute: async () => {
            throw new RpcError(-32011, '请先建立调试会话');
          },
          runPipeline: async () => {
            throw new RpcError(-32011, '请先建立调试会话');
          },
        };
        return createAtomicCapabilityRegistry(port, resourceProfiles).list();
      },
      start: (deviceId, requestId) => this.controlSessions.start({ deviceId, requestId }),
      end: (control) =>
        this.controlSessions.get(control.deviceId).sessionId !== control.sessionId
          ? Promise.resolve({ ended: true })
          : this.controlSessions.end({
              deviceId: control.deviceId,
              controlToken: control.controlToken,
              requestId: randomUUID(),
            }),
      registry: (control, signal) => this.automationRegistry(control, signal),
    });
    this.toolbox = new Toolbox({
      store: this.store,
      availability: (id) => this.availability(id),
      emit: this.emit.bind(this),
      preflight: async (input, config) => {
        const result = await this.executionPreflight({
          source: 'tool',
          kind: input.kind,
          deviceId: input.deviceId,
          clientType: input.clientType,
          config,
        });
        if (!result.supported)
          throw new RpcError(
            -32010,
            result.issues.map((issue) => issue.message).join('；'),
            result,
          );
      },
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
        preflight: async (plan, deviceId, force) => {
          await this.requirePreflight(parsePlan(plan).tasks, deviceId, force);
        },
        prepareDevice: (id) => this.prepareScheduledDevice(id),
        start: (plan, deviceId, requestId, occurrence) =>
          this.startRun({ planId: plan.id, deviceId, requestId }, plan, occurrence),
      },
      this.options.now,
    );
    this.logs.automatic(settings.logRetentionDays ?? 7);
    this.dispatchRpc = createRpcDispatcher({
      snapshot: () => this.snapshot(),
      hostUpdates: this.appUpdateHttp,
      knowledge: this.knowledge,
      accounts: this.accounts,
      copilot: this.copilot,
      devices: {
        exists: (id) => !!this.store.get('device', id),
        client: (id) => this.deviceClient(id),
        availability: (id) => this.availability(id),
        discover: () => this.discoverDevices(),
        connect: (params) => this.connectDevice(params),
        autoConnect: () => this.autoConnectDevices(),
        disconnect: (id) => this.disconnectDevice(id),
        delete: (params) => this.deleteDevices(params),
        preview: this.preview,
      },
      tools: {
        service: this.toolbox,
        exists: (id) => !!this.store.get('tool_job', id),
        get: (id) => toolJob(this.store.get('tool_job', id)),
        catalog: (client) => toolCatalog(this.store.get('active', 'combo', {}), client),
      },
      schedules: {
        service: this.scheduler,
        host: (wake) => this.store.put('scheduler_host', 'wake', wake),
      },
      logs: {
        service: this.logs,
        retentionDays: () =>
          parseSettings(this.store.get('settings', 'main')).logRetentionDays ?? 7,
        deleteEvents: (ids) => this.store.deleteEvents(ids),
      },
      resources: {
        combo: () => this.store.get('active', 'combo', {}),
        recognition: (params) => this.readRecognition(params),
        stages: (client, refresh) => this.stages(client, refresh),
        home: (params) => this.readHomeInfo(params),
      },
      plans: {
        save: (input) => this.savePlan(input),
        delete: (id) => this.deletePlan(id),
      },
      runs: {
        start: (params) => this.startRun(params),
        startCopilot: (params) => this.startCopilot(params),
        stop: (id) => this.stopRun(id),
        get: (id) => this.execution(id),
        artifact: (params) => this.readRunArtifact(params),
      },
      saveSettings: (input) => this.saveSettings(input),
      propose: (message) => {
        const result = propose(message, (plan) => this.validatePolicy(plan));
        this.emit('agent.plan_proposed', '本地演示已生成待确认计划，尚未执行');
        return result;
      },
      update: (operation, channel) => this.updateChannel(operation, channel),
    });
  }
  /** Debug 与正式业务使用同一能力目录和授权端口，避免形成第二套自动化执行路径。 */
  private async automationRegistry(
    control: RpcContract['results']['control.session.start'],
    signal: AbortSignal,
    clientType?: string,
  ) {
    const resourceProfiles = await this.atomicProfiles(control.deviceId, clientType);
    signal.throwIfAborted();
    // 只有真实输入推进代际才失效旧帧；纯 Custom/Context 调用保持同帧证据可传递。
    let inputEpoch = 0;
    const synchronizeInputEpoch = (epoch: number) => {
      if (epoch > inputEpoch) {
        // 原生标准节点可绕过 TS 动作端口；只累计新增输入，重复通知与纯 Context 不增。
        this.advanceFrameworkInputRevision(control.deviceId, epoch - inputEpoch);
        inputEpoch = epoch;
        this.preview.invalidate(control.deviceId);
      }
    };
    const submitPipeline =
      (nested: boolean): AtomicExecutionPort['runPipeline'] =>
      async (entry, pipeline, custom, context) => {
        // TS 指定的更短期限也覆盖原生等待；子调用同时继承父任务的取消与剩余时限。
        const signals = [signal, ...(context.signal ? [context.signal] : [])];
        if (context.deadline !== undefined) {
          const remaining = Math.ceil(context.deadline - Date.now());
          if (remaining <= 0) throw new AtomicFailure('根流程期限已耗尽', 'unknown');
          signals.push(AbortSignal.timeout(Math.min(remaining, 120_000)));
        }
        const combined = AbortSignal.any(signals);
        combined.throwIfAborted();
        if (!this.controlSessions.authorize(control.deviceId, control.controlToken))
          throw new RpcError(-32011, '调试控制会话已失效');
        const worker = this.controlSessions.worker(control.deviceId);
        const submit = nested
          ? worker?.runContextPipeline?.bind(worker)
          : worker?.runPipeline?.bind(worker);
        if (!submit)
          throw new RpcError(-32040, '当前 MaaFramework worker 不支持请求的 Pipeline 上下文');
        if (!nested) this.preview.invalidate(control.deviceId);
        const operation = submit(
          entry,
          pipeline,
          async (node, params, metadata) => {
            combined.throwIfAborted();
            if (!this.controlSessions.authorize(control.deviceId, control.controlToken))
              throw new RpcError(-32011, 'Pipeline 控制会话已失效');
            if (metadata) synchronizeInputEpoch(metadata.inputEpoch);
            await custom(node, params);
            combined.throwIfAborted();
          },
          combined,
          synchronizeInputEpoch,
        );
        this.frameworkOperations.add(operation);
        try {
          await operation;
        } finally {
          this.frameworkOperations.delete(operation);
          if (!nested) this.preview.invalidate(control.deviceId);
        }
      };
    // 端口在服务端绑定设备与控制令牌，所有输入继续经过正式帧校验和 RPC 执行路径。
    return createAtomicCapabilityRegistry(
      {
        runPipeline: submitPipeline(false),
        runContextPipeline: submitPipeline(true),
        getInputRevision: () => this.frameworkInputRevision(control.deviceId),
        execute: async (operation, input, context) => {
          try {
            signal.throwIfAborted();
            context.signal?.throwIfAborted();
            if (!this.controlSessions.authorize(control.deviceId, control.controlToken))
              throw new RpcError(-32011, '调试控制会话已失效');
            if (operation === 'recognize')
              return await this.recognizeAtomicFrame(control.deviceId, input, signal);
            const params = {
              ...input,
              deviceId: control.deviceId,
              controlToken: control.controlToken,
              requestId: randomUUID(),
            };
            if (operation === 'frame')
              return await this.preview.frame({
                deviceId: control.deviceId,
                controlToken: control.controlToken,
              });
            if (operation === 'start_app' || operation === 'stop_app') {
              // 固定包名由登记的 L3 校验；异步原生操作仍在同一设备会话内，不暴露通用 shell。
              const worker = this.controlSessions.worker(control.deviceId);
              if (!worker) throw new RpcError(-32011, '设备控制会话已失效');
              this.advanceFrameworkInputRevision(control.deviceId);
              this.preview.invalidate(control.deviceId);
              return await worker.request(operation, input);
            }
            return await this.handle(`device.${operation}`, params);
          } catch (error) {
            // 将明确的参数拒绝转成领域失败，避免能力库依赖 JSON-RPC 错误类型。
            if (error instanceof RpcError && error.code === -32602)
              throw new AtomicFailure(error.message);
            throw error;
          }
        },
      },
      resourceProfiles,
    );
  }
  /** 从设备当前使用的不可变资源构建能力规则；目录和文件防护留在宿主读取适配器。 */
  private async atomicProfiles(
    deviceId?: string,
    selectedClient?: string,
  ): Promise<AutomationOptions> {
    if (deviceId && !this.store.get('device', deviceId)) throw new RpcError(-32004, '设备不存在');
    const source =
      (deviceId &&
        (this.frameworkConnections.get(deviceId)?.resource ??
          this.workerConfigurations.get(deviceId)?.resource)) ||
      this.store.get('active', 'combo', {}).resource?.path;
    const client =
      selectedClient ??
      (deviceId
        ? this.deviceClient(deviceId)
        : (parseSettings(this.store.get('settings', 'main')).connection?.clientType ?? 'Official'));
    const view = deviceId ? this.controlSessions.view(deviceId) : undefined;
    if (!source) return loadAutomationResourceProfiles(null, client);
    return loadAutomationResourceProfiles(await openAtomicResourceSource(source), client, {
      resourceVersion: `${this.store.get('active', 'combo', {}).resource?.version ?? 'unknown'}:${view?.generation ?? path.basename(source)}`,
      ...(view ? { availableTemplates: Object.keys(view.templates) } : {}),
    });
  }
  private recognizeAtomicFrame(
    deviceId: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const { expected: _expected, ...options } = input;
    const operation = this.recognizeFrameInner({ ...options, deviceId }, true);
    this.frameworkOperations.add(operation);
    void operation.finally(() => this.frameworkOperations.delete(operation)).catch(() => {});
    // Stop this caller immediately. The shared, controller-free reader remains
    // protected until its bounded call settles, without cancelling another session.
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason ?? new Error('识别已取消'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
  private async frameworkSdkPath() {
    if (this.options.frameworkWorkerFactory) return 'synthetic-framework';
    return (await this.frameworkUpdates.resolveInstalledSdk()).path;
  }
  private async frameworkConfiguration(
    id: string,
    view: FrameworkView,
    mode: 'recognition' | 'control',
    signal?: AbortSignal,
  ): Promise<FrameworkConfiguration> {
    const config: FrameworkConfiguration = {
      framework: await this.frameworkSdkPath(),
      resource: view.path,
      userDir: path.join(this.root, 'workers', `maafw-${id}`),
      mode,
    };
    if (mode === 'recognition') return config;
    const device = this.store.get('device', id),
      saved = this.frameworkConnections.get(id);
    if (!device) throw new RpcError(-32004, '设备不存在');
    const settings = parseSettings(this.store.get('settings', 'main'));
    const profile =
      settings.deviceProfiles?.find((item) => item.id === device.connectionProfileId) ??
      findDeviceProfile(settings, device.address);
    const framework = profile ? profile.connection.framework : settings.connection?.framework;
    const address = saved?.address ?? device.address;
    this.emulatorInventory = await this.readEmulatorInventory();
    const resolved = await frameworkConnection(framework, address, this.emulatorInventory);
    const adb = saved?.adb ?? (await this.adbExecutable(profile ?? settings));
    const probe =
      this.options.detectAvdSerial ??
      (this.options.frameworkWorkerFactory ||
      this.options.frameworkWorkerFactory ||
      this.options.adbExecutable
        ? undefined
        : detectAvdSerial);
    const avdSerial =
      (resolved.capture?.method === 'auto' || resolved.capture?.method === 'avd') &&
      !address.startsWith('emulator-')
        ? await probe?.(adb, address, signal)
        : undefined;
    if (
      resolved.capture?.method === 'avd' &&
      !address.startsWith('emulator-') &&
      !avdSerial &&
      probe
    )
      throw new RpcError(-32040, '无法确认本机 AVD 的 console 身份，请核对连接地址或改用自动截图');
    return {
      ...config,
      adb,
      address,
      lockPath:
        saved?.lockPath ??
        deviceLockPath(adbServerIdentity() + '|' + this.lockAddress(device.address)),
      ...resolved,
      ...(avdSerial ? { avdSerial } : {}),
    };
  }
  private frameworkInputRevision(deviceId: string): number {
    return this.frameworkInputRevisions.get(deviceId) ?? 0;
  }
  /** 在实际派发前登记尝试；即使原生回执丢失，也不能让旧准备凭据继续授权确认。 */
  private advanceFrameworkInputRevision(deviceId: string, increment = 1) {
    const revision = this.frameworkInputRevision(deviceId) + increment;
    if (!Number.isSafeInteger(revision) || revision < 0)
      throw new RpcError(-32011, '设备输入修订号超出安全范围，请重启应用后重新准备');
    this.frameworkInputRevisions.set(deviceId, revision);
  }
  /** 为控制会话提供稳定接口；只有通过 Preview 门禁后的派发才记录输入，帧仍绑定此接口。 */
  private trackFrameworkInputs(deviceId: string, worker: FrameworkPort): FrameworkPort {
    return {
      get connected() {
        return worker.connected;
      },
      get safeIdle() {
        return worker.safeIdle;
      },
      connect: () => worker.connect(),
      frame: () => worker.frame(),
      click: (x, y) => {
        this.advanceFrameworkInputRevision(deviceId);
        return worker.click(x, y);
      },
      request: (operation, params) => {
        if (['click', 'swipe', 'press_key', 'long_press', 'drag'].includes(operation))
          this.advanceFrameworkInputRevision(deviceId);
        return worker.request(operation, params);
      },
      runPipeline: worker.runPipeline?.bind(worker),
      runContextPipeline: worker.runContextPipeline?.bind(worker),
      close: () => worker.close(),
    };
  }
  /** 控制 worker ready 后已持有设备租约；先登记明确 AVD 串号，再让会话连接设备。 */
  private async launchFrameworkControl(
    deviceId: string,
    view: FrameworkView,
    signal: AbortSignal,
  ): Promise<FrameworkPort> {
    const config = await this.frameworkConfiguration(deviceId, view, 'control', signal);
    const worker = await this.startFrameworkWorker(config, signal);
    try {
      signal.throwIfAborted();
      // 高端口 AVD 可能只在管理器的独立 server 登记；复用当前 server 的官方登记协议，
      // 不启动／切换 server，也不把未经身份核对的 TCP 地址推断成模拟器 console。
      const avdSerial = /^emulator-\d{1,5}$/.test(config.address ?? '')
        ? config.address
        : config.avdSerial;
      const prepare =
        this.options.ensureAvdTransport ??
        (this.options.frameworkWorkerFactory ||
        this.options.frameworkWorkerFactory ||
        this.options.adbExecutable
          ? undefined
          : ensureAvdTransport);
      if (avdSerial) await prepare?.(avdSerial, signal);
      signal.throwIfAborted();
      return this.trackFrameworkInputs(deviceId, worker);
    } catch (error) {
      // launch 返回前会话尚未保存 worker；登记失败或取消必须在本阶段关闭它并释放租约。
      await worker.close();
      throw error;
    }
  }
  private startFrameworkWorker(
    config: FrameworkConfiguration,
    signal?: AbortSignal,
  ): Promise<FrameworkPort> {
    if (!this.running)
      return Promise.reject(new RpcError(-32011, '运行时已退出或正在切换，不能启动 MaaFramework'));
    signal?.throwIfAborted();
    this.protectedWorkerLogs.add(path.basename(config.userDir));
    return (
      this.options.frameworkWorkerFactory?.(config, signal) ?? FrameworkWorker.start(config, signal)
    );
  }
  private async prepareFrameworkView(
    id: string,
    signal = this.frameworkAbort.signal,
  ): Promise<FrameworkView> {
    signal.throwIfAborted();
    const existing = this.controlSessions.view(id);
    if (existing) return existing;
    const source =
      this.frameworkConnections.get(id)?.resource ??
      this.workerConfigurations.get(id)?.resource ??
      this.store.get('active', 'combo', {}).resource?.path;
    if (!source) throw new RpcError(-32040, '请先安装并启用游戏资源');
    const client =
      this.frameworkConnections.get(id)?.connection?.clientType ?? this.deviceClient(id);
    const key = JSON.stringify([source, client]),
      cached = this.frameworkViews.get(key);
    if (cached) return cached;
    this.frameworkPreparing++;
    try {
      if (this.options.frameworkResources) {
        const view = await this.options.frameworkResources(id, source, client);
        signal.throwIfAborted();
        this.frameworkViews.set(key, view);
        return view;
      }
      const framework = await this.frameworkSdkPath();
      const view = await prepareFrameworkResources({
        source,
        destination: path.join(this.root, 'cache', 'framework-resources'),
        clientType: client,
        frameworkVersion: 'v5.14.3',
        signal,
        validate: (resource: string) =>
          validateFrameworkResources(
            {
              framework,
              resource,
              userDir: path.join(this.root, 'workers', 'maafw-probe'),
              mode: 'recognition',
            },
            signal,
          ),
      });
      signal.throwIfAborted();
      this.frameworkViews.set(key, view);
      return view;
    } finally {
      this.frameworkPreparing--;
    }
  }
  withFrameworkSession<T>(
    deviceId: string,
    workflow: (session: RpcContract['results']['control.session.start']) => Promise<T>,
    signal?: AbortSignal,
  ) {
    return this.controlSessions.withSession(deviceId, workflow, signal);
  }
  private serializeFrameworkReaders<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.frameworkReaderGate.then(operation);
    this.frameworkReaderGate = pending.catch(() => {});
    return pending;
  }
  private retireFrameworkReader(reader: FrameworkReader): Promise<void> {
    clearTimeout(reader.idleTimer);
    return (reader.closing ??= (async () => {
      await (await reader.worker.catch(() => undefined))?.close();
      if (this.frameworkReaders.get(reader.view.generation) === reader)
        this.frameworkReaders.delete(reader.view.generation);
    })());
  }
  private acquireFrameworkReader(deviceId: string, view: FrameworkView) {
    return this.serializeFrameworkReaders(async () => {
      if (!this.running || this.switching) throw new RpcError(-32011, '识别已取消');
      let reader = this.frameworkReaders.get(view.generation);
      if (reader?.failed || reader?.closing) {
        await this.retireFrameworkReader(reader);
        reader = undefined;
      }
      if (!reader) {
        // Keep one model set resident. A busy version is never evicted or
        // duplicated; an idle version must exit before loading the next one.
        for (const existing of this.frameworkReaders.values()) {
          if (existing.pending)
            throw new RpcError(-32011, '识别进程正在处理另一资源版本，请稍后重新识别');
          await this.retireFrameworkReader(existing);
        }
        if (!this.running || this.switching) throw new RpcError(-32011, '识别已取消');
        const worker = this.frameworkConfiguration(deviceId, view, 'recognition').then((config) =>
          this.startFrameworkWorker({
            ...config,
            userDir: path.join(
              this.root,
              'workers',
              'maafw-recognition-' + view.generation.slice(0, 16),
            ),
          }),
        );
        reader = { view, worker, tail: Promise.resolve(), pending: 0 };
        // Startup rejection is consumed by the queued operation below.
        void worker.catch(() => {});
        this.frameworkReaders.set(view.generation, reader);
      }
      if (reader.pending >= 8) throw new RpcError(-32011, '识别请求队列已满，请稍后重试');
      clearTimeout(reader.idleTimer);
      reader.pending++;
      return reader;
    });
  }
  private releaseFrameworkReader(reader: FrameworkReader) {
    reader.pending--;
    if (reader.pending || reader.failed || reader.closing) return;
    reader.idleTimer = setTimeout(() => {
      void this.serializeFrameworkReaders(async () => {
        if (!reader.pending && this.frameworkReaders.get(reader.view.generation) === reader)
          await this.retireFrameworkReader(reader);
      }).catch(() => {});
    }, this.options.frameworkReaderIdleMs ?? 30_000);
    reader.idleTimer.unref();
  }
  private recognizeFrame(params: unknown): Promise<RpcContract['results']['vision.recognize']> {
    const operation = this.recognizeFrameInner(params);
    this.frameworkOperations.add(operation);
    void operation.finally(() => this.frameworkOperations.delete(operation)).catch(() => {});
    return operation;
  }
  private async recognizeFrameInner(
    params: unknown,
    atomic = false,
  ): Promise<RpcContract['results']['vision.recognize']> {
    if (!atomic && !validateVisionRecognizeParams(params))
      throw new RpcError(-32602, '识别请求参数无效');
    const request = params as RpcContract['params']['vision.recognize'] & Record<string, any>;
    return this.recognizePreparedFrame(request, atomic);
  }
  private async recognizePreparedFrame(
    params: RpcContract['params']['vision.recognize'] & Record<string, any>,
    atomic: boolean,
  ): Promise<RpcContract['results']['vision.recognize']> {
    const image = this.preview.reference(params.deviceId, params.frameId, atomic ? 120_000 : 2000);
    if (
      params.roi &&
      (params.roi[0] + params.roi[2] > (params.referenceSize?.[0] ?? image.width) ||
        params.roi[1] + params.roi[3] > (params.referenceSize?.[1] ?? image.height))
    )
      throw new RpcError(-32602, '识别区域超出画面');
    this.frameworkRecognizing++;
    try {
      const view = await this.prepareFrameworkView(params.deviceId);
      if (!this.running || this.switching) throw new RpcError(-32011, '识别已因退出或切换而取消');
      if (params.kind === 'ocr' && !view.ocrAvailable)
        throw new RpcError(-32040, '当前客户端资源的 OCR 模型未通过离线兼容性探针');
      const template = params.templateId ? view.templates[params.templateId] : undefined;
      if (params.kind === 'template' && !template)
        throw new RpcError(-32602, '模板未在宿主资源目录中登记');
      if (template && !template.startsWith('image/'))
        throw new RpcError(-32040, '宿主模板资源布局无效');
      const reader = await this.acquireFrameworkReader(params.deviceId, view);
      const operation = reader.tail
        .then(async () => {
          if (!this.running || this.switching || reader.failed)
            throw new RpcError(-32011, '识别已取消');
          const worker = await reader.worker;
          if (!this.running || this.switching) throw new RpcError(-32011, '识别已取消');
          const nativeParams = {
            kind: params.kind,
            image: { data: image.data, width: image.width, height: image.height },
            ...(params.roi ? { roi: params.roi } : {}),
            ...(template ? { template: template.slice('image/'.length) } : {}),
            ...(atomic
              ? Object.fromEntries(
                  [
                    'referenceSize',
                    'threshold',
                    'maskRange',
                    'method',
                    'replace',
                    'onlyRec',
                    'lower',
                    'upper',
                    'count',
                    'connected',
                    'greenMask',
                    'pureColor',
                    'colorScales',
                    'colorWithClose',
                    'nmsDistance',
                  ]
                    .filter((key) => params[key] !== undefined)
                    .map((key) => [key, params[key]]),
                )
              : {}),
          };
          if (
            !validateFrameworkWorkerCommand({
              protocolVersion: 1,
              id: 'recognize',
              operation: 'recognize',
              ...nativeParams,
            })
          )
            throw new RpcError(-32602, '识别规则包含不支持的参数');
          return worker.request('recognize', nativeParams);
        })
        .catch(async (error) => {
          reader.failed = true;
          await this.serializeFrameworkReaders(() => this.retireFrameworkReader(reader));
          throw error;
        })
        .finally(() => this.releaseFrameworkReader(reader));
      reader.tail = operation.then(
        () => {},
        () => {},
      );
      const native = await operation;
      if (!this.running || this.switching) throw new RpcError(-32011, '识别已取消');
      const result = {
        ...native,
        frameId: image.frameId,
        engine: 'maafw' as const,
        resourceGeneration: view.generation,
        fresh:
          image.fresh === true &&
          this.preview.isCurrent(image) &&
          Date.now() - Date.parse(image.capturedAt) <= 2000,
      };
      if (!validateVisionRecognitionResult(result))
        throw new RpcError(-32040, 'MaaFramework 返回了无效识别结果');
      return result;
    } finally {
      this.frameworkRecognizing--;
    }
  }
  private async closeFrameworkReaders() {
    await this.serializeFrameworkReaders(async () => {
      await Promise.all(
        [...this.frameworkReaders.values()].map((reader) => this.retireFrameworkReader(reader)),
      );
    });
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
    ignoreRequestId?: string,
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
    if (this.switching || this.componentChannels().some((item) => item.status === 'waiting_idle'))
      return result('updates', '正在准备切换运行组件');
    const owner = this.executions().find(
      (item) => item.deviceId === deviceId && item.status === 'running',
    );
    if (owner)
      return result(
        owner.toolKind ? 'tool' : 'run',
        '设备正在执行' + owner.planName + '，请等待整个操作结束',
        owner.id,
      );
    if (this.controlSessions?.owns(deviceId))
      return result(
        'manual',
        'MaaFramework 控制会话占用设备（包括空闲期间）',
        this.controlSessions.get(deviceId).sessionId ?? null,
      );
    const pending = [...this.starts].find(
      ([requestId, item]) => requestId !== ignoreRequestId && item.deviceId === deviceId,
    )?.[1];
    if (pending)
      return result(
        'run',
        pending.source === 'copilot' ? '设备正在启动作业' : '设备正在启动任务表',
      );
    const occurrence = this.scheduler?.owner(deviceId);
    if (occurrence && occurrence.id !== ignoreOccurrence)
      return result('run', '设备正在准备定时执行', occurrence.id);
    if (
      this.connecting.has(deviceId) ||
      this.clientSwitches.has(deviceId) ||
      [...this.connectionReservations.values()].some(
        (address) => this.lockAddress(address) === this.lockAddress(device.address),
      )
    )
      return result('connecting', '设备正在连接或切换客户端');
    if (this.preview?.isClicking(deviceId)) return result('manual', '人工控制指令尚未结束');
    if (worker && !worker.safeIdle) return result('manual', 'MaaFramework 或异步操作尚未结束');
    return result(
      'none',
      connected && device.state === 'idle'
        ? '设备空闲，可以使用工具'
        : '设备尚未连接，请先在设备页连接',
    );
  }
  private async prepareScheduledDevice(id: string) {
    if (this.controlSessions.owns(id))
      throw new RpcError(-32011, 'MaaFramework 控制会话占用设备，定时任务不能抢占');
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
    if (!this.running || this.workers.get(id) !== worker || !worker.connected)
      throw new RpcError(-32011, '定时设备连接状态已改变');
    if (this.hasExecution(id) || !worker.safeIdle)
      throw new RpcError(-32011, '设备仍有未结束的执行');
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
      components: this.componentChannels(),
      generations: Object.fromEntries(
        ['resource'].map((key) => [
          key,
          combo[key] ? { version: combo[key].version, path: combo[key].path } : null,
        ]),
      ),
      settings: {
        autoConnect: settings.autoConnect,
        autoUpdateResource: settings.autoUpdateResource,
        autoUpdateFramework: settings.autoUpdateFramework,
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
        ([deviceId, { resource, adb, address, capture, connection }]) => ({
          deviceId,
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
      !!this.controlSessions?.busy ||
      this.frameworkPreparing > 0 ||
      this.frameworkRecognizing > 0 ||
      this.automaticActive.size > 0 ||
      !!this.preview?.busy ||
      this.connectionOperations.size > 0 ||
      this.connecting.size > 0 ||
      // 准入仍在读整表资源时也保护当前代际，避免预检旧代、连接新代后才发现末项不兼容。
      this.starts.size > 0 ||
      this.executions().some(
        (run) =>
          run.status === 'running' && !this.store.get('execution', run.id, {}).boundaryWaiting,
      ) ||
      [...this.workers.values()].some((worker) => !worker.safeIdle)
    );
  }
  private componentChannels() {
    return [
      ...this.updates.channels(),
      ...(this.frameworkUpdates ? [this.frameworkUpdates.channel()] : []),
    ];
  }
  async activatePendingUpdates(available: () => boolean = () => true) {
    await this.updates.activatePending(available);
    if (available()) await this.frameworkUpdates.applyIdle();
  }
  private assertAppUpdateIdle() {
    const reasons: string[] = [];
    if (this.controlSessions.busy || this.frameworkPreparing || this.frameworkRecognizing)
      reasons.push('MaaFramework 会话或识别尚未结束');
    if (this.executions().some((run) => run.status === 'running'))
      reasons.push('任务或工具仍在执行');
    if (this.preview.busy) reasons.push('人工点击尚未结束');
    if (
      this.connecting.size ||
      this.connectionOperations.size ||
      this.connectingAddresses.size ||
      this.autoConnecting ||
      this.automaticActive.size
    )
      reasons.push('设备连接或自动发现尚未结束');
    if (this.switching) reasons.push('MaaFramework 与资源正在切换');
    if (this.starts.size) reasons.push('任务正在启动');
    if (this.clientSwitches.size) reasons.push('正在切换客户端');
    if (this.artifactCaptures.size) reasons.push('正在保存执行反馈画面');
    if ([...this.workers.values()].some((worker) => !worker.safeIdle))
      reasons.push('MaaFramework 或异步操作尚未结束');
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
      await this.frameworkUpdates.drain();
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
        ...Object.fromEntries(Object.entries(device).filter(([key]) => key !== 'coreVersion')),
        frameworkVersion: device.frameworkVersion ?? null,
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
      updates: this.componentChannels(),
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
        'control.session.start',
        'debug.session.start',
        'debug.primitive.invoke',
        'vision.recognize',
      ].includes(method) ||
        (method.startsWith('updates.') && params.channel !== 'app'))
    )
      throw new RpcError(-32021, '正在后台准备随附组件，请稍后再连接或执行');
    if (
      (this.appUpdating || this.appUpdatePreparing) &&
      method !== 'app.snapshot' &&
      method !== 'debug.session.end' &&
      method !== 'control.session.end' &&
      !(method === 'updates.rollback' && params.channel === 'app')
    )
      throw new RpcError(-32011, '应用正在准备安装更新，请稍后重试');
    switch (method) {
      case 'execution.preflight':
        return this.executionPreflight(params);
      case 'primitive.catalog.get':
        if (!validatePrimitiveCatalogParams(params)) throw new RpcError(-32602, '能力目录参数无效');
        return this.debug.catalog(params.deviceId);
      case 'debug.session.start':
        if (!validateDebugSessionStartParams(params))
          throw new RpcError(-32602, '调试会话参数无效');
        return this.debug.start(params);
      case 'debug.primitive.invoke':
        if (!validateDebugPrimitiveInvokeParams(params))
          throw new RpcError(-32602, '调试调用参数无效');
        return this.debug.invoke(params);
      case 'debug.session.end':
        if (!validateDebugSessionEndParams(params)) throw new RpcError(-32602, '调试结束参数无效');
        return this.debug.end(params);
      case 'control.session.start':
        if (!validateControlSessionStartParams(params))
          throw new RpcError(-32602, '控制会话请求无效');
        return this.controlSessions.start(params);
      case 'control.session.get':
        if (!validateControlSessionGetParams(params))
          throw new RpcError(-32602, '控制会话查询无效');
        if (!this.store.get('device', params.deviceId)) throw new RpcError(-32004, '设备不存在');
        return this.controlSessions.get(params.deviceId);
      case 'control.session.end':
        if (!validateControlSessionEndParams(params))
          throw new RpcError(-32602, '控制会话结束请求无效');
        return this.controlSessions.end(params);
      case 'vision.recognize':
        return this.recognizeFrame(params);
      case 'device.swipe':
      case 'device.long_press':
      case 'device.drag':
      case 'device.press_key': {
        if (
          !(method === 'device.swipe'
            ? validateDeviceSwipeParams(params)
            : method === 'device.long_press'
              ? validateDeviceLongPressParams(params)
              : method === 'device.drag'
                ? validateDeviceDragParams(params)
                : validateDevicePressKeyParams(params))
        )
          throw new RpcError(-32602, '控制操作参数无效');
        if (
          !this.controlSessions.owns(params.deviceId) ||
          !this.controlSessions.authorize(params.deviceId, params.controlToken)
        )
          throw new RpcError(-32011, '操作需要有效 MaaFramework 控制会话');
        const {
          deviceId,
          controlToken: _token,
          frameId: _frameId,
          requestId: _requestId,
          ...action
        } = params;
        const worker = this.controlSessions.worker(deviceId)!;
        return this.preview.action(
          params,
          [method, action],
          method === 'device.swipe' || method === 'device.drag'
            ? [
                [params.x1, params.y1],
                [params.x2, params.y2],
              ]
            : method === 'device.long_press'
              ? [[params.x, params.y]]
              : [],
          () => worker.request(method.slice('device.'.length), action),
        );
      }
    }
    return this.dispatchRpc(method, params);
  }
  private async readRecognition(params: RpcContract['params']['recognition.get']) {
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
    const estimated = this.store.get('inventory', recognitionKey(device.id, clientType, 'depot'));
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
          Buffer.byteLength(JSON.stringify(name)) - Buffer.byteLength(JSON.stringify(item.name));
        if (size + increase > 3 * 1024 * 1024) return item;
        size += increase;
        return { ...item, name };
      }),
    };
  }
  private async readHomeInfo(params: RpcContract['params']['home.info']) {
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
  private async discoverDevices() {
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
  }
  private savePlan(input: any) {
    const plan = parsePlan(input);
    const previous = plan.id ? this.store.get('plan', plan.id) : undefined;
    if (previous && !Object.hasOwn(input, 'deviceIds')) {
      const saved = parsePlan(previous);
      if (plan.deviceId === saved.deviceId) plan.deviceIds = saved.deviceIds;
    }
    if (plan.schedule)
      throw new RpcError(-32030, '旧 schedule 字符串不受支持，请使用定时计划页签配置');
    this.validatePolicy(plan);
    if (!plan.id) plan.id = ident('plan');
    this.store.put('plan', plan.id, plan);
    this.scheduler.invalidate();
    this.emit('plan.saved', '计划已保存', { planId: plan.id });
    return plan;
  }
  private deletePlan(id: string) {
    if (this.executions().some((r) => r.planId === id && r.status === 'running'))
      throw new RpcError(-32011, '运行中的计划不能删除');
    this.store.delete('plan', id);
    this.scheduler.invalidate();
    this.emit('plan.deleted', '计划已删除', { planId: id });
    return { deleted: true };
  }
  private readRunArtifact(params: RpcContract['params']['run.artifact']) {
    const run = this.execution(params.runId);
    if (
      !run?.tasks?.some((task: RunTask) =>
        task.artifacts.some((artifact) => artifact.id === params.artifactId),
      )
    )
      throw new RpcError(-32004, '执行截图不存在');
    return this.artifacts.read(params.runId, params.artifactId);
  }
  private async saveSettings(input: any) {
    const settings = parseSettings(input),
      previous = parseSettings(this.store.get('settings', 'main'));
    const assertConnectionSettings = (next: Settings, current: Settings) => {
      if (
        this.controlSessions.busy &&
        JSON.stringify([next.connection, next.capture, next.deviceProfiles]) !==
          JSON.stringify([current.connection, current.capture, current.deviceProfiles])
      )
        throw new RpcError(-32011, '请先结束 MaaFramework 控制会话，再修改设备连接或客户端配置');
    };
    assertConnectionSettings(settings, previous);
    if (!Object.hasOwn(input, 'copilotStorage') && previous.copilotStorage)
      settings.copilotStorage = previous.copilotStorage;
    if (!Object.hasOwn(input, 'downloadProxy') && previous.downloadProxy)
      settings.downloadProxy = previous.downloadProxy;
    if (!Object.hasOwn(input, 'notifications')) settings.notifications = previous.notifications;
    if (!Object.hasOwn(input, 'mirrorChyan')) settings.mirrorChyan = previous.mirrorChyan;
    if (!Object.hasOwn(input, 'autoUpdateFramework'))
      settings.autoUpdateFramework = previous.autoUpdateFramework;
    const paths = settings.componentPaths ?? previous.componentPaths ?? this.updates.directories();
    if (!Object.hasOwn(input.componentPaths ?? {}, 'framework'))
      paths.framework = previous.componentPaths?.framework;
    this.copilot.validateStorageDirectory(settings.copilotStorage?.directory ?? '');
    const persist = () =>
      this.updates.saveDirectories(paths, (componentPaths) => {
        settings.componentPaths = componentPaths;
        const latest = parseSettings(this.store.get('settings', 'main'));
        const merged = parseSettings(mergeSettingsChanges(previous, settings, latest));
        assertConnectionSettings(merged, latest);
        Object.assign(settings, merged);
        this.store.put('settings', 'main', merged);
        if (
          settings.mirrorChyan?.enabled !== latest.mirrorChyan?.enabled ||
          settings.mirrorChyan?.cdk !== latest.mirrorChyan?.cdk
        )
          this.updates.mirrorSettingsChanged();
      });
    if (paths.framework !== previous.componentPaths?.framework) {
      if (this.frameworkUpdates.pendingOperations)
        throw new RpcError(-32021, 'MaaFramework 检查、下载或切换正在进行，请完成后再修改目录');
      await this.frameworkUpdates.saveDirectory(
        paths.framework ||
          defaultComponentPaths(
            this.root,
            this.options.applicationDirectory,
            this.options.componentEnvironment,
          ).framework!,
        persist,
      );
    } else await persist();
    if (settings.autoConnect && !previous.autoConnect) {
      this.suppressed.clear();
      this.suppressedAddresses.clear();
      this.nextAutoConnect = 0;
    }
    this.syncAutomaticTargets();
    this.nextEndpointProbe = 0;
    if (settings.logRetentionDays !== previous.logRetentionDays) {
      this.logs.resetCleanup();
      this.logs.automatic(settings.logRetentionDays ?? 7);
    }
    this.scheduler.invalidate();
    this.emit('settings.saved', '设置已保存');
    return settings;
  }
  private async updateChannel(
    operation: UpdateOperation,
    channel: RpcContract['params']['updates.check']['channel'],
  ) {
    if (channel === 'app' && operation === 'activate') {
      return this.prepareAppUpdate();
    }
    if (channel === 'app' && operation === 'rollback') {
      this.appUpdatePreparation = undefined;
      this.appUpdating = false;
      return { ...this.updates.channel('app'), message: '已取消安装准备，可以继续使用' };
    }
    if (channel === 'framework') return this.frameworkUpdates[operation]();
    const result = await this.updates[operation](channel);
    return result;
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
  /** 无副作用整表预检：保存合法性与执行支持分离，禁用项不参与检查。 */
  private compatibility(
    tasks: Plan['tasks'],
    deviceId?: string,
    force = false,
    initialClient?: string,
    inputs?: LegacyInputs,
  ): RpcContract['results']['execution.preflight'] {
    const issues: RpcContract['results']['execution.preflight']['issues'] = [];
    let clientType = initialClient ?? (deviceId ? this.deviceClient(deviceId) : 'Official');
    const enabled = tasks.filter((task) => task.enabled !== false && task.params.enable !== false);
    if (!enabled.length)
      issues.push({
        taskIndex: -1,
        taskType: '',
        field: 'tasks',
        code: 'empty_plan',
        message: '至少需要启用一条任务',
      });
    const entries: Plan['tasks'] = force
      ? [{ type: 'CloseDown', params: { client_type: clientType }, enabled: true }, ...tasks]
      : tasks;
    entries.forEach((task, index) => {
      const filename = String(task.params.filename ?? '');
      const compiled = compileLegacyTask(task, {
        clientType,
        customInfrastPlan: inputs?.plans[filename],
      });
      if (inputs?.errors[filename] && task.enabled !== false && task.params.enable !== false)
        issues.push({
          taskIndex: force ? index - 1 : index,
          taskType: task.type,
          field: 'filename',
          code: 'unavailable_resource',
          message: inputs.errors[filename],
        });
      for (const issue of compiled.issues)
        issues.push({ ...issue, taskIndex: force ? index - 1 : index, taskType: task.type });
      if (task.enabled !== false && task.params.enable !== false && task.type === 'StartUp')
        clientType = compiled.clientType;
    });
    return { supported: issues.length === 0, engine: 'maafw', issues };
  }
  private assertCompatible(
    tasks: Plan['tasks'],
    deviceId?: string,
    force = false,
    inputs?: LegacyInputs,
  ) {
    const result = this.compatibility(tasks, deviceId, force, undefined, inputs);
    if (!result.supported)
      throw new RpcError(
        -32010,
        result.issues
          .map(
            (issue) =>
              `第 ${issue.taskIndex + 1} 项 ${taskLabels[issue.taskType] ?? issue.taskType}：${issue.message}`,
          )
          .join('；'),
        result,
      );
    return result;
  }
  async executionPreflight(
    params: RpcContract['params']['execution.preflight'],
    inputs?: LegacyInputs,
  ): Promise<RpcContract['results']['execution.preflight']> {
    if (!validateExecutionPreflightParams(params)) throw new RpcError(-32602, '兼容检查参数无效');
    if (params.source === 'copilot')
      return {
        supported: false,
        engine: 'maafw',
        issues: [
          {
            taskIndex: 0,
            taskType:
              params.kind === 'sss'
                ? 'SSSCopilot'
                : params.kind === 'paradox'
                  ? 'ParadoxCopilot'
                  : 'Copilot',
            field: '',
            code: 'unsupported_task',
            message: '作业执行尚未迁移到 MaaFramework；导入、队列、文件和历史继续保留',
          },
        ],
      };
    if (params.source === 'tool') {
      if (params.kind === 'recruit' && params.config?.mode === 'manual')
        return { supported: true, engine: 'maafw', issues: [] };
      if (params.kind === 'recruit')
        return {
          supported: false,
          engine: 'maafw',
          issues: [
            {
              taskIndex: 0,
              taskType: 'Recruit',
              field: 'mode',
              code: 'unsupported_tool',
              message:
                '只读标签识别工具尚未迁移；可使用手动标签计算，自动公招请使用任务表的已迁移流程',
            },
          ],
        };
      const type =
        params.kind === 'operators'
          ? 'OperBox'
          : params.kind === 'depot'
            ? 'Depot'
            : params.kind === 'games'
              ? 'Custom'
              : 'UserDataUpdate';
      return this.executionPreflight({
        deviceId: params.deviceId,
        clientType: params.clientType,
        tasks: [{ type, params: {}, enabled: true }] as Plan['tasks'],
      });
    }
    const saved = params.planId ? this.store.get('plan', params.planId) : undefined;
    if (params.planId && !saved) throw new RpcError(-32004, '任务表不存在');
    const tasks = params.tasks ?? parsePlan(saved).tasks;
    inputs ??= await snapshotLegacyInputs(tasks);
    const result = this.compatibility(
      tasks,
      params.deviceId,
      params.force,
      params.clientType,
      inputs,
    );
    // 类型／参数错误已经能完整定位时不读取资源；浏览预检绝不建立控制会话。
    if (!result.supported) return result;
    let clientType: string =
      params.clientType ?? (params.deviceId ? this.deviceClient(params.deviceId) : 'Official');
    const entries: Plan['tasks'] = params.force
      ? [{ type: 'CloseDown', params: { client_type: clientType }, enabled: true }, ...tasks]
      : tasks;
    const catalogs = new Map<
      string,
      {
        profiles: AutomationOptions;
        catalog: ReturnType<ReturnType<typeof createAtomicCapabilityRegistry>['list']>;
      }
    >();
    for (const [index, task] of entries.entries()) {
      const taskIndex = params.force ? index - 1 : index;
      const compiled = compileLegacyTask(task, {
        clientType,
        customInfrastPlan: inputs.plans[String(task.params.filename ?? '')],
      });
      let selected = catalogs.get(compiled.clientType);
      if (!selected) {
        const profiles = await this.atomicProfiles(params.deviceId, compiled.clientType);
        const catalog = createAtomicCapabilityRegistry(
          {
            execute: async () => {
              throw new Error('预检禁止设备输入');
            },
            runPipeline: async () => {
              throw new Error('预检禁止执行');
            },
          },
          profiles,
        ).list();
        selected = { profiles, catalog };
        catalogs.set(compiled.clientType, selected);
      }
      for (const issue of [
        ...validateCompiledLegacyTaskResources(compiled, selected.catalog),
        ...validateCompiledLegacyTaskInputs(compiled, selected.profiles),
      ])
        result.issues.push({ ...issue, taskIndex, taskType: task.type });
      if (task.enabled !== false && task.params.enable !== false && task.type === 'StartUp')
        clientType = compiled.clientType;
    }
    result.supported = result.issues.length === 0;
    return result;
  }
  private async requirePreflight(tasks: Plan['tasks'], deviceId: string, force = false) {
    const inputs = await snapshotLegacyInputs(tasks);
    const result = await this.executionPreflight({ tasks, deviceId, force }, inputs);
    if (!result.supported)
      throw new RpcError(-32010, result.issues.map((issue) => issue.message).join('；'), result);
    return inputs;
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
    const legacyInputs = await this.requirePreflight(
      plan.tasks,
      params.deviceId,
      !!occurrence?.force,
    );
    if (!planAllowsDevice(plan, params.deviceId))
      throw new RpcError(-32011, '设备不在任务表绑定范围内，请使用绑定设备执行');
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
      { ...plan, source: 'plan', identity: params.planId, legacyInputs },
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
    throw new RpcError(
      -32010,
      '作业执行尚未迁移到 MaaFramework；配置、作业库和历史继续保留',
      await this.executionPreflight({
        source: 'copilot',
        kind:
          params.kind === 'SSSCopilot'
            ? 'sss'
            : params.kind === 'ParadoxCopilot'
              ? 'paradox'
              : 'copilot',
        deviceId: params.deviceId,
      }),
    );
  }
  /** Reserve occupancy before connection; persist immutable inputs before native task effects. */
  private async beginExecution(params: any, snapshot: any, occurrence?: any) {
    const device = this.devices().find((d) => d.id === params.deviceId);
    if (!device) throw new RpcError(-32004, '设备不存在');
    const availability = this.availability(device.id, occurrence?.id, params.requestId);
    if (!availability.available) {
      if (
        snapshot.source === 'plan' &&
        !occurrence &&
        availability.owner === 'none' &&
        !availability.connected
      )
        void this.notifyUnavailableRunDevice(params, device);
      throw new RpcError(-32011, availability.reason);
    }
    this.preview.invalidate(device.id);
    const worker = this.workers.get(device.id);
    if (!worker?.connected || !worker.safeIdle)
      throw new RpcError(-32011, 'MaaFramework 尚未连接或异步操作未结束');
    if (!this.running || this.appUpdating || this.appUpdatePreparing || this.switching)
      throw new RpcError(-32011, '应用运行时正在退出、安装更新或切换');
    const isCopilot = snapshot.source === 'copilot',
      id = ident('run');
    const control = await this.controlSessions.start(
      { deviceId: device.id, requestId: 'execution-' + id },
      true,
    );
    this.runControls.set(id, control);
    const run: any = {
      ...(occurrence
        ? { scheduleId: occurrence.scheduleId, scheduledFor: occurrence.scheduledFor }
        : {}),
      id,
      source: snapshot.source,
      engine: 'maafw',
      frameworkVersion: device.frameworkVersion ?? null,
      resourceVersion: device.resourceVersion ?? null,
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
    try {
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
    } catch (error) {
      this.runControls.delete(id);
      await this.controlSessions.end({
        deviceId: device.id,
        controlToken: control.controlToken,
        requestId: 'execution-failed-' + id,
      });
      throw error;
    }
    this.emit('run.started', run.message, { run });
    device.state = 'running';
    this.store.put('device', device.id, device);
    await this.submitFrameworkRun(run);
    return this.execution(id);
  }
  private async notifyUnavailableRunDevice(params: any, device: any) {
    // A failed launch is the only connection-notification trigger. Passive reconnects,
    // remote devices and other occupancy failures cannot establish a stopped emulator.
    if (
      !this.running ||
      this.appUpdating ||
      this.appUpdatePreparing ||
      this.switching ||
      !isLocalEmulator(device.address) ||
      !localAdbServer()
    )
      return;
    const combo = this.store.get('active', 'combo', {});
    if (!combo.resource) return;
    const probe =
      this.options.probeDeviceEndpoint ??
      (this.options.frameworkWorkerFactory || this.options.adbExecutable
        ? undefined
        : probeAdbEndpoint);
    if (!probe) return;
    const key = `${params.requestId}|${params.planId}|${device.id}`;
    if (this.unavailableRunRequests.has(key)) return;
    this.unavailableRunRequests.add(key);
    if (this.unavailableRunRequests.size > 256)
      this.unavailableRunRequests.delete(this.unavailableRunRequests.values().next().value!);
    try {
      if (await probe(device.address)) return;
      if (
        !this.running ||
        this.appUpdating ||
        this.appUpdatePreparing ||
        this.switching ||
        this.workers.get(device.id)?.connected ||
        !this.store.get('device', device.id)
      )
        return;
      const settings = parseSettings(this.store.get('settings', 'main'));
      const profile = findDeviceProfile(settings, device.address);
      this.emit('run.connection_failed', '任务表目标模拟器尚未连接，请确认对应实例已经启动', {
        requestId: params.requestId,
        deviceId: device.id,
        profileId: profile?.id ?? device.id,
        profileName: profile?.name ?? device.name,
        address: device.address,
        reason: 'emulator_unavailable',
      });
    } catch {
      // Probe errors provide no evidence about the emulator; keep this path silent.
    }
  }
  async stopRun(id: string) {
    const run = this.execution(id);
    if (!run) throw new RpcError(-32004, '执行记录不存在');
    if (run.status === 'running') {
      this.runControllers.get(id)?.abort(new Error('用户停止执行'));
      const worker = this.workers.get(run.deviceId);
      if (worker && !worker.safeIdle) {
        try {
          await worker.stop();
        } catch {
          await worker.close();
        }
      }
      await this.runOperations.get(id)?.catch(() => {});
      if (this.execution(id)?.status === 'running')
        this.finishFrameworkRun(run, 'stopped', '执行已停止，配置保留；已提交动作请核对设备现场');
    }
    return run;
  }
  private isSuppressed(address: string) {
    if (this.frameworkOwnsAddress(address)) return true;
    const profile = findDeviceProfile(parseSettings(this.store.get('settings', 'main')), address);
    return (
      this.suppressed.has(this.lockAddress(address)) ||
      this.suppressedAddresses.has(deviceLockAddress(address)) ||
      !!(profile && this.suppressedAddresses.has('profile:' + profile.id))
    );
  }
  private frameworkOwnsAddress(address: string) {
    return this.store
      .all('device')
      .some(
        (device) =>
          this.controlSessions.owns(device.id) &&
          this.lockAddress(device.address) === this.lockAddress(address),
      );
  }
  private suppressAddress(address: string, suppress: boolean) {
    const canonical = this.lockAddress(address);
    const identities = [deviceLockAddress(address)];
    const profile = findDeviceProfile(parseSettings(this.store.get('settings', 'main')), address);
    if (profile) identities.push('profile:' + profile.id);
    for (const instance of this.emulatorInventory.instances)
      for (const alias of [instance.address, ...instance.aliases])
        if (this.lockAddress(alias) === canonical) identities.push(deviceLockAddress(alias));
    if (suppress) this.suppressed.add(canonical);
    else this.suppressed.delete(canonical);
    for (const identity of identities) {
      if (suppress) this.suppressedAddresses.add(identity);
      else this.suppressedAddresses.delete(identity);
    }
    for (const state of this.automaticTargets.values())
      if (this.lockAddress(state.target.address) === canonical) {
        state.probing?.abort();
        state.controller?.abort();
        this.automaticTargets.delete(state.target.key);
      }
  }
  private automaticConfiguration(address: string) {
    const settings = parseSettings(this.store.get('settings', 'main'));
    const profile = findDeviceProfile(settings, address);
    return JSON.stringify([
      settings.autoConnect,
      profile ?? { connection: settings.connection, capture: settings.capture },
      this.store.get('active', 'combo', {}),
    ]);
  }
  private automaticCandidates(): AutomaticTarget[] {
    const settings = parseSettings(this.store.get('settings', 'main'));
    const profiles = settings.deviceProfiles ?? [];
    const configuredOnly = profiles.some((profile) => !profile.autoDetected);
    const candidates = [
      ...profiles,
      ...(!configuredOnly
        ? [...this.store.all('device'), ...this.adbSnapshot, ...this.discoveredAutomatic].filter(
            (device) => isLocalEmulator(device.address),
          )
        : []),
    ];
    const selected = new Map<string, AutomaticTarget>();
    for (const candidate of candidates) {
      if (this.isSuppressed(candidate.address)) continue;
      const profile = findDeviceProfile(settings, candidate.address);
      // Process-derived lease identities can change after an emulator restart.
      // Queue identity uses the proven primary endpoint, never its transient PID.
      const instance = emulatorInstanceForAddress(candidate.address, this.emulatorInventory);
      const canonical = deviceLockAddress(
        instance?.address ?? profile?.address ?? candidate.address,
      );
      const key = adbServerIdentity() + '|' + canonical;
      if (!selected.has(key))
        selected.set(key, {
          key,
          address: candidate.address,
          name: candidate.name,
          revision: this.automaticConfiguration(candidate.address),
        });
    }
    return [...selected.values()];
  }
  private automaticAvailable() {
    return (
      this.running &&
      !this.initializingComponents &&
      !this.appUpdating &&
      !this.appUpdatePreparing &&
      !this.switching &&
      parseSettings(this.store.get('settings', 'main')).autoConnect &&
      !!this.store.get('active', 'combo', {}).resource
    );
  }
  private syncAutomaticTargets() {
    const targets = new Map(
      (this.automaticAvailable() ? this.automaticCandidates() : []).map((target) => [
        target.key,
        target,
      ]),
    );
    for (const [key, state] of this.automaticTargets)
      if (!targets.has(key) || targets.get(key)!.revision !== state.target.revision) {
        state.probing?.abort();
        state.controller?.abort();
        this.automaticTargets.delete(key);
      }
    for (const [key, target] of targets)
      if (!this.automaticTargets.has(key))
        this.automaticTargets.set(key, {
          target,
          failures: 0,
          retryAt: 0,
          ready: false,
          readyAt: 0,
          online: false,
          lastOnline: false,
        });
    return [...this.automaticTargets.values()];
  }
  private validateAutomatic(address: string, attempt?: AutomaticConnection) {
    if (!parseSettings(this.store.get('settings', 'main')).autoConnect)
      throw new RpcError(-32011, '自动连接已关闭');
    if (this.isSuppressed(address)) throw new RpcError(-32011, '该设备已手动断开，自动连接已跳过');
    if (
      attempt &&
      (!this.automaticAvailable() ||
        attempt.controller?.signal.aborted ||
        this.automaticTargets.get(attempt.target.key) !== attempt ||
        attempt.target.revision !== this.automaticConfiguration(address) ||
        !this.automaticCandidates().some((target) => target.key === attempt.target.key))
    )
      throw new RpcError(-32011, '自动连接配置或设备状态已改变，连接已取消');
  }
  private automaticWorker(state: AutomaticConnection) {
    return [...this.workers].find(([id]) => {
      const device = this.store.get('device', id);
      return device && this.lockAddress(device.address) === this.lockAddress(state.target.address);
    });
  }
  private async waitAutomaticConnected(worker: Worker, signal: AbortSignal) {
    let finished = false;
    let cancel!: () => void;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<boolean>((resolve) => {
      cancel = () => resolve(false);
      signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(cancel, 30_000);
      if (signal.aborted) cancel();
    });
    try {
      await Promise.race([worker.waitConnected(30_000, () => finished || signal.aborted), stopped]);
      // A connection callback can win at the timeout boundary, or a task can
      // already own the connected worker. Neither is a failed connection.
      return !signal.aborted && worker.connected;
    } finally {
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    }
  }
  private beginAutomaticConnection(
    state: AutomaticConnection,
    inventory?: EmulatorInventory,
    nativeTransport = false,
  ): Promise<any> | undefined {
    if (state.started) return state.started;
    const previous = this.automaticWorker(state);
    if (previous?.[1].connected) return Promise.resolve(this.store.get('device', previous[0]));
    if (
      this.automaticActive.size >= 2 ||
      [...this.automaticActive].some(
        (active) =>
          this.lockAddress(active.target.address) === this.lockAddress(state.target.address),
      ) ||
      Date.now() < state.retryAt ||
      (previous && !previous[1].safeIdle) ||
      this.connectingAddresses.has(state.target.address) ||
      (previous && this.hasExecution(previous[0]))
    )
      return;
    const controller = new AbortController();
    state.controller = controller;
    this.automaticActive.add(state);
    let resolveStarted!: (device: any) => void;
    let rejectStarted!: (reason: unknown) => void;
    const started = new Promise<any>((resolve, reject) => {
      resolveStarted = resolve;
      rejectStarted = reject;
    });
    state.started = started;
    // All callers may ignore the start result; the lifecycle operation owns errors.
    void started.catch(() => {});
    const operation = Promise.resolve().then(async () => {
      try {
        this.validateAutomatic(state.target.address, state);
        if (!state.online && !nativeTransport) {
          const transport =
            this.options.connectDeviceTransport ??
            (this.options.frameworkWorkerFactory || this.options.adbExecutable
              ? undefined
              : connectAdbTransport);
          if (!transport) throw new Error('合成测试未配置 ADB 传输适配器');
          const settings = parseSettings(this.store.get('settings', 'main'));
          const profile = findDeviceProfile(settings, state.target.address);
          const adb = await this.adbExecutable(profile ?? settings);
          this.validateAutomatic(state.target.address, state);
          await transport(adb, state.target.address, controller.signal);
          this.validateAutomatic(state.target.address, state);
          this.nextDeviceObservation = 0;
        }
        if (previous) {
          await this.disconnectDevice(previous[0], true);
          this.validateAutomatic(state.target.address, state);
        }
        const device = await this.connectDevice(state.target, false, true, inventory, state);
        resolveStarted(device);
        const worker = this.workers.get(device.id);
        if (!worker || !(await this.waitAutomaticConnected(worker, controller.signal)))
          throw new Error(
            this.store.get('device', device.id)?.connectionError ||
              'MaaFramework 设备连接失败或超时',
          );
        this.validateAutomatic(state.target.address, state);
        state.failures = 0;
        state.retryAt = 0;
        state.lastError = undefined;
        state.worker = undefined;
      } catch (error) {
        const current = this.automaticWorker(state);
        if (current?.[1].connected) {
          // Another path may have connected this target while registration or
          // the waiter was pending. A late failure must not close its controller
          // or overwrite a successful connection with an old error.
          resolveStarted(this.store.get('device', current[0]));
          state.failures = 0;
          state.retryAt = 0;
          state.lastError = undefined;
          state.worker = undefined;
          return;
        }
        rejectStarted(error);
        const worker = state.worker;
        if (worker) {
          await worker.close();
          if (this.workers.get(state.deviceId!) === worker) {
            this.workers.delete(state.deviceId!);
            this.workerConfigurations.delete(state.deviceId!);
            if (this.running) {
              const device = this.store.get('device', state.deviceId!);
              if (device) {
                device.state = 'offline';
                delete device.captureMethod;
                device.connectionError = connectionError(error);
                this.store.put('device', device.id, device);
                this.emit('device.failed', device.connectionError, { device });
              }
            }
          }
          state.worker = undefined;
        }
        if (!controller.signal.aborted && this.running) {
          const failure = connectionError(error);
          if (!worker && failure !== state.lastError) {
            const settings = parseSettings(this.store.get('settings', 'main'));
            const profile = findDeviceProfile(settings, state.target.address);
            const device = this.store
              .all('device')
              .find(
                (item) => this.lockAddress(item.address) === this.lockAddress(state.target.address),
              );
            if (device && !this.workers.get(device.id)?.connected) {
              device.connectionError = failure;
              this.store.put('device', device.id, device);
              this.emit('device.failed', failure, { device });
            } else if (!device && profile)
              this.emit('device.connection_failed', failure, {
                profileId: profile.id,
                address: state.target.address,
                error: failure,
              });
          }
          state.lastError = failure;
          state.failures++;
          state.retryAt =
            Date.now() +
            (/设备控制权|device lock/.test(failure)
              ? 30_000
              : [2000, 4000, 8000, 16_000, 30_000][Math.min(state.failures - 1, 4)]!);
        }
      } finally {
        state.started = undefined;
        state.controller = undefined;
        this.automaticActive.delete(state);
      }
    });
    this.automaticOperations.add(operation);
    void operation.catch(() => {}).finally(() => this.automaticOperations.delete(operation));
    return started;
  }
  private drainAutomaticConnections() {
    if (!this.automaticAvailable()) return;
    for (const state of this.automaticTargets.values())
      if (state.online || (state.ready && Date.now() - state.readyAt < 2000))
        this.beginAutomaticConnection(state);
  }
  private async checkAutomaticEndpoints() {
    const states = this.syncAutomaticTargets();
    const online = new Set(
      this.adbSnapshot
        .filter((device) => device.adbState === 'device')
        .map((device) => this.lockAddress(device.address)),
    );
    for (const state of states) {
      if (online.has(this.lockAddress(state.target.address))) {
        if (!state.lastOnline) state.retryAt = 0;
        state.online = true;
        state.lastOnline = true;
      }
    }
    this.drainAutomaticConnections();
    if (this.endpointProbes || Date.now() < this.nextEndpointProbe || !localAdbServer()) return;
    const probe =
      this.options.probeDeviceEndpoint ??
      (this.options.frameworkWorkerFactory || this.options.adbExecutable
        ? undefined
        : probeAdbEndpoint);
    if (!probe) return;
    this.nextEndpointProbe = Date.now() + 2000;
    const candidates = states.filter(
      (state) =>
        !state.online &&
        !state.started &&
        !state.probing &&
        isLocalEmulator(state.target.address) &&
        !this.automaticWorker(state)?.[1].connected,
    );
    let next = 0;
    const scan = async () => {
      while (next < candidates.length) {
        const state = candidates[next++]!;
        if (!this.automaticAvailable()) return;
        const controller = new AbortController();
        state.probing = controller;
        try {
          const ready = await probe(state.target.address, controller.signal);
          if (
            controller.signal.aborted ||
            this.automaticTargets.get(state.target.key) !== state ||
            state.target.revision !== this.automaticConfiguration(state.target.address) ||
            !this.automaticAvailable() ||
            this.isSuppressed(state.target.address)
          )
            continue;
          if (ready && !state.ready && state.readyAt > 0) state.retryAt = 0;
          state.ready = ready;
          state.readyAt = Date.now();
        } catch {
          /* A failed TCP probe is not evidence of a native connection failure. */
        } finally {
          state.probing = undefined;
        }
      }
    };
    const pending = Promise.all(Array.from({ length: Math.min(4, candidates.length) }, scan)).then(
      () => {
        this.drainAutomaticConnections();
      },
    );
    this.endpointProbes = pending;
    this.automaticOperations.add(pending);
    try {
      await pending;
    } finally {
      this.endpointProbes = undefined;
      this.automaticOperations.delete(pending);
    }
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
      (this.options.frameworkWorkerFactory || this.options.adbExecutable
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
  /** 设备连接只创建 Framework Controller；资源与 SDK 均独立解析，不读取旧核心目录。 */
  connectDevice(
    params: any,
    internal = false,
    automatic = false,
    inventory?: EmulatorInventory,
    attempt?: AutomaticConnection,
  ): Promise<any> {
    const operation = this.connectDeviceInner(params, internal, automatic, inventory, attempt);
    this.connectionOperations.add(operation);
    this.connectionReservations.set(operation, params.address);
    void operation
      .finally(() => {
        this.connectionOperations.delete(operation);
        this.connectionReservations.delete(operation);
      })
      .catch(() => {});
    return operation;
  }
  private async connectDeviceInner(
    params: any,
    internal = false,
    automatic = false,
    inventory?: EmulatorInventory,
    attempt?: AutomaticConnection,
  ): Promise<any> {
    const address = validateAddress(params.address);
    if (
      !this.running ||
      this.appUpdating ||
      (!internal && (this.switching || this.appUpdatePreparing))
    )
      throw new RpcError(-32011, '运行时正在退出或切换组件');
    if (this.initializingComponents) throw new RpcError(-32021, '正在准备随附资源');
    if (automatic) this.validateAutomatic(address, attempt);
    // 先解析真实实例身份再分配设备 ID 和 OS 租约；别名不能各自取得一个控制器。
    this.emulatorInventory = inventory ?? (await this.readEmulatorInventory());
    if (!this.running) throw new RpcError(-32011, '运行时正在退出');
    const canonical = this.lockAddress(address);
    const previous = this.store
      .all('device')
      .find((device) => this.lockAddress(device.address) === canonical);
    const id =
      previous?.id ?? 'device-' + createHash('sha256').update(canonical).digest('hex').slice(0, 12);
    if (this.workers.get(id)?.connected) return this.store.get('device', id);
    if (
      this.controlSessions.owns(id) ||
      this.connectingAddresses.has(address) ||
      this.connecting.has(id)
    )
      throw new RpcError(-32011, '设备正在连接或被控制会话占用');
    this.connecting.add(id);
    this.connectingAddresses.add(address);
    let worker: Worker | undefined;
    try {
      if (!internal && !automatic) this.suppressAddress(address, false);
      const settings = parseSettings(this.store.get('settings', 'main'));
      const profile = findDeviceProfile(settings, address);
      const combo = this.store.get('active', 'combo', {});
      if (!combo.resource) throw new RpcError(-32040, '请先安装并启用游戏资源');
      const device = {
        ...previous,
        id,
        name: String(params.name || profile?.name || previous?.name || address).slice(0, 80),
        address,
        state: 'offline',
        frameworkVersion: this.frameworkUpdates.channel().currentVersion,
        resourceVersion: combo.resource.version,
        ...(profile ? { connectionProfileId: profile.id } : {}),
      };
      delete device.coreVersion;
      this.store.put('device', id, device);
      const config = {
        resource: combo.resource.path,
        adb: await this.adbExecutable(profile ?? settings),
        address,
        lockPath: deviceLockPath(adbServerIdentity() + '|' + canonical),
        connection: profile?.connection ?? settings.connection ?? defaultConnection(),
      };
      this.frameworkConnections.set(id, config);
      const view = await this.prepareFrameworkView(id, attempt?.controller?.signal);
      const port = await this.launchFrameworkControl(
        id,
        view,
        attempt?.controller?.signal ?? this.frameworkAbort.signal,
      );
      worker = deviceWorker(port);
      await worker.connect();
      if (!worker.connected || !this.running) throw new Error('MaaFramework 未确认设备连接');
      if (automatic) this.validateAutomatic(address, attempt);
      this.workers.set(id, worker);
      this.workerConfigurations.set(id, config);
      if (attempt) {
        attempt.worker = worker;
        attempt.deviceId = id;
      }
      device.state = 'idle';
      device.frameworkVersion = this.frameworkUpdates.channel().currentVersion;
      delete device.connectionError;
      this.store.put('device', id, device);
      this.emit('device.connected', 'MaaFramework 已连接设备', { device });
      return device;
    } catch (error) {
      await worker?.close().catch(() => {});
      this.frameworkConnections.delete(id);
      const device = this.store.get('device', id);
      if (device) {
        device.state = 'offline';
        device.connectionError = connectionError(error);
        this.store.put('device', id, device);
      }
      if (error instanceof RpcError) throw error;
      throw new RpcError(-32040, '设备连接失败：' + connectionError(error), errorDetail(error));
    } finally {
      this.connecting.delete(id);
      this.connectingAddresses.delete(address);
    }
  }
  async autoConnectDevices(automatic = false): Promise<any> {
    if (this.autoConnecting) throw new RpcError(-32011, '模拟器自动连接正在进行');
    this.autoConnecting = true;
    try {
      if (!this.running || this.appUpdating || this.appUpdatePreparing || this.switching)
        throw new RpcError(-32011, '正在退出、安装应用更新或切换运行组件，请稍后重试');
      if (!automatic) {
        this.suppressed.clear();
        this.suppressedAddresses.clear();
        for (const state of this.automaticTargets.values()) {
          state.failures = 0;
          state.retryAt = 0;
        }
      }
      if (!this.store.get('active', 'combo', {}).resource)
        throw new RpcError(
          -32040,
          '请先在更新中心安装并启用游戏资源和 MaaFramework，再自动连接模拟器',
        );
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
      if (automatic) {
        this.discoveredAutomatic = discovered;
        this.syncAutomaticTargets();
      }
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
          (automatic && this.isSuppressed(candidate.address))
        )
          continue;
        seen.add(key);
        try {
          if (this.switching || !this.running)
            throw new RpcError(-32011, '正在退出或切换运行组件，请稍后重试');
          const queued = [...this.automaticTargets.values()].find(
            (state) => this.lockAddress(state.target.address) === key,
          );
          if (automatic) {
            if (queued) {
              if (candidate.adbState === 'device') {
                queued.online = true;
                queued.lastOnline = true;
              }
              const nativeTransport =
                candidate.adbState === 'configured' &&
                !candidate.address.includes(':') &&
                !candidate.address.startsWith('emulator-');
              const started = this.beginAutomaticConnection(queued, inventory, nativeTransport);
              if (started) devices.push(await started);
            }
            continue;
          }
          if (queued?.started) {
            devices.push(await queued.started);
            continue;
          }
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
          const reason = connectionError(error);
          diagnostics.push(candidate.address + '：' + reason);
          this.emit('device.connection_failed', '设备连接失败：' + reason, {
            address: candidate.address,
            profileId: findDeviceProfile(
              parseSettings(this.store.get('settings', 'main')),
              candidate.address,
            )?.id,
            error: reason,
          });
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
    if (!this.running) return;
    this.syncAutomaticTargets();
    if (!this.automaticAvailable()) return;
    this.watchDeviceConnections();
    await this.checkAutomaticEndpoints();
    if (
      !this.automaticAvailable() ||
      Date.now() < this.nextAutoConnect ||
      this.busy() ||
      this.autoConnecting
    )
      return;
    this.nextAutoConnect = Date.now() + 30_000;
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
  private deleteDevices(params: unknown): RpcContract['results']['device.delete'] {
    if (!validateDeviceDeleteParams(params)) throw new RpcError(-32602, '历史设备删除请求无效');
    if (this.switching)
      throw new RpcError(-32011, '正在切换 MaaFramework 与资源，暂不能删除历史设备');
    const devices = params.deviceIds
      .map((id) => this.store.get('device', id))
      .filter((device) => !!device);
    const connectingAddresses = new Set(
      [...this.connectingAddresses, ...this.connectionReservations.values()].map((address) =>
        this.lockAddress(address),
      ),
    );
    // Preflight the entire batch without yielding: an offline-looking record can
    // still belong to an asynchronous connection, execution or scheduled start.
    for (const device of devices) {
      if (
        device.state !== 'offline' ||
        this.workers.has(device.id) ||
        this.connecting.has(device.id) ||
        connectingAddresses.has(this.lockAddress(device.address)) ||
        [...this.automaticActive].some(
          (state) => this.lockAddress(state.target.address) === this.lockAddress(device.address),
        ) ||
        this.clientSwitches.has(device.id) ||
        this.controlSessions.owns(device.id) ||
        this.hasExecution(device.id) ||
        [...this.starts.values()].some((start) => start.deviceId === device.id) ||
        this.scheduler.owner(device.id) ||
        this.preview.isClicking(device.id)
      )
        throw new RpcError(-32011, '只能删除未被占用的离线历史设备，请先断开设备并等待操作结束', {
          deviceId: device.id,
        });
    }
    const deletedDeviceIds = devices.map((device) => device.id as string);
    this.store.transaction(() => {
      // Instance profiles, bindings, execution evidence and account history have
      // independent lifetimes; deleting this list entry must not cascade to them.
      for (const id of deletedDeviceIds) this.store.delete('device', id);
    });
    for (const device of devices) {
      this.preview.invalidate(device.id);
      this.suppressAddress(device.address, true);
    }
    if (deletedDeviceIds.length)
      this.emit('device.deleted', '离线历史设备已删除，实例配置和执行记录保留', {
        deletedDeviceIds,
      });
    return { deletedDeviceIds };
  }
  async disconnectDevice(id: string, internal = false) {
    if (this.controlSessions.owns(id))
      throw new RpcError(-32011, '请先通过宿主结束 MaaFramework 控制会话');
    if (this.switching && !internal)
      throw new RpcError(-32011, '正在切换 MaaFramework 与资源，暂不能断开设备');
    if (this.preview.isClicking(id)) throw new RpcError(-32011, '点击尚未完成，请稍后断开设备');
    this.preview.invalidate(id);
    if (
      !this.switching &&
      this.executions().some((r) => r.deviceId === id && r.status === 'running')
    )
      throw new RpcError(-32011, '请先停止该设备的执行');
    const recorded = this.store.get('device', id);
    if (!internal && recorded) this.suppressAddress(recorded.address, true);
    const worker = this.workers.get(id);
    this.workers.delete(id);
    this.workerConfigurations.delete(id);
    await worker?.close();
    const device = this.store.get('device', id);
    if (device) {
      device.state = 'offline';
      this.store.put('device', id, device);
    }
    this.emit('device.disconnected', '设备控制权已释放', { deviceId: id });
    return { disconnected: true };
  }
  async beforeSwitch() {
    if (this.switchOwner === 'framework') throw new Error('MaaFramework 正在切换');
    if (!this.switching && this.busy()) throw new Error('MaaFramework 或异步操作仍在运行');
    this.switching = true;
    this.switchOwner = 'components';
    this.preview.invalidate();
    await this.closeFrameworkReaders();
    this.frameworkViews.clear();
    const reconnect = new Map(this.reconnect.map((d) => [d.id, d]));
    const workers = [...this.workers.entries()];
    this.workers.clear();
    this.workerConfigurations.clear();
    this.frameworkConnections.clear();
    for (const [id, worker] of workers) {
      const d = this.store.get('device', id);
      // Only a device that was actually connected needs to come back after the
      // switch. Registered offline workers must not block an idle component
      // update, and their next connection will pick up the new combo.
      if (worker.connected) reconnect.set(id, d);
      d.state = 'offline';
      this.store.put('device', id, d);
      this.emit('device.disconnected', '正在安全切换 MaaFramework 工作进程', { deviceId: id });
    }
    this.reconnect = [...reconnect.values()];
    const results = await Promise.allSettled(workers.map(([, w]) => w.close()));
    if (results.some((r) => r.status === 'rejected'))
      throw new Error('旧 MaaFramework 工作进程退出失败');
  }
  async afterSwitch() {
    for (const device of this.reconnect) {
      try {
        const connected = await this.connectDevice(
          { address: device.address, name: device.name },
          true,
        );
        if (!(await this.workers.get(connected.id)?.waitConnected()))
          throw new Error('MaaFramework 设备重连失败或超时: ' + device.name);
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
    if (!this.switching || this.switchOwner !== 'components') return;
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
          this.finishFrameworkRun(
            run,
            'failed',
            'MaaFramework 切换及旧版重连失败；请人工核对设备: ' + error,
          );
      this.emit('update.recovery_failed', '设备重连失败，已终止等待中的计划', { error });
    }
    this.reconnect = [];
    this.switching = false;
    this.switchOwner = undefined;
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
  /** 正式任务逐条调用登记的 JSON／L3 流程；后台 Promise 持有会话直到停止完全收敛。 */
  private submitFrameworkRun(run: any): Promise<void> {
    const controller = new AbortController();
    this.runControllers.set(run.id, controller);
    const operation = this.executeFrameworkRun(run, controller.signal).finally(() => {
      this.runControllers.delete(run.id);
      this.runOperations.delete(run.id);
      this.submissions.delete(operation);
    });
    this.submissions.add(operation);
    this.runOperations.set(run.id, operation);
    return Promise.resolve();
  }
  private async executeFrameworkRun(run: any, signal: AbortSignal) {
    let control = this.runControls.get(run.id);
    try {
      const snapshot = this.executionSnapshot(run.id);
      this.assertCompatible(snapshot.tasks, run.deviceId, false, snapshot.legacyInputs);
      control ??= await this.controlSessions.start(
        { deviceId: run.deviceId, requestId: 'execution-' + run.id },
        true,
      );
      this.runControls.set(run.id, control);
      for (let index = 0; index < snapshot.tasks.length; index++) {
        signal.throwIfAborted();
        const configured = snapshot.tasks[index];
        const compiled = compileLegacyTask(configured, {
          clientType: this.taskClient(run, index),
          customInfrastPlan: snapshot.legacyInputs?.plans[String(configured.params.filename ?? '')],
        });
        if (!compiled.supported)
          throw new Error(compiled.issues.map((issue) => issue.message).join('；'));
        // 官服／B 服共用中文素材，规则按不可变快照的客户端选择，绝不继承上个任务的配置。
        const registry = await this.automationRegistry(control, signal, compiled.clientType);
        const resourceIssues = [
          ...validateCompiledLegacyTaskResources(compiled, registry.list()),
          ...validateCompiledLegacyTaskInputs(
            compiled,
            await this.atomicProfiles(run.deviceId, compiled.clientType),
          ),
        ];
        if (resourceIssues.length)
          throw new Error(resourceIssues.map((issue) => issue.message).join('；'));
        this.store.put('execution', run.id, { index, engine: 'maafw' });
        this.updateRunTask(run, index, (task) =>
          Object.assign(task, {
            status: 'running',
            startedAt: now(),
            message: '正在执行 ' + (taskLabels[configured.type] ?? configured.type),
          }),
        );
        const context = {
          signal,
          claimDailyAction: async (key: 'visit_friends') => {
            const at = this.options.now?.() ?? new Date(),
              clientType = compiled.clientType;
            const day = gameDate(at, clientType).toISOString().slice(0, 10);
            const claim = `${run.deviceId}:${clientType}:${day}:${key}`;
            return this.store.transaction(() => {
              const legacy = this.store.get('mall_visit', run.deviceId);
              if (
                this.store.get('daily_action_claim', claim) ||
                (legacy?.clientType === clientType &&
                  !syncDue(legacy.visitedAt, 'daily', at, clientType))
              )
                return false;
              this.store.put('daily_action_claim', claim, {
                runId: run.id,
                taskIndex: index,
                claimedAt: at.toISOString(),
              });
              return true;
            });
          },
          onProgress: (progress: { message: string; capabilityId?: string; data?: unknown }) => {
            this.updateRunTask(
              run,
              index,
              (task) => {
                task.message = progress.message.slice(0, 1000);
                if (progress.capabilityId === 'workflow.fight.legacy_batch')
                  recordFrameworkResult(
                    task,
                    progress.capabilityId,
                    { status: 'partial', verified: false, data: progress.data },
                    now(),
                    String(configured.params.stage ?? ''),
                  );
              },
              true,
            );
          },
          reserveConsumable: async (
            kind: string,
            amount: number,
            limit: number,
            operationId: string,
          ) => {
            this.reserveConsumption(
              run.id,
              index,
              configured.params,
              kind,
              amount,
              limit,
              operationId,
            );
          },
        };
        for (const step of compiled.steps) {
          for (let iteration = 0; iteration < (step.repeat ?? 1); iteration++) {
            signal.throwIfAborted();
            const result = await registry.execute(step.capabilityId, step.input, context);
            // 保存未知结果证据供人工核对；完成信号本身不构成业务成功。
            this.store.put(
              'execution_evidence',
              `${run.id}:${index}:${step.capabilityId}:${iteration}`,
              {
                runId: run.id,
                taskIndex: index,
                capabilityId: step.capabilityId,
                iteration,
                recordedAt: now(),
                ...boundedExecutionEvidence(result),
              },
            );
            this.updateRunTask(
              run,
              index,
              (task) =>
                recordFrameworkResult(
                  task,
                  step.capabilityId,
                  result,
                  now(),
                  String(configured.params.stage ?? ''),
                ),
              true,
            );
            await this.captureRunEvidence(
              run,
              index,
              control,
              signal,
              result.verified ? '流程结束后的核对画面' : '结果未确认，请人工核对',
            );
            if (result.status !== 'completed' || result.verified !== true)
              throw new Error(result.message ?? '业务结果未确认；不会自动重放');
          }
        }
        if (configured.type === 'StartUp') this.rememberClient(run, configured.params);
        this.updateRunTask(run, index, (task) =>
          Object.assign(task, { status: 'completed', finishedAt: now(), message: '已复核完成' }),
        );
        const current = this.execution(run.id);
        current.progress = Math.round(((index + 1) * 100) / snapshot.tasks.length);
        this.putExecution(run.id, current);
      }
      this.finishFrameworkRun(run, 'completed', '全部任务已完成并复核');
    } catch (error) {
      this.finishFrameworkRun(
        run,
        signal.aborted ? 'stopped' : 'failed',
        (signal.aborted ? '执行已停止；请核对已提交动作，配置保留' : String(error)).slice(0, 1000),
      );
    } finally {
      if (control)
        await this.controlSessions
          .end({
            deviceId: run.deviceId,
            controlToken: control.controlToken,
            requestId: 'execution-end-' + run.id,
          })
          .catch(() => {});
      this.runControls.delete(run.id);
      const device = this.store.get('device', run.deviceId);
      if (device) {
        device.state = this.workers.get(run.deviceId)?.connected ? 'idle' : 'offline';
        this.store.put('device', device.id, device);
      }
    }
  }
  /** 结果截图只作事后证据；750 ms 后失效，不把迟到画面记给下一任务或据此重放。 */
  private async captureRunEvidence(
    run: any,
    index: number,
    control: { controlToken: string },
    signal: AbortSignal,
    label: string,
  ) {
    const current = this.execution(run.id),
      task = current?.tasks?.[index];
    if (
      signal.aborted ||
      current?.status !== 'running' ||
      !task ||
      task.artifacts.length >= 3 ||
      current.tasks.reduce((count: number, item: RunTask) => count + item.artifacts.length, 0) >= 12
    )
      return;
    let active = true,
      timer: ReturnType<typeof setTimeout> | undefined;
    const capture = this.preview
      .frame({ deviceId: run.deviceId, controlToken: control.controlToken })
      .then((frame) => {
        if (!active || signal.aborted || !this.canSubmit(run.id)) return;
        this.updateRunTask(
          run,
          index,
          (target) => this.artifacts.save(run.id, target, frame, label),
          true,
        );
      })
      .catch(() => {});
    try {
      await Promise.race([
        capture,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 750);
        }),
      ]);
    } finally {
      active = false;
      clearTimeout(timer);
    }
  }
  /** 消耗资格先入库再输入；未知结果仍占额度，不能凭重试退回或再次花费。 */
  private reserveConsumption(
    runId: string,
    index: number,
    params: any,
    kind: string,
    amount: number,
    limit: number,
    operationId: string,
  ) {
    const maximum =
      kind === 'medicine'
        ? (params.medicine ?? 0)
        : kind === 'stone'
          ? (params.stone ?? 0)
          : kind === 'credit'
            ? (params.credit_budget ?? 0)
            : kind === 'recruit'
              ? (params.times ?? 0)
              : -1;
    if (
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 0 ||
      limit > maximum ||
      typeof operationId !== 'string' ||
      !operationId ||
      operationId.length > 200
    )
      throw new RpcError(-32010, '消耗额度请求无效');
    const key = runId + ':' + index + ':' + kind;
    this.store.transaction(() => {
      const ledger = this.store.get('consumption', key, { reserved: 0 });
      const reservationKey = key + ':' + createHash('sha256').update(operationId).digest('hex');
      if (this.store.get('consumption_reservation', reservationKey))
        throw new RpcError(-32011, '消耗动作已经预留，不允许重放');
      if (ledger.reserved + amount > limit)
        throw new RpcError(-32010, '已达到本次任务的明确消耗上限');
      ledger.reserved += amount;
      this.store.put('consumption', key, ledger);
      this.store.put('consumption_reservation', reservationKey, { amount, operationId });
    });
  }
  finishFrameworkRun(run: any, status: string, message: string) {
    const persisted = this.execution(run.id);
    // 断线、用户停止和取消回执可能竞态；第一个持久终态拥有结果，晚到回执不得改写。
    if (!persisted || persisted.status !== 'running') return;
    Object.assign(run, persisted);
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
  private closeDeviceObservation() {
    const observation = this.deviceObservation;
    this.deviceObservation = undefined;
    if (!observation) return;
    const closing = Promise.resolve()
      .then(() => observation.close())
      .catch(() => {})
      .finally(() => this.closingDeviceObservations.delete(closing));
    this.closingDeviceObservations.add(closing);
  }
  private watchDeviceConnections() {
    if (!this.running || this.switching || this.appUpdating || this.appUpdatePreparing) {
      this.closeDeviceObservation();
      this.adbSnapshot = [];
      for (const state of this.automaticTargets.values()) state.online = false;
      return;
    }
    // Synthetic workers must explicitly opt into a synthetic observer. Never let
    // routine tests reach the host ADB, even when their fixture uses FrameworkWorker.
    const observe =
      this.options.observeDeviceConnections ??
      (this.options.frameworkWorkerFactory || this.options.adbExecutable
        ? undefined
        : observeAdbDevices);
    if (!observe) return;
    const workers = new Map(
      [...this.workers].filter(
        ([id, worker]) =>
          worker.connected && !this.connecting.has(id) && this.workerConfigurations.has(id),
      ),
    );
    const current = this.deviceObservation;
    const reconnecting = this.automaticAvailable();
    if (
      current &&
      (workers.size > 0 || reconnecting) &&
      current.workers.size === workers.size &&
      [...workers].every(([id, worker]) => current.workers.get(id) === worker)
    )
      return;
    this.closeDeviceObservation();
    if ((!workers.size && !reconnecting) || Date.now() < this.nextDeviceObservation) return;
    // One passive subscription covers every device on this service's ADB server.
    // Refresh it on worker replacement to get a new initial snapshot, rather than
    // applying a cached device list from before that connection was established.
    const observation: DeviceObservation = { workers, close: async () => {} };
    this.deviceObservation = observation;
    const disconnected = () => {
      if (this.deviceObservation !== observation) return;
      this.closeDeviceObservation();
      this.adbSnapshot = [];
      for (const state of this.automaticTargets.values()) state.online = false;
      // Losing the observer says nothing about individual devices. Retry only
      // the subscription; never turn a server/socket error into device loss.
      this.nextDeviceObservation = Date.now() + 5000;
    };
    try {
      const observer = observe((devices) => {
        if (!this.running || this.switching || this.deviceObservation !== observation) return;
        this.adbSnapshot = devices;
        const online = new Set(
          devices
            .filter((device) => device.adbState === 'device')
            .map((device) => this.lockAddress(device.address)),
        );
        for (const [id, worker] of observation.workers) {
          const config = this.workerConfigurations.get(id);
          if (
            this.workers.get(id) === worker &&
            worker.connected &&
            config &&
            !online.has(this.lockAddress(config.address))
          )
            worker.events.push({ type: 'connection_lost' });
        }
        for (const state of this.syncAutomaticTargets()) {
          const ready = devices.some(
            (device) =>
              device.adbState === 'device' &&
              this.lockAddress(device.address) === this.lockAddress(state.target.address),
          );
          if (ready && !state.lastOnline) state.retryAt = 0;
          state.online = ready;
          state.lastOnline = ready;
        }
        this.drainAutomaticConnections();
      }, disconnected);
      observation.close = () => observer.close();
    } catch {
      disconnected();
    }
  }
  private async releaseOfflineWorker(id: string, worker: Worker) {
    this.preview.invalidate(id);
    // Keep the worker registered until shutdown releases its native device lease.
    // History deletion and replacement connections must wait for that boundary.
    await worker.close();
    if (this.workers.get(id) === worker) {
      this.workers.delete(id);
      this.workerConfigurations.delete(id);
      this.frameworkConnections.delete(id);
    }
  }
  async pollNativeWorkers() {
    for (const [id, worker] of [...this.workers]) {
      const lost =
        !worker.connected ||
        worker.events.some((event) =>
          ['exit', 'protocol_error', 'connection_lost'].includes(event.type),
        );
      worker.events.length = 0;
      if (lost) {
        this.preview.invalidate(id);
        for (const run of this.executions().filter(
          (run) => run.deviceId === id && run.status === 'running',
        )) {
          this.runControllers.get(run.id)?.abort(new Error('设备已离线，结果未知'));
          this.finishFrameworkRun(run, 'failed', '设备连接中断，结果未知；不会自动重放');
        }
        await this.releaseOfflineWorker(id, worker);
        const device = this.store.get('device', id);
        if (device) {
          device.state = 'offline';
          delete device.captureMethod;
          device.connectionError = '设备连接已离线或原生进程退出；请重新连接并核对设备现场';
          this.store.put('device', id, device);
          this.emit('device.failed', device.connectionError, { device });
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
      this.watchDeviceConnections();
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
      ['resource', 21600],
      ['framework', 86400],
    ] as const) {
      if (!this.running || this.appUpdating || this.appUpdatePreparing) return;
      if (
        !(channel === 'framework' ? settings.autoUpdateFramework : settings.autoUpdateResource) ||
        Date.now() < (this.nextChecks[channel] ?? Infinity)
      )
        continue;
      this.nextChecks[channel] = Date.now() + interval * 1000;
      try {
        const state =
          channel === 'framework'
            ? await this.frameworkUpdates.check()
            : await this.updates.check(channel);
        if (!this.running || this.appUpdating || this.appUpdatePreparing) return;
        if (state.status === 'available') {
          if (channel === 'framework') {
            await this.frameworkUpdates.prepare();
            if (this.running && !this.appUpdating && !this.appUpdatePreparing)
              await this.frameworkUpdates.activate();
          } else {
            await this.updates.prepare(channel);
            if (this.running && !this.appUpdating && !this.appUpdatePreparing)
              await this.updates.activate(channel);
          }
        }
      } catch {
        this.nextChecks[channel] = Date.now() + 300_000;
      }
    }
  }
  close(): Promise<void> {
    return (this.closing ||= this.closeInner());
  }
  cancelPendingOperations() {
    // EOF 先取消尚未进入 worker map 的启动／识别，再等待在途 RPC；避免退出相互等待。
    this.frameworkAbort.abort();
    for (const controller of this.runControllers.values()) controller.abort();
    for (const state of this.automaticActive) state.controller?.abort();
    for (const controller of this.clientSwitches.values()) controller.abort();
  }
  private async closeInner() {
    this.running = false;
    this.frameworkAbort.abort();
    for (const controller of this.runControllers.values()) controller.abort();
    for (const state of this.automaticTargets.values()) {
      state.probing?.abort();
      state.controller?.abort();
    }
    for (const state of this.automaticActive) state.controller?.abort();
    this.automaticTargets.clear();
    this.closeDeviceObservation();
    this.appUpdateHttp.close();
    this.copilot.beginClose();
    this.scheduler.close();
    this.toolbox.close();
    this.cancelPendingOperations();
    this.preview.invalidate();
    await Promise.all([
      this.debug.close(),
      this.controlSessions.close(),
      this.closeFrameworkReaders(),
    ]);
    await Promise.allSettled([...this.frameworkOperations]);
    await Promise.allSettled([...this.automaticOperations]);
    await Promise.allSettled([...this.connectionOperations]);
    await this.knowledge.close();
    await this.calendar.close();
    await this.updates.close();
    await this.frameworkUpdates.close();
    for (const run of this.executions()) if (run.status === 'running') await this.stopRun(run.id);
    await Promise.all([...this.workers.values()].map((worker) => worker.close()));
    this.workers.clear();
    this.workerConfigurations.clear();
    await Promise.allSettled([
      ...this.submissions,
      ...[...this.starts.values()].map((start) => start.promise),
    ]);
    await Promise.allSettled([...this.artifactCaptures.values()]);
    await Promise.allSettled([...this.closingDeviceObservations]);
    await this.copilot.drainFeedback(1000);
    this.logs.diagnostics.write('info', 'runtime.stopped');
    this.store.close();
  }
}
