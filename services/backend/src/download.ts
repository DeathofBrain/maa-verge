/** Resumable component archives. A partial belongs to one immutable release identity. */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  normalizeManualProxy,
  ProxyConfigurationError,
  resolveDownloadProxy,
} from './network-proxy.ts';
import type { DownloadProxySettings } from '../../../packages/contracts/src/types.ts';

const retryRoute = Symbol('retry-download-route');
type ComponentFetch = typeof fetch & { [retryRoute]?: () => boolean };
export class DownloadSourceError extends Error {}

/** Resolve again for each connection so system proxy changes apply on retry. */
export function createComponentFetch(
  resolveProxy = resolveDownloadProxy,
  preferences?: DownloadProxySettings,
  transport: typeof fetch = fetch,
): typeof fetch {
  let failedProxy: string | undefined;
  let lastProxy: string | undefined;
  const mode = preferences?.mode ?? 'auto';
  const fetcher = (async (input, options) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let proxy: string | undefined = '';
    if (mode === 'manual') proxy = normalizeManualProxy(preferences!.url);
    else if (mode === 'auto') {
      try {
        proxy = (await resolveProxy(url, options?.signal ?? undefined)) ?? '';
      } catch {
        options?.signal?.throwIfAborted();
      }
      if (proxy === failedProxy) proxy = '';
    }
    options?.signal?.throwIfAborted();
    lastProxy = proxy;
    const connect = (selected: string | undefined) =>
      transport(input, {
        ...options,
        proxy: selected ? { url: selected, respectNoProxy: mode !== 'manual' } : false,
      });
    let response: Response;
    try {
      response = await connect(proxy);
    } catch (error) {
      options?.signal?.throwIfAborted();
      if (mode === 'manual')
        throw new ProxyConfigurationError(
          '手动下载代理连接失败，请检查代理地址、端口、认证、证书及代理服务后重试',
        );
      if (mode !== 'auto' || !proxy) throw error;
      failedProxy = proxy;
      lastProxy = '';
      return connect('');
    }
    if (proxy && [407, 408, 429, 500, 502, 503, 504].includes(response.status)) {
      if (mode === 'manual' && response.status === 407) {
        await response.body?.cancel();
        throw new ProxyConfigurationError('手动下载代理认证失败，请检查代理用户名和密码后重试');
      }
      if (mode === 'auto') {
        await response.body?.cancel();
        options?.signal?.throwIfAborted();
        failedProxy = proxy;
        lastProxy = '';
        response = await connect('');
      }
    }
    return response;
  }) as ComponentFetch;
  fetcher[retryRoute] = () => {
    // Body streaming can fail after fetch has already returned its headers.
    // Bypass that failed proxy on retry; newly selected proxies remain usable.
    if (mode !== 'auto' || !lastProxy) return false;
    failedProxy = lastProxy;
    return true;
  };
  return fetcher;
}

/** Used when streaming a response body fails after headers were received. */
export function retryComponentDirect(fetcher: typeof fetch): boolean {
  return (fetcher as ComponentFetch)[retryRoute]?.() ?? false;
}

/** Keep source restrictions across redirects without losing proxy body recovery. */
export function restrictDownloadFetch(
  fetcher: typeof fetch,
  allowed: (url: string, redirected: boolean) => boolean,
  signal?: AbortSignal,
): typeof fetch {
  const restricted = (async (input, options) => {
    let current = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!allowed(current, false)) throw new DownloadSourceError('应用更新下载来源不可信');
    for (let redirects = 0; ; redirects++) {
      const response = await fetcher(current, {
        ...options,
        redirect: 'manual',
        signal:
          signal && options?.signal
            ? AbortSignal.any([signal, options.signal])
            : (signal ?? options?.signal),
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirects >= 5)
        throw new DownloadSourceError('应用更新重定向无效或次数过多');
      let next: string;
      try {
        next = new URL(location!, current).href;
      } catch {
        throw new DownloadSourceError('应用更新重定向地址无效');
      }
      if (!allowed(next, true)) throw new DownloadSourceError('应用更新下载拒绝不可信的重定向');
      current = next;
    }
  }) as ComponentFetch;
  restricted[retryRoute] = () => retryComponentDirect(fetcher);
  return restricted;
}

export const MAX_DOWNLOAD_BYTES = 2 * 1024 ** 3;
export interface DownloadMetadata {
  version: string;
  url: string;
  size?: number;
  digest?: string | null;
  [key: string]: any;
}
export interface DownloadOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  proxy?: DownloadProxySettings;
  idleTimeoutMs?: number;
  /** Bounded reconnect delays; empty disables retries for callers managing them. */
  retryDelaysMs?: readonly number[];
}
type Validator = { header: 'etag' | 'last-modified'; value: string };
interface PartialState {
  format: 1;
  identity: { version: string; url: string; size: number | null; digest: string | null };
  engine: 'builtin';
  validator?: Validator;
  total?: number;
}
class InvalidDownload extends Error {}
class DownloadNetworkError extends Error {}
const networkError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // Proxy configuration may contain credentials; never expose them in errors.
  const safe = message.replace(/(https?:\/\/)[^/\s]*@/gi, '$1[redacted]@');
  return /certificate|cert_|\bTLS\b|\bSSL\b|UnsupportedProxyProtocol|InvalidURL/i.test(message)
    ? new Error(safe)
    : new DownloadNetworkError(safe);
};
const USER_AGENT = 'maa-verge/0.1';
const invalid = (message: string): never => {
  throw new InvalidDownload(message);
};
const exists = async (file: string) =>
  lstat(file).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
const purge = async (partial: string) => {
  await Promise.all(
    [partial, partial + '.json', partial + '.json.tmp', partial + '.aria2'].map((file) =>
      rm(file, { force: true }),
    ),
  );
};
function checkedSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DOWNLOAD_BYTES)
    invalid('下载包超过大小限制或大小无效');
  return value;
}
function contentLength(response: Response): number | undefined {
  const value = response.headers.get('content-length');
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) invalid('下载包 Content-Length 无效');
  return checkedSize(Number(value));
}
function contentRange(response: Response): { start: number; end: number; total: number } {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
  if (!match) invalid('下载包 Content-Range 无效');
  const [start, end, total] = match!.slice(1).map(Number).map(checkedSize);
  if (end < start || end >= total) invalid('下载包 Content-Range 无效');
  return { start, end, total };
}
function validator(response: Response): Validator | undefined {
  const etag = response.headers.get('etag');
  if (etag && /^"[^"\r\n]*"$/.test(etag)) return { header: 'etag', value: etag };
  const modified = response.headers.get('last-modified');
  if (modified && /^[\x20-\x7e]+$/.test(modified) && Number.isFinite(Date.parse(modified)))
    return { header: 'last-modified', value: modified };
  return undefined;
}
function sameValidator(left?: Validator, right?: Validator): boolean {
  return Boolean(left && right && left.header === right.header && left.value === right.value);
}
function checkedUrl(value: string, previous?: string): string {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    (previous && new URL(previous).protocol === 'https:' && url.protocol !== 'https:')
  )
    invalid('下载来源必须使用 HTTPS');
  return url.href;
}
/** Refreshes on every received chunk; waiting for headers also counts as idle. */
function idleController(signal: AbortSignal | undefined, timeout: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const abort = () => controller.abort(signal?.reason ?? new Error('下载已取消'));
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => controller.abort(new DownloadNetworkError('下载连接空闲超时，请重试以继续下载')),
      timeout,
    );
    timer.unref?.();
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  touch();
  return {
    signal: controller.signal,
    touch,
    pause: () => clearTimeout(timer),
    close: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    },
  };
}
/** Manual redirects prevent HTTPS downgrades and non-HTTP download protocols. */
async function request(
  url: string,
  headers: Record<string, string>,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<{ response: Response; url: string }> {
  let current = checkedUrl(url);
  for (let redirects = 0; redirects <= 8; redirects++) {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetcher(current, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity', ...headers },
        signal,
        redirect: 'manual',
      });
    } catch (error) {
      signal.throwIfAborted();
      if (
        error instanceof ProxyConfigurationError ||
        error instanceof InvalidDownload ||
        error instanceof DownloadSourceError
      )
        throw error;
      throw networkError(error);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, url: current };
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location) invalid('下载重定向缺少地址');
    current = checkedUrl(new URL(location!, current).href, current);
  }
  return invalid('下载重定向次数过多');
}
async function saveState(partial: string, state: PartialState): Promise<void> {
  await writeFile(partial + '.json.tmp', JSON.stringify(state), { mode: 0o600 });
  await rename(partial + '.json.tmp', partial + '.json');
}
async function loadState(
  partial: string,
  expected: PartialState,
): Promise<{ state: PartialState; offset: number }> {
  const [file, sidecar] = await Promise.all([exists(partial), exists(partial + '.json')]);
  if (
    file &&
    sidecar &&
    file.isFile() &&
    sidecar.isFile() &&
    sidecar.size < 8192 &&
    file.size <= MAX_DOWNLOAD_BYTES
  ) {
    try {
      const state = JSON.parse(await readFile(partial + '.json', 'utf8')) as PartialState;
      const valid =
        state.format === 1 &&
        state.engine === expected.engine &&
        JSON.stringify(state.identity) === JSON.stringify(expected.identity) &&
        (state.total === undefined || checkedSize(state.total) >= file.size) &&
        (state.validator === undefined ||
          (['etag', 'last-modified'].includes(state.validator.header) &&
            typeof state.validator.value === 'string' &&
            !/[\r\n]/.test(state.validator.value)));
      if (valid) return { state, offset: file.size };
    } catch {
      /* A torn/old sidecar cannot authorize reusing its bytes. */
    }
  }
  await purge(partial);
  return { state: expected, offset: 0 };
}
function reporter(progress: (percent: number) => void) {
  let last = -1,
    reportedAt = -Infinity;
  return (count: number, total?: number, force = false) => {
    const percent = total ? Math.min(90, Math.trunc((count / total) * 90)) : 25;
    const now = performance.now();
    if (percent !== last && (force || now - reportedAt >= 250)) {
      last = percent;
      reportedAt = now;
      progress(percent);
    }
  };
}
async function builtin(
  metadata: DownloadMetadata,
  partial: string,
  state: PartialState,
  offset: number,
  report: ReturnType<typeof reporter>,
  options: DownloadOptions,
  idleMs: number,
): Promise<PartialState> {
  if (offset && !state.validator) {
    await purge(partial);
    offset = 0;
    state = { ...state, validator: undefined, total: undefined };
  }
  const idle = idleController(options.signal, idleMs);
  let response: Response | undefined;
  try {
    const headers: Record<string, string> = {};
    if (offset) {
      headers.Range = `bytes=${offset}-`;
      headers['If-Range'] = state.validator!.value;
    }
    ({ response } = await request(metadata.url, headers, options.fetcher!, idle.signal));
    // Local file preparation and writes are not network inactivity. Arm the
    // timer only while waiting for headers or the next response chunk.
    idle.pause();
    if (offset && response.status === 416) {
      // A completed partial (crash before rename), or a changed remote object,
      // must not leave every later retry stuck on an unsatisfiable Range.
      await response.body?.cancel();
      idle.close();
      await purge(partial);
      return await builtin(
        metadata,
        partial,
        { ...state, validator: undefined, total: undefined },
        0,
        report,
        options,
        idleMs,
      );
    }
    if ([408, 429, 500, 502, 503, 504].includes(response.status))
      throw new DownloadNetworkError(`下载失败 HTTP ${response.status}`);
    if (![200, 206].includes(response.status) || !response.body)
      throw new Error(`下载失败 HTTP ${response.status}`);
    if (
      response.headers.has('content-encoding') &&
      response.headers.get('content-encoding') !== 'identity'
    )
      invalid('下载包使用了不支持的内容编码');
    const length = contentLength(response),
      currentValidator = validator(response);
    let total: number | undefined, end: number | undefined;
    if (response.status === 206) {
      const range = contentRange(response);
      if (
        range.start !== offset ||
        (length !== undefined && length !== range.end - range.start + 1)
      )
        invalid('下载包续传范围不符');
      if (
        offset &&
        (!sameValidator(state.validator, currentValidator) ||
          (state.total !== undefined && state.total !== range.total))
      )
        invalid('下载包续传版本或大小已变化，请重试');
      total = range.total;
      end = range.end + 1;
    } else {
      // A server may ignore Range/If-Range; a complete 200 response replaces old bytes.
      offset = 0;
      total = length;
    }
    if (metadata.size !== undefined && total !== undefined && total !== metadata.size)
      invalid('下载包大小不符');
    state = { ...state, validator: currentValidator, total: total ?? metadata.size };
    const file = await open(partial, offset ? 'r+' : 'w', 0o600);
    let count = offset;
    try {
      // Truncate before binding a new validator, so a crash can never give old
      // bytes the identity of the replacement object.
      await saveState(partial, state);
      report(count, state.total, true);
      const reader = response.body.getReader();
      const cancel = () => {
        void reader.cancel(idle.signal.reason).catch(() => {});
      };
      idle.signal.addEventListener('abort', cancel, { once: true });
      if (idle.signal.aborted) cancel();
      try {
        while (true) {
          idle.signal.throwIfAborted();
          idle.touch();
          const { value: chunk, done } = await reader.read().catch((error) => {
            idle.signal.throwIfAborted();
            throw networkError(error);
          });
          idle.pause();
          idle.signal.throwIfAborted();
          if (done) break;
          count += chunk.length;
          if (
            count > MAX_DOWNLOAD_BYTES ||
            (state.total !== undefined && count > state.total) ||
            (end !== undefined && count > end)
          )
            invalid('下载包超过声明大小或大小限制');
          let written = 0;
          while (written < chunk.length) {
            const result = await file.write(
              chunk,
              written,
              chunk.length - written,
              count - chunk.length + written,
            );
            if (result.bytesWritten === 0) throw new Error('写入下载包失败');
            written += result.bytesWritten;
          }
          report(count, state.total);
        }
      } finally {
        idle.signal.removeEventListener('abort', cancel);
        reader.releaseLock();
      }
      if (
        (end !== undefined && count !== end) ||
        (state.total !== undefined && count !== state.total)
      )
        invalid('下载包大小不符');
      await file.sync();
      report(count, state.total, true);
    } finally {
      await file.close();
    }
    return state;
  } finally {
    idle.close();
    await response?.body?.cancel().catch(() => {});
  }
}

async function reconnectDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason ?? new Error('下载已取消'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/** Returns the SHA-256 only after validating and atomically publishing the file. */
export async function downloadArchive(
  metadata: DownloadMetadata,
  destination: string,
  progress: (percent: number) => void,
  options: DownloadOptions = {},
): Promise<string> {
  options = {
    ...options,
    fetcher: options.fetcher ?? createComponentFetch(resolveDownloadProxy, options.proxy),
  };
  checkedUrl(metadata.url);
  if (!metadata.version || typeof metadata.version !== 'string') invalid('下载包版本无效');
  if (metadata.size !== undefined) checkedSize(metadata.size);
  if (metadata.digest != null && !/^sha256:[0-9a-f]{64}$/i.test(metadata.digest))
    invalid('下载包 SHA-256 摘要无效');
  const idleMs = options.idleTimeoutMs ?? 30_000;
  if (!Number.isSafeInteger(idleMs) || idleMs <= 0) throw new Error('下载空闲超时无效');
  const retryDelays = options.retryDelaysMs ?? [1000, 2000];
  if (
    retryDelays.length > 5 ||
    retryDelays.some((delay) => !Number.isSafeInteger(delay) || delay < 0 || delay > 60_000)
  )
    throw new Error('下载重连间隔无效');
  options.signal?.throwIfAborted();
  await mkdir(path.dirname(destination), { recursive: true });
  const partial = destination + '.partial';
  const expected: PartialState = {
    format: 1,
    identity: {
      version: metadata.version,
      url: metadata.url,
      size: metadata.size ?? null,
      digest: metadata.digest?.toLowerCase() ?? null,
    },
    // Retain the cache discriminator so legacy sparse aria2 partials are discarded.
    engine: 'builtin',
  };
  const report = reporter(progress);
  try {
    let state: PartialState;
    for (let attempt = 0; ; attempt++) {
      options.signal?.throwIfAborted();
      const loaded = await loadState(partial, expected);
      try {
        state = await builtin(
          metadata,
          partial,
          loaded.state,
          loaded.offset,
          report,
          options,
          idleMs,
        );
        break;
      } catch (error) {
        if (
          options.signal?.aborted ||
          !(error instanceof DownloadNetworkError) ||
          attempt >= retryDelays.length
        ) {
          if (
            !options.signal?.aborted &&
            error instanceof DownloadNetworkError &&
            options.proxy?.mode === 'manual'
          )
            throw new ProxyConfigurationError(
              '手动代理下载中断，请检查代理服务后重试，可继续已下载的部分',
            );
          throw error;
        }
        (options.fetcher as ComponentFetch)[retryRoute]?.();
        // Start from the immutable origin URL again: CDN signatures can expire.
        await reconnectDelay(retryDelays[attempt], options.signal);
      }
    }
    options.signal?.throwIfAborted();
    const file = await lstat(partial);
    if (!file.isFile()) invalid('下载包不是普通文件');
    checkedSize(file.size);
    if (
      (metadata.size !== undefined && file.size !== metadata.size) ||
      (state.total !== undefined && file.size !== state.total)
    )
      invalid('下载包大小不符');
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(partial)) {
      options.signal?.throwIfAborted();
      digest.update(chunk);
    }
    const hash = digest.digest('hex');
    if (metadata.digest && metadata.digest.toLowerCase() !== 'sha256:' + hash)
      invalid('下载包 SHA-256 校验失败');
    const handle = await open(partial, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    options.signal?.throwIfAborted();
    await rename(partial, destination);
    await Promise.all(
      [partial + '.json', partial + '.aria2'].map((file) => rm(file, { force: true })),
    );
    report(file.size, file.size, true);
    return hash;
  } catch (error) {
    if (error instanceof InvalidDownload || error instanceof DownloadSourceError)
      await purge(partial);
    throw error;
  }
}
