import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import net from 'node:net';
import {
  connectAdbTransport,
  localAdbServer,
  probeAdbEndpoint,
} from '../src/infrastructure/native/adb-transport';

const servers: net.Server[] = [];
const sockets = new Set<net.Socket>();
afterEach(async () => {
  mock.restore();
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function listener() {
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, port: (server.address() as net.AddressInfo).port };
}

test('probes listening TCP endpoints and standard emulator aliases without running ADB', async () => {
  const { port } = await listener();
  expect(await probeAdbEndpoint(`127.0.0.1:${port}`)).toBe(true);
  expect(await probeAdbEndpoint(`emulator-${port - 1}`)).toBe(true);
});

test('a closed loopback endpoint is not ready', async () => {
  const { server, port } = await listener();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  expect(await probeAdbEndpoint(`127.0.0.1:${port}`)).toBe(false);
});

test.each([
  'physical-serial',
  '-host:5555',
  '127.0.0.1:0',
  '127.0.0.1:65536',
  'emulator-65535',
  '::1:5555',
  '[not-ipv6]:5555',
  '127.0.0.1:5555;echo',
])('rejects non-TCP or invalid endpoints without dialing: %s', async (address) => {
  const dial = spyOn(net, 'createConnection');
  expect(await probeAdbEndpoint(address)).toBe(false);
  expect(dial).not.toHaveBeenCalled();
  await expect(connectAdbTransport('synthetic-adb', address)).rejects.toThrow('有效 TCP');
});

test('preserves an IPv6 dial address instead of replacing it with the lease alias', async () => {
  const socket = new net.Socket();
  const dial = spyOn(net, 'createConnection').mockReturnValue(socket);
  const pending = probeAdbEndpoint('[::1]:5555');
  expect(dial).toHaveBeenCalledWith({ host: '::1', port: 5555 });
  socket.emit('connect');
  expect(await pending).toBe(true);
  expect(socket.destroyed).toBe(true);
});

test('aborting a pending probe destroys its socket and settles without a late success', async () => {
  const socket = new net.Socket();
  spyOn(net, 'createConnection').mockReturnValue(socket);
  const controller = new AbortController();
  const pending = probeAdbEndpoint('127.0.0.1:5555', controller.signal);
  controller.abort();
  socket.emit('connect');
  expect(await pending).toBe(false);
  expect(socket.destroyed).toBe(true);
});

test('an already cancelled probe never opens a socket', async () => {
  const controller = new AbortController();
  controller.abort();
  const dial = spyOn(net, 'createConnection');
  expect(await probeAdbEndpoint('127.0.0.1:5555', controller.signal)).toBe(false);
  expect(dial).not.toHaveBeenCalled();
});

test('a probe that never connects times out and closes its socket', async () => {
  const socket = new net.Socket();
  spyOn(net, 'createConnection').mockReturnValue(socket);
  expect(await probeAdbEndpoint('127.0.0.1:5555')).toBe(false);
  expect(socket.destroyed).toBe(true);
});

test.each(['localhost:5555', '[::1]:5555', 'emulator-5554'])(
  'registers a standard alias and confirms the actual ADB state: %s',
  async (address) => {
    const calls: { executable: string; args: string[]; timeout: number }[] = [];
    await connectAdbTransport('synthetic-adb', address, undefined, {
      run: async (executable, args, options) => {
        calls.push({ executable, args, timeout: options.timeout });
        return args[0] === 'connect'
          ? 'connected to 127.0.0.1:5555'
          : 'List of devices attached\n127.0.0.1:5555 device model:Synthetic\n';
      },
    });
    expect(calls).toEqual([
      {
        executable: 'synthetic-adb',
        args: ['connect', address === 'emulator-5554' ? '127.0.0.1:5555' : address],
        timeout: 3000,
      },
      { executable: 'synthetic-adb', args: ['devices', '-l'], timeout: 3000 },
    ]);
  },
);

test.each(['offline', 'unauthorized', 'missing'])(
  'does not accept a connected message when the target is %s',
  async (state) => {
    await expect(
      connectAdbTransport('synthetic-adb', '127.0.0.1:5555', undefined, {
        run: async (_executable, args) =>
          args[0] === 'connect'
            ? 'already connected to 127.0.0.1:5555'
            : `List of devices attached\n127.0.0.1:5557 device\n${state === 'missing' ? '' : `emulator-5554 ${state}\n`}`,
      }),
    ).rejects.toThrow('尚未就绪');
  },
);

test('a ready target is accepted based on its current state rather than connect stdout', async () => {
  await connectAdbTransport('synthetic-adb', '[2001:db8::1]:5555', undefined, {
    run: async (_executable, args) => {
      if (args[0] === 'connect') {
        expect(args).toEqual(['connect', '[2001:db8::1]:5555']);
        return 'synthetic connection diagnostic';
      }
      return 'List of devices attached\n[2001:db8::1]:5555 device\n';
    },
  });
});

test('cancellation after transport registration prevents subsequent commands', async () => {
  const controller = new AbortController();
  let calls = 0;
  await expect(
    connectAdbTransport('synthetic-adb', '127.0.0.1:5555', controller.signal, {
      run: async (_executable, _args, options) => {
        calls++;
        expect(options.signal).toBe(controller.signal);
        controller.abort();
        return 'connected to 127.0.0.1:5555';
      },
    }),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});

test('cancellation after verification rejects a late ready result', async () => {
  const controller = new AbortController();
  await expect(
    connectAdbTransport('synthetic-adb', '127.0.0.1:5555', controller.signal, {
      run: async (_executable, args) => {
        if (args[0] === 'devices') controller.abort();
        return args[0] === 'devices'
          ? 'List of devices attached\n127.0.0.1:5555 device\n'
          : 'connected to 127.0.0.1:5555';
      },
    }),
  ).rejects.toThrow();
});

test('transport command failures propagate without issuing further commands', async () => {
  let calls = 0;
  await expect(
    connectAdbTransport('synthetic-adb', '127.0.0.1:5555', undefined, {
      run: async () => {
        calls++;
        throw new Error('synthetic ADB execution denied');
      },
    }),
  ).rejects.toThrow('execution denied');
  expect(calls).toBe(1);
});

test('distinguishes local server aliases from remote or unsupported endpoints', () => {
  for (const socket of [
    undefined,
    'tcp:5037',
    'tcp:localhost:05037',
    'tcp:127.0.0.1:5038',
    'tcp:[::1]:5037',
    `localfilesystem:${process.cwd()}/synthetic-adb-socket`,
  ]) {
    expect(localAdbServer({ ADB_SERVER_SOCKET: socket })).toBe(true);
  }
  for (const socket of [
    'tcp:remote.example:5037',
    'tcp:[2001:db8::1]:5037',
    'localabstract:adb',
    'tcp:127.0.0.1:0',
  ]) {
    expect(localAdbServer({ ADB_SERVER_SOCKET: socket })).toBe(false);
  }
});
