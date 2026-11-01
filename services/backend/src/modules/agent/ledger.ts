import { createHash } from 'node:crypto';
import type {
  AgentAnswer,
  AgentInteraction,
  AgentSession,
  AgentTurn,
  AgentUsage,
} from '@contracts/agent-types';
import { validateAgentInteraction } from '@contracts/validators.js';
import type { Store } from '@backend/infrastructure/storage/storage';
import { RpcError } from '@backend/shared/errors';
import { emptyUsage, type ResponseUsage } from '@maaverge/agent/responses';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([key, child]) => JSON.stringify(key) + ':' + canonical(child))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export const digest = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
export const timestamp = () => new Date().toISOString();
export function addUsage(left: AgentUsage, right: AgentUsage): AgentUsage {
  return {
    modelCalls: left.modelCalls + right.modelCalls,
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    incomplete: left.incomplete || right.incomplete,
    cachedInputTokens: (left.cachedInputTokens ?? 0) + (right.cachedInputTokens ?? 0),
    reasoningTokens: (left.reasoningTokens ?? 0) + (right.reasoningTokens ?? 0),
    ...(left.estimatedCost !== undefined || right.estimatedCost !== undefined
      ? { estimatedCost: (left.estimatedCost ?? 0) + (right.estimatedCost ?? 0) }
      : {}),
  };
}
export interface ActionRecord {
  id: string;
  sessionId: string;
  turnId: string;
  callId: string;
  name: string;
  signature: string;
  status: 'prepared' | 'submitted' | 'completed' | 'unknown' | 'awaiting_input';
  requestId?: string;
  authorizationHash?: string;
  result?: unknown;
  interactionId?: string;
  missionId?: string;
  medicine?: number;
  stone?: number;
  createdAt: string;
  updatedAt: string;
  mcpInput?: {
    interactionId: string;
    requestState: string;
    inputRequests: Record<string, unknown>;
  };
}

/** All records use the application's leased Store and its SQLite transaction. */
export class AgentLedger {
  constructor(
    private store: Store,
    private session: (id: string) => AgentSession,
  ) {}
  turns(sessionId: string): AgentTurn[] {
    this.session(sessionId);
    return this.store.all<AgentTurn>('agent_turn').filter((row) => row.sessionId === sessionId);
  }
  turn(id: string): AgentTurn {
    const row = this.store.get<AgentTurn | undefined>('agent_turn', id);
    if (!row) throw new RpcError(-32004, 'Agent 轮次不存在');
    this.session(row.sessionId);
    return row;
  }
  putTurn(turn: AgentTurn) {
    this.session(turn.sessionId);
    this.store.put('agent_turn', turn.id, { ...turn, updatedAt: timestamp() });
  }
  interactions(sessionId?: string, turnId?: string, status?: string): AgentInteraction[] {
    return this.store
      .all<AgentInteraction>('agent_interaction')
      .filter((row) => {
        if (
          (sessionId && row.sessionId !== sessionId) ||
          (turnId && row.turnId !== turnId) ||
          (status && row.status !== status)
        )
          return false;
        try {
          this.session(row.sessionId);
          return true;
        } catch {
          return false;
        }
      })
      .slice(-100);
  }
  interaction(id: string): AgentInteraction {
    const row = this.store.get<AgentInteraction | undefined>('agent_interaction', id);
    if (!row) throw new RpcError(-32004, '待办交互不存在');
    this.session(row.sessionId);
    return row;
  }
  question(value: Omit<AgentInteraction, 'status' | 'createdAt' | 'updatedAt'>): AgentInteraction {
    const prior = this.store.get<AgentInteraction | undefined>('agent_interaction', value.id);
    if (prior) {
      this.session(prior.sessionId);
      if (
        digest({ ...prior, status: '', answer: undefined, createdAt: '', updatedAt: '' }) !==
        digest({ ...value, status: '', createdAt: '', updatedAt: '' })
      )
        throw new RpcError(-32011, '交互内容已变更，需要重新发起审批');
      return prior;
    }
    this.session(value.sessionId);
    const row: AgentInteraction = {
      ...structuredClone(value),
      status: 'pending',
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    if (!validateAgentInteraction(row)) throw new RpcError(-32602, '交互内容不符合契约');
    this.store.put('agent_interaction', row.id, row);
    return row;
  }
  respond(id: string, answer: AgentAnswer): AgentInteraction {
    const pending = this.interaction(id);
    if (
      pending.status === 'pending' &&
      pending.expiresAt &&
      Date.parse(pending.expiresAt) <= Date.now()
    ) {
      this.store.put('agent_interaction', id, {
        ...pending,
        status: 'expired',
        updatedAt: timestamp(),
      });
      throw new RpcError(-32011, '交互已超时，请重新发起');
    }
    return this.store.transaction(() => {
      const row = this.interaction(id);
      if (row.status === 'answered') {
        if (canonical(row.answer) !== canonical(answer))
          throw new RpcError(-32011, '同一问题不能重复提交不同答案');
        return row;
      }
      if (row.status !== 'pending') throw new RpcError(-32011, '该交互已经结束');
      if (row.kind === 'approval') {
        if (!answer.decision || Object.keys(answer).some((key) => key !== 'decision'))
          throw new RpcError(-32602, '执行审批需要明确批准或拒绝');
      } else if (row.inputType === 'single' || row.inputType === 'multiple') {
        const choices = answer.choices ?? [];
        if (
          answer.decision ||
          answer.text ||
          !Array.isArray(choices) ||
          new Set(choices).size !== choices.length ||
          choices.some((choice) => !row.options?.some((option) => option.id === choice)) ||
          choices.length < (row.minChoices ?? (row.required === false ? 0 : 1)) ||
          choices.length > (row.inputType === 'single' ? 1 : (row.maxChoices ?? 30))
        )
          throw new RpcError(-32602, '请选择问题提供的有效选项');
      } else if (row.kind === 'question') {
        if (
          answer.decision ||
          typeof answer.text !== 'string' ||
          answer.text.length > (row.maxLength ?? 2000) ||
          (row.required !== false && !answer.text.trim())
        )
          throw new RpcError(-32602, '请输入有效的简短回答');
      }
      const result: AgentInteraction = {
        ...row,
        answer: structuredClone(answer),
        status: 'answered',
        updatedAt: timestamp(),
      };
      this.store.put('agent_interaction', id, result);
      return result;
    });
  }
  action(
    sessionId: string,
    turnId: string,
    callId: string,
    name: string,
    input: unknown,
  ): ActionRecord {
    this.session(sessionId);
    const id = digest([sessionId, callId]);
    const signature = digest([name, input]);
    const prior = this.store.get<ActionRecord | undefined>('agent_action', id);
    if (prior) {
      if (prior.signature !== signature || prior.turnId !== turnId)
        throw new RpcError(-32011, '工具调用 ID 已绑定其他请求，禁止更换参数重放');
      return prior;
    }
    const value: ActionRecord = {
      id,
      sessionId,
      turnId,
      callId,
      name,
      signature,
      status: 'prepared',
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    this.putAction(value);
    return value;
  }
  putAction(value: ActionRecord) {
    this.store.put('agent_action', value.id, { ...value, updatedAt: timestamp() });
  }
  actions(sessionId: string) {
    this.session(sessionId);
    return this.store
      .all<ActionRecord>('agent_action')
      .filter((row) => row.sessionId === sessionId);
  }
  usage(turnId: string, delta: AgentUsage, kind: 'turn' | 'summary' = 'turn') {
    this.store.transaction(() => {
      const turn = this.turn(turnId),
        session = this.session(turn.sessionId);
      this.putTurn({
        ...turn,
        usage: addUsage(turn.usage, delta),
        ...(kind === 'summary'
          ? { summaryUsage: addUsage(turn.summaryUsage ?? emptyUsage(), delta) }
          : {}),
      });
      this.store.put('agent_usage', crypto.randomUUID(), {
        turnId,
        sessionId: session.id,
        kind,
        usage: delta,
        createdAt: timestamp(),
      });
      this.store.put('agent_session', session.id, {
        ...session,
        usage: addUsage(session.usage, delta),
        ...(kind === 'summary'
          ? { summaryUsage: addUsage(session.summaryUsage ?? emptyUsage(), delta) }
          : {}),
        updatedAt: timestamp(),
      });
      if (turn.missionId) {
        const mission = this.store.get('agent_mission', turn.missionId);
        if (mission)
          this.store.put('agent_mission', mission.id, {
            ...mission,
            usage: addUsage(mission.usage, delta),
            updatedAt: timestamp(),
          });
      }
    });
  }
  attempt(turnId: string, kind: 'turn' | 'summary') {
    const delta = emptyUsage();
    delta.modelCalls = 1;
    delta.incomplete = true;
    this.usage(turnId, delta, kind);
  }
}
