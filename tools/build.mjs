import { run, desktop, fail } from './project.mjs';
import { assertWorkspaceDependencies } from './environment.mjs';
import { ensureBun } from './setup-bun.mjs';
import { releaseConfiguration, updaterBuildArguments } from './app-updater-release.mjs';

async function main() {
  assertWorkspaceDependencies();
  await releaseConfiguration();
  await ensureBun();
  await run('node', ['tools/doctor.mjs', '--native']);
  await run('pnpm', ['-r', 'build']);
  await run('node', ['tools/package-runtime.mjs']);
  await run('node', ['tools/smoke-runtime.mjs']);
  await run('node', ['tools/smoke-desktop-runtime.mjs']);
  await run('pnpm', ['exec', 'tauri', 'build', ...updaterBuildArguments(), '--', '--locked'], { cwd: desktop });
  if (process.platform === 'darwin') await run('node', ['tools/verify-macos-bundle.mjs']);
}
main().catch(fail);
