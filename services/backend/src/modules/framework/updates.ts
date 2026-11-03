/** Independently installed, application-compatible MaaFramework SDK generations. */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DownloadProxySettings } from '@contracts/types';
import { extractArchive } from '@backend/infrastructure/filesystem/archives';
import { validateFrameworkResources } from '@backend/infrastructure/native/framework-worker';
import {
  createComponentFetch,
  downloadArchive,
  restrictDownloadFetch,
  type DownloadMetadata,
} from '@backend/infrastructure/network/download';
import {
  MirrorChyanClient,
  mirrorChyanFull,
  mirrorChyanMessage,
  mirrorChyanPlatform,
  mirrorChyanSource,
  type MirrorChyanPreferences,
  type MirrorChyanRelease,
} from '@backend/modules/updates/mirrorchyan';
import type { UpdateStore } from '@backend/modules/updates/updates';
import {
  frameworkTarget,
  frameworkVersion,
  verifyFrameworkSdkDirectory,
  writeFrameworkSdkManifest,
} from './resources';
import assets from '../../../../../3rdparty/maaframework/runtime-assets.json';

type Status =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'staged'
  | 'waiting_idle'
  | 'active'
  | 'failed';
export interface FrameworkUpdateChannel {
  id: 'framework';
  currentVersion: string;
  latestVersion: string | null;
  status: Status;
  progress: number;
  message: string;
  installDirectory: string;
  checkedAt?: string;
  downloadSource?: 'MirrorChyan' | 'GitHub';
  downloadSpeedBytesPerSecond?: number;
}
export interface FrameworkSnapshot {
  path: string;
  version: string;
  target: string;
  manifestSha256: string;
}
type Hook = () => Promise<void> | void;
export interface FrameworkUpdateOptions {
  /** The configurable component root; the stable constructor root isolates data owners. */
  directory?: () => string;
  mirror?: () => MirrorChyanPreferences;
  proxy?: () => DownloadProxySettings | undefined;
  fetcher?: typeof fetch;
  validate?: (directory: string, signal?: AbortSignal) => Promise<void>;
  beforeActivate?: Hook;
  afterActivate?: Hook;
  finishActivate?: (error?: string) => Promise<void> | void;
  /** Target overrides are used by platform-independent synthetic verification. */
  target?: string;
  /** Synthetic fixture seam; production always downloads the pinned official archive. */
  prepareSdk?: (staging: string, target: string, signal: AbortSignal) => Promise<void>;
}
const key = (value: string) =>
  process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const within = (parent: string, child: string) => {
  const relative = path.relative(parent, child);
  return (
    relative !== '' &&
    !path.isAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep)
  );
};
async function exists(filename: string) {
  try {
    await lstat(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
async function plainDirectory(directory: string) {
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    key(await realpath(directory)) !== key(directory)
  )
    throw new Error('MaaFramework组件目录不能经过文件系统链接');
}
async function prepareDirectory(directory: string) {
  if (!path.isAbsolute(directory)) throw new Error('MaaFramework组件目录必须是绝对路径');
  let ancestor = directory;
  while (!(await exists(ancestor))) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error('MaaFramework组件目录无效');
    ancestor = parent;
  }
  await plainDirectory(ancestor);
  await mkdir(directory, { recursive: true });
  await plainDirectory(directory);
}

export class FrameworkUpdateService {
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private closing = false;
  private activating = false;
  private operation?: AbortController;
  private readonly namespace: string;
  private readonly target: string;
  private readonly asset: { name: string; size: number; sha256: string };
  private readonly knownRoots = new Set<string>();
  constructor(
    readonly root: string,
    private readonly store: UpdateStore,
    private readonly emit: (kind: string, text: string, data: any) => void,
    private readonly busy: () => boolean,
    private readonly options: FrameworkUpdateOptions = {},
  ) {
    this.namespace = 'maafw-data-' + digest(key(root)).slice(0, 32);
    this.target = options.target ?? frameworkTarget();
    this.asset = (assets.targets as Record<string, typeof this.asset>)[this.target];
    if (!this.asset) throw new Error('当前平台没有兼容的MaaFramework SDK');
    for (const saved of store.get('meta', 'framework_roots', []))
      if (typeof saved === 'string' && path.isAbsolute(saved)) this.knownRoots.add(saved);
    this.rememberRoot();
    const previous = store.get('update', 'framework');
    this.store.put('update', 'framework', {
      id: 'framework',
      currentVersion: store.get('active', 'framework')?.version ?? '未安装',
      latestVersion: frameworkVersion,
      status: store.get('staged', 'framework') ? 'staged' : 'idle',
      progress: 0,
      message: ['checking', 'downloading'].includes(previous?.status)
        ? '上次MaaFramework准备被中断，可重试安装'
        : 'MaaFramework独立安装，尚未检查',
    });
  }
  get pendingOperations() {
    return this.pending;
  }
  private componentDirectory() {
    const selected = this.options.directory?.() ?? path.join(this.root, 'components', 'framework');
    if (typeof selected !== 'string' || !path.isAbsolute(selected))
      throw new Error('MaaFramework组件目录必须是绝对路径');
    return path.resolve(selected);
  }
  private generationRoot() {
    return path.join(this.componentDirectory(), this.namespace, 'generations');
  }
  private rememberRoot() {
    this.knownRoots.add(this.generationRoot());
    this.store.put('meta', 'framework_roots', [...this.knownRoots]);
  }
  channel(): FrameworkUpdateChannel {
    const saved = this.store.get('update', 'framework', {});
    return {
      id: 'framework',
      currentVersion: '未安装',
      latestVersion: frameworkVersion,
      status: 'idle',
      progress: 0,
      message: '尚未检查',
      ...saved,
      installDirectory: this.componentDirectory(),
    };
  }
  private change(changes: Partial<FrameworkUpdateChannel>): FrameworkUpdateChannel {
    const { installDirectory: _directory, ...saved } = { ...this.channel(), ...changes };
    if (saved.status !== 'downloading' || !Number.isFinite(saved.downloadSpeedBytesPerSecond))
      delete saved.downloadSpeedBytesPerSecond;
    this.store.put('update', 'framework', saved);
    const state = this.channel();
    this.emit('update.changed', state.message, { channel: 'framework', update: state });
    return state;
  }
  private serial<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.pending++;
    const task = this.queue.then(async () => {
      if (this.closing) throw new Error('MaaFramework更新服务正在关闭');
      const operation = new AbortController();
      this.operation = operation;
      try {
        return await run(operation.signal);
      } catch (error) {
        // Transport exceptions can contain signed URLs or credentials. Keep them out of events/DB.
        this.change({
          status: 'failed',
          progress: 0,
          message: operation.signal.aborted
            ? 'MaaFramework更新已取消，可重试'
            : 'MaaFramework安装或校验失败，请检查网络、目录与组件完整性后重试',
        });
        throw operation.signal.aborted
          ? new Error('MaaFramework更新已取消')
          : new Error(this.channel().message, { cause: undefined });
      } finally {
        if (this.operation === operation) this.operation = undefined;
      }
    });
    this.queue = task
      .catch(() => {})
      .finally(() => {
        this.pending--;
      });
    return task;
  }
  async drain(): Promise<void> {
    do {
      await this.queue;
    } while (this.pending);
  }
  async close(): Promise<void> {
    this.closing = true;
    if (!this.activating) this.operation?.abort();
    await this.drain();
  }
  cancel(): FrameworkUpdateChannel {
    if (this.activating) return this.change({ message: 'MaaFramework正在原子切换，请等待完成' });
    this.operation?.abort();
    return this.change({
      message: this.operation ? '正在取消MaaFramework更新' : '当前没有MaaFramework更新操作',
    });
  }
  async validateDirectory(directory: string): Promise<void> {
    if (!path.isAbsolute(directory)) throw new Error('MaaFramework组件目录必须是绝对路径');
    await prepareDirectory(directory);
    const filename = path.join(directory, '.maaverge-framework-write-' + randomUUID());
    const handle = await open(filename, 'wx');
    try {
      await handle.writeFile('MaaFramework directory probe');
      await handle.sync();
    } finally {
      await handle.close();
      await rm(filename, { force: true });
    }
  }
  saveDirectory(directory: string, persist: () => Promise<void> | void): Promise<void> {
    return this.serial(async (signal) => {
      await this.validateDirectory(directory);
      signal.throwIfAborted();
      await persist();
      this.rememberRoot();
    });
  }
  private async installed(snapshot: unknown, signal?: AbortSignal) {
    const candidate = snapshot as FrameworkSnapshot | undefined;
    if (
      !candidate ||
      typeof candidate.path !== 'string' ||
      candidate.version !== frameworkVersion ||
      candidate.target !== this.target ||
      !/^[a-f0-9]{64}$/.test(candidate.manifestSha256) ||
      ![...this.knownRoots].some((root) => within(root, candidate.path))
    )
      throw new Error('MaaFramework安装记录无效');
    const verified = await verifyFrameworkSdkDirectory(candidate.path, this.target, {
      signal,
      requireSupplements: true,
    });
    if (verified.manifestSha256 !== candidate.manifestSha256)
      throw new Error('MaaFramework安装清单已改变');
    return verified;
  }
  async resolveInstalledSdk(): Promise<{ path: string; version: string; target: string }> {
    if (this.closing) throw new Error('MaaFramework更新服务正在关闭');
    try {
      return await this.installed(this.store.get('active', 'framework'));
    } catch {
      this.change({
        currentVersion: '未安装',
        message: 'MaaFramework尚未安装或校验失败，请在组件更新中安装',
      });
      throw new Error('MaaFramework尚未安装或校验失败，请在设置的组件更新中安装');
    }
  }
  private mirror(signal: AbortSignal) {
    const preferences =
      this.options.mirror ?? (() => this.store.get('settings', 'main', {}).mirrorChyan);
    return new MirrorChyanClient(
      preferences,
      createComponentFetch(undefined, this.options.proxy?.(), this.options.fetcher),
      signal,
    );
  }
  private async release(
    signal: AbortSignal,
  ): Promise<{ release?: MirrorChyanRelease; note: string }> {
    const mirror = this.mirror(signal);
    if (!mirror.enabled) return { note: '官方源提供已验证的兼容版本' };
    try {
      const release = await mirror.latest('MaaFramework', 'stable', mirrorChyanPlatform());
      signal.throwIfAborted();
      if (release.version.replace(/^v/, '') !== frameworkVersion.replace(/^v/, ''))
        return { note: 'Mirror酱最新版本尚未通过应用兼容验证，使用官方兼容版本' };
      if (!mirrorChyanFull(release)) return { note: 'Mirror酱未提供完整下载地址，使用官方源' };
      if (release.size !== this.asset.size || release.digest !== 'sha256:' + this.asset.sha256)
        return { note: 'Mirror酱包与应用固定资产不一致，使用官方源' };
      return { release, note: 'Mirror酱完整兼容包可用' };
    } catch (error) {
      signal.throwIfAborted();
      return { note: mirrorChyanMessage(error) + '，使用官方源' };
    }
  }
  private async checkCurrent(signal: AbortSignal) {
    const waiting = this.channel().status === 'waiting_idle';
    this.change({ status: 'checking', progress: 0, message: '正在检查MaaFramework兼容版本' });
    let installed = false;
    try {
      await this.installed(this.store.get('active', 'framework'), signal);
      installed = true;
    } catch {
      signal.throwIfAborted();
    }
    const result = await this.release(signal);
    const staged = this.store.get('staged', 'framework');
    return this.change({
      currentVersion: installed ? frameworkVersion : '未安装',
      latestVersion: frameworkVersion,
      status: staged ? (waiting ? 'waiting_idle' : 'staged') : installed ? 'active' : 'available',
      checkedAt: new Date().toISOString(),
      progress: installed ? 100 : 0,
      message: staged
        ? `MaaFramework ${frameworkVersion}已准备，等待应用；${result.note}`
        : installed
          ? `MaaFramework ${frameworkVersion}已安装；${result.note}`
          : `可安装MaaFramework ${frameworkVersion}；${result.note}`,
    });
  }
  check(): Promise<FrameworkUpdateChannel> {
    return this.serial((signal) => this.checkCurrent(signal));
  }
  prepare(): Promise<FrameworkUpdateChannel> {
    return this.serial(async (signal) => {
      this.rememberRoot();
      const generationRoot = this.generationRoot();
      await prepareDirectory(generationRoot);
      const downloads = path.join(this.root, 'cache', 'framework-downloads');
      await prepareDirectory(downloads);
      const archive = path.join(
        downloads,
        `${this.target}-${frameworkVersion}-${this.asset.sha256}.zip`,
      );
      const staging = path.join(generationRoot, '.prepare-' + randomUUID());
      const destination = path.join(
        generationRoot,
        `${frameworkVersion}-${this.target}-${randomUUID()}`,
      );
      const result = this.options.prepareSdk ? { note: '合成SDK准备' } : await this.release(signal);
      signal.throwIfAborted();
      const source = result.release ? 'MirrorChyan' : 'GitHub';
      this.change({
        status: 'downloading',
        progress: 0,
        latestVersion: frameworkVersion,
        downloadSource: source,
        message: `正在准备MaaFramework ${frameworkVersion}；${result.note}`,
      });
      const progress = (percent: number, speed?: number) => {
        if (!signal.aborted)
          this.change({
            progress: Math.min(90, Math.max(0, Math.floor(percent * 0.9))),
            downloadSpeedBytesPerSecond: speed,
          });
      };
      const metadata: DownloadMetadata = {
        version: frameworkVersion,
        url: `https://github.com/${assets.repository}/releases/download/${frameworkVersion}/${this.asset.name}`,
        size: this.asset.size,
        digest: 'sha256:' + this.asset.sha256,
      };
      const official = async () => {
        this.change({
          downloadSource: 'GitHub',
          message: `正在从官方源下载MaaFramework ${frameworkVersion}`,
        });
        const fetcher = restrictDownloadFetch(
          createComponentFetch(undefined, this.options.proxy?.(), this.options.fetcher),
          (address, redirected) => {
            const url = new URL(address);
            return redirected
              ? url.protocol === 'https:' &&
                  !url.username &&
                  !url.password &&
                  [
                    'github.com',
                    'release-assets.githubusercontent.com',
                    'objects.githubusercontent.com',
                  ].includes(url.hostname)
              : address === metadata.url;
          },
          signal,
        );
        return downloadArchive(metadata, archive, progress, {
          fetcher,
          signal,
          proxy: this.options.proxy?.(),
        });
      };
      let hash: string;
      if (this.options.prepareSdk) hash = this.asset.sha256;
      else if (result.release) {
        const release = result.release;
        try {
          hash = await this.mirror(signal).download(
            release,
            { ...metadata, url: mirrorChyanSource(release) },
            archive,
            progress,
          );
        } catch (error) {
          signal.throwIfAborted();
          this.change({ message: mirrorChyanMessage(error) + '，回退官方源' });
          hash = await official();
        }
      } else hash = await official();
      if (hash !== this.asset.sha256) throw new Error('MaaFramework归档摘要无效');
      signal.throwIfAborted();
      await mkdir(staging);
      let published = false;
      try {
        this.change({ progress: 92, message: '正在安全解压并校验MaaFramework SDK' });
        if (this.options.prepareSdk) await this.options.prepareSdk(staging, this.target, signal);
        else await extractArchive(archive, staging, { rejectIncremental: true });
        signal.throwIfAborted();
        await writeFrameworkSdkManifest(staging, this.target, signal);
        await this.validate(staging, signal);
        signal.throwIfAborted();
        await rename(staging, destination);
        const verified = await verifyFrameworkSdkDirectory(destination, this.target, {
          signal,
          requireSupplements: true,
        });
        signal.throwIfAborted();
        const superseded = this.store.get('staged', 'framework');
        this.store.put('staged', 'framework', {
          path: destination,
          version: frameworkVersion,
          target: this.target,
          manifestSha256: verified.manifestSha256,
        } satisfies FrameworkSnapshot);
        published = true;
        await this.removeUnreferenced(superseded).catch(() => {});
        return this.change({
          status: 'staged',
          progress: 100,
          message: 'MaaFramework已校验，等待空闲生效',
        });
      } finally {
        await rm(staging, { recursive: true, force: true });
        if (!published) await this.removeUnreferenced({ path: destination });
      }
    });
  }
  private async validate(directory: string, signal: AbortSignal) {
    if (this.options.validate) return this.options.validate(directory, signal);
    const probe = path.join(this.root, 'cache', 'framework-validation', randomUUID());
    await prepareDirectory(path.join(probe, 'resource', 'pipeline'));
    try {
      await writeFile(path.join(probe, 'resource', 'pipeline', 'probe.json'), '{}\n', {
        flag: 'wx',
      });
      await validateFrameworkResources(
        {
          framework: directory,
          resource: path.join(probe, 'resource'),
          userDir: path.join(probe, 'user'),
          mode: 'recognition',
        },
        signal,
      );
    } finally {
      await rm(probe, { recursive: true, force: true });
    }
  }
  activate(): Promise<FrameworkUpdateChannel> {
    return this.serial((signal) => this.activateCurrent(signal));
  }
  applyIdle(): Promise<FrameworkUpdateChannel> {
    if (
      this.pending ||
      this.channel().status !== 'waiting_idle' ||
      !this.store.get('staged', 'framework') ||
      this.busy()
    )
      return Promise.resolve(this.channel());
    return this.activate();
  }
  private async activateCurrent(signal: AbortSignal) {
    const candidate = this.store.get('staged', 'framework') as FrameworkSnapshot | undefined;
    if (!candidate) return this.channel();
    if (this.busy())
      return this.change({
        status: 'waiting_idle',
        message: 'MaaFramework会话或原生操作仍在运行，空闲后生效',
      });
    await this.installed(candidate, signal);
    await this.validate(candidate.path, signal);
    await this.installed(candidate, signal);
    signal.throwIfAborted();
    if (this.busy())
      return this.change({
        status: 'waiting_idle',
        message: 'MaaFramework会话或原生操作仍在运行，空闲后生效',
      });
    const previous = this.store.get('active', 'framework') as FrameworkSnapshot | undefined;
    await this.switchTo(candidate, previous);
    this.store.delete('staged', 'framework');
    return this.change({
      status: 'active',
      currentVersion: candidate.version,
      progress: 100,
      message: 'MaaFramework已独立安装并生效',
    });
  }
  private async switchTo(candidate: FrameworkSnapshot, previous?: FrameworkSnapshot) {
    this.activating = true;
    let failure: string | undefined;
    try {
      await this.options.beforeActivate?.();
      this.store.put('active', 'framework', candidate);
      await this.options.afterActivate?.();
      if (previous) this.store.put('previous', 'framework', previous);
      else this.store.delete('previous', 'framework');
    } catch {
      failure = 'MaaFramework切换失败，已保留原版本';
      if (previous) this.store.put('active', 'framework', previous);
      else this.store.delete('active', 'framework');
      try {
        await this.options.afterActivate?.();
      } catch {
        /* Retain the original activation failure. */
      }
      throw new Error(failure);
    } finally {
      try {
        await this.options.finishActivate?.(failure);
      } finally {
        this.activating = false;
      }
    }
  }
  private async removeUnreferenced(snapshot: { path?: unknown } | undefined): Promise<void> {
    const directory = snapshot?.path;
    if (typeof directory !== 'string') return;
    if (
      !['active', 'previous', 'staged'].every(
        (kind) => this.store.get(kind, 'framework')?.path !== directory,
      )
    )
      return;
    const parent = path.dirname(directory);
    if (![...this.knownRoots].some((root) => key(root) === key(parent))) return;
    if (!(await exists(directory))) return;
    await plainDirectory(parent);
    await plainDirectory(directory);
    await rm(directory, { recursive: true, force: true });
  }
  rollback(): Promise<FrameworkUpdateChannel> {
    return this.serial(async (signal) => {
      if (this.busy()) throw new Error('请先结束MaaFramework会话和原生操作');
      const previous = this.store.get('previous', 'framework') as FrameworkSnapshot | undefined;
      if (!previous) throw new Error('没有可回滚的MaaFramework版本');
      await this.installed(previous, signal);
      await this.validate(previous.path, signal);
      await this.installed(previous, signal);
      signal.throwIfAborted();
      if (this.busy()) throw new Error('请先结束MaaFramework会话和原生操作');
      await this.switchTo(previous, this.store.get('active', 'framework'));
      return this.change({
        currentVersion: previous.version,
        status: 'active',
        progress: 100,
        message: '已回滚到上一MaaFramework SDK版本',
      });
    });
  }
}
