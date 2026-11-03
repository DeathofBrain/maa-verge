/** 自动化各层共用的数据与端口类型；游戏设施、名单及资源规则定义在 arknights 领域层。 */

/** 能力从基础操作、只读观察逐步组合成游戏操作和完整业务流程。 */
export type AtomicLayer = 'operation' | 'observation' | 'game' | 'workflow';
export type PrimitiveLevel = 1 | 2 | 3;
export type PrimitiveEffect = 'observe' | 'input' | 'commit';
export type AtomicOperation =
  | 'frame'
  | 'click'
  | 'swipe'
  | 'press_key'
  | 'long_press'
  | 'drag'
  | 'recognize'
  | 'start_app'
  | 'stop_app';
/** 当前识别坐标空间中的 [x, y, width, height]。 */
export type AtomicBox = [number, number, number, number];
/** 帧标识由宿主签发；其来源、有效期及可操作性由宿主校验。 */
export type AtomicFrame = {
  frameId: string;
  width: number;
  height: number;
  data: string;
  capturedAt?: string;
};
export type AtomicMatch = { box: AtomicBox; score: number; text?: string; count?: number };
/** 描述指定帧上的识别证据；命中与否不代表设备动作或业务流程成功。 */
export type AtomicRecognition = {
  hit: boolean;
  matches: AtomicMatch[];
  coordinateSize?: [number, number];
};
/** 一次调用向下传递的协作式取消信号和进度观察器。 */
export type AtomicExecutionContext = {
  signal?: AbortSignal;
  onProgress?: (event: { capabilityId: string; message: string; data?: unknown }) => void;
  /** 登记器在真正顶层入口签发的身份；Context 子调用继承，不能作为设备或输入授权。 */
  rootIdentity?: object;
  /** 下层能力由登记器绑定；调用方不能自行替换本次会话的分派目录。 */
  invoke?: (id: string, input: Record<string, unknown>) => Promise<AtomicCapabilityResult>;
  /** 仅维护代码可提交静态登记的业务链，JSON 本身不能提供路径或代码。 */
  runWorkflow?: (
    entry: string,
    definitions: Record<string, Record<string, unknown>>,
    input: Record<string, unknown>,
    handlers?: Record<string, (params: Record<string, unknown>) => Promise<void>>,
  ) => Promise<AtomicCapabilityResult>;
  /** 由运行器管理的当前官方 Context 状态，不能用于取得新的控制权。 */
  pipelineActive?: boolean;
  deadline?: number;
  /** 宿主持久预留消耗后才能提交；未知结果不释放额度，能力库不直接写入业务数据库。 */
  /** 宿主持久占用设备/客户端/游戏日的访问额度，未知结果保守保留。 */
  claimDailyAction?: (key: 'visit_friends') => Promise<boolean>;
  reserveConsumable?: (
    kind: 'medicine' | 'stone' | 'credit' | 'recruit',
    amount: number,
    limit: number,
    operationId: string,
  ) => Promise<void>;
};
/**
 * 宿主实现的唯一执行入口：在设备租约、帧令牌和取消边界内执行有限操作或已审阅流程。
 * 自动化能力不持有控制令牌，也不直接调用原生进程；Pipeline 不接受模型传入的任意节点。
 */
export interface AtomicExecutionPort {
  execute(
    operation: AtomicOperation,
    input: Record<string, unknown>,
    context: AtomicExecutionContext,
  ): Promise<unknown>;
  /** 宿主只读输入修订号；实际输入尝试后单调递增，截图、识别和根帧清理不改变它。 */
  getInputRevision?(): number;
  /** 仅执行应用维护的 Pipeline；Custom 回调沿用同一会话与基础操作门禁。 */
  runPipeline(
    entry: string,
    pipeline: Record<string, unknown>,
    custom: (node: string, params: Record<string, unknown>) => Promise<void>,
    context: AtomicExecutionContext,
  ): Promise<void>;
  /** 当前 Custom 上下文内同步执行子图；不向同一 Tasker 再次排队。 */
  runContextPipeline?(
    entry: string,
    pipeline: Record<string, unknown>,
    custom: (node: string, params: Record<string, unknown>) => Promise<void>,
    context: AtomicExecutionContext,
  ): Promise<void>;
}
/** 供目录展示与调用前检查使用的描述；available 不替代宿主的实时授权与设备检查。 */
export type AtomicCapabilityDescriptor = {
  id: string;
  label: string;
  description: string;
  layer: AtomicLayer;
  primitiveLevel?: PrimitiveLevel;
  effect?: PrimitiveEffect;
  pipelineEntry?: string;
  dependencies?: string[];
  requiredResources?: string[];
  inputSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  requiredCapabilities?: string[];
  available: boolean;
  unavailableReason?: string;
};
/** 能力结果区分执行状态、原生接受输入和目标已验证；completed 不单独证明业务成功。 */
export type AtomicCapabilityResult = {
  status: 'completed' | 'partial' | 'failed' | 'unavailable' | 'cancelled' | 'unknown';
  data: unknown;
  verified: boolean;
  nativeSuccess?: boolean;
  message?: string;
};
