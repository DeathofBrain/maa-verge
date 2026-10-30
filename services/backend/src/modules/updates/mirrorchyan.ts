/** Keep credential-bearing HTTP details out of persistent update metadata. */
import type { Settings } from '../../../../../packages/contracts/src/types';
import {
  downloadArchive,
  DownloadSourceError,
  MAX_DOWNLOAD_BYTES,
  restrictDownloadFetch,
  type DownloadMetadata,
  type DownloadOptions,
  type DownloadProgress,
} from '../../infrastructure/network/download';

const API = 'https://mirrorchyan.com/api/resources/';
const MAX_METADATA = 256 * 1024;
export type MirrorChyanPreferences = Settings['mirrorChyan'];
export type MirrorChyanRid = 'maa-verge' | 'MAA' | 'MaaResource';
export interface MirrorChyanIdentity {
  rid: MirrorChyanRid;
  version: string;
  channel: 'stable' | 'alpha';
  os?: string;
  arch?: string;
}
export interface MirrorChyanRelease extends MirrorChyanIdentity {
  versionNumber?: number;
  url?: string;
  size?: number;
  digest?: string;
  full: boolean;
}

const messages: Record<number, string> = {
  1001: 'Mirror酱请求参数无效',
  7001: 'Mirror酱 CDK 已过期，请续费后重试',
  7002: 'Mirror酱 CDK 无效，请检查设置',
  7003: 'Mirror酱今日下载次数已达上限',
  7004: 'Mirror酱 CDK 不适用于此项目',
  7005: 'Mirror酱 CDK 已被封禁，请联系售后',
  8001: 'Mirror酱当前平台暂无可用更新',
  8002: 'Mirror酱不支持当前系统',
  8003: 'Mirror酱不支持当前架构',
  8004: 'Mirror酱不支持当前更新通道',
  8009: 'Mirror酱流程测试 CDK 不支持下载，请使用正式 CDK',
};
export class MirrorChyanError extends DownloadSourceError {
  constructor(readonly code?: number) {
    super(code === undefined ? 'Mirror酱连接或响应失败' : (messages[code] ?? 'Mirror酱暂时不可用'));
    this.name = 'MirrorChyanError';
  }
}
export function mirrorChyanMessage(error: unknown): string {
  return error instanceof MirrorChyanError ? error.message : 'Mirror酱暂时不可用';
}
export function validResourceTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/.test(value)) return false;
  const parsed = new Date(value.replace(' ', 'T') + 'Z');
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().replace('T', ' ').replace('Z', '') === value
  );
}
export function mirrorChyanPlatform(
  system: string = process.platform,
  machine: string = process.arch,
) {
  const os = { win32: 'windows', windows: 'windows', darwin: 'darwin', linux: 'linux' }[
    system.toLowerCase() as 'win32'
  ];
  const arch = { x64: 'amd64', amd64: 'amd64', x86_64: 'amd64', arm64: 'arm64', aarch64: 'arm64' }[
    machine.toLowerCase() as 'x64'
  ];
  return os && arch ? { os, arch } : undefined;
}
function httpsUrl(address: unknown): URL | undefined {
  if (typeof address !== 'string' || address.length > 8192) return undefined;
  try {
    const url = new URL(address);
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      /^[a-z0-9.-]+$/i.test(url.hostname) &&
      url.hostname.includes('.') &&
      !/^[\d.]+$/.test(url.hostname) &&
      !/\.(?:localhost|local|internal)$/i.test(url.hostname)
    )
      return url;
  } catch {
    /* Never include the rejected signed URL in a diagnostic. */
  }
  return undefined;
}
export function mirrorChyanSource(identity: MirrorChyanIdentity): string {
  const url = new URL(API + identity.rid + '/latest');
  url.searchParams.set('version', identity.version);
  url.searchParams.set('channel', identity.channel);
  if (identity.os) url.searchParams.set('os', identity.os);
  if (identity.arch) url.searchParams.set('arch', identity.arch);
  return url.href;
}
export function mirrorChyanFull(release: MirrorChyanRelease): release is MirrorChyanRelease & {
  url: string;
  size: number;
  digest: string;
} {
  return Boolean(release.full && release.url && release.size && release.digest);
}
async function downloadError(response: Response): Promise<MirrorChyanError | undefined> {
  if (!response.body || Number(response.headers.get('content-length')) > MAX_METADATA)
    return undefined;
  try {
    let length = 0;
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > MAX_METADATA) return undefined;
      chunks.push(chunk);
    }
    const reply = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (Number.isInteger(reply?.code) && reply.code !== 0) return new MirrorChyanError(reply.code);
  } catch {
    /* Error response bodies and server messages may echo credentials. */
  } finally {
    await response.body.cancel().catch(() => {});
  }
  return undefined;
}

export class MirrorChyanClient {
  constructor(
    private readonly preferences: () => MirrorChyanPreferences,
    private readonly fetcher: typeof fetch,
    private readonly signal?: AbortSignal,
    private readonly timeoutMs = 15_000,
  ) {}
  get enabled(): boolean {
    return this.preferences()?.enabled === true;
  }
  async latest(
    rid: MirrorChyanRid,
    releaseChannel: 'stable' | 'preview' = 'stable',
    platform?: { os: string; arch: string },
  ): Promise<MirrorChyanRelease> {
    const settings = this.preferences();
    if (!settings?.enabled) throw new MirrorChyanError();
    const channel = releaseChannel === 'preview' ? 'alpha' : 'stable';
    const url = new URL(API + rid + '/latest');
    // Native generations and Tauri installation require complete snapshots.
    url.searchParams.set('current_version', '0');
    url.searchParams.set('channel', channel);
    url.searchParams.set('user_agent', 'MaaVerge');
    if (platform) {
      url.searchParams.set('os', platform.os);
      url.searchParams.set('arch', platform.arch);
    }
    if (settings.cdk.trim()) url.searchParams.set('cdk', settings.cdk.trim());
    let response: Response | undefined;
    try {
      response = await this.fetcher(url.href, {
        redirect: 'manual',
        signal: AbortSignal.any([
          ...(this.signal ? [this.signal] : []),
          AbortSignal.timeout(this.timeoutMs),
        ]),
        headers: { 'User-Agent': 'maa-verge' },
      });
      if (response.status >= 300 && response.status < 400) throw new MirrorChyanError();
      if (!response.body || Number(response.headers.get('content-length')) > MAX_METADATA)
        throw new MirrorChyanError();
      const chunks: Uint8Array[] = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > MAX_METADATA) throw new MirrorChyanError();
        chunks.push(chunk);
      }
      const reply = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Number.isInteger(reply?.code)) throw new MirrorChyanError();
      if (reply.code !== 0) throw new MirrorChyanError(reply.code);
      const data = reply.data;
      if (
        !response.ok ||
        !data ||
        typeof data.version_name !== 'string' ||
        !data.version_name.trim() ||
        data.version_name.length > 200 ||
        (platform && (data.os !== platform.os || data.arch !== platform.arch)) ||
        (!platform && (data.os || data.arch))
      )
        throw new MirrorChyanError();
      // The server reports the requested channel; alpha intentionally includes stable/beta.
      if (data.channel !== channel && !(rid === 'MaaResource' && data.channel === 'stable'))
        throw new MirrorChyanError();
      const address = httpsUrl(data.url);
      if (data.url && (!address || address.hostname !== 'mirrorchyan.com'))
        throw new MirrorChyanError();
      const digest =
        typeof data.sha256 === 'string' && /^[a-f\d]{64}$/i.test(data.sha256)
          ? 'sha256:' + data.sha256.toLowerCase()
          : undefined;
      const size =
        Number.isSafeInteger(data.filesize) &&
        data.filesize > 0 &&
        data.filesize <= MAX_DOWNLOAD_BYTES
          ? data.filesize
          : undefined;
      return {
        rid,
        version: data.version_name,
        channel,
        ...platform,
        ...(Number.isSafeInteger(data.version_number)
          ? { versionNumber: data.version_number }
          : {}),
        ...(address ? { url: address.href } : {}),
        ...(digest ? { digest } : {}),
        ...(size ? { size } : {}),
        full: data.update_type === 'full',
      };
    } catch (error) {
      this.signal?.throwIfAborted();
      throw error instanceof MirrorChyanError ? error : new MirrorChyanError();
    } finally {
      await response?.body?.cancel().catch(() => {});
    }
  }
  async download(
    release: MirrorChyanRelease,
    metadata: DownloadMetadata,
    destination: string,
    progress: DownloadProgress,
    options: Omit<DownloadOptions, 'fetcher'> = {},
  ): Promise<string> {
    if (!mirrorChyanFull(release)) throw new MirrorChyanError();
    const restricted = restrictDownloadFetch(
      this.fetcher,
      (address, redirected) => (redirected ? Boolean(httpsUrl(address)) : address === release.url),
      this.signal,
    );
    // The downloader persists its input identity for resume. Rewrite only at the
    // transport boundary, keeping signed URLs out of those sidecars and manifests.
    const transport = Object.assign(
      (async (input, init) => {
        const address =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (address !== metadata.url) throw new MirrorChyanError();
        const response = await restricted(release.url!, init);
        if (!response.ok) {
          const failure = await downloadError(response);
          if (failure) throw failure;
        }
        return response;
      }) as typeof fetch,
      restricted,
    );
    try {
      return await downloadArchive(metadata, destination, progress, {
        ...options,
        signal: this.signal,
        fetcher: transport,
      });
    } catch (error) {
      this.signal?.throwIfAborted();
      // Fetch errors and server messages can contain signed URLs or CDKs.
      throw error instanceof MirrorChyanError ? error : new MirrorChyanError();
    }
  }
}
