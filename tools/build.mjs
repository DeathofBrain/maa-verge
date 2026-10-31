import { run, desktop, devEnvironment, fail } from './project.mjs';
import { assertWorkspaceDependencies } from './environment.mjs';
import { ensureBun } from './setup-bun.mjs';
import {
  releaseConfiguration,
  updaterBuildArguments,
  signMacosInstaller,
} from './app-updater-release.mjs';
import { windowsInstallerConfiguration, packageWindowsPortable } from './windows-distribution.mjs';

async function main() {
  assertWorkspaceDependencies();
  const configuration = await releaseConfiguration();
  await ensureBun();
  await run('node', ['tools/doctor.mjs', '--native']);
  await run('pnpm', ['-r', 'build']);
  await run('node', ['tools/package-runtime.mjs']);
  await run('node', ['tools/smoke-runtime.mjs']);
  await run('node', ['tools/smoke-desktop-runtime.mjs']);
  let windowsArguments = [];
  if (process.platform === 'win32') {
    await run('node', ['tools/prepare-windows-components.mjs']);
    windowsArguments = ['--config', JSON.stringify(await windowsInstallerConfiguration())];
  }
  await run(
    'pnpm',
    ['exec', 'tauri', 'build', ...updaterBuildArguments(), ...windowsArguments, '--', '--locked'],
    {
      cwd: desktop,
      // Tauri otherwise skips the DMG background and Finder icon layout in CI.
      ...(process.platform === 'darwin'
        ? { env: { ...devEnvironment(), TAURI_BUNDLER_DMG_IGNORE_CI: 'true' } }
        : {}),
    },
  );
  if (process.platform === 'win32') {
    await packageWindowsPortable();
    await run('node', ['tools/smoke-windows-components.mjs']);
    await run('node', ['--test', 'tools/tests/windows-installer.test.mjs'], {
      env: { ...process.env, MAAVERGE_INSTALLER_TOOLS_REQUIRED: '1' },
    });
  }
  if (process.platform === 'darwin') {
    await run('node', ['tools/verify-macos-bundle.mjs']);
    await signMacosInstaller(configuration);
  }
}
main().catch(fail);
