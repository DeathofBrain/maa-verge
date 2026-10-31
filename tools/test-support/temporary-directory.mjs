import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';

// macOS /var aliases and Windows short paths must be resolved before fixtures
// reach the same path and symlink checks used by the product runtime.
export async function makeTemporaryDirectory(prefix) {
  const directory = await mkdtemp(prefix);
  try {
    return await realpath(directory);
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export function makeTemporaryDirectorySync(prefix) {
  const directory = mkdtempSync(prefix);
  try {
    // The JS realpathSync implementation can retain Windows 8.3 spellings.
    return realpathSync.native(directory);
  } catch (error) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {}
    throw error;
  }
}
