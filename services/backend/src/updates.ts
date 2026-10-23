/** Independent immutable MaaCore / MaaResource generations. Jobs never open the business DB. */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, lstatSync, readFileSync } from "node:fs";
import { cp, lstat, mkdir, open, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractArchive, extractCoreArchive, normalizeRuntimeRoot } from "./archives.ts";
import { RpcError } from "./errors.ts";
import { nativeWorkerPath } from "./native-path.ts";
import { childEnvironment, nativeEnvironment, normalizeComponentPath, type ComponentPaths } from "./config.ts";
import { resourceActivityVersions } from "./resource-version.ts";
import { pruneGenerations } from "./generation-retention.ts";
import { snapshotIntegrity } from "./snapshot-integrity.ts";
import { downloadArchive } from "./download.ts";
import type { ComponentDownload } from "../../../packages/contracts/src/types.ts";

const GITHUB = "https://api.github.com/repos/MaaAssistantArknights";
export { MAX_DOWNLOAD_BYTES } from "./download.ts";
export type UpdateChannel = "app" | "core" | "resource";
export type UpdateMetadata = Record<string, any> & { version: string };
export interface UpdateStore {
  get(kind: string, id: string, fallback?: any): any;
  put(kind: string, id: string, value: any): void;
  all(kind: string): any[];
  delete(kind: string, id: string): void;
}
export interface UpdateSource {
  check(channel: string): Promise<UpdateMetadata> | UpdateMetadata;
  download(metadata: UpdateMetadata, destination: string, progress: (percent: number) => void, options?: ComponentDownload): Promise<string> | string;
  close?(): void;
}
type Validator = (core: string, resource: string, version: string) => Promise<void> | void;
type Hook = () => Promise<void> | void;
export interface UpdateOptions {
  directories?: ComponentPaths;
  source?: UpdateSource; validator?: Validator;
  beforeActivate?: Hook; afterActivate?: Hook; finishActivate?: (error?: string) => Promise<void> | void;
  jobCommand?: string[];
  jobRunner?: (config: UpdateJobConfig) => Promise<UpdateJobResult>;
  protectedPaths?: () => string[];
}
export interface UpdateJobConfig {
  channel: "core" | "resource"; archive: string; target: string; version: string;
  core?: string; coreVersion?: string; workerPath?: string;
}
export interface UpdateJobResult { ownedFiles?: string[]; coreVersion?: string; contentHash?: string }
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

// Database versions are only hints: uninstall/reinstall and manual file removal
// can leave them behind. Older generations lack an inventory, so retain support
// for them while checking the native library and resource metadata explicitly.
function installedSnapshot(snapshot: any, core: boolean, full: boolean): boolean {
  if (typeof snapshot?.path !== 'string' || typeof snapshot.version !== 'string') return false;
  const file = (relative: string) => {
    try {
      const info = lstatSync(path.join(snapshot.path, relative));
      return info.isFile() && !info.isSymbolicLink() && info.size > 0;
    } catch { return false; }
  };
  try {
    if (!lstatSync(snapshot.path).isDirectory() || lstatSync(snapshot.path).isSymbolicLink()) return false;
    if (core && !['MaaCore.dll', 'libMaaCore.so', 'libMaaCore.dylib'].some(file)) return false;
    if (!file('resource/version.json')) return false;
    {
      const versionPath = path.join(snapshot.path, 'resource/version.json');
      if (lstatSync(versionPath).size > 256 * 1024) return false;
      const version = JSON.parse(readFileSync(versionPath, 'utf8'));
      if (!version || typeof version !== 'object' || Array.isArray(version)) return false;
      if (full && snapshot.installedFiles && (!Array.isArray(snapshot.installedFiles) || !snapshot.installedFiles.every((relative: unknown) => {
        if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === '..')) return false;
        try { const info = lstatSync(path.join(snapshot.path, relative)); return info.isFile() && !info.isSymbolicLink(); } catch { return false; }
      }))) return false;
    }
    return true;
  } catch { return false; }
}
function resourceVersion(combo: any): string {
  return combo.core && combo.resource?.path === combo.core.path ? 'bundled@' + combo.core.version : combo.resource?.version ?? '未安装';
}
const digestRecorded = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function hasIntegrity(snapshot: any, core: boolean): boolean {
  return !!snapshot && (digestRecorded(snapshot.installedHash) && Array.isArray(snapshot.installedFiles) && snapshot.installedFiles.length > 0
    || !core && digestRecorded(snapshot.contentHash));
}

export function platformAsset(system: string = process.platform, machine: string = process.arch): string {
  const architecture = machine.toLowerCase();
  if (["Darwin", "darwin"].includes(system) && ["arm64", "aarch64", "x86_64", "amd64", "x64"].includes(architecture)) return "macos-runtime-universal.zip";
  if (["Windows", "win32"].includes(system) && ["amd64", "x86_64", "x64"].includes(architecture)) return "win-x64.zip";
  if (["Linux", "linux"].includes(system) && ["amd64", "x86_64", "x64"].includes(architecture)) return "linux-x86_64.tar.gz";
  throw new Error(`尚未支持的系统架构: ${system}/${machine}`);
}

export class OfficialSource implements UpdateSource {
  private readonly abort = new AbortController();
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  close(): void { this.abort.abort(new Error("应用服务正在关闭")); }
  async getJson(url: string): Promise<any> {
    const response = await this.fetcher(url, { headers: { "User-Agent": "maa-verge/0.1" }, signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(30_000)]) });
    if (!response.ok) throw new Error(`更新源 HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 4 * 1024 * 1024) throw new Error("更新元数据超出大小限制");
    if (!response.body) throw new Error("更新源没有返回元数据");
    const chunks: Uint8Array[] = [];
    let count = 0;
    for await (const chunk of response.body) {
      count += chunk.length;
      if (count > 4 * 1024 * 1024) throw new Error("更新元数据超出大小限制");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  async check(channel: string): Promise<UpdateMetadata> {
    if (channel === "core") {
      const release = await this.getJson(`${GITHUB}/MaaAssistantArknights/releases/latest`);
      if (release.prerelease || release.draft) throw new Error("稳定通道返回非稳定版本");
      const suffix = platformAsset();
      const assets = release.assets.filter((asset: any) => typeof asset.name === "string" && asset.name.startsWith("MAA-") && asset.name.endsWith("-" + suffix));
      if (assets.length !== 1) throw new Error("未找到唯一匹配的官方运行时包");
      const asset = assets[0], url = asset.browser_download_url;
      if (typeof url !== "string" || !url.startsWith("https://github.com/MaaAssistantArknights/")) throw new Error("更新包来源不是官方仓库");
      return { version: release.tag_name, url, name: asset.name, size: asset.size, digest: asset.digest ?? undefined, source: "GitHub" };
    }
    if (channel !== "resource") throw new Error("未知更新通道");
    const commit = (await this.getJson(`${GITHUB}/MaaResource/commits/main`)).sha;
    if (typeof commit !== "string" || !/^[0-9a-f]{40}$/.test(commit)) throw new Error("无效的资源提交");
    const version = await this.getJson(`https://raw.githubusercontent.com/MaaAssistantArknights/MaaResource/${commit}/resource/version.json`);
    return { version: commit, commit, resourceVersion: version,
      url: `https://codeload.github.com/MaaAssistantArknights/MaaResource/zip/${commit}`,
      name: `MaaResource-${commit}.zip`, source: "GitHub" };
  }
  async download(metadata: UpdateMetadata, destination: string, progress: (percent: number) => void, options?: ComponentDownload): Promise<string> {
    return downloadArchive(metadata as UpdateMetadata & { url: string }, destination, progress,
      { ...options, signal: this.abort.signal, fetcher: this.fetcher });
  }
}

function executeJson(command: string[], input: unknown, timeout: number, children?: Set<ChildProcess>, newGroup = true, env = childEnvironment()): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      windowsHide: true, detached: newGroup && process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    let stdout = "", stderr = "", count = 0, failure: Error | undefined;
    const timer = setTimeout(() => { failure = new Error("隔离进程超时"); void terminateChild(child); }, timeout);
    const cleanup = () => { clearTimeout(timer); children?.delete(child); };
    child.stdout?.setEncoding("utf8"); child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      count += Buffer.byteLength(chunk);
      if (count > 4 * 1024 * 1024) { failure = new Error("隔离进程输出超出限制"); void terminateChild(child); }
      else stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-1500); });
    child.once("error", (error) => { cleanup(); reject(error); });
    child.once("close", (code) => {
      cleanup();
      if (failure || code !== 0) { reject(failure ?? new Error("原生隔离进程失败: " + stderr)); return; }
      try {
        const lines = stdout.trim().split(/\r?\n/);
        if (lines.length !== 1) throw new Error("隔离进程输出不符合单行协议");
        resolve(JSON.parse(lines[0]));
      } catch (failure) { reject(failure); }
    });
    children?.add(child);
    child.stdin?.on("error", () => {});
    child.stdin?.end(JSON.stringify(input) + "\n");
  });
}
function terminateChild(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!child.pid || child.exitCode !== null) { resolve(); return; }
    if (process.platform === "win32") {
      const systemRoot = process.env.SystemRoot || process.env.WINDIR;
      if (!systemRoot) { child.kill(); resolve(); return; }
      const taskkill = path.join(systemRoot, "System32", "taskkill.exe");
      execFile(taskkill, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 5000 }, () => {
        if (child.exitCode === null) child.kill();
        resolve();
      });
    } else {
      try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
      resolve();
    }
  });
}
export async function validateNative(core: string, resource: string, version: string, executable = nativeWorkerPath(), children?: Set<ChildProcess>, newGroup = true): Promise<void> {
  const result = await executeJson([executable, "--validate"], { core, resource, version, protocolVersion: 1 }, 90_000, children, newGroup, nativeEnvironment(core));
  if (result.protocolVersion !== 1 || result.resourceLoaded !== true || result.version !== version) throw new Error("核心版本或资源隔离校验失败");
}
export async function treeHash(root: string): Promise<string> {
  const digest = createHash("sha256");
  for (const relative of await treeFiles(root)) {
    digest.update(relative);
    for await (const chunk of createReadStream(path.join(root, relative))) digest.update(chunk);
  }
  return digest.digest("hex");
}
async function treeFiles(root: string): Promise<string[]> {
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("更新快照必须是普通目录");
  const result: string[] = [];
  const visit = async (directory: string, prefix: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error("更新快照不允许文件系统链接");
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative + "/");
      else if (entry.isFile()) result.push(relative);
      else throw new Error("更新快照不允许特殊文件");
    }
  };
  await visit(root, "");
  // pathlib compares path components, with normcase on Windows, rather than
  // sorting slash-separated strings. Within components Python compares code points.
  const compare = (left: string, right: string) => {
    const a = Array.from(left), b = Array.from(right);
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      const difference = a[index].codePointAt(0)! - b[index].codePointAt(0)!;
      if (difference) return difference;
    }
    return a.length - b.length;
  };
  return result.sort((left, right) => {
    const a = (process.platform === "win32" ? left.toLowerCase() : left).split("/");
    const b = (process.platform === "win32" ? right.toLowerCase() : right).split("/");
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      const difference = compare(a[index], b[index]);
      if (difference) return difference;
    }
    return a.length - b.length;
  });
}

export async function runUpdateJob(config: UpdateJobConfig, validator: Validator = (core, resource, version) => validateNative(core, resource, version, config.workerPath, undefined, false)): Promise<UpdateJobResult> {
  if (!config || !["core", "resource"].includes(config.channel) || !config.archive || !config.target || !config.version) throw new Error("更新作业配置无效");
  if (config.channel === "core") {
    await extractCoreArchive(config.archive, config.target);
    await normalizeRuntimeRoot(config.target);
    await validator(config.target, config.target, config.version);
    return {};
  }
  if (!config.core || !config.coreVersion) throw new Error("请先安装核心与基础资源");
  const candidate = path.join(config.target, "resource"), overlay = path.join(config.target, "_overlay");
  // Always rebase on the immutable core; never copy the previous resource overlay.
  await cp(path.join(config.core, "resource"), candidate, { recursive: true, errorOnExist: true, force: false });
  try {
    await extractArchive(config.archive, overlay);
    const roots = [];
    for (const entry of await readdir(overlay, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const resource = path.join(overlay, entry.name, "resource");
      try { await readdir(resource); roots.push(resource); } catch { /* not a resource root */ }
    }
    if (roots.length !== 1) throw new Error("资源归档结构不符合预期");
    const ownedFiles = await treeFiles(roots[0]);
    await cp(roots[0], candidate, { recursive: true, force: true });
    await validator(config.core, config.target, config.coreVersion);
    return { ownedFiles, coreVersion: config.coreVersion, contentHash: await treeHash(candidate) };
  } finally { await rm(overlay, { recursive: true, force: true }); }
}
export async function runUpdateJobStdio(): Promise<void> {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (Buffer.byteLength(input) > 64 * 1024) throw new Error("更新作业配置超出限制");
  }
  process.stdout.write(JSON.stringify(await runUpdateJob(JSON.parse(input))) + "\n");
}
function defaultJobCommand(): string[] {
  // Source development uses a dedicated TS entry; compile embeds the main entry.
  return typeof Bun !== "undefined" && Bun.isStandaloneExecutable ? [process.execPath, "--update-job"] :
    [process.execPath, fileURLToPath(new URL("./update-job.ts", import.meta.url))];
}

export class UpdateService {
  private readonly defaults: ComponentPaths;
  private readonly source: UpdateSource;
  private readonly validator: Validator;
  private readonly beforeActivate: Hook;
  private readonly afterActivate: Hook;
  private readonly finishActivate: (error?: string) => Promise<void> | void;
  private readonly jobRunner: (config: UpdateJobConfig) => Promise<UpdateJobResult>;
  private readonly protectedPaths: () => string[];
  private queue: Promise<unknown> = Promise.resolve();
  private readonly children = new Set<ChildProcess>();
  private closing = false;
  constructor(readonly root: string, private readonly store: UpdateStore,
    private readonly emit: (kind: string, text: string, data: any) => void,
    private readonly busy: () => boolean, options: UpdateOptions = {}) {
    this.defaults = options.directories ?? { core: root, resource: root };
    this.source = options.source ?? new OfficialSource();
    this.validator = options.validator ?? ((core, resource, version) => {
      if (this.closing) throw new Error("更新服务正在关闭");
      return validateNative(core, resource, version, nativeWorkerPath(), this.children);
    });
    this.beforeActivate = options.beforeActivate ?? (() => {}); this.afterActivate = options.afterActivate ?? (() => {});
    this.finishActivate = options.finishActivate ?? (() => {});
    this.protectedPaths = options.protectedPaths ?? (() => []);
    this.jobRunner = options.jobRunner ?? ((config) => {
      if (this.closing) throw new Error("更新服务正在关闭");
      return executeJson(options.jobCommand ?? defaultJobCommand(), config, 180_000, this.children);
    });
    if (!store.get("update", "core")) {
      const versions = { app: "0.1.0", core: "未安装", resource: "未安装" };
      for (const [channel, version] of Object.entries(versions)) this.save({ id: channel, currentVersion: version, status: "idle", progress: 0, message: "尚未检查" });
    }
    for (const state of this.channels()) if (["checking", "downloading"].includes(state.status)) this.save({ ...state, status: "failed", message: "上次更新准备被中断，可重试继续下载", progress: 0 });
    this.rememberRoots();
    this.reconcileInstalled(true);
    this.queue = this.pruneVersions();
  }
  private snapshots(): any[] {
    return ['active', 'previous'].flatMap(kind => Object.values(this.store.get(kind, 'combo', {})))
      .concat(['core', 'resource'].map(channel => this.store.get('staged', channel))).filter(Boolean);
  }
  private rememberRoots(): string[] {
    const roots = new Set<string>([this.root, ...Object.values(this.defaults), ...Object.values(this.directories()),
      ...this.store.get('meta', 'component_roots', [])]);
    for (const snapshot of this.snapshots()) {
      if (typeof snapshot.path === 'string' && path.basename(path.dirname(snapshot.path)) === 'generations') roots.add(path.dirname(path.dirname(snapshot.path)));
    }
    const values = [...roots].filter(root => typeof root === 'string' && path.isAbsolute(root));
    this.store.put('meta', 'component_roots', values); return values;
  }
  private async pruneVersions(): Promise<void> {
    if (this.closing || this.busy()) return;
    const roots = this.rememberRoots();
    await pruneGenerations(roots, [...this.snapshots().map(snapshot => snapshot.path), ...this.protectedPaths()]);
    for (const root of roots) await rmdir(path.join(root, 'downloads')).catch(() => {});
  }
  private async reconcileCurrent(): Promise<void> {
    // Inventory checks yield to execution polling. Only initial startup scans
    // synchronously, before any workers or RPC requests can run.
    const missing = new Set<string>();
    const seen = new Set<string>();
    for (const snapshot of this.snapshots()) {
      if (seen.has(snapshot.path)) continue;
      seen.add(snapshot.path);
      try {
        if (snapshot.installedHash !== undefined) {
          if (!hasIntegrity(snapshot, true) || (await snapshotIntegrity(snapshot.path, snapshot.installedFiles)).installedHash !== snapshot.installedHash) missing.add(snapshot.path);
          continue;
        }
        // v0.1.0 resource generations already recorded the complete resource
        // digest. Its archive checksum cannot verify the expanded core files.
        if (snapshot.contentHash !== undefined && (!digestRecorded(snapshot.contentHash)
          || await treeHash(path.join(snapshot.path, 'resource')) !== snapshot.contentHash)) missing.add(snapshot.path);
      } catch { missing.add(snapshot.path); continue; }
      if (snapshot.installedFiles === undefined) continue;
      if (!Array.isArray(snapshot.installedFiles)) { missing.add(snapshot.path); continue; }
      for (let offset = 0; offset < snapshot.installedFiles.length; offset += 64) {
        const present = await Promise.all(snapshot.installedFiles.slice(offset, offset + 64).map(async (relative: unknown) => {
          if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === '..')) return false;
          try { const info = await lstat(path.join(snapshot.path, relative)); return info.isFile() && !info.isSymbolicLink(); } catch { return false; }
        }));
        if (present.some(value => !value)) { missing.add(snapshot.path); break; }
      }
    }
    this.reconcileInstalled(false, missing);
  }
  private reconcileInstalled(full = false, missing = new Set<string>()): void {
    const installed = (snapshot: any, core: boolean) => !missing.has(snapshot?.path) && installedSnapshot(snapshot, core, full);
    const active = this.store.get('active', 'combo', {});
    let combo = active;
    if (active.core && !installed(active.core, true)) {
      combo = {}; this.store.delete('active', 'combo');
    } else if (active.core && !installed(active.resource, false)) {
      combo = { core: active.core, resource: active.core }; this.store.put('active', 'combo', combo);
    } else if (!active.core && active.resource) {
      combo = {}; this.store.delete('active', 'combo');
    }
    const previous = this.store.get('previous', 'combo');
    if (previous && (!installed(previous.core, true) || !installed(previous.resource, false))) this.store.delete('previous', 'combo');
    for (const channel of ['core', 'resource'] as const) {
      const staged = this.store.get('staged', channel);
      const valid = staged && installed(staged, channel === 'core') &&
        (channel === 'core' || (combo.core && staged.coreVersion === combo.core.version));
      if (staged && !valid) this.store.delete('staged', channel);
      const current = this.store.get('update', channel);
      if (!current) continue;
      const version = channel === 'core' ? combo.core?.version ?? '未安装' : resourceVersion(combo);
      const lost = current.currentVersion !== version;
      const lostCandidate = ['staged', 'waiting_idle'].includes(current.status) && !valid;
      if (lost || lostCandidate) this.save({ ...current, currentVersion: version,
        status: valid ? (current.status === 'waiting_idle' ? 'waiting_idle' : 'staged') : current.latestVersion && current.latestVersion !== version ? 'available' : 'idle',
        progress: valid ? 100 : 0,
        message: valid ? '快照已校验，等待在空闲边界生效' : version === '未安装' ? '组件文件缺失或损坏，请重新下载安装' : lost ? '已恢复核心附带的基础资源，请检查资源更新' : '候选快照文件缺失或损坏，请重新准备更新',
      });
    }
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error("更新服务正在关闭"));
    const result = this.queue.then(() => {
      if (this.closing) throw new Error("更新服务正在关闭");
      return action();
    });
    this.queue = result.catch(() => {});
    return result;
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
    const configured = this.store.get("settings", "main", {}).componentPaths;
    return { core: configured?.core || this.defaults.core, resource: configured?.resource || this.defaults.resource };
  }
  resolveDirectories(configured?: ComponentPaths): ComponentPaths {
    return { core: normalizeComponentPath(configured?.core || this.defaults.core), resource: normalizeComponentPath(configured?.resource || this.defaults.resource) };
  }
  saveDirectories(configured: ComponentPaths, persist: (paths: ComponentPaths) => void): Promise<void> {
    const next = this.resolveDirectories(configured), current = this.directories();
    // Ordinary settings changes must not wait for an unrelated long download/job.
    if (next.core === current.core && next.resource === current.resource) { persist(next); return Promise.resolve(); }
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
          try { await file.writeFile(''); await file.sync(); } finally { await file.close(); }
        } catch (error) { throw new RpcError(-32602, `${channel === 'core' ? 'MaaCore' : '游戏资源'}目录无法写入，请选择可写的绝对路径`, message(error)); }
        finally { if (created && probe) await rm(probe, { force: true }).catch(() => {}); }
      }
      persist(next);
      this.rememberRoots();
      await this.pruneVersions();
    });
  }
  private decorate(value: any): any {
    return { latestVersion: null, ...value,
      ...(value.id !== 'app' ? { installDirectory: this.directories()[value.id as 'core' | 'resource'] } : {}),
      ...(value.id === 'resource' ? { resourceActivities: resourceActivityVersions(this.store.get('active', 'combo', {}).resource?.path) } : {}),
    };
  }
  channels(): any[] { return this.store.all("update").map((value) => this.decorate(value)); }
  channel(channel: string): any {
    if (!["app", "core", "resource"].includes(channel)) throw new RpcError(-32602, "未知更新通道");
    return this.decorate(this.store.get("update", channel));
  }
  private save(value: any): any {
    const { installDirectory: _directory, resourceActivities: _activities, ...state } = value;
    value = { latestVersion: null, ...state }; this.store.put("update", value.id, value); return this.decorate(value);
  }
  private change(channel: string, changes: any): any {
    const value = this.save({ ...this.channel(channel), ...changes });
    this.emit("update.changed", value.message, { channel, update: value }); return value;
  }
  private needsRepair(channel: string): boolean {
    const combo = this.store.get('active', 'combo', {}), snapshot = combo[channel];
    return !!snapshot && !hasIntegrity(snapshot, channel === 'core' || snapshot.path === combo.core?.path);
  }
  check(channel: string): Promise<any> { return this.serial(() => this.checkCurrent(channel)); }
  private async checkCurrent(channel: string): Promise<any> {
    await this.reconcileCurrent();
    await this.pruneVersions();
    const current = this.channel(channel);
    if (["downloading", "staged", "waiting_idle"].includes(current.status)) return current;
    if (channel === "app") return this.change(channel, { status: "idle", message: "开发预览版尚未配置应用发行更新源" });
    this.change(channel, { status: "checking", message: "正在检查官方版本", progress: 0 });
    try {
      const metadata = await this.source.check(channel);
      this.store.put("update_metadata", channel, metadata);
      const repair = this.needsRepair(channel);
      const available = metadata.version !== current.currentVersion || repair;
      if (channel === "core" && available) {
        const parse = (value: string) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);
        const installed = parse(current.currentVersion), latest = parse(metadata.version);
        if (installed && latest) {
          for (let index = 0; index < 3; index++) {
            if (latest[index] < installed[index]) throw new Error("官方稳定版本低于已安装版本，拒绝自动降级");
            if (latest[index] > installed[index]) break;
          }
        }
      }
      return this.change(channel, { latestVersion: metadata.version, status: available ? "available" : "idle", message: repair && metadata.version === current.currentVersion
        ? "旧版组件缺少完整性记录，可重新下载安装修复" : available ? "发现可用更新" : "当前已是最新版本" });
    } catch (error) { this.change(channel, { status: "failed", message: message(error) }); throw new RpcError(-32020, "检查更新失败", message(error)); }
  }
  prepare(channel: string): Promise<any> { return this.serial(() => this.prepareCurrent(channel)); }
  private async prepareCurrent(channel: string): Promise<any> {
    await this.reconcileCurrent();
    let current = this.channel(channel);
    if (channel === "app") throw new RpcError(-32020, "应用更新需使用桌面发行通道");
    if (["staged", "waiting_idle", "downloading"].includes(current.status)) return current;
    let metadata: UpdateMetadata = this.store.get("update_metadata", channel);
    if (!metadata) { await this.checkCurrent(channel); metadata = this.store.get("update_metadata", channel); current = this.channel(channel); }
    if (metadata.version === current.currentVersion && !this.needsRepair(channel)) return current;
    const directory = this.directories()[channel as 'core' | 'resource'];
    const generation = path.join(directory, "generations", `${channel}-${randomUUID().replaceAll("-", "")}`);
    this.change(channel, { status: "downloading", progress: 0, message: "正在准备独立更新快照" });
    try {
      await mkdir(generation, { recursive: true });
      let digest: string;
      if (typeof metadata.name !== "string" || path.basename(metadata.name) !== metadata.name || metadata.name.includes("\\")) throw new Error("更新包文件名无效");
      // Stable per data root and immutable source, so interrupted downloads can
      // resume without two independent data roots sharing a writable cache.
      const scope = path.resolve(this.root);
      const identity = createHash('sha256').update(JSON.stringify([scope, channel, metadata.url, metadata.version, metadata.name, metadata.size, metadata.digest])).digest('hex');
      const archive = path.join(directory, ".download-" + identity + "-" + metadata.name);
      const downloadOptions: ComponentDownload = this.store.get('settings', 'main', {}).componentDownload ?? { engine: 'aria2', aria2Path: '' };
      let lastProgress = -1, lastReport = 0;
      try {
        digest = await this.source.download(metadata, archive, (value) => {
          const progress = Math.max(0, Math.min(90, Math.trunc(value)));
          if (!Number.isFinite(progress) || progress === lastProgress || (progress < 90 && Date.now() - lastReport < 250)) return;
          lastProgress = progress; lastReport = Date.now();
          this.change(channel, { progress, message: "正在下载官方组件" });
        }, downloadOptions);
        this.change(channel, { progress: 90, message: "正在解压并校验组件" });
        // Recheck the resource base after downloading, before copying it.
        if (channel === 'resource') await this.reconcileCurrent();
        const core = this.store.get("active", "combo", {}).core;
        if (channel === 'resource' && !core) throw new Error('核心或基础资源文件缺失或损坏，请先重新下载安装并启用核心');
        const config: UpdateJobConfig = { channel: channel as "core" | "resource", archive, target: generation, version: metadata.version, core: core?.path, coreVersion: core?.version };
        Object.assign(metadata, await this.jobRunner(config));
      } finally { await rm(archive, { force: true }); }
      const manifest = { ...metadata, ...await snapshotIntegrity(generation), path: generation, sha256: digest, validatedAt: new Date().toISOString() };
      await writeFile(path.join(generation, "manifest.json"), JSON.stringify(manifest));
      this.store.put("staged", channel, manifest);
      await this.pruneVersions();
      return this.change(channel, { status: "staged", progress: 100, message: "快照已校验，等待在空闲边界生效" });
    } catch (error) {
      await rm(generation, { recursive: true, force: true }).catch(() => {});
      await this.reconcileCurrent();
      await this.pruneVersions();
      this.change(channel, { status: "failed", progress: 0, message: message(error) });
      const combo = this.store.get('active', 'combo', {});
      throw new RpcError(-32020, combo.core && combo.resource ? "准备更新失败，活动版本保持可用" : "准备更新失败，请先修复核心与基础资源", message(error));
    }
  }
  activate(channel: string): Promise<any> { return this.serial(() => this.activateCurrent(channel)); }
  private async activateCurrent(channel: string): Promise<any> {
    await this.reconcileCurrent();
    this.channel(channel);
    const staged = this.store.get("staged", channel);
    if (!staged) throw new RpcError(-32020, "没有已经校验的候选快照");
    if (this.busy()) return this.change(channel, { status: "waiting_idle", message: "等待当前任务结束后热切换" });
    const combo = this.store.get("active", "combo", {}), next = { ...combo };
    if (channel === "core") { next.core = staged; next.resource = staged; }
    else {
      if (staged.coreVersion !== combo.core?.version) throw new RpcError(-32020, "核心已变化，请重新准备资源快照");
      next.resource = staged;
    }
    try {
      await this.validator(next.core.path, next.resource.path, next.core.version);
      await this.switchCombo(next, combo);
      // Repair may have removed the broken active pointer. Keep the last good
      // rollback instead of replacing it with an empty or unverified combo.
      if (combo.core && combo.resource && (hasIntegrity(combo.core, true) && hasIntegrity(combo.resource, combo.resource.path === combo.core.path)
        || !this.store.get('previous', 'combo'))) this.store.put("previous", "combo", combo);
      this.store.delete("staged", channel);
      if (channel === "core") {
        this.store.delete("staged", "resource");
        this.change("resource", { currentVersion: "bundled@" + staged.version, status: "active", message: "使用新核心附带的已验证基础资源" });
      }
      const result = this.change(channel, { currentVersion: staged.version, status: "active", progress: 100, message: "新快照已生效，桌面无需重启" });
      await this.finishActivate(); await this.pruneVersions(); return result;
    } catch (error) { this.change(channel, { status: "failed", message: "切换校验失败，保留原版本: " + message(error) }); throw new RpcError(-32020, "更新切换失败，已保留原版本", message(error)); }
  }
  private async switchCombo(candidate: any, original: any): Promise<void> {
    try { await this.beforeActivate(); } catch (error) { await this.finishActivate(message(error)); throw error; }
    this.store.put("active", "combo", candidate);
    try { await this.afterActivate(); }
    catch (error) {
      try { await this.beforeActivate(); this.store.put("active", "combo", original); await this.afterActivate(); }
      catch (restoreError) {
        this.store.put("active", "combo", original);
        const failure = `候选版本重连失败: ${message(error)}；原版本重连也失败: ${message(restoreError)}`;
        await this.finishActivate(failure); throw new Error(failure);
      }
      await this.finishActivate(); throw new Error(`候选版本重连失败，已恢复原版本: ${message(error)}`);
    }
  }
  async activatePending(): Promise<void> {
    for (const channel of this.channels()) if (channel.status === "waiting_idle" && !this.busy()) {
      try { await this.activate(channel.id); } catch (error) { if (!(error instanceof RpcError)) throw error; }
    }
  }
  rollback(channel: string): Promise<any> { return this.serial(() => this.rollbackCurrent(channel)); }
  private async rollbackCurrent(channel: string): Promise<any> {
    await this.reconcileCurrent();
    this.channel(channel);
    if (this.busy()) throw new RpcError(-32021, "请等待任务结束后回滚");
    const previous = this.store.get("previous", "combo");
    if (!previous || !previous[channel]) throw new RpcError(-32020, "没有可回滚的已验证版本");
    const active = this.store.get("active", "combo", {});
    try {
      await this.validator(previous.core.path, previous.resource.path, previous.core.version);
      await this.switchCombo(previous, active);
    } catch (error) { this.change(channel, { status: "failed", message: "回滚初始化失败，已恢复活动版本" }); throw new RpcError(-32020, "回滚初始化失败，已恢复活动版本", message(error)); }
    this.store.put("previous", "combo", active);
    for (const key of ["core", "resource"]) if (previous[key]) this.change(key, { currentVersion: key === 'resource' ? resourceVersion(previous) : previous[key].version, status: "active", message: "已恢复上一组验证通过的核心与资源", progress: 100 });
    await this.finishActivate(); await this.pruneVersions(); return this.channel(channel);
  }
}
