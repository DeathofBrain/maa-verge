import { afterEach, expect, test } from 'bun:test';
import net from 'node:net';
import {
  adbDeviceServerIdentity,
  observeAdbDevices,
  type AdbDeviceObserver,
} from '../src/infrastructure/native/connection-health';
import type { AdbDevice } from '../src/infrastructure/native/adb';

const servers: net.Server[] = [],
  sockets = new Set<net.Socket>(),
  observers: AdbDeviceObserver[] = [];
const request = '0012host:track-devices';
const frame = (body: string | Buffer) => {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return Buffer.concat([Buffer.from(bytes.length.toString(16).padStart(4, '0')), bytes]);
};
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function server(react: (socket: net.Socket) => void, host = '127.0.0.1') {
  const received: string[] = [];
  const listener = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('ascii');
      if (buffer.length >= request.length && !received.includes(buffer)) {
        received.push(buffer);
        react(socket);
      }
    });
    socket.on('error', () => {});
  });
  servers.push(listener);
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, host, resolve);
  });
  const address = listener.address() as net.AddressInfo;
  return { identity: `tcp:${host.includes(':') ? `[${host}]` : host}:${address.port}`, received };
}
function observe(identity: string, onDevices: (devices: AdbDevice[]) => void, onClose = () => {}) {
  const observer = observeAdbDevices(onDevices, onClose, { serverIdentity: identity });
  observers.push(observer);
  return observer;
}
afterEach(async () => {
  await Promise.all(observers.splice(0).map((observer) => observer.close()));
  for (const socket of sockets) socket.destroy();
  await Promise.all(
    servers
      .splice(0)
      .map((listener) => new Promise<void>((resolve) => listener.close(() => resolve()))),
  );
});

test('preserves configured IPv6 and DNS dial addresses while validating server settings', () => {
  expect(adbDeviceServerIdentity({})).toBe('tcp:localhost:5037');
  expect(adbDeviceServerIdentity({ ADB_SERVER_SOCKET: 'tcp:05038' })).toBe('tcp:localhost:5038');
  expect(adbDeviceServerIdentity({ ADB_SERVER_SOCKET: 'tcp:[::1]:05039' })).toBe('tcp:[::1]:5039');
  expect(adbDeviceServerIdentity({ ADB_SERVER_SOCKET: 'tcp:localhost:5038' })).toBe(
    'tcp:localhost:5038',
  );
  expect(
    adbDeviceServerIdentity({ ANDROID_ADB_SERVER_ADDRESS: '::1', ANDROID_ADB_SERVER_PORT: '5038' }),
  ).toBe('tcp:[::1]:5038');
  expect(adbDeviceServerIdentity({ ANDROID_ADB_SERVER_ADDRESS: '[::1]' })).toBe('tcp:[::1]:5037');
  expect(() => adbDeviceServerIdentity({ ADB_SERVER_SOCKET: 'tcp:host:invalid' })).toThrow();
});

test('subscribes once and receives full device lists, removals and empty snapshots', async () => {
  const snapshots: AdbDevice[][] = [],
    done = deferred();
  const fixture = await server((socket) => {
    socket.write(
      Buffer.concat([
        Buffer.from('OKAY'),
        frame('127.0.0.1:16384\tdevice\nemulator-5554\toffline\n'),
        frame('127.0.0.1:16384\tunauthorized\n'),
        frame(''),
      ]),
    );
  });
  observe(fixture.identity, (devices) => {
    snapshots.push(devices);
    if (snapshots.length === 3) done.resolve();
  });
  await done.promise;
  expect(fixture.received).toEqual([request]);
  expect(snapshots).toEqual([
    [
      { address: '127.0.0.1:16384', name: '127.0.0.1:16384', adbState: 'device' },
      { address: 'emulator-5554', name: 'emulator-5554', adbState: 'offline' },
    ],
    [{ address: '127.0.0.1:16384', name: '127.0.0.1:16384', adbState: 'unauthorized' }],
    [],
  ]);
});

test('parses handshake, length prefixes and bodies across socket fragments', async () => {
  const done = deferred<AdbDevice[]>();
  const fixture = await server((socket) => {
    const bytes = Buffer.concat([Buffer.from('OKAY'), frame('physical-serial\tdevice\n')]);
    let index = 0;
    const send = () => {
      if (socket.destroyed || index === bytes.length) return;
      socket.write(bytes.subarray(index, ++index));
      setImmediate(send);
    };
    send();
  });
  observe(fixture.identity, done.resolve);
  expect(await done.promise).toEqual([
    { address: 'physical-serial', name: 'physical-serial', adbState: 'device' },
  ]);
});

test('accepts non-ready ADB states and permission guidance without treating them as invalid lists', async () => {
  const done = deferred<AdbDevice[]>();
  const fixture = await server((socket) =>
    socket.write(
      Buffer.concat([
        Buffer.from('OKAY'),
        frame(
          'serial-a\tno permissions (user in plugdev group)\nserial-b\tauthorizing\nserial-c\trecovery\n',
        ),
      ]),
    ),
  );
  observe(fixture.identity, done.resolve);
  expect((await done.promise).map((device) => device.adbState)).toEqual([
    'no',
    'authorizing',
    'recovery',
  ]);
});

test('notifies once on a fragmented FAIL response without publishing a snapshot', async () => {
  let snapshots = 0,
    closes = 0;
  const done = deferred();
  const fixture = await server((socket) => {
    socket.write('FA');
    setImmediate(() =>
      socket.end(Buffer.concat([Buffer.from('IL'), frame('unknown host service')])),
    );
  });
  observe(
    fixture.identity,
    () => snapshots++,
    () => {
      closes++;
      done.resolve();
    },
  );
  await done.promise;
  expect(snapshots).toBe(0);
  expect(closes).toBe(1);
});

test.each([
  Buffer.from('NOPE'),
  Buffer.from([0xcf, 0x4b, 0x41, 0x59]),
  Buffer.from('OKAYzzzz'),
  Buffer.from([0x4f, 0x4b, 0x41, 0x59, 0xb0, 0x30, 0x30, 0x30]),
  Buffer.concat([Buffer.from('OKAY'), frame('malformed-line\n')]),
  Buffer.concat([Buffer.from('OKAY'), frame('serial device\n'), frame('')]),
  Buffer.concat([Buffer.from('OKAY'), frame('serial\tgarbage\n'), frame('')]),
  Buffer.concat([Buffer.from('OKAY'), frame('serial;unsafe\tdevice\n')]),
  Buffer.concat([Buffer.from('OKAY'), frame('serial\tdevice\nserial\toffline\n')]),
  Buffer.concat([Buffer.from('OKAY'), frame(Buffer.from([0xff, 0xfe]))]),
])('closes invalid protocol input without throwing or publishing devices: %s', async (bytes) => {
  let snapshots = 0;
  const done = deferred();
  const fixture = await server((socket) => socket.write(bytes));
  observe(fixture.identity, () => snapshots++, done.resolve);
  await done.promise;
  expect(snapshots).toBe(0);
});

test('closes oversized unread input', async () => {
  const done = deferred();
  let snapshots = 0;
  const fixture = await server((socket) => socket.write(Buffer.alloc(256 * 1024, 120)));
  observe(fixture.identity, () => snapshots++, done.resolve);
  await done.promise;
  expect(snapshots).toBe(0);
});

test('handles an unexpected socket close once', async () => {
  let closes = 0;
  const done = deferred();
  const fixture = await server((socket) => socket.end());
  const observer = observe(
    fixture.identity,
    () => {},
    () => {
      closes++;
      done.resolve();
    },
  );
  await done.promise;
  await observer.close();
  expect(closes).toBe(1);
});

test('connection refusal reports an observer error without publishing device removal', async () => {
  const fixture = await server(() => {});
  await new Promise<void>((resolve) => servers.at(-1)!.close(() => resolve()));
  const done = deferred();
  let snapshots = 0,
    closes = 0;
  observe(
    fixture.identity,
    () => snapshots++,
    () => {
      closes++;
      done.resolve();
    },
  );
  await done.promise;
  expect(snapshots).toBe(0);
  expect(closes).toBe(1);
});

test('intentional and repeated close wait for the socket and suppress onClose', async () => {
  let closes = 0;
  const ready = deferred();
  const fixture = await server((socket) =>
    socket.write(Buffer.concat([Buffer.from('OKAY'), frame('')])),
  );
  const observer = observe(
    fixture.identity,
    () => ready.resolve(),
    () => closes++,
  );
  await ready.promise;
  await Promise.all([observer.close(), observer.close()]);
  expect(closes).toBe(0);
});

test('closes safely when a device callback throws, including a throwing close callback', async () => {
  const done = deferred();
  const fixture = await server((socket) =>
    socket.write(Buffer.concat([Buffer.from('OKAY'), frame('')])),
  );
  observe(
    fixture.identity,
    () => {
      throw new Error('synthetic device callback');
    },
    () => {
      done.resolve();
      throw new Error('synthetic close callback');
    },
  );
  await done.promise;
});

test.each([
  'localabstract:adb',
  'tcp:host:0',
  'tcp:host:65536',
  'tcp:host:invalid',
  'localfilesystem:',
])('unsupported endpoints fail asynchronously and can be closed: %s', async (identity) => {
  const done = deferred();
  let returned = false;
  const observer = observe(
    identity,
    () => {
      throw new Error('must not publish');
    },
    () => {
      expect(returned).toBe(true);
      done.resolve();
    },
  );
  returned = true;
  await done.promise;
  await observer.close();
});

test('supports bracketed IPv6 endpoints', async () => {
  const done = deferred<AdbDevice[]>();
  const fixture = await server(
    (socket) => socket.write(Buffer.concat([Buffer.from('OKAY'), frame('')])),
    '::1',
  );
  observe(adbDeviceServerIdentity({ ADB_SERVER_SOCKET: fixture.identity }), done.resolve);
  expect(await done.promise).toEqual([]);
});

test.each([false, true])(
  'bounds an incomplete handshake or first snapshot (OKAY=%s)',
  async (okay) => {
    const done = deferred();
    const fixture = await server((socket) => {
      if (okay) socket.write('OKAY0004x');
    });
    const started = performance.now();
    observe(
      fixture.identity,
      () => {
        throw new Error('must not publish');
      },
      done.resolve,
    );
    await done.promise;
    expect(performance.now() - started).toBeLessThan(5000);
  },
  6000,
);

test('a completed first snapshot disables the startup timeout without sending more requests', async () => {
  const first = deferred(),
    next = deferred();
  let peer!: net.Socket,
    snapshots = 0,
    closes = 0;
  const fixture = await server((socket) => {
    peer = socket;
    socket.write(Buffer.concat([Buffer.from('OKAY'), frame('')]));
  });
  observe(
    fixture.identity,
    () => {
      if (++snapshots === 1) first.resolve();
      else next.resolve();
    },
    () => closes++,
  );
  await first.promise;
  await new Promise((resolve) => setTimeout(resolve, 3200));
  peer.write(frame('serial\tdevice\n'));
  await next.promise;
  expect(closes).toBe(0);
  expect(fixture.received).toEqual([request]);
}, 6000);
