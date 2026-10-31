import { makeTemporaryDirectorySync } from '../test-support/temporary-directory.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveCmake } from '../environment.mjs';
import { root, devEnvironment } from '../project.mjs';

const cmake = resolveCmake().executable;

function fixture(t) {
  const directory = makeTemporaryDirectorySync(path.join(tmpdir(), 'maa verge native build-'));
  t.after(() =>
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const write = (relative, content) => {
    const file = path.join(directory, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  write(
    'tools/project.mjs',
    `import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const executable = () => process.execPath;
export async function run(program, args) {
  const result = spawnSync(program, args, {
    cwd: root, env: process.env, stdio: 'inherit', windowsHide: true, timeout: 60000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(program + ' exited ' + result.status);
}
export function fail(error) { console.error(error.message); process.exitCode = 1; }
`,
  );
  write(
    'tools/environment.mjs',
    `export const resolveCmake = () => (${JSON.stringify({ executable: cmake })});\n`,
  );
  copyFileSync(
    path.join(root, 'tools/build-core-worker.mjs'),
    path.join(directory, 'tools/build-core-worker.mjs'),
  );
  mkdirSync(path.join(directory, 'services/native'), { recursive: true });
  copyFileSync(
    path.join(root, 'services/native/CMakePresets.json'),
    path.join(directory, 'services/native/CMakePresets.json'),
  );
  write(
    'services/native/CMakeLists.txt',
    `cmake_minimum_required(VERSION 3.25)
project(maaverge_build_fixture LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
add_executable(maaverge-core-worker main.cpp)
include(CTest)
if(BUILD_TESTING)
  add_test(NAME native.fixture
    COMMAND maaverge-core-worker "\${CMAKE_BINARY_DIR}/ctest-ran")
endif()
`,
  );
  write(
    'services/native/main.cpp',
    '#include <fstream>\n#include <span>\nint main(int argc, char** argv) {\n  int values[]{0};\n  if (argc > 1) std::ofstream(argv[1]) << "CTest ran";\n  return std::span<int>(values).front();\n}\n',
  );
  const environment = devEnvironment();
  for (const name of [
    'CMAKE_GENERATOR',
    'CMAKE_GENERATOR_INSTANCE',
    'CMAKE_GENERATOR_PLATFORM',
    'CMAKE_GENERATOR_TOOLSET',
  ])
    delete environment[name];
  const build = path.join(directory, 'build/native');
  const cache = path.join(build, 'CMakeCache.txt');
  return {
    build,
    cache,
    configurePreset() {
      const result = spawnSync(cmake, ['--preset', 'release'], {
        cwd: path.join(directory, 'services/native'),
        env: environment,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 60000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, `${result.stdout || ''}\n${result.stderr || ''}`);
      const help = spawnSync(cmake, ['--help'], {
        env: environment,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000,
      });
      assert.ifError(help.error);
      assert.equal(help.status, 0, help.stderr);
      const defaultGenerator = help.stdout.match(/^\* ([^=]+?)\s*=/mu)?.[1].trim();
      assert.ok(defaultGenerator, 'CMake must advertise its platform default generator');
      assert.equal(
        readFileSync(cache, 'utf8').match(/^CMAKE_GENERATOR:INTERNAL=(.+)$/mu)?.[1],
        defaultGenerator,
      );
    },
    seedFailedNinjaCache() {
      write(
        'build/native/CMakeCache.txt',
        'CMAKE_GENERATOR:INTERNAL=Ninja\nCMAKE_MAKE_PROGRAM:FILEPATH=CMAKE_MAKE_PROGRAM-NOTFOUND\nMAAVERGE_CACHE_MARKER:STRING=stale\n',
      );
    },
    launch(args = [], overrides = {}) {
      const result = spawnSync(
        process.execPath,
        [path.join(directory, 'tools/build-core-worker.mjs'), ...args],
        {
          cwd: directory,
          env: { ...environment, ...overrides },
          encoding: 'utf8',
          windowsHide: true,
          timeout: 120000,
        },
      );
      const output = `${result.stdout || ''}\n${result.stderr || ''}`;
      assert.ifError(result.error);
      assert.equal(result.status, 0, output);
      return { output, cache: readFileSync(cache, 'utf8') };
    },
  };
}

test(
  'the release preset configures with the platform default generator',
  { timeout: 70000 },
  (t) => {
    fixture(t).configurePreset();
  },
);

test(
  'CLI --fresh recovers a failed Ninja cache with the platform toolchain',
  { timeout: 130000 },
  (t) => {
    const project = fixture(t);
    project.seedFailedNinjaCache();
    const { cache } = project.launch(['--fresh', '--production']);
    assert.doesNotMatch(cache, /^MAAVERGE_CACHE_MARKER:/mu);
    assert.doesNotMatch(cache, /^CMAKE_MAKE_PROGRAM:[^=]*=.*-NOTFOUND$/mu);
    assert.match(cache, /^BUILD_TESTING:BOOL=OFF$/mu);
    const worker =
      process.platform === 'win32' ? 'maaverge-core-worker.exe' : 'maaverge-core-worker';
    assert.ok(
      [path.join(project.build, worker), path.join(project.build, 'Release', worker)].some(
        existsSync,
      ),
    );
    assert.equal(existsSync(path.join(project.build, 'ctest-ran')), false);
  },
);

test(
  'ordinary builds preserve cached options and run CTest by default',
  { timeout: 130000 },
  (t) => {
    const project = fixture(t);
    project.launch(['--production']);
    writeFileSync(
      project.cache,
      `${readFileSync(project.cache, 'utf8')}\nMAAVERGE_CACHE_MARKER:STRING=preserved\n`,
    );
    const { cache, output } = project.launch();
    assert.match(cache, /^MAAVERGE_CACHE_MARKER:STRING=preserved$/mu);
    assert.match(cache, /^BUILD_TESTING:BOOL=ON$/mu);
    assert.match(output, /100% tests passed/u);
    assert.equal(readFileSync(path.join(project.build, 'ctest-ran'), 'utf8'), 'CTest ran');
  },
);

test(
  '--fresh respects an explicitly selected Makefiles generator',
  {
    timeout: 130000,
    skip: process.platform === 'win32' ? 'Unix Makefiles requires a Unix build host' : false,
  },
  (t) => {
    const project = fixture(t);
    project.seedFailedNinjaCache();
    const { cache } = project.launch(['--fresh', '--production'], {
      CMAKE_GENERATOR: 'Unix Makefiles',
    });
    assert.match(cache, /^CMAKE_GENERATOR:INTERNAL=Unix Makefiles$/mu);
    assert.doesNotMatch(cache, /^MAAVERGE_CACHE_MARKER:/mu);
  },
);
