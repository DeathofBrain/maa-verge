import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { root, terminate, windows } from '../project.mjs';
import { cleanRuntimeEnvironment, ensureBun } from '../setup-bun.mjs';

function command(executable, arguments_, { env, cwd, input, started, timeout = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      env,
      cwd,
      windowsHide: true,
      detached: !windows,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      timedOut = false;
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-8000);
    });
    child.stdin.on('error', () => {});
    const timer = setTimeout(() => {
      timedOut = true;
      if (windows) terminate(child);
      else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
    }, timeout);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      code === 0 && !timedOut
        ? resolve({ stdout, stderr })
        : reject(
            new Error(
              `Packaged download probe ${timedOut ? 'timed out' : `exited ${code ?? signal}`}: ${stderr || stdout}`,
            ),
          );
    });
    if (input !== undefined) child.stdin.write(input);
    if (started) started(child);
    else child.stdin.end();
  });
}

export async function smokeBundledDownload({ runtimeDirectory, temporary, environment }) {
  // Preserve the complete package layout while keeping a test-only executable
  // out of the production runtime directory and its packaging allowlist.
  const directory = path.join(temporary, 'package with spaces');
  cpSync(runtimeDirectory, directory, { recursive: true });
  const executable = path.join(directory, windows ? 'download-probe.exe' : 'download-probe');
  const env = cleanRuntimeEnvironment(environment);
  for (const key of Object.keys(env))
    if (key.toUpperCase() === 'PATH' || /^(?:ALL|HTTP|HTTPS|NO)_PROXY$/iu.test(key))
      delete env[key];
  env.PATH = '';
  env.NO_PROXY = '*';
  await command(
    await ensureBun(),
    [
      'build',
      '--compile',
      '--no-compile-autoload-dotenv',
      '--no-compile-autoload-bunfig',
      path.join(root, 'tools/test-support/bundled-download-probe.ts'),
      '--outfile',
      executable,
    ],
    { env: cleanRuntimeEnvironment(), cwd: root, timeout: 120_000 },
  );

  const payload = Buffer.from('Maa Verge packaged HTTP loopback fixture\n'.repeat(4096));
  const hash = createHash('sha256').update(payload).digest('hex');
  let transfers = 0,
    slowResponse,
    cancelTransfer;
  const server = createServer((request, response) => {
    const slow = request.url === '/cancel',
      length = slow ? 8 * 1024 * 1024 : payload.length;
    const range = /^bytes=(\d+)-(\d*)$/u.exec(request.headers.range || '');
    const start = range ? Number(range[1]) : 0,
      end = range && range[2] ? Number(range[2]) : length - 1;
    if (start > end || end >= length) {
      response.writeHead(416);
      response.end();
      return;
    }
    const headers = {
      etag: '"packaging-fixture-v1"',
      'accept-ranges': 'bytes',
      'content-length': end - start + 1,
    };
    if (range) headers['content-range'] = `bytes ${start}-${end}/${length}`;
    response.writeHead(range ? 206 : 200, headers);
    transfers++;
    if (slow) {
      slowResponse = response;
      response.write(payload.subarray(0, Math.min(16_384, end - start + 1)));
      setImmediate(() => cancelTransfer?.());
    } else response.end(payload.subarray(start, end + 1));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  const downloads = path.join(temporary, 'downloads with spaces');
  mkdirSync(downloads);
  const invoke = async (name, metadata, started) => {
    const destination = path.join(downloads, name);
    const result = await command(executable, [], {
      env,
      cwd: temporary,
      started,
      input:
        JSON.stringify({ metadata: { version: 'packaging-v1', ...metadata }, destination }) + '\n',
    });
    return { ...JSON.parse(result.stdout), destination };
  };
  try {
    const completed = await invoke('verified archive.zip', {
      url: url + '/archive',
      size: payload.length,
      digest: 'sha256:' + hash,
    });
    assert.equal(completed.status, 'complete', completed.error);
    assert.equal(completed.hash, hash);
    assert.deepEqual(readFileSync(completed.destination), payload);
    assert(!existsSync(completed.destination + '.partial'));
    assert(!existsSync(completed.destination + '.partial.json'));
    assert(
      completed.progress.includes(90),
      'The production downloader must publish completion progress',
    );

    const rejected = await invoke('corrupt archive.zip', {
      url: url + '/archive',
      size: payload.length,
      digest: 'sha256:' + '0'.repeat(64),
    });
    assert.equal(rejected.status, 'error');
    assert.match(rejected.error, /校验失败/u);
    assert(!existsSync(rejected.destination));
    assert(!existsSync(rejected.destination + '.partial'));

    let connectionClosed;
    const cancelled = await invoke(
      'cancelled archive.zip',
      { url: url + '/cancel', size: 8 * 1024 * 1024 },
      (child) => {
        cancelTransfer = () => {
          connectionClosed = new Promise((resolve) => slowResponse.once('close', resolve));
          child.stdin.end(JSON.stringify({ cancel: true }) + '\n');
        };
      },
    );
    assert.equal(cancelled.status, 'cancelled', cancelled.error);
    assert.equal(cancelled.error, 'packaging-smoke-cancel');
    assert(!existsSync(cancelled.destination), 'A cancelled archive must never be published');
    assert(
      connectionClosed,
      'Cancellation must happen after the production downloader starts its HTTP transfer',
    );
    let cancellationTimer;
    try {
      await Promise.race([
        connectionClosed,
        new Promise((_, reject) => {
          cancellationTimer = setTimeout(
            () => reject(new Error('Cancelled download left its HTTP transfer open')),
            3000,
          );
        }),
      ]);
    } finally {
      clearTimeout(cancellationTimer);
    }
    assert.equal(
      transfers,
      3,
      'Each scenario must transfer through the compiled production downloader',
    );
    console.log(
      'Compiled HTTP downloader smoke passed: empty PATH, loopback download, SHA-256 rejection and cancellation.',
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
