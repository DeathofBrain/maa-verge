import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RpcContract } from '@contracts/rpc-types';
import { validateToolConfig, validateToolStartParams } from '@contracts/validators.js';
import { ResourceReader } from '@backend/modules/resources/item-resources';
import { recognitionKey, recognitionSnapshot } from '@backend/modules/recognition/recognition';
import { recordDrops } from '@backend/modules/execution/execution-evidence';
import { validatePlan } from '@backend/modules/plans/task-policy';
import { parseSettings } from '@backend/modules/settings/models';
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
  begin(job: any): Promise<void>;
  stages(client: Client): Promise<RpcContract['results']['stages.list']>;
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
    const signature = JSON.stringify({ ...input, clientType: client });
    const prior = this.host.store.get('tool_request', input.requestId);
    if (prior) {
      if (prior.signature !== signature)
        throw new RpcError(-32011, '同一请求标识不能用于不同工具操作');
      return toolJob(this.host.store.get('tool_job', prior.id));
    }
    const availability = this.host.availability(input.deviceId);
    if (!availability.available) throw new RpcError(-32011, availability.reason);
    const config = input.config ?? this.config(input.deviceId, client, input.kind);
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
    const tasks: any[] = [],
      params = { client_type: client };
    const add = (type: string, extra: any = {}) =>
      tasks.push({ type, params: { ...params, ...extra }, enabled: true });
    if (job.toolKind === 'depot') add('Depot');
    if (job.toolKind === 'operators') add('OperBox');
    if (job.toolKind === 'data') {
      if (config.operators !== false) add('OperBox');
      if (config.depot !== false) add('Depot');
    }
    if (job.toolKind === 'recruit') {
      if (config.mode === 'manual') {
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
        return;
      }
      add('Recruit', {
        times: 0,
        select: [],
        confirm: [],
        refresh: false,
        force_refresh: false,
        expedite: false,
        set_time: false,
        report_to_penguin: false,
        report_to_yituliu: false,
      });
    }
    if (job.toolKind === 'games') {
      const catalog = await toolCatalog(this.host.store.get('active', 'combo', {}), client);
      const game = config.game ?? 'pixelpaint';
      if (!catalog.games.includes(game))
        throw new RpcError(-32010, '当前资源未提供此小游戏，请先更新资源');
      add('Custom', {
        task_names: [
          game === 'pixelpaint'
            ? 'MiniGame@PixelPaint@Begin'
            : `MiniGame@SecretFront@Begin@Ending${config.ending ?? 'A'}${config.branch ? '@' + config.branch : ''}`,
        ],
      });
    }
    if (job.toolKind === 'inventory') {
      if (!config.targets?.length) throw new RpcError(-32602, '请先添加目标库存计划');
      const catalog = await this.host.stages(client);
      if (this.closed || this.host.store.get('tool_job', job.id)?.status !== 'running') return;
      const activity = catalog.activities.some((item) => item.status === 'active');
      const resourceOpen = catalog.activities.some(
        (item) => item.status === 'active' && item.id === 'resource-collection',
      );
      if (
        (config.skipDuringActivity && activity) ||
        (config.skipDuringResourceCollection && resourceOpen)
      ) {
        Object.assign(job, {
          status: 'completed',
          progress: 100,
          finishedAt: now(),
          message: '符合活动跳过条件，本次未执行补货',
          result: { outcome: 'skipped' },
        });
        this.host.store.put('tool_job', job.id, job);
        this.host.emit('tool.completed', job.message, { job: toolJob(job, false) });
        return;
      }
      if (config.updateDepot !== false) add('Depot');
      else if (!recognitionSnapshot(this.host.store, job.deviceId, 'depot', client).collectedAt)
        throw new RpcError(-32010, '尚无库存数据，请启用执行前刷新仓库');
      const targets = [...config.targets];
      job.inventoryTargets = {};
      for (const target of targets) {
        const stage = catalog.stages.find((stage) => stage.value === target.stage);
        if (stage && !stage.available) {
          (job.result.skipped ??= []).push({ ...target, reason: '关卡当前不可用' });
          continue;
        }
        if (!target.stage || ['LastBattle', ''].includes(target.stage))
          throw new RpcError(-32602, '库存保持需要指定明确关卡');
        job.inventoryTargets[tasks.length] = target;
        add('Fight', {
          stage: target.stage,
          drops: { [target.itemId]: target.quantity },
          times: 2147483647,
          medicine: target.medicine,
          stone: target.stone,
          series: config.autoSeries ? 0 : 1,
          report_to_penguin: false,
          report_to_yituliu: false,
        });
      }
    }
    const plan: any = {
      id: '',
      name: job.planName,
      tasks,
      deviceId: job.deviceId,
      enabled: true,
      schedule: null,
    };
    validatePlan(plan, parseSettings(this.host.store.get('settings', 'main')));
    if (this.closed || this.host.store.get('tool_job', job.id)?.status !== 'running') return;
    job.tasks = tasks.map((task, index) => ({
      index,
      type: task.type,
      status: 'waiting',
      message: '等待执行',
      startedAt: null,
      finishedAt: null,
      drops: [],
      infrastructure: [],
      artifacts: [],
    }));
    this.host.store.transaction(() => {
      this.host.store.put('tool_job', job.id, job);
      this.host.store.put('run_plan', job.id, plan);
    });
    if (tasks.length) await this.host.begin(job);
    else {
      Object.assign(job, {
        status: 'completed',
        progress: 100,
        finishedAt: now(),
        message: '没有需要执行的项目',
      });
      this.host.store.put('tool_job', job.id, job);
      this.host.emit('tool.completed', job.message, { job: toolJob(job, false) });
    }
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
  beforeTask(job: any, index: number): boolean {
    if (job.toolKind !== 'inventory' || !job.inventoryTargets?.[index]) return true;
    // The refresh task has committed its verified snapshot before reaching this
    // boundary. Sort the remaining native tasks using that snapshot, once.
    if (job.config.sortByProgress && !job.inventorySorted) {
      const stock = this.stock(job),
        plan = this.host.store.get('run_plan', job.id);
      const indices = Object.keys(job.inventoryTargets)
        .map(Number)
        .filter((i) => i >= index);
      const targets = indices
        .map((i) => job.inventoryTargets[i])
        .sort(
          (a, b) =>
            (stock.get(a.itemId) ?? 0) / a.quantity - (stock.get(b.itemId) ?? 0) / b.quantity,
        );
      indices.forEach((i, order) => {
        const target = targets[order];
        job.inventoryTargets[i] = target;
        Object.assign(plan.tasks[i].params, {
          stage: target.stage,
          medicine: target.medicine,
          stone: target.stone,
          drops: { [target.itemId]: target.quantity },
        });
      });
      job.inventorySorted = true;
      this.host.store.put('run_plan', job.id, plan);
    }
    const target = job.inventoryTargets[index],
      shortage = target.quantity - (this.stock(job).get(target.itemId) ?? 0);
    if (
      shortage <= 0 ||
      (job.config.onlyFirst &&
        job.executedInventory !== undefined &&
        job.executedInventory !== index)
    )
      return false;
    const plan = this.host.store.get('run_plan', job.id);
    plan.tasks[index].params.drops = { [target.itemId]: shortage };
    this.host.store.put('run_plan', job.id, plan);
    this.host.store.put('tool_job', job.id, job);
    return true;
  }
  drops(job: any, state: any, details: any) {
    if (job.toolKind !== 'inventory') return;
    state.inventoryDrops ??= { drops: [] };
    const before = new Map<string, number>(
      state.inventoryDrops.drops.map((drop: any) => [drop.itemId, drop.quantity]),
    );
    if (!recordDrops(state.inventoryDrops, details, now())) return;
    const scan = recognitionSnapshot(this.host.store, job.deviceId, 'depot', job.clientType),
      stock = this.stock(job);
    for (const drop of state.inventoryDrops.drops)
      stock.set(
        drop.itemId,
        (stock.get(drop.itemId) ?? 0) + drop.quantity - (before.get(drop.itemId) ?? 0),
      );
    this.host.store.put('inventory', recognitionKey(job.deviceId, job.clientType, 'depot'), {
      deviceId: job.deviceId,
      clientType: job.clientType,
      collectedAt: scan.collectedAt,
      estimatedAt: now(),
      items: [...stock].map(([id, quantity]) => ({ id, quantity })),
    });
  }
  finish(job: any, status: string) {
    if (job.toolKind === 'games' && status === 'completed') {
      job.result = { outcome: 'core_completed' };
      job.message = '小游戏核心流程已结束且核心空闲，请在设备上核对游戏结果';
    }
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
  recruitResult(job: any, value: any): { combinations: any[]; collectedAt: string } | undefined {
    if (!Array.isArray(value?.result) || !value.result.length || value.result.length > 100) return;
    const own = new Map(
      recognitionSnapshot(this.host.store, job.deviceId, 'operators', job.clientType)
        .operators.filter((op) => op.own && op.potential >= 1)
        .map((op) => [op.id, op.potential]),
    );
    const combinations = [];
    for (const combination of value.result) {
      if (
        !Array.isArray(combination.tags) ||
        combination.tags.length > 3 ||
        !combination.tags.every((tag: unknown) => typeof tag === 'string' && tag.length <= 80) ||
        !Number.isInteger(combination.level) ||
        combination.level < 1 ||
        combination.level > 6 ||
        !Array.isArray(combination.opers) ||
        !combination.opers.length ||
        combination.opers.length > 2000
      )
        return;
      const operators = [];
      for (const op of combination.opers) {
        if (
          typeof op.id !== 'string' ||
          op.id.length > 200 ||
          typeof op.name !== 'string' ||
          !op.name ||
          op.name.length > 300 ||
          !Number.isInteger(op.level) ||
          op.level < 1 ||
          op.level > 6
        )
          return;
        operators.push({
          id: op.id,
          name: op.name,
          rarity: op.level,
          potential: own.get(op.id) ?? null,
        });
      }
      combinations.push({ tags: combination.tags, minimumRarity: combination.level, operators });
    }
    if (Buffer.byteLength(JSON.stringify(combinations)) > 2 * 1024 * 1024) return;
    return { combinations, collectedAt: now() };
  }
  close() {
    this.closed = true;
  }
}
