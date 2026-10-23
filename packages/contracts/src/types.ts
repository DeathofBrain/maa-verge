/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */

export type Mode = 'native';
export type Id = string;
export type Name = string;
export type Address = string;
export type State = 'idle' | 'running' | 'offline';
export type Coreversion = string | null;
export type Resourceversion = string | null;
export type Devices = Device[];
export type Id1 = string;
export type Name1 = string;
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
export type Autoconnect = boolean;
export type Autoupdatecore = boolean;
export type Autoupdateresource = boolean;
export type Minimizetotray = boolean;
export type Theme = 'dark' | 'light' | 'system';
export type Provider = string;
export type Baseurl = string;
export type Model = string;
export type Id4 = number;
export type Type1 = string;
export type Message2 = string;
export type Createdat = string;
export type Events = Event[];

export interface Snapshot {
  mode: Mode;
  devices: Devices;
  plans: Plans;
  runs: Runs;
  updates: Updates;
  settings: Settings;
  events: Events;
}
export interface Device {
  connectionProfileId?: string;
  connectionError?: string;
  id: Id;
  name: Name;
  address: Address;
  state: State;
  coreVersion: Coreversion;
  captureMethod?: string;
  dataSync?: UserDataSync;
  resourceVersion: Resourceversion;
}
export interface UserDataSync {
  operatorsAt: string | null;
  depotAt: string | null;
}
export interface Plan {
  id: Id1;
  name: Name1;
  description: Description;
  deviceId: Deviceid;
  group: Group;
  budgets: Budgets | null;
  tasks: Tasks;
  schedule: Schedule;
  enabled: Enabled1;
}
export interface Budgets {
  originium: Originium;
  medicine: Medicine;
  expedited: Expedited;
}
export interface Task {
  type: Type;
  params: Params;
  enabled: Enabled;
}
export interface Params {
  [k: string]: unknown;
}
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
export interface RunDrop {
  itemId: string;
  name: string;
  quantity: number;
  stage: string;
  at: string;
}
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
 */
export interface RunArtifact {
  id: string;
  kind: 'screenshot';
  label: string;
  capturedAt: string;
  width: number;
  height: number;
}
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
export interface ResourceActivityVersion {
  clientType: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
  name: string | null;
  lastUpdated: string | null;
}
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
  theme: Theme;
  budgets: Budgets;
  model: ModelSettings;
}
/**
 * Absolute installation/download roots. An empty string restores the application default on settings.save.
 */
export interface ComponentPaths {
  core: string;
  resource: string;
}
/**
 * Component download engine. Empty aria2Path resolves aria2c from PATH; otherwise use an absolute executable path. Changes apply to subsequent downloads.
 */
export interface ComponentDownload {
  engine: 'builtin' | 'aria2';
  aria2Path: string;
}
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
export interface InfrastructureLine {
  id: string;
  name: string;
  unit: string;
  hourlyRate: number;
  capacity: number;
  lastCollectedAt: string;
}
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
export interface ModelSettings {
  provider: Provider;
  baseUrl: Baseurl;
  model: Model;
}
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
