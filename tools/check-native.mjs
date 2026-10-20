import { run, probe, root, fail } from './project.mjs';
import path from 'node:path';

async function main() {
  const required = process.argv.includes('--required') || process.env.CI === 'true';
  if (!probe('cargo').ok) {
    const message = 'Native checks unavailable: cargo is missing. Install the pinned Rust toolchain (docs/development.md).';
    if (required) throw new Error(message);
    console.warn(`SKIP ${message}`);
    return;
  }
  const manifest = path.join(root, 'apps/desktop/src-tauri/Cargo.toml');
  await run('node', ['tools/prepare-native-check.mjs']);
  await run('cargo', ['fmt', '--manifest-path', manifest, '--check']);
  await run('cargo', ['clippy', '--manifest-path', manifest, '--locked', '--all-targets', '--', '-D', 'warnings']);
  await run('cargo', ['test', '--manifest-path', manifest, '--locked']);
}
main().catch(fail);
