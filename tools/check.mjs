import { run, fail } from './project.mjs';
import { assertWorkspaceDependencies } from './environment.mjs';
import { readCiPlan } from './ci/plan.mjs';

const toolTests = [
  'tools/tests/environment.test.mjs',
  'tools/tests/setup-rust.test.mjs',
  'tools/tests/commit-formatting.test.mjs',
  'tools/tests/vite-cache.test.mjs',
  'tools/tests/process-tree.test.mjs',
  'tools/tests/runtime-smoke.test.mjs',
  'tools/tests/dev-mode.test.mjs',
  'tools/tests/release-assets.test.mjs',
  'tools/tests/app-updater-release.test.mjs',
  'tools/tests/require-checks.test.mjs',
  'tools/tests/runtime-notices.test.mjs',
  'tools/tests/check-kit-css.test.mjs',
  'tools/tests/check-frontend-architecture.test.mjs',
  'tools/tests/check-backend-architecture.test.mjs',
  'tools/tests/ci-plan.test.mjs',
  'tools/tests/runtime-suite.test.mjs',
];
const contractTests = [
  'packages/contracts/test/validators.test.mjs',
  'packages/contracts/test/copilot.test.mjs',
  'packages/contracts/test/copilot-attribution.test.mjs',
  'packages/contracts/test/copilot-search.test.mjs',
  'packages/contracts/test/copilot-categories.test.mjs',
  'packages/contracts/test/external-links.test.mjs',
  'packages/contracts/test/error-display.test.mjs',
  'packages/contracts/test/desktop-notifications.test.mjs',
  'packages/contracts/test/configuration.test.mjs',
  'packages/contracts/test/desktop-uninstall.test.mjs',
];
// Packaging fixtures exercise host tools, so each one runs on its own platform.
const platformTests = {
  linux: ['tools/tests/linux-distribution.test.mjs'],
  darwin: ['tools/tests/macos-bundle.test.mjs'],
  win32: ['tools/tests/windows-installer.test.mjs', 'tools/tests/windows-components.test.mjs'],
};

async function applicationChecks(plan) {
  assertWorkspaceDependencies();
  await run('node', ['tools/generate-agent-knowledge.mjs', '--check']);
  await run('node', ['--test', ...toolTests]);
  await run('node', ['tools/check-kit-css.mjs']);
  await run('node', ['tools/check-frontend-architecture.mjs']);
  await run('node', ['tools/check-backend-architecture.mjs']);
  await run('pnpm', ['contracts:check']);
  await run('pnpm', ['-r', 'check']);
  await run('node', ['--test', ...contractTests]);
  if (!plan?.code) return;

  // A single Linux baseline owns domain coverage and the native fixtures it needs.
  await run('node', ['--test', 'tools/tests/build-core-worker.test.mjs']);
  await run('node', ['tools/build-core-worker.mjs']);
  await run('node', ['tools/test-runtime.mjs', '--require-native']);
  if (plan.native) {
    await run('node', ['tools/probe-bun.mjs']);
    await run('cargo', ['fmt', '--manifest-path', 'apps/desktop/src-tauri/Cargo.toml', '--check']);
    await run('node', ['tools/check-native.mjs', '--required', '--skip-fmt']);
    await packagingChecks();
  }
  // TypeScript was already checked above; build Vite without another workspace check.
  await run('pnpm', ['--filter', '@maaverge/desktop', 'exec', 'vite', 'build']);
  await run('node', ['tools/ci/test-ui.mjs']);
}

async function packagingChecks() {
  const tests = platformTests[process.platform];
  if (tests) await run('node', ['--test', ...tests]);
}

async function nativeChecks(plan) {
  assertWorkspaceDependencies();
  if (plan && !plan.native) throw new Error('The CI plan does not select native checks');
  await run('node', ['tools/probe-bun.mjs']);
  // CI builds the actual worker next; the extra doctor compiler probe is for local diagnosis.
  if (!plan) await run('pnpm', ['run', 'doctor', '--native']);
  if (!plan) await run('node', ['--test', 'tools/tests/build-core-worker.test.mjs']);
  await run('node', ['tools/build-core-worker.mjs']);
  await run('node', [
    'tools/test-runtime.mjs',
    ...(plan ? ['--platform', '--require-native'] : []),
  ]);
  await run('node', ['tools/check-native.mjs', ...(plan ? ['--required', '--skip-fmt'] : [])]);
  await packagingChecks();
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => !['--app', '--native', '--ci'].includes(flag)))
    throw new Error('Usage: node tools/check.mjs [--app] [--native] [--ci]');
  const plan = flags.includes('--ci') ? readCiPlan() : undefined;
  const selected = flags.filter((flag) => flag !== '--ci');
  if (!selected.length) selected.push(...(plan ? ['--app'] : ['--app', '--native']));
  if (selected.includes('--app')) await applicationChecks(plan);
  if (selected.includes('--native')) await nativeChecks(plan);
}
main().catch(fail);
