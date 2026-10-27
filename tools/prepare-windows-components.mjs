import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fail, root, run } from './project.mjs';
import { cleanRuntimeEnvironment, ensureBun } from './setup-bun.mjs';

/** Build-time only: runtime imports the validated payload without downloading. */
export async function prepareWindowsComponents({
  workerPath,
  outputDirectory = path.join(root, 'dist/windows-components'),
} = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('Windows components require a Windows x64 release build');
  await run(
    await ensureBun(),
    [
      path.join(root, 'tools/test-support/windows-components.ts'),
      '--output',
      path.resolve(outputDirectory),
      ...(workerPath ? ['--worker', path.resolve(workerPath)] : []),
    ],
    { env: cleanRuntimeEnvironment(), windowsHide: true },
  );
  return path.resolve(outputDirectory);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length && !(arguments_.length === 2 && arguments_[0] === '--worker'))
    fail(new Error('Usage: node tools/prepare-windows-components.mjs [--worker <path>]'));
  else prepareWindowsComponents({ workerPath: arguments_[1] }).catch(fail);
}
