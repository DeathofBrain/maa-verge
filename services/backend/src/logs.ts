import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  readSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir, release } from 'node:os';
import path from 'node:path';
import { version } from '../../../package.json';

const MiB = 1024 * 1024;
const runtimeName = /^runtime-\d{4}-\d{2}-\d{2}-[a-f0-9]{8}-[0-7]\.log$/;
const exportName = /^maa-verge-diagnostics-[\dTZ-]+-[a-f0-9-]{36}\.log$/;
const nativeName = /^[\w.-]+\.log(?:\.\d+|\.bak)?$/i;
const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));
const key = (filename: string) =>
  process.platform === 'win32' ? path.resolve(filename).toLowerCase() : path.resolve(filename);
function plain(filename: string) {
  return key(realpathSync(filename)) === key(filename) && !lstatSync(filename).isSymbolicLink();
}

export function logExportDirectory(
  root: string,
  applicationDirectory?: string,
  platform = process.platform,
  home = homedir(),
  env = process.env,
): string {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (env.MAAVERGE_LOG_DIR) return paths.resolve(env.MAAVERGE_LOG_DIR);
  // Development checkouts and synthetic tests must keep their logs isolated.
  if (!applicationDirectory) return paths.resolve(root, 'log');
  if (platform === 'win32') return paths.resolve(applicationDirectory, 'log');
  if (platform === 'darwin') return paths.join(home, 'Library', 'Logs', 'Maa Verge');
  const state =
    env.XDG_STATE_HOME && paths.isAbsolute(env.XDG_STATE_HOME)
      ? env.XDG_STATE_HOME
      : paths.join(home, '.local', 'state');
  return paths.join(state, 'maa-verge', 'log');
}

/** Sanitize text as well as JSON: native logs are not structured by this service. */
export function redactLog(text: string): string {
  return text
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(
      /(authorization["']?\s*[:=]\s*["']?)(?:bearer\s+|basic\s+)?[^\r\n",}]+/gi,
      '$1[redacted]',
    )
    .replace(
      /(["']?(?:cdk|api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|cookie|set-cookie)["']?\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s&,;}]+)/gi,
      (_match, prefix: string, value: string) =>
        prefix +
        (value.startsWith('"')
          ? '"[redacted]"'
          : value.startsWith("'")
            ? "'[redacted]'"
            : '[redacted]'),
    )
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[redacted]');
}
function diagnosticJson(value: unknown, space?: number) {
  return JSON.stringify(
    value,
    (key, value: unknown) =>
      /^(?:authorization|cdk|api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|cookie|set-cookie)$/i.test(
        key,
      )
        ? '[redacted]'
        : typeof value === 'string'
          ? redactLog(value)
          : value,
    space,
  );
}

export class Diagnostics {
  private session = randomUUID().slice(0, 8);
  private day = '';
  private part = 0;
  currentFile = '';
  failure?: string;
  write(level: string, message: string, data?: unknown) {
    try {
      const at = new Date().toISOString(),
        day = at.slice(0, 10);
      if (day !== this.day) {
        this.day = day;
        this.part = 0;
      }
      let line = diagnosticJson({ at, level, message, ...(data === undefined ? {} : { data }) });
      if (Buffer.byteLength(line) > 16_384)
        line = JSON.stringify({ at, level, truncated: true, text: line.slice(0, 4000) });
      line += '\n';
      mkdirSync(this.directory, { recursive: true });
      if (!plain(this.directory)) throw new Error('服务日志目录不能经过符号链接');
      this.currentFile = path.join(
        this.directory,
        `runtime-${day}-${this.session}-${this.part}.log`,
      );
      if (
        existsSync(this.currentFile) &&
        statSync(this.currentFile).size + Buffer.byteLength(line) > 2 * MiB
      ) {
        if (this.part === 7) {
          this.failure = '当前服务日志已达到每日 16 MiB 上限，后续诊断暂未记录';
          return;
        }
        this.currentFile = path.join(
          this.directory,
          `runtime-${day}-${this.session}-${++this.part}.log`,
        );
      }
      if (
        existsSync(this.currentFile) &&
        (!plain(this.currentFile) || !lstatSync(this.currentFile).isFile())
      )
        throw new Error('服务日志不是普通文件');
      const descriptor = openSync(
        this.currentFile,
        constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      try {
        writeFileSync(descriptor, line);
      } finally {
        closeSync(descriptor);
      }
    } catch (error) {
      this.failure = `服务日志写入失败：${describe(error)}`;
    }
  }
  constructor(readonly directory: string) {}
}

type LogFile = {
  path: string;
  label: string;
  size: number;
  modified: number;
  device: number;
  inode: number;
  worker?: string;
};
type CleanupResult = {
  removedFiles: number;
  removedBytes: number;
  skippedFiles: number;
  warnings: string[];
};
export interface LogOptions {
  applicationDirectory?: string;
  exportDirectory?: string;
  activeWorkers: () => Set<string>;
  summary: () => unknown;
  events: () => unknown[];
}

export class Logs {
  readonly diagnostics: Diagnostics;
  readonly directory: string;
  private nextCleanup = 0;
  constructor(
    readonly root: string,
    private options: LogOptions,
  ) {
    this.diagnostics = new Diagnostics(path.join(root, 'logs'));
    this.directory =
      options.exportDirectory ?? logExportDirectory(root, options.applicationDirectory);
  }
  private files(warnings: string[], exports = false): LogFile[] {
    const files: LogFile[] = [];
    let visited = 0,
      exhausted = false;
    const scan = (
      directory: string,
      kind: 'runtime' | 'worker' | 'export',
      depth = 0,
      worker?: string,
    ) => {
      try {
        if (!plain(directory) || !lstatSync(directory).isDirectory()) {
          warnings.push(`跳过链接日志目录 ${directory}`);
          return;
        }
        const entries = opendirSync(directory);
        try {
          for (let entry; (entry = entries.readSync());) {
            if (++visited > 4096) {
              exhausted = true;
              break;
            }
            if (entry.isSymbolicLink()) continue;
            const filename = path.join(directory, entry.name);
            if (entry.isDirectory() && kind === 'worker' && depth < 3)
              scan(filename, kind, depth + 1, worker ?? entry.name);
            else if (
              entry.isFile() &&
              (kind === 'runtime' ? runtimeName : kind === 'export' ? exportName : nativeName).test(
                entry.name,
              )
            ) {
              const stat = lstatSync(filename);
              if (stat.isFile() && !stat.isSymbolicLink())
                files.push({
                  path: filename,
                  label:
                    kind === 'export'
                      ? entry.name
                      : path.relative(this.root, filename).split(path.sep).join('/'),
                  size: stat.size,
                  modified: stat.mtimeMs,
                  device: stat.dev,
                  inode: stat.ino,
                  worker,
                });
            }
            if (exhausted) break;
          }
        } finally {
          entries.closeSync();
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          warnings.push(`无法读取日志目录 ${directory}：${describe(error)}`);
      }
    };
    scan(this.diagnostics.directory, 'runtime');
    scan(path.join(this.root, 'workers'), 'worker');
    if (exports) scan(this.directory, 'export');
    if (exhausted) warnings.push('日志目录条目超过 4096 项，部分文件未处理');
    return files.sort((a, b) => b.modified - a.modified || a.label.localeCompare(b.label));
  }
  export() {
    const warnings: string[] = [],
      sections: string[] = [];
    const metadata = {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      application: { name: 'Maa Verge', version },
      environment: {
        platform: process.platform,
        arch: process.arch,
        osRelease: release(),
        bun: typeof Bun === 'undefined' ? null : Bun.version,
        node: process.version,
      },
      summary: this.options.summary(),
      limits: { files: 64, bytesPerFile: 512 * 1024, totalBytes: 8 * MiB },
      note: '只含诊断文本；日志为运行中只读快照，截断或缺失见 warnings。凭据按常见格式脱敏，分享前请检查原生日志内容。',
    };
    const metadataText = diagnosticJson(metadata, 2);
    if (metadataText.length > MiB) warnings.push('环境与近期状态超过上限，已截断');
    sections.push('=== environment and recent state ===\n' + metadataText.slice(0, MiB));
    const eventText = this.options
      .events()
      .map((event) => {
        const text = diagnosticJson(event);
        if (text.length > 16_384) warnings.push('单条事件超过上限，已截断');
        return text.slice(0, 16_384);
      })
      .join('\n');
    if (eventText.length > MiB) warnings.push('近期事件超过上限，仅包含末尾记录');
    sections.push('=== recent events ===\n' + eventText.slice(-MiB));
    let remaining = 6 * MiB,
      count = 0;
    for (const file of this.files(warnings)) {
      if (++count > 64 || remaining <= 0) {
        warnings.push('达到导出体积或文件数量上限，剩余日志已省略');
        break;
      }
      let descriptor: number | undefined;
      try {
        if (!plain(file.path)) continue;
        descriptor = openSync(file.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const stat = fstatSync(descriptor);
        if (
          !stat.isFile() ||
          stat.dev !== file.device ||
          stat.ino !== file.inode ||
          !plain(file.path)
        ) {
          warnings.push(`${file.label} 在读取前已变化，跳过`);
          continue;
        }
        const size = Math.min(stat.size, 512 * 1024, remaining),
          bytes = Buffer.alloc(size);
        const read = readSync(descriptor, bytes, 0, size, stat.size - size);
        let content = bytes.subarray(0, read).toString('utf8');
        if (stat.size > size) {
          const newline = content.indexOf('\n');
          content = newline < 0 ? '[oversized line omitted]' : content.slice(newline + 1);
          warnings.push(`${file.label} 仅包含末尾 ${size} 字节`);
        }
        sections.push(
          `=== ${file.label} (${stat.size} bytes, modified ${new Date(stat.mtimeMs).toISOString()}) ===\n${redactLog(content)}`,
        );
        remaining -= read;
      } catch (error) {
        warnings.push(`${file.label} 读取失败：${describe(error)}`);
      } finally {
        if (descriptor !== undefined) closeSync(descriptor);
      }
    }
    if (this.diagnostics.failure) warnings.push(this.diagnostics.failure);
    let body = sections.join('\n\n');
    if (Buffer.byteLength(body) > 7 * MiB) {
      body = Buffer.from(body)
        .subarray(0, 7 * MiB)
        .toString('utf8');
      warnings.push('脱敏后的导出达到体积上限，已截断');
    }
    const content =
      body +
      '\n\n=== warnings ===\n' +
      (warnings.length
        ? warnings
            .slice(0, 100)
            .map((warning) => redactLog(warning).slice(0, 1000))
            .join('\n')
        : 'none') +
      '\n';
    mkdirSync(this.directory, { recursive: true });
    if (!plain(this.directory)) throw new Error('日志导出目录不能经过符号链接');
    const filename = path.join(
      this.directory,
      `maa-verge-diagnostics-${new Date()
        .toISOString()
        .replaceAll(':', '-')
        .replace(/\.\d{3}/, '')}-${randomUUID()}.log`,
    );
    let descriptor: number | undefined;
    try {
      descriptor = openSync(filename, 'wx', 0o600);
      writeFileSync(descriptor, content);
      fsyncSync(descriptor);
    } catch (error) {
      if (descriptor !== undefined) {
        closeSync(descriptor);
        descriptor = undefined;
        unlinkSync(filename);
      }
      throw error;
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
    return {
      directory: this.directory,
      path: filename,
      bytes: Buffer.byteLength(content),
      warnings,
    };
  }
  clean(retentionDays = 0, at = Date.now()): CleanupResult {
    const result: CleanupResult = {
      removedFiles: 0,
      removedBytes: 0,
      skippedFiles: 0,
      warnings: [],
    };
    const active = this.options.activeWorkers();
    for (const file of this.files(result.warnings, true)) {
      if (file.path === this.diagnostics.currentFile || (file.worker && active.has(file.worker))) {
        result.skippedFiles++;
        continue;
      }
      if (retentionDays && file.modified >= at - retentionDays * 86_400_000) continue;
      try {
        const stat = lstatSync(file.path);
        if (
          !plain(file.path) ||
          !stat.isFile() ||
          stat.dev !== file.device ||
          stat.ino !== file.inode ||
          stat.mtimeMs !== file.modified
        ) {
          result.skippedFiles++;
          continue;
        }
        unlinkSync(file.path);
        result.removedFiles++;
        result.removedBytes += stat.size;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          result.warnings.push(`${file.label} 清理失败：${describe(error)}`);
      }
    }
    return result;
  }
  automatic(retentionDays: number, at = Date.now()) {
    if (at < this.nextCleanup) return;
    this.nextCleanup = at + 86_400_000;
    if (!retentionDays) return;
    const result = this.clean(retentionDays, at);
    if (result.removedFiles || result.warnings.length)
      this.diagnostics.write('info', 'logs.cleanup', result);
    return result;
  }
  get maintenanceDue() {
    return Date.now() >= this.nextCleanup;
  }
  resetCleanup() {
    this.nextCleanup = 0;
  }
}
