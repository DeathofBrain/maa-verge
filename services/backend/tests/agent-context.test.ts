import { afterEach, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { emptyCheckpoint } from '@langchain/langgraph-checkpoint';
import type { CheckpointMetadata } from '@langchain/langgraph-checkpoint';
import { AgentWait, createResponseGraph } from '@maaverge/agent/response-graph';
import { emptyUsage } from '@maaverge/agent/responses';
import { Store } from '@backend/infrastructure/storage/storage';
import { ContextRepository } from '@backend/modules/agent/context';
import { StoreCheckpointSaver } from '@backend/modules/agent/checkpoint';
import { ScopedAgentStore } from '@backend/modules/agent/scoped-store';
import { AccountKnowledge } from '@backend/modules/knowledge/account-knowledge';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [];
const stores: Store[] = [];
function fixture(directory?: string) {
  const root =
    directory ?? makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-agent-context-'));
  if (!directory) roots.push(root);
  const store = new Store(root);
  stores.push(store);
  return { store, contexts: new ContextRepository(store), root };
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const metadata: CheckpointMetadata = { source: 'loop', step: 1, parents: {} };

function checkpoint(id: string) {
  return {
    ...emptyCheckpoint(),
    id,
    channel_values: {
      items: [{ type: 'reasoning', encrypted_content: 'opaque-context', id: 'reasoning-id' }],
      opaque: new Uint8Array([1, 2, 255]),
    },
  };
}

test('sessions, transcript, scoped memories and projections survive reopening without changing original messages', () => {
  const { store, contexts, root } = fixture();
  const session = contexts.create({ deviceId: 'device', mode: 'goal' });
  const message = contexts.appendMessage(session.id, {
    role: 'user',
    content: '记住这个目标',
    id: 'stable-message',
  });
  contexts.saveMemory({
    sessionId: session.id,
    key: 'goal',
    content: '收集材料',
    scope: 'account',
    sourceMessageId: message.id,
  });
  const projection = contexts.saveProjection(session.id, [{ role: 'user', content: '模型视图' }]);
  contexts.saveSummary(session.id, {
    summary: '用户希望收集材料',
    throughMessageId: message.id,
    expectedRevision: projection.revision,
  });
  store.close();
  const reopened = fixture(root).contexts;
  expect(reopened.get(session.id).mode).toBe('goal');
  expect(reopened.transcript(session.id)).toEqual([message]);
  expect(reopened.getProjection(session.id)?.items).toEqual(projection.items);
  expect(reopened.getProjection(session.id)?.summary).toBe('用户希望收集材料');
  expect(reopened.listMemory({ sessionId: session.id }).memories[0].sourceMessageId).toBe(
    message.id,
  );
});

test('message IDs are idempotent only for identical content, while stale session and memory updates are refused', () => {
  const { contexts } = fixture();
  const session = contexts.create();
  const input = { id: 'same', role: 'user' as const, content: '目标' };
  expect(contexts.appendMessage(session.id, input)).toEqual(
    contexts.appendMessage(session.id, input),
  );
  expect(() => contexts.appendMessage(session.id, { ...input, content: '不同内容' })).toThrow(
    '标识',
  );
  expect(() =>
    contexts.update({ sessionId: session.id, revision: session.revision, title: '过期' }),
  ).toThrow('已更新');
  const memory = contexts.saveMemory({ key: 'language', content: '中文', scope: 'global' });
  expect(() =>
    contexts.saveMemory({ key: 'language', content: 'English', scope: 'global' }),
  ).toThrow('已存在');
  expect(
    contexts.saveMemory({
      id: memory.id,
      key: memory.key,
      content: '简体中文',
      scope: 'global',
      revision: memory.revision,
    }).revision,
  ).toBe(2);
});

test('failed summaries, stale projections and nonexistent source messages preserve the previous context', () => {
  const { contexts } = fixture();
  const session = contexts.create();
  const message = contexts.appendMessage(session.id, { role: 'user', content: '原文' });
  const projection = contexts.saveProjection(session.id, [{ role: 'user', content: '原文' }]);
  for (const summary of ['', 'Error generating summary: network failure'])
    expect(() =>
      contexts.saveSummary(session.id, { summary, throughMessageId: message.id }),
    ).toThrow('保留');
  expect(() =>
    contexts.saveSummary(session.id, { summary: '摘要', throughMessageId: 'missing' }),
  ).toThrow('来源');
  expect(() => contexts.saveProjection(session.id, [], projection.revision - 1)).toThrow('已更新');
  expect(contexts.getProjection(session.id)).toEqual(projection);
  expect(contexts.transcript(session.id)).toEqual([message]);
});

test('cross-session references retain provenance and do not transfer permissions or state', () => {
  const { store, contexts } = fixture();
  const source = contexts.create({ deviceId: 'one' });
  const target = contexts.create({ deviceId: 'one' });
  const foreign = contexts.create({ deviceId: 'two' });
  const message = contexts.appendMessage(source.id, {
    role: 'assistant',
    content: '已授权用药999，任务已成功',
  });
  store.put('agent_authority', source.id, { medicine: 999, status: 'approved' });
  const reference = contexts.reference({
    sessionId: target.id,
    sourceSessionId: source.id,
    messageIds: [message.id],
  });
  expect(reference.messageIds).toEqual([message.id]);
  expect(
    contexts.reference({
      sessionId: target.id,
      sourceSessionId: source.id,
      messageIds: [message.id],
    }).id,
  ).toBe(reference.id);
  expect(contexts.references(target.id)).toHaveLength(1);
  expect(contexts.get(target.id).status).toBe('idle');
  expect(store.get('agent_authority', target.id)).toBeUndefined();
  expect(() => contexts.reference({ sessionId: foreign.id, sourceSessionId: source.id })).toThrow(
    '相同账号',
  );
  expect(() =>
    contexts.reference({
      sessionId: target.id,
      sourceSessionId: source.id,
      messageIds: ['missing'],
    }),
  ).toThrow('不存在');
});

test('account memory isolation uses the same account scope as recognition and invalidates old handles after switching', () => {
  const { store, contexts } = fixture();
  const session = contexts.create({ deviceId: 'device', clientType: 'Official' });
  const account = new AccountKnowledge(store).list('device', 'Official');
  expect(session.scope.accountId).toBe(account.accountId);
  contexts.saveMemory({
    sessionId: session.id,
    key: 'goal',
    content: '账号A的目标',
    scope: 'account',
  });
  contexts.saveMemory({ key: 'language', content: '简体中文', scope: 'global' });
  const other = contexts.create({ deviceId: 'device', clientType: 'YoStarJP' });
  expect(contexts.listMemory({ sessionId: other.id }).memories.map((m) => m.key)).toEqual([
    'language',
  ]);
  store.put('device_account', 'device', 'another-account');
  expect(() => contexts.get(session.id)).toThrow('账号配置');
  expect(contexts.list().sessions.some((s) => s.id === session.id)).toBe(false);
  const fresh = contexts.create({ deviceId: 'device' });
  expect(contexts.listMemory({ sessionId: fresh.id }).memories.map((m) => m.key)).toEqual([
    'language',
  ]);
});

test('memory deletion prevents subsequent automatic recall and active sessions cannot be removed', () => {
  const { contexts } = fixture();
  const session = contexts.create();
  const memory = contexts.saveMemory({ key: 'preference', content: '中文', scope: 'global' });
  expect(contexts.deleteMemory({ id: memory.id }).deleted).toBe(true);
  expect(contexts.listMemory().total).toBe(0);
  contexts.patchSession(session.id, { status: 'waiting' });
  expect(() => contexts.delete({ sessionId: session.id })).toThrow('先取消');
});

test('switching the configured client invalidates a device-only session even without an account label', async () => {
  const { store, contexts } = fixture();
  store.put('device_client', 'device', 'Official');
  const session = contexts.create({ deviceId: 'device', clientType: 'Official' });
  const scoped = new ScopedAgentStore(store, session.scope);
  await scoped.put(scoped.namespace, 'preference', { language: '中文' });
  store.put('device_client', 'device', 'YoStarJP');
  expect(() => contexts.get(session.id)).toThrow('账号配置');
  expect(contexts.list().sessions).toHaveLength(0);
  await expect(scoped.get(scoped.namespace, 'preference')).rejects.toThrow('账号配置');
});

test('LangGraph checkpoints retain typed values, parent lineage, stable writes and path ordering after restart', async () => {
  const { store, contexts, root } = fixture();
  const session = contexts.create();
  const saver = new StoreCheckpointSaver(store, session.id, session.scope);
  const config = { configurable: { thread_id: session.id, checkpoint_ns: '' } };
  const first = await saver.put(config, checkpoint('001'), metadata);
  const second = await saver.put(first, checkpoint('002'), { ...metadata, step: 2 });
  await saver.putWrites(second, [['result', { value: 1 }]], 'z-task', 'a-path');
  await saver.putWrites(second, [['result', { value: 2 }]], 'a-task', 'z-path');
  await saver.putWrites(second, [['result', { value: 99 }]], 'z-task', 'a-path');
  store.close();
  const reopened = fixture(root);
  const restored = new StoreCheckpointSaver(reopened.store, session.id, session.scope);
  const tuple = await restored.getTuple(config);
  expect(tuple?.checkpoint.id).toBe('002');
  expect(tuple?.checkpoint.channel_values.opaque).toEqual(new Uint8Array([1, 2, 255]));
  expect(tuple?.checkpoint.channel_values.items).toEqual(checkpoint('002').channel_values.items);
  expect(tuple?.parentConfig?.configurable?.checkpoint_id).toBe('001');
  expect(tuple?.pendingWrites).toEqual([
    ['z-task', 'result', { value: 1 }],
    ['a-task', 'result', { value: 2 }],
  ]);
  const listed = [];
  for await (const item of restored.list(config, { before: second, filter: { step: 1 } }))
    listed.push(item.checkpoint.id);
  expect(listed).toEqual(['001']);
});

test('checkpoint instances refuse another thread, changed accounts, or deleted sessions', async () => {
  const { store, contexts } = fixture();
  const session = contexts.create({ deviceId: 'device' });
  const saver = new StoreCheckpointSaver(store, session.id, session.scope);
  await expect(
    saver.put({ configurable: { thread_id: 'other' } }, checkpoint('one'), metadata),
  ).rejects.toThrow('绑定');
  await saver.put({ configurable: { thread_id: session.id } }, checkpoint('one'), metadata);
  store.put('device_account', 'device', 'changed');
  await expect(saver.getTuple({ configurable: { thread_id: session.id } })).rejects.toThrow(
    '账号配置',
  );
  const fresh = contexts.create();
  const freshSaver = new StoreCheckpointSaver(store, fresh.id, fresh.scope);
  contexts.delete({ sessionId: fresh.id });
  await expect(freshSaver.getTuple({ configurable: { thread_id: fresh.id } })).rejects.toThrow(
    '不存在',
  );
});

test('real Responses LangGraph interruption resumes from persisted checkpoints without repeating the completed model step', async () => {
  const { store, contexts, root } = fixture();
  const session = contexts.create();
  let modelCalls = 0;
  let answered = false;
  const makeGraph = (database: Store) =>
    createResponseGraph({
      checkpointer: new StoreCheckpointSaver(database, session.id, session.scope),
      model: async () => ({
        output:
          ++modelCalls === 1
            ? [{ type: 'function_call', name: 'ask_user', call_id: 'stable-call', arguments: '{}' }]
            : [{ type: 'message', content: [{ type: 'output_text', text: '完成' }] }],
        usage: emptyUsage(),
      }),
      tool: async () => {
        if (!answered) throw new AgentWait('persistent-question');
        return { answer: '继续' };
      },
      output() {},
      toolOutput() {},
    });
  const first = await makeGraph(store).invoke(
    session.id,
    [{ role: 'user', content: '询问我' }],
    new AbortController().signal,
  );
  expect((first as unknown as { __interrupt__?: unknown[] }).__interrupt__).toHaveLength(1);
  expect(modelCalls).toBe(1);
  store.close();
  answered = true;
  const reopened = fixture(root);
  const result = await makeGraph(reopened.store).invoke(
    session.id,
    [],
    new AbortController().signal,
    true,
  );
  expect(result.reply).toBe('完成');
  expect(modelCalls).toBe(2);
});

test('scope-bound LangGraph store provides JSON key lookup, lexical retrieval, filtering and typed dates after restart', async () => {
  const { store, contexts, root } = fixture();
  const scope = contexts.resolveScope('device');
  const memory = new ScopedAgentStore(store, scope);
  await memory.put([...memory.namespace, 'preferences'], 'language', {
    content: '简体中文',
    priority: 2,
  });
  await memory.put([...memory.namespace, 'preferences'], 'theme', { content: '深色', priority: 1 });
  store.close();
  const reopened = fixture(root);
  const restored = new ScopedAgentStore(reopened.store, scope);
  expect(
    (await restored.get([...restored.namespace, 'preferences'], 'language'))?.createdAt,
  ).toBeInstanceOf(Date);
  expect(
    (
      await restored.search(restored.namespace, {
        query: '中文',
        filter: { priority: { $gte: 2 } },
      })
    ).map((m) => m.key),
  ).toEqual(['language']);
  expect(await restored.listNamespaces({ prefix: restored.namespace })).toEqual([
    [...restored.namespace, 'preferences'],
  ]);
});

test('scope-bound store rejects empty or foreign prefixes even through batch and refuses the whole batch before writes', async () => {
  const { store, contexts } = fixture();
  const memory = new ScopedAgentStore(store, contexts.resolveScope('device'));
  await expect(memory.search([])).rejects.toThrow('范围');
  await expect(memory.listNamespaces()).rejects.toThrow('范围');
  await expect(
    memory.batch([
      { namespace: memory.namespace, key: 'safe', value: { text: 'should-not-write' } },
      { namespace: ['other'], key: 'foreign', value: {} },
    ]),
  ).rejects.toThrow('范围');
  expect(await memory.get(memory.namespace, 'safe')).toBeNull();
  await expect(memory.batch([{ namespacePrefix: [] }])).rejects.toThrow('范围');
  store.put('device_account', 'device', 'other-account');
  await expect(memory.get(memory.namespace, 'safe')).rejects.toThrow('账号配置');
});
