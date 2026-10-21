import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { root, run, devEnvironment, fail } from './project.mjs';

function cmakeExecutable() {
  if (spawnSync('cmake', ['--version'], { env: devEnvironment(), windowsHide: true }).status === 0) return 'cmake';
  if (process.platform === 'win32') {
    const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe');
    if (existsSync(vswhere)) {
      const result = spawnSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8', windowsHide: true });
      const candidate = path.join(result.stdout.trim(), 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe');
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error('CMake is required. Install CMake and a C++20 compiler (Visual Studio C++ tools on Windows).');
}
export async function buildCoreWorker({ testing = !process.argv.includes('--production') } = {}) {
  const cmake = cmakeExecutable(), build = path.join(root, 'build/native');
  const python = path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
  await run(cmake, ['-S', path.join(root, 'services/native'), '-B', build, '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_OSX_DEPLOYMENT_TARGET=13.5', `-DBUILD_TESTING=${testing ? 'ON' : 'OFF'}`, ...(testing && existsSync(python) ? [`-DPython3_EXECUTABLE=${python}`] : [])]);
  await run(cmake, ['--build', build, '--config', 'Release', '--parallel', '2']);
  if (testing) {
    const ctest = cmake === 'cmake' ? 'ctest' : path.join(path.dirname(cmake), process.platform === 'win32' ? 'ctest.exe' : 'ctest');
    await run(ctest, ['--test-dir', build, '-C', 'Release', '--output-on-failure']);
  }
  const name = process.platform === 'win32' ? 'maaverge-core-worker.exe' : 'maaverge-core-worker';
  const executable = [path.join(build, 'Release', name), path.join(build, name)].find(existsSync);
  if (!executable) throw new Error('Native build did not produce maaverge-core-worker');
  return executable;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildCoreWorker().catch(fail);
