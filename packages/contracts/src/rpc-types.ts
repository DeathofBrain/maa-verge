/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */

/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "ClientType".
 */
export type ClientType = 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
export type Id = string;
export type Name = string;
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
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotDeleteParams".
 */
export type CopilotDeleteParams = {
  id?: string;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  ids?: string[];
  all?: true;
} & CopilotDeleteParams1;
export type CopilotDeleteParams1 =
  | {
      id: string;
    }
  | {
      /**
       * @minItems 1
       * @maxItems 1000
       */
      ids: string[];
    }
  | {
      all: true;
    };
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotRatingValue".
 */
export type CopilotRatingValue = 'none' | 'like' | 'dislike';
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "KnowledgeKind".
 */
export type KnowledgeKind =
  'operator' | 'item' | 'stage' | 'recruitment' | 'infrastructure' | 'document' | 'capability';
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
/**
 * 原始作业 difficulty 位标志：0 未设置，1 普通，2 突袭，3 均支持；缺省或无效值不得推断支持难度。
 *
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotDifficulty".
 */
export type CopilotDifficulty = 0 | 1 | 2 | 3;
/**
 * Host-only application update operations. This definition is deliberately absent from the public RPC parameter and result maps; callers cannot supply URLs or output paths.
 *
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "HostUpdateParams".
 */
export type HostUpdateParams =
  | {
      operation: 'releases';
      operationId: string;
      page: number;
    }
  | {
      operation: 'manifest';
      operationId: string;
      tag: string;
    }
  | {
      operation: 'download';
      operationId: string;
      tag: string;
      version: string;
      name: string;
      size: number;
      digest?: string;
    }
  | {
      operation: 'cancel';
      operationId: string;
    };

export interface RpcContract {
  params: {
    'app.snapshot': EmptyParams;
    'logs.info': EmptyParams;
    'logs.export': EmptyParams;
    'logs.clean': EmptyParams;
    'logs.delete': LogDeleteParams;
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
    'device.delete': DeviceDeleteParams;
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
    'copilot.delete': CopilotDeleteParams;
    'copilot.workspace.get': CopilotWorkspaceParams;
    'copilot.workspace.save': CopilotWorkspaceSaveParams;
    'copilot.search': CopilotSearchParams;
    'copilot.stages': EmptyParams;
    'copilot.start': CopilotStartParams;
    'copilot.rating.get': CopilotRatingParams;
    'copilot.rating.set': CopilotRatingSetParams;
    'copilot.category.list': EmptyParams;
    'copilot.category.save': CopilotCategorySaveParams;
    'copilot.category.delete': CopilotCategoryDeleteParams;
    'copilot.category.assign': CopilotCategoryAssignParams;
    'copilot.storage.info': EmptyParams;
    'knowledge.status': KnowledgeClientParams;
    'knowledge.search': KnowledgeSearchParams;
    'account.snapshot.get': AccountSnapshotParams;
    'account.snapshot.list': AccountSnapshotListParams;
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
    'logs.delete': {
      deleted: number;
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
    'device.delete': {
      deletedDeviceIds: string[];
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
      /**
       * 可与原始 JSON 一同保存的来源和署名旁文件；不表示已取得转载授权或适用应用许可证。
       */
      attribution: {
        filename: string;
        content: string;
      };
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
      deletedCount: number;
    };
    'copilot.workspace.get': CopilotWorkspace;
    'copilot.workspace.save': CopilotWorkspace;
    'copilot.search': CopilotSearchResult;
    'copilot.stages': CopilotStagesResult;
    'copilot.start': Run;
    'copilot.rating.get': CopilotRating;
    'copilot.rating.set': CopilotRating;
    'copilot.category.list': {
      /**
       * @maxItems 500
       */
      items: CopilotCategory[];
    };
    'copilot.category.save': CopilotCategory;
    'copilot.category.delete': {
      deleted: boolean;
      deletedCount: number;
    };
    'copilot.category.assign': {
      updated: number;
    };
    'copilot.storage.info': {
      directory: string;
    };
    'knowledge.status': KnowledgeStatus;
    'knowledge.search': KnowledgeSearchResult;
    'account.snapshot.get': AccountKnowledgeSnapshot | null;
    'account.snapshot.list': AccountSnapshotListResult;
  };
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "EmptyParams".
 */
export interface EmptyParams {}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "LogDeleteParams".
 */
export interface LogDeleteParams {
  /**
   * @minItems 1
   * @maxItems 1000
   */
  ids: number[];
}
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
 * via the `definition` "DeviceDeleteParams".
 */
export interface DeviceDeleteParams {
  /**
   * @minItems 1
   * @maxItems 1000
   */
  deviceIds: string[];
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
  copilotStorage?: CopilotStorage;
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
 * Shared HTTP proxy policy for application, MaaCore and MaaResource metadata checks and update downloads. Missing settings use auto mode. Auto may fall back to direct access; manual failures remain visible.
 *
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "DownloadProxySettings".
 */
export interface DownloadProxySettings {
  mode: 'auto' | 'manual' | 'direct';
  /**
   * Manual HTTP/HTTPS proxy address. settings.save accepts host:port with an implicit http:// scheme and normalizes it to a complete URL; other modes clear this field. A root slash is allowed; other paths, queries and fragments are rejected.
   */
  url: string;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "MirrorChyanSettings".
 */
export interface MirrorChyanSettings {
  enabled: boolean;
  /**
   * Shared MirrorChyan CDK for the application, MaaCore and MaaResource. Persist locally, mask in the UI and redact from logs and configuration exports.
   */
  cdk: string;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "NotificationSettings".
 */
export interface NotificationSettings {
  enabled: boolean;
  runResults: boolean;
  deviceErrors: boolean;
  updates: boolean;
  schedules: boolean;
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
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "CopilotStorage".
 */
export interface CopilotStorage {
  /**
   * Absolute directory for imported library JSON copies. Empty restores application cache/copilot.
   */
  directory: string;
  deleteJsonFiles: boolean;
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
  /**
   * 缺省列出全部分类，null 仅未分类，字符串按分类筛选；筛选先于分页。
   */
  categoryId?: string | null;
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
  /**
   * 选择同一原始 JSON 的具体导入来源，必须与 versionId 匹配；缺省沿用版本最初来源。
   */
  id?: string;
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
  /**
   * 默认关闭；仅对启动快照绑定的社区作业，在完整通关确认后自动点赞，永不自动点踩。
   */
  autoLikeOnSuccess?: boolean;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotSearchParams".
 */
export interface CopilotSearchParams {
  target: 'copilot' | 'set';
  /**
   * 社区作业按热度、最新编号或访问量降序排列，缺省按热度；作业集不使用此字段。
   */
  orderBy?: 'hot' | 'id' | 'views';
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
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotRatingParams".
 */
export interface CopilotRatingParams {
  versionId: string;
  recordId?: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotRatingSetParams".
 */
export interface CopilotRatingSetParams {
  versionId: string;
  recordId?: string;
  rating: CopilotRatingValue;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotCategorySaveParams".
 */
export interface CopilotCategorySaveParams {
  id?: string;
  name: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotCategoryDeleteParams".
 */
export interface CopilotCategoryDeleteParams {
  id: string;
  deleteCopilots?: boolean;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotCategoryAssignParams".
 */
export interface CopilotCategoryAssignParams {
  /**
   * @minItems 1
   * @maxItems 100
   */
  ids: string[];
  categoryId: string | null;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "KnowledgeClientParams".
 */
export interface KnowledgeClientParams {
  clientType?: ClientType;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "KnowledgeSearchParams".
 */
export interface KnowledgeSearchParams {
  clientType?: ClientType;
  kind?: KnowledgeKind;
  query?: string;
  id?: string;
  offset?: number;
  limit?: number;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "AccountSnapshotParams".
 */
export interface AccountSnapshotParams {
  deviceId: string;
  clientType?: ClientType;
  kind: 'depot' | 'operators';
  snapshotId?: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "AccountSnapshotListParams".
 */
export interface AccountSnapshotListParams {
  deviceId: string;
  clientType?: ClientType;
  kind?: 'depot' | 'operators';
  offset?: number;
  limit?: number;
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
  /**
   * 仅原始作业 JSON 中显式的内容署名；不得由社区上传者或作业集创建者推断。
   */
  author: string;
  /**
   * 社区服务提供的上传者（作业集搜索为创建者），不等同内容作者；兼容旧记录缺省。
   */
  uploader?: string;
  description: string;
  minimumCoreVersion: string;
  /**
   * @maxItems 2000
   */
  operators: CopilotOperator[];
  /**
   * @maxItems 20
   */
  videos: string[];
  source: CopilotSource;
  createdAt: string;
  compatibility: CopilotCompatibility;
  /**
   * 本地库分类；缺省或 null 为未分类，不写入原始作业 JSON。
   */
  categoryId?: string | null;
  difficulty?: CopilotDifficulty;
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
  /**
   * 组内任选一名；缺省表示独立必需干员。
   */
  group?: string;
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
  /**
   * 仅原始作业 JSON 中显式的内容署名；不得由社区上传者或作业集创建者推断。
   */
  author: string;
  /**
   * 社区服务提供的上传者（作业集搜索为创建者），不等同内容作者；兼容旧记录缺省。
   */
  uploader?: string;
  url: string;
  kind?: CopilotKind;
  /**
   * 从社区搜索摘要解析的干员及编组要求；摘要不可解析或作业集条目时省略，不额外请求详情。
   *
   * @maxItems 2000
   */
  operators?: CopilotOperator[];
  /**
   * 作业关卡标识；当前已安装资源可精确映射时展示关卡编号，否则保留原值。
   */
  stageName?: string;
  difficulty?: CopilotDifficulty;
}
/**
 * 当前启用资源中可唯一映射到社区关卡标识的地图编号；不受活动开放时间或刷图导航预设限制。
 *
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotStagesResult".
 */
export interface CopilotStagesResult {
  /**
   * @maxItems 50000
   */
  stages: {
    value: string;
    label: string;
  }[];
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotRating".
 */
export interface CopilotRating {
  communityId: string;
  likes: number;
  dislikes: number;
  rating: CopilotRatingValue;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "CopilotCategory".
 */
export interface CopilotCategory {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "KnowledgeStatus".
 */
export interface KnowledgeStatus {
  parserVersion: number;
  clientType: ClientType;
  coreVersion: string | null;
  resourceVersion: string | null;
  fingerprint: string;
  productFingerprint: string;
  counts: {
    operator: number;
    item: number;
    stage: number;
    recruitment: number;
    infrastructure: number;
    document: number;
    capability: number;
  };
  /**
   * @maxItems 30
   */
  sources: KnowledgeSource[];
  /**
   * @maxItems 100
   */
  diagnostics: string[];
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "KnowledgeSource".
 */
export interface KnowledgeSource {
  file: string;
  sha256: string | null;
  status: 'available' | 'missing' | 'invalid';
  records: number;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "KnowledgeSearchResult".
 */
export interface KnowledgeSearchResult {
  clientType: ClientType;
  fingerprint: string;
  productFingerprint: string;
  /**
   * @maxItems 50
   */
  records: KnowledgeRecord[];
  total: number;
  offset: number;
  limit: number;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "KnowledgeRecord".
 */
export interface KnowledgeRecord {
  key: string;
  kind: KnowledgeKind;
  id: string;
  name: string;
  /**
   * @maxItems 100
   */
  aliases: string[];
  text: string;
  data: {
    [k: string]: unknown;
  };
  /**
   * @maxItems 1000
   */
  relations: {
    predicate: string;
    targetKind: KnowledgeKind;
    targetId: string;
  }[];
  source: {
    file: string;
    pointer: string;
    sha256: string;
  };
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "AccountKnowledgeSnapshot".
 */
export interface AccountKnowledgeSnapshot {
  id: string;
  accountId: string;
  deviceId: string;
  clientType: ClientType;
  kind: 'depot' | 'operators';
  identity: 'configured-label' | 'device-only';
  collectedAt: string;
  runId: string | null;
  source: 'maacore-recognition' | 'legacy-cache';
  parserVersion: 1;
  coreVersion: string | null;
  resourceVersion: string | null;
  taskIndex: number | null;
  recordCount: number;
  coverage: 'partial';
  /**
   * @maxItems 20
   */
  unknownFields: string[];
  /**
   * @maxItems 10000
   */
  items: {
    id: string;
    name: string;
    quantity: number;
  }[];
  /**
   * @maxItems 2000
   */
  operators: {
    id: string;
    name: string;
    own: boolean;
    elite: number | null;
    level: number | null;
    potential: number | null;
    rarity: number | null;
  }[];
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "AccountSnapshotListResult".
 */
export interface AccountSnapshotListResult {
  accountId: string;
  identity: 'configured-label' | 'device-only';
  deviceId: string;
  clientType: ClientType;
  latest: {
    depot: string | null;
    operators: string | null;
  };
  /**
   * @maxItems 50
   */
  snapshots: AccountSnapshotSummary[];
  total: number;
  offset: number;
  limit: number;
}
/**
 * This interface was referenced by `RpcContract`'s JSON-Schema
 * via the `definition` "AccountSnapshotSummary".
 */
export interface AccountSnapshotSummary {
  id: string;
  accountId: string;
  deviceId: string;
  clientType: ClientType;
  kind: 'depot' | 'operators';
  identity: 'configured-label' | 'device-only';
  collectedAt: string;
  runId: string | null;
  source: 'maacore-recognition' | 'legacy-cache';
  parserVersion: 1;
  coreVersion: string | null;
  resourceVersion: string | null;
  taskIndex: number | null;
  recordCount: number;
  coverage: 'partial';
  /**
   * @maxItems 20
   */
  unknownFields: string[];
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
