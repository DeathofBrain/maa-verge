// Packaging-only entry point: compile the production downloader without opening
// a Runtime, business database, automatic updater or device connection.
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { downloadArchive } from '../../services/backend/src/download.ts';

assert(
  Bun.isStandaloneExecutable,
  'The downloader probe must run as a compiled package executable',
);
assert.equal(process.env.PATH, '');

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
  // Use the production HTTP implementation embedded in this executable.
  void downloadArchive(request.metadata, request.destination, (value) => progress.push(value), {
    signal: cancellation.signal,
    idleTimeoutMs: 5000,
  })
    .then(
      (hash) => ({ status: 'complete', hash, progress }),
      (error) => ({
        status:
          cancellation.signal.aborted && error === cancellation.signal.reason
            ? 'cancelled'
            : 'error',
        error: error instanceof Error ? error.message : String(error),
        progress,
      }),
    )
    .then((result) => {
      process.stdout.write(JSON.stringify(result) + '\n');
      input.close();
      process.stdin.destroy();
    });
});
