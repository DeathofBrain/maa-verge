import { run, probe, root, fail } from './project.mjs';
import path from 'node:path';

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => !['--required', '--skip-fmt'].includes(flag)))
    throw new Error('Usage: node tools/check-native.mjs [--required] [--skip-fmt]');
  const required = process.argv.includes('--required') || process.env.CI === 'true';
  if (!probe('cargo').ok) {
    const message =
      'Native checks unavailable: cargo is missing. Install the pinned Rust toolchain (docs/development.md).';
    if (required) throw new Error(message);
    console.warn(`SKIP ${message}`);
    return;
  }
  const manifest = path.join(root, 'apps/desktop/src-tauri/Cargo.toml');
  await run('node', ['tools/prepare-native-check.mjs']);
  if (!flags.includes('--skip-fmt'))
    await run('cargo', ['fmt', '--manifest-path', manifest, '--check']);
  await run('cargo', [
    'clippy',
    '--manifest-path',
    manifest,
    '--locked',
    '--all-targets',
    '--',
    '-D',
    'warnings',
  ]);
  await run('cargo', ['test', '--manifest-path', manifest, '--locked']);
}
main().catch(fail);
