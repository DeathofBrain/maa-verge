/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */

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
  | 'OperProgress';
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
  capture?: CaptureSettings;
  autoConnect: Autoconnect;
  autoUpdateCore: Autoupdatecore;
  autoUpdateResource: Autoupdateresource;
  minimizeToTray: Minimizetotray;
  theme: Theme;
  budgets: Budgets;
  model: ModelSettings;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "CaptureSettings".
 */
export interface CaptureSettings {
  method: 'adb' | 'mumu' | 'ldplayer';
  emulatorPath: string;
  instanceIndex: number;
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
  id: Id1;
  name: Name1;
  address: Address;
  state: State;
  coreVersion: Coreversion;
  captureMethod?: string;
  resourceVersion: Resourceversion;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Run".
 */
export interface Run {
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
 * via the `definition` "UpdateChannel".
 */
export interface UpdateChannel {
  id: Id3;
  currentVersion: Currentversion;
  latestVersion: Latestversion;
  status: Status1;
  progress: Progress1;
  message: Message1;
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
