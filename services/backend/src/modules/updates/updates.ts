/** Independent immutable MaaCore / MaaResource generations. Jobs never open the business DB. */
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
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractArchive,
  extractCoreArchive,
  normalizeRuntimeRoot,
} from '@backend/infrastructure/filesystem/archives.ts';
import { RpcError } from '@backend/shared/errors.ts';
import { nativeWorkerPath } from '@backend/infrastructure/native/native-path.ts';
import {
  childEnvironment,
  nativeEnvironment,
  normalizeComponentPath,
  type ComponentPaths,
} from '@backend/infrastructure/config.ts';
import { resourceActivityVersions } from './resource-version.ts';
import { extractMacosMirrorCore } from './macos-core';
import { pruneGenerations } from '@backend/infrastructure/filesystem/generation-retention.ts';
import {
  snapshotIntegrity,
  SnapshotIntegrityCache,
} from '@backend/infrastructure/filesystem/snapshot-integrity.ts';
import {
  copyBundledPayload,
  copyComponentPayload,
  hasBundledPayload,
  readBundledComponents,
  readLocalComponentSnapshots,
  type BundledCore,
  type BundledResource,
  type LocalComponentSnapshot,
} from './bundled-components';
import {
  createComponentFetch,
  downloadArchive,
  DownloadSourceError,
  retryComponentDirect,
  type DownloadProgress,
} from '@backend/infrastructure/network/download.ts';
import { compareReleaseVersions, releaseVersion } from '@backend/shared/release-version';
import application from '../../../../../package.json';
import type { DownloadProxySettings } from '@contracts/types';
import { ProxyConfigurationError } from '@backend/infrastructure/network/network-proxy';
import {
  MirrorChyanClient,
  MirrorChyanError,
  mirrorChyanFull,
  mirrorChyanMessage,
  mirrorChyanPlatform,
  mirrorChyanSource,
  validResourceTimestamp,
  type MirrorChyanIdentity,
  type MirrorChyanPreferences,
} from './mirrorchyan';

const GITHUB = 'https://api.github.com/repos/MaaAssistantArknights';
export { MAX_DOWNLOAD_BYTES } from '@backend/infrastructure/network/download.ts';
export type UpdateChannel = 'app' | 'core' | 'resource';
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
  close?(): void;
  fallback?(
    channel: string,
    releaseChannel?: 'stable' | 'preview',
    reason?: unknown,
  ): Promise<UpdateMetadata>;
}
type Validator = (core: string, resource: string, version: string) => Promise<void> | void;
type Hook = () => Promise<void> | void;
type ReconcileScope = 'all' | 'active' | 'core' | 'resource';
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
  channel: 'core' | 'resource';
  archive: string;
  target: string;
  version: string;
  core?: string;
  coreVersion?: string;
  workerPath?: string;
  resourceTimestamp?: string;
  mirrorChyanFull?: boolean;
  macosMirrorCore?: boolean;
}
export interface UpdateJobResult {
  ownedFiles?: string[];
  coreVersion?: string;
  contentHash?: string;
  resourceVersion?: Record<string, unknown>;
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
class MacosControlUnitError extends Error {
  constructor() {
    super('Mirror酱 macOS 核心包缺少当前 MaaFwAdb 模式所需的控制单元');
  }
}
const downloadSource = (metadata: UpdateMetadata): 'MirrorChyan' | 'GitHub' =>
  metadata.source === 'MirrorChyan' ? 'MirrorChyan' : 'GitHub';
const maaFwAdbLibrary =
  process.platform === 'win32'
    ? 'MaaAdbControlUnit.dll'
    : process.platform === 'darwin'
      ? 'libMaaAdbControlUnit.dylib'
      : 'libMaaAdbControlUnit.so';
function hasMaaFwAdb(snapshot: any): boolean {
  if (typeof snapshot?.path !== 'string') return false;
  try {
    const root = lstatSync(snapshot.path);
    const library = lstatSync(path.join(snapshot.path, maaFwAdbLibrary));
    return (
      root.isDirectory() &&
      !root.isSymbolicLink() &&
      library.isFile() &&
      !library.isSymbolicLink() &&
      library.size > 0
    );
  } catch {
    return false;
  }
}

// Database versions are only hints: uninstall/reinstall and manual file removal
// can leave them behind. Older generations lack an inventory, so retain support
// for them while checking the native library and resource metadata explicitly.
function installedSnapshot(snapshot: any, core: boolean, full: boolean): boolean {
  if (typeof snapshot?.path !== 'string' || typeof snapshot.version !== 'string') return false;
  const file = (relative: string) => {
    try {
      const info = lstatSync(path.join(snapshot.path, relative));
      return info.isFile() && !info.isSymbolicLink() && info.size > 0;
    } catch {
      return false;
    }
  };
  try {
    if (!lstatSync(snapshot.path).isDirectory() || lstatSync(snapshot.path).isSymbolicLink())
      return false;
    if (core && !['MaaCore.dll', 'libMaaCore.so', 'libMaaCore.dylib'].some(file)) return false;
    if (!file('resource/version.json')) return false;
    {
      const versionPath = path.join(snapshot.path, 'resource/version.json');
      if (lstatSync(versionPath).size > 256 * 1024) return false;
      const version = JSON.parse(readFileSync(versionPath, 'utf8'));
      if (!version || typeof version !== 'object' || Array.isArray(version)) return false;
      if (
        full &&
        snapshot.installedFiles &&
        (!Array.isArray(snapshot.installedFiles) ||
          !snapshot.installedFiles.every((relative: unknown) => {
            if (
              typeof relative !== 'string' ||
              path.isAbsolute(relative) ||
              relative.split(/[\\/]/).some((part) => part === '..')
            )
              return false;
            try {
              const info = lstatSync(path.join(snapshot.path, relative));
              return info.isFile() && !info.isSymbolicLink();
            } catch {
              return false;
            }
          }))
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
function resourceVersion(combo: any): string {
  return combo.core && combo.resource?.path === combo.core.path
    ? 'bundled@' + combo.core.version
    : (combo.resource?.version ?? '未安装');
}
function resourceAge(metadata: UpdateMetadata, combo: any): number | undefined {
  const incoming = metadata.resourceTimestamp ?? metadata.resourceVersion?.last_updated;
  if (typeof incoming !== 'string' || !validResourceTimestamp(incoming) || !combo.resource?.path)
    return undefined;
  try {
    const file = path.join(combo.resource.path, 'resource/version.json');
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) return undefined;
    const installed = JSON.parse(readFileSync(file, 'utf8')).last_updated;
    if (typeof installed !== 'string' || !validResourceTimestamp(installed)) return undefined;
    return (
      Date.parse(incoming.replace(' ', 'T') + 'Z') - Date.parse(installed.replace(' ', 'T') + 'Z')
    );
  } catch {
    return undefined;
  }
}
const digestRecorded = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function hasIntegrity(snapshot: any, core: boolean): boolean {
  return (
    !!snapshot &&
    ((digestRecorded(snapshot.installedHash) &&
      Array.isArray(snapshot.installedFiles) &&
      snapshot.installedFiles.length > 0) ||
      (!core && digestRecorded(snapshot.contentHash)))
  );
}

export function platformAsset(
  system: string = process.platform,
  machine: string = process.arch,
): string {
  const architecture = machine.toLowerCase();
  if (
    ['Darwin', 'darwin'].includes(system) &&
    ['arm64', 'aarch64', 'x86_64', 'amd64', 'x64'].includes(architecture)
  )
    return 'macos-runtime-universal.zip';
  if (['Windows', 'win32'].includes(system) && ['amd64', 'x86_64', 'x64'].includes(architecture))
    return 'win-x64.zip';
  if (['Linux', 'linux'].includes(system) && ['amd64', 'x86_64', 'x64'].includes(architecture))
    return 'linux-x86_64.tar.gz';
  throw new Error(`尚未支持的系统架构: ${system}/${machine}`);
}

export class OfficialSource implements UpdateSource {
  private readonly abort = new AbortController();
  constructor(
    private readonly fetcher?: typeof fetch,
    private readonly proxySettings: () => DownloadProxySettings | undefined = () => undefined,
    private readonly mirrorSettings: () => MirrorChyanPreferences = () => undefined,
    private readonly mirrorPlatform = () => mirrorChyanPlatform(),
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
  async check(
    channel: string,
    releaseChannel: 'stable' | 'preview' = 'stable',
  ): Promise<UpdateMetadata> {
    const client = this.mirror();
    let notice: string | undefined;
    if (client.enabled && ['core', 'resource'].includes(channel)) {
      try {
        const platform = channel === 'core' ? this.mirrorPlatform() : undefined;
        // macOS distribution wraps the upstream DMG in a ZIP. Its runtime is
        // extracted in the isolated job instead of treating it as a flat ZIP.
        if (channel === 'core' && !['windows', 'darwin'].includes(platform?.os ?? '')) {
          notice = 'Mirror酱当前平台未提供可验证的核心运行时包';
        } else {
          const release = await client.latest(
            channel === 'core' ? 'MAA' : 'MaaResource',
            channel === 'core' ? releaseChannel : 'stable',
            platform,
          );
          if (mirrorChyanFull(release)) {
            if (channel === 'core') {
              const version = releaseVersion(release.version);
              if (!version || (releaseChannel === 'stable' && version.prerelease.length))
                throw new MirrorChyanError();
            } else if (!validResourceTimestamp(release.version)) throw new MirrorChyanError();
            const identity: MirrorChyanIdentity = {
              rid: release.rid,
              version: release.version,
              channel: release.channel,
              ...(platform ?? {}),
            };
            return {
              version: channel === 'core' ? release.version : 'mirrorchyan:' + release.version,
              url: mirrorChyanSource(identity),
              name: `${channel === 'core' ? 'MaaCore' : 'MaaResource'}-${release.version.replace(/[^a-zA-Z0-9._-]/g, '-')}.zip`,
              size: release.size,
              digest: release.digest,
              source: 'MirrorChyan',
              mirrorChyan: identity,
              ...(channel === 'resource' ? { resourceTimestamp: release.version } : {}),
            };
          }
          notice = this.mirrorSettings()?.cdk.trim()
            ? 'Mirror酱未提供完整下载包'
            : '未填写 Mirror酱 CDK，使用官方更新源';
        }
      } catch (error) {
        this.abort.signal.throwIfAborted();
        notice = mirrorChyanMessage(error);
      }
    }
    const metadata = await this.checkOfficial(channel, releaseChannel);
    if (notice)
      metadata.mirrorChyanMessage = notice.includes('官方更新源')
        ? notice
        : notice + '，已改用官方更新源';
    return metadata;
  }
  async fallback(
    channel: string,
    releaseChannel: 'stable' | 'preview' = 'stable',
    reason?: unknown,
  ) {
    const metadata = await this.checkOfficial(channel, releaseChannel);
    metadata.mirrorChyanMessage =
      (reason instanceof MirrorChyanError || reason instanceof MacosControlUnitError
        ? reason.message
        : 'Mirror酱准备失败') + '，已改用官方更新源';
    return metadata;
  }
  private async checkOfficial(
    channel: string,
    releaseChannel: 'stable' | 'preview' = 'stable',
  ): Promise<UpdateMetadata> {
    if (channel === 'core') {
      let release: any;
      if (releaseChannel === 'stable')
        release = await this.getJson(`${GITHUB}/MaaAssistantArknights/releases/latest`);
      else {
        const releases: any[] = [];
        for (let page = 1; page <= 10; page++) {
          const batch = await this.getJson(
            `${GITHUB}/MaaAssistantArknights/releases?per_page=100&page=${page}`,
          );
          if (!Array.isArray(batch)) throw new Error('核心发布列表格式无效');
          releases.push(
            ...batch.filter((item) => item && !item.draft && releaseVersion(item.tag_name)),
          );
          if (batch.length < 100) break;
          if (page === 10) throw new Error('核心发布列表超出检查范围，请稍后重试');
        }
        releases.sort((a, b) => compareReleaseVersions(b.tag_name, a.tag_name));
        release = releases[0];
      }
      const parsed = releaseVersion(release?.tag_name);
      if (!parsed || release.draft || !Array.isArray(release.assets))
        throw new Error('未找到有效的核心发布版本');
      if (releaseChannel === 'stable' && (release.prerelease || parsed.prerelease.length))
        throw new Error('稳定通道返回非稳定版本');
      const suffix = platformAsset();
      const assets = release.assets.filter(
        (asset: any) =>
          typeof asset.name === 'string' &&
          asset.name.startsWith('MAA-') &&
          asset.name.endsWith('-' + suffix),
      );
      if (assets.length !== 1) throw new Error('未找到唯一匹配的官方运行时包');
      const asset = assets[0],
        url = asset.browser_download_url;
      const expected = `https://github.com/MaaAssistantArknights/MaaAssistantArknights/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(asset.name)}`;
      if (url !== expected) throw new Error('更新包来源不是官方仓库的对应发布');
      return {
        version: release.tag_name,
        url,
        name: asset.name,
        size: asset.size,
        digest: asset.digest ?? undefined,
        source: 'GitHub',
      };
    }
    if (channel !== 'resource') throw new Error('未知更新通道');
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
    };
  }
  async download(
    metadata: UpdateMetadata,
    destination: string,
    progress: DownloadProgress,
  ): Promise<string> {
    if (metadata.source === 'MirrorChyan') {
      const identity = metadata.mirrorChyan as MirrorChyanIdentity;
      if (!identity || !['MAA', 'MaaResource'].includes(identity.rid)) throw new MirrorChyanError();
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
export async function validateNative(
  core: string,
  resource: string,
  version: string,
  executable = nativeWorkerPath(),
  children?: Set<ChildProcess>,
  newGroup = true,
): Promise<void> {
  const result = await executeJson(
    [executable, '--validate'],
    { core, resource, version, protocolVersion: 1 },
    90_000,
    children,
    newGroup,
    nativeEnvironment(core),
  );
  if (result.protocolVersion !== 1 || result.resourceLoaded !== true || result.version !== version)
    throw new Error('核心版本或资源隔离校验失败');
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

export async function runUpdateJob(
  config: UpdateJobConfig,
  validator: Validator = (core, resource, version) =>
    validateNative(core, resource, version, config.workerPath, undefined, false),
): Promise<UpdateJobResult> {
  if (
    !config ||
    !['core', 'resource'].includes(config.channel) ||
    !config.archive ||
    !config.target ||
    !config.version
  )
    throw new Error('更新作业配置无效');
  if (config.channel === 'core') {
    if (config.macosMirrorCore) {
      if (!config.mirrorChyanFull) throw new Error('macOS 镜像核心必须使用完整快照');
      await extractMacosMirrorCore(config.archive, config.target, {
        expectedVersion: config.version,
      });
    } else {
      await extractCoreArchive(config.archive, config.target, {
        rejectIncremental: config.mirrorChyanFull,
      });
    }
    await normalizeRuntimeRoot(config.target);
    await validator(config.target, config.target, config.version);
    return {};
  }
  if (!config.core || !config.coreVersion) throw new Error('请先安装核心与基础资源');
  const candidate = path.join(config.target, 'resource'),
    overlay = path.join(config.target, '_overlay');
  // Always rebase on the immutable core; never copy the previous resource overlay.
  await cp(path.join(config.core, 'resource'), candidate, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  try {
    await extractArchive(config.archive, overlay, { rejectIncremental: config.mirrorChyanFull });
    const roots = [];
    if (config.mirrorChyanFull) {
      try {
        if ((await lstat(path.join(overlay, 'resource'))).isDirectory())
          roots.push(path.join(overlay, 'resource'));
      } catch {
        /* GitHub archives use one outer directory instead. */
      }
    }
    for (const entry of await readdir(overlay, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const resource = path.join(overlay, entry.name, 'resource');
      try {
        await readdir(resource);
        roots.push(resource);
      } catch {
        /* not a resource root */
      }
    }
    if (roots.length !== 1) throw new Error('资源归档结构不符合预期');
    const versionPath = path.join(roots[0], 'version.json');
    if ((await lstat(versionPath)).size > 256 * 1024) throw new Error('资源版本文件超出大小限制');
    const resourceVersion = JSON.parse(await readFile(versionPath, 'utf8'));
    if (config.resourceTimestamp && resourceVersion?.last_updated !== config.resourceTimestamp)
      throw new Error('Mirror酱资源包内版本与选定时间戳不一致');
    const ownedFiles = await treeFiles(roots[0]);
    await cp(roots[0], candidate, { recursive: true, force: true });
    await validator(config.core, config.target, config.coreVersion);
    return {
      ownedFiles,
      coreVersion: config.coreVersion,
      contentHash: await treeHash(candidate),
      resourceVersion,
    };
  } finally {
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
  // Source development uses a dedicated TS entry; compile embeds the main entry.
  return typeof Bun !== 'undefined' && Bun.isStandaloneExecutable
    ? [process.execPath, '--update-job']
    : [process.execPath, fileURLToPath(new URL('./update-job.ts', import.meta.url))];
}

export class UpdateService {
  private readonly defaults: ComponentPaths;
  private readonly generationNamespace?: string;
  private readonly source: UpdateSource;
  private readonly validator: Validator;
  private readonly beforeActivate: Hook;
  private readonly afterActivate: Hook;
  private readonly finishActivate: (error?: string) => Promise<void> | void;
  private readonly jobRunner: (config: UpdateJobConfig) => Promise<UpdateJobResult>;
  private readonly protectedPaths: () => string[];
  private queue: Promise<unknown> = Promise.resolve();
  private readonly children = new Set<ChildProcess>();
  private readonly integrityCache = new SnapshotIntegrityCache();
  private closing = false;
  private bundledBootstrapped = false;
  private pending = 0;
  private mirrorSettingsRevision = 0;
  get pendingOperations(): number {
    return this.pending;
  }
  async drain(): Promise<void> {
    // A completing operation can already have queued its follow-up. Wait for
    // the whole queue without closing the source or interrupting native work.
    do {
      await this.queue;
    } while (this.pending);
  }
  constructor(
    readonly root: string,
    private readonly store: UpdateStore,
    private readonly emit: (kind: string, text: string, data: any) => void,
    private readonly busy: () => boolean,
    options: UpdateOptions = {},
  ) {
    const mirrorSettingsRevision = this.store.get('meta', 'mirror_settings_revision', 0);
    this.mirrorSettingsRevision =
      Number.isSafeInteger(mirrorSettingsRevision) && mirrorSettingsRevision >= 0
        ? mirrorSettingsRevision
        : 0;
    this.defaults = options.directories ?? { core: root, resource: root };
    if (options.generationNamespace && !/^data-[a-f0-9]{32}$/.test(options.generationNamespace))
      throw new Error('组件版本命名空间无效');
    this.generationNamespace = options.generationNamespace;
    this.source =
      options.source ??
      new OfficialSource(
        undefined,
        () => this.store.get('settings', 'main', {}).downloadProxy,
        () => this.store.get('settings', 'main', {}).mirrorChyan,
      );
    this.validator =
      options.validator ??
      ((core, resource, version) => {
        if (this.closing) throw new Error('更新服务正在关闭');
        return validateNative(core, resource, version, nativeWorkerPath(), this.children);
      });
    this.beforeActivate = options.beforeActivate ?? (() => {});
    this.afterActivate = options.afterActivate ?? (() => {});
    this.finishActivate = options.finishActivate ?? (() => {});
    this.protectedPaths = options.protectedPaths ?? (() => []);
    this.jobRunner =
      options.jobRunner ??
      ((config) => {
        if (this.closing) throw new Error('更新服务正在关闭');
        return executeJson(
          options.jobCommand ?? defaultJobCommand(),
          config,
          180_000,
          this.children,
        );
      });
    if (!store.get('update', 'core')) {
      const versions = { app: application.version, core: '未安装', resource: '未安装' };
      for (const [channel, version] of Object.entries(versions))
        this.save({
          id: channel,
          currentVersion: version,
          status: 'idle',
          progress: 0,
          message: '尚未检查',
        });
    }
    this.save({
      id: 'app',
      currentVersion: application.version,
      status: 'idle',
      progress: 0,
      message: '应用更新由桌面更新器检查',
    });
    for (const state of this.channels())
      if (['checking', 'downloading'].includes(state.status))
        this.save({
          ...state,
          status: 'failed',
          message: '上次更新准备被中断，可重试继续下载',
          progress: 0,
        });
    this.rememberRoots();
    this.reconcileInstalled(true);
    this.queue = this.pruneVersions();
  }
  private snapshots(): any[] {
    return ['active', 'previous']
      .flatMap((kind) => Object.values(this.store.get(kind, 'combo', {})))
      .concat(['core', 'resource'].map((channel) => this.store.get('staged', channel)))
      .filter(Boolean);
  }
  private rememberRoots(): string[] {
    const roots = new Set<string>([
      this.root,
      ...Object.values(this.defaults).map((root) => this.namespacedRoot(root)),
      ...(['core', 'resource'] as const).map((channel) => this.generationRoot(channel)),
      ...this.store.get('meta', 'component_roots', []),
    ]);
    for (const snapshot of this.snapshots()) {
      if (
        typeof snapshot.path === 'string' &&
        path.basename(path.dirname(snapshot.path)) === 'generations'
      )
        roots.add(path.dirname(path.dirname(snapshot.path)));
    }
    const values = [...roots].filter((root) => typeof root === 'string' && path.isAbsolute(root));
    this.store.put('meta', 'component_roots', values);
    return values;
  }
  private namespacedRoot(directory: string): string {
    return this.generationNamespace ? path.join(directory, this.generationNamespace) : directory;
  }
  private generationRoot(channel: 'core' | 'resource'): string {
    return this.namespacedRoot(this.directories()[channel]);
  }
  private ownsGenerationRoot(directory: string): boolean {
    return (
      !this.generationNamespace ||
      path.resolve(directory) === path.resolve(this.root) ||
      path.basename(path.resolve(directory)) === this.generationNamespace
    );
  }
  private async pruneVersions(): Promise<void> {
    if (this.closing || this.busy()) return;
    // Legacy shared generations and other data roots have independent saved
    // references. Their manifests alone cannot authorize this Store to prune.
    const roots = this.rememberRoots().filter((root) => this.ownsGenerationRoot(root));
    await pruneGenerations(roots, [
      ...this.snapshots().map((snapshot) => snapshot.path),
      ...this.protectedPaths(),
    ]);
    for (const root of roots) await rmdir(path.join(root, 'downloads')).catch(() => {});
  }
  private async reconcileCurrent(
    scope: ReconcileScope = 'all',
    progress?: (completed: number, total: number) => void,
  ): Promise<void> {
    // Inventory checks yield to execution polling. Only initial startup scans
    // synchronously, before any workers or RPC requests can run.
    const missing = new Set<string>();
    const seen = new Set<string>();
    // Only read payloads involved in this operation. Inactive rollback versions
    // get their full content check when rollback is requested.
    const snapshots = (
      scope === 'all'
        ? this.snapshots()
        : Object.values(this.store.get('active', 'combo', {})).concat(
            scope === 'active' ? [] : [this.store.get('staged', scope)],
          )
    ).filter((snapshot: any) => {
      if (!snapshot || seen.has(snapshot.path)) return false;
      seen.add(snapshot.path);
      return true;
    }) as any[];
    const count = (snapshot: any) => snapshot.installedFiles?.length || 1;
    const total = snapshots.reduce((sum, snapshot) => sum + count(snapshot), 0);
    let completed = 0;
    progress?.(completed, total);
    for (const snapshot of snapshots) {
      try {
        if (snapshot.installedHash !== undefined) {
          if (
            !hasIntegrity(snapshot, true) ||
            (
              await snapshotIntegrity(
                snapshot.path,
                snapshot.installedFiles,
                (done) => progress?.(completed + done, total),
                scope === 'all' ? undefined : this.integrityCache,
              )
            ).installedHash !== snapshot.installedHash
          )
            missing.add(snapshot.path);
          continue;
        }
        // v0.1.0 resource generations already recorded the complete resource
        // digest. Its archive checksum cannot verify the expanded core files.
        if (
          snapshot.contentHash !== undefined &&
          (!digestRecorded(snapshot.contentHash) ||
            (await treeHash(path.join(snapshot.path, 'resource'))) !== snapshot.contentHash)
        )
          missing.add(snapshot.path);
      } catch {
        missing.add(snapshot.path);
        continue;
      } finally {
        completed += count(snapshot);
        progress?.(completed, total);
      }
      if (snapshot.installedFiles === undefined) continue;
      if (!Array.isArray(snapshot.installedFiles)) {
        missing.add(snapshot.path);
        continue;
      }
      for (let offset = 0; offset < snapshot.installedFiles.length; offset += 64) {
        const present = await Promise.all(
          snapshot.installedFiles.slice(offset, offset + 64).map(async (relative: unknown) => {
            if (
              typeof relative !== 'string' ||
              path.isAbsolute(relative) ||
              relative.split(/[\\/]/).some((part) => part === '..')
            )
              return false;
            try {
              const info = await lstat(path.join(snapshot.path, relative));
              return info.isFile() && !info.isSymbolicLink();
            } catch {
              return false;
            }
          }),
        );
        if (present.some((value) => !value)) {
          missing.add(snapshot.path);
          break;
        }
      }
    }
    this.reconcileInstalled(false, missing);
  }
  private reconcileInstalled(full = false, missing = new Set<string>()): void {
    const installed = (snapshot: any, core: boolean) =>
      !missing.has(snapshot?.path) && installedSnapshot(snapshot, core, full);
    const active = this.store.get('active', 'combo', {});
    let combo = active;
    if (active.core && !installed(active.core, true)) {
      combo = {};
      this.store.delete('active', 'combo');
    } else if (active.core && !installed(active.resource, false)) {
      combo = { core: active.core, resource: active.core };
      this.store.put('active', 'combo', combo);
    } else if (!active.core && active.resource) {
      combo = {};
      this.store.delete('active', 'combo');
    }
    const previous = this.store.get('previous', 'combo');
    if (previous && (!installed(previous.core, true) || !installed(previous.resource, false)))
      this.store.delete('previous', 'combo');
    for (const channel of ['core', 'resource'] as const) {
      const staged = this.store.get('staged', channel);
      const valid =
        staged &&
        installed(staged, channel === 'core') &&
        (channel === 'core' || (combo.core && staged.coreVersion === combo.core.version));
      if (staged && !valid) this.store.delete('staged', channel);
      const current = this.store.get('update', channel);
      if (!current) continue;
      const version =
        channel === 'core' ? (combo.core?.version ?? '未安装') : resourceVersion(combo);
      const lost = current.currentVersion !== version;
      const lostCandidate = ['staged', 'waiting_idle'].includes(current.status) && !valid;
      if (lost || lostCandidate)
        this.save({
          ...current,
          currentVersion: version,
          status: valid
            ? current.status === 'waiting_idle'
              ? 'waiting_idle'
              : 'staged'
            : current.latestVersion && current.latestVersion !== version
              ? 'available'
              : 'idle',
          progress: valid ? 100 : 0,
          message: valid
            ? '快照已校验，等待在空闲边界生效'
            : version === '未安装'
              ? '组件文件缺失或损坏，请重新下载安装'
              : lost
                ? '已恢复核心附带的基础资源，请检查资源更新'
                : '候选快照文件缺失或损坏，请重新准备更新',
        });
    }
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('更新服务正在关闭'));
    this.pending++;
    const result = this.queue.then(() => {
      if (this.closing) throw new Error('更新服务正在关闭');
      return action();
    });
    const tracked = result.finally(() => {
      this.pending--;
    });
    this.queue = tracked.catch(() => {});
    return tracked;
  }
  private async localSnapshots(channel: 'core' | 'resource'): Promise<LocalComponentSnapshot[]> {
    const roots = this.rememberRoots().filter((root) => this.ownsGenerationRoot(root));
    const snapshots = (
      await Promise.all(roots.map((root) => readLocalComponentSnapshots(root, channel)))
    ).flat();
    return channel === 'core'
      ? snapshots.sort((left, right) => compareReleaseVersions(right.version, left.version))
      : snapshots;
  }
  /** Background adoption keeps its Store lease and serializes with other component mutations. */
  bootstrapBundled(directory: string): Promise<void> {
    return this.serial(async () => {
      if (this.bundledBootstrapped || this.busy()) return;
      this.bundledBootstrapped = true;
      const original = this.store.get('active', 'combo', {});
      // Installer choices never override an existing installation or an update
      // already prepared by this data root, including custom component roots.
      if (
        original.core ||
        original.resource ||
        this.store.get('staged', 'core') ||
        this.store.get('staged', 'resource')
      )
        return;
      const local = {
        core: await this.localSnapshots('core'),
        resource: await this.localSnapshots('resource'),
      };
      let bundled;
      try {
        bundled = await readBundledComponents(directory);
      } catch (error) {
        if (!local.core.length && !local.resource.length) {
          this.change('core', { status: 'failed', message: message(error), progress: 0 });
          throw error;
        }
      }
      for (const channel of ['core', 'resource'] as const) {
        const core = this.store.get('active', 'combo', {}).core;
        const snapshot = local[channel].find((snapshot) =>
          channel === 'core'
            ? this.store.get('settings', 'main', {}).coreUpdateChannel === 'preview' ||
              !releaseVersion(snapshot.version)!.prerelease.length
            : !core || snapshot.coreVersion === core.version,
        );
        const component = snapshot ?? bundled?.[channel];
        if (!component) continue;
        try {
          if (
            !snapshot &&
            !(await hasBundledPayload(directory, component as BundledCore | BundledResource))
          )
            continue;
          if (
            channel === 'resource' &&
            (!core || (component as BundledResource).coreVersion !== core.version)
          )
            throw new Error('随附游戏资源依赖匹配的 MaaCore，请同时安装随附核心后重启重试');
          await this.importBundledSnapshot(directory, channel, component, snapshot);
        } catch (error) {
          const detail =
            error instanceof RpcError && typeof error.data === 'string'
              ? `${message(error)}：${error.data}`
              : message(error);
          this.change(channel, {
            status: 'failed',
            progress: 0,
            message: `${detail}；${channel === 'core' ? '可重启重试随附核心，或在更新中心重新下载' : '已启用的核心及基础资源会保留，可在更新中心重新下载游戏资源'}`,
          });
        }
      }
    });
  }
  private async importBundledSnapshot(
    directory: string,
    channel: 'core' | 'resource',
    component: BundledCore | BundledResource | LocalComponentSnapshot,
    local?: LocalComponentSnapshot,
  ): Promise<void> {
    const inPlace =
      local &&
      path.resolve(path.dirname(path.dirname(local.path))) ===
        path.resolve(this.generationRoot(channel));
    const generation = inPlace
      ? local.path
      : path.join(
          this.generationRoot(channel),
          'generations',
          `${channel}-${randomUUID().replaceAll('-', '')}`,
        );
    let prepared = false;
    try {
      this.change(channel, {
        status: 'downloading',
        progress: 0,
        message: '正在校验并准备已有组件，无需联网',
      });
      let previousStage = '',
        previousProgress = -1,
        previousTime = 0;
      const report = ({
        stage,
        completed,
        total,
      }: {
        stage: string;
        completed: number;
        total: number;
      }) => {
        if (this.closing) throw new Error('更新服务正在关闭');
        const [base, weight, label] =
          stage === 'verifying'
            ? ([0, 35, '正在校验组件'] as const)
            : stage === 'copying'
              ? ([35, 30, '正在复制组件'] as const)
              : ([65, 25, '正在校验组件副本'] as const);
        const progress = base + (total ? Math.floor((weight * completed) / total) : 0);
        const time = Date.now();
        if (stage === previousStage && (progress === previousProgress || time - previousTime < 150))
          return;
        previousStage = stage;
        previousProgress = progress;
        previousTime = time;
        this.change(channel, {
          status: 'downloading',
          progress,
          message: `${label}${total ? `（${completed}/${total}）` : ''}，无需联网`,
        });
      };
      const integrity = inPlace
        ? await snapshotIntegrity(
            generation,
            undefined,
            (completed, total) => report({ stage: 'checking', completed, total }),
            this.integrityCache,
          )
        : local
          ? await copyComponentPayload(local.path, local.installedHash, generation, report)
          : await copyBundledPayload(
              directory,
              component as BundledCore | BundledResource,
              generation,
              report,
            );
      if (integrity.installedHash !== component.installedHash)
        throw new Error('组件完整性校验失败，请重新下载安装');
      prepared = !inPlace;
      if (this.closing) throw new Error('更新服务正在关闭');
      const manifest = {
        version: component.version,
        ...('coreVersion' in component ? { coreVersion: component.coreVersion } : {}),
        ...integrity,
        path: generation,
        validatedAt: new Date().toISOString(),
        ...(channel === 'core'
          ? { releaseChannel: this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable' }
          : {}),
      };
      // Other data roots may already use this completed generation. Its payload
      // and manifest stay immutable; the local Store owns absolute references.
      if (!inPlace)
        await writeFile(path.join(generation, 'manifest.json'), JSON.stringify(manifest));
      this.store.put('staged', channel, manifest);
      this.change(channel, {
        status: 'downloading',
        latestVersion: component.version,
        progress: 95,
        message: '组件文件已校验，正在验证核心并启用',
      });
      await this.activateCurrent(channel);
    } catch (error) {
      const staged = this.store.get('staged', channel);
      if (staged?.path === generation) this.store.delete('staged', channel);
      if (prepared && !this.snapshots().some((snapshot) => snapshot.path === generation))
        await rm(generation, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }
  async close(): Promise<void> {
    this.closing = true;
    this.source.close?.();
    // Job children may themselves own a validation process. Terminate that tree,
    // then drain all queued mutations before the caller closes its Store.
    await Promise.all([...this.children].map(terminateChild));
    await this.queue;
  }
  directories(): ComponentPaths {
    const configured = this.store.get('settings', 'main', {}).componentPaths;
    return {
      core: configured?.core || this.defaults.core,
      resource: configured?.resource || this.defaults.resource,
    };
  }
  resolveDirectories(configured?: ComponentPaths): ComponentPaths {
    return {
      core: normalizeComponentPath(configured?.core || this.defaults.core),
      resource: normalizeComponentPath(configured?.resource || this.defaults.resource),
    };
  }
  saveDirectories(
    configured: ComponentPaths,
    persist: (paths: ComponentPaths) => void,
  ): Promise<void> {
    const next = this.resolveDirectories(configured),
      current = this.directories();
    // Ordinary settings changes must not wait for an unrelated long download/job.
    if (next.core === current.core && next.resource === current.resource) {
      persist(next);
      return Promise.resolve();
    }
    return this.serial(async () => {
      const previous = this.directories();
      for (const channel of ['core', 'resource'] as const) {
        if (next[channel] === previous[channel]) continue;
        let probe: string | undefined;
        let created = false;
        try {
          await mkdir(next[channel], { recursive: true });
          probe = path.join(next[channel], `.maaverge-write-${randomUUID()}`);
          const file = await open(probe, 'wx');
          created = true;
          try {
            await file.writeFile('');
            await file.sync();
          } finally {
            await file.close();
          }
        } catch (error) {
          throw new RpcError(
            -32602,
            `${channel === 'core' ? 'MaaCore' : '游戏资源'}目录无法写入，请选择可写的绝对路径`,
            message(error),
          );
        } finally {
          if (created && probe) await rm(probe, { force: true }).catch(() => {});
        }
      }
      persist(next);
      this.rememberRoots();
      await this.pruneVersions();
    });
  }
  private decorate(value: any): any {
    return {
      latestVersion: null,
      ...value,
      ...(value.id !== 'app'
        ? { installDirectory: this.directories()[value.id as 'core' | 'resource'] }
        : {}),
      ...(value.id === 'resource'
        ? {
            resourceActivities: resourceActivityVersions(
              this.store.get('active', 'combo', {}).resource?.path,
            ),
          }
        : {}),
    };
  }
  channels(): any[] {
    return this.store.all('update').map((value) => this.decorate(value));
  }
  channel(channel: string): any {
    if (!['app', 'core', 'resource'].includes(channel)) throw new RpcError(-32602, '未知更新通道');
    return this.decorate(this.store.get('update', channel));
  }
  private save(value: any): any {
    const { installDirectory: _directory, resourceActivities: _activities, ...state } = value;
    value = { latestVersion: null, ...state };
    if (
      value.status !== 'downloading' ||
      !Number.isFinite(value.downloadSpeedBytesPerSecond) ||
      value.downloadSpeedBytesPerSecond < 0
    )
      delete value.downloadSpeedBytesPerSecond;
    this.store.put('update', value.id, value);
    return this.decorate(value);
  }
  private change(channel: string, changes: any): any {
    const value = this.save({ ...this.channel(channel), ...changes });
    this.emit('update.changed', value.message, { channel, update: value });
    return value;
  }
  maaFwAdbStatus(): { available: boolean; coreInstalled: boolean } {
    const core = this.store.get('active', 'combo', {}).core;
    const coreInstalled = installedSnapshot(core, true, false);
    return { available: coreInstalled && hasMaaFwAdb(core), coreInstalled };
  }
  private maaFwAdbReady(): any {
    // A capability check must not rewrite an unrelated update or candidate.
    return {
      ...this.channel('core'),
      status: 'active',
      message: '当前核心已具备 MaaFwAdb 控制单元',
    };
  }
  prepareMaaFwAdb(): Promise<any> {
    if (this.maaFwAdbStatus().available) return Promise.resolve(this.maaFwAdbReady());
    if (
      this.pending ||
      this.channels().some((channel) =>
        ['checking', 'downloading', 'staged', 'waiting_idle'].includes(channel.status),
      )
    )
      return Promise.reject(
        new RpcError(-32011, '已有组件更新正在处理，请完成当前更新后再准备 MaaFwAdb'),
      );
    return this.serial(async () => {
      if (this.maaFwAdbStatus().available) return this.maaFwAdbReady();
      if (!this.maaFwAdbStatus().coreInstalled)
        throw new RpcError(-32020, '请先安装并启用 MaaCore，再准备 MaaFwAdb');
      if (!this.source.fallback) throw new RpcError(-32020, '当前更新源不支持官方完整运行时');
      this.change('core', {
        status: 'checking',
        progress: 0,
        message: '正在检查 MaaFwAdb 官方完整运行时',
      });
      try {
        const releaseChannel = this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable';
        const metadata = await this.source.fallback('core', releaseChannel);
        if (this.closing) throw new Error('更新服务正在关闭');
        if (metadata.source !== 'GitHub') throw new Error('MaaFwAdb 必须使用官方完整运行时');
        delete metadata.mirrorChyanMessage;
        metadata.requiresMaaFwAdb = true;
        metadata.releaseChannel = releaseChannel;
        metadata.mirrorSettingsRevision = this.mirrorSettingsRevision;
        this.store.put('update_metadata', 'core', metadata);
        await this.prepareCurrent('core', metadata);
        return await this.activateCurrent('core');
      } catch (error) {
        if (this.channel('core').status === 'checking')
          this.change('core', { status: 'failed', progress: 0, message: message(error) });
        throw error;
      }
    });
  }
  private needsRepair(channel: string): boolean {
    const combo = this.store.get('active', 'combo', {}),
      snapshot = combo[channel];
    return (
      !!snapshot &&
      (!hasIntegrity(snapshot, channel === 'core' || snapshot.path === combo.core?.path) ||
        (channel === 'core' && this.missingMacosControlUnit(snapshot)))
    );
  }
  private missingMacosControlUnit(snapshot: any): boolean {
    if (snapshot?.mirrorChyan?.os !== 'darwin') {
      // Local inventory intentionally omits transport metadata. Inspect the
      // runtime itself so a previously rejected candidate cannot be re-adopted.
      try {
        if (!lstatSync(path.join(snapshot.path, 'libMaaCore.dylib')).isFile()) return false;
      } catch {
        return false;
      }
    }
    const settings = this.store.get('settings', 'main', {});
    const connections = [
      settings.connection,
      ...(settings.deviceProfiles ?? []).map((profile: any) => profile.connection),
    ];
    if (!connections.some((connection) => connection?.touchMode === 'MaaFwAdb')) return false;
    try {
      const info = lstatSync(path.join(snapshot.path, 'libMaaAdbControlUnit.dylib'));
      return !info.isFile() || info.isSymbolicLink() || !info.size;
    } catch {
      return true;
    }
  }
  coreChannelChanged(): void {
    // Keep files immutable; only remove candidate references. Retention will
    // clean an unused generation at the next safe boundary.
    this.store.delete('update_metadata', 'core');
    this.store.delete('staged', 'core');
    const current = this.channel('core');
    this.change('core', {
      latestVersion: null,
      progress: 0,
      status: ['checking', 'downloading'].includes(current.status) ? current.status : 'idle',
      message: '核心更新通道已切换，旧候选已取消，请重新检查',
    });
  }
  mirrorSettingsChanged(): void {
    this.mirrorSettingsRevision++;
    // A failed old transfer may be retried after restarting the service. Keep
    // only a credential-free revision, never a CDK-derived fingerprint.
    this.store.put('meta', 'mirror_settings_revision', this.mirrorSettingsRevision);
    for (const channel of ['core', 'resource']) {
      const current = this.channel(channel);
      if (['downloading', 'staged', 'waiting_idle'].includes(current.status)) continue;
      this.store.delete('update_metadata', channel);
      if (current.status === 'checking') continue;
      this.change(channel, {
        status: 'idle',
        latestVersion: null,
        progress: 0,
        downloadSource: undefined,
        message: 'Mirror酱设置已更新，下次准备时重新选择下载来源',
      });
    }
  }
  check(channel: string): Promise<any> {
    return this.serial(() => this.checkCurrent(channel));
  }
  private async checkCurrent(channel: string): Promise<any> {
    await this.reconcileCurrent('active');
    const current = this.channel(channel);
    if (['downloading', 'staged', 'waiting_idle'].includes(current.status)) return current;
    if (channel === 'app')
      return this.change(channel, { status: 'idle', message: '请在桌面应用中检查签名更新' });
    this.change(channel, {
      status: 'checking',
      message: '正在检查更新',
      progress: 0,
      downloadSource: undefined,
    });
    const mirrorSettingsRevision = this.mirrorSettingsRevision;
    try {
      const releaseChannel = this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable';
      let metadata = await this.source.check(channel, releaseChannel);
      if (
        channel === 'resource' &&
        metadata.source === 'MirrorChyan' &&
        this.source.fallback &&
        (resourceAge(metadata, this.store.get('active', 'combo', {})) ?? 0) < 0
      ) {
        metadata = await this.source.fallback(channel, releaseChannel);
        metadata.mirrorChyanMessage = 'Mirror酱资源版本早于已安装版本，已改用官方更新源';
      }
      if (mirrorSettingsRevision !== this.mirrorSettingsRevision && !this.closing)
        return this.checkCurrent(channel);
      if (
        channel === 'core' &&
        releaseChannel !== (this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable')
      )
        throw new Error('核心更新通道已改变，请重新检查');
      if (channel === 'core') metadata.releaseChannel = releaseChannel;
      metadata.mirrorSettingsRevision = mirrorSettingsRevision;
      this.store.put('update_metadata', channel, metadata);
      const repair = this.needsRepair(channel);
      const age =
        channel === 'resource'
          ? resourceAge(metadata, this.store.get('active', 'combo', {}))
          : undefined;
      if (age !== undefined && age < 0 && repair)
        throw new Error('更新源资源早于已安装版本，拒绝通过旧资源修复');
      const available =
        (age === undefined ? metadata.version !== current.currentVersion : age > 0) || repair;
      if (channel === 'core' && available) {
        if (
          releaseVersion(current.currentVersion) &&
          releaseVersion(metadata.version) &&
          compareReleaseVersions(metadata.version, current.currentVersion) < 0
        )
          throw new Error('所选通道版本低于已安装版本，拒绝自动降级');
      }
      const notice = metadata.mirrorChyanMessage ? `；${metadata.mirrorChyanMessage}` : '';
      return this.change(channel, {
        checkedAt: new Date().toISOString(),
        latestVersion: metadata.version,
        status: available ? 'available' : 'idle',
        message:
          (repair && metadata.version === current.currentVersion
            ? channel === 'core' &&
              this.missingMacosControlUnit(this.store.get('active', 'combo', {}).core)
              ? '当前 MaaFwAdb 模式缺少核心依赖，可重新下载完整运行时修复'
              : '旧版组件缺少完整性记录，可重新下载安装修复'
            : available
              ? '发现可用更新'
              : age !== undefined && age < 0
                ? '更新源资源早于已安装版本，保留当前资源'
                : '当前已是最新版本') + notice,
      });
    } catch (error) {
      if (mirrorSettingsRevision !== this.mirrorSettingsRevision && !this.closing)
        return this.checkCurrent(channel);
      this.store.delete('update_metadata', channel);
      this.change(channel, {
        checkedAt: new Date().toISOString(),
        latestVersion: null,
        status: 'failed',
        message: message(error),
      });
      throw new RpcError(-32020, '检查更新失败', message(error));
    }
  }
  prepare(channel: string): Promise<any> {
    return this.serial(() => this.prepareCurrent(channel));
  }
  private async reuseLocalSnapshot(
    channel: 'core' | 'resource',
    metadata: UpdateMetadata,
  ): Promise<any | undefined> {
    const combo = this.store.get('active', 'combo', {}),
      core = combo.core;
    for (const snapshot of await this.localSnapshots(channel)) {
      if (
        snapshot.path === combo[channel]?.path ||
        snapshot.version !== metadata.version ||
        (metadata.requiresMaaFwAdb && !hasMaaFwAdb(snapshot)) ||
        (channel === 'core' && this.missingMacosControlUnit(snapshot)) ||
        (channel === 'resource' && (!core || snapshot.coreVersion !== core.version))
      )
        continue;
      let integrity;
      try {
        integrity = await snapshotIntegrity(
          snapshot.path,
          undefined,
          undefined,
          this.integrityCache,
        );
        if (
          integrity.installedHash !== snapshot.installedHash ||
          !installedSnapshot(snapshot, channel === 'core', false)
        )
          continue;
        await this.validator(
          channel === 'core' ? snapshot.path : core.path,
          snapshot.path,
          channel === 'core' ? snapshot.version : core.version,
        );
      } catch {
        continue;
      }
      if (this.closing) throw new Error('更新服务正在关闭');
      if (
        channel === 'core' &&
        metadata.releaseChannel !==
          (this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable')
      )
        throw new RpcError(-32020, '核心更新通道已改变，请重新检查并准备更新');
      const manifest = {
        ...metadata,
        ...snapshot,
        ...integrity,
        ...(channel === 'core' ? { releaseChannel: metadata.releaseChannel } : {}),
        ...(metadata.requiresMaaFwAdb ? { requiresMaaFwAdb: true } : {}),
        validatedAt: new Date().toISOString(),
      };
      // Reuse the immutable payload and persist only its normal candidate reference.
      this.store.put('staged', channel, manifest);
      await this.pruneVersions();
      if (
        channel === 'core' &&
        metadata.releaseChannel !==
          (this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable')
      )
        throw new RpcError(-32020, '核心更新通道已改变，请重新检查并准备更新');
      return this.change(channel, {
        status: 'staged',
        progress: 100,
        downloadSpeedBytesPerSecond: undefined,
        downloadSource: downloadSource(snapshot),
        message: '已有下载版本已校验，等待在空闲边界生效',
      });
    }
  }
  private async prepareCurrent(channel: string, requestedMetadata?: UpdateMetadata): Promise<any> {
    this.channel(channel);
    if (channel === 'app') throw new RpcError(-32020, '应用更新需使用桌面发行通道');
    await this.reconcileCurrent(channel as 'core' | 'resource');
    let current = this.channel(channel);
    if (['staged', 'waiting_idle', 'downloading'].includes(current.status)) return current;
    let metadata: UpdateMetadata = requestedMetadata ?? this.store.get('update_metadata', channel);
    if (
      metadata?.requiresMaaFwAdb &&
      metadata.releaseChannel !==
        (this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable')
    )
      throw new RpcError(-32020, '核心更新通道已改变，请重新确认 MaaFwAdb 准备');
    if (
      !metadata ||
      (!metadata.requiresMaaFwAdb &&
        metadata.mirrorSettingsRevision !== this.mirrorSettingsRevision) ||
      (channel === 'core' &&
        metadata.releaseChannel !==
          (this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable'))
    ) {
      await this.checkCurrent(channel);
      metadata = this.store.get('update_metadata', channel);
      current = this.channel(channel);
    }
    if (
      channel === 'core' &&
      releaseVersion(current.currentVersion) &&
      releaseVersion(metadata.version) &&
      compareReleaseVersions(metadata.version, current.currentVersion) < 0
    ) {
      this.store.delete('update_metadata', channel);
      this.change(channel, {
        status: 'failed',
        latestVersion: null,
        progress: 0,
        message: '缓存版本低于当前核心，拒绝自动降级，请重新检查',
      });
      throw new RpcError(-32020, '缓存版本低于当前核心，拒绝自动降级，请重新检查');
    }
    const age =
      channel === 'resource'
        ? resourceAge(metadata, this.store.get('active', 'combo', {}))
        : undefined;
    if (age !== undefined && age < 0 && this.needsRepair(channel))
      throw new RpcError(-32020, '更新源资源早于已安装版本，拒绝通过旧资源修复');
    if (
      (metadata.version === current.currentVersion || (age !== undefined && age <= 0)) &&
      !this.needsRepair(channel) &&
      !(metadata.requiresMaaFwAdb && !this.maaFwAdbStatus().available)
    )
      return current;
    const mirrorSettingsRevision = this.mirrorSettingsRevision;
    const reused = await this.reuseLocalSnapshot(channel as 'core' | 'resource', metadata);
    if (reused) return reused;
    if (!metadata.requiresMaaFwAdb && mirrorSettingsRevision !== this.mirrorSettingsRevision)
      return this.prepareCurrent(channel);
    const directory = this.directories()[channel as 'core' | 'resource'];
    const generation = path.join(
      this.generationRoot(channel as 'core' | 'resource'),
      'generations',
      `${channel}-${randomUUID().replaceAll('-', '')}`,
    );
    this.change(channel, {
      status: 'downloading',
      progress: 0,
      downloadSpeedBytesPerSecond: undefined,
      downloadSource: undefined,
      message: '正在准备独立更新快照',
    });
    try {
      await mkdir(generation, { recursive: true });
      let digest = '';
      for (let attempt = 0; ; attempt++) {
        if (
          typeof metadata.name !== 'string' ||
          path.basename(metadata.name) !== metadata.name ||
          metadata.name.includes('\\')
        )
          throw new Error('更新包文件名无效');
        // Stable per data root and immutable source, so interrupted downloads can
        // resume without two independent data roots sharing a writable cache.
        const scope = path.resolve(this.root);
        const identity = createHash('sha256')
          .update(
            JSON.stringify([
              scope,
              channel,
              metadata.url,
              metadata.version,
              metadata.name,
              metadata.size,
              metadata.digest,
            ]),
          )
          .digest('hex');
        const archive = path.join(directory, '.download-' + identity + '-' + metadata.name);
        let lastProgress = -1,
          lastSpeed: number | undefined,
          lastReport = 0;
        try {
          digest = await this.source.download(metadata, archive, (value, bytesPerSecond) => {
            const progress = Math.max(0, Math.min(90, Math.trunc(value)));
            const speed =
              typeof bytesPerSecond === 'number' &&
              Number.isFinite(bytesPerSecond) &&
              bytesPerSecond >= 0
                ? bytesPerSecond
                : undefined;
            const clearingSpeed = speed === undefined && lastSpeed !== undefined;
            if (
              !Number.isFinite(progress) ||
              (progress === lastProgress && speed === lastSpeed) ||
              (!clearingSpeed && progress < 90 && Date.now() - lastReport < 250)
            )
              return;
            lastProgress = progress;
            lastSpeed = speed;
            lastReport = Date.now();
            this.change(channel, {
              progress,
              downloadSpeedBytesPerSecond: speed,
              downloadSource: downloadSource(metadata),
              message:
                metadata.source === 'MirrorChyan'
                  ? '正在通过 Mirror酱下载组件'
                  : '正在通过官方源下载组件',
            });
          });
          this.change(channel, {
            progress: 90,
            downloadSpeedBytesPerSecond: undefined,
            downloadSource: downloadSource(metadata),
            message: '正在解压并校验组件',
          });
          // Recheck the resource base after downloading, before copying it.
          if (channel === 'resource') await this.reconcileCurrent('active');
          const core = this.store.get('active', 'combo', {}).core;
          if (channel === 'resource' && !core)
            throw new Error('核心或基础资源文件缺失或损坏，请先重新下载安装并启用核心');
          const config: UpdateJobConfig = {
            channel: channel as 'core' | 'resource',
            archive,
            target: generation,
            version: metadata.version,
            core: core?.path,
            coreVersion: core?.version,
            resourceTimestamp: metadata.resourceTimestamp,
            mirrorChyanFull: metadata.source === 'MirrorChyan',
            macosMirrorCore:
              channel === 'core' &&
              metadata.source === 'MirrorChyan' &&
              metadata.mirrorChyan?.os === 'darwin',
          };
          Object.assign(metadata, await this.jobRunner(config));
          if (metadata.requiresMaaFwAdb && !hasMaaFwAdb({ path: generation }))
            throw new Error('官方完整运行时缺少可用的 MaaFwAdb 控制单元');
          if (channel === 'core' && this.missingMacosControlUnit({ ...metadata, path: generation }))
            throw new MacosControlUnitError();
        } catch (error) {
          if (
            attempt !== 0 ||
            metadata.source !== 'MirrorChyan' ||
            !this.source.fallback ||
            this.closing
          )
            throw error;
          const releaseChannel =
            this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable';
          metadata = await this.source.fallback(channel, releaseChannel, error);
          metadata.mirrorSettingsRevision = mirrorSettingsRevision;
          if (channel === 'core') {
            metadata.releaseChannel = releaseChannel;
            if (
              releaseVersion(current.currentVersion) &&
              releaseVersion(metadata.version) &&
              compareReleaseVersions(metadata.version, current.currentVersion) < 0
            )
              throw new Error('官方回退版本低于已安装核心，拒绝自动降级');
          }
          if (
            channel === 'resource' &&
            (resourceAge(metadata, this.store.get('active', 'combo', {})) ?? 0) < 0
          )
            throw new Error('官方回退资源早于已安装版本，拒绝自动降级');
          this.store.put('update_metadata', channel, metadata);
          await rm(generation, { recursive: true, force: true });
          await mkdir(generation, { recursive: true });
          this.change(channel, {
            latestVersion: metadata.version,
            progress: 0,
            downloadSpeedBytesPerSecond: undefined,
            downloadSource: downloadSource(metadata),
            message: 'Mirror酱准备失败，正在使用官方更新源重新准备',
          });
          continue;
        } finally {
          await rm(archive, { force: true });
        }
        break;
      }
      const integrity = await snapshotIntegrity(
        generation,
        undefined,
        undefined,
        this.integrityCache,
      );
      if (
        channel === 'core' &&
        metadata.releaseChannel !==
          (this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable')
      )
        throw new Error('核心更新通道已改变，已取消旧通道候选，请重新检查');
      const manifest = {
        ...metadata,
        ...integrity,
        path: generation,
        sha256: digest,
        validatedAt: new Date().toISOString(),
      };
      await writeFile(path.join(generation, 'manifest.json'), JSON.stringify(manifest));
      if (
        channel === 'core' &&
        metadata.releaseChannel !==
          (this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable')
      )
        throw new Error('核心更新通道已改变，已取消旧通道候选，请重新检查');
      this.store.put('staged', channel, manifest);
      await this.pruneVersions();
      if (
        channel === 'core' &&
        metadata.releaseChannel !==
          (this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable')
      )
        throw new Error('核心更新通道已改变，已取消旧通道候选，请重新检查');
      return this.change(channel, {
        status: 'staged',
        latestVersion: metadata.version,
        progress: 100,
        downloadSource: downloadSource(metadata),
        message:
          '快照已校验，等待在空闲边界生效' +
          (metadata.mirrorChyanMessage ? `；${metadata.mirrorChyanMessage}` : ''),
      });
    } catch (error) {
      await rm(generation, { recursive: true, force: true }).catch(() => {});
      await this.reconcileCurrent(channel as 'core' | 'resource');
      await this.pruneVersions();
      this.change(channel, { status: 'failed', progress: 0, message: message(error) });
      const combo = this.store.get('active', 'combo', {});
      throw new RpcError(
        -32020,
        combo.core && combo.resource
          ? '准备更新失败，活动版本保持可用'
          : '准备更新失败，请先修复核心与基础资源',
        message(error),
      );
    }
  }
  activate(channel: string): Promise<any> {
    return this.serial(() => this.activateCurrent(channel));
  }
  private async activateCurrent(channel: string): Promise<any> {
    this.channel(channel);
    const candidate = this.store.get('staged', channel);
    // A queued activation should not hash thousands of files on each idle poll.
    // Structural checks still reject a candidate that has already disappeared.
    this.reconcileInstalled(false);
    if (this.store.get('staged', channel) && this.busy())
      return this.change(channel, { status: 'waiting_idle', message: '等待当前任务结束后热切换' });
    const state = this.channel(channel);
    // Offline bootstrap applies a candidate within its preparation operation.
    // Keep that operation's progress instead of restarting its bar at zero.
    const startProgress =
      state.status === 'downloading' ? Math.max(0, Math.min(95, state.progress)) : 0;
    if (candidate)
      this.change(channel, {
        status: 'downloading',
        progress: startProgress,
        downloadSpeedBytesPerSecond: undefined,
        message: '正在校验更新文件，请稍候',
      });
    let previousProgress = startProgress,
      previousTime = Date.now();
    try {
      await this.reconcileCurrent(
        channel === 'app' ? 'active' : (channel as 'core' | 'resource'),
        candidate
          ? (completed, total) => {
              const endProgress = Math.max(80, startProgress);
              const progress = total
                ? startProgress + Math.floor(((endProgress - startProgress) * completed) / total)
                : endProgress;
              const time = Date.now();
              if (
                progress === previousProgress ||
                (completed !== total && time - previousTime < 250)
              )
                return;
              previousProgress = progress;
              previousTime = time;
              this.change(channel, {
                progress,
                message: `正在校验更新文件（${completed}/${total}），请稍候`,
              });
            }
          : undefined,
      );
      return await this.activateVerifiedCurrent(channel, candidate);
    } catch (error) {
      // Reconciliation and version checks happen before native validation's own
      // recovery block. Never leave a rejected request showing ongoing work.
      if (candidate && this.channel(channel).status === 'downloading') {
        const retained = this.store.get('staged', channel);
        this.change(channel, {
          status: retained ? 'staged' : 'failed',
          progress: retained ? 100 : 0,
          message: message(error),
        });
      }
      throw error;
    }
  }
  private async activateVerifiedCurrent(channel: string, candidate: any): Promise<any> {
    const state = this.channel(channel);
    const staged = this.store.get('staged', channel);
    if (!staged) {
      const combo = this.store.get('active', 'combo', {}),
        active = combo[channel];
      // Automatic activation can consume the candidate before a stale UI button
      // is clicked. Only acknowledge the same, still verified active version;
      // never turn a candidate rejected by reconciliation into a success.
      if (
        !candidate &&
        state.status === 'active' &&
        state.latestVersion &&
        state.latestVersion === state.currentVersion &&
        combo.core &&
        combo.resource &&
        active?.version === state.latestVersion &&
        hasIntegrity(active, channel === 'core') &&
        (channel === 'core'
          ? (active.releaseChannel ?? 'stable') ===
            (this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable')
          : channel === 'resource' &&
            active.path !== combo.core.path &&
            active.coreVersion === combo.core.version)
      )
        return state;
      if (candidate && channel === 'resource' && candidate.coreVersion !== combo.core?.version) {
        throw new RpcError(-32020, '核心版本已变化，请重新准备资源更新');
      }
      throw new RpcError(
        -32020,
        candidate
          ? '更新文件缺失或完整性校验未通过，请重新下载更新'
          : '更新候选已失效，请重新检查并下载更新',
      );
    }
    if (
      channel === 'core' &&
      (this.missingMacosControlUnit(staged) || (staged.requiresMaaFwAdb && !hasMaaFwAdb(staged)))
    ) {
      this.store.delete('staged', channel);
      this.store.delete('update_metadata', channel);
      const error = staged.requiresMaaFwAdb
        ? new Error('官方完整运行时缺少可用的 MaaFwAdb 控制单元')
        : new MacosControlUnitError();
      this.change(channel, {
        status: 'failed',
        progress: 0,
        latestVersion: null,
        message: error.message + '，请重新检查并准备官方完整运行时',
      });
      throw new RpcError(-32020, error.message);
    }
    if (
      channel === 'core' &&
      (staged.releaseChannel ?? 'stable') !==
        (this.store.get('settings', 'main', {}).coreUpdateChannel ?? 'stable')
    ) {
      this.coreChannelChanged();
      throw new RpcError(-32020, '核心更新通道已改变，请重新检查并准备更新');
    }
    const current = this.channel(channel).currentVersion;
    if (
      channel === 'resource' &&
      (resourceAge(staged, this.store.get('active', 'combo', {})) ?? 0) < 0
    ) {
      this.store.delete('staged', channel);
      this.store.delete('update_metadata', channel);
      this.change(channel, {
        status: 'failed',
        latestVersion: null,
        progress: 0,
        message: '候选资源早于当前版本，拒绝自动降级，请重新检查',
      });
      throw new RpcError(-32020, '候选资源早于当前版本，拒绝自动降级，请重新检查');
    }
    if (
      channel === 'core' &&
      releaseVersion(current) &&
      releaseVersion(staged.version) &&
      compareReleaseVersions(staged.version, current) < 0
    ) {
      this.store.delete('staged', channel);
      this.store.delete('update_metadata', channel);
      this.change(channel, {
        status: 'failed',
        latestVersion: null,
        progress: 0,
        message: '候选版本低于当前核心，拒绝自动降级，请重新检查',
      });
      throw new RpcError(-32020, '候选版本低于当前核心，拒绝自动降级，请重新检查');
    }
    if (this.busy())
      return this.change(channel, { status: 'waiting_idle', message: '等待当前任务结束后热切换' });
    const combo = this.store.get('active', 'combo', {}),
      next = { ...combo };
    if (channel === 'core') {
      next.core = staged;
      next.resource = staged;
    } else {
      if (staged.coreVersion !== combo.core?.version)
        throw new RpcError(-32020, '核心已变化，请重新准备资源快照');
      next.resource = staged;
    }
    let validated = false;
    try {
      this.change(channel, {
        status: 'downloading',
        progress: Math.max(85, Math.min(95, this.channel(channel).progress)),
        downloadSpeedBytesPerSecond: undefined,
        message: '正在验证核心与资源，请稍候',
      });
      await this.validator(next.core.path, next.resource.path, next.core.version);
      validated = true;
      this.change(channel, { progress: 95, message: '正在切换核心与资源，请稍候' });
      await this.switchCombo(next, combo);
      // Repair may have removed the broken active pointer. Keep the last good
      // rollback instead of replacing it with an empty or unverified combo.
      if (
        combo.core &&
        combo.resource &&
        ((hasIntegrity(combo.core, true) &&
          hasIntegrity(combo.resource, combo.resource.path === combo.core.path)) ||
          !this.store.get('previous', 'combo'))
      )
        this.store.put('previous', 'combo', combo);
      this.store.delete('staged', channel);
      if (channel === 'core') {
        this.store.delete('staged', 'resource');
        this.change('resource', {
          currentVersion: 'bundled@' + staged.version,
          status: 'active',
          message: '使用新核心附带的已验证基础资源',
        });
      }
      const result = this.change(channel, {
        currentVersion: staged.version,
        status: 'active',
        progress: 100,
        message: '新快照已生效，桌面无需重启',
      });
      await this.finishActivate();
      await this.pruneVersions();
      return result;
    } catch (error) {
      const candidate = this.store.get('staged', channel),
        active = this.store.get('active', 'combo', {});
      // A switch can fail for reasons unrelated to the package (for example a
      // device reconnect race). Keep a validated candidate staged so the user
      // can retry "应用更新" without downloading it again.
      const retryable =
        validated &&
        !!candidate &&
        installedSnapshot(candidate, channel === 'core', false) &&
        (channel === 'core' || candidate.coreVersion === active.core?.version);
      this.change(channel, {
        status: retryable ? 'staged' : 'failed',
        progress: retryable ? 100 : 0,
        message: retryable
          ? '切换失败，候选快照已保留，可重试：' + message(error)
          : '切换校验失败，保留原版本: ' + message(error),
      });
      throw new RpcError(-32020, '更新切换失败，已保留原版本', message(error));
    }
  }
  private async switchCombo(candidate: any, original: any): Promise<void> {
    try {
      await this.beforeActivate();
    } catch (error) {
      await this.finishActivate(message(error));
      throw error;
    }
    this.store.put('active', 'combo', candidate);
    try {
      await this.afterActivate();
    } catch (error) {
      try {
        await this.beforeActivate();
        this.store.put('active', 'combo', original);
        await this.afterActivate();
      } catch (restoreError) {
        this.store.put('active', 'combo', original);
        const failure = `候选版本重连失败: ${message(error)}；原版本重连也失败: ${message(restoreError)}`;
        await this.finishActivate(failure);
        throw new Error(failure);
      }
      await this.finishActivate();
      throw new Error(`候选版本重连失败，已恢复原版本: ${message(error)}`);
    }
  }
  async activatePending(available: () => boolean = () => true): Promise<void> {
    for (const channel of this.channels())
      if (available() && channel.status === 'waiting_idle' && !this.busy()) {
        try {
          await this.activate(channel.id);
        } catch (error) {
          if (!(error instanceof RpcError)) throw error;
        }
      }
  }
  rollback(channel: string): Promise<any> {
    return this.serial(() => this.rollbackCurrent(channel));
  }
  private async rollbackCurrent(channel: string): Promise<any> {
    await this.reconcileCurrent();
    this.channel(channel);
    if (this.busy()) throw new RpcError(-32021, '请等待任务结束后回滚');
    const previous = this.store.get('previous', 'combo');
    if (!previous || !previous[channel]) throw new RpcError(-32020, '没有可回滚的已验证版本');
    const active = this.store.get('active', 'combo', {});
    try {
      await this.validator(previous.core.path, previous.resource.path, previous.core.version);
      await this.switchCombo(previous, active);
    } catch (error) {
      this.change(channel, { status: 'failed', message: '回滚初始化失败，已恢复活动版本' });
      throw new RpcError(-32020, '回滚初始化失败，已恢复活动版本', message(error));
    }
    this.store.put('previous', 'combo', active);
    for (const key of ['core', 'resource'])
      if (previous[key])
        this.change(key, {
          currentVersion: key === 'resource' ? resourceVersion(previous) : previous[key].version,
          status: 'active',
          message: '已恢复上一组验证通过的核心与资源',
          progress: 100,
        });
    await this.finishActivate();
    await this.pruneVersions();
    return this.channel(channel);
  }
}
