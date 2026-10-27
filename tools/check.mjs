import { run, fail } from './project.mjs';
import { assertWorkspaceDependencies } from './environment.mjs';

async function main() {
  assertWorkspaceDependencies();
  await run('node', ['tools/generate-agent-knowledge.mjs', '--check']);
  await run('node', [
    '--test',
    'tools/tests/environment.test.mjs',
    'tools/tests/commit-formatting.test.mjs',
    'tools/tests/vite-cache.test.mjs',
    'tools/tests/process-tree.test.mjs',
    'tools/tests/dev-mode.test.mjs',
    'tools/tests/release-assets.test.mjs',
    'tools/tests/app-updater-release.test.mjs',
    'tools/tests/runtime-notices.test.mjs',
    'tools/tests/setup-aria2.test.mjs',
    'tools/tests/windows-installer.test.mjs',
    'tools/tests/macos-bundle.test.mjs',
  ]);
  await run('pnpm', ['contracts:check']);
  await run('pnpm', ['-r', 'check']);
  await run('node', ['tools/build-core-worker.mjs']);
  await run('node', ['tools/test-runtime.mjs']);
  await run('node', [
    '--test',
    'packages/contracts/test/validators.test.mjs',
    'packages/contracts/test/copilot.test.mjs',
    'packages/contracts/test/copilot-attribution.test.mjs',
    'packages/contracts/test/copilot-search.test.mjs',
    'packages/contracts/test/copilot-categories.test.mjs',
    'packages/contracts/test/external-links.test.mjs',
    'packages/contracts/test/error-display.test.mjs',
  ]);
  await run('uv', ['run', '--frozen', 'ruff', 'check', 'services/runtime']);
  await run('uv', ['run', '--frozen', 'mypy']);
  await run('uv', ['run', '--frozen', 'pytest']);
  await run('node', ['tools/check-native.mjs']);
}
main().catch(fail);
