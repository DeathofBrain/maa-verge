import { ensureBun } from './setup-bun.mjs';
import { withRuntimeTestEnvironment } from './test-support/runtime-environment.mjs';
import { run, fail } from './project.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { root } from './project.mjs';
import { assertWorkspaceDependencies } from './environment.mjs';
import {
  discoverRuntimeTests,
  parseRuntimeArguments,
  runtimeTestDirectories,
  selectRuntimeTests,
} from './ci/runtime-suite.mjs';
export async function runRuntimeTests(args, { ensureRuntime = ensureBun, execute = run } = {}) {
  const options = parseRuntimeArguments(args);
  assertWorkspaceDependencies();
  const timeout = Number(process.env.MAAVERGE_TEST_TIMEOUT_MS ?? 30000);
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 300000)
    throw new Error('MAAVERGE_TEST_TIMEOUT_MS must be an integer from 1 to 300000.');
  const workerName =
    process.platform === 'win32' ? 'maaverge-core-worker.exe' : 'maaverge-core-worker';
  const coreName =
    process.platform === 'win32'
      ? 'MaaCore.dll'
      : process.platform === 'darwin'
        ? 'libMaaCore.dylib'
        : 'libMaaCore.so';
  const worker = ['Release/', '']
    .map((prefix) => path.join(root, 'build/native', prefix, workerName))
    .find(existsSync);
  const core = ['Release/', '']
    .map((prefix) => path.join(root, 'build/native/fixtures/normal', prefix, coreName))
    .find(existsSync);
  if (options.requireNative && (!worker || !core))
    throw new Error(
      'Native runtime fixtures are required. Build the C++ worker and synthetic core first.',
    );
  const discovered = discoverRuntimeTests(root);
  const tests = selectRuntimeTests(discovered, options);
  if (!tests.length) throw new Error('No runtime test files were selected.');
  const suite =
    options.files.length || options.testNamePattern !== undefined
      ? 'targeted'
      : options.platformOnly && process.platform !== 'linux'
        ? 'platform'
        : 'full';
  console.log(`Runtime suite ${suite}: ${tests.length}/${discovered.length} test files.`);
  const bun = await ensureRuntime();
  await withRuntimeTestEnvironment((environment) =>
    execute(
      bun,
      [
        'test',
        '--timeout',
        String(timeout),
        ...(options.testNamePattern !== undefined
          ? ['--test-name-pattern', options.testNamePattern]
          : []),
        ...(suite === 'full' ? runtimeTestDirectories : tests.map((file) => `./${file}`)),
      ],
      {
        env: {
          ...environment,
          ...(worker && core
            ? {
                MAAVERGE_TEST_NATIVE_WORKER: worker,
                MAAVERGE_TEST_CORE_LIBRARY: core,
                MAAVERGE_TEST_COMPILE_UPDATE: '1',
              }
            : {}),
        },
      },
    ),
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runRuntimeTests(process.argv.slice(2)).catch(fail);
