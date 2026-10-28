import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, fail } from './project.mjs';

export function syncPython(
  uvExecutable,
  { execute = spawnSync, report = (message) => process.stderr.write(message) } = {},
) {
  const sync = (extra = []) => {
    const result = execute(uvExecutable, ['sync', '--frozen', ...extra], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['inherit', 'inherit', 'pipe'],
      windowsHide: true,
    });
    if (result.stderr) report(result.stderr);
    if (result.error) throw result.error;
    return result;
  };

  let result = sync();
  // A stale wheel entry can point to an archive whose files have disappeared.
  // Bypass that cache for one attempt without deleting another project's cache.
  if (
    result.status !== 0 &&
    /failed to open file/iu.test(result.stderr) &&
    /[\\/]archive-v\d+[\\/]/iu.test(result.stderr) &&
    /os error 2/iu.test(result.stderr)
  ) {
    report('uv cache contains a missing file; retrying frozen sync once without the cache.\n');
    result = sync(['--no-cache']);
  }
  if (result.status !== 0) {
    throw new Error(`Python dependency sync failed (uv exited ${result.status ?? result.signal}).`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3)
      throw new Error('Usage: node tools/sync-python.mjs <uv executable>');
    syncPython(process.argv[2]);
  } catch (error) {
    fail(error);
  }
}
