import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { AtomicResourceSource } from '@maaverge/automation';
import { ResourceReader } from './item-resources';

/** 宿主将选定资源目录适配为只读端口，隔离文件系统校验与能力库的语义解析。 */
export async function openAtomicResourceSource(
  generation: string,
): Promise<AtomicResourceSource | null> {
  // 优先按 generation/resource 解析；兼容调用方已明确选定的普通资源目录。
  let reader = await ResourceReader.create(generation);
  let resourceRoot = path.join(generation, 'resource');
  if (!reader) {
    try {
      const info = await lstat(generation),
        canonical = await realpath(generation);
      if (
        path.isAbsolute(generation) &&
        info.isDirectory() &&
        !info.isSymbolicLink() &&
        path.resolve(canonical) === path.resolve(generation)
      ) {
        reader = new ResourceReader(canonical);
        resourceRoot = canonical;
      }
    } catch {
      // 当前来源不可用即保持不可用，不自行改选其他资源代。
    }
  }
  if (!reader) return null;
  const selected = reader;
  return {
    // 复用 ResourceReader 的路径、链接、字节上限及读取一致性检查。
    read: (relative, maxBytes) => selected.read(relative, maxBytes),
    async listTemplates() {
      const ids = new Set<string>();
      let budget = 12_000;
      // 模板遍历限制深度和总条目数，并拒绝文件与目录链接。
      const visit = async (relative: string, depth: number): Promise<void> => {
        if (depth > 12 || budget <= 0) throw new Error('模板目录超出范围');
        const directory = path.join(resourceRoot, relative);
        if ((await lstat(directory)).isSymbolicLink()) throw new Error('模板目录不能含符号链接');
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (--budget <= 0) throw new Error('模板数量超出范围');
          const child = path.join(relative, entry.name);
          if (entry.isSymbolicLink()) throw new Error('模板不能含符号链接');
          if (entry.isDirectory()) await visit(child, depth + 1);
          else if (entry.isFile() && entry.name.endsWith('.png')) {
            // 保留叶子名称和模板根下的相对标识，兼容资源中两种引用方式。
            ids.add(entry.name);
            ids.add(child.slice('template/'.length).replaceAll(path.sep, '/'));
          }
        }
      };
      try {
        await visit('template', 0);
        return { ids: [...ids], complete: true };
      } catch {
        // 失败不补造模板；保留已安全枚举的部分结果，由语义层报告诊断。
        return { ids: [...ids], complete: false };
      }
    },
  };
}
