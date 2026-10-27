import type { Device, Plan, Run } from '../../contracts/src/types';
import type { RpcContract, CopilotWorkspace } from '../../contracts/src/rpc-types';

export type MaaClientType = NonNullable<RpcContract['params']['tool.start']['clientType']>;
export type MaaToolJob = RpcContract['results']['tool.get'];
export type MaaFrame = RpcContract['results']['device.frame'];
export type MaaToolEffect = 'read' | 'propose' | 'capture' | 'execute' | 'stop' | 'control';

/** Named application-service ports; never pass a Runtime, worker or generic RPC. */
export interface MaaToolHost {
  listDevices(): Promise<Device[]>;
  listPlans(): Promise<Plan[]>;
  preparePlan(draft: unknown): Plan;
  deviceStatus(
    params: RpcContract['params']['device.availability'],
  ): Promise<RpcContract['results']['device.availability']>;
  getFrame(params: RpcContract['params']['device.frame']): Promise<MaaFrame>;
  click(
    params: RpcContract['params']['device.click'],
  ): Promise<RpcContract['results']['device.click']>;
  getRun(id: string): Promise<Run>;
  startPlan(
    params: RpcContract['params']['run.start'],
    expectedPlan: Plan,
    expectedClientType: MaaClientType,
  ): Promise<Run>;
  stopRun(id: string): Promise<Run>;
  startTool(params: RpcContract['params']['tool.start']): Promise<MaaToolJob>;
  getTool(id: string): Promise<MaaToolJob>;
  stopTool(id: string): Promise<MaaToolJob>;
  getRecognition(
    params: RpcContract['params']['recognition.get'],
  ): Promise<RpcContract['results']['recognition.get']>;
  getCopilotWorkspace(kind: CopilotWorkspace['kind']): Promise<CopilotWorkspace>;
  startCopilot(
    params: RpcContract['params']['copilot.start'],
    expectedWorkspace: CopilotWorkspace,
    expectedClientType: MaaClientType,
  ): Promise<Run>;
}

export interface MaaToolDefinition {
  name: string;
  description: string;
  effect: MaaToolEffect;
  schema: Record<string, unknown>;
}

export interface MaaToolResult {
  /** Bounded, projected JSON suitable for model context; never raw image bytes. */
  content: unknown;
  /** Local-only evidence, such as a screenshot. LangChain keeps it as artifact. */
  artifact?: unknown;
}

export interface MaaToolInvocation {
  /** Stable host invocation identity, reused on delivery retry. */
  callId: string;
  signal?: AbortSignal;
}

export interface MaaToolAuthorization {
  toolName: string;
  effect: Exclude<MaaToolEffect, 'read' | 'propose'>;
  deviceId: string;
  clientType: MaaClientType;
  requestId: string;
  /** Exact immutable action, including the live plan/workspace when applicable. */
  action: Readonly<Record<string, unknown>>;
}

export interface MaaToolOptions {
  /** Persist this host namespace with a resumable session to retain request IDs. */
  sessionId?: string;
  /** Device and client are bound by the host, absent from model schemas. */
  deviceId?: string;
  clientType?: MaaClientType;
  /** Omitted means every capture or device-changing operation is denied. */
  authorize?: (request: MaaToolAuthorization, signal?: AbortSignal) => boolean | Promise<boolean>;
  maxCalls?: number;
  /** Existing executions explicitly attached to this session by the host. */
  runIds?: readonly string[];
  toolJobIds?: readonly string[];
}

export interface MaaToolSet {
  readonly definitions: readonly MaaToolDefinition[];
  invoke(name: string, input: unknown, invocation: MaaToolInvocation): Promise<MaaToolResult>;
}
