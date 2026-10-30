import { expect, test } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { childEnvironment, nativeEnvironment } from '../src/infrastructure/config';
import { validateNative } from '../src/modules/updates/updates';

test('isolated core validation receives the generation library path and clean runtime options', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-validator-env-'));
  const source = path.join(root, 'validator.ts'),
    executable = path.join(root, process.platform === 'win32' ? 'validator.exe' : 'validator');
  const options = ['BUN_OPTIONS', 'BUN_BE_BUN', 'NODE_OPTIONS', 'NODE_PATH'];
  const original = Object.fromEntries(options.map((key) => [key, process.env[key]]));
  try {
    await writeFile(
      source,
      `
      const input = JSON.parse(await Bun.stdin.text());
      const key = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH';
      if (input.protocolVersion !== 1 || ['BUN_OPTIONS','BUN_BE_BUN','NODE_OPTIONS','NODE_PATH'].some(key => process.env[key])) process.exit(2);
      if (process.platform !== 'win32' && process.env[key]?.split(':')[0] !== input.core) process.exit(3);
      console.log(JSON.stringify({protocolVersion:1, resourceLoaded:true, version:input.version}));
    `,
    );
    // Bun creates its intermediate PE in cwd before renaming it to --outfile.
    // Keep that file in this test's directory instead of the watched checkout.
    const build = Bun.spawn(
      [
        process.execPath,
        'build',
        '--compile',
        '--no-compile-autoload-dotenv',
        '--no-compile-autoload-bunfig',
        source,
        '--outfile',
        executable,
      ],
      { cwd: root, env: childEnvironment(), stdout: 'ignore', stderr: 'pipe' },
    );
    const diagnostics = await new Response(build.stderr).text();
    expect(await build.exited, diagnostics).toBe(0);
    for (const key of options) process.env[key] = '--invalid';
    expect(
      childEnvironment({ Bun_Options: 'bad', NODE_OPTIONS: 'bad', MAAVERGE_MODE: 'native' }),
    ).toEqual({ MAAVERGE_MODE: 'native' });
    for (const platform of ['linux', 'darwin'] as const) {
      const key = platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH';
      expect(nativeEnvironment(root, platform)[key]?.startsWith(root)).toBe(true);
    }
    await validateNative(root, root, 'synthetic', executable);
  } finally {
    for (const key of options) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 30_000);
