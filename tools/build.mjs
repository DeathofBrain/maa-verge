import { run, desktop, fail } from './project.mjs';

async function main() {
  await run('pnpm', ['-r', 'build']);
  await run('node', ['tools/package-runtime.mjs']);
  await run('node', ['tools/smoke-runtime.mjs']);
  await run('node', ['tools/smoke-desktop-runtime.mjs']);
  await run('pnpm', ['exec', 'tauri', 'build', '--', '--locked'], { cwd: desktop });
}
main().catch(fail);
