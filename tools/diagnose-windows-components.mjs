/** Bounded, read-only tar diagnostics for the pinned public MaaDeps archive. */
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(import.meta.url);
const output = path.join(root, 'build', 'windows-component-diagnostics');
const cache = path.join(root, '.cache', 'ci', 'windows-component-diagnostics');
const execute = promisify(execFile);
const timeout = 45_000;
const bun = path.join(root, '.tools', 'bun', 'bun.exe');

function systemTar() {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (process.platform !== 'win32' || !systemRoot)
    throw new Error('This diagnostic requires Windows and its system directory');
  return path.join(systemRoot, 'System32', 'tar.exe');
}

const bytes = (value = '') => Buffer.byteLength(value);
const elapsed = (started) => Math.round(performance.now() - started);
const describeError = (error) => ({
  name: error.name,
  code: error.code ?? null,
  signal: error.signal ?? null,
  killed: error.killed ?? false,
  message: String(error.message).slice(0, 500),
});

async function execFileProbe(archive) {
  const started = performance.now();
  const mode = `${process.versions.bun ? 'bun' : 'node'}-execFile`;
  try {
    const result = await execute(systemTar(), ['-tf', archive], {
      encoding: 'utf8',
      windowsHide: true,
      timeout,
      maxBuffer: 8 * 1024 ** 2,
    });
    return {
      mode,
      elapsedMs: elapsed(started),
      exit: 0,
      stdoutBytes: bytes(result.stdout),
      stderrBytes: bytes(result.stderr),
      error: null,
    };
  } catch (error) {
    return {
      mode,
      elapsedMs: elapsed(started),
      exit: error.code ?? null,
      stdoutBytes: bytes(error.stdout),
      stderrBytes: bytes(error.stderr),
      error: describeError(error),
    };
  }
}

async function redirectProbe(mode, executable, args, listing, probeTimeout) {
  const started = performance.now();
  const destination = await open(listing, 'w');
  let result;
  try {
    result = await new Promise((resolve) => {
      const child = spawn(executable, args, {
        windowsHide: true,
        stdio: ['ignore', destination.fd, 'pipe'],
      });
      let stderrBytes = 0;
      let failure = null;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, probeTimeout);
      child.stderr.on('data', (chunk) => (stderrBytes += chunk.length));
      child.once('error', (error) => (failure = describeError(error)));
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        resolve({
          mode,
          elapsedMs: elapsed(started),
          exit: code,
          signal,
          stderrBytes,
          error:
            failure ?? (timedOut ? { message: `${probeTimeout / 1000} second timeout` } : null),
        });
      });
    });
  } finally {
    await destination.close();
  }
  return { ...result, stdoutBytes: (await stat(listing)).size };
}

async function spawnFileProbe(archive) {
  return redirectProbe(
    'node-spawn-file',
    systemTar(),
    ['-tf', archive],
    path.join(cache, 'node-spawn-listing.txt'),
    timeout,
  );
}

async function verifyArchive(filename, spec) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== spec.size)
    throw new Error('Pinned archive size or file type does not match');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  if (hash.digest('hex') !== spec.sha256) throw new Error('Pinned archive SHA-256 does not match');
}

async function downloadArchive(spec) {
  const archive = path.join(cache, `MaaDeps-x64-windows-devel-${spec.version}.tar.xz`);
  try {
    await verifyArchive(archive, spec);
    return archive;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const partial = `${archive}.${randomUUID()}.tmp`;
  try {
    const response = await fetch(spec.url, { signal: AbortSignal.timeout(300_000) });
    if (!response.ok || !response.body)
      throw new Error(`Pinned archive download returned HTTP ${response.status}`);
    let received = 0;
    const bounded = new Transform({
      transform(chunk, encoding, callback) {
        received += chunk.length;
        callback(
          received > spec.size ? new Error('Pinned archive exceeds its locked size') : null,
          chunk,
        );
      },
    });
    await pipeline(
      Readable.fromWeb(response.body),
      bounded,
      createWriteStream(partial, { flags: 'wx' }),
    );
    await verifyArchive(partial, spec);
    await rename(partial, archive);
    return archive;
  } finally {
    await rm(partial, { force: true });
  }
}

async function bunProbe(archive) {
  const started = performance.now();
  try {
    const result = await execute(bun, [script, '--probe', archive], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 64 * 1024,
    });
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    return {
      mode: 'bun-execFile',
      elapsedMs: elapsed(started),
      exit: error.code ?? null,
      stdoutBytes: bytes(error.stdout),
      stderrBytes: bytes(error.stderr),
      error: describeError(error),
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--probe' && args.length === 2) {
    console.log(JSON.stringify(await execFileProbe(path.resolve(args[1]))));
    return;
  }
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--archive'))
    throw new Error('Usage: diagnose-windows-components.mjs [--archive file | --probe file]');
  if (process.versions.bun) throw new Error('Run the diagnostic orchestrator with Node');
  await mkdir(output, { recursive: true });
  await mkdir(cache, { recursive: true });
  const summary = { versions: { node: process.version }, probes: [] };
  try {
    const options = { encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024 };
    summary.versions.tar = (await execute(systemTar(), ['--version'], options)).stdout.trim();
    summary.versions.bun = (await execute(bun, ['--version'], options)).stdout.trim();
    const where = path.join(path.dirname(systemTar()), 'where.exe');
    try {
      summary.versions.tarOnPath = (await execute(where, ['tar.exe'], options)).stdout.trim();
    } catch (error) {
      summary.versions.tarOnPath = describeError(error).message;
    }
    const sevenZip = process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, '7-Zip', '7z.exe')
      : undefined;
    let hasSevenZip = false;
    if (sevenZip) {
      try {
        hasSevenZip = (await lstat(sevenZip)).isFile();
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (hasSevenZip) {
      try {
        summary.versions.sevenZip = (await execute(sevenZip, ['--version'], options)).stdout.trim();
      } catch (error) {
        summary.versions.sevenZip = [error.stdout, error.stderr]
          .filter(Boolean)
          .join('\n')
          .trim()
          .slice(0, 1000);
      }
    } else summary.versions.sevenZip = 'not installed';
    console.log(JSON.stringify({ versions: summary.versions }));
    const lock = JSON.parse(
      await readFile(path.join(root, 'tools', 'windows-components.lock.json'), 'utf8'),
    );
    const spec = lock.licenses.dependencies;
    const archive = args.length ? path.resolve(args[1]) : await downloadArchive(spec);
    await verifyArchive(archive, spec);
    summary.archive = { version: spec.version, size: spec.size, sha256: spec.sha256 };
    for (const probe of [execFileProbe, bunProbe, spawnFileProbe]) {
      const result = await probe(archive);
      summary.probes.push(result);
      console.log(JSON.stringify(result));
    }
    if (hasSevenZip && summary.probes.every((result) => result.exit !== 0)) {
      const expanded = path.join(output, `expanded-${randomUUID()}.tar`);
      try {
        const expansion = await redirectProbe(
          'node-7zip-expand',
          sevenZip,
          ['x', '-so', archive],
          expanded,
          60_000,
        );
        summary.probes.push(expansion);
        console.log(JSON.stringify(expansion));
        if (expansion.exit === 0 && expansion.stdoutBytes > 0) {
          const result = { ...(await execFileProbe(expanded)), mode: 'node-execFile-expanded-tar' };
          summary.probes.push(result);
          console.log(JSON.stringify(result));
        }
      } finally {
        await rm(expanded, { force: true });
      }
    }
  } catch (error) {
    summary.error = describeError(error);
    console.error(JSON.stringify({ error: summary.error }));
    process.exitCode = 1;
  } finally {
    await writeFile(path.join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    await writeFile(
      path.join(output, 'versions.txt'),
      Object.entries(summary.versions)
        .map(([name, version]) => `${name}: ${version}\n`)
        .join(''),
    );
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: describeError(error) }));
  process.exitCode = 1;
});
