import { createHash, randomUUID } from 'node:crypto';
import type {
  AgentContextProjection,
  AgentContextReference,
  AgentContract,
  AgentJsonValue,
  AgentMemory,
  AgentMessage,
  AgentScope,
  AgentSession,
  AgentUsage,
} from '@contracts/agent-types';
import {
  validateAgentContextProjection,
  validateAgentContextReference,
  validateAgentMemory,
  validateAgentMessage,
  validateAgentSession,
  agentParamValidators,
} from '@contracts/validators.js';
import { Store, now } from '@backend/infrastructure/storage/storage';
import { accountKnowledgeScope } from '@backend/modules/knowledge/account-knowledge';

type Params<K extends keyof AgentContract['params']> = AgentContract['params'][K];
type MessageInput = Omit<AgentMessage, 'id' | 'sessionId' | 'createdAt'> & { id?: string };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = <T>(value: T): T => structuredClone(value);
const maximumBytes = 3 * 1024 * 1024;
export const emptyAgentUsage = (): AgentUsage => ({
  modelCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  incomplete: false,
});
export const sameAgentScope = (a: AgentScope, b: AgentScope) =>
  a.accountId === b.accountId && a.deviceId === b.deviceId && a.clientType === b.clientType;

export class AgentContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentContextError';
  }
}

/** Local original history and model projections are deliberately separate records. */
export class ContextRepository {
  constructor(private readonly store: Store) {}

  resolveScope(deviceId = '', clientType: AgentScope['clientType'] = 'Official'): AgentScope {
    return { deviceId, clientType, ...accountKnowledgeScope(this.store, deviceId, clientType) };
  }

  assertScope(scope: AgentScope): void {
    const configuredClient = scope.deviceId
      ? this.store.get('device_client', scope.deviceId)
      : undefined;
    if (
      (configuredClient !== undefined && configuredClient !== scope.clientType) ||
      !sameAgentScope(scope, this.resolveScope(scope.deviceId, scope.clientType))
    )
      throw new AgentContextError('账号配置已改变，请在当前账号下创建会话');
  }

  create(params: Params<'agent.session.create'> = {}): AgentSession {
    if (!agentParamValidators['agent.session.create'](params))
      throw new AgentContextError('会话参数无效');
    const timestamp = now();
    const session: AgentSession = {
      id: randomUUID(),
      title: params.title?.trim() || '新会话',
      mode: params.mode ?? 'plan',
      scope: this.resolveScope(params.deviceId, params.clientType),
      revision: 1,
      status: 'idle',
      skillIds: [...new Set(params.skillIds ?? [])],
      mcpServerIds: [...new Set(params.mcpServerIds ?? [])],
      contextReferenceIds: [],
      usage: emptyAgentUsage(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.put('agent_session', session.id, session);
    return clone(session);
  }

  get(sessionId: string): AgentSession {
    const session = this.store.get('agent_session', sessionId);
    if (!validateAgentSession(session) || session.id !== sessionId)
      throw new AgentContextError('会话不存在');
    this.assertScope(session.scope);
    return clone(session);
  }

  list(params: Params<'agent.session.list'> = {}): AgentContract['results']['agent.session.list'] {
    if (!agentParamValidators['agent.session.list'](params))
      throw new AgentContextError('会话列表参数无效');
    const all = this.store
      .all('agent_session')
      .filter((item): item is AgentSession => {
        if (!validateAgentSession(item)) return false;
        if (params.deviceId !== undefined && item.scope.deviceId !== params.deviceId) return false;
        if (params.clientType && item.scope.clientType !== params.clientType) return false;
        try {
          this.assertScope(item.scope);
          return true;
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 30;
    return { sessions: all.slice(offset, offset + limit), total: all.length, offset, limit };
  }

  update(params: Params<'agent.session.update'>): AgentSession {
    if (!agentParamValidators['agent.session.update'](params))
      throw new AgentContextError('会话修改参数无效');
    return this.store.transaction(() => {
      const current = this.get(params.sessionId);
      if (current.revision !== params.revision)
        throw new AgentContextError('会话已更新，请刷新后重试');
      const { sessionId: _id, revision: _revision, ...patch } = params;
      return this.patchSession(current.id, patch);
    });
  }

  patchSession(
    sessionId: string,
    patch: Partial<
      Pick<
        AgentSession,
        | 'title'
        | 'mode'
        | 'status'
        | 'skillIds'
        | 'mcpServerIds'
        | 'usage'
        | 'summary'
        | 'contextReferenceIds'
      >
    >,
  ): AgentSession {
    return this.store.transaction(() => {
      const current = this.get(sessionId);
      const session = {
        ...current,
        ...clone(patch),
        revision: current.revision + 1,
        updatedAt: now(),
      };
      if (!validateAgentSession(session)) throw new AgentContextError('会话状态无效');
      this.store.put('agent_session', session.id, session);
      return clone(session);
    });
  }

  delete(params: Params<'agent.session.delete'>): { deleted: boolean } {
    return this.store.transaction(() => {
      const session = this.get(params.sessionId);
      if (params.revision !== undefined && params.revision !== session.revision)
        throw new AgentContextError('会话已更新，请刷新后重试');
      if (session.status === 'running' || session.status === 'waiting')
        throw new AgentContextError('请先取消正在进行或等待答复的会话');
      for (const kind of [
        'agent_message',
        'agent_context_reference',
        'agent_projection',
        'agent_checkpoint',
        'agent_checkpoint_write',
      ])
        for (const row of this.store.all(kind))
          if (row?.sessionId === session.id || row?.sourceSessionId === session.id)
            this.store.delete(kind, row.id ?? row.sessionId);
      this.store.delete('agent_session', session.id);
      return { deleted: true };
    });
  }

  appendMessage(sessionId: string, input: MessageInput): AgentMessage {
    return this.store.transaction(() => {
      this.get(sessionId);
      const message: AgentMessage = {
        ...clone(input),
        id: input.id ?? randomUUID(),
        sessionId,
        createdAt: now(),
      };
      if (
        !validateAgentMessage(message) ||
        Buffer.byteLength(JSON.stringify(message)) > maximumBytes
      )
        throw new AgentContextError('消息无效或过大');
      const previous = this.store.get('agent_message', message.id);
      if (previous) {
        const { createdAt: _a, ...a } = previous;
        const { createdAt: _b, ...b } = message;
        if (
          !validateAgentMessage(previous) ||
          previous.sessionId !== sessionId ||
          hash(a) !== hash(b)
        )
          throw new AgentContextError('消息标识已用于其他内容');
        return clone(previous);
      }
      this.store.put('agent_message', message.id, message);
      this.patchSession(sessionId, {});
      return clone(message);
    });
  }

  transcript(sessionId: string): AgentMessage[] {
    this.get(sessionId);
    return this.store
      .all('agent_message')
      .filter(
        (row): row is AgentMessage => validateAgentMessage(row) && row.sessionId === sessionId,
      );
  }

  messages(sessionId: string, offset = 0, limit = 50) {
    const all = this.transcript(sessionId);
    const boundedOffset = Math.max(0, Math.trunc(offset));
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return {
      messages: all.slice(boundedOffset, boundedOffset + boundedLimit),
      total: all.length,
      offset: boundedOffset,
      limit: boundedLimit,
    };
  }

  getProjection(sessionId: string): AgentContextProjection | null {
    this.get(sessionId);
    const projection = this.store.get('agent_projection', sessionId);
    return validateAgentContextProjection(projection) && projection.sessionId === sessionId
      ? projection
      : null;
  }

  saveProjection(
    sessionId: string,
    items: AgentJsonValue[],
    expectedRevision?: number,
  ): AgentContextProjection {
    return this.store.transaction(() => {
      const previous = this.getProjection(sessionId);
      if (expectedRevision !== undefined && expectedRevision !== (previous?.revision ?? 0))
        throw new AgentContextError('上下文已更新，请刷新后重试');
      const projection: AgentContextProjection = {
        ...previous,
        sessionId,
        items: clone(items),
        revision: (previous?.revision ?? 0) + 1,
        updatedAt: now(),
      };
      if (
        !validateAgentContextProjection(projection) ||
        Buffer.byteLength(JSON.stringify(projection)) > maximumBytes
      )
        throw new AgentContextError('上下文无效或过大');
      this.store.put('agent_projection', sessionId, projection);
      return clone(projection);
    });
  }

  /** Failed/empty summaries never replace the projection or original transcript. */
  saveSummary(
    sessionId: string,
    input: {
      summary: string;
      throughMessageId: string;
      items?: AgentJsonValue[];
      expectedRevision?: number;
    },
  ): AgentContextProjection {
    return this.store.transaction(() => {
      const summary = input.summary.trim();
      if (!summary || summary.length > 16000 || summary.startsWith('Error generating summary:'))
        throw new AgentContextError('摘要生成失败，已保留原始上下文');
      const transcript = this.transcript(sessionId);
      if (!transcript.some((message) => message.id === input.throughMessageId))
        throw new AgentContextError('摘要来源消息不存在');
      const previous = this.getProjection(sessionId);
      if (
        input.expectedRevision !== undefined &&
        input.expectedRevision !== (previous?.revision ?? 0)
      )
        throw new AgentContextError('上下文已更新，请刷新后重试');
      const projection: AgentContextProjection = {
        sessionId,
        summary,
        throughMessageId: input.throughMessageId,
        items: clone(input.items ?? previous?.items ?? []),
        revision: (previous?.revision ?? 0) + 1,
        updatedAt: now(),
      };
      if (
        !validateAgentContextProjection(projection) ||
        Buffer.byteLength(JSON.stringify(projection)) > maximumBytes
      )
        throw new AgentContextError('摘要上下文无效或过大');
      this.store.put('agent_projection', sessionId, projection);
      this.patchSession(sessionId, { summary });
      return clone(projection);
    });
  }

  listMemory(
    params: Params<'agent.memory.list'> = {},
  ): AgentContract['results']['agent.memory.list'] {
    if (!agentParamValidators['agent.memory.list'](params))
      throw new AgentContextError('记忆查询参数无效');
    const session = params.sessionId ? this.get(params.sessionId) : null;
    const query = params.query?.trim().toLocaleLowerCase();
    const all = this.store
      .all('agent_memory')
      .filter((row): row is AgentMemory => {
        if (!validateAgentMemory(row) || (params.scope && row.scope !== params.scope)) return false;
        if (
          row.scope === 'account' &&
          (!session ||
            row.accountId !== session.scope.accountId ||
            row.deviceId !== session.scope.deviceId ||
            row.clientType !== session.scope.clientType)
        )
          return false;
        return !query || `${row.key}\n${row.content}`.toLocaleLowerCase().includes(query);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 30;
    return { memories: all.slice(offset, offset + limit), total: all.length, offset, limit };
  }

  saveMemory(
    params: Params<'agent.memory.save'>,
    source: AgentMemory['source'] = 'user',
  ): AgentMemory {
    if (!agentParamValidators['agent.memory.save'](params))
      throw new AgentContextError('记忆参数无效');
    return this.store.transaction(() => {
      const session = params.sessionId ? this.get(params.sessionId) : null;
      if (params.scope === 'account' && !session)
        throw new AgentContextError('账号记忆必须绑定会话');
      if (
        params.sourceMessageId &&
        (!session || !this.transcript(session.id).some((m) => m.id === params.sourceMessageId))
      )
        throw new AgentContextError('记忆来源不属于当前会话');
      const expectedId = hash([
        params.scope,
        params.scope === 'account' ? session!.scope.accountId : '',
        params.key,
      ]);
      const id = params.id ?? expectedId;
      const previous = this.store.get('agent_memory', id);
      if (previous) {
        if (
          !validateAgentMemory(previous) ||
          previous.scope !== params.scope ||
          (previous.scope === 'account' && previous.accountId !== session?.scope.accountId)
        )
          throw new AgentContextError('记忆不属于当前范围');
        if (params.revision !== previous.revision)
          throw new AgentContextError('记忆已存在或已更新，请刷新后重试');
      } else if (params.id || params.revision) throw new AgentContextError('待更新的记忆不存在');
      const timestamp = now();
      const memory: AgentMemory = {
        id,
        key: params.key.trim(),
        content: params.content.trim(),
        scope: params.scope,
        ...(params.scope === 'account'
          ? {
              accountId: session!.scope.accountId,
              deviceId: session!.scope.deviceId,
              clientType: session!.scope.clientType,
            }
          : {}),
        ...(session ? { sourceSessionId: session.id } : {}),
        ...(params.sourceMessageId ? { sourceMessageId: params.sourceMessageId } : {}),
        source,
        revision: (previous?.revision ?? 0) + 1,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      if (!validateAgentMemory(memory)) throw new AgentContextError('记忆内容无效');
      this.store.put('agent_memory', id, memory);
      return clone(memory);
    });
  }

  deleteMemory(params: Params<'agent.memory.delete'>): { deleted: boolean } {
    return this.store.transaction(() => {
      const memory = this.store.get('agent_memory', params.id);
      if (!validateAgentMemory(memory)) return { deleted: false };
      if (memory.scope === 'account') {
        if (memory.deviceId === undefined || !memory.clientType || !memory.accountId)
          throw new AgentContextError('记忆范围无效');
        this.assertScope({
          deviceId: memory.deviceId,
          clientType: memory.clientType,
          accountId: memory.accountId,
          identity: 'device-only',
        });
      }
      if (params.revision !== undefined && params.revision !== memory.revision)
        throw new AgentContextError('记忆已更新，请刷新后重试');
      this.store.delete('agent_memory', params.id);
      return { deleted: true };
    });
  }

  references(sessionId: string): AgentContextReference[] {
    const session = this.get(sessionId);
    return session.contextReferenceIds.flatMap((id) => {
      const reference = this.store.get('agent_context_reference', id);
      return validateAgentContextReference(reference) &&
        reference.sessionId === sessionId &&
        sameAgentScope(reference.scope, session.scope)
        ? [reference]
        : [];
    });
  }

  reference(params: Params<'agent.context.reference'>): AgentContextReference {
    if (!agentParamValidators['agent.context.reference'](params))
      throw new AgentContextError('引用参数无效');
    return this.store.transaction(() => {
      const session = this.get(params.sessionId);
      const source = this.get(params.sourceSessionId);
      if (session.id === source.id || !sameAgentScope(session.scope, source.scope))
        throw new AgentContextError('只能引用相同账号范围内的其他会话');
      const transcript = this.transcript(source.id);
      const messageIds = params.messageIds ?? transcript.slice(-20).map((m) => m.id);
      const selected = new Set(messageIds);
      const messages = transcript.filter((m) => selected.has(m.id));
      if (messages.length !== selected.size) throw new AgentContextError('引用包含不存在的消息');
      const summary = [source.summary ?? '', ...messages.map((m) => `${m.role}: ${m.content}`)]
        .filter(Boolean)
        .join('\n')
        .slice(0, 16000);
      const id = hash([session.id, source.id, messageIds, summary]);
      const previous = this.store.get('agent_context_reference', id);
      if (validateAgentContextReference(previous)) return previous;
      const reference: AgentContextReference = {
        id,
        sessionId: session.id,
        sourceSessionId: source.id,
        messageIds,
        summary,
        scope: session.scope,
        createdAt: now(),
      };
      if (!validateAgentContextReference(reference)) throw new AgentContextError('会话引用无效');
      if (session.contextReferenceIds.length >= 100)
        throw new AgentContextError('会话引用数量已达到上限');
      this.store.put('agent_context_reference', id, reference);
      this.patchSession(session.id, { contextReferenceIds: [...session.contextReferenceIds, id] });
      return clone(reference);
    });
  }
}
