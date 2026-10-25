/** Payload integrity for newly validated, immutable component generations. */
import { createHash } from 'node:crypto';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export type SnapshotIntegrity = { installedFiles: string[]; installedHash: string };

const pathKey = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
const invalid = (detail: string) => new Error('组件快照完整性校验失败: ' + detail);

function payloadFiles(files: string[]): string[] {
  if (!Array.isArray(files) || !files.length) throw invalid('文件清单不能为空');
  const seen = new Set<string>();
  const result = files.map((relative: unknown) => {
    if (typeof relative !== 'string' || !relative || relative.includes('\0') || relative.includes(':') ||
        path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative)) throw invalid('文件清单包含不安全路径');
    const parts = relative.split(/[\\/]/);
    if (parts.some(part => !part || part === '.' || part === '..')) throw invalid('文件清单包含不安全路径');
    const normalized = parts.join('/'), key = pathKey(normalized);
    if (key === pathKey('manifest.json')) throw invalid('文件清单不能包含安装清单本身');
    if (seen.has(key)) throw invalid('文件清单包含重复路径');
    seen.add(key);
    return normalized;
  });
  // Code-unit ordering is deterministic and independent of the host locale.
  return result.sort();
}

/**
 * Enumerate a new candidate, or verify its saved payload list. This function does
 * not establish whether an old, untracked generation was originally complete.
 * All disk reads yield; no file contents are buffered or read synchronously.
 */
export async function snapshotIntegrity(root: string, files?: string[]): Promise<SnapshotIntegrity> {
  const directory = path.resolve(root), checked = new Map<string, Promise<void>>();
  const plainDirectory = (current: string): Promise<void> => {
    const key = pathKey(current);
    const previous = checked.get(key); if (previous) return previous;
    const checking = (async () => {
      const parent = path.dirname(current);
      if (parent !== current) await plainDirectory(parent);
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) throw invalid('目录不能是链接或特殊文件');
    })();
    checked.set(key, checking); return checking;
  };
  await plainDirectory(directory);

  let installedFiles: string[];
  if (files !== undefined) installedFiles = payloadFiles(files);
  else {
    const collected: string[] = [];
    const visit = async (current: string, prefix: string): Promise<void> => {
      await plainDirectory(current);
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const relative = prefix + entry.name, filename = path.join(current, entry.name);
        const info = await lstat(filename);
        if (info.isSymbolicLink()) throw invalid('文件系统链接不允许出现在快照中');
        if (info.isDirectory()) await visit(filename, relative + '/');
        else if (info.isFile()) {
          if (pathKey(relative) !== pathKey('manifest.json')) collected.push(relative);
        } else throw invalid('特殊文件不允许出现在快照中');
      }
    };
    await visit(directory, '');
    installedFiles = payloadFiles(collected);
  }

  const hashFile = async (relative: string): Promise<string> => {
    const filename = path.join(directory, ...relative.split('/'));
    await plainDirectory(path.dirname(filename));
    const before = await lstat(filename);
    if (!before.isFile() || before.isSymbolicLink()) throw invalid('清单条目不是普通文件');
    // Also catches an intermediate directory replaced with a link after it was
    // checked, before opening a file through that directory.
    const plainPath = async () => {
      if (pathKey(await realpath(filename)) !== pathKey(filename)) throw invalid('文件路径经过文件系统链接');
    };
    await plainPath();
    const file = await open(filename, 'r');
    try {
      const opened = await file.stat();
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) {
        throw invalid('文件在读取前发生变化');
      }
      const content = createHash('sha256');
      let length = 0;
      for await (const chunk of file.createReadStream({ autoClose: false })) {
        length += chunk.length;
        content.update(chunk);
      }
      const after = await file.stat(), current = await lstat(filename);
      if (length !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs ||
          after.ctimeMs !== opened.ctimeMs || current.isSymbolicLink() || !current.isFile() ||
          current.dev !== opened.dev || current.ino !== opened.ino) throw invalid('文件在读取期间发生变化');
      await plainPath();
      // JSON framing preserves path and size boundaries, including Unicode and
      // newlines in legal filenames. Each file's bytes have their own SHA-256.
      return JSON.stringify([relative, opened.size, content.digest('hex')]) + '\n';
    } finally { await file.close(); }
  };
  // Resource snapshots contain thousands of small files. Bound disk work and
  // open handles, then fold hashes in the original deterministic path order.
  const entries = new Array<string>(installedFiles.length);
  let next = 0, failed = false;
  const workers = await Promise.allSettled(Array.from({ length: Math.min(8, installedFiles.length) }, async () => {
    while (!failed && next < installedFiles.length) {
      const index = next++;
      try { entries[index] = await hashFile(installedFiles[index]!); }
      catch (error) { failed = true; throw error; }
    }
  }));
  // Settle every open file before returning a failure to callers that may
  // immediately remove the rejected candidate (notably on Windows).
  for (const worker of workers) if (worker.status === 'rejected') throw worker.reason;
  const digest = createHash('sha256');
  for (const entry of entries) digest.update(entry);
  return { installedFiles, installedHash: digest.digest('hex') };
}
