import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { root, windows } from './project.mjs';

// tauri-build resolves bundle resources during cargo check. No executable is
// fabricated: release packaging separately requires a successful PyInstaller build.
const directory = path.join(root, 'dist/runtime/maaverge-runtime');
mkdirSync(directory, { recursive: true });
if (!existsSync(path.join(directory, windows ? 'maaverge-runtime.exe' : 'maaverge-runtime'))
    && !existsSync(path.join(directory, '.development-placeholder'))) {
  writeFileSync(path.join(directory, '.development-placeholder'), 'Development resource directory; not a packaged Python runtime.\n');
}
