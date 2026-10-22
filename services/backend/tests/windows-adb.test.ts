import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { adbCandidates, resolveAdbPath } from '../src/adb';
import { mumuManagerInstances, queryWindowsEmulatorAdb, queryWindowsEmulatorInventory, windowsProcessAdbCandidates } from '../src/windows-emulators';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-windows-adb-')); roots.push(root);
  const executable = path.join(root, 'nx_main', 'adb.exe');
  await mkdir(path.dirname(executable)); await writeFile(executable, 'synthetic executable; never run');
  return { root, executable };
}

test('running MuMu paths locate new and old bundled ADB on custom drives without command lines', () => {
  const result = windowsProcessAdbCandidates(JSON.stringify([
    { Name: 'MuMuNxDevice.exe', ExecutablePath: 'D:\\自定义 安装\\MuMu\\nx_device\\15.0\\shell\\MuMuNxDevice.exe' },
    { Name: 'MuMuPlayer.exe', ExecutablePath: 'F:\\MuMu12\\shell\\MuMuPlayer.exe' },
    { Name: 'MuMuNxMain.exe', ExecutablePath: 'D:\\自定义 安装\\MuMu\\nx_main\\MuMuNxMain.exe' },
    { Name: 'MuMuNxService.exe', ExecutablePath: 'D:\\自定义 安装\\MuMu\\nx_main\\MuMuNxService.exe' },
  ]));
  expect(result).toContain('D:\\自定义 安装\\MuMu\\nx_main\\adb.exe');
  expect(result.filter(value => value === 'D:\\自定义 安装\\MuMu\\nx_main\\adb.exe')).toHaveLength(1);
  expect(result).toContain('F:\\MuMu12\\shell\\adb.exe');
  expect(result).toContain('F:\\MuMu12\\vmonitor\\bin\\adb_server.exe');
});

test('Windows process parsing rejects unrelated names, inaccessible, relative and mismatched executable paths', () => {
  for (const output of ['', 'null', '[]']) expect(windowsProcessAdbCandidates(output)).toEqual([]);
  expect(windowsProcessAdbCandidates(JSON.stringify([
    { Name: 'MuMuNxDevice.exe', ExecutablePath: null },
    { Name: 'MuMuNxMain.exe', ExecutablePath: '.\\MuMuNxMain.exe' },
    { Name: 'other.exe', ExecutablePath: 'D:\\other.exe' },
    { Name: 'MuMuNxMain.exe', ExecutablePath: 'D:\\other.exe' },
    { Name: 'MuMuNxMain.exe', ExecutablePath: 'D:\\MuMuNxMain.exe\n' },
  ]))).toEqual([]);
  expect(() => windowsProcessAdbCandidates('{')).toThrow();
  expect(windowsProcessAdbCandidates('{"Name":"HD-Player.exe","ExecutablePath":"F:\\\\BlueStacks\\\\HD-Player.exe"}')).toContain('F:\\BlueStacks\\HD-Adb.exe');
});

test('process inspection is a fixed bounded hidden query that reads only emulator names and executable paths', async () => {
  const result = await queryWindowsEmulatorAdb({ SystemRoot: 'Q:\\Windows' }, async (program, args, options) => {
    expect(program).toBe('Q:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    expect(args.slice(0, 4)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-Command']);
    expect(args[4]).toContain('Get-CimInstance Win32_Process -Filter');
    expect(args[4]).toContain('Select-Object Name,ExecutablePath');
    expect(args[4]).not.toContain('CommandLine'); expect(args[4]).not.toContain('Stop-Process');
    expect(options).toEqual({ timeout: 4000, maxBuffer: 256 * 1024, windowsHide: true });
    return '\uFEFF{"Name":"MuMuNxMain.exe","ExecutablePath":"D:\\\\MuMu\\\\nx_main\\\\MuMuNxMain.exe"}';
  });
  expect(result).toEqual(['D:\\MuMu\\nx_main\\adb.exe']);
});

test('MuMu root configuration includes nx_main and known defaults include the new MuMu folder', async () => {
  const { root, executable } = await fixture();
  expect(adbCandidates({ PATH: '', MAAVERGE_EMULATOR_DIRS: root }, 'win32')).toContain(executable);
  expect(adbCandidates({ PATH: '', ProgramFiles: root }, 'win32')).toContain(path.join(root, 'Netease/MuMu/nx_main/adb.exe'));
  expect(await resolveAdbPath({ PATH: '', MAAVERGE_EMULATOR_DIRS: root }, { platform: 'win32', runningCandidates: async () => { throw new Error('configured root must precede process inspection'); } })).toBe(realpathSync(executable));
});

test('running-emulator fallback validates existing files and preserves explicit ADB precedence', async () => {
  const { root, executable } = await fixture();
  let queries = 0;
  const options = { platform: 'win32' as const, runningCandidates: async () => { queries++; return [path.join(root, 'missing'), root, executable]; } };
  expect(await resolveAdbPath({ PATH: '' }, options)).toBe(realpathSync(executable));
  expect(queries).toBe(1);
  expect(await resolveAdbPath({ MAAVERGE_ADB_PATH: executable }, options)).toBe(realpathSync(executable));
  await expect(resolveAdbPath({ MAAVERGE_ADB_PATH: path.join(root, 'bad-explicit') }, options)).rejects.toThrow('不存在');
  expect(queries).toBe(1);
});

test('restricted or empty process discovery gives actionable manual configuration guidance', async () => {
  for (const runningCandidates of [async () => [], async (): Promise<string[]> => { throw new Error('synthetic denied'); }]) {
    await expect(resolveAdbPath({ PATH: '' }, { platform: 'win32', runningCandidates })).rejects.toThrow('在连接设置选择其内置 ADB');
  }
});

function managerRecord(index: number, port: number, pid: number, extra = {}) {
  return { index: String(index), adb_host_ip: '127.0.0.1', adb_port: port, pid, name: `MuMu ${index}`, is_android_started: true, is_process_started: true, ...extra };
}
const mainProcess = (root: string, pid: number) => ({ Name: 'MuMuNxMain.exe', ExecutablePath: `${root}\\nx_main\\MuMuNxMain.exe`, ProcessId: pid });
const deviceProcess = (root: string, pid: number) => ({ Name: 'MuMuNxDevice.exe', ExecutablePath: `${root}\\nx_device\\15.0\\shell\\MuMuNxDevice.exe`, ProcessId: pid });
const listener = (port: number, pid: number) => ({ LocalAddress: '127.0.0.1', LocalPort: port, OwningProcess: pid });

test('manager metadata preserves every running instance and actual custom/high-index port, excluding stopped or remote records', () => {
  const output = JSON.stringify({
    0: managerRecord(0, 16384, 101), 1: managerRecord(1, 18432, 102), 32: managerRecord(32, 16388, 103), 300: managerRecord(300, 45678, 104),
    2: managerRecord(2, 16448, 105, { is_android_started: false }), 3: managerRecord(3, 16480, 106, { is_process_started: false }),
    4: managerRecord(4, 65536, 107), 5: managerRecord(5, 16544, 108, { adb_host_ip: '192.168.1.1' }),
    6: managerRecord(7, 16576, 109), 7: managerRecord(7, 1.5, 110), 8: { adb_port: 16500, is_android_started: true, is_process_started: true },
  });
  const instances = mumuManagerInstances(output, 'D:\\MuMu');
  expect(instances.map(instance => [instance.index, instance.address])).toEqual([[0, '127.0.0.1:16384'], [1, '127.0.0.1:18432'], [32, '127.0.0.1:16388'], [300, '127.0.0.1:45678']]);
  expect(() => mumuManagerInstances('{', '')).toThrow();
  expect(mumuManagerInstances('null', '')).toEqual([]);
});

test('all MuMu installations are queried and aliases require matching instance PID and a proven canonical listener', async () => {
  const first = 'D:\\模拟器 A', second = 'F:\\MuMu B';
  const processes = [mainProcess(first, 100), deviceProcess(first, 101), deviceProcess(first, 102), mainProcess(second, 200), deviceProcess(second, 201)];
  const listeners = [listener(16384, 101), listener(5555, 101), listener(7555, 101), listener(18432, 102), listener(16388, 201), listener(5557, 999),
    { LocalAddress: '0.0.0.0', LocalPort: 24576, OwningProcess: 101 }];
  const calls: string[] = [];
  const inventory = await queryWindowsEmulatorInventory({ isFile: value => value.toLowerCase().endsWith('nx_main\\mumumanager.exe'), query: async (executable, args, options) => {
    if (executable.endsWith('powershell.exe')) return JSON.stringify({ processes, listeners });
    calls.push(executable); expect(args).toEqual(['info', '-v', 'all']);
    expect(options).toEqual({ timeout: 4000, maxBuffer: 256 * 1024, windowsHide: true });
    return JSON.stringify(executable.startsWith('D:') ? { 0: managerRecord(0, 16384, 101), 1: managerRecord(1, 18432, 102) } : { 32: managerRecord(32, 16388, 201) });
  } });
  expect(calls).toEqual([`${first}\\nx_main\\MuMuManager.exe`, `${second}\\nx_main\\MuMuManager.exe`]);
  expect(inventory.instances.map(instance => instance.address)).toEqual(['127.0.0.1:16384', '127.0.0.1:18432', '127.0.0.1:16388']);
  expect(inventory.instances[0].aliases).toEqual(['127.0.0.1:5555', '127.0.0.1:7555']);
  expect(inventory.instances[1].aliases).toEqual([]); expect(inventory.instances[2].aliases).toEqual([]);
  expect(inventory.identities?.['127.0.0.1:7555']).toBe('mumu-process:101');
  expect(inventory.identities?.['127.0.0.1:24576']).toBeUndefined(); expect(inventory.identities?.['127.0.0.1:5557']).toBeUndefined();
});

test('one broken manager does not suppress other installations, and process denial preserves manual fallback', async () => {
  const inventory = await queryWindowsEmulatorInventory({ isFile: value => value.endsWith('nx_main\\MuMuManager.exe'), query: async executable => {
    if (executable.endsWith('powershell.exe')) return JSON.stringify({ processes: [deviceProcess('D:\\bad', 101), deviceProcess('F:\\good', 201)], listeners: [listener(16384, 101)] });
    return executable.startsWith('D:') ? '{' : JSON.stringify({ 7: managerRecord(7, 54321, 201) });
  } });
  expect(inventory.instances.map(instance => instance.address)).toEqual(['127.0.0.1:54321']);
  expect(inventory.diagnostics).toHaveLength(1); expect(inventory.identities?.['127.0.0.1:16384']).toBe('mumu-process:101');
  const denied = await queryWindowsEmulatorInventory({ query: async () => { throw new Error('synthetic denied'); } });
  expect(denied.instances).toEqual([]); expect(denied.diagnostics[0]).toContain('手动');
});
