import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { root, run, windows, fail } from './project.mjs';

async function main() {
  const build = path.join(root, 'build', 'runtime');
  mkdirSync(build, { recursive: true });
  const entry = path.join(build, 'entry.py');
  writeFileSync(entry, 'import multiprocessing\nfrom maaverge_runtime.__main__ import main\n\nif __name__ == "__main__":\n    multiprocessing.freeze_support()\n    main()\n');
  // PyInstaller's embedded executable must carry the same library entitlement as
  // its parent on macOS. Release signing of every nested binary is a separate gate.
  const arguments_ = [
    'run', '--frozen', 'pyinstaller', '--noconfirm', '--clean', '--onedir',
    '--name', 'maaverge-runtime', '--distpath', path.join(root, 'dist/runtime'),
    '--workpath', path.join(build, 'work'), '--specpath', build,
    '--paths', path.join(root, 'services/runtime'),
    '--collect-all', 'maaverge_runtime',
  ];
  if (process.platform === 'darwin') arguments_.push('--osx-entitlements-file', path.join(root, 'apps/desktop/src-tauri/Entitlements.plist'));
  arguments_.push(entry);
  await run('uv', arguments_);
  const executable = path.join(root, 'dist/runtime/maaverge-runtime', windows ? 'maaverge-runtime.exe' : 'maaverge-runtime');
  if (!existsSync(executable)) throw new Error('PyInstaller did not produce the runtime executable');
  const placeholder = path.join(root, 'dist/runtime/maaverge-runtime/.development-placeholder');
  if (existsSync(placeholder)) rmSync(placeholder);
  writeFileSync(path.join(root, 'dist/runtime/maaverge-runtime/build-info.json'), JSON.stringify({
    platform: process.platform, arch: process.arch,
    applicationVersion: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  }, null, 2));
  console.log(`Python runtime: ${executable}`);
}
main().catch(fail);
