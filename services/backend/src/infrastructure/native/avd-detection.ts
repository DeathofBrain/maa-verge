import { execFile } from 'node:child_process';
import { normalizeDeviceAddress } from '@contracts/device-profiles';
import { localAdbServer } from './adb-transport';

export type AvdProbeRun = (
  executable: string,
  args: string[],
  options: { timeout: number; signal?: AbortSignal },
) => Promise<string>;

const runAdb: AvdProbeRun = (executable, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        ...options,
        killSignal: 'SIGKILL',
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 4096,
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });

/** Read-only identity verification; a TCP port alone never proves an AVD console alias. */
export async function detectAvdSerial(
  executable: string,
  address: string,
  signal?: AbortSignal,
  options: { run?: AvdProbeRun; env?: Record<string, string | undefined> } = {},
): Promise<string | undefined> {
  signal?.throwIfAborted();
  if (!localAdbServer(options.env)) return;
  if (/[\s\0]/.test(address)) return;
  address = normalizeDeviceAddress(address);
  const direct = /^emulator-([1-9]\d{0,4})$/.exec(address);
  if (direct) return Number(direct[1]) < 65535 ? address : undefined;
  const tcp = /^(?:127\.0\.0\.1|localhost|\[::1\]):([1-9]\d{0,4})$/.exec(address);
  if (!tcp) return;
  const port = Number(tcp[1]);
  if (port <= 1 || port > 65535) return;
  const serial = `emulator-${port - 1}`;
  const deadline = performance.now() + 3000;
  const run = options.run ?? runAdb;
  const query = async (args: string[]) => {
    signal?.throwIfAborted();
    const timeout = Math.ceil(deadline - performance.now());
    if (timeout <= 0) throw new Error('AVD 身份探测超时');
    const output = await run(executable, args, { timeout, signal });
    signal?.throwIfAborted();
    if (output.length > 4096 || /\0/.test(output)) throw new Error('AVD 身份响应无效');
    return output.trim();
  };
  try {
    const property = (name: string) => query(['-s', address, 'shell', 'getprop', name]);
    let qemu = await property('ro.kernel.qemu');
    if (!qemu) qemu = await property('ro.boot.qemu');
    if (qemu !== '1') return;
    let name = await property('ro.boot.qemu.avd_name');
    if (!name) name = await property('ro.kernel.qemu.avd_name');
    if (!/^[A-Za-z0-9_.-]{1,200}$/.test(name)) return;
    const consoleName = await query(['-s', serial, 'emu', 'avd', 'name']);
    const lines = consoleName.split(/\r?\n/);
    if (lines.length === 2 && lines[0] === name && lines[1] === 'OK') return serial;
  } catch {
    // Automatic screenshot selection may retain ordinary ADB candidates, but
    // cancellation must still abort the enclosing controller handoff.
    signal?.throwIfAborted();
  }
}
