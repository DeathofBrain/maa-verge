// Packaging-only entry point: compile the production downloader without opening
// a Runtime, business database, automatic updater or device connection.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { aria2ExecutablePath, downloadArchive } from '../../services/backend/src/download.ts';

assert(Bun.isStandaloneExecutable, 'The downloader probe must run as a compiled package executable');
assert.equal(process.env.PATH, '');
assert.equal(aria2ExecutablePath(), path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'aria2c.exe' : 'aria2c'));

const input = createInterface({ input: process.stdin });
const cancellation = new AbortController();
let started = false;

input.on('line', (line) => {
  const request = JSON.parse(line);
  if (started) {
    if (request.cancel === true) cancellation.abort(new Error('packaging-smoke-cancel'));
    return;
  }
  started = true;
  const progress: number[] = [];
  // No custom executable path or fetch replacement: this must resolve and run
  // the real aria2c adjacent to this compiled executable, as production does.
  void downloadArchive(request.metadata, request.destination, value => progress.push(value), {
    engine: 'aria2', signal: cancellation.signal, idleTimeoutMs: 5000,
  }).then(hash => ({ status: 'complete', hash, progress }), error => ({
    status: cancellation.signal.aborted && error === cancellation.signal.reason ? 'cancelled' : 'error',
    error: error instanceof Error ? error.message : String(error), progress,
  })).then(result => {
    process.stdout.write(JSON.stringify(result) + '\n');
    input.close();
    process.stdin.destroy();
  });
});
