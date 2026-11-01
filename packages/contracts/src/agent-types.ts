/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */

/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMode".
 */
export type AgentMode = 'plan' | 'goal';
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentJsonValue".
 */
export type AgentJsonValue =
  | null
  | boolean
  | number
  | string
  | AgentJsonValue[]
  | {
      [k: string]: AgentJsonValue;
    };
/**
 * 外部 MCP 仅申请有限操作；请求必须由 Maa Verge 内的用户审批，requestId 在重试时保持不变。
 *
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMcpOperationRequest".
 */
export type AgentMcpOperationRequest =
  | {
      requestId: string;
      kind: 'plan';
      deviceId: string;
      planId: string;
    }
  | {
      requestId: string;
      kind: 'tool';
      deviceId: string;
      toolKind: 'depot' | 'operators' | 'recruit' | 'inventory' | 'data' | 'games';
      config?: {
        [k: string]: unknown;
      };
    }
  | {
      requestId: string;
      kind: 'copilot';
      deviceId: string;
      copilotKind: 'Copilot' | 'SSSCopilot' | 'ParadoxCopilot';
    }
  | {
      requestId: string;
      kind: 'stop';
      deviceId: string;
      runId: string;
    };

export interface AgentContract {
  params: {
    'agent.session.list': AgentSessionListParams;
    'agent.session.create': AgentSessionCreateParams;
    'agent.session.get': AgentSessionGetParams;
    'agent.session.update': AgentSessionUpdateParams;
    'agent.session.delete': AgentSessionDeleteParams;
    'agent.turn.start': AgentTurnStartParams;
    'agent.turn.get': AgentTurnIdentity;
    'agent.turn.cancel': AgentTurnIdentity;
    'agent.turn.resume': AgentTurnIdentity;
    'agent.interaction.list': AgentInteractionListParams;
    'agent.interaction.respond': AgentInteractionRespondParams;
    'agent.memory.list': AgentMemoryListParams;
    'agent.memory.save': AgentMemorySaveParams;
    'agent.memory.delete': AgentMemoryDeleteParams;
    'agent.context.reference': AgentContextReferenceParams;
    'agent.mission.list': AgentMissionListParams;
    'agent.mission.create': AgentMissionCreateParams;
    'agent.mission.resume': AgentMissionIdentity;
    'agent.mission.revoke': AgentMissionIdentity;
    'agent.skill.list': AgentEmptyParams;
    'agent.skill.save': AgentSkillSaveParams;
    'agent.skill.import': AgentSkillImportParams;
    'agent.skill.delete': AgentSkillDeleteParams;
    'agent.skill.enable': AgentSkillEnableParams;
    'agent.mcp.list': AgentEmptyParams;
    'agent.mcp.save': AgentMcpSaveParams;
    'agent.mcp.delete': AgentMcpIdentity;
    'agent.mcp.check': AgentMcpIdentity;
    'agent.mcp.tools': AgentMcpIdentity;
    'agent.mcp.server': AgentMcpServerParams;
    'model.credential.set': AgentCredentialSetParams;
    'model.credential.status': AgentEmptyParams;
    'model.credential.delete': AgentEmptyParams;
  };
  results: {
    'agent.session.list': AgentSessionListResult;
    'agent.session.create': AgentSession;
    'agent.session.get': AgentSessionDetail;
    'agent.session.update': AgentSession;
    'agent.session.delete': AgentDeleteResult;
    'agent.turn.start': AgentTurn;
    'agent.turn.get': AgentTurn;
    'agent.turn.cancel': AgentTurn;
    'agent.turn.resume': AgentTurn;
    /**
     * @maxItems 100
     */
    'agent.interaction.list': AgentInteraction[];
    'agent.interaction.respond': AgentInteraction;
    'agent.memory.list': AgentMemoryListResult;
    'agent.memory.save': AgentMemory;
    'agent.memory.delete': AgentDeleteResult;
    'agent.context.reference': AgentContextReference;
    /**
     * @maxItems 100
     */
    'agent.mission.list': AgentMission[];
    'agent.mission.create': AgentMission;
    'agent.mission.resume': AgentMission;
    'agent.mission.revoke': AgentMission;
    'agent.skill.list': AgentSkillListResult;
    'agent.skill.save': AgentSkill;
    'agent.skill.import': AgentSkill;
    'agent.skill.delete': AgentDeleteResult;
    'agent.skill.enable': AgentSkill;
    'agent.mcp.list': AgentMcpListResult;
    'agent.mcp.save': AgentMcpConfig;
    'agent.mcp.delete': AgentDeleteResult;
    'agent.mcp.check': AgentMcpCheckResult;
    'agent.mcp.tools': AgentMcpToolsResult;
    'agent.mcp.server': AgentMcpServerResult;
    'model.credential.set': AgentCredentialStatus;
    'model.credential.status': AgentCredentialStatus;
    'model.credential.delete': AgentCredentialStatus;
  };
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSessionListParams".
 */
export interface AgentSessionListParams {
  deviceId?: string;
  clientType?: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
  offset?: number;
  limit?: number;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSessionCreateParams".
 */
export interface AgentSessionCreateParams {
  deviceId?: string;
  clientType?: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
  title?: string;
  mode?: AgentMode;
  /**
   * @maxItems 50
   */
  skillIds?: string[];
  /**
   * @maxItems 50
   */
  mcpServerIds?: string[];
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSessionGetParams".
 */
export interface AgentSessionGetParams {
  sessionId: string;
  offset?: number;
  limit?: number;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSessionUpdateParams".
 */
export interface AgentSessionUpdateParams {
  sessionId: string;
  revision: number;
  title?: string;
  mode?: AgentMode;
  /**
   * @maxItems 50
   */
  skillIds?: string[];
  /**
   * @maxItems 50
   */
  mcpServerIds?: string[];
  status?: 'idle' | 'running' | 'waiting' | 'archived';
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSessionDeleteParams".
 */
export interface AgentSessionDeleteParams {
  sessionId: string;
  revision?: number;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentTurnStartParams".
 */
export interface AgentTurnStartParams {
  sessionId: string;
  message: string;
  requestId: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentTurnIdentity".
 */
export interface AgentTurnIdentity {
  turnId: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentInteractionListParams".
 */
export interface AgentInteractionListParams {
  sessionId?: string;
  turnId?: string;
  status?: 'pending' | 'answered' | 'cancelled' | 'expired';
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentInteractionRespondParams".
 */
export interface AgentInteractionRespondParams {
  interactionId: string;
  answer: AgentAnswer;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentAnswer".
 */
export interface AgentAnswer {
  text?: string;
  /**
   * @maxItems 30
   */
  choices?: string[];
  decision?: 'approve' | 'reject';
  value?: AgentJsonValue;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMemoryListParams".
 */
export interface AgentMemoryListParams {
  sessionId?: string;
  query?: string;
  scope?: 'global' | 'account';
  offset?: number;
  limit?: number;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMemorySaveParams".
 */
export interface AgentMemorySaveParams {
  sessionId?: string;
  id?: string;
  key: string;
  content: string;
  scope: 'global' | 'account';
  revision?: number;
  sourceMessageId?: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMemoryDeleteParams".
 */
export interface AgentMemoryDeleteParams {
  id: string;
  revision?: number;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentContextReferenceParams".
 */
export interface AgentContextReferenceParams {
  sessionId: string;
  sourceSessionId: string;
  /**
   * @maxItems 100
   */
  messageIds?: string[];
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMissionListParams".
 */
export interface AgentMissionListParams {
  sessionId?: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMissionCreateParams".
 */
export interface AgentMissionCreateParams {
  sessionId: string;
  expiresAt: string;
  maxExecutions: number;
  medicine: number;
  stone: number;
  /**
   * @maxItems 100
   */
  targets: AgentJsonObject[];
  wakeAt?: string;
  wakeOnRunId?: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentJsonObject".
 */
export interface AgentJsonObject {
  [k: string]: AgentJsonValue;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMissionIdentity".
 */
export interface AgentMissionIdentity {
  missionId: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentEmptyParams".
 */
export interface AgentEmptyParams {}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSkillSaveParams".
 */
export interface AgentSkillSaveParams {
  id?: string;
  content: string;
  /**
   * @maxItems 100
   */
  references?: AgentSkillReference[];
  enabled?: boolean;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSkillReference".
 */
export interface AgentSkillReference {
  name: string;
  text: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSkillImportParams".
 */
export interface AgentSkillImportParams {
  path: string;
  enabled?: boolean;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSkillDeleteParams".
 */
export interface AgentSkillDeleteParams {
  id: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSkillEnableParams".
 */
export interface AgentSkillEnableParams {
  id: string;
  enabled: boolean;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMcpSaveParams".
 */
export interface AgentMcpSaveParams {
  server: AgentMcpConfig;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMcpConfig".
 */
export interface AgentMcpConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'streamable-http';
  enabled: boolean;
  command?: string;
  /**
   * @maxItems 100
   */
  args?: string[];
  env?: {
    [k: string]: string;
  };
  url?: string;
  credentialRef?: string;
  /**
   * @maxItems 100
   */
  enabledTools: string[];
  timeoutMs: number;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMcpIdentity".
 */
export interface AgentMcpIdentity {
  id: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMcpServerParams".
 */
export interface AgentMcpServerParams {
  enabled: boolean;
  showToken?: boolean;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentCredentialSetParams".
 */
export interface AgentCredentialSetParams {
  secret: string;
  storage: 'keychain' | 'session';
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSessionListResult".
 */
export interface AgentSessionListResult {
  /**
   * @maxItems 100
   */
  sessions: AgentSession[];
  total: number;
  offset: number;
  limit: number;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSession".
 */
export interface AgentSession {
  id: string;
  title: string;
  mode: AgentMode;
  scope: AgentScope;
  revision: number;
  status: 'idle' | 'running' | 'waiting' | 'archived';
  /**
   * @maxItems 50
   */
  skillIds: string[];
  /**
   * @maxItems 50
   */
  mcpServerIds: string[];
  /**
   * @maxItems 100
   */
  contextReferenceIds: string[];
  summary?: string;
  usage: AgentUsage;
  createdAt: string;
  updatedAt: string;
  summaryUsage?: AgentUsage;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentScope".
 */
export interface AgentScope {
  deviceId: string;
  clientType: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
  accountId: string;
  identity: 'configured-label' | 'device-only';
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentUsage".
 */
export interface AgentUsage {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  incomplete: boolean;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  estimatedCost?: number;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSessionDetail".
 */
export interface AgentSessionDetail {
  session: AgentSession;
  /**
   * @maxItems 100
   */
  messages: AgentMessage[];
  /**
   * @maxItems 100
   */
  turns: AgentTurn[];
  /**
   * @maxItems 100
   */
  interactions: AgentInteraction[];
  /**
   * @maxItems 100
   */
  references: AgentContextReference[];
  total: number;
  offset: number;
  limit: number;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMessage".
 */
export interface AgentMessage {
  id: string;
  sessionId: string;
  turnId?: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  /**
   * @maxItems 1000
   */
  items?: AgentJsonValue[];
  metadata?: AgentJsonObject;
  createdAt: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentTurn".
 */
export interface AgentTurn {
  id: string;
  sessionId: string;
  requestId?: string;
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
  createdAt: string;
  updatedAt: string;
  usage: AgentUsage;
  error?: string;
  pendingInteractionId?: string;
  reply?: string;
  messageId?: string;
  missionId?: string;
  summaryUsage?: AgentUsage;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentInteraction".
 */
export interface AgentInteraction {
  id: string;
  sessionId: string;
  turnId: string;
  kind: 'question' | 'approval' | 'mcp';
  status: 'pending' | 'answered' | 'cancelled' | 'expired';
  title: string;
  prompt: string;
  inputType?: 'single' | 'multiple' | 'text';
  /**
   * @maxItems 30
   */
  options?: AgentChoice[];
  required?: boolean;
  minChoices?: number;
  maxChoices?: number;
  maxLength?: number;
  answer?: AgentAnswer;
  snapshot?: AgentJsonObject;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentChoice".
 */
export interface AgentChoice {
  id: string;
  label: string;
  description?: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentContextReference".
 */
export interface AgentContextReference {
  id: string;
  sessionId: string;
  sourceSessionId: string;
  /**
   * @maxItems 100
   */
  messageIds: string[];
  summary?: string;
  createdAt: string;
  scope: AgentScope;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentDeleteResult".
 */
export interface AgentDeleteResult {
  deleted: boolean;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMemoryListResult".
 */
export interface AgentMemoryListResult {
  /**
   * @maxItems 100
   */
  memories: AgentMemory[];
  total: number;
  offset: number;
  limit: number;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMemory".
 */
export interface AgentMemory {
  id: string;
  key: string;
  content: string;
  scope: 'global' | 'account';
  accountId?: string;
  deviceId?: string;
  clientType?: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
  sourceSessionId?: string;
  sourceMessageId?: string;
  source: 'user' | 'summary' | 'tool';
  revision: number;
  createdAt: string;
  updatedAt: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMission".
 */
export interface AgentMission {
  id: string;
  sessionId: string;
  deviceId: string;
  clientType: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
  expiresAt: string;
  maxExecutions: number;
  medicine: number;
  stone: number;
  status: 'active' | 'paused' | 'waiting' | 'revoked' | 'completed';
  remainingExecutions: number;
  reservedMedicine: number;
  reservedStone: number;
  /**
   * @maxItems 100
   */
  targets: AgentJsonObject[];
  /**
   * @maxItems 100
   */
  snapshotHashes: string[];
  usage: AgentUsage;
  createdAt: string;
  updatedAt: string;
  wakeAt?: string;
  wakeOnRunId?: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSkillListResult".
 */
export interface AgentSkillListResult {
  /**
   * @maxItems 100
   */
  skills: AgentSkill[];
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentSkill".
 */
export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  content: string;
  /**
   * @maxItems 100
   */
  references: AgentSkillReference[];
  /**
   * @maxItems 100
   */
  allowedTools: string[];
  enabled: boolean;
  version: string;
  createdAt: string;
  updatedAt: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMcpListResult".
 */
export interface AgentMcpListResult {
  /**
   * @maxItems 100
   */
  servers: AgentMcpConfig[];
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMcpCheckResult".
 */
export interface AgentMcpCheckResult {
  ok: boolean;
  error?: string;
  toolCount?: number;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMcpToolsResult".
 */
export interface AgentMcpToolsResult {
  /**
   * @maxItems 100
   */
  tools: AgentMcpTool[];
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMcpTool".
 */
export interface AgentMcpTool {
  name: string;
  description?: string;
  inputSchema: AgentJsonObject;
  enabled: boolean;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentMcpServerResult".
 */
export interface AgentMcpServerResult {
  enabled: boolean;
  url?: string;
  tokenConfigured: boolean;
  token?: string;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentCredentialStatus".
 */
export interface AgentCredentialStatus {
  configured: boolean;
  storage: 'keychain' | 'session' | 'none';
  available: boolean;
}
/**
 * This interface was referenced by `AgentContract`'s JSON-Schema
 * via the `definition` "AgentContextProjection".
 */
export interface AgentContextProjection {
  sessionId: string;
  revision: number;
  /**
   * @maxItems 2000
   */
  items: AgentJsonValue[];
  summary?: string;
  throughMessageId?: string;
  updatedAt: string;
}
