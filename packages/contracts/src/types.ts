/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */

export type Mode = 'native';
export type Id = string;
export type Name = string;
export type Address = string;
export type State = 'idle' | 'running' | 'offline';
export type Resourceversion = string | null;
export type FrameworkVersion = string | null;
export type Devices = Device[];
export type Id1 = string;
export type Name1 = string;
export type Description = string;
/**
 * 旧版单设备绑定兼容字段；规范化后为 deviceIds 第一项或 null。
 */
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
/**
 * 旧版兼容字段；服务读取和保存时统一返回 true，历史值不影响任务表执行。单项任务与定时规则各自保留启停设置。
 */
export type Enabled1 = boolean;
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
export type Id3 = 'app' | 'framework' | 'resource';
export type Currentversion = string;
export type Latestversion = string | null;
export type Status1 =
  'idle' | 'checking' | 'available' | 'downloading' | 'staged' | 'waiting_idle' | 'active' | 'failed';
export type Progress1 = number;
export type Message1 = string;
export type Updates = UpdateChannel[];
export type Autoconnect = boolean;
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
  toolJobs?: ToolJobSummary[];
}
export interface Device {
  connectionProfileId?: string;
  connectionError?: string;
  id: Id;
  name: Name;
  address: Address;
  state: State;
  captureMethod?: string;
  dataSync?: UserDataSync;
  resourceVersion: Resourceversion;
  frameworkVersion: FrameworkVersion;
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
  /**
   * 任务表绑定的设备列表；一台设备可被多张表绑定。空数组表示不预绑定，执行时选择设备。字段缺省时沿用旧版 deviceId。
   *
   * @maxItems 100
   */
  deviceIds?: string[];
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
  engine?: 'maafw';
  frameworkVersion?: string | null;
  resourceVersion?: string | null;
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
  artifacts: RunArtifact[];
}
export interface RunDrop {
  itemId: string;
  name: string;
  quantity: number;
  stage: string;
  /**
   * Framework reports only explicitly read target items from visible rewards, not a complete inventory or all drops.
   */
  scope?: 'visible_rewards';
  at: string;
}
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
 * Bounded local observation captured after a verified or unknown workflow result, not the original recognition image. PNG bytes are fetched separately and never stored in snapshots or SQLite.
 */
export interface RunArtifact {
  id: string;
  kind: 'screenshot';
  label: string;
  capturedAt: string;
  width: number;
  height: number;
}
export interface CopilotRunEntry {
  id: string;
  versionId: string;
  title: string;
  nativeId: number;
  status: 'waiting' | 'running' | 'completed' | 'failed' | 'stopped' | 'skipped';
  verdict: 'unknown' | 'success' | 'failure';
  message: string;
}
export interface UpdateChannel {
  checkedAt?: string;
  /**
   * 此安装形式是否支持签名自动更新。
   */
  appCanInstall?: boolean;
  /**
   * 已验证的应用更新是否安排在下次启动安装；失败尝试保留包但不会自动循环安装。
   */
  appInstallOnStartup?: boolean;
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
  /**
   * 当前网络传输速度，单位为字节/秒；非传输阶段省略。
   */
  downloadSpeedBytesPerSecond?: number;
  /**
   * 本次更新包实际选择的下载来源；尚未选定来源时省略。
   */
  downloadSource?: 'MirrorChyan' | 'GitHub';
}
export interface ResourceActivityVersion {
  clientType: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
  name: string | null;
  lastUpdated: string | null;
}
export interface Settings {
  componentPaths?: ComponentPaths;
  downloadProxy?: DownloadProxySettings;
  mirrorChyan?: MirrorChyanSettings;
  notifications?: NotificationSettings;
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
   * 启动时联网检查应用更新；下载由用户确认，已下载并验证的更新在下次启动时自动安装。
   */
  autoUpdateApp?: boolean;
  appUpdateChannel?: 'stable' | 'preview';
  autoUpdateResource: Autoupdateresource;
  /**
   * 独立检查和准备兼容清单中的稳定版 MaaFramework；缺省启用，不跟随应用或游戏资源开关。
   */
  autoUpdateFramework?: boolean;
  minimizeToTray: Minimizetotray;
  /**
   * 记住 minimizeToTray 指定的关闭方式；缺失或 false 时每次关闭窗口均询问。
   */
  rememberCloseAction?: boolean;
  theme: Theme;
  budgets: Budgets;
  model: ModelSettings;
  scheduler?: SchedulerSettings;
  copilotStorage?: CopilotStorage;
}
/**
 * Absolute installation/download roots. An empty string restores the application default on settings.save.
 */
export interface ComponentPaths {
  resource: string;
  /**
   * MaaFramework SDK installation/download root. Missing in legacy settings; the application supplies its independent default.
   */
  framework?: string;
}
/**
 * Shared HTTP proxy policy for application, MaaFramework and MaaResource metadata checks and update downloads. Missing settings use auto mode. Auto may fall back to direct access; manual failures remain visible.
 */
export interface DownloadProxySettings {
  mode: 'auto' | 'manual' | 'direct';
  /**
   * Manual HTTP/HTTPS proxy address. settings.save accepts host:port with an implicit http:// scheme and normalizes it to a complete URL; other modes clear this field. A root slash is allowed; other paths, queries and fragments are rejected.
   */
  url: string;
}
export interface MirrorChyanSettings {
  enabled: boolean;
  /**
   * Shared MirrorChyan CDK for the application, MaaFramework and MaaResource. Persist locally, mask in the UI and redact from logs and configuration exports.
   */
  cdk: string;
}
export interface NotificationSettings {
  enabled: boolean;
  runResults: boolean;
  deviceErrors: boolean;
  updates: boolean;
  schedules: boolean;
}
export interface InfrastructureEstimateProfile {
  deviceId: string;
  /**
   * @maxItems 20
   */
  lines: InfrastructureLine[];
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
  touchMode: 'minitouch' | 'maatouch' | 'adb';
  framework?: FrameworkConnectionSettings;
  adbLite: boolean;
  clientType: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
}
/**
 * MaaFramework 设备截图与触控配置；旧连接字段只供迁移读取。
 */
export interface FrameworkConnectionSettings {
  /**
   * 对应 MaaFramework Maatouch、MinitouchAndAdbKey、AdbShell、EmulatorExtras 单一输入方式，独立于截图。
   */
  touchMode: 'maatouch' | 'minitouch' | 'adb' | 'emulator-extras';
  capture: FrameworkCaptureSettings;
  touchExtras?: FrameworkTouchExtras;
}
export interface FrameworkCaptureSettings {
  /**
   * 自动核对 MuMu／雷电运行实例与 SDK，并探测 AVD 增强接口；截图选择不修改触控模式。
   */
  method: 'auto' | 'adb' | 'mumu' | 'ldplayer' | 'avd';
  emulatorPath: string;
  instanceIndex: number;
}
/**
 * MuMu 增强触控的独立实例参数；省略时核对当前设备对应的运行实例。
 */
export interface FrameworkTouchExtras {
  emulatorPath: string;
  instanceIndex: number;
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
export interface SchedulerSettings {
  forceScheduledStart: boolean;
  showWindowBeforeForceScheduledStart: boolean;
  notifyBeforeScheduledStart: boolean;
  notificationMinutes: number;
  scheduledWakeUp: boolean;
}
export interface CopilotStorage {
  /**
   * Absolute directory for imported library JSON copies. Empty restores application cache/copilot.
   */
  directory: string;
  deleteJsonFiles: boolean;
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

export interface DesktopUninstallInfo {
  available: boolean;
  reason: string;
  application: string;
  /**
   * @minItems 2
   * @maxItems 2
   */
  componentDirectories: string[];
  configurationDirectory: string;
}
