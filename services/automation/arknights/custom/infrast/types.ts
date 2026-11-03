/** 基建领域的数据约定：资源适配提供规则，观察产出证据，驱动与流程消费证据。 */
import type { PipelineDefinitions } from '#automation/pipeline/definitions';
import type { AtomicBox, AtomicCapabilityResult } from '#automation/core/types';
import type { AtomicRule, AtomicSource, VisionResourceProfile } from '#automation/resources/types';

/** 已适配的设施种类；新增设施还需补资源映射、容量上限和页面身份核验。 */
export const atomicFacilities = [
  'Mfg',
  'Trade',
  'Power',
  'Control',
  'Reception',
  'Office',
  'Dorm',
  'Processing',
  'Training',
  'Recycle',
] as const;
export type AtomicFacility = (typeof atomicFacilities)[number];
/** 设施类型与序号用于定位候选，重复设施还需以 position 核对房间身份。 */
export type AtomicRoomTarget = {
  facility: AtomicFacility;
  /** 同类设施内从 1 开始的候选序号，不是游戏地图固定坐标。 */
  room: number;
  position?: string;
};
/** 普通设施使用明确名单；训练室分别处理受训者与协助者，省略角色由流程核验保持。 */
export type AtomicRoomShiftInput = AtomicRoomTarget & {
  operators?: string[];
  trainee?: string;
  assistant?: string;
};
/** 来自某次名单观察的卡片；box 为参考坐标，动作前仍须重新核验 name。 */
export type AtomicOperatorCard = {
  name: string;
  rawName?: string;
  nameVerified?: boolean;
  selected: boolean;
  box: AtomicBox;
  stationedIn?: string;
  /** 只有同帧明确读出「未进驻」才为 true；空白／缺字不能当作未占用。 */
  unassigned?: boolean;
  /** 心情条沿用官方近似算法；auto 策略保留阈值裕量，不将它解释为实际剩余小时。 */
  mood?: { ratio: number; source: 'smiley' | 'progress_bar' };
  /** 只登记当前设施内已亮起且模板可唯一解释的技能。 */
  skills?: string[];
};
/** 房间进驻信息面板的实际人数；与名单待选人数不同，只证明此目标房间在该帧的状态。 */
export type RoomCapacityEvidence = {
  source: 'room_panel';
  frameId: string;
  target: AtomicRoomTarget;
  occupied: number;
  capacity: number;
};
/** 同一帧上的可见卡片；卡片观察本身不证明房间实际容量或完整待选人数。 */
export type AtomicOperatorObservation = {
  frameId: string;
  cards: AtomicOperatorCard[];
  nameSource?: AtomicSource;
  /** 仅可信计数来源可补充这两个字段；未知时省略，不能据心情、卡片数或设施上限推算。 */
  selectedCount?: number;
  capacity?: number;
  /** 当前调用进入名单前核验的房间面板；occupied 不能当作选择修改后的 selectedCount。 */
  room?: RoomCapacityEvidence;
  /** 仅同次进入名单且尚未修改选择时，房间 occupied 才可作为待选名单的完成目标。 */
  selectionOrigin?: 'room_entry';
  pageIdentity: string;
};
/** 完整房间观察的领域表示；complete 与单页卡片可见性是不同概念。 */
export type AtomicRoomObservation = {
  frameId: string;
  target: AtomicRoomTarget;
  operators: string[];
  capacity: number;
  complete: boolean;
  trainingLocked?: boolean;
  trainee?: string;
  assistant?: string;
};
/** 选定资源版本的规则、布局和固定动作参数，不承载设备会话或可变游戏状态。 */
export type AtomicResourceProfile = VisionResourceProfile & {
  id: string;
  adapterBaseline?: { repository: string; ref: string; commit?: string };
  resourceVersion?: string;
  clientType: string;
  available: boolean;
  diagnostics: string[];
  /** 来自本次不可变资源 battle_data.json 的简中官方姓名；缺失时禁用依赖姓名的能力。 */
  operatorNames?: { names: string[]; source: AtomicSource & { sha256: string } };
  /** 按 MaaCore InfrastOperImageAnalyzer 审阅的相对区域与选中条参数，缺失时禁用卡片能力。 */
  card: {
    regions: AtomicBox[];
    nameOffset: AtomicBox;
    facilityOffset: AtomicBox;
    selectedOffset: AtomicBox;
    clickOffset: AtomicBox;
    selectedCount: number;
    selectedLower: number[];
    selectedUpper: number[];
    moodOffset?: AtomicBox;
    moodLower?: number;
    moodDifference?: number;
    skillOffset?: AtomicBox;
    skillBrightness?: number;
    skillThreshold?: number;
    skillMaskRange?: [number, number];
  } | null;
  skills?: Partial<
    Record<
      AtomicFacility,
      { id: string; rule: AtomicRule; efficiency: Record<string, number>; simple: boolean }[]
    >
  >;
  sources: AtomicSource[];
};

/** 总览只提供当前可见行；identity 用于页面候选，position 才能证明重复设施的完整身份。 */
export type OverviewRow = AtomicRoomTarget & { box: AtomicBox; identity: string };
export type OverviewObservation = { frameId: string; rows: OverviewRow[]; texts: string[] };
/** 锁定只由已确认的训练倒计时建立；trainee 缺失不能自动解释为空房。 */
export type TrainingObservation = { frameId: string; locked: boolean; trainee?: string };
export type TrimObservation = { frameId: string; texts: string[] };
/** 按明确人数或满员容量上界收齐的名单；容量可追溯到本次面板，翻页不动不证明完整。 */
export type RosterEvidence = {
  operators: string[];
  capacity: number;
  frameId: string;
  nameSource?: AtomicSource;
  room?: RoomCapacityEvidence;
  /** 由会话 provider 签发，调用方不能凭此字段自行建立可信房间或名单来源。 */
  preparationId?: string;
};
export type InfrastRoute = 'overview' | 'room';
export type Role = 'trainee' | 'assistant';
/** 流程与页面操作的边界；生产由 createInfrastDriver 组装视觉操作，测试可注入驱动。 */
/** 测试可显式提供合成 Tasker；产品运行上下文由通用注册表注入，同一 JSON 链不设 TS fallback。 */
export type InfrastWorkflowRunner = (
  entry: string,
  definitions: PipelineDefinitions,
  input: Record<string, unknown>,
) => Promise<AtomicCapabilityResult>;
export interface InfrastDriver {
  runWorkflow?: InfrastWorkflowRunner;
  /** 只检查目标与资源前提，必须在首个页面动作之前完成。 */
  preflight?(target: AtomicRoomTarget): void;
  /** 精确姓名必须先属于同代官方字典，避免清空或提交前才发现计划使用别名／编组。 */
  preflightOperators?(names: string[]): void;
  overview(): Promise<OverviewObservation>;
  enterOverview(): Promise<OverviewObservation>;
  /** 按总览明确编号解析完整位置；必须在任何名单修改前收齐全部目标。 */
  resolveRooms?(rooms: AtomicRoomShiftInput[]): Promise<AtomicRoomShiftInput[]>;
  /** 先以固定格点容量上界证明确认可见全集，再从总览绑定每房完整身份。 */
  enumerateRooms?(
    facilities: AtomicFacility[],
  ): Promise<{ rooms: AtomicRoomTarget[]; evidence: unknown }>;
  rotateQueue(): Promise<void>;
  enterTrim(): Promise<TrimObservation>;
  trim(): Promise<void>;
  trimObservation(): Promise<TrimObservation>;
  /** 导航并核对目标房间；openRoster 继续进入指定角色或普通名单页。 */
  openRoom(target: AtomicRoomTarget, route: InfrastRoute): Promise<void>;
  openRoster(target: AtomicRoomTarget, role?: Role): Promise<void>;
  operators(): Promise<AtomicOperatorObservation>;
  /** 以下列表动作只修改待选状态；最终业务结果由流程层确认和复读。 */
  resetFilter(): Promise<void>;
  page(direction: 'left' | 'right'): Promise<void>;
  clickOperator(card: AtomicOperatorCard): Promise<void>;
  clear(): Promise<void>;
  /** 提交边界：调用即可能生效，异常后不能自动重放。 */
  verifyConfirmTarget?(target: AtomicRoomTarget): Promise<void>;
  confirm(role?: Role, target?: AtomicRoomTarget, trainee?: string): Promise<void>;
  training(): Promise<TrainingObservation>;
  chooseTrainee(name: string): Promise<void>;
}

/** 名单页的三种独立角色；normal 用于普通设施，训练角色不能互相代替。 */
export type InfrastRosterRole = 'normal' | Role;
/** L3 准备组件的完整目标；不接受隐式补位或按数量猜测干员。 */
export type PrepareRosterInput = {
  target: AtomicRoomTarget;
  route: InfrastRoute;
  role: InfrastRosterRole;
  operators?: string[];
  name?: string;
};
/** 未提交的名单证据；点击记录用于失败诊断，selected 须在确认前再次核验。 */
export type PreparedRosterEvidence = {
  target: AtomicRoomTarget;
  route: InfrastRoute;
  role: InfrastRosterRole;
  before?: RosterEvidence | TrainingObservation;
  selected: RosterEvidence | { trainee: string; preparationId?: string };
  selectionAttempt?: { capacity?: number; clicked?: string[] };
};
