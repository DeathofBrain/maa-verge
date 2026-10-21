import { ensureBun, cleanRuntimeEnvironment } from './setup-bun.mjs';
import { run, fail } from './project.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { root } from './project.mjs';
async function main() {
  const workerName = process.platform === 'win32' ? 'maaverge-core-worker.exe' : 'maaverge-core-worker';
  const coreName = process.platform === 'win32' ? 'MaaCore.dll' : process.platform === 'darwin' ? 'libMaaCore.dylib' : 'libMaaCore.so';
  const worker = ['Release/', ''].map(prefix => path.join(root, 'build/native', prefix, workerName)).find(existsSync);
  const core = ['Release/', ''].map(prefix => path.join(root, 'build/native/fixtures/normal', prefix, coreName)).find(existsSync);
  const python = path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
  await run(await ensureBun(), ['test', 'services/backend/tests'], { env: {
    ...cleanRuntimeEnvironment(),
    ...(existsSync(python) ? { MAAVERGE_REFERENCE_PYTHON: python } : {}),
    ...(worker && core ? { MAAVERGE_TEST_NATIVE_WORKER: worker, MAAVERGE_TEST_CORE_LIBRARY: core, MAAVERGE_TEST_COMPILE_UPDATE: '1' } : {}),
  } });
}
main().catch(fail);
