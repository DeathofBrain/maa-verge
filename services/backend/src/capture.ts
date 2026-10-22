/** Connection extras for explicitly selected local emulator capture. No shell or device actions. */
import { execFile } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Settings } from './models';
import { defaultCapture } from './models';
import { isLocalEmulator } from './adb';
import { deviceAddressIdentity, mumuDefaultAdbAddress } from '../../../packages/contracts/src/device-profiles';

export type Capture = NonNullable<Settings['capture']>;
const file = (name: string) => { try { return statSync(name).isFile(); } catch { return false; } };

export function captureAdbPath(capture: Capture = defaultCapture()): string | undefined {
  if (capture.method === 'adb' || !capture.emulatorPath.trim()) return;
  const candidates = capture.method === 'mumu' ? ['nx_main/adb.exe', 'shell/adb.exe', 'adb.exe'] : ['adb.exe'];
  return candidates.map(relative => path.join(capture.emulatorPath, relative)).find(file);
}

export function ldPlayerPid(output: string, index: number): number {
  for (const line of output.split(/\r?\n/)) {
    const fields = line.split(',');
    if (fields.length < 7 || fields[0].trim() !== String(index)) continue;
    const pid = Number(fields[5]);
    if (fields[4].trim() !== '1' || !Number.isSafeInteger(pid) || pid <= 0 || pid > 0x7fffffff) throw new Error('所选雷电实例尚未启动或进程编号无效');
    return pid;
  }
  throw new Error('未找到所选雷电实例，请检查实例索引');
}

export interface KnownMuMuInstance { index: number; emulatorPath: string; address: string; aliases?: string[]; kind?: 'mumu' | 'ldplayer'; pid?: number }

export async function connectionCapture(selected: Settings['capture'], address: string, platform = process.platform, knownInstance?: KnownMuMuInstance): Promise<Capture & { pid?: number }> {
  const capture = { ...defaultCapture(), ...selected } as Capture;
  if (capture.method === 'adb') return capture;
  if (platform !== 'win32') throw new Error('MuMu／雷电增强截图当前仅支持 Windows');
  if (!isLocalEmulator(address) && !(capture.method === 'mumu' && capture.mumuBridge)) throw new Error('增强截图仅支持本机模拟器；MuMu 网络桥接请显式启用桥接模式并指定实例编号');
  if (!path.isAbsolute(capture.emulatorPath.trim())) throw new Error('请选择模拟器安装根目录的绝对路径');
  capture.emulatorPath = realpathSync(capture.emulatorPath.trim());
  if (!statSync(capture.emulatorPath).isDirectory()) throw new Error('模拟器安装根目录无效');
  const port = address.startsWith('emulator-') ? Number(address.slice(9)) + 1 : Number(address.slice(address.lastIndexOf(':') + 1));
  if (capture.method === 'mumu') {
    const sdk = ['nx_device/15.0/shell/sdk', 'nx_device/12.0/shell/sdk', 'shell/sdk'];
    if (!sdk.some(relative => file(path.join(capture.emulatorPath, relative, 'external_renderer_ipc.dll')))) throw new Error('未找到 MuMu 增强截图 SDK，请选择安装根目录');
    // An explicit SDK index must not capture a different instance from ADB.
    if (knownInstance) {
      const rootMatches = realpathSync(knownInstance.emulatorPath).toLowerCase() === capture.emulatorPath.toLowerCase();
      const addressMatches = [knownInstance.address, ...knownInstance.aliases ?? []].some(alias => deviceAddressIdentity(alias) === deviceAddressIdentity(address));
      if (knownInstance.kind === 'ldplayer' || !rootMatches || knownInstance.index !== capture.instanceIndex || !capture.mumuBridge && !addressMatches) throw new Error('MuMu 实例索引、安装目录与 ADB 地址不匹配');
    } else if (!capture.mumuBridge) {
      const defaultAddress = mumuDefaultAdbAddress(capture.instanceIndex);
      if (!defaultAddress) throw new Error('此 MuMu 实例编号需要运行中的多开实例信息，请启动所选实例后重新发现');
      const expected = address.startsWith('emulator-') ? 5555 + capture.instanceIndex * 2 : Number(defaultAddress.split(':')[1]);
      if (port !== expected) throw new Error('MuMu 实例索引与 ADB 地址不匹配');
    }
  } else {
    const executable = path.join(capture.emulatorPath, 'ldconsole.exe');
    if (!file(executable) || !file(path.join(capture.emulatorPath, 'ldopengl64.dll'))) throw new Error('未找到雷电控制台或增强截图 DLL，请选择安装根目录');
    if (knownInstance) {
      const rootMatches = realpathSync(knownInstance.emulatorPath).toLowerCase() === capture.emulatorPath.toLowerCase();
      const addressMatches = [knownInstance.address, ...knownInstance.aliases ?? []].some(alias => deviceAddressIdentity(alias) === deviceAddressIdentity(address));
      if (knownInstance.kind !== 'ldplayer' || !rootMatches || knownInstance.index !== capture.instanceIndex || !addressMatches || !Number.isSafeInteger(knownInstance.pid) || knownInstance.pid! <= 0 || knownInstance.pid! > 0x7fffffff) throw new Error('雷电实例索引、安装目录与 ADB 地址不匹配');
      return { ...capture, pid: knownInstance.pid };
    }
    if (port !== 5555 + capture.instanceIndex * 2) throw new Error('雷电实例索引与 ADB 地址不匹配');
    const output = await new Promise<string>((resolve, reject) => execFile(executable, ['list2'], { windowsHide: true, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout)));
    return { ...capture, pid: ldPlayerPid(output, capture.instanceIndex) };
  }
  return capture;
}
