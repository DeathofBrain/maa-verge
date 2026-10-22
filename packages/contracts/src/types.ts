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
  id: Id2;
  planId: Planid;
  deviceId: Deviceid1;
  status: Status;
  progress: Progress;
  message: Message;
  startedAt: Startedat;
  finishedAt: Finishedat;
}
export interface UpdateChannel {
  id: Id3;
  currentVersion: Currentversion;
  latestVersion: Latestversion;
  status: Status1;
  progress: Progress1;
  message: Message1;
}
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
export interface CaptureSettings {
  method: 'adb' | 'mumu' | 'ldplayer';
  emulatorPath: string;
  instanceIndex: number;
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
