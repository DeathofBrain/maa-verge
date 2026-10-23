/** Resumable component archives. A partial belongs to one immutable release identity. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { childEnvironment } from "./config.ts";

export const MAX_DOWNLOAD_BYTES = 2 * 1024 ** 3;
export type DownloadEngine = "builtin" | "aria2";
export interface DownloadMetadata { version: string; url: string; size?: number; digest?: string | null; [key: string]: any }
export interface DownloadOptions {
  signal?: AbortSignal; fetcher?: typeof fetch; engine?: DownloadEngine; aria2Path?: string; idleTimeoutMs?: number;
}
type Validator = { header: "etag" | "last-modified"; value: string };
interface PartialState {
  format: 1; identity: { version: string; url: string; size: number | null; digest: string | null };
  engine: DownloadEngine; validator?: Validator; total?: number;
}
class InvalidDownload extends Error {}
const USER_AGENT = "maa-verge/0.1";
const invalid = (message: string): never => { throw new InvalidDownload(message); };
const exists = async (file: string) => lstat(file).catch((error) => { if (error.code === "ENOENT") return undefined; throw error; });
const purge = async (partial: string) => {
  await Promise.all([partial, partial + ".json", partial + ".json.tmp", partial + ".aria2"].map((file) => rm(file, { force: true })));
};
function checkedSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DOWNLOAD_BYTES) invalid("下载包超过大小限制或大小无效");
  return value;
}
function contentLength(response: Response): number | undefined {
  const value = response.headers.get("content-length");
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) invalid("下载包 Content-Length 无效");
  return checkedSize(Number(value));
}
function contentRange(response: Response): { start: number; end: number; total: number } {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
  if (!match) invalid("下载包 Content-Range 无效");
  const [start, end, total] = match!.slice(1).map(Number).map(checkedSize);
  if (end < start || end >= total) invalid("下载包 Content-Range 无效");
  return { start, end, total };
}
function validator(response: Response): Validator | undefined {
  const etag = response.headers.get("etag");
  if (etag && /^"[^"\r\n]*"$/.test(etag)) return { header: "etag", value: etag };
  const modified = response.headers.get("last-modified");
  if (modified && /^[\x20-\x7e]+$/.test(modified) && Number.isFinite(Date.parse(modified))) return { header: "last-modified", value: modified };
  return undefined;
}
function sameValidator(left?: Validator, right?: Validator): boolean {
  return Boolean(left && right && left.header === right.header && left.value === right.value);
}
function checkedUrl(value: string, previous?: string): string {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      (previous && new URL(previous).protocol === "https:" && url.protocol !== "https:")) invalid("下载来源必须使用 HTTPS");
  return url.href;
}
/** Refreshes on every received chunk; waiting for headers also counts as idle. */
function idleController(signal: AbortSignal | undefined, timeout: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const abort = () => controller.abort(signal?.reason ?? new Error("下载已取消"));
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new Error("下载连接空闲超时，请重试以继续下载")), timeout);
    timer.unref?.();
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  touch();
  return { signal: controller.signal, touch, close: () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); } };
}
/** Manual redirects prevent HTTPS downgrades and non-HTTP download protocols. */
async function request(url: string, headers: Record<string, string>, fetcher: typeof fetch, signal: AbortSignal): Promise<{ response: Response; url: string }> {
  let current = checkedUrl(url);
  for (let redirects = 0; redirects <= 8; redirects++) {
    signal.throwIfAborted();
    const response = await fetcher(current, { headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "identity", ...headers }, signal, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, url: current };
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location) invalid("下载重定向缺少地址");
    current = checkedUrl(new URL(location!, current).href, current);
  }
  return invalid("下载重定向次数过多");
}
async function saveState(partial: string, state: PartialState): Promise<void> {
  await writeFile(partial + ".json.tmp", JSON.stringify(state), { mode: 0o600 });
  await rename(partial + ".json.tmp", partial + ".json");
}
async function loadState(partial: string, expected: PartialState): Promise<{ state: PartialState; offset: number }> {
  const [file, sidecar] = await Promise.all([exists(partial), exists(partial + ".json")]);
  if (file && sidecar && file.isFile() && sidecar.isFile() && sidecar.size < 8192 && file.size <= MAX_DOWNLOAD_BYTES) {
    try {
      const state = JSON.parse(await readFile(partial + ".json", "utf8")) as PartialState;
      const valid = state.format === 1 && state.engine === expected.engine &&
        JSON.stringify(state.identity) === JSON.stringify(expected.identity) &&
        (state.total === undefined || checkedSize(state.total) >= file.size) &&
        (state.validator === undefined || ["etag", "last-modified"].includes(state.validator.header) &&
          typeof state.validator.value === "string" && !/[\r\n]/.test(state.validator.value));
      if (valid) return { state, offset: file.size };
    } catch { /* A torn/old sidecar cannot authorize reusing its bytes. */ }
  }
  await purge(partial);
  return { state: expected, offset: 0 };
}
function reporter(progress: (percent: number) => void) {
  let last = -1, reportedAt = -Infinity;
  return (count: number, total?: number, force = false) => {
    const percent = total ? Math.min(90, Math.trunc(count / total * 90)) : 25;
    const now = performance.now();
    if (percent !== last && (force || now - reportedAt >= 250)) { last = percent; reportedAt = now; progress(percent); }
  };
}
async function builtin(metadata: DownloadMetadata, partial: string, state: PartialState, offset: number,
    report: ReturnType<typeof reporter>, options: DownloadOptions, idleMs: number): Promise<PartialState> {
  if (offset && !state.validator) { await purge(partial); offset = 0; state = { ...state, validator: undefined, total: undefined }; }
  const idle = idleController(options.signal, idleMs);
  let response: Response | undefined;
  try {
    const headers: Record<string, string> = {};
    if (offset) { headers.Range = `bytes=${offset}-`; headers["If-Range"] = state.validator!.value; }
    ({ response } = await request(metadata.url, headers, options.fetcher ?? fetch, idle.signal));
    idle.touch();
    if (offset && response.status === 416) {
      // A completed partial (crash before rename), or a changed remote object,
      // must not leave every later retry stuck on an unsatisfiable Range.
      await response.body?.cancel(); idle.close(); await purge(partial);
      return await builtin(metadata, partial, { ...state, validator: undefined, total: undefined }, 0, report, options, idleMs);
    }
    if (![200, 206].includes(response.status) || !response.body) throw new Error(`下载失败 HTTP ${response.status}`);
    if (response.headers.has("content-encoding") && response.headers.get("content-encoding") !== "identity") invalid("下载包使用了不支持的内容编码");
    const length = contentLength(response), currentValidator = validator(response);
    let total: number | undefined, end: number | undefined;
    if (response.status === 206) {
      const range = contentRange(response);
      if (range.start !== offset || (length !== undefined && length !== range.end - range.start + 1)) invalid("下载包续传范围不符");
      if (offset && (!sameValidator(state.validator, currentValidator) || state.total !== undefined && state.total !== range.total)) invalid("下载包续传版本或大小已变化，请重试");
      total = range.total; end = range.end + 1;
    } else {
      // A server may ignore Range/If-Range; a complete 200 response replaces old bytes.
      offset = 0; total = length;
    }
    if (metadata.size !== undefined && total !== undefined && total !== metadata.size) invalid("下载包大小不符");
    state = { ...state, validator: currentValidator, total: total ?? metadata.size };
    const file = await open(partial, offset ? "r+" : "w", 0o600);
    let count = offset;
    try {
      // Truncate before binding a new validator, so a crash can never give old
      // bytes the identity of the replacement object.
      await saveState(partial, state);
      report(count, state.total, true);
      const reader = response.body.getReader();
      const cancel = () => { void reader.cancel(idle.signal.reason).catch(() => {}); };
      idle.signal.addEventListener("abort", cancel, { once: true });
      try {
        while (true) {
          const { value: chunk, done } = await reader.read();
          idle.signal.throwIfAborted();
          if (done) break;
          idle.touch(); idle.signal.throwIfAborted();
          count += chunk.length;
          if (count > MAX_DOWNLOAD_BYTES || state.total !== undefined && count > state.total || end !== undefined && count > end) invalid("下载包超过声明大小或大小限制");
          let written = 0;
          while (written < chunk.length) {
            const result = await file.write(chunk, written, chunk.length - written, count - chunk.length + written);
            if (result.bytesWritten === 0) throw new Error("写入下载包失败");
            written += result.bytesWritten;
          }
          report(count, state.total);
        }
      } finally { idle.signal.removeEventListener("abort", cancel); reader.releaseLock(); }
      if (end !== undefined && count !== end || state.total !== undefined && count !== state.total) invalid("下载包大小不符");
      await file.sync();
      report(count, state.total, true);
    } finally { await file.close(); }
    return state;
  } finally {
    idle.close();
    await response?.body?.cancel().catch(() => {});
  }
}

async function aria2(metadata: DownloadMetadata, partial: string, state: PartialState, offset: number,
    report: ReturnType<typeof reporter>, options: DownloadOptions, idleMs: number): Promise<PartialState> {
  // Resolve and validate redirects ourselves, and bind aria2's control file to the
  // same remote object before allowing it to continue an interrupted transfer.
  const idle = idleController(options.signal, idleMs);
  let probe: Response;
  let url: string;
  try {
    ({ response: probe, url } = await request(metadata.url, { Range: "bytes=0-0" }, options.fetcher ?? fetch, idle.signal));
    try {
      if (![200, 206].includes(probe.status)) throw new Error(`下载失败 HTTP ${probe.status}`);
      let total = contentLength(probe);
      if (probe.status === 206) {
        const range = contentRange(probe);
        if (range.start !== 0 || range.end !== 0 || total !== undefined && total !== 1) invalid("下载包探测范围不符");
        total = range.total;
      }
      if (metadata.size !== undefined && total !== undefined && total !== metadata.size) invalid("下载包大小不符");
      const currentValidator = validator(probe);
      if (offset && (probe.status === 200 || !sameValidator(state.validator, currentValidator) || state.total !== undefined && total !== state.total)) {
        await purge(partial); offset = 0;
      }
      state = { ...state, validator: currentValidator, total: total ?? metadata.size };
      await saveState(partial, state);
    } finally { await probe.body?.cancel(); }
  } finally { idle.close(); }
  options.signal?.throwIfAborted();
  const args = ["--no-conf=true", "--enable-rpc=false", "--continue=true", "--always-resume=true",
    "--allow-overwrite=true", "--auto-file-renaming=false", "--file-allocation=none", "--max-concurrent-downloads=1",
    "--split=1", "--max-connection-per-server=1", "--follow-torrent=false", "--follow-metalink=false",
    "--enable-dht=false", "--enable-dht6=false", "--enable-peer-exchange=false", "--seed-time=0",
    "--check-certificate=true", "--http-accept-gzip=false", "--content-disposition=false", "--max-tries=1",
    "--connect-timeout=30", `--timeout=${Math.max(1, Math.ceil(idleMs / 1000))}`, "--auto-save-interval=1",
    "--summary-interval=1", "--show-console-readout=true", "--truncate-console-readout=false", "--human-readable=false",
    "--download-result=hide", "--console-log-level=warn", "--enable-color=false",
    `--user-agent=${USER_AGENT}`, `--dir=${path.dirname(partial)}`, `--out=${path.basename(partial)}`];
  if (state.validator) args.push(`--header=If-Range: ${state.validator.value}`);
  if (metadata.digest) args.push(`--checksum=sha-256=${metadata.digest.slice(7)}`);
  args.push("--", url!);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(options.aria2Path?.trim() || "aria2c", args, { windowsHide: true, shell: false, env: childEnvironment(), stdio: ["ignore", "pipe", "pipe"] });
    let output = "", failure: Error | undefined, lastModified = -1, lastCompleted = -1, lastActivity = performance.now(), polling = false, settled = false;
    const stop = (error: Error) => { failure ??= error; child.kill("SIGKILL"); };
    const abort = () => stop(options.signal?.reason instanceof Error ? options.signal.reason : new Error("下载已取消"));
    const capture = (chunk: Buffer) => {
      if (settled) return;
      output = (output + chunk.toString("utf8")).slice(-2048);
      // Fixed --human-readable=false gives byte counts. File size is not
      // progress: resumed aria2 files can already be sparse at their final size.
      for (const match of output.matchAll(/\[#[a-z0-9]+ (\d+)B\/(\d+)B/g)) {
        const completed = Number(match[1]), total = Number(match[2]);
        if (!Number.isSafeInteger(completed) || completed < 0 || completed > total || total > MAX_DOWNLOAD_BYTES) continue;
        if (completed > lastCompleted) { lastCompleted = completed; lastActivity = performance.now(); report(completed, state.total ?? (total || undefined)); }
      }
    };
    child.stdout?.on("data", capture); child.stderr?.on("data", capture);
    const timer = setInterval(() => {
      if (polling) return;
      polling = true;
      void stat(partial).then((file) => {
        if (settled) return;
        if (file.size > MAX_DOWNLOAD_BYTES || state.total !== undefined && file.size > state.total) { stop(new InvalidDownload("下载包超过声明大小或大小限制")); return; }
        if (file.mtimeMs !== lastModified) { lastModified = file.mtimeMs; lastActivity = performance.now(); }
        else if (performance.now() - lastActivity >= idleMs) stop(new Error("下载连接空闲超时，请重试以继续下载"));
      }).catch((error) => {
        if (settled) return;
        if (error.code !== "ENOENT") stop(error);
        else if (performance.now() - lastActivity >= idleMs) stop(new Error("下载连接空闲超时，请重试以继续下载"));
      }).finally(() => { polling = false; });
    }, Math.min(250, idleMs));
    timer.unref?.();
    const cleanup = () => { settled = true; clearInterval(timer); options.signal?.removeEventListener("abort", abort); };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    child.once("error", (error) => { cleanup(); reject(new Error(`无法启动 aria2 下载器: ${error.message}`)); });
    child.once("close", (code) => {
      cleanup();
      if (failure) reject(failure);
      else if (code !== 0) reject([10, 32].includes(code ?? -1) ? new InvalidDownload(`aria2 下载校验失败 (${code})`) : new Error(`aria2 下载失败 (${code}): ${output.trim()}`));
      else resolve();
    });
  });
  return state;
}

/** Returns the SHA-256 only after validating and atomically publishing the file. */
export async function downloadArchive(metadata: DownloadMetadata, destination: string, progress: (percent: number) => void, options: DownloadOptions = {}): Promise<string> {
  checkedUrl(metadata.url);
  if (!metadata.version || typeof metadata.version !== "string") invalid("下载包版本无效");
  if (metadata.size !== undefined) checkedSize(metadata.size);
  if (metadata.digest != null && !/^sha256:[0-9a-f]{64}$/i.test(metadata.digest)) invalid("下载包 SHA-256 摘要无效");
  const idleMs = options.idleTimeoutMs ?? 30_000;
  if (!Number.isSafeInteger(idleMs) || idleMs <= 0) throw new Error("下载空闲超时无效");
  const engine = options.engine ?? "builtin";
  if (!["builtin", "aria2"].includes(engine)) throw new Error("未知下载器");
  options.signal?.throwIfAborted();
  await mkdir(path.dirname(destination), { recursive: true });
  const partial = destination + ".partial";
  const expected: PartialState = { format: 1, identity: { version: metadata.version, url: metadata.url, size: metadata.size ?? null,
    digest: metadata.digest?.toLowerCase() ?? null }, engine };
  const loaded = await loadState(partial, expected), report = reporter(progress);
  try {
    const state = await (engine === "aria2" ? aria2 : builtin)(metadata, partial, loaded.state, loaded.offset, report, options, idleMs);
    options.signal?.throwIfAborted();
    const file = await lstat(partial);
    if (!file.isFile()) invalid("下载包不是普通文件");
    checkedSize(file.size);
    if (metadata.size !== undefined && file.size !== metadata.size || state.total !== undefined && file.size !== state.total) invalid("下载包大小不符");
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(partial)) { options.signal?.throwIfAborted(); digest.update(chunk); }
    const hash = digest.digest("hex");
    if (metadata.digest && metadata.digest.toLowerCase() !== "sha256:" + hash) invalid("下载包 SHA-256 校验失败");
    const handle = await open(partial, "r+");
    try { await handle.sync(); } finally { await handle.close(); }
    options.signal?.throwIfAborted();
    await rename(partial, destination);
    await Promise.all([partial + ".json", partial + ".aria2"].map((file) => rm(file, { force: true })));
    report(file.size, file.size, true);
    return hash;
  } catch (error) {
    if (error instanceof InvalidDownload) await purge(partial);
    throw error;
  }
}
