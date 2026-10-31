import { execFile } from 'node:child_process';
import net from 'node:net';
import { adbServerIdentity, deviceLockAddress, parseAdbDevices, validateAddress } from './adb';

type Endpoint = { address: string; host: string; port: number };

function tcpEndpoint(address: string): Endpoint | undefined {
  try {
    address = validateAddress(address);
    const emulator = /^emulator-(\d{1,5})$/.exec(address);
    if (emulator) address = `127.0.0.1:${Number(emulator[1]) + 1}`;
    const match = /^(?:\[([^\]]+)\]|([^:]+)):(\d{1,5})$/.exec(address);
    if (!match) return;
    const host = match[1] ?? match[2];
    const port = Number(match[3]);
    if (port < 1 || port > 65535 || (match[1] && net.isIP(host) !== 6)) return;
    if (!match[1] && !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(host)) return;
    return { address, host, port };
  } catch {
    return;
  }
}

/** Dial the endpoint, preserving IPv6 rather than using its lease identity. */
export async function probeAdbEndpoint(address: string, signal?: AbortSignal): Promise<boolean> {
  const endpoint = tcpEndpoint(address);
  if (!endpoint || signal?.aborted) return false;
  return new Promise((resolve) => {
    let socket: net.Socket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const done = (ready: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      socket?.destroy();
      resolve(ready);
    };
    const abort = () => done(false);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      socket = net.createConnection({ host: endpoint.host, port: endpoint.port });
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
      timer = setTimeout(() => done(false), 200);
      if (signal?.aborted) abort();
    } catch {
      done(false);
    }
  });
}

type TransportRun = (
  executable: string,
  args: string[],
  options: { timeout: number; signal?: AbortSignal },
) => Promise<string>;

const runAdb: TransportRun = (executable, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        timeout: options.timeout,
        signal: options.signal,
        killSignal: 'SIGKILL',
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) reject(Object.assign(error, { stdout, stderr }));
        else resolve(stdout);
      },
    );
  });

/** Register one TCP transport and verify its actual state before creating a controller. */
export async function connectAdbTransport(
  executable: string,
  address: string,
  signal?: AbortSignal,
  options: { run?: TransportRun } = {},
): Promise<void> {
  signal?.throwIfAborted();
  const endpoint = tcpEndpoint(address);
  if (!endpoint) throw new Error('ADB 设备必须使用有效 TCP 地址');
  const execute = options.run ?? runAdb;
  const requestOptions = { timeout: 3000, signal };
  await execute(executable, ['connect', endpoint.address], requestOptions);
  signal?.throwIfAborted();
  const output = await execute(executable, ['devices', '-l'], requestOptions);
  signal?.throwIfAborted();
  const identity = deviceLockAddress(endpoint.address);
  const matches = parseAdbDevices(output).filter(
    (device) => deviceLockAddress(device.address) === identity,
  );
  if (!matches.some((device) => device.adbState === 'device'))
    throw new Error(`ADB 设备尚未就绪（${matches[0]?.adbState ?? '未出现在设备列表中'}）`);
}

/** Local endpoint probes cannot establish readiness on a remote ADB server. */
export function localAdbServer(env: Record<string, string | undefined> = process.env): boolean {
  try {
    const identity = adbServerIdentity(env);
    return identity.startsWith('localfilesystem:') || /^tcp:127\.0\.0\.1:\d+$/.test(identity);
  } catch {
    return false;
  }
}
