import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { offlineAgentEnvironment } from './agent-environment.mjs';
import { makeTemporaryDirectory } from './temporary-directory.mjs';

/** All test data roots share one lease namespace without touching real device locks. */
export async function withRuntimeTestEnvironment(action, environment = process.env) {
  const directory = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-runtime-test-'));
  try {
    return await action({
      ...offlineAgentEnvironment(environment),
      MAAVERGE_DEVICE_LOCK_DIR: path.join(directory, 'device-locks'),
    });
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
