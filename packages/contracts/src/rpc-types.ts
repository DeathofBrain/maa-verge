/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */

/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ClientType".
 */
export type ClientType = 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
export type Id = string;
export type Name = string;
export type Description = string;
export type Deviceid = string | null;
export type Group = 'daily' | 'specialized';
export type Originium = number;
export type Medicine = number;
export type Expedited = number;
export type Type =
  | 'StartUp'
  | 'CloseDown'
  | 'Fight'
  | 'Recruit'
  | 'Infrast'
  | 'Mall'
  | 'Award'
  | 'SwitchTheme'
  | 'Roguelike'
  | 'Copilot'
  | 'SSSCopilot'
  | 'ParadoxCopilot'
  | 'Depot'
  | 'OperBox'
  | 'Reclamation'
  | 'Custom'
  | 'SingleStep'
  | 'VideoRecognition'
  | 'OperProgress'
  | 'UserDataUpdate';
export type Enabled = boolean;
/**
 * @minItems 1
 * @maxItems 30
 */
export type Tasks = Task[];
export type Schedule = string | null;
export type Enabled1 = boolean;
export type Autoconnect = boolean;
export type Autoupdatecore = boolean;
export type Autoupdateresource = boolean;
export type Minimizetotray = boolean;
export type Theme = 'dark' | 'light' | 'system';
export type Provider = string;
export type Baseurl = string;
export type Model = string;
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ToolKind".
 */
export type ToolKind = 'depot' | 'operators' | 'recruit' | 'inventory' | 'data' | 'games';
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotKind".
 */
export type CopilotKind = 'Copilot' | 'SSSCopilot' | 'ParadoxCopilot';
export type Mode = 'native';
export type Id1 = string;
export type Name1 = string;
export type Address = string;
export type State = 'idle' | 'running' | 'offline';
export type Coreversion = string | null;
export type Resourceversion = string | null;
export type Devices = Device[];
export type Plans = Plan[];
export type Id2 = string;
export type Planid = string | null;
export type Deviceid1 = string;
export type Status = 'running' | 'completed' | 'failed' | 'stopped';
export type Progress = number;
export type Message = string;
export type Startedat = string;
export type Finishedat = string | null;
export type Runs = Run[];
export type Id3 = 'app' | 'core' | 'resource';
export type Currentversion = string;
export type Latestversion = string | null;
export type Status1 =
  'idle' | 'checking' | 'available' | 'downloading' | 'staged' | 'waiting_idle' | 'active' | 'failed';
export type Progress1 = number;
export type Message1 = string;
export type Updates = UpdateChannel[];
export type Id4 = number;
export type Type1 = string;
export type Message2 = string;
export type Createdat = string;
export type Events = Event[];

export interface RpcContract {
  params: {
    'app.snapshot': EmptyParams;
    'logs.info': EmptyParams;
    'logs.export': EmptyParams;
    'logs.clean': EmptyParams;
    'home.info': {
      deviceId?: string;
      clientType?: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
      refresh?: boolean;
    };
    'stages.list': StageListParams;
    'recognition.get': RecognitionParams;
    'resources.item': ItemResourceParams;
    'resources.operator': OperatorResourceParams;
    'plan.save': {
      plan: Plan;
    };
    'plan.delete': IdParams;
    'device.discover': EmptyParams;
    'device.connect': {
      address: string;
      name?: string;
    };
    'device.auto_connect': EmptyParams;
    'device.disconnect': IdParams;
    'device.frame': DeviceFrameParams;
    'device.click': DeviceClickParams;
    'run.start': {
      planId: string;
      deviceId: string;
      requestId: string;
    };
    'run.stop': IdParams;
    'run.detail': IdParams;
    'run.artifact': RunArtifactParams;
    'updates.check': ChannelParams;
    'updates.prepare': ChannelParams;
    'updates.activate': ChannelParams;
    'updates.rollback': ChannelParams;
    'settings.save': {
      settings: Settings;
    };
    'agent.message': {
      message: string;
      deviceId?: string;
    };
    'device.availability': {
      deviceId: string;
    };
    'tool.start': ToolStartParams;
    'tool.get': IdParams;
    'tool.stop': IdParams;
    'tool.config.get': ToolIdentity;
    'tool.config.save': ToolConfigParams;
    'tool.catalog': {
      clientType?: ClientType;
    };
    'schedule.list': EmptyParams;
    'schedule.save': ScheduleSaveParams;
    'schedule.delete': IdParams;
    'schedule.override': ScheduleOverrideParams;
    'schedule.cancel': IdParams;
    'schedule.host': {
      wake: {
        supported: boolean;
        status: 'disabled' | 'registered' | 'failed' | 'unsupported';
        message: string;
      };
    };
    'copilot.list': CopilotListParams;
    'copilot.get': CopilotIdentityParams;
    'copilot.export': CopilotExportParams;
    'copilot.preview': CopilotPreviewParams;
    'copilot.import': CopilotImportParams;
    'copilot.delete': IdParams;
    'copilot.workspace.get': CopilotWorkspaceParams;
    'copilot.workspace.save': CopilotWorkspaceSaveParams;
    'copilot.search': CopilotSearchParams;
    'copilot.start': CopilotStartParams;
  };
  results: {
    'app.snapshot': Snapshot;
    'logs.info': {
      directory: string;
      retentionDays: 0 | 7 | 14 | 30;
    };
    'logs.export': {
      directory: string;
      path: string;
      bytes: number;
      warnings: string[];
    };
    'logs.clean': {
      removedFiles: number;
      removedBytes: number;
      skippedFiles: number;
      warnings: string[];
    };
    'home.info': HomeInfo;
    'stages.list': StageListResult;
    'recognition.get': RecognitionResult;
    'resources.item': ItemResourceResult;
    'resources.operator': OperatorResourceResult;
    'plan.save': Plan;
    'plan.delete': {
      deleted: boolean;
    };
    'device.discover': DiscoveredDevice[];
    'device.connect': Device;
    'device.auto_connect': {
      devices: Device[];
      discovered: DiscoveredDevice[];
      diagnostics: string[];
    };
    'device.disconnect': {
      disconnected: boolean;
    };
    'device.frame': ScreenFrame;
    'device.click': {
      accepted: true;
    };
    'run.start': Run;
    'run.stop': Run;
    'run.detail': Run;
    'run.artifact': RunArtifactImage;
    'updates.check': UpdateChannel;
    'updates.prepare': UpdateChannel;
    'updates.activate': UpdateChannel;
    'updates.rollback': UpdateChannel;
    'settings.save': Settings;
    'agent.message': {
      reply: string;
      plan?: Plan;
      requiresConfirmation: boolean;
      mode: string;
    };
    'device.availability': DeviceAvailability;
    'tool.start': ToolJob;
    'tool.get': ToolJob;
    'tool.stop': ToolJob;
    'tool.config.get': ToolConfig;
    'tool.config.save': ToolConfig;
    'tool.catalog': ToolCatalog;
    'schedule.list': ScheduleList;
    'schedule.save': Schedule1;
    'schedule.delete': {
      deleted: boolean;
    };
    'schedule.override': Schedule1;
    'schedule.cancel': {
      cancelled: boolean;
    };
    'schedule.host': {
      accepted: true;
    };
    'copilot.list': {
      /**
       * @maxItems 20
       */
      items: CopilotRecord[];
      page: number;
      total: number;
      hasNext: boolean;
    };
    'copilot.get': CopilotRecord;
    'copilot.export': {
      filename: string;
      content: string;
    };
    'copilot.preview': CopilotPreview;
    'copilot.import': {
      /**
       * @maxItems 100
       */
      items: CopilotRecord[];
      /**
       * @maxItems 100
       */
      errors: {
        id: string;
        message: string;
      }[];
    };
    'copilot.delete': {
      deleted: boolean;
    };
    'copilot.workspace.get': CopilotWorkspace;
    'copilot.workspace.save': CopilotWorkspace;
    'copilot.search': CopilotSearchResult;
    'copilot.start': Run;
  };
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "EmptyParams".
 */
export interface EmptyParams {}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "StageListParams".
 */
export interface StageListParams {
  clientType?: ClientType;
  refresh?: boolean;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "RecognitionParams".
 */
export interface RecognitionParams {
  deviceId: string;
  kind: 'depot' | 'operators';
  clientType?: ClientType;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ItemResourceParams".
 */
export interface ItemResourceParams {
  itemId: string;
  clientType?: ClientType;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "OperatorResourceParams".
 */
export interface OperatorResourceParams {
  name: string;
  clientType?: ClientType;
  operatorId?: string;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Plan".
 */
export interface Plan {
  id: Id;
  name: Name;
  description: Description;
  deviceId: Deviceid;
  group: Group;
  budgets: Budgets | null;
  tasks: Tasks;
  schedule: Schedule;
  enabled: Enabled1;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Budgets".
 */
export interface Budgets {
  originium: Originium;
  medicine: Medicine;
  expedited: Expedited;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Task".
 */
export interface Task {
  type: Type;
  params: Params;
  enabled: Enabled;
}
export interface Params {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "IdParams".
 */
export interface IdParams {
  id: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "DeviceFrameParams".
 */
export interface DeviceFrameParams {
  deviceId: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "DeviceClickParams".
 */
export interface DeviceClickParams {
  deviceId: string;
  frameId: string;
  x: number;
  y: number;
  requestId: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "RunArtifactParams".
 */
export interface RunArtifactParams {
  runId: string;
  artifactId: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ChannelParams".
 */
export interface ChannelParams {
  channel: 'app' | 'core' | 'resource';
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Settings".
 */
export interface Settings {
  componentPaths?: ComponentPaths;
  componentDownload?: ComponentDownload;
  /**
   * @maxItems 100
   */
  infrastructureEstimates?: InfrastructureEstimateProfile[];
  capture?: CaptureSettings;
  connection?: ConnectionSettings;
  /**
   * @maxItems 32
   */
  deviceProfiles?: DeviceConnectionProfile[];
  /**
   * Log retention in days; zero disables automatic cleanup.
   */
  logRetentionDays?: 0 | 7 | 14 | 30;
  autoConnect: Autoconnect;
  /**
   * 启动时检查应用更新；下载和安装始终由用户确认。
   */
  autoUpdateApp?: boolean;
  appUpdateChannel?: 'stable' | 'preview';
  coreUpdateChannel?: 'stable' | 'preview';
  autoUpdateCore: Autoupdatecore;
  autoUpdateResource: Autoupdateresource;
  minimizeToTray: Minimizetotray;
  /**
   * 记住 minimizeToTray 指定的关闭方式；缺失或 false 时每次关闭窗口均询问。
   */
  rememberCloseAction?: boolean;
  theme: Theme;
  budgets: Budgets;
  model: ModelSettings;
  scheduler?: SchedulerSettings;
}
/**
 * Absolute installation/download roots. An empty string restores the application default on settings.save.
 *
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "ComponentPaths".
 */
export interface ComponentPaths {
  core: string;
  resource: string;
}
/**
 * Component download engine; defaults to bundled aria2. Empty aria2Path uses aria2c beside the packaged service, or checkout/.tools/aria2 in development; otherwise use an absolute executable path. Never searches PATH. Changes apply to subsequent downloads.
 *
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "ComponentDownload".
 */
export interface ComponentDownload {
  engine: 'builtin' | 'aria2';
  aria2Path: string;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "InfrastructureEstimateProfile".
 */
export interface InfrastructureEstimateProfile {
  deviceId: string;
  /**
   * @maxItems 20
   */
  lines: InfrastructureLine[];
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "InfrastructureLine".
 */
export interface InfrastructureLine {
  id: string;
  name: string;
  unit: string;
  hourlyRate: number;
  capacity: number;
  lastCollectedAt: string;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "CaptureSettings".
 */
export interface CaptureSettings {
  method: 'adb' | 'mumu' | 'ldplayer';
  /**
   * 连接时自动识别模拟器并配置增强截图；省略时 adb 为自动，已有增强截图为手动。
   */
  autoDetect?: boolean;
  emulatorPath: string;
  instanceIndex: number;
  mumuTouch?: boolean;
  mumuBridge?: boolean;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "ConnectionSettings".
 */
export interface ConnectionSettings {
  adbPath: string;
  address: string;
  config:
    | 'General'
    | 'BlueStacks'
    | 'MuMuEmulator12'
    | 'MuMuArm'
    | 'LDPlayer'
    | 'Nox'
    | 'XYAZ'
    | 'Compatible'
    | 'SecondResolution'
    | 'CompatMac'
    | 'CompatPOSIXShell'
    | 'Waydroid'
    | 'AVD'
    | 'Androws'
    | 'WSA';
  touchMode: 'minitouch' | 'maatouch' | 'adb' | 'MaaFwAdb';
  adbLite: boolean;
  clientType: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "DeviceConnectionProfile".
 */
export interface DeviceConnectionProfile {
  id: string;
  /**
   * 由运行中的模拟器自动发现创建；用户编辑保存后转为手动管理。
   */
  autoDetected?: boolean;
  name: string;
  address: string;
  connection: ConnectionSettings;
  capture: CaptureSettings;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "ModelSettings".
 */
export interface ModelSettings {
  provider: Provider;
  baseUrl: Baseurl;
  model: Model;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "SchedulerSettings".
 */
export interface SchedulerSettings {
  forceScheduledStart: boolean;
  showWindowBeforeForceScheduledStart: boolean;
  notifyBeforeScheduledStart: boolean;
  notificationMinutes: number;
  scheduledWakeUp: boolean;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ToolStartParams".
 */
export interface ToolStartParams {
  deviceId: string;
  kind: ToolKind;
  clientType?: ClientType;
  requestId: string;
  config?: ToolConfig;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ToolConfig".
 */
export interface ToolConfig {
  mode?: 'device' | 'manual';
  /**
   * @maxItems 5
   */
  tags?: string[];
  /**
   * @maxItems 29
   */
  targets?: {
    id: string;
    stage: string;
    itemId: string;
    quantity: number;
    medicine: number;
    stone: number;
  }[];
  updateDepot?: boolean;
  sortByProgress?: boolean;
  onlyFirst?: boolean;
  skipDuringActivity?: boolean;
  skipDuringResourceCollection?: boolean;
  autoSeries?: boolean;
  operators?: boolean;
  depot?: boolean;
  game?: 'pixelpaint' | 'secretfront';
  ending?: 'A' | 'B' | 'C' | 'D' | 'E';
  branch?: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ToolIdentity".
 */
export interface ToolIdentity {
  deviceId: string;
  kind: ToolKind;
  clientType?: ClientType;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ToolConfigParams".
 */
export interface ToolConfigParams {
  deviceId: string;
  kind: ToolKind;
  clientType?: ClientType;
  config: ToolConfig;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ScheduleSaveParams".
 */
export interface ScheduleSaveParams {
  schedule: Schedule1;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "Schedule".
 */
export interface Schedule1 {
  id: string;
  planId: string;
  deviceId: string;
  hour: number;
  minute: number;
  enabled: boolean;
  override?: 'enable' | 'skip' | null;
  nextAt?: string | null;
  last?: {
    [k: string]: unknown;
  } | null;
  disabledReason?: string | null;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ScheduleOverrideParams".
 */
export interface ScheduleOverrideParams {
  id: string;
  mode: 'enable' | 'skip' | 'clear';
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotListParams".
 */
export interface CopilotListParams {
  kind?: CopilotKind;
  page?: number;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotIdentityParams".
 */
export interface CopilotIdentityParams {
  id?: string;
  versionId?: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotExportParams".
 */
export interface CopilotExportParams {
  versionId: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotPreviewParams".
 */
export interface CopilotPreviewParams {
  content?: string;
  name?: string;
  code?: string;
  planId?: string;
  taskIndex?: number;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotImportParams".
 */
export interface CopilotImportParams {
  previewId: string;
  /**
   * @maxItems 100
   */
  entryIds?: string[];
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotWorkspaceParams".
 */
export interface CopilotWorkspaceParams {
  kind: CopilotKind;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotWorkspaceSaveParams".
 */
export interface CopilotWorkspaceSaveParams {
  workspace: CopilotWorkspace;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotWorkspace".
 */
export interface CopilotWorkspace {
  kind: CopilotKind;
  /**
   * @maxItems 100
   */
  queue: CopilotQueueEntry[];
  options: CopilotOptions;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotQueueEntry".
 */
export interface CopilotQueueEntry {
  id: string;
  versionId: string;
  enabled: boolean;
  isRaid: boolean;
  navName: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotOptions".
 */
export interface CopilotOptions {
  loopTimes: number;
  formation: boolean;
  formationIndex: number;
  addTrust: boolean;
  ignoreRequirements: boolean;
  supportUnitName: string;
  /**
   * @maxItems 12
   */
  additionalOperators: {
    name: string;
    skill: number;
  }[];
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotSearchParams".
 */
export interface CopilotSearchParams {
  target: 'copilot' | 'set';
  keyword?: string;
  page?: number;
  stage?: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotStartParams".
 */
export interface CopilotStartParams {
  kind: CopilotKind;
  deviceId: string;
  requestId: string;
}
export interface Snapshot {
  mode: Mode;
  devices: Devices;
  plans: Plans;
  runs: Runs;
  updates: Updates;
  settings: Settings;
  events: Events;
  toolJobs?: ToolJobSummary[];
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Device".
 */
export interface Device {
  connectionProfileId?: string;
  connectionError?: string;
  id: Id1;
  name: Name1;
  address: Address;
  state: State;
  coreVersion: Coreversion;
  captureMethod?: string;
  dataSync?: UserDataSync;
  resourceVersion: Resourceversion;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "UserDataSync".
 */
export interface UserDataSync {
  operatorsAt: string | null;
  depotAt: string | null;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Run".
 */
export interface Run {
  planName?: string;
  /**
   * @maxItems 31
   */
  tasks?: RunTask[];
  id: Id2;
  planId: Planid;
  deviceId: Deviceid1;
  status: Status;
  progress: Progress;
  message: Message;
  startedAt: Startedat;
  finishedAt: Finishedat;
  scheduleId?: string;
  scheduledFor?: string;
  source?: 'plan' | 'copilot';
  sourceName?: string;
  /**
   * @maxItems 100
   */
  copilotEntries?: CopilotRunEntry[];
  copilotKind?: 'Copilot' | 'SSSCopilot' | 'ParadoxCopilot';
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "RunTask".
 */
export interface RunTask {
  index: number;
  type: string;
  status: 'waiting' | 'running' | 'completed' | 'failed' | 'stopped' | 'skipped';
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  /**
   * @maxItems 200
   */
  drops: RunDrop[];
  /**
   * @maxItems 100
   */
  infrastructure: RunInfrastructure[];
  /**
   * @maxItems 3
   */
  artifacts: RunArtifact[];
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "RunDrop".
 */
export interface RunDrop {
  itemId: string;
  name: string;
  quantity: number;
  stage: string;
  at: string;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "RunInfrastructure".
 */
export interface RunInfrastructure {
  facility: string;
  room: number;
  /**
   * @maxItems 20
   */
  operators: string[];
  /**
   * Latest staffing evidence; configured names are not an independently recognized final roster.
   */
  staffingStatus?: 'planned' | 'confirmed' | 'unavailable';
  product: string;
  message: string;
  at: string;
}
/**
 * Bounded local observation captured after a native result callback, not the original recognition image. PNG bytes are fetched separately and never stored in snapshots or SQLite.
 *
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "RunArtifact".
 */
export interface RunArtifact {
  id: string;
  kind: 'screenshot';
  label: string;
  capturedAt: string;
  width: number;
  height: number;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "CopilotRunEntry".
 */
export interface CopilotRunEntry {
  id: string;
  versionId: string;
  title: string;
  nativeId: number;
  status: 'waiting' | 'running' | 'completed' | 'failed' | 'stopped' | 'skipped';
  verdict: 'unknown' | 'success' | 'failure';
  message: string;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "UpdateChannel".
 */
export interface UpdateChannel {
  checkedAt?: string;
  /**
   * 此安装形式是否支持签名自动更新。
   */
  appCanInstall?: boolean;
  appRelease?: {
    url: string;
    notes: string;
    publishedAt: string;
    prerelease: boolean;
  };
  installDirectory?: string;
  /**
   * @maxItems 6
   */
  resourceActivities?: ResourceActivityVersion[];
  id: Id3;
  currentVersion: Currentversion;
  latestVersion: Latestversion;
  status: Status1;
  progress: Progress1;
  message: Message1;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "ResourceActivityVersion".
 */
export interface ResourceActivityVersion {
  clientType: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
  name: string | null;
  lastUpdated: string | null;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Event".
 */
export interface Event {
  id: Id4;
  type: Type1;
  message: Message2;
  createdAt: Createdat;
  data: Data;
}
export interface Data {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "ToolJobSummary".
 */
export interface ToolJobSummary {
  id: string;
  kind: 'depot' | 'operators' | 'recruit' | 'inventory' | 'data' | 'games';
  deviceId: string;
  clientType: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
  status: 'running' | 'completed' | 'failed' | 'stopped';
  progress: number;
  message: string;
  startedAt: string;
  finishedAt: string | null;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "HomeInfo".
 */
export interface HomeInfo {
  generatedAt: string;
  clientType: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
  gameDate: string;
  weekday: number;
  nextDailyResetAt: string;
  nextWeeklyResetAt: string;
  activityCatalog: StageListResult;
  annihilation: {
    kind: 'weekly-reset' | 'weekly-last-day' | 'weekly';
    message: string;
  };
  infrastructure: {
    deviceId: string | null;
    message: string;
    lines: InfrastructureEstimate[];
  };
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "StageListResult".
 */
export interface StageListResult {
  clientType: ClientType;
  resourceVersion: string | null;
  source: 'installed' | 'builtin';
  generatedAt: string;
  /**
   * @maxItems 2000
   */
  stages: StageOption[];
  /**
   * @maxItems 100
   */
  activities: StageActivity[];
  calendar: CalendarStatus;
  message: string;
  diagnostics: string[];
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "StageOption".
 */
export interface StageOption {
  value: string;
  label: string;
  category: 'default' | 'activity' | 'permanent';
  available: boolean;
  tip?: string;
  activityId?: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "StageActivity".
 */
export interface StageActivity {
  id: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
  clientType: ClientType;
  status: 'active' | 'upcoming' | 'unknown';
  source: 'official-calendar' | 'activity-metadata' | 'resource-version';
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CalendarStatus".
 */
export interface CalendarStatus {
  source: 'official-cache' | 'installed' | 'unavailable';
  url: string | null;
  fetchedAt: string | null;
  checkedAt: string | null;
  nextRefreshAt: string | null;
  stale: boolean;
  refreshing: boolean;
  error: string | null;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "InfrastructureEstimate".
 */
export interface InfrastructureEstimate {
  id: string;
  name: string;
  unit: string;
  estimatedQuantity: number | null;
  capacity: number;
  hourlyRate: number;
  lastCollectedAt: string;
  full: boolean;
  fullAt: string | null;
  error: string | null;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "RecognitionResult".
 */
export interface RecognitionResult {
  deviceId: string;
  kind: 'depot' | 'operators';
  clientType: ClientType;
  collectedAt: string | null;
  runId: string | null;
  /**
   * @maxItems 10000
   */
  items: RecognizedItem[];
  /**
   * @maxItems 2000
   */
  operators: RecognizedOperator[];
  estimatedAt?: string | null;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "RecognizedItem".
 */
export interface RecognizedItem {
  id: string;
  name: string;
  quantity: number;
  estimatedQuantity?: number;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "RecognizedOperator".
 */
export interface RecognizedOperator {
  id: string;
  name: string;
  own: boolean;
  elite: number;
  level: number;
  /**
   * MaaCore potential: 1-based; negative values preserve unknown results.
   */
  potential: number;
  /**
   * MaaCore rarity: 1-based star count; negative values preserve unknown results.
   */
  rarity: number;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ItemResourceResult".
 */
export interface ItemResourceResult {
  itemId: string;
  name: string | null;
  mimeType: 'image/png' | null;
  data: string | null;
  resourceVersion: string | null;
}
/**
 * Bounded artwork and metadata from the active installed MaaResource; missing or ambiguous names keep text and known rarity without guessing an avatar.
 *
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "OperatorResourceResult".
 */
export interface OperatorResourceResult {
  name: string;
  id: string | null;
  /**
   * 1-based star count; null means unknown or conflicting candidates.
   */
  rarity: number | null;
  mimeType: 'image/png' | null;
  data: string | null;
  resourceVersion: string | null;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "DiscoveredDevice".
 */
export interface DiscoveredDevice {
  address: string;
  name: string;
  adbState: string;
}
/**
 * Transient MaaCore preview PNG. Its width/height are the click coordinate space; image bytes never enter snapshots or persistence.
 *
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ScreenFrame".
 */
export interface ScreenFrame {
  deviceId: string;
  frameId: string;
  capturedAt: string;
  width: number;
  height: number;
  mimeType: 'image/png';
  data: string;
  canControl: boolean;
  latencyMs: number;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "RunArtifactImage".
 */
export interface RunArtifactImage {
  mimeType: 'image/png';
  data: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "DeviceAvailability".
 */
export interface DeviceAvailability {
  deviceId: string;
  available: boolean;
  connected: boolean;
  reason: string;
  owner: 'none' | 'run' | 'tool' | 'manual' | 'connecting' | 'updates' | 'runtime';
  ownerId: string | null;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ToolJob".
 */
export interface ToolJob {
  id: string;
  kind: ToolKind;
  deviceId: string;
  clientType: ClientType;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  progress: number;
  message: string;
  startedAt: string;
  finishedAt: string | null;
  result?: {
    [k: string]: unknown;
  };
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ToolCatalog".
 */
export interface ToolCatalog {
  tags: string[];
  /**
   * @maxItems 2000
   */
  operators: {
    id: string;
    name: string;
    rarity: number;
    tags: string[];
  }[];
  games: ('pixelpaint' | 'secretfront')[];
  resourceVersion: string | null;
  diagnostics: string[];
  topOperatorTag?: string | null;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ScheduleList".
 */
export interface ScheduleList {
  schedules: Schedule1[];
  occurrences: {
    [k: string]: unknown;
  }[];
  timezone: string;
  wake: {
    [k: string]: unknown;
  };
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotRecord".
 */
export interface CopilotRecord {
  id: string;
  versionId: string;
  kind: CopilotKind;
  title: string;
  stageName: string;
  author: string;
  description: string;
  minimumCoreVersion: string;
  /**
   * @maxItems 100
   */
  operators: CopilotOperator[];
  /**
   * @maxItems 20
   */
  videos: string[];
  source: CopilotSource;
  createdAt: string;
  compatibility: CopilotCompatibility;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotOperator".
 */
export interface CopilotOperator {
  name: string;
  skill?: number;
  requirements?: {
    [k: string]: unknown;
  };
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotSource".
 */
export interface CopilotSource {
  kind: 'local' | 'community' | 'legacy';
  name: string;
  url: string;
  communityId?: string;
  setId?: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotCompatibility".
 */
export interface CopilotCompatibility {
  status: 'ready' | 'unverified' | 'unsupported';
  /**
   * @maxItems 20
   */
  reasons: string[];
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotPreview".
 */
export interface CopilotPreview {
  id: string;
  title: string;
  /**
   * @maxItems 100
   */
  entries: CopilotPreviewEntry[];
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotPreviewEntry".
 */
export interface CopilotPreviewEntry {
  id: string;
  record: CopilotRecord | null;
  error: string | null;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotSearchResult".
 */
export interface CopilotSearchResult {
  /**
   * @maxItems 20
   */
  items: CopilotSearchItem[];
  page: number;
  hasNext: boolean;
  total: number;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotSearchItem".
 */
export interface CopilotSearchItem {
  id: string;
  title: string;
  description: string;
  author: string;
  url: string;
  kind?: CopilotKind;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "RpcRequest".
 */
export interface RpcRequest {
  jsonrpc: '2.0';
  method: string;
  id?: string | number | null;
  params?: {
    [k: string]: unknown;
  };
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "RpcEvent".
 */
export interface RpcEvent {
  jsonrpc: '2.0';
  method: 'runtime.event';
  params: Event;
}
