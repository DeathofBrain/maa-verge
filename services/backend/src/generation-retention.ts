/** Best-effort retention of immutable component generations, never worker references. */
import { lstat, open, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';

const generationName = /^(core|resource)-[a-f0-9]{32}$/;
// Resource manifests include the complete ownedFiles inventory returned by the
// bounded update job, and can be much larger than version.json metadata.
const manifestLimit = 16 * 1024 * 1024;
type Generation = { directory: string; parent: string; channel: 'core' | 'resource'; time: number; device: number; inode: number };
const key = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const within = (parent: string, child: string) => {
  const relative = path.relative(key(parent), key(child));
  return !relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
};

async function plainDirectory(directory: string): Promise<boolean> {
  try {
    const info = await lstat(directory);
    // Resolve every ancestor too: a linked component root must not grant access
    // to a different tree merely because its final directory is not a link.
    return info.isDirectory() && !info.isSymbolicLink() && key(await realpath(directory)) === key(directory);
  } catch { return false; }
}

async function generation(directory: string, parent: string, channel: Generation['channel']): Promise<Generation | undefined> {
  try {
    if (!within(parent, directory) || !await plainDirectory(directory)) return;
    const info = await lstat(directory);
    let time = info.mtimeMs;
    const manifest = path.join(directory, 'manifest.json');
    try {
      const before = await lstat(manifest);
      if (!before.isFile() || before.isSymbolicLink() || before.size > manifestLimit) return;
      const file = await open(manifest, 'r');
      try {
        const opened = await file.stat();
        if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size ||
            key(await realpath(manifest)) !== key(manifest)) return;
        const bytes = Buffer.alloc(opened.size + 1);
        let length = 0;
        while (length < bytes.length) {
          const { bytesRead } = await file.read(bytes, length, bytes.length - length, null);
          if (!bytesRead) break;
          length += bytesRead;
        }
        if (length !== opened.size) return;
        const value = JSON.parse(bytes.subarray(0, length).toString('utf8'));
        // A foreign or damaged manifest is not evidence that we own this tree.
        if (typeof value?.path !== 'string' || !path.isAbsolute(value.path) || key(value.path) !== key(directory) ||
            typeof value.version !== 'string' || !value.version.trim()) return;
        const validated = typeof value.validatedAt === 'string' ? Date.parse(value.validatedAt) : NaN;
        if (Number.isFinite(validated)) time = validated;
      } finally { await file.close(); }
    } catch (error) {
      // A missing manifest is an interrupted preparation, identified by its
      // private generation name. Other failures leave the directory untouched.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return;
    }
    return { directory, parent, channel, time, device: info.dev, inode: info.ino };
  } catch { return; }
}

async function plainTree(directory: string): Promise<boolean> {
  try {
    const pending = [directory];
    while (pending.length) {
      const current = pending.pop()!;
      if (!await plainDirectory(current)) return false;
      for (const entry of await readdir(current, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) return false;
        if (entry.isDirectory()) pending.push(path.join(current, entry.name));
        else if (!entry.isFile()) return false;
      }
    }
    return true;
  } catch { return false; }
}

/**
 * Keep at most `limit` generations per component across current and old roots.
 * References (active, previous, staged, and any live worker paths) always win,
 * including references inside a generation. Call within the update mutation
 * queue after persisting those references; this function never edits the store.
 */
export async function pruneGenerations(roots: string[], references: string[], limit = 3): Promise<void> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('组件版本保留数量必须为正整数');
  const protectedPaths = new Set<string>();
  for (const reference of references) {
    if (typeof reference !== 'string' || !path.isAbsolute(reference)) continue;
    protectedPaths.add(key(reference));
    try { protectedPaths.add(key(await realpath(reference))); } catch { /* Keep missing references by their saved path. */ }
  }
  const candidates = new Map<string, Generation>();
  const parents = new Set<string>();
  for (const root of roots) {
    if (typeof root !== 'string' || !path.isAbsolute(root) || !await plainDirectory(root)) continue;
    const parent = path.join(path.resolve(root), 'generations');
    if (parents.has(key(parent)) || !await plainDirectory(parent)) continue;
    parents.add(key(parent));
    try {
      for (const entry of await readdir(parent, { withFileTypes: true })) {
        const match = generationName.exec(entry.name);
        if (!match || !entry.isDirectory() || entry.isSymbolicLink()) continue;
        const candidate = await generation(path.join(parent, entry.name), parent, match[1] as Generation['channel']);
        if (candidate) candidates.set(key(candidate.directory), candidate);
      }
    } catch { /* An unavailable old root must not block a validated update. */ }
  }
  const referenced = (candidate: Generation) => [...protectedPaths].some(reference => within(candidate.directory, reference));
  for (const channel of ['core', 'resource'] as const) {
    const versions = [...candidates.values()].filter(candidate => candidate.channel === channel)
      .sort((left, right) => right.time - left.time || key(left.directory).localeCompare(key(right.directory)));
    const protectedVersions = versions.filter(referenced);
    const keep = new Set(protectedVersions.map(candidate => key(candidate.directory)));
    for (const candidate of versions.filter(candidate => !referenced(candidate)).slice(0, Math.max(0, limit - protectedVersions.length))) {
      keep.add(key(candidate.directory));
    }
    for (const candidate of versions) {
      if (keep.has(key(candidate.directory))) continue;
      try {
        if (!await plainDirectory(candidate.parent) || !await plainTree(candidate.directory)) continue;
        const current = await lstat(candidate.directory);
        if (current.dev !== candidate.device || current.ino !== candidate.inode || !within(candidate.parent, candidate.directory)) continue;
        await rm(candidate.directory, { recursive: true });
      } catch { /* Locked or concurrently removed generations can be retried later. */ }
    }
  }
}
