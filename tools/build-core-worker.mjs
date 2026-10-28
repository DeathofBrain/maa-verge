import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { root, run, fail } from './project.mjs';
import { resolveCmake } from './environment.mjs';

export async function buildCoreWorker({
  testing = !process.argv.includes('--production'),
  fresh = process.argv.includes('--fresh'),
} = {}) {
  const cmake = resolveCmake().executable,
    build = path.join(root, 'build/native');
  const python = path.join(
    root,
    process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
  );
  await run(cmake, [
    ...(fresh ? ['--fresh'] : []),
    '-S',
    path.join(root, 'services/native'),
    '-B',
    build,
    '-DCMAKE_BUILD_TYPE=Release',
    ...(process.platform === 'darwin' ? ['-DCMAKE_OSX_DEPLOYMENT_TARGET=15.0'] : []),
    `-DBUILD_TESTING=${testing ? 'ON' : 'OFF'}`,
    ...(testing && existsSync(python) ? [`-DPython3_EXECUTABLE=${python}`] : []),
  ]);
  await run(cmake, ['--build', build, '--config', 'Release', '--parallel', '2']);
  if (testing) {
    const ctest =
      cmake === 'cmake'
        ? 'ctest'
        : path.join(path.dirname(cmake), process.platform === 'win32' ? 'ctest.exe' : 'ctest');
    await run(ctest, ['--test-dir', build, '-C', 'Release', '--output-on-failure']);
  }
  const name = process.platform === 'win32' ? 'maaverge-core-worker.exe' : 'maaverge-core-worker';
  const executable = [path.join(build, 'Release', name), path.join(build, name)].find(existsSync);
  if (!executable) throw new Error('Native build did not produce maaverge-core-worker');
  return executable;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  buildCoreWorker().catch(fail);
