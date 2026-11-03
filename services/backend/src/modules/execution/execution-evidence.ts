import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { RunTask, RunArtifact } from '@contracts/types';
import type { ScreenFrame } from '@contracts/rpc-types';
import { RpcError } from '@backend/shared/errors';
import type { AtomicCapabilityResult } from '@maaverge/automation';

const facilities: Record<string, string> = {
  Mfg: '制造站',
  Trade: '贸易站',
  Control: '控制中枢',
  Power: '发电站',
  Reception: '会客室',
  Office: '办公室',
  Recycle: '加工站',
  Dorm: '宿舍',
  Processing: '加工站',
  Training: '训练室',
  AssistantChange: '助理',
};
const text = (value: unknown, limit = 200): string =>
  typeof value === 'string' ? value.slice(0, limit) : '';
const quantity = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 2_147_483_647;

/** 正式流程证据独立限额；帧字节另存 PNG，数据库只保留观察与状态及原结果摘要。 */
export function boundedExecutionEvidence(result: AtomicCapabilityResult) {
  const original = JSON.stringify(result);
  let remaining = 240 * 1024,
    truncated = false;
  const visit = (value: unknown, depth = 0): unknown => {
    if (remaining < 32 || depth > 12) {
      truncated = true;
      return '[证据已截断]';
    }
    if (typeof value === 'string') {
      const clipped = value.slice(0, Math.min(4096, Math.floor(remaining / 6)));
      if (clipped.length !== value.length) truncated = true;
      remaining -= Buffer.byteLength(JSON.stringify(clipped));
      return clipped;
    }
    if (value === null || typeof value !== 'object') {
      remaining -= 24;
      return value;
    }
    const pairs = Array.isArray(value)
      ? value.map((item, index) => [String(index), item] as const)
      : Object.entries(value);
    const output: Record<string, unknown> = {},
      list: unknown[] = [];
    for (const [index, [key, item]] of pairs.entries()) {
      if (index >= 100 || remaining < 64) {
        truncated = true;
        break;
      }
      // 原语帧可在多层结果重复出现；二进制不挤占业务证据与 NDJSON。
      if (key === 'data' && typeof item === 'string' && item.length > 4096) {
        truncated = true;
        continue;
      }
      remaining -= Buffer.byteLength(key) * 2 + 8;
      if (Array.isArray(value)) list.push(visit(item, depth + 1));
      else output[key] = visit(item, depth + 1);
    }
    return Array.isArray(value) ? list : output;
  };
  return {
    result: visit(result),
    resultSha256: createHash('sha256').update(original).digest('hex'),
    truncated,
  };
}

/** 只映射正式流程已复核的累计掉落与实际名单；请求名单不能作为换班结果。 */
export function recordFrameworkResult(
  task: RunTask,
  capabilityId: string,
  result: AtomicCapabilityResult,
  at: string,
  stage = '',
) {
  const data = result.data as Record<string, any> | null;
  if (!data || typeof data !== 'object') return;
  if (
    capabilityId === 'workflow.fight.legacy_batch' &&
    data.drops &&
    typeof data.drops === 'object'
  ) {
    for (const [itemId, amount] of Object.entries(data.drops)) {
      if (!itemId || itemId.length > 200 || !quantity(amount) || !amount) continue;
      const previous = task.drops.find((item) => item.itemId === itemId);
      if (previous && amount <= previous.quantity) continue;
      if (!previous && task.drops.length >= 200) break;
      const drop = {
        itemId,
        name: itemId,
        quantity: amount,
        stage: text(stage),
        at,
        scope: 'visible_rewards' as const,
      };
      if (previous) Object.assign(previous, drop);
      else task.drops.push(drop);
    }
  }
  if (!capabilityId.startsWith('workflow.infrast.')) return;
  const rooms = Array.isArray(data.rooms) ? data.rooms : [];
  for (const room of rooms.slice(0, 100)) {
    const target = room?.target;
    if (
      !target ||
      typeof target.facility !== 'string' ||
      !Number.isInteger(target.room) ||
      target.room < 1 ||
      target.room > 100
    )
      continue;
    const final = Array.isArray(data.finalChecks)
      ? data.finalChecks.find(
          (check: any) =>
            check?.target?.facility === target.facility && check?.target?.room === target.room,
        )?.result
      : undefined;
    const checked = final ?? room.result;
    const actual = final ? final.data : room.result?.data?.after;
    const names = actual?.operators;
    const verified =
      checked?.status === 'completed' &&
      checked?.verified === true &&
      Array.isArray(names) &&
      names.length <= 20 &&
      names.every(
        (name: unknown) => typeof name === 'string' && name.length > 0 && name.length <= 80,
      ) &&
      new Set(names).size === names.length;
    const facility = facilities[target.facility] ?? text(target.facility, 80);
    const value = {
      facility,
      room: target.room,
      operators: verified ? names : [],
      product: '',
      staffingStatus: verified ? ('confirmed' as const) : ('unavailable' as const),
      message: verified ? '确认后已复读实际进驻名单' : '实际名单未能完整复核，请核对已提交动作',
      at,
    };
    const existing = task.infrastructure.find(
      (item) => item.facility === facility && item.room === target.room,
    );
    if (existing) Object.assign(existing, value);
    else if (task.infrastructure.length < 100) task.infrastructure.push(value);
  }
}

/** Each run stores at most twelve PNGs, each task three, each image below 3 MiB. */
export class RunArtifacts {
  constructor(private root: string) {}
  save(runId: string, task: RunTask, frame: ScreenFrame, label: string) {
    const id = randomUUID(),
      directory = this.directory(runId),
      png = Buffer.from(frame.data, 'base64');
    if (png.length > 3 * 1024 * 1024 - 8192) throw new Error('执行截图超过大小限制');
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, id + '.png'), png, { flag: 'wx', mode: 0o600 });
    const artifact = {
      id,
      kind: 'screenshot' as const,
      label,
      capturedAt: frame.capturedAt,
      width: frame.width,
      height: frame.height,
    };
    (task.artifacts as RunArtifact[]).push(artifact);
    return artifact;
  }
  read(runId: string, artifactId: string) {
    const file = path.join(this.directory(runId), artifactId + '.png');
    try {
      if (statSync(file).size > 3 * 1024 * 1024 - 8192) throw new Error();
      return { mimeType: 'image/png' as const, data: readFileSync(file).toString('base64') };
    } catch {
      throw new RpcError(-32004, '执行截图不存在或已不可用');
    }
  }
  private directory(runId: string) {
    if (!/^run-[a-f0-9]{12}$/.test(runId)) throw new RpcError(-32004, '执行截图不存在');
    return path.join(this.root, 'run-artifacts', runId);
  }
}
