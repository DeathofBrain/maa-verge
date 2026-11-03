import { expect, test } from 'bun:test';
import { detectAvdSerial, type AvdProbeRun } from '@backend/infrastructure/native/avd-detection';

const env = { ADB_SERVER_SOCKET: 'tcp:127.0.0.1:5037' };
function fixture(replies: string[] = ['1\n', 'synthetic_avd\n', 'synthetic_avd\r\nOK\r\n']) {
  const calls: { executable: string; args: string[]; timeout: number; signal?: AbortSignal }[] = [];
  const run: AvdProbeRun = async (executable, args, options) => {
    calls.push({ executable, args, ...options });
    return replies[calls.length - 1] ?? '';
  };
  return { calls, run, env };
}

test.each(['127.0.0.1:20001', 'localhost:20001', '[::1]:20001'])(
  'verifies QEMU and matching console identity before accepting local TCP alias %s',
  async (address) => {
    const f = fixture();
    expect(await detectAvdSerial('synthetic-adb', address, undefined, f)).toBe('emulator-20000');
    expect(f.calls.map((call) => call.args)).toEqual([
      ['-s', address, 'shell', 'getprop', 'ro.kernel.qemu'],
      ['-s', address, 'shell', 'getprop', 'ro.boot.qemu.avd_name'],
      ['-s', 'emulator-20000', 'emu', 'avd', 'name'],
    ]);
    expect(f.calls.every((call) => call.executable === 'synthetic-adb')).toBe(true);
    expect(f.calls.every((call) => call.timeout > 0 && call.timeout <= 3000)).toBe(true);
  },
);

test('supports legacy AVD properties without accepting unverified console names', async () => {
  const f = fixture(['', '1', '', 'legacy_avd', 'legacy_avd\nOK']);
  expect(await detectAvdSerial('synthetic-adb', '127.0.0.1:20001', undefined, f)).toBe(
    'emulator-20000',
  );
  expect(f.calls.map((call) => call.args.at(-1))).toEqual([
    'ro.kernel.qemu',
    'ro.boot.qemu',
    'ro.boot.qemu.avd_name',
    'ro.kernel.qemu.avd_name',
    'name',
  ]);
});

test.each([
  '192.0.2.1:20001',
  'remote.example:20001',
  '[2001:db8::1]:20001',
  '127.0.0.2:20001',
  'physical-serial',
  '127.0.0.1:1',
  '127.0.0.1:0',
  '127.0.0.1:65536',
  '127.0.0.1:020001',
  '127.0.0.1:20001;echo',
  '127.0.0.1:20001\n',
])('never derives console identity from an unsupported address: %s', async (address) => {
  const f = fixture();
  expect(await detectAvdSerial('synthetic-adb', address, undefined, f)).toBeUndefined();
  expect(f.calls).toEqual([]);
});

test('an existing canonical emulator identity needs no ADB process or port conversion', async () => {
  const f = fixture();
  expect(await detectAvdSerial('synthetic-adb', 'Emulator-20000', undefined, f)).toBe(
    'emulator-20000',
  );
  expect(await detectAvdSerial('synthetic-adb', 'emulator-65535', undefined, f)).toBeUndefined();
  expect(f.calls).toEqual([]);
});

test.each(['tcp:192.0.2.1:5037', 'tcp:remote.example:5037', 'unsupported:5037'])(
  'does not map a local-looking target through remote or invalid ADB server %s',
  async (identity) => {
    const f = fixture();
    expect(
      await detectAvdSerial('synthetic-adb', '127.0.0.1:20001', undefined, {
        ...f,
        env: { ADB_SERVER_SOCKET: identity },
      }),
    ).toBeUndefined();
    expect(f.calls).toEqual([]);
  },
);

test.each(
  [
    ['0'],
    ['unknown'],
    ['1', ''],
    ['1', 'bad\nname'],
    ['1', 'name with spaces'],
    ['1', 'synthetic_avd', 'another_avd\nOK'],
    ['1', 'synthetic_avd', 'synthetic_avd'],
    ['1', 'synthetic_avd', 'synthetic_avd\nKO'],
    ['1', 'synthetic_avd', 'synthetic_avd\nOK\nextra'],
    ['1', 'synthetic_avd', 'synthetic_avd\0\nOK'],
    ['1', 'x'.repeat(5000)],
  ].map((replies) => ({ replies })),
)('rejects absent, malformed or mismatched QEMU/console evidence: %j', async ({ replies }) => {
  const f = fixture(replies);
  expect(await detectAvdSerial('synthetic-adb', '127.0.0.1:20001', undefined, f)).toBeUndefined();
});

test('failed read-only probes leave automatic capture unresolved without additional commands', async () => {
  let calls = 0;
  expect(
    await detectAvdSerial('synthetic-adb', '127.0.0.1:20001', undefined, {
      env,
      run: async () => {
        calls++;
        throw new Error('synthetic timeout');
      },
    }),
  ).toBeUndefined();
  expect(calls).toBe(1);
});

test('cancellation aborts the enclosing handoff instead of turning into an automatic fallback', async () => {
  const controller = new AbortController();
  const f = fixture();
  controller.abort();
  await expect(
    detectAvdSerial('synthetic-adb', '127.0.0.1:20001', controller.signal, f),
  ).rejects.toThrow();
  expect(f.calls).toEqual([]);
  const during = new AbortController();
  let calls = 0;
  await expect(
    detectAvdSerial('synthetic-adb', '127.0.0.1:20001', during.signal, {
      env,
      run: async (_executable, _args, options) => {
        expect(options.signal).toBe(during.signal);
        calls++;
        during.abort();
        return '1';
      },
    }),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});
