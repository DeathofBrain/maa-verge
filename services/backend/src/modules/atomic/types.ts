export type AtomicLayer = 'operation' | 'observation' | 'game' | 'workflow';
export type AtomicOperation =
  'frame' | 'click' | 'swipe' | 'press_key' | 'long_press' | 'drag' | 'recognize';
export type AtomicBox = [number, number, number, number];
export type AtomicFrame = {
  frameId: string;
  width: number;
  height: number;
  data: string;
  capturedAt?: string;
};
export type AtomicMatch = { box: AtomicBox; score: number; text?: string; count?: number };
export type AtomicRecognition = {
  hit: boolean;
  matches: AtomicMatch[];
  coordinateSize?: [number, number];
};
export type AtomicExecutionContext = {
  signal?: AbortSignal;
  onProgress?: (event: { capabilityId: string; message: string; data?: unknown }) => void;
};
/** A session owns the device lease, frame tokens and cancellation boundary. */
export interface AtomicExecutionPort {
  execute(
    operation: AtomicOperation,
    input: Record<string, unknown>,
    context: AtomicExecutionContext,
  ): Promise<unknown>;
}
export type AtomicCapabilityDescriptor = {
  id: string;
  label: string;
  description: string;
  layer: AtomicLayer;
  inputSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  requiredCapabilities?: string[];
  available: boolean;
  unavailableReason?: string;
};
export type AtomicCapabilityResult = {
  status: 'completed' | 'partial' | 'failed' | 'unavailable' | 'cancelled' | 'unknown';
  data: unknown;
  verified: boolean;
  nativeSuccess?: boolean;
  message?: string;
};
export type AtomicSource = {
  repository: string;
  ref: string;
  path: string;
  node?: string;
  sha256?: string;
};
export type AtomicRule = {
  id: string;
  kind: 'template' | 'ocr' | 'color';
  roi?: AtomicBox;
  templateId?: string;
  threshold?: number;
  maskRange?: [number, number];
  expected?: string[];
  replace?: [string, string][];
  onlyRec?: boolean;
  lower?: number[];
  upper?: number[];
  method?: number | 'RGBCount';
  pureColor?: boolean;
  colorScales?: [number[], number[]][];
  colorWithClose?: boolean;
  nmsDistance?: number;
  count?: number;
  source: AtomicSource;
};
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
export type AtomicRoomTarget = {
  facility: AtomicFacility;
  /** One-based ordinal within a facility type, never a fixed game layout coordinate. */
  room: number;
  position?: string;
};
export type AtomicRoomShiftInput = AtomicRoomTarget & {
  operators?: string[];
  trainee?: string;
  assistant?: string;
};
export type AtomicOperatorCard = {
  name: string;
  selected: boolean;
  box: AtomicBox;
  stationedIn?: string;
};
export type AtomicOperatorObservation = {
  frameId: string;
  cards: AtomicOperatorCard[];
  /** Both values must be observed from the current game page. */
  selectedCount: number;
  capacity: number;
  pageIdentity: string;
};
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
export type AtomicResourceProfile = {
  id: string;
  adapterBaseline?: { repository: string; ref: string; commit?: string };
  resourceVersion?: string;
  clientType: string;
  available: boolean;
  diagnostics: string[];
  rules: Record<string, AtomicRule>;
  /** Explicitly adapted data consumed by MaaCore's InfrastOperImageAnalyzer. */
  card: {
    regions: AtomicBox[];
    nameOffset: AtomicBox;
    facilityOffset: AtomicBox;
    selectedOffset: AtomicBox;
    clickOffset: AtomicBox;
    selectedCount: number;
    selectedLower: number[];
    selectedUpper: number[];
  } | null;
  actions: Record<string, { box?: AtomicBox; delayMs: number }>;
  sources: AtomicSource[];
};
