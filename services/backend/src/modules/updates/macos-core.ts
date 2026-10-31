/** Extract the official MAA macOS Mirror ZIP/DMG into an immutable runtime. */
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rm,
  rmdir,
} from 'node:fs/promises';
import path from 'node:path';
import { childEnvironment } from '@backend/infrastructure/config';
import { extractArchive, MAX_EXPANDED_BYTES } from '@backend/infrastructure/filesystem/archives';
import { casefold } from '@backend/shared/casefold';

export type MacosCoreCommand = (
  executable: string,
  args: readonly string[],
  input?: string,
) => Promise<string>;
export interface MacosCoreOptions {
  /** Synthetic mount/filesystem fixtures must inject the runner, never mount a real image. */
  runCommand?: MacosCoreCommand;
  maxExpandedBytes?: number;
  expectedVersion?: string;
}

const OUTPUT_LIMIT = 256 * 1024;
const runCommand: MacosCoreCommand = (executable, args, input) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      env: childEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failure: Error | undefined;
    const fail = (text: string) => {
      failure ??= new Error(text);
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => fail('macOS 核心镜像工具执行超时'), 60_000);
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > OUTPUT_LIMIT) fail('macOS 核心镜像工具输出超出限制');
      else chunks.push(chunk);
    });
    // Never forward system-tool output to the NDJSON protocol stream or persist it.
    child.stderr.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > OUTPUT_LIMIT) fail('macOS 核心镜像工具输出超出限制');
    });
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('无法启动 macOS 核心镜像工具'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failure || code !== 0) reject(failure ?? new Error('macOS 核心镜像工具执行失败'));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

async function directory(candidate: string): Promise<void> {
  const info = await lstat(candidate);
  if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(candidate)) !== candidate)
    throw new Error('macOS 核心镜像目录不允许链接或路径别名');
}

/**
 * MAA v6.20.1 creates the DMG from Export/MAA.app; its pinned MaaMacGui commit
 * 27c6ef8afc83df7b946174152beb1cc912851c7f embeds library XCFrameworks into
 * Contents/Frameworks and the resource folder into Contents/Resources.
 * MaaCore's INSTALL_RPATH is @loader_path/, so preserve the embedded dylib names.
 */
async function copyRuntime(bundle: string, target: string, limit: number): Promise<void> {
  const contents = path.join(bundle, 'Contents');
  const frameworks = path.join(contents, 'Frameworks');
  const resources = path.join(contents, 'Resources');
  const resource = path.join(resources, 'resource');
  for (const root of [bundle, contents, frameworks, resources, resource]) await directory(root);
  const selected = new Map<string, { source: string; size: number; mode: number }>();
  const canonical = new Set<string>();
  let total = 0;
  const addFile = async (source: string, relative: string, sourceRoot: string) => {
    if (path.basename(relative).toLowerCase() === 'changes.json')
      throw new Error('Mirror酱返回了增量包，必须使用完整快照');
    const resolved = await realpath(source);
    // File aliases in dylib packages are materialized; directory links are never traversed.
    if (!inside(sourceRoot, resolved)) throw new Error('macOS 核心镜像文件链接越界');
    const info = await lstat(resolved);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('macOS 核心镜像必须包含普通运行文件');
    const key = casefold(relative);
    if (canonical.has(key)) throw new Error('macOS 核心镜像包含重复运行文件');
    canonical.add(key);
    total += info.size;
    if (!Number.isSafeInteger(total) || total > limit)
      throw new Error('macOS 核心镜像展开大小超出限制');
    selected.set(relative, { source: resolved, size: info.size, mode: info.mode });
  };
  for (const entry of await readdir(frameworks, { withFileTypes: true })) {
    if (entry.name.toLowerCase() === 'changes.json')
      throw new Error('Mirror酱返回了增量包，必须使用完整快照');
    if (/^lib[^/]+\.dylib$/.test(entry.name))
      await addFile(path.join(frameworks, entry.name), entry.name, frameworks);
  }
  if (!selected.get('libMaaCore.dylib')?.size)
    throw new Error('macOS 核心镜像缺少 libMaaCore.dylib');
  const walk = async (root: string, prefix: string, sourceRoot = resource): Promise<void> => {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const source = path.join(root, entry.name);
      const relative = prefix + entry.name;
      if (entry.name.toLowerCase() === 'changes.json')
        throw new Error('Mirror酱返回了增量包，必须使用完整快照');
      if (entry.isDirectory()) {
        await directory(source);
        await walk(source, relative + '/', sourceRoot);
      } else {
        if (!entry.isFile() && !entry.isSymbolicLink())
          throw new Error('macOS 核心镜像不允许特殊文件');
        await addFile(source, relative, sourceRoot);
      }
    }
  };
  await walk(resource, 'resource/');
  if (!selected.get('resource/version.json')?.size)
    throw new Error('macOS 核心镜像缺少基础资源版本');
  // Upstream's Xcode resources do not currently declare standalone notices. Preserve any
  // standard notices present in a package without copying GUI code or unrelated frameworks.
  const noticeName =
    /^(?:licen[cs]es?|copying|copyright|notice|(?:third|3rd)[-_]party(?:[-_](?:licen[cs]es?|notices?))?)(?:[._-].*)?$/i;
  for (const [root, label] of [
    [bundle, 'app'],
    [contents, 'contents'],
    [frameworks, 'frameworks'],
    [resources, 'resources'],
  ]) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const source = path.join(root, entry.name);
      const relative = `licenses/${label}/${entry.name}`;
      if (
        entry.isDirectory() &&
        ['licenses', 'licences', 'notices'].includes(casefold(entry.name))
      ) {
        await directory(source);
        await walk(source, relative + '/', source);
      } else if (!entry.isDirectory() && noticeName.test(entry.name)) {
        await addFile(source, relative, root);
      }
    }
  }
  // Match the aliases in MAA's official macos-runtime-universal.zip, without retaining links.
  for (const [alias, pattern] of [
    ['libonnxruntime.dylib', /^libonnxruntime\..+\.dylib$/],
    ['libopencv_world4.dylib', /^libopencv_world4.+\.dylib$/],
  ] as const) {
    if (selected.has(alias)) continue;
    const sources = [...selected.keys()].filter((name) => pattern.test(name));
    if (sources.length > 1) throw new Error('macOS 核心镜像依赖版本不唯一');
    if (sources.length === 1) await addFile(selected.get(sources[0])!.source, alias, frameworks);
  }
  for (const [relative, file] of selected) {
    const destination = path.join(target, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(file.source, destination, constants.COPYFILE_EXCL);
    await chmod(destination, file.mode & 0o111 ? 0o755 : 0o644);
  }
}

async function diskImage(
  archive: string,
  workspace: string,
  limit: number,
  expectedVersion?: string,
): Promise<string> {
  const handle = await open(archive, 'r');
  const signature = Buffer.alloc(4);
  try {
    await handle.read(signature, 0, 4, 0);
  } finally {
    await handle.close();
  }
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) return archive;
  const extracted = path.join(workspace, 'archive');
  await extractArchive(archive, extracted, {
    rejectIncremental: true,
    maxExpandedBytes: limit,
  });
  const entries = await readdir(extracted, { withFileTypes: true });
  // Official extra_zip=true wraps exactly the uploaded DMG; do not search arbitrary app trees.
  if (
    entries.length !== 1 ||
    !entries[0].isFile() ||
    !/^MAA-.+-macos-universal\.dmg$/.test(entries[0].name) ||
    (expectedVersion !== undefined &&
      entries[0].name !== `MAA-${expectedVersion}-macos-universal.dmg`)
  )
    throw new Error('Mirror酱 macOS 核心完整包必须包含唯一的官方 DMG');
  return path.join(extracted, entries[0].name);
}

export async function extractMacosMirrorCore(
  archive: string,
  target: string,
  options: MacosCoreOptions = {},
): Promise<void> {
  if (!options.runCommand && process.platform !== 'darwin')
    throw new Error('macOS 核心镜像只能在 macOS 上准备');
  const limit = options.maxExpandedBytes ?? MAX_EXPANDED_BYTES;
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('macOS 核心镜像大小限制无效');
  target = path.resolve(target);
  archive = path.resolve(archive);
  const archiveInfo = await lstat(archive);
  if (!archiveInfo.isFile() || archiveInfo.isSymbolicLink())
    throw new Error('macOS 核心镜像必须是普通文件');
  await mkdir(target, { recursive: true });
  await directory(target);
  if ((await readdir(target)).length) throw new Error('解压目标必须是新的空目录');
  const workspace = await realpath(
    await mkdtemp(path.join(path.dirname(target), '.maaverge-mirror-core-')),
  );
  const mount = path.join(workspace, 'mount');
  await mkdir(mount);
  const command = options.runCommand ?? runCommand;
  const plistJson = async (plist: string) =>
    JSON.parse(await command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], plist));
  let mountAttempted = false;
  try {
    const image = await diskImage(archive, workspace, limit, options.expectedVersion);
    const info = await lstat(image);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('macOS 核心镜像必须是普通文件');
    mountAttempted = true;
    const plist = await command('/usr/bin/hdiutil', [
      'attach',
      '-readonly',
      '-nobrowse',
      '-noautoopen',
      '-plist',
      '-mountpoint',
      mount,
      image,
    ]);
    const parsed = await plistJson(plist);
    const mounted = parsed?.['system-entities']?.filter(
      (entity: Record<string, unknown>) => entity?.['mount-point'] !== undefined,
    );
    if (!Array.isArray(mounted) || mounted.length !== 1 || mounted[0]['mount-point'] !== mount)
      throw new Error('macOS 核心镜像挂载结果不符合隔离目录');
    await directory(mount);
    await copyRuntime(path.join(mount, 'MAA.app'), target, limit);
  } finally {
    // An unsuccessful attach can still leave a mounted device. Never recursively remove its root.
    if (mountAttempted) {
      try {
        await command('/usr/bin/hdiutil', ['detach', mount]);
      } catch {
        // A failed attach may never have mounted, or a volume may already have detached.
        // Only clean after the system's mount inventory confirms this exact mount is absent.
        let remains = true;
        try {
          const state = await plistJson(await command('/usr/bin/hdiutil', ['info', '-plist']));
          if (!Array.isArray(state?.images)) throw new Error('invalid mount inventory');
          remains = state.images.some((image: Record<string, any>) => {
            if (!Array.isArray(image?.['system-entities']))
              throw new Error('invalid mount entities');
            return image['system-entities'].some(
              (entity: Record<string, unknown>) => entity?.['mount-point'] === mount,
            );
          });
        } catch {
          // Uncertain mount state is preserved as well; never remove a potentially mounted tree.
        }
        if (remains) throw new Error('macOS 核心镜像卸载失败，已保留隔离挂载目录');
      }
    }
    await rmdir(mount);
    await rm(path.join(workspace, 'archive'), { recursive: true, force: true });
    await rmdir(workspace);
  }
}
