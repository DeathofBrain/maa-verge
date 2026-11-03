/** 自定义基建文件只读快照：预检与正式运行都固定字节，能力库不访问任意文件路径。 */
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Plan } from '@backend/modules/settings/models';
export type CustomPlanSnapshot = { document: unknown; sha256: string };
export type LegacyInputs = {
  plans: Record<string, CustomPlanSnapshot>;
  errors: Record<string, string>;
};

async function readSnapshot(filename: string): Promise<CustomPlanSnapshot> {
  const selected = path.resolve(filename),
    before = await lstat(selected);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size > 2 * 1024 * 1024 ||
    (await realpath(selected)) !== selected
  )
    throw new Error('自定义基建文件必须是 2 MiB 内的独立普通文件，不能经过链接');
  const file = await open(selected, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await file.stat();
    // 打开前后的身份与限额都核对，避免同一 inode 在 lstat 与 open 之间膨胀后分配无界缓冲。
    if (
      !opened.isFile() ||
      opened.size > 2 * 1024 * 1024 ||
      opened.size !== before.size ||
      opened.mtimeMs !== before.mtimeMs ||
      opened.ctimeMs !== before.ctimeMs ||
      opened.ino !== before.ino ||
      opened.dev !== before.dev ||
      opened.nlink !== 1
    )
      throw new Error('自定义基建文件在读取前发生变化');
    const bytes = Buffer.alloc(opened.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const part = await file.read(bytes, length, bytes.length - length, null);
      if (!part.bytesRead) break;
      length += part.bytesRead;
    }
    const after = await file.stat(),
      current = await lstat(selected);
    if (
      length !== opened.size ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      current.ino !== opened.ino ||
      current.dev !== opened.dev ||
      current.nlink !== 1 ||
      current.size !== opened.size ||
      current.mtimeMs !== opened.mtimeMs ||
      current.ctimeMs !== opened.ctimeMs ||
      current.isSymbolicLink() ||
      (await realpath(selected)) !== selected
    )
      throw new Error('自定义基建文件在读取期间发生变化，请重新检查');
    const raw = bytes.subarray(0, length);
    return {
      document: JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(raw).replace(/^\ufeff/, ''),
      ),
      sha256: createHash('sha256').update(raw).digest('hex'),
    };
  } finally {
    await file.close();
  }
}

/** 同张表重复引用同文件只读一次；错误由预检按任务位置报告，不修改源文件。 */
export async function snapshotLegacyInputs(tasks: Plan['tasks']): Promise<LegacyInputs> {
  const plans: LegacyInputs['plans'] = Object.create(null),
    errors: LegacyInputs['errors'] = Object.create(null);
  for (const task of tasks) {
    if (
      task.enabled === false ||
      task.params.enable === false ||
      task.type !== 'Infrast' ||
      task.params.mode !== 10000 ||
      typeof task.params.filename !== 'string'
    )
      continue;
    const filename = task.params.filename;
    if (Object.hasOwn(plans, filename) || Object.hasOwn(errors, filename)) continue;
    try {
      plans[filename] = await readSnapshot(filename);
    } catch (error) {
      errors[filename] = error instanceof Error ? error.message : '自定义基建文件读取失败';
    }
  }
  return { plans, errors };
}
