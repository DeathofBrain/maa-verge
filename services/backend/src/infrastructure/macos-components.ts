import { Database } from 'bun:sqlite';
import {
  accessSync,
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
} from 'node:fs';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const runtimeName = 'maaverge-runtime';

function absolute(value: string): string {
  if (!path.isAbsolute(value) || /[\x00-\x1f]/.test(value))
    throw new Error('卸载目录必须使用有效的完整绝对路径');
  return path.resolve(value);
}

/** The override isolates packaged smoke runs without changing the user's HOME. */
export function macosComponentLocations(
  homeDirectory = process.env.MAAVERGE_COMPONENT_HOME || homedir(),
) {
  const parent = path.join(absolute(homeDirectory), 'Library', 'Application Support');
  const root = path.join(parent, 'Maa Verge');
  return {
    root,
    core: path.join(root, 'MaaCore'),
    resource: path.join(root, 'MaaResource'),
    lock: path.join(parent, '.maaverge-components-lock.sqlite3'),
  };
}

/** Reject links before touching either a component tree or its stable lease. */
function ordinaryPath(value: string, missingAllowed: boolean): boolean {
  const target = absolute(value);
  const ancestors = [];
  for (let current = target; ; current = path.dirname(current)) {
    ancestors.push(current);
    if (path.dirname(current) === current) break;
  }
  for (const current of ancestors.reverse()) {
    let info;
    try {
      info = lstatSync(current);
    } catch (error) {
      if (missingAllowed && (error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`卸载目录不能包含符号链接：${current}`);
    if (current !== target && !info.isDirectory())
      throw new Error(`目录祖先不是文件夹：${current}`);
  }
  return true;
}

export function acquireMacosComponentLease(
  mode: 'shared' | 'exclusive',
  homeDirectory?: string,
): { close(): void } {
  const { lock } = macosComponentLocations(homeDirectory);
  ordinaryPath(lock, true);
  mkdirSync(path.dirname(lock), { recursive: true });
  // Keep this filename permanently. Unlinking it would split users over inodes.
  const descriptor = openSync(
    lock,
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  );
  closeSync(descriptor);
  ordinaryPath(lock, false);
  if (!lstatSync(lock).isFile()) throw new Error('组件目录锁必须是普通文件');
  const lease = new Database(lock, { create: true });
  try {
    lease.exec('PRAGMA busy_timeout=0');
    const journal = lease.query('PRAGMA journal_mode=DELETE').get() as { journal_mode: string };
    if (journal.journal_mode !== 'delete') throw new Error('无法建立组件目录锁');
    lease.exec('CREATE TABLE IF NOT EXISTS component_lease (id INTEGER PRIMARY KEY)');
    lease.exec(mode === 'exclusive' ? 'BEGIN EXCLUSIVE' : 'BEGIN');
    // A deferred transaction only becomes a shared lease after an actual read.
    lease.query('SELECT id FROM component_lease LIMIT 1').get();
  } catch (error) {
    lease.close();
    throw new Error('其他 Maa Verge 服务正在使用或清理组件目录，请完全退出后重试', {
      cause: error,
    });
  }
  let closed = false;
  return {
    close() {
      if (!closed) {
        closed = true;
        lease.close();
      }
    },
  };
}

export type MacosUninstallRequest = { bundle: string; dataRoots: string[] };
export function parseMacosUninstallArguments(args: string[]): MacosUninstallRequest {
  if (args[0] !== '--uninstall-macos') throw new Error('未知的 macOS 卸载命令');
  let bundle: string | undefined;
  const dataRoots: string[] = [];
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index],
      value = args[index + 1];
    if (!value || !['--bundle', '--data-root'].includes(key)) throw new Error('macOS 卸载参数无效');
    if (key === '--bundle') {
      if (bundle) throw new Error('macOS 卸载应用目录重复');
      bundle = absolute(value);
    } else dataRoots.push(absolute(value));
  }
  if (!bundle || !dataRoots.length || dataRoots.length > 8)
    throw new Error('macOS 卸载参数缺少保留数据目录');
  return { bundle, dataRoots: [...new Set(dataRoots)] };
}

export function assertNoMacosComponentProcesses(output: string, ownPid: number): void {
  for (const line of output.split('\n')) {
    const process = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
    if (!process || Number(process[1]) === ownPid) continue;
    if ([runtimeName, 'maaverge-core-worker'].includes(path.basename(process[2]!)))
      throw new Error('仍有 Maa Verge 后台服务或核心进程在运行，请完全退出后重试');
  }
}

function resolvedPreservedPath(value: string): string {
  const suffix: string[] = [];
  let current = absolute(value);
  for (;;) {
    try {
      return path.join(realpathSync(current), ...suffix.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      suffix.push(path.basename(current));
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

function contains(parent: string, candidate: string): boolean {
  // Canonicalize existing ancestors before this comparison. Conservatively fold
  // case/normalization as macOS installations commonly use insensitive volumes.
  const fold = (value: string) => value.normalize('NFD').toLowerCase();
  const relative = path.relative(fold(parent), fold(candidate));
  return (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  );
}

async function verifyBundle(bundle: string): Promise<void> {
  const file = path.join(bundle, 'Contents', 'Info.plist');
  ordinaryPath(file, false);
  for (const [key, expected] of [
    ['CFBundleIdentifier', 'io.maaverge.desktop'],
    ['CFBundleExecutable', 'maaverge'],
    ['CFBundlePackageType', 'APPL'],
  ]) {
    const result = await execute('/usr/bin/plutil', ['-extract', key!, 'raw', '-o', '-', file], {
      timeout: 5000,
      maxBuffer: 16_384,
    });
    if (result.stdout.trim() !== expected) throw new Error('卸载目标不是当前 Maa Verge 应用');
  }
}

// Foundation performs a real Trash operation without asking Finder for automation access.
// Paths are argv values; they are never interpolated into executable source.
const trashScript = `ObjC.import('Foundation');
function run(argv) {
  var error = Ref();
  var result = Ref();
  var url = $.NSURL.fileURLWithPath($(argv[0]));
  if (!$.NSFileManager.defaultManager.trashItemAtURLResultingItemURLError(url, result, error)) {
    throw new Error(error[0] ? ObjC.unwrap(error[0].localizedDescription) : '无法移到废纸篓');
  }
}`;

async function trashItem(target: string): Promise<void> {
  await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', trashScript, '--', target], {
    timeout: 20_000,
    maxBuffer: 16_384,
  });
}

export class MacosUninstallError extends Error {
  constructor(
    message: string,
    readonly movedPaths: string[],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

type UninstallEnvironment = {
  platform?: NodeJS.Platform;
  standalone?: boolean;
  executable?: string;
  pid?: number;
  homeDirectory?: string;
  verifyBundle?: (bundle: string) => Promise<void>;
  processes?: () => Promise<string>;
  trash?: (target: string) => Promise<void>;
};

/** Only the packaged host may invoke this fixed cleanup; custom component roots survive. */
export async function uninstallMacosApplication(
  request: MacosUninstallRequest,
  environment: UninstallEnvironment = {},
): Promise<{ movedPaths: string[] }> {
  if (
    (environment.platform ?? process.platform) !== 'darwin' ||
    !(environment.standalone ?? Bun.isStandaloneExecutable)
  )
    throw new Error('卸载仅支持已安装的 macOS Maa Verge 应用');
  const bundle = absolute(request.bundle);
  if (
    !bundle.endsWith('.app') ||
    absolute(environment.executable ?? process.execPath) !==
      path.join(bundle, 'Contents', 'Resources', 'runtime', runtimeName)
  )
    throw new Error('卸载目标与当前应用不匹配');
  if (!request.dataRoots.length || request.dataRoots.length > 8)
    throw new Error('卸载必须保留配置数据目录');
  const locations = macosComponentLocations(environment.homeDirectory);
  const targets = [locations.core, locations.resource, bundle];
  const canonicalTargets = targets.map(resolvedPreservedPath);
  for (let left = 0; left < canonicalTargets.length; left++)
    for (let right = left + 1; right < canonicalTargets.length; right++)
      if (
        contains(canonicalTargets[left]!, canonicalTargets[right]!) ||
        contains(canonicalTargets[right]!, canonicalTargets[left]!)
      )
        throw new Error('应用包与组件目录不能互相包含，请先调整安装位置');
  const lease = acquireMacosComponentLease('exclusive', environment.homeDirectory);
  const movedPaths: string[] = [];
  try {
    const preserved = request.dataRoots.map(resolvedPreservedPath);
    const existing = targets.filter((target, index) => {
      const present = ordinaryPath(target, target !== bundle);
      if (present && !lstatSync(target).isDirectory())
        throw new Error(`卸载目标不是文件夹：${target}`);
      if (preserved.some((root) => contains(canonicalTargets[index]!, root)))
        throw new Error('配置或自定义数据位于待卸载目录内，请先迁出数据');
      if (present) accessSync(path.dirname(target), constants.W_OK);
      return present;
    });
    ordinaryPath(environment.executable ?? process.execPath, false);
    await (environment.verifyBundle ?? verifyBundle)(bundle);
    const processes =
      environment.processes ??
      (async () =>
        (
          await execute('/bin/ps', ['-axo', 'pid=,comm='], {
            timeout: 5000,
            maxBuffer: 1024 * 1024,
          })
        ).stdout);
    assertNoMacosComponentProcesses(await processes(), environment.pid ?? process.pid);
    for (const target of existing) {
      ordinaryPath(target, false);
      await (environment.trash ?? trashItem)(target);
      movedPaths.push(target);
    }
    return { movedPaths };
  } catch (error) {
    throw new MacosUninstallError(
      `卸载未完成：${error instanceof Error ? error.message : String(error)}${movedPaths.length ? '；部分项目已移到废纸篓，可从废纸篓恢复' : ''}`,
      [...movedPaths],
      { cause: error },
    );
  } finally {
    lease.close();
  }
}

export async function runMacosUninstallCli(args: string[]): Promise<void> {
  try {
    const result = await uninstallMacosApplication(parseMacosUninstallArguments(args));
    process.stdout.write(JSON.stringify({ ok: true, ...result }) + '\n');
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        movedPaths: error instanceof MacosUninstallError ? error.movedPaths : [],
      }) + '\n',
    );
    process.exitCode = 1;
  }
}
