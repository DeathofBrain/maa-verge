import { makeTemporaryDirectorySync } from './test-support/temporary-directory.mjs';
import { rmSync, existsSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root, run, windows, devEnvironment, fail } from './project.mjs';
import { seedNativeData } from './test-support/seed-native.mjs';

async function main() {
  const executable = path.join(
    root,
    'dist/runtime/maaverge-runtime',
    windows ? 'maaverge-runtime.exe' : 'maaverge-runtime',
  );
  if (!existsSync(executable))
    throw new Error('Build the standalone runtime first: node tools/package-runtime.mjs');
  const temporary = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-desktop-smoke-'));
  try {
    await seedNativeData(temporary);
    writeFileSync(path.join(temporary, '.env'), 'BUN_BE_BUN=1\nNODE_OPTIONS=--invalid-option\n');
    writeFileSync(path.join(temporary, 'bunfig.toml'), '[broken\n');
    await run(
      'cargo',
      [
        'test',
        '--manifest-path',
        'apps/desktop/src-tauri/Cargo.toml',
        '--locked',
        '--lib',
        'runtime::tests::packaged_runtime_transport',
        '--',
        '--ignored',
        '--nocapture',
      ],
      {
        env: {
          ...devEnvironment(),
          MAAVERGE_COMPONENT_HOME: path.join(temporary, 'component-home'),
          MAAVERGE_TEST_RUNTIME: executable,
          MAAVERGE_TEST_DATA: temporary,
        },
      },
    );
    console.log('Tauri Rust transport -> standalone backend -> C++ device lease smoke passed.');
  } finally {
    if (
      path.dirname(temporary) !== realpathSync.native(tmpdir()) ||
      !path.basename(temporary).startsWith('maaverge-desktop-smoke-')
    )
      throw new Error('Unexpected smoke path');
    rmSync(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}
main().catch(fail);
