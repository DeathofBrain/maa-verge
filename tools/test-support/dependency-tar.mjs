/** Build-only XZ fallback for Windows system tar builds without liblzma. */
import { execFile, spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const xzMagic = Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);

/** Redirect large decoder output to an exclusively reserved file, without buffering it. */
export async function decodeToFile(
  program,
  args,
  destination,
  { timeoutMs = 180_000, maxBytes = 4 * 1024 ** 3 } = {},
) {
  const file = await open(destination, 'wx', 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(program, args, {
        windowsHide: true,
        stdio: ['ignore', file.fd, 'pipe'],
      });
      let failure;
      let stderr = '';
      let checking = false;
      const stop = (error) => {
        failure ??= error;
        child.kill();
      };
      const timeout = setTimeout(
        () => stop(new Error('Dependency XZ decoder exceeded its time limit')),
        timeoutMs,
      );
      const monitor = setInterval(async () => {
        if (checking) return;
        checking = true;
        try {
          if ((await file.stat()).size > maxBytes)
            stop(new Error('Decoded dependency TAR exceeds its size limit'));
        } catch (error) {
          stop(error);
        } finally {
          checking = false;
        }
      }, 50);
      child.stderr.on('data', (chunk) => {
        if (Buffer.byteLength(stderr) + chunk.length > 8 * 1024 ** 2)
          stop(new Error('Dependency XZ decoder diagnostics exceed their size limit'));
        else stderr += chunk.toString();
      });
      child.once('error', (error) => {
        failure ??= error;
      });
      child.once('close', (code, signal) => {
        clearTimeout(timeout);
        clearInterval(monitor);
        if (failure) reject(failure);
        else if (code !== 0)
          reject(new Error(`Dependency XZ decoder failed (${code ?? signal}): ${stderr.trim()}`));
        else resolve();
      });
    });
    const info = await file.stat();
    if (info.size === 0 || info.size > maxBytes)
      throw new Error('Decoded dependency TAR is empty or exceeds its size limit');
  } finally {
    await file.close();
  }
}

export async function withDependencyTar(
  archive,
  stage,
  tar,
  consume,
  {
    platform = process.platform,
    environment = process.env,
    run = execute,
    decode = decodeToFile,
  } = {},
) {
  const file = await open(archive, 'r');
  const header = Buffer.alloc(xzMagic.length);
  try {
    await file.read(header, 0, header.length, 0);
  } finally {
    await file.close();
  }
  if (platform !== 'win32' || !header.equals(xzMagic)) return await consume(archive);
  const version = await run(tar, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 8 * 1024 ** 2,
  });
  if (/\bliblzma\b/i.test(version.stdout)) return await consume(archive);
  const decoder =
    environment.MAAVERGE_7ZIP_PATH ||
    (environment.ProgramFiles && path.join(environment.ProgramFiles, '7-Zip', '7z.exe'));
  const available = decoder && (await lstat(decoder).catch(() => undefined))?.isFile();
  if (!available)
    throw new Error(
      'Windows system tar lacks XZ support. Install 7-Zip or set MAAVERGE_7ZIP_PATH to its executable before building.',
    );
  await mkdir(stage, { recursive: true });
  const temporary = await mkdtemp(path.join(stage, '.dependency-tar-'));
  try {
    const decoded = path.join(temporary, 'dependencies.tar');
    await decode(decoder, ['x', '-so', '--', archive], decoded);
    return await consume(decoded);
  } finally {
    // This directory was exclusively reserved inside the current build's stage.
    await rm(temporary, { recursive: true, force: true });
  }
}
