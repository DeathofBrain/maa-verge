/** Safe two-pass extraction. Every member is validated before selecting runtime files. */
import { createReadStream, createWriteStream } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rmdir,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Parser, type ReadEntry } from 'tar';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { casefold } from './casefold.ts';

export const MAX_EXPANDED_BYTES = 8 * 1024 ** 3;
export const MAX_LINK_BYTES = 4096;
type Kind = 'file' | 'directory' | 'link';
type Member = { name: string; target: string; kind: Kind; mode: number; size: number; zip?: Entry };
export interface ExtractOptions {
  maxExpandedBytes?: number;
  rejectIncremental?: boolean;
}

export function safeDestination(root: string, name: string): string {
  const normalized = name.replaceAll('\\', '/');
  const parts = normalized.split('/').filter((part) => part && part !== '.');
  if (
    normalized.startsWith('/') ||
    name.includes('\0') ||
    parts.includes('..') ||
    parts.some((part) => part.includes(':'))
  )
    throw new Error(`压缩包包含不安全路径: ${name}`);
  const destination = path.resolve(root, ...parts);
  const relative = path.relative(path.resolve(root), destination);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('压缩包路径越界');
  }
  return destination;
}

function coreMembers(root: string, members: Map<string, Member>): Set<string> {
  const platforms: Record<string, string> = {
    'MaaCore.dll': 'windows',
    'libMaaCore.so': 'linux',
    'libMaaCore.dylib': 'macos',
  };
  const roots: Array<[string, string]> = [];
  for (const member of members.values()) {
    const parts = path.relative(root, member.target).split(path.sep);
    const system = platforms[path.basename(member.target)];
    const resource = members.get(
      path.join(path.dirname(member.target), 'resource', 'version.json'),
    );
    if (
      member.kind !== 'directory' &&
      parts.length <= 2 &&
      system &&
      resource &&
      resource.kind !== 'directory'
    ) {
      roots.push([path.dirname(member.target), system]);
    }
  }
  if (roots.length !== 1) throw new Error('核心归档必须包含唯一的平铺运行库或一层运行库外目录');
  const [runtime, system] = roots[0];
  const selected = new Set<string>();
  for (const member of members.values()) {
    const relative = path.relative(runtime, member.target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      continue;
    const parts = relative.split(path.sep).filter(Boolean);
    const first = casefold(parts[0] ?? '');
    let keep =
      parts.length === 0 ||
      parts[0] === 'resource' ||
      ['licenses', 'licences', 'notices'].includes(first);
    if (!keep && parts.length === 1 && member.kind !== 'directory') {
      const name = parts[0];
      keep =
        /^(?:licen[cs]es?|copying|copyright|notice|(?:third|3rd)[-_]party(?:[-_](?:licen[cs]es?|notices?))?)(?:[._-].*)?$/i.test(
          name,
        );
      if (!keep && system === 'windows')
        keep =
          first.endsWith('.dll') && !['maa.dll', 'hostfxr.dll', 'hostpolicy.dll'].includes(first);
      if (!keep && system === 'linux') keep = /^lib[^/]+\.so(?:\.[0-9]+)*$/.test(name);
      if (!keep && system === 'macos') keep = name.startsWith('lib') && name.endsWith('.dylib');
    }
    if (keep) selected.add(member.target);
  }
  return selected;
}

class Inventory {
  readonly members = new Map<string, Member>();
  readonly links = new Map<string, string>();
  readonly seen = new Set<string>();
  total = 0;
  constructor(
    readonly root: string,
    readonly limit: number,
    readonly rejectIncremental = false,
  ) {}
  charge(size: number): void {
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('压缩包包含无效大小');
    this.total += size;
    if (this.total > this.limit) throw new Error('压缩包解压大小超出限制');
  }
  add(name: string, size: number, kind: Kind, mode: number, zip?: Entry): Member {
    const target = safeDestination(this.root, name),
      key = casefold(target);
    if (this.rejectIncremental && path.basename(target).toLowerCase() === 'changes.json') {
      throw new Error('Mirror酱返回了增量包，必须使用完整快照');
    }
    if (this.seen.has(key)) throw new Error(`压缩包包含重复路径: ${name}`);
    if (target === this.root && kind !== 'directory') throw new Error('压缩包文件不得覆盖解压目录');
    this.seen.add(key);
    this.charge(size);
    const member = { name, target, kind, mode, size, zip };
    this.members.set(target, member);
    return member;
  }
  link(member: Member, name: string, hard = false): void {
    const normalized = name.replaceAll('\\', '/');
    if (
      !name ||
      name.includes('\0') ||
      Buffer.byteLength(name) > MAX_LINK_BYTES ||
      normalized.startsWith('/') ||
      normalized.split('/').some((part) => part.includes(':'))
    ) {
      throw new Error('压缩包链接目标无效或过长');
    }
    const parts = hard
      ? []
      : path.relative(this.root, path.dirname(member.target)).split(path.sep).filter(Boolean);
    for (const part of normalized.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (!parts.length) throw new Error('压缩包链接目标越界');
        parts.pop();
      } else parts.push(part);
    }
    this.links.set(member.target, safeDestination(this.root, parts.join('/')));
  }
  select(coreOnly: boolean): Set<string> {
    const canonical = new Map(
      Array.from(this.members, ([target, member]) => [casefold(target), member.kind]),
    );
    for (const target of this.members.keys()) {
      for (
        let parent = path.dirname(target);
        parent !== this.root && parent !== path.dirname(parent);
        parent = path.dirname(parent)
      ) {
        if ((canonical.get(casefold(parent)) ?? 'directory') !== 'directory') {
          throw new Error('压缩包路径父级不是目录，不允许目录链接');
        }
      }
    }
    for (const alias of this.links.keys()) {
      const visiting = new Set<string>();
      let source = alias;
      while (this.links.has(source)) {
        if (visiting.has(source)) throw new Error('压缩包链接包含循环');
        visiting.add(source);
        source = this.links.get(source)!;
      }
      if (this.members.get(source)?.kind !== 'file')
        throw new Error('压缩包链接必须指向归档内的普通文件');
    }
    const selected = coreOnly ? coreMembers(this.root, this.members) : new Set(this.members.keys());
    for (const [alias, source] of this.links) {
      if (selected.has(alias) && !selected.has(source))
        throw new Error('核心归档链接必须指向保留的运行文件');
    }
    return selected;
  }
  async aliases(selected: Set<string>): Promise<void> {
    const materialized = new Set<string>();
    for (const alias of this.links.keys()) {
      if (!selected.has(alias)) continue;
      const chain: string[] = [];
      let source = alias;
      while (this.links.has(source) && !materialized.has(source)) {
        chain.push(source);
        source = this.links.get(source)!;
      }
      for (const target of chain.reverse()) {
        const sourceStat = await stat(source);
        this.charge(sourceStat.size);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(source, target);
        await chmod(target, sourceStat.mode & 0o777);
        materialized.add(target);
        source = target;
      }
    }
  }
}

function zipOpen(archive: string): Promise<ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(
      archive,
      {
        lazyEntries: true,
        autoClose: false,
        strictFileNames: false,
        validateEntrySizes: true,
      },
      (error, file) => (error ? reject(error) : resolve(file!)),
    ),
  );
}
function zipStream(file: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) =>
    file.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream!))),
  );
}
function zipEntries(file: ZipFile, visit: (entry: Entry) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (error: Error) => {
      file.removeListener('entry', entry);
      reject(error);
    };
    const entry = (value: Entry) => {
      visit(value).then(() => file.readEntry(), fail);
    };
    file.once('error', fail);
    file.once('end', () => {
      file.removeListener('error', fail);
      resolve();
    });
    file.on('entry', entry);
    file.readEntry();
  });
}
async function writeMember(source: Readable, member: Member): Promise<void> {
  await mkdir(path.dirname(member.target), { recursive: true });
  let written = 0;
  const bounded = new Transform({
    transform(chunk, _encoding, callback) {
      written += chunk.length;
      callback(written > member.size ? new Error('压缩包文件大小不符') : null, chunk);
    },
  });
  await pipeline(source, bounded, createWriteStream(member.target, { flags: 'wx' }));
  if (written !== member.size) throw new Error('压缩包文件大小不符');
  if (member.mode & 0o111) await chmod(member.target, 0o755);
}

async function extractZip(archive: string, inventory: Inventory, coreOnly: boolean): Promise<void> {
  const file = await zipOpen(archive);
  try {
    await zipEntries(file, async (entry) => {
      const mode = entry.externalFileAttributes >>> 16,
        type = mode & 0o170000;
      const kind: Kind =
        type === 0o120000 ? 'link' : entry.fileName.endsWith('/') ? 'directory' : 'file';
      if (
        ![0, 0o100000, 0o040000, 0o120000].includes(type) ||
        (type === 0o040000 && kind !== 'directory')
      ) {
        throw new Error('不允许压缩包设备或特殊文件');
      }
      const member = inventory.add(entry.fileName, entry.uncompressedSize, kind, mode, entry);
      if (kind === 'link') {
        if (member.size > MAX_LINK_BYTES) throw new Error('压缩包链接目标过长');
        const stream = await zipStream(file, entry),
          chunks: Buffer[] = [];
        let count = 0;
        for await (const chunk of stream) {
          count += chunk.length;
          if (count > MAX_LINK_BYTES) throw new Error('压缩包链接目标过长');
          chunks.push(Buffer.from(chunk));
        }
        let target: string;
        try {
          target = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        } catch {
          throw new Error('压缩包链接目标编码无效');
        }
        inventory.link(member, target);
      }
    });
    const selected = inventory.select(coreOnly);
    for (const member of inventory.members.values()) {
      if (!selected.has(member.target)) continue;
      if (member.kind === 'directory') await mkdir(member.target, { recursive: true });
      if (member.kind === 'file') await writeMember(await zipStream(file, member.zip!), member);
    }
    await inventory.aliases(selected);
  } finally {
    file.close();
  }
}

function parseTar(archive: string, visit: (entry: ReadEntry) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = createReadStream(archive);
    const parser = new Parser({ strict: true, maxDecompressionRatio: Infinity });
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      input.destroy();
      reject(error);
    };
    parser.on('error', fail);
    input.on('error', fail);
    parser.on('ignoredEntry', () => fail(new Error('不允许压缩包设备或特殊文件')));
    parser.on('entry', (entry: ReadEntry) => {
      try {
        visit(entry);
      } catch (error) {
        entry.resume();
        fail(error as Error);
      }
    });
    parser.on('end', () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    input.pipe(parser);
  });
}
async function extractTar(archive: string, inventory: Inventory, coreOnly: boolean): Promise<void> {
  await parseTar(archive, (entry) => {
    const kind =
      entry.type === 'Directory'
        ? 'directory'
        : ['File', 'OldFile', 'ContiguousFile'].includes(entry.type)
          ? 'file'
          : ['SymbolicLink', 'Link'].includes(entry.type)
            ? 'link'
            : undefined;
    if (!kind) throw new Error('不允许压缩包设备或特殊文件');
    const member = inventory.add(entry.path, entry.size, kind, entry.mode ?? 0);
    if (kind === 'link') inventory.link(member, entry.linkpath!, entry.type === 'Link');
    entry.resume();
  });
  const selected = inventory.select(coreOnly),
    writes: Promise<void>[] = [];
  for (const member of inventory.members.values()) {
    if (selected.has(member.target) && member.kind === 'directory')
      await mkdir(member.target, { recursive: true });
  }
  await parseTar(archive, (entry) => {
    const member = inventory.members.get(safeDestination(inventory.root, entry.path));
    if (!member || !selected.has(member.target) || member.kind !== 'file') {
      entry.resume();
      return;
    }
    entry.pause();
    // Start consumption only after the parent exists; all promises are observed immediately.
    const write = writeMember(entry as unknown as Readable, member);
    writes.push(write);
    write.catch(() => entry.resume());
  });
  await Promise.all(writes);
  await inventory.aliases(selected);
}

async function extract(
  archive: string,
  destination: string,
  coreOnly: boolean,
  options: ExtractOptions,
): Promise<void> {
  await mkdir(destination, { recursive: true });
  const root = path.resolve(destination);
  // Immutable candidates must not reuse an existing directory tree or follow old links.
  if ((await lstat(root)).isSymbolicLink() || (await readdir(root)).length)
    throw new Error('解压目标必须是新的空目录');
  const inventory = new Inventory(
    root,
    options.maxExpandedBytes ?? MAX_EXPANDED_BYTES,
    options.rejectIncremental,
  );
  const handle = await open(archive, 'r'),
    signature = Buffer.alloc(4);
  try {
    await handle.read(signature, 0, 4, 0);
  } finally {
    await handle.close();
  }
  if (signature[0] === 0x50 && signature[1] === 0x4b)
    await extractZip(archive, inventory, coreOnly);
  else await extractTar(archive, inventory, coreOnly);
}
export function extractArchive(
  archive: string,
  destination: string,
  options: ExtractOptions = {},
): Promise<void> {
  return extract(archive, destination, false, options);
}
export function extractCoreArchive(
  archive: string,
  destination: string,
  options: ExtractOptions = {},
): Promise<void> {
  return extract(archive, destination, true, options);
}
export async function normalizeRuntimeRoot(generation: string): Promise<void> {
  const isRuntime = async (root: string) => {
    const file = async (name: string) =>
      stat(path.join(root, name)).then(
        (value) => value.isFile(),
        () => false,
      );
    return (
      (await file('resource/version.json')) &&
      (await Promise.all(['MaaCore.dll', 'libMaaCore.so', 'libMaaCore.dylib'].map(file))).some(
        Boolean,
      )
    );
  };
  if (await isRuntime(generation)) return;
  const entries = await readdir(generation, { withFileTypes: true });
  if (
    entries.length !== 1 ||
    !entries[0].isDirectory() ||
    entries[0].isSymbolicLink() ||
    !(await isRuntime(path.join(generation, entries[0].name)))
  ) {
    throw new Error('核心归档必须包含平铺运行库或唯一的运行库外目录');
  }
  const wrapper = path.join(generation, entries[0].name);
  for (const child of await readdir(wrapper))
    await rename(path.join(wrapper, child), path.join(generation, child));
  await rmdir(wrapper);
}
