/** Read-only process discovery, following MAA v6.20.0 WinAdapter's relative ADB paths. */
import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';

const relativeAdbPaths: Record<string, string[]> = {
  'mumuNxDevice.exe': ['../../../nx_main/adb.exe', '../vmonitor/bin/adb_server.exe', '../../MuMu/emulator/nemu/vmonitor/bin/adb_server.exe', 'adb.exe'],
  'mumuPlayer.exe': ['../../../nx_main/adb.exe', '../nx_main/adb.exe', '../vmonitor/bin/adb_server.exe', '../../MuMu/emulator/nemu/vmonitor/bin/adb_server.exe', 'adb.exe'],
  'mumuNxMain.exe': ['adb.exe'],
  'mumuNxService.exe': ['adb.exe'],
  'HD-Player.exe': ['HD-Adb.exe', 'Engine/ProgramFiles/HD-Adb.exe'],
  'dnplayer.exe': ['adb.exe'],
  'Nox.exe': ['nox_adb.exe'],
  'MEmu.exe': ['adb.exe'],
  'nemux-shell-winui.exe': ['adb.exe'],
};
const pathsByName = new Map(Object.entries(relativeAdbPaths).map(([name, paths]) => [name.toLowerCase(), paths]));
const processFilter = Object.keys(relativeAdbPaths).map(name => `Name = '${name}'`).join(' OR ');
// Fixed script: no user paths, commands or account information are interpolated.
const processQuery = `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $p = @(Get-CimInstance Win32_Process -Filter "${processFilter}" | Select-Object Name,ExecutablePath,ProcessId); $l = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -in @('127.0.0.1','::1') } | Select-Object LocalAddress,LocalPort,OwningProcess); @{ processes = $p; listeners = $l } | ConvertTo-Json -Compress -Depth 3`;

interface EmulatorProcess { name: string; executable: string; pid: number }
interface Listener { address: string; pid: number }
interface Snapshot { processes: EmulatorProcess[]; listeners: Listener[] }
const positiveInteger = (value: unknown, maximum: number) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= maximum;
function parseSnapshot(output: string): Snapshot {
  if (!output.trim()) return { processes: [], listeners: [] };
  const value: any = JSON.parse(output.replace(/^\uFEFF/, ''));
  const records = value && Array.isArray(value.processes) ? value.processes : Array.isArray(value) ? value : [value];
  const processes: EmulatorProcess[] = [], listeners: Listener[] = [];
  for (const record of records.slice(0, 128)) {
    if (!record || typeof record !== 'object') continue;
    const name = record.Name, executable = record.ExecutablePath;
    if (typeof name !== 'string' || !pathsByName.has(name.toLowerCase()) || typeof executable !== 'string' || executable.length > 32767 || /[\0\r\n]/.test(executable)
      || !/^[A-Za-z]:[\\/]/.test(executable) || path.win32.basename(executable).toLowerCase() !== name.toLowerCase()) continue;
    processes.push({ name: name.toLowerCase(), executable, pid: positiveInteger(record.ProcessId, 0xffffffff) ? record.ProcessId : 0 });
  }
  for (const record of (Array.isArray(value?.listeners) ? value.listeners : []).slice(0, 2048)) {
    if (!record || !['127.0.0.1', '::1'].includes(record.LocalAddress) || !positiveInteger(record.LocalPort, 65535) || !positiveInteger(record.OwningProcess, 0xffffffff)) continue;
    listeners.push({ address: `${record.LocalAddress === '::1' ? '[::1]' : record.LocalAddress}:${record.LocalPort}`, pid: record.OwningProcess });
  }
  return { processes, listeners };
}

export function windowsProcessAdbCandidates(output: string): string[] {
  const result = new Set<string>();
  for (const { name, executable } of parseSnapshot(output).processes) {
    for (const relative of pathsByName.get(name) ?? []) result.add(path.win32.resolve(path.win32.dirname(executable), relative));
  }
  return [...result];
}

type Query = (executable: string, args: string[], options: { timeout: number; maxBuffer: number; windowsHide: boolean }) => Promise<string>;
const execute: Query = (executable, args, options) => new Promise((resolve, reject) => {
  execFile(executable, args, { ...options, encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve(stdout));
});
async function querySnapshot(env: Record<string, string | undefined>, query: Query): Promise<string> {
  const systemRoot = env.SystemRoot || env.SYSTEMROOT;
  const powershell = systemRoot ? path.win32.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe') : 'powershell.exe';
  return query(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', processQuery], { timeout: 4000, maxBuffer: 256 * 1024, windowsHide: true });
}
export async function queryWindowsEmulatorAdb(env: Record<string, string | undefined> = process.env, query: Query = execute): Promise<string[]> {
  return windowsProcessAdbCandidates(await querySnapshot(env, query));
}

let pending: Promise<string[]> | undefined, cached: string[] = [], expires = 0;
/** Share concurrent requests; a newly launched emulator is retried after an empty result. */
export function runningWindowsAdbCandidates(): Promise<string[]> {
  if (Date.now() < expires) return Promise.resolve(cached);
  return pending ??= queryWindowsEmulatorAdb().then(candidates => {
    cached = candidates; expires = candidates.length ? Date.now() + 5000 : 0; return candidates;
  }).finally(() => { pending = undefined; });
}

export interface EmulatorInstance {
  kind?: 'mumu' | 'ldplayer';
  address: string;
  name: string;
  index: number;
  pid?: number;
  emulatorPath: string;
  aliases: string[];
}
export interface EmulatorInventory { instances: EmulatorInstance[]; diagnostics: string[]; identities?: Record<string, string> }
export const emptyEmulatorInventory = (): EmulatorInventory => ({ instances: [], diagnostics: [] });
/** The manager supplies actual ports, including high indices and user customizations. */
export function mumuManagerInstances(output: string, emulatorPath: string): (EmulatorInstance & { pid: number })[] {
  const data: unknown = JSON.parse(output.replace(/^\uFEFF/, ''));
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const result: (EmulatorInstance & { pid: number })[] = [];
  for (const [key, value] of Object.entries(data).slice(0, 128)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>, index = Number(record.index);
    if (!/^\d+$/.test(key) || record.index === undefined || !/^\d+$/.test(String(record.index)) || !Number.isSafeInteger(index) || index < 0 || index > 65535 || Number(key) !== index
      || record.is_android_started !== true || record.is_process_started !== true || !positiveInteger(record.adb_port, 65535)
      || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(record.adb_host_ip))) continue;
    const host = ['::1', '[::1]'].includes(String(record.adb_host_ip)) ? '[::1]' : '127.0.0.1';
    result.push({ kind: 'mumu', address: `${host}:${record.adb_port}`, index, emulatorPath,
      name: typeof record.name === 'string' && record.name.trim() ? record.name.replace(/[\0\r\n]/g, '').slice(0, 64) : `MuMu 实例 ${index}`,
      aliases: [], pid: positiveInteger(record.pid, 0xffffffff) ? record.pid as number : 0 });
  }
  return result;
}

/** MAA v6.20.0 LDPlayerExtra uses list2 field 5 as the screenshot SDK PID. */
export function ldPlayerConsoleInstances(output: string, emulatorPath: string): (EmulatorInstance & { pid: number; vmPid: number })[] {
  const result = new Map<number, EmulatorInstance & { pid: number; vmPid: number }>();
  const duplicates = new Set<number>();
  for (const line of output.replace(/^\uFEFF/, '').split(/\r?\n/).slice(0, 128)) {
    const fields = line.split(',').map(field => field.trim());
    if (fields.length < 7 || !/^\d+$/.test(fields[0]) || !/^\d+$/.test(fields[5]) || fields[4] !== '1') continue;
    const index = Number(fields[0]), pid = Number(fields[5]), port = 5555 + index * 2;
    if (!Number.isSafeInteger(index) || index < 0 || !positiveInteger(port, 65535) || !positiveInteger(pid, 0xffffffff)) continue;
    // Conflicting rows cannot identify one SDK instance reliably.
    if (result.has(index)) { result.delete(index); duplicates.add(index); }
    if (duplicates.has(index)) continue;
    const vmPid = /^\d+$/.test(fields[6]) && positiveInteger(Number(fields[6]), 0xffffffff) ? Number(fields[6]) : 0;
    result.set(index, { kind: 'ldplayer', address: `127.0.0.1:${port}`, index, emulatorPath, pid, vmPid,
      name: fields[1].replace(/[\0\r\n]/g, '').slice(0, 64) || `雷电实例 ${index}`, aliases: [] });
  }
  return [...result.values()];
}

/** Query running emulator installations; no create/start/stop commands or port-range scan. */
export async function queryWindowsEmulatorInventory(options: { env?: Record<string, string | undefined>; query?: Query; isFile?: (value: string) => boolean } = {}): Promise<EmulatorInventory> {
  const result = emptyEmulatorInventory(), query = options.query ?? execute;
  let snapshot: Snapshot;
  try { snapshot = parseSnapshot(await querySnapshot(options.env ?? process.env, query)); }
  catch { result.diagnostics.push('无法读取模拟器进程或监听端口；已保留默认端口发现，可手动填写实例地址'); return result; }
  // A MuMuNxDevice process is one VM. Its loopback endpoints keep one lease
  // even if this version's manager cannot supply an index or fails temporarily.
  result.identities = {};
  for (const process of snapshot.processes.filter(process => process.name === 'mumunxdevice.exe' && process.pid)) {
    for (const listener of snapshot.listeners.filter(listener => listener.pid === process.pid)) result.identities[listener.address] = `mumu-process:${process.pid}`;
  }
  const file = options.isFile ?? ((value: string) => { try { return statSync(value).isFile(); } catch { return false; } });
  const managers = new Map<string, { executable: string; emulatorPath: string; pids: Set<number> }>();
  for (const process of snapshot.processes.filter(process => process.name.startsWith('mumu'))) {
    for (const relative of pathsByName.get(process.name) ?? []) {
      const executable = path.win32.resolve(path.win32.dirname(process.executable), relative, '..', 'MuMuManager.exe');
      if (!file(executable)) continue;
      const key = executable.toLowerCase();
      let manager = managers.get(key);
      if (!manager) {
        if (managers.size >= 4) { result.diagnostics.push('运行中的 MuMu 安装目录超过自动发现上限 4 个，请手动配置其余实例'); break; }
        const directory = path.win32.dirname(executable);
        manager = { executable, emulatorPath: ['nx_main', 'shell'].includes(path.win32.basename(directory).toLowerCase()) ? path.win32.dirname(directory) : directory, pids: new Set() };
        managers.set(key, manager);
      }
      if (process.pid) manager.pids.add(process.pid);
    }
  }
  const entries = [...managers.values()];
  let next = 0;
  const groups: EmulatorInstance[][] = entries.map(() => []), messages: string[] = [];
  await Promise.all(Array.from({ length: Math.min(2, entries.length) }, async () => {
    while (next < entries.length) {
      const position = next++, manager = entries[position];
      try {
        const instances = mumuManagerInstances(await query(manager.executable, ['info', '-v', 'all'], { timeout: 4000, maxBuffer: 256 * 1024, windowsHide: true }), manager.emulatorPath);
        // Only an actual loopback listener owned by that installation's reported
        // instance process proves that another port is an alias. Never guess 7555.
        groups[position] = instances.map(instance => ({ ...instance, aliases: instance.pid && manager.pids.has(instance.pid)
          && instances.filter(other => other.pid === instance.pid).length === 1
          && snapshot.listeners.some(listener => listener.pid === instance.pid && listener.address === instance.address)
          ? snapshot.listeners.filter(listener => listener.pid === instance.pid && listener.address !== instance.address).map(listener => listener.address) : [] }));
      } catch { messages[position] = 'MuMu 多开信息读取失败；已保留其他实例及默认端口发现，可手动填写该安装目录的实例地址'; }
    }
  }));
  result.instances = groups.flat(); result.diagnostics.push(...messages.filter(Boolean));
  const consoles = new Map<string, { executable: string; emulatorPath: string }>();
  let consoleLimitReached = false;
  for (const process of snapshot.processes.filter(process => process.name === 'dnplayer.exe')) {
    const emulatorPath = path.win32.dirname(process.executable), executable = path.win32.join(emulatorPath, 'ldconsole.exe');
    if (!file(executable) || consoles.has(executable.toLowerCase())) continue;
    if (consoles.size >= 4) { consoleLimitReached = true; continue; }
    consoles.set(executable.toLowerCase(), { executable, emulatorPath });
  }
  if (consoleLimitReached) result.diagnostics.push('运行中的雷电安装目录超过自动发现上限 4 个，请手动配置其余实例');
  const consoleEntries = [...consoles.values()], consoleGroups: EmulatorInstance[][] = consoleEntries.map(() => []), consoleMessages: string[] = [];
  let nextConsole = 0;
  await Promise.all(Array.from({ length: Math.min(2, consoleEntries.length) }, async () => {
    while (nextConsole < consoleEntries.length) {
      const position = nextConsole++, console = consoleEntries[position];
      try {
        const instances = ldPlayerConsoleInstances(await query(console.executable, ['list2'], { timeout: 4000, maxBuffer: 256 * 1024, windowsHide: true }), console.emulatorPath);
        consoleGroups[position] = instances.flatMap(({ vmPid, ...instance }) => {
          // The window PID and VM PID are distinct on some LDPlayer versions.
          // Neither proves an ADB alias without a canonical loopback listener.
          const owner = snapshot.listeners.find(listener => listener.address === instance.address && [instance.pid, vmPid].includes(listener.pid));
          if (!owner) {
            consoleMessages[position] = snapshot.listeners.some(listener => listener.address === instance.address)
              ? '雷电默认 ADB 端口由其他进程占用；已跳过不匹配的实例，请检查多开地址或手动配置'
              : '雷电实例的 ADB 端口尚未就绪；已保留默认端口发现，请稍后重试或手动配置';
            return [];
          }
          if (instances.filter(other => [other.pid, other.vmPid].includes(owner.pid)).length !== 1) return [instance];
          const aliases = snapshot.listeners.filter(listener => listener.pid === owner.pid && listener.address !== instance.address).map(listener => listener.address);
          for (const address of [instance.address, ...aliases]) result.identities![address] = `ldplayer-process:${owner.pid}`;
          return [{ ...instance, aliases }];
        });
      } catch { consoleMessages[position] = '雷电多开信息读取失败；已保留其他实例及默认端口发现，可手动填写该安装目录的实例地址'; }
    }
  }));
  result.instances.push(...consoleGroups.flat()); result.diagnostics.push(...consoleMessages.filter(Boolean));
  return result;
}

let inventoryPending: Promise<EmulatorInventory> | undefined;
/** Refresh metadata for each discovery/connection; only simultaneous callers share it. */
export function runningWindowsEmulatorInventory(): Promise<EmulatorInventory> {
  if (process.platform !== 'win32') return Promise.resolve(emptyEmulatorInventory());
  return inventoryPending ??= queryWindowsEmulatorInventory().finally(() => { inventoryPending = undefined; });
}
