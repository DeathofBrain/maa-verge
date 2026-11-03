/** Independent resource generations; no executable MaaCore payload is downloaded or loaded. */
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, lstatSync, readFileSync } from 'node:fs';
import {
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractResourceArchive } from '@backend/infrastructure/filesystem/archives.ts';
import { RpcError } from '@backend/shared/errors.ts';
import {
  childEnvironment,
  normalizeComponentPath,
  type ComponentPaths,
} from '@backend/infrastructure/config.ts';
import { resourceActivityVersions } from './resource-version.ts';
import { pruneGenerations } from '@backend/infrastructure/filesystem/generation-retention.ts';
import {
  snapshotIntegrity,
  SnapshotIntegrityCache,
} from '@backend/infrastructure/filesystem/snapshot-integrity.ts';
import { readLocalComponentSnapshots, readBundledComponents } from './bundled-components';
import {
  createComponentFetch,
  downloadArchive,
  DownloadSourceError,
  retryComponentDirect,
  type DownloadProgress,
} from '@backend/infrastructure/network/download.ts';
import application from '../../../../../package.json';
import type { DownloadProxySettings } from '@contracts/types';
import { ProxyConfigurationError } from '@backend/infrastructure/network/network-proxy';
import {
  MirrorChyanClient,
  MirrorChyanError,
  mirrorChyanFull,
  mirrorChyanMessage,
  mirrorChyanSource,
  validResourceTimestamp,
  type MirrorChyanIdentity,
  type MirrorChyanPreferences,
} from './mirrorchyan';

const GITHUB = 'https://api.github.com/repos/MaaAssistantArknights';
/** v6.20.0's source commit supplies the OCR/model baseline, independent of binary releases. */
export const RESOURCE_BASE_COMMIT = '71bce1cc85bce55d3b20e19066b2dd33252072fc';
export const RESOURCE_BASE_VERSION = 'v6.20.0';
export function resourceBaseMetadata(): UpdateMetadata {
  return {
    version: RESOURCE_BASE_COMMIT,
    url: `https://codeload.github.com/MaaAssistantArknights/MaaAssistantArknights/zip/${RESOURCE_BASE_COMMIT}`,
    name: `MAA-resource-${RESOURCE_BASE_COMMIT}.zip`,
    source: 'GitHub',
  };
}
export { MAX_DOWNLOAD_BYTES } from '@backend/infrastructure/network/download.ts';
export type UpdateChannel = 'app' | 'resource';
export type UpdateMetadata = Record<string, any> & { version: string };
export interface UpdateStore {
  get(kind: string, id: string, fallback?: any): any;
  put(kind: string, id: string, value: any): void;
  all(kind: string): any[];
  delete(kind: string, id: string): void;
}
export interface UpdateSource {
  check(
    channel: string,
    releaseChannel?: 'stable' | 'preview',
  ): Promise<UpdateMetadata> | UpdateMetadata;
  download(
    metadata: UpdateMetadata,
    destination: string,
    progress: DownloadProgress,
  ): Promise<string> | string;
  fallback?(
    channel: string,
    releaseChannel?: 'stable' | 'preview',
    reason?: unknown,
  ): Promise<UpdateMetadata>;
  close?(): void;
}
/** The first argument is retained only for host callback compatibility; it is always empty. */
type Validator = (unused: string, resource: string, version: string) => Promise<void> | void;
type Hook = () => Promise<void> | void;
export interface UpdateOptions {
  directories?: ComponentPaths;
  generationNamespace?: string;
  source?: UpdateSource;
  validator?: Validator;
  beforeActivate?: Hook;
  afterActivate?: Hook;
  finishActivate?: (error?: string) => Promise<void> | void;
  jobCommand?: string[];
  jobRunner?: (config: UpdateJobConfig) => Promise<UpdateJobResult>;
  protectedPaths?: () => string[];
}
export interface UpdateJobConfig {
  channel: 'resource';
  archive: string;
  baseArchive: string;
  target: string;
  version: string;
  baseResourceVersion?: string;
  resourceTimestamp?: string;
  mirrorChyanFull?: boolean;
}
export interface UpdateJobResult {
  ownedFiles?: string[];
  baseResourceVersion?: string;
  contentHash?: string;
  resourceVersion?: Record<string, unknown>;
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const downloadSource = (metadata: UpdateMetadata): 'MirrorChyan' | 'GitHub' =>
  metadata.source === 'MirrorChyan' ? 'MirrorChyan' : 'GitHub';
function resourceAge(metadata: UpdateMetadata, combo: any): number | undefined {
  const incoming = metadata.resourceTimestamp ?? metadata.resourceVersion?.last_updated;
  if (typeof incoming !== 'string' || !validResourceTimestamp(incoming) || !combo.resource?.path)
    return;
  try {
    const file = path.join(combo.resource.path, 'resource/version.json');
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) return;
    const installed = JSON.parse(readFileSync(file, 'utf8')).last_updated;
    if (typeof installed !== 'string' || !validResourceTimestamp(installed)) return;
    return (
      Date.parse(incoming.replace(' ', 'T') + 'Z') - Date.parse(installed.replace(' ', 'T') + 'Z')
    );
  } catch {
    return;
  }
}
/** Resource validation never loads a native library or creates a controller. */
export async function validateResourceSnapshot(directory: string): Promise<void> {
  for (const relative of [
    'resource/version.json',
    'resource/tasks.json',
    'resource/PaddleOCR/det/inference.onnx',
    'resource/PaddleOCR/rec/inference.onnx',
    'resource/PaddleOCR/rec/keys.txt',
  ]) {
    const file = path.join(directory, relative);
    const info = await lstat(file);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      !info.size ||
      (await realpath(file)) !== path.resolve(file)
    )
      throw new Error('资源快照缺少普通资源文件: ' + relative);
    if (relative.endsWith('.onnx')) {
      const handle = await open(file, 'r');
      try {
        const prefix = Buffer.alloc(Math.min(128, info.size));
        await handle.read(prefix, 0, prefix.length, 0);
        if (prefix.toString().startsWith('version https://git-lfs.github.com/spec/'))
          throw new Error('资源模型仍为 Git LFS 指针');
      } finally {
        await handle.close();
      }
    }
  }
  const version = JSON.parse(await readFile(path.join(directory, 'resource/version.json'), 'utf8'));
  const tasks = JSON.parse(await readFile(path.join(directory, 'resource/tasks.json'), 'utf8'));
  if (
    !version ||
    typeof version !== 'object' ||
    Array.isArray(version) ||
    !tasks ||
    typeof tasks !== 'object' ||
    Array.isArray(tasks)
  )
    throw new Error('资源元数据无效');
  // A generation contains resources and license notices, never downloaded native binaries.
  const files = await treeFiles(directory);
  if (files.some((file) => /\.(?:dll|dylib|exe|so(?:\.\d+)*)$/iu.test(file)))
    throw new Error('资源快照不得包含原生运行库');
}
export class OfficialSource implements UpdateSource {
  private readonly abort = new AbortController();
  constructor(
    private readonly fetcher?: typeof fetch,
    private readonly proxySettings: () => DownloadProxySettings | undefined = () => undefined,
    private readonly mirrorSettings: () => MirrorChyanPreferences = () => undefined,
  ) {}
  private mirror(): MirrorChyanClient {
    return new MirrorChyanClient(
      this.mirrorSettings,
      this.fetcher ?? createComponentFetch(undefined, this.proxySettings()),
      this.abort.signal,
    );
  }
  close(): void {
    this.abort.abort(new Error('应用服务正在关闭'));
  }
  async getJson(url: string): Promise<any> {
    const proxy = this.proxySettings();
    const fetcher = this.fetcher ?? createComponentFetch(undefined, proxy);
    for (let attempt = 0; ; attempt++) {
      let response: Response | undefined;
      let transport = true;
      const chunks: Uint8Array[] = [];
      try {
        response = await fetcher(url, {
          headers: { 'User-Agent': 'maa-verge/0.1' },
          signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(30_000)]),
        });
        transport = false;
        if (!response.ok) throw new Error(`更新源 HTTP ${response.status}`);
        const length = Number(response.headers.get('content-length') || 0);
        if (length > 4 * 1024 * 1024) throw new Error('更新元数据超出大小限制');
        if (!response.body) throw new Error('更新源没有返回元数据');
        let count = 0;
        transport = true;
        for await (const chunk of response.body) {
          count += chunk.length;
          if (count > 4 * 1024 * 1024) {
            transport = false;
            throw new Error('更新元数据超出大小限制');
          }
          chunks.push(chunk);
        }
      } catch (error) {
        if (error instanceof DownloadSourceError) throw error;
        if (
          attempt === 0 &&
          transport &&
          !this.abort.signal.aborted &&
          retryComponentDirect(fetcher)
        )
          continue;
        if (transport && !this.abort.signal.aborted && proxy?.mode === 'manual')
          throw new ProxyConfigurationError(
            '手动代理读取更新信息失败，请检查代理地址、认证及代理服务后重试',
          );
        throw error;
      } finally {
        await response?.body?.cancel().catch(() => {});
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
  }
  async check(channel: string): Promise<UpdateMetadata> {
    if (channel !== 'resource') throw new Error('未知更新通道');
    const client = this.mirror();
    let notice: string | undefined;
    if (client.enabled) {
      try {
        const release = await client.latest('MaaResource', 'stable');
        if (mirrorChyanFull(release) && validResourceTimestamp(release.version)) {
          const identity: MirrorChyanIdentity = {
            rid: 'MaaResource',
            version: release.version,
            channel: release.channel,
          };
          return {
            version: 'mirrorchyan:' + release.version,
            url: mirrorChyanSource(identity),
            name: 'MaaResource.zip',
            size: release.size,
            digest: release.digest,
            source: 'MirrorChyan',
            mirrorChyan: identity,
            resourceTimestamp: release.version,
            base: resourceBaseMetadata(),
          };
        }
        notice = 'Mirror酱未提供完整资源包，使用官方更新源';
      } catch (error) {
        this.abort.signal.throwIfAborted();
        notice = mirrorChyanMessage(error) + '，使用官方更新源';
      }
    }
    return { ...(await this.checkOfficial()), ...(notice ? { mirrorChyanMessage: notice } : {}) };
  }
  async fallback(
    channel: string,
    _releaseChannel?: 'stable' | 'preview',
    reason?: unknown,
  ): Promise<UpdateMetadata> {
    if (channel !== 'resource') throw new Error('未知更新通道');
    return {
      ...(await this.checkOfficial()),
      mirrorChyanMessage: mirrorChyanMessage(reason) + '，已改用官方更新源',
    };
  }
  private async checkOfficial(): Promise<UpdateMetadata> {
    const commit = (await this.getJson(`${GITHUB}/MaaResource/commits/main`)).sha;
    if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit))
      throw new Error('无效的资源提交');
    const version = await this.getJson(
      `https://raw.githubusercontent.com/MaaAssistantArknights/MaaResource/${commit}/resource/version.json`,
    );
    return {
      version: commit,
      commit,
      resourceVersion: version,
      url: `https://codeload.github.com/MaaAssistantArknights/MaaResource/zip/${commit}`,
      name: `MaaResource-${commit}.zip`,
      source: 'GitHub',
      base: resourceBaseMetadata(),
    };
  }
  async download(
    metadata: UpdateMetadata,
    destination: string,
    progress: DownloadProgress,
  ): Promise<string> {
    if (metadata.source === 'MirrorChyan') {
      const identity = metadata.mirrorChyan as MirrorChyanIdentity;
      if (!identity || identity.rid !== 'MaaResource') throw new MirrorChyanError();
      const platform =
        identity.os && identity.arch ? { os: identity.os, arch: identity.arch } : undefined;
      const client = this.mirror();
      const release = await client.latest(
        identity.rid,
        identity.channel === 'alpha' ? 'preview' : 'stable',
        platform,
      );
      if (
        !mirrorChyanFull(release) ||
        release.version !== identity.version ||
        release.digest !== metadata.digest ||
        release.size !== metadata.size
      )
        throw new MirrorChyanError();
      progress(0, 0);
      return client.download(
        release,
        metadata as UpdateMetadata & { url: string },
        destination,
        progress,
        {
          proxy: this.proxySettings(),
        },
      );
    }
    progress(0, 0);
    return downloadArchive(metadata as UpdateMetadata & { url: string }, destination, progress, {
      signal: this.abort.signal,
      fetcher: this.fetcher,
      proxy: this.proxySettings(),
    });
  }
}

function executeJson(
  command: string[],
  input: unknown,
  timeout: number,
  children?: Set<ChildProcess>,
  newGroup = true,
  env = childEnvironment(),
): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      windowsHide: true,
      detached: newGroup && process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });
    let stdout = '',
      stderr = '',
      count = 0,
      failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error('隔离进程超时');
      void terminateChild(child);
    }, timeout);
    const cleanup = () => {
      clearTimeout(timer);
      children?.delete(child);
    };
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      count += Buffer.byteLength(chunk);
      if (count > 4 * 1024 * 1024) {
        failure = new Error('隔离进程输出超出限制');
        void terminateChild(child);
      } else stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-1500);
    });
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('close', (code) => {
      cleanup();
      if (failure || code !== 0) {
        reject(failure ?? new Error('原生隔离进程失败: ' + stderr));
        return;
      }
      try {
        const lines = stdout.trim().split(/\r?\n/);
        if (lines.length !== 1) throw new Error('隔离进程输出不符合单行协议');
        resolve(JSON.parse(lines[0]));
      } catch (failure) {
        reject(failure);
      }
    });
    children?.add(child);
    child.stdin?.on('error', () => {});
    child.stdin?.end(JSON.stringify(input) + '\n');
  });
}
function terminateChild(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!child.pid || child.exitCode !== null) {
      resolve();
      return;
    }
    if (process.platform === 'win32') {
      const systemRoot = process.env.SystemRoot || process.env.WINDIR;
      if (!systemRoot) {
        child.kill();
        resolve();
        return;
      }
      const taskkill = path.join(systemRoot, 'System32', 'taskkill.exe');
      execFile(
        taskkill,
        ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true, timeout: 5000 },
        () => {
          if (child.exitCode === null) child.kill();
          resolve();
        },
      );
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
      resolve();
    }
  });
}
export async function treeHash(root: string): Promise<string> {
  const digest = createHash('sha256');
  for (const relative of await treeFiles(root)) {
    digest.update(relative);
    for await (const chunk of createReadStream(path.join(root, relative))) digest.update(chunk);
  }
  return digest.digest('hex');
}
async function treeFiles(root: string): Promise<string[]> {
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('更新快照必须是普通目录');
  const result: string[] = [];
  const visit = async (directory: string, prefix: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error('更新快照不允许文件系统链接');
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative + '/');
      else if (entry.isFile()) result.push(relative);
      else throw new Error('更新快照不允许特殊文件');
    }
  };
  await visit(root, '');
  // pathlib compares path components, with normcase on Windows, rather than
  // sorting slash-separated strings. Within components Python compares code points.
  const compare = (left: string, right: string) => {
    const a = Array.from(left),
      b = Array.from(right);
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      const difference = a[index].codePointAt(0)! - b[index].codePointAt(0)!;
      if (difference) return difference;
    }
    return a.length - b.length;
  };
  return result.sort((left, right) => {
    const a = (process.platform === 'win32' ? left.toLowerCase() : left).split('/');
    const b = (process.platform === 'win32' ? right.toLowerCase() : right).split('/');
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      const difference = compare(a[index], b[index]);
      if (difference) return difference;
    }
    return a.length - b.length;
  });
}

/** Rebase every overlay on the pinned official source resource, never an old overlay. */
export async function runUpdateJob(
  config: UpdateJobConfig,
  validator: Validator = (_unused, resource) => validateResourceSnapshot(resource),
): Promise<UpdateJobResult> {
  if (
    !config ||
    config.channel !== 'resource' ||
    !config.archive ||
    !config.baseArchive ||
    !config.target ||
    !config.version
  )
    throw new Error('更新作业配置无效');
  await mkdir(config.target, { recursive: true });
  if (
    (await lstat(config.target)).isSymbolicLink() ||
    (await realpath(config.target)) !== path.resolve(config.target)
  )
    throw new Error('资源目标不能经过文件系统链接');
  if ((await readdir(config.target)).length) throw new Error('资源目标必须是新的空目录');
  const base = path.join(config.target, '_base'),
    overlay = path.join(config.target, '_overlay');
  const install = async (
    archive: string,
    temporary: string,
    label: string,
    rejectIncremental = false,
  ) => {
    await extractResourceArchive(archive, temporary, { rejectIncremental });
    const roots = [
      temporary,
      ...(await readdir(temporary, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(temporary, entry.name)),
    ];
    const candidates = [];
    for (const root of roots)
      if ((await lstat(path.join(root, 'resource/version.json')).catch(() => undefined))?.isFile())
        candidates.push(root);
    if (candidates.length !== 1) throw new Error('资源归档结构不符合预期');
    const root = candidates[0]!;
    await cp(path.join(root, 'resource'), path.join(config.target, 'resource'), {
      recursive: true,
      force: true,
    });
    const licenses = path.join(config.target, 'licenses', label);
    await mkdir(licenses, { recursive: true });
    for (const entry of await readdir(root, { withFileTypes: true }))
      if (entry.isFile() && /^(?:LICENSE|COPYING|NOTICE)(?:[._-].*)?$/iu.test(entry.name))
        await cp(path.join(root, entry.name), path.join(licenses, entry.name));
  };
  try {
    await install(config.baseArchive, base, 'official-source');
    await install(config.archive, overlay, 'resource-overlay', config.mirrorChyanFull);
    const resourceVersion = JSON.parse(
      await readFile(path.join(config.target, 'resource/version.json'), 'utf8'),
    );
    if (config.resourceTimestamp && resourceVersion.last_updated !== config.resourceTimestamp)
      throw new Error('Mirror酱资源包内版本与选定时间戳不一致');
    // Temporary source trees are excluded from the immutable payload and its integrity manifest.
    await rm(base, { recursive: true, force: true });
    await rm(overlay, { recursive: true, force: true });
    await validator('', config.target, config.version);
    return {
      ownedFiles: await treeFiles(path.join(config.target, 'resource')),
      baseResourceVersion: config.baseResourceVersion ?? RESOURCE_BASE_COMMIT,
      contentHash: await treeHash(path.join(config.target, 'resource')),
      resourceVersion,
    };
  } finally {
    await rm(base, { recursive: true, force: true });
    await rm(overlay, { recursive: true, force: true });
  }
}
export async function runUpdateJobStdio(): Promise<void> {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (Buffer.byteLength(input) > 64 * 1024) throw new Error('更新作业配置超出限制');
  }
  process.stdout.write(JSON.stringify(await runUpdateJob(JSON.parse(input))) + '\n');
}
function defaultJobCommand(): string[] {
  return typeof Bun !== 'undefined' && Bun.isStandaloneExecutable
    ? [process.execPath, '--update-job']
    : [process.execPath, fileURLToPath(new URL('./update-job.ts', import.meta.url))];
}

/** Serialized resource installation and idle activation; historical core files are read-only. */
export class UpdateService {
  private readonly defaults: ComponentPaths;
  private readonly source: UpdateSource;
  private readonly validator: Validator;
  private readonly children = new Set<ChildProcess>();
  private readonly integrityCache = new SnapshotIntegrityCache();
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private closing = false;
  private bundledBootstrapped = false;
  private mirrorSettingsRevision = 0;
  get pendingOperations(): number {
    return this.pending;
  }
  constructor(
    readonly root: string,
    private readonly store: UpdateStore,
    private readonly emit: (kind: string, text: string, data: any) => void,
    private readonly busy: () => boolean,
    private readonly options: UpdateOptions = {},
  ) {
    if (options.generationNamespace && !/^data-[a-f0-9]{32}$/.test(options.generationNamespace))
      throw new Error('组件版本命名空间无效');
    this.defaults = options.directories ?? { resource: root };
    this.source =
      options.source ??
      new OfficialSource(
        undefined,
        () => store.get('settings', 'main', {}).downloadProxy,
        () => store.get('settings', 'main', {}).mirrorChyan,
      );
    this.validator =
      options.validator ?? ((_unused, resource) => validateResourceSnapshot(resource));
    this.mirrorSettingsRevision = store.get('meta', 'mirror_settings_revision', 0);
    // Removed channel records never appear in snapshots or authorize future downloads.
    for (const kind of ['update', 'update_metadata', 'staged']) store.delete(kind, 'core');
    for (const [id, version] of [
      ['app', application.version],
      ['resource', store.get('active', 'combo', {}).resource?.version ?? '未安装'],
    ]) {
      const previous = store.get('update', id);
      this.save({
        id,
        currentVersion: version,
        status: 'idle',
        progress: 0,
        message: '尚未检查',
        ...previous,
        ...(['checking', 'downloading'].includes(previous?.status)
          ? { status: 'failed', progress: 0, message: '上次准备被中断，可重试' }
          : {}),
      });
    }
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('更新服务正在关闭'));
    this.pending++;
    const result = this.queue
      .then(() => {
        if (this.closing) throw new Error('更新服务正在关闭');
        return operation();
      })
      .finally(() => {
        this.pending--;
      });
    this.queue = result.catch(() => {});
    return result;
  }
  async drain(): Promise<void> {
    do {
      await this.queue;
    } while (this.pending);
  }
  async close(): Promise<void> {
    this.closing = true;
    this.source.close?.();
    await Promise.all([...this.children].map(terminateChild));
    await this.queue;
  }
  directories(): ComponentPaths {
    const configured = this.store.get('settings', 'main', {}).componentPaths;
    return {
      resource: configured?.resource || this.defaults.resource,
      ...(configured?.framework || this.defaults.framework
        ? { framework: configured?.framework || this.defaults.framework }
        : {}),
    };
  }
  resolveDirectories(configured?: ComponentPaths): ComponentPaths {
    const current = configured ?? this.directories();
    return {
      resource: normalizeComponentPath(current.resource || this.defaults.resource),
      ...(current.framework || this.defaults.framework
        ? { framework: normalizeComponentPath(current.framework || this.defaults.framework!) }
        : {}),
    };
  }
  saveDirectories(
    configured: ComponentPaths,
    persist: (paths: ComponentPaths) => void,
  ): Promise<void> {
    const next = this.resolveDirectories(configured);
    if (
      next.resource === this.directories().resource &&
      next.framework === this.directories().framework
    ) {
      persist(next);
      return Promise.resolve();
    }
    return this.serial(async () => {
      await this.plainWritableDirectory(next.resource);
      persist(next);
    });
  }
  private async plainWritableDirectory(directory: string): Promise<void> {
    // Check existing ancestors before mkdir can traverse an untrusted link.
    let ancestor = directory;
    for (;;) {
      const info = await lstat(ancestor).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return;
        throw error;
      });
      if (info) {
        if (
          !info.isDirectory() ||
          info.isSymbolicLink() ||
          (await realpath(ancestor)) !== path.resolve(ancestor)
        )
          throw new Error('组件目录不能经过文件系统链接');
        break;
      }
      ancestor = path.dirname(ancestor);
    }
    await mkdir(directory, { recursive: true });
    const probe = path.join(directory, '.maaverge-write-' + randomUUID());
    const handle = await open(probe, 'wx');
    try {
      await handle.sync();
    } finally {
      await handle.close();
      await rm(probe, { force: true });
    }
  }
  private generationRoot(): string {
    const directory = this.directories().resource;
    return this.options.generationNamespace
      ? path.join(directory, this.options.generationNamespace)
      : directory;
  }
  private decorate(value: any): any {
    return {
      latestVersion: null,
      ...value,
      ...(value.id === 'resource'
        ? {
            installDirectory: this.directories().resource,
            resourceActivities: resourceActivityVersions(
              this.store.get('active', 'combo', {}).resource?.path,
            ),
          }
        : {}),
    };
  }
  channels(): any[] {
    return ['app', 'resource'].map((id) => this.channel(id));
  }
  channel(channel: string): any {
    if (!['app', 'resource'].includes(channel)) throw new RpcError(-32602, '未知更新通道');
    return this.decorate(this.store.get('update', channel));
  }
  private save(value: any): any {
    const { installDirectory: _directory, resourceActivities: _activities, ...state } = value;
    if (
      state.status !== 'downloading' ||
      !Number.isFinite(state.downloadSpeedBytesPerSecond) ||
      state.downloadSpeedBytesPerSecond < 0
    )
      delete state.downloadSpeedBytesPerSecond;
    this.store.put('update', state.id, state);
    return this.decorate(state);
  }
  private change(channel: string, changes: any): any {
    const state = this.save({ ...this.channel(channel), ...changes });
    this.emit('update.changed', state.message, { channel, update: state });
    return state;
  }
  mirrorSettingsChanged(): void {
    this.store.put('meta', 'mirror_settings_revision', ++this.mirrorSettingsRevision);
    if (!['downloading', 'staged', 'waiting_idle'].includes(this.channel('resource').status)) {
      this.store.delete('update_metadata', 'resource');
      this.change('resource', {
        status: 'idle',
        latestVersion: null,
        progress: 0,
        message: '更新来源偏好已改变，请重新检查',
      });
    }
  }
  private async verify(snapshot: any): Promise<void> {
    if (!snapshot?.path || typeof snapshot.version !== 'string')
      throw new Error('资源快照记录无效');
    await validateResourceSnapshot(snapshot.path);
    if (snapshot.installedHash) {
      const integrity = await snapshotIntegrity(
        snapshot.path,
        undefined,
        undefined,
        this.integrityCache,
      );
      if (integrity.installedHash !== snapshot.installedHash)
        throw new Error('资源快照完整性校验失败');
    } else if (
      snapshot.contentHash &&
      (await treeHash(path.join(snapshot.path, 'resource'))) !== snapshot.contentHash
    )
      throw new Error('资源快照完整性校验失败');
    else if (!snapshot.contentHash) throw new Error('资源快照缺少完整性记录');
  }
  check(channel: string): Promise<any> {
    return this.serial(() => this.checkCurrent(channel));
  }
  private async checkCurrent(channel: string): Promise<any> {
    const current = this.channel(channel);
    if (channel === 'app')
      return this.change(channel, { status: 'idle', message: '请在桌面应用中检查签名更新' });
    if (['staged', 'waiting_idle'].includes(current.status)) return current;
    this.change(channel, { status: 'checking', progress: 0, message: '正在检查资源更新' });
    const revision = this.mirrorSettingsRevision;
    try {
      let metadata = await this.source.check('resource');
      const combo = this.store.get('active', 'combo', {});
      if (
        metadata.source === 'MirrorChyan' &&
        (resourceAge(metadata, combo) ?? 0) < 0 &&
        this.source.fallback
      )
        metadata = await this.source.fallback('resource');
      if (revision !== this.mirrorSettingsRevision) return this.checkCurrent(channel);
      metadata.mirrorSettingsRevision = revision;
      this.store.put('update_metadata', channel, metadata);
      let valid = false;
      try {
        await this.verify(combo.resource);
        valid = true;
      } catch {
        /* A repair uses the same independent source chain. */
      }
      const age = resourceAge(metadata, combo);
      const available =
        !valid || (age === undefined ? metadata.version !== current.currentVersion : age > 0);
      return this.change(channel, {
        checkedAt: new Date().toISOString(),
        latestVersion: metadata.version,
        status: available ? 'available' : 'idle',
        message:
          (available ? '发现可用资源或当前资源需要修复' : '当前资源已是最新版本') +
          (metadata.mirrorChyanMessage ? '；' + metadata.mirrorChyanMessage : ''),
      });
    } catch (error) {
      if (revision !== this.mirrorSettingsRevision && !this.closing)
        return this.checkCurrent(channel);
      this.store.delete('update_metadata', channel);
      this.change(channel, {
        status: 'failed',
        latestVersion: null,
        progress: 0,
        message: message(error),
      });
      throw new RpcError(-32020, '检查资源更新失败', message(error));
    }
  }
  prepare(channel: string): Promise<any> {
    return this.serial(() => this.prepareCurrent(channel));
  }
  private async prepareCurrent(channel: string): Promise<any> {
    this.channel(channel);
    if (channel !== 'resource') throw new RpcError(-32020, '应用更新由桌面更新器处理');
    let metadata = this.store.get('update_metadata', channel);
    if (!metadata || metadata.mirrorSettingsRevision !== this.mirrorSettingsRevision) {
      await this.checkCurrent(channel);
      metadata = this.store.get('update_metadata', channel);
    }
    if (!metadata) throw new RpcError(-32020, '请重新检查资源更新');
    const active = this.store.get('active', 'combo', {});
    const age = resourceAge(metadata, active);
    if (age !== undefined && age < 0) throw new RpcError(-32020, '资源源早于当前版本，拒绝降级');
    if ((age === 0 || metadata.version === active.resource?.version) && active.resource) {
      try {
        await this.verify(active.resource);
        return this.channel(channel);
      } catch {
        /* Repair remains possible without a version increase. */
      }
    }
    const staged = this.store.get('staged', channel);
    if (staged?.version === metadata.version) {
      try {
        await this.verify(staged);
        return this.change(channel, { status: 'staged', progress: 100, message: '候选资源已准备' });
      } catch {
        this.store.delete('staged', channel);
      }
    }
    const root = this.generationRoot();
    await this.plainWritableDirectory(root);
    await this.plainWritableDirectory(path.join(root, 'generations'));
    await this.plainWritableDirectory(path.join(root, 'downloads'));
    const generation = path.join(
      root,
      'generations',
      'resource-' + randomUUID().replaceAll('-', ''),
    );
    await mkdir(generation);
    try {
      for (let attempt = 0; ; attempt++) {
        const archive = path.join(root, 'downloads', `resource-${randomUUID()}.archive`);
        const baseArchive = path.join(root, 'downloads', `base-${randomUUID()}.archive`);
        this.change(channel, {
          status: 'downloading',
          progress: 0,
          downloadSource: downloadSource(metadata),
          message: '正在下载独立资源与固定模型底包',
        });
        try {
          const report = (progress: number, speed?: number) =>
            this.change(channel, {
              progress: Math.max(0, Math.min(80, Math.floor(progress * 0.8))),
              downloadSpeedBytesPerSecond: speed,
              message: '正在下载独立游戏资源',
            });
          const digest = await this.source.download(metadata, archive, report);
          const baseArchiveSha256 = await this.source.download(
            metadata.base ?? resourceBaseMetadata(),
            baseArchive,
            report,
          );
          this.change(channel, {
            progress: 85,
            downloadSpeedBytesPerSecond: undefined,
            message: '正在叠加并校验资源',
          });
          const config: UpdateJobConfig = {
            channel: 'resource',
            archive,
            baseArchive,
            target: generation,
            version: metadata.version,
            baseResourceVersion: metadata.base?.version ?? RESOURCE_BASE_COMMIT,
            resourceTimestamp: metadata.resourceTimestamp,
            mirrorChyanFull: metadata.source === 'MirrorChyan',
          };
          const result = this.options.jobRunner
            ? await this.options.jobRunner(config)
            : await executeJson(
                this.options.jobCommand ?? defaultJobCommand(),
                config,
                300_000,
                this.children,
              );
          await validateResourceSnapshot(generation);
          const integrity = await snapshotIntegrity(generation);
          const manifest = {
            ...metadata,
            ...result,
            ...integrity,
            baseArchiveSha256,
            sha256: digest,
            path: generation,
            validatedAt: new Date().toISOString(),
          };
          await writeFile(path.join(generation, 'manifest.json'), JSON.stringify(manifest));
          this.store.put('staged', channel, manifest);
          this.store.put('update_metadata', channel, metadata);
          await this.pruneVersions();
          return this.change(channel, {
            status: 'staged',
            latestVersion: metadata.version,
            progress: 100,
            message: '资源已校验，等待空闲生效',
          });
        } catch (error) {
          if (attempt || metadata.source !== 'MirrorChyan' || !this.source.fallback || this.closing)
            throw error;
          metadata = await this.source.fallback('resource', 'stable', error);
          if ((resourceAge(metadata, this.store.get('active', 'combo', {})) ?? 0) < 0)
            throw new Error('官方资源早于当前版本，拒绝降级');
          metadata.mirrorSettingsRevision = this.mirrorSettingsRevision;
          // 官方回退也是已选来源；第二次下载失败后的重试继续它，避免再次回到失效的 CDK。
          this.store.put('update_metadata', channel, metadata);
          await rm(generation, { recursive: true, force: true });
          await mkdir(generation);
        } finally {
          await rm(archive, { force: true });
          await rm(baseArchive, { force: true });
        }
      }
    } catch (error) {
      await rm(generation, { recursive: true, force: true });
      this.change(channel, { status: 'failed', progress: 0, message: message(error) });
      throw new RpcError(-32020, '准备资源失败，原资源保持不变', message(error));
    }
  }
  activate(channel: string): Promise<any> {
    return this.serial(() => this.activateCurrent(channel));
  }
  private async activateCurrent(channel: string): Promise<any> {
    this.channel(channel);
    if (channel !== 'resource') throw new RpcError(-32020, '应用更新由桌面更新器处理');
    const candidate = this.store.get('staged', channel);
    if (!candidate) throw new RpcError(-32020, '没有可用的资源候选');
    if (this.busy())
      return this.change(channel, {
        status: 'waiting_idle',
        message: '等待任务和控制会话结束后切换资源',
      });
    const original = this.store.get('active', 'combo', {});
    try {
      await this.verify(candidate);
      if ((resourceAge(candidate, original) ?? 0) < 0)
        throw new Error('候选资源早于当前资源，拒绝自动降级');
      await this.validator('', candidate.path, candidate.version);
      await this.switchCombo({ resource: candidate }, original);
      if (original.resource) {
        try {
          await this.verify(original.resource);
          this.store.put('previous', 'combo', { resource: original.resource });
        } catch {
          /* Legacy binary generations remain read-only migration sources, never rollback targets. */
        }
      }
      this.store.delete('staged', channel);
      this.change(channel, {
        currentVersion: candidate.version,
        latestVersion: candidate.version,
        status: 'active',
        progress: 100,
        message: '新资源已生效',
      });
      await this.options.finishActivate?.();
      await this.pruneVersions();
      return this.channel(channel);
    } catch (error) {
      this.change(channel, {
        status: 'staged',
        progress: 100,
        message: '切换失败，已保留原资源和候选：' + message(error),
      });
      throw new RpcError(-32020, '资源切换失败，原版本保持不变', message(error));
    }
  }
  private async switchCombo(next: any, original: any): Promise<void> {
    try {
      await this.options.beforeActivate?.();
    } catch (error) {
      await this.options.finishActivate?.(message(error));
      throw error;
    }
    this.store.put('active', 'combo', next);
    try {
      await this.options.afterActivate?.();
    } catch (error) {
      try {
        await this.options.beforeActivate?.();
        this.store.put('active', 'combo', original);
        await this.options.afterActivate?.();
      } catch (restoreError) {
        this.store.put('active', 'combo', original);
        await this.options.finishActivate?.(message(restoreError));
        throw restoreError;
      }
      await this.options.finishActivate?.(message(error));
      throw error;
    }
  }
  async activatePending(available: () => boolean = () => true): Promise<void> {
    if (available() && !this.busy() && this.channel('resource').status === 'waiting_idle') {
      try {
        await this.activate('resource');
      } catch (error) {
        if (!(error instanceof RpcError)) throw error;
      }
    }
  }
  rollback(channel: string): Promise<any> {
    return this.serial(async () => {
      this.channel(channel);
      if (channel !== 'resource') throw new RpcError(-32020, '应用更新不支持回滚');
      if (this.busy()) throw new RpcError(-32021, '请等待任务和控制会话结束后回滚');
      const previous = this.store.get('previous', 'combo', {}).resource;
      if (!previous) throw new RpcError(-32020, '没有可回滚的资源');
      await this.verify(previous);
      await this.validator('', previous.path, previous.version);
      const active = this.store.get('active', 'combo', {});
      await this.switchCombo({ resource: previous }, active);
      this.store.put('previous', 'combo', { resource: active.resource });
      await this.options.finishActivate?.();
      return this.change(channel, {
        currentVersion: previous.version,
        status: 'active',
        progress: 100,
        message: '已恢复上一版资源',
      });
    });
  }
  /** Adopt complete offline resource payloads; old binary directories are never activated. */
  bootstrapBundled(directory: string): Promise<void> {
    return this.serial(async () => {
      if (this.bundledBootstrapped || this.busy()) return;
      this.bundledBootstrapped = true;
      const original = this.store.get('active', 'combo', {});
      // A legacy resource pointer may reside beside old binaries: copy only its resource subtree.
      if (original.resource) {
        try {
          if (!original.core && original.resource.baseResourceVersion) {
            await this.verify(original.resource);
            return;
          }
          await this.importResource(original.resource.path, original.resource.version, {
            ...original.resource,
            legacyImport: true,
          });
          return;
        } catch {
          /* Missing legacy models fall through to the offline installation. */
        }
      }
      const snapshots = await readLocalComponentSnapshots(this.generationRoot(), 'resource');
      for (const snapshot of snapshots) {
        try {
          await this.verify(snapshot);
          await this.importResource(snapshot.path, snapshot.version, snapshot);
          return;
        } catch {
          /* A bad local generation does not block the next candidate. */
        }
      }
      const bundled = await readBundledComponents(directory);
      if (bundled?.resource)
        await this.importResource(
          path.join(directory, bundled.resource.directory),
          bundled.resource.version,
          bundled.resource,
        );
    });
  }
  private async importResource(source: string, version: string, expected: any): Promise<void> {
    const generation = path.join(
      this.generationRoot(),
      'generations',
      'resource-' + randomUUID().replaceAll('-', ''),
    );
    await this.plainWritableDirectory(path.dirname(generation));
    await mkdir(generation);
    try {
      // Only ordinary resource files are copied. Legacy native binaries stay untouched.
      const sourceIntegrity = await snapshotIntegrity(source);
      if (expected.installedHash && sourceIntegrity.installedHash !== expected.installedHash)
        throw new Error('离线资源来源完整性校验失败');
      await cp(path.join(source, 'resource'), path.join(generation, 'resource'), {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
      for (const entry of await readdir(source, { withFileTypes: true }))
        if (
          (entry.isFile() && /^(?:LICENSE|COPYING|NOTICE)/iu.test(entry.name)) ||
          (entry.isDirectory() && entry.name === 'licenses')
        )
          await cp(path.join(source, entry.name), path.join(generation, entry.name), {
            recursive: true,
            force: false,
            errorOnExist: true,
          });
      await validateResourceSnapshot(generation);
      const integrity = await snapshotIntegrity(generation);
      if (
        !expected.legacyImport &&
        expected.installedHash &&
        integrity.installedHash !== expected.installedHash
      )
        throw new Error('离线资源完整性校验失败');
      const manifest = {
        version,
        ...integrity,
        path: generation,
        baseResourceVersion: expected.baseResourceVersion ?? 'legacy-resource-import',
        validatedAt: new Date().toISOString(),
      };
      await writeFile(path.join(generation, 'manifest.json'), JSON.stringify(manifest));
      this.store.put('staged', 'resource', manifest);
      await this.activateCurrent('resource');
    } catch (error) {
      if (this.store.get('staged', 'resource')?.path === generation)
        this.store.delete('staged', 'resource');
      await rm(generation, { recursive: true, force: true });
      throw error;
    }
  }
  private async pruneVersions(): Promise<void> {
    if (this.busy() || this.closing) return;
    const snapshots = [
      this.store.get('active', 'combo', {}).resource,
      this.store.get('previous', 'combo', {}).resource,
      this.store.get('staged', 'resource'),
    ].filter(Boolean);
    // Only this data root's resource generations are eligible; legacy core roots are read-only.
    await pruneGenerations(
      [this.generationRoot()],
      [...snapshots.map((snapshot) => snapshot.path), ...(this.options.protectedPaths?.() ?? [])],
    );
  }
}
