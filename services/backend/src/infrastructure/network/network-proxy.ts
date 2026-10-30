/** Bridge desktop HTTP proxy settings to Bun without guessing local proxy ports. */
import { execFile } from 'node:child_process';
import { isIP } from 'node:net';
import path from 'node:path';
import { childEnvironment } from '../config';

type SystemPlatform = 'win32' | 'darwin';
type Environment = Record<string, string | undefined>;
export interface DownloadProxyResolverOptions {
  platform?: NodeJS.Platform;
  environment?: Environment | (() => Environment);
  readSystemProxy?: (platform: SystemPlatform, signal?: AbortSignal) => Promise<string>;
}

export class ProxyConfigurationError extends Error {}

const unsupported = () =>
  new ProxyConfigurationError(
    '下载代理仅支持 HTTP/HTTPS，请使用 HTTP CONNECT 或 mixed HTTP 端口后重试',
  );
const invalid = () =>
  new ProxyConfigurationError('系统下载代理设置无效，请检查代理地址和端口后重试');
const automatic = () =>
  new ProxyConfigurationError(
    '暂不支持系统 PAC/WPAD 自动代理，请改用 HTTP 系统代理、代理环境变量或 VPN/TUN',
  );

// All registry names and commands are fixed. No configured proxy value becomes code.
const windowsQuery = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$settings = Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -ErrorAction Stop
$connections = Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Connections' -ErrorAction SilentlyContinue
$flags = $null
if ($connections.DefaultConnectionSettings -and $connections.DefaultConnectionSettings.Length -gt 8) { $flags = [int]$connections.DefaultConnectionSettings[8] }
$pac = if ($null -ne $flags) { [bool]($flags -band 4) } else { [bool]$settings.AutoConfigURL }
$detect = if ($null -ne $flags) { [bool]($flags -band 8) } else { [bool]$settings.AutoDetect }
@{ ProxyEnable = [int]$settings.ProxyEnable; ProxyServer = [string]$settings.ProxyServer; ProxyOverride = [string]$settings.ProxyOverride; AutoConfigURL = [string]$settings.AutoConfigURL; AutoConfigEnabled = $pac; AutoDetect = $detect } | ConvertTo-Json -Compress
`;

function readSystemProxy(
  platform: SystemPlatform,
  environment: Environment,
  signal?: AbortSignal,
): Promise<string> {
  let executable: string;
  let args: string[];
  if (platform === 'win32') {
    const systemRoot = Object.entries(environment).find(
      ([name]) => name.toLowerCase() === 'systemroot',
    )?.[1];
    if (!systemRoot || !/^[a-z]:[\\/]/i.test(systemRoot) || /[\0\r\n]/.test(systemRoot))
      throw new ProxyConfigurationError('无法定位系统代理读取程序，请检查 Windows 系统环境');
    executable = path.win32.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', windowsQuery];
  } else {
    executable = '/usr/sbin/scutil';
    args = ['--proxy'];
  }
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        timeout: 3_000,
        maxBuffer: 64 * 1024,
        killSignal: 'SIGKILL',
        env: childEnvironment(environment),
        signal,
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

function environmentValue(environment: Environment, name: string): string | undefined {
  // Matches pinned Bun: a nonempty lowercase value precedes its uppercase form.
  return environment[name]?.trim() || environment[name.toUpperCase()]?.trim() || undefined;
}

function proxyUrl(value: string, requirePort: boolean): string {
  if (!value || value.length > 4096 || /[\x00-\x20\x7f?#]/.test(value)) throw invalid();
  const address = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : 'http://' + value;
  let proxy: URL;
  try {
    proxy = new URL(address);
  } catch {
    throw invalid();
  }
  if (!['http:', 'https:'].includes(proxy.protocol)) throw unsupported();
  if (!proxy.hostname || proxy.pathname !== '/' || proxy.search || proxy.hash) throw invalid();
  // URL.port normalizes explicit :80/:443 away, so inspect the authority instead.
  const authority = address
    .slice(address.indexOf('://') + 3)
    .split('/')[0]
    .split('@')
    .at(-1)!;
  const port = authority.match(/:(\d+)$/)?.[1];
  if ((requirePort && !port) || (port && (Number(port) === 0 || Number(port) > 65535)))
    throw invalid();
  return proxy.href;
}

/** Like MAA's HTTP proxy field, a bare host:port defaults to http://. */
export function normalizeManualProxy(value: string): string {
  try {
    return proxyUrl(value.trim(), false);
  } catch {
    throw new ProxyConfigurationError(
      '手动下载代理地址无效，请填写 HTTP/HTTPS 代理地址及合法端口，不要包含路径、查询或片段',
    );
  }
}

function flag(value: unknown): boolean {
  if (value === undefined || value === null || value === false || value === 0) return false;
  if (value === true || value === 1) return true;
  throw invalid();
}

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > 16_384 || /[\0\r\n]/.test(value)) throw invalid();
  return value.trim();
}

function ipv4(value: string): number | undefined {
  const parts = value.split('.');
  if (parts.length > 4 || !parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255))
    return undefined;
  return parts.reduce((sum, part, index) => sum + Number(part) * 2 ** (24 - index * 8), 0);
}

function glob(hostname: string, pattern: string): boolean {
  let hostIndex = 0,
    patternIndex = 0,
    star = -1,
    retry = 0;
  while (hostIndex < hostname.length) {
    if (pattern[patternIndex] === '?' || pattern[patternIndex] === hostname[hostIndex]) {
      hostIndex++;
      patternIndex++;
    } else if (pattern[patternIndex] === '*') {
      star = patternIndex++;
      retry = hostIndex;
    } else if (star >= 0) {
      patternIndex = star + 1;
      hostIndex = ++retry;
    } else return false;
  }
  while (pattern[patternIndex] === '*') patternIndex++;
  return patternIndex === pattern.length;
}

function bypass(url: URL, patterns: string[], simple = false): boolean {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (simple && !hostname.includes('.') && !isIP(hostname)) return true;
  if (patterns.length > 256) throw invalid();
  return patterns.some((raw) => {
    let pattern = raw.trim().toLowerCase();
    if (pattern === '<local>') return !hostname.includes('.') && !isIP(hostname);
    if (pattern === '*') return true;
    const protocol = /^(https?):\/\//.exec(pattern);
    if (protocol) {
      if (protocol[1] + ':' !== url.protocol) return false;
      pattern = pattern.slice(protocol[0].length);
    }
    const cidr = /^(\d+(?:\.\d+){0,3})\/(\d{1,2})$/.exec(pattern);
    if (cidr) {
      const address = ipv4(hostname),
        network = ipv4(cidr[1]),
        bits = Number(cidr[2]);
      return (
        address !== undefined &&
        network !== undefined &&
        bits <= 32 &&
        Math.floor(address / 2 ** (32 - bits)) === Math.floor(network / 2 ** (32 - bits))
      );
    }
    const withPort = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(pattern);
    if (withPort) {
      if (withPort[2] !== port) return false;
      pattern = withPort[1];
    }
    pattern = pattern.replace(/^\[|\]$/g, '');
    if (pattern.length > 2048) throw invalid();
    return glob(hostname, pattern);
  });
}

function windowsProxy(output: string, url: URL): string | undefined {
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(output.replace(/^\uFEFF/, ''));
  } catch {
    throw invalid();
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw invalid();
  if (!flag(settings.ProxyEnable)) {
    const pac =
      settings.AutoConfigEnabled === undefined
        ? Boolean(text(settings.AutoConfigURL))
        : flag(settings.AutoConfigEnabled);
    if (pac) throw automatic();
    // "Automatically detect settings" is enabled by default on Windows and
    // does not prove a WPAD proxy exists. We do not perform WPAD discovery.
    return flag(settings.AutoDetect) ? '' : undefined;
  }
  // Windows can leave automatic detection enabled alongside a manually selected
  // Clash proxy. An available manual HTTP configuration is usable on its own.
  if (bypass(url, text(settings.ProxyOverride).split(';'))) return '';
  const server = text(settings.ProxyServer);
  if (!server) throw invalid();
  if (!server.includes('=')) return proxyUrl(server, true);
  const protocols = new Map<string, string>();
  for (const part of server.split(';').filter((part) => part.trim())) {
    const match = /^([a-z\d]+)\s*=\s*(.+)$/i.exec(part.trim());
    if (!match || protocols.has(match[1].toLowerCase())) throw invalid();
    protocols.set(match[1].toLowerCase(), match[2].trim());
  }
  const selected = protocols.get(url.protocol.slice(0, -1));
  if (selected) return proxyUrl(selected, true);
  if ([...protocols.keys()].some((name) => name.startsWith('socks'))) throw unsupported();
  return '';
}

function macProxy(output: string, url: URL): string | undefined {
  if (!/^\s*<dictionary>\s*\{[\s\S]*\}\s*$/.test(output)) throw invalid();
  const fields = new Map<string, string>();
  const patterns: string[] = [];
  let depth = 0,
    exceptions = false;
  for (const line of output.split(/\r?\n/)) {
    if (line.trim() === '}') {
      depth--;
      if (depth < 2) exceptions = false;
      continue;
    }
    const match = /^\s*([a-z]+)\s*:\s*(.*?)\s*$/i.exec(line);
    if (depth === 1 && match) {
      if (fields.has(match[1])) throw invalid();
      fields.set(match[1], match[2]);
      exceptions = match[1] === 'ExceptionsList' && match[2] === '<array> {';
    } else if (depth === 2 && exceptions) {
      const entry = /^\s*\d+\s*:\s*(.*?)\s*$/.exec(line);
      if (entry) patterns.push(entry[1]);
    }
    // scutil also prints per-interface __SCOPED__ dictionaries. The top-level
    // settings describe the default route; nested values must not override it.
    if (/<(?:dictionary|array)>\s*\{\s*$/.test(line)) depth++;
  }
  const enabled = (key: string) => {
    const value = fields.get(key);
    if (value !== undefined && value !== '0' && value !== '1') throw invalid();
    return value === '1';
  };
  const prefix = url.protocol === 'https:' ? 'HTTPS' : 'HTTP';
  if (!enabled(prefix + 'Enable')) {
    if (enabled('ProxyAutoConfigEnable')) throw automatic();
    if (enabled('SOCKSEnable')) throw unsupported();
    // As on Windows, auto-discovery alone is not an explicit proxy address.
    return enabled('ProxyAutoDiscoveryEnable') ? '' : undefined;
  }
  if (bypass(url, patterns, enabled('ExcludeSimpleHostnames'))) return '';
  const host = fields.get(prefix + 'Proxy')?.trim();
  const port = fields.get(prefix + 'Port');
  if (!host || !port || !/^\d{1,5}$/.test(port)) throw invalid();
  const authority = isIP(host) === 6 ? '[' + host + ']' : host;
  return proxyUrl(authority + ':' + port, true);
}

/** Return the selected proxy explicitly; '' means fetch proxy:false. */
export function createDownloadProxyResolver(options: DownloadProxyResolverOptions = {}) {
  return async (address: string, signal?: AbortSignal): Promise<string | undefined> => {
    signal?.throwIfAborted();
    let url: URL;
    try {
      url = new URL(address);
      if (!['http:', 'https:'].includes(url.protocol)) throw invalid();
    } catch {
      throw new Error('下载地址无效');
    }
    const environment =
      typeof options.environment === 'function'
        ? options.environment()
        : (options.environment ?? process.env);
    // A global bypass also avoids querying unusable PAC/WPAD configuration.
    if (
      environmentValue(environment, 'no_proxy')
        ?.split(/[\s,]+/)
        .includes('*')
    )
      return '';
    const configured =
      environmentValue(environment, url.protocol === 'https:' ? 'https_proxy' : 'http_proxy') ??
      environmentValue(environment, 'all_proxy');
    if (configured) {
      return proxyUrl(configured, false);
    }
    const platform = options.platform ?? process.platform;
    // Linux has no universal desktop HTTP proxy store. Environment and VPN/TUN
    // remain supported; do not guess GNOME, KDE, or a local Clash listening port.
    if (platform !== 'win32' && platform !== 'darwin') return '';
    let output: string;
    try {
      output = await (options.readSystemProxy
        ? options.readSystemProxy(platform, signal)
        : readSystemProxy(platform, environment, signal));
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof ProxyConfigurationError) throw error;
      throw new Error('无法读取系统下载代理，请检查系统代理设置或设置代理环境变量后重试');
    }
    signal?.throwIfAborted();
    if (typeof output !== 'string' || output.length > 64 * 1024) throw invalid();
    return platform === 'win32' ? windowsProxy(output, url) : macProxy(output, url);
  };
}

// No session cache: every new connection observes current system proxy settings.
export const resolveDownloadProxy = createDownloadProxyResolver();
