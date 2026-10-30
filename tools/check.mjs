import { run, fail } from './project.mjs';
import { assertWorkspaceDependencies } from './environment.mjs';

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
];
// Packaging fixtures exercise host tools, so each one runs on its own platform.
const platformTests = {
  linux: ['tools/tests/linux-distribution.test.mjs'],
  darwin: ['tools/tests/macos-bundle.test.mjs'],
  win32: ['tools/tests/windows-installer.test.mjs', 'tools/tests/windows-components.test.mjs'],
};

async function applicationChecks() {
  assertWorkspaceDependencies();
  await run('node', ['tools/generate-agent-knowledge.mjs', '--check']);
  await run('node', ['--test', ...toolTests]);
  await run('node', ['tools/check-kit-css.mjs']);
  await run('pnpm', ['contracts:check']);
  await run('pnpm', ['-r', 'check']);
  await run('node', ['--test', ...contractTests]);
}

async function nativeChecks() {
  assertWorkspaceDependencies();
  await run('node', ['tools/probe-bun.mjs']);
  await run('pnpm', ['run', 'doctor', '--native']);
  await run('node', ['--test', 'tools/tests/build-core-worker.test.mjs']);
  await run('node', ['tools/build-core-worker.mjs']);
  await run('node', ['tools/test-runtime.mjs']);
  await run('node', ['tools/check-native.mjs']);
  const tests = platformTests[process.platform];
  if (tests) await run('node', ['--test', ...tests]);
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => flag !== '--app' && flag !== '--native'))
    throw new Error('Usage: node tools/check.mjs [--app] [--native]');
  const selected = flags.length ? flags : ['--app', '--native'];
  if (selected.includes('--app')) await applicationChecks();
  if (selected.includes('--native')) await nativeChecks();
}
main().catch(fail);
