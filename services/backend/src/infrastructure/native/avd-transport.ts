import net from 'node:net';
import { normalizeDeviceAddress } from '@contracts/device-profiles';
import { parseAdbDevices } from './adb';
import { adbDeviceServerIdentity } from './connection-health';

const timeoutMs = 3000;
const states = new Set([
  'device',
  'offline',
  'unauthorized',
  'unknown',
  'bootloader',
  'recovery',
  'sideload',
  'rescue',
  'authorizing',
  'connecting',
  'host',
  'detached',
]);
const cancelled = () => new Error('AVD 模拟器连接已取消');
const timedOut = () => new Error('AVD 模拟器连接超时，请确认模拟器已启动且 ADB 设备已就绪');

function localServer(identity?: string): net.NetConnectOpts {
  let selected: string;
  try {
    if (identity === 'localfilesystem:') throw new Error('Missing ADB server socket path');
    selected =
      identity === undefined
        ? adbDeviceServerIdentity()
        : adbDeviceServerIdentity({ ADB_SERVER_SOCKET: identity });
  } catch {
    throw new Error('AVD 增强连接需要有效的本机 ADB server 地址');
  }
  if (selected.startsWith('localfilesystem:')) return { path: selected.slice(16) };
  const match = /^tcp:(?:\[([^\]]+)\]|([^:]+)):(\d+)$/.exec(selected);
  const host = match?.[1] ?? match?.[2];
  if (!host || !['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase().replace(/\.+$/, '')))
    throw new Error('AVD 增强连接仅支持本机 ADB server，请检查 ADB server 地址设置');
  return { host, port: Number(match![3]) };
}

/** One bounded smart-socket request to an existing server; never invoke an ADB process. */
function query(
  endpoint: net.NetConnectOpts,
  service: string,
  deadline: number,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) return Promise.reject(cancelled());
  if (performance.now() >= deadline) return Promise.reject(timedOut());
  return new Promise((resolve, reject) => {
    let socket: net.Socket | undefined;
    let finished = false;
    let buffer = Buffer.alloc(0);
    let status: string | undefined;
    let expected: number | undefined;
    const finish = (error?: Error, body?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      socket?.destroy();
      if (error) reject(error);
      else resolve(body!);
    };
    const abort = () => finish(cancelled());
    const timer = setTimeout(() => finish(timedOut()), Math.max(1, deadline - performance.now()));
    signal?.addEventListener('abort', abort, { once: true });
    try {
      socket = net.createConnection(endpoint);
      socket.once('connect', () => {
        if (finished) return;
        socket!.write(Buffer.from(service.length.toString(16).padStart(4, '0') + service, 'ascii'));
      });
      socket.on('error', (error) =>
        finish(new Error('无法连接现有本机 ADB server：' + error.message)),
      );
      socket.once('close', () => finish(new Error('ADB server 提前关闭连接，AVD 响应不完整')));
      socket.on('data', (chunk: Buffer) => {
        if (finished) return;
        try {
          if (buffer.length + chunk.length > 65543) throw new Error('ADB server 响应超出大小限制');
          buffer = Buffer.concat([buffer, chunk]);
          if (status === undefined) {
            if (buffer.length < 4) return;
            status = buffer.subarray(0, 4).toString('latin1');
            if (status !== 'OKAY' && status !== 'FAIL') throw new Error('ADB server 返回无效状态');
            buffer = buffer.subarray(4);
          }
          if (expected === undefined) {
            if (buffer.length < 4) return;
            const length = buffer.subarray(0, 4).toString('latin1');
            if (!/^[0-9a-fA-F]{4}$/.test(length)) throw new Error('ADB server 返回无效响应长度');
            expected = Number.parseInt(length, 16);
            buffer = buffer.subarray(4);
          }
          if (buffer.length < expected) return;
          if (buffer.length !== expected) throw new Error('ADB server 返回多余的响应数据');
          let body: string;
          try {
            body = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
          } catch {
            throw new Error('ADB server 返回无效 UTF-8 响应');
          }
          if (status === 'FAIL') throw new Error('ADB server 拒绝 AVD 请求：' + body.slice(0, 512));
          finish(undefined, body);
        } catch (error) {
          finish(error instanceof Error ? error : new Error('ADB server 返回无效响应'));
        }
      });
      if (signal?.aborted) abort();
    } catch (error) {
      finish(new Error('无法连接现有本机 ADB server：' + String(error)));
    }
  });
}

function ready(output: string, address: string): boolean {
  const lines = output.split(/\r?\n/).filter(Boolean);
  // `devices-l` pads serials with spaces; short lists use tabs. Keep the raw
  // serial too, since parseAdbDevices normalizes emulator prefix casing.
  const rows = lines.map((line) => /^([^\s]+)[ \t]+(\S[^\r\n]*)$/.exec(line));
  let devices: ReturnType<typeof parseAdbDevices>;
  try {
    devices = parseAdbDevices(output);
  } catch {
    throw new Error('ADB server 返回无效设备列表');
  }
  if (
    rows.some((row) => !row) ||
    devices.length !== lines.length ||
    devices.some(
      (device, index) =>
        !states.has(device.adbState) && !/^no permissions(?:\s+.*)?$/.test(rows[index]![2]),
    ) ||
    new Set(devices.map((device) => device.address)).size !== devices.length
  )
    throw new Error('ADB server 返回无效设备列表');
  return devices.some(
    (device, index) =>
      device.address === address && device.adbState === 'device' && rows[index]![1] === address,
  );
}

function waitForRegistration(deadline: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(cancelled());
  if (performance.now() >= deadline) return Promise.reject(timedOut());
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener('abort', abort);
        resolve();
      },
      Math.min(50, Math.max(1, deadline - performance.now())),
    );
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** Register an explicit AVD serial in the current server without replacing that server. */
export async function ensureAvdTransport(
  address: string,
  signal?: AbortSignal,
  options: { serverIdentity?: string } = {},
): Promise<void> {
  const serial = normalizeDeviceAddress(address);
  const match = /^emulator-([1-9]\d{0,4})$/.exec(serial);
  const consolePort = Number(match?.[1]);
  // ADB's explicit emulator registration accepts odd console ports too.
  if (!match || consolePort > 65534)
    throw new Error('AVD 增强连接需要 emulator-N 格式的模拟器串号，端口须为 1 到 65534');
  if (signal?.aborted) throw cancelled();
  const endpoint = localServer(options.serverIdentity);
  const deadline = performance.now() + timeoutMs;
  if (ready(await query(endpoint, 'host:devices-l', deadline, signal), serial)) return;
  const result = await query(
    endpoint,
    `host:connect:emu:${consolePort},${consolePort + 1}`,
    deadline,
    signal,
  );
  if (
    result.trim() !== `Connected to emulator on ports ${consolePort},${consolePort + 1}` &&
    result.trim() !== `Emulator already registered on port ${consolePort + 1}`
  )
    throw new Error('ADB server 未能登记 AVD 模拟器：' + result.slice(0, 512));
  for (;;) {
    if (ready(await query(endpoint, 'host:devices-l', deadline, signal), serial)) return;
    await waitForRegistration(deadline, signal);
  }
}
