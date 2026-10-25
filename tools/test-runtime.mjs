import { ensureBun } from './setup-bun.mjs';
import { offlineAgentEnvironment } from './test-support/agent-environment.mjs';
import { run, fail } from './project.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { root } from './project.mjs';
import { assertWorkspaceDependencies } from './environment.mjs';
async function main() {
  assertWorkspaceDependencies();
  const timeout = Number(process.env.MAAVERGE_TEST_TIMEOUT_MS ?? 5000);
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 300000) throw new Error('MAAVERGE_TEST_TIMEOUT_MS must be an integer from 1 to 300000.');
  const workerName = process.platform === 'win32' ? 'maaverge-core-worker.exe' : 'maaverge-core-worker';
  const coreName = process.platform === 'win32' ? 'MaaCore.dll' : process.platform === 'darwin' ? 'libMaaCore.dylib' : 'libMaaCore.so';
  const worker = ['Release/', ''].map(prefix => path.join(root, 'build/native', prefix, workerName)).find(existsSync);
  const core = ['Release/', ''].map(prefix => path.join(root, 'build/native/fixtures/normal', prefix, coreName)).find(existsSync);
  const python = path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
  await run(await ensureBun(), ['test', '--timeout', String(timeout), 'packages/agent/tests', 'services/backend/tests'], { env: {
    ...offlineAgentEnvironment(),
    ...(existsSync(python) ? { MAAVERGE_REFERENCE_PYTHON: python } : {}),
    ...(worker && core ? { MAAVERGE_TEST_NATIVE_WORKER: worker, MAAVERGE_TEST_CORE_LIBRARY: core, MAAVERGE_TEST_COMPILE_UPDATE: '1' } : {}),
  } });
}
main().catch(fail);
