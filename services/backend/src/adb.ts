/** Bounded emulator discovery. Only fixed ADB argv; never starts an emulator or game. */
import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import net from "node:net";

export const EMULATOR_PORTS = [5555, 5556, 5565, 5575, 5585, 5595, 5554,
  16384, 16416, 16448, 16480, 16512, 16544, 16576, 5557, 5559, 5561, 7555, 62001, 59865, 21503, 58526] as const;
export interface AdbDevice { address: string; name: string; adbState: string }
type Environment = Record<string, string | undefined>;
const expandUser = (value: string) => /^~(?:[\\/]|$)/.test(value) ? path.join(homedir(), value.slice(1)) : value;
const isFile = (value: string) => { try { return statSync(value).isFile(); } catch { return false; } };

export function validateAddress(address: unknown): string {
  if (typeof address !== "string" || !/^[A-Za-z0-9_.:\[\]-]{1,128}$/.test(address)) throw new Error("ADB 设备地址无效");
  if (address.startsWith("-")) throw new Error("ADB 设备地址不得以选项开头");
  return address;
}
export function isLocalEmulator(address: string): boolean {
  if (/^emulator-\d{1,5}$/.test(address)) return true;
  const match = /^(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})$/.exec(address);
  return Boolean(match && Number(match[1]) > 0 && Number(match[1]) <= 65535);
}
export function deviceLockAddress(address: string): string {
  if (/^emulator-\d{1,5}$/.test(address)) return `127.0.0.1:${Number(address.slice(9)) + 1}`;
  return isLocalEmulator(address) ? `127.0.0.1:${Number(address.slice(address.lastIndexOf(":") + 1))}` : address;
}
export function adbServerIdentity(env: Environment = process.env): string {
  const selected = env.ADB_SERVER_SOCKET || `tcp:${env.ANDROID_ADB_SERVER_ADDRESS || "localhost"}:${env.ANDROID_ADB_SERVER_PORT || "5037"}`;
  if (selected.startsWith("localfilesystem:")) {
    const socketPath = selected.slice(16);
    // realpath() of the existing prefix, matching Python for not-yet-created sockets.
    let current = path.resolve(socketPath), suffix: string[] = [];
    while (!existsSync(current) && path.dirname(current) !== current) { suffix.unshift(path.basename(current)); current = path.dirname(current); }
    return "localfilesystem:" + path.join(realpathSync(current), ...suffix);
  }
  if (!selected.startsWith("tcp:")) return selected;
  const endpoint = selected.slice(4);
  let host: string, port: string;
  if (/^\d+$/.test(endpoint)) { host = "localhost"; port = endpoint; }
  else if (endpoint.includes(":")) { const index = endpoint.lastIndexOf(":"); host = endpoint.slice(0, index); port = endpoint.slice(index + 1); }
  else throw new Error("ADB server socket 缺少有效端口");
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("ADB server 端口必须在 1 到 65535 之间");
  host = host.toLowerCase().replace(/\.+$/, "").replace(/^[\[\]]+|[\[\]]+$/g, "");
  if (["", "localhost", "127.0.0.1", "::1"].includes(host)) host = "127.0.0.1";
  else if (host.includes(":")) host = `[${host}]`;
  return `tcp:${host}:${Number(port)}`;
}

export function adbCandidates(env: Environment = process.env, platform: NodeJS.Platform = process.platform): string[] {
  const candidates: string[] = [], executable = platform === "win32" ? "adb.exe" : "adb";
  // Avoid invoking a shell's where/which implementation.
  for (const directory of (env.PATH ?? env.Path ?? "").split(path.delimiter)) {
    const candidate = path.join(directory, executable);
    if (directory && isFile(candidate)) { candidates.push(candidate); break; }
  }
  for (const variable of ["ANDROID_HOME", "ANDROID_SDK_ROOT"]) if (env[variable]) candidates.push(path.join(env[variable]!, "platform-tools", executable));
  for (const directory of (env.MAAVERGE_EMULATOR_DIRS ?? "").split(path.delimiter).filter(Boolean)) {
    for (const relative of ["adb", "adb.exe", "nox_adb.exe", "HD-Adb.exe", "adb/adb.exe", "shell/adb.exe", "vmonitor/bin/adb", "Contents/MacOS/adb"]) {
      candidates.push(path.join(expandUser(directory), relative));
    }
  }
  if (platform === "darwin") {
    candidates.push(path.join(homedir(), "Library/Android/sdk/platform-tools/adb"));
    for (const directory of ["/Applications", path.join(homedir(), "Applications")]) {
      for (const app of ["MuMuPlayer.app", "MuMuPlayer Pro.app", "NoxAppPlayer.app", "Nox App Player.app", "BlueStacks.app"]) {
        candidates.push(path.join(directory, app, "Contents/MacOS", app === "BlueStacks.app" ? "hd-adb" : "adb"));
      }
    }
  } else if (platform === "win32") {
    if (env.LOCALAPPDATA) candidates.push(path.join(env.LOCALAPPDATA, "Android/Sdk/platform-tools/adb.exe"));
    for (const variable of ["ProgramFiles", "ProgramFiles(x86)"]) {
      if (!env[variable]) continue;
      for (const relative of ["BlueStacks_nxt/HD-Adb.exe", "Nox/bin/nox_adb.exe", "Netease/MuMuPlayer-12.0/shell/adb.exe", "Netease/MuMuPlayer/nx_main/adb.exe", "Microvirt/MEmu/adb.exe"]) {
        candidates.push(path.join(env[variable]!, relative));
      }
    }
  } else candidates.push(path.join(homedir(), "Android/Sdk/platform-tools/adb"), "/opt/android-sdk/platform-tools/adb");
  return candidates;
}
export function adbPath(env: Environment = process.env): string {
  if (env.MAAVERGE_ADB_PATH) {
    const configured = expandUser(env.MAAVERGE_ADB_PATH);
    if (!isFile(configured)) throw new Error("MAAVERGE_ADB_PATH 指向的 ADB 不存在");
    return realpathSync(configured);
  }
  for (const candidate of adbCandidates(env)) if (isFile(candidate)) return realpathSync(candidate);
  throw new Error("未找到 ADB；请安装 Android platform-tools，或配置 MAAVERGE_ADB_PATH / MAAVERGE_EMULATOR_DIRS");
}
function run(executable: string, args: string[], timeout = 15_000): Promise<string> {
  return new Promise((resolve, reject) => execFile(executable, args, {
    timeout, windowsHide: true, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  }, (error, stdout) => error ? reject(error) : resolve(stdout)));
}
export function parseAdbDevices(output: string): AdbDevice[] {
  const devices: AdbDevice[] = [];
  for (const line of output.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 2 || ["List", "*"].includes(fields[0])) continue;
    const address = validateAddress(fields[0]);
    devices.push({ address, name: fields.slice(2).find((field) => field.startsWith("model:"))?.slice(6) ?? address, adbState: fields[1] });
  }
  return devices;
}
export async function discover(executable = adbPath()): Promise<AdbDevice[]> {
  return parseAdbDevices(await run(executable, ["devices", "-l"]));
}
export function emulatorAddresses(env: Environment = process.env): string[] {
  let addresses: string[] = EMULATOR_PORTS.map((port) => `127.0.0.1:${port}`);
  if (env.MAAVERGE_EMULATOR_ADDRESSES) {
    const extras = env.MAAVERGE_EMULATOR_ADDRESSES.split(",").map((value) => value.trim()).filter(Boolean);
    if (extras.length > 16) throw new Error("自动连接最多配置 16 个额外本机地址");
    if (extras.some((address) => !isLocalEmulator(address) || address.startsWith("emulator-"))) throw new Error("自动连接地址必须是带有效端口的本机回环地址");
    addresses = [...extras, ...addresses];
  }
  const configs: string[] = [];
  if (env.MAAVERGE_BLUESTACKS_CONFIG) configs.push(expandUser(env.MAAVERGE_BLUESTACKS_CONFIG));
  if (env.ProgramData) configs.push(...["BlueStacks_nxt", "BlueStacks"].map((folder) => path.join(env.ProgramData!, folder, "bluestacks.conf")));
  for (const config of configs) {
    if (!isFile(config) || statSync(config).size > 2 * 1024 * 1024) continue;
    const content = readFileSync(config, "utf8");
    for (const match of content.matchAll(/^bst\.instance\.[\w-]+\.(?:status\.)?adb_port\s*=\s*"?(\d+)"?/gm)) {
      if (Number(match[1]) > 0 && Number(match[1]) <= 65535) addresses.push(`127.0.0.1:${Number(match[1])}`);
    }
  }
  return [...new Set(addresses)].slice(0, 48);
}
function listening(address: string): Promise<boolean> {
  const split = address.lastIndexOf(":"), host = address.slice(0, split).replace(/^\[|\]$/g, ""), port = Number(address.slice(split + 1));
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const done = (value: boolean) => { if (!settled) { settled = true; socket.destroy(); resolve(value); } };
    socket.setTimeout(150); socket.once("connect", () => done(true)); socket.once("error", () => done(false)); socket.once("timeout", () => done(false));
  });
}
export async function autoDiscover(): Promise<{ devices: AdbDevice[]; diagnostics: string[] }> {
  const executable = adbPath(), diagnostics: string[] = [];
  const initial = await discover(executable), known = new Set(initial.filter((device) => device.adbState === "device").map((device) => device.address));
  for (const address of emulatorAddresses()) {
    if (known.has(address) || !await listening(address)) continue;
    try {
      const output = (await run(executable, ["connect", address], 3000)).trim();
      if (!output.toLowerCase().includes("connected to")) diagnostics.push(`${address}：${output.slice(0, 180) || "ADB 未确认连接"}`);
    } catch (error) { diagnostics.push(`${address}：ADB 连接失败（${error instanceof Error ? error.name : "Error"}）`); }
  }
  const devices = await discover(executable);
  for (const device of devices) if (isLocalEmulator(device.address) && device.adbState !== "device") diagnostics.push(`${device.address}：${device.adbState}，请检查模拟器 ADB 授权`);
  return { devices, diagnostics };
}
