import net from 'node:net';
import { adbServerIdentity, parseAdbDevices, type AdbDevice } from './adb';

const transportStates = new Set([
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

export interface AdbDeviceObserver {
  close(): Promise<void>;
}

/** Preserve the dial address; the lease identity deliberately folds loopback aliases. */
export function adbDeviceServerIdentity(
  env: Record<string, string | undefined> = process.env,
): string {
  const canonical = adbServerIdentity(env);
  if (!canonical.startsWith('tcp:')) return canonical;
  const configured =
    env.ADB_SERVER_SOCKET ||
    `tcp:${env.ANDROID_ADB_SERVER_ADDRESS || 'localhost'}:${env.ANDROID_ADB_SERVER_PORT || '5037'}`;
  const endpoint = configured.slice(4);
  const split = endpoint.lastIndexOf(':');
  const host =
    split < 0 ? 'localhost' : endpoint.slice(0, split).replace(/^\[|\]$/g, '') || 'localhost';
  const port = split < 0 ? Number(endpoint) : Number(endpoint.slice(split + 1));
  return `tcp:${host.includes(':') ? `[${host}]` : host}:${port}`;
}

/** Subscribe to the existing ADB server; never start a server or connect a device. */
export function observeAdbDevices(
  onDevices: (devices: AdbDevice[]) => void,
  onClose: () => void,
  options: { serverIdentity?: string } = {},
): AdbDeviceObserver {
  let socket: net.Socket | undefined;
  let intentional = false;
  let ended = false;
  let startup: ReturnType<typeof setTimeout> | undefined;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const finish = () => {
    if (ended) return;
    ended = true;
    clearTimeout(startup);
    resolveClosed();
    if (!intentional) {
      try {
        onClose();
      } catch {
        /* An observer callback must not crash the service. */
      }
    }
  };
  const fail = () => {
    if (socket) socket.destroy();
    else finish();
  };
  try {
    const identity = options.serverIdentity ?? adbDeviceServerIdentity();
    if (identity.startsWith('localfilesystem:') && identity.length > 'localfilesystem:'.length) {
      socket = net.createConnection({ path: identity.slice('localfilesystem:'.length) });
    } else {
      const match = /^tcp:(?:\[([^\]]+)\]|([^:]+)):(\d+)$/.exec(identity);
      const port = Number(match?.[3]);
      if (!match || port < 1 || port > 65535) throw new Error('Unsupported ADB server address');
      socket = net.createConnection({ host: match[1] ?? match[2], port });
    }
    socket.once('close', finish);
    socket.on('error', fail);
    startup = setTimeout(fail, 3000);
    socket.once('connect', () => {
      try {
        const request = 'host:track-devices';
        socket!.write(Buffer.from(request.length.toString(16).padStart(4, '0') + request, 'ascii'));
      } catch {
        fail();
      }
    });

    let buffer = Buffer.alloc(0);
    let stage: 'status' | 'length' | 'snapshot' | 'failure-length' | 'failure' = 'status';
    let expected = 0;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    socket.on('data', (chunk: Buffer) => {
      if (ended || intentional) return;
      try {
        // Four hex digits bound individual frames to 65,535 bytes. Also bound
        // unread input when several frames arrive in a single socket chunk.
        if (buffer.length + chunk.length > 128 * 1024) throw new Error('ADB input exceeds limit');
        buffer = Buffer.concat([buffer, chunk]);
        while (!ended && !intentional && !socket!.destroyed) {
          if (stage === 'status') {
            if (buffer.length < 4) return;
            const status = buffer.subarray(0, 4).toString('latin1');
            buffer = buffer.subarray(4);
            if (status === 'OKAY') stage = 'length';
            else if (status === 'FAIL') stage = 'failure-length';
            else throw new Error('Invalid ADB status');
          } else if (stage === 'length' || stage === 'failure-length') {
            if (buffer.length < 4) return;
            const length = buffer.subarray(0, 4).toString('latin1');
            if (!/^[0-9a-fA-F]{4}$/.test(length)) throw new Error('Invalid ADB frame length');
            expected = Number.parseInt(length, 16);
            buffer = buffer.subarray(4);
            stage = stage === 'length' ? 'snapshot' : 'failure';
          } else {
            if (buffer.length < expected) return;
            const body = buffer.subarray(0, expected);
            buffer = buffer.subarray(expected);
            if (stage === 'failure') {
              fail();
              return;
            }
            const output = decoder.decode(body);
            const devices = parseAdbDevices(output);
            const lines = output.split(/\r?\n/).filter((line) => line.trim());
            if (
              lines.some((line) => !/^[^\s]+\t\S[^\r\n]*$/.test(line)) ||
              lines.some((line) => {
                const state = line.slice(line.indexOf('\t') + 1).trim();
                return !transportStates.has(state) && !/^no permissions(?:\s+.*)?$/.test(state);
              }) ||
              devices.length !== lines.length ||
              new Set(devices.map((d) => d.address)).size !== devices.length
            ) {
              throw new Error('Invalid ADB device snapshot');
            }
            // A complete first snapshot establishes the subscription. Healthy
            // idle connections then remain silent without periodic queries.
            clearTimeout(startup);
            startup = undefined;
            stage = 'length';
            onDevices(devices);
          }
        }
      } catch {
        fail();
      }
    });
  } catch {
    // Do not invoke caller callbacks before the observer has been returned.
    queueMicrotask(fail);
  }
  return {
    async close() {
      intentional = true;
      fail();
      await closed;
    },
  };
}
