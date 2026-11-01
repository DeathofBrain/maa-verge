import { createHash } from 'node:crypto';
import {
  BaseCheckpointSaver,
  WRITES_IDX_MAP,
  compareWritesSortKeys,
  copyCheckpoint,
  getCheckpointId,
  writesSortKey,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
} from '@langchain/langgraph-checkpoint';
import type { AgentScope } from '@contracts/agent-types';
import type { Store } from '@backend/infrastructure/storage/storage';
import { AgentContextError, ContextRepository, sameAgentScope } from './context';

type Config = Parameters<BaseCheckpointSaver['get']>[0];
type Payload = { type: string; data: string };
interface StoredCheckpoint {
  id: string;
  sessionId: string;
  scope: AgentScope;
  checkpointNs: string;
  checkpointId: string;
  parentCheckpointId?: string;
  checkpoint: Payload;
  metadata: Payload;
}
interface StoredWrite {
  id: string;
  sessionId: string;
  scope: AgentScope;
  checkpointNs: string;
  checkpointId: string;
  taskId: string;
  taskPath: string;
  index: number;
  channel: string;
  value: Payload;
}
const digest = (parts: unknown[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex');

/** Durable LangGraph state under the application's existing SQLite data-root lease. */
export class StoreCheckpointSaver extends BaseCheckpointSaver {
  private readonly contexts: ContextRepository;
  private readonly scope: AgentScope;

  constructor(
    private readonly store: Store,
    private readonly sessionId: string,
    scope: AgentScope,
  ) {
    super();
    this.contexts = new ContextRepository(store);
    this.scope = structuredClone(scope);
  }

  private assertSession() {
    const session = this.contexts.get(this.sessionId);
    if (!sameAgentScope(session.scope, this.scope))
      throw new AgentContextError('检查点账号范围不匹配');
  }

  private configured(config: Config, allowMissingThread = false) {
    this.assertSession();
    const threadId = config.configurable?.thread_id;
    if (threadId !== this.sessionId && !(allowMissingThread && threadId === undefined))
      throw new AgentContextError('检查点只能访问绑定的会话');
    const namespace = config.configurable?.checkpoint_ns ?? '';
    const checkpointId = getCheckpointId(config) || undefined;
    if (
      typeof namespace !== 'string' ||
      namespace.length > 2000 ||
      (checkpointId !== undefined &&
        (typeof checkpointId !== 'string' || !checkpointId || checkpointId.length > 200))
    )
      throw new AgentContextError('检查点标识无效');
    return { namespace, checkpointId };
  }

  private config(namespace: string, checkpointId: string): Config {
    return {
      configurable: {
        thread_id: this.sessionId,
        checkpoint_ns: namespace,
        checkpoint_id: checkpointId,
      },
    };
  }

  private async encode(value: unknown): Promise<Payload> {
    const [type, data] = await this.serde.dumpsTyped(value);
    if (data.byteLength > 8 * 1024 * 1024) throw new AgentContextError('检查点内容过大');
    return { type, data: Buffer.from(data).toString('base64') };
  }

  private decode(payload: Payload): Promise<any> {
    if (
      !payload ||
      typeof payload.type !== 'string' ||
      typeof payload.data !== 'string' ||
      payload.data.length > 12 * 1024 * 1024
    )
      throw new AgentContextError('检查点数据损坏');
    return this.serde.loadsTyped(payload.type, Buffer.from(payload.data, 'base64'));
  }

  private rows(): StoredCheckpoint[] {
    return this.store
      .all('agent_checkpoint')
      .filter(
        (row): row is StoredCheckpoint =>
          row?.sessionId === this.sessionId && sameAgentScope(row.scope ?? {}, this.scope),
      );
  }

  private async tuple(row: StoredCheckpoint): Promise<CheckpointTuple> {
    const writes: StoredWrite[] = this.store
      .all('agent_checkpoint_write')
      .filter(
        (write): write is StoredWrite =>
          write?.sessionId === this.sessionId &&
          sameAgentScope(write.scope ?? {}, this.scope) &&
          write.checkpointNs === row.checkpointNs &&
          write.checkpointId === row.checkpointId,
      );
    writes.sort((a, b) =>
      compareWritesSortKeys(
        writesSortKey(a.taskPath, a.taskId, a.index),
        writesSortKey(b.taskPath, b.taskId, b.index),
      ),
    );
    const pendingWrites: NonNullable<CheckpointTuple['pendingWrites']> = [];
    for (const write of writes)
      pendingWrites.push([write.taskId, write.channel, await this.decode(write.value)]);
    const checkpoint = await this.decode(row.checkpoint);
    const metadata = await this.decode(row.metadata);
    this.assertSession();
    return {
      config: this.config(row.checkpointNs, row.checkpointId),
      checkpoint,
      metadata,
      pendingWrites,
      ...(row.parentCheckpointId
        ? { parentConfig: this.config(row.checkpointNs, row.parentCheckpointId) }
        : {}),
    };
  }

  async getTuple(config: Config): Promise<CheckpointTuple | undefined> {
    const { namespace, checkpointId } = this.configured(config);
    const row = this.rows()
      .filter(
        (item) =>
          item.checkpointNs === namespace && (!checkpointId || item.checkpointId === checkpointId),
      )
      .sort((a, b) => b.checkpointId.localeCompare(a.checkpointId))[0];
    return row ? this.tuple(row) : undefined;
  }

  async *list(
    config: Config,
    options: CheckpointListOptions = {},
  ): AsyncGenerator<CheckpointTuple> {
    const { checkpointId } = this.configured(config, true);
    if (options.before) this.configured(options.before, true);
    const before = options.before ? getCheckpointId(options.before) : undefined;
    const namespace = config.configurable?.checkpoint_ns;
    const rows = this.rows()
      .filter(
        (row) =>
          (namespace === undefined || row.checkpointNs === namespace) &&
          (!checkpointId || row.checkpointId === checkpointId) &&
          (!before || row.checkpointId < before),
      )
      .sort((a, b) => b.checkpointId.localeCompare(a.checkpointId));
    let remaining = options.limit ?? Number.POSITIVE_INFINITY;
    for (const row of rows) {
      if (remaining <= 0) break;
      const tuple = await this.tuple(row);
      if (
        options.filter &&
        !Object.entries(options.filter).every(
          ([key, value]) =>
            JSON.stringify((tuple.metadata as Record<string, unknown> | undefined)?.[key]) ===
            JSON.stringify(value),
        )
      )
        continue;
      remaining--;
      yield tuple;
    }
  }

  async put(config: Config, checkpoint: Checkpoint, metadata: CheckpointMetadata): Promise<Config> {
    const { namespace, checkpointId: parentCheckpointId } = this.configured(config);
    if (typeof checkpoint.id !== 'string' || !checkpoint.id || checkpoint.id.length > 200)
      throw new AgentContextError('检查点标识无效');
    const encodedCheckpoint = await this.encode(copyCheckpoint(checkpoint));
    const encodedMetadata = await this.encode(metadata);
    this.assertSession();
    const id = digest([this.sessionId, namespace, checkpoint.id]);
    this.store.put('agent_checkpoint', id, {
      id,
      sessionId: this.sessionId,
      scope: this.scope,
      checkpointNs: namespace,
      checkpointId: checkpoint.id,
      ...(parentCheckpointId ? { parentCheckpointId } : {}),
      checkpoint: encodedCheckpoint,
      metadata: encodedMetadata,
    } satisfies StoredCheckpoint);
    return this.config(namespace, checkpoint.id);
  }

  async putWrites(
    config: Config,
    writes: PendingWrite[],
    taskId: string,
    taskPath = '',
  ): Promise<void> {
    const { namespace, checkpointId } = this.configured(config);
    if (
      !checkpointId ||
      !taskId ||
      taskId.length > 200 ||
      taskPath.length > 2000 ||
      writes.length > 1000
    )
      throw new AgentContextError('检查点中间写入参数无效');
    const pending: StoredWrite[] = [];
    for (const [position, [channel, value]] of writes.entries()) {
      const index = WRITES_IDX_MAP[channel] ?? position;
      pending.push({
        id: digest([this.sessionId, namespace, checkpointId, taskId, index]),
        sessionId: this.sessionId,
        scope: this.scope,
        checkpointNs: namespace,
        checkpointId,
        taskId,
        taskPath,
        index,
        channel,
        value: await this.encode(value),
      });
    }
    this.assertSession();
    this.store.transaction(() => {
      for (const row of pending) {
        if (row.index >= 0 && this.store.get('agent_checkpoint_write', row.id)) continue;
        this.store.put('agent_checkpoint_write', row.id, row);
      }
    });
  }

  async deleteThread(threadId: string): Promise<void> {
    this.configured({ configurable: { thread_id: threadId } });
    this.store.transaction(() => {
      for (const kind of ['agent_checkpoint', 'agent_checkpoint_write'])
        for (const row of this.store.all(kind))
          if (row?.sessionId === this.sessionId && sameAgentScope(row.scope ?? {}, this.scope))
            this.store.delete(kind, row.id);
    });
  }
}
