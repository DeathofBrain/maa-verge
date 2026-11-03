/** 工具配置、请求去重与本地公招计算；未迁移设备工具只保留设置和历史，不构造原 MaaCore 队列。 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RpcContract } from '@contracts/rpc-types';
import { validateToolConfig, validateToolStartParams } from '@contracts/validators.js';
import { ResourceReader } from '@backend/modules/resources/item-resources';
import { recognitionKey, recognitionSnapshot } from '@backend/modules/recognition/recognition';
import { RpcError } from '@backend/shared/errors';
import { now, type Store } from '@backend/infrastructure/storage/storage';

type Start = RpcContract['params']['tool.start'];
export type ToolConfig = RpcContract['results']['tool.config.get'];
type Client = NonNullable<Start['clientType']>;
type Catalog = RpcContract['results']['tool.catalog'];
interface Host {
  store: Store;
  availability(id: string): RpcContract['results']['device.availability'];
  emit(type: string, message: string, data?: any): unknown;
  preflight?(input: Start, config: ToolConfig): Promise<void>;
}
const labels = {
  depot: '仓库识别',
  operators: '干员识别',
  recruit: '公招计算',
  inventory: '库存保持',
  data: '数据刷新',
  games: '小游戏',
};
export function toolJob(job: any, detail = true): RpcContract['results']['tool.get'] {
  const {
    id,
    toolKind: kind,
    deviceId,
    clientType,
    status,
    progress,
    message,
    startedAt,
    finishedAt,
  } = job;
  return {
    id,
    kind,
    deviceId,
    clientType,
    status,
    progress,
    message: message.slice(0, 1000),
    startedAt,
    finishedAt,
    ...(detail ? { result: job.result ?? {} } : {}),
  };
}
export const toolConfigKey = (deviceId: string, client: string, kind: string, account = '') =>
  JSON.stringify([deviceId, client, kind, account]);

/** 请求查重比较 JSON 的字段语义；旧签名仍可读取，键顺序不应触发一次新的工具执行。 */
function requestSignature(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(requestSignature).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) + ':' + requestSignature((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function sameRequest(prior: string, signature: string): boolean {
  try {
    return requestSignature(JSON.parse(prior)) === signature;
  } catch {
    return prior === signature;
  }
}

export async function toolCatalog(combo: any, client: Client = 'Official'): Promise<Catalog> {
  const result: Catalog = {
    tags: [],
    operators: [],
    games: [],
    resourceVersion: combo.resource?.version ?? null,
    diagnostics: [],
  };
  if (!combo.resource?.path) {
    result.diagnostics.push('尚未安装资源');
    return result;
  }
  const reader = await ResourceReader.create(combo.resource.path);
  if (!reader) {
    result.diagnostics.push('资源目录不可用');
    return result;
  }
  const prefix = ['Official', 'Bilibili'].includes(client)
    ? ''
    : path.join('global', client, 'resource');
  let recruitment: any;
  for (const root of prefix ? [prefix, ''] : ['']) {
    const bytes = await reader.read(path.join(root, 'recruitment.json'), 4 * 1024 * 1024);
    try {
      if (bytes) {
        recruitment = JSON.parse(bytes.toString('utf8'));
        break;
      }
    } catch {
      /* Report unavailable data below. */
    }
  }
  if (
    Array.isArray(recruitment?.operators) &&
    recruitment.operators.length <= 2000 &&
    recruitment.tags &&
    typeof recruitment.tags === 'object'
  ) {
    for (const op of recruitment.operators) {
      if (
        typeof op.id !== 'string' ||
        typeof op.name !== 'string' ||
        !Number.isInteger(op.rarity) ||
        op.rarity < 1 ||
        op.rarity > 6 ||
        !Array.isArray(op.tags)
      )
        continue;
      const tags = op.tags
        .map((tag: any) => recruitment.tags[String(tag)])
        .filter((tag: any) => typeof tag === 'string');
      result.operators.push({ id: op.id, name: op.name, rarity: op.rarity, tags });
    }
    result.tags = [...new Set(result.operators.flatMap((op) => op.tags))].sort();
    result.topOperatorTag = recruitment.tags['高级资深干员'] ?? null;
  } else result.diagnostics.push('公招资源不可用，请更新资源后重试');
  // Only audited fixed task entrypoints are exposed. Never accept arbitrary task names.
  for (const [game, file, entry] of [
    ['pixelpaint', 'PixelPaint', 'MiniGame@PixelPaint@Begin'],
    ['secretfront', 'SecretFront', 'MiniGame@SecretFront@Begin'],
  ] as const) {
    for (const root of prefix ? [prefix, ''] : ['']) {
      const bytes =
        (await reader.read(
          path.join(root, 'tasks', 'MiniGame', file + '.json'),
          4 * 1024 * 1024,
        )) ?? (await reader.read(path.join(root, 'tasks.json'), 16 * 1024 * 1024));
      try {
        if (
          bytes &&
          Object.keys(JSON.parse(bytes.toString('utf8'))).some(
            (key) => key === entry || key.startsWith(entry + '@'),
          )
        ) {
          result.games.push(game);
          break;
        }
      } catch {
        /* Invalid resources remain unavailable. */
      }
    }
  }
  return result;
}

export function calculateRecruit(
  catalog: Catalog,
  tags: string[],
  potentials: Map<string, number>,
) {
  if (!tags.length || tags.some((tag) => !catalog.tags.includes(tag)))
    throw new RpcError(-32602, '请选择有效的公招标签');
  const combinations: any[] = [];
  for (let bits = 1; bits < 1 << tags.length; bits++) {
    const selected = tags.filter((_, index) => bits & (1 << index));
    if (selected.length > 3) continue;
    const topTag = catalog.topOperatorTag;
    const candidates = catalog.operators.filter(
      (op) =>
        selected.every((tag) => op.tags.includes(tag)) &&
        (op.rarity !== 6 || (topTag && selected.includes(topTag))),
    );
    if (candidates.length)
      combinations.push({
        tags: selected,
        minimumRarity: Math.min(...candidates.map((op) => op.rarity)),
        operators: candidates.map((op) => ({ ...op, potential: potentials.get(op.id) ?? null })),
      });
  }
  return combinations.sort(
    (a, b) => b.minimumRarity - a.minimumRarity || a.tags.length - b.tags.length,
  );
}

export class Toolbox {
  private closed = false;
  constructor(private host: Host) {}
  config(deviceId: string, client: Client, kind: Start['kind']): ToolConfig {
    const saved = this.host.store.get(
      'tool_config',
      toolConfigKey(deviceId, client, kind, this.host.store.get('device_account', deviceId, '')),
      {},
    );
    return validateToolConfig(saved) ? saved : {};
  }
  saveConfig(deviceId: string, client: Client, kind: Start['kind'], config: ToolConfig) {
    if (!validateToolConfig(config))
      throw new RpcError(-32602, '工具配置无效', validateToolConfig.errors);
    if (!this.host.store.get('device', deviceId)) throw new RpcError(-32004, '设备不存在');
    if (new Set(config.targets?.map((target) => target.id)).size !== (config.targets?.length ?? 0))
      throw new RpcError(-32602, '库存计划标识不能重复');
    this.host.store.put(
      'tool_config',
      toolConfigKey(deviceId, client, kind, this.host.store.get('device_account', deviceId, '')),
      config,
    );
    return config;
  }
  async start(input: Start) {
    if (!validateToolStartParams(input))
      throw new RpcError(-32602, '工具请求无效', validateToolStartParams.errors);
    const client = input.clientType ?? 'Official';
    const signature = requestSignature({ ...input, clientType: client });
    const prior = this.host.store.get('tool_request', input.requestId);
    if (prior) {
      if (!sameRequest(prior.signature, signature))
        throw new RpcError(-32011, '同一请求标识不能用于不同工具操作');
      return toolJob(this.host.store.get('tool_job', prior.id));
    }
    const config = input.config ?? this.config(input.deviceId, client, input.kind);
    await this.host.preflight?.(input, config);
    // 纯手动标签计算无需连接设备，也不取得设备控制权。
    if (!(input.kind === 'recruit' && config.mode === 'manual')) {
      const availability = this.host.availability(input.deviceId);
      if (!availability.available) throw new RpcError(-32011, availability.reason);
    }
    const afterCheck = this.host.store.get('tool_request', input.requestId);
    if (afterCheck) {
      if (!sameRequest(afterCheck.signature, signature))
        throw new RpcError(-32011, '同一请求标识不能用于不同工具操作');
      return toolJob(this.host.store.get('tool_job', afterCheck.id));
    }
    this.saveConfig(input.deviceId, client, input.kind, config);
    const previousResult =
      input.kind === 'recruit'
        ? this.host.store
            .all('tool_job')
            .reverse()
            .find(
              (item) =>
                item.toolKind === 'recruit' &&
                item.deviceId === input.deviceId &&
                item.clientType === client &&
                item.status === 'completed' &&
                !item.accountInvalidated,
            )?.result
        : undefined;
    const job: any = {
      id: 'tool-' + randomUUID(),
      toolKind: input.kind,
      planId: '',
      planName: labels[input.kind],
      clientType: client,
      deviceId: input.deviceId,
      status: 'running',
      progress: 0,
      message: '正在准备' + labels[input.kind],
      startedAt: now(),
      finishedAt: null,
      config: structuredClone(config),
      result: structuredClone(previousResult ?? {}),
      tasks: [],
    };
    // Claim synchronously, before any asynchronous resource read or native effect.
    this.host.store.transaction(() => {
      this.host.store.put('tool_job', job.id, job);
      this.host.store.put('tool_request', input.requestId, { id: job.id, signature });
    });
    this.host.emit('tool.started', job.message, { job: toolJob(job, false) });
    void this.prepare(job).catch((error) => {
      if (this.closed) return;
      const current = this.host.store.get('tool_job', job.id);
      if (current?.status !== 'running') return;
      Object.assign(current, {
        status: 'failed',
        finishedAt: now(),
        message: String(error).slice(0, 1000),
      });
      this.host.store.put('tool_job', job.id, current);
      this.host.emit('tool.failed', current.message, { job: toolJob(current, false) });
    });
    return toolJob(job);
  }
  private async prepare(job: any) {
    const { config, clientType: client } = job;
    // 只读设备标签识别不能用日常公招替代；其他工具也尚无完整 MaaFramework 执行入口。
    if (job.toolKind !== 'recruit' || config.mode !== 'manual')
      throw new RpcError(
        -32010,
        job.toolKind === 'recruit'
          ? '只读标签识别工具尚未迁移；可使用手动标签计算，自动公招请使用任务表的已迁移流程'
          : `${labels[job.toolKind as Start['kind']]}尚未迁移到 MaaFramework，原设置和历史继续保留`,
      );

    // 计算仅消费已安装招募元数据和同一设备/客户端的历史干员缓存，不取得设备控制权。
    const catalog = await toolCatalog(this.host.store.get('active', 'combo', {}), client);
    const existing = recognitionSnapshot(this.host.store, job.deviceId, 'operators', client);
    const combinations = calculateRecruit(
      catalog,
      config.tags ?? [],
      new Map(
        existing.operators
          .filter((op) => op.own && op.potential >= 1)
          .map((op) => [op.id, op.potential]),
      ),
    );
    // 异步资源读取后重新检查任务存活状态，避免关闭或停止后提交一个完成结果。
    if (this.closed || this.host.store.get('tool_job', job.id)?.status !== 'running') return;
    Object.assign(job, {
      result: { tags: config.tags, combinations },
      status: 'completed',
      progress: 100,
      finishedAt: now(),
      message: '公招计算完成',
    });
    this.host.store.put('tool_job', job.id, job);
    this.host.emit('tool.completed', job.message, { job: toolJob(job, false) });
  }
  stock(job: any): Map<string, number> {
    const scan = recognitionSnapshot(this.host.store, job.deviceId, 'depot', job.clientType);
    const estimated = this.host.store.get(
      'inventory',
      recognitionKey(job.deviceId, job.clientType, 'depot'),
    );
    return new Map(
      (estimated?.collectedAt === scan.collectedAt ? estimated.items : scan.items).map(
        (item: any) => [item.id, item.quantity],
      ),
    );
  }
  finish(job: any, status: string) {
    if (job.toolKind !== 'inventory') return;
    const stock = this.stock(job);
    job.result.targets = (job.config.targets ?? []).map((target: any) => ({
      ...target,
      current: stock.get(target.itemId) ?? 0,
      reached: (stock.get(target.itemId) ?? 0) >= target.quantity,
    }));
    job.result.outcome =
      status !== 'completed'
        ? /未知|超时|核对/.test(job.message)
          ? 'unknown'
          : status
        : job.result.targets.every((target: any) => target.reached)
          ? 'target_reached'
          : 'partial';
    job.result.reason = job.message;
    if (status === 'completed')
      job.message =
        job.result.outcome === 'target_reached'
          ? '所有目标库存均已达标'
          : '流程结束，部分目标尚未达标，请查看逐项结果';
  }
  close() {
    this.closed = true;
  }
}
