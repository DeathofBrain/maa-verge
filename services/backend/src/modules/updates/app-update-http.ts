/** Host-only application transport. Rust alone verifies and installs signed bytes. */
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { DownloadProxySettings } from '../../../../../packages/contracts/src/types';
import type { HostUpdateParams } from '../../../../../packages/contracts/src/rpc-types';
import { validateHostUpdateParams } from '../../../../../packages/contracts/src/validators.js';
import {
  createComponentFetch,
  downloadArchive,
  restrictDownloadFetch,
  type DownloadOptions,
} from '../../infrastructure/network/download';
import { RpcError } from '../../shared/errors';
import { OfficialSource } from './updates';
import {
  MirrorChyanClient,
  MirrorChyanError,
  mirrorChyanFull,
  mirrorChyanMessage,
  type MirrorChyanPreferences,
} from './mirrorchyan';

const REPOSITORY = '/DeathofBrain/maa-verge/releases/';
const MAX_WIRE_METADATA = 3 * 1024 * 1024;

function trustedUrl(address: string): URL | undefined {
  try {
    const url = new URL(address);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash)
      return url;
  } catch {
    // All rejection diagnostics are static: configured proxy credentials stay private.
  }
  return undefined;
}

export function appAssetRedirect(address: string): boolean {
  const url = trustedUrl(address);
  return Boolean(
    url &&
    (['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(
      url.hostname,
    ) ||
      (url.hostname === 'github.com' &&
        !url.search &&
        url.pathname.startsWith(REPOSITORY + 'download/'))),
  );
}

export interface AppUpdateHttpOptions {
  fetcher?: typeof fetch;
  resolveProxy?: Parameters<typeof createComponentFetch>[0];
  retryDelaysMs?: DownloadOptions['retryDelaysMs'];
  idleTimeoutMs?: number;
  mirrorChyan?: () => MirrorChyanPreferences;
  mirrorChyanStatus?: (message: string) => void;
}

export class AppUpdateHttp {
  private active?: { operationId: string; abort: AbortController; settled: Promise<void> };
  private completed?: { operationId: string; path: string };
  private closed = false;

  constructor(
    private readonly directory: string,
    private readonly preferences: () => DownloadProxySettings | undefined,
    private readonly progress: (
      operationId: string,
      progress: number,
      downloadSpeedBytesPerSecond?: number,
    ) => void,
    private readonly options: AppUpdateHttpOptions = {},
  ) {}

  close(): void {
    this.closed = true;
    this.active?.abort.abort(new Error('应用服务正在关闭，下载分片已保留'));
  }

  async handle(input: unknown): Promise<unknown> {
    if (!validateHostUpdateParams(input)) throw new RpcError(-32602, '应用更新传输参数无效');
    const params: HostUpdateParams = input;
    if (params.operation === 'cancel') {
      const active = this.active?.operationId === params.operationId ? this.active : undefined;
      if (active) {
        active.abort.abort(new Error('应用更新传输已取消，下载分片已保留'));
        await active.settled;
      }
      const completed =
        this.completed?.operationId === params.operationId ? this.completed : undefined;
      if (completed) {
        await rm(completed.path, { force: true });
        if (this.completed === completed) this.completed = undefined;
      }
      const cancelled = Boolean(active || completed);
      return { cancelled };
    }
    if (this.closed) throw new RpcError(-32011, '应用更新传输正在退出');
    if (this.active) throw new RpcError(-32021, '已有应用更新网络请求正在进行');
    let finish!: () => void;
    const active = {
      operationId: params.operationId,
      abort: new AbortController(),
      settled: new Promise<void>((resolve) => {
        finish = resolve;
      }),
    };
    const preferences = this.preferences();
    const fetcher = createComponentFetch(
      this.options.resolveProxy,
      preferences,
      this.options.fetcher,
    );
    this.active = active;
    let source: OfficialSource | undefined;
    try {
      const archive = params.operation === 'download';
      if (archive) {
        if (
          params.tag.replace(/^v/, '') !== params.version ||
          ![
            'x64-setup.exe',
            'x64_zh-CN.msi',
            'aarch64.app.tar.gz',
            'x64.app.tar.gz',
            'amd64.AppImage',
          ].some((suffix) => params.name === `Maa-Verge_${params.version}_${suffix}`)
        )
          throw new Error('应用更新包版本或文件名无效');
      }
      const url =
        params.operation === 'releases'
          ? `https://api.github.com/repos/DeathofBrain/maa-verge/releases?per_page=100&page=${params.page}`
          : `https://github.com${REPOSITORY}download/${params.tag}/${archive ? params.name : 'latest.json'}`;
      const restricted = restrictDownloadFetch(
        fetcher,
        (address, redirected) =>
          redirected
            ? params.operation !== 'releases' && appAssetRedirect(address)
            : address === url,
        active.abort.signal,
      );
      if (!archive) {
        // Keep the same bounded JSON reads and proxy body recovery as components.
        source = new OfficialSource(restricted, () => preferences);
        const value = await source.getJson(url);
        active.abort.signal.throwIfAborted();
        if (Buffer.byteLength(JSON.stringify(value)) > MAX_WIRE_METADATA)
          throw new Error('应用更新元数据超出本地传输大小限制');
        return value;
      }
      const identity = {
        version: params.version,
        url,
        size: params.size,
        digest: params.digest?.toLowerCase(),
      };
      const name = createHash('sha256').update(JSON.stringify(identity)).digest('hex') + '.bin';
      const destination = path.resolve(this.directory, name);
      let sha256: string | undefined;
      const client = new MirrorChyanClient(
        this.options.mirrorChyan ?? (() => undefined),
        fetcher,
        active.abort.signal,
      );
      // The registered macOS artifact is a DMG. Tauri requires its separately
      // signed .app.tar.gz; never treat those two installation formats as equal.
      const platform = params.name.endsWith('_x64-setup.exe')
        ? { os: 'windows', arch: 'amd64' }
        : params.name.endsWith('_amd64.AppImage')
          ? { os: 'linux', arch: 'amd64' }
          : undefined;
      if (client.enabled && platform && identity.digest) {
        let fallbackNotice: string | undefined;
        try {
          const release = await client.latest(
            'maa-verge',
            params.tag.includes('-') ? 'preview' : 'stable',
            platform,
          );
          if (!mirrorChyanFull(release)) {
            fallbackNotice = this.options.mirrorChyan?.()?.cdk.trim()
              ? 'Mirror酱未提供完整下载包'
              : '未填写 Mirror酱 CDK';
            throw new MirrorChyanError();
          }
          if (
            release.version.replace(/^v/, '') !== params.version ||
            release.size !== params.size ||
            release.digest !== identity.digest
          )
            throw new MirrorChyanError();
          sha256 = await client.download(
            release,
            identity,
            destination,
            (percent, bytesPerSecond) => this.progress(params.operationId, percent, bytesPerSecond),
            {
              ...this.options,
              proxy: preferences,
            },
          );
          this.options.mirrorChyanStatus?.('应用更新包已通过 Mirror酱下载，仍需校验发行签名');
        } catch (error) {
          active.abort.signal.throwIfAborted();
          this.options.mirrorChyanStatus?.(
            (fallbackNotice ?? mirrorChyanMessage(error)) + '，已改用官方更新源',
          );
        }
      }
      sha256 ??= await downloadArchive(
        identity,
        destination,
        (percent, bytesPerSecond) => this.progress(params.operationId, percent, bytesPerSecond),
        {
          ...this.options,
          signal: active.abort.signal,
          proxy: preferences,
          fetcher: restricted,
        },
      );
      this.completed = { operationId: params.operationId, path: destination };
      return { path: destination, size: params.size, sha256 };
    } catch (error) {
      if (active.abort.signal.aborted) error = active.abort.signal.reason;
      const message = (error instanceof Error ? error.message : String(error)).replace(
        /(https?:\/\/)[^/\s]*@/gi,
        '$1[redacted]@',
      );
      throw error instanceof RpcError ? error : new RpcError(-32040, message);
    } finally {
      source?.close();
      if (this.active === active) this.active = undefined;
      finish();
    }
  }
}
