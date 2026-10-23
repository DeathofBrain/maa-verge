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
/**
 * @minItems 1
 * @maxItems 30
 */
export type Tasks = [Task, ...Task[]];
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
export type Planid = string;
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
  autoUpdateCore: Autoupdatecore;
  autoUpdateResource: Autoupdateresource;
  minimizeToTray: Minimizetotray;
  theme: Theme;
  budgets: Budgets;
  model: ModelSettings;
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
 * Component download engine. Empty aria2Path resolves aria2c from PATH; otherwise use an absolute executable path. Changes apply to subsequent downloads.
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
  lines:
    | []
    | [InfrastructureLine]
    | [InfrastructureLine, InfrastructureLine]
    | [InfrastructureLine, InfrastructureLine, InfrastructureLine]
    | [InfrastructureLine, InfrastructureLine, InfrastructureLine, InfrastructureLine]
    | [InfrastructureLine, InfrastructureLine, InfrastructureLine, InfrastructureLine, InfrastructureLine]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ]
    | [
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine,
        InfrastructureLine
      ];
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
export interface Snapshot {
  mode: Mode;
  devices: Devices;
  plans: Plans;
  runs: Runs;
  updates: Updates;
  settings: Settings;
  events: Events;
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
   * @maxItems 30
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
  artifacts: [] | [RunArtifact] | [RunArtifact, RunArtifact] | [RunArtifact, RunArtifact, RunArtifact];
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
  operators:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ];
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
 * via the `definition` "UpdateChannel".
 */
export interface UpdateChannel {
  installDirectory?: string;
  /**
   * @maxItems 6
   */
  resourceActivities?:
    | []
    | [ResourceActivityVersion]
    | [ResourceActivityVersion, ResourceActivityVersion]
    | [ResourceActivityVersion, ResourceActivityVersion, ResourceActivityVersion]
    | [ResourceActivityVersion, ResourceActivityVersion, ResourceActivityVersion, ResourceActivityVersion]
    | [
        ResourceActivityVersion,
        ResourceActivityVersion,
        ResourceActivityVersion,
        ResourceActivityVersion,
        ResourceActivityVersion
      ]
    | [
        ResourceActivityVersion,
        ResourceActivityVersion,
        ResourceActivityVersion,
        ResourceActivityVersion,
        ResourceActivityVersion,
        ResourceActivityVersion
      ];
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
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "RecognizedItem".
 */
export interface RecognizedItem {
  id: string;
  name: string;
  quantity: number;
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
