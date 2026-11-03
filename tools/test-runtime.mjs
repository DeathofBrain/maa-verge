import { ensureBun } from './setup-bun.mjs';
import { offlineAgentEnvironment } from './test-support/agent-environment.mjs';
import { run, fail } from './project.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { root } from './project.mjs';
import { assertWorkspaceDependencies } from './environment.mjs';
import {
  discoverRuntimeTests,
  parseRuntimeArguments,
  runtimeTestDirectories,
  selectRuntimeTests,
} from './ci/runtime-suite.mjs';
async function main() {
  const options = parseRuntimeArguments(process.argv.slice(2));
  assertWorkspaceDependencies();
  const timeout = Number(process.env.MAAVERGE_TEST_TIMEOUT_MS ?? 30000);
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 300000)
    throw new Error('MAAVERGE_TEST_TIMEOUT_MS must be an integer from 1 to 300000.');
  const workerName =
    process.platform === 'win32' ? 'maaverge-native-worker.exe' : 'maaverge-native-worker';
  const frameworkName =
    process.platform === 'win32'
      ? 'MaaFramework.dll'
      : process.platform === 'darwin'
        ? 'libMaaFramework.dylib'
        : 'libMaaFramework.so';
  const worker = ['Release/', '']
    .map((prefix) => path.join(root, 'build/native', prefix, workerName))
    .find(existsSync);
  const framework = ['Release/', '']
    .map((prefix) =>
      path.join(root, 'build/native/fixtures/framework-normal', prefix, frameworkName),
    )
    .find(existsSync);
  if (options.requireNative && (!worker || !framework))
    throw new Error(
      'Native runtime fixtures are required. Build the C++ worker and synthetic MaaFramework first.',
    );
  const discovered = discoverRuntimeTests(root);
  const tests = selectRuntimeTests(discovered, options);
  if (!tests.length) throw new Error('No runtime test files were selected.');
  const suite = options.platformOnly && process.platform !== 'linux' ? 'platform' : 'full';
  console.log(`Runtime suite ${suite}: ${tests.length}/${discovered.length} test files.`);
  await run(
    await ensureBun(),
    [
      'test',
      '--timeout',
      String(timeout),
      ...(suite === 'full' ? runtimeTestDirectories : tests.map((file) => `./${file}`)),
    ],
    {
      env: {
        ...offlineAgentEnvironment(),
        ...(worker && framework
          ? {
              MAAVERGE_TEST_NATIVE_WORKER: worker,
              MAAVERGE_TEST_FRAMEWORK_LIBRARY: framework,
              MAAVERGE_TEST_COMPILE_UPDATE: '1',
            }
          : {}),
      },
    },
  );
}
main().catch(fail);
