import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import * as childProcess from 'node:child_process';
import net from 'node:net';
import { ensureAvdTransport } from '@backend/infrastructure/native/avd-transport';

const servers: net.Server[] = [];
const sockets = new Set<net.Socket>();
const forbidProcess = Object.assign(
  () => {
    throw new Error('child processes are prohibited');
  },
  {
    __promisify__: () => {
      throw new Error('child processes are prohibited');
    },
  },
);
const frame = (body: string | Buffer, status = 'OKAY') => {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return Buffer.concat([Buffer.from(status + bytes.length.toString(16).padStart(4, '0')), bytes]);
};
async function server(react: (service: string, socket: net.Socket, index: number) => void) {
  const received: string[] = [];
  const listener = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = Number.parseInt(buffer.subarray(0, 4).toString('ascii'), 16);
      if (buffer.length < length + 4) return;
      const service = buffer.subarray(4).toString('ascii');
      received.push(service);
      react(service, socket, received.length - 1);
    });
  });
  servers.push(listener);
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  return {
    identity: `tcp:127.0.0.1:${(listener.address() as net.AddressInfo).port}`,
    listener,
    received,
  };
}
afterEach(async () => {
  mock.restore();
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await Promise.all(
    servers
      .splice(0)
      .map((listener) => new Promise<void>((resolve) => listener.close(() => resolve()))),
  );
});

test('an exact ready serial requires no registration and never starts a child process', async () => {
  const processes = [
    spyOn(childProcess, 'spawn').mockImplementation(forbidProcess),
    spyOn(childProcess, 'spawnSync').mockImplementation(forbidProcess),
    spyOn(childProcess, 'exec').mockImplementation(forbidProcess),
    spyOn(childProcess, 'execSync').mockImplementation(forbidProcess),
    spyOn(childProcess, 'execFile').mockImplementation(forbidProcess),
    spyOn(childProcess, 'execFileSync').mockImplementation(forbidProcess),
    spyOn(childProcess, 'fork').mockImplementation(forbidProcess),
    spyOn(Bun, 'spawn').mockImplementation(forbidProcess),
    spyOn(Bun, 'spawnSync').mockImplementation(forbidProcess),
  ];
  const fixture = await server((_service, socket) =>
    socket.end(
      frame('127.0.0.1:20001\tdevice\nemulator-20000\tdevice product:synthetic transport_id:1\n'),
    ),
  );
  await ensureAvdTransport('Emulator-20000', undefined, { serverIdentity: fixture.identity });
  expect(fixture.received).toEqual(['host:devices-l']);
  processes.forEach((process) => expect(process).not.toHaveBeenCalled());
});

test('accepts AOSP space-padded devices-l output for an already ready serial without registration', async () => {
  const fixture = await server((_service, socket) =>
    socket.end(
      frame(
        '127.0.0.1:20001        device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:5\n' +
          'emulator-20000         device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:6\n',
      ),
    ),
  );
  await ensureAvdTransport('emulator-20000', undefined, { serverIdentity: fixture.identity });
  expect(fixture.received).toEqual(['host:devices-l']);
});

test('registers from the observed TCP devices-l output and accepts the padded emulator reply', async () => {
  const fixture = await server((service, socket, index) =>
    socket.end(
      frame(
        service === 'host:devices-l'
          ? index === 0
            ? '127.0.0.1:20001        device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:5\n'
            : 'emulator-20000         device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:6\n'
          : 'Connected to emulator on ports 20000,20001',
      ),
    ),
  );
  await ensureAvdTransport('emulator-20000', undefined, { serverIdentity: fixture.identity });
  expect(fixture.received).toEqual([
    'host:devices-l',
    'host:connect:emu:20000,20001',
    'host:devices-l',
  ]);
});

test('accepts mixed space and tab separators alongside no-permissions device records', async () => {
  const fixture = await server((_service, socket) =>
    socket.end(
      frame(
        'usb-unavailable        no permissions (user in plugdev group) transport_id:8\n' +
          '127.0.0.1:20001\tdevice product:synthetic transport_id:5\n' +
          'emulator-20000 \t  device product:synthetic transport_id:6\n',
      ),
    ),
  );
  await ensureAvdTransport('emulator-20000', undefined, { serverIdentity: fixture.identity });
  expect(fixture.received).toEqual(['host:devices-l']);
});

test.each(['Emulator-20000', 'emulator-200000', 'emulator-20000-extra'])(
  'requires the exact original lowercase serial instead of accepting %s in padded records',
  async (otherSerial) => {
    const fixture = await server((service, socket, index) =>
      socket.end(
        frame(
          service === 'host:devices-l'
            ? index < 3
              ? `${otherSerial}        device product:synthetic transport_id:5\n`
              : 'emulator-20000         device product:synthetic transport_id:6\n'
            : 'Connected to emulator on ports 20000,20001',
        ),
      ),
    );
    await ensureAvdTransport('emulator-20000', undefined, { serverIdentity: fixture.identity });
    expect(fixture.received).toEqual([
      'host:devices-l',
      'host:connect:emu:20000,20001',
      'host:devices-l',
      'host:devices-l',
    ]);
  },
);

test('registration uses only the existing smart socket and never starts a child process', async () => {
  const processes = [
    spyOn(childProcess, 'execFile').mockImplementation(forbidProcess),
    spyOn(childProcess, 'spawn').mockImplementation(forbidProcess),
    spyOn(Bun, 'spawn').mockImplementation(forbidProcess),
  ];
  const fixture = await server((service, socket, index) =>
    socket.end(
      frame(
        service === 'host:devices-l'
          ? index === 0
            ? '127.0.0.1:20001\tdevice\n'
            : 'emulator-20000\tdevice\n'
          : 'Connected to emulator on ports 20000,20001',
      ),
    ),
  );
  await ensureAvdTransport('emulator-20000', undefined, { serverIdentity: fixture.identity });
  processes.forEach((process) => expect(process).not.toHaveBeenCalled());
  expect(fixture.received).toHaveLength(3);
});

test('uses the configured existing server when no identity override is supplied', async () => {
  const fixture = await server((_service, socket) => socket.end(frame('emulator-20000\tdevice\n')));
  const previous = process.env.ADB_SERVER_SOCKET;
  process.env.ADB_SERVER_SOCKET = fixture.identity;
  try {
    await ensureAvdTransport('emulator-20000');
    expect(fixture.received).toEqual(['host:devices-l']);
  } finally {
    if (previous === undefined) delete process.env.ADB_SERVER_SOCKET;
    else process.env.ADB_SERVER_SOCKET = previous;
  }
});

test.each([1, 20000, 20001, 65534])(
  'registers console %s in the selected server, then waits for the exact serial',
  async (consolePort) => {
    let lists = 0;
    const fixture = await server((service, socket) => {
      if (service === 'host:devices-l')
        socket.end(
          frame(
            ++lists < 3
              ? `127.0.0.1:${consolePort + 1}\tdevice\nemulator-${consolePort}\toffline\n`
              : `emulator-${consolePort}\tdevice\n`,
          ),
        );
      else socket.end(frame(`Connected to emulator on ports ${consolePort},${consolePort + 1}`));
    });
    await ensureAvdTransport(`emulator-${consolePort}`, undefined, {
      serverIdentity: fixture.identity,
    });
    expect(fixture.received).toEqual([
      'host:devices-l',
      `host:connect:emu:${consolePort},${consolePort + 1}`,
      'host:devices-l',
      'host:devices-l',
    ]);
  },
);

test('accepts already registered replies and parses every response across byte fragments', async () => {
  const fixture = await server((service, socket, index) => {
    const body = service.startsWith('host:connect:')
      ? 'Emulator already registered on port 20001'
      : index === 0
        ? ''
        : 'emulator-20000\tdevice\n';
    const bytes = frame(body);
    let offset = 0;
    const send = () => {
      if (socket.destroyed || offset === bytes.length) return;
      socket.write(bytes.subarray(offset, ++offset));
      setImmediate(send);
    };
    send();
  });
  await ensureAvdTransport('emulator-20000', undefined, { serverIdentity: fixture.identity });
  expect(fixture.received).toEqual([
    'host:devices-l',
    'host:connect:emu:20000,20001',
    'host:devices-l',
  ]);
});

test.each([
  '127.0.0.1:20001',
  'physical-serial',
  'emulator-0',
  'emulator-65535',
  'emulator-65536',
  'emulator-02000',
  'emulator-20000;echo',
  ' emulator-20000',
  'emulator-20000\n',
])('rejects invalid or noncanonical serials before dialing: %s', async (address) => {
  const dial = spyOn(net, 'createConnection');
  await expect(ensureAvdTransport(address)).rejects.toThrow('emulator-N');
  expect(dial).not.toHaveBeenCalled();
});

test.each([
  'tcp:192.0.2.10:5037',
  'tcp:remote.example:5037',
  'tcp:[2001:db8::1]:5037',
  'tcp:127.0.0.1:0',
  'tcp:localhost:65536',
  'tcp:localhost:invalid',
  'unsupported:5037',
  'localfilesystem:',
])('rejects remote or invalid servers before dialing: %s', async (serverIdentity) => {
  const dial = spyOn(net, 'createConnection');
  await expect(ensureAvdTransport('emulator-20000', undefined, { serverIdentity })).rejects.toThrow(
    '本机 ADB server',
  );
  expect(dial).not.toHaveBeenCalled();
});

test('a server refusal never starts a replacement server', async () => {
  const fixture = await server(() => {});
  await new Promise<void>((resolve) => fixture.listener.close(() => resolve()));
  await expect(
    ensureAvdTransport('emulator-20000', undefined, {
      serverIdentity: fixture.identity,
    }),
  ).rejects.toThrow('无法连接现有本机 ADB server');
  expect(fixture.received).toEqual([]);
});

test.each([
  Buffer.from('NOPE'),
  Buffer.from('OKAYzzzz'),
  Buffer.from('OKAY0000extra'),
  frame('serial \n'),
  frame('serial\tgarbage\n'),
  frame('serial\tno garbage\n'),
  frame('serial;unsafe\tdevice\n'),
  frame('emulator-20000\tdevice\nemulator-20000\toffline\n'),
  frame(Buffer.from([0xff, 0xfe])),
  Buffer.alloc(70 * 1024, 120),
])('rejects invalid ADB protocol or device lists: %s', async (bytes) => {
  const fixture = await server((_service, socket) => socket.end(bytes));
  await expect(
    ensureAvdTransport('emulator-20000', undefined, {
      serverIdentity: fixture.identity,
    }),
  ).rejects.toThrow();
  expect(fixture.received).toEqual(['host:devices-l']);
});

test.each(['host:devices-l', 'host:connect:emu:20000,20001'])(
  'reports a FAIL response from %s',
  async (failedService) => {
    const fixture = await server((service, socket) =>
      socket.end(service === failedService ? frame('synthetic denial', 'FAIL') : frame('')),
    );
    await expect(
      ensureAvdTransport('emulator-20000', undefined, {
        serverIdentity: fixture.identity,
      }),
    ).rejects.toThrow('ADB server 拒绝 AVD 请求：synthetic denial');
  },
);

test('reports an emulator registration error without claiming a connection', async () => {
  const fixture = await server((service, socket) =>
    socket.end(
      frame(
        service === 'host:devices-l'
          ? ''
          : 'Could not connect to emulator on ports 20000,20001: synthetic error',
      ),
    ),
  );
  await expect(
    ensureAvdTransport('emulator-20000', undefined, {
      serverIdentity: fixture.identity,
    }),
  ).rejects.toThrow('ADB server 未能登记 AVD 模拟器');
});

test('an already cancelled request never dials the server', async () => {
  const controller = new AbortController();
  controller.abort();
  const dial = spyOn(net, 'createConnection');
  await expect(ensureAvdTransport('emulator-20000', controller.signal)).rejects.toThrow('已取消');
  expect(dial).not.toHaveBeenCalled();
});

test('cancels a partial response and closes the socket', async () => {
  const controller = new AbortController();
  let closed!: Promise<void>;
  const fixture = await server((_service, socket) => {
    closed = new Promise<void>((resolve) => socket.once('close', resolve));
    socket.write('OKAY0010partial');
    controller.abort();
  });
  await expect(
    ensureAvdTransport('emulator-20000', controller.signal, {
      serverIdentity: fixture.identity,
    }),
  ).rejects.toThrow('已取消');
  await closed;
});

test('cancels while waiting for asynchronous registration without issuing more requests', async () => {
  const controller = new AbortController();
  const fixture = await server((service, socket, index) => {
    socket.end(
      frame(service === 'host:devices-l' ? '' : 'Connected to emulator on ports 20000,20001'),
    );
    if (index === 2) setTimeout(() => controller.abort(), 10);
  });
  await expect(
    ensureAvdTransport('emulator-20000', controller.signal, {
      serverIdentity: fixture.identity,
    }),
  ).rejects.toThrow('已取消');
  expect(fixture.received).toHaveLength(3);
});

test('another ready serial or a TCP alias cannot satisfy registration and times out', async () => {
  const fixture = await server((service, socket) =>
    socket.end(
      frame(
        service === 'host:devices-l'
          ? 'emulator-20002\tdevice\n127.0.0.1:20001\tdevice\nemulator-20000\tunauthorized\n'
          : 'Connected to emulator on ports 20000,20001',
      ),
    ),
  );
  const started = performance.now();
  await expect(
    ensureAvdTransport('emulator-20000', undefined, {
      serverIdentity: fixture.identity,
    }),
  ).rejects.toThrow('连接超时');
  expect(performance.now() - started).toBeLessThan(4500);
  expect(fixture.received.filter((service) => service.startsWith('host:connect:'))).toHaveLength(1);
});

test('an incomplete response fails when the existing server closes its socket', async () => {
  const fixture = await server((_service, socket) => socket.end('OKAY0010partial'));
  await expect(
    ensureAvdTransport('emulator-20000', undefined, {
      serverIdentity: fixture.identity,
    }),
  ).rejects.toThrow('响应不完整');
});

test('a stalled server response times out and closes the pending socket', async () => {
  let closed!: Promise<void>;
  const fixture = await server((_service, socket) => {
    closed = new Promise<void>((resolve) => socket.once('close', resolve));
    socket.write('OKAY0010partial');
  });
  await expect(
    ensureAvdTransport('emulator-20000', undefined, {
      serverIdentity: fixture.identity,
    }),
  ).rejects.toThrow('连接超时');
  await closed;
  expect(fixture.received).toEqual(['host:devices-l']);
});
